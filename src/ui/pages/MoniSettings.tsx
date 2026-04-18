import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APP_HEADER_MIN_HEIGHT,
  APP_HEADER_PADDING_TOP,
  BOTTOM_NAV_PADDING_BOTTOM,
  C,
  PHONE_FRAME_HEIGHT_CSS,
  PHONE_FRAME_WIDTH_CSS,
} from "@ui/features/moni-home/config";
import { Decor, GearIcon, Logo, NavIcon, NoteIcon } from "@ui/features/moni-home/components";
import { useMoniSettingsData } from "@ui/hooks/useMoniSettingsData";
import { useKeyboard } from "@ui/hooks/useKeyboard";
import { BatchProcessor } from "@logic/application/ai/BatchProcessor";
import type {
  MoniSettingsData,
} from "@ui/hooks/useMoniSettingsData";
import type {
  SettingsAiConfig,
  SettingsExampleLibrarySummary,
  SettingsLedgerItem,
  SettingsLedgerTransaction,
  SettingsSnapshotItem,
} from "@shared/types";

/**
 * 设置页原型以功能规格和 UI/UX 规格为准。
 * 这里不直接照搬参考 JSX，而是把结构收敛进当前仓库已有的视觉系统，
 * 这样三页在切换时会共享同一套画布尺寸、底部导航语言和品牌装饰密度。
 */
const PROVIDERS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    hasBaseUrl: false,
    baseUrl: "https://api.deepseek.com",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "moonshot",
    name: "Moonshot",
    hasBaseUrl: false,
    baseUrl: "https://api.moonshot.cn/v1",
    models: ["moonshot-v1-8k", "kimi-k2.5", "kimi-k2", "kimi-k2-thinking"],
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    hasBaseUrl: false,
    baseUrl: "https://api.siliconflow.cn/v1",
    models: [
      "deepseek-ai/DeepSeek-V3.2",
      "deepseek-ai/DeepSeek-V3",
      "deepseek-ai/DeepSeek-R1",
      "moonshotai/Kimi-K2-Instruct",
      "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    ],
  },
  {
    id: "modelscope",
    name: "ModelScope",
    hasBaseUrl: false,
    baseUrl: "https://api-inference.modelscope.cn/v1",
    models: ["deepseek-ai/DeepSeek-R1", "Qwen/Qwen2.5-72B-Instruct", "Qwen/Qwen2.5-7B-Instruct"],
  },
  {
    id: "zhipu",
    name: "智谱 AI",
    hasBaseUrl: false,
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["GLM-4.6", "GLM-4.5", "GLM-4.5-Air"],
  },
  {
    id: "custom",
    name: "自定义",
    hasBaseUrl: true,
    baseUrl: "https://api.openai.com/v1",
    models: [],
  },
];

type BtnVariant = "primary" | "secondary" | "danger" | "mint" | "ghost";
type SettingsPageKey =
  | "root"
  | "aiConfig"
  | "selfDesc"
  | "ledgerManage"
  | "tagManage"
  | "aiMemory"
  | "budget"
  | "learnSettings"
  | "fullReclass"
  | "about";

type LearningSettingsDraft = {
  autoLearn: boolean;
  threshold: number;
  compThreshold: number;
};

type BudgetDraft = {
  monthly: string;
  catBudgets: Record<string, string>;
};

type CustomTag = {
  key: string;
  desc: string;
  isSystem?: boolean;
};

type AddFollowupDialogState = {
  tagKey: string;
};

type DeleteScopeDialogState = {
  tagKey: string;
  affectedDates: string[];
  affectedCount: number;
};

type DescScopeDialogState = {
  tagKey: string;
};

type LockedSheetMode = "delete_full" | "desc_all";
type LockedSheetState = {
  mode: LockedSheetMode;
  tagKey: string;
  candidates: SettingsLedgerTransaction[];
  title: string;
  desc: string;
};

const SYSTEM_FALLBACK_TAG: CustomTag = { key: "其他", desc: "所有未落入用户显式标签的兜底支出", isSystem: true };

/**
 * S32 渐进式重分类在原型中需要可观测的数据承载。
 * 这里按账本准备一份交易样本，字段语义对齐 v7 文档：
 * - `category`：当前标签
 * - `isVerified`：是否锁定（锁定条目默认不参与自动覆盖）
 * - `date`：用于 dirtyDates 的按天入队
 */
const INITIAL_LEDGER_TRANSACTIONS: Record<string, SettingsLedgerTransaction[]> = {
  daily: [
    { id: "d-001", date: "2026-04-07", title: "盒马鲜生", amount: 86, category: "正餐", isVerified: false },
    { id: "d-002", date: "2026-04-07", title: "瑞幸咖啡", amount: 21, category: "零食", isVerified: true },
    { id: "d-003", date: "2026-04-06", title: "滴滴出行", amount: 29, category: "交通", isVerified: false },
    { id: "d-004", date: "2026-04-06", title: "万象城餐厅", amount: 168, category: "大餐", isVerified: true },
    { id: "d-005", date: "2026-04-05", title: "B站年度会员", amount: 198, category: "娱乐", isVerified: false },
    { id: "d-006", date: "2026-04-05", title: "优衣库", amount: 259, category: "购物", isVerified: true },
    { id: "d-007", date: "2026-04-04", title: "面包新语", amount: 33, category: "零食", isVerified: false },
  ],
  travel: [
    { id: "t-001", date: "2026-04-03", title: "高铁票", amount: 420, category: "交通", isVerified: true },
    { id: "t-002", date: "2026-04-03", title: "酒店早餐", amount: 58, category: "正餐", isVerified: false },
    { id: "t-003", date: "2026-04-02", title: "景区门票", amount: 180, category: "娱乐", isVerified: false },
    { id: "t-004", date: "2026-04-02", title: "机场饮品", amount: 26, category: "零食", isVerified: true },
  ],
};

/**
 * 初始分类队列同样按账本隔离。
 * 队列元素冻结为“日期字符串”，对应 v7 的 `{ date }` 语义简化表示。
 */
const INITIAL_CLASSIFY_QUEUE_BY_LEDGER: Record<string, string[]> = {
  daily: ["2026-04-04"],
  travel: [],
};

/**
 * 帮助函数：按日期去重并升序输出，确保“同天只保留一个任务”。
 */
function uniqueSortedDates(dates: Array<string | null | undefined>): string[] {
  return [...new Set(dates.filter((value): value is string => Boolean(value)))].sort();
}

/**
 * 帮助函数：原型里统一金额显示格式，避免不同弹窗里写出多套模板。
 */
function formatAmount(amount: number): string {
  const sign = amount >= 0 ? "+" : "-";
  return `${sign}¥${Math.abs(amount)}`;
}

const INITIAL_EXAMPLE_LIBRARY_SUMMARY: SettingsExampleLibrarySummary = {
  delta: 3,
  total: 18,
};

const INITIAL_LEARNING_SETTINGS: LearningSettingsDraft = {
  autoLearn: true,
  threshold: 5,
  compThreshold: 30,
};

/**
 * 自述页空态示例文案。
 * 它只应在“用户尚未保存任何自述”时作为展示默认值出现，
 * 绝不能覆盖从持久化层真实加载出来的内容。
 */
const DEFAULT_SELF_DESCRIPTION_DEMO =
  "Demo 示例：我平时会把咖啡、奶茶、小零食分开记，也希望 AI 先按常见消费场景帮我分类。你可以把这里改成自己的真实习惯。";

/**
 * 返回箭头、右箭头等细节图标仍放在页面内定义，
 * 目的是让设置页在不打扰首页组件文件的前提下保持自洽。
 */
function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M15 18l-6-6 6-6" stroke={C.dark} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight({ color = C.muted }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M9 18l6-6-6-6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 设置页统一按钮。
 * 这里保留和规格一致的 4 种主要视觉变体，同时增加 ghost 以承载次要文本动作。
 */
function Btn({
  children,
  onClick,
  variant = "primary",
  full = false,
  disabled = false,
  small = false,
}: {
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  variant?: BtnVariant;
  full?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  const baseStyle: React.CSSProperties = {
    padding: small ? "8px 14px" : "12px 20px",
    borderRadius: 12,
    fontSize: small ? 12 : 14,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    textAlign: "center",
    transition: "all .15s",
    opacity: disabled ? 0.45 : 1,
  };

  const variants: Record<BtnVariant, React.CSSProperties> = {
    primary: { ...baseStyle, background: C.dark, color: C.bg, border: `2px solid ${C.dark}` },
    secondary: { ...baseStyle, background: C.white, color: C.dark, border: `1.5px solid ${C.border}` },
    danger: { ...baseStyle, background: C.pinkBg, color: C.coral, border: `1.5px solid ${C.pinkBd}` },
    mint: { ...baseStyle, background: C.mint, color: C.white, border: `2px solid ${C.mint}` },
    ghost: { ...baseStyle, background: "transparent", color: C.sub, border: "none" },
  };

  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        ...variants[variant],
        ...(full ? { width: "100%", boxSizing: "border-box" } : { display: "inline-block" }),
      }}
    >
      {children}
    </div>
  );
}

/**
 * 统一页头只保留返回和标题。
 * 这是本次调整的核心之一：所有表单动作不再挤进 header 右上角。
 */
function SubPageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: `${APP_HEADER_PADDING_TOP} 16px 10px`,
        minHeight: APP_HEADER_MIN_HEIGHT,
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: C.bg,
      }}
    >
      <div onClick={onBack} style={{ cursor: "pointer", padding: 4 }}>
        <BackArrow />
      </div>
      <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.dark }}>{title}</div>
    </div>
  );
}

/**
 * Root 页卡片与行项直接沿用参考文档中的结构语义，
 * 但具体实现落在当前仓库的视觉 token 上。
 */
function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: "0 16px 14px",
        background: C.white,
        border: `2px solid ${C.dark}`,
        borderRadius: 16,
        padding: "16px 16px 6px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, letterSpacing: 0.5 }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 10, color: C.sub }}>{subtitle}</div> : null}
      </div>
      {children}
    </div>
  );
}

function SettingRow({
  icon,
  label,
  desc,
  value,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 0",
        cursor: onClick ? "pointer" : "default",
        borderBottom: `0.5px solid ${C.line}`,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: danger ? C.pinkBg : C.blueBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 17,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: danger ? C.coral : C.dark }}>{label}</div>
        {desc ? <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{desc}</div> : null}
      </div>
      {value ? <div style={{ fontSize: 12, color: C.sub, textAlign: "right" }}>{value}</div> : null}
      {onClick ? <ChevronRight color={danger ? C.coral : C.muted} /> : null}
    </div>
  );
}

/**
 * 二级页内部的内容块统一使用 FormCard。
 * 这样可以把动作按钮稳定地挂在对应内容块底部右侧，符合用户提出的手指触达逻辑。
 */
function FormCard({
  title,
  desc,
  children,
  footer,
  tone = "default",
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  tone?: "default" | "danger";
}) {
  const toneBorder = tone === "danger" ? C.pinkBd : C.border;
  const toneBg = tone === "danger" ? C.pinkBg : C.white;

  return (
    <div
      style={{
        background: toneBg,
        border: `1.5px solid ${toneBorder}`,
        borderRadius: 14,
        padding: "14px 14px 12px",
        marginBottom: 14,
      }}
    >
      {title ? <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>{title}</div> : null}
      {desc ? <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.55, marginBottom: 12 }}>{desc}</div> : null}
      {children}
      {footer ? <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>{footer}</div> : null}
    </div>
  );
}

function Toast({ visible, message }: { visible: boolean; message: string }) {
  if (!visible) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 60,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        background: C.white,
        borderRadius: 12,
        padding: "10px 18px",
        border: `2px solid ${C.dark}`,
        boxShadow: "0 6px 20px rgba(0,0,0,.12)",
        fontSize: 13,
        fontWeight: 600,
        color: C.dark,
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 8,
          background: C.mint,
          color: C.white,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
        }}
      >
        ✓
      </span>
      {message}
    </div>
  );
}

