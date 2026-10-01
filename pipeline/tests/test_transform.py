import pandas as pd

from pipeline.rules import APPELS, AUTO, FICHES_LEADS, GOOGLE_ADS, META_ADS, SANTE
from pipeline.transform import (
    CONVERSION_COLUMNS,
    KEY_COLUMNS,
    METRIC_COLUMNS,
    SPEND_COLUMNS,
    aggregate,
    empty_conversion_frame,
    empty_spend_frame,
)


def spend_row(campaign, depenses, *, date="2026-09-30", plateforme=GOOGLE_ADS, compte="ALM"):
    return dict(zip(SPEND_COLUMNS, [date, plateforme, compte, "1", campaign, campaign, depenses]))


def conversion_row(campaign, name, category, value, *, date="2026-09-30", plateforme=GOOGLE_ADS, compte="ALM"):
    return dict(
        zip(CONVERSION_COLUMNS, [date, plateforme, compte, "1", campaign, campaign, name, category, value])
    )


def as_dict(metrics):
    return {
        tuple(row[column] for column in KEY_COLUMNS): tuple(row[column] for column in METRIC_COLUMNS)
        for row in metrics.to_dict(orient="records")
    }


def test_spend_follows_campaign_type_and_conversions_follow_action_type():
    spend = pd.DataFrame(
        [
            spend_row("ALM | Santé | Leads", 100.0),
            spend_row("ALM | Santé | Leads 2", 50.004),
            spend_row("ALM | Santé | Appels", 30.0),
        ]
    )
    conversions = pd.DataFrame(
        [
            conversion_row("ALM | Santé | Leads", "Formulaire", "SUBMIT_LEAD_FORM", 4.0),
            conversion_row("ALM | Santé | Leads", "Calls from ads", "PHONE_CALL_LEAD", 1.5),
            conversion_row("ALM | Santé | Appels", "Calls from ads", "PHONE_CALL_LEAD", 2.0),
        ]
    )

    result = aggregate(spend, conversions)

    assert as_dict(result.metrics) == {
        ("2026-09-30", GOOGLE_ADS, "ALM", SANTE, APPELS): (30.0, 3.5),
        ("2026-09-30", GOOGLE_ADS, "ALM", SANTE, FICHES_LEADS): (150.0, 4.0),
    }
    assert result.unclassified.empty


def test_keys_are_kept_apart_by_date_compte_and_platform():
    spend = pd.DataFrame(
        [
            spend_row("Auto - Leads", 10.0, date="2026-09-29"),
            spend_row("Auto - Leads", 20.0, date="2026-09-30"),
            spend_row("Auto - Leads", 40.0, compte="CPA"),
            spend_row("Auto - Leads", 80.0, plateforme=META_ADS),
        ]
    )
    result = aggregate(spend, empty_conversion_frame())

    assert as_dict(result.metrics) == {
        ("2026-09-29", GOOGLE_ADS, "ALM", AUTO, FICHES_LEADS): (10.0, 0.0),
        ("2026-09-30", GOOGLE_ADS, "ALM", AUTO, FICHES_LEADS): (20.0, 0.0),
        ("2026-09-30", GOOGLE_ADS, "CPA", AUTO, FICHES_LEADS): (40.0, 0.0),
        ("2026-09-30", META_ADS, "ALM", AUTO, FICHES_LEADS): (80.0, 0.0),
    }


def test_unclassified_campaigns_are_reported_not_loaded():
    spend = pd.DataFrame([spend_row("Brand - Generic", 25.0), spend_row("CPA Auto", 5.0)])
    conversions = pd.DataFrame([conversion_row("Brand - Generic", "lead", None, 2.0, plateforme=META_ADS)])

    result = aggregate(spend, conversions)

    assert as_dict(result.metrics) == {("2026-09-30", GOOGLE_ADS, "ALM", AUTO, FICHES_LEADS): (5.0, 0.0)}
    assert result.unclassified.to_dict(orient="records") == [
        {"plateforme": GOOGLE_ADS, "compte": "ALM", "campaign_name": "Brand - Generic", "depenses": 25.0, "conversions": 0.0},
        {"plateforme": META_ADS, "compte": "ALM", "campaign_name": "Brand - Generic", "depenses": 0.0, "conversions": 2.0},
    ]


def test_empty_inputs_give_empty_frames_with_the_load_columns():
    result = aggregate(empty_spend_frame(), empty_conversion_frame())

    assert result.metrics.empty
    assert list(result.metrics.columns) == [*KEY_COLUMNS, *METRIC_COLUMNS]
    assert result.unclassified.empty
