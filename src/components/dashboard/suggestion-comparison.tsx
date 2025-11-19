
"use client";

import type { StrategyParams } from "@/lib/types";
import { ArrowRight } from "lucide-react";

interface SuggestionComparisonProps {
  currentParams: Partial<StrategyParams>;
  suggestedParams: Partial<StrategyParams>;
}

const PARAM_LABELS: Record<keyof StrategyParams, string> = {
    tpPercent: "Take Profit %",
    slPercent: "Stop Loss %",
    leverage: "Leverage",
    longVolumeThresholdUSDT: "Long Vol Threshold",
    shortVolumeThresholdUSDT: "Short Vol Threshold",
    longTradeSize: "Long Trade Size",
    shortTradeSize: "Short Trade Size",
    priceOffsetBps: "Price Offset Bps",
    maxSlippageBps: "Max Slippage Bps",
    thresholdCooldown: "Threshold Cooldown",
    useThreshold: "Use Threshold",
    useTrailingTP: "Use Trailing TP",
    ttpActivationPercent: "TTP Activation %",
    ttpCallbackPercent: "TTP Callback %",
    vwapProtection: "VWAP Protection",
    vwapTimeframe: "VWAP Timeframe",
    vwapLookback: "VWAP Lookback",
    forceMarketEntry: "Force Market Entry",
    maxPositionMarginUSDT: "Max Position Margin",
    orderType: "Order Type",
};

const formatValue = (key: keyof StrategyParams, value: any) => {
    if (value === undefined || value === null) return 'N/A';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (key === 'leverage') return `${value}x`;
    if (key.endsWith('Percent')) return `${value}%`;
    if (key.includes('USDT') || key.includes('Size')) return `$${value}`;
    return value.toString();
}

export function SuggestionComparison({ currentParams, suggestedParams }: SuggestionComparisonProps) {
  const allKeys = Array.from(new Set([...Object.keys(currentParams), ...Object.keys(suggestedParams)])) as (keyof StrategyParams)[];
  const changedKeys = allKeys.filter(key => suggestedParams[key] !== undefined && suggestedParams[key] !== currentParams[key]);

  if (changedKeys.length === 0) {
    return <p className="text-sm text-muted-foreground">No changes suggested for this symbol.</p>
  }

  return (
    <div className="space-y-2">
      {changedKeys.map(key => {
        const currentValue = currentParams[key];
        const suggestedValue = suggestedParams[key];
        if (suggestedValue === undefined) return null;

        return (
            <div key={key} className="grid grid-cols-3 items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
                <span className="font-medium text-muted-foreground col-span-1">{PARAM_LABELS[key] || key}</span>
                <div className="col-span-2 flex items-center justify-end gap-2 font-mono">
                    <span className="text-red-400 line-through">{formatValue(key, currentValue)}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span className="text-green-400">{formatValue(key, suggestedValue)}</span>
                </div>
            </div>
        );
      })}
    </div>
  );
}
