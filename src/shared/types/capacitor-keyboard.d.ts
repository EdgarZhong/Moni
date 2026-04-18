declare module '@capacitor/keyboard' {
  /**
   * 仅为当前 Web/Capacitor 混合开发态补足最小类型声明。
   * 项目实际只依赖 addListener + remove 这条最小能力链路，
   * 因此不在这里铺满完整插件 API，避免声明与上游版本再次漂移。
   */
  export interface KeyboardListenerHandle {
    remove(): Promise<void>;
  }

  export interface KeyboardPlugin {
    addListener(
      eventName: 'keyboardWillShow' | 'keyboardDidShow' | 'keyboardWillHide' | 'keyboardDidHide',
      listenerFunc: () => void
    ): Promise<KeyboardListenerHandle>;
  }

  export const Keyboard: KeyboardPlugin;
}
