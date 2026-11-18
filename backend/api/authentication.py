"""
Token + authentication plumbing for the two separate account tables.

Every JWT carries a `user_type` claim:
  * "admin"    -> the account lives in `admin_users` (AdminUser)
  * "customer" -> the account lives in `users` (User, role='customer')

The authentication class resolves the account from the table named by the
claim, so an admin token can never resolve to a `users` row that happens to
share the same id (and vice versa).
"""

from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken

from .models import AdminUser, Role, User

USER_TYPE_ADMIN = "admin"
USER_TYPE_CUSTOMER = "customer"


def tokens_for(account):
    """Build an access/refresh pair that records which table the account is in."""
    user_type = USER_TYPE_ADMIN if isinstance(account, AdminUser) else USER_TYPE_CUSTOMER
    refresh = RefreshToken.for_user(account)
    refresh["user_type"] = user_type
    refresh["role"] = user_type
    access = refresh.access_token  # copies custom claims from the refresh token
    return {"access": str(access), "refresh": str(refresh)}


def resolve_account(token):
    """
    Return the active account a validated token refers to, looked up ONLY in
    the table named by its `user_type` claim. Raises AuthenticationFailed.
    """
    user_type = token.get("user_type")
    try:
        user_id = token[api_settings.USER_ID_CLAIM]
    except KeyError:
        raise exceptions.AuthenticationFailed("Token has no id.", code="no_user_id")

    if user_type == USER_TYPE_ADMIN:
        account = AdminUser.objects.filter(pk=user_id).first()
    elif user_type == USER_TYPE_CUSTOMER:
        account = User.objects.filter(pk=user_id, role=Role.CUSTOMER).first()
    else:
        raise exceptions.AuthenticationFailed("Invalid token type.", code="bad_user_type")

    if account is None or not account.is_active:
        raise exceptions.AuthenticationFailed("No active account.", code="user_not_found")
    return account


class AccountJWTAuthentication(JWTAuthentication):
    """JWT auth that resolves the account from the right table."""

    def get_user(self, validated_token):
        return resolve_account(validated_token)


class AccountTokenRefreshSerializer(TokenRefreshSerializer):
    """Refresh that re-checks the account exists/is active and keeps its type."""

    def validate(self, attrs):
        refresh = self.token_class(attrs["refresh"])
        resolve_account(refresh)  # raises if the account is gone/inactive
        # The stock logic derives the new access token (and rotated refresh)
        # from this refresh token, so user_type/role claims carry over.
        return super().validate(attrs)

