import { Dashboard } from "@/components/dashboard"
import { generateSyntheticData, runBacktest } from "@/lib/backtest-engine"
import type { BacktestConfig, BacktestResult } from "@/lib/backtest-types"

function getBacktestResult(): BacktestResult {
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
  console.log("[v0] Generated", markets.length, "markets")
  const result = runBacktest(config, markets)
  console.log("[v0] Backtest done:", result.summary.total_trades, "trades")
  return result
}

export default function Page() {
  let result: BacktestResult

  try {
    result = getBacktestResult()
  } catch (e) {
    console.error("[v0] Backtest engine error:", e)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Backtest Error</h1>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            {String(e)}
          </p>
        </div>
      </div>
    )
  }

  return <Dashboard result={result} />
}
