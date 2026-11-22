"""Validation and optimization for product images."""
from io import BytesIO

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from PIL import Image, ImageOps

ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"]
MAX_UPLOAD_MB = 5
MAIN_MAX_SIZE = (1200, 1200)
THUMB_MAX_SIZE = (600, 600)
WEBP_QUALITY = 82


def validate_image_size(file):
    """Reject uploads larger than MAX_UPLOAD_MB."""
    if file.size > MAX_UPLOAD_MB * 1024 * 1024:
        raise ValidationError(f"Image must be smaller than {MAX_UPLOAD_MB} MB.")


def _to_webp(image, max_size):
    copy = image.copy()
    copy.thumbnail(max_size, Image.Resampling.LANCZOS)
    buffer = BytesIO()
    copy.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=6)
    return ContentFile(buffer.getvalue())


def build_image_versions(source_file):
    """Return (main, thumbnail) WebP files built from an uploaded image."""
    source_file.seek(0)
    with Image.open(source_file) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        return _to_webp(image, MAIN_MAX_SIZE), _to_webp(image, THUMB_MAX_SIZE)