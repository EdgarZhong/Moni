import { C, BOTTOM_NAV_PADDING_BOTTOM } from "./config";
import type { ControlUpdateRef } from "./components";

// ──────────────────────────────────────────────
// 导航图标（仅 BottomNav 内部使用）
// ──────────────────────────────────────────────

function NavIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 52 52">
      <path d="M12 40C12 40 12 16 14.5 12C16 10 17 10.5 23 24C23 24 24 26.5 25 24C26 21.5 29 10.5 30.5 12C32 13.5 33 40 33 40" stroke="#F5F0EB" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="39" cy="13" r="4.4" fill={C.coral} opacity=".88" />
      <circle cx="31" cy="7.2" r="3" fill={C.blue} opacity=".76" />
      <rect x="34" y="5.1" width="4.6" height="4.6" rx="1" fill={C.yellow} opacity=".68" transform="rotate(18 36.4 7.5)" />
    </svg>
  );
}

/** GearIcon — 齿轮图标（设置按钮） */
function GearIcon({ active }: { active?: boolean }) {
  const stroke = active ? C.dark : "#8E8E8E";
  const strokeWidth = active ? 1.9 : 1.6;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3.2" stroke={stroke} strokeWidth={strokeWidth} />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.92 4.92l1.56 1.56M17.52 17.52l1.56 1.56M2.5 12h2.2M19.3 12h2.2M4.92 19.08l1.56-1.56M17.52 6.48l1.56-1.56" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

/** NoteIcon — 记账图标 */
function NoteIcon({ active }: { active?: boolean }) {
  const strokeColor = active ? "#222" : "#8E8E8E";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="3" width="16" height="18" rx="3" stroke={strokeColor} strokeWidth="1.6" />
      <path d="M8 8h8M8 12h8M12 16h4" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 9v6M9 12h6" stroke={strokeColor} strokeWidth="1.4" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

// ──────────────────────────────────────────────
// BottomNav
// ──────────────────────────────────────────────

interface BottomNavProps {
  aiOn: boolean;
  aiStop: boolean;
  controlOpen: boolean;
  controlHit: string | null;
  onStartControl: (clientY: number, pointerId: number) => void;
  onEndControl: () => void;
  onCancelControl: () => void;
  onUpdateControlHit: ControlUpdateRef;
  /** 点击设置按钮的回调 */
  onSettings?: () => void;
  /** 点击记账按钮的回调 */
  onBookkeeping?: () => void;
  /** 短按中央首页按钮的导航回调（在非首页时使用） */
  onHomeNavigate?: () => void;
  /** 当前激活页面 */
  activePage?: 'home' | 'entry' | 'settings';
}

/**
 * BottomNav — 底部三栏导航
 *
 * 中央按钮：
 * - 短按：回到首页主舞台
 * - 长按 420ms：弹出 AI 控制条，手指不离屏滑选开启/关闭
 *
 * 手势修复规范（来自 Moni CLAUDE.md）：
 * - onPointerMove 绑在父容器上（指针已被父容器隐式捕获）
 * - 控制条子元素不绑 onPointerMove（避免隐式捕获失效）
 * - 移除 onPointerLeave（防止误取消）
 */
export function BottomNav({ aiOn, aiStop, controlOpen, controlHit, onStartControl, onEndControl, onCancelControl, onUpdateControlHit, onSettings, onBookkeeping, onHomeNavigate, activePage = 'home' }: BottomNavProps) {
  const isEntryActive = activePage === 'entry';
  const isSettingsActive = activePage === 'settings';

  // 短按中央按钮（控制条未打开时）的处理：在非首页可导航回首页
  const handleCenterPointerUp = () => {
    const wasOpen = controlOpen;
    onEndControl();
    if (!wasOpen && onHomeNavigate) {
      onHomeNavigate();
    }
  };

  return (
    <div style={{ background: C.white, borderTop: `1.5px solid ${C.border}`, paddingTop: 3, paddingBottom: BOTTOM_NAV_PADDING_BOTTOM, display: "flex", justifyContent: "space-around", alignItems: "flex-end", flexShrink: 0, zIndex: 300, position: "relative" }}>
      {(aiOn || aiStop) ? (
        <style>{`
          @keyframes rbs {
            0%   { box-shadow: 0 0 0 2.5px ${C.coral},0 0 12px ${C.coral}44; }
            25%  { box-shadow: 0 0 0 2.5px ${C.yellow},0 0 12px ${C.yellow}44; }
            50%  { box-shadow: 0 0 0 2.5px ${C.blue},0 0 12px ${C.blue}44; }
            75%  { box-shadow: 0 0 0 2.5px ${C.mint},0 0 12px ${C.mint}44; }
            100% { box-shadow: 0 0 0 2.5px ${C.coral},0 0 12px ${C.coral}44; }
          }
          .ag {
            animation: rbs 3s linear infinite;
          }
        `}</style>
      ) : null}

      {/* 左：设置 */}
      <div style={{ textAlign: "center", padding: "4px 16px", cursor: "pointer" }} onClick={onSettings}>
        <GearIcon active={isSettingsActive} />
        <div style={{ fontSize: 10, color: isSettingsActive ? C.dark : C.muted, fontWeight: isSettingsActive ? 700 : 400, marginTop: 2 }}>设置</div>
      </div>

      {/* 中：品牌按钮 + AI 控制条 */}
      <div
        style={{ position: "relative", textAlign: "center", cursor: "pointer", touchAction: "none" }}
        onPointerDown={(event) => onStartControl(event.clientY, event.pointerId)}
        onPointerMove={(event) => {
          if (controlOpen) {
            onUpdateControlHit.move(event.clientY);
          }
        }}
        onPointerUp={handleCenterPointerUp}
        onPointerCancel={onCancelControl}
      >
        {controlOpen && (
          <div
            ref={onUpdateControlHit.ref}
            style={{ position: "absolute", bottom: 62, left: "50%", transform: "translateX(-50%)", width: 56, height: 108, borderRadius: 28, overflow: "hidden", border: `2px solid ${C.dark}`, display: "flex", flexDirection: "column", boxShadow: "0 6px 20px rgba(0,0,0,.15)", zIndex: 30, background: C.white }}
          >
            <div style={{ flex: 1, background: controlHit === "开启" ? C.mint : C.white, color: controlHit === "开启" ? C.white : C.mint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>
              开启
            </div>
            <div style={{ flex: 1, background: controlHit === "关闭" ? C.coral : C.white, color: controlHit === "关闭" ? C.white : C.coral, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
              关闭
            </div>
          </div>
        )}

        <div style={{ marginTop: -12 }}>
          <div
            className={aiOn || aiStop ? "ag" : ""}
            style={{ width: 52, height: 52, background: C.dark, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(2deg)", transition: "box-shadow .6s", boxShadow: aiStop ? `0 0 0 2.5px ${C.amber},0 0 10px ${C.amber}44` : undefined }}
          >
            <NavIcon />
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, marginTop: 3, color: aiOn ? (aiStop ? C.amber : C.mint) : C.dark }}>
            {aiOn ? (aiStop ? "停止中…" : "运行中") : "首页"}
          </div>
        </div>
      </div>

      {/* 右：记账 */}
      <div style={{ textAlign: "center", padding: "4px 16px", cursor: "pointer" }} onClick={onBookkeeping}>
        <NoteIcon active={isEntryActive} />
        <div style={{ fontSize: 10, color: isEntryActive ? C.dark : C.muted, fontWeight: isEntryActive ? 700 : 400, marginTop: 2 }}>记账</div>
      </div>
    </div>
  );
}
