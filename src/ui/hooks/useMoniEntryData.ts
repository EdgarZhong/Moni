import { useCallback, useEffect, useRef, useState } from 'react';
import { appFacade } from '@bootstrap/appFacade';
import type {
  EntryPageReadModel,
  EntryRecentReference,
  LedgerCategoryDefinition,
  LedgerOption,
} from '@shared/types';
import type { ManualEntryInput } from '@logic/application/services/ManualEntryManager';

const FALLBACK_LEDGER: LedgerOption = {
  id: '日常开销',
  name: '日常开销',
};

const EMPTY_READ_MODEL: EntryPageReadModel = {
  currentLedger: FALLBACK_LEDGER,
  availableLedgers: [FALLBACK_LEDGER],
  categoryDefinitions: [],
  recentReferences: [],
  isLoading: true,
};

export interface MoniEntryData {
  currentLedger: LedgerOption;
  availableLedgers: LedgerOption[];
  categoryDefinitions: LedgerCategoryDefinition[];
  recentReferences: EntryRecentReference[];
  isLoading: boolean;
  actions: {
    addEntry: (input: ManualEntryInput) => Promise<string>;
    switchLedger: (ledgerId: string) => Promise<boolean>;
    refresh: () => void;
  };
}

export function useMoniEntryData(): MoniEntryData {
  const [readModel, setReadModel] = useState<EntryPageReadModel>(EMPTY_READ_MODEL);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestIdRef.current;
    try {
      const model = await appFacade.getEntryPageReadModel();
      if (mountedRef.current && id === requestIdRef.current) {
        setReadModel(model);
      }
    } catch (err) {
      console.error('[useMoniEntryData] Failed to load:', err);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const unsubscribe = appFacade.subscribe(() => {
      void load();
    });
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [load]);

  const addEntry = useCallback(async (input: ManualEntryInput): Promise<string> => {
    const id = await appFacade.addManualEntry(input);
    return id;
  }, []);

  const switchLedger = useCallback(async (ledgerId: string): Promise<boolean> => {
    return appFacade.switchLedger(ledgerId);
  }, []);

  return {
    currentLedger: readModel.currentLedger,
    availableLedgers: readModel.availableLedgers,
    categoryDefinitions: readModel.categoryDefinitions,
    recentReferences: readModel.recentReferences,
    isLoading: readModel.isLoading,
    actions: {
      addEntry,
      switchLedger,
      refresh: load,
    },
  };
}
