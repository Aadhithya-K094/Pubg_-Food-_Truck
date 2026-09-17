"""
API routes.

Grouped and named for readability:

  Authentication  (public)
    POST  /api/auth/register/        create a customer account
    POST  /api/auth/login/           authenticate, returns JWT + role
    POST  /api/auth/refresh-token/   exchange a refresh token for a new access token

  Account  (authenticated)
    GET   /api/auth/profile/         the signed-in user's profile

  User management  (admin only)
    GET   /api/users/                list users (optional ?role=admin|customer)
    POST  /api/users/                create an admin or customer account
"""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import AdminUserListCreateView, LoginView, MeView, RegisterView

urlpatterns = [
    # --- Authentication (public) ---
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/refresh-token/", TokenRefreshView.as_view(), name="refresh_token"),
    # --- Account (authenticated) ---
    path("auth/profile/", MeView.as_view(), name="profile"),
    # --- User management (admin only) ---
    path("users/", AdminUserListCreateView.as_view(), name="users"),
]
