from rest_framework.routers import DefaultRouter

from customers import views

router = DefaultRouter()
router.register("customers", views.CustomerViewSet, basename="customer")
router.register("customer-addresses", views.AddressViewSet, basename="customer-address")
router.register("customer-consents", views.ConsentRecordViewSet, basename="customer-consent")
router.register("customer-notes", views.CustomerNoteViewSet, basename="customer-note")

urlpatterns = router.urls
