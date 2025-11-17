const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'liquidations.db');
const db = new Database(dbPath, { readonly: true });

console.log('='.repeat(80));
console.log('OPTIMIZER BEHAVIOR ANALYSIS - ASTER/USDT');
console.log('='.repeat(80));

// Get ASTER data
const symbol = 'ASTER/USDT';

const longVols = db.prepare('SELECT volume_usdt FROM liquidations WHERE symbol = ? AND side = ?').all(symbol, 'long');
const shortVols = db.prepare('SELECT volume_usdt FROM liquidations WHERE symbol = ? AND side = ?').all(symbol, 'short');

console.log(`\n${symbol} Data:`);
console.log(`  Long liquidations: ${longVols.length}`);
console.log(`  Short liquidations: ${shortVols.length}`);

if (longVols.length === 0 || shortVols.length === 0) {
  console.log('\n⚠️  Insufficient data for this symbol!');
  db.close();
  process.exit(0);
}

// Calculate percentiles
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * p);
  return sorted[Math.min(index, sorted.length - 1)];
}

const longVolumes = longVols.map(r => r.volume_usdt);
const shortVolumes = shortVols.map(r => r.volume_usdt);

console.log('\n--- Long Volume Distribution ---');
console.log(`  Min: ${Math.min(...longVolumes).toFixed(2)}`);
console.log(`  50th percentile: ${percentile(longVolumes, 0.5).toFixed(2)}`);
console.log(`  70th percentile: ${percentile(longVolumes, 0.7).toFixed(2)}`);
console.log(`  85th percentile: ${percentile(longVolumes, 0.85).toFixed(2)}`);
console.log(`  95th percentile: ${percentile(longVolumes, 0.95).toFixed(2)}`);
console.log(`  Max: ${Math.max(...longVolumes).toFixed(2)}`);

console.log('\n--- Short Volume Distribution ---');
console.log(`  Min: ${Math.min(...shortVolumes).toFixed(2)}`);
console.log(`  50th percentile: ${percentile(shortVolumes, 0.5).toFixed(2)}`);
console.log(`  70th percentile: ${percentile(shortVolumes, 0.7).toFixed(2)}`);
console.log(`  85th percentile: ${percentile(shortVolumes, 0.85).toFixed(2)}`);
console.log(`  95th percentile: ${percentile(shortVolumes, 0.95).toFixed(2)}`);
console.log(`  Max: ${Math.max(...shortVolumes).toFixed(2)}`);

// Current strategy thresholds
const currentLongThreshold = 5000;
const currentShortThreshold = 10000;

console.log('\n--- Current Strategy Thresholds ---');
console.log(`  Long: ${currentLongThreshold}`);
console.log(`  Short: ${currentShortThreshold}`);

// Test how many events pass each threshold
const testThresholds = [
  { name: 'Current Long', threshold: currentLongThreshold, side: 'long' },
  { name: '50th %ile Long', threshold: percentile(longVolumes, 0.5), side: 'long' },
  { name: '70th %ile Long', threshold: percentile(longVolumes, 0.7), side: 'long' },
  { name: '85th %ile Long', threshold: percentile(longVolumes, 0.85), side: 'long' },
  { name: 'Current Short', threshold: currentShortThreshold, side: 'short' },
  { name: '50th %ile Short', threshold: percentile(shortVolumes, 0.5), side: 'short' },
  { name: '70th %ile Short', threshold: percentile(shortVolumes, 0.7), side: 'short' },
  { name: '85th %ile Short', threshold: percentile(shortVolumes, 0.85), side: 'short' },
];

console.log('\n--- Events Passing Each Threshold ---');
testThresholds.forEach(t => {
  const count = db.prepare(`
    SELECT COUNT(*) as count 
    FROM liquidations 
    WHERE symbol = ? AND side = ? AND volume_usdt >= ?
  `).get(symbol, t.side, t.threshold);
  
  console.log(`  ${t.name.padEnd(20)}: ${t.threshold.toFixed(0).padStart(6)} → ${count.count} events pass`);
});

// Check if current threshold eliminates ALL events
const longPassing = db.prepare('SELECT COUNT(*) as count FROM liquidations WHERE symbol = ? AND side = ? AND volume_usdt >= ?').get(symbol, 'long', currentLongThreshold);
const shortPassing = db.prepare('SELECT COUNT(*) as count FROM liquidations WHERE symbol = ? AND side = ? AND volume_usdt >= ?').get(symbol, 'short', currentShortThreshold);

console.log('\n--- Problem Analysis ---');
if (longPassing.count === 0) {
  console.log('⚠️  PROBLEM: Current long threshold (5000) filters out ALL long events!');
  console.log('   Backtest will show 0 trades for any threshold >= 5000');
}
if (shortPassing.count === 0) {
  console.log('⚠️  PROBLEM: Current short threshold (10000) filters out ALL short events!');
  console.log('   Backtest will show 0 trades for any threshold >= 10000');
}

if (longPassing.count > 0 && shortPassing.count > 0) {
  console.log('✓ Current thresholds allow some events through');
  console.log('  The optimizer may have found these settings are already optimal');
  console.log('  OR need more diverse threshold testing');
}

db.close();

console.log('\n' + '='.repeat(80));
console.log('RECOMMENDATION:');
console.log('='.repeat(80));
console.log('1. If thresholds filter ALL events: Lower them in strategy settings');
console.log('2. If only a few events pass: Collect more data (100+ events per symbol)');
console.log('3. If many events pass: Optimizer needs to test MORE threshold candidates');
console.log('='.repeat(80));
