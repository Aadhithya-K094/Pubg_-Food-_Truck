"""
Test settings: same app config, but SQLite in memory.

Lets the auth/role logic be verified without needing live MySQL
credentials. Production/dev still uses MySQL via settings.py.
"""

from .settings import *  # noqa: F401,F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
