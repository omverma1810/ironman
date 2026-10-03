from django.urls import path

from analytics import views

urlpatterns = [
    path("analytics/data-quality", views.DataQualityView.as_view(), name="analytics-data-quality"),
    path(
        "analytics/apartments",
        views.ApartmentPerformanceView.as_view(),
        name="analytics-apartments",
    ),
    path("analytics/channels", views.ChannelPerformanceView.as_view(), name="analytics-channels"),
    path(
        "analytics/unit-economics",
        views.UnitEconomicsView.as_view(),
        name="analytics-unit-economics",
    ),
    path(
        "analytics/operations",
        views.OperationsDailyView.as_view(),
        name="analytics-operations",
    ),
    path("analytics/checkpoint", views.CheckpointView.as_view(), name="analytics-checkpoint"),
    path("analytics/weekly", views.WeeklyMetricsView.as_view(), name="analytics-weekly"),
    path("analytics/weekly/export.pdf", views.WeeklyPdfView.as_view(), name="analytics-weekly-pdf"),
    path(
        "analytics/weekly/export.xlsx",
        views.WeeklyExcelView.as_view(),
        name="analytics-weekly-xlsx",
    ),
    path(
        "analytics/weekly/<str:key>/rows",
        views.MetricRowsView.as_view(),
        name="analytics-metric-rows",
    ),
    path(
        "analytics/weekly/<str:key>/export.csv",
        views.MetricCsvView.as_view(),
        name="analytics-metric-csv",
    ),
]
