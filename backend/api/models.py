"""
User model for the PUBG Food Truck app.

Mapped explicitly to the existing MySQL `users` table (see
database/schema.sql) via `Meta.db_table = "users"`. Passwords are
stored as one-way PBKDF2 hashes handled by Django's auth framework.
"""

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    """Manager that creates users with properly hashed passwords."""

    use_in_migrations = True

    def _create_user(self, username, email, password, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        if not username:
            raise ValueError("A username is required.")
        email = self.normalize_email(email)
        user = self.model(username=username, email=email, **extra_fields)
        # set_password hashes the raw password (never stored in plaintext).
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        extra_fields.setdefault("role", "customer")
        return self._create_user(username, email, password, **extra_fields)

    def create_admin(self, username, email, password=None, **extra_fields):
        """Create the food truck owner / order receiver."""
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", False)
        extra_fields["role"] = "admin"
        return self._create_user(username, email, password, **extra_fields)

    def create_superuser(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        # A superuser is an owner-level account.
        extra_fields.setdefault("role", "admin")
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(username, email, password, **extra_fields)


class Role(models.TextChoices):
    """The two kinds of users in the system."""

    ADMIN = "admin", "Admin (Owner / Order Receiver)"
    CUSTOMER = "customer", "Customer"


class User(AbstractBaseUser, PermissionsMixin):
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(max_length=254, unique=True)
    full_name = models.CharField(max_length=255, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)

    # 'customer' by default so a public sign-up can never create an owner.
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CUSTOMER,
    )

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    date_joined = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email"]

    class Meta:
        db_table = "users"
        indexes = [
            models.Index(fields=["role"], name="idx_users_role"),
        ]

    def __str__(self):
        return f"{self.username} ({self.role})"

    @property
    def is_admin(self):
        """True for the food truck owner / order receiver."""
        return self.role == Role.ADMIN

    @property
    def is_customer(self):
        return self.role == Role.CUSTOMER
