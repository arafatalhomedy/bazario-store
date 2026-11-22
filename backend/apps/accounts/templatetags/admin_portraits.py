from django import template
from django.urls import reverse

from apps.accounts.models import AdminAvatar

register = template.Library()


@register.simple_tag(takes_context=True)
def admin_photo_url(context):
    request = context["request"]
    if not hasattr(request, "_bazario_photo_url"):
        exists = AdminAvatar.objects.filter(user_id=request.user.pk).exists()
        request._bazario_photo_url = reverse("bazario_admin_photo") if exists else ""
    return request._bazario_photo_url
