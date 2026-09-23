"""
Data models for the PUBG Food Truck app.

  * User            - accounts (admin / customer), mapped to `users` table
  * MenuItem        - food items the customer can order
  * Order           - a placed order (one of three service types)
  * OrderItem       - a line item within an order (menu item + quantity)
  * Review          - customer rating + review, publishable
  * CustomerOrderLog     - audit trail of customer-side order events
  * AdminOrderStatusLog  - audit trail of admin-side status changes

Passwords are stored as one-way PBKDF2 hashes handled by Django's auth.
"""

from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.db import models
from django.utils import timezone


# ============================================================
# User
# ============================================================
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


# ============================================================
# Shared choices
# ============================================================
class ServiceType(models.TextChoices):
    """The three ways a customer can order."""

    DOORSTEP = "doorstep", "Doorstep Delivery"
    DINING = "dining", "Dining"
    TAKEAWAY = "takeaway", "Take Away"


class OrderStatus(models.TextChoices):
    """Lifecycle of an order. 'pending' = awaiting admin accept/reject."""

    PENDING = "pending", "Pending"          # placed, admin hasn't acted
    ACCEPTED = "accepted", "Accepted"        # admin accepted
    REJECTED = "rejected", "Rejected"        # admin rejected
    PROCESSING = "processing", "Processing"  # being prepared
    COMPLETED = "completed", "Completed"     # delivered / served / collected


class PaymentStatus(models.TextChoices):
    UNPAID = "unpaid", "Unpaid"
    PAID = "paid", "Paid"


class PaymentMethod(models.TextChoices):
    """How the customer chose to pay."""

    ONLINE = "online", "Online Payment"          # doorstep: pay now, online
    COD = "cod", "Cash on Delivery"              # doorstep: pay on delivery
    ON_SPOT = "on_spot", "On-the-spot Payment"   # dining / takeaway: pay at counter


# ============================================================
# Menu
# ============================================================
class MenuItem(models.Model):
    """
    A food item. `price` is the base price; `discount_percent` is an
    optional percentage off. Image is uploaded later by the admin.
    """

    name = models.CharField(max_length=150)
    description = models.CharField(max_length=500, blank=True, default="")
    # which service types this item is available for (comma-separated codes,
    # empty = available to all three)
    available_for = models.CharField(max_length=100, blank=True, default="")
    category = models.CharField(max_length=100, blank=True, default="")

    price = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("0.00"))
    discount_percent = models.PositiveIntegerField(default=0)  # 0-100

    image = models.ImageField(upload_to="menu/", blank=True, null=True)
    is_available = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "menu_items"
        ordering = ["category", "name"]

    def __str__(self):
        return self.name

    @property
    def final_price(self):
        """Price after applying the discount."""
        if self.discount_percent:
            factor = (Decimal(100) - Decimal(self.discount_percent)) / Decimal(100)
            return (self.price * factor).quantize(Decimal("0.01"))
        return self.price


# ============================================================
# Orders
# ============================================================
class Order(models.Model):
    """A placed order. Belongs to a customer, has one service type."""

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="orders",
    )
    service_type = models.CharField(max_length=20, choices=ServiceType.choices)
    status = models.CharField(
        max_length=20, choices=OrderStatus.choices, default=OrderStatus.PENDING
    )
    payment_status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID
    )
    payment_method = models.CharField(
        max_length=20, choices=PaymentMethod.choices, blank=True, default=""
    )

    total_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )

    # Doorstep delivery extras
    delivery_address = models.CharField(max_length=500, blank=True, default="")
    # Structured address parts
    building_no = models.CharField(max_length=100, blank=True, default="")
    street = models.CharField(max_length=200, blank=True, default="")
    pincode = models.CharField(max_length=12, blank=True, default="")
    landmark = models.CharField(max_length=200, blank=True, default="")
    # Live-tracking coordinates (customer drop point / delivery position)
    delivery_lat = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    delivery_lng = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    delivery_person_name = models.CharField(max_length=150, blank=True, default="")
    delivery_person_phone = models.CharField(max_length=20, blank=True, default="")
    estimated_minutes = models.PositiveIntegerField(null=True, blank=True)

    # Dining / takeaway: a ready/serve time the admin communicates
    ready_at = models.DateTimeField(null=True, blank=True)

    # optional table number for dining
    table_number = models.CharField(max_length=20, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "orders"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["service_type"], name="idx_orders_service"),
            models.Index(fields=["status"], name="idx_orders_status"),
        ]

    def __str__(self):
        return f"Order #{self.pk} ({self.service_type}, {self.status})"

    def recalculate_total(self):
        total = sum((item.line_total for item in self.items.all()), Decimal("0.00"))
        self.total_amount = total
        return total


class OrderItem(models.Model):
    """A line in an order: a menu item, a quantity, and the price snapshot."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    menu_item = models.ForeignKey(
        MenuItem, on_delete=models.PROTECT, related_name="order_items"
    )
    quantity = models.PositiveIntegerField(default=1)
    # snapshot the price at order time so later menu changes don't alter history
    unit_price = models.DecimalField(max_digits=8, decimal_places=2)

    class Meta:
        db_table = "order_items"

    def __str__(self):
        return f"{self.quantity} x {self.menu_item.name}"

    @property
    def line_total(self):
        return (self.unit_price * self.quantity).quantize(Decimal("0.01"))


# ============================================================
# Reviews (publishable)
# ============================================================
class Review(models.Model):
    """
    A customer rating + review. `is_published` lets the customer decide
    whether it shows publicly (publishable, per requirement).
    """

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews"
    )
    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        related_name="reviews",
        null=True,
        blank=True,
    )
    order = models.ForeignKey(
        Order,
        on_delete=models.SET_NULL,
        related_name="reviews",
        null=True,
        blank=True,
    )
    rating = models.PositiveSmallIntegerField(default=5)  # 1-5
    comment = models.TextField(blank=True, default="")
    is_published = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reviews"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.rating}★ by {self.customer_id}"


# ============================================================
# Log tables (audit trails)
# ============================================================
class CustomerOrderLog(models.Model):
    """Customer-side order event log (placed, cancelled, paid, reviewed...)."""

    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name="customer_logs"
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="order_logs"
    )
    event = models.CharField(max_length=80)     # e.g. "placed", "paid"
    detail = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "customer_order_logs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.created_at:%Y-%m-%d %H:%M}] order#{self.order_id} {self.event}"


class AdminOrderStatusLog(models.Model):
    """Admin-side log of order receive / status changes."""

    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name="admin_logs"
    )
    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="handled_order_logs",
        null=True,
        blank=True,
    )
    from_status = models.CharField(max_length=20, blank=True, default="")
    to_status = models.CharField(max_length=20)
    note = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "admin_order_status_logs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.created_at:%Y-%m-%d %H:%M}] order#{self.order_id} -> {self.to_status}"
