/**
 * TransactionDetailPage
 *
 * 这次重构的目标有两条主线：
 * 1. 按新的 Layer 1 / Layer 2 设计规格，把详情页收口到“二级页面 = 内容卡语法”
 * 2. 与 DragDetailPanel 共用同一套交易身份标题规则，完成新规格表示方法的第一次正式落地
 *
 * 页面仍然保持原有即时写入策略：
 * - 分类与锁定：用户操作后立即写入
 * - 用户理由：800ms debounce，失焦与关闭时强制落盘
 */

import clsx from "clsx";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, Clock3, LockKeyhole, LockKeyholeOpen, MessageCircle, MessageSquareQuote, PencilLine, ReceiptText, Sparkles, Tags, Wallet } from "lucide-react";
import { APP_HEADER_MIN_HEIGHT, APP_HEADER_PADDING_TOP, CAT, FULL_SCREEN_OVERLAY_Z_INDEX } from "@ui/features/moni-home/config";
import { useBackHandler } from "@ui/hooks/useBackHandler";
import {
  getCategory,
  normalizeTransactionDetailText,
  resolveTransactionDisplayProductText,
  resolveTransactionDisplayTitle,
} from "@ui/features/moni-home/helpers";
import type { HomeTransaction } from "@ui/features/moni-home/components";

/**
 * 退场动画时长必须与主容器的 transform 过渡保持一致，
 * 否则会出现动画还没播完组件就被父层卸载的割裂感。
 */
const EXIT_ANIMATION_MS = 240;

/**
 * 规格明确要求：文本字段停止输入 800ms 后自动保存。
 */
const DEBOUNCE_SAVE_MS = 800;

/**
 * 详情页刚滑入时，给遮罩点击一个很短的保护时间，
 * 避免用户轻点条目后，抬手误触到 backdrop 直接把页面关掉。
 */
const BACKDROP_GUARD_MS = 220;

interface TransactionDetailPageProps {
  readonly transaction: HomeTransaction;
  readonly dayId: string;
  readonly availableCategories: readonly string[];
  readonly onClose: () => void;
  readonly onUpdateCategory: (transactionId: string, category: string, reasoning?: string) => void;
  readonly onUpdateUserReasoning: (transactionId: string, note: string) => void;
  readonly onSetTransactionVerification: (transactionId: string, isVerified: boolean) => void;
}

interface CategoryTone {
  readonly color: string;
  readonly bg: string;
  readonly icon: string;
}

interface SourceBadgeMeta {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly chipClassName: string;
  readonly iconClassName: string;
}

interface DetailFieldCard {
  readonly label: string;
  readonly value: string;
  readonly span: 2 | 3 | 4 | 6;
}

interface DetailFieldPill {
  readonly label: string;
  readonly value: string;
  readonly icon: React.ReactNode;
}

interface DetailFieldLayoutInput {
  readonly label: string;
  readonly value: string;
}

interface DetailFieldLayoutResult {
  readonly compactPills: readonly DetailFieldPill[];
  readonly gridCards: readonly DetailFieldCard[];
}

/**
 * 清理 window timer 的公共函数。
 * 详情页里只有一套 user_note debounce 写入，这里单独抽出来避免收口时遗漏。
 */
