

import type { GlobalStrategy, StrategyParams } from './types';

// This is a mock configuration file.
// In a real application, this data would be stored securely on a server or in a database,
// and you would NOT commit API keys to your git repository.

export const userStrategy: GlobalStrategy = {
  // Per-symbol overrides can be defined here.
  // When a symbol is added, it will be initialized with these default values.
  perSymbol: {
    // Example:
    // 'BTC/USDT': {
    //   longVolumeThresholdUSDT: 5000,
    //   shortVolumeThresholdUSDT: 5000,
    //   ...
    // }
  },

  paperTradingInitialBalance: 1000,

  // API Keys (for live trading) - LEAVE THESE EMPTY in your repository
  apiKey: '',
  apiSecret: '',
  
  // Disable password protection (set to false to require password on startup)
  disablePassword: true,
  
  // Connection tuning
  ssePingIntervalMs: 25000, // 25 seconds (adjust for stability)
};

export const defaultSymbolStrategy: StrategyParams = {
    longVolumeThresholdUSDT: 3000,
    shortVolumeThresholdUSDT: 3000,
    useVolumeThreshold: true,
    longTradeSize: 5,
    shortTradeSize: 5,
    maxPositionMarginUSDT: 10000,
    leverage: 25,
    tpPercent: 2,
    slPercent: 1,
    priceOffsetBps: 5,
    maxSlippageBps: 50,
    orderType: 'LIMIT',
    vwapProtection: true,
    vwapTimeframe: "1m",
    vwapLookback: 100,
    useThreshold: false,
    thresholdTimeWindow: 60000,
    thresholdCooldown: 30000,
    forceMarketEntry: false,
    useTrailingTP: false,
    ttpActivationPercent: 1.5,
    ttpCallbackPercent: 0.5,
};
