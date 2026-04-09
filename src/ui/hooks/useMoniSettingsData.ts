import { useCallback, useEffect, useRef, useState } from 'react';
import { appFacade } from '@bootstrap/appFacade';
import type {
  SettingsAiConfig,
  SettingsExampleLibrarySummary,
  SettingsLearningConfig,
  SettingsLedgerItem,
  SettingsSnapshotItem,
  SettingsLedgerTransaction,
  SettingsTagItem,
} from '@shared/types';

// ──────────────────────────────────────────────
// Fallback / initial values
// ──────────────────────────────────────────────

const EMPTY_AI_CONFIG: SettingsAiConfig = {
  provider: 'deepseek',
  hasApiKey: false,
  baseUrl: 'https://api.deepseek.com',
  candidateModels: [],
  activeModel: '',
  maxTokens: 4096,
  temperature: 0.3,
  enableThinking: false,
};

const EMPTY_LEARNING: SettingsLearningConfig = {
  autoLearn: true,
  learningThreshold: 5,
  compressionThreshold: 30,
};

const EMPTY_EXAMPLE_SUMMARY: SettingsExampleLibrarySummary = { delta: 0, total: 0 };

// ──────────────────────────────────────────────
// Public hook interface
// ──────────────────────────────────────────────

export interface MoniSettingsData {
  // AI configuration
  aiConfig: SettingsAiConfig;
  // Self description
  selfDescription: string;
  // Ledger management
  ledgers: SettingsLedgerItem[];
  activeLedgerId: string;
  // Tag management
  tags: SettingsTagItem[];
  // AI Memory
  memoryItems: string[];
  snapshots: SettingsSnapshotItem[];
  exampleLibrarySummary: SettingsExampleLibrarySummary;
  // Learning settings
  learningConfig: SettingsLearningConfig;
  // Budget
  monthlyBudget: number;
  categoryBudgets: Record<string, number>;
  // Ledger transactions (for reclassification scope)
  ledgerTransactions: SettingsLedgerTransaction[];
  // Loading
  isLoading: boolean;
  // Actions
  actions: {
    // AI Config
    updateProvider: (provider: string) => Promise<void>;
    updateApiKey: (provider: string, key: string) => Promise<void>;
    updateBaseUrl: (url: string) => Promise<void>;
    updateActiveModel: (model: string) => Promise<void>;
    updateMaxTokens: (value: number) => Promise<void>;
    updateTemperature: (value: number) => Promise<void>;
    updateEnableThinking: (enabled: boolean) => Promise<void>;
    testConnection: () => Promise<boolean>;
    // Self description
    saveSelfDescription: (text: string) => Promise<void>;
    // Ledger management
    createLedger: (name: string) => Promise<boolean>;
    switchLedger: (id: string) => Promise<boolean>;
    renameLedger: (id: string, newName: string) => Promise<boolean>;
    deleteLedger: (id: string) => Promise<boolean>;
    // Tag management
    createTag: (name: string, desc: string) => Promise<void>;
    renameTag: (oldKey: string, newKey: string) => Promise<void>;
    updateTagDescription: (key: string, desc: string) => Promise<void>;
    deleteTag: (key: string) => Promise<void>;
    // AI Memory
    updateMemoryItems: (items: string[]) => Promise<void>;
    triggerImmediateLearning: () => Promise<boolean>;
    rollbackMemorySnapshot: (snapshotId: string) => Promise<boolean>;
    deleteMemorySnapshot: (snapshotId: string) => Promise<boolean>;
    // Learning settings
    updateLearningThreshold: (value: number) => Promise<void>;
    toggleAutoLearn: (enabled: boolean) => Promise<void>;
    updateCompressionThreshold: (value: number) => Promise<void>;
    // Budget
    updateMonthlyBudget: (amount: number) => Promise<void>;
    updateCategoryBudget: (tag: string, amount: number) => Promise<void>;
    // Reclassification
    triggerFullReclassification: () => Promise<void>;
    // Refresh
    refresh: () => void;
  };
}

