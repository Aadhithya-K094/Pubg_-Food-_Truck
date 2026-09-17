"""
Change an admin account's username, email and/or password.

Interactive:
    python manage.py changeadmin

Non-interactive (password is still prompted, never passed as an argument
so it does not end up in your shell history):
    python manage.py changeadmin --user owner --new-username boss
    python manage.py changeadmin --user owner --new-email boss@truck.com

Leave a prompt blank to keep the current value.
"""

from getpass import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

User = get_user_model()


class Command(BaseCommand):
    help = "Change an admin account's username, email and/or password."

    def add_arguments(self, parser):
        parser.add_argument(
            "--user",
            dest="current_username",
            help="Current username of the account to change.",
        )
        parser.add_argument("--new-username", dest="new_username")
        parser.add_argument("--new-email", dest="new_email")
        parser.add_argument(
            "--skip-password",
            action="store_true",
            help="Only change username/email, leave the password alone.",
        )

    def handle(self, *args, **options):
        # ---- locate the account -------------------------------------
        current = options.get("current_username")
        if not current:
            admins = User.objects.filter(role="admin").order_by("id")
            if not admins:
                raise CommandError("No admin accounts exist. Run: manage.py createadmin")
            self.stdout.write("Admin accounts:")
            for a in admins:
                self.stdout.write(f"  - {a.username}  <{a.email}>")
            current = input("Which username do you want to change? ").strip()

        try:
            user = User.objects.get(username=current)
        except User.DoesNotExist:
            raise CommandError(f"No user named '{current}'.")

        if user.role != "admin":
            raise CommandError(
                f"'{current}' has role '{user.role}', not 'admin'. "
                "This command only edits admin accounts."
            )

        self.stdout.write(
            self.style.WARNING(
                f"\nEditing: {user.username} <{user.email}>\n"
                "Press Enter at a prompt to keep the current value.\n"
            )
        )

        # ---- username ------------------------------------------------
        new_username = options.get("new_username")
        if new_username is None:
            new_username = input(f"New username [{user.username}]: ").strip()
        if new_username and new_username != user.username:
            if User.objects.filter(username=new_username).exclude(pk=user.pk).exists():
                raise CommandError(f"Username '{new_username}' is already taken.")
            user.username = new_username

        # ---- email ---------------------------------------------------
        new_email = options.get("new_email")
        if new_email is None:
            new_email = input(f"New email [{user.email}]: ").strip()
        if new_email and new_email != user.email:
            if User.objects.filter(email=new_email).exclude(pk=user.pk).exists():
                raise CommandError(f"Email '{new_email}' is already in use.")
            user.email = new_email

        # ---- password ------------------------------------------------
        if not options.get("skip_password"):
            pw = getpass("New password (blank = keep current): ")
            if pw:
                confirm = getpass("New password (again): ")
                if pw != confirm:
                    raise CommandError("Passwords did not match. Nothing was changed.")
                try:
                    validate_password(pw, user)
                except ValidationError as exc:
                    raise CommandError("\n".join(exc.messages)) from exc
                # set_password hashes it; plaintext is never stored.
                user.set_password(pw)
                self.stdout.write("  password will be updated")

        user.save()

        self.stdout.write(
            self.style.SUCCESS(
                f"\nUpdated. Sign in with username '{user.username}' <{user.email}>."
            )
        )
