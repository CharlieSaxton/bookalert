import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from src.notify import (
    build_alert_html,
    build_alert_markdown,
    build_startup_html,
    build_startup_markdown,
    create_github_issue,
    send_email,
)
from src.scraper import fetch_properties

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.json"
STATE_PATH = ROOT / "state" / "state.json"


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def load_state() -> dict | None:
    if not STATE_PATH.exists():
        return None
    try:
        state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    if not isinstance(state, dict) or not isinstance(state.get("properties"), dict):
        return None
    return state


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_state(properties: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(
        {"properties": properties, "updated": now_iso()},
        indent=2,
        ensure_ascii=False,
        sort_keys=True,
    )
    STATE_PATH.write_text(body + "\n", encoding="utf-8")


def dedupe(props: list[dict]) -> list[dict]:
    unique: dict[str, dict] = {}
    for prop in props:
        prop_id = prop.get("id")
        if prop_id and prop_id not in unique:
            unique[prop_id] = prop
    return list(unique.values())


def plural(count: int) -> str:
    return "property" if count == 1 else "properties"


def as_record(prop: dict, seen_at: str) -> dict:
    return {"name": prop.get("name"), "url": prop.get("url"), "first_seen": seen_at}


def announce(subject: str, html: str, markdown: str, config: dict) -> bool:
    delivered = False
    channels = (
        ("Email", lambda: send_email(subject, html, config)),
        ("GitHub issue", lambda: create_github_issue(subject, markdown)),
    )
    for name, send in channels:
        try:
            send()
            delivered = True
        except Exception as error:
            print(f"{name} channel failed: {error}")
    return delivered


def first_run(found: list[dict], seen_at: str, config: dict) -> bool:
    properties = {prop["id"]: as_record(prop, seen_at) for prop in found}
    delivered = announce(
        f"🏨 Monitoring started: {config['search_label']}",
        build_startup_html(len(properties), config),
        build_startup_markdown(len(properties), config),
        config,
    )
    write_state(properties)
    status = "startup announcement sent" if delivered else "ALL CHANNELS FAILED"
    print(
        f"Scraped {len(found)} {plural(len(found))}, 0 new "
        f"(first run, seeded state), {status}."
    )
    return delivered


def main() -> None:
    config = load_config()
    state = load_state()
    found = dedupe(fetch_properties(config["search_url"], config.get("max_pages", 2)))
    seen_at = now_iso()

    if state is None:
        if not first_run(found, seen_at, config):
            sys.exit(1)
        return

    properties = dict(state["properties"])
    new_props = [prop for prop in found if prop["id"] not in properties]
    delivered = True

    if new_props:
        delivered = announce(
            f"🏨 {len(new_props)} new {plural(len(new_props))}: {config['search_label']}",
            build_alert_html(new_props, config),
            build_alert_markdown(new_props, config),
            config,
        )
        if delivered:
            for prop in new_props:
                properties[prop["id"]] = as_record(prop, seen_at)

    write_state(properties)
    if not new_props:
        status = "nothing to announce"
    elif delivered:
        status = "alert sent"
    else:
        status = "ALL CHANNELS FAILED, will retry next run"
    print(f"Scraped {len(found)} {plural(len(found))}, {len(new_props)} new, {status}.")
    if not delivered:
        sys.exit(1)


if __name__ == "__main__":
    main()
