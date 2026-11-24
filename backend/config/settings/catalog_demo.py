"""Production settings for a public catalog built from sample data."""
import os

from .prod import *

bundle = BASE_DIR / "catalog_bundle"
database = bundle / "catalog.sqlite3"
DATABASES = {"default": {
    "ENGINE": "django.db.backends.sqlite3",
    "NAME": database if os.getenv("BAZARIO_BUILD_CATALOG") == "1" else database.as_uri() + "?mode=ro",
    "OPTIONS": {"uri": True},
}}
TEMPLATES[0]["DIRS"] = [bundle / "pages"]
MEDIA_ROOT = bundle / "artwork"
MEDIA_URL = "/static/demo-art/"
STATICFILES_DIRS = [(name, bundle / name) for name in ("css", "js", "images")]
STATICFILES_DIRS.append(("demo-art", MEDIA_ROOT))
STORAGES["staticfiles"] = {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}
SESSION_ENGINE = "django.contrib.sessions.backends.signed_cookies"
# Browsers keep CSS, JS and photos for 1 hour, so each new page opens fast
WHITENOISE_MAX_AGE = 60 * 60
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
MIDDLEWARE.remove("apps.products.promotion_clock.PromotionClockMiddleware")
MIDDLEWARE.insert(MIDDLEWARE.index("django.middleware.common.CommonMiddleware") + 1,
                  "config.catalog_demo.CatalogDemoMiddleware")
