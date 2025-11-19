
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
import { analyzeSymbol } from '@/lib/market-analysis';

// Helper function to resolve the strategy for a given symbol
const getStrategyForSymbol = (globalStrategy: GlobalStrategy, symbol: string): StrategyParams => {
  const symbolOverride = globalStrategy.perSymbol[symbol] || {};
  return { ...defaultSymbolStrategy, ...symbolOverride };
};

const PASSWORD_KEY = 'liquidator_admin_hash';

export default function DashboardPage() {
  const { toast } = useToast();
  const [marketData, setMarketData] = useState<MarketPair[]>([]);
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

  // --- Auth Flow ---
  useEffect(() => {
    const storedHash = localStorage.getItem(PASSWORD_KEY);
    if (!storedHash) {
      setNeedsPasswordSetup(true);
      setIsLocked(true);
    } else {
        setIsLocked(false);
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
  useEffect(() => {
    if (isLocked) return;
    
    const initialize = async () => {
      try {
        const [tradeResponse, strategyResponse] = await Promise.all([
          fetch('/api/trades'),
          fetch('/api/strategy')
        ]);

        const historicalTrades: Trade[] = await tradeResponse.json();
        const savedStrategy: GlobalStrategy = await strategyResponse.json();

        setStrategy(savedStrategy);
        if (savedStrategy.disablePassword) {
          setNeedsPasswordSetup(false);
          setIsLocked(false);
        }

        await initializeBotForMode(tradingMode, historicalTrades, savedStrategy);
      } catch (error) {
        console.error("Initialization failed:", error);
        toast({ variant: "destructive", title: "Failed to load user data" });
        await initializeBotForMode(tradingMode, [], null);
      }
    };
    
    initialize();
  }, [isLocked, tradingMode]);

  // Auto-start bot
  useEffect(() => {
    if (performanceData && strategy && !botAutoStartAttempted.current && marketData.length > 0) {
      botAutoStartAttempted.current = true;
      setTimeout(() => {
        setIsBotRunning(true);
        const webhook = strategyRef.current?.discordWebhookUrl;
        if (strategyRef.current?.discordEnabled && webhook) {
          discordService.sendBotStatusNotification('started', tradingMode, webhook, performanceData.balance ?? 0);
        }
        toast({ title: 'Bot Auto-Started', description: 'Bot is now running and monitoring for opportunities.' });
      }, 1000);
    }
  }, [performanceData, strategy, marketData.length, tradingMode, toast]);

  // Save strategy on change
  useEffect(() => {
    if (strategy) {
      fetch('/api/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(strategy),
      }).catch(error => console.error("Failed to save strategy:", error));
    }
  }, [strategy]);

  useEffect(() => {
    strategyRef.current = strategy;
  }, [strategy]);

  const resetBotState = useCallback((newBalance: number, historicalTrades: Trade[]) => {
    setTrades(historicalTrades);
    setLiquidationHistory([]);
    setOpenPositions([]);
    setPendingOrders([]);
    setPerformanceData(getInitialPerformanceData(newBalance, historicalTrades));
  }, [getInitialPerformanceData]);

  const initializeBotForMode = useCallback(async (mode: TradingMode, historicalTrades: Trade[], currentStrategy: GlobalStrategy | null) => {
    setIsBotRunning(false);
    if (!currentStrategy) return;

    let balance = 0, available = 0;
    try {
      const res = await bybitService.fetchAccountBalances(mode, currentStrategy.apiKey, currentStrategy.apiSecret);
      balance = res.margin;
      available = res.available;
    } catch (e) {
      console.warn(`API Keys not provided for ${mode} balance fetch. Using default.`);
      balance = 1000;
      available = 1000;
    }

    resetBotState(balance, historicalTrades);
    setPerformanceData(prev => prev ? { ...prev, availableBalance: available } : getInitialPerformanceData(balance, historicalTrades));
    
    const watchedSymbols = Object.keys(currentStrategy.perSymbol);
    if (watchedSymbols.length > 0) {
      const initialMarketData = await bybitService.fetchInitialMarketData(mode, watchedSymbols);
      setMarketData(initialMarketData);
    }

    const allExchangeSymbols = await bybitService.fetchAllSymbols(mode);
    setAllSymbols(allExchangeSymbols);

    toast({ title: `Switched to ${mode === 'live' ? 'Live' : 'Paper'} Mode` });
  }, [toast, resetBotState, getInitialPerformanceData]);

  const handleGlobalStrategyUpdate = useCallback(async (newParams: Partial<GlobalStrategy>) => {
    setStrategy(prev => prev ? { ...prev, ...newParams } : null);
    toast({ title: "Global Settings Updated" });
  }, [toast]);

  const handleSymbolStrategyUpdate = useCallback((symbol: string, newParams: Partial<StrategyParams>) => {
    setStrategy(prev => {
        if (!prev) return null;
        return {
            ...prev,
            perSymbol: {
                ...prev.perSymbol,
                [symbol]: { ...(prev.perSymbol[symbol] || defaultSymbolStrategy), ...newParams },
            }
        };
    });
    toast({ title: `Strategy for ${symbol} Updated` });
  }, [toast]);

  const handleAddSymbol = useCallback(async (symbolPair: string) => {
    if (marketData.find(p => p.pair === symbolPair)) {
      toast({ variant: "destructive", title: "Symbol Already Exists" });
      return;
    }
    try {
      const [newSymbolData] = await bybitService.fetchInitialMarketData(tradingMode, [symbolPair]);
      if (!newSymbolData) throw new Error("Could not fetch data.");
      setMarketData(prev => [...prev, newSymbolData]);
      setStrategy(prev => {
          if (!prev) return null;
          const newPerSymbol = { ...prev.perSymbol, [newSymbolData.pair]: defaultSymbolStrategy };
          return { ...prev, perSymbol: newPerSymbol };
      });
      toast({ title: "Symbol Added", description: `${newSymbolData.pair} added.` });
    } catch (error) {
      toast({ variant: 'destructive', title: "Failed to Add Symbol" });
    }
  }, [marketData, toast, tradingMode]);
    
  const handleRemoveSymbol = useCallback((symbolPair: string) => {
    setMarketData(prev => prev.filter(p => p.pair !== symbolPair));
    setStrategy(prev => {
      if (!prev) return null;
      const newPerSymbol = { ...prev.perSymbol };
      delete newPerSymbol[symbolPair];
      return { ...prev, perSymbol: newPerSymbol };
    });
    toast({ title: "Symbol Removed" });
  }, [toast]);

  const saveTradeToFile = useCallback(async (trade: Trade) => {
    try {
      await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trade),
      });
    } catch (error) {
      toast({ variant: "destructive", title: "Save Failed", description: `Could not save trade ${trade.id}.` });
    }
  }, [toast]);

  const completeTrade = useCallback(async (position: OpenPosition, exitPrice: number, exitReason: Trade['exitReason']) => {
    const tradeSize = position.size * position.leverage;
    const grossPnl = (position.action === 'buy' ? 1 : -1) * (exitPrice - position.entryPrice) * (tradeSize / position.entryPrice);
    const fees = tradeSize * 0.00075 * 2; // Approximate fees
    const pnl = grossPnl - fees;
    
    const trade: Trade = { id: `trade-${Date.now()}`, pair: position.pair, entryPrice: position.entryPrice, exitPrice, size: position.size, action: position.action, timestamp: Date.now(), pnl, exitReason };

    setTrades(prev => [trade, ...prev].slice(0, 1000));
    await saveTradeToFile(trade);
    setOpenPositions(prev => prev.filter(p => p.id !== position.id));

    if (strategyRef.current?.discordEnabled) {
      discordService.sendTradeNotification(trade, strategyRef.current.discordWebhookUrl);
    }

    setPerformanceData(prev => {
      if (!prev) return null;
      const newBalance = prev.balance + pnl;
      const newPnl = prev.pnl + pnl;
      const newTotalTrades = prev.totalTrades + 1;
      const newTotalWins = prev.totalWins + (pnl > 0 ? 1 : 0);
      return {
        ...prev,
        pnl: newPnl,
        winRate: (newTotalWins / newTotalTrades) * 100,
        totalTrades: newTotalTrades,
        totalWins: newTotalWins,
        totalLosses: newTotalTrades - newTotalWins,
        balance: newBalance,
        performanceHistory: [...prev.performanceHistory, { time: Date.now(), pnl: newPnl }].slice(-200),
      };
    });

    toast({ title: `Trade ${exitReason}: ${position.action.toUpperCase()} ${position.pair}`, description: `PnL: ${pnl.toFixed(2)}` });
  }, [saveTradeToFile, toast]);

  const openPosition = useCallback((entryPrice: number, pair: string, action: 'buy' | 'sell', resolvedStrategy: StrategyParams) => {
    const { tpPercent, slPercent, leverage, longTradeSize, shortTradeSize } = resolvedStrategy;
    const size = action === 'buy' ? longTradeSize : shortTradeSize;
    const tp = action === 'buy' ? entryPrice * (1 + tpPercent / 100) : entryPrice * (1 - tpPercent / 100);
    const sl = action === 'buy' ? entryPrice * (1 - slPercent / 100) : entryPrice * (1 + slPercent / 100);
    const newPosition: OpenPosition = { id: `pos-${Date.now()}`, pair, action, size, entryPrice, leverage, tp, sl, ttpActivated: false, peakProfitPercent: 0, trailingStopPrice: null };

    setOpenPositions(prev => [...prev, newPosition]);
    if (strategyRef.current?.discordEnabled) {
      discordService.sendPositionNotification(newPosition, strategyRef.current.discordWebhookUrl);
    }
    toast({ title: `New Position: ${action.toUpperCase()} ${pair}` });
  }, [toast]);

  const lastActionAtRef = useRef<Record<string, number>>({});

  const executeTrade = useCallback(async (opportunity: LiquidationOpportunity) => {
    if (!strategyRef.current) return;
    const resolvedStrategy = getStrategyForSymbol(strategyRef.current, opportunity.pair);
    const action = opportunity.type === 'long' ? 'sell' : 'buy';

    const now = Date.now();
    if (now - (lastActionAtRef.current[opportunity.pair] || 0) < (resolvedStrategy.thresholdCooldown || 10000)) return;

    const size = action === 'buy' ? resolvedStrategy.longTradeSize : resolvedStrategy.shortTradeSize;
    const success = await bybitService.executeTrade(tradingMode, opportunity, resolvedStrategy, strategyRef.current.apiKey, strategyRef.current.apiSecret);
    if (success) {
      openPosition(opportunity.currentPrice, opportunity.pair, action, resolvedStrategy);
      lastActionAtRef.current[opportunity.pair] = now;
    }
  }, [toast, tradingMode, openPosition]);

  const handleCancelOrder = useCallback(async (orderId: string) => {
    // Simplified cancel logic
    setPendingOrders(prev => prev.filter(o => o.id !== orderId));
    toast({ title: "Order Cancelled" });
  }, [toast]);

  const handleManualClose = useCallback(async (positionId: string) => {
    const position = openPositions.find(p => p.id === positionId);
    if (!position) return;
    const market = marketData.find(m => m.pair === position.pair);
    if (!market) return;
    completeTrade(position, market.price, 'Manual Close');
  }, [openPositions, marketData, completeTrade]);

  useEffect(() => {
    if (!isBotRunning || !strategyRef.current) return;

    const checkOpenPositions = () => {
      openPositions.forEach(pos => {
        const market = marketData.find(m => m.pair === pos.pair);
        if (!market) return;
        if ((pos.action === 'buy' && market.price >= pos.tp) || (pos.action === 'sell' && market.price <= pos.tp)) {
          completeTrade(pos, pos.tp, 'Take Profit');
        } else if ((pos.action === 'buy' && market.price <= pos.sl) || (pos.action === 'sell' && market.price >= pos.sl)) {
          completeTrade(pos, pos.sl, 'Stop Loss');
        }
      });
    };

    const checkPendingOrders = () => {
      pendingOrders.forEach(order => {
          const market = marketData.find(m => m.pair === order.pair);
          if (!market) return;
          if ((order.type === 'buy' && market.price <= order.price) || (order.type === 'sell' && market.price >= order.price)) {
              const resolvedStrategy = getStrategyForSymbol(strategyRef.current!, order.pair);
              openPosition(order.price, order.pair, order.type, resolvedStrategy);
              setPendingOrders(prev => prev.filter(o => o.id !== order.id));
          }
      });
    };

    checkOpenPositions();
    checkPendingOrders();
  }, [marketData, isBotRunning, completeTrade, openPosition, openPositions, pendingOrders]);


  const handleRunOptimizer = useCallback(async () => {
    if (!strategy) return;
    setIsOptimizerLoading(true);
    setOptimizerSuggestion(null);
    try {
      const symbolsToAnalyze = marketData.map(m => m.pair);

      // 1. Analyze market conditions for each symbol
      const analysisPromises = symbolsToAnalyze.map(async (symbol) => {
        const analysis = await analyzeSymbol(symbol);
        return { symbol, ...analysis };
      });
      const marketAnalyses = await Promise.all(analysisPromises);

      // 2. Get trade history
      const tradeHistoryResponse = await fetch('/api/trades');
      const tradeHistory: Trade[] = await tradeHistoryResponse.json();

      // 3. Call the AI flow with all the data
      const result = await suggestStrategyAdjustments({
          strategy,
          marketAnalyses,
          tradeHistory
      });

      setOptimizerSuggestion(result);
      toast({
        title: "AI Optimization Complete",
        description: "The AI has analyzed the data and provided suggestions.",
      });

    } catch (error: any) {
      console.error("Optimizer failed:", error);
      toast({
        variant: "destructive",
        title: "AI Optimizer Failed",
        description: error.message || "Could not complete AI optimization.",
      });
    } finally {
      setIsOptimizerLoading(false);
    }
  }, [marketData, strategy, toast]);
  
  const handleApplyOptimizerSuggestions = useCallback((suggestions: Record<string, Partial<StrategyParams>>) => {
    setStrategy(prev => {
        if (!prev) return null;
        const newPerSymbol = { ...prev.perSymbol };
        for (const symbol in suggestions) {
            if (newPerSymbol[symbol]) {
                newPerSymbol[symbol] = { ...newPerSymbol[symbol], ...suggestions[symbol] };
            }
        }
        return { ...prev, perSymbol: newPerSymbol };
    });
    toast({ title: "AI Suggestions Applied" });
  }, [toast]);

  const handleUpdatePosition = useCallback(async (positionId: string, newTp: number, newSl: number) => {
    setOpenPositions(prev => prev.map(pos => pos.id === positionId ? { ...pos, tp: newTp, sl: newSl } : pos));
    toast({ title: "Position Updated" });
  }, [toast]);

  // Stream market data
  useEffect(() => {
    if (marketData.length === 0) return;
    const disconnect = bybitService.connectToMarketStream(tradingMode, marketData, getStrategyForSymbol, 
      ({ newData, newOpportunities }) => {
        setMarketData(newData);
        if (newOpportunities.length > 0) {
          setOpportunities(newOpportunities);
          setLiquidationHistory(prev => [...newOpportunities, ...prev].slice(0, 100));
        }
      }, 
      (evt) => {
        if (evt.type === 'ping') setHealth(prev => ({ ...prev, lastPing: Date.now() }));
      }
    );
    return () => disconnect();
  }, [tradingMode, marketData.length]);
  
  // Log liquidations
  useEffect(() => {
    if (opportunities.length > 0) {
      opportunities.forEach(opp => {
        fetch('/api/liquidations/log', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ ...opp, timestamp: Date.now() })
        }).catch(() => {});
      });
    }
  }, [opportunities]);
  
  // Execute trades
  useEffect(() => {
    if (isBotRunning && opportunities.length > 0) {
      opportunities.forEach(executeTrade);
      setOpportunities([]); 
    }
  }, [opportunities, isBotRunning, executeTrade]);
  
  const { unrealizedPnl, totalInPosition, availableBalance, pnl24h } = useMemo(() => {
    if (!performanceData || !marketData.length) return { unrealizedPnl: 0, totalInPosition: 0, availableBalance: 0, pnl24h: 0 };
    const marketPriceMap = marketData.reduce((acc, curr) => ({ ...acc, [curr.pair]: curr.price }), {} as Record<string, number>);
    let pnl = 0, inPos = 0;
    openPositions.forEach(pos => {
      pnl += (marketPriceMap[pos.pair] - pos.entryPrice) * (pos.action === 'buy' ? 1 : -1) * pos.size * pos.leverage;
      inPos += pos.size * pos.entryPrice;
    });
    const tradesLast24h = trades.filter(t => t.timestamp >= Date.now() - 86400000);
    const pnl24h = tradesLast24h.reduce((acc, t) => acc + t.pnl, 0);
    return { unrealizedPnl: pnl, totalInPosition: inPos, availableBalance: performanceData.availableBalance ?? 0, pnl24h };
  }, [performanceData, openPositions, marketData, trades]);

  const { pnl, winRate, balance } = useMemo(() => ({
    pnl: performanceData?.pnl ?? 0,
    winRate: performanceData?.winRate ?? 0,
    balance: performanceData?.balance ?? 0,
  }), [performanceData]);

  const toggleBot = useCallback(() => {
    const next = !isBotRunning;
    setIsBotRunning(next);
    if (strategyRef.current?.discordEnabled) {
      discordService.sendBotStatusNotification(next ? 'started' : 'stopped', tradingMode, strategyRef.current.discordWebhookUrl, performanceData?.balance ?? 0);
    }
  }, [isBotRunning, tradingMode, performanceData?.balance]);

  if (isLocked) return <AuthScreen isSetup={needsPasswordSetup} onPasswordSet={handlePasswordSet} onLogin={handleLogin} />;
  if (!strategy || !performanceData) return <div className="flex items-center justify-center min-h-screen"><Timer className="h-12 w-12 animate-spin text-accent" /></div>;

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard': return <div className="grid grid-cols-1 gap-4"><HealthCard health={health} mode={tradingMode} /><OpenPositionsCard openPositions={openPositions} marketData={marketData} onManualClose={handleManualClose} onUpdatePosition={handleUpdatePosition} /><PendingOrdersCard pendingOrders={pendingOrders} onCancelOrder={handleCancelOrder} /></div>;
      case 'symbols': return <SymbolsView allSymbols={allSymbols} watchedSymbols={marketData.map(p => p.pair)} onAddSymbol={handleAddSymbol} onRemoveSymbol={handleRemoveSymbol} />;
      case 'strategy': return <StrategyView marketData={marketData} strategy={strategy} onUpdateSymbolStrategy={handleSymbolStrategyUpdate} />;
      case 'optimizer': return <div className="flex justify-center"><div className="w-full lg:max-w-2xl"><OptimizerCard onOptimize={handleRunOptimizer} suggestion={optimizerSuggestion} isLoading={isOptimizerLoading} onApplySuggestions={handleApplyOptimizerSuggestions} currentGeminiKey={strategy.geminiApiKey} onSaveGeminiKey={(key) => handleGlobalStrategyUpdate({ geminiApiKey: key })} strategy={strategy} /></div></div>;
      case 'history': return <div className="grid grid-cols-1 gap-4 md:gap-8"><HistoryCard title="Liquidation History" icon={History} data={liquidationHistory} type="liquidation" /><HistoryCard title="Trade History" icon={History} data={trades} type="trade" /></div>;
      case 'settings': return <SettingsView strategy={strategy} onUpdateStrategy={handleGlobalStrategyUpdate} tradingMode={tradingMode} />;
      default: return null;
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full flex-col bg-background">
        <DashboardHeader tradingMode={tradingMode} onTradingModeChange={setTradingMode} balance={balance} availableBalance={availableBalance} inPosition={totalInPosition} unrealizedPnl={unrealizedPnl} pnl24h={pnl24h} pnl={pnl} winRate={winRate} />
        <div className="flex flex-1">
          <Sidebar>
            <SidebarHeader><div className="flex items-center gap-2 flex-1"><Logo className="h-7 w-7 text-accent group-data-[state=collapsed]/sidebar:h-8 group-data-[state=collapsed]/sidebar:w-8 transition-all" /><span className="font-headline text-lg group-data-[state=collapsed]/sidebar:hidden">Liquidator</span></div><SidebarTrigger className="group-data-[state=collapsed]/sidebar:flex" /></SidebarHeader>
            <SidebarContent>
              <SidebarMenu>
                <SidebarMenuItem><SidebarMenuButton onClick={() => setActiveView('dashboard')} isActive={activeView === 'dashboard'} tooltip="Dashboard"><BarChart/><span>Dashboard</span></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton onClick={() => setActiveView('symbols')} isActive={activeView === 'symbols'} tooltip="Symbols"><List/><span>Symbols</span></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton onClick={() => setActiveView('strategy')} isActive={activeView === 'strategy'} tooltip="Strategy"><ListTree/><span>Strategy</span></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton onClick={() => setActiveView('optimizer')} isActive={activeView === 'optimizer'} tooltip="Optimizer"><Wand2/><span>Optimizer</span></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton onClick={() => setActiveView('history')} isActive={activeView === 'history'} tooltip="History"><History/><span>History</span></SidebarMenuButton></SidebarMenuItem>
                <SidebarMenuItem><SidebarMenuButton onClick={() => setActiveView('settings')} isActive={activeView === 'settings'} tooltip="Settings"><Settings/><span>Settings</span></SidebarMenuButton></SidebarMenuItem>
                <SidebarSeparator />
                <SidebarMenuItem><SidebarMenuButton onClick={toggleBot} tooltip={isBotRunning ? "Pause Bot" : "Start Bot"} className="justify-center group-data-[state=expanded]/sidebar:w-full group-data-[state=expanded]/sidebar:justify-start">{isBotRunning ? <Pause className="text-accent" /> : <Play />}<span>{isBotRunning ? 'Bot is Running' : 'Start Bot'}</span></SidebarMenuButton></SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>
          </Sidebar>
          <SidebarInset><main className="flex-1 flex flex-col gap-4 p-4 md:gap-8 md:p-8">{renderContent()}</main></SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
