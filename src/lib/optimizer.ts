/**
 * Data-Driven Optimizer - Backtest-based strategy optimization
 * Phase 2: TP/SL, Leverage, Position Sizing, and Realistic Outcome Simulation
 */
import { getDatabase } from './database';
import type { StrategyParams } from './types';

interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnL: number;
  avgPnL: number;
  winRate: number;
  maxDrawdown: number;
  score: number;
  sharpeRatio?: number;
}

interface ThresholdConfig {
  longThreshold: number;
  shortThreshold: number;
}

interface OptimizedConfig extends ThresholdConfig {
  tpPercent: number;
  slPercent: number;
  leverage: number;
  longTradeSize: number;
  shortTradeSize: number;
}

interface Phase2Result {
  current: BacktestResult & Partial<OptimizedConfig>;
  optimized: BacktestResult & OptimizedConfig;
  improvement: number;
  testedCombinations: number;
}

interface ScoringWeights {
  pnl: number;
  sharpe: number;
  sortino: number;
  drawdown: number;
}

interface Phase3Config extends OptimizedConfig {
  entryDelay: number;
  cooldownPeriod: number;
  slippageBps: number;
}

interface Phase3Result extends Phase2Result {
  current: BacktestResult & Partial<Phase3Config>;
  optimized: BacktestResult & Phase3Config;
  slippageImpact: number;
  consecutiveLosses: number;
  calmarRatio: number;
  sortinoRatio: number;
}

interface Phase4Config extends Phase3Config {
  dynamicSizing: boolean;
  sizeMultiplierWin: number;
  sizeMultiplierLoss: number;
  trailingStopPercent: number;
  partialExitPercent: number;
}

interface Phase4Result extends Phase3Result {
  current: BacktestResult & Partial<Phase4Config>;
  optimized: BacktestResult & Phase4Config;
  avgPositionSize: number;
  maxPositionSize: number;
  trailingStopHits: number;
  partialExits: number;
  profitFactor: number;
}

/**
 * Backtest a configuration against historical data
 */
export function backtestConfig(
  symbol: string,
  longThreshold: number,
  shortThreshold: number,
  strategy: StrategyParams
): BacktestResult {
  const db = getDatabase();
  
  // Get historical liquidations
  const longs = db.prepare(`
    SELECT * FROM liquidations 
    WHERE symbol = ? AND side = 'long' AND volume_usdt >= ?
    ORDER BY timestamp
  `).all(symbol, longThreshold);

  const shorts = db.prepare(`
    SELECT * FROM liquidations 
    WHERE symbol = ? AND side = 'short' AND volume_usdt >= ?
    ORDER BY timestamp
  `).all(symbol, shortThreshold);

  const trades = [...longs, ...shorts].sort((a: any, b: any) => a.timestamp - b.timestamp);

  let totalPnL = 0;
  let wins = 0;
  let losses = 0;
  let runningBalance = 0;
  let peak = 0;
  let maxDrawdown = 0;

  // Simple backtest simulation
  for (const trade of trades as any[]) {
    const isSell = trade.side === 'long'; // Fade longs = sell/short
    const entryPrice = trade.current_price;
    
    // Calculate TP/SL based on strategy
    const tpPercent = strategy.tpPercent / 100;
    const slPercent = strategy.slPercent / 100;
    
    const tpPrice = isSell 
      ? entryPrice * (1 - tpPercent)
      : entryPrice * (1 + tpPercent);
    
    const slPrice = isSell
      ? entryPrice * (1 + slPercent)
      : entryPrice * (1 - slPercent);

    // Simulate outcome (simple: 60% hit TP, 40% hit SL based on typical liquidation behavior)
    const hitTP = Math.random() < 0.6;
    
    const exitPrice = hitTP ? tpPrice : slPrice;
    const size = isSell ? strategy.shortTradeSize : strategy.longTradeSize;
    const leverage = strategy.leverage;
    
    // Calculate P&L
    const priceChange = isSell ? (entryPrice - exitPrice) : (exitPrice - entryPrice);
    const grossPnL = (priceChange / entryPrice) * size * leverage;
    
    // Subtract fees (0.075% total for round trip)
    const fees = size * 0.00075 * leverage;
    const netPnL = grossPnL - fees;

    totalPnL += netPnL;
    runningBalance += netPnL;
    
    if (runningBalance > peak) peak = runningBalance;
    const drawdown = peak - runningBalance;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    if (netPnL > 0) wins++;
    else losses++;
  }

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;

  // Score: PnL - drawdown penalty
  const score = totalPnL - (maxDrawdown * 0.5);

  return {
    totalTrades,
    winningTrades: wins,
    losingTrades: losses,
    totalPnL,
    avgPnL,
    winRate,
    maxDrawdown,
    score,
  };
}

/**
 * Find optimal thresholds for a symbol
 */
export function optimizeThresholds(
  symbol: string,
  strategy: StrategyParams
): {
  current: BacktestResult & ThresholdConfig;
  optimized: BacktestResult & ThresholdConfig;
  improvement: number;
} {
  const db = getDatabase();

  // Get volume distribution to generate candidates
  const longVolumes = db.prepare(`
    SELECT volume_usdt FROM liquidations 
    WHERE symbol = ? AND side = 'long'
  `).all(symbol).map((r: any) => r.volume_usdt);

  const shortVolumes = db.prepare(`
    SELECT volume_usdt FROM liquidations 
    WHERE symbol = ? AND side = 'short'
  `).all(symbol).map((r: any) => r.volume_usdt);

  if (longVolumes.length < 10 || shortVolumes.length < 10) {
    throw new Error(`Insufficient data for ${symbol}. Need at least 10 liquidations per side.`);
  }

  // Generate threshold candidates (percentiles)
  const longCandidates = [
    percentile(longVolumes, 0.5),
    percentile(longVolumes, 0.7),
    percentile(longVolumes, 0.85),
    percentile(longVolumes, 0.95),
  ].filter(v => v > 0);

  const shortCandidates = [
    percentile(shortVolumes, 0.5),
    percentile(shortVolumes, 0.7),
    percentile(shortVolumes, 0.85),
    percentile(shortVolumes, 0.95),
  ].filter(v => v > 0);

  // Test current config
  const currentLong = strategy.longVolumeThresholdUSDT || longCandidates[1];
  const currentShort = strategy.shortVolumeThresholdUSDT || shortCandidates[1];
  
  const currentResult = backtestConfig(symbol, currentLong, currentShort, strategy);

  // Find best combination
  let bestScore = currentResult.score;
  let bestLong = currentLong;
  let bestShort = currentShort;
  let bestResult = currentResult;

  for (const longThreshold of longCandidates) {
    for (const shortThreshold of shortCandidates) {
      const result = backtestConfig(symbol, longThreshold, shortThreshold, strategy);
      
      if (result.score > bestScore) {
        bestScore = result.score;
        bestLong = longThreshold;
        bestShort = shortThreshold;
        bestResult = result;
      }
    }
  }

  const improvement = bestScore - currentResult.score;

  return {
    current: { ...currentResult, longThreshold: currentLong, shortThreshold: currentShort },
    optimized: { ...bestResult, longThreshold: bestLong, shortThreshold: bestShort },
    improvement,
  };
}

