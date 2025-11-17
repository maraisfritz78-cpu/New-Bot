
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { List, PlusCircle, Trash2, Search, Eye } from "lucide-react";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '../ui/separator';

interface SymbolsViewProps {
  allSymbols: string[];
  watchedSymbols: string[];
  onAddSymbol: (symbolPair: string) => void;
  onRemoveSymbol: (symbolPair: string) => void;
}

export function SymbolsView({ allSymbols, watchedSymbols, onAddSymbol, onRemoveSymbol }: SymbolsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const watchedSet = useMemo(() => new Set(watchedSymbols), [watchedSymbols]);

  const availableSymbols = useMemo(() => {
    const lowercasedSearchTerm = searchTerm.toLowerCase();
    return allSymbols
      .filter(symbol => !watchedSet.has(symbol))
      .filter(symbol => 
        searchTerm ? symbol.toLowerCase().includes(lowercasedSearchTerm) : true
      );
  }, [searchTerm, allSymbols, watchedSet]);


  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <List className="h-6 w-6 text-accent" />
          <CardTitle className="font-headline">Manage Symbols</CardTitle>
        </div>
        <CardDescription>Add or remove symbols from your watchlist. Your strategy will only apply to watched symbols.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">

        <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Eye className="h-5 w-5 text-muted-foreground" />
                Watching ({watchedSymbols.length})
            </h3>
            <Separator className="mb-4" />
            {watchedSymbols.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {watchedSymbols.map(symbol => (
                        <div
                          key={`watched-${symbol}`}
                          className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-xs"
                        >
                            <span className="font-medium">{symbol.replace('/USDT', '')}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 p-0 hover:bg-muted/60"
                              aria-label={`Remove ${symbol}`}
                              onClick={() => onRemoveSymbol(symbol)}
                            >
                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-muted-foreground text-center py-4">You are not watching any symbols yet. Add some from the list below.</p>
            )}
        </div>
        
        <div>
             <h3 className="text-lg font-semibold mb-2">Available Symbols</h3>
             <Separator className="mb-4" />
            <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                type="text"
                placeholder={`Search ${allSymbols.length - watchedSymbols.length} available symbols...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
            />
            </div>
            <ScrollArea className="h-[45vh] rounded-md border">
            <Table>
                <TableHeader className='sticky top-0 bg-muted'>
                <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {availableSymbols.map((symbol) => (
                    <TableRow key={symbol}>
                        <TableCell className="font-medium">{symbol.replace('/USDT', '')}</TableCell>
                        <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => onAddSymbol(symbol)}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Add
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
                 {availableSymbols.length === 0 && searchTerm && (
                    <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">
                            No symbols found for "{searchTerm}".
                        </TableCell>
                    </TableRow>
                )}
                </TableBody>
            </Table>
            </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
