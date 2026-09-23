"""
Views for menu, orders, reviews, and the admin dashboard.
"""

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AdminOrderStatusLog,
    CustomerOrderLog,
    MenuItem,
    Order,
    OrderStatus,
    PaymentStatus,
    Review,
    ServiceType,
)
from .order_serializers import (
    AdminOrderStatusLogSerializer,
    CustomerOrderLogSerializer,
    MenuItemSerializer,
    OrderSerializer,
    PlaceOrderSerializer,
    ReviewSerializer,
)
from .permissions import IsAdminRole


# ------------------------------------------------------------
# Menu (public read)
# ------------------------------------------------------------
class MenuListView(APIView):
    """
    GET /api/menu/            -> all available items
    GET /api/menu/?service=doorstep|dining|takeaway -> filtered
    """

    permission_classes = [AllowAny]

    def get(self, request):
        items = MenuItem.objects.filter(is_available=True)
        service = request.query_params.get("service")
        if service in dict(ServiceType.choices):
            # available_for empty => available to all; else must contain the code
            items = [
                m
                for m in items
                if not m.available_for or service in m.available_for
            ]
        data = MenuItemSerializer(items, many=True, context={"request": request}).data
        return Response(data)


# ------------------------------------------------------------
# Customer: place + view own orders
# ------------------------------------------------------------
class PlaceOrderView(APIView):
    """POST /api/orders/ — customer places an order."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PlaceOrderSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        return Response(
            {
                "order": OrderSerializer(order, context={"request": request}).data,
                "message": "Order placed. Waiting for the truck to accept it.",
            },
            status=status.HTTP_201_CREATED,
        )


class MyOrdersView(APIView):
    """GET /api/orders/mine/ — the signed-in customer's orders."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        orders = Order.objects.filter(customer=request.user).prefetch_related("items")
        return Response(
            OrderSerializer(orders, many=True, context={"request": request}).data
        )


