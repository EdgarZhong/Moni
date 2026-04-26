import { useEffect, useRef, useState } from 'react';
import { appFacade } from '@bootstrap/appFacade';
import MoniEntry from '@ui/pages/MoniEntry';
import { C, PHONE_FRAME_HEIGHT_CSS, PHONE_FRAME_WIDTH_CSS } from '@ui/features/moni-home/config';

type BillImportSource = 'wechat' | 'alipay';
type PrototypePage = 'entry' | 'password';
type PasswordState = 'idle' | 'invalid';
type ButtonRect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

const SOURCE_LABELS: Record<BillImportSource, string> = {
  wechat: '微信账单',
  alipay: '支付宝账单',
};

/**
 * 账单导入原型直接挂载正式 `MoniEntry`。
 * prototype 只增加开发态交互覆盖层和密码二级页，不再重写导入卡片、成功提示或随手记区域。
 */
export function BillImportUiuxPrototype() {
  const stageRef = useRef<HTMLDivElement>(null);
  const facadeRef = useRef(appFacade as typeof appFacade & { importRawData: typeof appFacade.importRawData });
  const originalImportRawDataRef = useRef(facadeRef.current.importRawData.bind(facadeRef.current));
  const [page, setPage] = useState<PrototypePage>('entry');
  const [source, setSource] = useState<BillImportSource>('wechat');
  const [password, setPassword] = useState('');
  const [passwordState, setPasswordState] = useState<PasswordState>('idle');
  const [buttonRects, setButtonRects] = useState<Partial<Record<BillImportSource, ButtonRect>>>({});

  /**
   * prototype 只借用正式页面自己的成功提示，不真的写入账本。
   * 因此在原型挂载期间临时把 `importRawData` 替换成 no-op。
   */
  useEffect(() => {
    facadeRef.current.importRawData = async () => undefined;
    return () => {
      facadeRef.current.importRawData = originalImportRawDataRef.current;
    };
  }, []);

  useEffect(() => {
    const syncTargets = () => {
      if (!stageRef.current) return;
      const rootRect = stageRef.current.getBoundingClientRect();
      const nextRects: Partial<Record<BillImportSource, ButtonRect>> = {};

      for (const sourceKey of Object.keys(SOURCE_LABELS) as BillImportSource[]) {
        const targetElement = findElementByExactText(stageRef.current, SOURCE_LABELS[sourceKey]);
        if (!targetElement) continue;
        const targetRect = targetElement.getBoundingClientRect();
        nextRects[sourceKey] = {
          left: targetRect.left - rootRect.left,
          top: targetRect.top - rootRect.top,
          width: targetRect.width,
          height: targetRect.height,
        };
      }

      setButtonRects(nextRects);
    };

    syncTargets();
    const timeoutA = window.setTimeout(syncTargets, 60);
    const timeoutB = window.setTimeout(syncTargets, 280);
    const observer = stageRef.current ? new MutationObserver(syncTargets) : null;
    if (observer && stageRef.current) {
      observer.observe(stageRef.current, { childList: true, subtree: true, characterData: true });
    }

    window.addEventListener('resize', syncTargets);
    return () => {
      window.clearTimeout(timeoutA);
      window.clearTimeout(timeoutB);
      observer?.disconnect();
      window.removeEventListener('resize', syncTargets);
    };
  }, []);

  const openPasswordPage = (nextSource: BillImportSource) => {
    setSource(nextSource);
    setPassword('');
    setPasswordState('idle');
    setPage('password');
  };

  const closePasswordPage = () => {
    setPage('entry');
    setPassword('');
    setPasswordState('idle');
  };

  const submitPassword = async (nextPassword: string) => {
    if (nextPassword !== '123456') {
      setPasswordState('invalid');
      setPassword('');
      return;
    }

    setPage('entry');
    setPassword('');
    setPasswordState('idle');
    await triggerPrototypeImport(stageRef.current, source);
  };

  const handlePasswordChange = (nextValue: string) => {
    const sanitizedValue = nextValue.replace(/\D/g, '').slice(0, 6);
    setPasswordState('idle');
    setPassword(sanitizedValue);
    if (sanitizedValue.length === 6) {
      void submitPassword(sanitizedValue);
    }
  };

  return (
    <div
      style={{
        height: '100%',
        minHeight: '100%',
        background: C.bg,
        color: C.dark,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        fontFamily: "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div
        ref={stageRef}
        style={{
          width: PHONE_FRAME_WIDTH_CSS,
          maxWidth: '100vw',
          minHeight: PHONE_FRAME_HEIGHT_CSS,
          margin: '0 auto',
          position: 'relative',
          background: C.bg,
          overflow: 'hidden',
        }}
      >
        <MoniEntry onNavigate={() => undefined} />

        {page === 'entry' ? (
          <EntryInteractionOverlay buttonRects={buttonRects} onSelectSource={openPasswordPage} />
        ) : null}

        {page === 'password' ? (
          <PasswordPageOverlay
            source={source}
            password={password}
            passwordState={passwordState}
            onBack={closePasswordPage}
            onPasswordChange={handlePasswordChange}
          />
        ) : null}
      </div>
    </div>
  );
}

function EntryInteractionOverlay({
  buttonRects,
  onSelectSource,
}: {
  buttonRects: Partial<Record<BillImportSource, ButtonRect>>;
  onSelectSource: (source: BillImportSource) => void;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}>
      {(Object.keys(buttonRects) as BillImportSource[]).map((source) => {
        const rect = buttonRects[source];
        if (!rect) return null;
        return (
          <button
            key={source}
            type="button"
            aria-label={`打开${SOURCE_LABELS[source]}密码页`}
            onClick={() => onSelectSource(source)}
            style={{
              position: 'absolute',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              pointerEvents: 'auto',
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
            }}
          />
        );
      })}
    </div>
  );
}

function PasswordPageOverlay({
  source,
  password,
  passwordState,
  onBack,
  onPasswordChange,
}: {
  source: BillImportSource;
  password: string;
  passwordState: PasswordState;
  onBack: () => void;
  onPasswordChange: (value: string) => void;
}) {
  const platformName = source === 'wechat' ? '微信' : '支付宝';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        animation: 'billImportSlideIn 220ms ease-out',
      }}
    >
      <style>{`
        @keyframes billImportSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <header style={{ padding: '18px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={onBack}
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
          <div style={{ fontSize: 18, fontWeight: 900 }}>{platformName}账单密码</div>
          <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>输入导出压缩包里的 6 位数字密码</div>
        </div>
      </header>

      <main style={{ flex: 1, padding: '10px 18px 18px' }}>
        <section
          style={{
            background: C.white,
            border: `2px solid ${C.dark}`,
            borderRadius: 22,
            padding: '22px 18px 18px',
            boxShadow: '0 8px 0 rgba(31, 36, 48, 0.08)',
          }}
        >
          <div style={{ width: 72, height: 72, borderRadius: 22, background: C.blueBg, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 36, height: 44, border: `2px solid ${C.dark}`, borderRadius: 8, background: C.white, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 7, right: 7, top: 12, height: 2, background: C.border, borderRadius: 2 }} />
              <div style={{ position: 'absolute', left: 7, right: 11, top: 21, height: 2, background: C.border, borderRadius: 2 }} />
              <div style={{ position: 'absolute', right: -12, bottom: -10, width: 26, height: 26, borderRadius: 13, background: C.mint, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.white, fontWeight: 900 }}>
                #
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 900, marginBottom: 6 }}>{platformName}账单压缩包已识别</div>
          <div style={{ textAlign: 'center', fontSize: 11, lineHeight: 1.55, color: C.sub, marginBottom: 18 }}>
            请输入导出账单时获得的 6 位数字密码。
          </div>

          <label style={{ display: 'block', position: 'relative', marginBottom: 10 }}>
            <input
              aria-label={`${platformName}账单密码`}
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                border: 0,
                padding: 0,
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  style={{
                    height: 42,
                    borderRadius: 12,
                    border: `1.5px solid ${passwordState === 'invalid' ? '#D85F4A' : C.border}`,
                    background: C.warmBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: C.dark,
                    fontSize: 18,
                    fontWeight: 900,
                    fontFamily: "'Space Mono', monospace",
                    transition: 'border-color 160ms ease',
                  }}
                >
                  {password[index] ?? ''}
                </div>
              ))}
            </div>
          </label>

          <div style={{ minHeight: 18, textAlign: 'center', fontSize: 11, fontWeight: 800, color: passwordState === 'invalid' ? '#C94632' : C.muted }}>
            {passwordState === 'invalid' ? '密码不正确，请重新输入。试试原型密码 123456。' : '原型密码：123456'}
          </div>
        </section>
      </main>
    </div>
  );
}

function findElementByExactText(root: HTMLElement, text: string): HTMLElement | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.textContent?.trim() === text && current.parentElement instanceof HTMLElement) {
      return current.parentElement;
    }
    current = walker.nextNode();
  }
  return null;
}

async function triggerPrototypeImport(root: HTMLDivElement | null, source: BillImportSource): Promise<void> {
  if (!root) return;
  const input = root.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) return;

  const transfer = new DataTransfer();
  transfer.items.add(buildPrototypeFixtureFile(source));
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: transfer.files,
  });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function buildPrototypeFixtureFile(source: BillImportSource): File {
  const prefix = source === 'wechat' ? '微信' : '支付宝';
  const content = [
    '微信支付账单明细,,,,,,,,,,',
    `微信昵称：[${prefix}原型样本],,,,,,,,,,`,
    '起始时间：[2026-04-01 00:00:00] 终止时间：[2026-04-01 23:59:59],,,,,,,,,,',
    '导出类型：[全部],,,,,,,,,,',
    '导出时间：[2026-04-24 20:00:00],,,,,,,,,,',
    '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注',
    `2026-04-01 12:00:00,商户消费,调试商户,${prefix}原型午餐,支出,12.50,零钱,支付成功,wx_debug_import_plain_001,merchant_debug_001,直传文本账单`,
  ].join('\n');

  return new File([content], 'wechat_plain_fixture.txt', {
    type: 'text/plain',
    lastModified: Date.now(),
  });
}
