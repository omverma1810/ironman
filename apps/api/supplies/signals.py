"""A new `StockItem` gets its zero `StockLevel` straight away. Levels used
to be created lazily on the first movement, which left a never-received
item missing from the stock list and — worse — from reorder alerts (that
query reads `StockLevel`), so a brand-new item at zero stock never flagged
as needing an order."""

from __future__ import annotations


def ensure_stock_level(sender, instance, created, **kwargs):
    if not created:
        return
    from supplies.models import StockLevel

    StockLevel.objects.get_or_create(stock_item=instance, defaults={"hub_id": instance.hub_id})
