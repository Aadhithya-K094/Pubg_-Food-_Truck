"""
API routes.

  Authentication (public)
    POST  /api/auth/register/        create a customer account
    POST  /api/auth/login/           authenticate, returns JWT + role
    POST  /api/auth/google/          OAuth "Sign in with Google"
    POST  /api/auth/refresh-token/   refresh the access token

  Account (authenticated)
    GET   /api/auth/profile/         the signed-in user's profile

  Menu (public)
    GET   /api/menu/                 available items (?service=...)

  Orders (customer)
    POST  /api/orders/               place an order
    GET   /api/orders/mine/          my orders

  Reviews (public read / customer write)
    GET   /api/reviews/              published reviews
    POST  /api/reviews/              create a review

  Admin (owner only)
    GET   /api/users/                        list users
    POST  /api/users/                        create admin/customer
    GET   /api/admin/orders/                 all orders (?service= / ?status=)
    POST  /api/admin/orders/<id>/action/     accept/reject/advance an order
    GET   /api/admin/dashboard/              order stats
    GET   /api/admin/logs/customer/          customer order log
    GET   /api/admin/logs/status/            admin status log
"""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    AdminUserListCreateView,
    GoogleLoginView,
    LoginView,
    MeView,
    RegisterView,
)
from .order_views import (
    AdminDashboardView,
    AdminOrderActionView,
    AdminOrderListView,
    AdminOrderStatusLogView,
    CustomerOrderLogView,
    MenuListView,
    MyOrdersView,
    PlaceOrderView,
    ReviewListCreateView,
)

urlpatterns = [
    # --- Authentication (public) ---
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/google/", GoogleLoginView.as_view(), name="google_login"),
    path("auth/refresh-token/", TokenRefreshView.as_view(), name="refresh_token"),
    # --- Account (authenticated) ---
    path("auth/profile/", MeView.as_view(), name="profile"),
    # --- Menu (public) ---
    path("menu/", MenuListView.as_view(), name="menu"),
    # --- Orders (customer) ---
    path("orders/", PlaceOrderView.as_view(), name="place_order"),
    path("orders/mine/", MyOrdersView.as_view(), name="my_orders"),
    # --- Reviews ---
    path("reviews/", ReviewListCreateView.as_view(), name="reviews"),
    # --- User management (admin only) ---
    path("users/", AdminUserListCreateView.as_view(), name="users"),
    # --- Admin order management ---
    path("admin/orders/", AdminOrderListView.as_view(), name="admin_orders"),
    path("admin/orders/<int:pk>/action/", AdminOrderActionView.as_view(), name="admin_order_action"),
    path("admin/dashboard/", AdminDashboardView.as_view(), name="admin_dashboard"),
    path("admin/logs/customer/", CustomerOrderLogView.as_view(), name="customer_log"),
    path("admin/logs/status/", AdminOrderStatusLogView.as_view(), name="status_log"),
]
