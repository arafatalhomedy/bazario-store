from datetime import timedelta

from django import forms
from django.utils import timezone


class OrderReviewForm(forms.Form):
    PRESETS = {
        "1-2": (1, 2),
        "2-3": (2, 3),
        "3-5": (3, 5),
    }

    window = forms.ChoiceField(
        label="Estimated arrival",
        initial="2-3",
        choices=[
            ("1-2", "1–2 calendar days"),
            ("2-3", "2–3 calendar days"),
            ("3-5", "3–5 calendar days"),
            ("custom", "Custom dates"),
        ],
    )
    start = forms.DateField(
        label="Earliest arrival",
        required=False,
        widget=forms.DateInput(attrs={"type": "date"}),
    )
    end = forms.DateField(
        label="Latest arrival",
        required=False,
        widget=forms.DateInput(attrs={"type": "date"}),
    )

    def clean(self):
        data = super().clean()
        window = data.get("window")
        if not window:
            return data

        today = timezone.localdate()
        if window in self.PRESETS:
            first_day, last_day = self.PRESETS[window]
            data["start"] = today + timedelta(days=first_day)
            data["end"] = today + timedelta(days=last_day)
            return data

        start = data.get("start")
        end = data.get("end")

        if not start or not end:
            raise forms.ValidationError("Choose both delivery dates.")
        if start < today:
            raise forms.ValidationError("The earliest delivery date cannot be in the past.")
        if end < start:
            raise forms.ValidationError("The latest delivery date must be on or after the earliest date.")

        return data