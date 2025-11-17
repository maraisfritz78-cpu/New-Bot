
"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Hourglass, Ban } from 'lucide-react';
import { cn } from "@/lib/utils";
import type { PendingOrder } from '@/lib/types';

interface PendingOrdersCardProps {
    pendingOrders: PendingOrder[];
    onCancelOrder: (orderId: string) => void;
}

function PendingOrdersCardComponent({ pendingOrders, onCancelOrder }: PendingOrdersCardProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Hourglass className="h-5 w-5 text-accent" />
                    <CardTitle>Pending Orders</CardTitle>
                </div>
                <CardDescription>Limit orders waiting to be filled.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Pair</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead className="text-right">Price</TableHead>
                            <TableHead className="text-right">TP</TableHead>
                            <TableHead className="text-right">SL</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pendingOrders.length > 0 ? pendingOrders.map(order => (
                            <TableRow key={order.id}>
                                <TableCell className="font-medium">{order.pair}</TableCell>
                                <TableCell className={cn("font-semibold", order.type === 'buy' ? 'text-green-400' : 'text-red-400')}>
                                    {order.type.toUpperCase()}
                                </TableCell>
                                <TableCell>{order.size}</TableCell>
                                <TableCell className="text-right font-mono">{order.price.toFixed(4)}</TableCell>
                                <TableCell className="text-right font-mono text-green-500">{order.tp ? order.tp.toFixed(4) : '—'}</TableCell>
                                <TableCell className="text-right font-mono text-red-500">{order.sl ? order.sl.toFixed(4) : '—'}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="sm" onClick={() => onCancelOrder(order.id)}>
                                        <Ban className="h-4 w-4 mr-2" />
                                        Cancel
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground">No pending orders</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

export const PendingOrdersCard = React.memo(PendingOrdersCardComponent);

    