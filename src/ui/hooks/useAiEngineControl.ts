import { useCallback, useEffect, useRef, useState } from 'react';
import { appFacade } from '@bootstrap/appFacade';
import type { ControlUpdateRef } from '@ui/features/moni-home/components';
import {
  publishHomeRangeUiOverride,
  toLocalDateKey,
} from '@ui/features/moni-home/homeRangeUiSession';
import type { HomeAiEngineUiState } from '@shared/types';
import { triggerImpact } from '@system/device/impact';
import { useZeroMemoryWarningDialog } from './useZeroMemoryWarningDialog';

const EMPTY_AI_STATE: HomeAiEngineUiState = {
  status: 'idle',
  activeLedger: '',
  activeDate: null,
  activeDates: [],
  hasPendingInRange: false,
  hasPendingOutOfRange: false,
  pendingCount: 0,
  lastLearnedAt: null,
  lastLearningNotice: null,
};

export interface AiEngineControl {
  aiOn: boolean;
  aiStop: boolean;
  controlOpen: boolean;
  controlHit: string | null;
  controlRef: React.RefObject<HTMLDivElement | null>;
  onStartControl: (clientY: number, pointerId: number) => void;
  onEndControl: () => void;
  onCancelControl: () => void;
  onUpdateControlHit: ControlUpdateRef;
  // 零记忆警告弹窗相关
  zeroMemoryWarning: ReturnType<typeof useZeroMemoryWarningDialog>;
}

/**
 * 跨页面 AI 引擎控制 hook。
 * 直接订阅 appFacade，读取 aiEngineUiState，并提供与 BottomNav 完全兼容的控制接口。
 * MoniEntry / MoniSettings 使用此 hook 代替页面私有 state。
 */
export function useAiEngineControl(): AiEngineControl {
  const [aiState, setAiState] = useState<HomeAiEngineUiState>(EMPTY_AI_STATE);
  const [optimisticStopping, setOptimisticStopping] = useState(false);
  const [controlOpen, setControlOpen] = useState(false);
  const [controlHit, setControlHit] = useState<string | null>(null);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // 零记忆警告弹窗
  const zeroMemoryWarning = useZeroMemoryWarningDialog();

  // 订阅 appFacade，同步 AI 引擎状态
  useEffect(() => {
    mountedRef.current = true;

    const loadAiState = async () => {
      try {
        const model = await appFacade.getMoniHomeReadModel();
        if (mountedRef.current) setAiState(model.aiEngineUiState);
      } catch {
        // 非首页环境 getMoniHomeReadModel 可能暂时不可用，忽略
      }
    };

    void loadAiState();
    const unsubscribe = appFacade.subscribe(() => void loadAiState());

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  // AI 停止后清除乐观停止标记
  useEffect(() => {
    if (aiState.status !== 'running') {
      setOptimisticStopping(false);
    }
  }, [aiState.status]);

  const stopHold = useCallback(() => {
    if (holdRef.current != null) clearTimeout(holdRef.current);
  }, []);

  const onStartControl = useCallback((_clientY: number, _pointerId: number) => {
    if (holdRef.current != null) clearTimeout(holdRef.current);
    holdRef.current = setTimeout(() => {
      setControlOpen(true);
      setControlHit(null);
      void triggerImpact('light');
    }, 420);
  }, []);

  const aiOn = aiState.status === 'running' || aiState.status === 'draining' || optimisticStopping;
  const aiStop = aiState.status === 'draining' || optimisticStopping;

  const onEndControl = useCallback(() => {
    stopHold();
    if (!controlOpen) return;
    if (controlHit === '开启') {
      setOptimisticStopping(false);

      // 传入零记忆警告弹窗的 callback 给 AppFacade
      void appFacade.startAiProcessing(
        async (latestDate: Date, daysCount: number) => {
          const choice = await zeroMemoryWarning.showDialog(latestDate, daysCount);

          /**
           * 当用户选择“只分类 7 天”时，除了让 facade 缩小实际消费范围，
           * 还必须把首页 DateRangePicker 的本地会话态同步成同一窗口。
           * 否则首页会出现“后台已切 7 天，但滑块仍显示旧范围”的错位。
           */
          if (choice === 'classify7days') {
            const ledgerId = appFacade.getLedgerState().currentLedgerId;
            const adjustedRange = appFacade.computeAdjustedDateRangeFor7Days(latestDate);
            const startKey = toLocalDateKey(adjustedRange.start);
            const endKey = toLocalDateKey(adjustedRange.end);

            publishHomeRangeUiOverride(ledgerId, {
              rangeMode: '自定义',
              customStart: startKey,
              customEnd: endKey,
              draftRangeMode: '自定义',
              draftCustomStart: startKey,
              draftCustomEnd: endKey,
            });
          }

          return choice;
        }
      ).catch((err) => {
        console.error('[useAiEngineControl] Failed to start AI:', err);
      });

      void triggerImpact('medium');
    }
    if (controlHit === '关闭' && aiOn) {
      setOptimisticStopping(true);
      appFacade.stopAiProcessing();
      void triggerImpact('medium');
    }
    setControlOpen(false);
    setControlHit(null);
  }, [aiOn, controlHit, controlOpen, stopHold, zeroMemoryWarning]);

  const onCancelControl = useCallback(() => {
    stopHold();
    if (controlOpen) {
      setControlOpen(false);
      setControlHit(null);
    }
  }, [controlOpen, stopHold]);

  const updateControlHit = useCallback((clientY: number) => {
    const rect = controlRef.current?.getBoundingClientRect();
    if (!rect) return;
    setControlHit(clientY - rect.top < rect.height / 2 ? '开启' : '关闭');
  }, []);

  return {
    aiOn,
    aiStop,
    controlOpen,
    controlHit,
    controlRef,
    onStartControl,
    onEndControl,
    onCancelControl,
    onUpdateControlHit: { ref: controlRef, move: updateControlHit },
    zeroMemoryWarning,
  };
}
