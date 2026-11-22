"""
Accounts: sign up, log in, log out, on Django's built-in User table.

The email is stored (lowercase) as the username, so customers log in with
their email. Passwords are hashed by Django and checked against the
AUTH_PASSWORD_VALIDATORS rules in settings.
"""
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

from apps.orders.models import Order
from apps.accounts.models import CustomerProfile
from apps.orders.views import SESSION_ORDERS

User = get_user_model()

# Same message for a wrong email OR a wrong password: nothing to learn from it
WRONG_LOGIN = "We couldn't log you in with those details. Please try again."


class AccountError(Exception):
    """A sign up / log in problem. The message is shown to the customer."""

    def __init__(self, message, field=None):
        super().__init__(message)
        self.field = field   # which form field it belongs to (or None)


def normalize_email(email):
    """' Sara@Mail.COM ' → 'sara@mail.com'"""
    return (email or "").strip().lower()


def sign_up(request, *, full_name, email, password):
    """Create an account, log it in, and attach this browser's guest orders."""
    email = normalize_email(email)
    if User.objects.filter(username=email).exists():
        raise AccountError("An account with this email already exists. Try logging in.", field="email")

    first_name, _, last_name = full_name.strip().partition(" ")
    user = User(username=email, email=email, first_name=first_name[:150], last_name=last_name.strip()[:150])

    try:
        validate_password(password, user)   # Django's 4 rules (length, common, numeric, too similar)
    except ValidationError as error:
        raise AccountError(" ".join(error.messages), field="password")

    user.set_password(password)   # stored hashed, never as plain text
    user.save()
    _start_session(request, user, remember=True)
    return user


def log_in(request, *, identifier, password, remember=True):
    """Log in with an email or profile username."""
    identifier = identifier.strip()

    if "@" in identifier and not identifier.startswith("@"):
        login_name = normalize_email(identifier)
    else:
        handle = identifier.removeprefix("@")
        try:
            login_name = (
                CustomerProfile.objects.exclude(username="")
                .values_list("user__username", flat=True)
                .get(username__iexact=handle)
            )
        except (CustomerProfile.DoesNotExist, CustomerProfile.MultipleObjectsReturned):
            login_name = ""

    user = authenticate(request, username=login_name, password=password)
    if not login_name or user is None or not user.is_active:
        raise AccountError(WRONG_LOGIN)

    _start_session(request, user, remember=remember)
    return user




def log_out(request):
    logout(request)


def display_name(user):
    """The name shown in the navbar: first name, or the start of the email."""
    return user.first_name or user.email.split("@")[0]


# ---------------------------------------------------------------- helpers
def _start_session(request, user, remember):
    guest_orders = list(request.session.get(SESSION_ORDERS, []))
    login(request, user)              # new session id (stops session fixation); basket is kept
    if not remember:
        request.session.set_expiry(0)  # ends when the browser closes
    claim_guest_orders(user, guest_orders)


def claim_guest_orders(user, numbers):
    """Link guest orders from this browser to the account (only unclaimed ones)."""
    if numbers:
        Order.objects.filter(number__in=numbers, user__isnull=True).update(user=user)