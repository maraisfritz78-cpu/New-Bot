import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getDatabase } from '@/lib/database';
import type { StrategyParams } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface BacktestTrade {
  id: number;
  timestamp: number;
  pair: string;
  side: 'long' | 'short'; // Liquidation side
  action: 'buy' | 'sell'; // Our trade action (fade the liquidation)
  entryPrice: number;
  exitPrice: number;
  tpPrice: number;
  slPrice: number;
  size: number;
  leverage: number;
  hitTP: boolean;
  pnl: number;
  fees: number;
  netPnl: number;
  runningBalance: number;
  volumeUSDT: number;
  slippageCost?: number;
  entryDelay?: number;
  exitType?: 'tp' | 'sl' | 'trailing' | 'partial';
}

interface BacktestSummary {
  symbol: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnL: number;
  avgPnL: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: BacktestTrade[];
}

/**
 * Seeded random number generator for deterministic results
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

function createSeed(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * POST /api/backtest
 * Run detailed backtest with trade-by-trade breakdown
 */
export async function POST(request: NextRequest) {
  try {
    initDatabase();
    const db = getDatabase();

    const body = await request.json();
    const { symbol, strategy }: { symbol: string; strategy: StrategyParams } = body;

    if (!symbol || !strategy) {
      return NextResponse.json(
        { error: 'Missing symbol or strategy' },
        { status: 400 }
      );
    }

    // Get historical liquidations
    const longs = db.prepare(`
      SELECT * FROM liquidations 
      WHERE symbol = ? AND side = 'long' AND volume_usdt >= ?
      ORDER BY timestamp
    `).all(symbol, strategy.longVolumeThresholdUSDT);

    const shorts = db.prepare(`
      SELECT * FROM liquidations 
      WHERE symbol = ? AND side = 'short' AND volume_usdt >= ?
      ORDER BY timestamp
    `).all(symbol, strategy.shortVolumeThresholdUSDT);

    const allLiquidations = [...longs, ...shorts].sort(
      (a: any, b: any) => a.timestamp - b.timestamp
    );

    if (allLiquidations.length === 0) {
      return NextResponse.json({
        error: 'No liquidation data available',
        message: `No liquidations found for ${symbol} with the given thresholds.`,
      }, { status: 400 });
    }

    const trades: BacktestTrade[] = [];
    let runningBalance = 0;
    let peak = 0;
    let maxDrawdown = 0;
    let wins = 0;
    let losses = 0;
    let totalPnL = 0;
    const returns: number[] = [];
    const rng = new SeededRandom(createSeed(symbol));

    for (let i = 0; i < allLiquidations.length; i++) {
      const liq: any = allLiquidations[i];
      const isSell = liq.side === 'long'; // Fade longs = sell/short
      const entryPrice = liq.current_price;

      // Calculate TP/SL
      const tpPercent = strategy.tpPercent / 100;
      const slPercent = strategy.slPercent / 100;

      const tpPrice = isSell
        ? entryPrice * (1 - tpPercent)
        : entryPrice * (1 + tpPercent);

      const slPrice = isSell
        ? entryPrice * (1 + slPercent)
        : entryPrice * (1 - slPercent);

      // Outcome probability based on TP/SL ratio
      const tpDistance = Math.abs(tpPrice - entryPrice);
      const slDistance = Math.abs(slPrice - entryPrice);
      const ratio = tpDistance / slDistance;
      let winProbability = 0.65 - (ratio - 1) * 0.15;
      winProbability = Math.max(0.35, Math.min(0.75, winProbability));

      const hitTP = rng.next() < winProbability;
      const exitPrice = hitTP ? tpPrice : slPrice;
      const size = isSell ? strategy.shortTradeSize : strategy.longTradeSize;
      const leverage = strategy.leverage;

      // Calculate P&L
      const priceChange = isSell
        ? (entryPrice - exitPrice)
        : (exitPrice - entryPrice);
      const grossPnL = (priceChange / entryPrice) * size * leverage;
      const fees = size * 0.00075 * leverage; // 0.075% round trip
      const netPnL = grossPnL - fees;

      runningBalance += netPnL;
      totalPnL += netPnL;
      returns.push(netPnL);

      if (runningBalance > peak) peak = runningBalance;
      const drawdown = peak - runningBalance;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      if (netPnL > 0) wins++;
      else losses++;

      trades.push({
        id: i + 1,
        timestamp: liq.timestamp,
        pair: symbol,
        side: liq.side,
        action: isSell ? 'sell' : 'buy',
        entryPrice,
        exitPrice,
        tpPrice,
        slPrice,
        size,
        leverage,
        hitTP,
        pnl: grossPnL,
        fees,
        netPnl: netPnL,
        runningBalance,
        volumeUSDT: liq.volume_usdt,
        exitType: hitTP ? 'tp' : 'sl',
      });
    }

    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;

    // Calculate Sharpe Ratio
    let sharpeRatio = 0;
    if (returns.length > 1) {
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
    }

    const summary: BacktestSummary = {
      symbol,
      totalTrades,
      winningTrades: wins,
      losingTrades: losses,
      totalPnL,
      avgPnL,
      winRate,
      maxDrawdown,
      sharpeRatio,
      trades,
    };

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('[Backtest API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Backtest failed' },
      { status: 500 }
    );
  }
}
