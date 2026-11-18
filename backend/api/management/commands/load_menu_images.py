"""
Attach freely licensed Wikimedia Commons photos to every MenuItem.

    python manage.py load_menu_images            # only items without an image
    python manage.py load_menu_images --force    # replace existing images

Images land in MEDIA_ROOT/menu/<dish>.<ext>. Credits are written to
MEDIA_ROOT/menu/ATTRIBUTION.md and database/menu_image_credits.md.
"""

import re
import time
from io import BytesIO
from pathlib import Path

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.core.files.base import ContentFile
from PIL import Image

from api.models import MenuItem

API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "PubgFoodTruckLocalDev/1.0 (aadhiaadhi094@gmail.com)"
ALLOWED_MIME = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
FREE_LICENSE = re.compile(r"^(public domain|pd|cc0|cc[ -]by(-sa)?\b)", re.I)

# dish key -> Commons file title
COMMONS_FILES = {
    "veg-fried-rice": "File:Kerala vegetable fried rice 2.jpg",
    "egg-fried-rice": "File:Egg Fried Rice.jpg",
    "gobi-fried-rice": "File:Fried Rice & Chilli Gobi.JPG",
    "paneer-fried-rice": "File:Paneer fried rice...jpg",
    "chicken-fried-rice": "File:Chicken Fried rice.jpg",
    "schezwan": "File:Schezwan noodles.jpg",
    "bread-omelette": "File:Bread Omelette 6.jpg",
    "chilli-parotta": "File:Chilli parotta.jpg",
    "chicken-lollipop": "File:Chicken lollipop.jpg",
    "chicken-wings": "File:Chicken Wings with Montreal Seasoning.jpg",
    "bbq-vikendi": "File:Barbecue chicken-03.jpg",
    "bbq-miramar": "File:Tandoori chicken Indian.jpg",
    "bbq-sanhok": "File:Chicken BBQ.jpg",
    "bbq-erangel": "File:Barbecue chicken-04.jpg",
    "shawarma-roll": "File:Shawarma-sandwich-01.jpg",
    "shawarma-plate": "File:Chicken Shawarma Platter - Lavash 2025-02-10.jpg",
}

# exact item name -> dish key
NAME_TO_DISH = {
    "2X Veg Scope Rice / Noodles": "veg-fried-rice",
    "3X Egg Scope Rice / Noodles": "egg-fried-rice",
    "4X Gobi Scope Rice / Noodles": "gobi-fried-rice",
    "6X Paneer Scope Rice / Noodles": "paneer-fried-rice",
    "8X Chicken Scope Rice / Noodles": "chicken-fried-rice",
    "Schezwan Extra": "schezwan",
    "Pan Bread Omelette": "bread-omelette",
    "Buggy SPL Bread Omelette": "bread-omelette",
    "UAZ Chilly Parotta": "chilli-parotta",
    "Chicken Lollipop": "chicken-lollipop",
    "Flare Wings": "chicken-wings",
}


def dish_for(name):
    if name in NAME_TO_DISH:
        return NAME_TO_DISH[name]
    for prefix, key in (
        ("Vikendi White BBQ", "bbq-vikendi"),
        ("Miramar Spicy BBQ", "bbq-miramar"),
        ("Sanhok Pepper BBQ", "bbq-sanhok"),
        ("Erangel SPL BBQ", "bbq-erangel"),
    ):
        if name.startswith(prefix):
            return key
    if "Shawarma" in name:
        if name.endswith("(Plate)"):
            return "shawarma-plate"
        if name.endswith("(Roll)"):
            return "shawarma-roll"
    return None


def strip_html(text):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", text or "")).strip()


