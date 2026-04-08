import { useSyncExternalStore } from 'react';
import { appFacade } from '@bootstrap/appFacade';

export function useLedger() {
  const state = useSyncExternalStore(
    (callback) => appFacade.subscribe(callback),
    () => appFacade.getLedgerState()
  );

  return {
    ...state,
    appFacade
  };
}
