"""Pandas aggregation of raw campaign rows into the reporting grain."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from . import rules

# Raw frames returned by the extractors: one row per campaign and day (spend),
# and one row per campaign, day and conversion action (conversions).
SPEND_COLUMNS = [
    "date",
    "plateforme",
    "compte",
    "account_id",
    "campaign_id",
    "campaign_name",
    "depenses",
]
CONVERSION_COLUMNS = [
    "date",
    "plateforme",
    "compte",
    "account_id",
    "campaign_id",
    "campaign_name",
    "conversion_name",
    "conversion_category",
    "conversions",
]

# Primary key of public.marketing_daily_metrics, also the upsert conflict target.
KEY_COLUMNS = ["date", "plateforme", "compte", "service", "type_conversion"]
METRIC_COLUMNS = ["depenses", "conversions"]


@dataclass(frozen=True)
class AggregationResult:
    metrics: pd.DataFrame  # KEY_COLUMNS + METRIC_COLUMNS, ready to load
    unclassified: pd.DataFrame  # campaigns whose service could not be determined


def empty_spend_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=SPEND_COLUMNS)


def empty_conversion_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=CONVERSION_COLUMNS)


def aggregate(spend: pd.DataFrame, conversions: pd.DataFrame) -> AggregationResult:
    """Classify raw rows and sum them per (date, plateforme, compte, service, type).

    Spend takes the type of its campaign; conversions take the type of their
    conversion action. Both are stacked into one long frame before grouping,
    so a key can carry spend, conversions, or both.
    """
    spend_rows = spend.assign(
        service=spend["campaign_name"].map(rules.classify_service),
        type_conversion=spend["campaign_name"].map(rules.classify_campaign_type),
        conversions=0.0,
    )
    conversion_rows = conversions.assign(
        service=conversions["campaign_name"].map(rules.classify_service),
        type_conversion=[
            rules.classify_conversion(plateforme, name, category)
            for plateforme, name, category in zip(
                conversions["plateforme"],
                conversions["conversion_name"],
                conversions["conversion_category"],
                strict=True,
            )
        ],
        depenses=0.0,
    )

    columns = [*KEY_COLUMNS, "campaign_name", *METRIC_COLUMNS]
    frames = [frame[columns] for frame in (spend_rows, conversion_rows) if not frame.empty]
    if not frames:
        return AggregationResult(
            metrics=pd.DataFrame(columns=[*KEY_COLUMNS, *METRIC_COLUMNS]),
            unclassified=pd.DataFrame(columns=["plateforme", "compte", "campaign_name", *METRIC_COLUMNS]),
        )

    rows = pd.concat(frames, ignore_index=True)
    rows[METRIC_COLUMNS] = rows[METRIC_COLUMNS].astype("float64")
    is_classified = rows["service"].notna()

    metrics = (
        rows[is_classified]
        .groupby(KEY_COLUMNS, as_index=False, sort=True)[METRIC_COLUMNS]
        .sum()
        .round(2)
    )
    metrics = metrics[(metrics["depenses"] > 0) | (metrics["conversions"] > 0)]

    unclassified = (
        rows[~is_classified]
        .groupby(["plateforme", "compte", "campaign_name"], as_index=False, sort=True)[
            METRIC_COLUMNS
        ]
        .sum()
        .round(2)
        .sort_values("depenses", ascending=False, ignore_index=True)
    )

    return AggregationResult(metrics=metrics.reset_index(drop=True), unclassified=unclassified)
