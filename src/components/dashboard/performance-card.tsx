
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { PerformanceData } from "@/lib/types";
import { Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

interface PerformanceCardProps {
  performanceData: PerformanceData;
  className?: string;
}

export function PerformanceCard({ performanceData, className }: PerformanceCardProps) {
  const chartConfig = {
    pnl: {
      label: "PnL",
      color: "hsl(var(--accent))",
    },
  };

  const currencySymbol = '$';

  return (
    <Card className={cn("lg:col-span-1", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-accent" />
          <CardTitle className="font-headline">Balance</CardTitle>
        </div>
        <CardDescription>Your current trading balance.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-3xl font-bold font-mono">
            {currencySymbol}{performanceData.balance.toFixed(2)}
        </div>
        <div>
          <ChartContainer config={chartConfig} className="h-[100px] w-full">
            <AreaChart data={performanceData.performanceHistory} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="fillPnl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-pnl)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-pnl)" stopOpacity={0.1} />
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
                tickFormatter={(value) => `$${value}`}
                className="text-xs"
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(label, payload) => `${new Date(payload[0].payload.time).toLocaleTimeString()}`}
                  formatter={(value) => `$${(value as number).toFixed(2)}`}
                />}
              />
              <Area
                dataKey="pnl"
                type="natural"
                fill="url(#fillPnl)"
                stroke="var(--color-pnl)"
                stackId="a"
              />
            </AreaChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
