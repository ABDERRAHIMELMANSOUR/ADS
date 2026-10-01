import pytest

from pipeline import rules
from pipeline.rules import APPELS, AUTO, FICHES_LEADS, GOOGLE_ADS, META_ADS, SANTE


def test_normalize_strips_accents_case_and_punctuation():
    assert rules.normalize("ALM_Santé-Mutuelle | Search") == "alm sante mutuelle search"
    assert rules.normalize(None) == ""


@pytest.mark.parametrize(
    ("campaign", "service"),
    [
        ("ALM | Santé | Search", SANTE),
        ("CPA_SANTE_Leads", SANTE),
        ("Mutuelle seniors - PMax", SANTE),
        ("CPA | Auto | Appels", AUTO),
        ("ALM_Assurance-Voiture", AUTO),
        ("Brand - Generic", None),  # no service
        ("Pack Auto + Santé", None),  # ambiguous
    ],
)
def test_classify_service(campaign, service):
    assert rules.classify_service(campaign) == service


@pytest.mark.parametrize(
    ("campaign", "expected"),
    [
        ("ALM | Santé | Appels", APPELS),
        ("CPA_Auto_Call-Only", APPELS),
        ("ALM | Santé | Leads", FICHES_LEADS),
        ("ALM | Santé | Demande de rappel", FICHES_LEADS),
    ],
)
def test_classify_campaign_type(campaign, expected):
    assert rules.classify_campaign_type(campaign) == expected


@pytest.mark.parametrize(
    ("plateforme", "name", "category", "expected"),
    [
        (GOOGLE_ADS, "Calls from ads", "PHONE_CALL_LEAD", APPELS),
        (GOOGLE_ADS, "Appels importés (CallTracking)", "IMPORTED_LEAD", APPELS),
        (GOOGLE_ADS, "Formulaire devis", "SUBMIT_LEAD_FORM", FICHES_LEADS),
        (GOOGLE_ADS, "Demande de rappel", "REQUEST_QUOTE", FICHES_LEADS),
        (META_ADS, "click_to_call_native_call_placed", None, APPELS),
        (META_ADS, "lead", None, FICHES_LEADS),
    ],
)
def test_classify_conversion(plateforme, name, category, expected):
    assert rules.classify_conversion(plateforme, name, category) == expected
