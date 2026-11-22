from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render


class CatalogDemoMiddleware:
    """Permit browsing and a cookie-backed basket. Keep account and order data out of the demo."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path_info.strip("/").split("/")
        admin = "/" + settings.ADMIN_URL.strip("/")
        if request.path_info.rstrip("/") == admin or request.path_info.startswith(admin + "/"):
            return render(request, "catalog_preview.html", status=403)
        if path[0] in {"checkout", "orders", "account", "track", "login", "signup"}:
            return render(request, "catalog_preview.html")
        if path[:2] in (["api", "orders"], ["api", "account"]) and path != ["api", "account", "me"]:
            return JsonResponse({"detail": "This catalog demo is open for browsing only."}, status=403)
        return self.get_response(request)
