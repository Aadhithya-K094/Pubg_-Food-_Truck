"""Role-based permission classes."""

from rest_framework.permissions import BasePermission

from .models import Role


class IsAdminRole(BasePermission):
    """Allow only the food truck owner / order receiver."""

    message = "Admin access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == Role.ADMIN)


class IsCustomerRole(BasePermission):
    """Allow only customers."""

    message = "Customer access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == Role.CUSTOMER)
