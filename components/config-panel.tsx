import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { BacktestConfig } from "@/lib/backtest-types"

interface ConfigPanelProps {
  config: BacktestConfig
  dataSource: string
}

export function ConfigPanel({ config, dataSource }: ConfigPanelProps) {
  const params = [
    { label: "Drop Threshold", value: `${(config.drop_threshold * 100).toFixed(0)}%`, description: "probability drop to trigger entry" },
    { label: "Lookback", value: `${config.lookback_seconds}s`, description: "detection window" },
    { label: "Take Profit", value: `+$${config.take_profit.toFixed(2)}`, description: "exit target" },
    { label: "Stop Loss", value: `-$${config.stop_loss.toFixed(2)}`, description: "max loss per trade" },
    { label: "Trade Size", value: `$${config.size.toFixed(2)}`, description: "USDC per trade" },
    { label: "Starting Equity", value: `$${config.starting_equity.toFixed(0)}`, description: "initial capital" },
  ]

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Strategy Parameters
        </CardTitle>
        <Badge
          variant={dataSource === "live" ? "default" : "secondary"}
          className="font-mono text-xs"
        >
          {dataSource === "live" ? "LIVE DATA" : "SYNTHETIC"}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {params.map((p) => (
            <div key={p.label} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{p.label}</span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {p.value}
              </span>
              <span className="text-xs text-muted-foreground/70">
                {p.description}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
