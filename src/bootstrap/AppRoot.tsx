import { useState, useCallback, useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { appFacade } from '@bootstrap/appFacade';
import MoniHome from '@ui/pages/MoniHome';
import MoniEntry from '@ui/pages/MoniEntry';
import MoniSettings from '@ui/pages/MoniSettings';
import { useAppViewportLock } from '@ui/hooks/useAppViewportLock';
import { useAiEngineControl } from '@ui/hooks/useAiEngineControl';
import { useKeyboard } from '@ui/hooks/useKeyboard';
import { useLedgerControl } from '@ui/hooks/useLedgerControl';
import { BottomNav } from '@ui/features/moni-home/BottomNav';
import { ZeroMemoryWarningDialog } from '@ui/features/zero-memory-warning/ZeroMemoryWarningDialog';
import {
  PHONE_FRAME_HEIGHT_CSS,
  PHONE_FRAME_WIDTH_CSS,
} from '@ui/features/moni-home/config';
import {
  getBackHandlerDepth,
  invokeTopBackHandler,
} from '@system/device/backHandler';
import {
  installNativeBackDebugBridge,
  type NativeBackDebugSnapshot,
  type NativeBackDebugTriggerInput,
} from '@system/device/nativeBackDebugBridge';

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
  const exitToastVisibleRef = useRef(false);
  const lastBackTimeRef = useRef(0);
  const exitToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitRequestCountRef = useRef(0);
  const lastNativeBackMetaRef = useRef<{
    source: string | null;
    canGoBack: boolean | null;
    triggeredAt: number | null;
  }>({
    source: null,
    canGoBack: null,
    triggeredAt: null,
  });
  const autoLearningNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Root back 调试快照始终以 ref 为准。
   * 这样浏览器调试入口在同一个宏任务中触发 back 后，也能立刻拿到最新状态。
   */
  const buildNativeBackDebugSnapshot = useCallback((): NativeBackDebugSnapshot => ({
    available: true,
    stackDepth: getBackHandlerDepth(),
    exitToastVisible: exitToastVisibleRef.current,
    exitRequestCount: exitRequestCountRef.current,
    lastTriggerSource: lastNativeBackMetaRef.current.source,
    lastCanGoBack: lastNativeBackMetaRef.current.canGoBack,
    lastTriggeredAt: lastNativeBackMetaRef.current.triggeredAt,
    lastRootBackAt: lastBackTimeRef.current || null,
  }), []);

  /** 统一维护 toast 状态，避免 state 与调试快照脱节。 */
  const updateExitToastVisible = useCallback((visible: boolean) => {
    exitToastVisibleRef.current = visible;
    setExitToastVisible(visible);
  }, []);

  /** 统一清理退出提示定时器，保证多次触发 back 时不会残留旧 timer。 */
  const clearExitToastTimer = useCallback(() => {
    if (exitToastTimerRef.current != null) {
      clearTimeout(exitToastTimerRef.current);
      exitToastTimerRef.current = null;
    }
  }, []);

  /**
   * 统一处理“native back 已到达 JS”后的 Root 分派逻辑。
   * Android 原生 listener 与浏览器开发态调试桥都必须走这一条路径，避免测试和真机分支漂移。
   */
  const handleRootNativeBack = useCallback(async (
    input?: NativeBackDebugTriggerInput
  ): Promise<NativeBackDebugSnapshot> => {
    const canGoBack = input?.canGoBack ?? false;
    const source = input?.source ?? 'native';
    const triggeredAt = Date.now();

    lastNativeBackMetaRef.current = {
      source,
      canGoBack,
      triggeredAt,
    };

    console.info('[native-back] backButton received', {
      canGoBack,
      stackDepth: getBackHandlerDepth(),
      source,
    });

    // 优先交给二级页面处理（详情页、覆盖层、密码页等）
    if (invokeTopBackHandler()) {
      return buildNativeBackDebugSnapshot();
    }

    // 一级页面：两次返回退出应用
    if (triggeredAt - lastBackTimeRef.current < 2000) {
      // 第二次返回：退出应用
      clearExitToastTimer();
      updateExitToastVisible(false);
      exitRequestCountRef.current += 1;

      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        void CapacitorApp.exitApp();
      } else {
        console.info('[native-back] exit requested in browser debug mode');
      }
    } else {
      // 第一次返回：显示提示条
      lastBackTimeRef.current = triggeredAt;
      updateExitToastVisible(true);
      clearExitToastTimer();
      exitToastTimerRef.current = setTimeout(() => {
        updateExitToastVisible(false);
        exitToastTimerRef.current = null;
      }, 2000);
    }

    return buildNativeBackDebugSnapshot();
  }, [
    buildNativeBackDebugSnapshot,
    clearExitToastTimer,
    updateExitToastVisible,
  ]);

  /** 开发态与浏览器自动化共用的 Root back 调试入口。 */
  const resetNativeBackDebugState = useCallback((): NativeBackDebugSnapshot => {
    lastBackTimeRef.current = 0;
    exitRequestCountRef.current = 0;
    lastNativeBackMetaRef.current = {
      source: null,
      canGoBack: null,
      triggeredAt: null,
    };
    clearExitToastTimer();
    updateExitToastVisible(false);
    return buildNativeBackDebugSnapshot();
  }, [
    buildNativeBackDebugSnapshot,
    clearExitToastTimer,
    updateExitToastVisible,
  ]);

  useEffect(() => {
    /**
     * 顶部 safe area 的“设备额外下沉”统一在 Root 层写成一个 CSS 变量。
     * 这样所有 header / 二级页只消费同一套 `APP_HEADER_PADDING_TOP`，
     * 不再让每个页面自己判断 Android、自己减像素。
     *
     * 用户当前要求只回收“Android 专属那一层 safe area”，
     * 不动浏览器里肉眼可见的基础顶边距。
     */
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    root.style.setProperty(
      '--app-header-native-safe-area-trim',
      isNativeAndroid ? 'calc(env(safe-area-inset-top, 0px) * -0.15)' : '0px'
    );

    return () => {
      root.style.removeProperty('--app-header-native-safe-area-trim');
    };
  }, []);

  // 开发态调试桥：让浏览器里的 Playwright 也能命中 Root 层同一条返回分派逻辑
  useEffect(() => {
    return installNativeBackDebugBridge({
      trigger: handleRootNativeBack,
      getSnapshot: buildNativeBackDebugSnapshot,
      reset: resetNativeBackDebugState,
    });
  }, [
    buildNativeBackDebugSnapshot,
    handleRootNativeBack,
    resetNativeBackDebugState,
  ]);

  // 监听 Android 系统返回键（仅在 Capacitor Android native 环境下生效）
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

    /** 防止异步注册完成时组件已经卸载，留下悬空 listener 句柄 */
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    let removed = false;

    const registerBack = async () => {
      try {
        console.info('[native-back] registering App.backButton listener');

        listenerHandle = await CapacitorApp.addListener('backButton', (event) => {
          void handleRootNativeBack({
            canGoBack: event.canGoBack,
            source: 'native',
          });
        });

        /**
         * 注册完成后再次确认组件仍处于挂载态。
         * 若此时已卸载，立即移除 listener，避免后续真机测试出现重复回调。
         */
        if (removed) {
          await listenerHandle.remove();
          listenerHandle = null;
          return;
        }

        console.info('[native-back] App.backButton listener registered');
      } catch (error) {
        console.error('[native-back] failed to register App.backButton listener', error);
      }
    };

    void registerBack();

    return () => {
      removed = true;
      clearExitToastTimer();
      void listenerHandle?.remove();
    };
  }, [clearExitToastTimer, handleRootNativeBack]);

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

      {/* 零记忆消费风险提示弹窗 */}
      <ZeroMemoryWarningDialog
        isOpen={aiEngineControl.zeroMemoryWarning.isOpen}
        daysCount={aiEngineControl.zeroMemoryWarning.daysCount}
        startDate={aiEngineControl.zeroMemoryWarning.startDate || new Date()}
        endDate={aiEngineControl.zeroMemoryWarning.endDate || new Date()}
        onClassify7Days={aiEngineControl.zeroMemoryWarning.handleClassify7Days}
        onConsumeAll={aiEngineControl.zeroMemoryWarning.handleConsumeAll}
        onClose={aiEngineControl.zeroMemoryWarning.handleClose}
      />

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
          data-testid="native-back-exit-toast"
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
