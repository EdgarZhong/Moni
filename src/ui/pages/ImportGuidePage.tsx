/**
 * ImportGuidePage — 账单导入图文指南页
 *
 * 作为记账页 (MoniEntry) 内的二级覆盖页推入，与「压缩包密码二级页」同层。
 * 内容：以微信 / 支付宝两个 Tab 组织步骤截图与文字说明，帮助用户从 App 内完成账单导出。
 *
 * 设计权威：
 *   - Layer 0 docs/design/Moni_Brand_Identity.md（三色装饰、字体、Memphis 装饰）
 *   - Layer 1 docs/design/SURFACE_SYSTEM.md（二级页面遵循内容卡语法、统一返回按钮）
 *
 * 资源：截图位于 src/ui/pages/assets/guidance/，由 Vite 静态打包。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { APP_HEADER_MIN_HEIGHT, APP_HEADER_PADDING_TOP, C, FULL_SCREEN_OVERLAY_Z_INDEX } from "@ui/features/moni-home/config";
import type { BillImportSource } from "@shared/types";

// ──────────────────────────────────────────────
// 截图资源（由 Vite 处理，构建期会被指纹化）
// ──────────────────────────────────────────────
import wechat1 from "./assets/guidance/wechat-1.jpg";
import wechat2 from "./assets/guidance/wechat-2.jpg";
import wechat3 from "./assets/guidance/wechat-3.jpg";
import wechat4 from "./assets/guidance/wechat-4.jpg";
import wechat5 from "./assets/guidance/wechat-5.jpg";
import wechat6 from "./assets/guidance/wechat-6.jpg";
import wechat7 from "./assets/guidance/wechat-7.jpg";
import alipay1 from "./assets/guidance/alipay-1.jpg";
import alipay2 from "./assets/guidance/alipay-2.jpg";
import alipay3 from "./assets/guidance/alipay-3.jpg";
import alipay4 from "./assets/guidance/alipay-4.jpg";
import alipay5 from "./assets/guidance/alipay-5.jpg";
import alipay6 from "./assets/guidance/alipay-6.jpg";

// ──────────────────────────────────────────────
// 数据：两个平台的步骤列表
// ──────────────────────────────────────────────

interface GuideStep {
  /** 步骤序号（从 1 开始，用于徽章数字） */
  index: number;
  /** 步骤标题（粗体短句） */
  title: string;
  /** 步骤说明（详细文案） */
  desc: string;
  /** 步骤截图 */
  image: string;
}

const WECHAT_STEPS: GuideStep[] = [
  {
    index: 1,
    title: "找到账单入口",
    desc: "微信「我」-「服务」-「钱包」里点开「账单」。",
    image: wechat1,
  },
  {
    index: 2,
    title: "申请下载",
    desc: "账单页右上角「···」，再点「下载账单」。",
    image: wechat2,
  },
  {
    index: 3,
    title: "选择申请用途",
    desc: "选「用于个人对账」即可。",
    image: wechat3,
  },
  {
    index: 4,
    title: "选择接收方式",
    desc: "接收方式选「微信」，本页可调整导出时间范围，按提示刷脸完成申请。",
    image: wechat4,
  },
  {
    index: 5,
    title: "等待推送",
    desc: "回到首页，大约一分钟内微信支付会推送账单导出结果。",
    image: wechat5,
  },
  {
    index: 6,
    title: "打开下载链接",
    desc: "点击查看导出消息，再点「查看申请」，按提示在浏览器中打开链接。",
    image: wechat6,
  },
  {
    index: 7,
    title: "拿到账单文件",
    desc: "系统会自动把 xlsx 账单下载到 Downloads 目录，回到 Moni 选这个文件即可。",
    image: wechat7,
  },
];

const ALIPAY_STEPS: GuideStep[] = [
  {
    index: 1,
    title: "进入流水证明",
    desc: "支付宝「我的」-「账单」，右上角「···」点开「开具交易流水证明」。",
    image: alipay1,
  },
  {
    index: 2,
    title: "选择申请用途",
    desc: "完成身份验证后，选「用于个人对账」。",
    image: alipay2,
  },
  {
    index: 3,
    title: "勾选完整信息",
    desc: "接收方式选「支付宝」；建议勾上「展示交易对手」与「商品说明」，本页也可调时间范围。",
    image: alipay3,
  },
  {
    index: 4,
    title: "查看申请记录",
    desc: "提交后回到「开具交易流水证明」页，点击底部的「申请记录」。",
    image: alipay4,
  },
  {
    index: 5,
    title: "下载账单",
    desc: "在申请记录中点开此次申请，下载导出文件。",
    image: alipay5,
  },
  {
    index: 6,
    title: "拿到账单文件",
    desc: "系统会自动下载到 Downloads 目录，回到 Moni 选这个文件即可。",
    image: alipay6,
  },
];

// ──────────────────────────────────────────────
// 平台主题（颜色与文案微调）
// ──────────────────────────────────────────────

