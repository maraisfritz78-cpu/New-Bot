/**
 * Database Service - SQLite for storing liquidation opportunities
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

/**
 * Initialize database connection
 */
export function initDatabase() {
  if (db) return db;

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'liquidations.db');
  db = new Database(dbPath);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS liquidations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      volume_usdt REAL NOT NULL,
      liquidation_price REAL NOT NULL,
      current_price REAL NOT NULL,
      executed INTEGER DEFAULT 0,
      entry_price REAL,
      exit_price REAL,
      exit_reason TEXT,
      pnl REAL,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_liquidations_symbol ON liquidations(symbol);
    CREATE INDEX IF NOT EXISTS idx_liquidations_timestamp ON liquidations(timestamp);
    CREATE INDEX IF NOT EXISTS idx_liquidations_side ON liquidations(side);
  `);

  console.log('[Database] Initialized at', dbPath);
  return db;
}

/**
 * Get database instance
 */
export function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Log a liquidation opportunity
 */
export interface LiquidationOpportunity {
  timestamp: number;
  symbol: string;
  side: 'long' | 'short';
  volumeUSDT: number;
  liquidationPrice: number;
  currentPrice: number;
}

export function logOpportunity(opp: LiquidationOpportunity) {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT INTO liquidations (timestamp, symbol, side, volume_usdt, liquidation_price, current_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    opp.timestamp,
    opp.symbol,
    opp.side,
    opp.volumeUSDT,
    opp.liquidationPrice,
    opp.currentPrice
  );
}

/**
 * Mark opportunity as executed and log outcome
 */
export function logTradeOutcome(
  timestamp: number,
  symbol: string,
  entryPrice: number,
  exitPrice: number,
  exitReason: string,
  pnl: number
) {
  const database = getDatabase();
  const stmt = database.prepare(`
    UPDATE liquidations
    SET executed = 1, entry_price = ?, exit_price = ?, exit_reason = ?, pnl = ?
    WHERE timestamp = ? AND symbol = ? AND executed = 0
    ORDER BY id DESC
    LIMIT 1
  `);

  stmt.run(exitPrice, exitPrice, exitReason, pnl, timestamp, symbol);
}

/**
 * Get all liquidations for a symbol
 */
export function getLiquidations(symbol: string, daysBack: number = 30) {
  const database = getDatabase();
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;

  const stmt = database.prepare(`
    SELECT * FROM liquidations
    WHERE symbol = ? AND timestamp > ?
    ORDER BY timestamp DESC
  `);

  return stmt.all(symbol, cutoff);
}

/**
 * Get liquidation statistics
 */
export function getLiquidationStats() {
  const database = getDatabase();

  const stats = database.prepare(`
    SELECT
      COUNT(*) as total_opportunities,
      COUNT(CASE WHEN executed = 1 THEN 1 END) as executed_trades,
      SUM(CASE WHEN executed = 1 THEN pnl ELSE 0 END) as total_pnl,
      AVG(CASE WHEN executed = 1 THEN pnl ELSE NULL END) as avg_pnl,
      COUNT(CASE WHEN executed = 1 AND pnl > 0 THEN 1 END) as winning_trades,
      COUNT(CASE WHEN executed = 1 AND pnl <= 0 THEN 1 END) as losing_trades,
      MIN(timestamp) as first_timestamp,
      MAX(timestamp) as last_timestamp
    FROM liquidations
  `).get();

  return stats;
}

/**
 * Get data coverage for a symbol
 */
export function getSymbolCoverage(symbol: string) {
  const database = getDatabase();

  const coverage = database.prepare(`
    SELECT
      COUNT(*) as total_events,
      MIN(timestamp) as first_time,
      MAX(timestamp) as last_time,
      MIN(current_price) as min_price,
      MAX(current_price) as max_price
    FROM liquidations
    WHERE symbol = ?
  `).get(symbol);

  return coverage;
}

/**
 * Get database statistics (formatted for optimizer API)
 */
export interface DatabaseStats {
  totalOpportunities: number;
  executedTrades: number;
  totalPnL: number;
  avgPnL: number;
  winRate: string;
  dataCollectionStarted: string | null;
  lastUpdate: string | null;
}

export function getStats(): DatabaseStats {
  const database = getDatabase();
  
  try {
    const stats = getLiquidationStats() as any;
    
    const totalOpportunities = stats.total_opportunities || 0;
    const executedTrades = stats.executed_trades || 0;
    const totalPnL = stats.total_pnl || 0;
    const avgPnL = stats.avg_pnl || 0;
    
    const winRate = executedTrades > 0 
      ? ((stats.winning_trades / executedTrades) * 100).toFixed(1)
      : '0.0';
    
    const dataCollectionStarted = stats.first_timestamp 
      ? new Date(stats.first_timestamp).toISOString() 
      : null;
    
    const lastUpdate = stats.last_timestamp 
      ? new Date(stats.last_timestamp).toISOString() 
      : null;
    
    return {
      totalOpportunities,
      executedTrades,
      totalPnL,
      avgPnL,
      winRate,
      dataCollectionStarted,
      lastUpdate,
    };
  } catch (error) {
    console.error('[Database] Error getting stats:', error);
    return {
      totalOpportunities: 0,
      executedTrades: 0,
      totalPnL: 0,
      avgPnL: 0,
      winRate: '0.0',
      dataCollectionStarted: null,
      lastUpdate: null,
    };
  }
}

/**
 * Get count of liquidations by symbol and side
 */
export function getSymbolSideCounts(): Record<string, { long: number; short: number }> {
  const database = getDatabase();
  
  try {
    const results = database.prepare(`
      SELECT symbol, side, COUNT(*) as count 
      FROM liquidations 
      GROUP BY symbol, side
    `).all() as { symbol: string; side: string; count: number }[];

    const counts: Record<string, { long: number; short: number }> = {};
    
    for (const row of results) {
      if (!counts[row.symbol]) {
        counts[row.symbol] = { long: 0, short: 0 };
      }
      if (row.side === 'long') {
        counts[row.symbol].long = row.count;
      } else if (row.side === 'short') {
        counts[row.symbol].short = row.count;
      }
    }

    return counts;
  } catch (error) {
    console.error('[Database] Error getting symbol/side counts:', error);
    return {};
  }
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
