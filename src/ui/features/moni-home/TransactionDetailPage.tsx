/**
 * TransactionDetailPage
 *
 * 这是首页交易详情页的正式实现版本。
 * 设计目标不是复用旧 PixelBill 风格，而是严格对齐当前规格文档：
 * 1. 原始交易信息置顶
 * 2. AI 分析区前置
 * 3. 分类操作与锁定控制合并为同一区域
 * 4. 用户标注区承接“告诉 AI 为什么”与备注
 * 5. 系统元数据沉到底部，避免打断主阅读流
 *
 * 另外，这个页面采用即时写入策略：
 * - 分类与锁定：立即写入
 * - 文本输入：800ms debounce，失焦与关闭时强制落盘
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C, CAT } from "@ui/features/moni-home/config";
import { getCategory } from "@ui/features/moni-home/helpers";
import type { HomeTransaction } from "@ui/features/moni-home/components";

/**
 * 详情页关闭动画时长。
 * 这里与组件内部的 transform / opacity 过渡保持一致，确保先播完退场动画，再真正卸载组件。
 */
const EXIT_ANIMATION_MS = 260;

/**
 * 文本输入自动保存的防抖时长。
 * 规格已明确要求：用户停止输入 800ms 后写入，失焦时立即写入。
 */
const DEBOUNCE_SAVE_MS = 800;

/**
 * 为了避免刚打开详情页时误触遮罩直接关闭，
 * 这里给遮罩点击补一个很短的保护时间。
 */
const BACKDROP_GUARD_MS = 220;

interface TransactionDetailPageProps {
  readonly transaction: HomeTransaction;
  readonly dayId: string;
  readonly dayLabel: string;
  readonly availableCategories: readonly string[];
  readonly onClose: () => void;
  readonly onUpdateCategory: (transactionId: string, category: string, reasoning?: string) => void;
  readonly onUpdateUserReasoning: (transactionId: string, note: string) => void;
  readonly onUpdateRemark: (transactionId: string, note: string) => void;
  readonly onSetTransactionVerification: (transactionId: string, isVerified: boolean) => void;
}

/**
 * 规范化文本：把 null / undefined / "/" / 纯空白统一收口为空字符串。
 * 这样视图层只需要判断是否为空串，而不需要到处写重复判空逻辑。
 */
function normalizeText(value: string | null | undefined): string {
  if (value == null) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return trimmed;
}

/**
 * 详情页金额固定按两位小数展示。
 * 这是完整详情，不再沿用首页“最多两位小数”的收缩展示策略。
 */
function formatDetailAmount(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * 把首页条目的日期信息组装成详情页需要的完整中文时间：
 * `YYYY年M月D日 HH:mm`
 *
 * 优先使用 `dayId + item.t`，因为它们来源稳定、格式明确；
 * 如果意外解析失败，再退回到首页已经准备好的 `fullTimeLabel`。
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

  const fallback = normalizeText(item.fullTimeLabel);
  return fallback || normalizeText(item.t) || "时间未知";
}

/**
 * 系统元数据与更新时间更适合短格式：
 * `YYYY-MM-DD HH:mm`
 * 这样可读性足够，视觉上又不会像秒级时间那样嘈杂。
 */
function formatMetaTime(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z)?$/.exec(normalized);
  if (!match) return normalized;
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
}

/**
 * 把来源类型翻译成面向用户的短文案。
 * 详情页不暴露底层 sourceType 枚举值。
 */
function getSourceText(sourceType: HomeTransaction["sourceType"]): string {
  if (sourceType === "wechat") return "微信支付";
  if (sourceType === "alipay") return "支付宝";
  if (sourceType === "manual") return "随手记";
  return "未知来源";
}

/**
 * 交易状态在 SUCCESS 时没有信息量，不在主信息区占空间。
 */
function getStatusText(status: string | null | undefined): string {
  const normalized = normalizeText(status);
  if (!normalized || normalized === "SUCCESS") return "";
  return normalized;
}

/**
 * 根据当前生效分类挑一个稳定的视觉配色。
 * 若还未分类，则回退到琥珀色警示语义。
 */
function getCategoryTone(category: string | null): { color: string; bg: string; icon: string } {
  if (!category) {
    return {
      color: C.amber,
      bg: "#FFF6E7",
      icon: "?"
    };
  }

  const visual = CAT[category];
  if (!visual) {
    return {
      color: C.dark,
      bg: "#F2EFEA",
      icon: "·",
    };
  }

  return {
    color: visual.color,
    bg: visual.bg,
    icon: visual.icons[0] ?? "·",
  };
}

