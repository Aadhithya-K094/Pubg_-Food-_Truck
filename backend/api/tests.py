"""
Auth + role tests.

These verify the security guarantees end to end: password hashing,
role defaults, privilege-escalation protection, and the strict split
between the admin_users table (admin login) and the users table (customers).
"""

from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from api.authentication import tokens_for
from api.models import AdminOrderStatusLog, AdminUser, MenuItem, Order

User = get_user_model()


class RegistrationTests(APITestCase):
    def test_register_creates_customer_with_hashed_password(self):
        res = self.client.post(
            reverse("register"),
            {
                "username": "player1",
                "email": "player1@example.com",
                "password": "ChickenDinner99",
                "password2": "ChickenDinner99",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["user"]["role"], "customer")
        self.assertIn("access", res.data["tokens"])

        user = User.objects.get(username="player1")
        # Password must be stored hashed, never in plaintext.
        self.assertNotEqual(user.password, "ChickenDinner99")
        self.assertTrue(user.password.startswith("pbkdf2_"))
        self.assertTrue(user.check_password("ChickenDinner99"))
        # No password material leaks back to the client.
        self.assertNotIn("password", res.data["user"])

    def test_cannot_self_register_as_admin(self):
        """Privilege escalation must be impossible from the public endpoint."""
        res = self.client.post(
            reverse("register"),
            {
                "username": "sneaky",
                "email": "sneaky@example.com",
                "role": "admin",  # attacker-supplied
                "password": "ChickenDinner99",
                "password2": "ChickenDinner99",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.get(username="sneaky").role, "customer")

    def test_password_mismatch_rejected(self):
        res = self.client.post(
            reverse("register"),
            {
                "username": "p2",
                "email": "p2@example.com",
                "password": "ChickenDinner99",
                "password2": "Different99",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_weak_password_rejected(self):
        res = self.client.post(
            reverse("register"),
            {
                "username": "p3",
                "email": "p3@example.com",
                "password": "123",
                "password2": "123",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_username_with_special_characters_rejected(self):
        """Server must reject special chars even if the UI is bypassed."""
        res = self.client.post(
            reverse("register"),
            {
                "username": "bad@user!",
                "email": "sp@example.com",
                "full_name": "Sp User",
                "phone": "9876543210",
                "password": "ChickenDinner99",
                "password2": "ChickenDinner99",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", res.data)

    def test_phone_not_starting_6_to_9_rejected(self):
        res = self.client.post(
            reverse("register"),
            {
                "username": "phoneuser",
                "email": "ph@example.com",
                "full_name": "Ph User",
                "phone": "5123456789",
                "password": "ChickenDinner99",
                "password2": "ChickenDinner99",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", res.data)

    def test_valid_phone_starting_9_accepted(self):
        res = self.client.post(
            reverse("register"),
            {
                "username": "phoneok",
                "email": "phok@example.com",
                "full_name": "Ph Ok",
                "phone": "9123456789",
                "password": "ChickenDinner99",
                "password2": "ChickenDinner99",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["user"]["role"], "customer")

    def test_duplicate_username_rejected(self):
        User.objects.create_user("dupe", "dupe@example.com", "ChickenDinner99")
        res = self.client.post(
            reverse("register"),
            {
                "username": "dupe",
                "email": "other@example.com",
                "password": "ChickenDinner99",
                "password2": "ChickenDinner99",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


CUST_PW = "ChickenDinner99"
ADMIN_PW = "TruckOwner99"


def make_customer(name="cust"):
    return User.objects.create_user(name, f"{name}@example.com", CUST_PW)


def make_admin(name="owner"):
    return AdminUser.objects.create_admin(name, f"{name}@example.com", ADMIN_PW)


def bearer(client, token):
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


class LoginTests(APITestCase):
    def setUp(self):
        self.customer = make_customer()
        self.admin = make_admin()

    def test_customer_login_returns_role_and_tokens(self):
        res = self.client.post(
            reverse("login"),
            {"username": "cust", "password": CUST_PW},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["user"]["role"], "customer")
        self.assertIn("access", res.data["tokens"])
        self.assertEqual(AccessToken(res.data["tokens"]["access"])["user_type"], "customer")

    def test_admin_login_by_username(self):
        res = self.client.post(
            reverse("admin_login"),
            {"username": "owner", "password": ADMIN_PW},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["user"]["role"], "admin")
        self.assertNotIn("password", res.data["user"])
        self.assertIn("access", res.data["tokens"])
        self.assertIn("refresh", res.data["tokens"])
        self.assertEqual(AccessToken(res.data["tokens"]["access"])["user_type"], "admin")
        self.admin.refresh_from_db()
        self.assertIsNotNone(self.admin.last_login)

    def test_admin_login_by_email(self):
        res = self.client.post(
            reverse("admin_login"),
            {"username": "OWNER@example.com", "password": ADMIN_PW},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["user"]["username"], "owner")

    def test_admin_wrong_password_401(self):
        res = self.client.post(
            reverse("admin_login"),
            {"username": "owner", "password": "wrongpassword"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data["detail"], "Invalid credentials.")

    def test_admin_unknown_user_401(self):
        res = self.client.post(
            reverse("admin_login"),
            {"username": "ghost", "password": ADMIN_PW},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inactive_admin_403(self):
        self.admin.is_active = False
        self.admin.save()
        res = self.client.post(
            reverse("admin_login"),
            {"username": "owner", "password": ADMIN_PW},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_creds_rejected_at_admin_login(self):
        res = self.client.post(
            reverse("admin_login"),
            {"username": "cust", "password": CUST_PW},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        res = self.client.post(
            reverse("admin_login"),
            {"username": "cust@example.com", "password": CUST_PW},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_creds_rejected_at_customer_login(self):
        for ident in ("owner", "owner@example.com"):
            res = self.client.post(
                reverse("login"),
                {"username": ident, "password": ADMIN_PW},
                format="json",
            )
            self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customer_login_with_admin_expected_role_refused(self):
        res = self.client.post(
            reverse("login"),
            {"username": "cust", "password": CUST_PW, "expected_role": "admin"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_legacy_users_row_with_admin_role_cannot_log_in_anywhere(self):
        User.objects.create_user("legacy", "legacy@example.com", ADMIN_PW, role="admin")
        for name in ("admin_login", "login"):
            res = self.client.post(
                reverse(name),
                {"username": "legacy", "password": ADMIN_PW},
                format="json",
            )
            self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED, name)

    def test_wrong_password_is_generic_401(self):
        res = self.client.post(
            reverse("login"),
            {"username": "cust", "password": "wrongpassword"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data["detail"], "Invalid credentials.")

    def test_unknown_user_gives_same_generic_error(self):
        res = self.client.post(
            reverse("login"),
            {"username": "ghost", "password": "wrongpassword"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data["detail"], "Invalid credentials.")

    def test_inactive_account_blocked(self):
        self.customer.is_active = False
        self.customer.save()
        res = self.client.post(
            reverse("login"),
            {"username": "cust", "password": CUST_PW},
            format="json",
        )
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


class AdminEndpointAccessTests(APITestCase):
    """Admin endpoints need an admin_users token; customer tokens are refused."""

    def setUp(self):
        self.customer = make_customer()
        self.admin = make_admin()
        self.item = MenuItem.objects.create(name="Burger", price="100.00")
        self.order = Order.objects.create(customer=self.customer, service_type="takeaway")
        self.admin_token = tokens_for(self.admin)["access"]
        self.cust_token = tokens_for(self.customer)["access"]

    def _admin_calls(self):
        return [
            ("get", reverse("admin_orders"), None),
            ("get", reverse("admin_dashboard"), None),
            ("get", reverse("customer_log"), None),
            ("get", reverse("status_log"), None),
            ("get", reverse("users"), None),
            (
                "post",
                reverse("admin_order_action", args=[self.order.pk]),
                {"action": "accept"},
            ),
        ]

    def test_admin_token_accepted(self):
        bearer(self.client, self.admin_token)
        for method, url, body in self._admin_calls():
            res = getattr(self.client, method)(url, body, format="json")
            self.assertEqual(res.status_code, status.HTTP_200_OK, url)
        log = AdminOrderStatusLog.objects.get()
        self.assertEqual(log.admin, self.admin)

    def test_customer_token_forbidden(self):
        bearer(self.client, self.cust_token)
        for method, url, body in self._admin_calls():
            res = getattr(self.client, method)(url, body, format="json")
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, url)
        self.assertFalse(AdminOrderStatusLog.objects.exists())

    def test_no_token_unauthorized(self):
        for method, url, body in self._admin_calls():
            res = getattr(self.client, method)(url, body, format="json")
            self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED, url)

    def test_legacy_users_admin_role_token_forbidden(self):
        legacy = User.objects.create_user("legacy", "legacy@example.com", ADMIN_PW, role="admin")
        bearer(self.client, tokens_for(legacy)["access"])
        res = self.client.get(reverse("admin_dashboard"))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_without_user_type_rejected(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        bearer(self.client, str(RefreshToken.for_user(self.admin).access_token))
        res = self.client.get(reverse("admin_dashboard"))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_id_collision_resolves_to_own_table(self):
        AdminUser.objects.all().delete()
        User.objects.all().delete()
        admin = AdminUser.objects.create_admin("a1", "a1@example.com", ADMIN_PW)
        cust = User.objects.create_user("c1", "c1@example.com", CUST_PW)
        cust_same = User.objects.filter(pk=admin.pk).first()
        if cust_same is None:
            User.objects.filter(pk=cust.pk).update(pk=admin.pk)
            cust = User.objects.get(pk=admin.pk)
        self.assertEqual(admin.pk, cust.pk)

        bearer(self.client, tokens_for(admin)["access"])
        self.assertEqual(self.client.get(reverse("profile")).data["username"], "a1")
        self.assertEqual(self.client.get(reverse("admin_dashboard")).status_code, 200)
        self.assertEqual(self.client.get(reverse("my_orders")).status_code, 403)
        self.assertEqual(self.client.post(reverse("place_order"), {}, format="json").status_code, 403)

        bearer(self.client, tokens_for(cust)["access"])
        self.assertEqual(self.client.get(reverse("profile")).data["username"], "c1")
        self.assertEqual(self.client.get(reverse("admin_dashboard")).status_code, 403)
        self.assertEqual(self.client.get(reverse("my_orders")).status_code, 200)


class CustomerEndpointTests(APITestCase):
    def setUp(self):
        self.customer = make_customer()
        self.item = MenuItem.objects.create(name="Burger", price="100.00")
        bearer(self.client, tokens_for(self.customer)["access"])

    def test_profile(self):
        res = self.client.get(reverse("profile"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["role"], "customer")

    def test_place_order_and_list_mine(self):
        res = self.client.post(
            reverse("place_order"),
            {"service_type": "takeaway", "items": [{"menu_item": self.item.pk, "quantity": 2}]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        res = self.client.get(reverse("my_orders"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)

    def test_post_review(self):
        res = self.client.post(
            reverse("reviews"),
            {"menu_item": self.item.pk, "rating": 5, "comment": "nice"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_admin_token_cannot_post_review(self):
        bearer(self.client, tokens_for(make_admin())["access"])
        res = self.client.post(
            reverse("reviews"), {"menu_item": self.item.pk, "rating": 5}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class RefreshTests(APITestCase):
    def test_admin_refresh_keeps_admin_type(self):
        admin = make_admin()
        refresh = tokens_for(admin)["refresh"]
        res = self.client.post(reverse("refresh_token"), {"refresh": refresh}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(AccessToken(res.data["access"])["user_type"], "admin")
        bearer(self.client, res.data["access"])
        self.assertEqual(self.client.get(reverse("admin_dashboard")).status_code, 200)
        self.assertEqual(self.client.get(reverse("my_orders")).status_code, 403)
        # rotated refresh stays admin too
        res2 = self.client.post(
            reverse("refresh_token"), {"refresh": res.data["refresh"]}, format="json"
        )
        self.assertEqual(AccessToken(res2.data["access"])["user_type"], "admin")

    def test_customer_refresh_keeps_customer_type(self):
        cust = make_customer()
        refresh = tokens_for(cust)["refresh"]
        res = self.client.post(reverse("refresh_token"), {"refresh": refresh}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(AccessToken(res.data["access"])["user_type"], "customer")
        bearer(self.client, res.data["access"])
        self.assertEqual(self.client.get(reverse("my_orders")).status_code, 200)
        self.assertEqual(self.client.get(reverse("admin_dashboard")).status_code, 403)

    def test_refresh_fails_for_deleted_admin(self):
        admin = make_admin()
        refresh = tokens_for(admin)["refresh"]
        admin.delete()
        res = self.client.post(reverse("refresh_token"), {"refresh": refresh}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class RoleAccessTests(APITestCase):
    def setUp(self):
        self.customer = make_customer()
        self.admin = make_admin()

    def test_me_requires_authentication(self):
        res = self.client.get(reverse("profile"))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_me_returns_admin_profile(self):
        bearer(self.client, tokens_for(self.admin)["access"])
        res = self.client.get(reverse("profile"))
        self.assertEqual(res.data["role"], "admin")
        self.assertEqual(res.data["username"], "owner")

    def test_admin_lists_customers_only_by_default(self):
        bearer(self.client, tokens_for(self.admin)["access"])
        res = self.client.get(reverse("users"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([u["username"] for u in res.data], ["cust"])

    def test_admin_lists_admins_with_role_param(self):
        bearer(self.client, tokens_for(self.admin)["access"])
        res = self.client.get(reverse("users"), {"role": "admin"})
        self.assertEqual([u["username"] for u in res.data], ["owner"])

    def test_admin_can_create_admin_account(self):
        bearer(self.client, tokens_for(self.admin)["access"])
        res = self.client.post(
            reverse("users"),
            {
                "username": "receiver2",
                "email": "r2@example.com",
                "role": "admin",
                "password": ADMIN_PW,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        row = AdminUser.objects.get(username="receiver2")
        self.assertTrue(row.password.startswith("pbkdf2_"))
        self.assertFalse(User.objects.filter(username="receiver2").exists())

    def test_admin_can_create_customer_account(self):
        bearer(self.client, tokens_for(self.admin)["access"])
        res = self.client.post(
            reverse("users"),
            {"username": "newcust", "email": "nc@example.com", "password": CUST_PW},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.get(username="newcust").role, "customer")


@override_settings(GOOGLE_OAUTH_CLIENT_ID="x")
class GoogleLoginTests(APITestCase):
    def _post(self, email):
        info = {"email": email, "email_verified": True, "name": "G"}
        with patch.dict("os.environ", {"GOOGLE_OAUTH_CLIENT_ID": "x"}), patch(
            "google.oauth2.id_token.verify_oauth2_token", return_value=info
        ):
            return self.client.post(reverse("google_login"), {"credential": "t"}, format="json")

    def test_non_customer_users_row_refused(self):
        User.objects.create_user("legacy", "legacy@example.com", ADMIN_PW, role="admin")
        self.assertEqual(self._post("legacy@example.com").status_code, 403)

    def test_new_google_user_is_customer(self):
        res = self._post("newg@example.com")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["user"]["role"], "customer")
        self.assertFalse(AdminUser.objects.exists())


class ManagementCommandTests(APITestCase):
    def test_createadmin_writes_hashed_row_to_admin_users(self):
        with patch(
            "api.management.commands.createadmin.getpass", side_effect=[ADMIN_PW, ADMIN_PW]
        ):
            call_command(
                "createadmin", "--username", "boss", "--email", "boss@example.com",
                stdout=StringIO(),
            )
        row = AdminUser.objects.get(username="boss")
        self.assertTrue(row.password.startswith("pbkdf2_"))
        self.assertNotEqual(row.password, ADMIN_PW)
        self.assertTrue(row.check_password(ADMIN_PW))
        self.assertFalse(User.objects.exists())

    def test_changeadmin_updates_email_and_password(self):
        make_admin("boss")
        with patch(
            "api.management.commands.changeadmin.getpass",
            side_effect=["NewTruckPass77", "NewTruckPass77"],
        ):
            call_command(
                "changeadmin", "--user", "boss", "--new-username", "",
                "--new-email", "new@example.com", stdout=StringIO(),
            )
        row = AdminUser.objects.get(username="boss")
        self.assertEqual(row.email, "new@example.com")
        self.assertTrue(row.password.startswith("pbkdf2_"))
        self.assertTrue(row.check_password("NewTruckPass77"))


class ModelTests(APITestCase):
    def test_role_defaults_to_customer(self):
        user = User.objects.create_user("d1", "d1@example.com", CUST_PW)
        self.assertEqual(user.role, "customer")
        self.assertTrue(user.is_customer)
        self.assertFalse(user.is_admin)

    def test_admin_user_password_hashed(self):
        admin = make_admin("a1")
        self.assertTrue(admin.password.startswith("pbkdf2_"))
        self.assertNotEqual(admin.password, ADMIN_PW)
        self.assertTrue(admin.check_password(ADMIN_PW))
        self.assertEqual(admin.role, "admin")
        self.assertFalse(User.objects.filter(username="a1").exists())

    def test_table_names(self):
        self.assertEqual(User._meta.db_table, "users")
        self.assertEqual(AdminUser._meta.db_table, "admin_users")