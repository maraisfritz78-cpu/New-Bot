
"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { suggestStrategyAdjustments, SuggestStrategyAdjustmentsOutput } from '@/ai/flows/suggest-strategy-adjustments';
import * as bybitService from '@/lib/bybit-service';
import * as discordService from '@/lib/discord-service';
import { useToast } from '@/hooks/use-toast';
import type { MarketPair, LiquidationOpportunity, Trade, GlobalStrategy, StrategyParams, PerformanceData, TradingMode, OpenPosition, PendingOrder } from '@/lib/types';
import { defaultSymbolStrategy } from '@/lib/user-config';
import { DashboardHeader } from '@/components/dashboard/header';
import { History, Wand2, Settings, ListTree, List, BarChart } from 'lucide-react';
import { SymbolsView } from '@/components/dashboard/symbols-view';
import { HistoryCard } from '@/components/dashboard/history-card';
import { OptimizerCard } from '@/components/dashboard/optimizer-card';
import { SettingsView } from '@/components/dashboard/settings-view';
import { Play, Pause, Timer } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider, SidebarInset, SidebarHeader, SidebarTrigger, SidebarSeparator } from '@/components/ui/sidebar';
import { StrategyView } from '@/components/dashboard/strategy-view';
import { Logo } from '@/components/icons/logo';
import { OpenPositionsCard } from '@/components/dashboard/open-positions-card';
import { PendingOrdersCard } from '@/components/dashboard/pending-orders-card';
import { AuthScreen } from '@/components/dashboard/auth-screen';
import { HealthCard } from '@/components/dashboard/health-card';

// Helper function to resolve the strategy for a given symbol
const getStrategyForSymbol = (globalStrategy: GlobalStrategy, symbol: string): StrategyParams => {
  const symbolOverride = globalStrategy.perSymbol[symbol] || {};
  return { ...defaultSymbolStrategy, ...symbolOverride };
};

const PASSWORD_KEY = 'liquidator_admin_hash';

