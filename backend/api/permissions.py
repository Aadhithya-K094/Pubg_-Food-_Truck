"""Permission classes: admin = `admin_users` account, customer = `users` account."""

from rest_framework.permissions import BasePermission

from .models import AdminUser, Role, User


class IsAdminRole(BasePermission):
    """Allow only an authenticated, active account from the admin_users table."""

    message = "Admin access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(isinstance(user, AdminUser) and user.is_active)


class IsCustomerRole(BasePermission):
    """Allow only customers (accounts from the users table)."""

    message = "Customer access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            isinstance(user, User) and user.is_active and user.role == Role.CUSTOMER
        )
