"""
Create sample categories and products with generated artwork images.

Usage:
    python manage.py seed_products          # add sample data (skips existing)
    python manage.py seed_products --reset  # delete all products first
"""
import random
from datetime import timedelta
from decimal import Decimal
from io import BytesIO

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageDraw

from apps.products.models import Category, Product

# (category, name, price, compare_at_price, stock, days_ago, description)
SAMPLE_PRODUCTS = [
    ("Audio", "Halo Wireless Headphones", "149.00", "189.00", 14, 2,
     "Over-ear headphones with active noise cancelling and 40-hour battery life."),
    ("Audio", "Pebble Bluetooth Speaker", "59.00", None, 3, 20,
     "Pocket-sized speaker with surprisingly deep bass. Water resistant."),
    ("Audio", "Echo Studio Earbuds", "89.00", None, 25, 40,
     "True wireless earbuds with a sleek charging case."),
    ("Audio", "Vinyl Turntable Mini", "219.00", "249.00", 0, 60,
     "Compact belt-drive turntable with built-in preamp."),
    ("Home", "Lumen Desk Lamp", "45.00", None, 30, 5,
     "Dimmable LED lamp with warm-to-cool color control."),
    ("Home", "Terra Ceramic Vase", "32.00", None, 12, 30,
     "Hand-glazed ceramic vase with a matte, earthy finish."),
    ("Home", "Cloud Linen Throw", "68.00", "85.00", 8, 9,
     "Soft washed-linen blanket for sofa or bed."),
    ("Home", "Orbit Wall Clock", "54.00", None, 4, 75,
     "Silent minimalist wall clock in powder-coated steel."),
    ("Accessories", "Nomad Leather Wallet", "39.00", None, 40, 15,
     "Slim full-grain leather wallet with six card slots."),
    ("Accessories", "Arc Sunglasses", "75.00", "95.00", 18, 3,
     "Polarized lenses in a lightweight acetate frame."),
    ("Accessories", "Transit Backpack", "129.00", None, 2, 50,
     "Weatherproof 20L backpack with a padded laptop sleeve."),
    ("Accessories", "Loop Canvas Tote", "24.00", None, 60, 90,
     "Heavy-duty organic canvas tote bag."),
    ("Stationery", "Grid Notebook A5", "16.00", None, 80, 1,
     "Lay-flat dotted notebook with 160 pages of thick paper."),
    ("Stationery", "Brass Fountain Pen", "58.00", None, 9, 25,
     "Solid brass fountain pen that develops a unique patina."),
    ("Stationery", "Desk Organizer Set", "36.00", "44.00", 15, 45,
     "Modular trays for pens, notes and small tools."),
    ("Stationery", "Watercolor Postcards", "12.00", None, 0, 100,
     "Pack of 12 illustrated postcards printed on recycled card."),
]

PALETTES = [
    ("#1f1c2c", "#928dab"), ("#ff6b6b", "#ffd93d"), ("#0f2027", "#2c5364"),
    ("#c6ffdd", "#fbd786"), ("#232526", "#d4ff3f"), ("#ee9ca7", "#ffdde1"),
    ("#141e30", "#ff7a59"), ("#e0eafc", "#cfdef3"),
]


def make_artwork(seed_text):
    """Generate a simple abstract image (gradient + circles) for a product."""
    rng = random.Random(seed_text)
    color_a, color_b = rng.choice(PALETTES)
    size = (1000, 1250)

    mask = Image.linear_gradient("L").resize(size)
    image = Image.composite(Image.new("RGB", size, color_a), Image.new("RGB", size, color_b), mask)

    draw = ImageDraw.Draw(image)
    radius = rng.randint(220, 340)
    cx = rng.randint(radius, size[0] - radius)
    cy = rng.randint(radius, size[1] - radius)
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill="#f5f1e8")
    small = radius // 3
    draw.ellipse((cx + radius - small, cy - radius, cx + radius + small, cy - radius + 2 * small), fill=color_a)

    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    return ContentFile(buffer.getvalue(), name="seed.jpg")


class Command(BaseCommand):
    help = "Create sample categories and products."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete all products and categories first.")

    @transaction.atomic
    def handle(self, *args, **options):
        if options["reset"]:
            Product.objects.all().delete()
            Category.objects.all().delete()
            self.stdout.write("Deleted existing products and categories.")

        created = 0
        for category_name, name, price, compare_at, stock, days_ago, description in SAMPLE_PRODUCTS:
            if Product.objects.filter(name=name).exists():
                continue

            category, _ = Category.objects.get_or_create(name=category_name)
            product = Product(
                category=category,
                name=name,
                description=description,
                price=Decimal(price),
                compare_at_price=Decimal(compare_at) if compare_at else None,
                stock=stock,
            )
            product.image = make_artwork(name)
            product.save()

            # Spread creation dates so "New" badges and "Newest" sorting look realistic
            Product.objects.filter(pk=product.pk).update(
                created_at=timezone.now() - timedelta(days=days_ago)
            )
            created += 1

        self.stdout.write(self.style.SUCCESS(f"Created {created} products."))