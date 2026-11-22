"""Local development settings."""
from .base import *  # noqa: F401,F403
from .base import ALLOWED_HOSTS, REST_FRAMEWORK, SECRET_KEY

DEBUG = True
SECRET_KEY = SECRET_KEY or "dev-only-insecure-key-do-not-use-in-production"
ALLOWED_HOSTS = ALLOWED_HOSTS or ["localhost", "127.0.0.1"]

# Browsable API pages are handy while developing
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}

# Emails are printed in the terminal instead of being sent
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"