import React from 'react';

interface MemoryCapsuleProps {
  status: 'disconnected' | 'connected' | 'saving';
  fileName?: string;
  onConnect: () => void;
  onCreate: () => void;
}

export const MemoryCapsule: React.FC<MemoryCapsuleProps> = ({ 
  status, 
  fileName, 
  onConnect, 
  onCreate 
}) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
      {status === 'disconnected' && (
        <div className="flex gap-2 animate-fade-in">
          <button 
            onClick={onCreate}
            className="bg-gray-900/90 text-dim text-xs px-3 py-1.5 border border-gray-800 hover:border-pixel-green hover:text-pixel-green transition-colors backdrop-blur-sm"
          >
            NEW_MEMORY
          </button>
          <button 
            onClick={onConnect}
            className="bg-gray-900/90 text-dim text-xs px-3 py-1.5 border border-gray-800 hover:border-pixel-green hover:text-pixel-green transition-colors backdrop-blur-sm"
          >
            LOAD_MEMORY
          </button>
        </div>
      )}
      
      <div 
        className="relative group cursor-help"
        title={status === 'disconnected' ? 'No Memory Connected' : `Memory: ${fileName}`}
      >
        {/* 指示灯外圈光晕 */}
        <div className={`absolute inset-0 rounded-full blur opacity-40 transition-colors duration-500 ${
          status === 'saving' ? 'bg-income-yellow' : 
          status === 'connected' ? 'bg-pixel-green' : 'bg-gray-600'
        }`} />
        
        {/* 核心指示灯 */}
        <div className={`relative w-3 h-3 rounded-full border transition-all duration-500 ${
          status === 'saving' ? 'bg-income-yellow border-income-yellow animate-pulse' : 
          status === 'connected' ? 'bg-pixel-green border-pixel-green' : 'bg-transparent border-gray-600'
        }`} />

        {/* 状态文本 (仅 Hover 显示) */}
        {status !== 'disconnected' && (
          <div className="absolute bottom-full right-0 mb-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
             <div className="bg-gray-900 text-xs text-dim px-2 py-1 border border-gray-800">
               {status === 'saving' ? 'SAVING...' : fileName}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
