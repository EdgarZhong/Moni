import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Save } from 'lucide-react';
import { clsx } from 'clsx';

interface NoteEditorProps {
  note: string;
  isLocked: boolean;
  onSave: (note: string) => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ 
  note, 
  isLocked, 
  onSave 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempNote, setTempNote] = useState(note);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 当外部 note 更新时，同步内部状态
  useEffect(() => {
    setTempNote(note);
  }, [note]);

  // 打开时重置 tempNote
  useEffect(() => {
    if (isOpen) {
      setTempNote(note);
    }
  }, [isOpen, note]);

  // 处理保存并关闭
  const handleSaveAndClose = () => {
    // 只有内容变化时才调用 onSave，避免无意义更新
    if (tempNote !== note) {
      onSave(tempNote);
    }
    setIsOpen(false);
  };

  return (
    <>
      {/* 
        Trigger: 触发器样式
        参考 CategorySelector 的设计：圆角、边框、呼吸动画
      */}
      <motion.div 
        onClick={() => !isLocked && setIsOpen(true)}
        className={clsx(
          "group cursor-pointer overflow-hidden transition-colors duration-300",
          "flex items-center px-2 h-10 w-full rounded-sm border", // 基础样式
          // Unlocked Style: 白色半透明边框，绿色文字(无呼吸)
          !isLocked && "border-white/50 hover:border-pixel-green",
          // Locked Style: 深灰边框，灰色文字
          isLocked && "border-gray-800 pointer-events-none opacity-50"
        )}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
          <div className={clsx(
            "font-mono text-xs truncate transition-colors duration-300",
            // Unlocked: Green Breathing (4s)
            !isLocked && (note ? "text-pixel-green animate-pulse [animation-duration:4s]" : "text-pixel-green/50 italic"),
            // Locked: Gray Solid
            isLocked && "text-gray-400"
          )}>
          {note || "ADD NOTE..."}
        </div>
      </motion.div>

      {/* Portal: 将弹窗渲染到 body，确保层级正确 */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isOpen && (
            <div className="fixed inset-0 z-[9999] flex flex-col items-center pt-4 px-4 pointer-events-none">
              
              {/* Backdrop: 背景遮罩 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                onClick={handleSaveAndClose}
                className="absolute inset-0 bg-black/40 backdrop-blur-[1px] pointer-events-auto"
              />

              {/* Panel: 编辑面板 */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: -20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: -20 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className={clsx(
                  "pointer-events-auto",
                  "relative w-full",
                  "top-4", // Position: top-4
                  "h-48",  // Height: h-48
                  "bg-card", // Panel Style
                  "border border-gray-600",
                  "shadow-[0_0_15px_rgba(255,255,255,0.05)]",
                  "rounded-sm",
                  "flex flex-col overflow-hidden"
                )}
                onClick={(e) => e.stopPropagation()} // 防止点击面板触发背景关闭
              >
                {/* Header: 简单的标题栏 */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700/50 bg-white/5">
                  <span className="font-pixel text-[10px] text-pixel-green tracking-wider opacity-80">
                    EDIT NOTE
                  </span>
                  {/* 这里不再放置关闭按钮，操作区移动到右下角 */}
                </div>

                {/* Textarea: 编辑区域 */}
                <div className="flex-1 relative p-3">
                  <textarea
                    ref={textareaRef}
                    value={tempNote}
                    onChange={(e) => setTempNote(e.target.value)}
                    className="w-full h-full bg-transparent text-pixel-green font-mono text-sm resize-none outline-none placeholder:text-pixel-green/30"
                    placeholder="ENTER NOTE..."
                    autoFocus
                  />
                </div>

                {/* Action Bar: 底部操作栏 */}
                <div className="absolute bottom-3 right-3 flex justify-end">
                  <button
                    onClick={handleSaveAndClose}
                    className="p-2 text-pixel-green hover:text-white transition-colors"
                    title="Save"
                  >
                    <Save size={18} />
                  </button>
                </div>

              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
