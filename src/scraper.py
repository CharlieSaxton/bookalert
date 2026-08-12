"""Scrape Booking.com search results into structured property records."""

import json
import re
import sys
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from playwright.sync_api import Error as PlaywrightError, sync_playwright

RESULTS_PER_PAGE = 25
NAV_TIMEOUT_MS = 60_000
CARD = 'div[data-testid="property-card"]'
LINK_SELECTORS = (
    'a[data-testid="title-link"]',
    'a[data-testid="property-card-desktop-single-image"]',
    'a[href*="/hotel/"]',
)
STAY_PARAMS = ("checkin", "checkout", "group_adults", "group_children", "no_rooms", "age")
# Decline first; accept only as a fallback.
CONSENT_SELECTORS = (
    "#onetrust-reject-all-handler",
    '[data-testid="cookie-banner-decline"]',
    "#onetrust-accept-btn-handler",
)
DISMISS_SELECTORS = ('button[aria-label^="Dismiss sign"]',)
RATING_SELECTORS = ('[data-testid="review-score"]', '[aria-label*="Scored"]')
# The slug may carry a locale suffix: /hotel/gb/the-savoy.en-gb.html
HOTEL_PATH_RE = re.compile(r"/hotel/([a-z]{2})/([^/?#]+?)(?:\.[a-z]{2}(?:-[a-z]{2})?)?\.html", re.I)
NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?")


def _chrome_user_agent(browser_version: str) -> str:
    major = browser_version.split(".")[0] or "140"
    return (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        f"(KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36"
    )


def _page_url(search_url: str, offset: int) -> str:
    parsed = urlparse(search_url)
    params = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k != "offset"]
    if offset:
        params.append(("offset", str(offset)))
    return urlunparse(parsed._replace(query=urlencode(params)))


def _stay_params(search_url: str) -> list[tuple[str, str]]:
    query = parse_qsl(urlparse(search_url).query, keep_blank_values=True)
    return [(k, v) for k, v in query if k in STAY_PARAMS]


def _hotel_id(href: str) -> str | None:
    match = HOTEL_PATH_RE.search(urlparse(href).path)
    return f"{match.group(1)}/{match.group(2)}".lower() if match else None


def _clean_hotel_url(href: str, stay: list[tuple[str, str]]) -> str | None:
    parsed = urlparse(href)
    if not HOTEL_PATH_RE.search(parsed.path):
        return None
    params = stay or [(k, v) for k, v in parse_qsl(parsed.query) if k in STAY_PARAMS]
    return urlunparse(("https", "www.booking.com", parsed.path, "", urlencode(params), ""))


def _first_attr(scope, selectors: tuple[str, ...], attr: str) -> str | None:
    for selector in selectors:
        try:
            value = scope.locator(selector).first.get_attribute(attr, timeout=1_000)
        except PlaywrightError:
            continue
        if value:
            return value.strip()
    return None


def _first_text(scope, selector: str) -> str | None:
    try:
        text = scope.locator(selector).first.inner_text(timeout=1_000)
    except PlaywrightError:
        return None
    return " ".join(text.split()) or None


def _parse_rating(text: str | None) -> float | None:
    # "Scored 8.7 8.7 Fabulous 2,986 reviews" -> 8.7. A group of 2+ digits after the
    # separator is a thousands separator (review count), not a score.
    for token in NUMBER_RE.findall(text or ""):
        whole, _, fraction = token.replace(",", ".").partition(".")
        if len(fraction) > 1:
            continue
        value = float(f"{whole}.{fraction or 0}")
        if 0 <= value <= 10:
            return value
    return None


def _rating(card) -> float | None:
    try:
        for selector in RATING_SELECTORS:
            rating = _parse_rating(_first_text(card, selector))
            if rating is not None:
                return rating
        return _parse_rating(_first_attr(card, RATING_SELECTORS, "aria-label"))
    except Exception:
        return None


