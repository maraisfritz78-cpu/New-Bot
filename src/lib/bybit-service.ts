'use client';

// Bybit integration (testnet for paper mode, mainnet for live)
import { bybit as ccxtBybit } from 'ccxt';
import type { Exchange } from 'ccxt';
import type { MarketPair, StrategyParams, LiquidationOpportunity, TradingMode } from './types';
import { scanForOpportunities } from './mock-data'; // keep simulation for opportunity detection

let exchange: Exchange | null = null;
let pollingInterval: NodeJS.Timeout | null = null;
let sseReconnectTimer: any = null;

// Cache uiPair -> exchange symbol to avoid repeated market lookups
const symbolCache = new Map<string, string>();
// Prevent overlapping ticker polls
let tickerPollInFlight = false;

// Resolve an exchange-specific symbol for a UI pair like "BTC/USDT".
// For USDT linear perpetuals on Bybit via CCXT, markets can appear as:
//   "BTC/USDT" (unified), "BTC/USDT:USDT" (contract notation), or "BTCUSDT" (raw ID)
async function resolveExchangeSymbol(client: Exchange, uiPair: string): Promise<string> {
  const cached = symbolCache.get(uiPair);
  if (cached) return cached;
  // Ensure markets are loaded and cached
  if (!client.markets || Object.keys(client.markets).length === 0) {
    await client.loadMarkets();
  }

  // Extract base (e.g., "BTC" from "BTC/USDT")
  const base = uiPair.split('/')[0];
  
  // Try direct match first: "BTC/USDT" or "BTC/USDT:USDT"
  let candidate = (client.markets as any)[uiPair];
  if (candidate && candidate.contract && candidate.linear && candidate.quote === 'USDT' && candidate.active !== false) {
    symbolCache.set(uiPair, uiPair);
    return uiPair;
  }
  
  // Try contract notation: "BTC/USDT:USDT"
  const contractNotation = `${uiPair}:USDT`;
  candidate = (client.markets as any)[contractNotation];
  if (candidate && candidate.contract && candidate.linear && candidate.quote === 'USDT' && candidate.active !== false) {
    symbolCache.set(uiPair, contractNotation);
    return contractNotation;
  }
  
  // Try raw symbol ID: "BTCUSDT"
  const rawSymbol = `${base}USDT`;
  candidate = (client.markets as any)[rawSymbol];
  if (candidate && candidate.contract && candidate.linear && candidate.quote === 'USDT' && candidate.active !== false) {
    symbolCache.set(uiPair, rawSymbol);
    return rawSymbol;
  }
  
  // Last resort: search all markets for matching base/quote linear contract
  const matches = Object.values(client.markets).filter((m: any) => 
    m?.base === base && m?.quote === 'USDT' && m?.contract && m?.linear && (m?.active !== false)
  ) as any[];
  if (matches.length > 0) {
    symbolCache.set(uiPair, matches[0].symbol);
    return matches[0].symbol;
  }

  // No viable market found; return uiPair untouched so callers can handle error explicitly
  symbolCache.set(uiPair, uiPair);
  return uiPair;
}

function isUsingTestnet(c: Exchange | null): boolean {
  try {
    const url = (c as any)?.urls?.api?.public || (c as any)?.urls?.api || '';
    return typeof url === 'string' ? url.includes('testnet') : JSON.stringify(url).includes('testnet');
  } catch {
    return false;
  }
}

function getExchange(mode: TradingMode, apiKey?: string, apiSecret?: string): Exchange {
  const wantTestnet = mode === 'paper';

  const options: any = {
    apiKey,
    secret: apiSecret,
    options: {
      // Bybit USDT Perp
      defaultType: 'swap',
      enableUnifiedAccount: true,
    },
  };

  if (!exchange) {
    const client: Exchange = new (ccxtBybit as any)(options);
    client.setSandboxMode(wantTestnet);
    exchange = client;
    return client;
  }

  // Recreate the client if we need to switch between testnet/mainnet
  if ((wantTestnet && !isUsingTestnet(exchange)) || (!wantTestnet && isUsingTestnet(exchange))) {
    try {
      (exchange as any).close?.();
    } catch {}
    const client: Exchange = new (ccxtBybit as any)(options);
    client.setSandboxMode(wantTestnet);
    exchange = client;
  } else {
    if (apiKey) exchange.apiKey = apiKey;
    if (apiSecret) exchange.secret = apiSecret;
  }

  return exchange as Exchange;
}

