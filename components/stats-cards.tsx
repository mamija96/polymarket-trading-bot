"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { BacktestSummary } from "@/lib/backtest-types"
import {
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  Activity,
  AlertTriangle,
} from "lucide-react"

interface StatsCardsProps {
  summary: BacktestSummary
  marketsAnalyzed: number
}

export function StatsCards({ summary, marketsAnalyzed }: StatsCardsProps) {
  const cards = [
    {
      title: "Total PnL",
      value: `$${summary.total_pnl >= 0 ? "+" : ""}${summary.total_pnl.toFixed(2)}`,
      subtitle: `${summary.return_pct >= 0 ? "+" : ""}${summary.return_pct.toFixed(1)}% return`,
      icon: summary.total_pnl >= 0 ? TrendingUp : TrendingDown,
      positive: summary.total_pnl >= 0,
    },
    {
      title: "Win Rate",
      value: `${summary.win_rate.toFixed(1)}%`,
      subtitle: `${summary.winning_trades}W / ${summary.losing_trades}L`,
      icon: Target,
      positive: summary.win_rate > 50,
    },
    {
      title: "Total Trades",
      value: summary.total_trades.toString(),
      subtitle: `across ${marketsAnalyzed} markets`,
      icon: BarChart3,
      positive: null,
    },
    {
      title: "Profit Factor",
      value: summary.profit_factor >= 999 ? "INF" : summary.profit_factor.toFixed(2),
      subtitle: `Avg W: $${summary.avg_win.toFixed(2)} / L: $${summary.avg_loss.toFixed(2)}`,
      icon: Activity,
      positive: summary.profit_factor > 1,
    },
    {
      title: "Max Drawdown",
      value: `${summary.max_drawdown_pct.toFixed(1)}%`,
      subtitle: `$${summary.max_drawdown_dollars.toFixed(2)}`,
      icon: AlertTriangle,
      positive: summary.max_drawdown_pct < 10,
    },
    {
      title: "Sharpe Ratio",
      value: summary.sharpe_ratio.toFixed(2),
      subtitle: "risk-adjusted return",
      icon: Activity,
      positive: summary.sharpe_ratio > 0.5,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card key={card.title} className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <Icon
                className={`h-4 w-4 ${
                  card.positive === null
                    ? "text-muted-foreground"
                    : card.positive
                      ? "text-chart-1"
                      : "text-chart-2"
                }`}
              />
            </CardHeader>
            <CardContent>
              <div
                className={`text-xl font-bold font-mono ${
                  card.positive === null
                    ? "text-foreground"
                    : card.positive
                      ? "text-chart-1"
                      : "text-chart-2"
                }`}
              >
                {card.value}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {card.subtitle}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
