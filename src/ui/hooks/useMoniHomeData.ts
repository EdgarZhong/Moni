import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appFacade } from '@bootstrap/appFacade';
import type {
  HomeAiEngineUiState,
  HomeBudgetCardReadModel,
  HomeHintCardReadModel,
  LedgerCategoryDefinition,
  LedgerOption,
  MoniHomeReadModel,
} from '@shared/types';
import type { HomeDayGroup, HomeTransaction } from '@ui/features/moni-home/components';

const FALLBACK_LEDGER: LedgerOption = {
  id: '日常开销',
  name: '日常开销',
};

const EMPTY_READ_MODEL: MoniHomeReadModel = {
  currentLedger: FALLBACK_LEDGER,
  availableLedgers: [FALLBACK_LEDGER],
  categoryDefinitions: [],
  dailyTransactionGroups: [],
  income: [],
  trendCard: {
    windowSize: 7,
    points: [],
    windowStart: null,
    windowEnd: null,
    hasEarlierWindow: false,
    hasLaterWindow: false,
    windowOffset: 0,
  },
  hintCards: [],
  budget: {
    enabled: false,
    status: 'none',
    card: null,
  },
  unclassifiedCount: 0,
  availableCategories: [],
  aiEngineUiState: {
    status: 'idle',
    activeLedger: FALLBACK_LEDGER.id,
    activeDate: null,
    activeDates: [],
    hasPendingInRange: false,
    hasPendingOutOfRange: false,
    pendingCount: 0,
    lastLearnedAt: null,
    lastLearningNotice: null,
  },
  extensions: {
    budget: {
      status: 'placeholder',
      owner: 'agent3',
      notes: '等待预算系统读模型补齐。',
    },
    manualEntry: {
      status: 'placeholder',
      owner: 'agent4',
      notes: '等待手记系统接口补齐。',
    },
    memory: {
      status: 'placeholder',
      owner: 'agent5',
      notes: '等待记忆系统学习状态补齐。',
    },
  },
  dataRange: {
    min: null,
    max: null,
  },
  homeDateRange: {
    start: null,
    end: null,
  },
  isLoading: true,
};

function toHomeTransaction(item: MoniHomeReadModel['dailyTransactionGroups'][number]['items'][number]): HomeTransaction {
  return {
    id: item.id,
    n: item.title,
    a: item.amount,
    t: item.time,
    pay: item.paymentMethod,
    sourceType: item.sourceType,
    sourceLabel: item.sourceLabel,
    userCat: item.userCategory,
    aiCat: item.aiCategory,
    reason: item.reasoning,
    userNote: item.userNote,
    remark: item.remark,
    direction: item.direction,
    isVerified: item.isVerified,
    ih: item.sequence,
  };
}

export interface MoniHomeData {
  days: Omit<HomeDayGroup, 'visibleItems'>[];
  income: MoniHomeReadModel['income'];
  trendCard: MoniHomeReadModel['trendCard'];
  currentLedger: LedgerOption;
  availableLedgers: LedgerOption[];
  categoryDefinitions: LedgerCategoryDefinition[];
  hintCards: HomeHintCardReadModel[];
  hasBudget: boolean;
  budgetCard: HomeBudgetCardReadModel | null;
  availableCategories: string[];
  ledgerId: string;
  isLoading: boolean;
  unclassifiedCount: number;
  aiEngineUiState: HomeAiEngineUiState;
  extensions: MoniHomeReadModel['extensions'];
  dataRange: MoniHomeReadModel['dataRange'];
  homeDateRange: MoniHomeReadModel['homeDateRange'];
  actions: {
    switchLedger: (ledgerId: string) => Promise<boolean>;
    updateCategory: (transactionId: string, category: string, reasoning?: string) => void;
    updateUserReasoning: (transactionId: string, note: string) => void;
    updateRemark: (transactionId: string, note: string) => void;
    setTransactionVerification: (transactionId: string, isVerified: boolean) => void;
    startAiProcessing: () => Promise<void>;
    stopAiProcessing: () => void;
    setHomeDateRange: (range: { start: Date | null; end: Date | null }) => void;
    setTrendWindowOffset: (offset: number) => void;
    refresh: () => Promise<void>;
  };
}

