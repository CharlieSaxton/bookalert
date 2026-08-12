"""Supabase PostgREST client for the alerter worker (service-role key, bypasses RLS)."""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

TIMEOUT = 30
USER_AGENT = "bookalert-worker/2.0 (+https://github.com/CharlieSaxton/bookalert)"
ERROR_LIMIT = 2_000


def _env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is not set — the worker needs it to reach Supabase.")
    return value


def _headers(prefer: str | None) -> dict:
    key = _env("SUPABASE_SERVICE_ROLE_KEY")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _request(method: str, path: str, payload=None, prefer: str | None = None):
    url = f"{_env('SUPABASE_URL').rstrip('/')}/rest/v1{path}"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers=_headers(prefer),
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            body = response.read().decode("utf-8", "replace").strip()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace").strip()
        raise RuntimeError(f"Supabase {method} {path} -> HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Supabase {method} {path} failed: {error.reason}") from error
    if not body:
        return []
    try:
        return json.loads(body)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Supabase {method} {path} sent a non-JSON body: {body[:200]}") from error


def _query(**filters) -> str:
    return urllib.parse.urlencode(filters)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def active_searches() -> list[dict]:
    rows = _request("GET", f"/searches?{_query(active='eq.true', select='*')}")
    return rows if isinstance(rows, list) else []


def known_property_ids(search_id) -> set[str]:
    rows = _request(
        "GET", f"/findings?{_query(search_id=f'eq.{search_id}', select='property_id')}"
    )
    return {row["property_id"] for row in rows if row.get("property_id")}


def unnotified_findings(search_id) -> list[dict]:
    return _request(
        "GET",
        f"/findings?{_query(search_id=f'eq.{search_id}', notified='is.false', select='*')}",
    )


def start_run(search_id) -> str:
    rows = _request(
        "POST",
        "/runs",
        {"search_id": search_id, "status": "running"},
        prefer="return=representation",
    )
    if not rows or not rows[0].get("id"):
        raise RuntimeError(f"Supabase POST /runs returned no run id: {rows!r}")
    return rows[0]["id"]


def finish_run(run_id, status: str, scraped_count: int, new_count: int, error=None) -> None:
    _request(
        "PATCH",
        f"/runs?{_query(id=f'eq.{run_id}')}",
        {
            "status": status,
            "finished_at": _now_iso(),
            "scraped_count": scraped_count,
            "new_count": new_count,
            "error": str(error)[:ERROR_LIMIT] if error else None,
        },
    )


def insert_findings(search_id, run_id, props: list[dict]) -> list[dict]:
    rows, seen = [], set()
    for prop in props:
        property_id = prop.get("id")
        if not property_id or property_id in seen:
            continue
        # findings.name and findings.url are NOT NULL and this insert is all-or-nothing,
        # so one malformed card would otherwise discard the whole batch.
        if not (prop.get("name") and prop.get("url")):
            print(f"  skipping {property_id}: missing name or url")
            continue
        seen.add(property_id)
        rows.append(
            {
                "search_id": search_id,
                "run_id": run_id,
                "property_id": property_id,
                "name": prop.get("name"),
                "url": prop.get("url"),
                "price": prop.get("price"),
                "rating": prop.get("rating"),
            }
        )
    if not rows:
        return []
    # on_conflict must name the unique index explicitly: without it PostgREST resolves against
    # the primary key, which never collides (fresh uuid per row) and the insert 409s instead.
    # With it, already-known properties are skipped and the response contains only new ones.
    inserted = _request(
        "POST",
        "/findings?on_conflict=search_id,property_id",
        rows,
        prefer="return=representation,resolution=ignore-duplicates",
    )
    return inserted if isinstance(inserted, list) else []


def mark_notified(ids) -> None:
    values = [str(value) for value in ids if value]
    if not values:
        return
    joined = ",".join(f'"{value}"' for value in values)
    # Under the anon key RLS makes this PATCH a silent no-op rather than an error, and a
    # silent no-op means every future run re-sends the same alert. Count the rows back.
    updated = _request(
        "PATCH",
        f"/findings?{_query(id=f'in.({joined})')}",
        {"notified": True},
        prefer="return=representation",
    )
    if isinstance(updated, list) and len(updated) != len(values):
        print(
            f"  warning: marked {len(updated)}/{len(values)} findings notified — check that "
            "SUPABASE_SERVICE_ROLE_KEY really is the service-role key"
        )
