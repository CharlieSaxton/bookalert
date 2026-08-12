import json
import os
import urllib.error
import urllib.parse
import urllib.request
from html import escape

RESEND_URL = "https://api.resend.com/emails"
GITHUB_API = "https://api.github.com"
TIMEOUT = 30
FROM_EMAIL = "Booking Alerter <onboarding@resend.dev>"

FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
PAGE_BG = "#f2f4f7"

OUTER = f"width:100%;background:{PAGE_BG};border-collapse:collapse;"
OUTER_CELL = f"padding:24px 12px;font-family:{FONT};color:#1a1a1a;"
INNER = "width:100%;max-width:600px;border-collapse:collapse;text-align:left;"
HEADER_CELL = "padding:0 2px 16px;"
HEADING = f"font-family:{FONT};font-size:21px;line-height:1.3;margin:0 0 6px;font-weight:700;color:#1a1a1a;"
SUBTLE = f"font-family:{FONT};font-size:14px;line-height:1.4;color:#5a6472;margin:0;"
INTRO = f"font-family:{FONT};font-size:15px;line-height:1.5;color:#333333;margin:14px 0 0;"

CARD_CELL = "padding:0 0 12px;"
CARD = (
    "width:100%;background:#ffffff;border:1px solid #e3e5e8;border-radius:8px;"
    "border-collapse:separate;"
)
CARD_PAD = "padding:14px 16px;"
SPLIT = "width:100%;border-collapse:collapse;"

PHOTO_W = 140
PHOTO_H = 104
PHOTO_CELL = f"width:{PHOTO_W}px;padding:0 14px 0 0;"
PHOTO = (
    f"display:block;width:{PHOTO_W}px;height:{PHOTO_H}px;object-fit:cover;"
    "border-radius:6px;border:0;outline:none;text-decoration:none;"
    "background-color:#e9ecf1;color:#5a6472;font-size:12px;line-height:1.3;"
)

LINK = "color:#0071c2;text-decoration:none;"
NAME_LINK = f"font-family:{FONT};font-size:17px;font-weight:700;line-height:1.3;{LINK}"
ROOM = f"font-family:{FONT};font-size:13px;line-height:1.4;color:#3d4551;margin:8px 0 0;"
ROOM_LABEL = "color:#6b7480;"
PRICE = f"font-family:{FONT};font-size:17px;font-weight:700;line-height:1.3;color:#1a1a1a;margin:10px 0 0;"
RATING_TABLE = "border-collapse:separate;margin:10px 0 0;"
RATING_BADGE = (
    f"background:#003b95;border-radius:4px;padding:4px 7px;font-family:{FONT};"
    "font-size:13px;font-weight:700;line-height:1;color:#ffffff;white-space:nowrap;"
)
RATING_LABEL = f"padding-left:8px;font-family:{FONT};font-size:13px;color:#6b7480;"
BADGE = (
    "display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.04em;"
    "text-transform:uppercase;padding:2px 7px;border-radius:4px;margin-left:8px;"
    "background:#e8f3ff;color:#0058a3;vertical-align:middle;white-space:nowrap;"
)
FOOTER_CELL = "padding:12px 2px 0;border-top:1px solid #e3e5e8;"
FOOTER = f"font-family:{FONT};font-size:13px;line-height:1.4;color:#6b7480;margin:0;"


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


