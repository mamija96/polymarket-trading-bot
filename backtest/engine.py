"""
Backtest Engine - Tick-by-Tick Flash Crash Strategy Simulation

Replays the flash crash strategy logic against historical or synthetic
market data. Reuses the actual PriceTracker and PositionManager from
the live bot to ensure identical behavior.

Usage:
    from backtest.engine import BacktestEngine, BacktestConfig
    from backtest.data import generate_synthetic_data

    config = BacktestConfig(drop_threshold=0.30, take_profit=0.10, stop_loss=0.05)
    markets = generate_synthetic_data(num_markets=20)
    engine = BacktestEngine(config, markets)
    result = engine.run()
    print(result.summary())
"""

import json
import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from lib.price_tracker import PriceTracker


# ── Config & Data Classes ────────────────────────────────────────────────────


@dataclass
class BacktestConfig:
    """Configuration for the backtest engine."""

    # Flash crash detection
    drop_threshold: float = 0.30
    lookback_seconds: int = 10

    # Exit conditions
    take_profit: float = 0.10
    stop_loss: float = 0.05

    # Position sizing
    size: float = 5.0  # USDC per trade
    max_positions: int = 1

    # Starting equity
    starting_equity: float = 100.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "drop_threshold": self.drop_threshold,
            "lookback_seconds": self.lookback_seconds,
            "take_profit": self.take_profit,
            "stop_loss": self.stop_loss,
            "size": self.size,
            "max_positions": self.max_positions,
            "starting_equity": self.starting_equity,
        }


@dataclass
class Trade:
    """A completed trade from the backtest."""

    market_slug: str
    side: str  # "up" or "down"
    entry_price: float
    exit_price: float
    entry_time: float
    exit_time: float
    size_usdc: float
    size_shares: float
    pnl: float
    exit_type: str  # "take_profit", "stop_loss", "market_end"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "market_slug": self.market_slug,
            "side": self.side,
            "entry_price": round(self.entry_price, 4),
            "exit_price": round(self.exit_price, 4),
            "entry_time": self.entry_time,
            "exit_time": self.exit_time,
            "size_usdc": round(self.size_usdc, 2),
            "size_shares": round(self.size_shares, 2),
            "pnl": round(self.pnl, 4),
            "exit_type": self.exit_type,
        }


