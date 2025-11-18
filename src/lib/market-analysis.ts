
import { klines } from '@zengabor/bybit-api';
import { ema, atr } from 'indicatorts';

export type MarketRegime = 'Uptrend' | 'Downtrend' | 'Sideways';
export type Volatility = 'High' | 'Medium' | 'Low';

export interface MarketAnalysis {
  regime: MarketRegime;
  volatility: Volatility;
}

const SHORT_MA_PERIOD = 50;
const LONG_MA_PERIOD = 200;
const ATR_PERIOD = 14;
const VOLATILITY_ATR_THRESHOLD_HIGH = 1.5;
const VOLATILITY_ATR_THRESHOLD_LOW = 0.75;

async function getHistoricalData(symbol: string): Promise<number[]> {
  try {
    const response = await klines({
      category: 'linear',
      symbol: symbol,
      interval: 'D',
      limit: 400, // Fetch enough data for MAs and ATR
    });

    if (response.retCode === 0 && response.result.list) {
      // Return closing prices
      return response.result.list.map(kline => parseFloat(kline[4])).reverse();
    }
    return [];
  } catch (error) {
    console.error(`Failed to fetch historical data for ${symbol}:`, error);
    return [];
  }
}

export async function analyzeSymbol(symbol: string): Promise<MarketAnalysis | null> {
  const prices = await getHistoricalData(symbol);
  if (prices.length < LONG_MA_PERIOD) {
    console.warn(`Not enough historical data for ${symbol} to perform analysis.`);
    return null;
  }

  // Calculate MAs
  const shortMA = ema(prices, SHORT_MA_PERIOD);
  const longMA = ema(prices, LONG_MA_PERIOD);
  const latestShortMA = shortMA[shortMA.length - 1];
  const latestLongMA = longMA[longMA.length - 1];

  // Determine Market Regime
  let regime: MarketRegime;
  const maDiff = (latestShortMA - latestLongMA) / latestLongMA;
  if (maDiff > 0.02) {
    regime = 'Uptrend';
  } else if (maDiff < -0.02) {
    regime = 'Downtrend';
  } else {
    regime = 'Sideways';
  }

  // Calculate Volatility using ATR
  const highPrices = prices; // Using close for all HLC for simplicity here.
  const lowPrices = prices;
  const closePrices = prices;

  const atrValues = atr(ATR_PERIOD, {
    high: highPrices,
    low: lowPrices,
    close: closePrices,
  });

  const latestAtr = atrValues[atrValues.length - 1];
  const averageAtr = atrValues.reduce((a, b) => a + b, 0) / atrValues.length;

  // Determine Volatility
  let volatility: Volatility;
  if (latestAtr > averageAtr * VOLATILITY_ATR_THRESHOLD_HIGH) {
    volatility = 'High';
  } else if (latestAtr < averageAtr * VOLATILITY_ATR_THRESHOLD_LOW) {
    volatility = 'Low';
  } else {
    volatility = 'Medium';
  }

  return { regime, volatility };
}
