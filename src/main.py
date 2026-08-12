import os
import sys

from src import store
from src.notify import build_alert_html, build_alert_markdown, create_github_issue, send_email
from src.scraper import fetch_properties


def _plural(count: int) -> str:
    return "property" if count == 1 else "properties"


def _as_float(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _filtered(props: list[dict], search: dict) -> list[dict]:
    minimum = _as_float(search.get("min_rating"))
    if not minimum:
        return props
    return [prop for prop in props if (_as_float(prop.get("rating")) or -1) >= minimum]


def _ordered(props: list[dict]) -> list[dict]:
    return sorted(
        props, key=lambda prop: (-(_as_float(prop.get("rating")) or 0), prop.get("name") or "")
    )


def _announce(subject: str, html: str, markdown: str, search: dict) -> bool:
    channels = [("Email", lambda: send_email(subject, html, search.get("alert_email")))]
    if os.environ.get("GITHUB_TOKEN") and os.environ.get("GITHUB_REPOSITORY"):
        channels.append(("GitHub issue", lambda: create_github_issue(subject, markdown)))
    delivered = False
    for name, send in channels:
        try:
            send()
            delivered = True
        except Exception as error:
            print(f"  {name} channel failed: {error}")
    return delivered


def _safe_finish(run_id, status: str, scraped: int, new: int, error=None) -> None:
    try:
        store.finish_run(run_id, status, scraped, new, error)
    except Exception as finish_error:
        print(f"  could not record run {run_id}: {finish_error}")


def _notify(pending: list[dict], search: dict, first_run: bool) -> bool:
    label = search.get("label") or "Booking.com search"
    count = len(pending)
    headline = (
        f"{count} {_plural(count)} matching" if first_run else f"{count} new {_plural(count)}"
    )
    delivered = _announce(
        f"🏨 {headline}: {label}",
        build_alert_html(pending, search, first_run),
        build_alert_markdown(pending, search, first_run),
        search,
    )
    if delivered:
        store.mark_notified([row.get("id") for row in pending])
    else:
        print("  ALL CHANNELS FAILED — findings stay unnotified and retry next run.")
    return delivered


def _run_search(search: dict) -> tuple[bool, int, int]:
    search_id = search.get("id")
    label = search.get("label") or search_id
    try:
        run_id = store.start_run(search_id)
    except Exception as error:
        print(f"[{label}] FAILED before starting: {error}")
        return False, 0, 0
    try:
        search_url = search.get("search_url")
        if not search_url:
            raise RuntimeError("search row has no search_url")
        first_run = not store.known_property_ids(search_id)
        scraped = _filtered(fetch_properties(search_url, search.get("max_pages") or 2), search)
        new_rows = store.insert_findings(search_id, run_id, scraped)
        pending = _ordered(store.unnotified_findings(search_id))
        alerted = _notify(pending, search, first_run) if pending else False
        _safe_finish(run_id, "ok", len(scraped), len(new_rows))
        if not pending:
            outcome = "nothing to alert"
        else:
            outcome = f"{len(pending)} alerted" if alerted else f"{len(pending)} still pending"
        print(
            f"[{label}] {len(scraped)} scraped, {len(new_rows)} new, "
            f"{outcome}{' (first run)' if first_run else ''}."
        )
        return True, len(scraped), len(new_rows)
    except Exception as error:
        _safe_finish(run_id, "error", 0, 0, str(error))
        print(f"[{label}] FAILED: {error}")
        return False, 0, 0


def main() -> None:
    try:
        searches = store.active_searches()
    except Exception as error:
        print(f"Could not load searches: {error}")
        sys.exit(1)
    if not searches:
        print("No active searches.")
        return
    failed = scraped_total = new_total = 0
    for search in searches:
        ok, scraped, new = _run_search(search)
        failed += 0 if ok else 1
        scraped_total += scraped
        new_total += new
    print(
        f"{len(searches)} searches: {len(searches) - failed} ok, {failed} failed, "
        f"{scraped_total} scraped, {new_total} new."
    )
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
