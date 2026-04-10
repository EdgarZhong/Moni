import { useEffect, useState } from 'react';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

/**
 * Hook to detect if the software keyboard is visible.
 * In Capacitor, uses the Keyboard plugin.
 * In browser, falls back to monitoring visualViewport height.
 */
export function useKeyboard() {
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const showListener = Keyboard.addListener('keyboardWillShow', () => {
        setKeyboardVisible(true);
      });
      const hideListener = Keyboard.addListener('keyboardWillHide', () => {
        setKeyboardVisible(false);
      });

      return () => {
        void showListener.then((l) => l.remove());
        void hideListener.then((l) => l.remove());
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
