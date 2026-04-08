import { useEffect, useState } from 'react';
import { isNativePlatform } from '@system/filesystem/fs-storage';

interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Hook to detect and manage SafeArea insets for notches, dynamic island, and gesture bars
 * Adapts the UI layout to avoid system UI elements on modern mobile devices
 */
export function useSafeArea() {
  const [safeArea, setSafeArea] = useState<SafeAreaInsets>({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0
  });

  useEffect(() => {
    const detectSafeArea = async () => {
      try {
        const isWeb = !isNativePlatform();
        
        // For web, use CSS env() variables for safe area
        if (isWeb) {
          // These are set automatically by the browser for notch-aware devices
          const top = getCSSVariableValue('safe-area-inset-top');
          const bottom = getCSSVariableValue('safe-area-inset-bottom');
          const left = getCSSVariableValue('safe-area-inset-left');
          const right = getCSSVariableValue('safe-area-inset-right');

          setSafeArea({ top, bottom, left, right });
        } else {
          // For Android native apps, apply default insets based on device characteristics
          // The actual safe area will be handled by Capacitor's native layer
          setSafeArea({
            top: 0,
            bottom: 0,
            left: 0,
            right: 0
          });
        }
      } catch (error) {
        console.warn('Failed to detect safe area:', error);
        // Fallback to safe defaults
        setSafeArea({
          top: 0,
          bottom: 0,
          left: 0,
          right: 0
        });
      }
    };

    detectSafeArea();
  }, []);

  return safeArea;
}

/**
 * Parse CSS environment variable value to number
 * safe-area-inset-* returns values like "10px" or "0px"
 */
function getCSSVariableValue(varName: string): number {
  try {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(`--${varName.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
    
    // Try using CSS env() variable
    const envValue = window.getComputedStyle(document.documentElement)
      .getPropertyValue(varName);
    
    if (envValue) {
      return parseInt(envValue) || 0;
    }
    
    if (value) {
      return parseInt(value) || 0;
    }
    
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Injects safe area CSS variables into the document root
 * Call this in App.tsx to enable viewport adaptation
 */
export function injectSafeAreaCSS(insets: SafeAreaInsets) {
  const root = document.documentElement;
  root.style.setProperty('--safe-area-top', `${insets.top}px`);
  root.style.setProperty('--safe-area-bottom', `${insets.bottom}px`);
  root.style.setProperty('--safe-area-left', `${insets.left}px`);
  root.style.setProperty('--safe-area-right', `${insets.right}px`);
}
