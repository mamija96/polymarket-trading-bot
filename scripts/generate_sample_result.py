"""
Generate sample backtest result JSON for the dashboard.

This script runs the backtest engine with synthetic data and saves
the output to public/sample-result.json for the Next.js dashboard.
"""

import json
import sys
import os

# Determine project root from this script's location
SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.argv[0] if sys.argv[0] else "."))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)  # scripts/ -> project root
if not os.path.exists(os.path.join(PROJECT_ROOT, "backtest")):
    # Fallback: try cwd
    PROJECT_ROOT = os.getcwd()
sys.path.insert(0, PROJECT_ROOT)

from backtest.data import generate_synthetic_data
from backtest.engine import BacktestConfig, BacktestEngine


print("Generating synthetic market data...")
markets = generate_synthetic_data(
    num_markets=40,
    crash_probability=0.35,
    seed=42,
)

config = BacktestConfig(
    drop_threshold=0.30,
    lookback_seconds=10,
    take_profit=0.10,
    stop_loss=0.05,
    size=5.0,
    starting_equity=100.0,
)

print(f"Running backtest on {len(markets)} markets...")
engine = BacktestEngine(config, markets, data_source="synthetic")
result = engine.run()

print(result.summary())

# Save to public/ for the dashboard
output_path = os.path.join(PROJECT_ROOT, "public", "sample-result.json")
os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, "w") as f:
    json.dump(result.to_json(), f, indent=2)

print(f"\nSaved to {output_path}")

# Also save to backtest/results/
results_dir = os.path.join(PROJECT_ROOT, "backtest", "results")
os.makedirs(results_dir, exist_ok=True)
results_path = os.path.join(results_dir, "latest.json")

with open(results_path, "w") as f:
    json.dump(result.to_json(), f, indent=2)

print(f"Saved to {results_path}")
