// Mock Capacitor Keyboard Plugin
export const Keyboard = {
  addListener: (eventName: string, _callback: () => void) => {
    console.log(`[MockKeyboard] addListener: ${eventName}`);
    return Promise.resolve({
      remove: async () => {
        console.log(`[MockKeyboard] remove listener for: ${eventName}`);
      }
    });
  },
  removeAllListeners: async () => {
    console.log('[MockKeyboard] removeAllListeners');
  },
  show: async () => {
    console.log('[MockKeyboard] show');
  },
  hide: async () => {
    console.log('[MockKeyboard] hide');
  },
  setAccessoryBarVisible: async (options: { isVisible: boolean }) => {
    console.log('[MockKeyboard] setAccessoryBarVisible:', options.isVisible);
  },
  setScroll: async (options: { isDisabled: boolean }) => {
    console.log('[MockKeyboard] setScroll:', options.isDisabled);
  }
};