class Command(BaseCommand):
    help = "Download freely licensed Wikimedia Commons photos and attach them to menu items."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Replace existing images.")

    def handle(self, *args, **opts):
        force = opts["force"]
        session = requests.Session()
        session.headers["User-Agent"] = USER_AGENT

        items = list(MenuItem.objects.all())
        by_dish = {}
        for item in items:
            key = dish_for(item.name)
            if key is None:
                self.stderr.write(f"No dish mapping for: {item.name}")
                continue
            if item.image and not force:
                continue
            by_dish.setdefault(key, []).append(item)

        media_dir = Path(settings.MEDIA_ROOT) / "menu"
        media_dir.mkdir(parents=True, exist_ok=True)
        credits_path = media_dir / "ATTRIBUTION.md"
        tracked_path = Path(settings.BASE_DIR).parent / "database" / "menu_image_credits.md"

        # existing credits survive across idempotent runs
        credits = {}
        for key in COMMONS_FILES:
            meta = media_dir / f"{key}.meta"
            if meta.exists():
                credits[key] = dict(
                    line.split("=", 1) for line in meta.read_text(encoding="utf-8").splitlines() if "=" in line
                )

        for key, rows in by_dish.items():
            title = COMMONS_FILES[key]
            info = self.fetch_info(session, title)
            lic = info["extmetadata"].get("LicenseShortName", {}).get("value", "")
            if not FREE_LICENSE.match(lic):
                raise CommonsError(f"{title}: license '{lic}' is not free")
            mime = info.get("mime")
            if mime not in ALLOWED_MIME:
                raise CommonsError(f"{title}: unsupported type {mime}")
            data = self.download(session, info["thumburl"])
            Image.open(BytesIO(data)).verify()
            filename = f"{key}{ALLOWED_MIME[mime]}"
            (media_dir / filename).write_bytes(data)
            ext = info["extmetadata"]
            credit = {
                "file": filename,
                "page": info["descriptionurl"],
                "author": strip_html(ext.get("Artist", {}).get("value", "")) or "Unknown",
                "license": lic,
                "license_url": ext.get("LicenseUrl", {}).get("value", ""),
            }
            credits[key] = credit
            (media_dir / f"{key}.meta").write_text(
                "\n".join(f"{k}={v}" for k, v in credit.items()), encoding="utf-8"
            )
            for item in rows:
                item.image.name = f"menu/{filename}"
                item.save(update_fields=["image"])
            self.stdout.write(f"{key}: {filename} -> {len(rows)} items ({lic})")
            time.sleep(1)

        self.write_credits(credits, credits_path, tracked_path)
        missing = MenuItem.objects.filter(image__isnull=True).count() + MenuItem.objects.filter(image="").count()
        self.stdout.write(self.style.SUCCESS(f"Done. Items still without image: {missing}"))

    def fetch_info(self, session, title):
        params = {
            "action": "query", "titles": title, "prop": "imageinfo",
            "iiprop": "url|extmetadata|mime", "iiurlwidth": 800, "format": "json",
        }
        resp = self.get(session, API, params)
        page = next(iter(resp.json()["query"]["pages"].values()))
        if "imageinfo" not in page:
            raise CommonsError(f"{title}: not found on Commons")
        return page["imageinfo"][0]

    def download(self, session, url):
        return self.get(session, url).content

    def get(self, session, url, params=None):
        for attempt in range(4):
            resp = session.get(url, params=params, timeout=60)
            if resp.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            resp.raise_for_status()
            return resp
        raise CommonsError(f"Rate limited: {url}")

    def write_credits(self, credits, *paths):
        dishes = {}
        for item in MenuItem.objects.all():
            key = dish_for(item.name)
            if key:
                dishes.setdefault(key, []).append(item.name)
        lines = [
            "# Menu image credits",
            "",
            "Photos come from Wikimedia Commons under free licenses. Regenerate with `python manage.py load_menu_images --force`.",
            "",
        ]
        for key, c in credits.items():
            lines += [
                f"## {c['file']}",
                f"- Dishes: {', '.join(sorted(dishes.get(key, [])))}",
                f"- Source: {c['page']}",
                f"- Author: {c['author']}",
                f"- License: [{c['license']}]({c['license_url']})" if c["license_url"] else f"- License: {c['license']}",
                "",
            ]
        for p in paths:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("\n".join(lines), encoding="utf-8")


class CommonsError(CommandError):
    pass
