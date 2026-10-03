from django.conf import settings
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
    path("identity/staff", views.StaffListView.as_view(), name="staff-list"),
    path("identity/audit", views.AuditLogView.as_view(), name="audit-log"),
    path("identity/team", views.TeamView.as_view(), name="team"),
    path("identity/team/invites", views.TeamInviteView.as_view(), name="team-invite"),
    path(
        "identity/team/invites/<uuid:invite_id>",
        views.TeamInviteRevokeView.as_view(),
        name="team-invite-revoke",
    ),
    path("identity/team/<uuid:user_id>/role", views.TeamRoleView.as_view(), name="team-role"),
    path(
        "identity/team/<uuid:user_id>/deactivate",
        views.TeamDeactivateView.as_view(),
        name="team-deactivate",
    ),
    path(
        "identity/team/<uuid:user_id>/reactivate",
        views.TeamReactivateView.as_view(),
        name="team-reactivate",
    ),
    path("identity/audit/export.csv", views.AuditLogExportView.as_view(), name="audit-export"),
]

if settings.IRONMAN.get("EXPOSE_OTP_DEBUG_ENDPOINT"):
    urlpatterns.append(path("auth/otp/debug", views.OtpDebugView.as_view(), name="otp-debug"))