function Dialog({ visible, title, children, onClose }: { visible: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  if (!visible) {
    return null;
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.35)" }} />
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "relative",
          width: "85%",
          maxHeight: "75%",
          background: C.white,
          borderRadius: 18,
          border: `2px solid ${C.dark}`,
          padding: "20px 18px 16px",
          overflow: "auto",
        }}
      >
        {title ? <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 14 }}>{title}</div> : null}
        {children}
      </div>
    </div>
  );
}

function BottomSheet({ visible, title, children, onClose }: { visible: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  if (!visible) {
    return null;
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.3)" }} />
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: C.white,
          borderRadius: "20px 20px 0 0",
          border: `2px solid ${C.dark}`,
          borderBottom: "none",
          padding: "8px 18px 24px",
          maxHeight: "70%",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: "0 auto 12px" }} />
        {title ? <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 14 }}>{title}</div> : null}
        <div className="scrollbar-hide" style={{ overflowY: "auto", maxHeight: "55vh" }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * 设置页底部导航与首页、记账页采用同一视觉骨架。
 * 中央首页按钮保持品牌主入口，设置页自身显示 active 态。
 */
function SettingsBottomNav({ onOpenHome, onOpenEntry, aiStatus }: { onOpenHome: () => void; onOpenEntry: () => void; aiStatus: string }) {
  const aiRunning = aiStatus === "ANALYZING";
  const homeLabel = aiStatus === "ANALYZING"
    ? "进行中"
    : aiStatus === "ERROR"
      ? "异常"
      : "首页";
  return (
    <div
      style={{
        background: C.white,
        borderTop: `1.5px solid ${C.border}`,
        paddingTop: 3,
        paddingBottom: BOTTOM_NAV_PADDING_BOTTOM,
        display: "flex",
        justifyContent: "space-around",
        alignItems: "flex-end",
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: "4px 16px",
        }}
      >
        <GearIcon active />
        <div style={{ fontSize: 10, color: C.dark, fontWeight: 700, marginTop: 2 }}>设置</div>
      </div>
      <div onClick={onOpenHome} style={{ position: "relative", textAlign: "center", cursor: "pointer" }}>
        <div style={{ marginTop: -12 }}>
          <div
            className={aiRunning ? "ag" : ""}
            style={{
              width: 52,
              height: 52,
              background: C.dark,
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: "rotate(2deg)",
              transition: "box-shadow .6s",
            }}
          >
            <NavIcon />
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, marginTop: 3, color: aiRunning ? C.mint : C.dark }}>{homeLabel}</div>
        </div>
      </div>
      <div onClick={onOpenEntry} style={{ textAlign: "center", padding: "4px 16px", cursor: "pointer" }}>
        <NoteIcon active={false} />
        <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>记账</div>
      </div>
    </div>
  );
}

