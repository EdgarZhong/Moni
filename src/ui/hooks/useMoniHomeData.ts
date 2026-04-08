import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { appFacade } from '@bootstrap/appFacade';
import type {
  HomeAiEngineUiState,
  HomeBudgetCardReadModel,
  HomeHintCardReadModel,
  LedgerCategoryDefinition,
  LedgerOption,
  MoniHomeReadModel,
} from '@shared/types';
import type { HomeDayGroup, HomeTransaction, TrendPoint } from '@ui/features/moni-home/components';

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
  trend: [],
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
  isLoading: true,
};

function toHomeTransaction(item: MoniHomeReadModel['dailyTransactionGroups'][number]['items'][number]): HomeTransaction {
  return {
    id: item.id,
    n: item.title,
    a: item.amount,
    t: item.time,
    pay: item.paymentMethod,
    userCat: item.userCategory,
    aiCat: item.aiCategory,
    reason: item.reasoning,
    ih: item.sequence,
  };
}

export interface MoniHomeData {
  days: Omit<HomeDayGroup, 'visibleItems'>[];
  income: MoniHomeReadModel['income'];
  trend: TrendPoint[];
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
  actions: {
    switchLedger: (ledgerId: string) => Promise<boolean>;
    updateCategory: (transactionId: string, category: string, reasoning?: string) => void;
    startAiProcessing: () => Promise<void>;
    stopAiProcessing: () => void;
    refresh: () => Promise<void>;
  };
}

export function useMoniHomeData(): MoniHomeData {
  const [readModel, setReadModel] = useState<MoniHomeReadModel>(EMPTY_READ_MODEL);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const loadReadModel = async () => {
    const requestId = ++requestIdRef.current;

    try {
      const nextReadModel = await appFacade.getMoniHomeReadModel();
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
  };

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
  }, []);

  const days = useMemo(
    () =>
      readModel.dailyTransactionGroups.map((group) => ({
        id: group.id,
        label: group.label,
        items: group.items.map(toHomeTransaction),
      })),
    [readModel.dailyTransactionGroups]
  );

  return {
    days,
    income: readModel.income,
    trend: readModel.trend,
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
    actions: {
      switchLedger: (ledgerId: string) => appFacade.switchLedger(ledgerId),
      updateCategory: (transactionId: string, category: string, reasoning?: string) => {
        appFacade.updateTransactionCategory(transactionId, category, reasoning);
      },
      startAiProcessing: () => appFacade.startAiProcessing(),
      stopAiProcessing: () => {
        appFacade.stopAiProcessing();
      },
      refresh: loadReadModel,
    },
  };
}
