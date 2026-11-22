"""Accounts serializers: check what the Log in / Sign up forms send."""
from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField(
        max_length=150,
        required=False,
        error_messages={"blank": "Enter your email or username."},
    )
    email = serializers.EmailField(required=False)
    password = serializers.CharField(
        max_length=128,
        trim_whitespace=False,
        error_messages={"blank": "Enter your password."},
    )
    remember = serializers.BooleanField(default=True)

    def validate(self, attrs):
        email = attrs.pop("email", None)
        if "identifier" not in attrs:
            if not email:
                raise serializers.ValidationError({
                    "identifier": "Enter your email or username.",
                })
            attrs["identifier"] = email
        return attrs



class SignupSerializer(serializers.Serializer):
    full_name = serializers.CharField(
        min_length=2, max_length=100,
        error_messages={"blank": "Enter your full name.", "min_length": "Enter your full name."},
    )
    email = serializers.EmailField(
        max_length=150,
        error_messages={"invalid": "Enter a valid email address.", "blank": "Enter your email."},
    )
    password = serializers.CharField(max_length=128, trim_whitespace=False, error_messages={"blank": "Choose a password."})