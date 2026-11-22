from django import forms


class UsernameForm(forms.Form):
    username = forms.RegexField(
        regex=r"\A[A-Za-z0-9_]{3,24}\Z",
        max_length=24,
        help_text="Use 3–24 letters, numbers, or underscores.",
        error_messages={"invalid": "Use 3–24 letters, numbers, or underscores."},
    )