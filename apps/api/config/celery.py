import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("ironman")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.task_routes = {
    "notifications.tasks.*": {"queue": "notify"},
    "analytics.tasks.*": {"queue": "rollup"},
    "platform_core.tasks.export_*": {"queue": "reports"},
}
