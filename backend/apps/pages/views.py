"""Serve the frontend HTML pages from frontend/pages/."""
from django.shortcuts import get_object_or_404, render
from django.db.models import Q
from django.http import Http404
from django.shortcuts import redirect
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.csrf import ensure_csrf_cookie
from django.contrib.auth.decorators import login_required
from apps.orders.models import Order
from apps.orders.item_edits import reduce_pending_items
from apps.orders.cancellations import request_cancellation
from apps.orders.services import OrderError
from apps.orders.serializers import CheckoutSerializer
from django.utils import timezone
from apps.orders.services import timeline
from apps.orders.views import SESSION_ORDERS, can_see
from django.contrib import messages
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.forms import PasswordChangeForm
from django.views.decorators.debug import sensitive_post_parameters
from apps.products.services import (
    categories_with_products,
    product_position,
    related_products,
    visible_products,
)
from django.db import transaction
from django.views.decorators.http import require_http_methods, require_POST
from apps.orders.services import cancel_order
from apps.accounts.forms import UsernameForm
from apps.accounts.models import CustomerProfile
from django.db import IntegrityError
from django.core.paginator import Paginator
from django.db.models import Prefetch
@ensure_csrf_cookie  # gives the browser a CSRF token so JS can safely POST later
def home(request):
    return render(request, "index.html")

@ensure_csrf_cookie
def shop(request):
    categories = categories_with_products(include_empty=True)
    products = visible_products().order_by("-created_at", "-id")
    slug = request.GET.get("category", "").strip()

    selected_category = None
    category_page = None

    if slug:
        selected_category = get_object_or_404(categories, slug=slug)
        category_products = products.filter(category=selected_category)
        category_page = Paginator(category_products, 12).get_page(request.GET.get("page"))
        groups = [(selected_category, category_page.object_list)]
    else:
        shelves = categories.prefetch_related(
            Prefetch("products", queryset=products[:8], to_attr="shop_preview")
        )
        groups = [(category, category.shop_preview) for category in shelves]

    return render(request, "shop.html", {
        "groups": groups,
        "product_count": sum(category.product_count for category, _ in groups),
        "selected_category": selected_category,
        "category_page": category_page,
    })

@ensure_csrf_cookie
def product_detail(request, slug):
    """Product page. Shows 'Page not found' if the product doesn't exist or is hidden."""
    product = get_object_or_404(visible_products(), slug=slug)
    position, total = product_position(product)
    return render(request, "product.html", {
        "product": product,
        "position": position,            # e.g. 2  → "№ 02"
        "total": total,                  # e.g. 16 → "of 16"
        "related": related_products(product),
    })

@ensure_csrf_cookie
def cart(request):
    """The basket page. The items are loaded by JavaScript from /api/cart/."""
    return render(request, "cart.html")

@login_required
@ensure_csrf_cookie
def checkout(request):
    """Show checkout to signed-in customers."""
    return render(request, "checkout.html")

@ensure_csrf_cookie
def order_done(request, number):
    """
    The Done page after placing an order. Only the browser that placed it
    (or the customer it belongs to) can see it; anyone else gets 404.
    """
    order = (
        Order.objects.filter(number__iexact=number)
        .prefetch_related("items__product")
        .first()
    )
    if order is None or not can_see(request, order):
        raise Http404("Order not found")
    return render(request, "done.html", {"order": order})

MAX_ORDERS = 20   # most orders shown in "Your orders"


@ensure_csrf_cookie
def orders_list(request):
    """
    Your orders: the ones placed (or found by number + phone) in this browser,
    plus the logged-in customer's own orders (accounts come on Day 4).
    """
    mine = Q(number__in=request.session.get(SESSION_ORDERS, []))
    if request.user.is_authenticated:
        mine |= Q(user=request.user)

    orders = Order.objects.filter(mine).prefetch_related("items__product")[:MAX_ORDERS]
    return render(request, "orders.html", {"orders": orders})


