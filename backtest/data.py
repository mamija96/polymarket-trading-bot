"""
Data Module - Historical Price Data Fetching & Synthetic Generation

Provides two data sources for backtesting:
1. Live data from Polymarket CLOB /prices-history endpoint
2. Synthetic data with configurable flash crash scenarios

Both return the same structure for interchangeability.
"""

import json
import math
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests


# ── Data structures ──────────────────────────────────────────────────────────

MarketData = Dict[str, Any]
# {
#     "slug": str,
#     "start_ts": int,
#     "end_ts": int,
#     "up_prices": [{"t": float, "p": float}, ...],
#     "down_prices": [{"t": float, "p": float}, ...],
# }


# ── Live Polymarket data ─────────────────────────────────────────────────────

CLOB_HOST = "https://clob.polymarket.com"
GAMMA_HOST = "https://gamma-api.polymarket.com"

COIN_SLUGS = {
    "BTC": "btc-updown-15m",
    "ETH": "eth-updown-15m",
    "SOL": "sol-updown-15m",
    "XRP": "xrp-updown-15m",
}


def fetch_price_history(
    token_id: str,
    start_ts: int,
    end_ts: int,
    fidelity: int = 1,
) -> List[Dict[str, float]]:
    """
    Fetch price history from Polymarket CLOB API.

    Args:
        token_id: CLOB token ID
        start_ts: Start Unix timestamp
        end_ts: End Unix timestamp
        fidelity: Resolution in minutes (1 = per-minute)

    Returns:
        List of {"t": timestamp, "p": price}
    """
    url = f"{CLOB_HOST}/prices-history"
    params = {
        "market": token_id,
        "startTs": start_ts,
        "endTs": end_ts,
        "fidelity": fidelity,
    }

    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return data.get("history", [])
    except Exception as e:
        print(f"  [warn] Failed to fetch price history for {token_id}: {e}")
        return []


def _get_market_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    """Fetch market data from Gamma API by slug."""
    url = f"{GAMMA_HOST}/markets/slug/{slug}"
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception:
        return None


def _parse_json_field(value: Any) -> list:
    """Parse a JSON field that may be a string or list."""
    if isinstance(value, str):
        return json.loads(value)
    return value


def _parse_token_ids(market: Dict[str, Any]) -> Dict[str, str]:
    """Extract up/down token IDs from market data."""
    clob_token_ids = market.get("clobTokenIds", "[]")
    token_ids = _parse_json_field(clob_token_ids)

    outcomes = market.get("outcomes", '["Up", "Down"]')
    outcomes = _parse_json_field(outcomes)

    result: Dict[str, str] = {}
    for i, outcome in enumerate(outcomes):
        if i < len(token_ids):
            result[str(outcome).lower()] = token_ids[i]
    return result


