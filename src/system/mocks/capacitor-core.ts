/**
 * Mock Capacitor Core
 * 说明：
 * - 浏览器开发态会把自己伪装成“原生平台”，以便复用同一套文件系统与插件分支。
 * - 因此这里除了 Capacitor 本体，还需要补最小可用的 CapacitorHttp 能力，
 *   否则网络层在 import 阶段就会因为缺少导出而直接报错。
 */
export const Capacitor = {
  isNativePlatform: () => true,
  getPlatform: () => 'web',
  isPluginAvailable: (name: string) => ['Filesystem', 'Haptics', 'Keyboard'].includes(name),
  pluginMethodNoop: () => {}
};

/**
 * 与项目当前 FetchClient 所需字段保持一致的最小 HttpResponse 声明。
 */
export interface HttpResponse {
  status: number;
  statusText?: string;
  data: unknown;
  headers?: Record<string, string>;
}

/**
 * 开发态下用浏览器 fetch 模拟 CapacitorHttp.request。
 * 这里只覆盖项目实际用到的 json 请求场景，不追求完整 SDK 兼容。
 */
export const CapacitorHttp = {
  async request(options: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    data?: unknown;
  }): Promise<HttpResponse> {
    const response = await fetch(options.url, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.data === undefined ? undefined : JSON.stringify(options.data),
    });

    let data: unknown = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      status: response.status,
      statusText: response.statusText,
      data,
      headers: Object.fromEntries(response.headers.entries()),
    };
  }
};
// Mock WebPlugin (空实现)
export class WebPlugin {
  constructor() {}
}

// Mock registerPlugin (空实现)
export function registerPlugin<T extends Record<string, unknown>>(_name: string, impl?: T): T {
  return impl || ({} as T);
}
