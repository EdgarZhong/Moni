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
import {
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

/**
 * 浏览器开发态下，registerPlugin('App') 可能只返回一个占位对象，
 * 其中并没有真正可调用的 addListener。
 * 这里显式做一次运行时守卫，避免 dev 环境因为“假原生插件”直接抛错刷屏。
 */
function canRegisterNativeBackButtonListener(): boolean {
  const candidate = CapacitorApp as unknown as { addListener?: unknown };
  return typeof candidate.addListener === 'function';
}

type Page = 'home' | 'entry' | 'settings';
type ShellChromeState = {
  showBottomNav: boolean;
};

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
  const [shellChrome, setShellChrome] = useState<ShellChromeState>({ showBottomNav: true });

  /** 是否显示"再次返回退出应用"提示条 */
  const [exitToastVisible, setExitToastVisible] = useState(false);
  const lastBackTimeRef = useRef(0);
  const exitToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoLearningNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 监听 Android 系统返回键（仅在 Capacitor native 环境下生效）
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !canRegisterNativeBackButtonListener()) return;

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
  }, []);

  useEffect(() => {
    /**
     * 切页后先恢复默认 shell 可见性。
     * 这样每个一级页只需要在“自己确实出现全屏覆盖层”时再显式把底部导航隐藏。
     */
    setShellChrome({ showBottomNav: true });
  }, [activePage]);

  const handleBottomNavVisibilityChange = useCallback((visible: boolean) => {
    setShellChrome((previous) => (
      previous.showBottomNav === visible
        ? previous
        : { ...previous, showBottomNav: visible }
    ));
  }, []);

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
      {/* 页面内容区：Root 只保留状态宿主与壳层规则，不再统一拥有页面 header DOM。 */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {activePage === 'entry' ? (
          <MoniEntry
            onNavigate={handleNavigate}
            currentLedger={currentLedger}
            availableLedgers={availableLedgers}
            onSwitchLedger={switchLedger}
            onBottomNavVisibilityChange={handleBottomNavVisibilityChange}
          />
        ) : null}
        {activePage === 'settings' ? (
          <MoniSettings
            onNavigate={handleNavigate}
            onBottomNavVisibilityChange={handleBottomNavVisibilityChange}
          />
        ) : null}
        {activePage === 'home' ? (
          <MoniHome
            onNavigate={handleNavigate}
            currentLedger={currentLedger}
            availableLedgers={availableLedgers}
            onSwitchLedger={switchLedger}
            onBottomNavVisibilityChange={handleBottomNavVisibilityChange}
          />
        ) : null}
      </div>

      {/* BottomNav 常驻于此，不随页面切换卸载，AI 状态保持连贯 */}
      {!isKeyboardVisible && shellChrome.showBottomNav && (
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
