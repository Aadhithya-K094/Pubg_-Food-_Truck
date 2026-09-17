"""
Auth API views: register, login, current-user profile, and admin-only
user management.

Roles:
  * admin    -> food truck owner / order receiver (main user)
  * customer -> ordering customer (secondary user)

Login uses Django's `authenticate` (constant-time hash comparison) and
issues JWT access/refresh tokens on success.
"""

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

        user = authenticate(
            request,
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
        )

        if user is None:
            # Generic message: don't reveal whether the username exists.
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
