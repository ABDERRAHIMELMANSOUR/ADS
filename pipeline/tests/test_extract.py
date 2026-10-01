from datetime import date

import pytest
from facebook_business.adobjects.adsinsights import AdsInsights
from google.ads.googleads.v25.enums.types.conversion_action_category import (
    ConversionActionCategoryEnum,
)
from google.ads.googleads.v25.services.types.google_ads_service import GoogleAdsRow

from pipeline import extract_google_ads, extract_meta_ads, settings
from pipeline.settings import ConfigError


def google_row():
    row = GoogleAdsRow()
    row.segments.date = "2026-09-30"
    row.campaign.id = 42
    row.campaign.name = "ALM | Santé | Search"
    row.metrics.cost_micros = 12_345_678
    row.segments.conversion_action_name = "Calls from ads"
    row.segments.conversion_action_category = (
        ConversionActionCategoryEnum.ConversionActionCategory.PHONE_CALL_LEAD
    )
    row.metrics.conversions = 2.5
    return row


def test_google_records_convert_micros_and_enum_names():
    row = google_row()

    spend = extract_google_ads.spend_record(row, compte="ALM", customer_id="1234567890")
    conversion = extract_google_ads.conversion_record(row, compte="ALM", customer_id="1234567890")

    assert spend["depenses"] == pytest.approx(12.345678)
    assert spend["campaign_id"] == "42"
    assert conversion["conversion_category"] == "PHONE_CALL_LEAD"
    assert conversion["conversions"] == 2.5


def meta_insight(actions):
    # Built the way the SDK builds rows from an API response.
    insight = AdsInsights()
    insight._set_data(
        {
            "date_start": "2026-09-30",
            "date_stop": "2026-09-30",
            "campaign_id": "987",
            "campaign_name": "CPA | Auto | Leads",
            "spend": "45.67",
            "actions": actions,
        }
    )
    return insight


def test_meta_insight_keeps_only_configured_action_types():
    insight = meta_insight(
        [
            {"action_type": "link_click", "value": "120"},
            {"action_type": "lead", "value": "3"},
            {"action_type": "offsite_conversion.fb_pixel_lead", "value": "2"},
            {"action_type": "click_to_call_native_call_placed", "value": "1"},
        ]
    )

    spend, conversions = extract_meta_ads.parse_insight(insight, compte="CPA", account_id="555")

    assert spend["depenses"] == pytest.approx(45.67)
    assert {(c["conversion_name"], c["conversions"]) for c in conversions} == {
        ("lead", 3.0),
        ("click_to_call_native_call_placed", 1.0),
    }


def test_meta_insight_without_spend_or_actions():
    insight = meta_insight(None)
    insight["spend"] = "0"

    assert extract_meta_ads.parse_insight(insight, compte="CPA", account_id="555") == (None, [])


def test_date_chunks_cover_the_range_without_overlap():
    chunks = list(extract_meta_ads.date_chunks(date(2026, 1, 1), date(2026, 3, 15), days=31))

    assert chunks == [
        (date(2026, 1, 1), date(2026, 1, 31)),
        (date(2026, 2, 1), date(2026, 3, 3)),
        (date(2026, 3, 4), date(2026, 3, 15)),
    ]


def test_parse_account_mapping_accepts_ui_formats():
    assert settings.parse_account_mapping(
        "ALM=123-456-7890, CPA=098-765-4321,CPA=1112223333",
        variable="GOOGLE_ADS_ACCOUNTS",
        id_pattern=r"\d{10}",
    ) == {"1234567890": "ALM", "0987654321": "CPA", "1112223333": "CPA"}
    assert settings.parse_account_mapping(
        "ALM=act_111,CPA=222", variable="META_AD_ACCOUNTS", id_pattern=r"\d+"
    ) == {"111": "ALM", "222": "CPA"}


@pytest.mark.parametrize("raw", ["", "XYZ=1234567890", "ALM=123", "ALM:1234567890", "ALM=1234567890,CPA=1234567890"])
def test_parse_account_mapping_rejects_bad_input(raw):
    with pytest.raises(ConfigError):
        settings.parse_account_mapping(raw, variable="GOOGLE_ADS_ACCOUNTS", id_pattern=r"\d{10}")
