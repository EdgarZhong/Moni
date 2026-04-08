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

export class LLMClient {
  private config: LLMConfig;
  private logger: RawLogger;

  constructor(config: LLMConfig) {
    this.config = config;
    this.logger = new RawLogger();
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    // 修复双斜杠问题：如果 baseUrl 以 / 结尾，去掉它
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/chat/completions`;
    
    const payload = {
      model: this.config.model,
      messages: messages,
      response_format: { type: "json_object" },
      temperature: this.config.temperature || 0.3,
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
          timeout: 60000, // 60s for LLM
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
}
