"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipForward, SkipBack, RotateCcw, TrendingUp, TrendingDown, Clock } from "lucide-react";
import type { StrategyParams } from "@/lib/types";

interface BacktestTrade {
  id: number;
  timestamp: number;
  pair: string;
  side: 'long' | 'short';
  action: 'buy' | 'sell';
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
  exitType?: 'tp' | 'sl';
}

interface BacktestResult {
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

interface BacktestCardProps {
  symbol: string;
  strategy: StrategyParams;
}

export function BacktestCard({ symbol, strategy }: BacktestCardProps) {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Playback state
  const [currentTradeIndex, setCurrentTradeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000); // ms per trade

  const runBacktest = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setCurrentTradeIndex(0);

    try {
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, strategy }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || err.error || 'Backtest failed');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [symbol, strategy]);

  // Auto-play functionality
  useEffect(() => {
    if (!isPlaying || !result) return;

    const interval = setInterval(() => {
      setCurrentTradeIndex((prev) => {
        if (prev >= result.trades.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, result, playbackSpeed]);

  const handlePlayPause = () => {
    if (!result) return;
    if (currentTradeIndex >= result.trades.length - 1) {
      setCurrentTradeIndex(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentTradeIndex(0);
  };

  const handleNext = () => {
    if (!result) return;
    setIsPlaying(false);
    setCurrentTradeIndex((prev) => Math.min(prev + 1, result.trades.length - 1));
  };

  const handlePrevious = () => {
    setIsPlaying(false);
    setCurrentTradeIndex((prev) => Math.max(prev - 1, 0));
  };

  const currentTrade = result?.trades[currentTradeIndex];
  const displayedTrades = result?.trades.slice(0, currentTradeIndex + 1) || [];
  const currentPnL = displayedTrades.reduce((sum, t) => sum + t.netPnl, 0);
  const currentWins = displayedTrades.filter((t) => t.netPnl > 0).length;
  const currentLosses = displayedTrades.filter((t) => t.netPnl <= 0).length;
  const currentWinRate = displayedTrades.length > 0 ? (currentWins / displayedTrades.length) * 100 : 0;

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-headline">Backtest Visualizer 📊</CardTitle>
            <CardDescription>
              Play through historical trades step-by-step for {symbol}
            </CardDescription>
          </div>
          {!result && (
            <Button onClick={runBacktest} disabled={isLoading}>
              {isLoading ? 'Running...' : 'Run Backtest'}
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {error && (
          <div className="p-4 mb-4 bg-destructive/10 border border-destructive rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-muted/30">
                <CardHeader className="pb-2 pt-3">
                  <CardDescription className="text-xs">Total P&L (Current)</CardDescription>
                  <CardTitle className={`text-lg font-mono ${currentPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${currentPnL.toFixed(2)}
                  </CardTitle>
                </CardHeader>
              </Card>
              
              <Card className="bg-muted/30">
                <CardHeader className="pb-2 pt-3">
                  <CardDescription className="text-xs">Win Rate (Current)</CardDescription>
                  <CardTitle className="text-lg font-mono">
                    {currentWinRate.toFixed(1)}%
                  </CardTitle>
                </CardHeader>
              </Card>
              
              <Card className="bg-muted/30">
                <CardHeader className="pb-2 pt-3">
                  <CardDescription className="text-xs">Trades (Current)</CardDescription>
                  <CardTitle className="text-lg font-mono">
                    {displayedTrades.length} / {result.totalTrades}
                  </CardTitle>
                </CardHeader>
              </Card>
              
              <Card className="bg-muted/30">
                <CardHeader className="pb-2 pt-3">
                  <CardDescription className="text-xs">Sharpe Ratio (Final)</CardDescription>
                  <CardTitle className="text-lg font-mono">
                    {result.sharpeRatio.toFixed(2)}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-4 p-4 bg-muted/30 rounded-lg">
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrevious} disabled={currentTradeIndex === 0}>
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={handlePlayPause}>
                {isPlaying ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                {isPlaying ? 'Pause' : 'Play'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleNext} disabled={currentTradeIndex >= result.trades.length - 1}>
                <SkipForward className="h-4 w-4" />
              </Button>
              
              <div className="ml-4 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <select 
                  className="bg-background border rounded px-2 py-1 text-sm"
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                >
                  <option value={2000}>0.5x</option>
                  <option value={1000}>1x</option>
                  <option value={500}>2x</option>
                  <option value={250}>4x</option>
                </select>
              </div>
            </div>

            {/* Current Trade Display */}
            {currentTrade && (
              <Card className={`border-2 ${currentTrade.netPnl > 0 ? 'border-green-500/50 bg-green-500/5' : 'border-red-500/50 bg-red-500/5'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {currentTrade.netPnl > 0 ? (
                        <TrendingUp className="h-5 w-5 text-green-400" />
                      ) : (
                        <TrendingDown className="h-5 w-5 text-red-400" />
                      )}
                      Trade #{currentTrade.id} - {currentTrade.action.toUpperCase()}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        currentTrade.hitTP 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {currentTrade.hitTP ? '✓ Take Profit' : '✗ Stop Loss'}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Entry Price</p>
                      <p className="font-mono font-semibold">${currentTrade.entryPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Exit Price</p>
                      <p className="font-mono font-semibold">${currentTrade.exitPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Size</p>
                      <p className="font-mono font-semibold">${currentTrade.size} @ {currentTrade.leverage}x</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Net P&L</p>
                      <p className={`font-mono font-semibold ${currentTrade.netPnl > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${currentTrade.netPnl.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm pt-2 border-t">
                    <div>
                      <p className="text-muted-foreground text-xs">TP Target</p>
                      <p className="font-mono text-green-400">${currentTrade.tpPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">SL Target</p>
                      <p className="font-mono text-red-400">${currentTrade.slPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Timestamp</p>
                      <p className="font-mono text-xs">
                        {new Date(currentTrade.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground text-xs mb-1">Liquidation Details</p>
                    <p className="text-sm">
                      <span className="font-semibold">{currentTrade.side === 'long' ? 'Long' : 'Short'}</span> liquidation
                      {' '}with volume of <span className="font-mono">${currentTrade.volumeUSDT.toFixed(0)}</span>
                      {' '}→ We {currentTrade.action === 'buy' ? 'bought' : 'shorted'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* P&L Chart (Simple ASCII-style visualization) */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Cumulative P&L</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {displayedTrades.slice(-10).map((trade, idx) => {
                    const barWidth = Math.abs(trade.runningBalance) / Math.max(...displayedTrades.map(t => Math.abs(t.runningBalance))) * 100;
                    const isPositive = trade.runningBalance >= 0;
                    
                    return (
                      <div key={trade.id} className="flex items-center gap-2 text-xs">
                        <span className="font-mono w-8 text-muted-foreground">#{trade.id}</span>
                        <div className="flex-1 bg-muted/50 rounded overflow-hidden h-4">
                          <div 
                            className={`h-full ${isPositive ? 'bg-green-500/50' : 'bg-red-500/50'}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className={`font-mono w-20 text-right ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          ${trade.runningBalance.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Final Summary (shown when playback complete) */}
            {currentTradeIndex === result.trades.length - 1 && (
              <Card className="bg-accent/10 border-accent">
                <CardHeader>
                  <CardTitle className="text-lg">Final Results</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total P&L</p>
                    <p className={`text-xl font-mono ${result.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${result.totalPnL.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                    <p className="text-xl font-mono">{result.winRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Max Drawdown</p>
                    <p className="text-xl font-mono text-red-400">${result.maxDrawdown.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg P&L/Trade</p>
                    <p className={`text-xl font-mono ${result.avgPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${result.avgPnL.toFixed(2)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
