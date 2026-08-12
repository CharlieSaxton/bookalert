import json
import os
import urllib.error
import urllib.request
from html import escape

RESEND_URL = "https://api.resend.com/emails"
GITHUB_API = "https://api.github.com"
TIMEOUT = 30
FROM_EMAIL = "Booking Alerter <onboarding@resend.dev>"

FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
WRAP = f"font-family:{FONT};color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;"
HEADING = "font-size:20px;line-height:1.3;margin:0 0 6px;font-weight:700;"
SUBTLE = "font-size:14px;color:#555555;margin:0 0 20px;"
INTRO = "font-size:15px;line-height:1.5;margin:0 0 20px;"
CARD = "border:1px solid #e5e5e5;border-radius:6px;padding:14px 16px;margin:0 0 12px;"
LINK = "color:#0071c2;text-decoration:none;"
NAME_LINK = f"font-size:16px;font-weight:700;{LINK}"
META = "font-size:14px;color:#333333;margin:6px 0 0;"
FOOTER = "font-size:13px;color:#777777;margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e5e5;"


def _post_json(url: str, headers: dict, payload: dict, label: str) -> None:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "bookalert/1.0 (+https://github.com/CharlieSaxton/bookalert)",
            **headers,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            response.read()
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace").strip()
        raise RuntimeError(f"{label} returned HTTP {error.code}: {body}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"{label} request failed: {error.reason}") from error


def send_email(subject: str, html: str, to_email: str, from_email: str = FROM_EMAIL) -> None:
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    recipient = (to_email or "").strip()
    if not api_key or not recipient:
        print(f"[DRY RUN] would send to {recipient or '<no recipient>'}: {subject}")
        print(html)
        return
    _post_json(
        RESEND_URL,
        {"Authorization": f"Bearer {api_key}"},
        {
            "from": from_email or FROM_EMAIL,
            "to": [recipient],
            "subject": subject,
            "html": html,
        },
        f"Resend '{subject}'",
    )


def create_github_issue(title: str, body_markdown: str) -> None:
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    if not token or not repo:
        print(f"[DRY RUN] would open issue: {title}")
        print(body_markdown)
        return
    _post_json(
        f"{GITHUB_API}/repos/{repo}/issues",
        {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        {"title": title, "body": body_markdown},
        f"GitHub issue '{title}'",
    )


def _rating_text(prop: dict) -> str | None:
    rating = prop.get("rating")
    if rating is None or rating == "":
        return None
    try:
        return f"{float(rating):.1f} ★"
    except (TypeError, ValueError):
        return None


def _meta_parts(prop: dict) -> list[str]:
    return [part for part in (prop.get("price"), _rating_text(prop)) if part]


def _label(search: dict) -> str:
    label = search.get("label") or "Booking.com search"
    rating = search.get("min_rating")
    if rating:
        try:
            return f"{label} · rated {float(rating):.1f}+"
        except (TypeError, ValueError):
            pass
    return label


def _search_url(search: dict) -> str:
    return search.get("search_url") or "https://www.booking.com/"


def _property_block(prop: dict, search_url: str) -> str:
    name = escape(prop.get("name") or "Unnamed property")
    url = escape(prop.get("url") or search_url)
    parts = _meta_parts(prop)
    meta = f'<p style="{META}">{escape(" · ".join(parts))}</p>' if parts else ""
    return (
        f'<div style="{CARD}">'
        f'<a href="{url}" style="{NAME_LINK}">{name}</a>'
        f"{meta}</div>"
    )


def _footer(search: dict) -> str:
    url = escape(_search_url(search))
    return f'<p style="{FOOTER}"><a href="{url}" style="{LINK}">View full search</a></p>'


def build_alert_html(new_props: list[dict], search: dict, first_run: bool = False) -> str:
    count = len(new_props)
    subject = "property currently matches" if count == 1 else "properties currently match"
    heading = (
        f"{count} {subject} your search"
        if first_run
        else "New properties on your Booking.com search"
    )
    intro = (
        f'<p style="{INTRO}">These are the properties matching right now. '
        f"From here on you will only hear from us when a new one appears.</p>"
        if first_run
        else ""
    )
    blocks = "".join(_property_block(prop, _search_url(search)) for prop in new_props)
    return (
        f'<div style="{WRAP}">'
        f'<h1 style="{HEADING}">{escape(heading)}</h1>'
        f'<p style="{SUBTLE}">{escape(_label(search))}</p>'
        f"{intro}{blocks}{_footer(search)}</div>"
    )


def _md(text: str) -> str:
    for char in "\\`*_[]<>#":
        text = text.replace(char, "\\" + char)
    return text


def build_alert_markdown(new_props: list[dict], search: dict, first_run: bool = False) -> str:
    lines = [f"**{_md(_label(search))}**", ""]
    if first_run:
        lines += ["These are the properties matching right now.", ""]
    for prop in new_props:
        name = _md(prop.get("name") or "Unnamed property")
        url = prop.get("url") or _search_url(search)
        parts = _meta_parts(prop)
        meta = f" — {_md(' · '.join(parts))}" if parts else ""
        lines.append(f"- **[{name}](<{url}>)**{meta}")
    lines += ["", f"[View full search](<{_search_url(search)}>)"]
    return "\n".join(lines)
