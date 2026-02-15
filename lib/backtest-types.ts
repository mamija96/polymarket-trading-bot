export interface BacktestConfig {
  drop_threshold: number
  lookback_seconds: number
  take_profit: number
  stop_loss: number
  size: number
  max_positions: number
  starting_equity: number
}

export interface Trade {
  market_slug: string
  side: "up" | "down"
  entry_price: number
  exit_price: number
  entry_time: number
  exit_time: number
  size_usdc: number
  size_shares: number
  pnl: number
  exit_type: "take_profit" | "stop_loss" | "market_end"
}

export interface BacktestSummary {
  total_pnl: number
  return_pct: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  avg_win: number
  avg_loss: number
  profit_factor: number
  max_drawdown_pct: number
  max_drawdown_dollars: number
  sharpe_ratio: number
  exit_counts: Record<string, number>
}

export interface EquityPoint {
  time: number
  equity: number
}

export interface BacktestResult {
  config: BacktestConfig
  data_source: string
  markets_analyzed: number
  summary: BacktestSummary
  trades: Trade[]
  equity_curve: EquityPoint[]
}
