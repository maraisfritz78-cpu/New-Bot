import WebSocket, { RawData } from 'ws';
import crypto from 'crypto';
import { realtimeBus } from './realtime-bus';

export type TradingMode = 'paper' | 'live';

// Temporary debug toggle for wallet payload logging (set DEBUG_WALLET=false to disable)
const DEBUG_WALLET = (process.env.DEBUG_WALLET ?? 'true') === 'true';

type ConnPair = {
  ws?: WebSocket;
  url: string;
  connected: boolean;
};

function endpoints(mode: TradingMode) {
  const isPaper = mode === 'paper';
  return {
    public: isPaper
      ? 'wss://stream-testnet.bybit.com/v5/public/linear'
      : 'wss://stream.bybit.com/v5/public/linear',
    private: isPaper
      ? 'wss://stream-testnet.bybit.com/v5/private'
      : 'wss://stream.bybit.com/v5/private',
  };
}

function toBybitTopicSymbol(uiPair: string) {
  return uiPair.replace('/', ''); // BTC/USDT -> BTCUSDT
}

function nowMs() { return Date.now(); }

function authPayloadV5A(key: string, secret: string) {
  // Bybit v5 WS private auth: sign = HMAC_SHA256(secret, "GET/realtime" + expires)
  const expires = (nowMs() + 1000).toString(); // expires in 1 second
  const sign = crypto.createHmac('sha256', secret).update(`GET/realtime${expires}`).digest('hex');
  console.log(`[bybit][auth] Generated signature with expires=${expires}`);
  return { op: 'auth', args: [key, expires, sign] };
}

function authPayloadV5B(key: string, secret: string, recvWindow = '5000') {
  // Alt auth method: just use current timestamp
  const expires = nowMs().toString();
  const sign = crypto.createHmac('sha256', secret).update(`GET/realtime${expires}`).digest('hex');
  console.log(`[bybit][auth] Alt method with expires=${expires}`);
  return { op: 'auth', args: [key, expires, sign] };
}

class BybitWsManager {
  publicConn: ConnPair | null = null;
  privateConn: ConnPair | null = null;
  privateCreds: { key: string; secret: string } | null = null;
  mode: TradingMode = 'paper';
  subscribedSymbols: Set<string> = new Set();
  triedAltAuth = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  getStatus() {
    const urls = endpoints(this.mode);
    return {
      mode: this.mode,
      urls,
      publicConnected: !!this.publicConn?.connected,
      privateConnected: !!this.privateConn?.connected,
      subscribedSymbols: Array.from(this.subscribedSymbols),
    };
  }

  start(mode: TradingMode) {
    console.log(`[bybit] start() called with mode=${mode}`);
    this.mode = mode;
    const { public: pubUrl } = endpoints(mode);
    if (!this.publicConn || this.publicConn.url !== pubUrl) {
      console.log(`[bybit] Creating new public connection to ${pubUrl}`);
      this.publicConn?.ws?.close();
      this.publicConn = { url: pubUrl, connected: false };
      this.connectPublic();
    } else {
      console.log(`[bybit] Public connection already exists, connected=${this.publicConn.connected}`);
    }
  }