def fetch_market_history(
    coin: str = "ETH",
    num_markets: int = 10,
    fidelity: int = 1,
) -> List[MarketData]:
    """
    Fetch historical 15-minute market data from Polymarket.

    Looks back through recent 15-minute windows and fetches
    price history for both UP and DOWN tokens.

    Args:
        coin: Coin symbol (BTC, ETH, SOL, XRP)
        num_markets: Number of past markets to fetch
        fidelity: Price resolution in minutes

    Returns:
        List of MarketData dictionaries
    """
    coin = coin.upper()
    if coin not in COIN_SLUGS:
        raise ValueError(f"Unsupported coin: {coin}. Use: {list(COIN_SLUGS.keys())}")

    prefix = COIN_SLUGS[coin]
    now = datetime.now(timezone.utc)

    # Current 15-min window start
    minute = (now.minute // 15) * 15
    current_window = now.replace(minute=minute, second=0, microsecond=0)
    current_ts = int(current_window.timestamp())

    markets: List[MarketData] = []
    checked = 0
    max_attempts = num_markets * 3  # Look back further if some fail

    for i in range(1, max_attempts + 1):
        if len(markets) >= num_markets:
            break

        window_ts = current_ts - (i * 900)  # Go back 15 min each step
        slug = f"{prefix}-{window_ts}"

        print(f"  Fetching market: {slug} ...")
        market = _get_market_by_slug(slug)
        if not market:
            checked += 1
            continue

        token_ids = _parse_token_ids(market)
        up_id = token_ids.get("up", "")
        down_id = token_ids.get("down", "")

        if not up_id or not down_id:
            checked += 1
            continue

        start_ts = window_ts
        end_ts = window_ts + 900

        up_prices = fetch_price_history(up_id, start_ts, end_ts, fidelity)
        down_prices = fetch_price_history(down_id, start_ts, end_ts, fidelity)

        if up_prices or down_prices:
            markets.append({
                "slug": slug,
                "start_ts": start_ts,
                "end_ts": end_ts,
                "up_token_id": up_id,
                "down_token_id": down_id,
                "up_prices": up_prices,
                "down_prices": down_prices,
            })
            print(f"    Got {len(up_prices)} up ticks, {len(down_prices)} down ticks")
        else:
            print(f"    No price data available")

        checked += 1
        time.sleep(0.2)  # Rate limiting

    print(f"  Fetched {len(markets)} markets (checked {checked} windows)")
    return markets


# ── Synthetic data generation ────────────────────────────────────────────────


def _generate_single_market_prices(
    start_ts: int,
    duration_seconds: int = 900,
    has_crash: bool = False,
    crash_side: str = "up",
    crash_magnitude: float = 0.35,
    crash_time_pct: float = 0.5,
    seed: Optional[int] = None,
) -> Dict[str, List[Dict[str, float]]]:
    """
    Generate synthetic price data for a single 15-minute market.

    Simulates UP/DOWN binary outcome prices that sum roughly to 1.0.
    Optionally injects a flash crash event.

    Args:
        start_ts: Market start timestamp
        duration_seconds: Market duration (default 900 = 15 min)
        has_crash: Whether to inject a flash crash
        crash_side: Which side crashes ("up" or "down")
        crash_magnitude: How much the price drops (0.2 - 0.5)
        crash_time_pct: When in the market the crash happens (0-1)
        seed: Random seed for reproducibility

    Returns:
        {"up_prices": [...], "down_prices": [...]}
    """
    rng = random.Random(seed)

    # Start near 0.50 with small random offset
    up_price = 0.50 + rng.uniform(-0.05, 0.05)
    up_prices: List[Dict[str, float]] = []
    down_prices: List[Dict[str, float]] = []

    crash_tick = int(duration_seconds * crash_time_pct) if has_crash else -1
    crash_recovery_ticks = rng.randint(15, 60)  # Recovery over 15-60 seconds

    for tick in range(duration_seconds):
        t = start_ts + tick

        # Random walk
        drift = rng.gauss(0, 0.002)
        up_price += drift

        # Flash crash injection
        if has_crash and tick == crash_tick:
            if crash_side == "up":
                up_price -= crash_magnitude
            else:
                up_price += crash_magnitude  # Opposite side crash = UP spike

        # Gradual recovery after crash
        if has_crash and crash_tick < tick <= crash_tick + crash_recovery_ticks:
            recovery_rate = crash_magnitude / crash_recovery_ticks * 0.7
            if crash_side == "up":
                up_price += recovery_rate
            else:
                up_price -= recovery_rate

        # Clamp to valid range
        up_price = max(0.02, min(0.98, up_price))
        down_price = max(0.02, min(0.98, 1.0 - up_price + rng.gauss(0, 0.005)))

        up_prices.append({"t": t, "p": round(up_price, 4)})
        down_prices.append({"t": t, "p": round(down_price, 4)})

    return {"up_prices": up_prices, "down_prices": down_prices}


def generate_synthetic_data(
    num_markets: int = 20,
    crash_probability: float = 0.3,
    seed: int = 42,
) -> List[MarketData]:
    """
    Generate synthetic 15-minute market data.

    Creates realistic price series with configurable probability
    of flash crash events. Each market is a 15-minute window with
    1-second fidelity (900 data points per side).

    Args:
        num_markets: Number of synthetic markets
        crash_probability: Probability each market has a flash crash (0-1)
        seed: Master random seed for reproducibility

    Returns:
        List of MarketData dictionaries (same format as fetch_market_history)
    """
    rng = random.Random(seed)
    base_ts = int(time.time()) - (num_markets * 900)  # Start in the past

    markets: List[MarketData] = []

    for i in range(num_markets):
        start_ts = base_ts + (i * 900)
        end_ts = start_ts + 900

        has_crash = rng.random() < crash_probability
        crash_side = rng.choice(["up", "down"])
        crash_magnitude = rng.uniform(0.20, 0.50)
        crash_time_pct = rng.uniform(0.15, 0.80)

        market_seed = seed + i

        prices = _generate_single_market_prices(
            start_ts=start_ts,
            has_crash=has_crash,
            crash_side=crash_side,
            crash_magnitude=crash_magnitude,
            crash_time_pct=crash_time_pct,
            seed=market_seed,
        )

        markets.append({
            "slug": f"synthetic-market-{i + 1:03d}",
            "start_ts": start_ts,
            "end_ts": end_ts,
            "up_token_id": f"synthetic-up-{i + 1}",
            "down_token_id": f"synthetic-down-{i + 1}",
            "up_prices": prices["up_prices"],
            "down_prices": prices["down_prices"],
            "has_crash": has_crash,
            "crash_side": crash_side if has_crash else None,
            "crash_magnitude": crash_magnitude if has_crash else None,
        })

    crash_count = sum(1 for m in markets if m.get("has_crash"))
    print(f"Generated {num_markets} synthetic markets ({crash_count} with flash crashes)")
    return markets


# ── Caching helpers ──────────────────────────────────────────────────────────


def save_data(data: List[MarketData], filepath: str) -> None:
    """Save market data to JSON file."""
    path = Path(filepath)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Saved {len(data)} markets to {filepath}")


def load_data(filepath: str) -> List[MarketData]:
    """Load market data from JSON file."""
    with open(filepath, "r") as f:
        return json.load(f)
