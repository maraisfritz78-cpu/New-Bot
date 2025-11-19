
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Wand2, ArrowDownToLine } from "lucide-react";
import { type SuggestStrategyAdjustmentsOutput } from "@/ai/flows/suggest-strategy-adjustments";
import type { GlobalStrategy, StrategyParams } from "@/lib/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { SuggestionComparison } from './suggestion-comparison';
import { defaultSymbolStrategy } from '@/lib/user-config';

// Helper function to resolve the strategy for a given symbol
const getStrategyForSymbol = (globalStrategy: GlobalStrategy, symbol: string): StrategyParams => {
  const symbolOverride = globalStrategy.perSymbol[symbol] || {};
  return { ...defaultSymbolStrategy, ...symbolOverride };
};

interface OptimizerCardProps {
  onOptimize: () => void; // Simplified onOptimize
  suggestion: SuggestStrategyAdjustmentsOutput | null;
  isLoading: boolean;
  onApplySuggestions: (suggestions: Record<string, Partial<StrategyParams>>) => void;
  currentGeminiKey?: string;
  onSaveGeminiKey?: (key: string) => void;
  strategy: GlobalStrategy | null; // Add strategy to props
}

function OptimizerCardComponent({ onOptimize, suggestion, isLoading, onApplySuggestions, currentGeminiKey = '', onSaveGeminiKey, strategy }: OptimizerCardProps) {
  
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
          <CardTitle className="font-headline">AI Optimizer</CardTitle>
        </div>
        <CardDescription>Use AI to analyze market conditions and past performance to suggest strategy improvements.</CardDescription>
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
            <p className="text-muted-foreground">AI is analyzing performance and market data...</p>
          </div>
        ) : suggestion ? (
          <div className="w-full text-left space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-muted/30">
                    <CardHeader className="pb-2">
                        <CardDescription>Projected 7d Improvement</CardDescription>
                        <CardTitle className={`font-mono text-lg ${suggestion.projected7DayPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ${suggestion.projected7DayPnl.toFixed(2)}
                        </CardTitle>
                    </CardHeader>
                </Card>
                 <Card className="bg-muted/30">
                    <CardHeader className="pb-2">
                        <CardDescription>Projected 30d Improvement</CardDescription>
                        <CardTitle className={`font-mono text-lg ${suggestion.projected30DayPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ${suggestion.projected30DayPnl.toFixed(2)}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <div>
              <h3 className="font-semibold font-headline text-lg mb-2">Overall Reasoning</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{suggestion.overallReasoning}</p>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold font-headline text-lg">Suggested Adjustments by Symbol</h3>
              </div>
              {hasSuggestions && strategy ? (
                <Accordion type="single" collapsible className="w-full">
                  {suggestion.perSymbolSuggestions.map((item) => {
                    const currentParams = getStrategyForSymbol(strategy, item.symbol);
                    return (
                        <AccordionItem value={item.symbol} key={item.symbol}>
                        <AccordionTrigger className="font-semibold">{item.symbol}</AccordionTrigger>
                        <AccordionContent className="space-y-4 pt-2">
                            <div>
                                <h4 className="font-medium text-muted-foreground">Reasoning:</h4>
                                <p className="text-sm text-muted-foreground/80 whitespace-pre-wrap">{item.reasoning}</p>
                            </div>
                            <div>
                                <h4 className="font-medium text-muted-foreground">Suggested Changes:</h4>
                                <SuggestionComparison 
                                    currentParams={currentParams} 
                                    suggestedParams={item.suggestedParams} 
                                />
                            </div>
                        </AccordionContent>
                        </AccordionItem>
                    )
                  })}
                </Accordion>
              ) : (
                <p className="text-sm text-muted-foreground">The AI found no specific adjustments to recommend at this time.</p>
              )}
            </div>

          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Sparkles className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">Click below to get AI-powered suggestions</p>
          </div>
        )}
      </CardContent>
      <div className="p-6 pt-0 flex flex-col gap-2">
        <Button onClick={() => onOptimize()} disabled={isLoading} size="lg" variant="default">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Run AI Optimizer
              </>
            )}
        </Button>
        {suggestion && hasSuggestions && (
          <Button variant="outline" onClick={handleApplyClick} className="w-full">
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Apply All Suggestions
          </Button>
        )}
        <p className="text-xs text-muted-foreground text-center mt-1">
          The AI optimizer analyzes market conditions and past performance to recommend settings.
        </p>
      </div>
    </Card>
  );
}

export const OptimizerCard = React.memo(OptimizerCardComponent);
