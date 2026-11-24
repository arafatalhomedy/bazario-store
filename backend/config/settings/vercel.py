"""
Live site on Vercel with a real PostgreSQL database (Neon). Built for speed.

- DATABASE_URL comes from Vercel (added by the Neon integration).
  It is a secret: never written in the code or on GitHub.
- Vercel only uploads the backend folder, so the build copies the frontend
  into backend/catalog_bundle and collects static files (build_vercel.py).
"""
import os

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

from .prod import *  # noqa: F401,F403
from .prod import BASE_DIR, STORAGES, TEMPLATES

if not os.getenv("DATABASE_URL"):
    raise ImproperlyConfigured("DATABASE_URL must be set (Vercel → Storage → Neon).")

# ---------------------------------------------------------------- Database (Neon PostgreSQL)
DATABASES = {
    "default": dj_database_url.config(
        conn_max_age=60,           # reuse a connection for up to 60 s: faster pages
        conn_health_checks=True,   # check the connection is still alive before reusing it
        ssl_require=True,          # always encrypted
    )
}
DATABASES["default"]["OPTIONS"] = {
    **DATABASES["default"].get("OPTIONS", {}),
    "connect_timeout": 10,         # never hang forever if the database is waking up
}
# Neon's pooler (many visitors share few connections) doesn't support
# server-side cursors, so Django must not use them
DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True

# ---------------------------------------------------------------- Frontend files
bundle = BASE_DIR / "catalog_bundle"
TEMPLATES[0]["DIRS"] = [bundle / "pages"]
STATICFILES_DIRS = [(name, bundle / name) for name in ("css", "js", "images")]

# Fingerprinted, compressed static files (config/storage.py)
STORAGES = {
    # Uploaded photos → Vercel Blob (config/blob_storage.py)
    "default": {"BACKEND": "config.blob_storage.VercelBlobStorage"},
    # CSS / JS / images → fingerprinted files (config/storage.py)
    "staticfiles": {"BACKEND": "config.storage.BazarioStaticStorage"},
}


def add_cdn_headers(headers, path, url):
    """Fingerprinted files never change: let Vercel's CDN keep them for a year too."""
    if "immutable" in headers.get("Cache-Control", ""):
        headers["CDN-Cache-Control"] = "public, max-age=31536000, immutable"


WHITENOISE_ADD_HEADERS_FUNCTION = add_cdn_headers

# Vercel handles HTTPS in front of Django
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")