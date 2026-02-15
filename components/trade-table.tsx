"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Trade } from "@/lib/backtest-types"
import { ChevronUp, ChevronDown } from "lucide-react"

interface TradeTableProps {
  trades: Trade[]
}

type SortKey = "index" | "pnl" | "exit_type" | "side" | "entry_price" | "exit_price"

const exitColors: Record<string, string> = {
  take_profit: "text-chart-1",
  stop_loss: "text-chart-2",
  market_end: "text-chart-3",
}

const exitLabels: Record<string, string> = {
  take_profit: "TP",
  stop_loss: "SL",
  market_end: "END",
}

export function TradeTable({ trades }: TradeTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("index")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir(key === "pnl" ? "desc" : "asc")
    }
  }

  const indexed = trades.map((t, i) => ({ ...t, index: i + 1 }))

  const sorted = [...indexed].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case "index":
        cmp = a.index - b.index
        break
      case "pnl":
        cmp = a.pnl - b.pnl
        break
      case "entry_price":
        cmp = a.entry_price - b.entry_price
        break
      case "exit_price":
        cmp = a.exit_price - b.exit_price
        break
      case "side":
        cmp = a.side.localeCompare(b.side)
        break
      case "exit_type":
        cmp = a.exit_type.localeCompare(b.exit_type)
        break
    }
    return sortDir === "asc" ? cmp : -cmp
  })

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null
    return sortDir === "asc" ? (
      <ChevronUp className="ml-0.5 inline h-3 w-3" />
    ) : (
      <ChevronDown className="ml-0.5 inline h-3 w-3" />
    )
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Trade Log ({trades.length} trades)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                {[
                  { key: "index" as SortKey, label: "#" },
                  { key: "side" as SortKey, label: "Side" },
                  { key: "index" as SortKey, label: "Market" },
                  { key: "entry_price" as SortKey, label: "Entry" },
                  { key: "exit_price" as SortKey, label: "Exit" },
                  { key: "pnl" as SortKey, label: "PnL" },
                  { key: "exit_type" as SortKey, label: "Exit Type" },
                ].map((col) => (
                  <th
                    key={col.label}
                    className="cursor-pointer px-4 py-3 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    <SortIcon col={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((trade) => (
                <tr
                  key={trade.index}
                  className="border-b border-border/30 transition-colors hover:bg-accent/30"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {trade.index}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`font-mono text-xs font-medium uppercase ${
                        trade.side === "up" ? "text-chart-1" : "text-chart-2"
                      }`}
                    >
                      {trade.side}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                    {trade.market_slug}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                    {trade.entry_price.toFixed(4)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">
                    {trade.exit_price.toFixed(4)}
                  </td>
                  <td
                    className={`px-4 py-2.5 font-mono text-xs font-medium ${
                      trade.pnl >= 0 ? "text-chart-1" : "text-chart-2"
                    }`}
                  >
                    {trade.pnl >= 0 ? "+" : ""}
                    {trade.pnl.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`font-mono text-xs font-medium ${
                        exitColors[trade.exit_type] || "text-muted-foreground"
                      }`}
                    >
                      {exitLabels[trade.exit_type] || trade.exit_type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
