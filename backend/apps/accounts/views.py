"""
Accounts API.

POST /api/account/login/    log in (email + password)
POST /api/account/signup/   create an account
POST /api/account/logout/   log out
GET  /api/account/me/       who is logged in (+ details for checkout autofill)
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.cart.permissions import CsrfProtected

from .serializers import LoginSerializer, SignupSerializer
from .services import AccountError, display_name, log_in, log_out, sign_up


class AuthView(APIView):
    """Shared by log in and sign up: CSRF check + 10 tries a minute."""

    permission_classes = [CsrfProtected]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def problem(self, error):
        return Response({"detail": str(error), "field": error.field}, status=status.HTTP_400_BAD_REQUEST)


class LoginView(AuthView):
    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            user = log_in(request, **data.validated_data)
        except AccountError as error:
            return self.problem(error)
        return Response(me_data(user))


class SignupView(AuthView):
    def post(self, request):
        data = SignupSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            user = sign_up(request, **data.validated_data)
        except AccountError as error:
            return self.problem(error)
        return Response(me_data(user), status=status.HTTP_201_CREATED)


class LogoutView(APIView):
    permission_classes = [CsrfProtected]

    def post(self, request):
        log_out(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        if not request.user.is_authenticated:
            return Response({"authenticated": False})
        return Response(me_data(request.user))


def me_data(user):
    """The logged-in customer, plus the delivery details of their last order (for autofill)."""
    last = user.orders.order_by("-created_at").first()
    return {
        "authenticated": True,
        "name": display_name(user),
        "full_name": user.get_full_name(),
        "email": user.email,
        "delivery": {
            "phone": last.phone,
            "city": last.city,
            "street": last.street,
        } if last else None,
    }