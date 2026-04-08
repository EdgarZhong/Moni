// Mock Capacitor Core
export const Capacitor = {
  isNativePlatform: () => false,
  getPlatform: () => 'web',
  isPluginAvailable: (name: string) => ['Filesystem', 'Haptics'].includes(name),
  pluginMethodNoop: () => {}
};
// Mock WebPlugin (空实现)
export class WebPlugin {
  constructor() {}
}

// Mock registerPlugin (空实现)
export function registerPlugin<T extends Record<string, unknown>>(_name: string, impl?: T): T {
  return impl || ({} as T);
}
