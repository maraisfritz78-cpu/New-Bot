import { NextRequest, NextResponse } from 'next/server';
import { optimizeAllSymbols, optimizeAllSymbolsPhase2, optimizeAllSymbolsPhase3, optimizeAllSymbolsPhase4, SCORING_PRESETS } from '@/lib/optimizer';
import { getLiquidationStats, initDatabase } from '@/lib/database';

export const dynamic = 'force-dynamic';

/**
 * POST /api/optimizer
 * Run data-driven optimization
 * Supports Phase 1, Phase 2, Phase 3 (professional), and Phase 4 (elite)
 */
export async function POST(request: NextRequest) {
  try {
    // Initialize database
    initDatabase();

    const body = await request.json();
    const { symbols, strategy, phase2 = false, phase3 = false, phase4 = false, weights = SCORING_PRESETS.balanced } = body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid symbols array' },
        { status: 400 }
      );
    }

    if (!strategy) {
      return NextResponse.json(
        { error: 'Missing strategy configuration' },
        { status: 400 }
      );
    }

    // Check if we have enough data
    const stats: any = getLiquidationStats();
    
    if (!stats || stats.total_opportunities < 50) {
      return NextResponse.json({
        error: 'Insufficient historical data',
        message: `Need at least 50 liquidation events to optimize. Currently have ${stats?.total_opportunities || 0}. Please run the bot to collect more data.`,
        dataRequired: 50 - (stats?.total_opportunities || 0),
      }, { status: 400 });
    }

    // Run optimization (Phase 1, 2, 3, or 4)
    const optimizerType = phase4 ? 'Phase 4 (Elite)' : phase3 ? 'Phase 3 (Professional)' : phase2 ? 'Phase 2 (Comprehensive)' : 'Phase 1 (Thresholds)';
    console.log(`[Optimizer] Starting ${optimizerType} optimization for ${symbols.length} symbols...`);
    
    const results = phase4
      ? optimizeAllSymbolsPhase4(symbols, strategy, weights)
      : phase3
      ? optimizeAllSymbolsPhase3(symbols, strategy, weights)
      : phase2 
      ? optimizeAllSymbolsPhase2(symbols, strategy)
      : optimizeAllSymbols(symbols, strategy);

    // Calculate summary
    const successful = Object.values(results).filter((r: any) => !r.skipped);
    const totalImprovement = successful.reduce((sum: number, r: any) => sum + (r.improvement || 0), 0);
    const avgImprovement = successful.length > 0 ? totalImprovement / successful.length : 0;
    const totalCombinations = phase4 || phase3 || phase2
      ? successful.reduce((sum: number, r: any) => sum + (r.testedCombinations || 0), 0)
      : successful.length * 16; // Phase 1 tests 4x4 = 16 combinations per symbol

    return NextResponse.json({
      success: true,
      phase2,
      phase3,
      phase4,
      weights: (phase4 || phase3) ? weights : undefined,
      summary: {
        symbolsAnalyzed: successful.length,
        symbolsSkipped: symbols.length - successful.length,
        totalImprovement: totalImprovement.toFixed(2),
        avgImprovement: avgImprovement.toFixed(2),
        dataPoints: stats.total_opportunities,
        testedCombinations: totalCombinations,
      },
      results,
    });
  } catch (error: any) {
    console.error('[Optimizer] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Optimization failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/optimizer
 * Get optimizer stats/status
 */
export async function GET() {
  try {
    initDatabase();
    const stats: any = getLiquidationStats();

    return NextResponse.json({
      ready: stats && stats.total_opportunities >= 50,
      stats: {
        totalOpportunities: stats?.total_opportunities || 0,
        executedTrades: stats?.executed_trades || 0,
        totalPnL: stats?.total_pnl ? parseFloat(stats.total_pnl.toFixed(2)) : 0,
        avgPnL: stats?.avg_pnl ? parseFloat(stats.avg_pnl.toFixed(2)) : 0,
        winRate: stats?.executed_trades > 0
          ? ((stats.winning_trades / stats.executed_trades) * 100).toFixed(1)
          : '0',
        dataCollectionStarted: stats?.first_timestamp
          ? new Date(stats.first_timestamp).toISOString()
          : null,
        lastUpdate: stats?.last_timestamp
          ? new Date(stats.last_timestamp).toISOString()
          : null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
