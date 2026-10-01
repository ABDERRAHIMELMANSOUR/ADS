"""Google Ads extraction with the official `google-ads` client (GAQL)."""

from __future__ import annotations

import logging
from collections.abc import Iterator
from datetime import date
from typing import Any

import pandas as pd
from google.ads.googleads.client import GoogleAdsClient

from .rules import GOOGLE_ADS
from .settings import GoogleAdsSettings
from .transform import CONVERSION_COLUMNS, SPEND_COLUMNS

log = logging.getLogger(__name__)

# Cost and conversion-action segments cannot be selected together in GAQL, so
# spend and conversions are two queries over the same campaigns and dates.
SPEND_QUERY = """
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      metrics.cost_micros
    FROM campaign
    WHERE segments.date BETWEEN '{start}' AND '{end}'
      AND metrics.cost_micros > 0
"""

# metrics.conversions only counts the conversion actions marked as primary
# ("Include in Conversions"), which is what the Google Ads UI reports.
CONVERSIONS_QUERY = """
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      segments.conversion_action_name,
      segments.conversion_action_category,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '{start}' AND '{end}'
      AND metrics.conversions > 0
"""


def spend_record(row: Any, *, compte: str, customer_id: str) -> dict[str, Any]:
    return {
        "date": row.segments.date,
        "plateforme": GOOGLE_ADS,
        "compte": compte,
        "account_id": customer_id,
        "campaign_id": str(row.campaign.id),
        "campaign_name": row.campaign.name,
        "depenses": row.metrics.cost_micros / 1_000_000,
    }


def conversion_record(row: Any, *, compte: str, customer_id: str) -> dict[str, Any]:
    return {
        "date": row.segments.date,
        "plateforme": GOOGLE_ADS,
        "compte": compte,
        "account_id": customer_id,
        "campaign_id": str(row.campaign.id),
        "campaign_name": row.campaign.name,
        "conversion_name": row.segments.conversion_action_name,
        "conversion_category": row.segments.conversion_action_category.name,
        "conversions": row.metrics.conversions,
    }


def _build_client(settings: GoogleAdsSettings) -> GoogleAdsClient:
    config: dict[str, Any] = {
        "developer_token": settings.developer_token,
        "client_id": settings.client_id,
        "client_secret": settings.client_secret,
        "refresh_token": settings.refresh_token,
        "use_proto_plus": True,
    }
    if settings.login_customer_id:  # required when accessing accounts through an MCC
        config["login_customer_id"] = settings.login_customer_id
    return GoogleAdsClient.load_from_dict(config)


def _stream(service: Any, customer_id: str, query: str) -> Iterator[Any]:
    for batch in service.search_stream(customer_id=customer_id, query=query):
        yield from batch.results


def fetch(start: date, end: date) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (spend, conversions) raw frames for every configured account."""
    settings = GoogleAdsSettings.from_env()
    service = _build_client(settings).get_service("GoogleAdsService")
    window = {"start": start.isoformat(), "end": end.isoformat()}

    spend: list[dict[str, Any]] = []
    conversions: list[dict[str, Any]] = []
    for customer_id, compte in settings.accounts.items():
        log.info("Google Ads: account %s (%s), %s -> %s", customer_id, compte, start, end)
        spend.extend(
            spend_record(row, compte=compte, customer_id=customer_id)
            for row in _stream(service, customer_id, SPEND_QUERY.format(**window))
        )
        conversions.extend(
            conversion_record(row, compte=compte, customer_id=customer_id)
            for row in _stream(service, customer_id, CONVERSIONS_QUERY.format(**window))
        )

    log.info("Google Ads: %d spend rows, %d conversion rows", len(spend), len(conversions))
    return (
        pd.DataFrame(spend, columns=SPEND_COLUMNS),
        pd.DataFrame(conversions, columns=CONVERSION_COLUMNS),
    )
