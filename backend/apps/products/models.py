"""Database models for the product catalog."""
from datetime import timedelta
from decimal import Decimal

from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from .images import ALLOWED_IMAGE_EXTENSIONS, build_image_versions, validate_image_size

NEW_PRODUCT_DAYS = 14
LOW_STOCK_THRESHOLD = 5


def unique_slug(model, value, instance_pk=None):
    """Build a URL-friendly slug that no other row of `model` uses."""
    base = slugify(value)[:200] or "item"
    slug, counter = base, 2
    others = model.objects.exclude(pk=instance_pk)
    while others.filter(slug=slug).exists():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


class Category(models.Model):
    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=100, unique=True, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Category, self.name, self.pk)
        super().save(*args, **kwargs)


class Product(models.Model):
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    description = models.TextField(blank=True)
    price = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))]
    )
    compare_at_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Original price. Set it higher than the price to show a Sale badge.",
    )
    stock = models.PositiveIntegerField(default=0)
    promotion_starts = models.DateTimeField(null=True, editable=False, db_index=True)
    promotion_ends = models.DateTimeField(null=True, editable=False, db_index=True)
    # The future sale price is held here until the promotion starts.
    queued_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, editable=False)
    image = models.ImageField(
        upload_to="products/", blank=True,
        validators=[FileExtensionValidator(ALLOWED_IMAGE_EXTENSIONS), validate_image_size],
    )
    thumbnail = models.ImageField(upload_to="products/thumbs/", blank=True, editable=False)
    is_active = models.BooleanField(default=True, help_text="Untick to hide the product from the shop.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["is_active", "-created_at"]),
            models.Index(fields=["price"]),
            models.Index(fields=["name"]),
        ]

    def __str__(self):
        return self.name

    # ----- Badges -----------------------------------------------------------
    @property
    def is_on_sale(self):
        return self.compare_at_price is not None and self.compare_at_price > self.price

    @property
    def is_new(self):
        return bool(self.created_at) and timezone.now() - self.created_at <= timedelta(days=NEW_PRODUCT_DAYS)

    @property
    def is_sold_out(self):
        return self.stock == 0

    @property
    def is_low_stock(self):
        return 0 < self.stock <= LOW_STOCK_THRESHOLD

    @property
    def discount_percent(self):
        """21 for a $149 product that was $189. 0 when not on sale."""
        if not self.is_on_sale:
            return 0
        return round((1 - self.price / self.compare_at_price) * 100)

    @property
    def savings(self):
        """How much the customer saves on a sale item, e.g. 40.00."""
        if not self.is_on_sale:
            return Decimal("0.00")
        return self.compare_at_price - self.price

    # ----- Saving -----------------------------------------------------------
    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Product, self.name, self.pk)

        if not self.image:
            self.thumbnail = ""
        elif not self.image._committed:
            # A new image was just uploaded: convert it to optimized WebP versions
            self._optimize_image()

        super().save(*args, **kwargs)

    def _optimize_image(self):
        main, thumb = build_image_versions(self.image)
        self.image.save(f"{self.slug}.webp", main, save=False)
        self.thumbnail.save(f"{self.slug}-thumb.webp", thumb, save=False)