@dataclass
class BacktestResult:
    """Complete results from a backtest run."""

    config: BacktestConfig
    trades: List[Trade]
    equity_curve: List[Dict[str, float]]
    data_source: str  # "live" or "synthetic"
    markets_analyzed: int

    @property
    def total_pnl(self) -> float:
        return sum(t.pnl for t in self.trades)

    @property
    def total_trades(self) -> int:
        return len(self.trades)

    @property
    def winning_trades(self) -> int:
        return sum(1 for t in self.trades if t.pnl > 0)

    @property
    def losing_trades(self) -> int:
        return sum(1 for t in self.trades if t.pnl <= 0)

    @property
    def win_rate(self) -> float:
        if self.total_trades == 0:
            return 0.0
        return self.winning_trades / self.total_trades * 100

    @property
    def avg_win(self) -> float:
        wins = [t.pnl for t in self.trades if t.pnl > 0]
        return sum(wins) / len(wins) if wins else 0.0

    @property
    def avg_loss(self) -> float:
        losses = [t.pnl for t in self.trades if t.pnl <= 0]
        return sum(losses) / len(losses) if losses else 0.0

    @property
    def profit_factor(self) -> float:
        gross_profit = sum(t.pnl for t in self.trades if t.pnl > 0)
        gross_loss = abs(sum(t.pnl for t in self.trades if t.pnl < 0))
        if gross_loss == 0:
            return float("inf") if gross_profit > 0 else 0.0
        return gross_profit / gross_loss

    @property
    def max_drawdown(self) -> float:
        if not self.equity_curve:
            return 0.0
        peak = self.equity_curve[0]["equity"]
        max_dd = 0.0
        for point in self.equity_curve:
            eq = point["equity"]
            if eq > peak:
                peak = eq
            dd = (peak - eq) / peak * 100 if peak > 0 else 0.0
            max_dd = max(max_dd, dd)
        return max_dd

    @property
    def max_drawdown_dollars(self) -> float:
        if not self.equity_curve:
            return 0.0
        peak = self.equity_curve[0]["equity"]
        max_dd = 0.0
        for point in self.equity_curve:
            eq = point["equity"]
            if eq > peak:
                peak = eq
            dd = peak - eq
            max_dd = max(max_dd, dd)
        return max_dd

    @property
    def sharpe_ratio(self) -> float:
        """Simplified Sharpe ratio (no risk-free rate)."""
        if len(self.trades) < 2:
            return 0.0
        pnls = [t.pnl for t in self.trades]
        avg = sum(pnls) / len(pnls)
        variance = sum((p - avg) ** 2 for p in pnls) / (len(pnls) - 1)
        std = math.sqrt(variance) if variance > 0 else 0.0
        if std == 0:
            return 0.0
        return avg / std

    @property
    def return_pct(self) -> float:
        return self.total_pnl / self.config.starting_equity * 100

    def summary(self) -> str:
        """Generate human-readable summary."""
        lines = [
            "=" * 60,
            "BACKTEST RESULTS",
            "=" * 60,
            f"Data Source:      {self.data_source}",
            f"Markets Analyzed: {self.markets_analyzed}",
            f"Starting Equity:  ${self.config.starting_equity:.2f}",
            "",
            "--- Strategy Parameters ---",
            f"Drop Threshold:   {self.config.drop_threshold:.2f}",
            f"Lookback Window:  {self.config.lookback_seconds}s",
            f"Take Profit:      +${self.config.take_profit:.2f}",
            f"Stop Loss:        -${self.config.stop_loss:.2f}",
            f"Trade Size:       ${self.config.size:.2f} USDC",
            "",
            "--- Performance ---",
            f"Total PnL:        ${self.total_pnl:+.4f}",
            f"Return:           {self.return_pct:+.2f}%",
            f"Total Trades:     {self.total_trades}",
            f"Winning Trades:   {self.winning_trades}",
            f"Losing Trades:    {self.losing_trades}",
            f"Win Rate:         {self.win_rate:.1f}%",
            f"Avg Win:          ${self.avg_win:+.4f}",
            f"Avg Loss:         ${self.avg_loss:+.4f}",
            f"Profit Factor:    {self.profit_factor:.2f}",
            f"Max Drawdown:     {self.max_drawdown:.2f}% (${self.max_drawdown_dollars:.2f})",
            f"Sharpe Ratio:     {self.sharpe_ratio:.2f}",
            "",
            "--- Exit Types ---",
        ]

        exit_counts: Dict[str, int] = {}
        for t in self.trades:
            exit_counts[t.exit_type] = exit_counts.get(t.exit_type, 0) + 1
        for exit_type, count in sorted(exit_counts.items()):
            lines.append(f"  {exit_type:15s}: {count}")

        lines.append("=" * 60)
        return "\n".join(lines)

    def to_json(self) -> Dict[str, Any]:
        """Serialize to JSON-compatible dictionary."""
        exit_counts: Dict[str, int] = {}
        for t in self.trades:
            exit_counts[t.exit_type] = exit_counts.get(t.exit_type, 0) + 1

        return {
            "config": self.config.to_dict(),
            "data_source": self.data_source,
            "markets_analyzed": self.markets_analyzed,
            "summary": {
                "total_pnl": round(self.total_pnl, 4),
                "return_pct": round(self.return_pct, 2),
                "total_trades": self.total_trades,
                "winning_trades": self.winning_trades,
                "losing_trades": self.losing_trades,
                "win_rate": round(self.win_rate, 1),
                "avg_win": round(self.avg_win, 4),
                "avg_loss": round(self.avg_loss, 4),
                "profit_factor": round(self.profit_factor, 2),
                "max_drawdown_pct": round(self.max_drawdown, 2),
                "max_drawdown_dollars": round(self.max_drawdown_dollars, 2),
                "sharpe_ratio": round(self.sharpe_ratio, 2),
                "exit_counts": exit_counts,
            },
            "trades": [t.to_dict() for t in self.trades],
            "equity_curve": [
                {"time": round(p["time"], 2), "equity": round(p["equity"], 4)}
                for p in self.equity_curve
            ],
        }


# ── Backtest Engine ──────────────────────────────────────────────────────────