def _goto(page, url: str, attempts: int = 3) -> None:
    # Booking aborts the first navigation to a search page often enough that a single
    # goto() raises ERR_ABORTED; retrying the same URL succeeds.
    last_error = None
    for attempt in range(attempts):
        try:
            page.goto(url, wait_until="domcontentloaded")
            return
        except PlaywrightError as error:
            last_error = error
            page.wait_for_timeout(1_000 * (attempt + 1))
    raise RuntimeError(f"Could not load {url}: {last_error}")


def _dismiss_overlays(page) -> None:
    for selector in CONSENT_SELECTORS + DISMISS_SELECTORS:
        button = page.locator(selector).first
        try:
            button.wait_for(state="visible", timeout=1_200)
            button.click(timeout=5_000)
        except PlaywrightError:
            continue
        page.wait_for_timeout(400)
        if selector in CONSENT_SELECTORS:
            break


def _scroll_through(page) -> None:
    previous, settled = -1, 0
    for _ in range(60):
        page.evaluate("window.scrollBy(0, window.innerHeight * 0.8)")
        page.wait_for_timeout(350)
        count = page.locator(CARD).count()
        settled = settled + 1 if count == previous else 0
        previous = count
        at_bottom = page.evaluate(
            "window.innerHeight + window.scrollY >= document.body.scrollHeight - 300"
        )
        if at_bottom and settled >= 3:
            return
    page.wait_for_timeout(500)


def _card_record(card, stay: list[tuple[str, str]]) -> dict | None:
    href = _first_attr(card, LINK_SELECTORS, "href")
    hotel_id = _hotel_id(href) if href else None
    if not hotel_id:
        hotel_id = _first_attr(card, ("[data-hotelid]",), "data-hotelid")
    url = _clean_hotel_url(href, stay) if href else None
    name = _first_text(card, '[data-testid="title"]')
    if not (hotel_id and url and name):
        return None
    price = _first_text(card, '[data-testid="price-and-discounted-price"]')
    return {"id": hotel_id, "name": name, "url": url, "price": price, "rating": _rating(card)}


def _collect_page(page, stay: list[tuple[str, str]]) -> list[dict]:
    try:
        page.wait_for_selector(CARD, timeout=30_000)
    except PlaywrightError:
        return []
    _scroll_through(page)
    records = (_card_record(card, stay) for card in page.locator(CARD).all())
    return [record for record in records if record]


def fetch_properties(search_url: str, max_pages: int = 2) -> list[dict]:
    stay = _stay_params(search_url)
    found: dict[str, dict] = {}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True, args=["--disable-blink-features=AutomationControlled"]
        )
        context = browser.new_context(
            user_agent=_chrome_user_agent(browser.version),
            viewport={"width": 1440, "height": 900},
            locale="en-GB",
            timezone_id="Europe/London",
            extra_http_headers={"Accept-Language": "en-GB,en;q=0.9"},
        )
        context.set_default_navigation_timeout(NAV_TIMEOUT_MS)
        page = context.new_page()
        page.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
        try:
            # Landing on the homepage first seeds the cookies the search page expects.
            try:
                _goto(page, "https://www.booking.com/")
                _dismiss_overlays(page)
            except RuntimeError:
                pass
            for index in range(max(1, max_pages)):
                _goto(page, _page_url(search_url, index * RESULTS_PER_PAGE))
                _dismiss_overlays(page)
                records = _collect_page(page, stay)
                for record in records:
                    found.setdefault(record["id"], record)
                if len(records) < RESULTS_PER_PAGE:
                    break
        finally:
            context.close()
            browser.close()
    if not found:
        raise RuntimeError(
            f"No property cards found for {search_url!r} — Booking.com either blocked the "
            "request or changed its search-results markup."
        )
    return list(found.values())


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: scraper.py <booking-search-url> [max_pages]", file=sys.stderr)
        raise SystemExit(2)
    properties = fetch_properties(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 2)
    print(json.dumps(properties, indent=2, ensure_ascii=False))
    print(f"{len(properties)} properties", file=sys.stderr)