export function useMoniSettingsData(): MoniSettingsData {
  const [aiConfig, setAiConfig] = useState<SettingsAiConfig>(EMPTY_AI_CONFIG);
  const [selfDescription, setSelfDescription] = useState('');
  const [ledgers, setLedgers] = useState<SettingsLedgerItem[]>([]);
  const [activeLedgerId, setActiveLedgerId] = useState('');
  const [tags, setTags] = useState<SettingsTagItem[]>([]);
  const [memoryItems, setMemoryItems] = useState<string[]>([]);
  const [snapshots, setSnapshots] = useState<SettingsSnapshotItem[]>([]);
  const [exampleLibrarySummary, setExampleLibrarySummary] = useState<SettingsExampleLibrarySummary>(EMPTY_EXAMPLE_SUMMARY);
  const [learningConfig, setLearningConfig] = useState<SettingsLearningConfig>(EMPTY_LEARNING);
  const [monthlyBudget, setMonthlyBudget] = useState(0);
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, number>>({});
  const [ledgerTransactions, setLedgerTransactions] = useState<SettingsLedgerTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const model = await appFacade.getSettingsPageReadModel();
      if (!mountedRef.current) return;
      setAiConfig(model.aiConfig);
      setSelfDescription(model.selfDescription);
      setLedgers(model.ledgers);
      setActiveLedgerId(model.activeLedgerId);
      setTags(model.tags);
      setMemoryItems(model.memoryItems);
      setSnapshots(model.snapshots);
      setExampleLibrarySummary(model.exampleLibrarySummary);
      setLearningConfig(model.learningConfig);
      setMonthlyBudget(model.budgetConfig.monthlyTotal);
      setCategoryBudgets(model.budgetConfig.categoryBudgets);
      setLedgerTransactions(model.ledgerTransactions);
      setIsLoading(false);
    } catch (err) {
      console.error('[useMoniSettingsData] load failed:', err);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const unsubscribe = appFacade.subscribe(() => void load());
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [load]);

  // AI Config actions
  const updateProvider = useCallback(async (provider: string) => {
    await appFacade.updateProvider(provider);
  }, []);
  const updateApiKey = useCallback(async (provider: string, key: string) => {
    await appFacade.updateApiKey(provider, key);
  }, []);
  const updateBaseUrl = useCallback(async (url: string) => {
    await appFacade.updateBaseUrl(url);
  }, []);
  const updateActiveModel = useCallback(async (model: string) => {
    await appFacade.updateActiveModel(model);
  }, []);
  const updateMaxTokens = useCallback(async (value: number) => {
    await appFacade.updateMaxTokens(value);
  }, []);
  const updateTemperature = useCallback(async (value: number) => {
    await appFacade.updateTemperature(value);
  }, []);
  const updateEnableThinking = useCallback(async (enabled: boolean) => {
    await appFacade.updateEnableThinking(enabled);
  }, []);
  const testConnection = useCallback(async (): Promise<boolean> => {
    return appFacade.testConnection();
  }, []);

  // Self description
  const saveSelfDescription = useCallback(async (text: string) => {
    await appFacade.saveSelfDescription(text);
  }, []);

  // Ledger management
  const createLedger = useCallback(async (name: string): Promise<boolean> => {
    const created = await appFacade.createLedger(name);
    if (created) {
      await load();
    }
    return created;
  }, [load]);
  const switchLedger = useCallback(async (id: string) => {
    const switched = await appFacade.switchLedger(id);
    if (switched) {
      await load();
    }
    return switched;
  }, [load]);
  const renameLedger = useCallback(async (id: string, newName: string): Promise<boolean> => {
    const renamed = await appFacade.renameLedger(id, newName);
    if (renamed) {
      await load();
    }
    return renamed;
  }, [load]);
  const deleteLedger = useCallback(async (id: string): Promise<boolean> => {
    const deleted = await appFacade.deleteLedger(id);
    if (deleted) {
      await load();
    }
    return deleted;
  }, [load]);

  // Tag management
  const createTag = useCallback(async (name: string, desc: string) => {
    await appFacade.createTag(name, desc);
    await load();
  }, [load]);
  const renameTag = useCallback(async (oldKey: string, newKey: string) => {
    await appFacade.renameTag(oldKey, newKey);
    await load();
  }, [load]);
  const updateTagDescription = useCallback(async (key: string, desc: string) => {
    await appFacade.updateTagDescription(key, desc);
    await load();
  }, [load]);
  const deleteTag = useCallback(async (key: string) => {
    await appFacade.deleteTag(key);
    await load();
  }, [load]);

  // AI Memory
  const updateMemoryItems = useCallback(async (items: string[]) => {
    await appFacade.updateMemoryItems(items);
  }, []);
  const triggerImmediateLearning = useCallback(async (): Promise<boolean> => {
    return appFacade.triggerImmediateLearning();
  }, []);
  const rollbackMemorySnapshot = useCallback(async (snapshotId: string): Promise<boolean> => {
    const rolled = await appFacade.rollbackMemorySnapshot(snapshotId);
    if (rolled) {
      await load();
    }
    return rolled;
  }, [load]);
  const deleteMemorySnapshot = useCallback(async (snapshotId: string): Promise<boolean> => {
    const deleted = await appFacade.deleteMemorySnapshot(snapshotId);
    if (deleted) {
      await load();
    }
    return deleted;
  }, [load]);

  // Learning settings
  const updateLearningThreshold = useCallback(async (value: number) => {
    await appFacade.updateLearningThreshold(value);
  }, []);
  const toggleAutoLearn = useCallback(async (enabled: boolean) => {
    await appFacade.toggleAutoLearn(enabled);
  }, []);
  const updateCompressionThreshold = useCallback(async (value: number) => {
    await appFacade.updateCompressionThreshold(value);
  }, []);

  // Budget
  const updateMonthlyBudget = useCallback(async (amount: number) => {
    await appFacade.updateMonthlyBudget(amount);
  }, []);
  const updateCategoryBudget = useCallback(async (tag: string, amount: number) => {
    await appFacade.updateCategoryBudget(tag, amount);
  }, []);

  // Reclassification
  const triggerFullReclassification = useCallback(async () => {
    await appFacade.triggerFullReclassification();
  }, []);

  return {
    aiConfig,
    selfDescription,
    ledgers,
    activeLedgerId,
    tags,
    memoryItems,
    snapshots,
    exampleLibrarySummary,
    learningConfig,
    monthlyBudget,
    categoryBudgets,
    ledgerTransactions,
    isLoading,
    actions: {
      updateProvider,
      updateApiKey,
      updateBaseUrl,
      updateActiveModel,
      updateMaxTokens,
      updateTemperature,
      updateEnableThinking,
      testConnection,
      saveSelfDescription,
      createLedger,
      switchLedger,
      renameLedger,
      deleteLedger,
      createTag,
      renameTag,
      updateTagDescription,
      deleteTag,
      updateMemoryItems,
      triggerImmediateLearning,
      rollbackMemorySnapshot,
      deleteMemorySnapshot,
      updateLearningThreshold,
      toggleAutoLearn,
      updateCompressionThreshold,
      updateMonthlyBudget,
      updateCategoryBudget,
      triggerFullReclassification,
      refresh: load,
    },
  };
}
