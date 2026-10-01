"""Meta Ads extraction with the official `facebook-business` SDK (Insights API)."""

from __future__ import annotations

import logging
from collections.abc import Iterator, Mapping
from datetime import date, timedelta
from typing import Any

import pandas as pd
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.api import FacebookAdsApi

from .rules import META_ADS, META_CALL_ACTION_TYPES, META_LEAD_ACTION_TYPES
from .settings import MetaAdsSettings
from .transform import CONVERSION_COLUMNS, SPEND_COLUMNS

log = logging.getLogger(__name__)

FIELDS = ["date_start", "campaign_id", "campaign_name", "spend", "actions"]
WANTED_ACTION_TYPES = META_CALL_ACTION_TYPES | META_LEAD_ACTION_TYPES

# Campaign-level insights leave out deleted and archived ads unless they are
# asked for explicitly, which would drop their spend from the totals.
ALL_AD_STATUSES = [
    "ACTIVE",
    "ADSET_PAUSED",
    "ARCHIVED",
    "CAMPAIGN_PAUSED",
    "DELETED",
    "DISAPPROVED",
    "IN_PROCESS",
    "PAUSED",
    "PENDING_BILLING_INFO",
    "PENDING_REVIEW",
    "PREAPPROVED",
    "WITH_ISSUES",
]

# Synchronous insights calls can time out on long ranges; backfills are split.
MAX_DAYS_PER_REQUEST = 31


def date_chunks(start: date, end: date, days: int = MAX_DAYS_PER_REQUEST) -> Iterator[tuple[date, date]]:
    while start <= end:
        chunk_end = min(start + timedelta(days=days - 1), end)
        yield start, chunk_end
        start = chunk_end + timedelta(days=1)


def parse_insight(
    row: Mapping[str, Any], *, compte: str, account_id: str
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Split one daily campaign insight into a spend record and conversion records."""
    base = {
        "date": row["date_start"],
        "plateforme": META_ADS,
        "compte": compte,
        "account_id": account_id,
        "campaign_id": row["campaign_id"],
        "campaign_name": row["campaign_name"],
    }
    spend_value = float(row.get("spend") or 0)
    spend = {**base, "depenses": spend_value} if spend_value > 0 else None

    conversions = []
    for action in row.get("actions") or []:
        action_type = action.get("action_type")
        value = float(action.get("value") or 0)
        if action_type in WANTED_ACTION_TYPES and value > 0:
            conversions.append(
                {
                    **base,
                    "conversion_name": action_type,
                    "conversion_category": None,
                    "conversions": value,
                }
            )
    return spend, conversions


def fetch(start: date, end: date) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (spend, conversions) raw frames for every configured ad account."""
    settings = MetaAdsSettings.from_env()
    api = FacebookAdsApi.init(
        app_id=settings.app_id,
        app_secret=settings.app_secret,  # enables appsecret_proof when set
        access_token=settings.access_token,
        crash_log=False,
    )

    spend: list[dict[str, Any]] = []
    conversions: list[dict[str, Any]] = []
    for account_id, compte in settings.accounts.items():
        account = AdAccount(f"act_{account_id}", api=api)
        for chunk_start, chunk_end in date_chunks(start, end):
            log.info("Meta Ads: account act_%s (%s), %s -> %s", account_id, compte, chunk_start, chunk_end)
            insights = account.get_insights(
                fields=FIELDS,
                params={
                    "level": "campaign",
                    "time_range": {"since": chunk_start.isoformat(), "until": chunk_end.isoformat()},
                    "time_increment": 1,
                    # Use each ad set's attribution setting, as Ads Manager does.
                    "use_unified_attribution_setting": True,
                    "filtering": [
                        {"field": "ad.effective_status", "operator": "IN", "value": ALL_AD_STATUSES}
                    ],
                    "limit": 500,
                },
            )
            for row in insights:  # the cursor follows pagination
                spend_record, conversion_records = parse_insight(row, compte=compte, account_id=account_id)
                if spend_record:
                    spend.append(spend_record)
                conversions.extend(conversion_records)

    log.info("Meta Ads: %d spend rows, %d conversion rows", len(spend), len(conversions))
    return (
        pd.DataFrame(spend, columns=SPEND_COLUMNS),
        pd.DataFrame(conversions, columns=CONVERSION_COLUMNS),
    )
