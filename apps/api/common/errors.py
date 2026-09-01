"""
One error envelope, everywhere (docs/04 §2). `message` is written to be
shown to a user verbatim; `code` is what clients branch on.
"""

from __future__ import annotations

import logging
import uuid

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions as drf_exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("ironman.api")


class ApiError(drf_exceptions.APIException):
    """Raise this from services/views for a domain-specific error with a
    stable `code` clients can branch on. Prefer this over a bare
    ValidationError once the error has a name worth giving it."""

    status_code = 400
    default_code = "validation_error"
    retryable = False

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        detail: str | None = None,
        status_code: int | None = None,
        field_errors: dict | None = None,
        retryable: bool | None = None,
    ):
        self.message = message
        self.code = code or self.default_code
        self.detail_text = detail
        self.field_errors = field_errors or {}
        if status_code is not None:
            self.status_code = status_code
        if retryable is not None:
            self.retryable = retryable
        super().__init__(detail=message, code=self.code)


class SlotUnavailable(ApiError):
    status_code = 409
    default_code = "slot_unavailable"
    retryable = True


class OutOfServiceArea(ApiError):
    status_code = 400
    default_code = "out_of_service_area"


class InvalidStateTransition(ApiError):
    status_code = 409
    default_code = "invalid_state_transition"


class IdempotencyConflict(ApiError):
    status_code = 409
    default_code = "idempotency_conflict"


_CODE_BY_STATUS = {
    400: "validation_error",
    401: "authentication_required",
    403: "permission_denied",
    404: "not_found",
    405: "not_found",
    409: "conflict",
    429: "rate_limited",
}


def exception_handler(exc, context):
    """DRF EXCEPTION_HANDLER. Normalises every error — ApiError subclasses,
    plain DRF exceptions, Http404, PermissionDenied — into the one envelope
    the frontend's error states (05 §5) render directly."""
    request = context.get("request")
    request_id = getattr(request, "request_id", None) or str(uuid.uuid4())[:10]

    if isinstance(exc, ApiError):
        body = {
            "error": {
                "code": exc.code,
                "message": exc.message,
                "detail": exc.detail_text,
                "field_errors": exc.field_errors,
                "request_id": request_id,
                "retryable": exc.retryable,
            }
        }
        return Response(body, status=exc.status_code)

    if isinstance(exc, Http404):
        exc = drf_exceptions.NotFound()
    if isinstance(exc, DjangoPermissionDenied):
        exc = drf_exceptions.PermissionDenied()

    response = drf_exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled exception", extra={"request_id": request_id})
        body = {
            "error": {
                "code": "internal_error",
                "message": "Something went wrong on our end. Please try again.",
                "detail": None,
                "field_errors": {},
                "request_id": request_id,
                "retryable": True,
            }
        }
        return Response(body, status=500)

    field_errors = {}
    message = "There was a problem with your request."
    if isinstance(response.data, dict):
        for key, val in response.data.items():
            if key == "detail":
                message = str(val)
            else:
                field_errors[key] = val if isinstance(val, list) else [str(val)]
        if field_errors and message == "There was a problem with your request.":
            first_field = next(iter(field_errors))
            message = f"{first_field}: {field_errors[first_field][0]}"
    elif isinstance(response.data, list):
        message = str(response.data[0]) if response.data else message

    code = _CODE_BY_STATUS.get(response.status_code, "validation_error")
    response.data = {
        "error": {
            "code": code,
            "message": message,
            "detail": None,
            "field_errors": field_errors,
            "request_id": request_id,
            "retryable": response.status_code in (429, 503),
        }
    }
    return response
