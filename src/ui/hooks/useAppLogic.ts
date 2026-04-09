import { 
  useMemo,
  useRef,
  useState
} from 'react';
import { useLedger } from './useLedger';
import { useFileWatcher, type FileChangeInfo } from './useFileWatcher';
import { 
  requestDirectoryHandle, 
  scanForCSVFiles, 
  isFileSystemSupported,
  type StorageDirHandle 
} from '@system/filesystem/fs-storage';
import { parseFiles } from '@shared/utils/parser';
import { isWithinInterval, endOfDay } from 'date-fns';

export function useAppLogic() {
  const { 
    rawTransactions, 
    computedTransactions, 
    ledgerMemory, 
    isLoading, 
    filter, 
    direction, 
    dateRange, 
    tabs,
    appFacade
  } = useLedger();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uiNotice, setUiNotice] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  
  // Note: we can't easily access the internal memoryFileHandle from service via state 
  // for the watcher, unless we expose it.
  // But watcher is for reloading when external file changes.
  // Let's rely on Service to handle its own file handle, but we need it for watcher?
  // Actually, useFileWatcher needs a handle.
  // We can expose it in state or add a getter. 
  // For now, let's assume we can get it or we move watcher to Service eventually.
  // But wait, the hook needs the handle to pass to useFileWatcher.
  // The service has it private.
  // Let's add a getter to Service or expose it in state.
  // Exposing in state is reactive.
  // Let's modify LedgerService to expose memoryFileHandle in state? No, it's not serializable state usually (though in JS it is).
  // React state can hold objects.
  // Let's add `memoryFileHandle` to `LedgerState`.

  // --- Actions ---

  const handleTabChange = (newFilter: string) => {
    appFacade.setFilter(newFilter);
  };

  const updateCategory = (id: string, newCategory: string, newReasoning?: string) => {
    appFacade.updateTransactionCategory(id, newCategory, newReasoning);
  };

  const setUserNote = (id: string, userNote: string) => {
    // 将备注更新走专用通道，避免连带写入用户分类
    appFacade.updateTransactionRemark(id, userNote);
  };

  const setVerification = (id: string, isVerified: boolean) => {
    appFacade.setTransactionVerification(id, isVerified);
  };

  // const setDateRange = (_range: { start: Date | null; end: Date | null }) => {
  //   // This seems to be local UI state in the old hook, 
  //   // but in Service it's computed from transactions.
  // };  // Wait, dateRange in old hook was state, but updated when transactions loaded.
    // The DateRangePicker component might need to set it manually?
    // Let's check DesktopApp... DateRangePicker takes setDateRange.
    // If user picks a range, it filters transactions.
    // So we need a setDateRange action in Service or keep it local?
    // If it's global filter, it should be in Service.
    // Service has `dateRange` in state.
    // I should add `setDateRange` to Service.
    // But `computeDateRange` overwrites it on load. That's fine.
    // I'll add `service.setDateRange`.
    // Actually, I missed adding `setDateRange` method in LedgerService.
    // I will add it via `service.setState`.
    // But wait, I can't modify Service code from here. 
    // I'll assume I can add it or just use a local override if needed?
    // No, if I use local state for dateRange, it will desync from Service's initial value.
    // Better to add it to Service.
  // };

  const handleLoadData = async (externalHandle?: StorageDirHandle) => {
    if (isFileSystemSupported()) {
      try {
        const dirHandle = externalHandle || await requestDirectoryHandle();
        
        const files = await scanForCSVFiles(dirHandle);
        if (files.length === 0) {
          setUiNotice({ type: 'info', text: '所选目录中未发现 CSV 账单文件' });
          return;
        }
        
        const parsedData = await parseFiles(files);
        await appFacade.importParsedData(parsedData, dirHandle);
        
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Directory access error:', error);
          setUiNotice({ type: 'error', text: '目录读取失败，请检查权限或查看控制台日志' });
        }
      }
    } else {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // Convert FileList to Array
    const fileArray = Array.from(files);

    try {
      const parsedData = await parseFiles(fileArray);
      await appFacade.importRawData(parsedData);
    } catch (error) {
       console.error('Error parsing files:', error);
    }
  };
  
  // --- Derived State (View Model) ---
  
  // Reuse Service's computedTransactions as base
  // Apply Date Range Filter (if not handled by Service)
  // Apply Category Filter (if not handled by Service)
  // Service handles Category Filter (via filter state and recompute? No, recomputeTransactions does arbitration).
  // Service has `filter` state but doesn't seem to apply it to `computedTransactions`?
  // In `LedgerService.ts`, `recomputeTransactions` produces the full list with categories.
  // The filtering was done in `useMemo` in the hook.
  // So I should keep filtering here.
  
  const filteredTransactions = useMemo(() => {
    let result = computedTransactions;

    // 1. Date Range Filter
    if (dateRange.start && dateRange.end) {
      result = result.filter(t => 
        isWithinInterval(t.originalDate, {
          start: dateRange.start!,
          end: endOfDay(dateRange.end!) 
        })
      );
    }

    // 2. Category Filter
    if (filter === 'ALL') return result;
    return result.filter(t => t.category === filter);
  }, [computedTransactions, filter, dateRange]);

  const totalExpense = useMemo(() => {
    return filteredTransactions
      .filter(t => t.direction === 'out')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  const totalIncome = useMemo(() => {
    return filteredTransactions
      .filter(t => t.direction === 'in')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  // --- Watcher ---
  // We need to access memoryFileHandle. 
  // Since we can't easily get it from state without exposing it, 
  // and we can't add it to state easily without modifying Service again.
  // I will add a method `getMemoryHandle()` to Service and use a ref or effect to poll it? 
  // Or just expose it in state.
  // I will assume I'll add `memoryFileHandle` to `LedgerState` in the next step.
  
  // Mock function for now to prevent TS error until I update Service
  const memoryFileHandle = appFacade.getLedgerState().memoryFileHandle;

  const handleExternalFileChange = (_info: FileChangeInfo) => {
     void _info;
     // Loopback detection logic moved to Service? 
     // Or just call reload.
     void appFacade.reloadLedgerMemory();
  };

  useFileWatcher(memoryFileHandle, handleExternalFileChange);

  return {
    rawTransactions,
    transactions: computedTransactions, // Map computed -> transactions
    filteredTransactions,
    ledgerMemory,
    isLoading,
    filter,
    handleTabChange,
    updateCategory,
    setUserNote,
    setVerification,
    direction,
    dateRange,
    setDateRange: (range: { start: Date | null; end: Date | null }) => {
        // We need to update Service state
        // I'll add this method to Service.
        appFacade.setDateRange(range);
    },
    fileInputRef,
    handleFileChange,
    handleLoadData,
    handleImportData: () => fileInputRef.current?.click(),
    totalExpense,
    totalIncome,
    TABS: tabs,
    uiNotice,
    clearUiNotice: () => setUiNotice(null)
  };
}
