
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Wand2, ArrowDownToLine } from "lucide-react";
import { type SuggestStrategyAdjustmentsOutput } from "@/ai/flows/suggest-strategy-adjustments";
import type { StrategyParams } from "@/lib/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";

interface OptimizerCardProps {
  onOptimize: (usePhase2?: boolean, usePhase3?: boolean, usePhase4?: boolean) => void;
  suggestion: SuggestStrategyAdjustmentsOutput | null;
  isLoading: boolean;
  onApplySuggestions: (suggestions: Record<string, Partial<StrategyParams>>) => void;
  currentGeminiKey?: string;
  onSaveGeminiKey?: (key: string) => void;
  weights?: { pnl: number; sharpe: number; sortino: number; drawdown: number };
  onWeightsChange?: (weights: any) => void;
}

function OptimizerCardComponent({ onOptimize, suggestion, isLoading, onApplySuggestions, currentGeminiKey = '', onSaveGeminiKey, weights, onWeightsChange }: OptimizerCardProps) {
  
  const handleApplyClick = () => {
    if (suggestion?.perSymbolSuggestions) {
      const allSuggestedParams: Record<string, Partial<StrategyParams>> = {};
      suggestion.perSymbolSuggestions.forEach(item => {
        allSuggestedParams[item.symbol] = item.suggestedParams;
      });
      onApplySuggestions(allSuggestedParams);
    }
  }

  const hasSuggestions = Array.isArray(suggestion?.perSymbolSuggestions) && suggestion!.perSymbolSuggestions.length > 0;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wand2 className="h-6 w-6 text-accent" />
          <CardTitle className="font-headline">Optimizer</CardTitle>
        </div>
        <CardDescription>Use AI to analyze past performance and suggest strategy improvements per symbol.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        {/* Gemini API key inline editor */}
        {onSaveGeminiKey && (
          <div className="w-full flex items-end gap-2">
            <div className="flex-1 text-left">
              <label className="block text-xs text-muted-foreground mb-1">GEMINI_API_KEY (used by Optimizer)</label>
              <input
                type="password"
                defaultValue={currentGeminiKey}
                placeholder="Paste your Gemini API key"
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm"
                onChange={(e) => (e.target as HTMLInputElement).dataset.val = e.target.value}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                const input = (e.currentTarget.previousElementSibling?.querySelector('input') as HTMLInputElement);
                onSaveGeminiKey?.(input?.dataset.val ?? input?.value ?? '');
              }}
            >
              Save Key
            </Button>
          </div>
        )}
        {isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-accent" />
            <p className="text-muted-foreground">Analyzing performance and market data...</p>
          </div>
        ) : suggestion ? (
          <div className="w-full text-left space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-muted/30">
                    <CardHeader className="pb-2">
                        <CardDescription>Projected 7 Day PnL</CardDescription>
                        <CardTitle className={`font-mono text-lg ${suggestion.projected7DayPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ${suggestion.projected7DayPnl.toFixed(2)}
                        </CardTitle>
                    </CardHeader>
                </Card>
                 <Card className="bg-muted/30">
                    <CardHeader className="pb-2">
                        <CardDescription>Projected 30 Day PnL</CardDescription>
                        <CardTitle className={`font-mono text-lg ${suggestion.projected30DayPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ${suggestion.projected30DayPnl.toFixed(2)}
                        </CardTitle>
                    </CardHeader>
                </Card>
                 <Card className="bg-muted/30">
                    <CardHeader className="pb-2">
                        <CardDescription>Optimizer Mode</CardDescription>
                        <CardTitle className="font-mono text-lg">
                            {(suggestion as any).phase4 ? 'Phase 4 (Elite)' : suggestion.phase3 ? 'Phase 3 (Professional)' : suggestion.phase2 ? 'Phase 2 (Complete)' : 'Phase 1 (Quick)'}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <div>
              <h3 className="font-semibold font-headline text-lg mb-2">Overall Reasoning</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{suggestion.overallReasoning}</p>
            </div>

            {/* Phase 3/4: Scoring Weights - Improved UI */}
            {onWeightsChange && (
              <div className="w-full space-y-3">
                <h3 className="text-sm font-semibold mb-2">Scoring Profile (Phase 3/4)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Card 
                    className={`cursor-pointer transition-all ${
                      weights?.pnl === 0.5 && weights?.sharpe === 0.2 && weights?.sortino === 0.1 && weights?.drawdown === 0.2
                        ? 'border-accent border-2 bg-accent/10' 
                        : 'hover:border-accent/50'
                    }`}
                    onClick={() => onWeightsChange({ pnl: 0.5, sharpe: 0.2, sortino: 0.1, drawdown: 0.2 })}
                  >
                    <CardHeader className="pb-2 pt-3">
                      <CardTitle className="text-sm">⚖️ Balanced</CardTitle>
                      <CardDescription className="text-xs">50% profit, 30% risk-adjusted, 20% drawdown</CardDescription>
                    </CardHeader>
                  </Card>
                  
                  <Card 
                    className={`cursor-pointer transition-all ${
                      weights?.pnl === 0.3 && weights?.sharpe === 0.1 && weights?.sortino === 0.1 && weights?.drawdown === 0.5
                        ? 'border-accent border-2 bg-accent/10' 
                        : 'hover:border-accent/50'
                    }`}
                    onClick={() => onWeightsChange({ pnl: 0.3, sharpe: 0.1, sortino: 0.1, drawdown: 0.5 })}
                  >
                    <CardHeader className="pb-2 pt-3">
                      <CardTitle className="text-sm">🛡️ Conservative</CardTitle>
                      <CardDescription className="text-xs">30% profit, 20% risk-adjusted, 50% drawdown</CardDescription>
                    </CardHeader>
                  </Card>
                  
                  <Card 
                    className={`cursor-pointer transition-all ${
                      weights?.pnl === 0.7 && weights?.sharpe === 0.15 && weights?.sortino === 0.05 && weights?.drawdown === 0.1
                        ? 'border-accent border-2 bg-accent/10' 
                        : 'hover:border-accent/50'
                    }`}
                    onClick={() => onWeightsChange({ pnl: 0.7, sharpe: 0.15, sortino: 0.05, drawdown: 0.1 })}
                  >
                    <CardHeader className="pb-2 pt-3">
                      <CardTitle className="text-sm">🚀 Aggressive</CardTitle>
                      <CardDescription className="text-xs">70% profit, 20% risk-adjusted, 10% drawdown</CardDescription>
                    </CardHeader>
                  </Card>
                </div>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold font-headline text-lg">Suggested Adjustments by Symbol</h3>
              </div>
              {hasSuggestions ? (
                <Accordion type="single" collapsible className="w-full">
                  {suggestion.perSymbolSuggestions.map((item) => (
                    <AccordionItem value={item.symbol} key={item.symbol}>
                      <AccordionTrigger className="font-semibold">{item.symbol}</AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-2">
                          <div>
                            <h4 className="font-medium text-muted-foreground">Reasoning:</h4>
                            <p className="text-sm text-muted-foreground/80 whitespace-pre-wrap">{item.reasoning}</p>
                          </div>
                           <div>
                            <h4 className="font-medium text-muted-foreground">Suggestion:</h4>
                             <p className="text-sm text-muted-foreground/80 whitespace-pre-wrap font-mono p-4 bg-muted/50 rounded-md">
                              {item.humanReadableSuggestion}
                            </p>
                          </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <p className="text-sm text-muted-foreground">The AI found no specific adjustments to recommend at this time.</p>
              )}
            </div>

          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Sparkles className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">Click below to get started</p>
          </div>
        )}
      </CardContent>
      <div className="p-6 pt-0 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => onOptimize(false, false, false)} disabled={isLoading} size="sm" variant="outline">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Phase 1
              </>
            )}
          </Button>
          <Button onClick={() => onOptimize(true, false, false)} disabled={isLoading} size="sm" variant="outline">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Phase 2
              </>
            )}
          </Button>
          <Button onClick={() => onOptimize(false, true, false)} disabled={isLoading} size="sm" variant="default">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Phase 3
              </>
            )}
          </Button>
          <Button onClick={() => onOptimize(false, false, true)} disabled={isLoading} size="sm" variant="default">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Phase 4 ⚡
              </>
            )}
          </Button>
        </div>
        {suggestion && hasSuggestions && (
          <Button variant="outline" onClick={handleApplyClick} className="w-full">
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Apply Suggestions
          </Button>
        )}
        <p className="text-xs text-muted-foreground text-center mt-1">
          Phase 1: Thresholds | Phase 2: TP/SL+Leverage | Phase 3: Slippage+Timing | Phase 4: Dynamic Sizing+Exits
        </p>
      </div>
    </Card>
  );
}

export const OptimizerCard = React.memo(OptimizerCardComponent);

    