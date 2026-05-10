import { C } from './config';

interface HomeHintCardProps {
  visible: boolean;
  icon?: string;
  title?: string;
  description?: string;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  onClose: () => void;
}

/**
 * HomeHintCard - 首页中部情景提示卡
 *
 * 这是情景提示系统的独立表现层模块：
 * 1. 页面容器只负责把结构化读模型传进来
 * 2. 组件本身不再内联在其他大文件里
 * 3. 业务判断、排序、完成态选择都不放在这里
 */
export function HomeHintCard({
  visible,
  icon = '💡',
  title,
  description,
  actionLabel,
  onAction,
  onClose,
}: HomeHintCardProps) {
  if (!visible || !title || !description) {
    return null;
  }

  return (
    <div
      className="fi"
      style={{
        margin: '6px 16px',
        background: C.warmBg,
        border: `1.5px solid ${C.warmBd}`,
        borderRadius: 10,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#8B5E2B', fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 10, color: '#A07040', lineHeight: 1.45 }}>{description}</div>
      </div>

      {actionLabel && onAction ? (
        <button
          onClick={onAction}
          style={{
            fontSize: 11,
            color: '#8B5E2B',
            fontWeight: 600,
            background: C.white,
            border: '1px solid #E0C09A',
            borderRadius: 6,
            padding: '3px 10px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {actionLabel}
        </button>
      ) : null}

      <button
        onClick={onClose}
        aria-label="关闭提示"
        style={{
          fontSize: 14,
          color: '#CCC',
          cursor: 'pointer',
          background: 'transparent',
          border: 'none',
          padding: 0,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
