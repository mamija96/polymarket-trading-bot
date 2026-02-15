/**
 * Generate sample backtest result JSON for the dashboard.
 *
 * This script simulates the flash crash strategy backtest with synthetic data
 * and outputs the result as JSON - matching the structure produced by
 * backtest/engine.py's BacktestResult.to_json().
 *
 * It replicates the PriceTracker flash crash detection and TP/SL logic
 * from the Python bot to produce realistic backtest results.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ── Synthetic Data Generation ───────────────────────────────────────────────

class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 16807 + 0) % 2147483647;
    return this.seed / 2147483647;
  }

  uniform(min, max) {
    return min + this.next() * (max - min);
  }

  gauss(mean, std) {
    // Box-Muller transform
    const u1 = this.next();
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + std * z;
  }

  randint(min, max) {
    return Math.floor(this.uniform(min, max + 1));
  }

  choice(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

function generateSingleMarketPrices(startTs, options = {}) {
  const {
    duration = 900,
    hasCrash = false,
    crashSide = "up",
    crashMagnitude = 0.35,
    crashTimePct = 0.5,
    recoveryType = "full", // "full", "partial", "none", "further_drop"
    seed = 42,
  } = options;

  const rng = new SeededRandom(seed);
  let upPrice = 0.5 + rng.uniform(-0.05, 0.05);
  const upPrices = [];
  const downPrices = [];

  const crashTick = hasCrash ? Math.floor(duration * crashTimePct) : -1;
  const crashRecoveryTicks = rng.randint(30, 120);

  for (let tick = 0; tick < duration; tick++) {
    const t = startTs + tick;

    // Random walk - slightly higher volatility
    upPrice += rng.gauss(0, 0.003);

    // Flash crash injection - spread over 2-4 ticks for realism
    if (hasCrash && tick >= crashTick && tick < crashTick + 3) {
      const dropPerTick = crashMagnitude / 3;
      if (crashSide === "up") {
        upPrice -= dropPerTick;
      } else {
        upPrice += dropPerTick;
      }
    }

    // Recovery behavior depends on type
    if (hasCrash && tick > crashTick + 3 && tick <= crashTick + 3 + crashRecoveryTicks) {
      let recoveryRate = 0;

      if (recoveryType === "full") {
        // Recovers 80-100% - profitable trade
        recoveryRate = (crashMagnitude / crashRecoveryTicks) * rng.uniform(0.6, 0.9);
      } else if (recoveryType === "partial") {
        // Recovers only 30-50% - may still hit SL
        recoveryRate = (crashMagnitude / crashRecoveryTicks) * rng.uniform(0.2, 0.4);
      } else if (recoveryType === "none") {
        // Stays flat after crash - will hit SL or market_end
        recoveryRate = rng.gauss(0, 0.001);
      } else if (recoveryType === "further_drop") {
        // Keeps dropping - guaranteed SL
        recoveryRate = -0.001 * rng.uniform(0.5, 1.5);
      }

      if (crashSide === "up") {
        upPrice += recoveryRate;
      } else {
        upPrice -= recoveryRate;
      }
    }

    // Clamp
    upPrice = Math.max(0.02, Math.min(0.98, upPrice));
    const downPrice = Math.max(
      0.02,
      Math.min(0.98, 1.0 - upPrice + rng.gauss(0, 0.005))
    );

    upPrices.push({ t, p: Math.round(upPrice * 10000) / 10000 });
    downPrices.push({ t, p: Math.round(downPrice * 10000) / 10000 });
  }

  return { upPrices, downPrices };
}

function generateSyntheticData(numMarkets = 40, crashProbability = 0.35, seed = 42) {
  const rng = new SeededRandom(seed);
  const baseTs = Math.floor(Date.now() / 1000) - numMarkets * 900;
  const markets = [];

  for (let i = 0; i < numMarkets; i++) {
    const startTs = baseTs + i * 900;
    const endTs = startTs + 900;
    const hasCrash = rng.next() < crashProbability;
    const crashSide = rng.choice(["up", "down"]);
    const crashMagnitude = rng.uniform(0.20, 0.45);
    const crashTimePct = rng.uniform(0.15, 0.75);
    // Distribute recovery types: 40% full, 20% partial, 20% none, 20% further_drop
    const recoveryRoll = rng.next();
    const recoveryType = recoveryRoll < 0.4 ? "full" : recoveryRoll < 0.6 ? "partial" : recoveryRoll < 0.8 ? "none" : "further_drop";

    const { upPrices, downPrices } = generateSingleMarketPrices(startTs, {
      hasCrash,
      crashSide,
      crashMagnitude,
      crashTimePct,
      recoveryType,
      seed: seed + i,
    });

    markets.push({
      slug: `synthetic-market-${String(i + 1).padStart(3, "0")}`,
      start_ts: startTs,
      end_ts: endTs,
      up_prices: upPrices,
      down_prices: downPrices,
      has_crash: hasCrash,
      crash_side: hasCrash ? crashSide : null,
      crash_magnitude: hasCrash ? crashMagnitude : null,
    });
  }

  const crashCount = markets.filter((m) => m.has_crash).length;
  console.log(
    `Generated ${numMarkets} synthetic markets (${crashCount} with flash crashes)`
  );
  return markets;
}

// ── PriceTracker (replicating lib/price_tracker.py) ─────────────────────────

class PriceTracker {
  constructor(lookbackSeconds = 10, dropThreshold = 0.3, maxHistory = 100) {
    this.lookbackSeconds = lookbackSeconds;
    this.dropThreshold = dropThreshold;
    this.maxHistory = maxHistory;
    this.history = { up: [], down: [] };
  }

  record(side, price, timestamp) {
    if (!this.history[side] || price <= 0) return;
    this.history[side].push({ timestamp, price, side });
    if (this.history[side].length > this.maxHistory) {
      this.history[side].shift();
    }
  }

  detectFlashCrash() {
    for (const side of ["up", "down"]) {
      const hist = this.history[side];
      if (hist.length < 2) continue;

      const currentPrice = hist[hist.length - 1].price;
      const now = hist[hist.length - 1].timestamp;

      // Find price from lookback_seconds ago
      let oldPrice = null;
      for (const point of hist) {
        if (now - point.timestamp <= this.lookbackSeconds) {
          oldPrice = point.price;
          break;
        }
      }

      if (oldPrice === null) continue;

      const drop = oldPrice - currentPrice;
      if (drop >= this.dropThreshold) {
        return { side, oldPrice, newPrice: currentPrice, drop, timestamp: now };
      }
    }
    return null;
  }

  clear() {
    this.history = { up: [], down: [] };
  }
}

// ── Backtest Engine ─────────────────────────────────────────────────────────

function mergeTicks(upPrices, downPrices) {
  const upByT = {};
  const downByT = {};
  for (const p of upPrices) upByT[p.t] = p.p;
  for (const p of downPrices) downByT[p.t] = p.p;

  const allTimes = [
    ...new Set([...Object.keys(upByT), ...Object.keys(downByT)]),
  ]
    .map(Number)
    .sort((a, b) => a - b);

  return allTimes.map((t) => {
    const tick = { t };
    if (upByT[t] !== undefined) tick.up = upByT[t];
    if (downByT[t] !== undefined) tick.down = downByT[t];
    return tick;
  });
}

function runBacktest(config, markets, dataSource = "synthetic") {
  const allTrades = [];
  let equity = config.startingEquity;
  const equityCurve = [];
  let globalTick = 0;

  for (const market of markets) {
    const slug = market.slug;
    const upPrices = market.up_prices || [];
    const downPrices = market.down_prices || [];

    if (!upPrices.length && !downPrices.length) continue;

    const tracker = new PriceTracker(
      config.lookbackSeconds,
      config.dropThreshold,
      100
    );

    let openPosition = null;
    const ticks = mergeTicks(upPrices, downPrices);

    for (const tickData of ticks) {
      const t = tickData.t;
      const upP = tickData.up;
      const downP = tickData.down;

      if (upP !== undefined && upP > 0) tracker.record("up", upP, t);
      if (downP !== undefined && downP > 0) tracker.record("down", downP, t);

      const currentPrices = {};
      if (upP !== undefined) currentPrices.up = upP;
      if (downP !== undefined) currentPrices.down = downP;

      // Check exits
      if (openPosition) {
        const side = openPosition.side;
        const currentPrice = currentPrices[side];

        if (currentPrice && currentPrice > 0) {
          const entryPrice = openPosition.entryPrice;
          const tpPrice = entryPrice + config.takeProfit;
          const slPrice = entryPrice - config.stopLoss;

          let exitType = null;
          let exitPrice = currentPrice;

          if (currentPrice >= tpPrice) {
            exitType = "take_profit";
            exitPrice = tpPrice;
          } else if (currentPrice <= slPrice) {
            exitType = "stop_loss";
            exitPrice = slPrice;
          }

          if (exitType) {
            const shares = openPosition.sizeShares;
            const pnl = (exitPrice - entryPrice) * shares;
            allTrades.push({
              market_slug: slug,
              side,
              entry_price: Math.round(entryPrice * 10000) / 10000,
              exit_price: Math.round(exitPrice * 10000) / 10000,
              entry_time: openPosition.entryTime,
              exit_time: t,
              size_usdc: config.size,
              size_shares: Math.round(shares * 100) / 100,
              pnl: Math.round(pnl * 10000) / 10000,
              exit_type: exitType,
            });
            equity += pnl;
            openPosition = null;
          }
        }
      }

      // Check for flash crash entry
      if (!openPosition) {
        const event = tracker.detectFlashCrash();
        if (event) {
          const side = event.side;
          const entryPrice = currentPrices[side];
          if (entryPrice && entryPrice > 0) {
            openPosition = {
              side,
              entryPrice,
              entryTime: t,
              sizeShares: config.size / entryPrice,
            };
          }
        }
      }

      // Record equity
      globalTick++;
      if (globalTick % 10 === 0) {
        equityCurve.push({
          time: Math.round(t * 100) / 100,
          equity: Math.round(equity * 10000) / 10000,
        });
      }
    }

    // Market end: force close
    if (openPosition) {
      const side = openPosition.side;
      const priceList = side === "up" ? upPrices : downPrices;
      const lastPrice = priceList.length ? priceList[priceList.length - 1].p : 0;

      if (lastPrice > 0) {
        const entryPrice = openPosition.entryPrice;
        const shares = openPosition.sizeShares;
        const pnl = (lastPrice - entryPrice) * shares;
        allTrades.push({
          market_slug: slug,
          side,
          entry_price: Math.round(entryPrice * 10000) / 10000,
          exit_price: Math.round(lastPrice * 10000) / 10000,
          entry_time: openPosition.entryTime,
          exit_time: market.end_ts,
          size_usdc: config.size,
          size_shares: Math.round(shares * 100) / 100,
          pnl: Math.round(pnl * 10000) / 10000,
          exit_type: "market_end",
        });
        equity += pnl;
        openPosition = null;
      }
    }

    equityCurve.push({
      time: market.end_ts,
      equity: Math.round(equity * 10000) / 10000,
    });
  }

  // Compute stats
  const totalPnl = allTrades.reduce((s, t) => s + t.pnl, 0);
  const winningTrades = allTrades.filter((t) => t.pnl > 0);
  const losingTrades = allTrades.filter((t) => t.pnl <= 0);
  const winRate =
    allTrades.length > 0
      ? (winningTrades.length / allTrades.length) * 100
      : 0;
  const avgWin =
    winningTrades.length > 0
      ? winningTrades.reduce((s, t) => s + t.pnl, 0) / winningTrades.length
      : 0;
  const avgLoss =
    losingTrades.length > 0
      ? losingTrades.reduce((s, t) => s + t.pnl, 0) / losingTrades.length
      : 0;
  const grossProfit = winningTrades.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Max drawdown
  let peak = config.startingEquity;
  let maxDdPct = 0;
  let maxDdDollars = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const ddPct = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
    const ddDollars = peak - point.equity;
    if (ddPct > maxDdPct) maxDdPct = ddPct;
    if (ddDollars > maxDdDollars) maxDdDollars = ddDollars;
  }

  // Sharpe ratio (simplified)
  let sharpe = 0;
  if (allTrades.length >= 2) {
    const pnls = allTrades.map((t) => t.pnl);
    const avg = pnls.reduce((s, p) => s + p, 0) / pnls.length;
    const variance =
      pnls.reduce((s, p) => s + (p - avg) ** 2, 0) / (pnls.length - 1);
    const std = Math.sqrt(variance);
    sharpe = std > 0 ? avg / std : 0;
  }

  // Exit type counts
  const exitCounts = {};
  for (const t of allTrades) {
    exitCounts[t.exit_type] = (exitCounts[t.exit_type] || 0) + 1;
  }

  return {
    config: {
      drop_threshold: config.dropThreshold,
      lookback_seconds: config.lookbackSeconds,
      take_profit: config.takeProfit,
      stop_loss: config.stopLoss,
      size: config.size,
      max_positions: config.maxPositions,
      starting_equity: config.startingEquity,
    },
    data_source: dataSource,
    markets_analyzed: markets.length,
    summary: {
      total_pnl: Math.round(totalPnl * 10000) / 10000,
      return_pct:
        Math.round((totalPnl / config.startingEquity) * 100 * 100) / 100,
      total_trades: allTrades.length,
      winning_trades: winningTrades.length,
      losing_trades: losingTrades.length,
      win_rate: Math.round(winRate * 10) / 10,
      avg_win: Math.round(avgWin * 10000) / 10000,
      avg_loss: Math.round(avgLoss * 10000) / 10000,
      profit_factor: Math.round(profitFactor * 100) / 100,
      max_drawdown_pct: Math.round(maxDdPct * 100) / 100,
      max_drawdown_dollars: Math.round(maxDdDollars * 100) / 100,
      sharpe_ratio: Math.round(sharpe * 100) / 100,
      exit_counts: exitCounts,
    },
    trades: allTrades,
    equity_curve: equityCurve,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

const config = {
  dropThreshold: 0.3,
  lookbackSeconds: 10,
  takeProfit: 0.1,
  stopLoss: 0.05,
  size: 5.0,
  maxPositions: 1,
  startingEquity: 100.0,
};

console.log("Generating synthetic market data...");
const markets = generateSyntheticData(60, 0.5, 123);

console.log(`Running backtest on ${markets.length} markets...`);
const result = runBacktest(config, markets, "synthetic");

console.log("\n=== BACKTEST RESULTS ===");
console.log(`Markets Analyzed: ${result.markets_analyzed}`);
console.log(`Total Trades: ${result.summary.total_trades}`);
console.log(`Total PnL: $${result.summary.total_pnl.toFixed(4)}`);
console.log(`Win Rate: ${result.summary.win_rate}%`);
console.log(`Max Drawdown: ${result.summary.max_drawdown_pct}%`);
console.log(`Sharpe Ratio: ${result.summary.sharpe_ratio}`);
console.log(`Exit Types: ${JSON.stringify(result.summary.exit_counts)}`);

// Write output files
// Output the full JSON to stdout so it can be captured
console.log("\n---JSON_START---");
console.log(JSON.stringify(result));
console.log("---JSON_END---");
