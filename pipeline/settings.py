"""Credentials and account mappings, read from environment variables.

In GitHub Actions they come from repository secrets; locally, export them in
your shell (see .env.example). An empty variable counts as missing.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass

from .rules import COMPTES


class ConfigError(RuntimeError):
    """Raised when a required setting is missing or malformed."""


def _require(*names: str) -> dict[str, str]:
    values = {name: os.environ.get(name, "").strip() for name in names}
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise ConfigError(f"Missing environment variable(s): {', '.join(missing)}")
    return values


def _optional(name: str) -> str | None:
    return os.environ.get(name, "").strip() or None


def parse_account_mapping(raw: str, *, variable: str, id_pattern: str) -> dict[str, str]:
    """Parse "ALM=123-456-7890,CPA=987-654-3210" into {account_id: compte}.

    A compte may own several ad accounts ("ALM=111,ALM=222,CPA=333"). Account
    ids are normalized by keeping digits only, so "act_123" and "123-456"
    are accepted as written in the ad platforms' UI.
    """
    mapping: dict[str, str] = {}
    for entry in filter(None, (part.strip() for part in raw.split(","))):
        compte, sep, account = (piece.strip() for piece in entry.partition("="))
        account_id = re.sub(r"\D", "", account)
        if not sep or compte not in COMPTES or not re.fullmatch(id_pattern, account_id):
            raise ConfigError(
                f"{variable}: invalid entry {entry!r}, expected COMPTE=ACCOUNT_ID "
                f"with COMPTE in {COMPTES}"
            )
        if mapping.get(account_id, compte) != compte:
            raise ConfigError(f"{variable}: account {account_id} is mapped to two comptes")
        mapping[account_id] = compte
    if not mapping:
        raise ConfigError(f"{variable} is empty")
    return mapping


@dataclass(frozen=True)
class GoogleAdsSettings:
    developer_token: str
    client_id: str
    client_secret: str
    refresh_token: str
    login_customer_id: str | None
    accounts: dict[str, str]  # customer id (10 digits) -> compte

    @classmethod
    def from_env(cls) -> GoogleAdsSettings:
        env = _require(
            "GOOGLE_ADS_DEVELOPER_TOKEN",
            "GOOGLE_ADS_CLIENT_ID",
            "GOOGLE_ADS_CLIENT_SECRET",
            "GOOGLE_ADS_REFRESH_TOKEN",
            "GOOGLE_ADS_ACCOUNTS",
        )
        login_customer_id = _optional("GOOGLE_ADS_LOGIN_CUSTOMER_ID")
        return cls(
            developer_token=env["GOOGLE_ADS_DEVELOPER_TOKEN"],
            client_id=env["GOOGLE_ADS_CLIENT_ID"],
            client_secret=env["GOOGLE_ADS_CLIENT_SECRET"],
            refresh_token=env["GOOGLE_ADS_REFRESH_TOKEN"],
            login_customer_id=re.sub(r"\D", "", login_customer_id) if login_customer_id else None,
            accounts=parse_account_mapping(
                env["GOOGLE_ADS_ACCOUNTS"], variable="GOOGLE_ADS_ACCOUNTS", id_pattern=r"\d{10}"
            ),
        )


@dataclass(frozen=True)
class MetaAdsSettings:
    access_token: str
    app_id: str | None
    app_secret: str | None
    accounts: dict[str, str]  # ad account id (digits, without "act_") -> compte

    @classmethod
    def from_env(cls) -> MetaAdsSettings:
        env = _require("META_ACCESS_TOKEN", "META_AD_ACCOUNTS")
        return cls(
            access_token=env["META_ACCESS_TOKEN"],
            app_id=_optional("META_APP_ID"),
            app_secret=_optional("META_APP_SECRET"),
            accounts=parse_account_mapping(
                env["META_AD_ACCOUNTS"], variable="META_AD_ACCOUNTS", id_pattern=r"\d+"
            ),
        )


@dataclass(frozen=True)
class SupabaseSettings:
    url: str
    key: str

    @classmethod
    def from_env(cls) -> SupabaseSettings:
        env = _require("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        return cls(url=env["SUPABASE_URL"], key=env["SUPABASE_SERVICE_ROLE_KEY"])
