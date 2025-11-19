
"use client";

import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import type { TradingMode } from "@/lib/types";
import { useTheme } from "@/hooks/use-theme";
import { Moon, Sun, Wallet, Percent, Briefcase, TrendingUp, Hourglass, FolderOpen } from "lucide-react";
import { Separator } from "../ui/separator";
import { cn } from "@/lib/utils";


interface DashboardHeaderProps {
    tradingMode: TradingMode;
    onTradingModeChange: (mode: TradingMode) => void;
    balance: number;
    availableBalance: number;
    inPosition: number;
    unrealizedPnl: number;
    pnl24h: number;
    pnl: number;
    winRate: number;
}

export function DashboardHeader({ 
    tradingMode, onTradingModeChange, 
    balance, availableBalance, inPosition, unrealizedPnl, pnl24h, 
    pnl, winRate 
}: DashboardHeaderProps) {
  const userAvatar = PlaceHolderImages.find(img => img.id === 'user-avatar');
  const { theme, setTheme } = useTheme();
  
  const StatItem = ({ label, value, tooltip, icon: Icon, valueClass }: { label: string, value: string, tooltip: string, icon: React.ElementType, valueClass?: string }) => (
    <div className="flex items-center gap-2" title={tooltip}>
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      <span className="text-xs font-medium text-muted-foreground">{label}:</span>
      <span className={cn("text-xs font-bold font-mono", valueClass)}>{value}</span>
    </div>
  );


  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-red-500 px-4 sm:px-6 backdrop-blur-sm">
      <div className="flex items-center gap-3 md:gap-4">
        <StatItem label="Balance" value={`$${balance.toFixed(2)}`} tooltip="Total Portfolio Balance" icon={Briefcase} valueClass="text-primary" />
        <Separator orientation="vertical" className="h-6" />
        <StatItem label="Available" value={`$${availableBalance.toFixed(2)}`} tooltip="Balance available for new trades" icon={Wallet} />
        <StatItem label="In Position" value={`$${inPosition.toFixed(2)}`} tooltip="Total margin used in open positions" icon={FolderOpen} />
        <StatItem label="Unrealized PnL" value={`$${unrealizedPnl.toFixed(2)}`} tooltip="Profit/Loss of current open positions" icon={Hourglass} valueClass={unrealizedPnl >= 0 ? "text-green-400" : "text-red-400"} />
        <Separator orientation="vertical" className="h-6" />
        <StatItem label="24h Performance" value={`${pnl24h.toFixed(2)}`} tooltip="Realized PnL over the last 24 hours" icon={TrendingUp} valueClass={pnl24h >= 0 ? "text-green-400" : "text-red-400"} />
        <StatItem label="Win Rate" value={`${winRate.toFixed(1)}%`} tooltip="Win Rate (All Time)" icon={Percent} />
      </div>


      <div className="ml-auto flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={tradingMode === 'live' ? 'destructive' : 'secondary'}>
            {tradingMode === 'live' ? 'Live' : 'Paper'}
          </Badge>
          <Switch
            id="trading-mode-switch"
            checked={tradingMode === 'live'}
            onCheckedChange={(checked) => onTradingModeChange(checked ? 'live' : 'paper')}
          />
          <Label htmlFor="trading-mode-switch" className="text-sm sr-only">
            Trading Mode
          </Label>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="overflow-hidden rounded-full"
            >
              <Avatar>
                 {userAvatar && (
                    <AvatarImage 
                      src={userAvatar.imageUrl} 
                      alt={userAvatar.description} 
                      width={36} 
                      height={36} 
                      data-ai-hint={userAvatar.imageHint}
                    />
                  )}
                <AvatarFallback>BT</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Support</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
