"""
Backtest CLI Runner

Run the flash crash strategy backtest from the command line.

Usage:
    # Synthetic data (default)
    python -m backtest.run_backtest --source synthetic --markets 30

    # Live Polymarket data
    python -m backtest.run_backtest --source live --coin ETH --markets 10

    # Custom strategy params
    python -m backtest.run_backtest --drop 0.25 --tp 0.15 --sl 0.03

    # Output to JSON for dashboard
    python -m backtest.run_backtest --output public/sample-result.json
"""

import argparse
import json
import sys
import os
from pathlib import Path

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backtest.data import (  # noqa: E402
    fetch_market_history,
    generate_synthetic_data,
    save_data,
    load_data,
)
from backtest.engine import BacktestConfig, BacktestEngine  # noqa: E402


def main():
    parser = argparse.ArgumentParser(
        description="Backtest the Polymarket Flash Crash Strategy"
    )

    # Data source
    parser.add_argument(
        "--source",
        choices=["live", "synthetic"],
        default="synthetic",
        help="Data source: live (Polymarket API) or synthetic (default: synthetic)",
    )
    parser.add_argument(
        "--coin",
        choices=["BTC", "ETH", "SOL", "XRP"],
        default="ETH",
        help="Coin for live data (default: ETH)",
    )
    parser.add_argument(
        "--markets",
        type=int,
        default=30,
        help="Number of markets to simulate (default: 30)",
    )
    parser.add_argument(
        "--crash-prob",
        type=float,
        default=0.3,
        help="Crash probability per market in synthetic mode (default: 0.3)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for synthetic data (default: 42)",
    )

    # Strategy parameters
    parser.add_argument(
        "--drop",
        type=float,
        default=0.30,
        help="Flash crash drop threshold (default: 0.30)",
    )
    parser.add_argument(
        "--lookback",
        type=int,
        default=10,
        help="Lookback window in seconds (default: 10)",
    )
    parser.add_argument(
        "--tp",
        type=float,
        default=0.10,
        help="Take profit delta (default: 0.10)",
    )
    parser.add_argument(
        "--sl",
        type=float,
        default=0.05,
        help="Stop loss delta (default: 0.05)",
    )
    parser.add_argument(
        "--size",
        type=float,
        default=5.0,
        help="Trade size in USDC (default: 5.0)",
    )
    parser.add_argument(
        "--equity",
        type=float,
        default=100.0,
        help="Starting equity in USDC (default: 100.0)",
    )

    # Output
    parser.add_argument(
        "--output",
        type=str,
        default="backtest/results/latest.json",
        help="Output JSON filepath (default: backtest/results/latest.json)",
    )
    parser.add_argument(
        "--cache",
        type=str,
        default=None,
        help="Cache data to/from this file (optional)",
    )

    args = parser.parse_args()

    # ── Load or generate data ────────────────────────────────────────────

    print("=" * 60)
    print("POLYMARKET FLASH CRASH STRATEGY BACKTEST")
    print("=" * 60)

    if args.cache and os.path.exists(args.cache):
        print(f"\nLoading cached data from {args.cache} ...")
        markets = load_data(args.cache)
        data_source = "cached"
    elif args.source == "live":
        print(f"\nFetching live data from Polymarket ({args.coin}, {args.markets} markets) ...")
        markets = fetch_market_history(
            coin=args.coin,
            num_markets=args.markets,
        )
        data_source = "live"
        if args.cache:
            save_data(markets, args.cache)
    else:
        print(f"\nGenerating synthetic data ({args.markets} markets, crash_prob={args.crash_prob}) ...")
        markets = generate_synthetic_data(
            num_markets=args.markets,
            crash_probability=args.crash_prob,
            seed=args.seed,
        )
        data_source = "synthetic"
        if args.cache:
            save_data(markets, args.cache)

    if not markets:
        print("ERROR: No market data available. Exiting.")
        sys.exit(1)

    # ── Configure and run engine ─────────────────────────────────────────

    config = BacktestConfig(
        drop_threshold=args.drop,
        lookback_seconds=args.lookback,
        take_profit=args.tp,
        stop_loss=args.sl,
        size=args.size,
        starting_equity=args.equity,
    )

    print(f"\nRunning backtest engine ({len(markets)} markets) ...")
    engine = BacktestEngine(config, markets, data_source=data_source)
    result = engine.run()

    # ── Output ───────────────────────────────────────────────────────────

    print()
    print(result.summary())

    # Save JSON
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(result.to_json(), f, indent=2)
    print(f"\nResults saved to {args.output}")


if __name__ == "__main__":
    main()
