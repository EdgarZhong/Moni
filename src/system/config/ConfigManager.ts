import { CryptoUtils } from '@shared/utils/crypto';
import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { isNativePlatform } from '@system/filesystem/fs-storage';
import { SelfDescriptionManager } from '@system/config/SelfDescriptionManager';

// 安全配置接口
export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
}

export interface MultiProviderConfig {
  providers: Record<string, ProviderConfig>;
  candidateModels: string[]; // Format: "provider::modelName"
  globalParams: {
    maxTokens: number;
    temperature: number;
    enableThinking: boolean;
  };
  ui: {
    language: 'zh' | 'en';
    theme: 'dark' | 'light';
  };
  /**
   * 用户自定义 AI 上下文
   * 用于补充系统提示，帮助 AI 更好地理解用户的个人分类偏好
   * 例如："我喜欢把星巴克的消费归为工作餐，因为我通常在开会时喝"
   */
  userContext?: string;
}

// 兼容旧代码引用，但实际上建议使用 MultiProviderConfig
export type SecureConfig = MultiProviderConfig;

const DEFAULT_CONFIG: MultiProviderConfig = {
  providers: {
    'modelscope': { apiKey: '', baseUrl: 'https://api-inference.modelscope.cn/v1' },
    'siliconflow': { apiKey: '', baseUrl: 'https://api.siliconflow.cn/v1' },
    'deepseek': { apiKey: '', baseUrl: 'https://api.deepseek.com' },
    'moonshot': { apiKey: '', baseUrl: 'https://api.moonshot.cn/v1' },
    'zhipu': { apiKey: '', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
    'custom': { apiKey: '', baseUrl: 'https://api.openai.com/v1' }
  },
  candidateModels: ['deepseek::deepseek-chat'],
  globalParams: {
    maxTokens: 2000,
    temperature: 0.3,
    enableThinking: true
  },
  ui: {
    language: 'zh',
    theme: 'dark'
  }
};

const CONFIG_FILE_NAME = 'secure_config.bin'; // 使用 .bin 后缀暗示二进制/加密内容
const MASTER_KEY = 'Moni_Local_Device_Key_2024'; // 简化版：硬编码密钥 (在真实 App 中应存储在 Android Keystore / iOS Keychain)

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private currentConfig: MultiProviderConfig | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * 初始化配置 (从磁盘加载并解密)
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const encryptedData = await this.readFromDisk();
      if (encryptedData) {
        const jsonStr = await CryptoUtils.decrypt(encryptedData, MASTER_KEY);
        const parsed = JSON.parse(jsonStr);
        // 简单的迁移逻辑：如果发现是旧结构（含 apiKey 字段），则转换为新结构
        if ('apiKey' in parsed) {
             console.log('[ConfigManager] Migrating legacy config...');
             this.currentConfig = {
                 ...DEFAULT_CONFIG,
                 providers: {
                     ...DEFAULT_CONFIG.providers,
                     'custom': { apiKey: parsed.apiKey, baseUrl: parsed.baseUrl || DEFAULT_CONFIG.providers.custom.baseUrl }
                 },
                 candidateModels: [`custom::${parsed.model || 'default-model'}`],
                 globalParams: {
                     maxTokens: parsed.maxTokens || 2000,
                     temperature: parsed.temperature || 0.3,
                     enableThinking: parsed.enableThinking ?? true
                 }
             };
        } else {
            this.currentConfig = parsed;
        }
        console.log('[ConfigManager] Config loaded and decrypted.');
      } else {
        console.log('[ConfigManager] No config found, using defaults.');
        this.currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      }
    } catch (e) {
      console.error('[ConfigManager] Failed to load config:', e);
      // Fallback to default but DON'T persist immediately to avoid overwriting potentially recoverable data
      this.currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    this.isInitialized = true;

    // 迁移 userContext 到独立文件（异步执行，不阻塞初始化）
    this.migrateUserContext().catch(e => {
      console.error('[ConfigManager] Migration failed:', e);
    });
  }

  /**
   * 迁移 userContext 到独立文件
   */
  private async migrateUserContext(): Promise<void> {
    if (!this.currentConfig) return;

    const oldUserContext = this.currentConfig.userContext;
    await SelfDescriptionManager.migrateFromOldConfig(oldUserContext);

    // 可选：迁移成功后，清空旧配置的 userContext 字段
    // 注意：这会修改配置，如果需要保留旧配置作为备份，可以注释掉以下代码
    if (oldUserContext && oldUserContext.trim() !== '') {
      const exists = await SelfDescriptionManager.exists();
      if (exists) {
        delete this.currentConfig.userContext;
        await this.saveConfig(this.currentConfig);
        console.log('[ConfigManager] Cleared old userContext after migration');
      }
    }
  }

  /**
   * 获取用户自述（优先从独立文件读取）
   */
  public async getUserContext(): Promise<string> {
    // 优先从独立文件读取
    const fromFile = await SelfDescriptionManager.load();
    if (fromFile) {
      return fromFile;
    }

    // 回退到旧配置
    const config = await this.getConfig();
    return config.userContext || '';
  }

  /**
   * 保存用户自述（保存到独立文件）
   */
  public async saveUserContext(content: string): Promise<void> {
    await SelfDescriptionManager.save(content);
  }

  /**
   * 获取完整配置 (如果未初始化会自动初始化)
   */
  public async getConfig(): Promise<MultiProviderConfig> {
    if (!this.isInitialized) {
      await this.init();
    }
    const config = this.currentConfig || JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    // 确保 ui 字段存在（兼容旧配置）
    if (!config.ui) {
      config.ui = { language: 'zh', theme: 'dark' };
    }
    return config;
  }

  /**
   * 获取当前激活的模型配置 (供 AI 引擎使用)
   */
  public async getActiveModelConfig(): Promise<LLMConfig> {
      const config = await this.getConfig();
      
      // 1. 获取首选模型
      const candidate = config.candidateModels[0] || 'custom::default';
      const [providerName, modelName] = candidate.split('::');
      
      // 2. 获取供应商配置
      const provider = config.providers[providerName] || config.providers['custom'];
      
      if (!provider || !provider.apiKey) {
          console.warn(`[ConfigManager] Provider ${providerName} not configured or missing API Key.`);
      }

      return {
          apiKey: provider?.apiKey || '',
          baseUrl: provider?.baseUrl || '',
          model: modelName || 'default',
          maxTokens: config.globalParams.maxTokens,
          temperature: config.globalParams.temperature
      };
  }

  /**
   * 保存配置 (加密并写入磁盘)
   */
  public async saveConfig(config: Partial<MultiProviderConfig>): Promise<void> {
    const current = await this.getConfig();
    const newConfig = { ...current, ...config } as MultiProviderConfig;
    
    try {
      const jsonStr = JSON.stringify(newConfig);
      const encryptedData = await CryptoUtils.encrypt(jsonStr, MASTER_KEY);
      
      await this.writeToDisk(encryptedData);
      
      this.currentConfig = newConfig;
      console.log('[ConfigManager] Config saved securely.');
    } catch (e) {
      console.error('[ConfigManager] Failed to save config:', e);
      throw e;
    }
  }

  // --- Low Level Disk IO ---

  private async readFromDisk(): Promise<string | null> {
    if (isNativePlatform()) {
      try {
        const fs = FilesystemService.getInstance();
        const data = await fs.readFile({
          path: CONFIG_FILE_NAME,
          directory: AdapterDirectory.Data, // 使用 Data 目录，映射到 virtual_android_filesys/sandbox_path
          encoding: AdapterEncoding.UTF8
        });
        return data;
      } catch {
        return null; // File not found
      }
    } else {
      // 纯 Web 环境 (非 Dev Mock 模式) 下的回退逻辑
      // 注意：在 Dev 模式下，由于 mock-fs 的存在，isNative 恒为 true，不会进入此分支
      const local = localStorage.getItem('moni_secure_config');
      if (local) return local;
      return null;
    }
  }

  private async writeToDisk(data: string): Promise<void> {
    if (isNativePlatform()) {
      const fs = FilesystemService.getInstance();
      await fs.writeFile({
        path: CONFIG_FILE_NAME,
        data: data,
        directory: AdapterDirectory.Data,
        encoding: AdapterEncoding.UTF8
      });
    } else {
      localStorage.setItem('moni_secure_config', data);
    }
  }
}

export const configManager = ConfigManager.getInstance();
