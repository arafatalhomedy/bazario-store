from io import BytesIO

from django import forms
from django.contrib import admin, messages
from django.contrib.auth import get_user_model, update_session_auth_hash
from django.contrib.auth.forms import PasswordChangeForm, UsernameField
from django.db import IntegrityError, transaction
from django.http import HttpResponse, HttpResponseBadRequest
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.http import require_http_methods, require_safe
from PIL import Image, ImageOps

from .models import AdminAvatar


User = get_user_model()
username_field = User._meta.get_field("username")


class ProfileForm(forms.Form):
    username = UsernameField(
        max_length=username_field.max_length, validators=username_field.validators,
        label="Sign-in username", widget=forms.TextInput(attrs={"autocomplete": "username"}),
    )
    photo = forms.FileField(required=False)

    def __init__(self, user, *args, **kwargs):
        super().__init__(*args, initial={"username": user.username}, **kwargs)
        self.user = user

    def clean_username(self):
        name = self.cleaned_data["username"]
        if User.objects.exclude(pk=self.user.pk).filter(username__iexact=name).exists():
            raise forms.ValidationError("That username is already in use.")
        return name

    def clean_photo(self):
        upload = self.cleaned_data.get("photo")
        if not upload:
            return None
        if upload.size > 5 * 1024 * 1024:
            raise forms.ValidationError("Choose a photo under 5 MB.")
        try:
            with Image.open(upload, formats=("JPEG", "PNG", "WEBP")) as image:
                if image.width * image.height > 16_000_000:
                    raise forms.ValidationError("Choose a photo of 16 megapixels or fewer.")
                square = ImageOps.fit(ImageOps.exif_transpose(image).convert("RGBA"), (256, 256),
                                      method=Image.Resampling.LANCZOS)
                portrait = Image.new("RGB", square.size, "#f4f0df")
                portrait.paste(square, mask=square.getchannel("A"))
                output = BytesIO()
                portrait.save(output, format="JPEG", quality=88)
                return output.getvalue()
        except (Image.DecompressionBombError, OSError, ValueError, SyntaxError) as error:
            raise forms.ValidationError("Choose a readable JPG, PNG or WebP photo.") from error


@require_safe
def photo(request):
    avatar = get_object_or_404(AdminAvatar, user_id=request.user.pk)
    return HttpResponse(bytes(avatar.jpeg), content_type="image/jpeg")


@sensitive_post_parameters("old_password", "new_password1", "new_password2")
@require_http_methods(["GET", "POST"])
def profile(request):
    user = request.user
    identity = ProfileForm(user)
    password = PasswordChangeForm(user)
    if request.method == "POST":
        action = request.POST.get("action")
        if action == "identity":
            identity = ProfileForm(user, request.POST, request.FILES)
            if identity.is_valid():
                name = identity.cleaned_data["username"]
                try:
                    with transaction.atomic():
                        User.objects.filter(pk=user.pk).update(username=name)
                        if identity.cleaned_data["photo"]:
                            AdminAvatar.objects.update_or_create(
                                user_id=user.pk, defaults={"jpeg": identity.cleaned_data["photo"]},
                            )
                except IntegrityError:
                    if not User.objects.exclude(pk=user.pk).filter(username__iexact=name).exists():
                        raise
                    identity.add_error("username", "That username is already in use.")
                else:
                    messages.success(request, "Your profile was saved.")
                    return redirect("bazario_admin_profile")
        elif action == "password" and user.has_usable_password():
            with transaction.atomic():
                account = User.objects.select_for_update().get(pk=user.pk)
                password = PasswordChangeForm(account, request.POST)
                if password.is_valid():
                    account = password.save(commit=False)
                    account.save(update_fields=["password"])
                    update_session_auth_hash(request, account)
                    messages.success(request, "Your password was updated.")
                    return redirect("bazario_admin_profile")
        else:
            return HttpResponseBadRequest("Unknown profile action.")
    request.current_app = admin.site.name
    return render(request, "admin/staff_profile.html", {
        **admin.site.each_context(request), "title": "My profile",
        "identity": identity, "password_form": password,
    })
