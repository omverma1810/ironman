"""Cursor pagination (docs/04 §1) — offset pagination is offered only on
exports, never on list endpoints that back an infinite-scrolling UI."""

from rest_framework.pagination import CursorPagination as DRFCursorPagination


class CursorPagination(DRFCursorPagination):
    page_size = 25
    max_page_size = 100
    page_size_query_param = "limit"
    ordering = "-created_at"
    cursor_query_param = "cursor"
