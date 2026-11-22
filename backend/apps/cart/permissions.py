"""
Security: CSRF check for EVERY visitor, not only logged-in ones.

Django REST Framework only checks the CSRF token for logged-in users, but our
customers shop as guests. Without this, another website could change a
customer's basket in the background. Reading (GET) changes nothing, so it is
always allowed.
"""
from rest_framework.authentication import CSRFCheck
from rest_framework.permissions import SAFE_METHODS, BasePermission


def _no_response(request):
    return None   # CSRFCheck needs a "next step" function; we only want its check


class CsrfProtected(BasePermission):
    message = "Security check failed. Please refresh the page and try again."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:   # GET, HEAD, OPTIONS
            return True

        django_request = request._request          # the original Django request
        check = CSRFCheck(_no_response)
        check.process_request(django_request)       # reads the CSRF cookie
        problem = check.process_view(django_request, None, (), {})
        return problem is None                      # no problem = token is valid