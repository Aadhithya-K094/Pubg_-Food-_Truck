"""
Rotate the admin account's password to a strong random value.

The new password is written to backend/admin-credentials.txt (gitignored)
rather than printed to the console, so it does not end up in shell history
or a chat transcript.

Run from the backend directory:
    venv\\Scripts\\python.exe ..\\tools\\rotate_admin_password.py
"""

import os
import secrets
import string
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

import django  # noqa: E402

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pubg_food_truck.settings")
django.setup()

from django.contrib.auth import authenticate, get_user_model  # noqa: E402
from django.contrib.auth.password_validation import validate_password  # noqa: E402

User = get_user_model()

USERNAME = sys.argv[1] if len(sys.argv) > 1 else "owner"


def make_password(length=20):
    """Strong password that still satisfies Django's validators."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*-_=+"
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        # guarantee a mix so it is never 'entirely numeric' or too simple
        if (
            any(c.islower() for c in pw)
            and any(c.isupper() for c in pw)
            and any(c.isdigit() for c in pw)
            and any(c in "!@#$%^&*-_=+" for c in pw)
        ):
            return pw


def main():
    try:
        user = User.objects.get(username=USERNAME)
    except User.DoesNotExist:
        print(f"ERROR: no user named '{USERNAME}'")
        sys.exit(1)

    if user.role != "admin":
        print(f"ERROR: '{USERNAME}' has role '{user.role}', not admin")
        sys.exit(1)

    new_pw = make_password()
    validate_password(new_pw, user)  # raises if it somehow fails the rules

    user.set_password(new_pw)  # hashes with PBKDF2
    user.save()

    # confirm the new password actually authenticates
    ok = authenticate(username=user.username, password=new_pw) is not None

    out = BACKEND / "admin-credentials.txt"
    out.write_text(
        "PUBG Food Truck - admin credentials\n"
        "===================================\n\n"
        f"  Portal   : Admin\n"
        f"  URL      : http://localhost:3000\n"
        f"  Username : {user.username}\n"
        f"  Email    : {user.email}\n"
        f"  Password : {new_pw}\n\n"
        "This file is gitignored. Note the password somewhere safe\n"
        "(a password manager) and then DELETE this file.\n\n"
        "To change it yourself later:\n"
        "  venv\\Scripts\\python.exe manage.py changeadmin\n",
        encoding="utf-8",
    )

    print("password rotated for:", user.username)
    print("email             :", user.email)
    print("hash prefix       :", user.password[:14] + "...")
    print("authenticates     :", ok)
    print("written to        :", out)
    print("password length   :", len(new_pw), "chars (not shown here on purpose)")


if __name__ == "__main__":
    main()