  connectPublic() {
    if (!this.publicConn) return;
    console.log('[bybit][public] Connecting to:', this.publicConn.url);
    const ws = new WebSocket(this.publicConn.url);
    this.publicConn.ws = ws;

    ws.on('open', () => {
      this.publicConn!.connected = true;
      console.log('[bybit][public] Connected successfully');
      // Announce status
      try { realtimeBus.emit('event', { type: 'status', scope: 'public', url: this.publicConn!.url, connected: true }); } catch {}
      // Resubscribe topics
      if (this.subscribedSymbols.size > 0) {
        const args = Array.from(this.subscribedSymbols).map((s) => `tickers.${toBybitTopicSymbol(s)}`);
        console.log('[bybit][public] Subscribing to:', args);
        ws.send(JSON.stringify({ op: 'subscribe', args }));
      }
    });

    ws.on('message', (data: RawData) => {
      try {
        const msg = JSON.parse(data.toString());
        // Only log non-ticker messages
        if (!msg?.topic?.startsWith('tickers.')) {
          console.log('[bybit][public] Message received:', JSON.stringify(msg).substring(0, 200));
        }
        // Public ticker format: { topic: 'tickers.BTCUSDT', data: { lastPrice: '...', price24hPcnt: '...' } }
        if (msg?.topic?.startsWith('tickers.')) {
          const topicSymbol = msg.topic.split('.')[1];
          const uiPair = topicSymbol.endsWith('USDT') ? `${topicSymbol.replace('USDT', '')}/USDT` : topicSymbol;
          const last = parseFloat(String(msg?.data?.lastPrice ?? ''));
          const changePcnt = parseFloat(String(msg?.data?.price24hPcnt ?? '0')) * 100; // convert to percent
          if (!Number.isNaN(last)) {
            // Log ticker updates more frequently for debugging (20% of the time)
            if (Math.random() < 0.2) console.log(`[bybit][ticker] ${uiPair}: $${last} (${changePcnt.toFixed(2)}%)`);
            realtimeBus.emit('event', {
              type: 'ticker',
              symbol: uiPair,
              price: last,
              change24h: Number.isNaN(changePcnt) ? 0 : changePcnt,
            });
          }
        } else if (msg?.op === 'subscribe' && msg?.success) {
          console.log('[bybit][public] Subscription confirmed');
        }
      } catch {}
    });

    ws.on('close', () => {
      this.publicConn!.connected = false;
      console.log('[bybit][public] Connection closed, reconnecting in 1s');
      try { realtimeBus.emit('event', { type: 'status', scope: 'public', url: this.publicConn!.url, connected: false }); } catch {}
      // Simple retry
      setTimeout(() => this.connectPublic(), 1000);
    });

    ws.on('error', (err) => {
      console.error('[bybit][public] WebSocket error:', err.message);
      try { ws.close(); } catch {}
    });
  }

  async subscribeTickers(uiPairs: string[]) {
    console.log(`[bybit] subscribeTickers called with ${uiPairs.length} pairs: ${uiPairs.join(', ')}`);
    this.start(this.mode);
    uiPairs.forEach((s) => this.subscribedSymbols.add(s));
    if (this.publicConn?.connected && this.publicConn.ws && this.publicConn.ws.readyState === WebSocket.OPEN) {
      const args = uiPairs.map((s) => `tickers.${toBybitTopicSymbol(s)}`);
      console.log(`[bybit] Sending subscription for ${args.length} tickers`);
      this.publicConn.ws.send(JSON.stringify({ op: 'subscribe', args }));
    } else {
      console.log(`[bybit] WebSocket not ready yet (connected=${this.publicConn?.connected}, readyState=${this.publicConn?.ws?.readyState})`);
    }
  }

