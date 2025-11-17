

import { z } from "zod";

export interface MarketPair {
  pair: string;
  price: number;
  change24h: number;
  priceHistory?: { time: number; price: number }[];
}

export const strategySchema = z.object({
  longVolumeThresholdUSDT: z.coerce.number().min(0),
  shortVolumeThresholdUSDT: z.coerce.number().min(0),
  useVolumeThreshold: z.boolean(),
  longTradeSize: z.coerce.number().positive("Must be positive"),
  shortTradeSize: z.coerce.number().positive("Must be positive"),
  maxPositionMarginUSDT: z.coerce.number().positive("Must be positive"),
  leverage: z.coerce.number().min(1).max(100),
  tpPercent: z.coerce.number().min(0),
  slPercent: z.coerce.number().min(0),
  priceOffsetBps: z.coerce.number().min(0),
  maxSlippageBps: z.coerce.number().min(0),
  orderType: z.enum(["LIMIT", "MARKET"]),
  vwapProtection: z.boolean(),
  vwapTimeframe: z.string().min(1, "Required"),
  vwapLookback: z.coerce.number().min(1),
  useThreshold: z.boolean(),
  thresholdTimeWindow: z.coerce.number().min(0),
  thresholdCooldown: z.coerce.number().min(0),
  forceMarketEntry: z.boolean(),
  // New Trailing Take Profit fields
  useTrailingTP: z.boolean(),
  ttpActivationPercent: z.coerce.number().min(0),
  ttpCallbackPercent: z.coerce.number().min(0),
});

export type StrategyParams = z.infer<typeof strategySchema>;


export interface GlobalStrategy {
    paperTradingInitialBalance: number;
    apiKey?: string;
    apiSecret?: string;
    // Discord integration
    discordWebhookUrl?: string;
    discordEnabled?: boolean;
    // App behavior
    disablePassword?: boolean; // If true, skip the password gate on launch
    // Optimizer
    geminiApiKey?: string; // Optional: used by Optimizer UI; Genkit still reads from process.env
    // Connection tuning
    ssePingIntervalMs?: number; // SSE heartbeat ping interval (default: 25000ms)
    perSymbol: Record<string, Partial<StrategyParams>>;
}


export interface LiquidationOpportunity {
  id: string;
  pair: string;
  type: 'long' | 'short';
  liquidationPrice: number;
  currentPrice: number;
  volumeUSDT?: number; // Optional for backward compatibility
}

export interface PendingOrder {
    id: string;
    pair: string;
    type: 'buy' | 'sell';
    price: number;
    size: number;
    tp?: number;
    sl?: number;
}

export interface OpenPosition {
    id: string;
    pair: string;
    action: 'buy' | 'sell';
    size: number;
    entryPrice: number;
    leverage: number;
    tp: number;
    sl: number;
    // Trailing TP state
    ttpActivated: boolean;
    peakProfitPercent: number;
    trailingStopPrice: number | null;
}

export interface Trade {
  id: string;
  pair: string;
  entryPrice: number;
  exitPrice: number;
  size: number;
  action: 'buy' | 'sell';
  timestamp: number;
  pnl: number;
  exitReason: 'Take Profit' | 'Stop Loss' | 'Trailing TP' | 'Manual Close';
}

export interface PerformanceHistoryPoint {
    time: number;
    pnl: number;
}

export interface PerformanceData {
  pnl: number;
  winRate: number;
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  performanceHistory: PerformanceHistoryPoint[];
  // Bybit Unified Account balances
  balance: number; // Margin balance (totalMarginBalance or USDT marginBalance)
  availableBalance: number; // Available balance (totalAvailableBalance or USDT availableBalance)
  currency: 'USDT';
}

export type PriceTrend = 'up' | 'down';
export type TradingMode = 'paper' | 'live';
