import json
import os
import urllib.error
import urllib.request
from html import escape

RESEND_URL = "https://api.resend.com/emails"
GITHUB_API = "https://api.github.com"
TIMEOUT = 30

FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
WRAP = f"font-family:{FONT};color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;"
HEADING = "font-size:20px;line-height:1.3;margin:0 0 6px;font-weight:700;"
SUBTLE = "font-size:14px;color:#555555;margin:0 0 20px;"
CARD = "border:1px solid #e5e5e5;border-radius:6px;padding:14px 16px;margin:0 0 12px;"
LINK = "color:#0071c2;text-decoration:none;"
NAME_LINK = f"font-size:16px;font-weight:700;{LINK}"
PRICE = "font-size:14px;color:#333333;margin:6px 0 0;"
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


def send_email(subject: str, html: str, config: dict) -> None:
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    recipient = os.environ.get("ALERT_EMAIL", "").strip()
    if not api_key or not recipient:
        print(f"[DRY RUN] would send: {subject}")
        print(html)
        return
    _post_json(
        RESEND_URL,
        {"Authorization": f"Bearer {api_key}"},
        {
            "from": config["from_email"],
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


def _property_block(prop: dict, search_url: str) -> str:
    name = escape(prop.get("name") or "Unnamed property")
    url = escape(prop.get("url") or search_url)
    price = prop.get("price")
    price_html = f'<p style="{PRICE}">{escape(price)}</p>' if price else ""
    return (
        f'<div style="{CARD}">'
        f'<a href="{url}" style="{NAME_LINK}">{name}</a>'
        f"{price_html}</div>"
    )


def _footer(config: dict) -> str:
    url = escape(config["search_url"])
    return f'<p style="{FOOTER}"><a href="{url}" style="{LINK}">View full search</a></p>'


def build_alert_html(new_props: list[dict], config: dict) -> str:
    label = escape(config.get("search_label", ""))
    blocks = "".join(_property_block(prop, config["search_url"]) for prop in new_props)
    return (
        f'<div style="{WRAP}">'
        f'<h1 style="{HEADING}">New properties on your Booking.com search</h1>'
        f'<p style="{SUBTLE}">{label}</p>'
        f"{blocks}{_footer(config)}</div>"
    )


def build_startup_html(count: int, config: dict) -> str:
    label = escape(config.get("search_label", ""))
    noun = "property" if count == 1 else "properties"
    return (
        f'<div style="{WRAP}">'
        f'<h1 style="{HEADING}">Booking.com monitoring is live</h1>'
        f'<p style="{SUBTLE}">{label}</p>'
        f'<p style="font-size:15px;line-height:1.5;margin:0;">'
        f"Now tracking <strong>{count}</strong> {noun} on this search. "
        "You will get an alert whenever a new one shows up.</p>"
        f"{_footer(config)}</div>"
    )


def _md(text: str) -> str:
    for char in "\\`*_[]<>#":
        text = text.replace(char, "\\" + char)
    return text


def build_alert_markdown(new_props: list[dict], config: dict) -> str:
    lines = [f"**{_md(config.get('search_label', ''))}**", ""]
    for prop in new_props:
        name = _md(prop.get("name") or "Unnamed property")
        url = prop.get("url") or config["search_url"]
        price = f" — {_md(prop['price'])}" if prop.get("price") else ""
        lines.append(f"- **[{name}](<{url}>)**{price}")
    lines += ["", f"[View full search](<{config['search_url']}>)"]
    if config.get("cc"):
        lines += ["", f"cc {config['cc']}"]
    return "\n".join(lines)


def build_startup_markdown(count: int, config: dict) -> str:
    noun = "property" if count == 1 else "properties"
    lines = [
        f"**{_md(config.get('search_label', ''))}**",
        "",
        f"Monitoring is now live, tracking **{count}** {noun} on this search.",
        "You will get an alert whenever a new one shows up.",
        "",
        f"[View full search](<{config['search_url']}>)",
    ]
    if config.get("cc"):
        lines += ["", f"cc {config['cc']}"]
    return "\n".join(lines)
