import { NextRequest } from 'next/server';
import { bybitWsManager } from '@/server/bybit-ws';
import { realtimeBus } from '@/server/realtime-bus';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';
const revalidate = 0; // Never cache

async function getPingInterval(): Promise<number> {
  try {
    const dataFilePath = path.join(process.cwd(), 'data', 'user-strategy.json');
    const fileContent = await fs.readFile(dataFilePath, 'utf8');
    const strategy = JSON.parse(fileContent);
    if (typeof strategy.ssePingIntervalMs === 'number' && strategy.ssePingIntervalMs >= 5000) {
      console.log(`SSE ping interval: ${strategy.ssePingIntervalMs}ms`);
      return strategy.ssePingIntervalMs;
    }
  } catch (e) {
    console.warn('Failed to load ping interval:', e);
  }
  return 25000; // Default 25 seconds
}

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const pingIntervalMs = await getPingInterval();
  
  console.log(`[SSE] Client connected with ping interval: ${pingIntervalMs}ms`);

  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let onEvent: ((payload: any) => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeSend = (evt: any) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        } catch (e) {
          // Controller closed; stop further sends
          closed = true;
          if (keepAlive) clearInterval(keepAlive);
          if (onEvent) realtimeBus.off('event', onEvent);
        }
      };

      onEvent = (payload: any) => safeSend(payload);
      realtimeBus.on('event', onEvent);

      // Initial hello
      safeSend({ type: 'ready' });

      keepAlive = setInterval(() => {
        safeSend({ type: 'ping', t: Date.now() });
      }, pingIntervalMs);
    },
    cancel() {
      closed = true;
      if (keepAlive) clearInterval(keepAlive);
      if (onEvent) realtimeBus.off('event', onEvent);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