# ------------------------------------------------------------
# Admin: order management
# ------------------------------------------------------------
class AdminOrderListView(APIView):
    """
    GET /api/admin/orders/           -> all orders
    GET /api/admin/orders/?service=  -> filter by service type
    GET /api/admin/orders/?status=   -> filter by status
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        orders = Order.objects.all().prefetch_related("items")
        service = request.query_params.get("service")
        st = request.query_params.get("status")
        if service in dict(ServiceType.choices):
            orders = orders.filter(service_type=service)
        if st in dict(OrderStatus.choices):
            orders = orders.filter(status=st)
        return Response(
            OrderSerializer(orders, many=True, context={"request": request}).data
        )


class AdminOrderActionView(APIView):
    """
    POST /api/admin/orders/<id>/action/
    body: { "action": "accept|reject|processing|complete",
            "estimated_minutes": 30, "payment_status": "paid" }
    Admin accepts/rejects and advances an order; every change is logged.
    """

    permission_classes = [IsAdminRole]

    ACTION_TO_STATUS = {
        "accept": OrderStatus.ACCEPTED,
        "reject": OrderStatus.REJECTED,
        "processing": OrderStatus.PROCESSING,
        "complete": OrderStatus.COMPLETED,
    }

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get("action")
        pay = request.data.get("payment_status")

        # --- Payment-only update (no status change required) ---------
        # Lets the "Mark Paid" button work on its own, whatever the
        # order's current status is.
        if action in (None, "", "payment") and pay in dict(PaymentStatus.choices):
            order.payment_status = pay
            order.save(update_fields=["payment_status", "updated_at"])
            AdminOrderStatusLog.objects.create(
                order=order,
                admin=request.user,
                from_status=order.status,
                to_status=order.status,
                note=f"payment marked {pay}",
            )
            CustomerOrderLog.objects.create(
                order=order,
                customer=order.customer,
                event=f"payment:{pay}",
                detail=f"Payment marked {pay} by admin.",
            )
            return Response(
                {
                    "order": OrderSerializer(order, context={"request": request}).data,
                    "message": f"Payment marked {order.get_payment_status_display()}.",
                }
            )

        # --- Status change (accept/reject/processing/complete) -------
        new_status = self.ACTION_TO_STATUS.get(action)
        if not new_status:
            return Response(
                {"detail": "action must be accept, reject, processing, complete or payment."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from_status = order.status
        order.status = new_status

        # optional extras
        est = request.data.get("estimated_minutes")
        if est is not None:
            try:
                order.estimated_minutes = int(est)
            except (TypeError, ValueError):
                pass
        if pay in dict(PaymentStatus.choices):
            order.payment_status = pay
        if new_status == OrderStatus.COMPLETED and not order.ready_at:
            order.ready_at = timezone.now()

        order.save()

        AdminOrderStatusLog.objects.create(
            order=order,
            admin=request.user,
            from_status=from_status,
            to_status=new_status,
            note=request.data.get("note", ""),
        )
        CustomerOrderLog.objects.create(
            order=order,
            customer=order.customer,
            event=f"status:{new_status}",
            detail=f"Order {new_status} by admin.",
        )
        return Response(
            {
                "order": OrderSerializer(order, context={"request": request}).data,
                "message": f"Order marked {order.get_status_display()}.",
            }
        )


class AdminDashboardView(APIView):
    """
    GET /api/admin/dashboard/
    Counts by service type, by status, and payment breakdown.
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = Order.objects

        def count_by(field, choices):
            base = dict(qs.values_list(field).annotate(c=Count("id")))
            return {code: base.get(code, 0) for code, _ in choices}

        by_service = count_by("service_type", ServiceType.choices)
        by_status = count_by("status", OrderStatus.choices)
        by_payment = count_by("payment_status", PaymentStatus.choices)

        return Response(
            {
                "total_orders": qs.count(),
                "by_service_type": by_service,
                "by_status": by_status,
                "by_payment": by_payment,
                # convenience aggregates the dashboard highlights
                "completed": by_status.get("completed", 0),
                "pending": by_status.get("pending", 0),
                "processing": by_status.get("processing", 0),
                "paid": by_payment.get("paid", 0),
                "unpaid": by_payment.get("unpaid", 0),
            }
        )


# ------------------------------------------------------------
# Reviews (publishable)
# ------------------------------------------------------------
class ReviewListCreateView(APIView):
    """
    GET  /api/reviews/            -> published reviews (public)
    GET  /api/reviews/?menu_item= -> published reviews for one item
    POST /api/reviews/            -> customer creates a review
    """

    def get_permissions(self):
        return [AllowAny()] if self.request.method == "GET" else [IsAuthenticated()]

    def get(self, request):
        reviews = Review.objects.filter(is_published=True)
        mi = request.query_params.get("menu_item")
        if mi:
            reviews = reviews.filter(menu_item_id=mi)
        return Response(ReviewSerializer(reviews, many=True, context={"request": request}).data)

    def post(self, request):
        serializer = ReviewSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        review = serializer.save()
        if review.order_id:
            CustomerOrderLog.objects.create(
                order=review.order,
                customer=request.user,
                event="reviewed",
                detail=f"{review.rating}★",
            )
        return Response(
            ReviewSerializer(review, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


# ------------------------------------------------------------
# Log tables (admin view)
# ------------------------------------------------------------
class CustomerOrderLogView(APIView):
    """GET /api/admin/logs/customer/ — customer order log table."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        logs = CustomerOrderLog.objects.all()[:500]
        return Response(CustomerOrderLogSerializer(logs, many=True).data)


class AdminOrderStatusLogView(APIView):
    """GET /api/admin/logs/status/ — admin order receive/status log table."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        logs = AdminOrderStatusLog.objects.all()[:500]
        return Response(AdminOrderStatusLogSerializer(logs, many=True).data)
