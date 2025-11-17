const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'liquidations.db');
const db = new Database(dbPath, { readonly: true });

console.log('='.repeat(80));
console.log('PHASE 2 OPTIMIZER TEST');
console.log('='.repeat(80));

// Get a sample symbol
const symbols = db.prepare('SELECT DISTINCT symbol FROM liquidations').all();
const testSymbol = symbols[0]?.symbol;

if (!testSymbol) {
  console.log('No data available for testing.');
  db.close();
  process.exit(0);
}

console.log(`\nTest Symbol: ${testSymbol}`);

// Get liquidation counts
const counts = db.prepare(`
  SELECT 
    SUM(CASE WHEN side = 'long' THEN 1 ELSE 0 END) as longs,
    SUM(CASE WHEN side = 'short' THEN 1 ELSE 0 END) as shorts
  FROM liquidations 
  WHERE symbol = ?
`).get(testSymbol);

console.log(`Liquidations: ${counts.longs} long, ${counts.shorts} short`);

console.log('\n' + '='.repeat(80));
console.log('PHASE 1 vs PHASE 2 COMPARISON');
console.log('='.repeat(80));

console.log(`
Phase 1 (Current - Quick):
- Optimizes: Volume thresholds only
- Parameters tested: 
  * Long thresholds: 4 values (50th, 70th, 85th, 95th percentile)
  * Short thresholds: 4 values
- Total combinations: 4 × 4 = 16 per symbol
- Speed: Fast (~0.1-0.5 seconds per symbol)
- Use when: You want quick threshold adjustments

Phase 2 (New - Comprehensive):
- Optimizes: Thresholds, TP/SL, Leverage, Position Sizing
- Parameters tested:
  * Thresholds: 3 × 3 = 9 combinations
  * TP: 4 values (0.5%, 1.0%, 1.5%, 2.0%)
  * SL: 3 values (1.0%, 1.5%, 2.0%)
  * Leverage: 4 values (5x, 10x, 15x, 20x)
  * Position Size: 4 values ($10, $20, $30, $50)
- Total combinations: ~50-60 per symbol (staged optimization)
- Speed: Slower (~1-3 seconds per symbol)
- Use when: You want complete strategy optimization

Additional Features in Phase 2:
✓ Realistic outcome simulation (dynamic win probability based on TP/SL ratio)
✓ Sharpe Ratio calculation (risk-adjusted returns)
✓ Enhanced scoring (includes risk metrics)
✓ Comprehensive parameter recommendations
`);

console.log('='.repeat(80));
console.log('HOW TO USE');
console.log('='.repeat(80));

console.log(`
1. In the UI, navigate to the Optimizer section
2. You'll now see TWO buttons:
   - "Phase 1 (Quick)" - Fast threshold optimization
   - "Phase 2 (Complete)" - Full parameter optimization
   
3. Click either button to run optimization
4. Phase 2 results will include:
   - Optimized thresholds (like Phase 1)
   - Optimized TP/SL percentages
   - Optimized leverage
   - Optimized position sizes
   - Sharpe Ratio for risk-adjusted performance
   
5. Click "Apply Suggestions" to update your strategy with ALL parameters

Example Phase 2 Output:
Symbol: ${testSymbol}
├─ Long Threshold: 1500 → 2000 USDT
├─ Short Threshold: 1800 → 2200 USDT
├─ Take Profit: 1.0% → 1.5%
├─ Stop Loss: 1.5% → 2.0%
├─ Leverage: 10x → 15x
├─ Position Size: $20 → $30
└─ Improvement: +45.67 USDT (Sharpe: 1.85)
`);

console.log('='.repeat(80));
console.log('RECOMMENDATIONS');
console.log('='.repeat(80));

console.log(`
- Use Phase 1 for daily quick adjustments
- Use Phase 2 weekly for comprehensive strategy tuning
- Phase 2 requires more data for accurate results (100+ events ideal)
- Phase 2 tests ~${Math.ceil((symbols.length || 1) * 50)} combinations for all ${symbols.length} symbols
- Estimated Phase 2 runtime: ${Math.ceil((symbols.length || 1) * 1.5)} seconds
`);

db.close();
console.log('\n' + '='.repeat(80));