export function useMoniHomeData(): MoniHomeData {
  const [readModel, setReadModel] = useState<MoniHomeReadModel>(EMPTY_READ_MODEL);
  const [trendWindowOffset, setTrendWindowOffset] = useState(0);
  const [homeDateRange, setHomeDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const loadReadModel = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    try {
      const nextReadModel = await appFacade.getMoniHomeReadModel({
        trendWindowOffset,
        homeDateRange,
      });
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setReadModel(nextReadModel);
      });
    } catch (error) {
      console.error('[useMoniHomeData] Failed to load Moni home read model:', error);
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      startTransition(() => {
        setReadModel((previous) => ({
          ...previous,
          isLoading: false,
        }));
      });
    }
  }, [homeDateRange, trendWindowOffset]);

  useEffect(() => {
    mountedRef.current = true;

    void appFacade.init()
      .catch((error) => {
        console.error('[useMoniHomeData] AppFacade init failed:', error);
      })
      .finally(() => {
        void loadReadModel();
      });

    const unsubscribe = appFacade.subscribe(() => {
      void loadReadModel();
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
    // 初始化流程只应在挂载时跑一次；
    // 若依赖 loadReadModel，会因为 homeDateRange / trendWindowOffset 变化而反复重跑 init，触发更新环。
  }, []);

  useEffect(() => {
    void loadReadModel();
  }, [loadReadModel]);

  const days = useMemo(
    () =>
      readModel.dailyTransactionGroups.map((group) => ({
        id: group.id,
        label: group.label,
        items: group.items.map(toHomeTransaction),
      })),
    [readModel.dailyTransactionGroups]
  );

  const switchLedger = useCallback((ledgerId: string) => appFacade.switchLedger(ledgerId), []);
  const updateCategory = useCallback((transactionId: string, category: string, reasoning?: string) => {
    appFacade.updateTransactionCategory(transactionId, category, reasoning);
  }, []);
  const updateUserReasoning = useCallback((transactionId: string, note: string) => {
    appFacade.updateUserReasoning(transactionId, note);
  }, []);
  const updateRemark = useCallback((transactionId: string, note: string) => {
    appFacade.updateTransactionRemark(transactionId, note);
  }, []);
  const setTransactionVerification = useCallback((transactionId: string, isVerified: boolean) => {
    appFacade.setTransactionVerification(transactionId, isVerified);
  }, []);
  const startAiProcessing = useCallback(() => appFacade.startAiProcessing(), []);
  const stopAiProcessing = useCallback(() => {
    appFacade.stopAiProcessing();
  }, []);
  const updateHomeDateRange = useCallback((range: { start: Date | null; end: Date | null }) => {
    const currentStart = homeDateRange.start?.getTime() ?? null;
    const currentEnd = homeDateRange.end?.getTime() ?? null;
    const nextStart = range.start?.getTime() ?? null;
    const nextEnd = range.end?.getTime() ?? null;
    if (currentStart === nextStart && currentEnd === nextEnd) {
      return;
    }
    appFacade.setDateRange(range);
    setHomeDateRange(range);
  }, [homeDateRange.end, homeDateRange.start]);
  const updateTrendWindowOffset = useCallback((offset: number) => {
    setTrendWindowOffset((previous) => (previous === offset ? previous : offset));
  }, []);

  const actions = useMemo(
    () => ({
      switchLedger,
      updateCategory,
      updateUserReasoning,
      updateRemark,
      setTransactionVerification,
      startAiProcessing,
      stopAiProcessing,
      setHomeDateRange: updateHomeDateRange,
      setTrendWindowOffset: updateTrendWindowOffset,
      refresh: loadReadModel,
    }),
    [
      loadReadModel,
      setTransactionVerification,
      startAiProcessing,
      stopAiProcessing,
      switchLedger,
      updateCategory,
      updateRemark,
      updateHomeDateRange,
      updateTrendWindowOffset,
      updateUserReasoning,
    ]
  );

  return {
    days,
    income: readModel.income,
    trendCard: readModel.trendCard,
    currentLedger: readModel.currentLedger,
    availableLedgers: readModel.availableLedgers,
    categoryDefinitions: readModel.categoryDefinitions,
    hintCards: readModel.hintCards,
    hasBudget: readModel.budget.enabled,
    budgetCard: readModel.budget.card,
    availableCategories: readModel.availableCategories,
    ledgerId: readModel.currentLedger.id,
    isLoading: readModel.isLoading,
    unclassifiedCount: readModel.unclassifiedCount,
    aiEngineUiState: readModel.aiEngineUiState,
    extensions: readModel.extensions,
    dataRange: readModel.dataRange,
    homeDateRange: readModel.homeDateRange,
    actions,
  };
}
