from datetime import datetime, time, timedelta

from django import template
from django.db.models import Count
from django.db.models.functions import TruncDate
from django.utils import timezone
from django.urls import reverse
from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib.contenttypes.models import ContentType
from apps.accounts.models import Customer
from apps.orders.models import Order
from apps.products.models import Category, Product
from apps.products.services import categories_with_products, visible_products


register = template.Library()

OPEN_ORDER_STATUSES = (
    Order.Status.PENDING,
    Order.Status.CONFIRMED,
    Order.Status.SHIPPED,
)

STORE_ORDER = (
    ("orders", "order"),
    ("products", "product"),
    ("products", "category"),
    ("accounts", "customer"),
)


@register.simple_tag(takes_context=True)
def bazario_admin_navigation(context):
    """Build the visible store links from Django's permission-filtered menu."""
    current_path = context["request"].path
    links = {}

    for app in context["available_apps"]:
        app_label = app["app_label"]

        for model in app["models"]:
            model_name = model["object_name"].lower()
            if app_label == "auth" and model_name in {"user", "group"}:
                continue

            list_url = model.get("admin_url")
            url = list_url or model.get("add_url")
            if not url:
                continue

            active = ""
            if current_path == url:
                active = "page"
            elif list_url and current_path.startswith(list_url):
                active = "location"

            links[(app_label, model_name)] = {
                "label": model["name"],
                "url": url,
                "active": active,
                "icon": model_name,
            }

    ordered = [links.pop(key) for key in STORE_ORDER if key in links]
    if context["request"].user.has_perm("products.view_product") or context["request"].user.has_perm("products.change_product"):
        url = reverse("bazario_promotions")
        ordered.append({"label": "Promotions", "url": url, "icon": "promotion",
                        "active": "page" if current_path == url else ""})
    return ordered + list(links.values())


@register.simple_tag
def bazario_dashboard_totals(app_list):
    """Show counts for the admin lists the current user can read."""
    readable_urls = {
        model["model"]: model["admin_url"]
        for app in app_list
        for model in app["models"]
        if model["admin_url"]
    }

    metrics = (
        (
            Order,
            "order",
            "Open orders",
            "Awaiting completion",
            Order.objects.filter(status__in=OPEN_ORDER_STATUSES),
        ),
        (Product, "product", "Active products", "Visible in the shop", visible_products()),
        (Category, "category", "Categories", "Collections in the catalog", Category.objects.all()),
        (
            Customer,
            "customer",
            "Registered customers",
            "Storefront accounts",
            Customer.objects.filter(is_staff=False, is_superuser=False),
        ),
    )

    return [
        {
            "icon": icon,
            "label": label,
            "detail": detail,
            "value": queryset.count(),
            "url": readable_urls[model],
        }
        for model, icon, label, detail, queryset in metrics
        if model in readable_urls
    ]


@register.simple_tag
def bazario_order_overview(app_list):
    """Return order activity and queue counts for staff with Orders access."""
    can_read_orders = any(
        model["model"] is Order and model["admin_url"]
        for app in app_list
        for model in app["models"]
    )
    if not can_read_orders:
        return None

    zone = timezone.get_current_timezone()
    today = timezone.localdate()
    first_day = today - timedelta(days=27)
    tomorrow = today + timedelta(days=1)

    daily_counts = dict(
        Order.objects.filter(
            created_at__gte=datetime.combine(first_day, time.min, tzinfo=zone),
            created_at__lt=datetime.combine(tomorrow, time.min, tzinfo=zone),
        )
        .order_by()
        .annotate(day=TruncDate("created_at", tzinfo=zone))
        .values("day")
        .annotate(total=Count("pk"))
        .values_list("day", "total")
    )

    periods = []
    for key, days, step in (("week", 7, 1), ("month", 28, 7)):
        start = tomorrow - timedelta(days=days)
        bars = []

        for offset in range(0, days, step):
            day = start + timedelta(days=offset)
            count = sum(
                daily_counts.get(day + timedelta(days=index), 0)
                for index in range(step)
            )
            bars.append({
                "label": day.strftime("%a" if step == 1 else "%b %d"),
                "count": count,
            })

        peak = max(1, max(bar["count"] for bar in bars))
        for bar in bars:
            bar["percent"] = round(100 * bar["count"] / peak)

        periods.append({
            "key": key,
            "bars": bars,
            "total": sum(bar["count"] for bar in bars),
        })

    open_counts = dict(
        Order.objects.filter(status__in=OPEN_ORDER_STATUSES)
        .order_by()
        .values("status")
        .annotate(total=Count("pk"))
        .values_list("status", "total")
    )

    open_total = max(1, sum(open_counts.values()))
    queue = [
        {
            "label": status.label,
            "status": status.value,
            "count": open_counts.get(status.value, 0),
            "percent": round(100 * open_counts.get(status.value, 0) / open_total),
        }
        for status in OPEN_ORDER_STATUSES
    ]

    recent_orders = list(
        Order.objects.order_by("-created_at", "-pk")
        .prefetch_related("items")[:5]
    )

    return {
        "periods": periods,
        "queue": queue,
        "recent_orders": recent_orders,
    }
