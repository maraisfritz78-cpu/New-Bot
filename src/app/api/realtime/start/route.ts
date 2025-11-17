import { NextRequest } from 'next/server';
import { bybitWsManager } from '@/server/bybit-ws';

export const dynamic = 'force-dynamic';

// Debounce map to prevent multiple simultaneous calls
const lastStartTime = new Map<string, number>();
const START_DEBOUNCE_MS = 10000; // 10s between starts

export async function POST(req: NextRequest) {
  // Be robust to empty or non-JSON bodies to avoid "Unexpected end of JSON input"
  let body: any = {};
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = await req.json().catch(() => ({}));
    } else {
      const text = await req.text().catch(() => '');
      try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
    }
  } catch {
    body = {};
  }

  const mode: 'paper' | 'live' = body?.mode === 'live' ? 'live' : 'paper';
  const symbols: string[] = Array.isArray(body?.symbols) ? body.symbols.filter((s: any) => typeof s === 'string') : [];
  const apiKey: string | undefined = typeof body?.apiKey === 'string' ? body.apiKey : undefined;
  const apiSecret: string | undefined = typeof body?.apiSecret === 'string' ? body.apiSecret : undefined;

  console.log(`[api/realtime/start] Called with mode=${mode}, symbols=${symbols.length}`);

  // Debounce: prevent multiple simultaneous calls
  const cacheKey = `${mode}-${symbols.join(',')}`;
  const now = Date.now();
  const lastTime = lastStartTime.get(cacheKey) || 0;
  if (now - lastTime < START_DEBOUNCE_MS) {
    // Return cached result instead of repeating
    console.log(`[api/realtime/start] Debounced (${now - lastTime}ms since last call)`);
    return new Response(JSON.stringify({ ok: true, mode, subscribed: symbols.length, cached: true }), { status: 200 });
  }
  lastStartTime.set(cacheKey, now);

  // Start public connection
  console.log(`[api/realtime/start] Starting bot with ${symbols.length} symbols`);
  bybitWsManager.start(mode);
  if (symbols.length > 0) {
    bybitWsManager.subscribeTickers(symbols);
  }

  // Start private connection in background (don't block request)
  // Connect for both paper (testnet) and live modes when API keys are provided
  if (apiKey && apiSecret) {
    console.log(`[api/realtime/start] Starting private WebSocket for ${mode} mode`);
    bybitWsManager.startPrivate(mode, apiKey, apiSecret);
  } else {
    console.log(`[api/realtime/start] No API keys provided, skipping private WebSocket`);
  }

  return new Response(JSON.stringify({ ok: true, mode, subscribed: symbols.length }), { status: 200 });
}
