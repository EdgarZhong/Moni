import { Capacitor } from '@capacitor/core';

export type RuntimeKind = 'capacitor-native' | 'capacitor-web' | 'browser-web' | 'electron';

export interface RuntimeInfo {
  kind: RuntimeKind;
  platform: string;
  isNative: boolean;
  hasFilesystemPlugin: boolean;
  hasHapticsPlugin: boolean;
  supportsVibration: boolean;
  supportsDirectoryPicker: boolean;
}

function hasWindowCapacitor(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return typeof (window as Window & { Capacitor?: unknown }).Capacitor !== 'undefined';
}

function isPluginAvailable(name: string): boolean {
  return typeof Capacitor.isPluginAvailable === 'function' && Capacitor.isPluginAvailable(name);
}

export function getRuntimeInfo(): RuntimeInfo {
  const isNative = Capacitor.isNativePlatform();
  const platform = typeof Capacitor.getPlatform === 'function' ? Capacitor.getPlatform() : 'web';
  const hasFilesystemPlugin = isPluginAvailable('Filesystem');
  const hasHapticsPlugin = isPluginAvailable('Haptics');
  const supportsVibration =
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const supportsDirectoryPicker =
    typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  let kind: RuntimeKind = 'browser-web';

  if (isNative) {
    kind = 'capacitor-native';
  } else if (typeof window !== 'undefined' && (window as Window & { electron?: unknown }).electron) {
    kind = 'electron';
  } else if (hasWindowCapacitor() || hasFilesystemPlugin || hasHapticsPlugin) {
    kind = 'capacitor-web';
  }

  return {
    kind,
    platform,
    isNative,
    hasFilesystemPlugin,
    hasHapticsPlugin,
    supportsVibration,
    supportsDirectoryPicker
  };
}
