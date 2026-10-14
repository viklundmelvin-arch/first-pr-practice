import json
from datetime import datetime, timezone

import pytest

from ev_scanner import book_prices, fair_probabilities, find_value_bets, format_message, save_state


def make_event(books):
    return {
        "id": "evt1",
        "sport_title": "EPL",
        "home_team": "Arsenal",
        "away_team": "Chelsea",
        "commence_time": "2099-01-01T15:00:00Z",
        "bookmakers": [
            {"title": title, "markets": [{"key": "h2h", "outcomes": [{"name": n, "price": p} for n, p in prices.items()]}]}
            for title, prices in books.items()
        ],
    }


def test_fair_probabilities_remove_margin():
    fair = fair_probabilities({"A": 1.90, "B": 1.90})
    assert fair == pytest.approx({"A": 0.5, "B": 0.5})
    assert sum(fair_probabilities({"H": 2.1, "D": 3.4, "A": 3.6}).values()) == pytest.approx(1.0)


def test_book_prices_drops_books_with_mismatched_outcomes():
    event = make_event({
        "B1": {"Arsenal": 2.0, "Draw": 3.5, "Chelsea": 4.0},
        "B2": {"Arsenal": 2.0, "Draw": 3.5, "Chelsea": 4.0},
        "B3": {"Arsenal": 1.5, "Chelsea": 2.5},
    })
    assert set(book_prices(event)) == {"B1", "B2"}


def test_find_value_bets_flags_outlier_price():
    event = make_event({
        "B1": {"Arsenal": 1.90, "Chelsea": 1.90},
        "B2": {"Arsenal": 1.90, "Chelsea": 1.90},
        "B3": {"Arsenal": 1.90, "Chelsea": 1.90},
        "Outlier": {"Arsenal": 2.20, "Chelsea": 1.65},
    })
    bets = find_value_bets(event, min_ev=0.03, min_books=4)
    assert len(bets) == 1
    bet = bets[0]
    assert bet["outcome"] == "Arsenal"
    assert bet["bookmaker"] == "Outlier"
    assert bet["ev"] == pytest.approx(bet["fair_prob"] * 2.20 - 1)
    assert bet["ev"] > 0.03


def test_find_value_bets_requires_min_books():
    event = make_event({"B1": {"A": 1.9, "B": 1.9}, "Outlier": {"A": 2.5, "B": 1.5}})
    assert find_value_bets(event, min_ev=0.0, min_books=3) == []


def test_find_value_bets_none_when_market_is_efficient():
    event = make_event({f"B{i}": {"A": 1.91, "B": 1.91} for i in range(5)})
    assert find_value_bets(event, min_ev=0.0, min_books=4) == []


def test_format_message_escapes_html():
    event = make_event({
        "B1": {"A<b>": 1.9, "B": 1.9}, "B2": {"A<b>": 1.9, "B": 1.9},
        "B3": {"A<b>": 1.9, "B": 1.9}, "X&Y": {"A<b>": 2.3, "B": 1.6},
    })
    message = format_message(find_value_bets(event, 0.03, 4)[0])
    assert "A&lt;b&gt;" in message
    assert "X&amp;Y" in message


def test_save_state_prunes_started_events(tmp_path):
    path = tmp_path / "state.json"
    state = {"old": "2000-01-01T00:00:00Z", "new": "2099-01-01T00:00:00Z"}
    save_state(str(path), state, datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert json.loads(path.read_text()) == {"new": "2099-01-01T00:00:00Z"}
