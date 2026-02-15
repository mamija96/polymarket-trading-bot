/**
 * TypeScript backtest engine - mirrors the Python flash crash strategy logic.
 *
 * Generates synthetic market data and replays the strategy tick-by-tick,
 * producing a BacktestResult that the dashboard components consume.
 */

import type {
  BacktestConfig,
  BacktestResult,
  BacktestSummary,
  EquityPoint,
  Trade,
} from "./backtest-types"

// ── Seeded PRNG ──────────────────────────────────────────────────────────────

class SeededRandom {
  private seed: number

  constructor(seed: number) {
    this.seed = seed
  }

  next(): number {
    this.seed = (this.seed * 16807 + 0) % 2147483647
    return (this.seed - 1) / 2147483646
  }

  uniform(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo)
  }

  randint(lo: number, hi: number): number {
    return Math.floor(this.uniform(lo, hi + 1))
  }

  gauss(mu: number, sigma: number): number {
    const u1 = this.next()
    const u2 = this.next()
    return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  }

  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }
}

// ── Synthetic data generation ────────────────────────────────────────────────

interface PriceTick {
  t: number
  p: number
}

interface MarketData {
  slug: string
  startTs: number
  endTs: number
  upPrices: PriceTick[]
  downPrices: PriceTick[]
}

type RecoveryType = "full" | "partial" | "none" | "further_drop"

function generateSingleMarket(
  startTs: number,
  opts: {
    duration?: number
    hasCrash?: boolean
    crashSide?: "up" | "down"
    crashMagnitude?: number
    crashTimePct?: number
    recoveryType?: RecoveryType
    seed?: number
  } = {},
): { upPrices: PriceTick[]; downPrices: PriceTick[] } {
  const {
    duration = 900,
    hasCrash = false,
    crashSide = "up",
    crashMagnitude = 0.35,
    crashTimePct = 0.5,
    recoveryType = "full",
    seed = 42,
  } = opts

  const rng = new SeededRandom(seed)
  let upPrice = 0.5 + rng.uniform(-0.05, 0.05)
  const upPrices: PriceTick[] = []
  const downPrices: PriceTick[] = []

  const crashTick = hasCrash ? Math.floor(duration * crashTimePct) : -1
  const recoveryTicks = rng.randint(30, 120)

  for (let tick = 0; tick < duration; tick++) {
    const t = startTs + tick

    // Random walk
    upPrice += rng.gauss(0, 0.003)

    // Flash crash over 2-4 ticks
    if (hasCrash && tick >= crashTick && tick < crashTick + 3) {
      const dropPerTick = crashMagnitude / 3
      if (crashSide === "up") upPrice -= dropPerTick
      else upPrice += dropPerTick
    }

    // Recovery behaviour
    if (hasCrash && tick > crashTick + 3 && tick <= crashTick + 3 + recoveryTicks) {
      let rate = 0
      if (recoveryType === "full") {
        rate = (crashMagnitude / recoveryTicks) * rng.uniform(0.6, 0.9)
      } else if (recoveryType === "partial") {
        rate = (crashMagnitude / recoveryTicks) * rng.uniform(0.2, 0.4)
      } else if (recoveryType === "none") {
        rate = rng.gauss(0, 0.001)
      } else {
        rate = -0.001 * rng.uniform(0.5, 1.5)
      }
      if (crashSide === "up") upPrice += rate
      else upPrice -= rate
    }

    upPrice = Math.max(0.02, Math.min(0.98, upPrice))
    const downPrice = Math.max(0.02, Math.min(0.98, 1.0 - upPrice + rng.gauss(0, 0.005)))

    upPrices.push({ t, p: Math.round(upPrice * 10000) / 10000 })
    downPrices.push({ t, p: Math.round(downPrice * 10000) / 10000 })
  }

  return { upPrices, downPrices }
}

