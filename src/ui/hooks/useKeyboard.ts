import { useEffect, useState } from 'react';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import type { KeyboardListenerHandle } from '@capacitor/keyboard';

/**
 * Hook to detect if the software keyboard is visible.
 * In Capacitor, uses the Keyboard plugin.
 * In browser, falls back to monitoring visualViewport height.
 */
export function useKeyboard() {
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      /**
       * Android 真机上 `will` 事件可能略早于布局变化，`did` 事件又可能更稳定。
       * 这里两组都监听，并把状态收口到同一布尔值，避免出现“键盘已弹出但底部导航还没隐藏”的时序抖动。
       */
      const showListener = Keyboard.addListener('keyboardWillShow', () => {
        setKeyboardVisible(true);
      });
      const didShowListener = Keyboard.addListener('keyboardDidShow', () => {
        setKeyboardVisible(true);
      });
      const hideListener = Keyboard.addListener('keyboardWillHide', () => {
        setKeyboardVisible(false);
      });
      const didHideListener = Keyboard.addListener('keyboardDidHide', () => {
        setKeyboardVisible(false);
      });

      return () => {
        void showListener.then((listener: KeyboardListenerHandle) => listener.remove());
        void didShowListener.then((listener: KeyboardListenerHandle) => listener.remove());
        void hideListener.then((listener: KeyboardListenerHandle) => listener.remove());
        void didHideListener.then((listener: KeyboardListenerHandle) => listener.remove());
      };
    } else {
      // Browser fallback
      const visualViewport = window.visualViewport;
      if (!visualViewport) return;

      const handleResize = () => {
        const isVisible = visualViewport.height < window.innerHeight * 0.85;
        setKeyboardVisible(isVisible);
      };

      visualViewport.addEventListener('resize', handleResize);
      handleResize();

      return () => {
        visualViewport.removeEventListener('resize', handleResize);
      };
    }
  }, []);

  return { isKeyboardVisible };
}
