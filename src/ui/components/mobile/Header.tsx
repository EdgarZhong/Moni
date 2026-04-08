import React from 'react';
import { DotMatrixText } from '../DotMatrixText';
import { triggerHaptic, HapticFeedbackLevel } from '@system/device/haptics';
import { Cpu } from 'lucide-react';
import { LedgerSwitcher } from './LedgerSwitcher';
import type { LedgerMeta } from '@system/filesystem/fs-storage';

interface HeaderProps {
  isLoading: boolean;
  onImportData?: () => void;
  
  // Ledger Props
  ledgers?: LedgerMeta[];
  activeLedger?: string;
  onSwitchLedger?: (name: string) => void;
  onCreateLedger?: (name: string) => void;
  onDeleteLedger?: (name: string) => void;
  onLoadLedgers?: () => void;

  aiStatus?: 'IDLE' | 'ANALYZING' | 'STOPPING' | 'ERROR';
  onAIAction?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isLoading,
  onImportData,
  ledgers = [],
  activeLedger = 'default',
  onSwitchLedger = () => {},
  onCreateLedger = () => {},
  onDeleteLedger = () => {},
  onLoadLedgers,
  aiStatus = 'IDLE',
  onAIAction
}) => {
  const getAIStatusColor = () => {
    switch (aiStatus) {
      case 'ANALYZING': return 'text-pixel-green animate-pulse drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]';
      case 'STOPPING': return 'text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]';
      case 'ERROR': return 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]';
      default: return 'text-gray-600';
    }
  };

  const handleAIAction = async () => {
    await triggerHaptic(HapticFeedbackLevel.MEDIUM);
    onAIAction?.();
  };

  const handleImportData = async () => {
    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    onImportData?.();
  };

  return (
    <header className="flex flex-col gap-6 py-6 border-b border-gray-800 mb-3 select-none">
      <div className="flex justify-between items-center w-full">
        <div className="flex items-center gap-4 group cursor-default">
          {/* Logo Icon */}
          <div className="relative">
            <div className="w-8 h-8 bg-pixel-green animate-box-glow" />
          </div>

          {/* Custom Dot Matrix "PIXEL BILL" */}
          <div className="flex gap-3 items-center leading-none h-[32px] flex-shrink-0">
            <h1 className="text-3xl font-pixel tracking-tighter text-gray-100 pt-[4px] flex-shrink-0">
              PIXEL
            </h1>
            <div className="text-pixel-green animate-text-glow cursor-default flex-shrink-0">
              <DotMatrixText text="BILL" size="md" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Subtitle Decoration */}
      <div className="flex justify-between items-center w-full">
        <div className="text-[10px] text-dim tracking-[0.2em] font-mono opacity-60">
          GENERATIVE FINANCIAL TRACKER
        </div>
        <button 
          onClick={handleAIAction}
          disabled={aiStatus === 'STOPPING'}
          className="p-3 -mr-3 active:opacity-70 transition-opacity"
        >
          <Cpu size={24} className={getAIStatusColor()} />
        </button>
      </div>

      {onImportData && (
        <div className="flex gap-3 w-full">
          {/* Ledger Switcher */}
          <LedgerSwitcher
            ledgers={ledgers}
            activeLedger={activeLedger}
            onSwitch={onSwitchLedger}
            onCreate={onCreateLedger}
            onDelete={onDeleteLedger}
            isLoading={isLoading}
            onOpen={onLoadLedgers}
          />

          {/* Import Button */}
          <button 
            onClick={handleImportData}
            disabled={isLoading}
            className="
              flex-1
              relative overflow-hidden group
              flex justify-center items-center gap-2 px-3 py-3
              font-pixel text-[10px] tracking-tight
              border border-gray-800
              bg-card 
              transition-all duration-300
              disabled:opacity-50 disabled:cursor-default
              enabled:hover:border-gray-600 enabled:hover:bg-white/5 enabled:hover:text-pixel-green
            "
          >
             <div className={`w-1.5 h-1.5 ${isLoading ? 'bg-income-yellow animate-spin' : 'bg-pixel-green group-hover:shadow-[0_0_8px_rgba(16,185,129,0.8)]'}`}></div>
            <span className="relative z-10">{isLoading ? 'LOADING...' : '[ADD_SOURCE]'}</span>
          </button>
        </div>
      )}
    </header>
  );
};
