import { useState, useCallback, useEffect, useRef } from 'react';
import { registerPlugin, Capacitor } from '@capacitor/core';
import { appFacade } from '@bootstrap/appFacade';
import MoniHome from '@ui/pages/MoniHome';
import MoniEntry from '@ui/pages/MoniEntry';
import MoniSettings from '@ui/pages/MoniSettings';
import { useAppViewportLock } from '@ui/hooks/useAppViewportLock';
import { useAiEngineControl } from '@ui/hooks/useAiEngineControl';
import { useKeyboard } from '@ui/hooks/useKeyboard';
import { useLedgerControl } from '@ui/hooks/useLedgerControl';
import { BottomNav } from '@ui/features/moni-home/BottomNav';
import { LedgerHeaderControl, Logo } from '@ui/features/moni-home/components';
import {
  APP_HEADER_MIN_HEIGHT,
  APP_HEADER_PADDING_TOP,
  C,
  LEDGER_HEADER_CONTROL_WIDTH,
  PHONE_FRAME_HEIGHT_CSS,
  PHONE_FRAME_WIDTH_CSS,
} from '@ui/features/moni-home/config';
import { invokeTopBackHandler } from '@system/device/backHandler';

/** Capacitor App 插件（仅声明所需方法，无需安装 @capacitor/app 包） */
interface CapacitorAppPlugin {
  addListener(
    event: 'backButton',
    handler: (data: { canGoBack: boolean }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  exitApp(): Promise<void>;
}

const CapacitorApp = registerPlugin<CapacitorAppPlugin>('App');

type Page = 'home' | 'entry' | 'settings';

function RuntimeApp() {
  /**
   * 在应用根层锁定稳定画布高度。
   * 这样页面容器就不会在 Android 软键盘弹出时跟着 viewport 一起缩短。
   */
  useAppViewportLock();

  const [activePage, setActivePage] = useState<Page>('home');
  const { isKeyboardVisible } = useKeyboard();

  /**
   * AI 引擎控制状态放在 AppRoot 层，BottomNav 随之不再随页面切换而卸载。
   * 这样 AI 运行状态和动画在三个页面间保持完全连贯，不会出现闪烁或重置。
   */
  const aiEngineControl = useAiEngineControl();
  const { currentLedger, availableLedgers, switchLedger } = useLedgerControl();

  const [ledgerDropdownOpen, setLedgerDropdownOpen] = useState(false);
  const ledgerDropdownWrapRef = useRef<HTMLDivElement>(null);

  /** 是否显示"再次返回退出应用"提示条 */
  const [exitToastVisible, setExitToastVisible] = useState(false);
  const lastBackTimeRef = useRef(0);
  const exitToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoLearningNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 监听 Android 系统返回键（仅在 Capacitor native 环境下生效）
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => Promise<void> } | null = null;

    const registerBack = async () => {
      listenerHandle = await CapacitorApp.addListener('backButton', () => {
        // 优先交给二级页面处理（详情页、覆盖层、密码页等）
        if (invokeTopBackHandler()) return;

        // 一级页面：两次返回退出应用
        const now = Date.now();
        if (now - lastBackTimeRef.current < 2000) {
          // 第二次返回：退出应用
          if (exitToastTimerRef.current != null) clearTimeout(exitToastTimerRef.current);
          setExitToastVisible(false);
          void CapacitorApp.exitApp();
        } else {
          // 第一次返回：显示提示条
          lastBackTimeRef.current = now;
          setExitToastVisible(true);
          if (exitToastTimerRef.current != null) clearTimeout(exitToastTimerRef.current);
          exitToastTimerRef.current = setTimeout(() => {
            setExitToastVisible(false);
            exitToastTimerRef.current = null;
          }, 2000);
        }
      });
    };

    void registerBack();

    return () => {
      if (exitToastTimerRef.current != null) clearTimeout(exitToastTimerRef.current);
      void listenerHandle?.remove();
    };
  }, []);

  const [autoLearningNotice, setAutoLearningNotice] = useState<{
    visible: boolean;
    message: string;
  }>({
    visible: false,
    message: '',
  });

  const handleNavigate = useCallback((page: Page) => {
    setActivePage(page);
    setLedgerDropdownOpen(false);
  }, []);

  useEffect(() => {
    if (!ledgerDropdownOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!ledgerDropdownWrapRef.current?.contains(event.target as Node)) {
        setLedgerDropdownOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [ledgerDropdownOpen]);

  useEffect(() => {
    if (!autoLearningNotice.visible) {
      if (autoLearningNoticeTimerRef.current != null) {
        clearTimeout(autoLearningNoticeTimerRef.current);
        autoLearningNoticeTimerRef.current = null;
      }
      return;
    }

    if (autoLearningNoticeTimerRef.current != null) {
      clearTimeout(autoLearningNoticeTimerRef.current);
    }
    autoLearningNoticeTimerRef.current = setTimeout(() => {
      setAutoLearningNotice((value) => ({ ...value, visible: false }));
      autoLearningNoticeTimerRef.current = null;
    }, 3200);

    return () => {
      if (autoLearningNoticeTimerRef.current != null) {
        clearTimeout(autoLearningNoticeTimerRef.current);
        autoLearningNoticeTimerRef.current = null;
      }
    };
  }, [autoLearningNotice.visible]);

  useEffect(() => {
    const unsubscribe = appFacade.subscribeAutoLearningEvents((event) => {
      if (event.phase !== 'triggered') {
        return;
      }

      setAutoLearningNotice({
        visible: true,
        message: `账本「${event.ledgerName}」已触发自动学习，AI 正在后台更新记忆。`,
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div
      style={{
        width: PHONE_FRAME_WIDTH_CSS,
        maxWidth: '100vw',
        margin: 0,
        height: PHONE_FRAME_HEIGHT_CSS,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: "'Nunito',-apple-system,sans-serif",
      }}
    >
      {/* 共享 Header：首页与记账页常驻，设置页不显示。
          提到 AppRoot 层确保切页时 currentLedger 永远不 reset 到 FALLBACK。 */}
      {activePage !== 'settings' && (
        <div
          style={{
            padding: `${APP_HEADER_PADDING_TOP} 16px 10px`,
            minHeight: APP_HEADER_MIN_HEIGHT,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: C.bg,
            zIndex: 20,
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <Logo />
          <div
            ref={ledgerDropdownWrapRef}
            style={{ width: LEDGER_HEADER_CONTROL_WIDTH, display: 'flex', justifyContent: 'flex-end', position: 'relative' }}
          >
            <LedgerHeaderControl
              ledgerName={currentLedger.name}
              ariaLabel="切换账本"
              onClick={() => setLedgerDropdownOpen((open) => !open)}
            />
            {ledgerDropdownOpen && (
              <div
                style={{
                  position: 'absolute', top: 40, right: 0,
                  minWidth: 146, maxWidth: 220,
                  background: C.white, border: `2px solid ${C.dark}`,
                  borderRadius: 14, boxShadow: '0 8px 20px rgba(0,0,0,.14)',
                  overflow: 'hidden', zIndex: 40,
                }}
              >
                {availableLedgers.map((ledger, index) => {
                  const selected = ledger.id === currentLedger.id;
                  return (
                    <div
                      key={ledger.id}
                      onClick={() => {
                        void switchLedger(ledger.id).catch((err) => {
                          console.error('[AppRoot] Failed to switch ledger:', err);
                        });
                        setLedgerDropdownOpen(false);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 10, padding: '10px 12px', cursor: 'pointer',
                        borderBottom: index < availableLedgers.length - 1 ? `1px solid ${C.line}` : 'none',
                        background: selected ? C.blueBg : C.white,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: selected ? 700 : 600, color: C.dark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ledger.name}
                      </div>
                      <div style={{ fontSize: 12, color: selected ? C.dark : 'transparent', fontWeight: 700 }}>✓</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 页面内容区：占满 BottomNav 以上的剩余高度 */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {activePage === 'entry' ? <MoniEntry onNavigate={handleNavigate} /> : null}
        {activePage === 'settings' ? <MoniSettings onNavigate={handleNavigate} /> : null}
        {activePage === 'home' ? <MoniHome onNavigate={handleNavigate} /> : null}
      </div>

      {/* BottomNav 常驻于此，不随页面切换卸载，AI 状态保持连贯 */}
      {!isKeyboardVisible && (
        <BottomNav
          aiOn={aiEngineControl.aiOn}
          aiStop={aiEngineControl.aiStop}
          controlOpen={aiEngineControl.controlOpen}
          controlHit={aiEngineControl.controlHit}
          onStartControl={aiEngineControl.onStartControl}
          onEndControl={aiEngineControl.onEndControl}
          onCancelControl={aiEngineControl.onCancelControl}
          onUpdateControlHit={aiEngineControl.onUpdateControlHit}
          activePage={activePage}
          onSettings={() => handleNavigate('settings')}
          onBookkeeping={() => handleNavigate('entry')}
          onHomeNavigate={activePage !== 'home' ? () => handleNavigate('home') : undefined}
        />
      )}

      {/* AI 控制条背景遮罩：打开时拦截页面点击，关闭控制条 */}
      {aiEngineControl.controlOpen ? (
        <div
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); aiEngineControl.onCancelControl(); }}
          style={{ position: 'absolute', inset: 0, zIndex: 25, background: 'transparent' }}
        />
      ) : null}

      {autoLearningNotice.visible ? (
        <div
          style={{
            position: 'fixed',
            top: 'max(12px, env(safe-area-inset-top, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(320px, calc(100vw - 24px))',
            zIndex: 99999,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: '#e9fbf8',
              border: '1.5px solid #9ee7dd',
              borderRadius: 14,
              boxShadow: '0 10px 24px rgba(60, 120, 116, 0.16)',
              padding: '11px 14px 12px',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#126b63', marginBottom: 4 }}>
              自动学习已触发
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: '#24534e', wordBreak: 'break-word' }}>
              {autoLearningNotice.message}
            </div>
          </div>
        </div>
      ) : null}

      {/* 再次返回退出提示条（Android 一级页面返回手势） */}
      {exitToastVisible ? (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99998,
            background: 'rgba(20, 20, 20, 0.88)',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 18px',
            borderRadius: 20,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          再次返回退出应用
        </div>
      ) : null}
    </div>
  );
}

function App() {
  return <RuntimeApp />;
}

export default App;