export const connectToMarketStream = (
  mode: TradingMode,
  marketData: MarketPair[],
  getStrategy: (pair: string) => StrategyParams,
  onUpdate: (data: { newData: MarketPair[]; newOpportunities: LiquidationOpportunity[] }) => void,
  onPrivateEvent?: (evt: any) => void,
  apiKey?: string,
  apiSecret?: string,
): (() => void) => {
  let localMarketData = [...marketData];
  const uiPairs = marketData.map((p) => p.pair);

  if (pollingInterval) clearInterval(pollingInterval);

  // Start server-side realtime WS and subscribe (only once, not on every reconnect)
  let realtimeStarted = false;
  const startRealtime = () => {
    if (!realtimeStarted) {
      realtimeStarted = true;
      fetch('/api/realtime/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, symbols: uiPairs, apiKey, apiSecret }),
      }).catch((e) => console.warn('Realtime start failed:', e));
    }
  };
  startRealtime();

  let stopped = false;
  let es: EventSource | null = null;
  let retry = 0;
  const maxDelay = 30000;
  let lastUpdateTime = 0;
  const UPDATE_THROTTLE_MS = 500; // Throttle updates to every 500ms to prevent memory churn
  let errorCount = 0;
  let lastErrorTime = 0;
  
  const openES = () => {
    if (stopped) return;
    try { es?.close(); } catch {}
    es = new EventSource('/api/realtime/sse');
    errorCount = 0; // Reset error count on successful connection
    es.onopen = () => { 
      retry = 0;
      errorCount = 0;
      console.log('[SSE] Connected');
    };
    es.onerror = () => {
      // Only reconnect on repeated errors, not on every single error
      // EventSource is resilient - many errors are recoverable
      const now = Date.now();
      errorCount++;
      
      // If we've had 3+ errors in 5 seconds, then reconnect
      if (errorCount >= 3 && now - lastErrorTime < 5000) {
        console.warn(`[SSE] Multiple errors, reconnecting (count: ${errorCount})`);
        try { es?.close(); } catch {}
        if (stopped) return;
        const delay = Math.min(1000 * Math.pow(2, retry++), maxDelay);
        clearTimeout(sseReconnectTimer);
        sseReconnectTimer = setTimeout(openES, delay);
        errorCount = 0;
      }
      lastErrorTime = now;
    };
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ticker') handleTicker(msg);
        else if (msg.type === 'balance') {
          onPrivateEvent?.(msg);
        } else if (msg.type === 'position') {
          onPrivateEvent?.(msg);
        } else if (msg.type === 'order') {
          onPrivateEvent?.(msg);
        } else if (msg.type === 'ping' || msg.type === 'ready' || msg.type === 'error') {
          onPrivateEvent?.(msg);
        }
      } catch {}
    };
  };
  openES();

  const handleTicker = (evt: any) => {
    let anyUpdate = false;
    const uiSymbol = evt.symbol as string;
    const price = Number(evt.price);
    const change24h = Number(evt.change24h ?? 0);

    localMarketData = localMarketData.map(pair => {
      if (pair.pair === uiSymbol && !isNaN(price)) {
        anyUpdate = true;
        // Keep only last 100 price points to avoid memory leak
        const newHistory = [...(pair.priceHistory || []), { time: Date.now(), price }].slice(-100);
        return { ...pair, price, change24h, priceHistory: newHistory };
      }
      return pair;
    });

    // Throttle updates to avoid flooding React state and causing memory churn
    const now = Date.now();
    if (anyUpdate && now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
      lastUpdateTime = now;
      let newOpportunities: LiquidationOpportunity[] = [];
      localMarketData.forEach(pair => {
        const strategy = getStrategy(pair.pair);
        const ops = scanForOpportunities([pair], strategy);
        if (ops.length > 0) {
          console.log(`[bybit-service] Found ${ops.length} opportunities for ${pair.pair}`);
        }
        // Limit opportunities to top 50 per update to avoid memory buildup
        newOpportunities.push(...ops.slice(0, 1));
      });
      if (newOpportunities.length > 0) {
        console.log(`[bybit-service] Emitting ${newOpportunities.length} total opportunities`);
      }
      onUpdate({ newData: localMarketData, newOpportunities: newOpportunities.slice(0, 50) });
    }
  };

  return () => {
    stopped = true;
    clearTimeout(sseReconnectTimer);
    try { es?.close(); } catch {}
  };
};

