from django.urls import path
from rest_framework.routers import DefaultRouter

from growth import views

router = DefaultRouter()
router.register("growth/feedback", views.FeedbackViewSet, basename="feedback")
router.register("growth/partners", views.ReferralPartnerViewSet, basename="referral-partner")
router.register("growth/referral-codes", views.ReferralCodeViewSet, basename="referral-code")

urlpatterns = [
    path(
        "growth/referral-codes/validate",
        views.ReferralCodeValidateView.as_view(),
        name="referral-code-validate",
    ),
] + router.urls
