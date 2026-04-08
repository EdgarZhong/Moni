import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface AuraOverlayHandle {
  pulse: () => void;
}

interface AuraOverlayProps {
  /** 控制光环是否激活 */
  isActive: boolean;
  /** 子组件 */
  children?: React.ReactNode;
  /** 自定义类名 */
  className?: string;
}

export const AuraOverlay = forwardRef<AuraOverlayHandle, AuraOverlayProps>(
  ({ isActive, children, className = '' }, ref) => {
    const [isPulsing, setIsPulsing] = useState(false);

    useImperativeHandle(ref, () => ({
      pulse: () => {
        setIsPulsing(true);
        setTimeout(() => setIsPulsing(false), 1400);
      }
    }));

    return (
      <div className={`relative ${className}`}>
        {children}

        {/* Ethereal Flow: 空灵流动光环 */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-lg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <svg className="absolute inset-0 w-full h-full overflow-visible">
                {/* 1. Dim Track: 暗淡的基础轨道 */}
                <rect
                  width="100%"
                  height="100%"
                  rx="8"
                  fill="none"
                  stroke="currentColor"
                  className="text-pixel-green"
                  style={{ opacity: 0.55 }}
                  strokeWidth="4"
                />

                {/* 2. Glow Layer: 高斯模糊发光层 */}
                <motion.rect
                  width="100%"
                  height="100%"
                  rx="8"
                  fill="none"
                  stroke="currentColor"
                  className="text-pixel-green"
                  strokeWidth="7"
                  pathLength="100"
                  strokeDasharray="12 8 12 8 12 8 12 8 12 8"
                  initial={{ strokeDashoffset: -37 }}
                  animate={{ strokeDashoffset: -137 }}
                  transition={{
                    duration: 14,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  style={{
                    filter: "blur(14px)",
                    opacity: 0.6
                  }}
                />

                {/* 3. Highlight Layer: 清晰的高光流动层 */}
                <motion.rect
                  width="100%"
                  height="100%"
                  rx="8"
                  fill="none"
                  stroke="currentColor"
                  className="text-pixel-green"
                  strokeWidth="5"
                  pathLength="100"
                  strokeDasharray="12 8 12 8 12 8 12 8 12 8"
                  initial={{ strokeDashoffset: -37 }}
                  animate={{ strokeDashoffset: -137 }}
                  transition={{
                    duration: 14,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  style={{
                    strokeLinecap: "round"
                  }}
                />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Volumetric Pulse: 体积脉冲内爆 */}
        <AnimatePresence>
          {isPulsing && (
            <motion.div
              className="absolute inset-0 pointer-events-none z-20 rounded-lg"
              initial={{ 
                opacity: 0, 
                boxShadow: "inset 0 0 40px 20px rgba(16, 185, 129, 0.12)", 
                filter: "blur(10px)" 
              }}
              animate={{ 
                opacity: [0, 0.45, 0.85, 0.55, 0],
                boxShadow: [
                  "inset 0 0 60px 30px rgba(16, 185, 129, 0.18)", 
                  "inset 0 0 100px 50px rgba(16, 185, 129, 0.35)", 
                  "inset 0 0 160px 80px rgba(255, 255, 255, 0.55), inset 0 0 200px 100px rgba(16, 185, 129, 0.95)", 
                  "inset 0 0 140px 70px rgba(16, 185, 129, 0.4)", 
                  "inset 0 0 120px 60px rgba(16, 185, 129, 0)" 
                ],
                filter: ["blur(10px)", "blur(14px)", "blur(6px)", "blur(10px)", "blur(12px)"]
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.4, ease: "easeInOut", times: [0, 0.25, 0.55, 0.8, 1] }}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }
);

AuraOverlay.displayName = 'AuraOverlay';
