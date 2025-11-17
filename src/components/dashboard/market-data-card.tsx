

"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";
import type { MarketPair, PriceTrend } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "../ui/scroll-area";


interface MarketDataCardProps {
  marketData: MarketPair[];
  priceTrends: Record<string, PriceTrend>;
}

export function MarketDataCard({ marketData, priceTrends }: MarketDataCardProps) {
  
  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-accent" />
            <CardTitle className="font-headline">Live Market Data</CardTitle>
          </div>
          <CardDescription>Real-time prices from the exchange.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
          <ScrollArea className="h-96">
          <Table>
              <TableHeader>
              <TableRow>
                  <TableHead>Pair</TableHead>
                  <TableHead className="text-right">Price (USD)</TableHead>
                  <TableHead className="text-right">24h Change</TableHead>
              </TableRow>
              </TableHeader>
              <TableBody>
              {marketData.map((pair) => {
                  const trend = priceTrends[pair.pair];
                  return (
                  <TableRow key={pair.pair} className="cursor-pointer">
                      <TableCell>
                      <div className="font-medium">{pair.pair.replace('/USDT', '')}</div>
                      <div className="hidden text-sm text-muted-foreground md:inline">
                          {pair.pair}
                      </div>
                      </TableCell>
                      <TableCell className={cn(
                          "text-right font-mono transition-colors duration-300",
                          trend === 'up' && 'text-green-400',
                          trend === 'down' && 'text-red-400',
                      )}>
                      {pair.price.toFixed(4)}
                      </TableCell>
                      <TableCell className="text-right">
                      <div className={cn(
                          "flex items-center justify-end gap-1",
                          pair.change24h >= 0 ? "text-green-400" : "text-red-400"
                      )}>
                          {pair.change24h >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                          {pair.change24h.toFixed(2)}%
                      </div>
                      </TableCell>
                  </TableRow>
                  );
              })}
              </TableBody>
          </Table>
          </ScrollArea>
      </CardContent>
    </Card>
  );
}