export function generateSyntheticData(
  numMarkets = 60,
  crashProbability = 0.5,
  seed = 123,
): MarketData[] {
  const rng = new SeededRandom(seed)
  const markets: MarketData[] = []

  const names = [
    "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "DOT", "MATIC", "LINK",
    "UNI", "AAVE", "CRV", "MKR", "COMP", "SNX", "SUSHI", "YFI", "SAND", "MANA",
  ]

  for (let i = 0; i < numMarkets; i++) {
    const baseName = names[i % names.length]
    const startTs = 1700000000 + i * 1200

    const hasCrash = rng.next() < crashProbability
    const crashSide = rng.choice<"up" | "down">(["up", "down"])
    const crashMagnitude = rng.uniform(0.2, 0.45)
    const crashTimePct = rng.uniform(0.15, 0.75)

    const roll = rng.next()
    const recoveryType: RecoveryType =
      roll < 0.4 ? "full" : roll < 0.6 ? "partial" : roll < 0.8 ? "none" : "further_drop"

    const { upPrices, downPrices } = generateSingleMarket(startTs, {
      hasCrash,
      crashSide,
      crashMagnitude,
      crashTimePct,
      recoveryType,
      seed: seed + i,
    })

    markets.push({
      slug: `${baseName}-15min-${i + 1}`,
      startTs,
      endTs: startTs + 900,
      upPrices,
      downPrices,
    })
  }

  return markets
}

// ── Backtest engine ──────────────────────────────────────────────────────────

interface PriceRecord {
  timestamp: number
  price: number
}

interface OpenPosition {
  side: "up" | "down"
  entryPrice: number
  entryTime: number
  sizeUsdc: number
  sizeShares: number
  tpPrice: number
  slPrice: number
  marketSlug: string
}