  startPrivate(mode: TradingMode, key: string, secret: string): void {
    console.log(`[bybit][private] startPrivate called with mode=${mode}`);
    this.mode = mode;
    this.privateCreds = { key, secret };
    const { private: privUrl } = endpoints(mode);
    
    // Clear any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Close existing connection
    this.privateConn?.ws?.close();
    this.privateConn = { url: privUrl, connected: false };

    console.log(`[bybit][private] Connecting to: ${privUrl}`);
    const ws = new WebSocket(privUrl);
    this.privateConn.ws = ws;

    ws.on('open', () => {
      console.log('[bybit][private] WebSocket opened, sending auth');
      this.triedAltAuth = false;
      // First try V5A
      ws.send(JSON.stringify(authPayloadV5A(key, secret)));
      // Also try alt auth shortly after if we don't get ack
      setTimeout(() => {
        if (!this.privateConn?.connected && !this.triedAltAuth) {
          console.log('[bybit][private] Trying alternate auth method');
          try { ws.send(JSON.stringify(authPayloadV5B(key, secret))); this.triedAltAuth = true; } catch {}
        }
      }, 800);
      // Defensive subscribe attempt
      setTimeout(() => {
        console.log('[bybit][private] Sending defensive subscription');
        try { ws.send(JSON.stringify({ op: 'subscribe', args: ['position', 'order', 'wallet'] })); } catch {}
      }, 1200);
    });

    ws.on('message', (raw: RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        // Auth ACK (support multiple possible formats)
        const isAuthAck = msg?.op === 'auth' || String(msg?.type || '').toLowerCase().includes('auth') || msg?.req_id === 'auth';
        const authOk = msg?.success === true || msg?.ret_msg === 'OK' || msg?.code === 0 || msg?.retCode === 0;
        if (isAuthAck) {
          if (authOk) {
            console.log('[bybit][private] Auth successful! Subscribing to position/order/wallet streams');
            this.privateConn!.connected = true;
            try { ws.send(JSON.stringify({ op: 'subscribe', args: ['position', 'order', 'wallet'] })); } catch {}
            try { realtimeBus.emit('event', { type: 'status', scope: 'private', url: this.privateConn!.url, connected: true }); } catch {}
            realtimeBus.emit('event', { type: 'ready', scope: 'private' });
          } else {
            console.error('[bybit][private] Auth failed:', JSON.stringify(msg));
            // Try alternate auth once if we haven't
            if (!this.triedAltAuth && this.privateCreds) {
              this.triedAltAuth = true;
              console.log('[bybit][private] Retrying with alternate auth');
              try { ws.send(JSON.stringify(authPayloadV5B(this.privateCreds.key, this.privateCreds.secret))); } catch {}
            } else {
              console.error('[bybit][private] All auth methods failed');
              realtimeBus.emit('event', { type: 'error', scope: 'private', message: 'Bybit WS auth failed', raw: msg });
            }
          }
          return;
        }
        const topic: string | undefined = msg?.topic;
        // Position updates (topic can be 'position')
        if (typeof topic === 'string' && topic.startsWith('position')) {
          const list = Array.isArray(msg?.data) ? msg.data : [];
          console.log(`[bybit][private] Position update received, ${list.length} positions`);
          list.forEach((p: any) => {
            const sym = String(p.symbol || '');
            if (!sym) return;
            const uiPair = sym.endsWith('USDT') ? sym.replace('USDT', '/USDT') : sym;
            // Only consider true position size fields; do NOT use qty (order size)
            const size = Number(p.size ?? p.positionQty ?? p.pos ?? 0);
            const entryPrice = Number(p.avgPrice ?? p.entryPrice ?? p.avgEntryPrice ?? 0);
            const normalizedSize = Math.abs(isNaN(size) ? 0 : size);
            let side = (p.side?.toLowerCase?.()) as 'buy' | 'sell' | undefined;
            if (!side && normalizedSize > 0) side = size > 0 ? 'buy' : 'sell';
            console.log(`[bybit][private] Position: ${uiPair} ${side} ${normalizedSize} @ ${entryPrice}`);
            // Emit only normalized size and entry; UI will ignore if size === 0
            realtimeBus.emit('event', {
              type: 'position',
              symbol: uiPair,
              size: normalizedSize,
              side,
              entryPrice: isNaN(entryPrice) ? 0 : entryPrice,
            });
          });
        }
        // Wallet updates
        if (typeof topic === 'string' && topic.startsWith('wallet')) {
          const list = Array.isArray(msg?.data) ? msg.data : [];
          // Optional debug log of raw wallet payload (totals + USDT coin)
          if (DEBUG_WALLET) {
            const totals = list[0] || {};
            const usdtRow = list.find((w: any) => (w.coin || w.asset) === 'USDT');
            console.log('[bybit][wallet]', {
              totals: {
                totalEquity: totals.totalEquity,
                totalWalletBalance: totals.totalWalletBalance,
                totalMarginBalance: totals.totalMarginBalance,
                totalAvailableBalance: totals.totalAvailableBalance,
              },
              usdt: usdtRow ? {
                coin: usdtRow.coin || usdtRow.asset,
                walletBalance: usdtRow.walletBalance,
                marginBalance: usdtRow.marginBalance,
                equity: usdtRow.equity,
                availableBalance: usdtRow.availableBalance,
                availableToWithdraw: usdtRow.availableToWithdraw,
              } : null,
              at: new Date().toISOString(),
              mode: this.mode,
            });
          }
          // Prefer coin-level USDT first
          const usdt = list.find((w: any) => (w.coin || w.asset) === 'USDT');
          let margin: number | undefined = usdt ? parseFloat(String(usdt.marginBalance ?? '').trim()) : undefined;
          let available: number | undefined = usdt ? parseFloat(String((usdt.availableBalance ?? usdt.availableToWithdraw) ?? '').trim()) : undefined;
          // Fallback to Unified totals if coin-level missing
          if ((margin === undefined || isNaN(margin)) || (available === undefined || isNaN(available))) {
            if (list.length > 0) {
              const row = list[0] || {};
              if (margin === undefined || isNaN(margin)) margin = parseFloat(String(row.totalMarginBalance ?? '').trim());
              if (available === undefined || isNaN(available)) available = parseFloat(String(row.totalAvailableBalance ?? '').trim());
            }
          }
          if (typeof margin === 'number' && !isNaN(margin)) {
            realtimeBus.emit('event', { type: 'balance', currency: 'USDT', margin, available: typeof available === 'number' && !isNaN(available) ? available : margin });
          }
        }
        // Order updates (topic can be 'order' or 'order.linear')
        if (typeof topic === 'string' && topic.startsWith('order')) {
          const list = Array.isArray(msg?.data) ? msg.data : [];
          console.log(`[bybit][private] Order update received, ${list.length} orders`);
          list.forEach((o: any) => {
            const sym = String(o.symbol || '');
            const uiPair = sym.endsWith('USDT') ? sym.replace('USDT', '/USDT') : sym;
            const orderId = String(o.orderId || o.orderID || '');
            const status = String(o.orderStatus || o.status || '').toLowerCase();
            const side = String(o.side || '').toLowerCase();
            const price = Number(o.price || o.orderPrice || 0);
            const qty = Number(o.qty || o.orderQty || 0);
            console.log(`[bybit][private] Order: ${orderId} ${uiPair} ${side} ${status} @ ${price}`);
            realtimeBus.emit('event', {
              type: 'order',
              symbol: uiPair,
              orderId,
              status, // e.g., 'created','new','partiallyfilled','filled','cancelled','rejected'
              side,
              price,
              size: qty,
            });
          });
        }
      } catch {}
    });

    ws.on('close', (code) => {
      console.log(`[bybit][private] Connection closed with code ${code}`);
      try { realtimeBus.emit('event', { type: 'status', scope: 'private', url: this.privateConn?.url, connected: false }); } catch {}
      // Only reconnect if we have valid credentials and were previously authenticated
      // Don't spam reconnect on auth failures
      if (this.privateConn?.connected && this.privateCreds && !this.reconnectTimeout) {
        console.log('[bybit][private] Reconnecting in 5s...');
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = null;
          this.startPrivate(this.mode, this.privateCreds?.key || '', this.privateCreds?.secret || '');
        }, 5000);
      } else {
        console.log('[bybit][private] Not reconnecting (was never authenticated or no credentials)');
      }
    });

    ws.on('error', () => {
      try { ws.close(); } catch {}
    });
  }
}

export const bybitWsManager = new BybitWsManager();
