
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { Trade } from '@/lib/types';

// The path to the file where trades will be stored.
const dataFilePath = path.join(process.cwd(), 'data', 'trade-history.json');
const dataDir = path.dirname(dataFilePath);

/**
 * Handles GET requests to retrieve the trade history.
 */
export async function GET() {
  try {
    // Check if the file exists first.
    await fs.access(dataFilePath);
    const fileContent = await fs.readFile(dataFilePath, 'utf8');
    const trades = JSON.parse(fileContent);
    return NextResponse.json(trades);
  } catch (error) {
    // If the file doesn't exist or there's an error reading it, return an empty array.
    return NextResponse.json([]);
  }
}

/**
 * Handles POST requests to add a new trade to the history.
 */
export async function POST(request: Request) {
  try {
    const newTrade: Trade = await request.json();

    // Validate the new trade object (basic validation)
    if (!newTrade.id || !newTrade.pair || newTrade.pnl === undefined) {
      return NextResponse.json({ message: 'Invalid trade data' }, { status: 400 });
    }

    let trades: Trade[] = [];
    try {
      // Try to read existing trades, but don't fail if the file doesn't exist yet.
      const fileContent = await fs.readFile(dataFilePath, 'utf8');
      trades = JSON.parse(fileContent);
    } catch (error) {
      // File doesn't exist, we'll create it.
    }

    // Add the new trade to the beginning of the array
    trades.unshift(newTrade);

    // Ensure the directory exists before writing the file.
    await fs.mkdir(dataDir, { recursive: true });
    // Write the updated array back to the file
    await fs.writeFile(dataFilePath, JSON.stringify(trades, null, 2), 'utf8');

    return NextResponse.json({ message: 'Trade saved successfully' }, { status: 201 });
  } catch (error) {
    console.error('Failed to save trade:', error);
    return NextResponse.json({ message: 'Error saving trade' }, { status: 500 });
  }
}
