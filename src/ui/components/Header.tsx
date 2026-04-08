import React from 'react';
import { DotMatrixText } from './DotMatrixText';
import { Cpu } from 'lucide-react';

interface HeaderProps {
  /** AI 单元的状态：空闲 | 分析中 | 停止中 | 错误 */
  aiStatus: 'IDLE' | 'ANALYZING' | 'STOPPING' | 'ERROR';
  /** AI 动作触发回调：开始 | 停止 */
  onAIAction: (action: 'START' | 'STOP') => void;
}

export const Header: React.FC<HeaderProps> = ({ aiStatus, onAIAction }) => {
  // 处理点击交互
  const handleAIClick = () => {
    if (aiStatus === 'ANALYZING') {
      onAIAction('STOP');
    } else if (aiStatus === 'IDLE' || aiStatus === 'ERROR') {
      onAIAction('START');
    }
    // STOPPING 状态下忽略点击
  };

  // 根据状态获取图标样式
  const getIconStyles = () => {
    switch (aiStatus) {
      case 'ANALYZING':
        // 工作中：像素绿，4s 同步呼吸动画
        return 'text-pixel-green animate-pulse-slow opacity-100';
      case 'ERROR':
        // 错误：纯黄色
        return 'text-income-yellow opacity-100';
      case 'STOPPING':
        // 停止中：与 IDLE 相同（立即反馈）
        return 'text-dim opacity-50';
      case 'IDLE':
      default:
        // 空闲：深灰 (text-dim/opacity-50)，白色轮廓通过 stroke-current 实现（text-dim 为灰，需配合 hover）
        // 用户要求：Dark gray (text-dim/opacity-50), white outline/stroke.
        // Lucide 图标使用 stroke 颜色。如果 text-dim，则 stroke 为灰色。
        // 若要白色轮廓但看似深灰，可调整 opacity。
        return 'text-dim opacity-50 hover:opacity-100 hover:text-gray-200 transition-all duration-300';
    }
  };

  return (
    <header className="flex justify-between items-start py-8 border-b border-gray-800 mb-8 select-none relative">
      <div className="flex flex-col gap-2 w-full">
        <div className="flex items-center gap-6 group cursor-default">
          {/* Logo Icon */}
          <div className="relative">
            <div className="w-8 h-8 bg-pixel-green animate-box-glow" />
          </div>

          {/* Custom Dot Matrix "PIXEL BILL" */}
          <div className="flex gap-5 items-center leading-none h-[44px] flex-shrink-0">
            <h1 className="text-4xl font-pixel tracking-tighter text-gray-100 pt-[4px] flex-shrink-0">
              PIXEL
            </h1>
            <div className="text-pixel-green animate-text-glow cursor-default -translate-y-[2px] flex-shrink-0">
              <DotMatrixText text="BILL" size="lg" />
            </div>
          </div>
        </div>

        {/* Subtitle Decoration & AI Control Unit */}
        {/* Aligned with text (Logo width 32px + gap 24px = 56px) */}
        <div className="pl-[56px] flex items-center justify-between sm:justify-start sm:gap-4 pr-4 sm:pr-0">
          <div className="text-xs text-dim tracking-[0.2em] font-mono opacity-60">
            GENERATIVE FINANCIAL TRACKER
          </div>
          
          {/* AI Control Unit Icon */}
          <button 
            onClick={handleAIClick}
            disabled={aiStatus === 'STOPPING'}
            className={`
              relative p-1 rounded-full 
              focus:outline-none focus:ring-1 focus:ring-gray-700
              disabled:cursor-not-allowed
              ${aiStatus === 'IDLE' ? 'cursor-pointer' : ''}
            `}
            aria-label="Toggle AI Control Unit"
            title={aiStatus === 'ANALYZING' ? 'Stop AI' : 'Start AI Analysis'}
          >
            <Cpu 
              size={18} 
              className={`
                transition-all duration-500
                ${getIconStyles()}
              `} 
              strokeWidth={1.5}
            />
          </button>
        </div>
      </div>
      
      {/* Old [LOAD_DATA_SOURCE] button removed */}
    </header>
  );
};
