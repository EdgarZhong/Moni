import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.moni.app',
  appName: 'Moni',
  webDir: 'dist',
  plugins: {
    Keyboard: {
      resize: 'none',
    },
    SplashScreen: {
      // 关闭自动隐藏，改由 JS 在 React 首帧后主动控制
      launchAutoHide: false,
      // 与 icon 背景色保持一致（icon 为 #222）
      backgroundColor: '#222222',
      showSpinner: false,
      // 最长兜底：超过 3s 还没收到 hide 指令时自动隐藏，防止永久卡在 Splash
      launchFadeOutDuration: 200,
    },
  },
};

export default config;