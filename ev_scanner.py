"""Scan The Odds API for +EV bets and send them to Telegram."""

import html
import json
import os
import sys
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone

ODDS_API_URL = "https://api.the-odds-api.com/v4/sports/{sport}/odds"
TELEGRAM_URL = "https://api.telegram.org/bot{token}/sendMessage"


def fair_probabilities(outcomes):
    """Remove the bookmaker margin from one book's prices: {name: price} -> {name: prob}."""
    implied = {name: 1 / price for name, price in outcomes.items()}
    total = sum(implied.values())
    return {name: p / total for name, p in implied.items()}


def book_prices(event, market="h2h"):
    """Return {bookmaker_title: {outcome_name: price}} for books that agree on the outcome set."""
    books = {}
    for book in event.get("bookmakers", []):
        for m in book.get("markets", []):
            if m.get("key") == market:
                prices = {o["name"]: o["price"] for o in m.get("outcomes", []) if o.get("price", 0) > 1}
                if prices:
                    books[book["title"]] = prices
    if not books:
        return {}
    common = Counter(frozenset(p) for p in books.values()).most_common(1)[0][0]
    return {title: prices for title, prices in books.items() if frozenset(prices) == common}


def find_value_bets(event, min_ev, min_books):
    books = book_prices(event)
    if len(books) < min_books:
        return []

    fair_per_book = [fair_probabilities(prices) for prices in books.values()]
    outcome_names = next(iter(books.values())).keys()
    consensus = {
        name: sum(f[name] for f in fair_per_book) / len(fair_per_book) for name in outcome_names
    }

    bets = []
    for name in outcome_names:
        best_book, best_price = max(((t, p[name]) for t, p in books.items()), key=lambda x: x[1])
        ev = consensus[name] * best_price - 1
        if ev >= min_ev:
            bets.append({
                "event_id": event["id"],
                "sport": event.get("sport_title", event.get("sport_key", "")),
                "home": event.get("home_team", ""),
                "away": event.get("away_team", ""),
                "commence_time": event["commence_time"],
                "outcome": name,
                "bookmaker": best_book,
                "price": best_price,
                "fair_prob": consensus[name],
                "fair_price": 1 / consensus[name],
                "ev": ev,
                "n_books": len(books),
            })
    return bets


def fetch_odds(api_key, sport, regions):
    query = urllib.parse.urlencode({
        "apiKey": api_key,
        "regions": regions,
        "markets": "h2h",
        "oddsFormat": "decimal",
    })
    with urllib.request.urlopen(f"{ODDS_API_URL.format(sport=sport)}?{query}", timeout=30) as resp:
        remaining = resp.headers.get("x-requests-remaining")
        print(f"[{sport}] API requests remaining: {remaining}")
        return json.load(resp)


def format_message(bet):
    kickoff = datetime.fromisoformat(bet["commence_time"].replace("Z", "+00:00"))
    e = html.escape
    return (
        f"<b>+EV {bet['ev']:.1%}</b> — {e(bet['sport'])}\n"
        f"{e(bet['home'])} vs {e(bet['away'])}\n"
        f"Start: {kickoff:%Y-%m-%d %H:%M} UTC\n\n"
        f"Spel: <b>{e(bet['outcome'])}</b>\n"
        f"Bästa odds: <b>{bet['price']:.2f}</b> hos {e(bet['bookmaker'])}\n"
        f"Fair odds: {bet['fair_price']:.2f} ({bet['fair_prob']:.1%}, snitt av {bet['n_books']} books)"
    )


def send_telegram(token, chat_id, text):
    data = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": "true",
    }).encode()
    with urllib.request.urlopen(TELEGRAM_URL.format(token=token), data=data, timeout=30) as resp:
        resp.read()


def load_state(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(path, state, now):
    live = {k: v for k, v in state.items() if datetime.fromisoformat(v.replace("Z", "+00:00")) > now}
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        json.dump(live, f, indent=2)


def main():
    api_key = os.environ.get("ODDS_API_KEY")
    if not api_key:
        sys.exit("ODDS_API_KEY is not set")
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    sports = [s.strip() for s in os.environ.get("SPORTS", "soccer_epl,soccer_sweden_allsvenskan").split(",") if s.strip()]
    regions = os.environ.get("REGIONS", "eu")
    min_ev = float(os.environ.get("MIN_EV", "0.03"))
    min_books = int(os.environ.get("MIN_BOOKS", "4"))
    max_alerts = int(os.environ.get("MAX_ALERTS", "10"))
    state_path = os.environ.get("STATE_FILE", "state/notified.json")

    now = datetime.now(timezone.utc)
    state = load_state(state_path)

    bets = []
    for sport in sports:
        for event in fetch_odds(api_key, sport, regions):
            kickoff = datetime.fromisoformat(event["commence_time"].replace("Z", "+00:00"))
            if kickoff > now:
                bets.extend(find_value_bets(event, min_ev, min_books))

    new_bets = [b for b in bets if f"{b['event_id']}|{b['outcome']}|{b['bookmaker']}" not in state]
    new_bets.sort(key=lambda b: b["ev"], reverse=True)
    print(f"Found {len(bets)} value bets, {len(new_bets)} new")

    for bet in new_bets[:max_alerts]:
        message = format_message(bet)
        if token and chat_id:
            send_telegram(token, chat_id, message)
        else:
            print(message, end="\n\n")
        state[f"{bet['event_id']}|{bet['outcome']}|{bet['bookmaker']}"] = bet["commence_time"]

    save_state(state_path, state, now)


if __name__ == "__main__":
    main()
