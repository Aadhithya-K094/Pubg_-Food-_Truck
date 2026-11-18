"""
Auth API views: register, customer login, admin login, current-user
profile, and admin-only user management.

Accounts live in two separate tables:
  * admin_users -> food truck owner / order receiver (AdminUser)
  * users       -> ordering customers (User, role='customer')

/api/auth/login/ authenticates customers only; /api/auth/admin-login/
authenticates against admin_users only. Both issue JWT access/refresh
tokens carrying a `user_type` claim.
"""

import os
import secrets

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework_simplejwt.views import TokenRefreshView

from .authentication import AccountTokenRefreshSerializer
from .authentication import tokens_for as _tokens_for
from .models import AdminUser, Role
from .permissions import IsAdminRole
from .serializers import (
    AdminCreateAdminSerializer,
    AdminCreateUserSerializer,
    AdminLoginSerializer,
    AdminUserSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
)

User = get_user_model()

# Hash used to equalize timing when an admin login names an unknown account.
_DUMMY_HASH = make_password("not-a-real-password")


class AccountTokenRefreshView(TokenRefreshView):
    """POST /api/auth/refresh-token/ — refresh keeping the account type."""

    serializer_class = AccountTokenRefreshSerializer


class RegisterView(APIView):
    """
    POST /api/auth/register/
    Public sign-up. Always creates a CUSTOMER account and inserts it
    into the users table with a hashed password.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "user": UserSerializer(user).data,
                "tokens": _tokens_for(user),
                "message": "Customer account created successfully.",
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """
    POST /api/auth/login/
    CUSTOMER login (users table only). Admin accounts live in
    admin_users and must use /api/auth/admin-login/.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data.get("expected_role") == Role.ADMIN:
            return Response(
                {"detail": "Use the admin login."},
                status=status.HTTP_403_FORBIDDEN,
            )

        identifier = serializer.validated_data["username"].strip()
        password = serializer.validated_data["password"]

        # Accept EITHER a username or an email address. If the identifier
        # looks like / matches an email, resolve it to the real username
        # before authenticating (authenticate() only matches USERNAME_FIELD).
        lookup_username = identifier
        if "@" in identifier:
            match = User.objects.filter(email__iexact=identifier).first()
            if match:
                lookup_username = match.username

        user = authenticate(request, username=lookup_username, password=password)

        # Only genuine customers may log in here. A legacy users row with a
        # non-customer role is treated like any other bad credential.
        if user is None or user.role != Role.CUSTOMER:
            # Generic message: don't reveal whether the account exists.
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_active:
            return Response(
                {"detail": "This account is disabled."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return Response(
            {
                "user": UserSerializer(user).data,
                "tokens": _tokens_for(user),
                "message": "Login successful.",
            },
            status=status.HTTP_200_OK,
        )


class AdminLoginView(APIView):
    """
    POST /api/auth/admin-login/
    ADMIN login. Authenticates ONLY against the admin_users table, by
    username or email. Customer credentials never match here.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = AdminLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        identifier = serializer.validated_data["username"].strip()
        password = serializer.validated_data["password"]

        if "@" in identifier:
            admin = AdminUser.objects.filter(email__iexact=identifier).first()
        else:
            admin = AdminUser.objects.filter(username=identifier).first()

        if admin is None:
            check_password(password, _DUMMY_HASH)  # equalize timing
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not admin.check_password(password):
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not admin.is_active:
            return Response(
                {"detail": "This account is disabled."},
                status=status.HTTP_403_FORBIDDEN,
            )

        admin.last_login = timezone.now()
        admin.save(update_fields=["last_login"])

        return Response(
            {
                "user": AdminUserSerializer(admin).data,
                "tokens": _tokens_for(admin),
                "message": "Login successful.",
            },
            status=status.HTTP_200_OK,
        )


class GoogleLoginView(APIView):
    """
    POST /api/auth/google/
    OAuth "Sign in with Google". The client sends the Google ID token
    (a `credential` string from Google Identity Services). We verify it
    against Google, then find-or-create a CUSTOMER account and issue our
    own JWT — exactly the same token shape as password login.

    Requires GOOGLE_OAUTH_CLIENT_ID in the environment (backend/.env).
    """

    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("credential") or request.data.get("id_token")
        if not token:
            return Response(
                {"detail": "Missing Google credential."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
        if not client_id:
            return Response(
                {"detail": "Google sign-in is not configured on the server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Verify the ID token with Google (checks signature, audience, expiry).
        try:
            from google.auth.transport import requests as google_requests
            from google.oauth2 import id_token as google_id_token

            info = google_id_token.verify_oauth2_token(
                token, google_requests.Request(), client_id
            )
        except ValueError:
            return Response(
                {"detail": "Invalid or expired Google credential."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not info.get("email_verified"):
            return Response(
                {"detail": "Your Google email is not verified."},
                status=status.HTTP_403_FORBIDDEN,
            )

        email = info.get("email", "").lower()
        if not email:
            return Response(
                {"detail": "Google account has no email."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find-or-create the account by email. New Google users are customers.
        user = User.objects.filter(email__iexact=email).first()
        if user is not None and user.role != Role.CUSTOMER:
            return Response(
                {"detail": "This account cannot sign in with Google."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if user is None:
            base = email.split("@")[0]
            username = "".join(ch for ch in base if ch.isalnum())[:20] or "user"
            # ensure uniqueness
            while User.objects.filter(username__iexact=username).exists():
                username = (username[:14] + secrets.token_hex(3))[:20]
            user = User.objects.create_user(
                username=username,
                email=email,
                password=None,  # unusable password: Google is the only way in
                role=Role.CUSTOMER,
                full_name=info.get("name") or "",
            )
            user.set_unusable_password()
            user.save(update_fields=["password"])

        if not user.is_active:
            return Response(
                {"detail": "This account is disabled."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return Response(
            {
                "user": UserSerializer(user).data,
                "tokens": _tokens_for(user),
                "message": "Signed in with Google.",
            },
            status=status.HTTP_200_OK,
        )


class MeView(APIView):
    """GET /api/auth/profile/ — return the authenticated account's profile + role."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if isinstance(request.user, AdminUser):
            return Response(AdminUserSerializer(request.user).data)
        return Response(UserSerializer(request.user).data)


class AdminUserListCreateView(APIView):
    """
    Admin-only user management.
      GET  /api/users/              -> list customers (users table)
      GET  /api/users/?role=admin   -> list admins (admin_users table)
      POST /api/users/              -> create a customer (default) or,
                                       with role=admin, an admin_users row
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        if request.query_params.get("role") == Role.ADMIN:
            admins = AdminUser.objects.all().order_by("-created_at")
            return Response(AdminUserSerializer(admins, many=True).data)
        users = User.objects.filter(role=Role.CUSTOMER).order_by("-date_joined")
        return Response(UserSerializer(users, many=True).data)

    def post(self, request):
        if request.data.get("role") == Role.ADMIN:
            serializer = AdminCreateAdminSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            admin = serializer.save()
            return Response(
                {
                    "user": AdminUserSerializer(admin).data,
                    "message": "Admin account created.",
                },
                status=status.HTTP_201_CREATED,
            )

        serializer = AdminCreateUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "user": UserSerializer(user).data,
                "message": f"{user.get_role_display()} account created.",
            },
            status=status.HTTP_201_CREATED,
        )
