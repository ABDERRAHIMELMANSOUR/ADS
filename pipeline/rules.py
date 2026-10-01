"""Business rules: how raw campaigns and conversion actions map to the reporting
dimensions (Compte, Service, Type).

This file is the single source of truth for categorisation. Adapt the patterns
to your naming conventions here, so that changes are reviewed and versioned
with the code. The values below must match the CHECK constraints of
``public.marketing_daily_metrics``.

* Compte  comes from the ad account (see GOOGLE_ADS_ACCOUNTS / META_AD_ACCOUNTS).
* Service comes from the campaign name.
* Type    comes from the conversion action for conversions, and from the
          campaign name for spend (spend cannot be split by conversion action).
"""

from __future__ import annotations

import re
import unicodedata

COMPTES = ("ALM", "CPA")

SANTE = "Santé"
AUTO = "Auto"
SERVICES = (SANTE, AUTO)

APPELS = "Appels"
FICHES_LEADS = "Fiches / Leads"
TYPES_CONVERSION = (APPELS, FICHES_LEADS)

GOOGLE_ADS = "google_ads"
META_ADS = "meta_ads"
PLATEFORMES = (GOOGLE_ADS, META_ADS)

# Patterns are matched against normalize(text): lowercase, no accents, and
# every run of non-alphanumeric characters replaced by a single space.
# "ALM_Santé-Mutuelle | Search" -> "alm sante mutuelle search"

# A campaign must match exactly one service. Campaigns matching none (or both)
# are reported as unclassified and are not loaded.
SERVICE_PATTERNS: dict[str, re.Pattern[str]] = {
    SANTE: re.compile(r"sante|mutuelle"),
    AUTO: re.compile(r"auto|voiture|vehicule"),
}

# Spend of campaigns whose name matches goes to "Appels", the rest to
# "Fiches / Leads". Word boundaries keep "rappel" (a callback form) out.
CALL_CAMPAIGN_PATTERN = re.compile(r"\b(appels?|calls?)\b")

# Google Ads: a conversion is a call if its action category is a phone call
# lead, or if the action name says so (useful for imported call tracking).
GOOGLE_CALL_CATEGORIES = frozenset({"PHONE_CALL_LEAD"})
GOOGLE_CALL_CONVERSION_PATTERN = re.compile(r"\b(appels?|calls?)\b")

# Meta Ads: action types read from the Insights "actions" field. Only these are
# loaded. Keep one action type per concept: "lead" already includes both pixel
# leads and instant-form leads, so adding "offsite_conversion.fb_pixel_lead"
# too would double count. Custom conversions look like
# "offsite_conversion.custom.<id>".
META_CALL_ACTION_TYPES = frozenset({"click_to_call_native_call_placed"})
META_LEAD_ACTION_TYPES = frozenset({"lead"})

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize(text: str | None) -> str:
    """Lowercase, strip accents and collapse punctuation to single spaces."""
    if not text:
        return ""
    ascii_text = (
        unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    )
    return _NON_ALNUM.sub(" ", ascii_text.lower()).strip()


def classify_service(campaign_name: str | None) -> str | None:
    """Return the service of a campaign, or None if it matches zero or several."""
    name = normalize(campaign_name)
    matches = [service for service, pattern in SERVICE_PATTERNS.items() if pattern.search(name)]
    return matches[0] if len(matches) == 1 else None


def classify_campaign_type(campaign_name: str | None) -> str:
    """Return the type a campaign's spend is attributed to."""
    return APPELS if CALL_CAMPAIGN_PATTERN.search(normalize(campaign_name)) else FICHES_LEADS


def classify_conversion(plateforme: str, name: str | None, category: str | None) -> str:
    """Return the type of a conversion action ("Appels" or "Fiches / Leads").

    For Meta, ``name`` is the action type; extraction only keeps the action
    types listed above, so anything that is not a call is a lead.
    """
    if plateforme == META_ADS:
        return APPELS if name in META_CALL_ACTION_TYPES else FICHES_LEADS
    if category in GOOGLE_CALL_CATEGORIES or GOOGLE_CALL_CONVERSION_PATTERN.search(
        normalize(name)
    ):
        return APPELS
    return FICHES_LEADS
