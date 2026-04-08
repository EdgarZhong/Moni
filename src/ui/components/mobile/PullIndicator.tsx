import React from 'react';
import { motion } from 'framer-motion';

interface PullIndicatorProps {
  /** 下拉进度 (0-1) */
  progress: number;
  /** 是否已触发（达到阈值） */
  isTriggered: boolean;
}

/**
 * [下拉指示器] 组件
 * 下拉过程中显示在 Header 下方的绿色像素指示器
 * 三个像素点随下拉距离增大间距和亮度
 * 达到阈值时收拢为横线
 *
 * 设计规范：
 * - 常态隐藏在 Header 下方
 * - 下拉中：显示设置图标 + 3个垂直像素点，间距和亮度随 progress 变化
 * - 触发态：三点收拢为横线，图标放大
 */
export const PullIndicator: React.FC<PullIndicatorProps> = ({
  progress,
  isTriggered
}) => {
  // 像素点间距：从 4px 到 12px
  const gap = 4 + progress * 8;
  // 亮度：从 0.3 到 1
  const opacity = 0.3 + progress * 0.7;
  // 发光强度
  const glowOpacity = progress * 0.8;
  // 图标显现进度：从 0.2 开始显现
  const iconOpacity = progress < 0.2 ? 0 : (progress - 0.2) * 1.25;
  // 图标缩放
  const iconScale = 0.8 + progress * 0.4;

  // 避免在 progress 为 0 时渲染不必要的内容
  if (progress <= 0) return null;

  // 计算指示器位置：基于下拉进度，出现在下拉创造的空间中
  // PULL_THRESHOLD = 80px，progress = deltaY / 80
  // 指示器位置跟随下拉距离，但稍微偏上一点
  const pullDistance = progress * 80; // 实际下拉距离（像素）
  const indicatorY = Math.max(8, pullDistance - 40); // 最小 8px，跟随下拉位置但偏上

  return (
    <div
      className="fixed left-0 right-0 flex flex-col items-center justify-start pointer-events-none z-50"
      style={{
        willChange: 'transform, opacity',
        top: `${indicatorY}px`,
        transition: 'top 0.03s linear'
      }}
    >
      {/* 设置图标 - 下拉时逐渐显现 */}
      <motion.div
        className="mb-2"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: isTriggered ? 1 : iconOpacity,
          scale: isTriggered ? 1.1 : iconScale,
          rotate: isTriggered ? 90 : progress * 45
        }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      >
        {/* 3x3 像素风格的设置/齿轮图标 */}
        <div className="grid grid-cols-3 gap-[2px] w-6 h-6">
          {/* 第一行：点 空 点 */}
          <div className="w-full h-full bg-pixel-green rounded-[1px]" style={{ opacity: 0.8, boxShadow: `0 0 ${4 + progress * 4}px rgba(16,185,129,${glowOpacity})` }} />
          <div className="w-full h-full bg-transparent" />
          <div className="w-full h-full bg-pixel-green rounded-[1px]" style={{ opacity: 0.8, boxShadow: `0 0 ${4 + progress * 4}px rgba(16,185,129,${glowOpacity})` }} />
          {/* 第二行：空 点 空 */}
          <div className="w-full h-full bg-transparent" />
          <div className="w-full h-full bg-pixel-green rounded-[1px]" style={{ opacity: 1, boxShadow: `0 0 ${6 + progress * 6}px rgba(16,185,129,${glowOpacity})` }} />
          <div className="w-full h-full bg-transparent" />
          {/* 第三行：点 空 点 */}
          <div className="w-full h-full bg-pixel-green rounded-[1px]" style={{ opacity: 0.8, boxShadow: `0 0 ${4 + progress * 4}px rgba(16,185,129,${glowOpacity})` }} />
          <div className="w-full h-full bg-transparent" />
          <div className="w-full h-full bg-pixel-green rounded-[1px]" style={{ opacity: 0.8, boxShadow: `0 0 ${4 + progress * 4}px rgba(16,185,129,${glowOpacity})` }} />
        </div>
      </motion.div>

      {/* 下拉进度指示器 */}
      <motion.div
        className="flex flex-col items-center"
        style={{ gap: isTriggered ? 2 : gap }}
        animate={{
          gap: isTriggered ? 2 : gap
        }}
        transition={{ duration: 0.12, ease: "easeOut" }}
      >
        {/* 三个像素点或收拢横线 */}
        {isTriggered ? (
          // 触发态：横线
          <motion.div
            initial={{ width: 6, height: 6 }}
            animate={{ width: 32, height: 2 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="bg-pixel-green shadow-[0_0_8px_rgba(16,185,129,0.8)]"
            style={{ willChange: 'width, height' }}
          />
        ) : (
          // 下拉态：三个像素点
          <>
            {[0, 1, 2].map((index) => (
              <motion.div
                key={index}
                className="w-1.5 h-1.5 bg-pixel-green"
                style={{
                  opacity: opacity * (0.5 + index * 0.25),
                  boxShadow: `0 0 ${4 + progress * 4}px rgba(16,185,129,${glowOpacity})`
                }}
                animate={{
                  scale: progress > 0.8 ? 1 + (progress - 0.8) * 2 : 1
                }}
                transition={{ duration: 0.08 }}
              />
            ))}
          </>
        )}
      </motion.div>

      {/* 提示文字 - 从早期就开始渐显，始终显示 [SETTINGS] */}
      <motion.div
        className="mt-2 text-[8px] font-mono tracking-wider"
        initial={{ opacity: 0, y: 5 }}
        animate={{
          opacity: progress > 0.3 ? (progress - 0.3) * 1.4 : 0,
          y: 0,
          color: isTriggered ? '#10b981' : `rgba(107,114,128,${0.5 + progress * 0.5})`
        }}
        transition={{ duration: 0.2 }}
      >
        [SETTINGS]
      </motion.div>
    </div>
  );
};