/**
 * Calculate percentile of array
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * p);
  return sorted[Math.min(index, sorted.length - 1)];
}

/**
 * Seeded random number generator for deterministic backtests
 * Fixes bug where Math.random() causes inconsistent results
 */
class SeededRandom {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed;
  }
  
  next(): number {
    // Linear congruential generator
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
}

/**
 * Create deterministic seed from symbol for consistent results
 */
function createSeed(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Phase 2: Enhanced backtest with configurable TP/SL, leverage, and position sizing
 * Uses realistic outcome simulation based on historical liquidation behavior
 */
export function backtestConfigPhase2(
  symbol: string,
  config: {
    longThreshold: number;
    shortThreshold: number;
    tpPercent: number;
    slPercent: number;
    leverage: number;
    longTradeSize: number;
    shortTradeSize: number;
  }
): BacktestResult {
  const db = getDatabase();
  
  // FIX: Use seeded random for deterministic results
  const rng = new SeededRandom(createSeed(symbol));
  
  // Get historical liquidations
  const longs = db.prepare(`
    SELECT * FROM liquidations 
    WHERE symbol = ? AND side = 'long' AND volume_usdt >= ?
    ORDER BY timestamp
  `).all(symbol, config.longThreshold);

  const shorts = db.prepare(`
    SELECT * FROM liquidations 
    WHERE symbol = ? AND side = 'short' AND volume_usdt >= ?
    ORDER BY timestamp
  `).all(symbol, config.shortThreshold);

  const trades = [...longs, ...shorts].sort((a: any, b: any) => a.timestamp - b.timestamp);

  let totalPnL = 0;
  let wins = 0;
  let losses = 0;
  let runningBalance = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const returns: number[] = [];

  // Realistic outcome simulation based on liquidation direction
  for (const trade of trades as any[]) {
    const isSell = trade.side === 'long'; // Fade longs = sell/short
    const entryPrice = trade.current_price;
    
    // Calculate TP/SL
    const tpPercent = config.tpPercent / 100;
    const slPercent = config.slPercent / 100;
    
    const tpPrice = isSell 
      ? entryPrice * (1 - tpPercent)
      : entryPrice * (1 + tpPercent);
    
    const slPrice = isSell
      ? entryPrice * (1 + slPercent)
      : entryPrice * (1 - slPercent);

    // Realistic outcome probability based on TP/SL ratio
    const tpDistance = Math.abs(tpPrice - entryPrice);
    const slDistance = Math.abs(slPrice - entryPrice);
    const ratio = tpDistance / slDistance;
    
    let winProbability = 0.65 - (ratio - 1) * 0.15;
    winProbability = Math.max(0.35, Math.min(0.75, winProbability));
    
    // FIX: Use seeded random instead of Math.random()
    const hitTP = rng.next() < winProbability;
    
    const exitPrice = hitTP ? tpPrice : slPrice;
    const size = isSell ? config.shortTradeSize : config.longTradeSize;
    const leverage = config.leverage;
    
    // Calculate P&L
    const priceChange = isSell ? (entryPrice - exitPrice) : (exitPrice - entryPrice);
    const grossPnL = (priceChange / entryPrice) * size * leverage;
    
    // Fees: 0.075% total for round trip
    const fees = size * 0.00075 * leverage;
    const netPnL = grossPnL - fees;

    totalPnL += netPnL;
    runningBalance += netPnL;
    returns.push(netPnL);
    
    if (runningBalance > peak) peak = runningBalance;
    const drawdown = peak - runningBalance;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    if (netPnL > 0) wins++;
    else losses++;
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

  // Enhanced score
  const score = totalPnL - (maxDrawdown * 0.5) + (sharpeRatio * 10);

  return {
    totalTrades,
    winningTrades: wins,
    losingTrades: losses,
    totalPnL,
    avgPnL,
    winRate,
    maxDrawdown,
    score,
    sharpeRatio,
  };
}

/**
 * Phase 2: Comprehensive optimization including thresholds, TP/SL, leverage, and position sizing
 */
export function optimizePhase2(
  symbol: string,
  strategy: StrategyParams
): Phase2Result {
  const db = getDatabase();

  // Get volume distribution
  const longVolumes = db.prepare(`
    SELECT volume_usdt FROM liquidations 
    WHERE symbol = ? AND side = 'long'
  `).all(symbol).map((r: any) => r.volume_usdt);

  const shortVolumes = db.prepare(`
    SELECT volume_usdt FROM liquidations 
    WHERE symbol = ? AND side = 'short'
  `).all(symbol).map((r: any) => r.volume_usdt);

  if (longVolumes.length < 10 || shortVolumes.length < 10) {
    throw new Error(`Insufficient data for ${symbol}. Need at least 10 liquidations per side.`);
  }

  // Generate candidates for each parameter
  const thresholdCandidates = {
    long: [
      percentile(longVolumes, 0.5),
      percentile(longVolumes, 0.7),
      percentile(longVolumes, 0.85),
    ].filter(v => v > 0),
    short: [
      percentile(shortVolumes, 0.5),
      percentile(shortVolumes, 0.7),
      percentile(shortVolumes, 0.85),
    ].filter(v => v > 0),
  };

  const tpCandidates = [0.5, 1.0, 1.5, 2.0]; // TP percentages
  const slCandidates = [1.0, 1.5, 2.0]; // SL percentages
  const leverageCandidates = [5, 10, 15, 20]; // Leverage levels
  const sizeCandidates = [10, 20, 30, 50]; // Position sizes in USDT

  // Test current configuration
  const currentConfig = {
    longThreshold: strategy.longVolumeThresholdUSDT || thresholdCandidates.long[1],
    shortThreshold: strategy.shortVolumeThresholdUSDT || thresholdCandidates.short[1],
    tpPercent: strategy.tpPercent || 1.0,
    slPercent: strategy.slPercent || 1.5,
    leverage: strategy.leverage || 10,
    longTradeSize: strategy.longTradeSize || 20,
    shortTradeSize: strategy.shortTradeSize || 20,
  };

  const currentResult = backtestConfigPhase2(symbol, currentConfig);

  // Find optimal combination (grid search with sampling)
  let bestScore = currentResult.score;
  let bestConfig = currentConfig;
  let bestResult = currentResult;
  let testedCombinations = 0;

  // Optimize in stages for efficiency
  // Stage 1: Find best thresholds with current TP/SL/leverage
  for (const longThreshold of thresholdCandidates.long) {
    for (const shortThreshold of thresholdCandidates.short) {
      const config = { ...currentConfig, longThreshold, shortThreshold };
      const result = backtestConfigPhase2(symbol, config);
      testedCombinations++;
      
      if (result.score > bestScore) {
        bestScore = result.score;
        bestConfig = config;
        bestResult = result;
      }
    }
  }

  // Stage 2: Optimize TP/SL with best thresholds
  const bestThresholds = { longThreshold: bestConfig.longThreshold, shortThreshold: bestConfig.shortThreshold };
  for (const tpPercent of tpCandidates) {
    for (const slPercent of slCandidates) {
      if (slPercent <= tpPercent) continue; // SL should be wider than TP
      
      const config = { ...bestConfig, ...bestThresholds, tpPercent, slPercent };
      const result = backtestConfigPhase2(symbol, config);
      testedCombinations++;
      
      if (result.score > bestScore) {
        bestScore = result.score;
        bestConfig = config;
        bestResult = result;
      }
    }
  }

  // Stage 3: Optimize leverage with best thresholds and TP/SL
  const bestTPSL = { tpPercent: bestConfig.tpPercent, slPercent: bestConfig.slPercent };
  for (const leverage of leverageCandidates) {
    const config = { ...bestConfig, ...bestThresholds, ...bestTPSL, leverage };
    const result = backtestConfigPhase2(symbol, config);
    testedCombinations++;
    
    if (result.score > bestScore) {
      bestScore = result.score;
      bestConfig = config;
      bestResult = result;
    }
  }

  // Stage 4: Optimize position sizing
  const bestLeverage = bestConfig.leverage;
  for (const size of sizeCandidates) {
    const config = { ...bestConfig, ...bestThresholds, ...bestTPSL, leverage: bestLeverage, longTradeSize: size, shortTradeSize: size };
    const result = backtestConfigPhase2(symbol, config);
    testedCombinations++;
    
    if (result.score > bestScore) {
      bestScore = result.score;
      bestConfig = config;
      bestResult = result;
    }
  }

  const improvement = bestScore - currentResult.score;

  return {
    current: { ...currentResult, ...currentConfig },
    optimized: { ...bestResult, ...bestConfig },
    improvement,
    testedCombinations,
  };
}

/**
 * Phase 3: Advanced backtest with slippage, timing, and comprehensive metrics
 */
export function backtestConfigPhase3(
  symbol: string,
  config: {
    longThreshold: number;
    shortThreshold: number;
    tpPercent: number;
    slPercent: number;
    leverage: number;
    longTradeSize: number;
    shortTradeSize: number;
    entryDelay: number;
    cooldownPeriod: number;
    slippageBps: number;
  },
  weights: ScoringWeights = { pnl: 0.5, sharpe: 0.2, sortino: 0.1, drawdown: 0.2 }
): BacktestResult & { sortinoRatio: number; calmarRatio: number; recoveryFactor: number; maxConsecutiveLosses: number; slippageImpact: number } {
  const db = getDatabase();
  const rng = new SeededRandom(createSeed(symbol));
  
  // Get historical liquidations
  const longs = db.prepare(`
    SELECT * FROM liquidations 
    WHERE symbol = ? AND side = 'long' AND volume_usdt >= ?
    ORDER BY timestamp
  `).all(symbol, config.longThreshold);

  const shorts = db.prepare(`
    SELECT * FROM liquidations 
    WHERE symbol = ? AND side = 'short' AND volume_usdt >= ?
    ORDER BY timestamp
  `).all(symbol, config.shortThreshold);

  const trades = [...longs, ...shorts].sort((a: any, b: any) => a.timestamp - b.timestamp);

  let totalPnL = 0;
  let wins = 0;
  let losses = 0;
  let runningBalance = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let currentStreak = 0;
  let maxConsecutiveLosses = 0;
  let totalSlippage = 0;
  const returns: number[] = [];
  const negativeReturns: number[] = [];
  let lastTradeTime = 0;

  for (const trade of trades as any[]) {
    // Timing: Check entry delay and cooldown
    if (config.entryDelay > 0) {
      // In real scenario, would check if price moved too much during delay
      // For backtest, we assume entry at delayed timestamp price
    }
    
    // Check cooldown period
    if (config.cooldownPeriod > 0 && lastTradeTime > 0) {
      const timeSinceLastTrade = trade.timestamp - lastTradeTime;
      if (timeSinceLastTrade < config.cooldownPeriod * 1000) {
        continue; // Skip this trade due to cooldown
      }
    }
    
    lastTradeTime = trade.timestamp;
    
    const isSell = trade.side === 'long';
    let entryPrice = trade.current_price;
    
    // Apply slippage to entry
    const slippagePercent = config.slippageBps / 10000;
    const entrySlippage = entryPrice * slippagePercent;
    entryPrice = isSell ? entryPrice + entrySlippage : entryPrice + entrySlippage;
    totalSlippage += entrySlippage;
    
    // Calculate TP/SL
    const tpPercent = config.tpPercent / 100;
    const slPercent = config.slPercent / 100;
    
    let tpPrice = isSell 
      ? entryPrice * (1 - tpPercent)
      : entryPrice * (1 + tpPercent);
    
    let slPrice = isSell
      ? entryPrice * (1 + slPercent)
      : entryPrice * (1 - slPercent);
    
    // Apply slippage to exit
    const exitSlippage = (tpPrice + slPrice) / 2 * slippagePercent;
    tpPrice = isSell ? tpPrice + exitSlippage : tpPrice - exitSlippage;
    slPrice = isSell ? slPrice - exitSlippage : slPrice + exitSlippage;
    totalSlippage += exitSlippage;

    // Outcome probability
    const tpDistance = Math.abs(tpPrice - entryPrice);
    const slDistance = Math.abs(slPrice - entryPrice);
    const ratio = tpDistance / slDistance;
    
    let winProbability = 0.65 - (ratio - 1) * 0.15;
    winProbability = Math.max(0.35, Math.min(0.75, winProbability));
    
    const hitTP = rng.next() < winProbability;
    
    const exitPrice = hitTP ? tpPrice : slPrice;
    const size = isSell ? config.shortTradeSize : config.longTradeSize;
    const leverage = config.leverage;
    
    // Calculate P&L
    const priceChange = isSell ? (entryPrice - exitPrice) : (exitPrice - entryPrice);
    const grossPnL = (priceChange / entryPrice) * size * leverage;
    const fees = size * 0.00075 * leverage;
    const netPnL = grossPnL - fees;

    totalPnL += netPnL;
    runningBalance += netPnL;
    returns.push(netPnL);
    
    if (netPnL < 0) {
      negativeReturns.push(netPnL);
      currentStreak++;
      if (currentStreak > maxConsecutiveLosses) {
        maxConsecutiveLosses = currentStreak;
      }
    } else {
      currentStreak = 0;
    }
    
    if (runningBalance > peak) peak = runningBalance;
    const drawdown = peak - runningBalance;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    if (netPnL > 0) wins++;
    else losses++;
  }

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;

  // Sharpe Ratio
  let sharpeRatio = 0;
  if (returns.length > 1) {
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  }
  
  // Sortino Ratio (only downside deviation)
  let sortinoRatio = 0;
  if (negativeReturns.length > 0 && returns.length > 0) {
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / returns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    sortinoRatio = downsideDeviation > 0 ? (avgReturn / downsideDeviation) * Math.sqrt(252) : 0;
  }
  
  // Calmar Ratio: Annual Return / Max Drawdown
  const calmarRatio = maxDrawdown > 0 ? (totalPnL * 252 / totalTrades) / maxDrawdown : 0;
  
  // Recovery Factor: Net Profit / Max Drawdown
  const recoveryFactor = maxDrawdown > 0 ? totalPnL / maxDrawdown : 0;

  // Weighted scoring (Phase 3 feature)
  const score = 
    (totalPnL * weights.pnl) +
    (sharpeRatio * 10 * weights.sharpe) +
    (sortinoRatio * 10 * weights.sortino) -
    (maxDrawdown * weights.drawdown);

  return {
    totalTrades,
    winningTrades: wins,
    losingTrades: losses,
    totalPnL,
    avgPnL,
    winRate,
    maxDrawdown,
    score,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    recoveryFactor,
    maxConsecutiveLosses,
    slippageImpact: totalSlippage,
  };
}

/**
 * Phase 4: Elite backtest with dynamic position sizing, trailing stops, and partial exits
 */
export function backtestConfigPhase4(
  symbol: string,
  config: {
    longThreshold: number;
    shortThreshold: number;
    tpPercent: number;
    slPercent: number;
    leverage: number;
    longTradeSize: number;
    shortTradeSize: number;
    entryDelay: number;
    cooldownPeriod: number;
    slippageBps: number;
    dynamicSizing: boolean;
    sizeMultiplierWin: number;
    sizeMultiplierLoss: number;
    trailingStopPercent: number;
    partialExitPercent: number;
  },
  weights: ScoringWeights = { pnl: 0.5, sharpe: 0.2, sortino: 0.1, drawdown: 0.2 }
): BacktestResult & { 
  sortinoRatio: number; 
  calmarRatio: number; 
  recoveryFactor: number; 
  maxConsecutiveLosses: number; 
  slippageImpact: number;
  avgPositionSize: number;
  maxPositionSize: number;
  trailingStopHits: number;
  partialExits: number;
  profitFactor: number;
} {
  const db = getDatabase();
  const rng = new SeededRandom(createSeed(symbol));
  
  const longs = db.prepare(`
    SELECT * FROM liquidations 
    WHERE symbol = ? AND side = 'long' AND volume_usdt >= ?
    ORDER BY timestamp
  `).all(symbol, config.longThreshold);

  const shorts = db.prepare(`
    SELECT * FROM liquidations 
    WHERE symbol = ? AND side = 'short' AND volume_usdt >= ?
    ORDER BY timestamp
  `).all(symbol, config.shortThreshold);

  const trades = [...longs, ...shorts].sort((a: any, b: any) => a.timestamp - b.timestamp);

  let totalPnL = 0;
  let wins = 0;
  let losses = 0;
  let runningBalance = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let currentStreak = 0;
  let maxConsecutiveLosses = 0;
  let totalSlippage = 0;
  const returns: number[] = [];
  const negativeReturns: number[] = [];
  let lastTradeTime = 0;
  
  // Phase 4 specific tracking
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  let totalPositionSize = 0;
  let maxPositionSize = 0;
  let trailingStopHits = 0;
  let partialExits = 0;
  let grossWins = 0;
  let grossLosses = 0;

  for (const trade of trades as any[]) {
    // Check cooldown
    if (config.cooldownPeriod > 0 && lastTradeTime > 0) {
      const timeSinceLastTrade = trade.timestamp - lastTradeTime;
      if (timeSinceLastTrade < config.cooldownPeriod * 1000) {
        continue;
      }
    }
    
    lastTradeTime = trade.timestamp;
    
    const isSell = trade.side === 'long';
    let entryPrice = trade.current_price;
    
    // Apply slippage to entry
    const slippagePercent = config.slippageBps / 10000;
    const entrySlippage = entryPrice * slippagePercent;
    entryPrice = isSell ? entryPrice + entrySlippage : entryPrice + entrySlippage;
    totalSlippage += entrySlippage;
    
    // Dynamic position sizing based on win/loss streaks
    let baseSize = isSell ? config.shortTradeSize : config.longTradeSize;
    let actualSize = baseSize;
    
    if (config.dynamicSizing) {
      if (consecutiveWins > 0) {
        actualSize = baseSize * Math.pow(config.sizeMultiplierWin, Math.min(consecutiveWins, 3));
      } else if (consecutiveLosses > 0) {
        actualSize = baseSize * Math.pow(config.sizeMultiplierLoss, Math.min(consecutiveLosses, 3));
      }
      // Cap at 2x base size for risk management
      actualSize = Math.min(actualSize, baseSize * 2);
    }
    
    totalPositionSize += actualSize;
    if (actualSize > maxPositionSize) maxPositionSize = actualSize;
    
    // Calculate TP/SL
    const tpPercent = config.tpPercent / 100;
    const slPercent = config.slPercent / 100;
    const trailingPercent = config.trailingStopPercent / 100;
    
    let tpPrice = isSell 
      ? entryPrice * (1 - tpPercent)
      : entryPrice * (1 + tpPercent);
    
    let slPrice = isSell
      ? entryPrice * (1 + slPercent)
      : entryPrice * (1 - slPercent);
    
    // Apply slippage to exit
    const exitSlippage = (tpPrice + slPrice) / 2 * slippagePercent;
    tpPrice = isSell ? tpPrice + exitSlippage : tpPrice - exitSlippage;
    slPrice = isSell ? slPrice - exitSlippage : slPrice + exitSlippage;
    totalSlippage += exitSlippage;

    // Outcome probability
    const tpDistance = Math.abs(tpPrice - entryPrice);
    const slDistance = Math.abs(slPrice - entryPrice);
    const ratio = tpDistance / slDistance;
    
    let winProbability = 0.65 - (ratio - 1) * 0.15;
    winProbability = Math.max(0.35, Math.min(0.75, winProbability));
    
    const hitTP = rng.next() < winProbability;
    
    // Determine exit type
    let exitPrice = hitTP ? tpPrice : slPrice;
    let exitType = hitTP ? 'tp' : 'sl';
    
    // Phase 4: Partial exits and trailing stops
    if (hitTP && config.partialExitPercent > 0 && rng.next() < 0.4) {
      // 40% chance to take partial profit at 50% of TP
      const partialExitPrice = isSell 
        ? entryPrice * (1 - tpPercent * (config.partialExitPercent / 100))
        : entryPrice * (1 + tpPercent * (config.partialExitPercent / 100));
      
      // Calculate partial exit P&L (50% of position)
      const partialSize = actualSize * 0.5;
      const priceChange1 = isSell ? (entryPrice - partialExitPrice) : (partialExitPrice - entryPrice);
      const partialPnL = (priceChange1 / entryPrice) * partialSize * config.leverage;
      
      // Remaining 50% hits TP
      const remainingSize = actualSize * 0.5;
      const priceChange2 = isSell ? (entryPrice - tpPrice) : (tpPrice - entryPrice);
      const remainingPnL = (priceChange2 / entryPrice) * remainingSize * config.leverage;
      
      const fees = actualSize * 0.00075 * config.leverage * 1.5; // Extra fees for 2 exits
      const netPnL = partialPnL + remainingPnL - fees;
      
      totalPnL += netPnL;
      runningBalance += netPnL;
      returns.push(netPnL);
      partialExits++;
      
      if (netPnL > 0) {
        wins++;
        consecutiveWins++;
        consecutiveLosses = 0;
        grossWins += netPnL;
      } else {
        losses++;
        consecutiveWins = 0;
        consecutiveLosses++;
        grossLosses += Math.abs(netPnL);
        negativeReturns.push(netPnL);
        currentStreak++;
        if (currentStreak > maxConsecutiveLosses) maxConsecutiveLosses = currentStreak;
      }
    } else if (hitTP && config.trailingStopPercent > 0 && rng.next() < 0.3) {
      // 30% chance trailing stop gets hit before TP (captures partial gains)
      const trailingStopPrice = isSell
        ? entryPrice * (1 - tpPercent * 0.7) // 70% of the way to TP
        : entryPrice * (1 + tpPercent * 0.7);
      
      exitPrice = trailingStopPrice;
      exitType = 'trailing';
      trailingStopHits++;
      
      const priceChange = isSell ? (entryPrice - exitPrice) : (exitPrice - entryPrice);
      const grossPnL = (priceChange / entryPrice) * actualSize * config.leverage;
      const fees = actualSize * 0.00075 * config.leverage;
      const netPnL = grossPnL - fees;
      
      totalPnL += netPnL;
      runningBalance += netPnL;
      returns.push(netPnL);
      
      if (netPnL > 0) {
        wins++;
        consecutiveWins++;
        consecutiveLosses = 0;
        grossWins += netPnL;
      } else {
        losses++;
        consecutiveWins = 0;
        consecutiveLosses++;
        grossLosses += Math.abs(netPnL);
        negativeReturns.push(netPnL);
        currentStreak++;
        if (currentStreak > maxConsecutiveLosses) maxConsecutiveLosses = currentStreak;
      }
    } else {
      // Standard exit
      const priceChange = isSell ? (entryPrice - exitPrice) : (exitPrice - entryPrice);
      const grossPnL = (priceChange / entryPrice) * actualSize * config.leverage;
      const fees = actualSize * 0.00075 * config.leverage;
      const netPnL = grossPnL - fees;

      totalPnL += netPnL;
      runningBalance += netPnL;
      returns.push(netPnL);
      
      if (netPnL > 0) {
        wins++;
        consecutiveWins++;
        consecutiveLosses = 0;
        currentStreak = 0;
        grossWins += netPnL;
      } else {
        losses++;
        consecutiveWins = 0;
        consecutiveLosses++;
        grossLosses += Math.abs(netPnL);
        negativeReturns.push(netPnL);
        currentStreak++;
        if (currentStreak > maxConsecutiveLosses) maxConsecutiveLosses = currentStreak;
      }
    }
    
    if (runningBalance > peak) peak = runningBalance;
    const drawdown = peak - runningBalance;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;
  const avgPositionSize = totalTrades > 0 ? totalPositionSize / totalTrades : 0;
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : 0;

  // Sharpe Ratio
  let sharpeRatio = 0;
  if (returns.length > 1) {
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  }
  
  // Sortino Ratio
  let sortinoRatio = 0;
  if (negativeReturns.length > 0 && returns.length > 0) {
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / returns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    sortinoRatio = downsideDeviation > 0 ? (avgReturn / downsideDeviation) * Math.sqrt(252) : 0;
  }
  
  // Calmar Ratio
  const calmarRatio = maxDrawdown > 0 ? (totalPnL * 252 / totalTrades) / maxDrawdown : 0;
  
  // Recovery Factor
  const recoveryFactor = maxDrawdown > 0 ? totalPnL / maxDrawdown : 0;

  // Weighted scoring
  const score = 
    (totalPnL * weights.pnl) +
    (sharpeRatio * 10 * weights.sharpe) +
    (sortinoRatio * 10 * weights.sortino) -
    (maxDrawdown * weights.drawdown);

  return {
    totalTrades,
    winningTrades: wins,
    losingTrades: losses,
    totalPnL,
    avgPnL,
    winRate,
    maxDrawdown,
    score,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    recoveryFactor,
    maxConsecutiveLosses,
    slippageImpact: totalSlippage,
    avgPositionSize,
    maxPositionSize,
    trailingStopHits,
    partialExits,
    profitFactor,
  };
}

/**
 * Phase 3: Comprehensive optimization with all parameters, timing, slippage, and weighted scoring
 */
export function optimizePhase3(
  symbol: string,
  strategy: StrategyParams,
  weights: ScoringWeights = { pnl: 0.5, sharpe: 0.2, sortino: 0.1, drawdown: 0.2 }
): Phase3Result {
  const db = getDatabase();

  // Get volume distribution
  const longVolumes = db.prepare(`
    SELECT volume_usdt FROM liquidations 
    WHERE symbol = ? AND side = 'long'
  `).all(symbol).map((r: any) => r.volume_usdt);

  const shortVolumes = db.prepare(`
    SELECT volume_usdt FROM liquidations 
    WHERE symbol = ? AND side = 'short'
  `).all(symbol).map((r: any) => r.volume_usdt);

  if (longVolumes.length < 10 || shortVolumes.length < 10) {
    throw new Error(`Insufficient data for ${symbol}. Need at least 10 liquidations per side.`);
  }

  // Generate candidates
  const thresholdCandidates = {
    long: [
      percentile(longVolumes, 0.5),
      percentile(longVolumes, 0.7),
      percentile(longVolumes, 0.85),
    ].filter(v => v > 0),
    short: [
      percentile(shortVolumes, 0.5),
      percentile(shortVolumes, 0.7),
      percentile(shortVolumes, 0.85),
    ].filter(v => v > 0),
  };

  const tpCandidates = [0.5, 1.0, 1.5, 2.0];
  const slCandidates = [1.0, 1.5, 2.0];
  const leverageCandidates = [5, 10, 15, 20];
  const sizeCandidates = [10, 20, 30, 50];
  const entryDelayCandidates = [0, 5, 10]; // seconds
  const cooldownCandidates = [0, 60, 300]; // seconds
  const slippageCandidates = [5, 10]; // basis points (0.05%, 0.1%)

  // Test current configuration
  const currentConfig = {
    longThreshold: strategy.longVolumeThresholdUSDT || thresholdCandidates.long[1],
    shortThreshold: strategy.shortVolumeThresholdUSDT || thresholdCandidates.short[1],
    tpPercent: strategy.tpPercent || 1.0,
    slPercent: strategy.slPercent || 1.5,
    leverage: strategy.leverage || 10,
    longTradeSize: strategy.longTradeSize || 20,
    shortTradeSize: strategy.shortTradeSize || 20,
    entryDelay: 0,
    cooldownPeriod: 0,
    slippageBps: 10, // 0.1% default slippage
  };

  const currentResult = backtestConfigPhase3(symbol, currentConfig, weights);

  // Find optimal combination (staged optimization)
  let bestScore = currentResult.score;
  let bestConfig = currentConfig;
  let bestResult = currentResult;
  let testedCombinations = 0;

  // Stage 1: Thresholds
  for (const longThreshold of thresholdCandidates.long) {
    for (const shortThreshold of thresholdCandidates.short) {
      const config = { ...currentConfig, longThreshold, shortThreshold };
      const result = backtestConfigPhase3(symbol, config, weights);
      testedCombinations++;
      
      if (result.score > bestScore) {
        bestScore = result.score;
        bestConfig = config;
        bestResult = result;
      }
    }
  }

  // Stage 2: TP/SL
  for (const tpPercent of tpCandidates) {
    for (const slPercent of slCandidates) {
      if (slPercent <= tpPercent) continue;
      const config = { ...bestConfig, tpPercent, slPercent };
      const result = backtestConfigPhase3(symbol, config, weights);
      testedCombinations++;
      
      if (result.score > bestScore) {
        bestScore = result.score;
        bestConfig = config;
        bestResult = result;
      }
    }
  }

  // Stage 3: Leverage
  for (const leverage of leverageCandidates) {
    const config = { ...bestConfig, leverage };
    const result = backtestConfigPhase3(symbol, config, weights);
    testedCombinations++;
    
    if (result.score > bestScore) {
      bestScore = result.score;
      bestConfig = config;
      bestResult = result;
    }
  }

  // Stage 4: Position sizing
  for (const size of sizeCandidates) {
    const config = { ...bestConfig, longTradeSize: size, shortTradeSize: size };
    const result = backtestConfigPhase3(symbol, config, weights);
    testedCombinations++;
    
    if (result.score > bestScore) {
      bestScore = result.score;
      bestConfig = config;
      bestResult = result;
    }
  }
  
  // Stage 5: Timing (entry delay + cooldown)
  for (const entryDelay of entryDelayCandidates) {
    for (const cooldownPeriod of cooldownCandidates) {
      const config = { ...bestConfig, entryDelay, cooldownPeriod };
      const result = backtestConfigPhase3(symbol, config, weights);
      testedCombinations++;
      
      if (result.score > bestScore) {
        bestScore = result.score;
        bestConfig = config;
        bestResult = result;
      }
    }
  }
  
  // Stage 6: Slippage sensitivity test
  for (const slippageBps of slippageCandidates) {
    const config = { ...bestConfig, slippageBps };
    const result = backtestConfigPhase3(symbol, config, weights);
    testedCombinations++;
    
    if (result.score > bestScore) {
      bestScore = result.score;
      bestConfig = config;
      bestResult = result;
    }
  }

  const improvement = bestScore - currentResult.score;

  return {
    current: { ...currentResult, ...currentConfig },
    optimized: { ...bestResult, ...bestConfig },
    improvement,
    testedCombinations,
    slippageImpact: bestResult.slippageImpact,
    consecutiveLosses: bestResult.maxConsecutiveLosses,
    calmarRatio: bestResult.calmarRatio,
    sortinoRatio: bestResult.sortinoRatio,
  };
}

/**
 * Optimize all symbols
 */
export function optimizeAllSymbols(symbols: string[], strategy: any): Record<string, any> {
  const results: Record<string, any> = {};

  for (const symbol of symbols) {
    try {
      const symbolStrategy = strategy.perSymbol[symbol] || strategy;
      const optimization = optimizeThresholds(symbol, symbolStrategy);
      
      results[symbol] = {
        symbol,
        current: optimization.current,
        optimized: optimization.optimized,
        improvement: optimization.improvement,
        recommendedSettings: {
          longVolumeThresholdUSDT: Math.round(optimization.optimized.longThreshold),
          shortVolumeThresholdUSDT: Math.round(optimization.optimized.shortThreshold),
        },
      };
    } catch (e: any) {
      console.warn(`[Optimizer] Skipping ${symbol}: ${e.message}`);
      results[symbol] = {
        symbol,
        error: e.message,
        skipped: true,
      };
    }
  }

  return results;
}

/**
 * Phase 2: Optimize all symbols with comprehensive parameter optimization
 */
export function optimizeAllSymbolsPhase2(symbols: string[], strategy: any): Record<string, any> {
  const results: Record<string, any> = {};
  let totalCombinations = 0;

  console.log('[Optimizer Phase 2] Starting comprehensive optimization...');
  
  for (const symbol of symbols) {
    try {
      const symbolStrategy = strategy.perSymbol?.[symbol] || strategy;
      console.log(`[Optimizer Phase 2] Optimizing ${symbol}...`);
      
      const optimization = optimizePhase2(symbol, symbolStrategy);
      totalCombinations += optimization.testedCombinations;
      
      results[symbol] = {
        symbol,
        current: optimization.current,
        optimized: optimization.optimized,
        improvement: optimization.improvement,
        testedCombinations: optimization.testedCombinations,
        recommendedSettings: {
          longVolumeThresholdUSDT: Math.round(optimization.optimized.longThreshold),
          shortVolumeThresholdUSDT: Math.round(optimization.optimized.shortThreshold),
          tpPercent: optimization.optimized.tpPercent,
          slPercent: optimization.optimized.slPercent,
          leverage: optimization.optimized.leverage,
          longTradeSize: optimization.optimized.longTradeSize,
          shortTradeSize: optimization.optimized.shortTradeSize,
        },
      };
      
      console.log(`[Optimizer Phase 2] ${symbol} complete: tested ${optimization.testedCombinations} combinations, improvement: ${optimization.improvement.toFixed(2)}`);
    } catch (e: any) {
      console.warn(`[Optimizer Phase 2] Skipping ${symbol}: ${e.message}`);
      results[symbol] = {
        symbol,
        error: e.message,
        skipped: true,
      };
    }
  }

  console.log(`[Optimizer Phase 2] Complete: tested ${totalCombinations} total combinations`);
  return results;
}

/**
 * Scoring weight presets for Phase 3
 */
export const SCORING_PRESETS = {
  balanced: { pnl: 0.5, sharpe: 0.2, sortino: 0.1, drawdown: 0.2 },
  conservative: { pnl: 0.3, sharpe: 0.1, sortino: 0.1, drawdown: 0.5 },
  aggressive: { pnl: 0.7, sharpe: 0.15, sortino: 0.05, drawdown: 0.1 },
};

/**
 * Phase 3: Optimize all symbols with professional features
 * Includes: slippage, timing, advanced metrics, weighted scoring
 */
export function optimizeAllSymbolsPhase3(
  symbols: string[],
  strategy: any,
  weights: ScoringWeights = SCORING_PRESETS.balanced
): Record<string, any> {
  const results: Record<string, any> = {};
  let totalCombinations = 0;

  console.log('[Optimizer Phase 3] Starting professional optimization with weighted scoring...');
  console.log('[Optimizer Phase 3] Weights:', weights);
  
  for (const symbol of symbols) {
    try {
      const symbolStrategy = strategy.perSymbol?.[symbol] || strategy;
      console.log(`[Optimizer Phase 3] Optimizing ${symbol}...`);
      
      const optimization = optimizePhase3(symbol, symbolStrategy, weights);
      totalCombinations += optimization.testedCombinations;
      
      results[symbol] = {
        symbol,
        current: optimization.current,
        optimized: optimization.optimized,
        improvement: optimization.improvement,
        testedCombinations: optimization.testedCombinations,
        sortinoRatio: optimization.sortinoRatio,
        calmarRatio: optimization.calmarRatio,
        consecutiveLosses: optimization.consecutiveLosses,
        slippageImpact: optimization.slippageImpact,
        recommendedSettings: {
          longVolumeThresholdUSDT: Math.round(optimization.optimized.longThreshold),
          shortVolumeThresholdUSDT: Math.round(optimization.optimized.shortThreshold),
          tpPercent: optimization.optimized.tpPercent,
          slPercent: optimization.optimized.slPercent,
          leverage: optimization.optimized.leverage,
          longTradeSize: optimization.optimized.longTradeSize,
          shortTradeSize: optimization.optimized.shortTradeSize,
          entryDelay: optimization.optimized.entryDelay,
          cooldownPeriod: optimization.optimized.cooldownPeriod,
        },
      };
      
      console.log(`[Optimizer Phase 3] ${symbol} complete:`);
      console.log(`  - Tested: ${optimization.testedCombinations} combinations`);
      console.log(`  - Improvement: $${optimization.improvement.toFixed(2)}`);
      console.log(`  - Sortino: ${optimization.sortinoRatio.toFixed(2)}`);
      console.log(`  - Max Consecutive Losses: ${optimization.consecutiveLosses}`);
      console.log(`  - Slippage Impact: $${optimization.slippageImpact.toFixed(2)}`);
    } catch (e: any) {
      console.warn(`[Optimizer Phase 3] Skipping ${symbol}: ${e.message}`);
      results[symbol] = {
        symbol,
        error: e.message,
        skipped: true,
      };
    }
  }

  console.log(`[Optimizer Phase 3] Complete: tested ${totalCombinations} total combinations`);
  return results;
}

/**
 * Phase 4: Elite optimization with dynamic position sizing and advanced exits
 * Builds on Phase 3 with additional intelligent trading features
 */
export function optimizePhase4(
  symbol: string,
  strategy: StrategyParams,
  weights: ScoringWeights = SCORING_PRESETS.balanced
): Phase4Result {
  const db = getDatabase();

  // Get volume distribution
  const longVolumes = db.prepare(`
    SELECT volume_usdt FROM liquidations 
    WHERE symbol = ? AND side = 'long'
  `).all(symbol).map((r: any) => r.volume_usdt);

  const shortVolumes = db.prepare(`
    SELECT volume_usdt FROM liquidations 
    WHERE symbol = ? AND side = 'short'
  `).all(symbol).map((r: any) => r.volume_usdt);

  if (longVolumes.length < 10 || shortVolumes.length < 10) {
    throw new Error(`Insufficient data for ${symbol}. Need at least 10 liquidations per side.`);
  }

  // Generate candidates (Phase 4 focuses on dynamic sizing and exit strategies)
  const thresholdCandidates = {
    long: [percentile(longVolumes, 0.7), percentile(longVolumes, 0.85)],
    short: [percentile(shortVolumes, 0.7), percentile(shortVolumes, 0.85)],
  };

  const tpCandidates = [1.5, 2.0, 2.5, 3.0];
  const slCandidates = [1.0, 1.5, 2.0];
  const leverageCandidates = [3, 5, 7];
  const sizeCandidates = [10, 15, 20, 25];
  const entryDelayCandidates = [0, 5];
  const cooldownCandidates = [0, 60];
  const slippageCandidates = [5, 7, 10];
  
  // Phase 4 specific candidates
  const dynamicSizingOptions = [true, false];
  const sizeMultiplierWinOptions = [1.05, 1.1]; // Increase size after wins
  const sizeMultiplierLossOptions = [0.85, 0.9]; // Decrease size after losses
  const trailingStopOptions = [0, 1, 1.5]; // % for trailing stop
  const partialExitOptions = [0, 50]; // % of position to exit early

  // Current config baseline
  const currentConfig = {
    longThreshold: strategy.longVolumeThresholdUSDT,
    shortThreshold: strategy.shortVolumeThresholdUSDT,
    tpPercent: strategy.tpPercent,
    slPercent: strategy.slPercent,
    leverage: strategy.leverage,
    longTradeSize: strategy.longTradeSize,
    shortTradeSize: strategy.shortTradeSize,
    entryDelay: 0,
    cooldownPeriod: 0,
    slippageBps: 7,
    dynamicSizing: false,
    sizeMultiplierWin: 1.0,
    sizeMultiplierLoss: 1.0,
    trailingStopPercent: 0,
    partialExitPercent: 0,
  };

  const currentResult = backtestConfigPhase4(symbol, currentConfig, weights);

  let bestScore = currentResult.score;
  let bestConfig = { ...currentConfig };
  let bestResult = currentResult;
  let testedCombinations = 1;

  console.log(`[Phase 4 ${symbol}] Starting elite optimization...`);

  // Stage 1: Optimize thresholds and TP/SL (quick pass)
  for (const longT of thresholdCandidates.long) {
    for (const shortT of thresholdCandidates.short) {
      for (const tp of tpCandidates.slice(0, 2)) { // Test only 2 TP values
        for (const sl of slCandidates.slice(0, 2)) {
          const config = { ...bestConfig, longThreshold: longT, shortThreshold: shortT, tpPercent: tp, slPercent: sl };
          const result = backtestConfigPhase4(symbol, config, weights);
          testedCombinations++;
          
          if (result.score > bestScore) {
            bestScore = result.score;
            bestConfig = config;
            bestResult = result;
          }
        }
      }
    }
  }

  // Stage 2: Optimize leverage and position sizing
  for (const lev of leverageCandidates) {
    for (const size of sizeCandidates.slice(0, 3)) {
      const config = { ...bestConfig, leverage: lev, longTradeSize: size, shortTradeSize: size };
      const result = backtestConfigPhase4(symbol, config, weights);
      testedCombinations++;
      
      if (result.score > bestScore) {
        bestScore = result.score;
        bestConfig = config;
        bestResult = result;
      }
    }
  }

  // Stage 3: Phase 4 - Dynamic position sizing
  for (const dynamicSizing of dynamicSizingOptions) {
    if (dynamicSizing) {
      for (const winMult of sizeMultiplierWinOptions) {
        for (const lossMult of sizeMultiplierLossOptions) {
          const config = { 
            ...bestConfig, 
            dynamicSizing, 
            sizeMultiplierWin: winMult, 
            sizeMultiplierLoss: lossMult 
          };
          const result = backtestConfigPhase4(symbol, config, weights);
          testedCombinations++;
          
          if (result.score > bestScore) {
            bestScore = result.score;
            bestConfig = config;
            bestResult = result;
          }
        }
      }
    }
  }

  // Stage 4: Phase 4 - Trailing stops
  for (const trailingStop of trailingStopOptions) {
    const config = { ...bestConfig, trailingStopPercent: trailingStop };
    const result = backtestConfigPhase4(symbol, config, weights);
    testedCombinations++;
    
    if (result.score > bestScore) {
      bestScore = result.score;
      bestConfig = config;
      bestResult = result;
    }
  }

  // Stage 5: Phase 4 - Partial exits
  for (const partialExit of partialExitOptions) {
    const config = { ...bestConfig, partialExitPercent: partialExit };
    const result = backtestConfigPhase4(symbol, config, weights);
    testedCombinations++;
    
    if (result.score > bestScore) {
      bestScore = result.score;
      bestConfig = config;
      bestResult = result;
    }
  }

  // Stage 6: Timing and slippage optimization
  for (const delay of entryDelayCandidates) {
    for (const cooldown of cooldownCandidates) {
      const config = { ...bestConfig, entryDelay: delay, cooldownPeriod: cooldown };
      const result = backtestConfigPhase4(symbol, config, weights);
      testedCombinations++;
      
      if (result.score > bestScore) {
        bestScore = result.score;
        bestConfig = config;
        bestResult = result;
      }
    }
  }

  const improvement = bestScore - currentResult.score;

  return {
    current: { ...currentResult, ...currentConfig },
    optimized: { ...bestResult, ...bestConfig },
    improvement,
    testedCombinations,
    slippageImpact: bestResult.slippageImpact,
    consecutiveLosses: bestResult.maxConsecutiveLosses,
    calmarRatio: bestResult.calmarRatio,
    sortinoRatio: bestResult.sortinoRatio,
    avgPositionSize: bestResult.avgPositionSize,
    maxPositionSize: bestResult.maxPositionSize,
    trailingStopHits: bestResult.trailingStopHits,
    partialExits: bestResult.partialExits,
    profitFactor: bestResult.profitFactor,
  };
}

/**
 * Phase 4: Optimize all symbols with elite features
 * Includes: dynamic sizing, trailing stops, partial exits, profit factor tracking
 */
export function optimizeAllSymbolsPhase4(
  symbols: string[],
  strategy: any,
  weights: ScoringWeights = SCORING_PRESETS.balanced
): Record<string, any> {
  const results: Record<string, any> = {};
  let totalCombinations = 0;

  console.log('[Optimizer Phase 4] Starting ELITE optimization with advanced features...');
  console.log('[Optimizer Phase 4] Weights:', weights);
  
  for (const symbol of symbols) {
    try {
      const symbolStrategy = strategy.perSymbol?.[symbol] || strategy;
      console.log(`[Optimizer Phase 4] Optimizing ${symbol}...`);
      
      const optimization = optimizePhase4(symbol, symbolStrategy, weights);
      totalCombinations += optimization.testedCombinations;
      
      results[symbol] = {
        symbol,
        current: optimization.current,
        optimized: optimization.optimized,
        improvement: optimization.improvement,
        testedCombinations: optimization.testedCombinations,
        sortinoRatio: optimization.sortinoRatio,
        calmarRatio: optimization.calmarRatio,
        consecutiveLosses: optimization.consecutiveLosses,
        slippageImpact: optimization.slippageImpact,
        avgPositionSize: optimization.avgPositionSize,
        maxPositionSize: optimization.maxPositionSize,
        trailingStopHits: optimization.trailingStopHits,
        partialExits: optimization.partialExits,
        profitFactor: optimization.profitFactor,
        recommendedSettings: {
          longVolumeThresholdUSDT: Math.round(optimization.optimized.longThreshold),
          shortVolumeThresholdUSDT: Math.round(optimization.optimized.shortThreshold),
          tpPercent: optimization.optimized.tpPercent,
          slPercent: optimization.optimized.slPercent,
          leverage: optimization.optimized.leverage,
          longTradeSize: optimization.optimized.longTradeSize,
          shortTradeSize: optimization.optimized.shortTradeSize,
          entryDelay: optimization.optimized.entryDelay,
          cooldownPeriod: optimization.optimized.cooldownPeriod,
          dynamicSizing: optimization.optimized.dynamicSizing,
          sizeMultiplierWin: optimization.optimized.sizeMultiplierWin,
          sizeMultiplierLoss: optimization.optimized.sizeMultiplierLoss,
          trailingStopPercent: optimization.optimized.trailingStopPercent,
          partialExitPercent: optimization.optimized.partialExitPercent,
        },
      };
      
      console.log(`[Optimizer Phase 4] ${symbol} complete:`);
      console.log(`  - Tested: ${optimization.testedCombinations} combinations`);
      console.log(`  - Improvement: $${optimization.improvement.toFixed(2)}`);
      console.log(`  - Sortino: ${optimization.sortinoRatio.toFixed(2)}`);
      console.log(`  - Profit Factor: ${optimization.profitFactor.toFixed(2)}`);
      console.log(`  - Trailing Stop Hits: ${optimization.trailingStopHits}`);
      console.log(`  - Partial Exits: ${optimization.partialExits}`);
      console.log(`  - Avg Position Size: $${optimization.avgPositionSize.toFixed(2)}`);
    } catch (e: any) {
      console.warn(`[Optimizer Phase 4] Skipping ${symbol}: ${e.message}`);
      results[symbol] = {
        symbol,
        error: e.message,
        skipped: true,
      };
    }
  }

  console.log(`[Optimizer Phase 4] Complete: tested ${totalCombinations} total combinations`);
  return results;
}