interface PlatformTheme {
  /** 平台展示名 */
  name: string;
  /** 平台主色（步骤徽章 / 截图框点缀） */
  accent: string;
  /** 平台主色对应的浅底（卡片底色 / Tab 激活背景） */
  accentSoft: string;
  /** 平台主色对应的深字色（用于副标说明） */
  accentText: string;
  /** Tab 上的简短称呼 */
  tabLabel: string;
  /** 步骤数据 */
  steps: GuideStep[];
  /** 引导卡顶部一句话 */
  intro: string;
}

const PLATFORM_THEME: Record<BillImportSource, PlatformTheme> = {
  wechat: {
    name: "微信账单",
    accent: "#7BB97B",
    accentSoft: "#F0FFF0",
    accentText: "#3B7A3B",
    tabLabel: "微信账单",
    steps: WECHAT_STEPS,
    intro: "微信支付不直接导出，要走一个对账申请流程，下面 7 步就够。",
  },
  alipay: {
    name: "支付宝账单",
    accent: "#6B9BD2",
    accentSoft: "#F0F5FF",
    accentText: "#2B5EA7",
    tabLabel: "支付宝账单",
    steps: ALIPAY_STEPS,
    intro: "支付宝走的是「交易流水证明」入口，跟着走 6 步就能拿到完整账单。",
  },
};

// ──────────────────────────────────────────────
// 子组件：顶部品牌装饰（三色簇 + 散点 Memphis）
// ──────────────────────────────────────────────

function HeaderDecor({ accent }: { accent: string }) {
  return (
    <svg
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      {/* 品牌三色簇：右上方位 */}
      <circle cx="84%" cy="22" r="9" fill={C.coral} opacity="0.5" />
      <circle cx="91%" cy="32" r="6" fill={C.blue} opacity="0.55" />
      <rect
        x="86%"
        y="36"
        width="9"
        height="9"
        rx="1.6"
        fill={C.yellow}
        opacity="0.55"
        transform="rotate(20 0 0)"
      />
      {/* 平台主色短波浪线 */}
      <line
        x1="68%"
        y1="14"
        x2="76%"
        y2="14"
        stroke={accent}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* 远端薄荷小圆，点缀治愈感 */}
      <circle cx="62%" cy="44" r="2.4" fill={C.mint} opacity="0.4" />
    </svg>
  );
}

// ──────────────────────────────────────────────
// 子组件：单个步骤卡
// ──────────────────────────────────────────────

function StepCard({
  step,
  total,
  theme,
}: {
  step: GuideStep;
  total: number;
  theme: PlatformTheme;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* 行 1：徽章 + 标题 + 进度 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            background: theme.accent,
            color: C.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Space Mono', monospace",
            fontWeight: 700,
            fontSize: 16,
            flexShrink: 0,
            boxShadow: `0 2px 0 ${theme.accent}40`,
          }}
        >
          {step.index}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: C.dark,
              fontFamily: "'Nunito',sans-serif",
              lineHeight: 1.3,
            }}
          >
            {step.title}
          </div>
          <div
            style={{
              fontSize: 10,
              color: theme.accentText,
              marginTop: 2,
              fontFamily: "'Space Mono', monospace",
              letterSpacing: 0.5,
            }}
          >
            STEP {step.index} / {total}
          </div>
        </div>
      </div>

      {/* 行 2：说明文字 */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "min(100%, 286px)",
            fontSize: 13,
            color: C.sub,
            lineHeight: 1.6,
            textAlign: "left",
          }}
        >
          {step.desc}
        </div>
      </div>

      {/* 行 3：截图卡（仿手机屏外框） */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "min(100%, 286px)",
            background: C.white,
            border: `1.5px solid ${C.border}`,
            borderRadius: 18,
            padding: 6,
            position: "relative",
          }}
        >
          {/* 平台主色细边继续保留在内层，但容器本身改为居中，不再跟着左侧数字整体右偏。 */}
          <div
            style={{
              border: `1px solid ${theme.accent}30`,
              borderRadius: 14,
              overflow: "hidden",
              background: theme.accentSoft,
            }}
          >
            <img
              src={step.image}
              alt={`${theme.name}步骤 ${step.index}：${step.title}`}
              loading="lazy"
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                objectFit: "contain",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 主组件
// ──────────────────────────────────────────────

interface ImportGuidePageProps {
  /** 进入指南时默认聚焦的平台（智能定位：跟随用户上次点击的导入按钮） */
  defaultSource: BillImportSource;
  /** 关闭指南页（返回记账页） */
  onClose: () => void;
}

