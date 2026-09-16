"""API routes for authentication and role-based user management."""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import AdminUserListCreateView, LoginView, MeView, RegisterView

urlpatterns = [
    # Public
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    # Authenticated
    path("auth/me/", MeView.as_view(), name="me"),
    # Admin (owner) only
    path("auth/admin/users/", AdminUserListCreateView.as_view(), name="admin_users"),
]
