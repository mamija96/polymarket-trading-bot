"use client"

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ExitDistributionProps {
  exitCounts: Record<string, number>
}

const COLORS: Record<string, string> = {
  take_profit: "hsl(142, 72%, 50%)",
  stop_loss: "hsl(0, 72%, 56%)",
  market_end: "hsl(35, 92%, 56%)",
}

const LABELS: Record<string, string> = {
  take_profit: "Take Profit",
  stop_loss: "Stop Loss",
  market_end: "Market End",
}

export function ExitDistribution({ exitCounts }: ExitDistributionProps) {
  const data = Object.entries(exitCounts).map(([key, count]) => ({
    name: LABELS[key] || key,
    value: count,
    key,
  }))

  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Exit Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="h-[200px] w-[200px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={COLORS[entry.key] || "hsl(215, 14%, 55%)"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(220, 14%, 10%)",
                    border: "1px solid hsl(220, 12%, 18%)",
                    borderRadius: "0.5rem",
                    color: "hsl(210, 20%, 92%)",
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [value, "trades"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-3">
            {data.map((entry) => (
              <div key={entry.key} className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: COLORS[entry.key] || "hsl(215, 14%, 55%)" }}
                />
                <span className="text-sm text-muted-foreground">
                  {entry.name}
                </span>
                <span className="font-mono text-sm font-medium text-foreground">
                  {entry.value}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