@ensure_csrf_cookie
@require_http_methods(["GET", "HEAD", "POST"])
def order_detail(request, number):
    """Allow tracking access to read, and only the buyer to edit delivery."""
    order = (
        Order.objects.filter(number__iexact=number)
        .prefetch_related("items__product", "events")
        .first()
    )
    if order is None or not can_see(request, order):
        raise Http404("Order not found")
    context = {"order": order, "timeline": timeline(order)}
    is_buyer = request.user.is_authenticated and order.user_id == request.user.pk
    if is_buyer and order.status == Order.Status.PENDING:
        context.update(delivery_values=order, delivery_version=order.updated_at.isoformat())

    if request.method == "POST":
        if not is_buyer:
            raise Http404("Order not found")
        if request.POST.get("action") == "request_cancellation":
            try:
                created = request_cancellation(order, request.user)
            except OrderError as error:
                messages.warning(request, str(error))
            else:
                if created:
                    messages.success(request, "Your cancellation request has been sent.")
                else:
                    messages.info(request, "You have already requested cancellation for this order.")
            return redirect("order-page", number=order.number)
        if request.POST.get("action") == "edit_items":
            try:
                quantities = {}
                for key, values in request.POST.lists():
                    if key.startswith("keep_"):
                        if len(values) != 1 or not values[0].isascii() or not values[0].isdecimal() or len(values[0]) > 10:
                            raise OrderError("Enter a whole quantity for each product.")
                        quantities[key[5:]] = int(values[0])
                reduce_pending_items(order, request.user, request.POST.get("version"), quantities)
            except OrderError as error:
                messages.warning(request, str(error))
            else:
                messages.success(request, "Your order items and total have been updated.")
            return redirect("order-page", number=order.number)

        if order.status != Order.Status.PENDING:
            messages.warning(request, f"Your order is now {order.get_status_display().lower()}. Delivery details are closed for editing.")
            return redirect("order-page", number=order.number)

        if request.POST.get("delivery_version") != order.updated_at.isoformat():
            messages.warning(request, "This order was updated. Review the latest details before editing again.")
            return redirect("order-page", number=order.number)

        details = CheckoutSerializer(data=request.POST)
        if details.is_valid():
            # Check again in the write itself, in case staff confirmed the order
            # or another tab saved changes after the page was loaded.
            updated = Order.objects.filter(
                pk=order.pk, user=request.user, status=Order.Status.PENDING,
                updated_at=order.updated_at,
            ).update(**details.validated_data, updated_at=timezone.now())
            if updated:
                messages.success(request, "Your delivery details have been updated.")
            else:
                messages.warning(request, "This order changed before your edit could be saved. Review its latest details.")
            return redirect("order-page", number=order.number)

        context.update(delivery_values=request.POST, delivery_errors=details.errors)

    return render(request, "order.html", context)

def safe_next(request, default="/orders/"):
    """
    Where to go after logging in (?next=/checkout/). Only addresses on THIS
    site are allowed, so a bad link can't send people to another website.
    """
    target = request.GET.get("next") or ""
    if url_has_allowed_host_and_scheme(target, allowed_hosts={request.get_host()}, require_https=request.is_secure()):
        return target
    return default


@ensure_csrf_cookie
def account(request, side="login"):
    """Log in / Sign up: one page, two sides of the flip card."""
    if request.user.is_authenticated:
        return redirect(safe_next(request))   # already logged in
    return render(request, "auth.html", {"side": side, "next": safe_next(request)})

@sensitive_post_parameters("old_password", "new_password1", "new_password2")
@login_required
@ensure_csrf_cookie
def profile(request):
    customer_profile = getattr(request.user, "customer_profile", None)
    data = request.POST if request.method == "POST" else None
    editing_username = data is not None and data.get("action") == "username"

    username_form = UsernameForm(
        data=data if editing_username else None,
        initial={"username": customer_profile.username if customer_profile else ""},
    )

    password_form = PasswordChangeForm(
        request.user,
        data=None if editing_username else data,
    )
    password_form.fields["old_password"].label = "Current password"
    password_form.fields["old_password"].widget.attrs.pop("autofocus", None)
    if editing_username and username_form.is_valid():
        try:
            CustomerProfile.objects.update_or_create(
                user=request.user,
                defaults={"username": username_form.cleaned_data["username"]},
            )
        except IntegrityError:
            username_form.add_error("username", "That username is already taken.")
        else:
            messages.success(request, "Your username has been updated.")
            return redirect("profile-page")

    if data is not None and not editing_username and password_form.is_valid():
        user = password_form.save()
        update_session_auth_hash(request, user)
        messages.success(request, "Your password has been updated.")
        return redirect("profile-page")

    return render(request, "profile.html", {
        "customer_profile": customer_profile,
        "username_form": username_form,
        "password_form": password_form,
    })
@login_required
@require_POST
@transaction.atomic
def cancel_pending_order(request, number):
    order = get_object_or_404(
        Order.objects.select_for_update(),
        number__iexact=number,
        user=request.user,
    )

    if order.status == Order.Status.PENDING:
        cancel_order(order)
        messages.success(request, "Your order has been cancelled.")
    elif order.status == Order.Status.CANCELLED:
        messages.info(request, "This order is already cancelled.")
    else:
        messages.warning(
            request,
            f"Your order is now {order.get_status_display().lower()}. "
            "Check the latest cancellation options on your order page.",
        )

    return redirect("order-page", number=order.number)