def send_email(subject: str, html: str, to_email, from_email: str = FROM_EMAIL) -> None:
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    raw = [to_email] if isinstance(to_email, str) else list(to_email or [])
    recipients = [address.strip() for address in raw if address and address.strip()]
    if not api_key or not recipients:
        print(f"[DRY RUN] would send to {', '.join(recipients) or '<no recipient>'}: {subject}")
        print(html)
        return
    _post_json(
        RESEND_URL,
        {"Authorization": f"Bearer {api_key}"},
        {
            "from": from_email or FROM_EMAIL,
            "to": recipients,
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


def _safe_url(value, fallback: str = "") -> str:
    """Only http(s) URLs survive; anything else (javascript:, data:) is dropped."""
    text = (value or "").strip() if isinstance(value, str) else ""
    if not text or any(char in text for char in "<>\"' \t\r\n"):
        return fallback
    try:
        scheme = urllib.parse.urlsplit(text).scheme.lower()
    except ValueError:
        return fallback
    return text if scheme in ("http", "https") else fallback


def _text(prop: dict, key: str) -> str:
    value = prop.get(key)
    return "" if value is None else str(value).strip()


def _rating_value(prop: dict) -> str | None:
    rating = prop.get("rating")
    if rating is None or rating == "":
        return None
    try:
        return f"{float(rating):.1f}"
    except (TypeError, ValueError):
        return None


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
    return _safe_url(search.get("search_url"), "https://www.booking.com/")


def _photo_cell(prop: dict) -> str:
    """Left photo column. Returns '' so the text column spans the card when there is no image."""
    image_url = _safe_url(prop.get("image_url"))
    if not image_url:
        return ""
    name = escape(_text(prop, "name") or "this property")
    return (
        f'<td width="{PHOTO_W}" valign="top" style="{PHOTO_CELL}">'
        f'<img src="{escape(image_url)}" width="{PHOTO_W}" height="{PHOTO_H}" '
        f'alt="Photo of {name}" style="{PHOTO}"></td>'
    )


def _rating_badge(prop: dict) -> str:
    rating = _rating_value(prop)
    if not rating:
        return ""
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="{RATING_TABLE}">'
        f'<tr><td bgcolor="#003b95" style="{RATING_BADGE}">{escape(rating)}</td>'
        f'<td style="{RATING_LABEL}">Guest rating</td></tr></table>'
    )


def _details_cell(prop: dict, search_url: str) -> str:
    name = escape(_text(prop, "name") or "Unnamed property")
    url = escape(_safe_url(prop.get("url"), search_url))
    badge = f'<span style="{BADGE}">room opened up</span>' if prop.get("returned") else ""
    room = _text(prop, "room_type")
    room_line = (
        f'<p style="{ROOM}"><span style="{ROOM_LABEL}">Room:</span> {escape(room)}</p>'
        if room
        else ""
    )
    price = _text(prop, "price")
    price_line = f'<p style="{PRICE}">{escape(price)}</p>' if price else ""
    return (
        f'<td valign="top" style="font-family:{FONT};">'
        f'<a href="{url}" style="{NAME_LINK}">{name}</a>{badge}'
        f"{room_line}{_rating_badge(prop)}{price_line}</td>"
    )


def _property_block(prop: dict, search_url: str) -> str:
    cells = f"{_photo_cell(prop)}{_details_cell(prop, search_url)}"
    return (
        f'<tr><td style="{CARD_CELL}">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="{CARD}">'
        f'<tr><td style="{CARD_PAD}">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="{SPLIT}">'
        f"<tr>{cells}</tr></table>"
        f"</td></tr></table></td></tr>"
    )


def _footer(search: dict) -> str:
    url = escape(_search_url(search))
    return (
        f'<tr><td style="{FOOTER_CELL}">'
        f'<p style="{FOOTER}"><a href="{url}" style="{LINK}">View full search</a></p>'
        f"</td></tr>"
    )


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
    search_url = _search_url(search)
    blocks = "".join(_property_block(prop, search_url) for prop in new_props)
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'bgcolor="{PAGE_BG}" style="{OUTER}">'
        f'<tr><td align="center" style="{OUTER_CELL}">'
        f'<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="{INNER}">'
        f'<tr><td style="{HEADER_CELL}">'
        f'<h1 style="{HEADING}">{escape(heading)}</h1>'
        f'<p style="{SUBTLE}">{escape(_label(search))}</p>{intro}'
        f"</td></tr>"
        f"{blocks}{_footer(search)}"
        f"</table></td></tr></table>"
    )


def _md(text: str) -> str:
    for char in "\\`*_[]<>#":
        text = text.replace(char, "\\" + char)
    return text


def build_alert_markdown(new_props: list[dict], search: dict, first_run: bool = False) -> str:
    search_url = _search_url(search)
    lines = [f"**{_md(_label(search))}**", ""]
    if first_run:
        lines += ["These are the properties matching right now.", ""]
    for prop in new_props:
        name = _md(_text(prop, "name") or "Unnamed property")
        url = _safe_url(prop.get("url"), search_url)
        parts = []
        price = _text(prop, "price")
        if price:
            parts.append(price)
        rating = _rating_value(prop)
        if rating:
            parts.append(f"rated {rating}")
        room = _text(prop, "room_type")
        if room:
            parts.append(f"room: {room}")
        if prop.get("returned"):
            parts.append("room opened up")
        image_url = _safe_url(prop.get("image_url"))
        meta = f" — {_md(' · '.join(parts))}" if parts else ""
        photo = f" ([photo](<{image_url}>))" if image_url else ""
        lines.append(f"- **[{name}](<{url}>)**{meta}{photo}")
    lines += ["", f"[View full search](<{search_url}>)"]
    return "\n".join(lines)
