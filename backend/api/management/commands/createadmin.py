"""
Create an ADMIN (food truck owner / order receiver) account.

Admin accounts are intentionally NOT creatable through the public
sign-up API, so use this command to provision the owner:

    python manage.py createadmin

You'll be prompted for the username, email and password (hidden input).
The password is validated and stored as a one-way hash.
"""

from getpass import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

User = get_user_model()


class Command(BaseCommand):
    help = "Create an admin (food truck owner / order receiver) account."

    def add_arguments(self, parser):
        parser.add_argument("--username")
        parser.add_argument("--email")
        parser.add_argument("--full-name", dest="full_name", default="")
        parser.add_argument("--phone", default="")

    def handle(self, *args, **options):
        username = options.get("username") or input("Username: ").strip()
        email = options.get("email") or input("Email: ").strip()

        if not username or not email:
            raise CommandError("Username and email are required.")

        if User.objects.filter(username=username).exists():
            raise CommandError(f"A user named '{username}' already exists.")
        if User.objects.filter(email=email).exists():
            raise CommandError(f"A user with email '{email}' already exists.")

        password = getpass("Password: ")
        confirm = getpass("Password (again): ")

        if password != confirm:
            raise CommandError("Passwords did not match.")

        try:
            validate_password(password)
        except ValidationError as exc:
            raise CommandError("\n".join(exc.messages)) from exc

        user = User.objects.create_admin(
            username=username,
            email=email,
            password=password,
            full_name=options.get("full_name") or None,
            phone=options.get("phone") or None,
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Admin (owner) account created: {user.username} <{user.email}>"
            )
        )
