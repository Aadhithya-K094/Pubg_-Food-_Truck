"""
Auth API views: register, login, current-user profile, and admin-only
user management.

Roles:
  * admin    -> food truck owner / order receiver (main user)
  * customer -> ordering customer (secondary user)

Login uses Django's `authenticate` (constant-time hash comparison) and
issues JWT access/refresh tokens on success.
"""

import os
import secrets

from django.contrib.auth import authenticate, get_user_model
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework_simplejwt.tokens import RefreshToken

from .models import Role
from .permissions import IsAdminRole
from .serializers import (
    AdminCreateUserSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
)

User = get_user_model()


def _tokens_for(user):
    """Build a JWT access/refresh pair, embedding the role in the token."""
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    access = refresh.access_token
    access["role"] = user.role
    return {
        "access": str(access),
        "refresh": str(refresh),
    }


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
    Authenticate and return JWT tokens plus the user's role so the
    client can show the right portal (admin vs customer).
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

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
        else:
            # also allow the case where someone typed an email that is
            # stored but doesn't contain '@' check (defensive no-op)
            pass

        user = authenticate(request, username=lookup_username, password=password)

        if user is None:
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

        # If the client said which portal it is, enforce the role match.
        expected_role = serializer.validated_data.get("expected_role")
        if expected_role and user.role != expected_role:
            label = "Admin" if expected_role == Role.ADMIN else "Customer"
            return Response(
                {"detail": f"This account is not registered as a {label}."},
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
    """GET /api/auth/profile/ — return the authenticated user's profile + role."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class AdminUserListCreateView(APIView):
    """
    Admin-only user management.
      GET  /api/users/  -> list all users
      POST /api/users/  -> create an admin or customer account
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        role = request.query_params.get("role")
        users = User.objects.all().order_by("-date_joined")
        if role in dict(Role.choices):
            users = users.filter(role=role)
        return Response(UserSerializer(users, many=True).data)

    def post(self, request):
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
