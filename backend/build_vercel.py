"""
Build step for the live site (Vercel + Neon PostgreSQL + Blob photos).

Every build:
  1. Copy the frontend into backend/catalog_bundle (Vercel only uploads backend/).
  2. Collect static files with fingerprinted names (fast, cached for a year).
  3. Create / update the tables in the PostgreSQL database (migrate).

Only when switched on in Vercel's Environment Variables (then switch them off):
  BAZARIO_SEED=1                          load the sample products (photos → Blob)
  DJANGO_SUPERUSER_EMAIL / _PASSWORD      create the admin user if it doesn't exist

Secrets (DATABASE_URL, BLOB_READ_WRITE_TOKEN, passwords) come from Vercel,
never from the code.

Vercel Build Command:  python build_vercel.py
"""
import os
import shutil
from pathlib import Path

from django.core.management import execute_from_command_line


def main():
    backend = Path(__file__).resolve().parent
    frontend = backend.parent / "frontend"
    bundle = backend / "catalog_bundle"

    # 1. Frontend files next to the backend
    for name in ("css", "js", "images", "pages"):
        shutil.copytree(frontend / name, bundle / name, dirs_exist_ok=True)

    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.vercel"

    # 2. Static files with fingerprints (backend/staticfiles)
    execute_from_command_line(["manage.py", "collectstatic", "--noinput", "--clear"])

    # 3. Tables in the live PostgreSQL database
    execute_from_command_line(["manage.py", "migrate", "--noinput"])

    # 4. One-time: sample products (only when BAZARIO_SEED=1)
    if os.getenv("BAZARIO_SEED") == "1":
        execute_from_command_line(["manage.py", "seed_products"])

    # 5. One-time: the admin user (only if it doesn't exist yet)
    create_admin()


def create_admin():
    email = os.getenv("DJANGO_SUPERUSER_EMAIL", "").strip().lower()
    password = os.getenv("DJANGO_SUPERUSER_PASSWORD", "")
    if not email or not password:
        return

    import django
    django.setup()
    from django.contrib.auth import get_user_model

    User = get_user_model()
    if User.objects.filter(username=email).exists():
        print(f"Admin {email} already exists: nothing to do.")
        return
    User.objects.create_superuser(username=email, email=email, password=password)
    print(f"Admin {email} created.")


if __name__ == "__main__":
    main()