/**
 * 统一清理 debounce timer，避免多处重复写 `clearTimeout`。
 */
function clearWindowTimer(timerRef: React.MutableRefObject<number | null>) {
  if (timerRef.current != null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

/**
 * 底部元数据行。
 * 这里单独抽出来，便于保持底部信息的视觉权重统一、结构清晰。
 */
function MetaRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "72px 1fr",
        gap: 10,
        alignItems: "start",
      }}
    >
      <div style={{ fontSize: 11, color: "#8A8178", letterSpacing: "0.04em" }}>{label}</div>
      <div
        style={{
          fontSize: 12,
          color: "#473F38",
          fontFamily: '"IBM Plex Mono","SFMono-Regular","Consolas",monospace',
          wordBreak: "break-all",
          lineHeight: 1.5,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function TransactionDetailPage({
  transaction,
  dayId,
  dayLabel,
  availableCategories,
  onClose,
  onUpdateCategory,
  onUpdateUserReasoning,
  onUpdateRemark,
  onSetTransactionVerification,
}: TransactionDetailPageProps) {
  /**
   * 进入 / 退出动画只在组件内部维护，不把这层状态外漏到页面容器。
   * 这样 MoniHome 只负责“是否打开”，动画细节由详情页自己收口。
   */
  const [isEntered, setIsEntered] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  /**
   * 分类、锁定、两段文本输入都需要本地受控状态：
   * - 保证点击 / 输入后立即给出视觉反馈
   * - 不依赖外部读模型同步完成后才更新界面
   */
  const [selectedCategory, setSelectedCategory] = useState<string | null>(getCategory(transaction));
  const [isVerified, setIsVerified] = useState(Boolean(transaction.isVerified));
  const [reasoningInput, setReasoningInput] = useState(normalizeText(transaction.userNote));
  const [remarkInput, setRemarkInput] = useState(normalizeText(transaction.remark));

  /**
   * 记录最近一次已写入值，避免 blur / close / debounce 多次重复写入同一内容。
   */
  const persistedReasoningRef = useRef(normalizeText(transaction.userNote));
  const persistedRemarkRef = useRef(normalizeText(transaction.remark));
  const reasoningTimerRef = useRef<number | null>(null);
  const remarkTimerRef = useRef<number | null>(null);
  const openedAtRef = useRef(0);

  /**
   * 当切换到另一条交易时，重置详情页内部状态。
   * 这里故意只依赖 `transaction.id`，避免保存后外部读模型刷新导致输入中的文本被强制回退。
   */
  useEffect(() => {
    const normalizedReasoning = normalizeText(transaction.userNote);
    const normalizedRemark = normalizeText(transaction.remark);

    setSelectedCategory(getCategory(transaction));
    setIsVerified(Boolean(transaction.isVerified));
    setReasoningInput(normalizedReasoning);
    setRemarkInput(normalizedRemark);
    persistedReasoningRef.current = normalizedReasoning;
    persistedRemarkRef.current = normalizedRemark;

    clearWindowTimer(reasoningTimerRef);
    clearWindowTimer(remarkTimerRef);

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

  /**
   * 卸载前尽量兜底清理 timer。
   * 真正的数据落盘在 `requestClose` 和 `blur` 中已经处理过，
   * 这里不再额外触发写入，避免卸载时与外部刷新打架。
   */
  useEffect(() => {
    return () => {
      clearWindowTimer(reasoningTimerRef);
      clearWindowTimer(remarkTimerRef);
    };
  }, []);

  const txId = String(transaction.id);
  const primaryTime = useMemo(() => formatPrimaryTime(dayId, transaction), [dayId, transaction]);
  const currentCategoryTone = useMemo(() => getCategoryTone(selectedCategory), [selectedCategory]);
  const rawClassText = normalizeText(transaction.rawClass);
  const productText = normalizeText(transaction.product);
  const counterpartyText = normalizeText(transaction.counterparty);
  const remarkText = normalizeText(transaction.remark);
  const statusText = getStatusText(transaction.transactionStatus);
  const updatedAtText = formatMetaTime(transaction.updatedAt);
  const originalIdText = normalizeText(transaction.originalId);
  const currentCategory = selectedCategory;
  const sourceText = getSourceText(transaction.sourceType);

  /**
   * 若主标题与商品名一样，就不要重复展示第二遍。
   */
  const secondaryTitle = useMemo(() => {
    if (!productText) return "";
    if (productText === transaction.n.trim()) return "";
    return productText;
  }, [productText, transaction.n]);

  /**
   * 写 `user_note` 的统一出口。
   * 所有 debounce / blur / close 都走这里，保证判重与 trim 规则一致。
   */
  const persistReasoning = useCallback((nextValue: string) => {
    const normalized = nextValue.trim();
    if (normalized === persistedReasoningRef.current) return;
    persistedReasoningRef.current = normalized;
    onUpdateUserReasoning(txId, normalized);
  }, [onUpdateUserReasoning, txId]);

  /**
   * 写 `remark` 的统一出口。
   */
  const persistRemark = useCallback((nextValue: string) => {
    const normalized = nextValue.trim();
    if (normalized === persistedRemarkRef.current) return;
    persistedRemarkRef.current = normalized;
    onUpdateRemark(txId, normalized);
  }, [onUpdateRemark, txId]);

  /**
   * 关闭时必须先把仍在输入中的文本强制落盘，再启动退场动画。
   * 这样即使用户刚打完字立刻点返回，也不会丢掉最后几个字符。
   */
  const requestClose = useCallback((source: "button" | "backdrop") => {
    if (isClosing) return;
    if (source === "backdrop" && Date.now() - openedAtRef.current < BACKDROP_GUARD_MS) {
      return;
    }

    clearWindowTimer(reasoningTimerRef);
    clearWindowTimer(remarkTimerRef);
    persistReasoning(reasoningInput);
    persistRemark(remarkInput);

    setIsClosing(true);
    window.setTimeout(() => {
      onClose();
    }, EXIT_ANIMATION_MS);
  }, [isClosing, onClose, persistReasoning, persistRemark, reasoningInput, remarkInput]);

  /**
   * 选择分类后立即写入，并按当前规格自动把条目视为“已确认”。
   * 这里把当前的 user_note 一并带上，避免“刚写完理由就马上改分类”时出现语义脱节。
   */
  const handleSelectCategory = useCallback((category: string) => {
    const reasoning = reasoningInput.trim();
    setSelectedCategory(category);
    onUpdateCategory(txId, category, reasoning);

    /**
     * 当前底层仲裁器仍把“改分类”和“锁定”分成两次写入。
     * 为了兑现详情页规格，这里在用户明确改分类时补一次显式锁定。
     */
    if (!isVerified) {
      setIsVerified(true);
      onSetTransactionVerification(txId, true);
    }

    if (reasoningTimerRef.current != null) {
      clearWindowTimer(reasoningTimerRef);
      persistedReasoningRef.current = reasoning;
    }
  }, [isVerified, onSetTransactionVerification, onUpdateCategory, reasoningInput, txId]);

  /**
   * 锁定按钮与分类区同级，不再单独沉到页面底部。
   */
  const handleToggleVerification = useCallback(() => {
    const next = !isVerified;
    setIsVerified(next);
    onSetTransactionVerification(txId, next);
  }, [isVerified, onSetTransactionVerification, txId]);

  /**
   * 两个文本域都走相同的 debounce 策略：
   * - 输入时只更新本地状态
   * - 停 800ms 后写入
   * - 失焦时立即刷盘
   */
  const handleReasoningChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setReasoningInput(nextValue);
    clearWindowTimer(reasoningTimerRef);
    reasoningTimerRef.current = window.setTimeout(() => {
      persistReasoning(nextValue);
      reasoningTimerRef.current = null;
    }, DEBOUNCE_SAVE_MS);
  }, [persistReasoning]);

  const handleRemarkChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setRemarkInput(nextValue);
    clearWindowTimer(remarkTimerRef);
    remarkTimerRef.current = window.setTimeout(() => {
      persistRemark(nextValue);
      remarkTimerRef.current = null;
    }, DEBOUNCE_SAVE_MS);
  }, [persistRemark]);

  /**
   * 失焦立即写入，覆盖“用户输完马上切到别处”的路径。
   */
  const handleReasoningBlur = useCallback(() => {
    clearWindowTimer(reasoningTimerRef);
    persistReasoning(reasoningInput);
  }, [persistReasoning, reasoningInput]);

  const handleRemarkBlur = useCallback(() => {
    clearWindowTimer(remarkTimerRef);
    persistRemark(remarkInput);
  }, [persistRemark, remarkInput]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 70,
        pointerEvents: "auto",
      }}
    >
      <div
        onClick={() => requestClose("backdrop")}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(18, 16, 14, 0.44)",
          backdropFilter: "blur(6px)",
          opacity: isClosing ? 0 : isEntered ? 1 : 0,
          transition: "opacity 240ms ease",
        }}
      />

      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          transform: isClosing ? "translateX(100%)" : isEntered ? "translateX(0)" : "translateX(100%)",
          transition: "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
          background: `
            radial-gradient(circle at top left, rgba(126, 200, 227, 0.18), transparent 34%),
            radial-gradient(circle at 82% 0%, rgba(78, 205, 196, 0.2), transparent 28%),
            linear-gradient(180deg, #FCFAF5 0%, #F6F0E7 52%, #F3ECE2 100%)
          `,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-18px 0 48px rgba(39, 31, 24, 0.18)",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            paddingTop: "calc(env(safe-area-inset-top) + 12px)",
            paddingLeft: 16,
            paddingRight: 16,
            paddingBottom: 14,
            background: "rgba(252, 250, 245, 0.88)",
            backdropFilter: "blur(14px)",
            borderBottom: "1px solid rgba(116, 102, 90, 0.14)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={() => requestClose("button")}
              style={{
                border: "none",
                background: "#FFFFFF",
                color: "#2F2823",
                width: 42,
                height: 42,
                borderRadius: 999,
                fontSize: 18,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 10px 24px rgba(44, 36, 29, 0.08)",
              }}
            >
              ←
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  color: "#8B8177",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Transaction Detail
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#221F1B",
                  lineHeight: 1.1,
                }}
              >
                交易详情
              </div>
            </div>

            <div
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                background: isVerified ? "rgba(78, 205, 196, 0.16)" : "rgba(255, 107, 107, 0.12)",
                border: `1px solid ${isVerified ? "rgba(78, 205, 196, 0.34)" : "rgba(255, 107, 107, 0.24)"}`,
                color: isVerified ? "#1E6F69" : "#A35C4E",
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {isVerified ? "已锁定" : "未锁定"}
            </div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 16px calc(env(safe-area-inset-bottom) + 28px)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <section
              style={{
                borderRadius: 28,
                padding: 18,
                background: "rgba(255, 255, 255, 0.86)",
                border: "1px solid rgba(112, 100, 90, 0.12)",
                boxShadow: "0 18px 36px rgba(46, 37, 28, 0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "rgba(34, 31, 27, 0.06)",
                    color: "#3B342E",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {dayLabel}
                </div>
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "rgba(126, 200, 227, 0.16)",
                    color: "#27617F",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {sourceText}
                </div>
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "rgba(78, 205, 196, 0.12)",
                    color: "#1F706B",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {primaryTime}
                </div>
              </div>

              <div
                style={{
                  fontSize: 29,
                  fontWeight: 800,
                  color: "#211D19",
                  lineHeight: 1.18,
                  letterSpacing: "-0.02em",
                }}
              >
                {transaction.n}
              </div>

              {secondaryTitle ? (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "#6C635A",
                  }}
                >
                  {secondaryTitle}
                </div>
              ) : null}

              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "#8B8177", marginBottom: 6 }}>金额</div>
                  <div
                    style={{
                      fontSize: 34,
                      fontWeight: 900,
                      color: transaction.direction === "in" ? "#218A6D" : "#D25543",
                      lineHeight: 1,
                      letterSpacing: "-0.04em",
                    }}
                  >
                    {transaction.direction === "in" ? "+" : "-"}¥{formatDetailAmount(transaction.a)}
                  </div>
                </div>

                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 18,
                    background: "rgba(34, 31, 27, 0.04)",
                    minWidth: 116,
                  }}
                >
                  <div style={{ fontSize: 10, color: "#8B8177", marginBottom: 4 }}>支付方式</div>
                  <div style={{ fontSize: 13, color: "#302A25", fontWeight: 700 }}>{normalizeText(transaction.pay) || "未知"}</div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: 10,
                  marginTop: 18,
                }}
              >
                {counterpartyText ? (
                  <div style={{ borderTop: "1px solid rgba(116, 102, 90, 0.12)", paddingTop: 12 }}>
                    <div style={{ fontSize: 11, color: "#8B8177", marginBottom: 4 }}>交易对方</div>
                    <div style={{ fontSize: 14, color: "#2E2924", lineHeight: 1.6 }}>{counterpartyText}</div>
                  </div>
                ) : null}

                {rawClassText ? (
                  <div style={{ borderTop: "1px solid rgba(116, 102, 90, 0.12)", paddingTop: 12 }}>
                    <div style={{ fontSize: 11, color: "#8B8177", marginBottom: 4 }}>交易类型</div>
                    <div style={{ fontSize: 14, color: "#2E2924", lineHeight: 1.6 }}>{rawClassText}</div>
                  </div>
                ) : null}

                {statusText ? (
                  <div style={{ borderTop: "1px solid rgba(116, 102, 90, 0.12)", paddingTop: 12 }}>
                    <div style={{ fontSize: 11, color: "#8B8177", marginBottom: 4 }}>交易状态</div>
                    <div style={{ fontSize: 14, color: "#9A4B40", lineHeight: 1.6 }}>{statusText}</div>
                  </div>
                ) : null}

                {remarkText ? (
                  <div style={{ borderTop: "1px solid rgba(116, 102, 90, 0.12)", paddingTop: 12 }}>
                    <div style={{ fontSize: 11, color: "#8B8177", marginBottom: 4 }}>原始备注</div>
                    <div style={{ fontSize: 14, color: "#2E2924", lineHeight: 1.7 }}>{remarkText}</div>
                  </div>
                ) : null}
              </div>
            </section>

            <section
              style={{
                borderRadius: 26,
                padding: 18,
                background: "linear-gradient(180deg, rgba(232, 249, 247, 0.96) 0%, rgba(245, 253, 252, 0.96) 100%)",
                border: "1px solid rgba(78, 205, 196, 0.24)",
                boxShadow: "0 14px 30px rgba(78, 205, 196, 0.10)",
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#47847F", marginBottom: 10 }}>AI 分析</div>

              {transaction.aiCat ? (
                <>
                  {transaction.userCat && transaction.aiCat !== transaction.userCat ? (
                    <div
                      style={{
                        marginBottom: 12,
                        padding: "10px 12px",
                        borderRadius: 16,
                        background: "rgba(255,255,255,0.72)",
                        color: "#4F5F5D",
                        fontSize: 12,
                        lineHeight: 1.6,
                      }}
                    >
                      你当前已将分类改为 <strong>{transaction.userCat}</strong>，下面保留的是 AI 的原始判断。
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.82)",
                      color: "#215E5A",
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    <span>AI 分类</span>
                    <span>·</span>
                    <span>{transaction.aiCat}</span>
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      fontSize: 14,
                      lineHeight: 1.75,
                      color: "#2D4E4B",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {normalizeText(transaction.reason) || "AI 当前没有留下额外解释。"}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.72)",
                    color: "#59706D",
                    fontSize: 14,
                    lineHeight: 1.7,
                  }}
                >
                  AI 还没有给出这笔交易的分类判断。你可以直接在下方手动分类，并告诉系统原因。
                </div>
              )}
            </section>

            <section
              style={{
                borderRadius: 26,
                padding: 18,
                background: "rgba(255,255,255,0.9)",
                border: "1px solid rgba(112, 100, 90, 0.12)",
                boxShadow: "0 16px 30px rgba(46, 37, 28, 0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#8B8177", marginBottom: 6 }}>分类操作</div>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      borderRadius: 18,
                      background: currentCategoryTone.bg,
                      color: currentCategoryTone.color,
                      fontSize: 15,
                      fontWeight: 800,
                    }}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{currentCategoryTone.icon}</span>
                    <span>{currentCategory ?? "未分类"}</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "#6D645B", lineHeight: 1.65 }}>
                    {transaction.userCat
                      ? "当前分类已由你确认，可以继续修改。"
                      : transaction.aiCat
                        ? "当前显示的是系统建议；点下面的分类即可改成你认为正确的结果。"
                        : "这条记录还没有分类，你可以直接选一个。"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleVerification}
                  style={{
                    border: "none",
                    minWidth: 94,
                    padding: "12px 14px",
                    borderRadius: 18,
                    background: isVerified ? C.mint : "#F4EEE7",
                    color: isVerified ? "#FFFFFF" : "#6B6259",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: isVerified ? "0 12px 24px rgba(78, 205, 196, 0.24)" : "none",
                  }}
                >
                  {isVerified ? "已锁定" : "锁定此分类"}
                </button>
              </div>

              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: 16,
                  background: isVerified ? "rgba(78, 205, 196, 0.10)" : "rgba(226, 214, 198, 0.28)",
                  color: isVerified ? "#2E6C67" : "#756B62",
                  fontSize: 13,
                  lineHeight: 1.65,
                }}
              >
                锁定后，系统不会再自动改写这条记录的分类；除非你主动修改或手动解锁。
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                {availableCategories.map((category) => {
                  const active = currentCategory === category;
                  const tone = getCategoryTone(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => handleSelectCategory(category)}
                      style={{
                        border: active ? `1.5px solid ${tone.color}` : "1px solid rgba(112, 100, 90, 0.14)",
                        background: active ? tone.bg : "rgba(248, 244, 238, 0.92)",
                        color: active ? tone.color : "#413932",
                        borderRadius: 18,
                        padding: "12px 10px",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        minHeight: 82,
                        boxShadow: active ? "0 10px 22px rgba(46, 37, 28, 0.08)" : "none",
                      }}
                    >
                      <span style={{ fontSize: 18, lineHeight: 1 }}>{getCategoryTone(category).icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 800 }}>{category}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              style={{
                borderRadius: 26,
                padding: 18,
                background: "rgba(255,255,255,0.88)",
                border: "1px solid rgba(112, 100, 90, 0.12)",
                boxShadow: "0 16px 30px rgba(46, 37, 28, 0.06)",
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#8B8177", marginBottom: 14 }}>用户标注</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 15, color: "#2B2622", fontWeight: 800 }}>告诉 AI 为什么</div>
                    <div style={{ fontSize: 11, color: "#8B8177" }}>自动保存</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#756B62", lineHeight: 1.65, marginBottom: 10 }}>
                    这段内容会进入学习链路，告诉系统你为什么这样分类。
                  </div>
                  <textarea
                    value={reasoningInput}
                    onChange={handleReasoningChange}
                    onBlur={handleReasoningBlur}
                    rows={4}
                    placeholder="例如：这是工作餐报销，不是个人消费"
                    style={{
                      width: "100%",
                      border: "1px solid rgba(112, 100, 90, 0.16)",
                      borderRadius: 18,
                      padding: "14px 15px",
                      fontSize: 14,
                      lineHeight: 1.7,
                      color: "#27231F",
                      background: "#FCFAF6",
                      resize: "vertical",
                      outline: "none",
                      fontFamily: '"Avenir Next","PingFang SC","Noto Sans SC",sans-serif',
                      minHeight: 118,
                    }}
                  />
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 15, color: "#2B2622", fontWeight: 800 }}>备注</div>
                    <div style={{ fontSize: 11, color: "#8B8177" }}>自动保存</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#756B62", lineHeight: 1.65, marginBottom: 10 }}>
                    这里只是给你自己留说明，不会进入 AI 学习。
                  </div>
                  <textarea
                    value={remarkInput}
                    onChange={handleRemarkChange}
                    onBlur={handleRemarkBlur}
                    rows={4}
                    placeholder="添加备注…"
                    style={{
                      width: "100%",
                      border: "1px solid rgba(112, 100, 90, 0.16)",
                      borderRadius: 18,
                      padding: "14px 15px",
                      fontSize: 14,
                      lineHeight: 1.7,
                      color: "#27231F",
                      background: "#FCFAF6",
                      resize: "vertical",
                      outline: "none",
                      fontFamily: '"Avenir Next","PingFang SC","Noto Sans SC",sans-serif',
                      minHeight: 118,
                    }}
                  />
                </div>
              </div>
            </section>

            <section
              style={{
                borderRadius: 24,
                padding: 16,
                background: "rgba(244, 238, 231, 0.92)",
                border: "1px solid rgba(112, 100, 90, 0.10)",
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#8B8177", marginBottom: 14 }}>系统元数据</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {updatedAtText ? <MetaRow label="最后更新" value={updatedAtText} /> : null}
                <MetaRow label="记录 ID" value={txId} />
                {originalIdText ? <MetaRow label="原始流水号" value={originalIdText} /> : null}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
