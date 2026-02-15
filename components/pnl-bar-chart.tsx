"use client"

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Trade } from "@/lib/backtest-types"

interface PnlBarChartProps {
  trades: Trade[]
}

export function PnlBarChart({ trades }: PnlBarChartProps) {
  const data = trades.map((t, i) => ({
    index: i + 1,
    pnl: t.pnl,
    market: t.market_slug,
    exit: t.exit_type,
  }))

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          PnL per Trade
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 18%)" />
              <XAxis
                dataKey="index"
                tick={{ fill: "hsl(215, 14%, 55%)", fontSize: 11 }}
                axisLine={{ stroke: "hsl(220, 12%, 18%)" }}
                tickLine={false}
                label={{
                  value: "Trade #",
                  position: "insideBottom",
                  fill: "hsl(215, 14%, 55%)",
                  fontSize: 11,
                  offset: -2,
                }}
              />
              <YAxis
                tick={{ fill: "hsl(215, 14%, 55%)", fontSize: 11 }}
                axisLine={{ stroke: "hsl(220, 12%, 18%)" }}
                tickLine={false}
                tickFormatter={(val: number) => `$${val.toFixed(1)}`}
              />
              <ReferenceLine y={0} stroke="hsl(220, 12%, 25%)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(220, 14%, 10%)",
                  border: "1px solid hsl(220, 12%, 18%)",
                  borderRadius: "0.5rem",
                  color: "hsl(210, 20%, 92%)",
                  fontSize: 12,
                }}
                formatter={(value: number) => [
                  `$${value >= 0 ? "+" : ""}${value.toFixed(2)}`,
                  "PnL",
                ]}
                labelFormatter={(label: number) => `Trade #${label}`}
              />
              <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                {data.map((entry) => (
                  <Cell
                    key={`cell-${entry.index}`}
                    fill={
                      entry.pnl >= 0 ? "hsl(142, 72%, 50%)" : "hsl(0, 72%, 56%)"
                    }
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
