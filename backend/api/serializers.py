"""
Serializers for registration and login.

Security:
  * The raw password is write-only and validated against Django's
    password validators, then hashed via User.objects.create_user.
  * Password hashes are never returned in any response.
  * `role` is READ-ONLY on public registration: anyone signing up through
    the website or mobile app becomes a 'customer'. Admin (owner) accounts
    can only be created by an existing admin or the `createadmin`
    management command — a client cannot escalate itself to admin.
"""

import re

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Role

User = get_user_model()

# Shared field rules -- MUST match the frontend so a bypassed UI cannot
# smuggle invalid data past the API.
# A NEW account username is letters and numbers ONLY (no special characters,
# not even '@'). The login field is separate and still accepts emails.
USERNAME_RE = re.compile(r"^[a-zA-Z0-9]{3,30}$")
PHONE_RE = re.compile(r"^[6-9][0-9]{9}$")


def validate_username_value(value):
    """New-account username: letters and numbers only, 3-30 chars.

    No special characters are allowed (including '@'); the login form has its
    own separate rules that accept an email address instead.
    """
    v = (value or "").strip()
    if not v:
        raise serializers.ValidationError("Username is required.")
    if re.search(r"[^a-zA-Z0-9]", v):
        raise serializers.ValidationError(
            "Only letters and numbers are allowed."
        )
    if not USERNAME_RE.match(v):
        raise serializers.ValidationError(
            "Username must be 3 to 30 characters (letters and numbers only)."
        )
    return v


def validate_phone_value(value):
    """Optional; if given must be 10 digits starting 6-9."""
    v = (value or "").strip()
    if not v:
        return v
    if not PHONE_RE.match(v):
        raise serializers.ValidationError(
            "Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9."
        )
    return v


class UserSerializer(serializers.ModelSerializer):
    """Public representation of a user (no password)."""

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "full_name",
            "phone",
            "role",
            "date_joined",
        ]
        read_only_fields = ["id", "role", "date_joined"]


class RegisterSerializer(serializers.ModelSerializer):
    """Public sign-up. Always creates a CUSTOMER."""

    password = serializers.CharField(
        write_only=True,
        required=True,
        style={"input_type": "password"},
    )
    password2 = serializers.CharField(
        write_only=True,
        required=True,
        style={"input_type": "password"},
    )
    # Exposed so clients can display it, but never accepted as input.
    role = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            "username",
            "email",
            "full_name",
            "phone",
            "role",
            "password",
            "password2",
        ]

    def validate_username(self, value):
        return validate_username_value(value)

    def validate_phone(self, value):
        return validate_phone_value(value)

    def validate(self, attrs):
        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError(
                {"password": "The two password fields did not match."}
            )
        # Run Django's configured password strength validators.
        validate_password(attrs["password"])
        return attrs

    def create(self, validated_data):
        validated_data.pop("password2", None)
        password = validated_data.pop("password")
        # Force the customer role regardless of anything sent by the client.
        validated_data.pop("role", None)
        user = User.objects.create_user(
            password=password, role=Role.CUSTOMER, **validated_data
        )
        return user


class AdminCreateUserSerializer(serializers.ModelSerializer):
    """
    Admin-only user creation. An existing admin may create either an
    additional admin (e.g. another order receiver) or a customer.
    """

    password = serializers.CharField(
        write_only=True,
        required=True,
        style={"input_type": "password"},
    )
    role = serializers.ChoiceField(choices=Role.choices, default=Role.CUSTOMER)

    class Meta:
        model = User
        fields = ["username", "email", "full_name", "phone", "role", "password"]

    def validate_username(self, value):
        return validate_username_value(value)

    def validate_phone(self, value):
        return validate_phone_value(value)

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        role = validated_data.pop("role", Role.CUSTOMER)
        if role == Role.ADMIN:
            return User.objects.create_admin(password=password, **validated_data)
        return User.objects.create_user(
            password=password, role=Role.CUSTOMER, **validated_data
        )


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
    )
    # Optional: which portal the user is signing in from. When provided,
    # the account's real role must match, so a customer cannot sign in
    # through the admin portal (and vice versa).
    expected_role = serializers.ChoiceField(
        choices=Role.choices, required=False, allow_null=True
    )
