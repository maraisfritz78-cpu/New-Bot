const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'liquidations.db');
const db = new Database(dbPath, { readonly: true });

console.log('='.repeat(80));
console.log('OPTIMIZER DATA VERIFICATION');
console.log('='.repeat(80));

try {
  // Total liquidations
  const total = db.prepare('SELECT COUNT(*) as count FROM liquidations').get();
  console.log(`\nTotal liquidations recorded: ${total.count}`);

  // Per symbol counts
  const perSymbol = db.prepare(`
    SELECT symbol, 
           COUNT(*) as total,
           SUM(CASE WHEN side = 'long' THEN 1 ELSE 0 END) as longs,
           SUM(CASE WHEN side = 'short' THEN 1 ELSE 0 END) as shorts
    FROM liquidations 
    GROUP BY symbol
  `).all();

  console.log('\nPer-Symbol Breakdown:');
  console.log('-'.repeat(80));
  perSymbol.forEach(row => {
    console.log(`  ${row.symbol.padEnd(15)} | Total: ${String(row.total).padStart(4)} | Long: ${String(row.longs).padStart(4)} | Short: ${String(row.shorts).padStart(4)}`);
  });

  // Optimizer readiness
  console.log('\n' + '='.repeat(80));
  if (total.count >= 50) {
    console.log('✅ READY: You have enough data to run the optimizer!');
    console.log(`   Total events: ${total.count} (minimum: 50)`);
  } else {
    console.log('⏳ NOT READY: Need more data before running optimizer');
    console.log(`   Current: ${total.count} events | Required: 50 events | Need: ${50 - total.count} more`);
  }

  // Symbols with insufficient data
  const insufficientSymbols = perSymbol.filter(s => s.longs < 10 || s.shorts < 10);
  if (insufficientSymbols.length > 0) {
    console.log('\n⚠️  Symbols with insufficient data (need 10+ per side):');
    insufficientSymbols.forEach(s => {
      console.log(`   ${s.symbol}: ${s.longs} longs, ${s.shorts} shorts`);
    });
  }

  console.log('='.repeat(80));

} catch (error) {
  console.error('Error:', error.message);
} finally {
  db.close();
}
