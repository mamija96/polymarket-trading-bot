"use client"

import type { BacktestResult } from "@/lib/backtest-types"
import { StatsCards } from "@/components/stats-cards"
import { EquityChart } from "@/components/equity-chart"
import { PnlBarChart } from "@/components/pnl-bar-chart"
import { ExitDistribution } from "@/components/exit-distribution"
import { TradeTable } from "@/components/trade-table"
import { ConfigPanel } from "@/components/config-panel"
import { Activity } from "lucide-react"

interface DashboardProps {
  result: BacktestResult
}

export function Dashboard({ result }: DashboardProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Flash Crash Strategy Backtest
              </h1>
              <p className="text-xs text-muted-foreground">
                Polymarket 15-minute Up/Down markets
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
            <span>{result.markets_analyzed} markets</span>
            <span className="text-border">|</span>
            <span>{result.summary.total_trades} trades</span>
            <span className="text-border">|</span>
            <span
              className={
                result.summary.total_pnl >= 0 ? "text-chart-1" : "text-chart-2"
              }
            >
              ${result.summary.total_pnl >= 0 ? "+" : ""}
              {result.summary.total_pnl.toFixed(2)}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-screen-2xl px-4 py-6 lg:px-8">
        <div className="flex flex-col gap-6">
          {/* Config */}
          <ConfigPanel config={result.config} dataSource={result.data_source} />

          {/* Stats */}
          <StatsCards
            summary={result.summary}
            marketsAnalyzed={result.markets_analyzed}
          />

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            <EquityChart
              data={result.equity_curve}
              startingEquity={result.config.starting_equity}
            />
            <PnlBarChart trades={result.trades} />
          </div>

          {/* Exit Distribution + more */}
          <div className="grid gap-6 lg:grid-cols-3">
            <ExitDistribution exitCounts={result.summary.exit_counts} />
            <div className="lg:col-span-2">
              <TradeTable trades={result.trades} />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