export const executeTrade = async (
  mode: TradingMode,
  opportunity: LiquidationOpportunity,
  strategy: StrategyParams,
  apiKey?: string,
  apiSecret?: string,
): Promise<boolean> => {
  const client = getExchange(mode, apiKey, apiSecret);
  try {
    const exSymbol = await resolveExchangeSymbol(client, opportunity.pair);
    const mkt = client.market(exSymbol);
    // Ensure we're trading a live linear USDT contract
    if (!mkt?.contract || !mkt?.linear || mkt?.quote !== 'USDT' || mkt?.active === false) {
      throw new Error(`Pair ${opportunity.pair} does not have an active USDT linear contract`);
    }

    const side = opportunity.type === 'long' ? 'sell' : 'buy';
    const rawAmount = side === 'buy' ? strategy.longTradeSize : strategy.shortTradeSize;

    await client.setLeverage(strategy.leverage, exSymbol);

    // Respect market limits/precision (contracts are integral)
    const minAmt = Number(mkt?.limits?.amount?.min ?? 1);
    let desired = Number(rawAmount);
    if (!Number.isFinite(desired) || desired <= 0) desired = minAmt;
    let amountNum = Number(client.amountToPrecision(exSymbol, desired));
    if (!Number.isFinite(amountNum) || amountNum < minAmt) {
      amountNum = Number(client.amountToPrecision(exSymbol, minAmt));
    }
    // Safety: ensure at least 1 contract when min is 1 and precision rounds down
    if (amountNum < minAmt) amountNum = minAmt;

    // Compute TP/SL prices from strategy relative to Last price
    const lastPriceTicker = await client.fetchTicker(exSymbol).catch(() => null as any);
    const refPrice: number = lastPriceTicker?.last ?? opportunity.currentPrice;
    const tp = side === 'buy'
      ? refPrice * (1 + strategy.tpPercent / 100)
      : refPrice * (1 - strategy.tpPercent / 100);
    const sl = side === 'buy'
      ? refPrice * (1 - strategy.slPercent / 100)
      : refPrice * (1 + strategy.slPercent / 100);
    const tpPx = Number(client.priceToPrecision(exSymbol, tp));
    const slPx = Number(client.priceToPrecision(exSymbol, sl));

    // Place market order (one-way, not reduce-only) with TP/SL attached when supported
    const params: any = {
      reduceOnly: false,
      category: 'linear',
      takeProfit: tpPx,
      stopLoss: slPx,
      tpTriggerBy: 'LastPrice',
      slTriggerBy: 'LastPrice',
      tpslMode: 'Full',
      positionIdx: '0',
    };
    const order = await client.createOrder(exSymbol, 'market', side, amountNum, undefined, params);

    if (!order || !order.id) {
      console.error('Bybit order missing id or not accepted', order);
      return false;
    }

    // Verify a position opened and attach/update stops defensively
    for (let i = 0; i < 3; i++) {
      try {
        const positions: any[] = await (client as any).fetchPositions([exSymbol]);
        const pos = positions?.find((p) => p.symbol === exSymbol && Math.abs(Number(p.contracts || p.amount || 0)) > 0);
        if (pos) {
          await updatePositionStops(mode, opportunity.pair, side === 'buy' ? 'buy' : 'sell', tpPx, slPx, apiKey, apiSecret);
          return true;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }

    console.warn('Bybit position not observed after order id; treating as failure.');
    return false;
  } catch (e) {
    console.error(`Failed to execute trade for ${opportunity.pair}:`, e);
    return false;
  }
};

export const createLimitOrder = async (
  mode: TradingMode,
  uiPair: string,
  side: 'buy' | 'sell',
  amount: number,
  price: number,
  tpPrice?: number,
  slPrice?: number,
  apiKey?: string,
  apiSecret?: string,
): Promise<{ id: string } | null> => {
  const client = getExchange(mode, apiKey, apiSecret);
  try {
    const exSymbol = await resolveExchangeSymbol(client, uiPair);
    const mkt = client.market(exSymbol);
    if (!mkt?.contract || !mkt?.linear || mkt?.quote !== 'USDT' || mkt?.active === false) {
      throw new Error(`Pair ${uiPair} does not have an active USDT linear contract`);
    }
    const minAmt = Number(mkt?.limits?.amount?.min ?? 1);
    const amtStr = client.amountToPrecision(exSymbol, Math.max(minAmt, amount));
    const pxStr = client.priceToPrecision(exSymbol, price);
    
    const params: any = {
      reduceOnly: false,
      timeInForce: 'GTC',
      category: 'linear',
      tpTriggerBy: 'LastPrice',
      slTriggerBy: 'LastPrice',
      tpslMode: 'Full',
    };
    
    if (tpPrice !== undefined && !isNaN(tpPrice)) params.takeProfit = Number(client.priceToPrecision(exSymbol, tpPrice));
    if (slPrice !== undefined && !isNaN(slPrice)) params.stopLoss = Number(client.priceToPrecision(exSymbol, slPrice));
    
    const order = await client.createOrder(exSymbol, 'limit', side, Number(amtStr), Number(pxStr), params);
    if (!order?.id) return null;
    return { id: String(order.id) };
  } catch (e) {
    console.error('Failed to place limit order:', e);
    return null;
  }
};

export const cancelExchangeOrder = async (
  mode: TradingMode,
  orderId: string,
  uiPair: string,
  apiKey?: string,
  apiSecret?: string,
): Promise<boolean> => {
  const client = getExchange(mode, apiKey, apiSecret);
  try {
    const exSymbol = await resolveExchangeSymbol(client, uiPair);
    await client.cancelOrder(orderId, exSymbol, { category: 'linear' });
    return true;
  } catch (e: any) {
    // Suppress "order not exists" error (110001) - order may have filled/cancelled already
    if (e?.message?.includes('110001') || e?.message?.includes('not exists') || e?.message?.includes('too late')) {
      return true; // Treat as success since order is no longer active
    }
    console.error('Failed to cancel order on exchange:', e);
    return false;
  }
};

export const updatePositionStops = async (
  mode: TradingMode,
  uiPair: string,
  side: 'buy' | 'sell',
  takeProfitPx?: number,
  stopLossPx?: number,
  apiKey?: string,
  apiSecret?: string,
): Promise<boolean> => {
  const client = getExchange(mode, apiKey, apiSecret);
  try {
    const exSymbol = await resolveExchangeSymbol(client, uiPair);
    // Map unified symbol (e.g., "SOL/USDT:USDT") to Bybit instrument id (e.g., "SOLUSDT") for raw v5 calls
    const idSymbol = client.market(exSymbol).id;
    const tp = takeProfitPx !== undefined ? Number(client.priceToPrecision(exSymbol, takeProfitPx)) : undefined;
    const sl = stopLossPx !== undefined ? Number(client.priceToPrecision(exSymbol, stopLossPx)) : undefined;

    // Detect positionIdx (hedge vs one-way)
    let positionIdx: number | undefined = undefined;
    try {
      const positions: any[] = await (client as any).fetchPositions([exSymbol]);
      // Find matching symbol and non-zero size
      const pos = positions?.find((p) => p.symbol === exSymbol && Math.abs(Number(p.contracts ?? p.amount ?? p.size ?? p.positionQty ?? 0)) > 0);
      const rawIdx = Number(pos?.positionIdx ?? pos?.info?.positionIdx ?? 0);
      // In hedge mode: long=1, short=2; one-way: 0 (omit is fine)
      if (!Number.isNaN(rawIdx) && rawIdx > 0) positionIdx = rawIdx;
    } catch {}

    const params: any = {
      category: 'linear',
      symbol: idSymbol,
      tpTriggerBy: 'LastPrice',
      slTriggerBy: 'LastPrice',
      tpslMode: 'Full',
      recvWindow: '5000',
    };
    if (positionIdx !== undefined) params.positionIdx = String(positionIdx);
    if (tp !== undefined && !isNaN(tp)) params.takeProfit = String(tp);
    if (sl !== undefined && !isNaN(sl)) params.stopLoss = String(sl);

    // Use v5 position/trading-stop endpoint via ccxt raw method
    const res = await (client as any).privatePostV5PositionTradingStop(params);
    const ok = res?.retCode === 0 || res?.ret_code === 0 || res?.ret_msg === 'OK' || res?.success === true;
    // Error 34040 means "not modified" - TP/SL already set to these values, which is fine
    const notModified = res?.retCode === 34040 || res?.ret_code === 34040;
    if (notModified) return true;
    if (!ok) console.warn('updatePositionStops response', res);
    return ok;
  } catch (e: any) {
    // Suppress "not modified" error (34040) - this is not a real error
    if (e?.message?.includes('34040') || e?.message?.includes('not modified')) {
      return true;
    }
    console.error('Failed to update position TP/SL:', e);
    return false;
  }
};

export const closePosition = async (
  mode: TradingMode,
  uiPair: string,
  side: 'buy' | 'sell',
  apiKey?: string,
  apiSecret?: string,
): Promise<boolean> => {
  const client = getExchange(mode, apiKey, apiSecret);
  try {
    const exSymbol = await resolveExchangeSymbol(client, uiPair);
    const mkt = client.market(exSymbol);
    if (!mkt?.contract || !mkt?.linear || mkt?.quote !== 'USDT' || mkt?.active === false) {
      throw new Error(`Pair ${uiPair} does not have an active USDT linear contract`);
    }
    // Fetch current position to determine size to close
    let amount = 0;
    try {
      const positions: any[] = await (client as any).fetchPositions([exSymbol]);
      const pos = positions?.find((p) => p.symbol === exSymbol);
      const contracts = Number(pos?.contracts ?? pos?.amount ?? 0);
      amount = Math.abs(contracts);
    } catch {}
    if (!amount || amount <= 0) {
      // As a fallback, try to close using strategy sizes could be added here
      console.warn('No position size found to close for', exSymbol);
      return false;
    }
    const opposite: 'buy' | 'sell' = side === 'buy' ? 'sell' : 'buy';
    const amtStr = client.amountToPrecision(exSymbol, amount);
    await client.createOrder(exSymbol, 'market', opposite, Number(amtStr), undefined, { reduceOnly: true, category: 'linear' });
    return true;
  } catch (e) {
    console.error('Failed to close position on exchange:', e);
    return false;
  }
};

export const fetchAccountBalance = async (
  mode: TradingMode,
  apiKey?: string,
  apiSecret?: string,
): Promise<number> => {
  if (mode === 'live' && (!apiKey || !apiSecret)) {
    console.warn('API Keys not provided for live balance fetch. Returning 0.');
    return 0;
  }
  const client = getExchange(mode, apiKey, apiSecret);
  try {
    // Ask ccxt for Unified Trading Account balances, USDT settled
    const params: any = { type: 'unified', settle: 'USDT' };
    const balance: any = await client.fetchBalance(params);

    // Prefer UTA margin balance (totalMarginBalance) or USDT marginBalance
    let margin: number | undefined;
    let available: number | undefined;

    if (balance?.info) {
      const info = balance.info;
      const list = info?.result?.list?.[0] || {};

      const coins = list.coin || info?.result?.coin || [];
      if (Array.isArray(coins)) {
        const usdtRow = coins.find((c: any) => (c.coin || c.asset) === 'USDT');
        if (usdtRow) {
          // Prefer coin-level fields for visible UI values
          available = Number(usdtRow.availableBalance ?? usdtRow.availableToWithdraw);
          margin = Number(usdtRow.marginBalance);
        }
      }
      // Aggregate totals as fallback only
      if (isNaN(margin as number)) margin = Number(list.totalMarginBalance);
      if (isNaN(available as number)) available = Number(list.totalAvailableBalance);
    }

    if (typeof margin === 'number' && !isNaN(margin)) return margin;

    // Final fallback defaults
    return mode === 'paper' ? 1000 : 0;
  } catch (e) {
    console.error('Failed to fetch account balance:', e);
    return mode === 'paper' ? 1000 : 0;
  }
};

export const fetchAccountBalances = async (
  mode: TradingMode,
  apiKey?: string,
  apiSecret?: string,
): Promise<{ margin: number; available: number }> => {
  const client = getExchange(mode, apiKey, apiSecret);
  try {
    const params: any = { type: 'unified', settle: 'USDT' };
    const balance: any = await client.fetchBalance(params);

    let margin: number | undefined;
    let available: number | undefined;

    if (balance?.info) {
      const info = balance.info;
      const list = info?.result?.list?.[0] || {};
      
      // Parse balances - they may come as strings from API
      const totalMargin = String(list.totalMarginBalance || '').trim();
      const totalAvail = String(list.totalAvailableBalance || '').trim();
      margin = totalMargin ? parseFloat(totalMargin) : undefined;
      available = totalAvail ? parseFloat(totalAvail) : undefined;

      // If coin-level USDT balance exists, use that instead
      const coins = list.coin || info?.result?.coin || [];
      if (Array.isArray(coins)) {
        const usdtRow = coins.find((c: any) => (c.coin || c.asset) === 'USDT');
        if (usdtRow) {
          const coinMargin = String(usdtRow.marginBalance ?? '').trim();
          const coinAvail = String(usdtRow.availableBalance ?? usdtRow.availableToWithdraw ?? '').trim();
          if (coinMargin) margin = parseFloat(coinMargin);
          if (coinAvail) available = parseFloat(coinAvail);
        }
      }
    }

    return {
      margin: typeof margin === 'number' && !isNaN(margin) ? margin : (mode === 'paper' ? 1000 : 0),
      available: typeof available === 'number' && !isNaN(available) ? available : (mode === 'paper' ? 1000 : 0),
    };
  } catch (e) {
    console.error('Failed to fetch account balances:', e);
    return { margin: mode === 'paper' ? 1000 : 0, available: mode === 'paper' ? 1000 : 0 };
  }
};

export const fetchInitialMarketData = async (
  mode: TradingMode,
  symbols: string[],
): Promise<MarketPair[]> => {
  if (symbols.length === 0) return [];
  const client = getExchange(mode);
  try {
    const exSymbols = await Promise.all(symbols.map((s) => resolveExchangeSymbol(client, s)));

    let tickerMap: Record<string, any> = {};
    try {
      // Batch when possible to reduce rate limit pressure
      const tickers = await client.fetchTickers(exSymbols, { category: 'linear' } as any);
      tickerMap = tickers || {};
    } catch (batchErr) {
      // Fallback to per-symbol fetchTicker
      const entries = await Promise.all(
        exSymbols.map(async (s) => {
          try {
            const t = await client.fetchTicker(s);
            return [s, t] as const;
          } catch (e) {
            console.error('fetchTicker failed for', s, e);
            return [s, undefined] as const;
          }
        })
      );
      tickerMap = Object.fromEntries(entries);
    }

    return exSymbols.map((exSymbol, idx) => {
      const ticker = tickerMap[exSymbol];
      const uiPair = symbols[idx];
      const price = ticker?.last ?? 0;
      const change = ticker?.change ?? 0;
      return {
        pair: uiPair,
        price,
        change24h: change,
        priceHistory: Array(50)
          .fill(0)
          .map((_, i) => ({ time: Date.now() - (50 - i) * 2000, price })),
      } as MarketPair;
    });
  } catch (e) {
    console.error('Failed to fetch initial market data:', e);
    return [];
  }
};

export const fetchAllSymbols = async (mode: TradingMode): Promise<string[]> => {
  const client = getExchange(mode);
  try {
    await client.loadMarkets();
    const symbols = Object.values(client.markets)
      .filter((m: any) => m.contract && m.linear && m.active && m.quote === 'USDT')
      .map((m: any) => (m.symbol as string).split(':')[0]);
    return [...new Set(symbols)].sort();
  } catch (e) {
    console.error('Failed to fetch all symbols:', e);
    return [];
  }
};

// Lightweight tickers fetch used by fallback poll; skips history building
/**
 * Calculate VWAP (Volume-Weighted Average Price) for a symbol
 * @returns VWAP value, or null if calculation fails
 */
export const calculateVWAP = async (
  mode: TradingMode,
  uiPair: string,
  timeframe: string = '1m',
  lookback: number = 100,
): Promise<number | null> => {
  const client = getExchange(mode);
  try {
    const exSymbol = await resolveExchangeSymbol(client, uiPair);
    
    // Fetch OHLCV candles: [timestamp, open, high, low, close, volume]
    const candles = await client.fetchOHLCV(exSymbol, timeframe, undefined, lookback);
    
    if (!candles || candles.length === 0) {
      console.warn(`[VWAP] No candles returned for ${uiPair}`);
      return null;
    }
    
    // Calculate VWAP = Σ(price × volume) / Σ(volume)
    // Use typical price: (high + low + close) / 3
    let sumPriceVolume = 0;
    let sumVolume = 0;
    
    for (const candle of candles) {
      const [, , high, low, close, volume] = candle;
      const typicalPrice = (high + low + close) / 3;
      sumPriceVolume += typicalPrice * volume;
      sumVolume += volume;
    }
    
    if (sumVolume === 0) {
      console.warn(`[VWAP] Zero volume for ${uiPair}`);
      return null;
    }
    
    const vwap = sumPriceVolume / sumVolume;
    return vwap;
  } catch (e) {
    console.error(`[VWAP] Calculation failed for ${uiPair}:`, e);
    return null;
  }
};

export const fetchLatestTickers = async (
  mode: TradingMode,
  symbols: string[],
): Promise<MarketPair[]> => {
  if (tickerPollInFlight) return [];
  tickerPollInFlight = true;
  const client = getExchange(mode);
  try {
    const exSymbols = await Promise.all(symbols.map((s) => resolveExchangeSymbol(client, s)));
    let map: Record<string, any> = {};
    try {
      map = await client.fetchTickers(exSymbols, { category: 'linear' } as any);
    } catch (e) {
      const entries = await Promise.all(
        exSymbols.map(async (s) => {
          try { return [s, await client.fetchTicker(s)] as const; } catch { return [s, undefined] as const; }
        })
      );
      map = Object.fromEntries(entries);
    }
    return exSymbols.map((ex, i) => ({
      pair: symbols[i],
      price: map[ex]?.last ?? 0,
      change24h: map[ex]?.change ?? 0,
    } as MarketPair));
  } finally {
    tickerPollInFlight = false;
  }
};

export const fetchExchangeSnapshot = async (
  mode: TradingMode,
  apiKey?: string,
  apiSecret?: string,
): Promise<{
  positions: Array<{ pair: string; side: 'buy' | 'sell'; size: number; entryPrice: number; leverage: number }>;
  orders: Array<{ id: string; pair: string; type: 'buy' | 'sell'; price: number; size: number }>;
  balances: { margin: number; available: number };
}> => {
  const client = getExchange(mode, apiKey, apiSecret);
  try {
    await client.loadMarkets();
    const { margin, available } = await fetchAccountBalances(mode, apiKey, apiSecret);

    // Positions (linear)
    let positions: any[] = [];
    try {
      positions = await (client as any).fetchPositions(); // ccxt may return all
    } catch (e) {
      console.warn('fetchPositions(all) failed; falling back to none:', e);
      positions = [];
    }
    const posOut: Array<{ pair: string; side: 'buy' | 'sell'; size: number; entryPrice: number; leverage: number }> = [];
    for (const p of positions || []) {
      try {
        const symbol: string = p.symbol || '';
        if (!symbol) continue;
        const m = client.market(symbol);
        if (!m?.contract || !m?.linear || m?.quote !== 'USDT') continue;
        const uiPair = (m.symbol as string).split(':')[0];
        const contracts = Number(p.contracts ?? p.amount ?? p.size ?? p.positionQty ?? 0);
        const size = Math.abs(contracts);
        if (!size) continue;
        const side = (p.side === 'long' ? 'buy' : p.side === 'short' ? 'sell' : contracts > 0 ? 'buy' : 'sell') as 'buy' | 'sell';
        const entryPrice = Number(p.entryPrice ?? p.avgPrice ?? p.avgEntryPrice ?? 0) || 0;
        const leverage = Number(p.leverage ?? 1) || 1;
        posOut.push({ pair: uiPair, side, size, entryPrice, leverage });
      } catch {}
    }

    // Open orders (linear)
    let openOrders: any[] = [];
    try {
      openOrders = await client.fetchOpenOrders(undefined, undefined, undefined, { category: 'linear' });
    } catch (e) {
      console.warn('fetchOpenOrders failed:', e);
      openOrders = [];
    }
    const ordOut: Array<{ id: string; pair: string; type: 'buy' | 'sell'; price: number; size: number }> = [];
    for (const o of openOrders || []) {
      try {
        const symbol: string = o.symbol || '';
        const m = symbol ? client.market(symbol) : undefined;
        if (!m?.contract || !m?.linear || m?.quote !== 'USDT') continue;
        const uiPair = (m.symbol as string).split(':')[0];
        const id = String(o.id || o.orderId || '');
        const type = (String(o.side || '').toLowerCase() === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell';
        const price = Number(o.price || o.stopPrice || o.triggerPrice || 0) || 0;
        const size = Number(o.amount || o.qty || 0) || 0;
        ordOut.push({ id, pair: uiPair, type, price, size });
      } catch {}
    }

    return { positions: posOut, orders: ordOut, balances: { margin, available } };
  } catch (e) {
    console.error('Failed to fetch exchange snapshot:', e);
    return { positions: [], orders: [], balances: { margin: mode === 'paper' ? 1000 : 0, available: mode === 'paper' ? 1000 : 0 } };
  }
};
