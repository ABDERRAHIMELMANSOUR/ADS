"""Extract Google Ads + Meta Ads data, aggregate it, and load it into Supabase.

Usage (from the repository root):

    python -m pipeline                                   # last 30 days, all sources
    python -m pipeline --lookback-days 7 --sources meta_ads
    python -m pipeline --start 2026-01-01 --end 2026-09-30   # backfill
    python -m pipeline --dry-run                         # extract + aggregate only

Exit code is 1 if any source failed (the others are still loaded), and 2 if
--fail-on-unclassified is set and some spend could not be classified.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from collections.abc import Callable
from datetime import date, datetime, timedelta, timezone

import pandas as pd

from . import extract_google_ads, extract_meta_ads, load
from .rules import GOOGLE_ADS, META_ADS, PLATEFORMES
from .settings import SupabaseSettings
from .transform import AggregationResult, aggregate

log = logging.getLogger("pipeline")

Extractor = Callable[[date, date], tuple[pd.DataFrame, pd.DataFrame]]
EXTRACTORS: dict[str, Extractor] = {
    GOOGLE_ADS: extract_google_ads.fetch,
    META_ADS: extract_meta_ads.fetch,
}

# Conversions keep being attributed to past clicks for weeks (Google Ads'
# default conversion window is 30 days), so recent days are re-synced nightly.
DEFAULT_LOOKBACK_DAYS = 30


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m pipeline", description=__doc__.splitlines()[0])
    parser.add_argument("--start", type=date.fromisoformat, help="first day (YYYY-MM-DD)")
    parser.add_argument("--end", type=date.fromisoformat, help="last day (YYYY-MM-DD), default: yesterday")
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=DEFAULT_LOOKBACK_DAYS,
        help=f"days to re-sync when --start is not given (default: {DEFAULT_LOOKBACK_DAYS})",
    )
    parser.add_argument(
        "--sources",
        nargs="+",
        choices=PLATEFORMES,
        default=list(PLATEFORMES),
        help="platforms to sync (default: all)",
    )
    parser.add_argument("--dry-run", action="store_true", help="do not write to Supabase")
    parser.add_argument(
        "--fail-on-unclassified",
        action="store_true",
        help="exit with code 2 when some campaigns match no service",
    )
    args = parser.parse_args(argv)

    if args.lookback_days < 1:
        parser.error("--lookback-days must be at least 1")
    args.end = args.end or date.today() - timedelta(days=1)
    args.start = args.start or args.end - timedelta(days=args.lookback_days - 1)
    if args.start > args.end:
        parser.error(f"empty date range: {args.start} -> {args.end}")
    return args


def github_annotation(level: str, message: str) -> None:
    """Surface a message in the GitHub Actions run summary (no-op locally)."""
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print(f"::{level}::{message}", flush=True)


def write_step_summary(markdown: str) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as summary:
            summary.write(markdown + "\n")


def markdown_table(frame: pd.DataFrame) -> str:
    def cells(values: object) -> str:
        return "| " + " | ".join(str(value).replace("|", "\\|") for value in values) + " |"

    lines = [cells(frame.columns), "|" + "---|" * len(frame.columns)]
    lines += [cells(row) for row in frame.itertuples(index=False)]
    return "\n".join(lines)


def report(source: str, result: AggregationResult, loaded: int | None) -> None:
    metrics, unclassified = result.metrics, result.unclassified
    status = "dry run" if loaded is None else f"{loaded} rows loaded"
    lines = [
        f"### {source}: {status}",
        "",
        f"- Dépenses: {metrics['depenses'].sum():,.2f}",
        f"- Conversions: {metrics['conversions'].sum():,.2f}",
    ]
    if not unclassified.empty:
        lost_spend = unclassified["depenses"].sum()
        message = (
            f"{source}: {len(unclassified)} campaign(s) match no service "
            f"({lost_spend:,.2f} of spend not loaded). Update pipeline/rules.py."
        )
        log.warning(message)
        github_annotation("warning", message)
        lines += ["", "Unclassified campaigns (not loaded):", "", markdown_table(unclassified)]
    write_step_summary("\n".join(lines) + "\n")


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    args = parse_args(argv)
    synced_at = datetime.now(timezone.utc)
    log.info("Window %s -> %s, sources: %s%s", args.start, args.end, ", ".join(args.sources),
             " (dry run)" if args.dry_run else "")

    client = None if args.dry_run else load.connect(SupabaseSettings.from_env())
    failed: list[str] = []
    unclassified_found = False

    for source in args.sources:
        try:
            spend, conversions = EXTRACTORS[source](args.start, args.end)
            result = aggregate(spend, conversions)
            loaded = None
            if client is not None:
                loaded = load.replace_window(
                    client,
                    plateforme=source,
                    metrics=result.metrics,
                    start=args.start,
                    end=args.end,
                    synced_at=synced_at,
                )
            else:
                print(result.metrics.to_string(index=False))
        except Exception as error:  # one failing platform must not block the other
            log.exception("%s failed", source)
            github_annotation("error", f"{source} failed: {error}")
            failed.append(source)
            continue
        report(source, result, loaded)
        unclassified_found |= not result.unclassified.empty

    if failed:
        return 1
    if unclassified_found and args.fail_on_unclassified:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
