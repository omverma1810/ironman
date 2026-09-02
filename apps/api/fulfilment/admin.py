from django.contrib import admin

from fulfilment.models import Job, JobAttempt, OfflineOp, Proof, RouteDay


class JobInline(admin.TabularInline):
    model = Job
    extra = 0
    fields = ["kind", "order", "assigned_to", "status", "sequence", "attempt_no"]
    readonly_fields = ["order", "attempt_no"]


@admin.register(RouteDay)
class RouteDayAdmin(admin.ModelAdmin):
    list_display = ["cluster", "date", "status", "hub"]
    list_filter = ["hub", "status", "date"]
    search_fields = ["cluster__name"]
    filter_horizontal = ["staff"]
    inlines = [JobInline]


class JobAttemptInline(admin.TabularInline):
    model = JobAttempt
    extra = 0
    fields = ["attempt_no", "outcome", "failure_reason", "notes", "at"]
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


class ProofInline(admin.TabularInline):
    model = Proof
    extra = 0
    fields = ["kind", "file", "otp_verified", "at"]
    readonly_fields = ["at"]


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ["order", "kind", "status", "assigned_to", "route_day", "attempt_no"]
    list_filter = ["kind", "status", "hub"]
    search_fields = ["order__ref"]
    inlines = [JobAttemptInline, ProofInline]


@admin.register(JobAttempt)
class JobAttemptAdmin(admin.ModelAdmin):
    list_display = ["job", "attempt_no", "outcome", "failure_reason", "at"]
    list_filter = ["outcome"]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Proof)
class ProofAdmin(admin.ModelAdmin):
    list_display = ["job", "kind", "otp_verified", "at"]
    list_filter = ["kind", "hub"]


@admin.register(OfflineOp)
class OfflineOpAdmin(admin.ModelAdmin):
    list_display = ["client_op_id", "op_type", "staff", "device_id", "status", "server_received_at"]
    list_filter = ["status", "op_type"]
    search_fields = ["client_op_id", "device_id"]
