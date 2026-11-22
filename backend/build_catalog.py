"""Build an isolated sample database, product photos, and frontend assets for Vercel."""
import os
import shutil
from pathlib import Path

from django.core.management import execute_from_command_line


def main():
    backend = Path(__file__).resolve().parent
    frontend = backend.parent / "frontend"
    bundle = backend / "catalog_bundle"
    for name in ("css", "js", "images", "pages"):
        shutil.copytree(frontend / name, bundle / name, dirs_exist_ok=True)
    (bundle / "artwork").mkdir(exist_ok=True)
    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.catalog_demo"
    os.environ["BAZARIO_BUILD_CATALOG"] = "1"
    execute_from_command_line(["manage.py", "migrate", "--noinput"])
    execute_from_command_line(["manage.py", "seed_products"])


if __name__ == "__main__":
    main()
