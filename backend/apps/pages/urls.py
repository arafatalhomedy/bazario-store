from django.urls import path
from django.views.generic import RedirectView
from django.contrib.auth.views import LogoutView
from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("products/<slug:slug>/", views.product_detail, name="product-page"),
    path("cart/", views.cart, name="cart-page"),
    path("checkout/", views.checkout, name="checkout-page"),
    path("checkout/done/<str:number>/", RedirectView.as_view(pattern_name="order-page"), name="order-done-page"),
    path("orders/", views.orders_list, name="orders-page"),
        path(
        "orders/<str:number>/cancel/",
        views.cancel_pending_order,
        name="cancel-pending-order",
    ),
    path("orders/<str:number>/", views.order_detail, name="order-page"),
    path("track/", RedirectView.as_view(pattern_name="orders-page", query_string=True)),
    path("account/login/", views.account, {"side": "login"}, name="login-page"),
    path("account/signup/", views.account, {"side": "signup"}, name="signup-page"),
    path("login/", RedirectView.as_view(pattern_name="login-page", query_string=True)),
    path("signup/", RedirectView.as_view(pattern_name="signup-page", query_string=True)),
    path("account/profile/", views.profile, name="profile-page"),
    path("account/logout/", LogoutView.as_view(next_page="home"), name="logout-page"),
    path("shop/", views.shop, name="shop-page"),
]