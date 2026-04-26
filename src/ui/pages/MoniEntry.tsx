/**
 * MoniEntry — Moni 记账页主容器
 *
 * 迁移自 Moni-UI-Prototype/src/pages/MoniEntryPrototype.jsx
 * 变更：JSX → TSX，Mock 数据替换为真实逻辑层，BottomNav 复用首页组件。
 *
 * 设计权威：Moni_Entry_Page_Spec_v1.md + Moni_Entry_Page_Integration_Spec.md
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APP_HEADER_MIN_HEIGHT,
  APP_HEADER_PADDING_TOP,
  BOTTOM_NAV_PADDING_BOTTOM,
  C,
  CAT,
  LEDGER_HEADER_CONTROL_WIDTH,
  PHONE_FRAME_HEIGHT_CSS,
  PHONE_FRAME_WIDTH_CSS,
} from "@ui/features/moni-home/config";
import { Decor, GearIcon, LedgerHeaderControl, Logo, NavIcon, NoteIcon } from "@ui/features/moni-home/components";
import { useMoniEntryData } from "@ui/hooks/useMoniEntryData";
import { useKeyboard } from "@ui/hooks/useKeyboard";
import { appFacade } from "@bootstrap/appFacade";
import type { ManualEntryInput } from "@logic/application/services/ManualEntryManager";
import type { BillImportSource } from "@shared/types";

// ──────────────────────────────────────────────
// 子组件
// ──────────────────────────────────────────────

interface DecorShape {
  id: string;
  type: "circle" | "square" | "triangle" | "line";
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
  rotation?: number;
}

interface ImportNotice {
  kind: "probing" | "importing" | "success" | "error";
  message: string;
}

interface PendingPasswordImport {
  source: BillImportSource;
  files: File[];
  password: string;
  state: "idle" | "invalid" | "submitting";
}

const BILL_IMPORT_SOURCE_LABEL: Record<BillImportSource, string> = {
  wechat: "微信",
  alipay: "支付宝",
};

function ImportCard({
  onImport,
  notice,
}: {
  onImport: (source: BillImportSource) => void;
  notice: ImportNotice | null;
}) {
  const decorShapes: DecorShape[] = useMemo(
    () => [
      { id: "c1", type: "circle", x: 36, y: 28, size: 10, color: C.coral, opacity: 0.14 },
      { id: "c2", type: "circle", x: 326, y: 74, size: 8, color: C.blue, opacity: 0.14 },
      { id: "s1", type: "square", x: 300, y: 22, size: 8, color: C.yellow, opacity: 0.12, rotation: 18 },
      { id: "l1", type: "line", x: 250, y: 48, size: 11, color: C.mint, opacity: 0.12 },
      { id: "t1", type: "triangle", x: 102, y: 88, size: 10, color: C.amber, opacity: 0.1 },
    ],
    [],
  );

  return (
    <div
      style={{
        margin: "0 16px",
        background: C.white,
        border: `2px solid ${C.dark}`,
        borderRadius: 16,
        padding: "20px 18px 14px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }} width="100%" height="100%">
        {decorShapes.map((shape) => {
          if (shape.type === "circle") {
            return <circle key={shape.id} cx={shape.x} cy={shape.y} r={shape.size / 2} fill={shape.color} opacity={shape.opacity} />;
          }
          if (shape.type === "square") {
            return (
              <rect
                key={shape.id}
                x={shape.x}
                y={shape.y}
                width={shape.size}
                height={shape.size}
                rx="1.5"
                fill={shape.color}
                opacity={shape.opacity}
                transform={`rotate(${shape.rotation ?? 0} ${shape.x + shape.size / 2} ${shape.y + shape.size / 2})`}
              />
            );
          }
          if (shape.type === "triangle") {
            return (
              <polygon
                key={shape.id}
                points={`${shape.x},${shape.y + shape.size} ${shape.x + shape.size / 2},${shape.y} ${shape.x + shape.size},${shape.y + shape.size}`}
                fill={shape.color}
                opacity={shape.opacity}
              />
            );
          }
          return <line key={shape.id} x1={shape.x} y1={shape.y} x2={shape.x + shape.size * 1.6} y2={shape.y} stroke={shape.color} strokeWidth="2" strokeLinecap="round" opacity={shape.opacity} />;
        })}
      </svg>

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: `linear-gradient(135deg, ${C.mint}24, ${C.blue}22)`,
              border: `1.5px solid ${C.mint}33`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="52" height="52" viewBox="0 0 80 80" fill="none">
              <rect x="16" y="12" width="42" height="52" rx="6" fill={C.white} stroke={C.dark} strokeWidth="2" />
              <rect x="16" y="12" width="42" height="14" rx="6" fill={C.warmBg} stroke={C.dark} strokeWidth="2" />
              <line x1="24" y1="36" x2="50" y2="36" stroke={C.border} strokeWidth="2" strokeLinecap="round" />
              <line x1="24" y1="43" x2="44" y2="43" stroke={C.border} strokeWidth="2" strokeLinecap="round" />
              <line x1="24" y1="50" x2="48" y2="50" stroke={C.border} strokeWidth="2" strokeLinecap="round" />
              <circle cx="52" cy="52" r="13" fill={C.mint} opacity=".9" />
              <path d="M52 45v12M47 53l5 5 5-5" stroke={C.white} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="22" r="4" fill={C.coral} opacity=".5" />
              <rect x="60" y="8" width="7" height="7" rx="1" fill={C.yellow} opacity=".55" transform="rotate(18 63.5 11.5)" />
              <circle cx="66" cy="38" r="3" fill={C.blue} opacity=".4" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.dark, marginBottom: 4, fontFamily: "'Nunito',sans-serif" }}>导入你的账单</div>
            <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.55 }}>从微信或支付宝导出消费记录，Moni 会自动帮你分类整理</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div
            onClick={() => onImport("wechat")}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "12px 14px", borderRadius: 12, background: "#F0FFF0",
              border: "1.5px solid #7BB97B", color: "#3B7A3B", fontSize: 13, fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 18 }}>微</span>
            微信账单
          </div>
          <div
            onClick={() => onImport("alipay")}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "12px 14px", borderRadius: 12, background: "#F0F5FF",
              border: "1.5px solid #6B9BD2", color: "#2B5EA7", fontSize: 13, fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 18 }}>支</span>
            支付宝账单
          </div>
        </div>

        {notice ? (
          <ImportCardNotice notice={notice} />
        ) : (
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "8px 0", borderRadius: 8, background: C.warmBg,
              color: "#8B5E2B", fontSize: 12, fontWeight: 600,
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${C.amber}`, color: C.amber, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>i</span>
            不知道怎么导出账单？查看导入指南
            <span style={{ color: "#CBA870" }}>›</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ImportCardNotice({ notice }: { notice: ImportNotice }) {
  const tone = notice.kind === "success"
    ? { background: C.greenBg, color: C.greenText, accent: C.mint, symbol: "✓" }
    : notice.kind === "error"
      ? { background: C.orangeBg, color: "#A35316", accent: C.amber, symbol: "!" }
      : { background: C.blueBg, color: "#2D5EA7", accent: C.blue, symbol: "…" };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "8px 10px",
        borderRadius: 8,
        background: tone.background,
        color: tone.color,
        fontSize: 12,
        fontWeight: 600,
        minHeight: 32,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: `1.5px solid ${tone.accent}`,
          color: tone.accent,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          flexShrink: 0,
        }}
      >
        {tone.symbol}
      </span>
      <span style={{ textAlign: "center", lineHeight: 1.35 }}>{notice.message}</span>
    </div>
  );
}

function ImportPasswordPage({
  pending,
  onBack,
  onChangePassword,
}: {
  pending: PendingPasswordImport;
  onBack: () => void;
  onChangePassword: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const platformName = BILL_IMPORT_SOURCE_LABEL[pending.source];

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        background: C.bg,
        display: "flex",
        flexDirection: "column",
        animation: "billImportSlideIn 220ms ease-out",
      }}
    >
      <style>{`
        @keyframes billImportSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <header style={{ padding: "18px 16px 12px", display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="返回记账页"
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            border: `1.5px solid ${C.border}`,
            background: C.white,
            color: C.dark,
            fontSize: 18,
            fontWeight: 900,
          }}
        >
          ‹
        </button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.dark, fontFamily: "'Nunito',sans-serif" }}>{platformName}账单密码</div>
          <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>输入导出压缩包里的 6 位数字密码</div>
        </div>
      </header>

      <main style={{ flex: 1, padding: "10px 18px 18px" }}>
        <section
          style={{
            background: C.white,
            border: `2px solid ${pending.state === "invalid" ? C.amber : C.dark}`,
            borderRadius: 22,
            padding: "22px 18px 18px",
            boxShadow: "0 8px 0 rgba(31, 36, 48, 0.08)",
          }}
        >
          <div style={{ width: 72, height: 72, borderRadius: 22, background: C.blueBg, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 36, height: 44, border: `2px solid ${C.dark}`, borderRadius: 8, background: C.white, position: "relative" }}>
              <div style={{ position: "absolute", left: 7, right: 7, top: 12, height: 2, background: C.border, borderRadius: 2 }} />
              <div style={{ position: "absolute", left: 7, right: 11, top: 21, height: 2, background: C.border, borderRadius: 2 }} />
              <div style={{ position: "absolute", right: -12, bottom: -10, width: 26, height: 26, borderRadius: 13, background: C.mint, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontWeight: 900 }}>
                #
              </div>
            </div>
          </div>

          <div style={{ textAlign: "center", fontSize: 15, fontWeight: 900, marginBottom: 6, color: C.dark }}>{platformName}账单压缩包已识别</div>
          <div style={{ textAlign: "center", fontSize: 11, lineHeight: 1.55, color: C.sub, marginBottom: 18 }}>
            请输入导出账单时获得的 6 位数字密码。
          </div>

          <label style={{ display: "block", position: "relative", marginBottom: 10 }}>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              value={pending.password}
              maxLength={6}
              aria-label={`${platformName}账单压缩包密码`}
              onChange={(event) => onChangePassword(event.target.value)}
              disabled={pending.state === "submitting"}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                opacity: 0,
                border: 0,
                padding: 0,
                cursor: "text",
              }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  style={{
                    height: 42,
                    borderRadius: 12,
                    border: `1.5px solid ${pending.state === "invalid" ? "#D85F4A" : C.border}`,
                    background: C.warmBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.dark,
                    fontSize: 18,
                    fontWeight: 900,
                    fontFamily: "'Space Mono', monospace",
                    transition: "border-color 160ms ease",
                  }}
                >
                  {pending.password[index] ?? ""}
                </div>
              ))}
            </div>
          </label>

          <div style={{ minHeight: 18, textAlign: "center", fontSize: 11, fontWeight: 800, color: pending.state === "invalid" ? "#C94632" : C.muted }}>
            {pending.state === "submitting"
              ? "正在验证密码..."
              : pending.state === "invalid"
                ? "密码不正确，请重新输入"
                : " "}
          </div>
        </section>
      </main>
    </div>
  );
}

interface RecentReferenceDisplayEntry {
  id: string;
  title: string;
  amount: number;
  category: string | null;
  emoji: string;
  categoryColor: string;
  categoryBg: string;
  direction: "in" | "out";
}

function RecentReferenceList({ entries }: { entries: RecentReferenceDisplayEntry[] }) {
  if (!entries.length) {
    return (
      <div
        style={{
          margin: "0 16px", padding: "24px 16px", textAlign: "center",
          borderRadius: 14, border: `1.5px dashed ${C.border}`, background: "#FDFCFA",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
          暂无参考记录
          <br />
          <span style={{ fontSize: 12, color: C.muted }}>该区域会读取最新一天的两条参考记录</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        margin: "0 16px", background: C.white,
        border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "10px 14px",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 8 }}>最近流水</div>
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          style={{
            display: "flex", alignItems: "center", padding: "8px 0",
            borderBottom: index < entries.length - 1 ? `0.5px solid ${C.line}` : "none",
          }}
        >
          <div
            style={{
              width: 32, height: 32, borderRadius: 10, background: entry.categoryBg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, marginRight: 10, flexShrink: 0,
            }}
          >
            {entry.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{entry.title}</div>
            <div style={{ fontSize: 10, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  padding: "0 5px", borderRadius: 999, background: entry.categoryBg,
                  color: entry.categoryColor, fontSize: 9, fontWeight: 600,
                }}
              >
                {entry.category ?? "待分类"}
              </span>
            </div>
          </div>
          <div
            style={{
              fontSize: 14, fontWeight: 600, flexShrink: 0,
              color: entry.direction === "out" ? C.coral : C.mint,
              fontFamily: "'Space Mono',monospace",
            }}
          >
            {entry.direction === "out" ? "−" : "+"}¥{entry.amount}
          </div>
        </div>
      ))}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke={C.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 6l3 3" stroke={C.bg} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function EntryButton({ pressed, onClick, onPointerDown }: { pressed: boolean; onClick: () => void; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div style={{ margin: "0 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ fontSize: 11, color: C.sub, textAlign: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v8M5 7l3 3 3-3" stroke={C.sub} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 12h10" stroke={C.sub} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          按住拖入分类 · 或直接点击
        </span>
      </div>

      <div
        onClick={onClick}
        onPointerDown={onPointerDown}
        style={{
          minWidth: 186, padding: "15px 28px", borderRadius: 16, textAlign: "center",
          background: C.dark, color: C.bg, fontSize: 15, fontWeight: 800,
          fontFamily: "'Nunito',sans-serif", border: `2px solid ${C.dark}`,
          position: "relative", overflow: "hidden",
          boxShadow: pressed ? "0 2px 10px rgba(34,34,34,.12)" : "0 4px 16px rgba(34,34,34,.18)",
          transform: pressed ? "scale(0.97)" : "scale(1)",
          transition: "transform .15s, box-shadow .15s",
          userSelect: "none", touchAction: "none", cursor: "pointer",
        }}
      >
        <span style={{ position: "absolute", left: 16, top: 9, width: 8, height: 8, borderRadius: "50%", background: C.coral, opacity: 0.55 }} />
        <span style={{ position: "absolute", left: 28, top: 7, width: 5, height: 5, borderRadius: "50%", background: C.blue, opacity: 0.45 }} />
        <span style={{ position: "absolute", left: 24, top: 17, width: 5, height: 5, borderRadius: 1, background: C.yellow, opacity: 0.42, transform: "rotate(20deg)" }} />
        <span style={{ position: "absolute", right: 21, bottom: 10, width: 6, height: 6, borderRadius: "50%", background: C.mint, opacity: 0.36 }} />

        <span style={{ position: "relative", zIndex: 1, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <PencilIcon />
          记一笔
        </span>
      </div>
    </div>
  );
}

interface CategoryOverlayProps {
  visible: boolean;
  hoverCat: string | null;
  dragPoint: { x: number; y: number } | null;
  isDragging: boolean;
  onSelect: (category: string) => void;
  onClose: () => void;
  availableCategories: string[];
}

function CategoryOverlay({ visible, hoverCat, dragPoint, isDragging, onSelect, onClose, availableCategories }: CategoryOverlayProps) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50,
        display: "flex", flexDirection: "column",
        padding: 16, touchAction: "none", overflow: "hidden",
      }}
    >
      <div style={{ fontSize: 14, color: C.white, fontWeight: 700, textAlign: "center", marginTop: 12, marginBottom: 10 }}>
        拖放到分类中，开始记一笔
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 4px", overflowY: "auto", width: "100%" }}>
        {availableCategories.map((category) => {
          const meta = CAT[category];
          if (!meta) return null;
          return (
            <div
              key={category}
              data-drop-category={category}
              onClick={() => onSelect(category)}
              style={{
                background: C.white,
                border: `2.5px solid ${hoverCat === category ? meta.color : C.border}`,
                borderRadius: 12, padding: "12px 8px", textAlign: "center",
                transform: hoverCat === category ? "scale(1.05)" : "scale(1)",
                transition: "all .2s", cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 2 }}>{meta.icons[0]}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{category}</div>
            </div>
          );
        })}
      </div>

      <div
        onClick={onClose}
        style={{ position: "absolute", right: 14, top: 12, color: C.white, fontSize: 18, cursor: "pointer" }}
      >
        ×
      </div>

      {isDragging && dragPoint && (
        <div style={{ position: "fixed", left: dragPoint.x, top: dragPoint.y, transform: "translate(-50%, -115%)", width: 48, height: 40, borderRadius: 12, background: C.dark, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 24px rgba(0,0,0,.3)", pointerEvents: "none" }}>
          <PencilIcon />
          <div style={{ position: "absolute", top: -4, right: -4 }}>
            <svg width="16" height="14" viewBox="0 0 16 14">
              <circle cx="10" cy="5" r="3.2" fill={C.coral} opacity=".85" />
              <circle cx="5" cy="3" r="2.2" fill={C.blue} opacity=".7" />
              <rect x="8" y="1" width="3" height="3" rx=".6" fill={C.yellow} opacity=".6" transform="rotate(18 9.5 2.5)" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

interface EntryFormPanelProps {
  visible: boolean;
  category: string | null;
  directionRef: React.MutableRefObject<"in" | "out">;
  onSave: (entry: ManualEntryInput) => void;
  onClose: () => void;
}

function EntryFormPanel({ visible, category, directionRef, onSave, onClose }: EntryFormPanelProps) {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"in" | "out">(directionRef.current);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!visible) return;
    setAmount("");
    setDirection(directionRef.current);
    setSubject("");
    setDescription("");
    setDate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    });
    setTimeout(() => amountRef.current?.focus(), 220);
  }, [visible, category, directionRef]);

  if (!visible || !category) return null;

  const meta = CAT[category];
  if (!meta) return null;
  const canSave = amount && Number(amount) > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 55,
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
        overflow: "hidden",
        animation: "fadeIn .2s ease",
      }}
    >
      <div style={{ width: "100%", margin: "0 auto", padding: "0 12px", boxSizing: "border-box" }}>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: C.white, borderRadius: "20px 20px 0 0",
            padding: "20px 20px 24px", border: `2px solid ${C.dark}`, borderBottom: "none",
            animation: "slideUp .3s cubic-bezier(.4,0,.2,1)",
            maxHeight: "75dvh", overflowY: "auto", overflowX: "hidden",
            width: "100%", boxSizing: "border-box",
          }}
        >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border }} />
        </div>

        <div
          style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 18,
            padding: "10px 14px", borderRadius: 12,
            background: meta.bg, border: `1.5px solid ${meta.color}22`,
          }}
        >
          <span style={{ fontSize: 28 }}>{meta.icons[0]}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: meta.color }}>{category}</div>
            <div style={{ fontSize: 11, color: C.sub }}>分类已选定，填写详情</div>
          </div>
        </div>

        <div
          style={{
            marginBottom: 16, padding: "16px", borderRadius: 14,
            background: "#FAFAF8", border: `1.5px solid ${C.border}`,
          }}
        >
          <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, fontWeight: 600 }}>金额 *</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: direction === "out" ? C.coral : C.mint, fontFamily: "'Space Mono',monospace" }}>
              {direction === "out" ? "−¥" : "+¥"}
            </span>
            <input
              className="entry-amount-input"
              ref={amountRef}
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                flex: 1, minWidth: 0, fontSize: 32, fontWeight: 700, color: C.dark,
                fontFamily: "'Space Mono',monospace", border: "none", background: "transparent",
                outline: "none", padding: 0, WebkitAppearance: "none",
                MozAppearance: "textfield" as React.CSSProperties["MozAppearance"],
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 0, marginTop: 12, borderRadius: 10, overflow: "hidden", border: `1.5px solid ${C.border}` }}>
            {([
              { key: "out" as const, label: "支出", color: C.coral },
              { key: "in" as const, label: "收入", color: C.mint },
            ]).map((option) => (
              <div
                key={option.key}
                onClick={() => { setDirection(option.key); directionRef.current = option.key; }}
                style={{
                  flex: 1, padding: "8px 0", textAlign: "center", fontSize: 13,
                  fontWeight: direction === option.key ? 700 : 500,
                  background: direction === option.key ? option.color : C.white,
                  color: direction === option.key ? C.white : C.muted,
                  cursor: "pointer", transition: "all .2s",
                }}
              >
                {option.label}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4, fontWeight: 600 }}>
              主题 <span style={{ fontWeight: 400, color: C.muted }}>（选填）</span>
            </div>
            <input
              className="entry-form-input"
              type="text"
              placeholder="这笔花在哪了？比如「火锅聚餐」"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10,
                border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4, fontWeight: 600 }}>
              补充说明 <span style={{ fontWeight: 400, color: C.muted }}>（选填）</span>
            </div>
            <input
              className="entry-form-input"
              type="text"
              placeholder="周年聚餐，比较贵的餐厅"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10,
                border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4, fontWeight: 600 }}>
              日期 <span style={{ fontWeight: 400, color: C.muted }}>（默认今天）</span>
            </div>
            <input
              className="entry-form-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10,
                border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div
          onClick={() => {
            if (!canSave) return;
            onSave({
              amount: Number(amount),
              direction,
              category,
              subject: subject.trim() || undefined,
              description: description.trim() || undefined,
              date: date ? `${date} ${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}:${String(new Date().getSeconds()).padStart(2, "0")}` : undefined,
            });
          }}
          style={{
            padding: "14px 0", borderRadius: 14, textAlign: "center", fontSize: 15, fontWeight: 700,
            cursor: canSave ? "pointer" : "not-allowed",
            background: canSave ? C.dark : "#CCC",
            color: canSave ? C.bg : "#999",
            border: canSave ? `2px solid ${C.dark}` : "2px solid #CCC",
            transition: "all .2s", position: "relative", overflow: "hidden",
          }}
        >
          {canSave && (
            <>
              <span style={{ position: "absolute", left: 16, top: 8, width: 6, height: 6, borderRadius: "50%", background: C.coral, opacity: 0.6 }} />
              <span style={{ position: "absolute", left: 26, top: 5, width: 4, height: 4, borderRadius: "50%", background: C.blue, opacity: 0.5 }} />
              <span style={{ position: "absolute", right: 20, bottom: 8, width: 5, height: 5, borderRadius: 1, background: C.yellow, opacity: 0.5, transform: "rotate(18deg)" }} />
            </>
          )}
          记一笔
        </div>
        </div>
      </div>
    </div>
  );
}

interface SuccessToastEntry {
  amount: number;
  direction: "in" | "out";
  category: string;
}

function SuccessToast({ visible, entry }: { visible: boolean; entry: SuccessToastEntry | null }) {
  if (!visible || !entry) return null;

  return (
    <div
      style={{
        position: "absolute", top: 80, left: "50%", transform: "translateX(-50%)", zIndex: 60,
        background: C.white, borderRadius: 14, padding: "12px 20px",
        border: `2px solid ${C.dark}`, boxShadow: "0 8px 24px rgba(0,0,0,.15)",
        display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap",
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 10, background: C.mint, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>✓</span>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>已记录</div>
        <div style={{ fontSize: 11, color: C.sub }}>
          {entry.direction === "out" ? "−" : "+"}¥{entry.amount} · {entry.category}
        </div>
      </div>
    </div>
  );
}

function EntryBottomNav({ onOpenHome, onOpenSettings }: { onOpenHome: () => void; onOpenSettings: () => void }) {
  return (
    <div
      style={{
        background: C.white, borderTop: `1.5px solid ${C.border}`,
        paddingTop: 3, paddingBottom: BOTTOM_NAV_PADDING_BOTTOM,
        display: "flex", justifyContent: "space-around", alignItems: "flex-end",
        flexShrink: 0, zIndex: 20,
      }}
    >
      <div style={{ textAlign: "center", padding: "4px 16px", cursor: "pointer" }} onClick={onOpenSettings}>
        <GearIcon />
        <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>设置</div>
      </div>
      <div onClick={onOpenHome} style={{ position: "relative", textAlign: "center", cursor: "pointer" }}>
        <div style={{ marginTop: -12 }}>
          <div
            style={{
              width: 52, height: 52, background: C.dark, borderRadius: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              transform: "rotate(2deg)",
            }}
          >
            <NavIcon />
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, marginTop: 3, color: C.dark }}>首页</div>
        </div>
      </div>
      <div style={{ textAlign: "center", padding: "4px 16px" }}>
        <NoteIcon active />
        <div style={{ fontSize: 10, color: C.dark, fontWeight: 700, marginTop: 2 }}>记账</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 主组件
// ──────────────────────────────────────────────

type Phase = "idle" | "selecting" | "dragging" | "form";

interface MoniEntryProps {
  onNavigate: (page: "home" | "entry" | "settings") => void;
}

export default function MoniEntry({ onNavigate }: MoniEntryProps) {
  const {
    currentLedger,
    recentReferences,
    categoryDefinitions,
    actions,
  } = useMoniEntryData();

  const availableCategories = useMemo(
    () => categoryDefinitions.map((c) => c.key).filter((k) => k && k !== "uncategorized" && CAT[k]),
    [categoryDefinitions],
  );

  const displayReferences: RecentReferenceDisplayEntry[] = useMemo(
    () =>
      recentReferences.map((ref) => {
        const cat = ref.category;
        const meta = cat ? CAT[cat] : null;
        return {
          id: ref.id,
          title: ref.title,
          amount: ref.amount,
          category: cat,
          emoji: meta ? meta.icons[0] : "📝",
          categoryColor: meta ? meta.color : C.muted,
          categoryBg: meta ? meta.bg : "#F5F5F5",
          direction: ref.direction,
        };
      }),
    [recentReferences],
  );

  const [phase, setPhase] = useState<Phase>("idle");
  const [hoverCat, setHoverCat] = useState<string | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [toastEntry, setToastEntry] = useState<SuccessToastEntry | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [importNotice, setImportNotice] = useState<ImportNotice | null>(null);
  const [selectedImportSource, setSelectedImportSource] = useState<BillImportSource | null>(null);
  const [pendingPasswordImport, setPendingPasswordImport] = useState<PendingPasswordImport | null>(null);

  /**
   * 本轮 Android 真机修复要求首屏优先露出“记一笔”入口。
   * 因此这里暂时关闭“最近流水”参考区渲染，只保留实现以便后续再恢复。
   */
  const showRecentReferences = false;

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPointerDownRef = useRef(false);
  const longPressTriggeredRef = useRef(false);
  const pressStartRef = useRef({ x: 0, y: 0 });
  const hoverCatRef = useRef<string | null>(null);
  const directionRef = useRef<"in" | "out">("out");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setImportNoticeWithTimer = useCallback((nextNotice: ImportNotice | null, autoHideMs?: number) => {
    if (importNoticeTimerRef.current) {
      clearTimeout(importNoticeTimerRef.current);
      importNoticeTimerRef.current = null;
    }

    setImportNotice(nextNotice);

    if (nextNotice && autoHideMs) {
      importNoticeTimerRef.current = setTimeout(() => {
        setImportNotice(null);
        importNoticeTimerRef.current = null;
      }, autoHideMs);
    }
  }, []);

  const buildSourceNotice = useCallback((source: BillImportSource, action: string): ImportNotice => ({
    kind: action === "导入成功" ? "success" : action === "导入失败" ? "error" : action === "正在导入" ? "importing" : "probing",
    message: `${action}${BILL_IMPORT_SOURCE_LABEL[source]}账单`,
  }), []);

  const runBillImport = useCallback(async (files: File[], source: BillImportSource, password?: string) => {
    setImportNoticeWithTimer(buildSourceNotice(source, "正在导入"));
    try {
      const result = await appFacade.importBillFiles(files, { expectedSource: source, password });
      setImportNoticeWithTimer({
        kind: "success",
        message: `已导入 ${result.importedCount} 条${BILL_IMPORT_SOURCE_LABEL[source]}账单`,
      }, 3000);
    } catch (err) {
      console.error("[MoniEntry] Bill import failed:", err);
      setImportNoticeWithTimer({
        kind: "error",
        message: err instanceof Error ? err.message : "导入失败，请重新选择",
      }, 4500);
    }
  }, [buildSourceNotice, setImportNoticeWithTimer]);

  const probeAndImport = useCallback(async (files: File[], source: BillImportSource, password?: string) => {
    setImportNoticeWithTimer(buildSourceNotice(source, "正在识别"));
    const probe = await appFacade.probeBillImportFiles(files, { expectedSource: source, password });

    if (probe.status === "ready") {
      await runBillImport(files, source, password);
      return;
    }

    if (probe.status === "password_required") {
      setImportNoticeWithTimer(null);
      setPendingPasswordImport({
        source,
        files,
        password: "",
        state: probe.passwordState === "invalid" ? "invalid" : "idle",
      });
      return;
    }

    setImportNoticeWithTimer({
      kind: "error",
      message: `${probe.message}，请重新选择`,
    }, 4500);
  }, [buildSourceNotice, runBillImport, setImportNoticeWithTimer]);

  const handleImportClick = useCallback(async (source: BillImportSource) => {
    setSelectedImportSource(source);
    setPendingPasswordImport(null);
    setImportNoticeWithTimer(null);
    // 统一使用原生文件选择器 (Capacitor 会在 Android 上自动调起系统 Picker)
    fileInputRef.current?.click();
  }, [setImportNoticeWithTimer]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !selectedImportSource) return;

    try {
      await probeAndImport(Array.from(files), selectedImportSource);
    } catch (err) {
      console.error("[MoniEntry] Bill import probe failed:", err);
      setImportNoticeWithTimer({
        kind: "error",
        message: err instanceof Error ? err.message : "导入失败，请重新选择",
      }, 4500);
    } finally {
      // reset so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [probeAndImport, selectedImportSource, setImportNoticeWithTimer]);

  const closeImportPasswordPage = useCallback(() => {
    setPendingPasswordImport(null);
    setImportNoticeWithTimer(null);
  }, [setImportNoticeWithTimer]);

  const handleImportPasswordChange = useCallback((nextValue: string) => {
    const sanitizedValue = nextValue.replace(/\D/g, "").slice(0, 6);

    setPendingPasswordImport((current) => current ? {
      ...current,
      password: sanitizedValue,
      state: "idle",
    } : current);

    if (sanitizedValue.length !== 6) return;

    setPendingPasswordImport((current) => current ? { ...current, password: sanitizedValue, state: "submitting" } : current);

    void (async () => {
      const current = pendingPasswordImport;
      if (!current) return;

      try {
        const probe = await appFacade.probeBillImportFiles(current.files, {
          expectedSource: current.source,
          password: sanitizedValue,
        });

        if (probe.status === "password_required") {
          setPendingPasswordImport({
            source: current.source,
            files: current.files,
            password: "",
            state: "invalid",
          });
          return;
        }

        if (probe.status === "unsupported") {
          setPendingPasswordImport(null);
          setImportNoticeWithTimer({
            kind: "error",
            message: `${probe.message}，请重新选择`,
          }, 4500);
          return;
        }

        setPendingPasswordImport(null);
        await runBillImport(current.files, current.source, sanitizedValue);
      } catch (err) {
        console.error("[MoniEntry] Bill import password failed:", err);
        setPendingPasswordImport(null);
        setImportNoticeWithTimer({
          kind: "error",
          message: err instanceof Error ? err.message : "导入失败，请重新选择",
        }, 4500);
      }
    })();
  }, [pendingPasswordImport, runBillImport, setImportNoticeWithTimer]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const resetDragState = useCallback(() => {
    setHoverCat(null);
    hoverCatRef.current = null;
    setDragPoint(null);
  }, []);

  const openEntryForm = useCallback((category: string) => {
    setSelectedCat(category);
    setPhase("form");
    setHoverCat(null);
    hoverCatRef.current = null;
    setDragPoint(null);
  }, []);

  const closeOverlay = useCallback(() => {
    setPhase("idle");
    setHoverCat(null);
    hoverCatRef.current = null;
    setDragPoint(null);
  }, []);

  const handleButtonClick = useCallback(() => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    setPhase("selecting");
  }, []);

  const handleButtonPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      isPointerDownRef.current = true;
      longPressTriggeredRef.current = false;
      pressStartRef.current = { x: event.clientX, y: event.clientY };
      setPressed(true);
      clearLongPressTimer();

      longPressTimerRef.current = setTimeout(() => {
        if (!isPointerDownRef.current) return;
        longPressTriggeredRef.current = true;
        setPhase("dragging");
        setDragPoint({ x: pressStartRef.current.x, y: pressStartRef.current.y });
      }, 400);
    },
    [clearLongPressTimer],
  );

  useEffect(() => {
    if (phase !== "dragging") return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      setDragPoint({ x: event.clientX, y: event.clientY });
      const hitElement = document.elementFromPoint(event.clientX, event.clientY);
      const hitCategory = hitElement?.closest?.("[data-drop-category]")?.getAttribute("data-drop-category") ?? null;
      setHoverCat(hitCategory);
      hoverCatRef.current = hitCategory;
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
      setPressed(false);
      clearLongPressTimer();
      longPressTriggeredRef.current = false;
      if (hoverCatRef.current) {
        openEntryForm(hoverCatRef.current);
        return;
      }
      closeOverlay();
    };

    /**
     * pointercancel 只表示当前触摸流被系统中断，不代表用户已经松手完成投放。
     * Android 真机上若把它和 pointerup 共用，会出现“手还没松就提前落类”的问题。
     */
    const handlePointerCancel = () => {
      isPointerDownRef.current = false;
      setPressed(false);
      clearLongPressTimer();
      longPressTriggeredRef.current = false;
      closeOverlay();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [clearLongPressTimer, closeOverlay, openEntryForm, phase]);

  useEffect(() => {
    const shouldLockScroll = phase === "dragging" || phase === "selecting" || phase === "form";
    const previousOverflow = document.body.style.overflow;
    if (shouldLockScroll) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [phase]);

  useEffect(() => () => {
    clearLongPressTimer();
    if (importNoticeTimerRef.current) {
      clearTimeout(importNoticeTimerRef.current);
    }
  }, [clearLongPressTimer]);

  const handleButtonPointerEnd = useCallback(() => {
    isPointerDownRef.current = false;
    setPressed(false);
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleSave = useCallback(
    async (entry: ManualEntryInput) => {
      try {
        await actions.addEntry(entry);
        setSavedCount((count) => count + 1);
        setToastEntry({ amount: entry.amount, direction: entry.direction, category: entry.category });
        setShowToast(true);
        setPhase("idle");
        setSelectedCat(null);
        resetDragState();
        window.setTimeout(() => {
          setShowToast(false);
        }, 1500);
      } catch (err) {
        console.error("[MoniEntry] Failed to save entry:", err);
      }
    },
    [actions, resetDragState],
  );

  const { isKeyboardVisible } = useKeyboard();

  return (
    <div
      style={{
        width: PHONE_FRAME_WIDTH_CSS,
        maxWidth: "100vw",
        margin: 0,
        background: C.bg,
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Nunito',-apple-system,sans-serif",
        height: PHONE_FRAME_HEIGHT_CSS,
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .entry-scroll-container { scrollbar-width: none; -ms-overflow-style: none; }
        .entry-scroll-container::-webkit-scrollbar { display: none; }
        .entry-amount-input {
          color: ${C.dark};
        }
        .entry-amount-input::placeholder {
          color: #7A869C;
          opacity: 1;
        }
        .entry-form-input {
          color: ${C.dark};
          font-weight: 600;
        }
        .entry-form-input::placeholder {
          color: #7A869C;
          opacity: 1;
        }
        * { box-sizing: border-box }
        html, body { touch-action: manipulation; -webkit-touch-callout: none; overscroll-behavior: none }
        input, textarea, button { touch-action: manipulation }
      `}</style>

      <Decor />

      <div
        style={{
          position: "sticky", top: 0, zIndex: 10, background: C.bg,
          padding: `${APP_HEADER_PADDING_TOP} 16px 10px`, borderBottom: `1px solid ${C.border}22`,
          minHeight: APP_HEADER_MIN_HEIGHT,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Logo />
          <div style={{ width: LEDGER_HEADER_CONTROL_WIDTH, display: "flex", justifyContent: "flex-end" }}>
            <LedgerHeaderControl ledgerName={currentLedger.name} ariaLabel="当前账本" />
          </div>
        </div>
      </div>

      <div className="entry-scroll-container" style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 1 }}>
        <div style={{ padding: "10px 16px 4px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, fontFamily: "'Nunito',sans-serif" }}>记账</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>导入账单或随手记录一笔</div>
        </div>

        <div style={{ padding: "6px 0" }}>
          <ImportCard onImport={handleImportClick} notice={importNotice} />
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: "none" }}
          accept=".csv,.txt,.xls,.xlsx,.zip,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip,*/*"
          multiple
        />

        <div style={{ padding: "12px 16px 6px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.dark, fontFamily: "'Nunito',sans-serif" }}>随手记</div>
          <div style={{ flex: 1, height: 1.5, background: C.border, borderRadius: 1 }} />
          <div style={{ fontSize: 10, color: C.muted, padding: "2px 8px", borderRadius: 999, background: C.white, border: `1px solid ${C.border}` }}>现金 · 补漏</div>
        </div>

        <div style={{ padding: "0 16px 6px" }}>
          <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.55 }}>长按下方按钮，拖到想记录的分类里，即可快速记一笔。</div>
        </div>

        {savedCount > 0 && (
          <div style={{ margin: "0 16px 12px", padding: "10px 14px", borderRadius: 10, background: C.greenBg, border: `1.5px solid ${C.mint}30`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>📝</span>
            <span style={{ fontSize: 12, color: C.greenText, fontWeight: 600 }}>本次已记录 {savedCount} 笔</span>
          </div>
        )}

        {showRecentReferences ? (
          <div style={{ padding: "0 0 12px" }}>
            <RecentReferenceList entries={displayReferences} />
          </div>
        ) : null}

        {phase === "idle" && (
          <div style={{ padding: "4px 0 0" }} onPointerUp={handleButtonPointerEnd} onPointerCancel={handleButtonPointerEnd}>
            <EntryButton pressed={pressed} onClick={handleButtonClick} onPointerDown={handleButtonPointerDown} />
          </div>
        )}

        <div style={{ height: 72 }} />
      </div>

      {!isKeyboardVisible && (
        <EntryBottomNav onOpenHome={() => onNavigate("home")} onOpenSettings={() => onNavigate("settings")} />
      )}

      <CategoryOverlay
        visible={phase === "selecting" || phase === "dragging"}
        hoverCat={hoverCat}
        dragPoint={dragPoint}
        isDragging={phase === "dragging"}
        onSelect={openEntryForm}
        onClose={closeOverlay}
        availableCategories={availableCategories}
      />

      <EntryFormPanel visible={phase === "form"} category={selectedCat} directionRef={directionRef} onSave={handleSave} onClose={closeOverlay} />
      <SuccessToast visible={showToast} entry={toastEntry} />
      {pendingPasswordImport ? (
        <ImportPasswordPage
          pending={pendingPasswordImport}
          onBack={closeImportPasswordPage}
          onChangePassword={handleImportPasswordChange}
        />
      ) : null}
    </div>
  );
}
