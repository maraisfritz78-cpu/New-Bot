const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'liquidations.db');
const db = new Database(dbPath, { readonly: true });

console.log('='.repeat(80));
console.log('OPTIMIZER DEBUG - DATABASE CONTENTS');
console.log('='.repeat(80));

// Check total count
const total = db.prepare('SELECT COUNT(*) as count FROM liquidations').get();
console.log(`\nTotal liquidations logged: ${total.count}`);

// Check per symbol/side
console.log('\n--- Per Symbol/Side Counts ---');
const perSymbol = db.prepare(`
  SELECT symbol, side, COUNT(*) as count, 
         MIN(volume_usdt) as min_vol, MAX(volume_usdt) as max_vol
  FROM liquidations 
  GROUP BY symbol, side
  ORDER BY symbol, side
`).all();

perSymbol.forEach(row => {
  console.log(`${row.symbol} ${row.side.padEnd(6)}: ${row.count.toString().padStart(3)} events, vol range: ${row.min_vol} - ${row.max_vol}`);
});

// Check SOL specifically
console.log('\n--- SOL/USDT Sample Data ---');
const solSamples = db.prepare(`
  SELECT timestamp, side, volume_usdt, liquidation_price, current_price
  FROM liquidations 
  WHERE symbol = 'SOL/USDT'
  ORDER BY timestamp DESC
  LIMIT 10
`).all();

if (solSamples.length === 0) {
  console.log('⚠️  No SOL/USDT data found!');
} else {
  solSamples.forEach((row, i) => {
    console.log(`${i + 1}. ${new Date(row.timestamp).toISOString()} ${row.side.padEnd(6)} vol=${row.volume_usdt} liq=${row.liquidation_price} curr=${row.current_price}`);
  });
}

// Check volume distribution for SOL
console.log('\n--- SOL/USDT Volume Distribution ---');
const solLongVols = db.prepare('SELECT volume_usdt FROM liquidations WHERE symbol = ? AND side = ?').all('SOL/USDT', 'long');
const solShortVols = db.prepare('SELECT volume_usdt FROM liquidations WHERE symbol = ? AND side = ?').all('SOL/USDT', 'short');

console.log(`Long volumes (${solLongVols.length}):`, solLongVols.map(r => r.volume_usdt).slice(0, 10));
console.log(`Short volumes (${solShortVols.length}):`, solShortVols.map(r => r.volume_usdt).slice(0, 10));

// Check if all volumes are 0
const allZero = [...solLongVols, ...solShortVols].every(r => r.volume_usdt === 0);
if (allZero) {
  console.log('\n⚠️  WARNING: All volumes are 0! This is the problem.');
  console.log('The mock liquidation data doesnt include volume.');
  console.log('The optimizer needs volume data to test thresholds.');
}

db.close();

console.log('\n' + '='.repeat(80));
console.log('END DEBUG');
console.log('='.repeat(80));