function SettingsRoot({
  onNavigate,
  customTagCount,
  memoryCount,
  currentLedgerName,
  ledgerCount,
  budgetSummaryText,
  aiConfigSummary,
}: {
  onNavigate: (page: SettingsPageKey) => void;
  customTagCount: number;
  memoryCount: number;
  currentLedgerName: string;
  ledgerCount: number;
  budgetSummaryText: string;
  aiConfigSummary: string;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* 设置首页顶栏也切到共享组件，确保三页切换时顶部结构稳定。 */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: C.bg,
          padding: `${APP_HEADER_PADDING_TOP} 16px 10px`,
          minHeight: APP_HEADER_MIN_HEIGHT,
          borderBottom: `1px solid ${C.border}22`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Logo />
          <div
            style={{
              minWidth: 84,
              display: "flex",
              justifyContent: "flex-end",
              color: C.dark,
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            设置
          </div>
        </div>
      </div>
      <div className="scrollbar-hide" style={{ flex: 1, overflowY: "auto", paddingBottom: 16 }}>
        <SectionCard title="🌐 全局配置">
          <SettingRow icon="🤖" label="AI 配置" desc={aiConfigSummary} onClick={() => onNavigate("aiConfig")} />
          <SettingRow icon="👤" label="自述" desc="让 AI 了解你的消费习惯" onClick={() => onNavigate("selfDesc")} />
          <SettingRow icon="📚" label="账本管理" value={`${ledgerCount} 个账本`} onClick={() => onNavigate("ledgerManage")} />
          <SettingRow icon="📤" label="数据导出" desc="导出账单数据" value="P2" />
          <SettingRow icon="ℹ️" label="关于" desc="Moni v0.2.1" onClick={() => onNavigate("about")} />
        </SectionCard>
        <SectionCard title={`📒 账本：${currentLedgerName || "未选择账本"}`} subtitle="当前账本配置">
          <SettingRow icon="🏷️" label="标签管理" value={customTagCount ? `${customTagCount} 个` : "未设置"} onClick={() => onNavigate("tagManage")} />
          <SettingRow icon="🧠" label="AI 记忆" desc="查看 AI 学到的偏好" value={`${memoryCount} 条`} onClick={() => onNavigate("aiMemory")} />
          <SettingRow icon="💰" label="预算设置" desc="月度与分类预算" value={budgetSummaryText} onClick={() => onNavigate("budget")} />
          <SettingRow icon="📐" label="学习设置" desc="阈值、自动学习、收编" onClick={() => onNavigate("learnSettings")} />
          <SettingRow icon="🔄" label="全量重新分类" desc="对全账本未锁定交易重新分类" onClick={() => onNavigate("fullReclass")} danger />
        </SectionCard>
      </div>
    </div>
  );
}

function AIConfigPage({
  onBack,
  aiConfig,
  onUpdateProvider,
  onUpdateApiKey,
  onUpdateBaseUrl,
  onUpdateActiveModel,
  onUpdateMaxTokens,
  onUpdateTemperature,
  onUpdateEnableThinking,
  onTestConnection,
}: {
  onBack: () => void;
  aiConfig: SettingsAiConfig;
  onUpdateProvider: MoniSettingsData["actions"]["updateProvider"];
  onUpdateApiKey: MoniSettingsData["actions"]["updateApiKey"];
  onUpdateBaseUrl: MoniSettingsData["actions"]["updateBaseUrl"];
  onUpdateActiveModel: MoniSettingsData["actions"]["updateActiveModel"];
  onUpdateMaxTokens: MoniSettingsData["actions"]["updateMaxTokens"];
  onUpdateTemperature: MoniSettingsData["actions"]["updateTemperature"];
  onUpdateEnableThinking: MoniSettingsData["actions"]["updateEnableThinking"];
  onTestConnection: MoniSettingsData["actions"]["testConnection"];
}) {
  const [provider, setProvider] = useState<string>(aiConfig?.provider || "deepseek");
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({
    deepseek: "",
    moonshot: "",
    siliconflow: "",
    modelscope: "",
    zhipu: "",
    custom: "",
  });
  const [thinking, setThinking] = useState(Boolean(aiConfig?.enableThinking));
  const [testing, setTesting] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<"success" | "failed" | null>(null);
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({
    deepseek: "deepseek-chat",
    moonshot: "kimi-k2.5",
    siliconflow: "deepseek-ai/DeepSeek-V3",
    modelscope: "deepseek-ai/DeepSeek-R1",
    zhipu: "GLM-4.6",
  });
  const [customBaseUrl, setCustomBaseUrl] = useState(aiConfig?.baseUrl || "https://api.openai.com/v1");
  const [customModels, setCustomModels] = useState([aiConfig?.activeModel || "custom-model-1", "custom-model-2", "custom-model-3"]);
  const [activeCustomIndex, setActiveCustomIndex] = useState(0);
  const [maxTokensDraft, setMaxTokensDraft] = useState(String(aiConfig?.maxTokens ?? 2000));
  const [temperatureDraft, setTemperatureDraft] = useState(String(aiConfig?.temperature ?? 0.3));

  useEffect(() => {
    if (aiConfig?.provider) {
      setProvider(aiConfig.provider);
    }
    setThinking(Boolean(aiConfig?.enableThinking));
    if (aiConfig?.provider === "custom") {
      setCustomBaseUrl(aiConfig.baseUrl || "https://api.openai.com/v1");
    }
    if (aiConfig?.activeModel) {
      setSelectedModels((prev) => ({ ...prev, [aiConfig.provider]: aiConfig.activeModel }));
      if (aiConfig.provider === "custom") {
        setCustomModels((prev) => {
          const next = [...prev];
          next[0] = aiConfig.activeModel;
          return next;
        });
      }
    }
    setMaxTokensDraft(String(aiConfig?.maxTokens ?? 2000));
    setTemperatureDraft(String(aiConfig?.temperature ?? 0.3));
  }, [aiConfig]);

  const currentProvider = useMemo(() => PROVIDERS.find((item) => item.id === provider), [provider]);
  const hasApiKey = provider === aiConfig?.provider ? Boolean(aiConfig?.hasApiKey) : false;
  const currentModel = provider === "custom" ? customModels[activeCustomIndex] : selectedModels[provider];

  const statusText = testing
    ? "● 测试中"
    : lastTestResult === "success"
      ? "● 生效中"
      : lastTestResult === "failed"
        ? "● 连接失败"
        : hasApiKey
          ? "● 待验证"
          : "● 未配置";
  const statusColor = testing
    ? C.amber
    : lastTestResult === "success"
      ? C.greenText
      : lastTestResult === "failed"
        ? C.amber
        : hasApiKey
          ? C.amber
          : C.muted;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SubPageHeader title="AI 配置" onBack={onBack} />
      <div className="scrollbar-hide" style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>
        <FormCard title="提供方">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PROVIDERS.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  setProvider(item.id);
                  setLastTestResult(null);
                  void onUpdateProvider(item.id);
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: provider === item.id ? `2px solid ${C.dark}` : `1.5px solid ${C.border}`,
                  background: provider === item.id ? C.dark : C.white,
                  color: provider === item.id ? C.bg : C.dark,
                }}
              >
                {item.name}
              </div>
            ))}
          </div>
        </FormCard>

        <FormCard title="连接信息">
          <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 8 }}>Base URL</div>
          <input
            data-selectable={currentProvider?.hasBaseUrl ? "true" : undefined}
            readOnly={!currentProvider?.hasBaseUrl}
            value={currentProvider?.hasBaseUrl
              ? customBaseUrl
              : provider === aiConfig?.provider
                ? aiConfig?.baseUrl || currentProvider?.baseUrl || ""
                : currentProvider?.baseUrl || ""}
            onChange={(event) => setCustomBaseUrl(event.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              border: `1.5px solid ${C.border}`,
              fontSize: 13,
              background: C.white,
              color: C.dark,
              outline: "none",
              marginBottom: 14,
              boxSizing: "border-box",
            }}
          />
          {currentProvider?.hasBaseUrl ? (
            <div style={{ marginBottom: 14 }}>
              <Btn
                small
                variant="secondary"
                onClick={() => {
                  void onUpdateBaseUrl(customBaseUrl.trim());
                }}
              >
                保存 URL
              </Btn>
            </div>
          ) : null}

          <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 8 }}>API Key</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input
              data-selectable={!hasApiKey ? "true" : undefined}
              readOnly={hasApiKey}
              value={hasApiKey ? "••••••••••••••••" : keyDrafts[provider]}
              placeholder="输入 API Key"
              onChange={(event) => setKeyDrafts((prev) => ({ ...prev, [provider]: event.target.value }))}
              onCopy={(event) => event.preventDefault()}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 10,
                border: `1.5px solid ${C.border}`,
                fontSize: 13,
                fontFamily: "'Space Mono', monospace",
                background: C.white,
                color: C.dark,
                outline: "none",
              }}
            />
            {hasApiKey ? (
              <Btn
                small
                variant="secondary"
                onClick={() => {
                  setKeyDrafts((prev) => ({ ...prev, [provider]: "" }));
                  setLastTestResult(null);
                  void onUpdateApiKey(provider, "");
                }}
              >
                清空
              </Btn>
            ) : (
              <Btn
                small
                variant="primary"
                disabled={!keyDrafts[provider]?.trim()}
                onClick={() => {
                  if (!keyDrafts[provider]?.trim()) {
                    return;
                  }
                  const nextKey = keyDrafts[provider].trim();
                  setLastTestResult(null);
                  void onUpdateApiKey(provider, nextKey);
                  setKeyDrafts((prev) => ({ ...prev, [provider]: "" }));
                }}
              >
                填入
              </Btn>
            )}
          </div>

          <div style={{ padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.white, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, color: C.sub, marginBottom: 3 }}>当前模型</div>
              <div style={{ fontSize: 13, color: C.dark, fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>{currentModel || "未设置"}</div>
            </div>
            <div
              style={{
                fontSize: 11,
                color: statusColor,
                fontWeight: 700
              }}
            >
              {statusText}
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 8 }}>模型</div>
          {provider !== "custom" ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {currentProvider?.models.map((modelName) => (
                <div
                  key={modelName}
                  onClick={() => {
                    setSelectedModels((prev) => ({ ...prev, [provider]: modelName }));
                    setLastTestResult(null);
                    void onUpdateActiveModel(modelName);
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: selectedModels[provider] === modelName ? `2px solid ${C.dark}` : `1.5px solid ${C.border}`,
                    background: selectedModels[provider] === modelName ? C.dark : C.white,
                    color: selectedModels[provider] === modelName ? C.bg : C.dark,
                    fontFamily: "'Space Mono', monospace",
                  }}
                >
                  {modelName}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginBottom: 14 }}>
              {customModels.map((modelName, index) => (
                <div key={`custom-model-slot-${index}`} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: index < customModels.length - 1 ? 10 : 0 }}>
                  <div
                    onClick={() => {
                      setActiveCustomIndex(index);
                      setLastTestResult(null);
                      if (customModels[index]?.trim()) {
                        void onUpdateActiveModel(customModels[index].trim());
                      }
                    }}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      border: activeCustomIndex === index ? `6px solid ${C.mint}` : `2px solid ${C.border}`,
                      cursor: "pointer",
                      flexShrink: 0,
                      boxSizing: "border-box",
                    }}
                  />
                  <input
                    data-selectable
                    value={modelName}
                    onChange={(event) => {
                      const nextModels = [...customModels];
                      nextModels[index] = event.target.value;
                      setCustomModels(nextModels);
                      if (index === activeCustomIndex) {
                        setLastTestResult(null);
                        void onUpdateActiveModel(event.target.value.trim());
                      }
                    }}
                    placeholder={`模型槽位 ${index + 1}`}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1.5px solid ${C.border}`,
                      fontSize: 13,
                      background: C.white,
                      color: C.dark,
                      outline: "none",
                      fontFamily: "'Space Mono', monospace",
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 8 }}>Max Tokens</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                data-selectable
                type="number"
                min={1}
                step={1}
                value={maxTokensDraft}
                onChange={(event) => setMaxTokensDraft(event.target.value)}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1.5px solid ${C.border}`,
                  fontSize: 13,
                  background: C.white,
                  color: C.dark,
                  outline: "none",
                  fontFamily: "'Space Mono', monospace",
                }}
              />
              <Btn
                small
                variant="secondary"
                onClick={() => {
                  const parsed = Number.parseInt(maxTokensDraft, 10);
                  if (!Number.isFinite(parsed) || parsed <= 0) return;
                  void onUpdateMaxTokens(parsed);
                }}
              >
                保存
              </Btn>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 8 }}>Temperature</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                data-selectable
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperatureDraft}
                onChange={(event) => setTemperatureDraft(event.target.value)}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1.5px solid ${C.border}`,
                  fontSize: 13,
                  background: C.white,
                  color: C.dark,
                  outline: "none",
                  fontFamily: "'Space Mono', monospace",
                }}
              />
              <Btn
                small
                variant="secondary"
                onClick={() => {
                  const parsed = Number.parseFloat(temperatureDraft);
                  if (!Number.isFinite(parsed)) return;
                  void onUpdateTemperature(parsed);
                }}
              >
                保存
              </Btn>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: C.sub }}>启用思考</span>
              <div
                onClick={() => {
                  const next = !thinking;
                  setThinking(next);
                  void onUpdateEnableThinking(next);
                }}
                style={{ width: 44, height: 24, borderRadius: 12, background: thinking ? C.mint : C.border, position: "relative", cursor: "pointer" }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: C.white,
                    position: "absolute",
                    top: 2,
                    left: thinking ? 22 : 2,
                    boxShadow: "0 1px 4px rgba(0,0,0,.15)",
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <Btn
              full
              onClick={async () => {
                if (!hasApiKey) {
                  return;
                }
                setTesting(true);
                const passed = await onTestConnection();
                setTesting(false);
                setLastTestResult(passed ? "success" : "failed");
              }}
              disabled={testing || !hasApiKey}
            >
              {testing ? "测试中…" : "测试连接"}
            </Btn>
          </div>

          {lastTestResult === "success" ? (
            <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: C.greenBg, border: `1.5px solid ${C.mint}30`, fontSize: 12, color: C.greenText, fontWeight: 600, textAlign: "center" }}>
              ✓ 连接成功，模型响应正常
            </div>
          ) : null}
          {lastTestResult === "failed" ? (
            <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: C.warmBg, border: `1.5px solid ${C.warmBd}`, fontSize: 12, color: C.amber, fontWeight: 600, textAlign: "center" }}>
              ✕ 连接失败，请检查 Base URL / API Key / 模型
            </div>
          ) : null}
        </FormCard>
      </div>
    </div>
  );
}

function SelfDescPage({
  onBack,
  text,
  onChange,
  onSave,
}: {
  onBack: () => void;
  text: string;
  onChange: (value: string) => void;
  onSave: (value: string) => Promise<void>;
}) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SubPageHeader title="自述" onBack={onBack} />
      <div className="scrollbar-hide" style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>
        <FormCard
          title="自述"
          footer={
            <Btn
              onClick={() => {
                /**
                 * 自述页必须走真实持久化链路。
                 * 这里不再只弹 toast，而是等待 AppFacade 完成写盘后再提示成功。
                 */
                void (async () => {
                  setSaving(true);
                  setSaveError("");
                  try {
                    await onSave(text);
                    setSaved(true);
                    window.setTimeout(() => setSaved(false), 2000);
                  } catch {
                    setSaveError("自述保存失败，请重试");
                  } finally {
                    setSaving(false);
                  }
                })();
              }}
            >
              {saving ? "保存中…" : "保存"}
            </Btn>
          }
        >
          <div style={{ padding: "10px 14px", borderRadius: 12, background: C.warmBg, border: `1.5px solid ${C.warmBd}`, marginBottom: 14, fontSize: 12, color: C.amber, lineHeight: 1.55 }}>
            💡 这里默认放的是 demo 示例，目的是演示“你可以怎么写给 AI 看”。后续请改成你自己的真实消费习惯和分类偏好。
          </div>
          <textarea
            data-selectable
            value={text}
            onChange={(event) => onChange(event.target.value)}
            maxLength={200}
            style={{
              width: "100%",
              minHeight: 240,
              padding: 14,
              borderRadius: 12,
              border: `1.5px solid ${C.border}`,
              fontSize: 14,
              lineHeight: 1.7,
              color: C.dark,
              background: C.white,
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
          <div style={{ marginTop: 8, textAlign: "right", fontSize: 11, color: C.sub }}>{text.length}/200</div>
          {saveError ? <div style={{ marginTop: 8, fontSize: 12, color: C.coral }}>{saveError}</div> : null}
        </FormCard>
      </div>
      <Toast visible={saved} message="自述已保存" />
    </div>
  );
}

function LedgerManagePage({
  onBack,
  ledgers,
  activeId,
  onSwitchLedger,
  onCreateLedger,
  onRenameLedger,
  onDeleteLedger,
}: {
  onBack: () => void;
  ledgers: SettingsLedgerItem[];
  activeId: string;
  onSwitchLedger: MoniSettingsData["actions"]["switchLedger"];
  onCreateLedger: MoniSettingsData["actions"]["createLedger"];
  onRenameLedger: MoniSettingsData["actions"]["renameLedger"];
  onDeleteLedger: MoniSettingsData["actions"]["deleteLedger"];
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [showRename, setShowRename] = useState<SettingsLedgerItem | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [showDelete, setShowDelete] = useState<SettingsLedgerItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(""), 2200);
  }, []);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SubPageHeader title="账本管理" onBack={onBack} />
      <div className="scrollbar-hide" style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>
        <FormCard title="账本列表">
          {ledgers.map((ledger, index) => (
            <div
              key={ledger.id}
              onClick={() => {
                if (busy) return;
                void onSwitchLedger(ledger.id);
              }}
              style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: index < ledgers.length - 1 ? `0.5px solid ${C.line}` : "none", gap: 12, cursor: "pointer" }}
            >
              <div
                onClick={(event) => {
                  event.stopPropagation();
                  if (busy) return;
                  void onSwitchLedger(ledger.id);
                }}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  border: activeId === ledger.id ? `6px solid ${C.mint}` : `2px solid ${C.border}`,
                  cursor: "pointer",
                  flexShrink: 0,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>{ledger.name}</div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                  {ledger.isDefault ? "默认账本" : "自建账本"}
                  {activeId === ledger.id ? " · 当前使用" : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn
                  small
                  variant="secondary"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowRename(ledger);
                    setRenameTo(ledger.name);
                  }}
                >
                  改名
                </Btn>
                {!ledger.isDefault ? (
                  <Btn
                    small
                    variant="danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowDelete(ledger);
                    }}
                  >
                    删除
                  </Btn>
                ) : null}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <Btn onClick={() => setShowCreate(true)}>+ 新建账本</Btn>
          </div>
        </FormCard>
      </div>

      <Dialog visible={showCreate} title="新建账本" onClose={() => setShowCreate(false)}>
        <input
          data-selectable
          autoFocus
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="输入账本名称"
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none", marginBottom: 16, boxSizing: "border-box", color: C.dark }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <Btn full variant="secondary" onClick={() => setShowCreate(false)}>
            取消
          </Btn>
          <Btn
            full
            onClick={() => {
              if (!newName.trim()) {
                return;
              }
              setBusy(true);
              void onCreateLedger(newName.trim())
                .then((created) => {
                  if (!created) {
                    showToast("创建失败：名称重复或包含非法字符（仅支持中文/英文/数字/下划线）");
                    return;
                  }
                  setNewName("");
                  setShowCreate(false);
                  showToast("账本已创建");
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
            disabled={!newName.trim() || busy}
          >
            创建
          </Btn>
        </div>
      </Dialog>

      <Dialog visible={!!showRename} title="重命名账本" onClose={() => setShowRename(null)}>
        <input
          data-selectable
          autoFocus
          value={renameTo}
          onChange={(event) => setRenameTo(event.target.value)}
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none", marginBottom: 16, boxSizing: "border-box", color: C.dark }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <Btn full variant="secondary" onClick={() => setShowRename(null)}>
            取消
          </Btn>
          <Btn
            full
            onClick={() => {
              if (!showRename || !renameTo.trim()) {
                return;
              }
              setBusy(true);
              void onRenameLedger(showRename.id, renameTo.trim())
                .then((renamed) => {
                  if (!renamed) {
                    showToast("改名失败：名称重复或包含非法字符");
                    return;
                  }
                  setShowRename(null);
                  showToast("账本已重命名");
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
            disabled={!renameTo.trim() || busy}
          >
            确定
          </Btn>
        </div>
      </Dialog>

      <Dialog visible={!!showDelete} title="删除账本" onClose={() => setShowDelete(null)}>
        <div style={{ fontSize: 14, color: C.dark, lineHeight: 1.6, marginBottom: 16 }}>
          确定要删除 <strong>「{showDelete?.name}」</strong> 吗？
          <br />
          <span style={{ color: C.coral, fontSize: 12 }}>此操作不可恢复。账本下所有交易数据、AI 记忆、预算配置都将被清除。</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn full variant="secondary" onClick={() => setShowDelete(null)}>
            取消
          </Btn>
          <Btn
            full
            variant="danger"
            onClick={() => {
              if (!showDelete) {
                return;
              }
              setBusy(true);
              void onDeleteLedger(showDelete.id)
                .then((deleted) => {
                  if (!deleted) {
                    showToast("删除失败：默认账本不可删除或账本不存在");
                    return;
                  }
                  setShowDelete(null);
                  showToast("账本已删除");
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
            disabled={busy}
          >
            确认删除
          </Btn>
        </div>
      </Dialog>
      <Toast visible={Boolean(toastMessage)} message={toastMessage} />
    </div>
  );
}

function TagManagePage({
  onBack,
  customTags,
  onCreateTag,
  onRenameTag,
  onUpdateTagDescription,
  onDeleteTag,
  ledgerTransactions,
  onChangeLedgerTransactions,
  classifyQueueDates,
  onEnqueueClassifyDates,
}: {
  onBack: () => void;
  customTags: CustomTag[];
  onCreateTag: MoniSettingsData["actions"]["createTag"];
  onRenameTag: MoniSettingsData["actions"]["renameTag"];
  onUpdateTagDescription: MoniSettingsData["actions"]["updateTagDescription"];
  onDeleteTag: MoniSettingsData["actions"]["deleteTag"];
  ledgerTransactions: SettingsLedgerTransaction[];
  onChangeLedgerTransactions: React.Dispatch<React.SetStateAction<SettingsLedgerTransaction[]>>;
  classifyQueueDates: string[];
  onEnqueueClassifyDates: (dates: string[]) => { added: number; total: number };
}) {
  // “其他”不是用户真的在这里维护的数据，只在存在自定义标签时展示为兜底行。
  // 这样当用户删光所有标签时，列表可以自然进入空态，不会残留一个系统占位项。
  const displayTags = customTags.length ? [...customTags, SYSTEM_FALLBACK_TAG] : [];
  const [toastMessage, setToastMessage] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [editTag, setEditTag] = useState<CustomTag | null>(null);
  const [editMode, setEditMode] = useState<"rename" | "desc">("rename");
  const [editDesc, setEditDesc] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [deleteTag, setDeleteTag] = useState<CustomTag | null>(null);
  // S32：新增标签后的渐进式二选一弹窗。
  const [addFollowupDialog, setAddFollowupDialog] = useState<AddFollowupDialogState | null>(null);
  // S32：删除标签后的范围确认弹窗。
  const [deleteScopeDialog, setDeleteScopeDialog] = useState<DeleteScopeDialogState | null>(null);
  // S32：修改描述后的范围确认弹窗。
  const [descScopeDialog, setDescScopeDialog] = useState<DescScopeDialogState | null>(null);
  // S32：涉及“包含锁定交易”时打开的底部锁定列表选择器。
  const [lockedSheet, setLockedSheet] = useState<LockedSheetState | null>(null);
  const [selectedLockedIds, setSelectedLockedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(""), 2200);
  };

  /**
   * S32 触发层（原型态）：
   * - UI 只调用按钮级语义入口，不直接拼 dirtyDates 以外的执行细节；
   * - 同一天任务按日期去重入队；
   * - 所有触发最终统一反馈“已通知消费端尝试启动”。
   */
  const triggerClassifyByDates = (dates: string[], label: string) => {
    const result = onEnqueueClassifyDates(dates);
    showToast(`${label}：新增 ${result.added} 天任务，队列共 ${result.total} 天，已通知消费端尝试启动。`);
  };

  const openLockedSheet = ({ mode, tagKey, candidates, title, desc }: LockedSheetState) => {
    setLockedSheet({ mode, tagKey, candidates, title, desc });
    setSelectedLockedIds([]);
  };

  const closeLockedSheet = () => {
    setLockedSheet(null);
    setSelectedLockedIds([]);
  };

  const toggleLockedSelected = (txId: string) => {
    setSelectedLockedIds((items) => (items.includes(txId) ? items.filter((id) => id !== txId) : [...items, txId]));
  };

  const handleConfirmLockedSheet = () => {
    if (!lockedSheet) {
      return;
    }
    const selectedSet = new Set(selectedLockedIds);
    // 当场解锁用户勾选条目，再按 v7 对应按钮语义生产 dirtyDates。
    const nextTransactions = ledgerTransactions.map((tx) => (selectedSet.has(tx.id) ? { ...tx, isVerified: false } : tx));
    onChangeLedgerTransactions(nextTransactions);

    if (lockedSheet.mode === "delete_full") {
      const dates = uniqueSortedDates(nextTransactions.filter((tx) => !tx.isVerified).map((tx) => tx.date));
      closeLockedSheet();
      setDeleteScopeDialog(null);
      triggerClassifyByDates(dates, "真全量重分类");
      return;
    }

    if (lockedSheet.mode === "desc_all") {
      const dates = uniqueSortedDates(nextTransactions.filter((tx) => tx.category === lockedSheet.tagKey).map((tx) => tx.date));
      closeLockedSheet();
      setDescScopeDialog(null);
      triggerClassifyByDates(dates, "该标签下所有交易重分类");
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SubPageHeader title="标签管理" onBack={onBack} />
      <div className="scrollbar-hide" style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>
        <FormCard title="标签列表">
          {displayTags.length ? (
            displayTags.map((tag, index) => (
              <div key={tag.key} style={{ padding: "14px 0", borderBottom: index < displayTags.length - 1 ? `0.5px solid ${C.line}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: tag.isSystem ? C.gray : C.mint, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>{tag.key}</div>
                    <div style={{ fontSize: 11, color: C.sub, marginTop: 3, lineHeight: 1.45 }}>{tag.desc}</div>
                  </div>
                  {!tag.isSystem ? (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexShrink: 0 }}>
                      <Btn
                        small
                        variant="secondary"
                        onClick={() => {
                          setEditTag(tag);
                          setEditMode("rename");
                          setRenameTo(tag.key);
                          setEditDesc(tag.desc);
                        }}
                      >
                        编辑
                      </Btn>
                      <Btn small variant="danger" onClick={() => setDeleteTag(tag)}>
                        删除
                      </Btn>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div
              style={{
                padding: "18px 14px",
                borderRadius: 12,
                background: C.bg,
                border: `1.5px dashed ${C.border}`,
                fontSize: 12,
                color: C.sub,
                lineHeight: 1.7,
              }}
            >
              还没有标签。先创建一个你最常用的分类，让 Moni 从第一条开始学你怎么记账。
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <Btn onClick={() => setShowAdd(true)}>+ 新增标签</Btn>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: C.sub, lineHeight: 1.6 }}>
            当前账本待处理重分类日期：<span style={{ fontWeight: 700, color: C.dark }}>{classifyQueueDates.length}</span> 天
          </div>
        </FormCard>
      </div>

      <Dialog visible={showAdd} title="新增标签" onClose={() => setShowAdd(false)}>
        <input
          data-selectable
          autoFocus
          value={addName}
          onChange={(event) => setAddName(event.target.value)}
          placeholder="标签名称"
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none", marginBottom: 10, boxSizing: "border-box", color: C.dark }}
        />
        <textarea
          data-selectable
          value={addDesc}
          onChange={(event) => setAddDesc(event.target.value)}
          placeholder="标签描述（必填）"
          style={{ width: "100%", minHeight: 80, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", marginBottom: 14, boxSizing: "border-box", color: C.dark }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <Btn full variant="secondary" onClick={() => setShowAdd(false)}>
            取消
          </Btn>
          <Btn
            full
            onClick={() => {
              if (!addName.trim() || !addDesc.trim()) {
                return;
              }
              const nextName = addName.trim();
              setBusy(true);
              void onCreateTag(nextName, addDesc.trim())
                .then(() => {
                  setAddName("");
                  setAddDesc("");
                  setShowAdd(false);
                  // S32：新增标签后必须进入“暂时跳过 / 现在启动分类”的渐进式分支。
                  setAddFollowupDialog({ tagKey: nextName });
                })
                .catch(() => {
                  showToast("新增失败：标签名可能重复，请重试");
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
            disabled={!addName.trim() || !addDesc.trim() || busy}
          >
            新增
          </Btn>
        </div>
      </Dialog>

      <Dialog
        visible={!!editTag}
        title={`编辑「${editTag?.key}」`}
        onClose={() => {
          setEditTag(null);
          setEditMode("rename");
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: 6,
            borderRadius: 14,
            background: "#F8F4EE",
            border: `1px solid ${C.line}`,
            marginBottom: 16,
          }}
        >
          <div
            onClick={() => setEditMode("rename")}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer",
              background: editMode === "rename" ? C.blueBg : "rgba(255,255,255,.72)",
              border: editMode === "rename" ? `1.5px solid ${C.blue}` : `1px solid ${C.line}`,
              color: editMode === "rename" ? C.dark : C.sub,
              boxShadow: editMode === "rename" ? "0 6px 16px rgba(88, 146, 204, 0.16)" : "none",
              transition: "all .18s ease",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800 }}>重命名键</div>
            <div style={{ fontSize: 10, marginTop: 3, opacity: 0.82 }}>修改这个标签的名称</div>
          </div>
          <div
            onClick={() => setEditMode("desc")}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer",
              background: editMode === "desc" ? C.pinkBg : "rgba(255,255,255,.72)",
              border: editMode === "desc" ? `1.5px solid ${C.pinkBd}` : `1px solid ${C.line}`,
              color: editMode === "desc" ? C.coral : C.sub,
              boxShadow: editMode === "desc" ? "0 6px 16px rgba(226, 115, 115, 0.14)" : "none",
              transition: "all .18s ease",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800 }}>编辑描述</div>
            <div style={{ fontSize: 10, marginTop: 3, opacity: 0.82 }}>修改这个标签的说明</div>
          </div>
        </div>

        <div
          style={{
            padding: "14px 14px 12px",
            borderRadius: 14,
            background: editMode === "rename" ? "#FBFEFF" : "#FFF9F8",
            border: editMode === "rename" ? `1.5px solid ${C.blue}35` : `1.5px solid ${C.pinkBd}`,
            marginBottom: 14,
          }}
        >
          {editMode === "rename" ? (
            <>
              <div style={{ fontSize: 12, color: C.sub, marginBottom: 10, lineHeight: 1.6 }}>
                修改后会影响这个标签在列表和记账时的显示名称。
              </div>
              <input
                data-selectable
                autoFocus
                value={renameTo}
                onChange={(event) => setRenameTo(event.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.blue}55`, fontSize: 14, outline: "none", boxSizing: "border-box", background: C.white, color: C.dark }}
              />
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: C.sub, marginBottom: 10, lineHeight: 1.6 }}>
                补充这个标签的使用说明，帮助 AI 更好理解你的分类意图。
              </div>
              <textarea
                data-selectable
                autoFocus
                value={editDesc}
                onChange={(event) => setEditDesc(event.target.value)}
                style={{ width: "100%", minHeight: 88, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.pinkBd}`, fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", background: C.white, color: C.dark }}
              />
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Btn
            full
            variant="secondary"
            onClick={() => {
              setEditTag(null);
              setEditMode("rename");
            }}
          >
            取消
          </Btn>
          <Btn
            full
            onClick={() => {
              if (!editTag) {
                return;
              }
              if (editMode === "rename") {
                if (!renameTo.trim()) {
                  return;
                }
                const nextName = renameTo.trim();
                setBusy(true);
                void onRenameTag(editTag.key, nextName)
                  .then(() => {
                    setEditTag(null);
                    setEditMode("rename");
                    showToast(`标签已改名为「${nextName}」`);
                  })
                  .catch(() => {
                    showToast("改名失败：名称重复或非法");
                  })
                  .finally(() => {
                    setBusy(false);
                  });
                return;
              }
              if (!editDesc.trim()) {
                return;
              }
              setBusy(true);
              void onUpdateTagDescription(editTag.key, editDesc.trim())
                .then(() => {
                  setEditTag(null);
                  setEditMode("rename");
                  // S32：描述变更后不直接结束，必须进入范围确认。
                  setDescScopeDialog({ tagKey: editTag.key });
                })
                .catch(() => {
                  showToast("更新描述失败，请重试");
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
            disabled={(editMode === "rename" ? !renameTo.trim() : !editDesc.trim()) || busy}
          >
            保存
          </Btn>
        </div>
      </Dialog>

      <Dialog visible={!!deleteTag} title={`删除「${deleteTag?.key}」`} onClose={() => setDeleteTag(null)}>
        <div style={{ fontSize: 13, color: C.dark, lineHeight: 1.6, marginBottom: 14 }}>
          <span style={{ color: C.coral }}>⚠</span> 原属该标签的交易将重置为未分类，实例库与分类预算也将清理。
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn full variant="secondary" onClick={() => setDeleteTag(null)}>
            取消
          </Btn>
          <Btn
            full
            variant="danger"
            onClick={() => {
              if (!deleteTag) {
                return;
              }
              // v7 删除标签的数据前置处理：受影响交易转为未分类并强制解锁。
              const affectedTransactions = ledgerTransactions.filter((tx) => tx.category === deleteTag.key);
              const affectedDates = uniqueSortedDates(affectedTransactions.map((tx) => tx.date));
              const nextTransactions = ledgerTransactions.map((tx) => (tx.category === deleteTag.key ? { ...tx, category: "未分类", isVerified: false } : tx));
              onChangeLedgerTransactions(nextTransactions);
              setBusy(true);
              void onDeleteTag(deleteTag.key)
                .then(() => {
                  setDeleteTag(null);
                  // S32：删除完成后直接进入范围确认弹窗。
                  setDeleteScopeDialog({
                    tagKey: deleteTag.key,
                    affectedDates,
                    affectedCount: affectedTransactions.length,
                  });
                })
                .catch(() => {
                  showToast("删除失败：默认标签不可删或标签不存在");
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
            disabled={busy}
          >
            确认删除
          </Btn>
        </div>
      </Dialog>

      <Dialog visible={!!addFollowupDialog} title={`标签「${addFollowupDialog?.tagKey}」已新增`} onClose={() => setAddFollowupDialog(null)}>
        <div style={{ fontSize: 13, color: C.dark, lineHeight: 1.6, marginBottom: 16 }}>是否现在启动分类？按 v7 口径，该动作只通知消费端尝试启动，不会生产新任务。</div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn
            full
            variant="secondary"
            onClick={() => {
              setAddFollowupDialog(null);
              showToast("已暂时跳过，本次不触发重分类。");
            }}
          >
            暂时跳过
          </Btn>
          <Btn
            full
            onClick={() => {
              setAddFollowupDialog(null);
              showToast("已通知消费端尝试启动分类。");
            }}
          >
            现在启动分类
          </Btn>
        </div>
      </Dialog>

      <Dialog visible={!!deleteScopeDialog} title="选择重分类范围" onClose={() => setDeleteScopeDialog(null)}>
        <div style={{ fontSize: 13, color: C.dark, lineHeight: 1.6, marginBottom: 14 }}>
          标签「{deleteScopeDialog?.tagKey}」已删除，受影响交易 {deleteScopeDialog?.affectedCount || 0} 笔，受影响日期 {deleteScopeDialog?.affectedDates?.length || 0} 天。
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Btn
            full
            onClick={() => {
              const dates = deleteScopeDialog?.affectedDates || [];
              setDeleteScopeDialog(null);
              triggerClassifyByDates(dates, "仅受影响交易重分类");
            }}
          >
            仅受影响的交易
          </Btn>
          <Btn
            full
            variant="danger"
            onClick={() => {
              const lockedCandidates = ledgerTransactions.filter((tx) => tx.isVerified);
              openLockedSheet({
                mode: "delete_full",
                tagKey: deleteScopeDialog?.tagKey || "",
                candidates: lockedCandidates,
                title: "以下锁定交易将被包含",
                desc: "全账本重分类默认只处理未锁定交易。你可以在这里勾选并当场解锁需要一并重分类的锁定交易。",
              });
            }}
          >
            全账本所有未锁定交易
          </Btn>
          <Btn
            full
            variant="secondary"
            onClick={() => {
              setDeleteScopeDialog(null);
              showToast("已稍后处理，未生成新重分类任务。");
            }}
          >
            稍后处理
          </Btn>
        </div>
      </Dialog>

      <Dialog visible={!!descScopeDialog} title="标签定义已更改" onClose={() => setDescScopeDialog(null)}>
        <div style={{ fontSize: 13, color: C.dark, lineHeight: 1.6, marginBottom: 14 }}>标签「{descScopeDialog?.tagKey}」描述已更新。请选择是否启动重分类以及范围。</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Btn
            full
            variant="secondary"
            onClick={() => {
              setDescScopeDialog(null);
              showToast("已暂时跳过，本次不触发重分类。");
            }}
          >
            暂时跳过
          </Btn>
          <Btn
            full
            onClick={() => {
              const tagKey = descScopeDialog?.tagKey;
              const dates = uniqueSortedDates(ledgerTransactions.filter((tx) => tx.category === tagKey && !tx.isVerified).map((tx) => tx.date));
              setDescScopeDialog(null);
              triggerClassifyByDates(dates, "该标签下仅未锁定交易重分类");
            }}
          >
            该标签下仅未锁定交易
          </Btn>
          <Btn
            full
            variant="danger"
            onClick={() => {
              const tagKey = descScopeDialog?.tagKey || "";
              const lockedCandidates = ledgerTransactions.filter((tx) => tx.category === tagKey && tx.isVerified);
              openLockedSheet({
                mode: "desc_all",
                tagKey,
                candidates: lockedCandidates,
                title: "以下锁定交易将被包含",
                desc: "你可以勾选需要当场解锁的该标签锁定交易。未勾选的锁定交易保持保护状态。",
              });
            }}
          >
            该标签下所有交易
          </Btn>
        </div>
      </Dialog>

      <BottomSheet visible={!!lockedSheet} title={lockedSheet?.title || "以下锁定交易将被包含"} onClose={closeLockedSheet}>
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7, marginBottom: 12 }}>{lockedSheet?.desc}</div>
        {lockedSheet?.mode === "desc_all" && lockedSheet.candidates.length ? (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <Btn
              small
              variant="secondary"
              onClick={() => {
                if (selectedLockedIds.length === lockedSheet.candidates.length) {
                  setSelectedLockedIds([]);
                  return;
                }
                setSelectedLockedIds(lockedSheet.candidates.map((tx) => tx.id));
              }}
            >
              {selectedLockedIds.length === lockedSheet.candidates.length ? "取消全选" : "全选锁定交易"}
            </Btn>
          </div>
        ) : null}
        {lockedSheet?.candidates?.length ? (
          <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
            {lockedSheet.candidates.map((tx, index) => {
              const selected = selectedLockedIds.includes(tx.id);
              return (
                <label
                  key={tx.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "12px 12px",
                    borderBottom: index < lockedSheet.candidates.length - 1 ? `0.5px solid ${C.line}` : "none",
                    background: selected ? C.blueBg : C.white,
                    cursor: "pointer",
                  }}
                >
                  <input type="checkbox" checked={selected} onChange={() => toggleLockedSelected(tx.id)} style={{ marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{tx.title}</div>
                    <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                      {tx.date} · {tx.category} · {formatAmount(-tx.amount)}
                    </div>
                  </div>
                  <div style={{ padding: "2px 7px", borderRadius: 999, fontSize: 10, background: C.orangeBg, color: C.amber }}>已锁定</div>
                </label>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px dashed ${C.border}`, color: C.sub, fontSize: 12, marginBottom: 14 }}>当前范围没有锁定交易，确认后将直接按该范围发起重分类。</div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <Btn full variant="secondary" onClick={closeLockedSheet}>
            取消
          </Btn>
          <Btn full onClick={handleConfirmLockedSheet}>
            确认并开始重分类
          </Btn>
        </div>
      </BottomSheet>
      <Toast visible={Boolean(toastMessage)} message={toastMessage} />
    </div>
  );
}

function AIMemoryPage({
  onBack,
  memory,
  snapshots,
  onSaveMemory,
  onTriggerLearning,
  onRollbackSnapshot,
  onDeleteSnapshot,
  exampleLibrarySummary,
  onLearningComplete
}: {
  onBack: () => void;
  memory: string[];
  snapshots: SettingsSnapshotItem[];
  onSaveMemory: (items: string[]) => Promise<void>;
  onTriggerLearning: () => Promise<boolean>;
  onRollbackSnapshot: MoniSettingsData["actions"]["rollbackMemorySnapshot"];
  onDeleteSnapshot: MoniSettingsData["actions"]["deleteMemorySnapshot"];
  exampleLibrarySummary: SettingsExampleLibrarySummary;
  onLearningComplete: () => void;
}) {
  // 编辑草稿和已保存记忆必须分离。
  // 这样点击条目编辑、回车新增条目、删除条目时都不会提前把草稿写回保存态。
  const [draftMemory, setDraftMemory] = useState<string[]>(memory);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showLearn, setShowLearn] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [learning, setLearning] = useState(false);
  const [snapshotBusyId, setSnapshotBusyId] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const inputRefs = useRef<Array<HTMLTextAreaElement | null>>([]);

  useEffect(() => {
    if (editingIndex === null) {
      setDraftMemory(memory);
    }
  }, [memory, editingIndex]);

  useEffect(() => {
    if (editingIndex === null) {
      return;
    }
    const target = inputRefs.current[editingIndex];
    if (target && typeof target.focus === "function") {
      target.focus();
      const length = target.value?.length ?? 0;
      if (typeof target.setSelectionRange === "function") {
        target.setSelectionRange(length, length);
      }
    }
  }, [editingIndex, draftMemory.length]);

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(""), 2200);
  };

  const beginEditing = () => {
    const nextDraft = memory.length ? [...memory] : [""];
    setDraftMemory(nextDraft);
    setEditingIndex(0);
  };

  const updateDraftItem = (index: number, nextValue: string) => {
    setDraftMemory((items) => items.map((item, itemIndex) => (itemIndex === index ? nextValue : item)));
  };

  const insertBlankAfter = (index: number) => {
    setDraftMemory((items) => {
      const nextItems = [...items];
      nextItems.splice(index + 1, 0, "");
      return nextItems;
    });
    setEditingIndex(index + 1);
  };

  const removeDraftItem = (index: number) => {
    setDraftMemory((items) => {
      const nextItems = items.filter((_, itemIndex) => itemIndex !== index);
      const normalizedItems = nextItems.length ? nextItems : [""];
      const nextFocusIndex = Math.min(index, normalizedItems.length - 1);
      window.setTimeout(() => setEditingIndex(nextFocusIndex), 0);
      return normalizedItems;
    });
  };

  const finishEditing = () => {
    const nextSavedMemory = draftMemory.map((item) => item.trim()).filter(Boolean);
    void onSaveMemory(nextSavedMemory)
      .then(() => {
        setDraftMemory(nextSavedMemory);
        setEditingIndex(null);
        showToast("记忆已保存");
      })
      .catch(() => {
        showToast("保存失败，请重试");
      });
  };

  const visibleItems = editingIndex !== null ? draftMemory : memory;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SubPageHeader title="AI 记忆" onBack={onBack} />
      <div className="scrollbar-hide" style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>
        <FormCard title="记忆概况">
          <div style={{ display: "flex", gap: 8 }}>
            <div
              onClick={() => setShowExamples(true)}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: C.greenBg, border: `1px solid ${C.mint}30`, cursor: "pointer" }}
            >
              <div style={{ fontSize: 10, color: C.sub }}>实例库</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.greenText }}>
                {exampleLibrarySummary.delta} <span style={{ fontSize: 11, fontWeight: 400 }}>/ {exampleLibrarySummary.total}</span>
              </div>
              <div style={{ fontSize: 10, color: C.sub, marginTop: 4 }}>距离上次学习的增量 / 实例库总量</div>
            </div>
            <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: C.blueBg, border: `1px solid ${C.blue}30` }}>
              <div style={{ fontSize: 10, color: C.sub }}>记忆条数</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.dark }}>{memory.length}</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <Btn small variant="secondary" onClick={() => setShowHistory(true)}>
              历史版本
            </Btn>
            <Btn small variant="primary" onClick={() => setShowLearn(true)} disabled={learning}>
              {learning ? "学习中…" : "立即学习"}
            </Btn>
          </div>
        </FormCard>

        <FormCard
          title="当前记忆"
          footer={
            editingIndex !== null ? (
              <Btn small variant="secondary" onClick={finishEditing}>
                完成
              </Btn>
            ) : (
              <Btn small variant="secondary" onClick={beginEditing}>编辑记忆</Btn>
            )
          }
        >
          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {visibleItems.map((item, index) => (
              <div
                key={`memory-${index}`}
                onClick={editingIndex !== null ? () => setEditingIndex(index) : undefined}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  padding: "12px 14px",
                  borderBottom: index < visibleItems.length - 1 ? `0.5px solid ${C.line}` : "none",
                  gap: 10,
                  cursor: editingIndex !== null ? "text" : "default",
                }}
              >
                <div style={{ fontSize: 12, color: C.mint, fontWeight: 700, flexShrink: 0, marginTop: 1, width: 18 }}>{index + 1}.</div>
                {editingIndex === index ? (
                  <textarea
                    ref={(element) => {
                      inputRefs.current[index] = element;
                    }}
                    data-selectable
                    value={item}
                    onChange={(event) => updateDraftItem(index, event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        insertBlankAfter(index);
                      }
                    }}
                    placeholder="输入记忆条目，回车新建下一条"
                    style={{
                      flex: 1,
                      minHeight: 54,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: `1.5px solid ${C.mint}`,
                      fontSize: 13,
                      color: C.dark,
                      lineHeight: 1.55,
                      fontFamily: "inherit",
                      outline: "none",
                      resize: "none",
                      boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <div onClick={editingIndex !== null ? () => setEditingIndex(index) : undefined} style={{ flex: 1, fontSize: 13, color: C.dark, lineHeight: 1.55, paddingTop: 1, cursor: editingIndex !== null ? "text" : "inherit" }}>
                    {item}
                  </div>
                )}
                {editingIndex !== null ? (
                  <div onClick={() => removeDraftItem(index)} style={{ fontSize: 16, color: C.coral, cursor: "pointer", padding: "0 2px" }}>
                    ×
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {editingIndex === null ? <div style={{ marginTop: 10, fontSize: 11, color: C.sub, lineHeight: 1.6 }}>点击“编辑记忆”进入编辑态。编辑态下回车会在下一行新增空白条目，直到点击“完成”才保存。</div> : null}
        </FormCard>
      </div>

      <Dialog visible={showLearn} title="立即学习" onClose={() => setShowLearn(false)}>
        <div style={{ fontSize: 13, color: C.dark, lineHeight: 1.6, marginBottom: 16 }}>AI 将基于最近修正更新记忆偏好，并自动生成新版本快照。</div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn full variant="secondary" onClick={() => setShowLearn(false)}>
            取消
          </Btn>
          <Btn
            full
            onClick={() => {
              setShowLearn(false);
              setLearning(true);
              void onTriggerLearning()
                .then((ok) => {
                  if (ok) {
                    onLearningComplete();
                    showToast("学习完成，AI 已更新当前账本记忆。");
                    return;
                  }
                  showToast("学习未触发或失败，请检查学习条件与模型配置。");
                })
                .catch(() => {
                  showToast("学习失败，请重试");
                })
                .finally(() => {
                  setLearning(false);
                });
            }}
          >
            开始学习
          </Btn>
        </div>
      </Dialog>

      <BottomSheet visible={showHistory} title="记忆历史版本" onClose={() => setShowHistory(false)}>
        {snapshots.map((snapshot, index) => (
          <div key={snapshot.id} style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: index < snapshots.length - 1 ? `0.5px solid ${C.line}` : "none", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Space Mono', monospace", color: C.dark }}>{snapshot.id.slice(0, 10)}</span>
                {snapshot.isCurrent ? <span style={{ padding: "1px 6px", borderRadius: 4, background: C.mint, color: C.white, fontSize: 9, fontWeight: 700 }}>当前</span> : null}
              </div>
              <div style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>{snapshot.summary}</div>
            </div>
            {!snapshot.isCurrent ? (
              <div style={{ display: "flex", gap: 6 }}>
                <Btn
                  small
                  variant="secondary"
                  onClick={() => {
                    setSnapshotBusyId(snapshot.id);
                    void onRollbackSnapshot(snapshot.id)
                  .then((ok: boolean) => {
                        showToast(ok ? "已回退到该版本" : "回退失败，请重试");
                      })
                      .finally(() => {
                        setSnapshotBusyId("");
                      });
                  }}
                  disabled={snapshotBusyId === snapshot.id}
                >
                  {snapshotBusyId === snapshot.id ? "处理中…" : "回退"}
                </Btn>
                <Btn
                  small
                  variant="danger"
                  onClick={() => {
                    setSnapshotBusyId(snapshot.id);
                    void onDeleteSnapshot(snapshot.id)
                  .then((ok: boolean) => {
                        showToast(ok ? "历史版本已删除" : "删除失败（当前版本不可删除）");
                      })
                      .finally(() => {
                        setSnapshotBusyId("");
                      });
                  }}
                  disabled={snapshotBusyId === snapshot.id}
                >
                  {snapshotBusyId === snapshot.id ? "处理中…" : "删除"}
                </Btn>
              </div>
            ) : null}
          </div>
        ))}
        {!snapshots.length ? (
          <div style={{ padding: "10px 0", fontSize: 12, color: C.sub }}>暂无历史版本</div>
        ) : null}
      </BottomSheet>

      <BottomSheet visible={showExamples} title="实例库" onClose={() => setShowExamples(false)}>
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7, marginBottom: 14 }}>
          这里先把“实例库”作为设置页里的可点击入口展示。当前原型只固定它的核心语义，不在这里臆造更深的字段结构。
        </div>
        <div style={{ padding: "12px 14px", borderRadius: 12, background: C.greenBg, border: `1px solid ${C.mint}30`, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>当前账本实例库概况</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.greenText }}>
            {exampleLibrarySummary.delta} <span style={{ fontSize: 12, fontWeight: 400 }}>/ {exampleLibrarySummary.total}</span>
          </div>
        </div>
        <div style={{ fontSize: 12, color: C.dark, lineHeight: 1.7 }}>这代表“距离上次学习的增量 / 实例库总量”。</div>
      </BottomSheet>

      <Toast visible={learning} message="AI 正在学习新的偏好…" />
      <Toast visible={Boolean(toastMessage)} message={toastMessage} />
    </div>
  );
}

function BudgetPage({
  onBack,
  customTags,
  monthlyBudget,
  categoryBudgets,
  onSaveBudget,
}: {
  onBack: () => void;
  customTags: CustomTag[];
  monthlyBudget: string;
  categoryBudgets: Record<string, string>;
  onSaveBudget: (draft: BudgetDraft) => Promise<void>;
}) {
  const [monthly, setMonthly] = useState<string>(monthlyBudget || "");
  const [catBudgets, setCatBudgets] = useState<Record<string, string>>(categoryBudgets || {});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const total = Object.values(catBudgets).reduce<number>((sum, value) => sum + (Number.parseFloat(value) || 0), 0);
  const over = Boolean(monthly) && total > (Number.parseFloat(monthly) || 0);

  useEffect(() => {
    setMonthly(monthlyBudget || "");
    setCatBudgets(categoryBudgets || {});
  }, [monthlyBudget, categoryBudgets]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SubPageHeader title="预算设置" onBack={onBack} />
      <div className="scrollbar-hide" style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>
        <FormCard
          title="月度预算"
          footer={
            <Btn
              onClick={() => {
                if (saving) return;
                setSaveError("");
                setSaving(true);
                void onSaveBudget({ monthly, catBudgets })
                  .then(() => {
                    setSaved(true);
                    window.setTimeout(() => setSaved(false), 2000);
                  })
                  .catch(() => {
                    setSaveError("预算保存失败，请重试");
                  })
                  .finally(() => {
                    setSaving(false);
                  });
              }}
              disabled={saving}
            >
              {saving ? "保存中…" : "保存预算"}
            </Btn>
          }
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 8 }}>月度总预算</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: C.dark }}>¥</span>
            <input
              data-selectable
              type="number"
              value={monthly}
              onChange={(event) => setMonthly(event.target.value)}
              placeholder="0"
              style={{
                flex: 1,
                minWidth: 0,
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                borderRadius: 12,
                border: `2px solid ${C.dark}`,
                fontSize: 22,
                fontWeight: 800,
                fontFamily: "'Space Mono', monospace",
                color: "#111827",
                outline: "none",
                background: C.white
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.sub }}>分类预算</div>
            <div style={{ fontSize: 11, color: over ? C.coral : C.sub }}>
              合计 ¥{total}
              {monthly ? ` / ¥${monthly}` : ""}
              {over ? " · 超出" : ""}
            </div>
          </div>

          <div style={{ background: C.white, border: `1.5px solid ${over ? C.pinkBd : C.border}`, borderRadius: 12, padding: "4px 14px" }}>
            {customTags.map((tag, index, array) => (
              <div key={tag.key} style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: index < array.length - 1 ? `0.5px solid ${C.line}` : "none", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, width: 48 }}>{tag.key}</div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 13, color: C.dark, fontWeight: 700 }}>¥</span>
                  <input
                    data-selectable
                    type="number"
                    value={catBudgets[tag.key] || ""}
                    onChange={(event) => setCatBudgets({ ...catBudgets, [tag.key]: event.target.value })}
                    placeholder="—"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#111827",
                      outline: "none",
                      fontFamily: "'Space Mono', monospace",
                      background: C.white
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, color: C.sub, marginTop: 10, lineHeight: 1.5 }}>留空表示不设预算上限。分类预算之和不应超过月度总预算。</div>
          {saveError ? <div style={{ fontSize: 11, color: C.coral, marginTop: 8 }}>{saveError}</div> : null}
        </FormCard>
      </div>
      <Toast visible={saved} message="预算已保存" />
    </div>
  );
}

function LearningSettingsPage({
  onBack,
  learningSettings,
  onChangeLearningSettings,
  onSaveLearningSettings,
  exampleLibrarySummary
}: {
  onBack: () => void;
  learningSettings: LearningSettingsDraft;
  onChangeLearningSettings: React.Dispatch<React.SetStateAction<LearningSettingsDraft>>;
  onSaveLearningSettings: (settings: LearningSettingsDraft) => Promise<void>;
  exampleLibrarySummary: SettingsExampleLibrarySummary;
}) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SubPageHeader title="学习设置" onBack={onBack} />
      <div className="scrollbar-hide" style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>
        <FormCard
          title="学习参数"
          footer={
            <Btn
              onClick={() => {
                if (saving) return;
                setSaveError("");
                setSaving(true);
                void onSaveLearningSettings(learningSettings)
                  .then(() => {
                    setSaved(true);
                    window.setTimeout(() => setSaved(false), 2000);
                  })
                  .catch(() => {
                    setSaveError("学习设置保存失败，请重试");
                  })
                  .finally(() => {
                    setSaving(false);
                  });
              }}
              disabled={saving}
            >
              {saving ? "保存中…" : "保存设置"}
            </Btn>
          }
        >
          <div style={{ padding: "10px 14px", borderRadius: 12, background: C.blueBg, border: `1px solid ${C.blue}30`, marginBottom: 16, fontSize: 12, color: C.dark, lineHeight: 1.5 }}>
            控制 AI 自动学习行为和记忆收编，仅对当前账本生效。
            <br />
            当前实例库增量：{exampleLibrarySummary.delta} / {exampleLibrarySummary.total}
          </div>

          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "14px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>自动学习</div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>达到阈值后自动触发学习</div>
              </div>
              <div onClick={() => onChangeLearningSettings((value) => ({ ...value, autoLearn: !value.autoLearn }))} style={{ width: 44, height: 24, borderRadius: 12, background: learningSettings.autoLearn ? C.mint : C.border, position: "relative", cursor: "pointer" }}>
                <div style={{ width: 20, height: 20, borderRadius: 10, background: C.white, position: "absolute", top: 2, left: learningSettings.autoLearn ? 22 : 2, boxShadow: "0 1px 4px rgba(0,0,0,.15)" }} />
              </div>
            </div>
          </div>

          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "14px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>学习阈值</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.mint, fontFamily: "'Space Mono', monospace" }}>{learningSettings.threshold}</div>
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 10 }}>累计修正次数达到该值后触发学习</div>
            <input type="range" min={1} max={20} value={learningSettings.threshold} onChange={(event) => onChangeLearningSettings((value) => ({ ...value, threshold: parseInt(event.target.value, 10) }))} style={{ width: "100%", accentColor: C.mint }} />
          </div>

          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>收编阈值</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.amber, fontFamily: "'Space Mono', monospace" }}>{learningSettings.compThreshold}</div>
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 10 }}>记忆条目超过此值后允许收编压缩</div>
            <input type="range" min={10} max={60} value={learningSettings.compThreshold} onChange={(event) => onChangeLearningSettings((value) => ({ ...value, compThreshold: parseInt(event.target.value, 10) }))} style={{ width: "100%", accentColor: C.amber }} />
          </div>
          {saveError ? <div style={{ fontSize: 11, color: C.coral, marginTop: 10 }}>{saveError}</div> : null}
        </FormCard>
      </div>
      <Toast visible={saved} message="学习设置已保存" />
    </div>
  );
}

function FullReclassPage({
  onBack,
  onTriggerFullReclassification,
  aiStatus,
}: {
  onBack: () => void;
  onTriggerFullReclassification: MoniSettingsData["actions"]["triggerFullReclassification"];
  aiStatus: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const running = aiStatus === "ANALYZING";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SubPageHeader title="全量重新分类" onBack={onBack} />
      <div className="scrollbar-hide" style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>
        <FormCard title="重分类说明">
          <div style={{ padding: "14px", borderRadius: 12, background: C.warmBg, border: `1.5px solid ${C.warmBd}`, marginBottom: 18, lineHeight: 1.6 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 6 }}>什么是全量重分类？</div>
            <div style={{ fontSize: 12, color: C.dark }}>AI 将对当前账本中的未锁定交易重新运行分类，并重新对齐当前启用的记忆偏好。</div>
          </div>

          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 18 }}>
            {[{ label: "总交易数", value: "127 笔" }, { label: "未锁定", value: "84 笔", color: C.amber }, { label: "已锁定", value: "43 笔", color: C.mint }].map((row, index) => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: index < 2 ? `0.5px solid ${C.line}` : "none" }}>
                <span style={{ fontSize: 13, color: C.sub }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: row.color || C.dark }}>{row.value}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: "10px 14px", borderRadius: 10, background: C.pinkBg, border: `1px solid ${C.pinkBd}`, marginBottom: 16, fontSize: 12, color: C.coral, lineHeight: 1.5 }}>
            全量重分类，会清理未锁定交易的实例库记录。
            <br />
            并根据当前启用的记忆重新分类，请确认当前 AI 记忆情况，谨慎操作。
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn variant={running ? "secondary" : "danger"} onClick={() => setConfirming(true)} disabled={running || submitting}>
              {running ? "重分类进行中…" : "开始全量重新分类"}
            </Btn>
          </div>
        </FormCard>
      </div>

      <Dialog visible={confirming} title="确认全量重分类" onClose={() => setConfirming(false)}>
        <div style={{ fontSize: 13, color: C.dark, lineHeight: 1.6, marginBottom: 16 }}>即将对 <strong>84 笔未锁定交易</strong> 发起全量重分类。</div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn full variant="secondary" onClick={() => setConfirming(false)}>
            取消
          </Btn>
          <Btn
            full
            variant="danger"
            onClick={() => {
              setConfirming(false);
              setSubmitting(true);
              void onTriggerFullReclassification()
                .then(() => {
                  setToastMessage("重分类任务已入队，AI 正在处理中");
                })
                .catch(() => {
                  setToastMessage("重分类触发失败，请稍后重试");
                })
                .finally(() => {
                  setSubmitting(false);
                  window.setTimeout(() => setToastMessage(""), 2200);
                });
            }}
          >
            确认开始
          </Btn>
        </div>
      </Dialog>

      <Toast visible={Boolean(toastMessage)} message={toastMessage} />
    </div>
  );
}

function AboutPage({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <SubPageHeader title="关于" onBack={onBack} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px" }}>
        <img src="/icon.svg" alt="Moni App Icon" style={{ width: 72, height: 72, marginBottom: 16 }} />
        <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, fontFamily: "'Nunito',sans-serif", marginBottom: 4 }}>Moni</div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 20 }}>AI 原生个人财务助手</div>
        <div style={{ fontSize: 12, color: C.muted, textAlign: "center", lineHeight: 1.7 }}>越用越聪明的记账伙伴。<br />导入账单，浏览流水，顺手纠错，AI 自动学会。</div>
        <div style={{ marginTop: 28, fontSize: 11, color: C.muted }}>版本 0.2.1 · 构建于 2026-04</div>
        <div style={{ marginTop: 20, display: "flex", gap: 16 }}>
          {["反馈", "文档", "致谢"].map((text) => (
            <div key={text} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, color: C.sub, cursor: "pointer" }}>
              {text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 设置页主控制器负责：
 * 1. 在同一个手机画布里做 root / 二级页切换
 * 2. 与首页、记账页共享同一外框规格
 * 3. 通过底部导航把三页串成一个完整原型流
 */
export default function MoniSettings({
  onNavigate,
}: {
  onNavigate: (page: "home" | "entry" | "settings") => void;
}) {
  const onOpenHome = () => onNavigate("home");
  const onOpenEntry = () => onNavigate("entry");
  const {
    aiConfig,
    selfDescription: selfDescriptionFromReadModel,
    ledgers,
    activeLedgerId,
    tags,
    memoryItems,
    snapshots,
    exampleLibrarySummary: currentExampleSummaryFromReadModel,
    learningConfig,
    monthlyBudget,
    categoryBudgets,
    ledgerTransactions,
    actions: {
      createLedger,
      switchLedger,
      renameLedger,
      deleteLedger,
      createTag,
      renameTag,
      updateTagDescription,
      deleteTag,
        updateMemoryItems,
        triggerImmediateLearning,
      rollbackMemorySnapshot,
      deleteMemorySnapshot,
      updateMonthlyBudget,
      updateCategoryBudget,
      updateLearningThreshold,
      toggleAutoLearn,
      updateCompressionThreshold,
      triggerFullReclassification,
      updateProvider,
      updateApiKey,
      updateBaseUrl,
      updateActiveModel,
      updateMaxTokens,
      updateTemperature,
        updateEnableThinking,
        testConnection,
        saveSelfDescription,
    },
  } = useMoniSettingsData();
  const [aiEngineStatus, setAiEngineStatus] = useState<string>("IDLE");
  const onChangeActiveLedgerId = useCallback((ledgerId: string) => {
    void switchLedger(ledgerId);
  }, [switchLedger]);
  const [page, setPage] = useState<SettingsPageKey>("root");
  const [selfDescription, setSelfDescription] = useState(DEFAULT_SELF_DESCRIPTION_DEMO);
  const [customTagsByLedger, setCustomTagsByLedger] = useState<Record<string, CustomTag[]>>({});
  const [memoryByLedger, setMemoryByLedger] = useState<Record<string, string[]>>({});
  const [snapshotsByLedger, setSnapshotsByLedger] = useState<Record<string, SettingsSnapshotItem[]>>({});
  const [learningSettingsByLedger, setLearningSettingsByLedger] = useState<Record<string, LearningSettingsDraft>>({});
  const [exampleSummaryByLedger, setExampleSummaryByLedger] = useState<Record<string, SettingsExampleLibrarySummary>>({});
  const [budgetByLedger, setBudgetByLedger] = useState<Record<string, BudgetDraft>>({});
  // S32 原型态数据：交易与重分类队列均按账本隔离。
  const [ledgerTransactionsByLedger, setLedgerTransactionsByLedger] = useState<Record<string, SettingsLedgerTransaction[]>>(INITIAL_LEDGER_TRANSACTIONS);
  const [classifyQueueByLedger, setClassifyQueueByLedger] = useState<Record<string, string[]>>(INITIAL_CLASSIFY_QUEUE_BY_LEDGER);
  const currentLedger = useMemo(() => ledgers.find((item) => item.id === activeLedgerId) || ledgers[0], [ledgers, activeLedgerId]);
  const currentLedgerName = currentLedger?.name || "未设置账本";
  const currentCustomTags = customTagsByLedger[activeLedgerId] || [];
  const currentMemory = memoryByLedger[activeLedgerId] || [];
  const currentSnapshots = snapshotsByLedger[activeLedgerId] || [];
  const currentLearningSettings = learningSettingsByLedger[activeLedgerId] || INITIAL_LEARNING_SETTINGS;
  const currentExampleSummary = exampleSummaryByLedger[activeLedgerId] || INITIAL_EXAMPLE_LIBRARY_SUMMARY;
  const currentBudget = budgetByLedger[activeLedgerId] || { monthly: "", catBudgets: {} };
  const budgetSummaryText = useMemo(() => {
    const monthlyValue = Number.parseFloat(currentBudget.monthly || '');
    if (!Number.isFinite(monthlyValue) || monthlyValue <= 0) {
      return "未设置";
    }
    return `¥${monthlyValue.toLocaleString('zh-CN')}`;
  }, [currentBudget.monthly]);
  const currentLedgerTransactions = ledgerTransactionsByLedger[activeLedgerId] || [];
  const currentClassifyQueueDates = classifyQueueByLedger[activeLedgerId] || [];
  const aiProviderName = useMemo(
    () => PROVIDERS.find((item) => item.id === aiConfig.provider)?.name || aiConfig.provider || "未配置",
    [aiConfig.provider]
  );
  const aiConfigSummary = useMemo(() => {
    if (!aiConfig.activeModel) {
      return `${aiProviderName} · 未设置模型`;
    }
    return `${aiProviderName} · ${aiConfig.activeModel}`;
  }, [aiConfig.activeModel, aiProviderName]);

  useEffect(() => {
    // 当外部传入的 active id 已失效时，自动兜底到现存首个账本，避免根页显示与管理页状态断裂。
    if (!ledgers.length) {
      return;
    }
    const exists = ledgers.some((item) => item.id === activeLedgerId);
    if (!exists) {
      onChangeActiveLedgerId(ledgers[0].id);
    }
  }, [ledgers, activeLedgerId, onChangeActiveLedgerId]);

  useEffect(() => {
    /**
     * 自述展示值必须由设置页读模型驱动。
     * 之前这里遗漏了回填，导致刷新后始终显示本地 demo 初始值，
     * 即便 `self_description.md` 已经真实落盘，也不会重新显示出来。
     */
    setSelfDescription(
      selfDescriptionFromReadModel && selfDescriptionFromReadModel.trim().length > 0
        ? selfDescriptionFromReadModel
        : DEFAULT_SELF_DESCRIPTION_DEMO
    );
  }, [selfDescriptionFromReadModel]);

  useEffect(() => {
    if (!activeLedgerId) {
      return;
    }

    // 用设置读模型的当前账本数据回填本地分桶状态，确保“上方账本切换”能驱动下方账本级设置联动。
    setCustomTagsByLedger((value) => ({
      ...value,
      [activeLedgerId]: tags.filter((tag) => !tag.isSystem).map((tag) => ({ key: tag.key, desc: tag.description })),
    }));
    setMemoryByLedger((value) => ({
      ...value,
      [activeLedgerId]: memoryItems,
    }));
    setSnapshotsByLedger((value) => ({
      ...value,
      [activeLedgerId]: snapshots,
    }));
    setLearningSettingsByLedger((value) => ({
      ...value,
      [activeLedgerId]: {
        autoLearn: learningConfig.autoLearn,
        threshold: learningConfig.learningThreshold,
        compThreshold: learningConfig.compressionThreshold,
      },
    }));
    setExampleSummaryByLedger((value) => ({
      ...value,
      [activeLedgerId]: {
        delta: currentExampleSummaryFromReadModel.delta,
        total: currentExampleSummaryFromReadModel.total,
      },
    }));
    setBudgetByLedger((value) => ({
      ...value,
      [activeLedgerId]: {
        monthly: monthlyBudget ? String(monthlyBudget) : "",
        catBudgets: Object.fromEntries(
          Object.entries(categoryBudgets || {}).map(([key, amount]) => [key, String(amount ?? "")])
        ),
      },
    }));
    setLedgerTransactionsByLedger((value) => ({
      ...value,
      [activeLedgerId]: ledgerTransactions || [],
    }));
  }, [
    activeLedgerId,
    tags,
    memoryItems,
    snapshots,
    learningConfig,
    currentExampleSummaryFromReadModel,
    monthlyBudget,
    categoryBudgets,
    ledgerTransactions,
  ]);

  useEffect(() => {
    // 新账本首次进入时，补齐 S32 所需的账本级容器，避免读取空引用。
    if (!activeLedgerId) {
      return;
    }
    setLedgerTransactionsByLedger((value) => {
      if (value[activeLedgerId]) {
        return value;
      }
      return { ...value, [activeLedgerId]: [] };
    });
    setClassifyQueueByLedger((value) => {
      if (value[activeLedgerId]) {
        return value;
      }
      return { ...value, [activeLedgerId]: [] };
    });
  }, [activeLedgerId]);

  useEffect(() => {
    const processor = BatchProcessor.getInstance();
    const unsubscribe = processor.on("status", ({ status }: { status: string }) => {
      setAiEngineStatus(status);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const updateCurrentLedgerTransactions = (nextValue: React.SetStateAction<SettingsLedgerTransaction[]>) => {
    setLedgerTransactionsByLedger((value) => {
      const currentItems = value[activeLedgerId] || [];
      const nextItems = typeof nextValue === "function" ? nextValue(currentItems) : nextValue;
      return { ...value, [activeLedgerId]: nextItems };
    });
  };

  const enqueueCurrentLedgerDates = (dates: string[]) => {
    let result = { added: 0, total: 0 };
    setClassifyQueueByLedger((value) => {
      const currentQueue = value[activeLedgerId] || [];
      const nextQueue = uniqueSortedDates([...currentQueue, ...dates]);
      result = {
        added: Math.max(0, nextQueue.length - currentQueue.length),
        total: nextQueue.length,
      };
      return { ...value, [activeLedgerId]: nextQueue };
    });
    return result;
  };

  const updateCurrentMemory = (nextValue: React.SetStateAction<string[]>) => {
    setMemoryByLedger((value) => {
      const currentItems = value[activeLedgerId] || [];
      const nextItems = typeof nextValue === "function" ? nextValue(currentItems) : nextValue;
      return { ...value, [activeLedgerId]: nextItems };
    });
  };

  const persistCurrentMemory = useCallback(async (items: string[]) => {
    updateCurrentMemory(items);
    await updateMemoryItems(items);
  }, [updateMemoryItems, activeLedgerId, updateCurrentMemory]);

  const triggerCurrentLearning = useCallback(async (): Promise<boolean> => {
    return triggerImmediateLearning();
  }, [triggerImmediateLearning]);

  const rollbackCurrentSnapshot = useCallback(async (snapshotId: string) => {
    return rollbackMemorySnapshot(snapshotId);
  }, [rollbackMemorySnapshot]);

  const deleteCurrentSnapshot = useCallback(async (snapshotId: string) => {
    return deleteMemorySnapshot(snapshotId);
  }, [deleteMemorySnapshot]);

  const updateCurrentLearningSettings = (nextValue: React.SetStateAction<LearningSettingsDraft>) => {
    setLearningSettingsByLedger((value) => {
      const currentItems = value[activeLedgerId] || INITIAL_LEARNING_SETTINGS;
      const nextItems = typeof nextValue === "function" ? nextValue(currentItems) : nextValue;
      return { ...value, [activeLedgerId]: nextItems };
    });
  };

  const clearCurrentExampleDelta = () => {
    setExampleSummaryByLedger((value) => {
      const currentItems = value[activeLedgerId] || INITIAL_EXAMPLE_LIBRARY_SUMMARY;
      return { ...value, [activeLedgerId]: { ...currentItems, delta: 0 } };
    });
  };

  const updateCurrentBudget = ({ monthly, catBudgets }: BudgetDraft) => {
    setBudgetByLedger((value) => ({
      ...value,
      [activeLedgerId]: { monthly, catBudgets },
    }));
  };

  const persistCurrentBudget = useCallback(async ({ monthly, catBudgets }: BudgetDraft) => {
    updateCurrentBudget({ monthly, catBudgets });
    const parsedMonthly = parseFloat(monthly);
    await updateMonthlyBudget(Number.isFinite(parsedMonthly) && parsedMonthly > 0 ? parsedMonthly : 0);

    const previousBudgetKeys = Object.keys(currentBudget?.catBudgets || {});
    const nextBudgetKeys = Object.keys(catBudgets || {});
    const allCategoryKeys = Array.from(new Set([...previousBudgetKeys, ...nextBudgetKeys]));
    for (const categoryKey of allCategoryKeys) {
      const rawAmount = catBudgets?.[categoryKey];
      const parsedAmount = parseFloat(rawAmount);
      await updateCategoryBudget(
        categoryKey,
        Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0
      );
    }
  }, [currentBudget, updateCategoryBudget, updateCurrentBudget, updateMonthlyBudget]);

  const persistCurrentLearningSettings = useCallback(async (settings: LearningSettingsDraft) => {
    updateCurrentLearningSettings(settings);
    await toggleAutoLearn(Boolean(settings.autoLearn));
    await updateLearningThreshold(settings.threshold);
    await updateCompressionThreshold(settings.compThreshold);
  }, [
    toggleAutoLearn,
    updateLearningThreshold,
    updateCompressionThreshold,
    updateCurrentLearningSettings
  ]);

  const renderPage = () => {
    switch (page) {
      case "aiConfig":
        return (
          <AIConfigPage
            onBack={() => setPage("root")}
            aiConfig={aiConfig}
            onUpdateProvider={updateProvider}
            onUpdateApiKey={updateApiKey}
            onUpdateBaseUrl={updateBaseUrl}
            onUpdateActiveModel={updateActiveModel}
            onUpdateMaxTokens={updateMaxTokens}
            onUpdateTemperature={updateTemperature}
            onUpdateEnableThinking={updateEnableThinking}
            onTestConnection={testConnection}
          />
        );
      case "selfDesc":
        return (
          <SelfDescPage
            onBack={() => setPage("root")}
            text={selfDescription}
            onChange={setSelfDescription}
            onSave={saveSelfDescription}
          />
        );
      case "ledgerManage":
        return (
          <LedgerManagePage
            onBack={() => setPage("root")}
            ledgers={ledgers}
            activeId={activeLedgerId}
            onSwitchLedger={switchLedger}
            onCreateLedger={createLedger}
            onRenameLedger={renameLedger}
            onDeleteLedger={deleteLedger}
          />
        );
      case "tagManage":
        return (
          <TagManagePage
            onBack={() => setPage("root")}
            customTags={currentCustomTags}
            onCreateTag={createTag}
            onRenameTag={renameTag}
            onUpdateTagDescription={updateTagDescription}
            onDeleteTag={deleteTag}
            ledgerTransactions={currentLedgerTransactions}
            onChangeLedgerTransactions={updateCurrentLedgerTransactions}
            classifyQueueDates={currentClassifyQueueDates}
            onEnqueueClassifyDates={enqueueCurrentLedgerDates}
          />
        );
      case "aiMemory":
        return (
          <AIMemoryPage
            onBack={() => setPage("root")}
            memory={currentMemory}
            snapshots={currentSnapshots}
            onSaveMemory={persistCurrentMemory}
            onTriggerLearning={triggerCurrentLearning}
            onRollbackSnapshot={rollbackCurrentSnapshot}
            onDeleteSnapshot={deleteCurrentSnapshot}
            exampleLibrarySummary={currentExampleSummary}
            onLearningComplete={clearCurrentExampleDelta}
          />
        );
      case "budget":
        return (
          <BudgetPage
            onBack={() => setPage("root")}
            customTags={currentCustomTags}
            monthlyBudget={currentBudget.monthly}
            categoryBudgets={currentBudget.catBudgets}
            onSaveBudget={persistCurrentBudget}
          />
        );
      case "learnSettings":
        return (
          <LearningSettingsPage
            onBack={() => setPage("root")}
            learningSettings={currentLearningSettings}
            onChangeLearningSettings={updateCurrentLearningSettings}
            onSaveLearningSettings={persistCurrentLearningSettings}
            exampleLibrarySummary={currentExampleSummary}
          />
        );
      case "fullReclass":
        return (
          <FullReclassPage
            onBack={() => setPage("root")}
            onTriggerFullReclassification={triggerFullReclassification}
            aiStatus={aiEngineStatus}
          />
        );
      case "about":
        return <AboutPage onBack={() => setPage("root")} />;
      default:
        return (
          <SettingsRoot
            onNavigate={setPage}
            customTagCount={currentCustomTags.length}
            memoryCount={currentMemory.length}
            currentLedgerName={currentLedgerName}
            ledgerCount={ledgers.length}
            budgetSummaryText={budgetSummaryText}
            aiConfigSummary={aiConfigSummary}
          />
        );
    }
  };

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
        fontFamily: "'Nunito', -apple-system, sans-serif",
        height: PHONE_FRAME_HEIGHT_CSS,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes settings-nav-glow {
          0%   { box-shadow: 0 0 0 2.5px ${C.coral}, 0 0 12px ${C.coral}44; }
          25%  { box-shadow: 0 0 0 2.5px ${C.yellow}, 0 0 12px ${C.yellow}44; }
          50%  { box-shadow: 0 0 0 2.5px ${C.blue}, 0 0 12px ${C.blue}44; }
          75%  { box-shadow: 0 0 0 2.5px ${C.mint}, 0 0 12px ${C.mint}44; }
          100% { box-shadow: 0 0 0 2.5px ${C.coral}, 0 0 12px ${C.coral}44; }
        }
        .ag {
          animation: settings-nav-glow 3s linear infinite;
        }
      `}</style>
      <Decor />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", zIndex: 1, overflow: "hidden" }}>{renderPage()}</div>
      {!isKeyboardVisible && (
        <SettingsBottomNav onOpenHome={onOpenHome} onOpenEntry={onOpenEntry} aiStatus={aiEngineStatus} />
      )}
    </div>
  );
}
