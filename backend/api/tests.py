"""
Auth + role tests.

These verify the security guarantees end to end: password hashing,
role defaults, privilege-escalation protection, and portal enforcement.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

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


class LoginTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            "cust", "cust@example.com", "ChickenDinner99"
        )
        self.admin = User.objects.create_admin(
            "owner", "owner@example.com", "TruckOwner99"
        )

    def test_customer_login_returns_role_and_tokens(self):
        res = self.client.post(
            reverse("login"),
            {"username": "cust", "password": "ChickenDinner99"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["user"]["role"], "customer")
        self.assertIn("access", res.data["tokens"])

    def test_admin_login_returns_admin_role(self):
        res = self.client.post(
            reverse("login"),
            {"username": "owner", "password": "TruckOwner99"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["user"]["role"], "admin")

    def test_wrong_password_is_generic_401(self):
        res = self.client.post(
            reverse("login"),
            {"username": "cust", "password": "wrongpassword"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        # Must not reveal whether the account exists.
        self.assertEqual(res.data["detail"], "Invalid credentials.")

    def test_unknown_user_gives_same_generic_error(self):
        res = self.client.post(
            reverse("login"),
            {"username": "ghost", "password": "wrongpassword"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data["detail"], "Invalid credentials.")

    def test_customer_cannot_use_admin_portal(self):
        res = self.client.post(
            reverse("login"),
            {
                "username": "cust",
                "password": "ChickenDinner99",
                "expected_role": "admin",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_use_customer_portal(self):
        res = self.client.post(
            reverse("login"),
            {
                "username": "owner",
                "password": "TruckOwner99",
                "expected_role": "customer",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_account_blocked(self):
        self.customer.is_active = False
        self.customer.save()
        res = self.client.post(
            reverse("login"),
            {"username": "cust", "password": "ChickenDinner99"},
            format="json",
        )
        self.assertIn(
            res.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


class RoleAccessTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            "cust", "cust@example.com", "ChickenDinner99"
        )
        self.admin = User.objects.create_admin(
            "owner", "owner@example.com", "TruckOwner99"
        )

    def _auth(self, username, password):
        res = self.client.post(
            reverse("login"),
            {"username": username, "password": password},
            format="json",
        )
        token = res.data["tokens"]["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_me_requires_authentication(self):
        res = self.client.get(reverse("profile"))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_profile(self):
        self._auth("cust", "ChickenDinner99")
        res = self.client.get(reverse("profile"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["username"], "cust")

    def test_admin_can_list_users(self):
        self._auth("owner", "TruckOwner99")
        res = self.client.get(reverse("users"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 2)

    def test_customer_forbidden_from_admin_endpoint(self):
        """A valid customer token must still be rejected (403, not 200)."""
        self._auth("cust", "ChickenDinner99")
        res = self.client.get(reverse("users"))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_forbidden_from_admin_endpoint(self):
        res = self.client.get(reverse("users"))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_can_create_admin_account(self):
        self._auth("owner", "TruckOwner99")
        res = self.client.post(
            reverse("users"),
            {
                "username": "receiver2",
                "email": "r2@example.com",
                "role": "admin",
                "password": "TruckOwner99",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.get(username="receiver2").role, "admin")


class ModelTests(APITestCase):
    def test_role_defaults_to_customer(self):
        user = User.objects.create_user("d1", "d1@example.com", "ChickenDinner99")
        self.assertEqual(user.role, "customer")
        self.assertTrue(user.is_customer)
        self.assertFalse(user.is_admin)

    def test_create_admin_sets_role_and_staff(self):
        user = User.objects.create_admin("a1", "a1@example.com", "TruckOwner99")
        self.assertEqual(user.role, "admin")
        self.assertTrue(user.is_admin)
        self.assertTrue(user.is_staff)

    def test_users_table_name(self):
        self.assertEqual(User._meta.db_table, "users")
