import { useCallback, useEffect, useRef, useState } from 'react';
import { appFacade } from '@bootstrap/appFacade';
import type { LedgerOption } from '@shared/types';

const FALLBACK: LedgerOption = { id: '日常开销', name: '日常开销' };

/**
 * 在 AppRoot 层常驻的账本控制 hook。
 * 放在根层而非各页面，保证 currentLedger 跨页面切换时从不 reset 到 FALLBACK，
 * 彻底消除左上角账本名切页闪烁。
 */
export function useLedgerControl() {
  const [currentLedger, setCurrentLedger] = useState<LedgerOption>(() => {
    try {
      const id = appFacade.getLedgerState().currentLedgerId;
      return id ? { id, name: id } : FALLBACK;
    } catch {
      return FALLBACK;
    }
  });
  const [availableLedgers, setAvailableLedgers] = useState<LedgerOption[]>([FALLBACK]);
  const mountedRef = useRef(true);

  const reload = useCallback(async () => {
    try {
      const ledgers = await appFacade.listLedgerOptions({ syncWithFiles: false });
      const currentId = appFacade.getLedgerState().currentLedgerId;
      if (!mountedRef.current) return;
      const list = ledgers.length > 0 ? ledgers : [FALLBACK];
      const active = list.find((l) => l.id === currentId)
        ?? (currentId ? { id: currentId, name: currentId } : FALLBACK);
      setAvailableLedgers(list);
      setCurrentLedger(active);
    } catch {
      // 保持上一次已知状态，不闪回 FALLBACK
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void appFacade.init()
      .catch((err) => console.error('[useLedgerControl] init error:', err))
      .finally(() => { void reload(); });

    const unsubscribe = appFacade.subscribe(() => { void reload(); });
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [reload]);

  const switchLedger = useCallback((id: string) => appFacade.switchLedger(id), []);

  return { currentLedger, availableLedgers, switchLedger };
}
