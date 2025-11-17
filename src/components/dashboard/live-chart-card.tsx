"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { MarketPair } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LiveChartCardProps {
  marketPair: MarketPair;
}

export function LiveChartCard({ marketPair }: LiveChartCardProps) {
  const chartConfig = {
    price: {
      label: marketPair.pair,
      color: "hsl(var(--accent))",
    },
  };

  const lastPrice = marketPair.priceHistory?.[marketPair.priceHistory.length - 1]?.price ?? 0;
  const firstPrice = marketPair.priceHistory?.[0]?.price ?? 0;
  const changeIsUp = lastPrice >= firstPrice;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
            <div>
                <CardTitle className="font-headline">{marketPair.pair.replace('/USDT', '')}</CardTitle>
                <CardDescription>Live Price Chart</CardDescription>
            </div>
            <div className="text-right">
                <p className="text-2xl font-bold font-mono">{marketPair.price.toFixed(2)}</p>
                <p className={cn("text-sm", changeIsUp ? "text-green-400" : "text-red-400")}>
                    {changeIsUp ? '▲' : '▼'} {marketPair.change24h.toFixed(2)}%
                </p>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[120px] w-full">
          <AreaChart data={marketPair.priceHistory} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="fillPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-price)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-price)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted/50" />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              className="text-xs"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              domain={['auto', 'auto']}
              tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
              className="text-xs"
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent
                indicator="dot"
                labelFormatter={(label, payload) => new Date(payload[0]?.payload.time).toLocaleTimeString()}
                formatter={(value) => `$${(value as number).toFixed(2)}`}
              />}
            />
            <Area
              dataKey="price"
              type="natural"
              fill="url(#fillPrice)"
              stroke="var(--color-price)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
