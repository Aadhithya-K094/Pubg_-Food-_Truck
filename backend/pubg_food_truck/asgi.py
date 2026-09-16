"""ASGI config for the PUBG Food Truck project."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pubg_food_truck.settings")

application = get_asgi_application()
