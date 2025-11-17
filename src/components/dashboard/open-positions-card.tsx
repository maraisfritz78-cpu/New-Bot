
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen, XCircle, Pencil, Save, Ban } from 'lucide-react';
import { cn } from "@/lib/utils";
import type { OpenPosition, MarketPair } from '@/lib/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface OpenPositionsCardProps {
    openPositions: OpenPosition[];
    marketData: MarketPair[];
    onManualClose: (positionId: string) => void;
    onUpdatePosition: (positionId: string, newTp: number, newSl: number) => void;
}

function OpenPositionsCardComponent({ openPositions, marketData, onManualClose, onUpdatePosition }: OpenPositionsCardProps) {
    
    const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
    const [editTp, setEditTp] = useState<string>("");
    const [editSl, setEditSl] = useState<string>("");

    const marketPriceMap = React.useMemo(() => {
        const map = marketData.reduce((acc, curr) => {
            acc[curr.pair] = curr.price;
            return acc;
        }, {} as Record<string, number>);
        // Debug: Log price map occasionally
        if (Math.random() < 0.1 && Object.keys(map).length > 0) {
            console.log('[OpenPositionsCard] Price map:', map);
        }
        return map;
    }, [marketData]);

    const handleEditClick = (pos: OpenPosition) => {
        setEditingPositionId(pos.id);
        setEditTp(pos.tp.toFixed(4));
        setEditSl(pos.sl.toFixed(4));
    };

    const handleCancelEdit = () => {
        setEditingPositionId(null);
    };

    const handleSaveEdit = (positionId: string) => {
        const newTp = parseFloat(editTp);
        const newSl = parseFloat(editSl);
        if (!isNaN(newTp) && !isNaN(newSl)) {
            onUpdatePosition(positionId, newTp, newSl);
            setEditingPositionId(null);
        }
    };


    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <FolderOpen className="h-5 w-5 text-accent" />
                    <CardTitle>Open Positions</CardTitle>
                </div>
                <CardDescription>Currently active trades being monitored by the bot.</CardDescription>
            </CardHeader>
            <CardContent>
                 <TooltipProvider>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Pair</TableHead>
                            <TableHead>Side</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead>Entry</TableHead>
                            <TableHead>Current Price</TableHead>
                            <TableHead>PnL %</TableHead>
                            <TableHead>TP</TableHead>
                            <TableHead>SL</TableHead>
                            <TableHead>Trailing SL</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {openPositions.length > 0 ? openPositions.map(pos => {
                            const isEditing = editingPositionId === pos.id;
                            const currentPrice = marketPriceMap[pos.pair] || pos.entryPrice;
                            const usingLivePrice = marketPriceMap[pos.pair] !== undefined;
                            // Debug: Log when falling back to entry price
                            if (!usingLivePrice && Math.random() < 0.2) {
                                console.log(`[OpenPositionsCard] No live price for ${pos.pair}, using entry price. Available symbols:`, Object.keys(marketPriceMap));
                            }
                            const positionValue = pos.size * pos.entryPrice;
                            const pnl = (currentPrice - pos.entryPrice) * (pos.action === 'buy' ? 1 : -1) * pos.size * pos.leverage;
                            const pnlPercent = (pnl / (positionValue * pos.leverage)) * 100 * pos.leverage;
                            const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400';

                            return (
                                <TableRow key={pos.id}>
                                    <TableCell className="font-medium">{pos.pair}</TableCell>
                                    <TableCell className={cn("font-semibold", pos.action === 'buy' ? 'text-green-400' : 'text-red-400')}>
                                        {pos.action.toUpperCase()}
                                    </TableCell>
                                    <TableCell>{pos.size}</TableCell>
                                    <TableCell>{pos.entryPrice.toFixed(4)}</TableCell>
                                    <TableCell>{currentPrice.toFixed(4)}</TableCell>
                                    <TableCell className={cn("font-mono", pnlColor)}>{pnlPercent.toFixed(2)}%</TableCell>
                                    
                                    <TableCell className="text-green-400">
                                        {isEditing ? (
                                            <Input type="number" value={editTp} onChange={(e) => setEditTp(e.target.value)} className="h-8 w-24" />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <span>{pos.tp.toFixed(4)}</span>
                                                 <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Pencil className="h-3 w-3 text-muted-foreground cursor-pointer" onClick={() => handleEditClick(pos)} />
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>Edit TP/SL</p></TooltipContent>
                                                </Tooltip>
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-red-400">
                                        {isEditing ? (
                                            <Input type="number" value={editSl} onChange={(e) => setEditSl(e.target.value)} className="h-8 w-24" />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <span>{pos.sl.toFixed(4)}</span>
                                                 <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Pencil className="h-3 w-3 text-muted-foreground cursor-pointer" onClick={() => handleEditClick(pos)} />
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>Edit TP/SL</p></TooltipContent>
                                                </Tooltip>
                                            </div>
                                        )}
                                    </TableCell>

                                    <TableCell className={cn("text-blue-400", pos.ttpActivated && "font-bold")}>
                                        {pos.trailingStopPrice ? pos.trailingStopPrice.toFixed(4) : "N/A"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {isEditing ? (
                                            <div className="flex gap-2 justify-end">
                                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleSaveEdit(pos.id)}><Save className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancelEdit}><Ban className="h-4 w-4" /></Button>
                                            </div>
                                        ) : (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => onManualClose(pos.id)}>
                                                        <XCircle className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent><p>Manual Close</p></TooltipContent>
                                            </Tooltip>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        }) : (
                            <TableRow>
                                <TableCell colSpan={10} className="text-center text-muted-foreground">No open positions</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                </TooltipProvider>
            </CardContent>
        </Card>
    );
}

export const OpenPositionsCard = React.memo(OpenPositionsCardComponent);
