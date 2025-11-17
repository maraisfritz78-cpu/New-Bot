
"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LiquidationOpportunity, Trade } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface HistoryCardProps {
  title: string;
  icon: React.ElementType;
  data: (LiquidationOpportunity | Trade)[];
  type: 'liquidation' | 'trade';
}

function HistoryCardComponent({ title, icon: Icon, data, type }: HistoryCardProps) {
  
  const tradeData = useMemo(() => data.filter(d => 'pnl' in d) as Trade[], [data]);

  const takeProfitTrades = useMemo(() => tradeData.filter(trade => trade.exitReason === 'Take Profit'), [tradeData]);
  const stopLossTrades = useMemo(() => tradeData.filter(trade => trade.exitReason === 'Stop Loss'), [tradeData]);
  const trailingTPTrades = useMemo(() => tradeData.filter(trade => trade.exitReason === 'Trailing TP'), [tradeData]);
  const manualTrades = useMemo(() => tradeData.filter(trade => trade.exitReason === 'Manual Close'), [tradeData]);

  const renderTradeTable = (trades: Trade[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pair</TableHead>
          <TableHead>Action</TableHead>
          <TableHead className="text-right">Entry</TableHead>
          <TableHead className="text-right">Exit</TableHead>
          <TableHead className="text-right">Size</TableHead>
          <TableHead className="text-right">PnL</TableHead>
          <TableHead className="text-right">Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.pair}</TableCell>
            <TableCell className={cn("capitalize", item.action === 'buy' ? 'text-green-400' : 'text-red-400')}>
              {item.action}
            </TableCell>
            <TableCell className="text-right font-mono">${item.entryPrice.toFixed(4)}</TableCell>
            <TableCell className="text-right font-mono">${item.exitPrice.toFixed(4)}</TableCell>
            <TableCell className="text-right font-mono">{item.size}</TableCell>
            <TableCell className={cn("text-right font-mono", item.pnl >= 0 ? "text-green-400" : "text-red-400")}>
              ${item.pnl.toFixed(2)}
            </TableCell>
            <TableCell className="text-right text-muted-foreground text-xs">
              {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="h-6 w-6 text-accent" />
          <CardTitle className="font-headline">{title}</CardTitle>
        </div>
        <CardDescription>A log of recent bot activity.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {type === 'trade' && tradeData ? (
          <Tabs defaultValue="all" className="flex-1 flex flex-col">
            <TabsList className="mb-4 grid w-full grid-cols-5">
              <TabsTrigger value="all">All ({tradeData.length})</TabsTrigger>
              <TabsTrigger value="take-profit">Take Profit ({takeProfitTrades.length})</TabsTrigger>
              <TabsTrigger value="stop-loss">Stop Loss ({stopLossTrades.length})</TabsTrigger>
              <TabsTrigger value="trailing-tp">Trailing TP ({trailingTPTrades.length})</TabsTrigger>
              <TabsTrigger value="manual">Manual Close ({manualTrades.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="flex-1">
              <ScrollArea className="h-96">
                {tradeData.length > 0 ? renderTradeTable(tradeData) : <EmptyState type="trades" />}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="take-profit" className="flex-1">
              <ScrollArea className="h-96">
                {takeProfitTrades.length > 0 ? renderTradeTable(takeProfitTrades) : <EmptyState type="Take Profit trades" />}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="stop-loss" className="flex-1">
              <ScrollArea className="h-96">
                {stopLossTrades.length > 0 ? renderTradeTable(stopLossTrades) : <EmptyState type="Stop Loss trades" />}
              </ScrollArea>
            </TabsContent>
             <TabsContent value="trailing-tp" className="flex-1">
              <ScrollArea className="h-96">
                {trailingTPTrades.length > 0 ? renderTradeTable(trailingTPTrades) : <EmptyState type="Trailing Take Profit trades" />}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="manual" className="flex-1">
              <ScrollArea className="h-96">
                {manualTrades.length > 0 ? renderTradeTable(manualTrades) : <EmptyState type="Manual Close trades" />}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <ScrollArea className="h-96">
            {data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pair</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Liq. Price</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item) => {
                    const liqOpp = item as LiquidationOpportunity;
                    const timestampString = liqOpp.id.split('-').pop();
                    const timestamp = timestampString ? Number(timestampString) : Date.now();
                    return (
                      <TableRow key={liqOpp.id}>
                        <TableCell className="font-medium">{liqOpp.pair}</TableCell>
                        <TableCell className={liqOpp.type === 'long' ? 'text-red-400' : 'text-green-400'}>
                          {liqOpp.type}
                        </TableCell>
                        <TableCell className="text-right font-mono">${liqOpp.liquidationPrice.toFixed(4)}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-xs">
                          {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <EmptyState type={title} />
            )}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

const EmptyState = ({ type }: {type: string}) => (
  <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground h-full">
    <p className="font-semibold">No {type} yet</p>
    <p className="text-sm">Activity will appear here when the bot is running.</p>
  </div>
);

export const HistoryCard = React.memo(HistoryCardComponent);

    