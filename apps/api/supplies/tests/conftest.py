"""supplies-local fixtures."""

from __future__ import annotations

import pytest

from supplies.models import StockCategory, StockItem, StockUnit


@pytest.fixture
def stock_item(hub):
    return StockItem.objects.create(
        hub=hub,
        sku="HANGER-001",
        name="Wire hanger",
        unit=StockUnit.PIECE,
        category=StockCategory.HANGER,
        reorder_level=50,
    )
