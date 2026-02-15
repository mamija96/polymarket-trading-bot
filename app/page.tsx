import { Dashboard } from "@/components/dashboard"
import { generateSyntheticData, runBacktest } from "@/lib/backtest-engine"
import type { BacktestConfig, BacktestResult } from "@/lib/backtest-types"

/**
 * Generate backtest result server-side.
 *
 * Uses the same flash crash detection logic as the Python bot:
 * - Entry when probability drops by `drop_threshold` within `lookback_seconds`
 * - Exit at take_profit, stop_loss, or market end
 */
function getBacktestResult(): BacktestResult {
  console.log("[v0] Generating backtest result...")
  const config: BacktestConfig = {
    drop_threshold: 0.3,
    lookback_seconds: 10,
    take_profit: 0.1,
    stop_loss: 0.05,
    size: 5.0,
    max_positions: 1,
    starting_equity: 100,
  }

  const markets = generateSyntheticData(60, 0.5, 123)
  console.log("[v0] Generated", markets.length, "synthetic markets")
  const result = runBacktest(config, markets)
  console.log("[v0] Backtest complete:", result.summary.total_trades, "trades, PnL:", result.summary.total_pnl)
  return result
}

export default function Page() {
  const result = getBacktestResult()

  return <Dashboard result={result} />
}
