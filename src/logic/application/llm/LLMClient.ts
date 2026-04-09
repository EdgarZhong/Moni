import type { ChatMessage, LLMConfig } from './types';
import { RawLogger } from '@system/logging/RawLogger';
import { FetchClient as NetworkClient } from '@system/network/FetchClient';

interface LLMResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

/**
 * Chat 调用选项。
 * 默认保持现有 JSON 模式不变，只有收编这类纯文本输出场景才显式切到 text。
 */
export interface ChatOptions {
  responseFormat?: 'json_object' | 'text';
}

export class LLMClient {
  private config: LLMConfig;
  private logger: RawLogger;

  constructor(config: LLMConfig) {
    this.config = config;
    this.logger = new RawLogger();
  }

  /**
   * Moonshot/Kimi 部分模型要求 temperature 固定为 1。
   * 为避免上游遗漏配置导致 400，这里做请求前兜底归一化。
   */
  private resolveTemperature(baseUrl: string, model: string): number {
    const isMoonshotByBaseUrl = /api\.moonshot\.cn/i.test(baseUrl);
    const isMoonshotByModel = /^(kimi-|moonshot-)/i.test(model);
    if (isMoonshotByBaseUrl || isMoonshotByModel) {
      return 1;
    }
    return this.config.temperature ?? 0.3;
  }

  private resolveTimeoutMs(baseUrl: string, model: string): number {
    const isMoonshotByBaseUrl = /api\.moonshot\.cn/i.test(baseUrl);
    const isMoonshotByModel = /^(kimi-|moonshot-)/i.test(model);
    return (isMoonshotByBaseUrl || isMoonshotByModel) ? 120000 : 60000;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    // 修复双斜杠问题：如果 baseUrl 以 / 结尾，去掉它
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/chat/completions`;
    const responseFormat = options.responseFormat ?? 'json_object';
    const temperature = this.resolveTemperature(baseUrl, this.config.model);
    const timeoutMs = this.resolveTimeoutMs(baseUrl, this.config.model);
    
    const payload = {
      model: this.config.model,
      messages: messages,
      ...(responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
      temperature,
      stream: false
    };

    const startTime = Date.now();
    
    try {
      // Log Request
      const response = await NetworkClient.post<LLMResponse>(
        url,
        payload,
        {
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        {
          timeout: timeoutMs,
          retries: 3
        }
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Extract content
      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      // Log Interaction
      await this.logger.logInteraction(
        messages,
        response,
        duration,
        this.config.model
      );

      return content;

    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      console.error('[LLMClient] Chat request failed:', error);

      // Log Error
      try {
        await RawLogger.log(`LLM_ERR_${Date.now()}`, {
          request: { model: this.config.model, messages },
          response: null,
          duration_ms: duration,
          status: 'ERROR',
          error: error instanceof Error ? error.message : String(error)
        });
      } catch (logError) {
        console.error('[LLMClient] Failed to log error:', logError);
      }

      throw error;
    }
  }

  /**
   * 连接自检：用最小开销请求验证 baseUrl、apiKey 和模型是否可用。
   */
  async testConnection(): Promise<void> {
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/chat/completions`;
    const temperature = this.resolveTemperature(baseUrl, this.config.model);

    await NetworkClient.post<LLMResponse>(
      url,
      {
        model: this.config.model,
        messages: [{ role: 'user', content: 'ping' }],
        temperature,
        max_tokens: 8,
        stream: false,
      },
      {
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      {
        timeout: 15000,
        retries: 0,
      }
    );
  }
}