function clearWindowTimer(timerRef: React.MutableRefObject<number | null>) {
  if (timerRef.current != null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

/**
 * 详情页金额固定展示两位小数。
 * 首页列表允许更紧凑的显示策略，但详情页需要对金额表达更完整。
 */
function formatDetailAmount(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * 把首页已有的 `dayId + HH:mm` 组合成详情页统一使用的完整时间文案。
 * 若解析失败，再降级回已有的 `fullTimeLabel` 或原始时间字段。
 */
function formatPrimaryTime(dayId: string, item: HomeTransaction): string {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayId);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(item.t);
  if (dayMatch && timeMatch) {
    const year = Number(dayMatch[1]);
    const month = Number(dayMatch[2]);
    const day = Number(dayMatch[3]);
    return `${year}年${month}月${day}日 ${timeMatch[1]}:${timeMatch[2]}`;
  }

  return normalizeTransactionDetailText(item.fullTimeLabel) || normalizeTransactionDetailText(item.t) || "时间未知";
}

/**
 * 系统元数据统一压缩到短格式，降低视觉噪音。
 */
function formatMetaTime(value: string | null | undefined): string {
  const normalized = normalizeTransactionDetailText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z)?$/.exec(normalized);
  if (!match) return normalized;
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
}

/**
 * 来源标签是详情页里高频出现的小型状态元件。
 * 这里直接返回 token 化的 className，避免继续在正文里散落硬编码色值。
 */
function getSourceBadgeMeta(sourceType: HomeTransaction["sourceType"]): SourceBadgeMeta {
  if (sourceType === "wechat") {
    return {
      icon: <MessageCircle size={12} strokeWidth={2.4} />,
      label: "微信",
      chipClassName: "bg-success-surface text-success-text",
      iconClassName: "bg-mint/25 text-ink",
    };
  }

  if (sourceType === "alipay") {
    return {
      icon: <Wallet size={12} strokeWidth={2.4} />,
      label: "支付宝",
      chipClassName: "bg-info-surface text-ink",
      iconClassName: "bg-sky/30 text-ink",
    };
  }

  if (sourceType === "manual") {
    return {
      icon: <PencilLine size={12} strokeWidth={2.4} />,
      label: "随手记",
      chipClassName: "bg-warn-surface text-ink",
      iconClassName: "bg-sunflower/35 text-ink",
    };
  }

  return {
    icon: <ReceiptText size={12} strokeWidth={2.4} />,
    label: "未知来源",
    chipClassName: "bg-surface text-dim",
    iconClassName: "bg-white text-dim",
  };
}

/**
 * 详情页强调“信息不遗漏”，因此只要状态非空就必须展示。
 * 其中 SUCCESS 转成中文文案，避免在中文界面里留下生硬的英文状态码。
 */
function getStatusText(status: string | null | undefined): string {
  const normalized = normalizeTransactionDetailText(status);
  if (!normalized) return "";

  if (normalized === "SUCCESS") return "已完成";
  if (normalized === "CLOSED") return "已关闭";
  if (normalized === "OTHER") return "其他状态";

  return normalized;
}

/**
 * 分类色板由业务配置维护，不纳入全局 token。
 * 因此分类标签仍然允许从 `CAT` 中取动态色值。
 */
function getCategoryTone(category: string | null): CategoryTone {
  if (!category) {
    return {
      color: "#D85A30",
      bg: "#FFF5EB",
      icon: "？",
    };
  }

  const visual = CAT[category];
  if (!visual) {
    return {
      color: "#222222",
      bg: "#F5F0EB",
      icon: "•",
    };
  }

  return {
    color: visual.color,
    bg: visual.bg,
    icon: visual.icons[0] ?? "•",
  };
}

/**
 * 返回箭头沿用设置子页的裸 SVG 语言。
 * 详情页不再使用上一版那种有底色、带阴影的悬浮圆按钮。
 */
function BackArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-ink">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 统一的右箭头图标，用在“点击分类”入口右侧。
 */
function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-dim">
      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 内容卡区块标题。
 * 图标用文字 / 符号承载即可，重点是把“阅读锚点”做出来。
 */
function SectionEyebrow({ icon, title }: { readonly icon: React.ReactNode; readonly title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex h-7 w-7 flex-none items-center justify-center rounded-pill bg-surface text-ink">
        {icon}
      </div>
      <div className="text-[11px] font-bold tracking-[0.08em] text-dim">{title}</div>
    </div>
  );
}

/**
 * 顶部小标签统一走 pill 语义，避免来源 / 时间 / 状态继续散成多种语言。
 */
function InfoPill({
  icon,
  label,
  chipClassName,
  iconClassName,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly chipClassName: string;
  readonly iconClassName?: string;
}) {
  return (
    <div className={clsx("inline-flex items-center gap-2 rounded-pill px-2.5 py-1 text-[11px] font-semibold", chipClassName)}>
      <span
        className={clsx(
          "flex h-5 w-5 flex-none items-center justify-center rounded-pill text-[10px] font-extrabold leading-none",
          iconClassName ?? "bg-white text-ink"
        )}
      >
        {icon}
      </span>
      <span className="leading-none">{label}</span>
    </div>
  );
}

/**
 * 原始信息区与系统元数据区都复用这种“标题 + 值”的轻量单元。
 */
function InfoCell({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div className="rounded-card-xs border-secondary border-muted bg-surface/55 p-3">
      <div className="mb-1 text-[10px] font-semibold tracking-[0.04em] text-dim">{label}</div>
      <div className={clsx("break-words whitespace-pre-wrap text-[13px] leading-5 text-ink", mono && "font-mono text-[12px]")}>{value}</div>
    </div>
  );
}

/**
 * 给不同语义的细则字段分配实际图标，避免再退回纯文本占位。
 */
function getDetailFieldPillIcon(label: string): React.ReactNode {
  if (label === "原始分类") {
    return <Tags size={12} strokeWidth={2.4} />;
  }

  if (label === "支付方式") {
    return <Wallet size={12} strokeWidth={2.4} />;
  }

  return <ReceiptText size={12} strokeWidth={2.4} />;
}

/**
 * 规格要求所有细则字段都显示，但不允许再出现“一个极短字段被拉成整宽卡”的蠢布局。
 * 因此这里先做三步收口：
 * 1. 去掉已被标题 / 副标题消费的重复值
 * 2. 若只剩一个极短字段，则降级成顶部 badge，而不是进入大卡片网格
 * 3. 其余字段进入 6 栏网格，由后续排版求解器算出 2 / 3 / 4 / 6 的实际跨度
 */
function buildDetailFieldLayout(
  fields: readonly DetailFieldLayoutInput[],
  consumedValues: readonly string[]
): DetailFieldLayoutResult {
  const normalizeKey = (value: string) => value.trim().replace(/\s+/gu, " ");
  const consumed = new Set(consumedValues.map(normalizeKey).filter(Boolean));

  const visibleFields = fields
    .filter((field) => field.value.trim())
    .filter((field) => !consumed.has(normalizeKey(field.value)))
    .map((field) => {
      const normalizedValue = field.value.trim();
      consumed.add(normalizeKey(normalizedValue));
      return {
        label: field.label,
        value: normalizedValue,
      };
    });

  /**
   * 对用户而言，像“群收款”“转账”“零钱”这种单独剩下的短字段，
   * 更像是状态标签，而不是一块需要占整行的正文卡片。
   */
  if (visibleFields.length === 1) {
    const onlyField = visibleFields[0];
    const isCompactSingleton =
      onlyField.value.length <= 10 &&
      !onlyField.value.includes("\n") &&
      (onlyField.label === "原始分类" || onlyField.label === "支付方式" || onlyField.label === "交易状态");

    if (isCompactSingleton) {
      return {
        compactPills: [{ label: onlyField.label, value: onlyField.value, icon: getDetailFieldPillIcon(onlyField.label) }],
        gridCards: [],
      };
    }
  }

  return {
    compactPills: [],
    gridCards: solveDetailFieldGrid(visibleFields),
  };
}

/**
 * 给每个字段定义“允许占几格”与“理想占几格”。
 * 这样既能保证每行总宽度被占满，又不会把短字段硬拉成整行。
 */
function getDetailFieldSpanOptions(field: DetailFieldLayoutInput): { readonly preferred: number; readonly candidates: ReadonlyArray<2 | 3 | 4 | 6> } {
  const length = field.value.length;
  const isMultiline = field.value.includes("\n");

  if (field.label === "原始备注") {
    return { preferred: 6, candidates: [6] };
  }

  if (field.label === "原始分类") {
    return { preferred: 2, candidates: [2, 3] };
  }

  if (field.label === "支付方式") {
    if (length <= 8) return { preferred: 3, candidates: [3, 4, 6] };
    if (length <= 18) return { preferred: 4, candidates: [4, 3, 6] };
    return { preferred: 6, candidates: [6, 4] };
  }

  if (field.label === "账单标题") {
    if (isMultiline || length >= 20) return { preferred: 6, candidates: [6, 4] };
    if (length <= 10) return { preferred: 3, candidates: [3, 4, 6] };
    return { preferred: 4, candidates: [4, 3, 6] };
  }

  if (field.label === "商品说明") {
    if (isMultiline || length >= 22) return { preferred: 6, candidates: [6, 4, 3] };
    if (length <= 10) return { preferred: 3, candidates: [3, 4, 6] };
    return { preferred: 4, candidates: [4, 3, 6] };
  }

  if (field.label === "交易对方") {
    if (isMultiline || length >= 18) return { preferred: 4, candidates: [4, 6, 3] };
    if (length <= 8) return { preferred: 3, candidates: [3, 4, 6] };
    return { preferred: 4, candidates: [4, 3, 6] };
  }

  return { preferred: 4, candidates: [4, 3, 6] };
}

/**
 * 详情页细则区使用 6 栏网格。
 * 这里用一个很小的递归求解器，在“不打乱字段语义顺序”的前提下，
 * 为每张卡挑出一个跨度，使每一行都刚好占满 6 栏。
 */
function solveDetailFieldGrid(fields: readonly DetailFieldLayoutInput[]): DetailFieldCard[] {
  const fieldOptions = fields.map((field) => ({ field, ...getDetailFieldSpanOptions(field) }));
  const memo = new Map<string, { score: number; cards: DetailFieldCard[] } | null>();

  const solve = (index: number, remainingCols: number): { score: number; cards: DetailFieldCard[] } | null => {
    const key = `${index}-${remainingCols}`;
    if (memo.has(key)) {
      return memo.get(key) ?? null;
    }

    if (index === fieldOptions.length) {
      const result = remainingCols === 6 ? { score: 0, cards: [] } : null;
      memo.set(key, result);
      return result;
    }

    const current = fieldOptions[index];
    let best: { score: number; cards: DetailFieldCard[] } | null = null;

    for (const span of current.candidates) {
      if (span > remainingCols) continue;

      const nextRemainingCols = remainingCols - span === 0 ? 6 : remainingCols - span;
      const nextResult = solve(index + 1, nextRemainingCols);
      if (!nextResult) continue;

      /**
       * 评分思路：
       * - 优先接近字段的理想跨度
       * - 对“短文本整宽”施加高惩罚，避免再次出现 rawClass 这类字段铺满整行
       * - 对长文本塞进过窄卡片也加惩罚，避免换行挤爆
       */
      const shortFullWidthPenalty = span === 6 && current.field.value.length <= 10 ? 80 : 0;
      const crampedPenalty = span <= 3 && current.field.value.length >= 18 ? 24 : 0;
      const preferencePenalty = Math.abs(current.preferred - span) * 6;
      const score = nextResult.score + shortFullWidthPenalty + crampedPenalty + preferencePenalty;

      if (!best || score < best.score) {
        best = {
          score,
          cards: [{ label: current.field.label, value: current.field.value, span }, ...nextResult.cards],
        };
      }
    }

    memo.set(key, best);
    return best;
  };

  const resolved = solve(0, 6);
  if (resolved) {
    return resolved.cards;
  }

  /**
   * 正常情况下上面的求解器应当总能找到满行方案。
   * 若未来新增了奇怪字段组合导致求解失败，则回退到“中长文本整宽”的保守布局，
   * 至少保证不溢出、不丢字段。
   */
  return fields.map((field) => {
    const fallbackSpan: 3 | 4 | 6 = field.value.length <= 10 ? 3 : field.value.length <= 18 ? 4 : 6;
    return {
      label: field.label,
      value: field.value,
      span: fallbackSpan === 3 ? 3 : fallbackSpan === 4 ? 4 : 6,
    };
  });
}

/**
 * 分类标签是页面里最重要的可视状态之一。
 * 这里单独抽出来，保证 AI 分类 / 当前分类 / 未分类 三种情形都走同一结构。
 */
function CategoryPill({
  category,
  prefix,
  tone,
}: {
  readonly category: string;
  readonly prefix?: string;
  readonly tone: CategoryTone;
}) {
  return (
    <div
      className="inline-flex max-w-full items-center gap-2 rounded-pill px-3 py-1.5 text-[13px] font-bold"
      style={{ background: tone.bg, color: tone.color }}
    >
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-pill bg-white/75 text-[15px]">{tone.icon}</span>
      <span className="truncate">{prefix ? `${prefix}：${category}` : category}</span>
    </div>
  );
}

/**
 * 系统元数据放在页面最底部，并统一使用等宽字体。
 * 这样既方便调试 / 对账，又不会在主阅读区里抢视觉权重。
 */
function MetaRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-2">
      <div className="text-[11px] text-dim">{label}</div>
      <div className="break-all font-mono text-[12px] leading-5 text-ink">{value}</div>
    </div>
  );
}

