"""Main URL routing: admin, API and frontend pages."""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from apps.accounts import admin_profile
from apps.products.promotions import promotions

urlpatterns = [
    path(f"{settings.ADMIN_URL}promotions/", admin.site.admin_view(promotions), name="bazario_promotions"),
    path(f"{settings.ADMIN_URL}profile/", admin.site.admin_view(admin_profile.profile), name="bazario_admin_profile"),
    path(f"{settings.ADMIN_URL}profile/photo/", admin.site.admin_view(admin_profile.photo), name="bazario_admin_photo"),
    path(settings.ADMIN_URL, admin.site.urls),
    path("api/", include("apps.products.urls")),
    path("api/", include("apps.cart.urls")),
    path("api/", include("apps.orders.urls")),
    path("api/", include("apps.accounts.urls")),
    path("", include("apps.pages.urls")),
]

if settings.DEBUG:
    # Serve uploaded product images during development
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
