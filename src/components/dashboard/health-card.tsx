"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function fmtAgo(ts?: number) {
  if (!ts) return "–";
  const d = Date.now() - ts;
  if (d < 1000) return "now";
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function Status({ label, ts, warnMs = 10000 }: { label: string; ts?: number; warnMs?: number }) {
  const age = ts ? Date.now() - ts : Infinity;
  const color = !ts ? "text-muted-foreground" : age < warnMs ? "text-green-400" : "text-red-400";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${color}`}>{fmtAgo(ts)}</span>
    </div>
  );
}

export interface HealthState {
  lastTicker?: number;
  lastOrder?: number;
  lastPosition?: number;
  lastBalance?: number;
  lastPing?: number;
}

export function HealthCard({ health, mode }: { health: HealthState; mode: 'paper' | 'live' }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-headline">Realtime Health</CardTitle>
        <CardDescription>Bybit {mode === 'live' ? 'Mainnet' : 'Testnet'} streams</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Status label="Ticker (public WS)" ts={health.lastTicker} />
        <Status label="Orders (private WS)" ts={health.lastOrder} />
        <Status label="Positions (private WS)" ts={health.lastPosition} />
        <Status label="Wallet/Available (private WS)" ts={health.lastBalance} />
        <Separator className="my-1" />
        <Status label="SSE heartbeat" ts={health.lastPing} warnMs={30000} />
      </CardContent>
    </Card>
  );
}
