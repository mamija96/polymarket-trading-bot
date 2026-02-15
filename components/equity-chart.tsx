"use client"

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EquityPoint } from "@/lib/backtest-types"

interface EquityChartProps {
  data: EquityPoint[]
  startingEquity: number
}

export function EquityChart({ data, startingEquity }: EquityChartProps) {
  const minEquity = Math.min(...data.map((d) => d.equity))
  const maxEquity = Math.max(...data.map((d) => d.equity))
  const padding = (maxEquity - minEquity) * 0.1 || 5

  const isProfit = data.length > 0 && data[data.length - 1].equity >= startingEquity

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Equity Curve
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={isProfit ? "hsl(142, 72%, 50%)" : "hsl(0, 72%, 56%)"}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={isProfit ? "hsl(142, 72%, 50%)" : "hsl(0, 72%, 56%)"}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 18%)" />
              <XAxis
                dataKey="time"
                tick={{ fill: "hsl(215, 14%, 55%)", fontSize: 11 }}
                axisLine={{ stroke: "hsl(220, 12%, 18%)" }}
                tickLine={false}
                tickFormatter={() => ""}
              />
              <YAxis
                domain={[minEquity - padding, maxEquity + padding]}
                tick={{ fill: "hsl(215, 14%, 55%)", fontSize: 11 }}
                axisLine={{ stroke: "hsl(220, 12%, 18%)" }}
                tickLine={false}
                tickFormatter={(val: number) => `$${val.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(220, 14%, 10%)",
                  border: "1px solid hsl(220, 12%, 18%)",
                  borderRadius: "0.5rem",
                  color: "hsl(210, 20%, 92%)",
                  fontSize: 12,
                }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, "Equity"]}
                labelFormatter={() => ""}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke={isProfit ? "hsl(142, 72%, 50%)" : "hsl(0, 72%, 56%)"}
                strokeWidth={2}
                fill="url(#equityGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
