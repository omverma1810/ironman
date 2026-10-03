from django.urls import path
from rest_framework.routers import DefaultRouter

from growth import views

router = DefaultRouter()
router.register("growth/feedback", views.FeedbackViewSet, basename="feedback")
router.register("growth/partners", views.ReferralPartnerViewSet, basename="referral-partner")
router.register("growth/attributions", views.AttributionViewSet, basename="attribution")
router.register("growth/referral-codes", views.ReferralCodeViewSet, basename="referral-code")
router.register("growth/commission-rules", views.CommissionRuleViewSet, basename="commission-rule")
router.register(
    "growth/commission-accruals", views.CommissionAccrualViewSet, basename="commission-accrual"
)
router.register("growth/settlements", views.SettlementViewSet, basename="settlement")
router.register("growth/campaigns", views.CampaignViewSet, basename="campaign")
router.register("growth/spend", views.SpendViewSet, basename="spend")
router.register(
    "growth/customer-referral-rewards",
    views.CustomerReferralRewardViewSet,
    basename="customer-referral-reward",
)

urlpatterns = [
    path("growth/lapsed-customers", views.LapsedCustomersView.as_view(), name="lapsed-customers"),
    path(
        "growth/campaigns/lapsed/send",
        views.ReengagementSendView.as_view(),
        name="reengagement-send",
    ),
    path(
        "growth/acquisition-cost",
        views.AcquisitionCostView.as_view(),
        name="acquisition-cost",
    ),
    path("growth/my-referral", views.MyReferralView.as_view(), name="my-referral"),
    path("growth/referral-program", views.ReferralProgramView.as_view(), name="referral-program"),
    path(
        "growth/referral-codes/validate",
        views.ReferralCodeValidateView.as_view(),
        name="referral-code-validate",
    ),
] + router.urls