export function ImportGuidePage({ defaultSource, onClose }: ImportGuidePageProps) {
  const [activeSource, setActiveSource] = useState<BillImportSource>(defaultSource);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 切 Tab 时把内容滚回顶部，避免上一平台的滚动位置遗留
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [activeSource]);

  const theme = useMemo(() => PLATFORM_THEME[activeSource], [activeSource]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: FULL_SCREEN_OVERLAY_Z_INDEX + 10,
        background: C.bg,
        display: "flex",
        flexDirection: "column",
        animation: "guideSlideIn 220ms ease-out",
      }}
    >
      <style>{`
        @keyframes guideSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes guideStepFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .guide-step-enter {
          animation: guideStepFadeIn 320ms ease-out both;
        }
        .guide-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .guide-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── 顶部 Header ─────────────────────────── */}
      <header
        style={{
          position: "relative",
          padding: `${APP_HEADER_PADDING_TOP} 16px 10px`,
          minHeight: APP_HEADER_MIN_HEIGHT,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          background: C.bg,
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <HeaderDecor accent={theme.accent} />
        <button
          type="button"
          onClick={onClose}
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
            flexShrink: 0,
            position: "relative",
            zIndex: 1,
            cursor: "pointer",
          }}
        >
          ‹
        </button>
        <div style={{ position: "relative", zIndex: 1, flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              color: C.dark,
              fontFamily: "'Nunito',sans-serif",
              letterSpacing: -0.3,
            }}
          >
            导入指南
          </div>
          <div style={{ fontSize: 11, color: C.sub, marginTop: 3, lineHeight: 1.45 }}>
            跟着步骤走，三五分钟拿到完整账单
          </div>
        </div>
      </header>

      {/* ── Tab 切换：粘性置顶，与 Header 形成两层粘性 ───── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          padding: "12px 16px 10px",
          background: C.bg,
          display: "flex",
          gap: 8,
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        {(["wechat", "alipay"] as BillImportSource[]).map((source) => {
          const t = PLATFORM_THEME[source];
          const isActive = source === activeSource;
          return (
            <button
              key={source}
              type="button"
              onClick={() => setActiveSource(source)}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 12,
                border: isActive
                  ? `1.5px solid ${t.accent}`
                  : `1.5px solid ${C.border}`,
                background: isActive ? t.accentSoft : C.white,
                color: isActive ? t.accentText : C.muted,
                fontSize: 13,
                fontWeight: 800,
                fontFamily: "'Nunito',sans-serif",
                cursor: "pointer",
                transition: "all 160ms ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>{source === "wechat" ? "微" : "支"}</span>
              {t.tabLabel}
            </button>
          );
        })}
      </div>

      {/* ── 主滚动区 ─────────────────────────── */}
      <main
        ref={scrollRef}
        className="guide-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 16px 88px",
          position: "relative",
        }}
      >
        {/* 步骤列表 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {theme.steps.map((step, idx) => (
            <div
              key={`${activeSource}-${step.index}`}
              className="guide-step-enter"
              style={{ animationDelay: `${Math.min(idx, 4) * 60}ms` }}
            >
              <StepCard step={step} total={theme.steps.length} theme={theme} />
            </div>
          ))}
        </div>

        {/* 收束卡：导出完成后回 Moni */}
        <div
          key={`outro-${activeSource}`}
          className="guide-step-enter"
          style={{
            marginTop: 24,
            background: C.white,
            border: `2px solid ${C.dark}`,
            borderRadius: 16,
            padding: "16px 16px 14px",
            position: "relative",
            overflow: "hidden",
            animationDelay: "120ms",
          }}
        >
          <svg
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            width="100%"
            height="100%"
            aria-hidden="true"
          >
            <circle cx="92%" cy="20" r="6" fill={C.coral} opacity="0.45" />
            <circle cx="84%" cy="34" r="3.6" fill={C.blue} opacity="0.5" />
            <rect
              x="88%"
              y="40"
              width="6"
              height="6"
              rx="1.2"
              fill={C.yellow}
              opacity="0.55"
              transform="rotate(20 0 0)"
            />
          </svg>
          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 900,
                color: C.dark,
                fontFamily: "'Nunito',sans-serif",
                marginBottom: 6,
              }}
            >
              拿到文件之后
            </div>
            <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6, marginBottom: 14 }}>
              回到记账页面，点上方的「{theme.tabLabel}」按钮，选刚才下载到 Downloads
              的文件。
              <br /><br />
              如果你导出时选的是「发送到邮箱」，在邮件里把 zip 下载下来，同样直接选就好——不用手动解压，Moni 会自动识别加密、请你输入密码以解压。解压密码可以在微信支付消息/支付宝交易流水证明申请记录中找到。
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: `2px solid ${C.dark}`,
                background: C.mint,
                color: C.white,
                fontSize: 14,
                fontWeight: 800,
                fontFamily: "'Nunito',sans-serif",
                cursor: "pointer",
                letterSpacing: 0.3,
              }}
            >
              好，我去导入
            </button>
          </div>
        </div>

        {/* 底部留白：给收束卡呼吸空间 */}
        <div style={{ height: 12 }} />
      </main>
    </div>
  );
}
