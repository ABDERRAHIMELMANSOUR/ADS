"""Load aggregated metrics into Supabase with supabase-py."""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

import pandas as pd
from supabase import Client, create_client

from .settings import SupabaseSettings
from .transform import KEY_COLUMNS, METRIC_COLUMNS

log = logging.getLogger(__name__)

TABLE = "marketing_daily_metrics"
BATCH_SIZE = 500


def connect(settings: SupabaseSettings) -> Client:
    return create_client(settings.url, settings.key)


def to_records(metrics: pd.DataFrame, synced_at: datetime) -> list[dict[str, Any]]:
    synced_at_iso = synced_at.isoformat(timespec="microseconds").replace("+00:00", "Z")
    return [
        {
            **{column: row[column] for column in KEY_COLUMNS},
            **{column: float(row[column]) for column in METRIC_COLUMNS},
            "synced_at": synced_at_iso,
        }
        for row in metrics.to_dict(orient="records")
    ]


def replace_window(
    client: Client,
    *,
    plateforme: str,
    metrics: pd.DataFrame,
    start: date,
    end: date,
    synced_at: datetime,
) -> int:
    """Make the table match `metrics` for one platform over [start, end].

    Rows are upserted on the primary key, stamped with this run's `synced_at`.
    Then any row of the window left with an older stamp (a key that no longer
    exists, e.g. after a campaign rename) is deleted. Re-running is idempotent.
    """
    records = to_records(metrics, synced_at)
    if not records:
        # An empty extraction is more likely an upstream problem than a real
        # absence of spend: keep the existing data rather than wiping it.
        log.warning("%s: nothing to load for %s -> %s, existing rows kept", plateforme, start, end)
        return 0

    for offset in range(0, len(records), BATCH_SIZE):
        client.table(TABLE).upsert(
            records[offset : offset + BATCH_SIZE],
            on_conflict=",".join(KEY_COLUMNS),
        ).execute()

    stale = (
        client.table(TABLE)
        .delete()
        .eq("plateforme", plateforme)
        .gte("date", start.isoformat())
        .lte("date", end.isoformat())
        .lt("synced_at", records[0]["synced_at"])
        .execute()
    )
    log.info(
        "%s: upserted %d rows, deleted %d stale rows (%s -> %s)",
        plateforme,
        len(records),
        len(stale.data or []),
        start,
        end,
    )
    return len(records)
