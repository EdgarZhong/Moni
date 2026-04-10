// Mock Capacitor Haptics Plugin
export const ImpactStyle = {
  Heavy: 'HEAVY',
  Medium: 'MEDIUM',
  Light: 'LIGHT'
} as const;

export const NotificationType = {
  Success: 'SUCCESS',
  Warning: 'WARNING',
  Error: 'ERROR'
} as const;

export const Haptics = {
  impact: async (options: { style: string }) => {
    console.log('[MockHaptics] impact style:', options.style);
  },
  notification: async (options: { type: string }) => {
    console.log('[MockHaptics] notification type:', options.type);
  },
  vibrate: async (options: { duration: number }) => {
    console.log('[MockHaptics] vibrate duration:', options.duration);
  },
  selectionStart: async () => {
    console.log('[MockHaptics] selectionStart');
  },
  selectionChanged: async () => {
    console.log('[MockHaptics] selectionChanged');
  },
  selectionEnd: async () => {
    console.log('[MockHaptics] selectionEnd');
  }
};
