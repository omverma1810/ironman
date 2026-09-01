from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from identity import views

urlpatterns = [
    path("auth/otp/request", views.OtpRequestView.as_view(), name="otp-request"),
    path("auth/otp/verify", views.OtpVerifyView.as_view(), name="otp-verify"),
    path("auth/login", views.StaffLoginView.as_view(), name="staff-login"),
    path("auth/logout", views.LogoutView.as_view(), name="logout"),
    path("auth/refresh", TokenRefreshView.as_view(), name="token-refresh"),
    path(
        "auth/email/verify/request",
        views.EmailVerifyRequestView.as_view(),
        name="email-verify-request",
    ),
    path(
        "auth/email/verify/confirm",
        views.EmailVerifyConfirmView.as_view(),
        name="email-verify-confirm",
    ),
    path(
        "auth/password/reset/request",
        views.PasswordResetRequestView.as_view(),
        name="password-reset-request",
    ),
    path(
        "auth/password/reset/confirm",
        views.PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("auth/mfa/enroll", views.MfaEnrollView.as_view(), name="mfa-enroll"),
    path("auth/mfa/verify", views.MfaVerifyView.as_view(), name="mfa-verify"),
    path("auth/invite/accept", views.StaffInviteAcceptView.as_view(), name="staff-invite-accept"),
    path("me", views.MeView.as_view(), name="me"),
]