export function runBacktest(
  config: BacktestConfig,
  markets: MarketData[],
): BacktestResult {
  const trades: Trade[] = []
  let equity = config.starting_equity
  const equityCurve: EquityPoint[] = [{ time: 0, equity }]

  let peakEquity = equity
  let maxDrawdownDollars = 0
  let maxDrawdownPct = 0
  let tradeIndex = 0

  for (const market of markets) {
    // Price history buffers (mimics PriceTracker from Python)
    const history: Record<string, PriceRecord[]> = { up: [], down: [] }
    let position: OpenPosition | null = null

    const ticks = market.upPrices.length

    for (let i = 0; i < ticks; i++) {
      const upTick = market.upPrices[i]
      const downTick = market.downPrices[i]

      // Record prices
      history.up.push({ timestamp: upTick.t, price: upTick.p })
      history.down.push({ timestamp: downTick.t, price: downTick.p })

      // Trim to last 200 entries
      if (history.up.length > 200) history.up.shift()
      if (history.down.length > 200) history.down.shift()

      // ── Check TP/SL for open position ──
      if (position) {
        const currentPrice =
          position.side === "up" ? upTick.p : downTick.p
        const pnl = (currentPrice - position.entryPrice) * position.sizeShares

        if (currentPrice >= position.tpPrice) {
          // Take profit
          equity += pnl
          trades.push({
            market_slug: position.marketSlug,
            side: position.side,
            entry_price: position.entryPrice,
            exit_price: currentPrice,
            entry_time: position.entryTime,
            exit_time: upTick.t,
            size_usdc: position.sizeUsdc,
            size_shares: position.sizeShares,
            pnl,
            exit_type: "take_profit",
          })
          position = null
          tradeIndex++
        } else if (currentPrice <= position.slPrice) {
          // Stop loss
          equity += pnl
          trades.push({
            market_slug: position.marketSlug,
            side: position.side,
            entry_price: position.entryPrice,
            exit_price: currentPrice,
            exit_time: upTick.t,
            entry_time: position.entryTime,
            size_usdc: position.sizeUsdc,
            size_shares: position.sizeShares,
            pnl,
            exit_type: "stop_loss",
          })
          position = null
          tradeIndex++
        }
      }

      // ── Flash crash detection (no open position) ──
      if (!position) {
        for (const side of ["up", "down"] as const) {
          const h = history[side]
          if (h.length < 3) continue

          const currentPrice = h[h.length - 1].price
          const cutoffTime = h[h.length - 1].timestamp - config.lookback_seconds

          // Find oldest price within lookback window
          let oldPrice: number | null = null
          for (const pt of h) {
            if (pt.timestamp >= cutoffTime) {
              oldPrice = pt.price
              break
            }
          }

          if (oldPrice === null) continue

          const drop = oldPrice - currentPrice
          if (drop >= config.drop_threshold) {
            // Entry signal
            const entryPrice = currentPrice
            const sizeShares =
              entryPrice > 0 ? config.size / entryPrice : 0

            if (sizeShares <= 0) continue

            position = {
              side,
              entryPrice,
              entryTime: upTick.t,
              sizeUsdc: config.size,
              sizeShares,
              tpPrice: entryPrice + config.take_profit,
              slPrice: entryPrice - config.stop_loss,
              marketSlug: market.slug,
            }
            break // only one position at a time
          }
        }
      }

      // Update equity curve every 10 ticks
      if (i % 10 === 0 || i === ticks - 1) {
        equityCurve.push({ time: tradeIndex + i / ticks, equity })
      }

      // Track drawdown
      if (equity > peakEquity) peakEquity = equity
      const dd = peakEquity - equity
      if (dd > maxDrawdownDollars) {
        maxDrawdownDollars = dd
        maxDrawdownPct = peakEquity > 0 ? (dd / peakEquity) * 100 : 0
      }
    }

    // Force close at market end
    if (position) {
      const lastUp = market.upPrices[market.upPrices.length - 1]
      const lastDown = market.downPrices[market.downPrices.length - 1]
      const exitPrice = position.side === "up" ? lastUp.p : lastDown.p
      const pnl = (exitPrice - position.entryPrice) * position.sizeShares

      equity += pnl
      trades.push({
        market_slug: position.marketSlug,
        side: position.side,
        entry_price: position.entryPrice,
        exit_price: exitPrice,
        entry_time: position.entryTime,
        exit_time: position.side === "up" ? lastUp.t : lastDown.t,
        size_usdc: position.sizeUsdc,
        size_shares: position.sizeShares,
        pnl,
        exit_type: "market_end",
      })
      position = null
      tradeIndex++
    }
  }

  // ── Compute summary statistics ──

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
  const winners = trades.filter((t) => t.pnl >= 0)
  const losers = trades.filter((t) => t.pnl < 0)

  const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + t.pnl, 0) / winners.length : 0
  const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((s, t) => s + t.pnl, 0) / losers.length) : 0
  const totalWins = winners.reduce((s, t) => s + t.pnl, 0)
  const totalLosses = Math.abs(losers.reduce((s, t) => s + t.pnl, 0))
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0

  const exitCounts: Record<string, number> = {}
  for (const t of trades) {
    exitCounts[t.exit_type] = (exitCounts[t.exit_type] || 0) + 1
  }

  // Simplified Sharpe (mean pnl / std pnl)
  const meanPnl = trades.length > 0 ? totalPnl / trades.length : 0
  const variance =
    trades.length > 1
      ? trades.reduce((s, t) => s + (t.pnl - meanPnl) ** 2, 0) / (trades.length - 1)
      : 0
  const sharpe = variance > 0 ? meanPnl / Math.sqrt(variance) : 0

  const summary: BacktestSummary = {
    total_pnl: Math.round(totalPnl * 100) / 100,
    return_pct:
      Math.round(
        ((equity - config.starting_equity) / config.starting_equity) * 10000,
      ) / 100,
    total_trades: trades.length,
    winning_trades: winners.length,
    losing_trades: losers.length,
    win_rate: trades.length > 0 ? Math.round((winners.length / trades.length) * 10000) / 100 : 0,
    avg_win: Math.round(avgWin * 100) / 100,
    avg_loss: Math.round(avgLoss * 100) / 100,
    profit_factor: Math.round(profitFactor * 100) / 100,
    max_drawdown_pct: Math.round(maxDrawdownPct * 100) / 100,
    max_drawdown_dollars: Math.round(maxDrawdownDollars * 100) / 100,
    sharpe_ratio: Math.round(sharpe * 100) / 100,
    exit_counts: exitCounts,
  }

  // Downsample equity curve to ~200 points
  const step = Math.max(1, Math.floor(equityCurve.length / 200))
  const sampledCurve = equityCurve.filter((_, i) => i % step === 0 || i === equityCurve.length - 1)

  return {
    config,
    data_source: "synthetic",
    markets_analyzed: markets.length,
    summary,
    trades: trades.map((t) => ({
      ...t,
      pnl: Math.round(t.pnl * 100) / 100,
      entry_price: Math.round(t.entry_price * 10000) / 10000,
      exit_price: Math.round(t.exit_price * 10000) / 10000,
      size_shares: Math.round(t.size_shares * 100) / 100,
    })),
    equity_curve: sampledCurve.map((p) => ({
      time: Math.round(p.time * 100) / 100,
      equity: Math.round(p.equity * 100) / 100,
    })),
  }
}
