"""UUIDv7 primary keys — time-ordered for index locality, non-guessable in
URLs (docs/02 §2)."""

import uuid

from uuid_extensions import uuid7  # type: ignore[import-untyped]


def new_uuid7() -> uuid.UUID:
    return uuid.UUID(str(uuid7()))
