
"use client";

import { IntegrationsCard } from './integrations-card';
import type { GlobalStrategy, TradingMode } from '@/lib/types';

interface SettingsViewProps {
  strategy: GlobalStrategy;
  onUpdateStrategy: (params: Partial<GlobalStrategy>) => void;
  tradingMode: TradingMode;
}

export function SettingsView({
  strategy,
  onUpdateStrategy,
  tradingMode,
}: SettingsViewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:gap-8 justify-center">
       <div className="w-full lg:max-w-2xl mx-auto">
            <IntegrationsCard
                strategy={strategy}
                onUpdateStrategy={onUpdateStrategy}
                tradingMode={tradingMode}
            />
       </div>
    </div>
  );
}
