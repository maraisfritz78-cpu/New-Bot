

import type { MarketPair, StrategyParams, LiquidationOpportunity } from './types';

// =================================================================
// ALL SYMBOLS (Simulation for exchangeInfo endpoint)
// =================================================================
export const getAllMockSymbols = (): string[] => [
    "BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "XRP/USDT",
    "DOGE/USDT", "ADA/USDT", "AVAX/USDT", "SHIB/USDT", "DOT/USDT",
    "LINK/USDT", "TRX/USDT", "MATIC/USDT", "BCH/USDT", "LTC/USDT",
    "ICP/USDT", "NEAR/USDT", "UNI/USDT", "FIL/USDT", "ATOM/USDT",
    "ETC/USDT", "HBAR/USDT", "XLM/USDT", "CRO/USDT", "INJ/USDT",
    "VET/USDT", "APT/USDT", "OP/USDT", "GRT/USDT", "RNDR/USDT",
    "IMX/USDT", "THETA/USDT", "LDO/USDT", "ARB/USDT", "AAVE/USDT",
    "EGLD/USDT", "QNT/USDT", "AXS/USDT", "MANA/USDT", "SAND/USDT",
    "FTM/USDT", "EOS/USDT", "XTZ/USDT", "SNX/USDT", "MKR/USDT",
    "ZEC/USDT", "CHZ/USDT", "GALA/USDT", "ENJ/USDT", "FLOW/USDT",
    "APE/USDT", "KAVA/USDT", "CRV/USDT", "COMP/USDT", "WAVES/USDT",
    "TWT/USDT", "DYDX/USDT", "GMT/USDT", "ZIL/USDT", "1INCH/USDT",
    "ASTR/USDT", "SUI/USDT", "PEPE/USDT", "FLOKI/USDT", "BONK/USDT"
];


// =================================================================
// Paper Trading / Initial Data (Testnet Simulation)
// =================================================================

export const getInitialPaperMarketData = (): MarketPair[] => [
  { pair: 'BTC/USDT', price: 68500.00, change24h: 1.5, priceHistory: [] },
  { pair: 'ETH/USDT', price: 3600.00, change24h: 2.1, priceHistory: [] },
  { pair: 'SOL/USDT', price: 170.00, change24h: -0.5, priceHistory: [] },
  // Adding more variety for searching
  { pair: 'BNB/USDT', price: 602.10, change24h: 0.8, priceHistory: [] },
  { pair: 'XRP/USDT', price: 0.51, change24h: -1.0, priceHistory: [] },
  { pair: 'DOGE/USDT', price: 0.16, change24h: 2.5, priceHistory: [] },
];

/**
 * Simulates fetching the user's paper/testnet USDT balance from an exchange.
 * @returns A simulated balance.
 */
export const getSimulatedPaperBalance = (): number => {
  return 10000.00; // A typical testnet starting balance.
};


// =================================================================
// Live Trading / Initial Data (Production Simulation)
// =================================================================

export const getInitialLiveMarketData = (): MarketPair[] => [
    { pair: 'BTC/USDT', price: 68123.45, change24h: 2.5, priceHistory: [] },
    { pair: 'ETH/USDT', price: 3550.78, change24h: 1.8, priceHistory: [] },
    { pair: 'SOL/USDT', price: 167.22, change24h: -1.2, priceHistory: [] },
    { pair: 'BNB/USDT', price: 605.10, change24h: 0.5, priceHistory: [] },
    { pair: 'XRP/USDT', price: 0.52, change24h: -0.5, priceHistory: [] },
    { pair: 'DOGE/USDT', price: 0.15, change24h: 1.5, priceHistory: [] },
    { pair: 'LTC/USDT', price: 82.50, change24h: 1.2, priceHistory: [] },
];

/**
 * Simulates fetching the user's live USDT balance from an exchange.
 * @returns A simulated balance.
 */
export const getSimulatedLiveBalance = (): number => {
  return 2543.87; // A realistic, static balance for demonstration.
};


// =================================================================
// Generic Simulation Functions
// =================================================================

// Function to simulate price updates during bot operation
export const updatePrice = (currentPrice: number): number => {
  const volatility = 0.01; // 1% volatility
  const change = (Math.random() - 0.5) * 2 * currentPrice * volatility;
  return Math.max(0, currentPrice + change);
};

// Function to scan for liquidation opportunities (simulation)
export const scanForOpportunities = (
  marketData: MarketPair[],
  strategy: StrategyParams
): LiquidationOpportunity[] => {
  const opportunities: LiquidationOpportunity[] = [];

  marketData.forEach(pair => {
    // Only proceed if a random check passes, to simulate opportunities not always being present.
    if (Math.random() > 0.3) { // 30% chance of an opportunity appearing in a given interval
        return;
    }
    
    const liquidationVolume = Math.random() * 50000;
    const isLongLiq = Math.random() < 0.5;
    const volumeThreshold = isLongLiq ? strategy.longVolumeThresholdUSDT : strategy.shortVolumeThresholdUSDT;
    
    // Check if the volume condition should be applied
    if (strategy.useVolumeThreshold && liquidationVolume < volumeThreshold) {
        return;
    }

    const priceThreshold = 0.001; // Using a simplified threshold for simulation

    if (isLongLiq) {
      const liquidationPrice = pair.price * (1 - (priceThreshold * (Math.random() + 0.5)));
      if (pair.price > liquidationPrice && pair.price < liquidationPrice * (1 + priceThreshold)) {
        opportunities.push({
          id: `long-${pair.pair}-${Date.now()}`,
          pair: pair.pair,
          type: 'long',
          liquidationPrice,
          currentPrice: pair.price,
          volumeUSDT: liquidationVolume, // Include the volume!
        });
      }
    } else { // Short liquidation
      const liquidationPrice = pair.price * (1 + (priceThreshold * (Math.random() + 0.5)));
      if (pair.price < liquidationPrice && pair.price > liquidationPrice * (1 - priceThreshold)) {
        opportunities.push({
          id: `short-${pair.pair}-${Date.now()}`,
          pair: pair.pair,
          type: 'short',
          liquidationPrice,
          currentPrice: pair.price,
          volumeUSDT: liquidationVolume, // Include the volume!
        });
      }
    }
  });

  return opportunities;
};
