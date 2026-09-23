"""
Serializers for menu, orders, reviews and dashboard.
Kept separate from auth serializers for clarity.
"""

from decimal import Decimal

from rest_framework import serializers

from .models import (
    MenuItem,
    Order,
    OrderItem,
    Review,
    ServiceType,
    PaymentMethod,
    CustomerOrderLog,
    AdminOrderStatusLog,
)


class MenuItemSerializer(serializers.ModelSerializer):
    final_price = serializers.DecimalField(
        max_digits=8, decimal_places=2, read_only=True
    )
    image_url = serializers.SerializerMethodField()
    avg_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()

    class Meta:
        model = MenuItem
        fields = [
            "id",
            "name",
            "description",
            "category",
            "available_for",
            "price",
            "discount_percent",
            "final_price",
            "image_url",
            "is_available",
            "avg_rating",
            "review_count",
        ]

    def get_image_url(self, obj):
        request = self.context.get("request")
        if obj.image and hasattr(obj.image, "url"):
            url = obj.image.url
            return request.build_absolute_uri(url) if request else url
        return None

    def get_avg_rating(self, obj):
        published = obj.reviews.filter(is_published=True)
        if not published.exists():
            return None
        return round(sum(r.rating for r in published) / published.count(), 1)

    def get_review_count(self, obj):
        return obj.reviews.filter(is_published=True).count()


class OrderItemSerializer(serializers.ModelSerializer):
    menu_item_name = serializers.CharField(source="menu_item.name", read_only=True)
    line_total = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = OrderItem
        fields = ["id", "menu_item", "menu_item_name", "quantity", "unit_price", "line_total"]
        read_only_fields = ["unit_price"]


class OrderItemWriteSerializer(serializers.Serializer):
    """Incoming line item: just menu_item id + quantity."""

    menu_item = serializers.PrimaryKeyRelatedField(queryset=MenuItem.objects.all())
    quantity = serializers.IntegerField(min_value=1, max_value=99)


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(
        source="customer.full_name", read_only=True
    )
    customer_username = serializers.CharField(
        source="customer.username", read_only=True
    )
    service_type_display = serializers.CharField(
        source="get_service_type_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "customer",
            "customer_name",
            "customer_username",
            "service_type",
            "service_type_display",
            "status",
            "status_display",
            "payment_status",
            "payment_method",
            "total_amount",
            "delivery_address",
            "building_no",
            "street",
            "pincode",
            "landmark",
            "delivery_lat",
            "delivery_lng",
            "delivery_person_name",
            "delivery_person_phone",
            "estimated_minutes",
            "ready_at",
            "table_number",
            "items",
            "created_at",
        ]
        read_only_fields = ["status", "total_amount", "customer"]


class PlaceOrderSerializer(serializers.Serializer):
    """Customer places an order for one service type with 1+ line items."""

    service_type = serializers.ChoiceField(choices=ServiceType.choices)
    items = OrderItemWriteSerializer(many=True)
    # structured address (doorstep)
    building_no = serializers.CharField(required=False, allow_blank=True, max_length=100)
    street = serializers.CharField(required=False, allow_blank=True, max_length=200)
    pincode = serializers.CharField(required=False, allow_blank=True, max_length=12)
    landmark = serializers.CharField(required=False, allow_blank=True, max_length=200)
    delivery_lat = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True
    )
    delivery_lng = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True
    )
    table_number = serializers.CharField(
        required=False, allow_blank=True, max_length=20
    )
    payment_method = serializers.ChoiceField(
        choices=PaymentMethod.choices, required=False, allow_blank=True
    )

    def validate(self, attrs):
        if not attrs.get("items"):
            raise serializers.ValidationError({"items": "Add at least one item."})
        service = attrs["service_type"]
        method = attrs.get("payment_method", "")
        if service == ServiceType.DOORSTEP:
            # doorstep needs the core address parts
            missing = {}
            if not attrs.get("building_no"):
                missing["building_no"] = "Building / home number is required."
            if not attrs.get("street"):
                missing["street"] = "Street name is required."
            if not attrs.get("pincode"):
                missing["pincode"] = "Pincode is required."
            elif not attrs["pincode"].isdigit() or len(attrs["pincode"]) != 6:
                missing["pincode"] = "Enter a valid 6-digit pincode."
            if missing:
                raise serializers.ValidationError(missing)
            # doorstep: online payment OR cash on delivery
            if method not in (PaymentMethod.ONLINE, PaymentMethod.COD):
                raise serializers.ValidationError(
                    {"payment_method": "Choose Online Payment or Cash on Delivery."}
                )
        else:
            # dining / takeaway: only on-the-spot payment
            attrs["payment_method"] = PaymentMethod.ON_SPOT
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        items = validated_data.pop("items")

        # Compose a readable single-line address from the parts.
        parts = [
            validated_data.get("building_no", ""),
            validated_data.get("street", ""),
            validated_data.get("landmark", ""),
            validated_data.get("pincode", ""),
        ]
        composed = ", ".join(p for p in parts if p)

        order = Order.objects.create(
            customer=request.user,
            service_type=validated_data["service_type"],
            delivery_address=composed,
            building_no=validated_data.get("building_no", ""),
            street=validated_data.get("street", ""),
            pincode=validated_data.get("pincode", ""),
            landmark=validated_data.get("landmark", ""),
            delivery_lat=validated_data.get("delivery_lat"),
            delivery_lng=validated_data.get("delivery_lng"),
            table_number=validated_data.get("table_number", ""),
            payment_method=validated_data.get("payment_method", ""),
        )
        total = Decimal("0.00")
        for row in items:
            mi = row["menu_item"]
            unit = mi.final_price
            OrderItem.objects.create(
                order=order, menu_item=mi, quantity=row["quantity"], unit_price=unit
            )
            total += unit * row["quantity"]
        order.total_amount = total.quantize(Decimal("0.01"))
        order.save(update_fields=["total_amount"])

        CustomerOrderLog.objects.create(
            order=order,
            customer=request.user,
            event="placed",
            detail=f"{order.get_service_type_display()} order, total {order.total_amount}",
        )
        return order


class ReviewSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    menu_item_name = serializers.CharField(source="menu_item.name", read_only=True)

    class Meta:
        model = Review
        fields = [
            "id",
            "customer",
            "customer_name",
            "menu_item",
            "menu_item_name",
            "order",
            "rating",
            "comment",
            "is_published",
            "created_at",
        ]
        read_only_fields = ["customer"]

    def get_customer_name(self, obj):
        return obj.customer.full_name or obj.customer.username

    def validate_rating(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value

    def create(self, validated_data):
        validated_data["customer"] = self.context["request"].user
        return super().create(validated_data)


class CustomerOrderLogSerializer(serializers.ModelSerializer):
    customer_username = serializers.CharField(
        source="customer.username", read_only=True
    )

    class Meta:
        model = CustomerOrderLog
        fields = ["id", "order", "customer", "customer_username", "event", "detail", "created_at"]


class AdminOrderStatusLogSerializer(serializers.ModelSerializer):
    admin_username = serializers.CharField(source="admin.username", read_only=True)

    class Meta:
        model = AdminOrderStatusLog
        fields = [
            "id",
            "order",
            "admin",
            "admin_username",
            "from_status",
            "to_status",
            "note",
            "created_at",
        ]