/**
 * 锁定控件沿用接近 iOS 设置项的横向 switch 语义。
 * 这里只把颜色与圆角收口到当前 token，交互本身保持极简。
 */
function ToggleSwitch({
  checked,
  onToggle,
}: {
  readonly checked: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={clsx(
        "relative h-6 w-11 flex-none rounded-pill border-0 p-0 transition-colors",
        checked ? "bg-mint" : "bg-muted"
      )}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-pill bg-white transition-[left]"
        style={{ left: checked ? 22 : 2 }}
      />
    </button>
  );
}

/**
 * 紧凑分类选择器是这次详情页重构的关键交互之一：
 * 默认界面不再平铺整面分类按钮，只有在用户明确点击“当前分类”时才展开选择。
 */
function CompactCategoryModal({
  visible,
  categories,
  selectedCategory,
  onClose,
  onSelect,
}: {
  readonly visible: boolean;
  readonly categories: readonly string[];
  readonly selectedCategory: string | null;
  readonly onClose: () => void;
  readonly onSelect: (category: string) => void;
}) {
  if (!visible) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] font-brand text-ink">
      <button type="button" aria-label="关闭分类选择器" onClick={onClose} className="absolute inset-0 border-0 bg-ink/40 p-0" />

      <div
        className="absolute inset-x-0 bottom-0 px-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <div
          className="overflow-hidden rounded-card border-secondary border-muted bg-white"
          style={{ boxShadow: "0 -12px 32px rgba(34, 34, 34, 0.18)" }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-divider border-faint px-4 py-3">
            <div className="min-w-0">
              <div className="text-[16px] font-extrabold text-ink">选择分类</div>
              <div className="mt-1 text-[12px] leading-5 text-dim">点一下就会立即应用到这条交易</div>
            </div>

            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-pill border-secondary border-muted bg-white text-[16px] font-bold text-ink"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3">
            {categories.map((category) => {
              const tone = getCategoryTone(category);
              const isActive = selectedCategory === category;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    onSelect(category);
                    onClose();
                  }}
                  className={clsx(
                    "flex items-center gap-3 rounded-card-sm border-secondary border-muted bg-white px-3 py-3 text-left transition-colors"
                  )}
                  style={isActive ? { borderColor: tone.color, background: tone.bg } : undefined}
                >
                  <span
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-pill text-[18px]"
                    style={{ background: isActive ? "rgba(255,255,255,0.78)" : tone.bg, color: tone.color }}
                  >
                    {tone.icon}
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-extrabold" style={{ color: tone.color }}>
                      {category}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-dim">{isActive ? "当前分类" : "点按应用"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function TransactionDetailPage({
  transaction,
  dayId,
  availableCategories,
  onClose,
  onUpdateCategory,
  onUpdateUserReasoning,
  onSetTransactionVerification,
}: TransactionDetailPageProps) {
  const [isEntered, setIsEntered] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(getCategory(transaction));
  const [isVerified, setIsVerified] = useState(Boolean(transaction.isVerified));
  const [hasLocalCategorySelection, setHasLocalCategorySelection] = useState(false);
  const [reasoningInput, setReasoningInput] = useState(normalizeTransactionDetailText(transaction.userNote));

  const persistedReasoningRef = useRef(normalizeTransactionDetailText(transaction.userNote));
  const reasoningTimerRef = useRef<number | null>(null);
  const openedAtRef = useRef(0);
  const reasoningInputRef = useRef<HTMLTextAreaElement | null>(null);

  // 分类模态框打开时，返回键关闭模态框；否则关闭整个详情页
  useBackHandler(() => {
    if (isCategoryModalOpen) {
      setIsCategoryModalOpen(false);
    } else {
      onClose();
    }
  });

  /**
   * 详情页切换到另一条交易时，所有本地编辑态都要跟着重置。
   * 这里把“动画重新进场”和“输入缓存同步到账本当前值”放到同一个 effect 中处理。
   */
  useEffect(() => {
    const normalizedReasoning = normalizeTransactionDetailText(transaction.userNote);

    setSelectedCategory(getCategory(transaction));
    setIsVerified(Boolean(transaction.isVerified));
    setHasLocalCategorySelection(false);
    setReasoningInput(normalizedReasoning);
    setIsCategoryModalOpen(false);
    persistedReasoningRef.current = normalizedReasoning;

    clearWindowTimer(reasoningTimerRef);

    setIsClosing(false);
    setIsEntered(false);
    openedAtRef.current = Date.now();

    const frameId = window.requestAnimationFrame(() => {
      setIsEntered(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [transaction.id]);

  useEffect(() => {
    return () => {
      clearWindowTimer(reasoningTimerRef);
    };
  }, []);

  const txId = String(transaction.id);
  const displayTitle = useMemo(() => resolveTransactionDisplayTitle(transaction), [transaction]);
  const productText = useMemo(() => resolveTransactionDisplayProductText(transaction), [transaction]);
  const secondaryTitle = useMemo(() => {
    if (!productText || productText === displayTitle) return "";
    return productText;
  }, [displayTitle, productText]);
  const primaryTime = useMemo(() => formatPrimaryTime(dayId, transaction), [dayId, transaction]);
  const sourceBadge = useMemo(() => getSourceBadgeMeta(transaction.sourceType), [transaction.sourceType]);
  const currentCategory = selectedCategory;
  const currentCategoryTone = useMemo(() => getCategoryTone(currentCategory), [currentCategory]);
  const aiCategoryTone = useMemo(() => getCategoryTone(transaction.aiCat ?? null), [transaction.aiCat]);
  const categoryOriginText = useMemo(() => {
    if (!currentCategory) return "未分类";
    if (hasLocalCategorySelection || transaction.userCat) return "来自用户";
    if (transaction.aiCat) return "来自 AI";
    return "未分类";
  }, [currentCategory, hasLocalCategorySelection, transaction.aiCat, transaction.userCat]);

  const counterpartyText = normalizeTransactionDetailText(transaction.counterparty);
  const billTitleText = normalizeTransactionDetailText(transaction.n);
  const rawClassText = normalizeTransactionDetailText(transaction.rawClass);
  const paymentText = normalizeTransactionDetailText(transaction.pay);
  const sourceLabelText = normalizeTransactionDetailText(transaction.sourceLabel);
  const statusText = getStatusText(transaction.transactionStatus);
  const sourceBadgeLabel = sourceLabelText || sourceBadge.label;
  const originRemarkText = normalizeTransactionDetailText(transaction.remark);
  const updatedAtText = formatMetaTime(transaction.updatedAt);
  const originalIdText = normalizeTransactionDetailText(transaction.originalId);
  const aiReasonText = normalizeTransactionDetailText(transaction.reason);
  const detailFieldLayout = useMemo(() => {
    return buildDetailFieldLayout(
      [
        { label: "支付方式", value: paymentText },
        { label: "原始分类", value: rawClassText },
        { label: "交易对方", value: counterpartyText },
        { label: "商品说明", value: productText },
        { label: "账单标题", value: billTitleText },
        { label: "原始备注", value: originRemarkText },
      ],
      [displayTitle, secondaryTitle, sourceBadgeLabel, statusText]
    );
  }, [
    billTitleText,
    counterpartyText,
    displayTitle,
    originRemarkText,
    paymentText,
    productText,
    rawClassText,
    secondaryTitle,
    sourceBadgeLabel,
    statusText,
  ]);

  /**
   * 关闭前必须把理由输入框的临时值强制刷到持久层，
   * 否则会出现“刚输入完立刻返回，最后几次按键没被保存”的竞态。
   */
  const persistReasoning = useCallback((nextValue: string) => {
    const normalized = nextValue.trim();
    if (normalized === persistedReasoningRef.current) return;
    const previousReasoning = persistedReasoningRef.current;
    persistedReasoningRef.current = normalized;
    /**
     * 若这是用户第一次从空到非空填写 user_note，
     * 服务层会按统一口径自动锁定。
     * 这里同步更新本地状态，避免详情页锁定文案落后一拍。
     */
    if (!isVerified && !previousReasoning && normalized) {
      setIsVerified(true);
    }
    onUpdateUserReasoning(txId, normalized);
  }, [isVerified, onUpdateUserReasoning, txId]);

  const requestClose = useCallback((source: "button" | "backdrop") => {
    if (isClosing) return;
    if (source === "backdrop" && Date.now() - openedAtRef.current < BACKDROP_GUARD_MS) {
      return;
    }

    clearWindowTimer(reasoningTimerRef);
    persistReasoning(reasoningInput);

    setIsClosing(true);
    window.setTimeout(() => {
      onClose();
    }, EXIT_ANIMATION_MS);
  }, [isClosing, onClose, persistReasoning, reasoningInput]);

  /**
   * 用户刚改完分类时，页面主动把 user_note 输入区露出来。
   * 这样能用界面运动提示“最好补一句原因”，而不是再堆一行啰嗦文案。
   */
  const revealReasoningInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        reasoningInputRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    });
  }, []);

  /**
   * 分类更新遵循规格的副作用链：
   * - 立即写入 user_category
   * - 由统一服务入口按规格判断是否自动锁定
   * - 若用户已写了理由，则一并作为学习信号传下去
   */
  const handleSelectCategory = useCallback((category: string) => {
    const reasoning = reasoningInput.trim();
    /**
     * 详情页本地态必须和服务层的自动锁定判定保持同一口径：
     * - 之前没有 user_category 时，任何一次显式分类提交都视为确认
     * - 已有 user_category 且这次改成了别的分类，也视为确认
     * - 若只是对同一 user_category 再点一次，不应把未锁定状态误显示成“已锁定”
     */
    const shouldReflectAutoLock = !isVerified && (!transaction.userCat || transaction.userCat !== category);
    setSelectedCategory(category);
    setHasLocalCategorySelection(true);
    onUpdateCategory(txId, category, reasoning);

    if (shouldReflectAutoLock) {
      /**
       * 服务层会在真正提交分类时按统一口径补写 is_verified。
       * 这里仅做本地即时态更新，保证详情页开关与状态文案立刻反映“已确认”的交互结果。
       */
      setIsVerified(true);
    }

    if (reasoningTimerRef.current != null) {
      clearWindowTimer(reasoningTimerRef);
      persistedReasoningRef.current = reasoning;
    }

    revealReasoningInput();
  }, [isVerified, onUpdateCategory, reasoningInput, revealReasoningInput, transaction.userCat, txId]);

  const handleToggleVerification = useCallback(() => {
    const next = !isVerified;
    setIsVerified(next);
    onSetTransactionVerification(txId, next);
  }, [isVerified, onSetTransactionVerification, txId]);

  const handleReasoningChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setReasoningInput(nextValue);
    clearWindowTimer(reasoningTimerRef);
    reasoningTimerRef.current = window.setTimeout(() => {
      persistReasoning(nextValue);
      reasoningTimerRef.current = null;
    }, DEBOUNCE_SAVE_MS);
  }, [persistReasoning]);

  const handleReasoningBlur = useCallback(() => {
    clearWindowTimer(reasoningTimerRef);
    persistReasoning(reasoningInput);
  }, [persistReasoning, reasoningInput]);

  const headerStatusClassName = isVerified
    ? "border-secondary border-mint bg-success-surface text-success-text"
    : "border-secondary border-muted bg-white text-dim";

  const contentCardClassName = "rounded-card-sm border-secondary border-muted bg-white p-3.5";

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 font-brand text-ink"
      style={{ zIndex: FULL_SCREEN_OVERLAY_Z_INDEX }}
    >
      <div
        onClick={() => requestClose("backdrop")}
        className="absolute inset-0 transition-opacity duration-200"
        style={{
          background: "rgba(34, 34, 34, 0.32)",
          opacity: isClosing ? 0 : isEntered ? 1 : 0,
        }}
      />

      <div
        onClick={(event) => event.stopPropagation()}
        className="absolute inset-0 flex flex-col overflow-hidden bg-surface"
        style={{
          transform: isClosing ? "translateX(100%)" : isEntered ? "translateX(0)" : "translateX(100%)",
          transition: "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <header className="sticky top-0 z-10 border-b border-divider border-faint bg-surface/95">
          <div
            className="flex items-center gap-2 px-4 pb-2.5"
            style={{ paddingTop: APP_HEADER_PADDING_TOP, minHeight: APP_HEADER_MIN_HEIGHT }}
          >
            <button
              type="button"
              aria-label="返回首页"
              onClick={() => requestClose("button")}
              className="flex flex-none cursor-pointer items-center justify-center border-0 bg-transparent p-1"
            >
              <BackArrowIcon />
            </button>

            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-bold leading-none text-ink">交易详情</div>
            </div>

            <div className={clsx("inline-flex items-center gap-1 rounded-pill px-2 py-1 text-[11px] font-semibold", headerStatusClassName)}>
              <span
                className={clsx(
                  "flex h-5 w-5 items-center justify-center rounded-pill bg-white/80 transition-all duration-200",
                  isVerified ? "scale-100 rotate-0" : "scale-95 -rotate-12"
                )}
              >
                {isVerified ? <LockKeyhole size={12} strokeWidth={2.4} /> : <LockKeyholeOpen size={12} strokeWidth={2.4} />}
              </span>
              <span>{isVerified ? "已锁定" : "未锁定"}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 pt-2.5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)", userSelect: "text", WebkitUserSelect: "text" }}>
          <div className="flex flex-col gap-3">
            <section className={contentCardClassName}>
              <SectionEyebrow icon={<ReceiptText size={16} strokeWidth={2.2} />} title="交易原始信息" />

              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <div className="flex min-w-max flex-nowrap gap-2">
                  <InfoPill
                    icon={sourceBadge.icon}
                    label={sourceBadgeLabel}
                    chipClassName={sourceBadge.chipClassName}
                    iconClassName={sourceBadge.iconClassName}
                  />
                  <InfoPill
                    icon={<Clock3 size={12} strokeWidth={2.4} />}
                    label={primaryTime}
                    chipClassName="border-secondary border-muted bg-surface text-ink"
                  />
                  {statusText ? (
                    <InfoPill
                      icon={<CircleAlert size={12} strokeWidth={2.4} />}
                      label={statusText}
                      chipClassName={
                        transaction.transactionStatus === "SUCCESS"
                          ? "border-secondary border-muted bg-surface text-dim"
                          : "bg-danger-surface text-coral"
                      }
                    />
                  ) : null}
                  {detailFieldLayout.compactPills.map((pill) => (
                    <InfoPill
                      key={`${pill.label}-${pill.value}`}
                      icon={pill.icon}
                      label={`${pill.label}：${pill.value}`}
                      chipClassName="border-secondary border-muted bg-surface text-ink"
                    />
                  ))}
                </div>
              </div>

              <div className="mt-3 break-words text-[24px] font-extrabold leading-8 text-ink">{displayTitle}</div>
              {secondaryTitle ? <div className="mt-1 break-words text-[14px] leading-6 text-dim">{secondaryTitle}</div> : null}

              <div className="mt-3 rounded-card-xs border-secondary border-muted bg-surface/55 p-3">
                <div className="text-[11px] font-semibold text-dim">{transaction.direction === "in" ? "收入金额" : "支出金额"}</div>
                <div
                  className={clsx(
                    "mt-1 font-mono text-[30px] font-bold leading-none",
                    transaction.direction === "in" ? "text-mint" : "text-coral"
                  )}
                >
                  {transaction.direction === "in" ? "+" : "-"}¥{formatDetailAmount(transaction.a)}
                </div>
              </div>

              {detailFieldLayout.gridCards.length > 0 ? (
                <div className="mt-3 grid grid-cols-6 gap-2">
                  {detailFieldLayout.gridCards.map((card) => (
                    <div
                      key={`${card.label}-${card.value}`}
                      className={clsx(
                        card.span === 2 && "col-span-2",
                        card.span === 3 && "col-span-3",
                        card.span === 4 && "col-span-4",
                        card.span === 6 && "col-span-6"
                      )}
                    >
                      <InfoCell label={card.label} value={card.value} />
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className={contentCardClassName}>
              <SectionEyebrow icon={<Sparkles size={16} strokeWidth={2.2} />} title="AI 分析" />

              {transaction.aiCat ? (
                <div className="flex flex-col gap-2.5">
                  {transaction.userCat && transaction.userCat !== transaction.aiCat ? (
                    <div className="rounded-card-xs border-secondary border-warn-border bg-warn-surface px-3 py-2 text-[12px] leading-5 text-ink">
                      你已将分类修改为「{transaction.userCat}」
                    </div>
                  ) : null}

                  <CategoryPill category={transaction.aiCat} tone={aiCategoryTone} />

                  <div className="rounded-card-xs border-secondary border-muted bg-surface/55 px-3 py-2.5 text-[13px] leading-6 text-ink whitespace-pre-wrap">
                    {aiReasonText || "AI 当前没有留下额外解释。"}
                  </div>
                </div>
              ) : (
                <div className="rounded-card-xs border-secondary border-muted bg-surface/45 px-3 py-3 text-[13px] leading-6 text-dim">
                  AI 尚未分析这笔交易
                </div>
              )}
            </section>

            <section className={contentCardClassName}>
              <SectionEyebrow icon={<Tags size={16} strokeWidth={2.2} />} title="分类操作" />

              <div className="rounded-card-sm border-secondary border-muted bg-white px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-semibold tracking-[0.04em] text-dim">当前分类</div>

                  <div className="flex items-center gap-2">
                    <div className="text-[11px] font-semibold text-dim">锁定此分类</div>
                    <ToggleSwitch checked={isVerified} onToggle={handleToggleVerification} />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="mt-3 flex w-full min-w-0 items-center justify-between gap-3 text-left"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-10 w-10 flex-none items-center justify-center rounded-pill text-[20px]"
                      style={{ background: currentCategoryTone.bg, color: currentCategoryTone.color }}
                    >
                      {currentCategoryTone.icon}
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-extrabold" style={{ color: currentCategoryTone.color }}>
                        {currentCategory ?? "未分类"}
                      </div>
                      <div className="mt-0.5 text-[12px] leading-5 text-dim">{categoryOriginText}</div>
                    </div>
                  </div>

                  <ChevronRightIcon />
                </button>
              </div>

              <div className="mt-2 text-[12px] leading-5 text-dim">
                锁定后，系统不会再自动改写这条记录的分类；除非你主动修改或手动解锁。
              </div>
            </section>

            <section className={contentCardClassName}>
              <SectionEyebrow icon={<MessageSquareQuote size={16} strokeWidth={2.2} />} title="告诉 AI 为什么" />

              <textarea
                ref={reasoningInputRef}
                value={reasoningInput}
                onChange={handleReasoningChange}
                onBlur={handleReasoningBlur}
                rows={3}
                placeholder="例如：这是工作餐报销，不是个人消费"
                className="min-h-[88px] w-full resize-y rounded-card-xs border-secondary border-muted bg-white px-3 py-2.5 font-brand text-[13px] leading-6 text-ink outline-none"
              />
            </section>

            <section className="rounded-card-sm border-secondary border-faint bg-surface/70 p-3">
              <div className="mb-2.5 text-[11px] font-bold tracking-[0.08em] text-dim">系统元数据</div>
              <div className="flex flex-col gap-2">
                {updatedAtText ? <MetaRow label="最后更新" value={updatedAtText} /> : null}
                <MetaRow label="记录 ID" value={txId} />
                {originalIdText ? <MetaRow label="原始流水号" value={originalIdText} /> : null}
              </div>
            </section>
          </div>
        </div>
      </div>

      <CompactCategoryModal
        visible={isCategoryModalOpen}
        categories={availableCategories}
        selectedCategory={selectedCategory}
        onClose={() => setIsCategoryModalOpen(false)}
        onSelect={handleSelectCategory}
      />
    </div>,
    document.body
  );
}
