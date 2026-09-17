"""
Give admin-role accounts permission to manage users in the Django admin site.

Grants only the four `api.user` permissions (add / change / delete / view)
instead of making the account a superuser, which keeps least privilege.

Run from the backend directory:
    venv\\Scripts\\python.exe ..\\tools\\grant_admin_site_access.py
"""

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

import django  # noqa: E402

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pubg_food_truck.settings")
django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.auth.models import Group, Permission  # noqa: E402
from django.contrib.contenttypes.models import ContentType  # noqa: E402

User = get_user_model()

GROUP_NAME = "Truck Owners"


def main():
    ct = ContentType.objects.get_for_model(User)
    perms = Permission.objects.filter(
        content_type=ct,
        codename__in=["add_user", "change_user", "delete_user", "view_user"],
    )
    if perms.count() != 4:
        print(f"WARNING: expected 4 permissions, found {perms.count()}")
        print("  available:", list(Permission.objects.filter(content_type=ct).values_list("codename", flat=True)))

    group, created = Group.objects.get_or_create(name=GROUP_NAME)
    group.permissions.set(perms)
    print(f"group '{GROUP_NAME}' {'created' if created else 'updated'} with "
          f"{group.permissions.count()} permissions")

    admins = User.objects.filter(role="admin")
    if not admins:
        print("no admin accounts found")
        return

    for u in admins:
        u.groups.add(group)
        if not u.is_staff:
            u.is_staff = True          # required to reach /admin/ at all
            u.save(update_fields=["is_staff"])
        print(f"  {u.username}: staff={u.is_staff} groups={[g.name for g in u.groups.all()]}")

    print("\nAdmin site: http://127.0.0.1:8000/admin/")
    print("Sign in with the admin username and password.")


if __name__ == "__main__":
    main()
