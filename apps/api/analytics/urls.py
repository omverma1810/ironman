from django.urls import path

from analytics import views

urlpatterns = [
    path("analytics/weekly", views.WeeklyMetricsView.as_view(), name="analytics-weekly"),
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
