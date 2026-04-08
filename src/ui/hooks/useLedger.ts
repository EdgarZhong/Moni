import { useSyncExternalStore } from 'react';
import { LedgerService } from '@logic/application/services/LedgerService';

export function useLedger() {
  const service = LedgerService.getInstance();

  const state = useSyncExternalStore(
    (callback) => service.subscribe(callback),
    () => service.getState()
  );

  return {
    ...state,
    service // Expose service for actions
  };
}
