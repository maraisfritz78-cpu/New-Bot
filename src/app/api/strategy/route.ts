
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { GlobalStrategy } from '@/lib/types';
import { userStrategy as defaultStrategy } from '@/lib/user-config';

const dataFilePath = path.join(process.cwd(), 'data', 'user-strategy.json');
const dataDir = path.dirname(dataFilePath);

/**
 * Handles GET requests to retrieve the user's strategy.
 */
export async function GET() {
  try {
    await fs.access(dataFilePath);
    const fileContent = await fs.readFile(dataFilePath, 'utf8');
    const strategy = JSON.parse(fileContent);
    return NextResponse.json(strategy);
  } catch (error) {
    // If the file doesn't exist, return the default strategy.
    return NextResponse.json(defaultStrategy);
  }
}

/**
 * Handles POST requests to save the user's strategy.
 */
export async function POST(request: Request) {
  try {
    const newStrategy: GlobalStrategy = await request.json();

    // Ensure the directory exists before writing the file.
    await fs.mkdir(dataDir, { recursive: true });
    
    // Write the updated strategy back to the file
    await fs.writeFile(dataFilePath, JSON.stringify(newStrategy, null, 2), 'utf8');

    return NextResponse.json({ message: 'Strategy saved successfully' }, { status: 201 });
  } catch (error) {
    console.error('Failed to save strategy:', error);
    return NextResponse.json({ message: 'Error saving strategy' }, { status: 500 });
  }
}