export default function DashboardPage() {
  // Debug: Verify component is mounted
  console.log('[DashboardPage] Component mounted/rendered');
  
  const { toast } = useToast();
  const [marketData, setMarketData] = useState<MarketPair[]>([]);
  
  console.log('>>> IMMEDIATE: marketData.length =', marketData.length);
  
  // Debug: Log marketData changes
  useEffect(() => {
    console.log('[Dashboard] marketData changed, length =', marketData.length, ', pairs:', marketData.map(m => m.pair).join(', '));
    if (marketData.length > 0) {
      console.log('[Dashboard] Sample prices:', marketData.slice(0, 2).map(m => `${m.pair}=$${m.price}`).join(', '));
    }
  }, [marketData.length]);
  const [strategy, setStrategy] = useState<GlobalStrategy | null>(null);
  const strategyRef = useRef(strategy);
  const [opportunities, setOpportunities] = useState<LiquidationOpportunity[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [liquidationHistory, setLiquidationHistory] = useState<LiquidationOpportunity[]>([]);
  const [activeView, setActiveView] = useState('dashboard');
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [isLocked, setIsLocked] = useState(true);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  
  // Debug: Track isLocked changes
  useEffect(() => {
    console.log('[Auth] isLocked changed to:', isLocked);
  }, [isLocked]);
  
  const getInitialPerformanceData = useCallback((balance: number, initialTrades: Trade[] = []): PerformanceData => {
    const pnl = initialTrades.reduce((acc, trade) => acc + trade.pnl, 0);
    const totalTrades = initialTrades.length;
    const totalWins = initialTrades.filter(t => t.pnl > 0).length;
    
    return {
      pnl,
      winRate: totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0,
      totalTrades,
      totalWins,
      totalLosses: totalTrades - totalWins,
      performanceHistory: [{ time: Date.now(), pnl: pnl }],
      balance: balance + pnl, // Margin balance
      availableBalance: balance + pnl, // Initialize same; will be updated by WS/REST
      currency: 'USDT',
    };
  }, []);

  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [isBotRunning, setIsBotRunning] = useState(false);
  const botAutoStartAttempted = useRef(false);

  const [priceTrends, setPriceTrends] = useState<Record<string, 'up' | 'down'>>({});
  const [health, setHealth] = useState<{ lastTicker?: number; lastOrder?: number; lastPosition?: number; lastBalance?: number; lastPing?: number }>({});
  const [optimizerSuggestion, setOptimizerSuggestion] = useState<SuggestStrategyAdjustmentsOutput | null>(null);
  const [isOptimizerLoading, setIsOptimizerLoading] = useState(false);
  const [tradingMode, setTradingMode] = useState<TradingMode>('paper');
  const [scoringWeights, setScoringWeights] = useState({
    pnl: 0.5,
    sharpe: 0.2,
    sortino: 0.1,
    drawdown: 0.2
  });

  // --- Auth Flow ---
  useEffect(() => {
    console.log('[Auth] Checking password on mount...');
    const storedHash = localStorage.getItem(PASSWORD_KEY);
    console.log('[Auth] storedHash exists:', !!storedHash);
    if (!storedHash) {
      console.log('[Auth] No hash found, locking...');
      setNeedsPasswordSetup(true);
      setIsLocked(true);
    } else {
      console.log('[Auth] Hash found, keeping unlocked');
    }
  }, []);

  const handlePasswordSet = (password: string) => {
    localStorage.setItem(PASSWORD_KEY, btoa(password)); // Simple encoding
    setNeedsPasswordSetup(false);
    setIsLocked(false);
    toast({ title: "Password Set", description: "Your bot is now password protected." });
  };

  const handleLogin = (password: string): boolean => {
    const storedHash = localStorage.getItem(PASSWORD_KEY);
    if (storedHash && btoa(password) === storedHash) {
      setIsLocked(false);
      return true;
    }
    return false;
  };


  // --- Data Fetching and Initialization ---

  // Early fetch strategy to honor disablePassword/discordEnabled before auth screen
  useEffect(() => {
    console.log('[Preload] Starting strategy preload...');
    const preload = async () => {
      try {
        const res = await fetch('/api/strategy');
        if (res.ok) {
          const saved: GlobalStrategy = await res.json();
          console.log('[Preload] Strategy loaded, disablePassword =', saved.disablePassword);
          setStrategy(saved);
          if (saved.disablePassword) {
            console.log('[Preload] Password disabled, unlocking...');
            setNeedsPasswordSetup(false);
            setIsLocked(false);
          }
        }
      } catch (e) {
        console.error('[Preload] Failed to load strategy:', e);
      }
    };
    preload();
  }, []);

  // Track if initial load has completed
  const initialLoadComplete = useRef(false);
  
  // Effect to load data on mount (runs after unlock)
  useEffect(() => {
    console.log('[useEffect-init] Triggered, isLocked =', isLocked, 'initialLoadComplete =', initialLoadComplete.current);
    
    if (isLocked) {
      console.log('[useEffect-init] Skipping initialization - user is locked');
      return; // Don't initialize if locked
    }
    
    // Only run initialization ONCE after unlock
    if (initialLoadComplete.current) {
      console.log('[useEffect-init] Skipping - already initialized');
      return;
    }
    
    console.log('[useEffect-init] User unlocked, starting initialization...');

    const initializeData = async () => {
        console.log('[useEffect-init] initializeData function called');
        try {
            // Fetch trade history and strategy in parallel
            const [tradeResponse, strategyResponse] = await Promise.all([
                fetch('/api/trades'),
                fetch('/api/strategy')
            ]);

            if (!tradeResponse.ok) throw new Error('Failed to fetch trade history');
            if (!strategyResponse.ok) throw new Error('Failed to fetch strategy');

            const historicalTrades: Trade[] = await tradeResponse.json();
            const savedStrategy: GlobalStrategy = await strategyResponse.json();

            setStrategy(savedStrategy);
            // If password gate disabled in settings, unlock immediately
            if (savedStrategy.disablePassword) {
              setNeedsPasswordSetup(false);
              setIsLocked(false);
            }
            await initializeBotForMode(tradingMode, historicalTrades, savedStrategy);
            initialLoadComplete.current = true;
            console.log('[useEffect-init] Initialization complete');

        } catch (error) {
            console.error("Initialization failed:", error);
            toast({
                variant: "destructive",
                title: "Failed to load user data",
                description: "Could not load saved trades or strategy. Starting with defaults.",
            });
            // Fallback to empty/default state
            await initializeBotForMode(tradingMode, [], null);
            initialLoadComplete.current = true;
        }
    };
  
    initializeData();
  }, [isLocked]); // Only depend on isLocked, not tradingMode
  
  // Handle trading mode changes separately (after initial load)
  useEffect(() => {
    if (!initialLoadComplete.current || !strategy) return;
    
    console.log('[TradingMode] Mode changed to', tradingMode, ', reinitializing...');
    
    const reinitialize = async () => {
      try {
        const res = await fetch('/api/trades');
        const historicalTrades: Trade[] = await res.json();
        await initializeBotForMode(tradingMode, historicalTrades, strategy);
      } catch (e) {
        console.error('[TradingMode] Reinitialization failed:', e);
      }
    };
    
    reinitialize();
  }, [tradingMode]);

  // Auto-start bot after initialization completes
  useEffect(() => {
    if (performanceData && strategy && !botAutoStartAttempted.current && marketData.length > 0) {
      botAutoStartAttempted.current = true;
      // Delay slightly to ensure everything is ready
      setTimeout(() => {
        console.log('Auto-starting bot after initialization...');
        setIsBotRunning(true);
        const webhook = strategyRef.current?.discordWebhookUrl;
        if (strategyRef.current?.discordEnabled && webhook) {
          const balanceNow = performanceData.balance ?? 0;
          discordService.sendBotStatusNotification('started', tradingMode, webhook, balanceNow);
        }
        toast({ title: 'Bot Auto-Started', description: 'Bot is now running and monitoring for opportunities.' });
      }, 1000);
    }
  }, [performanceData, strategy, marketData.length, tradingMode, toast]);

  // Effect to save strategy whenever it changes
  useEffect(() => {
    if (strategy) {
      const saveStrategy = async () => {
        try {
          await fetch('/api/strategy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(strategy),
          });
        } catch (error) {
          console.error("Failed to save strategy:", error);
          toast({
            variant: "destructive",
            title: "Save Failed",
            description: "Could not save strategy changes to file.",
          });
        }
      };
      saveStrategy();
    }
  }, [strategy]);

  // Refresh balance when API keys or mode change (without resetting state)
  useEffect(() => {
    const run = async () => {
      if (!strategy) return;
      
      // In paper mode, API keys are optional - use default balance if missing
      if (tradingMode === 'paper' && (!strategy.apiKey || !strategy.apiSecret)) {
        console.log('[Balance] Paper mode without API keys, using default balance');
        setPerformanceData(prev => {
          if (!prev) return getInitialPerformanceData(1000, trades);
          return prev; // Keep existing data
        });
        return;
      }
      
      // Skip if no API keys in live mode
      if (tradingMode === 'live' && (!strategy.apiKey || !strategy.apiSecret)) {
        console.warn('[Balance] Live mode requires API keys');
        return;
      }
      
      try {
        console.log('[Balance] Fetching account balance...');
        const { margin, available } = await bybitService.fetchAccountBalances(tradingMode, strategy.apiKey, strategy.apiSecret);
        console.log('[Balance] Fetched successfully:', margin, '/', available);
        setPerformanceData(prev => {
          if (!prev) return { ...getInitialPerformanceData(margin, trades), availableBalance: available };
          return { ...prev, balance: margin, availableBalance: available };
        });
      } catch (e: any) {
        console.error('[Balance] Fetch failed:', e?.message || e);
        // Don't crash - just use default balance in paper mode
        if (tradingMode === 'paper') {
          console.log('[Balance] Using default paper balance after error');
          setPerformanceData(prev => {
            if (!prev) return getInitialPerformanceData(1000, trades);
            return prev;
          });
        }
      }
    };
    run();
  }, [strategy?.apiKey, strategy?.apiSecret, tradingMode, trades, getInitialPerformanceData]);

  useEffect(() => {
    strategyRef.current = strategy;
  }, [strategy]);

  // Continuous price polling to ensure fresh prices - MUST be before early returns
  useEffect(() => {
    console.log('[Dashboard] Price polling useEffect triggered, marketData.length =', marketData.length, 'tradingMode =', tradingMode);
    
    if (marketData.length === 0) {
      console.log('[Dashboard] Skipping price poll - no symbols in marketData yet');
      return;
    }
    
    console.log('[Dashboard] Starting continuous price polling for', marketData.length, 'symbols:', marketData.map(m => m.pair).join(', '));
    
    const pollTickers = async () => {
      try {
        const symbols = marketData.map(m => m.pair);
        if (symbols.length === 0) return;
        
        const fresh = await bybitService.fetchLatestTickers(tradingMode, symbols);
        if (fresh.length > 0) {
          // Log occasionally to avoid spam
          if (Math.random() < 0.2) {
            console.log('[Dashboard] Price poll:', fresh.map(f => `${f.pair}=$${f.price.toFixed(4)}`).join(', '));
          }
          setMarketData(fresh);
        }
      } catch (e) {
        console.warn('[Dashboard] Price polling error:', e);
      }
    };
    
    // Poll immediately
    pollTickers();
    // Then poll every 2 seconds
    const timer = setInterval(pollTickers, 2000);
    
    return () => {
      console.log('[Dashboard] Stopping price polling');
      clearInterval(timer);
    };
  }, [tradingMode, marketData.length]);

  const resetBotState = useCallback((newBalance: number, historicalTrades: Trade[]) => {
    setTrades(historicalTrades);
    setLiquidationHistory([]);
    setOpenPositions([]);
    setPendingOrders([]);
    setPerformanceData(getInitialPerformanceData(newBalance, historicalTrades));
  }, [getInitialPerformanceData]);

  const initializeBotForMode = useCallback(async (mode: TradingMode, historicalTrades: Trade[], currentStrategy: GlobalStrategy | null) => {
    console.log('[initializeBotForMode] CALLED with mode =', mode, ', currentStrategy =', currentStrategy ? 'EXISTS' : 'NULL');
    
    setIsBotRunning(false);

    if (!currentStrategy) {
      console.log('[initializeBotForMode] No strategy provided, returning early');
      return;
    }
    
    console.log('[initializeBotForMode] Strategy loaded, has', Object.keys(currentStrategy.perSymbol || {}).length, 'symbols');

    let balance = 0; // margin balance
    let available = 0;
    if (mode === 'paper' || (mode === 'live' && currentStrategy.apiKey && currentStrategy.apiSecret)) {
        const res = await bybitService.fetchAccountBalances(mode, currentStrategy.apiKey, currentStrategy.apiSecret);
        balance = res.margin;
        available = res.available;
    } else {
        console.warn(`API Keys not provided for ${mode} balance fetch. Showing $0.`);
    }

    resetBotState(balance, historicalTrades);
    setPerformanceData(prev => prev ? { ...prev, availableBalance: available } : getInitialPerformanceData(balance, historicalTrades));
    
    // Initialize market data based on symbols in the loaded strategy
    const watchedSymbols = Object.keys(currentStrategy.perSymbol);
    console.log('[initializeBotForMode] watchedSymbols:', watchedSymbols);
    
    if (watchedSymbols.length > 0) {
      console.log('[initializeBotForMode] Fetching initial market data for', watchedSymbols.length, 'symbols');
      const initialMarketData = await bybitService.fetchInitialMarketData(mode, watchedSymbols);
      console.log('[initializeBotForMode] Received initial market data:', initialMarketData.length, 'items');
      if (initialMarketData.length > 0) {
        console.log('[initializeBotForMode] Sample data:', initialMarketData.slice(0, 2).map(m => `${m.pair}=$${m.price}`).join(', '));
      }
      console.log('[initializeBotForMode] Calling setMarketData with', initialMarketData.length, 'items');
      setMarketData(initialMarketData);
    } else {
      console.log('[initializeBotForMode] No symbols in strategy, setting empty market data');
      setMarketData([]);
    }


    const allExchangeSymbols = await bybitService.fetchAllSymbols(mode);
    setAllSymbols(allExchangeSymbols);


    toast({
      title: `Switched to ${mode === 'live' ? 'Live' : 'Paper (Testnet)'} Mode`,
      description: `Bot is now using ${mode === 'live' ? 'LIVE' : 'Testnet'} configurations.`,
    });

  }, [toast, resetBotState, getInitialPerformanceData]);

  const handleGlobalStrategyUpdate = useCallback(async (newParams: Partial<GlobalStrategy>) => {
    setStrategy(prev => {
        if (!prev) return null;
        const updatedStrategy = { ...prev, ...newParams };
        console.log("Saving global settings:", updatedStrategy);
        return updatedStrategy;
    });

    // If API keys changed, refresh balance immediately
    if (newParams.apiKey !== undefined || newParams.apiSecret !== undefined) {
      try {
        const key = newParams.apiKey ?? strategyRef.current?.apiKey;
        const secret = newParams.apiSecret ?? strategyRef.current?.apiSecret;
        const { margin, available } = await bybitService.fetchAccountBalances(tradingMode, key, secret);
        setPerformanceData(prev => prev ? { ...prev, balance: margin, availableBalance: available } : { ...getInitialPerformanceData(margin, trades), availableBalance: available });
      } catch (e) {
        console.error('Immediate balance refresh failed:', e);
      }
    }

    toast({
      title: "Global Settings Updated",
      description: "Your new API keys or integrations have been applied.",
    });

  }, [toast, tradingMode, getInitialPerformanceData, trades]);

  const handleSymbolStrategyUpdate = useCallback((symbol: string, newParams: Partial<StrategyParams>) => {
    setStrategy(prev => {
        if (!prev) return null;
        const updatedStrategy = {
            ...prev,
            perSymbol: {
                ...prev.perSymbol,
                [symbol]: {
                    ...(prev.perSymbol[symbol] || defaultSymbolStrategy), // Ensure it has a base
                    ...newParams,
                }
            }
        };
        console.log(`Saving strategy for ${symbol}:`, updatedStrategy);
        return updatedStrategy;
    });
    toast({
        title: `Strategy for ${symbol} Updated`,
        description: "The trading parameters for this symbol have been updated.",
    });
  }, [toast]);

    const handleAddSymbol = useCallback(async (symbolPair: string) => {
        const existing = marketData.find(p => p.pair === symbolPair);
        if (existing) {
          toast({
            variant: "destructive",
            title: "Symbol Already Exists",
            description: `${symbolPair} is already in your watchlist.`,
          });
          return;
        }

        try {
            const [newSymbolData] = await bybitService.fetchInitialMarketData(tradingMode, [symbolPair]);
            if (!newSymbolData) throw new Error("Could not fetch data for symbol.");
            
            setMarketData(prev => [...prev, newSymbolData]);
            
            // This will trigger the useEffect to save the strategy
            setStrategy(prev => {
                if (!prev) return null;
                const newPerSymbol = { ...prev.perSymbol };
                if (!newPerSymbol[newSymbolData.pair]) {
                    newPerSymbol[newSymbolData.pair] = defaultSymbolStrategy;
                }
                return { ...prev, perSymbol: newPerSymbol };
            });

            toast({
                title: "Symbol Added",
                description: `${newSymbolData.pair} has been added to the watchlist.`,
            });
        } catch (error) {
            console.error("Failed to add symbol", error);
            toast({
                variant: 'destructive',
                title: "Failed to Add Symbol",
                description: `Could not fetch initial market data for ${symbolPair}.`
            })
        }
    }, [marketData, toast, tradingMode]);
    
    const handleRemoveSymbol = useCallback((symbolPair: string) => {
      setMarketData(prev => prev.filter(p => p.pair !== symbolPair));

      // This will trigger the useEffect to save the strategy
      setStrategy(prev => {
        if (!prev) return null;
        const newPerSymbol = { ...prev.perSymbol };
        delete newPerSymbol[symbolPair];
        return { ...prev, perSymbol: newPerSymbol };
      });

      toast({
        title: "Symbol Removed",
        description: `${symbolPair} has been removed from the watchlist and its custom strategy deleted.`,
      });
    }, [toast]);

  const saveTradeToFile = useCallback(async (trade: Trade) => {
    try {
      const response = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trade),
      });
      if (!response.ok) {
        throw new Error('Failed to save trade to file');
      }
      console.log("Trade successfully saved:", trade.id);
    } catch (error) {
      console.error("Error saving trade:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: `Could not save trade ${trade.id} to history file.`,
      });
    }
  }, [toast]);

  const completeTrade = useCallback(async (position: OpenPosition, exitPrice: number, exitReason: Trade['exitReason']) => {
    const tradePositionSize = position.size * position.leverage;
    const grossPnl = (position.action === 'buy' ? 1 : -1) * (exitPrice - position.entryPrice) * (tradePositionSize / position.entryPrice);

    const tradeFee = 0.00075;
    const entryFee = tradePositionSize * tradeFee;
    const exitFee = (tradePositionSize + grossPnl) * tradeFee;
    const totalFees = entryFee + exitFee;
    const tradePnl = grossPnl - totalFees;
    
    const trade: Trade = {
      id: `trade-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      pair: position.pair,
      entryPrice: position.entryPrice,
      exitPrice,
      size: position.size,
      action: position.action,
      timestamp: Date.now(),
      pnl: tradePnl,
      exitReason,
    };

    setTrades(prev => [trade, ...prev].slice(0, 1000)); // Cap at 1000 most recent trades in memory
    await saveTradeToFile(trade);
    setOpenPositions(prev => prev.filter(p => p.id !== position.id));

    if (strategyRef.current?.discordEnabled && strategyRef.current?.discordWebhookUrl) {
      discordService.sendTradeNotification(trade, strategyRef.current.discordWebhookUrl);
    }

    setPerformanceData(prev => {
      if (!prev) return null;
      const newBalance = prev.balance + tradePnl;
      const newPnl = prev.pnl + tradePnl;
      const newTotalTrades = prev.totalTrades + 1;
      const newTotalWins = prev.totalWins + (tradePnl > 0 ? 1 : 0);
      const newTotalLosses = prev.totalLosses + (tradePnl <= 0 ? 1 : 0);
      const newWinRate = newTotalTrades > 0 ? (newTotalWins / newTotalTrades) * 100 : 0;
      
      const newHistory = [...prev.performanceHistory, { time: Date.now(), pnl: newPnl }].slice(-200); // Cap performance history at 200 points

      return {
        ...prev,
        pnl: newPnl,
        winRate: newWinRate,
        totalTrades: newTotalTrades,
        totalWins: newTotalWins,
        totalLosses: newTotalLosses,
        balance: newBalance,
        performanceHistory: newHistory,
      };
    });

    toast({
      title: `Trade ${exitReason}: ${position.action.toUpperCase()} ${position.pair}`,
      description: `Size: ${position.size} @ ${exitPrice.toFixed(2)} | PnL: ${tradePnl.toFixed(2)}`,
    });
  }, [saveTradeToFile, toast]);

    const openPosition = useCallback((entryPrice: number, pair: string, action: 'buy' | 'sell', resolvedStrategy: StrategyParams) => {
        const tradeSize = action === 'buy' ? resolvedStrategy.longTradeSize : resolvedStrategy.shortTradeSize;
        const tpPrice = action === 'buy'
            ? entryPrice * (1 + resolvedStrategy.tpPercent / 100)
            : entryPrice * (1 - resolvedStrategy.tpPercent / 100);

        const slPrice = action === 'buy'
            ? entryPrice * (1 - resolvedStrategy.slPercent / 100)
            : entryPrice * (1 + resolvedStrategy.slPercent / 100);

        const newPosition: OpenPosition = {
            id: `pos-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            pair: pair,
            action,
            size: tradeSize,
            entryPrice: entryPrice,
            leverage: resolvedStrategy.leverage,
            tp: tpPrice,
            sl: slPrice,
            ttpActivated: false,
            peakProfitPercent: 0,
            trailingStopPrice: null,
        };

        setOpenPositions(prev => [...prev, newPosition]);
        
        if (strategyRef.current?.discordEnabled && strategyRef.current?.discordWebhookUrl) {
          discordService.sendPositionNotification(newPosition, strategyRef.current.discordWebhookUrl);
        }

        toast({
            title: `New Position Opened: ${action.toUpperCase()} ${pair}`,
            description: `Size: ${tradeSize} @ ${entryPrice.toFixed(2)} | TP: ${tpPrice.toFixed(2)} | SL: ${slPrice.toFixed(2)}`,
        });
    }, [toast]);


  // Simple per-pair cooldown to avoid spamming repeated orders
  const lastActionAtRef = useRef<Record<string, number>>({});
  // Track pending LIMIT order timeouts for forceMarketEntry
  const orderTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

  const executeTrade = useCallback(async (opportunity: LiquidationOpportunity) => {
    console.log(`[executeTrade] Called for ${opportunity.pair}, type: ${opportunity.type}`);
    if (!strategyRef.current) {
      console.log(`[executeTrade] Aborted - no strategy`);
      return;
    }
    const resolvedStrategy = getStrategyForSymbol(strategyRef.current, opportunity.pair);
    const action = opportunity.type === 'long' ? 'sell' : 'buy';

    // Apply threshold cooldown if enabled
    const now = Date.now();
    const last = lastActionAtRef.current[opportunity.pair] || 0;
    const cooldownMs = resolvedStrategy.useThreshold ? resolvedStrategy.thresholdCooldown : 10000;
    if (now - last < cooldownMs) {
      console.log(`[executeTrade] Cooldown active for ${opportunity.pair} (${Math.round((cooldownMs - (now - last)) / 1000)}s remaining)`);
      return;
    }

    // Avoid duplicate limit orders for same pair/side near same price
    if (resolvedStrategy.orderType === 'LIMIT') {
      const exists = pendingOrders.some(o => o.pair === opportunity.pair && o.type === action && Math.abs(o.price - opportunity.liquidationPrice) / opportunity.liquidationPrice < 0.01);
      if (exists) return;
    }
    
    // Apply maxSlippageBps check for market orders
    if (resolvedStrategy.orderType === 'MARKET') {
      const maxSlippage = resolvedStrategy.maxSlippageBps / 10000;
      const marketPrice = opportunity.currentPrice;
      const acceptablePrice = action === 'buy'
        ? marketPrice * (1 + maxSlippage)
        : marketPrice * (1 - maxSlippage);
      if (action === 'buy' && acceptablePrice < opportunity.currentPrice) {
        toast({ 
          title: 'Slippage Exceeded', 
          description: `Market slippage exceeds max ${resolvedStrategy.maxSlippageBps} bps`,
          variant: 'destructive'
        });
        return;
      }
    }
    
    // Apply VWAP protection if enabled
    if (resolvedStrategy.vwapProtection) {
      try {
        const vwap = await bybitService.calculateVWAP(
          tradingMode,
          opportunity.pair,
          resolvedStrategy.vwapTimeframe,
          resolvedStrategy.vwapLookback
        );
        
        if (vwap !== null) {
          const currentPrice = opportunity.currentPrice;
          const vwapDiff = ((currentPrice - vwap) / vwap) * 100;
          
          // For liquidation trading:
          // - LONG liquidations (we SELL/SHORT): only enter if price ABOVE VWAP (overbought)
          // - SHORT liquidations (we BUY/LONG): only enter if price BELOW VWAP (oversold)
          const shouldBlock = 
            (action === 'sell' && currentPrice < vwap) ||  // Don't short below VWAP
            (action === 'buy' && currentPrice > vwap);      // Don't long above VWAP
          
          if (shouldBlock) {
            console.log(
              `[VWAP] Trade blocked for ${opportunity.pair}: ` +
              `action=${action}, price=${currentPrice.toFixed(4)}, ` +
              `VWAP=${vwap.toFixed(4)} (${vwapDiff > 0 ? '+' : ''}${vwapDiff.toFixed(2)}%)`
            );
            toast({
              title: 'VWAP Protection Active',
              description: `${opportunity.pair}: Price ${vwapDiff > 0 ? 'above' : 'below'} VWAP, trade blocked`,
            });
            return;
          }
          
          console.log(
            `[VWAP] Trade allowed for ${opportunity.pair}: ` +
            `action=${action}, price=${currentPrice.toFixed(4)}, ` +
            `VWAP=${vwap.toFixed(4)} (${vwapDiff > 0 ? '+' : ''}${vwapDiff.toFixed(2)}%)`
          );
        } else {
          console.warn(`[VWAP] Could not calculate VWAP for ${opportunity.pair}, skipping protection`);
        }
      } catch (e) {
        console.error(`[VWAP] Protection check failed for ${opportunity.pair}:`, e);
        // Don't block trade if VWAP calculation fails
      }
    }
    
    // Calculate size based on action
    const size = action === 'buy' ? resolvedStrategy.longTradeSize : resolvedStrategy.shortTradeSize;
    
    // For MARKET orders, only open locally after exchange confirms
    if (resolvedStrategy.orderType === 'MARKET') {
        // Check maxPositionMarginUSDT constraint
        const marginRequired = size * opportunity.currentPrice / resolvedStrategy.leverage;
        if (marginRequired > resolvedStrategy.maxPositionMarginUSDT) {
          toast({ 
            title: 'Position Too Large', 
            description: `Required margin ${marginRequired.toFixed(2)} exceeds max ${resolvedStrategy.maxPositionMarginUSDT}`,
            variant: 'destructive'
          });
          return;
        }
        
        const success = await bybitService.executeTrade(
          tradingMode, opportunity, resolvedStrategy,
          strategyRef.current.apiKey, strategyRef.current.apiSecret
        );
        if (success) {
            openPosition(opportunity.currentPrice, opportunity.pair, action, resolvedStrategy);
        } else {
            toast({ title: `Trade Failed (${tradingMode})`, description: "Exchange did not confirm position.", variant: "destructive" });
        }
        lastActionAtRef.current[opportunity.pair] = Date.now();
        return;
    }

    // For LIMIT orders, create a pending order on the exchange and reflect locally.
    if (resolvedStrategy.orderType === 'LIMIT') {
        const basisPoints = resolvedStrategy.priceOffsetBps / 10000;
        const price = action === 'buy' 
            ? opportunity.liquidationPrice * (1 + basisPoints)
            : opportunity.liquidationPrice * (1 - basisPoints);
        
        // Check maxPositionMarginUSDT constraint
        const marginRequired = size * price / resolvedStrategy.leverage;
        if (marginRequired > resolvedStrategy.maxPositionMarginUSDT) {
          toast({ 
            title: 'Position Too Large', 
            description: `Required margin ${marginRequired.toFixed(2)} exceeds max ${resolvedStrategy.maxPositionMarginUSDT}`,
            variant: 'destructive'
          });
          return;
        }
        
        // Calculate TP/SL prices
        const tp = action === 'buy'
          ? price * (1 + resolvedStrategy.tpPercent / 100)
          : price * (1 - resolvedStrategy.tpPercent / 100);
        const sl = action === 'buy'
          ? price * (1 - resolvedStrategy.slPercent / 100)
          : price * (1 + resolvedStrategy.slPercent / 100);

        // Place on exchange (paper -> testnet, live -> mainnet)
        const res = await bybitService.createLimitOrder(
          tradingMode,
          opportunity.pair,
          action,
          size,
          price,
          tp,
          sl,
          strategyRef.current?.apiKey,
          strategyRef.current?.apiSecret,
        );

        // Show locally immediately; exchange order stream will upsert with exord-<id>
        const localId = res?.id ? `exord-${res.id}` : `ord-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const newPendingOrder: PendingOrder = { id: localId, pair: opportunity.pair, type: action, price, size, tp, sl };
        setPendingOrders(prev => [...prev, newPendingOrder]);

        if (strategyRef.current?.discordEnabled && strategyRef.current?.discordWebhookUrl) {
          discordService.sendOrderNotification(newPendingOrder, strategyRef.current.discordWebhookUrl);
        }

        toast({
            title: res ? "Limit Order Placed" : "Limit Order Submitted (local)",
            description: `${action.toUpperCase()} ${opportunity.pair} @ ${price.toFixed(4)}`
        });
        lastActionAtRef.current[opportunity.pair] = Date.now();
        
        // Schedule forceMarketEntry if enabled and order not filled within timeout
        if (resolvedStrategy.forceMarketEntry && res?.id) {
          const orderId = res.id;
          const timeoutDuration = 5000; // 5s default timeout
          orderTimeoutRef.current[orderId] = setTimeout(async () => {
            // Check if order is still pending
            const stillPending = pendingOrders.some(o => o.id === `exord-${orderId}`);
            if (stillPending) {
              console.log(`Force market entry triggered for ${opportunity.pair}`);
              // Cancel the LIMIT order and place MARKET instead
              await bybitService.cancelExchangeOrder(tradingMode, orderId, opportunity.pair, strategyRef.current?.apiKey, strategyRef.current?.apiSecret);
              const success = await bybitService.executeTrade(tradingMode, opportunity, resolvedStrategy, strategyRef.current?.apiKey, strategyRef.current?.apiSecret);
              if (success) {
                openPosition(opportunity.currentPrice, opportunity.pair, action, resolvedStrategy);
                toast({ title: 'Force Market Entry Executed', description: `${action.toUpperCase()} ${opportunity.pair}` });
              }
            }
            delete orderTimeoutRef.current[orderId];
          }, timeoutDuration);
        }
    }
  }, [toast, tradingMode, openPosition, pendingOrders]);

  const handleCancelOrder = useCallback(async (orderId: string) => {
    const exPrefix = 'exord-';
    const isExchangeOrder = orderId.startsWith(exPrefix);
    if (isExchangeOrder) {
      const realId = orderId.slice(exPrefix.length);
      const ord = pendingOrders.find(o => o.id === orderId);
      if (ord && strategyRef.current) {
        try {
          const ok = await bybitService.cancelExchangeOrder(
            tradingMode,
            realId,
            ord.pair,
            strategyRef.current.apiKey,
            strategyRef.current.apiSecret,
          );
          if (!ok) {
            toast({ variant: 'destructive', title: 'Cancel Failed', description: 'Could not cancel order on exchange.' });
            return;
          }
        } catch (e: any) {
          // Suppress "order not exists" errors (110001) - order may have filled already
          if (e?.message?.includes('110001') || e?.message?.includes('not exists')) {
            console.log(`[Cancel] Order ${orderId} already filled or cancelled`);
          } else {
            toast({ variant: 'destructive', title: 'Cancel Failed', description: 'Could not cancel order on exchange.' });
            return;
          }
        }
      }
    }
    setPendingOrders(prev => prev.filter(o => o.id !== orderId));
    toast({
        title: "Order Cancelled",
        description: isExchangeOrder ? `Exchange order cancelled.` : `Local order removed.`
    });
  }, [toast, pendingOrders, tradingMode]);

  const handleManualClose = useCallback(async (positionId: string) => {
    const positionToClose = openPositions.find(p => p.id === positionId);
    if (!positionToClose) return;

    // If this is an exchange-tracked position, close on exchange (reduce-only market)
    if (positionToClose.id.startsWith('exch-') && strategyRef.current) {
      toast({ title: 'Closing on Exchange…', description: `${positionToClose.action.toUpperCase()} ${positionToClose.pair}` });
      const ok = await bybitService.closePosition(
        tradingMode,
        positionToClose.pair,
        positionToClose.action,
        strategyRef.current.apiKey,
        strategyRef.current.apiSecret,
      );
      if (!ok) {
        toast({ variant: 'destructive', title: 'Close Failed', description: 'Could not close position on exchange.' });
        return;
      }
      // Wait for WS position update to remove from UI
      return;
    }

    // Local-only position: close immediately in UI
    const currentMarketPair = marketData.find(m => m.pair === positionToClose.pair);
    if (!currentMarketPair) {
        toast({variant: 'destructive', title: "Error", description: "Could not find market data to close position."})
        return;
    };
    
    completeTrade(positionToClose, currentMarketPair.price, 'Manual Close');
  }, [openPositions, marketData, completeTrade, toast, tradingMode]);

    // Effect to check if pending limit orders have been filled
    const [filledOrders, setFilledOrders] = useState<PendingOrder[]>([]);

    useEffect(() => {
        // Only simulate fills for local-only orders (not exchange exord-*)
        const localPending = pendingOrders.filter(o => !o.id.startsWith('exord-'));
        if (!isBotRunning || localPending.length === 0 || !strategyRef.current) return;
    
        const newlyFilled: PendingOrder[] = [];
    
        const remainingOrders = pendingOrders.filter(order => {
            if (order.id.startsWith('exord-')) return true;
            const market = marketData.find(m => m.pair === order.pair);
            if (!market) return true;
    
            const isFilled = (order.type === 'buy' && market.price <= order.price) || (order.type === 'sell' && market.price >= order.price);
    
            if (isFilled) {
                console.log(`Order ${order.id} filled (simulated)`);
                newlyFilled.push(order);
                return false;
            }
            return true;
        });
    
        if (newlyFilled.length > 0) {
            setPendingOrders(remainingOrders);
            setFilledOrders(prev => [...prev, ...newlyFilled]);
        }
    
    }, [marketData, isBotRunning, pendingOrders]);

    useEffect(() => {
        if (filledOrders.length > 0) {
            filledOrders.forEach(order => {
                const resolvedStrategy = getStrategyForSymbol(strategyRef.current!, order.pair);
                openPosition(order.price, order.pair, order.type, resolvedStrategy);
            });
            setFilledOrders([]);
        }
    }, [filledOrders, openPosition]);


  useEffect(() => {
      if (!isBotRunning || !strategyRef.current) return;

      const checkPositions = () => {
          setOpenPositions(prevPositions =>
              prevPositions.map(pos => {
                  const market = marketData.find(m => m.pair === pos.pair);
                  if (!market) return pos;

                  const resolvedStrategy = getStrategyForSymbol(strategyRef.current!, pos.pair);
                  const currentPrice = market.price;
                  let currentProfitPercent = (pos.action === 'buy' ? 1 : -1) * ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;

                  // --- Trailing TP Logic ---
                  if (resolvedStrategy.useTrailingTP) {
                      let updatedPos = { ...pos };

                      // Activate TTP if activation profit is reached
                      if (!updatedPos.ttpActivated && currentProfitPercent >= resolvedStrategy.ttpActivationPercent) {
                          updatedPos.ttpActivated = true;
                          toast({ title: `Trailing TP Activated for ${pos.pair}`, description: `Profit at ${currentProfitPercent.toFixed(2)}%` });
                      }

                      if (updatedPos.ttpActivated) {
                          // Update peak profit
                          updatedPos.peakProfitPercent = Math.max(updatedPos.peakProfitPercent, currentProfitPercent);

                          // Calculate new trailing stop price
                          const callbackMultiplier = 1 - (resolvedStrategy.ttpCallbackPercent / 100);
                          const peakPrice = pos.entryPrice * (1 + (updatedPos.peakProfitPercent / 100) * (pos.action === 'buy' ? 1 : -1));
                          
                          if (pos.action === 'buy') {
                              updatedPos.trailingStopPrice = peakPrice * callbackMultiplier;
                          } else { // 'sell'
                              updatedPos.trailingStopPrice = peakPrice * (1 + (resolvedStrategy.ttpCallbackPercent / 100));
                          }

                          // Check if trailing stop is hit
                          if (updatedPos.trailingStopPrice) {
                              if ((pos.action === 'buy' && currentPrice <= updatedPos.trailingStopPrice) ||
                                  (pos.action === 'sell' && currentPrice >= updatedPos.trailingStopPrice))
                              {
                                  completeTrade(pos, updatedPos.trailingStopPrice, 'Trailing TP');
                                  return null; // Position will be removed
                              }
                          }
                      }
                  }

                  // --- Standard TP/SL Logic ---
                  // Skip auto-close for exchange-tracking positions (managed externally)
                  if (pos.id.startsWith('exch-')) {
                      return pos;
                  }
                  if (pos.action === 'buy') {
                      if (!resolvedStrategy.useTrailingTP && currentPrice >= pos.tp) {
                          completeTrade(pos, pos.tp, 'Take Profit');
                          return null;
                      }
                      if (currentPrice <= pos.sl) {
                          completeTrade(pos, pos.sl, 'Stop Loss');
                          return null;
                      }
                  } else { // 'sell' action
                      if (!resolvedStrategy.useTrailingTP && currentPrice <= pos.tp) {
                          completeTrade(pos, pos.tp, 'Take Profit');
                          return null;
                      }
                      if (currentPrice >= pos.sl) {
                          completeTrade(pos, pos.sl, 'Stop Loss');
                          return null;
                      }
                  }
                  
                  return pos; // Return original position if no action was taken
              }).filter(p => p !== null) as OpenPosition[]
          );
      };
      
      checkPositions();
  }, [marketData, isBotRunning, completeTrade, toast]);


  const handleRunOptimizer = useCallback(async (usePhase2 = false, usePhase3 = false, usePhase4 = false) => {
    if (!strategy) return;
    setIsOptimizerLoading(true);
    setOptimizerSuggestion(null);
    try {
      // Check optimizer status first
      const statusRes = await fetch('/api/optimizer');
      const status = await statusRes.json();
      
      if (!status.ready) {
        toast({
          variant: "destructive",
          title: "Insufficient Data",
          description: `Need ${50 - (status.stats?.totalOpportunities || 0)} more liquidation events. Keep the bot running to collect data.`,
        });
        setIsOptimizerLoading(false);
        return;
      }

      // Run optimization with Phase 1, Phase 2, Phase 3, or Phase 4
      const symbols = marketData.map(m => m.pair);
      const response = await fetch('/api/optimizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          symbols, 
          strategy, 
          phase2: usePhase2, 
          phase3: usePhase3,
          phase4: usePhase4,
          weights: (usePhase3 || usePhase4) ? scoringWeights : undefined 
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Optimization failed');
      }

      const result = await response.json();
      
      // Convert to format expected by UI
      const phaseLabel = result.phase4
        ? 'Phase 4 (Elite)' 
        : result.phase3 
        ? 'Phase 3 (Professional)' 
        : result.phase2 
        ? 'Phase 2 (TP/SL/Leverage/Size)' 
        : 'Phase 1 (Thresholds)';
      const formatted: any = {
        phase2: result.phase2,
        phase3: result.phase3,
        phase4: result.phase4,
        overallReasoning: `${phaseLabel}: Analyzed ${result.summary.dataPoints} historical liquidations across ${result.summary.testedCombinations} parameter combinations. Found ${result.summary.totalImprovement} USDT potential improvement.`,
        projected7DayPnl: parseFloat(result.summary.avgImprovement) * 7,
        projected30DayPnl: parseFloat(result.summary.avgImprovement) * 30,
        perSymbolSuggestions: Object.values(result.results)
          .filter((r: any) => !r.skipped)
          .map((r: any) => {
            const sharpeInfo = r.optimized.sharpeRatio ? ` | Sharpe: ${r.optimized.sharpeRatio.toFixed(2)}` : '';
            const sortinoInfo = (result.phase3 || result.phase4) && r.sortinoRatio ? ` | Sortino: ${r.sortinoRatio.toFixed(2)}` : '';
            const profitFactorInfo = result.phase4 && r.profitFactor ? ` | Profit Factor: ${r.profitFactor.toFixed(2)}` : '';
            
            let suggestion = `Long Threshold: ${r.current.longThreshold?.toFixed(0) || 'N/A'} → ${r.optimized.longThreshold?.toFixed(0)}\nShort Threshold: ${r.current.shortThreshold?.toFixed(0) || 'N/A'} → ${r.optimized.shortThreshold?.toFixed(0)}`;
            
            if (result.phase2 || result.phase3 || result.phase4) {
              suggestion += `\nTP: ${r.current.tpPercent || 'N/A'}% → ${r.optimized.tpPercent}%\nSL: ${r.current.slPercent || 'N/A'}% → ${r.optimized.slPercent}%`;
              suggestion += `\nLeverage: ${r.current.leverage || 'N/A'}x → ${r.optimized.leverage}x`;
              suggestion += `\nPosition Size: $${r.current.longTradeSize || 'N/A'} → $${r.optimized.longTradeSize}`;
            }
            
            if (result.phase3 || result.phase4) {
              suggestion += `\nEntry Delay: ${r.recommendedSettings.entryDelay || 0}s`;
              suggestion += `\nCooldown: ${r.recommendedSettings.cooldownPeriod || 0}s`;
              suggestion += `\nSortino: ${r.sortinoRatio?.toFixed(2) || 'N/A'}`;
              suggestion += `\nCalmar: ${r.calmarRatio?.toFixed(2) || 'N/A'}`;
              suggestion += `\nMax Consecutive Losses: ${r.consecutiveLosses || 'N/A'}`;
              suggestion += `\nSlippage Impact: -$${r.slippageImpact?.toFixed(2) || '0'}`;
            }
            
            if (result.phase4) {
              suggestion += `\nDynamic Sizing: ${r.recommendedSettings.dynamicSizing ? 'Yes' : 'No'}`;
              if (r.recommendedSettings.dynamicSizing) {
                suggestion += `\nWin Multiplier: ${r.recommendedSettings.sizeMultiplierWin?.toFixed(2)}`;
                suggestion += `\nLoss Multiplier: ${r.recommendedSettings.sizeMultiplierLoss?.toFixed(2)}`;
              }
              suggestion += `\nTrailing Stop: ${r.recommendedSettings.trailingStopPercent || 0}%`;
              suggestion += `\nPartial Exit: ${r.recommendedSettings.partialExitPercent || 0}%`;
              suggestion += `\nProfit Factor: ${r.profitFactor?.toFixed(2) || 'N/A'}`;
              suggestion += `\nAvg Position Size: $${r.avgPositionSize?.toFixed(2) || 'N/A'}`;
              suggestion += `\nTrailing Hits: ${r.trailingStopHits || 0} | Partial Exits: ${r.partialExits || 0}`;
            }
            
            suggestion += `\nImprovement: +${r.improvement.toFixed(2)} USDT`;
            
            return {
              symbol: r.symbol,
              reasoning: `Current: ${r.current.totalTrades} trades, $${r.current.totalPnL.toFixed(2)} PnL, ${r.current.winRate.toFixed(1)}% win rate${r.current.sharpeRatio ? ` | Sharpe: ${r.current.sharpeRatio.toFixed(2)}` : ''}. Optimized: ${r.optimized.totalTrades} trades, $${r.optimized.totalPnL.toFixed(2)} PnL, ${r.optimized.winRate.toFixed(1)}% win rate${sharpeInfo}${sortinoInfo}${profitFactorInfo}.`,
              humanReadableSuggestion: suggestion,
              suggestedParams: r.recommendedSettings,
            };
          }),
      };
      
      setOptimizerSuggestion(formatted);
      toast({
        title: `Optimization Complete (${phaseLabel})`,
        description: `Analyzed ${result.summary.symbolsAnalyzed} symbols, tested ${result.summary.testedCombinations} combinations.`,
      });
    } catch (error: any) {
      console.error("Optimizer failed:", error);
      toast({
        variant: "destructive",
        title: "Optimization Failed",
        description: error.message || "Could not complete optimization.",
      });
    } finally {
      setIsOptimizerLoading(false);
    }
  }, [marketData, strategy, toast, scoringWeights]);
  
    const handleApplyOptimizerSuggestions = useCallback((suggestions: Record<string, Partial<StrategyParams>>) => {
        setStrategy(prev => {
            if (!prev) return null;
            const newPerSymbol = { ...prev.perSymbol };
            for (const symbol in suggestions) {
                if (newPerSymbol[symbol]) {
                    newPerSymbol[symbol] = {
                        ...newPerSymbol[symbol],
                        ...suggestions[symbol],
                    };
                }
            }
            return { ...prev, perSymbol: newPerSymbol };
        });

        toast({
            title: "Optimizer Suggestions Applied",
            description: "The recommended parameters have been applied to the relevant symbols.",
        });
    }, [toast]);

    const handleUpdatePosition = useCallback(async (positionId: string, newTp: number, newSl: number) => {
        setOpenPositions(prev =>
            prev.map(pos =>
                pos.id === positionId ? { ...pos, tp: newTp, sl: newSl } : pos
            )
        );
        const pos = openPositions.find(p => p.id === positionId);
        if (pos && positionId.startsWith('exch-') && strategyRef.current) {
          await bybitService.updatePositionStops(
            tradingMode,
            pos.pair,
            pos.action,
            newTp,
            newSl,
            strategyRef.current.apiKey,
            strategyRef.current.apiSecret,
          );
        }
        toast({
            title: "Position Updated",
            description: "TP and SL updated" + (positionId.startsWith('exch-') ? ' on Exchange' : ''),
        });
    }, [toast, openPositions, tradingMode]);

  // Track last bot status (used to avoid double sends)
  const lastBotStatusRef = useRef<boolean | null>(null);
  useEffect(() => {
    lastBotStatusRef.current = isBotRunning;
  }, [isBotRunning]);

  // Start streaming even when the bot is not running (read-only mode)
  // Use useRef to track market stream connection without triggering reconnects
  const marketStreamRef = useRef<(() => void) | null>(null);
  
  useEffect(() => {
    if (!strategyRef.current) return;
    
    // Wait for marketData to be populated before connecting
    if (marketData.length === 0) {
      // Disconnect if we had a connection but now have no symbols
      if (marketStreamRef.current) {
        console.log('[Dashboard] No symbols, disconnecting market stream');
        marketStreamRef.current();
        marketStreamRef.current = null;
      }
      return;
    }
    
    // Disconnect existing connection before creating a new one
    if (marketStreamRef.current) {
      console.log('[Dashboard] Reconnecting market stream due to symbol changes');
      marketStreamRef.current();
      marketStreamRef.current = null;
    }

    console.log(`[Dashboard] Starting market stream with ${marketData.length} symbols:`, marketData.map(m => m.pair).join(', '));

    // Kick off server streams
    const disconnect = bybitService.connectToMarketStream(
      tradingMode,
      marketData,
      (pair: string) => getStrategyForSymbol(strategyRef.current!, pair),
      ({ newData, newOpportunities }) => {
        // Update market data and trends
        setMarketData(prev => {
          const trends: Record<string, 'up' | 'down'> = {};
          newData.forEach(newPair => {
              const oldPair = prev.find(p => p.pair === newPair.pair);
              if (oldPair) {
                  trends[newPair.pair] = newPair.price > oldPair.price ? 'up' : 'down';
              }
          });
          // Debug: Log market data updates occasionally
          if (Math.random() < 0.1) {
            console.log('[Dashboard] Market data updated:', newData.map(d => `${d.pair}=$${d.price}`).join(', '));
          }
          setPriceTrends(trends);
          setTimeout(() => setPriceTrends({}), 500);
          return newData;
        });

        if (newOpportunities.length > 0) {
            setOpportunities(newOpportunities);
            setLiquidationHistory(prev => [...newOpportunities, ...prev].slice(0, 100));
        }
      },
      async (evt: any) => {
        if (!strategyRef.current) return;
        if (evt.type === 'ping') {
          setHealth(prev => ({ ...prev, lastPing: Date.now() }));
          return;
        }
        if (evt.type === 'ready') {
          setHealth(prev => ({ ...prev, lastPing: Date.now() }));
          // When private WS is ready, pull a fresh snapshot to reflect manual exchange actions
          if (evt.scope === 'private') {
            try {
              const snap = await bybitService.fetchExchangeSnapshot(
                tradingMode,
                strategyRef.current?.apiKey,
                strategyRef.current?.apiSecret,
              );
              setOpenPositions(prev => {
                const exchPositions = snap.positions.map(p => ({
                  id: `exch-${p.pair}`,
                  pair: p.pair,
                  action: p.side,
                  size: p.size,
                  entryPrice: p.entryPrice,
                  leverage: p.leverage,
                  tp: p.side === 'buy' ? p.entryPrice * 1.01 : p.entryPrice * 0.99,
                  sl: p.side === 'buy' ? p.entryPrice * 0.99 : p.entryPrice * 1.01,
                  ttpActivated: false,
                  peakProfitPercent: 0,
                  trailingStopPrice: null,
                }));
                const nonExch = prev.filter(p => !p.id.startsWith('exch-'));
                return [...nonExch, ...exchPositions];
              });
              setPendingOrders(prev => {
                const exchOrders = snap.orders.map(o => ({ id: `exord-${o.id}`, pair: o.pair, type: o.type, price: o.price, size: o.size }));
                const nonExch = prev.filter(o => !o.id.startsWith('exord-'));
                // Deduplicate: only add orders that don't already exist
                const existingIds = new Set(nonExch.map(o => o.id));
                const newOrders = exchOrders.filter(o => !existingIds.has(o.id));
                return [...nonExch, ...newOrders];
              });
              setPerformanceData(prev => prev ? { ...prev, balance: snap.balances.margin, availableBalance: snap.balances.available } : prev);
            } catch {}
          }
          return;
        }
        if (evt.type === 'error') {
          console.error('WS error:', evt.message || evt);
          return;
        }
        if (evt.type === 'ticker') {
          setHealth(prev => ({ ...prev, lastTicker: Date.now() }));
          return;
        }
        if (evt.type === 'position') {
          const symbol = evt.symbol as string;
          const side = (evt.side as 'buy' | 'sell') || 'buy';
          const size = Math.abs(Number(evt.size ?? 0));
          const entryPrice = Number(evt.entryPrice ?? 0);
          const resolved = getStrategyForSymbol(strategyRef.current, symbol);
          setHealth(prev => ({ ...prev, lastPosition: Date.now() }));
          if (size > 0 && entryPrice > 0) {
            setOpenPositions(prev => {
              const id = `exch-${symbol}`;
              const existing = prev.find(p => p.id === id);
              const tp = side === 'buy' ? entryPrice * (1 + resolved.tpPercent / 100) : entryPrice * (1 - resolved.tpPercent / 100);
              const sl = side === 'buy' ? entryPrice * (1 - resolved.slPercent / 100) : entryPrice * (1 + resolved.slPercent / 100);
              const updated = {
                id,
                pair: symbol,
                action: side,
                size,
                entryPrice,
                leverage: resolved.leverage,
                tp,
                sl,
                ttpActivated: false,
                peakProfitPercent: 0,
                trailingStopPrice: null,
              };
              
              // Only update TP/SL on exchange for NEW positions
              // Don't spam updates for existing positions as they may already have correct TP/SL
              if (!existing) {
                (async () => {
                  try {
                    console.log(`[Dashboard] Setting initial TP/SL for new position ${symbol}`);
                    await bybitService.updatePositionStops(
                      tradingMode,
                      symbol,
                      side,
                      tp,
                      sl,
                      strategyRef.current?.apiKey,
                      strategyRef.current?.apiSecret
                    );
                  } catch (e: any) {
                    // Suppress "not modified" errors (34040) as they're not real errors
                    if (e?.message?.includes('34040') || e?.message?.includes('not modified')) {
                      console.log(`[Dashboard] TP/SL already set correctly for ${symbol}`);
                    } else {
                      console.warn(`Failed to update TP/SL for ${symbol}:`, e);
                    }
                  }
                })();
              }
              
              return existing ? prev.map(p => (p.id === id ? updated : p)) : [...prev, updated];
            });
          } else {
            setOpenPositions(prev => prev.filter(p => p.id !== `exch-${symbol}`));
          }
          return;
        }
        if (evt.type === 'order') {
          const status = String(evt.status || '').toLowerCase();
          const orderId: string | undefined = evt.orderId;
          const pair = String(evt.symbol || '');
          const side = (String(evt.side || '').toLowerCase() === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell';
          const price = Number(evt.price || 0);
          const size = Number(evt.size || 0);
          setHealth(prev => ({ ...prev, lastOrder: Date.now() }));
          const isOpen = ['created','new','untriggered','partiallyfilled','partially_filled'].includes(status);
          const isClosed = ['filled','cancelled','canceled','rejected','triggered'].includes(status);
          if (isOpen && orderId) {
            setPendingOrders(prev => {
              const cleaned = prev.filter(o => !(o.pair === pair && o.type === side && Math.abs(o.price - price) < 1e-6));
              const exId = `exord-${orderId}`;
              const exists = cleaned.find(o => o.id === exId);
              const newItem = { id: exId, pair, type: side, price, size };
              return exists ? cleaned.map(o => (o.id === exId ? newItem : o)) : [...cleaned, newItem];
            });
          } else if (isClosed && orderId) {
            const exId = `exord-${orderId}`;
            setPendingOrders(prev => prev.filter(o => o.id !== exId));
          }
          return;
        }
        if (evt.type === 'balance') {
          const margin = evt.margin !== undefined ? Number(evt.margin) : undefined;
          const available = evt.available !== undefined ? Number(evt.available) : undefined;
          setHealth(prev => ({ ...prev, lastBalance: Date.now() }));
          setPerformanceData(prev => (prev ? { ...prev, balance: (margin ?? prev.balance), availableBalance: (available ?? prev.availableBalance) } : prev));
        }
      },
      strategyRef.current?.apiKey,
      strategyRef.current?.apiSecret,
    );

    // Fetch REST snapshot to populate positions/orders/balances immediately
    (async () => {
      try {
        const snap = await bybitService.fetchExchangeSnapshot(
          tradingMode,
          strategyRef.current?.apiKey,
          strategyRef.current?.apiSecret,
        );
        // Positions
        setOpenPositions(prev => {
          const exchPositions = snap.positions.map(p => ({
            id: `exch-${p.pair}`,
            pair: p.pair,
            action: p.side,
            size: p.size,
            entryPrice: p.entryPrice,
            leverage: p.leverage,
            tp: p.side === 'buy' ? p.entryPrice * 1.01 : p.entryPrice * 0.99,
            sl: p.side === 'buy' ? p.entryPrice * 0.99 : p.entryPrice * 1.01,
            ttpActivated: false,
            peakProfitPercent: 0,
            trailingStopPrice: null,
          }));
          // Remove old exch-* before inserting fresh snapshot
          const nonExch = prev.filter(p => !p.id.startsWith('exch-'));
          return [...nonExch, ...exchPositions];
        });
        // Orders
        setPendingOrders(prev => {
          const exchOrders = snap.orders.map(o => ({ id: `exord-${o.id}`, pair: o.pair, type: o.type, price: o.price, size: o.size }));
          const nonExch = prev.filter(o => !o.id.startsWith('exord-'));
          // Deduplicate: only add orders that don't already exist
          const existingIds = new Set(nonExch.map(o => o.id));
          const newOrders = exchOrders.filter(o => !existingIds.has(o.id));
          return [...nonExch, ...newOrders];
        });
        // Balances
        setPerformanceData(prev => prev ? { ...prev, balance: snap.balances.margin, availableBalance: snap.balances.available } : prev);
      } catch (e) {
        console.warn('Snapshot fetch failed:', e);
      }
    })();

    marketStreamRef.current = disconnect;
    
    return () => {
      disconnect();
      marketStreamRef.current = null;
    };

  }, [tradingMode, strategy?.apiKey, strategy?.apiSecret, marketData.length]);
  
  // Fallback periodic poll if no wallet event for a while
  useEffect(() => {
    if (!strategyRef.current) return;
    let timer: any;
    const tick = async () => {
      try {
        // If no wallet event in 15s, poll REST
        if (!health.lastBalance || Date.now() - health.lastBalance > 15000) {
          const { margin, available } = await bybitService.fetchAccountBalances(tradingMode, strategyRef.current.apiKey, strategyRef.current.apiSecret);
          setPerformanceData(prev => (prev ? { ...prev, balance: margin, availableBalance: available } : prev));
        }
      } catch {}
    };
    timer = setInterval(tick, 5000);
    return () => clearInterval(timer);
  }, [tradingMode, health.lastBalance]);
  
  // Collect liquidation data for optimizer
  useEffect(() => {
    if (opportunities.length > 0) {
      // Log opportunities to database (server-side only)
      opportunities.forEach(async (opp) => {
        try {
          await fetch('/api/liquidations/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              timestamp: Date.now(),
              symbol: opp.pair,
              side: opp.type,
              volumeUSDT: opp.volumeUSDT || 0, // Use volume from opportunity data
              liquidationPrice: opp.liquidationPrice,
              currentPrice: opp.currentPrice,
            }),
          });
        } catch (e) {
          // Silent fail - don't interrupt bot
        }
      });
    }
  }, [opportunities]);
  
  useEffect(() => {
    if (isBotRunning && opportunities.length > 0) {
      console.log(`[Dashboard] Bot is running, executing ${opportunities.length} opportunities`);
      opportunities.forEach(opportunity => {
        executeTrade(opportunity);
      });
      setOpportunities([]); 
    } else if (!isBotRunning && opportunities.length > 0) {
      console.log(`[Dashboard] ${opportunities.length} opportunities detected but bot is STOPPED`);
    }
  }, [opportunities, isBotRunning, executeTrade]);
  
  const { unrealizedPnl, totalInPosition, availableBalance, pnl24h } = useMemo(() => {
    if (!performanceData || !marketData.length) {
      return { unrealizedPnl: 0, totalInPosition: 0, availableBalance: performanceData?.availableBalance ?? 0, pnl24h: 0 };
    }

    const marketPriceMap = marketData.reduce((acc, curr) => {
      acc[curr.pair] = curr.price;
      return acc;
    }, {} as Record<string, number>);

    let currentUnrealizedPnl = 0;
    let currentTotalInPosition = 0;

    openPositions.forEach(pos => {
      const currentPrice = marketPriceMap[pos.pair] || pos.entryPrice;
      const positionValue = pos.size * pos.entryPrice;
      currentUnrealizedPnl += (currentPrice - pos.entryPrice) * (pos.action === 'buy' ? 1 : -1) * pos.size * pos.leverage;
      currentTotalInPosition += positionValue;
    });
    
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const tradesLast24h = trades.filter(t => t.timestamp >= oneDayAgo);
    const pnlLast24h = tradesLast24h.reduce((acc, t) => acc + t.pnl, 0);

    const available = performanceData?.availableBalance ?? 0;

    return { 
        unrealizedPnl: currentUnrealizedPnl, 
        totalInPosition: currentTotalInPosition,
        availableBalance: available,
        pnl24h: pnlLast24h,
    };
  }, [performanceData, openPositions, marketData, trades]);


  const { pnl, winRate, balance } = useMemo(() => {
    return {
      pnl: performanceData?.pnl ?? 0,
      winRate: performanceData?.winRate ?? 0,
      balance: performanceData?.balance ?? 0, // margin balance
    }
  }, [performanceData]);

  // Toggle bot start/stop and send Discord once per click
  const toggleBot = useCallback(() => {
    const next = !isBotRunning;
    setIsBotRunning(next);
    const webhook = strategyRef.current?.discordWebhookUrl;
    if (strategyRef.current?.discordEnabled && webhook) {
      const balanceNow = performanceData?.balance ?? 0;
      if (next) {
        discordService.sendBotStatusNotification('started', tradingMode, webhook, balanceNow);
      } else {
        discordService.sendBotStatusNotification('stopped', tradingMode, webhook, balanceNow);
      }
    }
  }, [isBotRunning, tradingMode, performanceData?.balance]);

  if (isLocked) {
      return (
          <AuthScreen 
              isSetup={needsPasswordSetup}
              onPasswordSet={handlePasswordSet}
              onLogin={handleLogin}
          />
      );
  }


  if (!strategy || !performanceData) {
      // Loading state or splash screen
      return (
          <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
              <div className="flex flex-col items-center gap-4">
                  <Timer className="h-12 w-12 animate-spin text-accent" />
                  <p className="text-muted-foreground">Loading Bot Data...</p>
              </div>
          </div>
      );
  }

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <div className="grid grid-cols-1 gap-4">
              <HealthCard health={health} mode={tradingMode} />
              <OpenPositionsCard 
                openPositions={openPositions} 
                marketData={marketData}
                onManualClose={handleManualClose} 
                onUpdatePosition={handleUpdatePosition}
              />
              <PendingOrdersCard pendingOrders={pendingOrders} onCancelOrder={handleCancelOrder} />
          </div>
        );
      case 'symbols':
        return <SymbolsView allSymbols={allSymbols} watchedSymbols={marketData.map(p => p.pair)} onAddSymbol={handleAddSymbol} onRemoveSymbol={handleRemoveSymbol} />;
      case 'strategy':
        return <StrategyView marketData={marketData} strategy={strategy} onUpdateSymbolStrategy={handleSymbolStrategyUpdate} />;
      case 'optimizer':
        return (
          <div className="flex justify-center">
            <div className="w-full lg:max-w-2xl">
              <OptimizerCard
                onOptimize={handleRunOptimizer}
                suggestion={optimizerSuggestion}
                isLoading={isOptimizerLoading}
                onApplySuggestions={handleApplyOptimizerSuggestions}
                currentGeminiKey={strategy.geminiApiKey}
                onSaveGeminiKey={(key) => handleGlobalStrategyUpdate({ geminiApiKey: key })}
                weights={scoringWeights}
                onWeightsChange={setScoringWeights}
              />
            </div>
          </div>
        );
      case 'history':
        return (
          <div className="grid grid-cols-1 gap-4 md:gap-8">
            <HistoryCard title="Liquidation History" icon={History} data={liquidationHistory} type="liquidation" />
            <HistoryCard title="Trade History" icon={History} data={trades} type="trade" />
          </div>
        );
      case 'settings':
        return <SettingsView strategy={strategy} onUpdateStrategy={handleGlobalStrategyUpdate} tradingMode={tradingMode} />;
      default:
        return null;
    }
  };


  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full flex-col bg-background">
        <DashboardHeader
          tradingMode={tradingMode}
          onTradingModeChange={setTradingMode}
          balance={balance}
          availableBalance={availableBalance}
          inPosition={totalInPosition}
          unrealizedPnl={unrealizedPnl}
          pnl24h={pnl24h}
          pnl={pnl}
          winRate={winRate}
        />
        <div className="flex flex-1">
          <Sidebar>
            <SidebarHeader>
                <div className="flex items-center gap-2 flex-1">
                    <Logo className="h-7 w-7 text-accent group-data-[state=collapsed]/sidebar:h-8 group-data-[state=collapsed]/sidebar:w-8 transition-all" />
                    <span className="font-headline text-lg group-data-[state=collapsed]/sidebar:hidden">Liquidator</span>
                </div>
                <SidebarTrigger className="group-data-[state=collapsed]/sidebar:flex" />
            </SidebarHeader>
            <SidebarContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setActiveView('dashboard')} isActive={activeView === 'dashboard'} tooltip="Dashboard"><BarChart/><span>Dashboard</span></SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setActiveView('symbols')} isActive={activeView === 'symbols'} tooltip="Symbols"><List/><span>Symbols</span></SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setActiveView('strategy')} isActive={activeView === 'strategy'} tooltip="Strategy"><ListTree/><span>Strategy</span></SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setActiveView('optimizer')} isActive={activeView === 'optimizer'} tooltip="Optimizer"><Wand2/><span>Optimizer</span></SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setActiveView('history')} isActive={activeView === 'history'} tooltip="History"><History/><span>History</span></SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setActiveView('settings')} isActive={activeView === 'settings'} tooltip="Settings"><Settings/><span>Settings</span></SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarSeparator />
                 <SidebarMenuItem>
                    <SidebarMenuButton 
                        onClick={toggleBot}
                        tooltip={isBotRunning ? "Pause Bot" : "Start Bot"}
                        className="justify-center group-data-[state=expanded]/sidebar:w-full group-data-[state=expanded]/sidebar:justify-start"
                    >
                         {isBotRunning ? <Pause className="text-accent" /> : <Play />}
                        <span>{isBotRunning ? 'Bot is Running' : 'Start Bot'}</span>
                    </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>
          </Sidebar>
          <SidebarInset>
            <main className="flex-1 flex flex-col gap-4 p-4 md:gap-8 md:p-8">
              {renderContent()}
            </main>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}

