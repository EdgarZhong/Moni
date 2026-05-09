import type { ChatMessage, LLMConfig } from './types';
import { RawLogger } from '@system/logging/RawLogger';
import { FetchClient as NetworkClient } from '@system/network/FetchClient';

interface LLMResponse {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
  usage?: {
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
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
  private static readonly DEBUG_TAG = '[MONI_AI_DEBUG][LLMClient]';
  /**
   * SiliconFlow 官方示例里用 1024 作为 thinking_budget。
   * 本轮先固定为常量，不额外暴露 UI，避免在基础设施还没收口前继续扩配置面。
   */
  private static readonly SILICONFLOW_THINKING_BUDGET = 1024;

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

  /**
   * 只按 baseUrl 判断是否走 SiliconFlow 兼容分支。
   * 本轮用户已经明确范围只做这一家，因此这里不提前抽更多 provider 适配层。
   */
  private isSiliconFlow(baseUrl: string): boolean {
    return /api\.siliconflow\.cn/i.test(baseUrl);
  }

  /**
   * 本轮只显式接通两个 SiliconFlow 模型族：
   * 1. DeepSeek-R1：原生推理模型，只透传 thinking_budget
   * 2. DeepSeek-V3.2：通过 enable_thinking 切到 thinking 模式，并同时补 thinking_budget
   *
   * 其他 SiliconFlow 模型本轮不做 provider-specific 参数透传，避免假适配。
   */
  private resolveSiliconFlowThinkingOptions(model: string): {
    requestPatch: Record<string, unknown>;
    mode: 'disabled' | 'r1_budget_only' | 'v32_toggle_and_budget' | 'unsupported_model';
    effective: boolean;
  } {
    if (!this.config.enableThinking) {
      return {
        requestPatch: {},
        mode: 'disabled',
        effective: false,
      };
    }

    if (/DeepSeek-R1/i.test(model)) {
      return {
        requestPatch: {
          thinking_budget: LLMClient.SILICONFLOW_THINKING_BUDGET,
        },
        mode: 'r1_budget_only',
        effective: true,
      };
    }

    if (/DeepSeek-V3\.2/i.test(model)) {
      return {
        requestPatch: {
          enable_thinking: true,
          thinking_budget: LLMClient.SILICONFLOW_THINKING_BUDGET,
        },
        mode: 'v32_toggle_and_budget',
        effective: true,
      };
    }

    return {
      requestPatch: {},
      mode: 'unsupported_model',
      effective: false,
    };
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    // 修复双斜杠问题：如果 baseUrl 以 / 结尾，去掉它
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/chat/completions`;
    const responseFormat = options.responseFormat ?? 'json_object';
    const temperature = this.resolveTemperature(baseUrl, this.config.model);
    const timeoutMs = this.resolveTimeoutMs(baseUrl, this.config.model);
    const siliconFlowThinking = this.isSiliconFlow(baseUrl)
      ? this.resolveSiliconFlowThinkingOptions(this.config.model)
      : {
          requestPatch: {},
          mode: 'disabled' as const,
          effective: false,
        };

    const payload = {
      model: this.config.model,
      messages: messages,
      ...(responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
      ...(typeof this.config.maxTokens === 'number' && this.config.maxTokens > 0
        ? { max_tokens: this.config.maxTokens }
        : {}),
      temperature,
      stream: false,
      ...siliconFlowThinking.requestPatch,
    };

    const startTime = Date.now();
    console.log(
      `${LLMClient.DEBUG_TAG} CHAT_START`,
      JSON.stringify({
        url,
        model: this.config.model,
        responseFormat,
        timeoutMs,
        messageCount: messages.length,
        payload: {
          model: this.config.model,
          temperature,
          maxTokens: this.config.maxTokens,
          responseFormat,
          enableThinkingConfigured: this.config.enableThinking ?? false,
          siliconFlowThinkingMode: siliconFlowThinking.mode,
          siliconFlowThinkingEffective: siliconFlowThinking.effective,
          siliconFlowThinkingBudget:
            siliconFlowThinking.requestPatch.thinking_budget ?? null,
          messages: messages.map(m => ({ role: m.role, contentLength: m.content.length }))
        }
      }, null, 2)
    );
    
    try {
      // Log Request
      console.log(`${LLMClient.DEBUG_TAG} Sending request via NetworkClient...`);
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
      console.log(`${LLMClient.DEBUG_TAG} Request finished in ${duration}ms. Status: OK`);

      // Extract content
      const content = response.choices?.[0]?.message?.content;
      const reasoningContent = response.choices?.[0]?.message?.reasoning_content ?? '';
      const reasoningTokens = response.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      console.log(`${LLMClient.DEBUG_TAG} Response content length: ${content?.length ?? 0}`);
      console.log(
        `${LLMClient.DEBUG_TAG} Reasoning trace`,
        JSON.stringify(
          {
            siliconFlowThinkingMode: siliconFlowThinking.mode,
            reasoningContentLength: reasoningContent.length,
            reasoningTokens,
          },
          null,
          2,
        )
      );
      
      if (!content) {
        console.error(`${LLMClient.DEBUG_TAG} Empty response structure:`, JSON.stringify(response, null, 2));
        throw new Error('Empty response from LLM');
      }

      // Log Interaction
      await this.logger.logInteraction(
        {
          url,
          model: this.config.model,
          temperature,
          max_tokens: this.config.maxTokens,
          response_format: responseFormat,
          enableThinkingConfigured: this.config.enableThinking ?? false,
          siliconFlowThinkingMode: siliconFlowThinking.mode,
          payload,
        },
        response,
        duration
      );

      return content;

    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      console.error('[LLMClient] Chat request failed:', error);
      console.error(
        `${LLMClient.DEBUG_TAG} CHAT_FAILED`,
        JSON.stringify({
          url,
          model: this.config.model,
          responseFormat,
          duration,
          error: error instanceof Error ? error.message : String(error)
        })
      );

      // Log Error
      try {
        await RawLogger.log(`LLM_ERR_${Date.now()}`, {
          request: {
            url,
            model: this.config.model,
            messages,
            enableThinkingConfigured: this.config.enableThinking ?? false,
            payload,
          },
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
    const siliconFlowThinking = this.isSiliconFlow(baseUrl)
      ? this.resolveSiliconFlowThinkingOptions(this.config.model)
      : {
          requestPatch: {},
          mode: 'disabled' as const,
          effective: false,
        };
    console.log(
      `${LLMClient.DEBUG_TAG} TEST_START`,
      JSON.stringify({
        url,
        model: this.config.model,
        enableThinkingConfigured: this.config.enableThinking ?? false,
        siliconFlowThinkingMode: siliconFlowThinking.mode,
      })
    );

    await NetworkClient.post<LLMResponse>(
      url,
      {
        model: this.config.model,
        messages: [{ role: 'user', content: 'ping' }],
        temperature,
        max_tokens: 8,
        stream: false,
        ...siliconFlowThinking.requestPatch,
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
