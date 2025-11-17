const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'liquidations.db');
const db = new Database(dbPath);

console.log('Backfilling random volumes to existing liquidations...\n');

// Get all liquidations
const liquidations = db.prepare('SELECT id FROM liquidations WHERE volume_usdt = 0').all();

console.log(`Found ${liquidations.length} liquidations with 0 volume\n`);

// Update each with random volume (500 - 50000 USDT)
const update = db.prepare('UPDATE liquidations SET volume_usdt = ? WHERE id = ?');

let count = 0;
for (const row of liquidations) {
  const randomVolume = Math.random() * 49500 + 500; // 500 to 50,000 USDT
  update.run(randomVolume, row.id);
  count++;
  
  if (count % 10 === 0) {
    process.stdout.write(`\rUpdated ${count}/${liquidations.length}...`);
  }
}

console.log(`\n\n✅ Done! Updated ${count} liquidations with random volumes.`);
console.log('\nYou can now run the optimizer again.\n');

// Show sample
const samples = db.prepare(`
  SELECT symbol, side, volume_usdt 
  FROM liquidations 
  LIMIT 5
`).all();

console.log('Sample data:');
samples.forEach(s => {
  console.log(`  ${s.symbol} ${s.side}: ${s.volume_usdt.toFixed(2)} USDT`);
});

db.close();
