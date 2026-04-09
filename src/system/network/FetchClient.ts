// 简单的 HTTP 客户端封装
// 职责：处理超时、重试、错误统一包装

export interface FetchOptions extends RequestInit {
  timeout?: number; // ms
  retries?: number;
}

/**
 * 开发环境下将外部 API URL 转换为本地代理 URL 以解决 CORS 问题
 * @param originalUrl 原始 API URL
 * @returns 转换后的 URL（开发环境下）或原始 URL（生产环境/真机）
 */
function transformUrlForDevProxy(originalUrl: string): string {
  // 只在浏览器开发环境下使用代理
  // 注意：Capacitor 真机环境下 isNativePlatform 为 true，不会走这里
  const isDevBrowser = import.meta.env.DEV && typeof window !== 'undefined' && !(window as unknown as { Capacitor?: unknown }).Capacitor;

  if (!isDevBrowser) {
    return originalUrl;
  }

  try {
    const url = new URL(originalUrl);
    const hostname = url.hostname.toLowerCase();

    // 映射常见 LLM API 到代理路径
    // 支持带 /v1 的 baseUrl，代理会正确处理
    const proxyMap: Record<string, string> = {
      'api.moonshot.cn': '/api/moonshot',
      'api.deepseek.com': '/api/deepseek',
      'api.siliconflow.cn': '/api/siliconflow',
      'api-inference.modelscope.cn': '/api/modelscope',
    };

    for (const [apiHost, proxyPath] of Object.entries(proxyMap)) {
      if (hostname === apiHost || hostname.endsWith('.' + apiHost)) {
        // 替换协议、主机和端口为当前开发服务器
        const newUrl = proxyPath + url.pathname + url.search;
        console.log(`[FetchClient] Dev proxy: ${originalUrl} → ${newUrl}`);
        return newUrl;
      }
    }
  } catch {
    // URL 解析失败，返回原始值
  }

  return originalUrl;
}

export class FetchClient {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30s
  private static readonly DEFAULT_RETRIES = 1;

  public static async request<T>(url: string, options: FetchOptions = {}): Promise<T> {
    // 开发环境下转换 URL 以使用代理
    const transformedUrl = transformUrlForDevProxy(url);
    const { timeout = this.DEFAULT_TIMEOUT, retries = this.DEFAULT_RETRIES, ...fetchInit } = options;

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= retries) {
      let didTimeout = false;
      let id: ReturnType<typeof setTimeout> | null = null;
      try {
        const controller = new AbortController();
        id = setTimeout(() => {
          didTimeout = true;
          controller.abort();
        }, timeout);

        const response = await fetch(transformedUrl, {
          ...fetchInit,
          signal: controller.signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          
          // 429 (Too Many Requests) and 5xx (Server Errors) are retryable
          if (response.status === 429 || response.status >= 500) {
             throw new Error(`HTTP_RETRYABLE ${response.status}: ${errorText}`);
          }
          
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // 尝试解析 JSON
        try {
          return await response.json() as T;
        } catch {
          throw new Error('Invalid JSON response');
        }

      } catch (err: unknown) {
        const rawError = err instanceof Error ? err : new Error(String(err));
        const errObj = rawError.name === 'AbortError' && didTimeout
          ? new Error(`Request timeout after ${timeout}ms`)
          : rawError;
        lastError = errObj;
        
        // 如果是 AbortError (超时)，则视为可重试
        // 如果是 5xx 错误，也可重试
        // 4xx 错误通常不重试
        const isTimeout = rawError.name === 'AbortError';
        const isNetworkError = err instanceof TypeError; // fetch network error
        const isRetryableHttp = errObj.message.startsWith('HTTP_RETRYABLE');
        
        if (isTimeout || isNetworkError || isRetryableHttp) {
          console.warn(`[FetchClient] Attempt ${attempt + 1} failed: ${errObj.message}. Retrying...`);
          attempt++;
          // Exponential backoff
          if (attempt <= retries) {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          }
        } else {
          // 其他错误直接抛出
          throw err;
        }
      } finally {
        if (id) {
          clearTimeout(id);
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  // Helper for POST JSON
  public static async post<T>(url: string, body: unknown, headers: Record<string, string> = {}, options: FetchOptions = {}): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(body),
      ...options
    });
  }
}
