

"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListTree, Info } from "lucide-react";
import type { MarketPair, GlobalStrategy, StrategyParams } from "@/lib/types";
import { Separator } from '../ui/separator';
import { defaultSymbolStrategy } from '@/lib/user-config';
import { strategySchema } from '@/lib/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';


interface StrategyViewProps {
  marketData: MarketPair[];
  strategy: GlobalStrategy;
  onUpdateSymbolStrategy: (symbol: string, params: Partial<StrategyParams>) => void;
}

export function StrategyView({ marketData, strategy, onUpdateSymbolStrategy }: StrategyViewProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ListTree className="h-6 w-6 text-accent" />
          <CardTitle className="font-headline">Strategy</CardTitle>
        </div>
        <CardDescription>
          Fine-tune the trading strategy for individual symbols. Click on a symbol to configure its parameters.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {marketData.map((pair) => (
            <StrategyEditDialog 
              key={pair.pair}
              symbol={pair.pair}
              globalStrategy={strategy}
              onUpdateSymbolStrategy={onUpdateSymbolStrategy}
            />
          ))}
          {marketData.length === 0 && (
            <p className="text-muted-foreground col-span-full text-center">No symbols in watchlist. Add symbols in the 'Symbols' tab.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Strategy Edit Dialog Component ---

interface StrategyEditDialogProps {
  symbol: string;
  globalStrategy: GlobalStrategy;
  onUpdateSymbolStrategy: (symbol: string, params: Partial<StrategyParams>) => void;
}

function StrategyEditDialog({ symbol, globalStrategy, onUpdateSymbolStrategy }: StrategyEditDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const memoizedStrategy = useMemo(() => {
    const symbolOverride = globalStrategy.perSymbol[symbol] || {};
    // If a symbol has no strategy, it starts with the default values
    return { ...defaultSymbolStrategy, ...symbolOverride };
  }, [globalStrategy, symbol]);

  const form = useForm<z.infer<typeof strategySchema>>({
    resolver: zodResolver(strategySchema),
    defaultValues: memoizedStrategy,
  });
  
  useEffect(() => {
    form.reset(memoizedStrategy);
  }, [memoizedStrategy, form, isOpen]);

  const onSubmit = (values: z.infer<typeof strategySchema>) => {
    onUpdateSymbolStrategy(symbol, values);
    setIsOpen(false);
  };
  
  // A symbol has an override if its key exists in the perSymbol object.
  const hasOverride = !!globalStrategy.perSymbol[symbol] && Object.keys(globalStrategy.perSymbol[symbol]).length > 0;

  const useVolumeThreshold = form.watch("useVolumeThreshold");

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={hasOverride ? "secondary" : "outline"} className="flex flex-col h-20">
          <span className="font-semibold">{symbol.replace('/USDT', '')}</span>
          <span className="text-xs text-muted-foreground">{hasOverride ? "Custom Strategy" : "Default Strategy"}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Strategy for {symbol}</DialogTitle>
          <DialogDescription>
            Configure the specific trading parameters for {symbol}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto pr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              <div className="space-y-4">
                <h4 className="text-md font-medium text-accent">Position & Sizing</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="longTradeSize" render={({ field }) => (<FormItem><FormLabelWithTooltip label="Long Trade Size" tooltip="The amount in the base currency (e.g., BTC, ETH) to use for each long trade." /><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="shortTradeSize" render={({ field }) => (<FormItem><FormLabelWithTooltip label="Short Trade Size" tooltip="The amount in the base currency (e.g., BTC, ETH) to use for each short trade." /><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="leverage" render={({ field }) => (<FormItem><FormLabelWithTooltip label="Leverage" tooltip="The leverage multiplier to apply to your trades. Higher leverage increases both potential profit and risk." /><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                 <FormField control={form.control} name="maxPositionMarginUSDT" render={({ field }) => (<FormItem><FormLabelWithTooltip label="Max Position Margin (USDT)" tooltip="The maximum margin in USDT allowed for a single position to prevent over-exposure." /><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-md font-medium text-accent">Entry Conditions</h4>
                 <FormField control={form.control} name="useVolumeThreshold" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabelWithTooltip label="Enable Volume Thresholds" tooltip="If enabled, the bot will only trade if the liquidation volume exceeds the defined thresholds below." /></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="longVolumeThresholdUSDT" render={({ field }) => (<FormItem><FormLabelWithTooltip label="Long Volume Threshold (USDT)" tooltip="The minimum liquidation volume in USDT for a 'long' liquidation event to be considered for a trade." /><FormControl><Input type="number" {...field} disabled={!useVolumeThreshold} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="shortVolumeThresholdUSDT" render={({ field }) => (<FormItem><FormLabelWithTooltip label="Short Volume Threshold (USDT)" tooltip="The minimum liquidation volume in USDT for a 'short' liquidation event to be considered for a trade." /><FormControl><Input type="number" {...field} disabled={!useVolumeThreshold} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="priceOffsetBps" render={({ field }) => (<FormItem><FormLabelWithTooltip label="Price Offset (Bps)" tooltip="The distance in basis points (1 Bps = 0.01%) from the liquidation price to place the entry order." /><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="maxSlippageBps" render={({ field }) => (<FormItem><FormLabelWithTooltip label="Max Slippage (Bps)" tooltip="The maximum allowed slippage in basis points for market orders." /><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                 <FormField
                    control={form.control}
                    name="orderType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabelWithTooltip label="Order Type" tooltip="LIMIT orders are placed at a specific price; MARKET orders execute at the current best available price." />
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select order type" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="LIMIT">LIMIT</SelectItem>
                            <SelectItem value="MARKET">MARKET</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                 <FormField control={form.control} name="forceMarketEntry" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabelWithTooltip label="Force Market Entry" tooltip="If a LIMIT order is not filled after a short period, forces entry with a MARKET order." /></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
              </div>

              <Separator />
              
              <div className="space-y-4">
                <h4 className="text-md font-medium text-accent">Exit Strategy</h4>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="tpPercent" render={({ field }) => (<FormItem><FormLabelWithTooltip label="Take Profit %" tooltip="The percentage of profit at which to automatically close the trade." /><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="slPercent" render={({ field }) => (<FormItem><FormLabelWithTooltip label="Stop Loss %" tooltip="The percentage of loss at which to automatically close the trade to prevent further losses." /><FormControl><Input type="number" step="0.1" {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
              </div>
              
              <Separator />

              <div className="space-y-4">
                  <h4 className="text-md font-medium text-accent">Trailing Take Profit</h4>
                  <FormField
                      control={form.control}
                      name="useTrailingTP"
                      render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                              <div className="space-y-0.5">
                                  <FormLabelWithTooltip label="Enable Trailing TP" tooltip="If enabled, the bot will trail the price to capture more profit instead of closing at a fixed TP." />
                              </div>
                              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                      )}
                  />
                  {form.watch("useTrailingTP") && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                              control={form.control}
                              name="ttpActivationPercent"
                              render={({ field }) => (
                                  <FormItem>
                                      <FormLabelWithTooltip label="Activation %" tooltip="The profit percentage at which Trailing TP activates." />
                                      <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                                      <FormMessage />
                                  </FormItem>
                              )}
                          />
                          <FormField
                              control={form.control}
                              name="ttpCallbackPercent"
                              render={({ field }) => (
                                  <FormItem>
                                      <FormLabelWithTooltip label="Callback %" tooltip="The percentage the price can pull back from its peak before the trade is closed." />
                                      <FormControl><Input type="number" step="0.1" {...field} /></FormControl>
                                      <FormMessage />
                                  </FormItem>
                              )}
                          />
                      </div>
                  )}
              </div>
              
              <Separator />
              
              <div className="space-y-4">
                <h4 className="text-md font-medium text-accent">VWAP Protection</h4>
                 <FormField control={form.control} name="vwapProtection" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabelWithTooltip label="Enable VWAP Protection" tooltip="If enabled, the bot will avoid entering trades if the current price is too far from the VWAP, helping to avoid bad entries." /></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                {form.watch("vwapProtection") && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="vwapTimeframe" render={({ field }) => (<FormItem><FormLabelWithTooltip label="VWAP Timeframe" tooltip="The timeframe for the VWAP calculation (e.g., 1m, 5m, 1h)." /><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="vwapLookback" render={({ field }) => (<FormItem><FormLabelWithTooltip label="VWAP Lookback Period" tooltip="The number of periods to include in the VWAP calculation." /><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  </div>
                )}
              </div>

              <Separator />
              
               <div className="space-y-4">
                <h4 className="text-md font-medium text-accent">Threshold Cooldown</h4>
                 <FormField control={form.control} name="useThreshold" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabelWithTooltip label="Enable Thresholds" tooltip="Prevents the bot from firing too many trades in a short period." /></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
                {form.watch("useThreshold") && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="thresholdTimeWindow" render={({ field }) => (<FormItem><FormLabelWithTooltip label="Time Window (ms)" tooltip="The duration in milliseconds to monitor trade frequency." /><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="thresholdCooldown" render={({ field }) => (<FormItem><FormLabelWithTooltip label="Cooldown (ms)" tooltip="The time in milliseconds to wait before allowing another trade after the threshold is hit." /><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit">Save Strategy</Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper component to avoid repeating tooltip logic
const FormLabelWithTooltip = ({ label, tooltip }: { label: string; tooltip: string }) => (
    <FormLabel className="flex items-center gap-2">
        <span>{label}</span>
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                    <p className="max-w-xs">{tooltip}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    </FormLabel>
);

    