"""WSGI config for the PUBG Food Truck project."""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pubg_food_truck.settings")

application = get_wsgi_application()
