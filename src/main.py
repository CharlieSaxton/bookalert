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


def _recipients(search: dict) -> list[str]:
    emails = search.get("alert_emails") or []
    if not emails and search.get("alert_email"):
        emails = [search["alert_email"]]
    seen, unique = set(), []
    for email in emails:
        cleaned = (email or "").strip().lower()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            unique.append(cleaned)
    return unique


def _announce(subject: str, html: str, markdown: str, search: dict) -> bool:
    # One address per request: a provider that rejects a single recipient (Resend's
    # free tier refuses anyone but the account owner) would otherwise fail the whole
    # message and nobody would be told, including the address that was fine.
    recipients = _recipients(search)
    delivered = []
    for address in recipients:
        try:
            send_email(subject, html, address)
            delivered.append(address)
        except Exception as error:
            print(f"  email to {address} failed: {error}")

    if os.environ.get("GITHUB_TOKEN") and os.environ.get("GITHUB_REPOSITORY"):
        try:
            create_github_issue(subject, markdown)
        except Exception as error:
            print(f"  GitHub issue channel failed: {error}")

    if delivered:
        undelivered = [a for a in recipients if a not in delivered]
        if undelivered:
            print(f"  delivered to {len(delivered)}/{len(recipients)}; still failing: {', '.join(undelivered)}")
    # Email is the product. A GitHub issue is a convenience copy, so it must never
    # be enough on its own to mark a finding notified and retire the retry.
    return bool(delivered)


def _safe_finish(run_id, status: str, scraped: int, new: int, error=None, returned: int = 0) -> None:
    try:
        store.finish_run(run_id, status, scraped, new, error, returned_count=returned)
    except Exception as finish_error:
        print(f"  could not record run {run_id}: {finish_error}")


def _headline(pending: list[dict], first_run: bool) -> str:
    count = len(pending)
    if first_run:
        return f"{count} {_plural(count)} matching"
    back = sum(1 for row in pending if row.get("returned"))
    fresh = count - back
    if back and fresh:
        return f"{fresh} new, {back} back in stock"
    if back:
        return f"{back} room{'' if back == 1 else 's'} opened up"
    return f"{fresh} new {_plural(fresh)}"


def _notify(pending: list[dict], search: dict, first_run: bool) -> bool:
    label = search.get("label") or "Booking.com search"
    headline = _headline(pending, first_run)
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
        known = store.known_property_ids(search_id)
        first_run = not known
        scraped = _filtered(fetch_properties(search_url, search.get("max_pages") or 2), search)
        seen_ids = {prop["id"] for prop in scraped if prop.get("id")}

        # A property absent from results has no availability for these dates; when it
        # reappears a room has opened up, which is worth alerting even though the
        # property itself is not new.
        returned_ids = store.unavailable_property_ids(search_id) & seen_ids
        new_rows = store.insert_findings(search_id, run_id, scraped)
        store.mark_availability(search_id, seen_ids, known - seen_ids)
        returned_rows = store.requeue_returned(
            search_id, returned_ids, run_id, {p["id"]: p for p in scraped}
        )

        pending = _ordered(store.unnotified_findings(search_id))
        for row in pending:
            row["returned"] = row.get("property_id") in returned_ids
        alerted = _notify(pending, search, first_run) if pending else False
        _safe_finish(run_id, "ok", len(scraped), len(new_rows), returned=len(returned_rows))
        if not pending:
            outcome = "nothing to alert"
        else:
            outcome = f"{len(pending)} alerted" if alerted else f"{len(pending)} still pending"
        returned_note = f", {len(returned_rows)} back in stock" if returned_rows else ""
        print(
            f"[{label}] {len(scraped)} scraped, {len(new_rows)} new{returned_note}, "
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
