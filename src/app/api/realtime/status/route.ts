import { NextRequest } from 'next/server';
import { bybitWsManager } from '@/server/bybit-ws';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const status = bybitWsManager.getStatus();
  return new Response(JSON.stringify(status), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
