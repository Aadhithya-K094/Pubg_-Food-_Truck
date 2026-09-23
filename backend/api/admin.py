"""
Django admin configuration for the custom User model.

Uses Django's built-in UserAdmin rather than a plain ModelAdmin. That
matters for security: a plain ModelAdmin renders `password` as an ordinary
text input holding the hash, and saving it would store the typed value AS
the hash -- breaking the account. UserAdmin instead shows a read-only hash
plus a dedicated "change password" form that runs set_password().
"""

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

User = get_user_model()


class AdminUserCreationForm(UserCreationForm):
    """Create a user from the admin site, with hashed password + validation."""

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("username", "email", "full_name", "phone", "role")


class AdminUserChangeForm(UserChangeForm):
    """Edit a user. Password is read-only here; use the change-password form."""

    class Meta(UserChangeForm.Meta):
        model = User
        fields = "__all__"


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    add_form = AdminUserCreationForm
    form = AdminUserChangeForm
    model = User

    list_display = (
        "id",
        "username",
        "email",
        "full_name",
        "role",
        "is_active",
        "is_staff",
        "date_joined",
    )
    list_display_links = ("id", "username")
    list_filter = ("role", "is_active", "is_staff", "is_superuser")
    search_fields = ("username", "email", "full_name", "phone")
    ordering = ("-date_joined",)
    list_per_page = 25

    # Editing an existing user
    fieldsets = (
        ("Login", {"fields": ("username", "password")}),
        ("Profile", {"fields": ("full_name", "email", "phone")}),
        (
            "Role & access",
            {
                "fields": (
                    "role",
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
                "description": (
                    "'admin' is the food truck owner / order receiver. "
                    "'customer' places orders."
                ),
            },
        ),
        ("Dates", {"fields": ("last_login", "date_joined", "created_at", "updated_at")}),
    )

    # Creating a new user
    add_fieldsets = (
        (
            "Login",
            {
                "classes": ("wide",),
                "fields": ("username", "email", "password1", "password2"),
            },
        ),
        ("Profile", {"classes": ("wide",), "fields": ("full_name", "phone")}),
        ("Role", {"classes": ("wide",), "fields": ("role",)}),
    )

    # auto_now / auto_now_add fields are not editable
    readonly_fields = ("last_login", "date_joined", "created_at", "updated_at")
    filter_horizontal = ("groups", "user_permissions")


from .models import (  # noqa: E402
    MenuItem,
    Order,
    OrderItem,
    Review,
    CustomerOrderLog,
    AdminOrderStatusLog,
)


@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "category", "price", "discount_percent", "final_price", "is_available")
    list_filter = ("category", "is_available")
    search_fields = ("name", "category")


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("id", "customer", "service_type", "status", "payment_status", "total_amount", "created_at")
    list_filter = ("service_type", "status", "payment_status")
    search_fields = ("customer__username", "customer__email")
    inlines = [OrderItemInline]


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("id", "customer", "menu_item", "rating", "is_published", "created_at")
    list_filter = ("rating", "is_published")


@admin.register(CustomerOrderLog)
class CustomerOrderLogAdmin(admin.ModelAdmin):
    list_display = ("id", "order", "customer", "event", "created_at")
    search_fields = ("event",)


@admin.register(AdminOrderStatusLog)
class AdminOrderStatusLogAdmin(admin.ModelAdmin):
    list_display = ("id", "order", "admin", "from_status", "to_status", "created_at")
