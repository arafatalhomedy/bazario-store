from django.urls import path

from . import views

urlpatterns = [
    path("account/login/", views.LoginView.as_view(), name="account-login"),
    path("account/signup/", views.SignupView.as_view(), name="account-signup"),
    path("account/logout/", views.LogoutView.as_view(), name="account-logout"),
    path("account/me/", views.MeView.as_view(), name="account-me"),
]