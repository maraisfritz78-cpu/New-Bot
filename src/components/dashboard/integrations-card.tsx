
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { KeyRound, Share2 } from "lucide-react";
import type { GlobalStrategy, TradingMode } from "@/lib/types";
import React, { useEffect } from "react";
import { Separator } from "../ui/separator";

const integrationsSchema = z.object({
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  discordWebhookUrl: z.string().url("Must be a valid URL.").optional().or(z.literal('')),
  discordEnabled: z.boolean().optional(),
  disablePassword: z.boolean().optional(),
  ssePingIntervalMs: z.coerce.number().min(5000).max(300000).optional(), // 5s to 5min
});

interface IntegrationsCardProps {
  strategy: GlobalStrategy;
  onUpdateStrategy: (params: Partial<GlobalStrategy>) => void;
  tradingMode: TradingMode;
}

export function IntegrationsCard({ strategy, onUpdateStrategy, tradingMode }: IntegrationsCardProps) {
  const form = useForm<z.infer<typeof integrationsSchema>>({
    resolver: zodResolver(integrationsSchema),
    defaultValues: {
      apiKey: strategy.apiKey || '',
      apiSecret: strategy.apiSecret || '',
      discordWebhookUrl: strategy.discordWebhookUrl || '',
      discordEnabled: strategy.discordEnabled ?? false,
      disablePassword: strategy.disablePassword ?? false,
      ssePingIntervalMs: strategy.ssePingIntervalMs ?? 25000,
    },
  });

  useEffect(() => {
    form.reset({
      apiKey: strategy.apiKey || '',
      apiSecret: strategy.apiSecret || '',
      discordWebhookUrl: strategy.discordWebhookUrl || '',
      discordEnabled: strategy.discordEnabled ?? false,
      disablePassword: strategy.disablePassword ?? false,
      ssePingIntervalMs: strategy.ssePingIntervalMs ?? 25000,
    });
  }, [strategy, form]);

  function onSubmit(values: z.infer<typeof integrationsSchema>) {
    onUpdateStrategy(values);
  }
  
  const isTestnet = tradingMode === 'paper';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Share2 className="h-6 w-6 text-accent" />
          <CardTitle className="font-headline">Integrations & Keys</CardTitle>
        </div>
        <CardDescription>
            Configure API keys and webhook integrations for notifications.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-medium">Bybit API Keys ({isTestnet ? 'Testnet' : 'Live'})</h3>
                </div>
                <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                        <Input type="password" {...field} />
                    </FormControl>
                    <FormDescription>Your public API key from Bybit {isTestnet ? 'Testnet' : 'Live'}.</FormDescription>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="apiSecret"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>API Secret</FormLabel>
                    <FormControl>
                        <Input type="password" {...field} />
                    </FormControl>
                    <FormDescription>Your secret API key from Bybit {isTestnet ? 'Testnet' : 'Live'}.</FormDescription>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
            
            <Separator />

            <div className="space-y-4">
                 <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor"><path d="M19.54 5.23a1.25 1.25 0 0 0-1.2-1.05h-13a1.25 1.25 0 0 0-1.2 1.05L2 15.25l4.88 1.45a2.5 2.5 0 0 0 2.24 0l2.76-1.65a.63.63 0 0 1 .74 0l2.76 1.65a2.5 2.5 0 0 0 2.24 0L22 15.25l-2.46-10.02Zm-11 6.52a1.75 1.75 0 1 1 3.5 0 1.75 1.75 0 0 1-3.5 0Z"/></svg>
                    <h3 className="font-medium">Discord Notifications</h3>
                </div>
                 <FormField
                    control={form.control}
                    name="discordEnabled"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Enable Discord</FormLabel>
                            <FormDescription>Toggle to send notifications to your Discord webhook.</FormDescription>
                          </div>
                          <FormControl>
                            <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />
                          </FormControl>
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="discordWebhookUrl"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Webhook URL</FormLabel>
                        <FormControl>
                            <Input type="password" placeholder="https://discord.com/api/webhooks/..." {...field} />
                        </FormControl>
                        <FormDescription>Paste your Discord webhook URL here to receive trade notifications.</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a5 5 0 0 0-5 5v3H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"/></svg>
                    <h3 className="font-medium">App Security</h3>
                </div>
                <FormField
                    control={form.control}
                    name="disablePassword"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Disable Password Gate</FormLabel>
                            <FormDescription>Skip the password screen on launch.</FormDescription>
                          </div>
                          <FormControl>
                            <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />
                          </FormControl>
                        </FormItem>
                    )}
                />
            </div>
            
            <Separator />
            
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15h-2v-6h2Zm0-8h-2V7h2Z"/></svg>
                    <h3 className="font-medium">Connection Tuning</h3>
                </div>
                <FormField
                    control={form.control}
                    name="ssePingIntervalMs"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>SSE Ping Interval (ms)</FormLabel>
                        <FormControl>
                            <Input type="number" step="1000" min="5000" max="300000" {...field} />
                        </FormControl>
                        <FormDescription>How often to send heartbeat pings to keep the connection alive. Lower = more stable, higher = less memory usage. (5-300 seconds)</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            
            <Button type="submit" className="w-full">Save Settings</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
