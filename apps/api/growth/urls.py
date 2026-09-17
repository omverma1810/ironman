from rest_framework.routers import DefaultRouter

from growth import views

router = DefaultRouter()
router.register("growth/feedback", views.FeedbackViewSet, basename="feedback")

urlpatterns = router.urls