class BacktestEngine:
    """
    Tick-by-tick backtest engine for the Flash Crash strategy.

    Replays market data through the same PriceTracker used by the live bot
    to detect flash crashes, then simulates position entry/exit with TP/SL.
    """

    def __init__(
        self,
        config: BacktestConfig,
        markets: List[Dict[str, Any]],
        data_source: str = "synthetic",
    ):
        self.config = config
        self.markets = markets
        self.data_source = data_source

    def run(self) -> BacktestResult:
        """
        Run the full backtest across all markets.

        Returns:
            BacktestResult with trades, equity curve, and statistics
        """
        all_trades: List[Trade] = []
        equity = self.config.starting_equity
        equity_curve: List[Dict[str, float]] = []
        global_tick = 0

        for market_idx, market in enumerate(self.markets):
            slug = market["slug"]
            up_prices = market.get("up_prices", [])
            down_prices = market.get("down_prices", [])

            if not up_prices and not down_prices:
                continue

            # Fresh PriceTracker per market (same as live bot clears on market change)
            tracker = PriceTracker(
                lookback_seconds=self.config.lookback_seconds,
                max_history=100,
            )
            tracker.drop_threshold = self.config.drop_threshold

            # Position state for this market
            open_position: Optional[Dict[str, Any]] = None

            # Build unified tick timeline
            ticks = self._merge_ticks(up_prices, down_prices)

            for tick_data in ticks:
                t = tick_data["t"]
                up_p = tick_data.get("up")
                down_p = tick_data.get("down")

                # Record prices (same as live bot)
                if up_p is not None and up_p > 0:
                    tracker.record("up", up_p, timestamp=t)
                if down_p is not None and down_p > 0:
                    tracker.record("down", down_p, timestamp=t)

                current_prices = {}
                if up_p is not None:
                    current_prices["up"] = up_p
                if down_p is not None:
                    current_prices["down"] = down_p

                # --- Check exits for open position ---
                if open_position is not None:
                    side = open_position["side"]
                    current_price = current_prices.get(side, 0)

                    if current_price > 0:
                        entry_price = open_position["entry_price"]
                        tp_price = entry_price + self.config.take_profit
                        sl_price = entry_price - self.config.stop_loss

                        exit_type = None
                        exit_price = current_price

                        if current_price >= tp_price:
                            exit_type = "take_profit"
                            exit_price = tp_price  # Assume fill at TP level
                        elif current_price <= sl_price:
                            exit_type = "stop_loss"
                            exit_price = sl_price  # Assume fill at SL level

                        if exit_type:
                            shares = open_position["size_shares"]
                            pnl = (exit_price - entry_price) * shares
                            trade = Trade(
                                market_slug=slug,
                                side=side,
                                entry_price=entry_price,
                                exit_price=exit_price,
                                entry_time=open_position["entry_time"],
                                exit_time=t,
                                size_usdc=self.config.size,
                                size_shares=shares,
                                pnl=pnl,
                                exit_type=exit_type,
                            )
                            all_trades.append(trade)
                            equity += pnl
                            open_position = None

                # --- Check for flash crash entry ---
                if open_position is None:
                    event = tracker.detect_flash_crash()
                    if event:
                        side = event.side
                        entry_price = current_prices.get(side, 0)
                        if entry_price > 0:
                            shares = self.config.size / entry_price
                            open_position = {
                                "side": side,
                                "entry_price": entry_price,
                                "entry_time": t,
                                "size_shares": shares,
                            }

                # Record equity
                global_tick += 1
                if global_tick % 10 == 0:  # Sample every 10 ticks
                    equity_curve.append({"time": t, "equity": equity})

            # --- Market end: force-close any open position ---
            if open_position is not None:
                side = open_position["side"]
                # Use last known price
                last_price = 0.0
                price_list = up_prices if side == "up" else down_prices
                if price_list:
                    last_price = price_list[-1]["p"]

                if last_price > 0:
                    entry_price = open_position["entry_price"]
                    shares = open_position["size_shares"]
                    pnl = (last_price - entry_price) * shares
                    trade = Trade(
                        market_slug=slug,
                        side=side,
                        entry_price=entry_price,
                        exit_price=last_price,
                        entry_time=open_position["entry_time"],
                        exit_time=market["end_ts"],
                        size_usdc=self.config.size,
                        size_shares=shares,
                        pnl=pnl,
                        exit_type="market_end",
                    )
                    all_trades.append(trade)
                    equity += pnl
                    open_position = None

            # Record equity at market boundary
            equity_curve.append({"time": market["end_ts"], "equity": equity})

        # Ensure first equity point exists
        if equity_curve and equity_curve[0]["equity"] != self.config.starting_equity:
            equity_curve.insert(
                0,
                {
                    "time": self.markets[0]["start_ts"] if self.markets else 0,
                    "equity": self.config.starting_equity,
                },
            )

        return BacktestResult(
            config=self.config,
            trades=all_trades,
            equity_curve=equity_curve,
            data_source=self.data_source,
            markets_analyzed=len(self.markets),
        )

    def _merge_ticks(
        self,
        up_prices: List[Dict[str, float]],
        down_prices: List[Dict[str, float]],
    ) -> List[Dict[str, Any]]:
        """
        Merge UP and DOWN price ticks into a single chronological timeline.

        When both sides have a price at the same timestamp, they're merged
        into a single tick. Otherwise, only the available side is included.
        """
        up_by_t = {p["t"]: p["p"] for p in up_prices}
        down_by_t = {p["t"]: p["p"] for p in down_prices}

        all_times = sorted(set(up_by_t.keys()) | set(down_by_t.keys()))

        merged: List[Dict[str, Any]] = []
        for t in all_times:
            tick: Dict[str, Any] = {"t": t}
            if t in up_by_t:
                tick["up"] = up_by_t[t]
            if t in down_by_t:
                tick["down"] = down_by_t[t]
            merged.append(tick)

        return merged
