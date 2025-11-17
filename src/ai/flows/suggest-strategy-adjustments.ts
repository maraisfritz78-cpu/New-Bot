'use server';

/**
 * @fileOverview Uses generative AI to analyze the bot's performance and suggest parameter adjustments for trading strategies.
 *
 * - suggestStrategyAdjustments - A function that suggests strategy adjustments.
 * - SuggestStrategyAdjustmentsInput - The input type for the suggestStrategyAdjustments function.
 * - SuggestStrategyAdjustmentsOutput - The return type for the suggestStrategyAdjustments function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestStrategyAdjustmentsInputSchema = z.object({
  marketData: z.string().describe('The current market data.'),
  botPerformance: z.string().describe('The bot performance data.'),
  currentStrategy: z.string().describe('The current trading strategy, including risk level, order size, price threshold, leverage, volume threshold, take profit %, and stop loss %'),
  tradeHistory: z.string().describe('A JSON string of past trades, including pair, action, size, and PnL.'),
});
export type SuggestStrategyAdjustmentsInput = z.infer<typeof SuggestStrategyAdjustmentsInputSchema>;

const SuggestedParamsSchema = z.object({
  tpPercent: z.number().describe("The suggested Take Profit percentage."),
  slPercent: z.number().describe("The suggested Stop Loss percentage."),
  leverage: z.number().describe("The suggested leverage multiplier (e.g., 5 for 5x)."),
  longVolumeThresholdUSDT: z.number().describe("The suggested minimum liquidation volume in USDT for a long trade."),
  shortVolumeThresholdUSDT: z.number().describe("The suggested minimum liquidation volume in USDT for a short trade."),
}).partial();

const PerSymbolSuggestionItemSchema = z.object({
  symbol: z.string().describe('Symbol like BTC/USDT'),
  humanReadableSuggestion: z.string().describe('A human-readable summary of the suggested adjustments for this specific symbol.'),
  reasoning: z.string().describe('The reasoning behind the suggested adjustments for this symbol.'),
  suggestedParams: SuggestedParamsSchema.describe("The machine-readable suggested strategy parameters for this symbol."),
});

const SuggestStrategyAdjustmentsOutputSchema = z.object({
  overallReasoning: z.string().describe('A high-level summary of the overall strategy adjustments and patterns found across all symbols.'),
  perSymbolSuggestions: z.array(PerSymbolSuggestionItemSchema).describe("List of symbol-specific suggestion items. Only include symbols where an adjustment is recommended."),
  projected7DayPnl: z.number().describe('The projected PnL over 7 days with the new strategy, aggregated across all symbols.'),
  projected30DayPnl: z.number().describe('The projected PnL over 30 days with the new strategy, aggregated across all symbols.'),
  phase2: z.boolean().optional().describe('Whether Phase 2 optimizer was used.'),
  phase3: z.boolean().optional().describe('Whether Phase 3 optimizer was used.'),
  phase4: z.boolean().optional().describe('Whether Phase 4 optimizer was used.'),
});

export type SuggestStrategyAdjustmentsOutput = z.infer<typeof SuggestStrategyAdjustmentsOutputSchema>;

export async function suggestStrategyAdjustments(input: SuggestStrategyAdjustmentsInput): Promise<SuggestStrategyAdjustmentsOutput> {
  return suggestStrategyAdjustmentsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestStrategyAdjustmentsPrompt',
  input: {schema: SuggestStrategyAdjustmentsInputSchema},
  output: {schema: SuggestStrategyAdjustmentsOutputSchema},
  prompt: `You are an expert trading strategy optimizer for a liquidation hunter bot. Your goal is to improve the bot's profitability and win rate by analyzing its past performance on a **per-symbol basis**.

You will perform a "simulated backtest" by analyzing the provided trade history and suggesting parameter changes that would have likely led to better outcomes for each individual symbol.

**Analysis Data:**
- **Market Data:** {{{marketData}}}
- **Overall Performance:** {{{botPerformance}}}
- **Current Strategy (JSON of all symbols):** {{{currentStrategy}}}
- **Recent Trade History (JSON):** {{{tradeHistory}}}

**Your Task:**
1.  **Group and Analyze by Symbol:** Go through the trade history and group trades by their symbol (e.g., all BTC/USDT trades, all ETH/USDT trades, etc.).
2.  **Analyze Each Symbol Independently:** For *each symbol group*, perform a deep analysis. Look for patterns specific to that symbol:
    -   Is the Stop Loss for BTC/USDT too tight, causing frequent small losses?
    -   Is the Take Profit for ETH/USDT consistently missed by a small amount?
    -   Are losses on SOL/USDT concentrated in 'buy' trades?
3.  **Formulate Symbol-Specific Hypotheses:** Based on your analysis for each symbol, form a clear hypothesis. Example: "For BTC/USDT, the analysis shows that 60% of losses were due to stop-losses being triggered on trades that later would have become profitable. This suggests the current Stop Loss % is too tight for BTC's volatility."
4.  **Suggest Concrete Adjustments per Symbol:** Provide specific, actionable adjustments for *each symbol you analyzed*. If a symbol's performance is good and needs no changes, you can omit it from the output.
5.  **Simulate and Project PnL:** Based on your *combined* suggested adjustments across all symbols, calculate the projected Profit and Loss (PnL) over 7-day and 30-day periods. To do this, assume the historical trade opportunities occurred under your *new* symbol-specific strategies. Extrapolate the performance based on the trade frequency and average PnL of the simulated results. Set these values in the output.

**Output Format:**
- **overallReasoning:** Provide a high-level summary of the patterns you observed and your overall approach.
- **perSymbolSuggestions:** An ARRAY. Each item must be an object with the following fields:
    - **symbol:** The symbol string (e.g., "BTC/USDT").
    - **humanReadableSuggestion:** A clear, bulleted list of parameter changes for *that symbol*.
    - **reasoning:** The detailed explanation and hypothesis for *that symbol's* suggestions.
    - **suggestedParams:** A JSON object with only the numeric parameters that you are changing for *that symbol* (e.g., { "slPercent": 3.5, "leverage": 5 }).
- **projected7DayPnl / projected30DayPnl:** Your *aggregated* PnL projections based on the simulated backtest of all suggested changes combined.

Begin your analysis now.`,
});

const suggestStrategyAdjustmentsFlow = ai.defineFlow(
  {
    name: 'suggestStrategyAdjustmentsFlow',
    inputSchema: SuggestStrategyAdjustmentsInputSchema,
    outputSchema: SuggestStrategyAdjustmentsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
