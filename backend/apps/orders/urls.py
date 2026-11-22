from django.urls import path

from . import views

urlpatterns = [
    path("orders/", views.OrderCreateView.as_view(), name="order-create"),
    # "track/" must come BEFORE "<number>/", or "track" would be read as an order number
    path("orders/track/", views.OrderTrackView.as_view(), name="order-track"),
    path("orders/<str:number>/", views.OrderDetailView.as_view(), name="order-detail"),
]