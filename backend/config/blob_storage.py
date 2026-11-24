"""
Uploaded files on the live site (product photos, avatars) → Vercel Blob.

Vercel forgets files saved on its own servers, so uploads go to Blob storage,
which keeps them forever and serves them from a fast CDN.

Set by Vercel when the store is connected (never written in the code):
  BLOB_READ_WRITE_TOKEN  secret key used to upload and delete
  BLOB_STORE_ID          which store, used to build the public address
Optional:
  BLOB_BASE_URL          the store's public address, only if it ever differs
"""
import mimetypes
import os
from urllib.parse import quote
from urllib.request import urlopen

from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible
from vercel.blob import sync as blob

ONE_YEAR = 60 * 60 * 24 * 365   # photos never change at the same address


def base_url():
    """https://<store>.public.blob.vercel-storage.com"""
    custom = os.getenv("BLOB_BASE_URL", "").rstrip("/")
    if custom:
        return custom
    store_id = os.getenv("BLOB_STORE_ID", "")
    if not store_id:
        raise ImproperlyConfigured("BLOB_STORE_ID is missing: connect the Blob store to this project in Vercel.")
    return f"https://{store_id.removeprefix('store_').lower()}.public.blob.vercel-storage.com"


@deconstructible
class VercelBlobStorage(Storage):
    """A Django storage that keeps files in Vercel Blob (public, cached by the CDN)."""

    def _save(self, name, content):
        content.seek(0)
        uploaded = blob.put_blob(
            name,
            content.read(),
            access="public",
            content_type=mimetypes.guess_type(name)[0] or "application/octet-stream",
            allow_overwrite=True,
            cache_control_max_age=ONE_YEAR,
        )
        # Safety check: the address we'll show must be where the photo really is
        if uploaded.url != self.url(name):
            raise ImproperlyConfigured(
                f"The photo was saved at {uploaded.url}, but Bazario expected {self.url(name)}. "
                f"Set BLOB_BASE_URL in Vercel to the part before /{name}."
            )
        return name

    def _open(self, name, mode="rb"):
        with urlopen(self.url(name), timeout=20) as response:
            return ContentFile(response.read(), name=name)

    def exists(self, name):
        try:
            blob.head_blob(self.url(name))
            return True
        except FileNotFoundError:   # Vercel's BlobNotFoundError is a FileNotFoundError
            return False

    def delete(self, name):
        try:
            blob.delete_blob(self.url(name))
        except FileNotFoundError:
            pass

    def size(self, name):
        return blob.head_blob(self.url(name)).size

    def url(self, name):
        return f"{base_url()}/{quote(name)}"