@register.simple_tag
def bazario_category_storefront():
    """Return the same categories and counts the public shop uses."""
    categories = list(categories_with_products(include_empty=True))
    populated = sum(category.product_count > 0 for category in categories)
    return {
        "categories": categories,
        "total": len(categories),
        "populated": populated,
        "waiting": len(categories) - populated,
        "products": sum(category.product_count for category in categories),
    }

@register.inclusion_tag("admin/dashboard_activity.html", takes_context=True)
def bazario_dashboard_activity(context, overview):
    menu = {
        (app["app_label"], item["object_name"].lower()): item
        for app in context["app_list"]
        for item in app["models"]
    }
    readable = [
        menu[key]["model"]
        for key in STORE_ORDER
        if key in menu and menu[key].get("admin_url")
    ]
    tabs = [{"key": "all", "label": "All"}] + [
        {
            "key": model._meta.model_name,
            "label": model._meta.verbose_name_plural.title(),
        }
        for model in readable
    ]

    query = context["request"].GET
    selected = query.get("activity", "all")
    if selected not in {tab["key"] for tab in tabs}:
        selected = "all"

    days = query.get("days", "30")
    if days not in {"7", "30", "90"}:
        days = "30"

    content_types = ContentType.objects.get_for_models(
        *readable, for_concrete_models=False
    )
    icons = {
        content_type.pk: model._meta.model_name
        for model, content_type in content_types.items()
        if selected in {"all", model._meta.model_name}
    }
    updates = LogEntry.objects.filter(
        content_type_id__in=icons.keys(),
        action_time__gte=timezone.now() - timedelta(days=int(days)),
    ).order_by("-action_time", "-pk")[:6]

    verbs = {ADDITION: "Added", CHANGE: "Edited", DELETION: "Deleted"}
    rows = [
        {
            "name": entry.object_repr,
            "state": verbs.get(entry.action_flag, "Updated"),
            "icon": icons[entry.content_type_id],
            "time": entry.action_time,
            "day": timezone.localdate(entry.action_time),
        }
        for entry in updates
    ]

    actions = []
    for key, label, url_key in (
        (("products", "product"), "Add product", "add_url"),
        (("products", "category"), "Add category", "add_url"),
        (("orders", "order"), "Review orders", "admin_url"),
    ):
        url = menu.get(key, {}).get(url_key)
        if url:
            actions.append({"label": label, "icon": key[1], "url": url})

    return {
        "show_activity": bool(readable),
        "rows": rows,
        "tabs": tabs,
        "selected": selected,
        "days": days,
        "periods": ("7", "30", "90"),
        "actions": actions,
        "overview": overview,
    }
@register.simple_tag
def bazario_store_pulse():
    """Small live numbers for the admin menu: open orders badge + products in the shop."""
    return {
        "open_orders": Order.objects.filter(status__in=OPEN_ORDER_STATUSES).count(),
        "products": visible_products().count(),
    }

@register.simple_tag
def bazario_order_counts():
    """Orders per status for the Orders page header."""
    rows = Order.objects.values("status").annotate(total=Count("id"))
    counts = {row["status"]: row["total"] for row in rows}
    return [
        {"status": status, "label": label, "count": counts.get(status, 0)}
        for status, label in (
            (Order.Status.PENDING, "Pending"),
            (Order.Status.CONFIRMED, "Confirmed"),
            (Order.Status.SHIPPED, "On the way"),
            (Order.Status.DELIVERED, "Delivered"),
        )
    ]