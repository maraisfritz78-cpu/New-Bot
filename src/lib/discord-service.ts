
'use client';

import type { Trade, OpenPosition, PendingOrder, TradingMode } from './types';

/**
 * Sends a notification to a Discord webhook.
 * @param webhookUrl The Discord webhook URL.
 * @param embed The embed object to send.
 */
async function sendDiscordWebhook(webhookUrl: string, embed: any) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed],
      }),
    });
    if (!response.ok) {
      console.error(`Discord webhook failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending Discord notification:', error);
  }
}

export async function sendBotStatusNotification(status: 'started' | 'stopped', mode: TradingMode, webhookUrl: string, balance?: number) {
  const isStart = status === 'started';
  const embed = {
    title: `${isStart ? '✅ Bot Started' : '⏹️ Bot Stopped'}`,
    description: `Mode: ${mode === 'live' ? 'Live (Mainnet)' : 'Paper (Testnet)'}${typeof balance === 'number' ? `\nBalance: $${balance.toFixed(2)} USDT` : ''}`,
    color: isStart ? 3066993 : 15158332,
    timestamp: new Date().toISOString(),
  };
  await sendDiscordWebhook(webhookUrl, embed);
}

/**
 * Formats and sends a notification for a newly opened position.
 */
export function sendPositionNotification(position: OpenPosition, webhookUrl: string) {
  const embed = {
    title: `✅ New Position Opened: ${position.action.toUpperCase()} ${position.pair}`,
    color: position.action === 'buy' ? 3066993 : 15158332, // Green for buy, Red for sell
    fields: [
      { name: 'Pair', value: position.pair, inline: true },
      { name: 'Side', value: position.action.toUpperCase(), inline: true },
      { name: 'Size', value: position.size.toString(), inline: true },
      { name: 'Entry Price', value: `$${position.entryPrice.toFixed(4)}`, inline: true },
      { name: 'Leverage', value: `${position.leverage}x`, inline: true },
      { name: 'Take Profit', value: `$${position.tp.toFixed(4)}`, inline: true },
      { name: 'Stop Loss', value: `$${position.sl.toFixed(4)}`, inline: true },
    ],
    timestamp: new Date().toISOString(),
  };
  sendDiscordWebhook(webhookUrl, embed);
}

/**
 * Formats and sends a notification for a newly placed limit order.
 */
export function sendOrderNotification(order: PendingOrder, webhookUrl: string) {
    const embed = {
        title: `⏳ New Limit Order Placed: ${order.type.toUpperCase()} ${order.pair}`,
        color: 15105570, // Yellow
        fields: [
            { name: 'Pair', value: order.pair, inline: true },
            { name: 'Type', value: order.type.toUpperCase(), inline: true },
            { name: 'Size', value: order.size.toString(), inline: true },
            { name: 'Price', value: `$${order.price.toFixed(4)}`, inline: true },
        ],
        timestamp: new Date().toISOString(),
    };
    sendDiscordWebhook(webhookUrl, embed);
}


/**
 * Formats and sends a notification for a closed trade.
 */
export function sendTradeNotification(trade: Trade, webhookUrl: string) {
  const isProfit = trade.pnl >= 0;
  const embed = {
    title: `${isProfit ? '💰' : '🔻'} Trade Closed: ${trade.action.toUpperCase()} ${trade.pair}`,
    description: `**Reason:** ${trade.exitReason}`,
    color: isProfit ? 3066993 : 15158332,
    fields: [
      { name: 'Pair', value: trade.pair, inline: true },
      { name: 'Side', value: trade.action.toUpperCase(), inline: true },
      { name: 'Size', value: trade.size.toString(), inline: true },
      { name: 'Entry Price', value: `$${trade.entryPrice.toFixed(4)}`, inline: true },
      { name: 'Exit Price', value: `$${trade.exitPrice.toFixed(4)}`, inline: true },
      { name: 'PnL', value: `${isProfit ? '+' : ''}$${trade.pnl.toFixed(2)}`, inline: true },
    ],
    timestamp: new Date(trade.timestamp).toISOString(),
  };
  sendDiscordWebhook(webhookUrl, embed);
}
