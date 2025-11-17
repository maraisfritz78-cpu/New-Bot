import { NextRequest, NextResponse } from 'next/server';
import { logOpportunity, initDatabase } from '@/lib/database';

export const dynamic = 'force-dynamic';

/**
 * POST /api/liquidations/log
 * Log a liquidation opportunity to the database
 */
export async function POST(request: NextRequest) {
  try {
    initDatabase();
    
    const body = await request.json();
    const { timestamp, symbol, side, volumeUSDT, liquidationPrice, currentPrice } = body;

    if (!timestamp || !symbol || !side || liquidationPrice === undefined || currentPrice === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    logOpportunity({
      timestamp,
      symbol,
      side,
      volumeUSDT: volumeUSDT || 0,
      liquidationPrice,
      currentPrice,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Liquidations] Log error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
