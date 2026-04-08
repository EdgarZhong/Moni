import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, type Transition } from 'framer-motion';
import { createPortal } from 'react-dom';
import { triggerHaptic, HapticFeedbackLevel } from '@system/device/haptics';
import { ConfigManager, type MultiProviderConfig, type ProviderConfig } from '@system/config/ConfigManager';
import { useSettings } from '@ui/hooks/useSettings';
import { ExampleStore } from '@logic/application/services/ExampleStore';
import { MemoryManager } from '@logic/application/services/MemoryManager';
import { SnapshotManager, type SnapshotMeta, type SnapshotContent } from '@logic/application/services/SnapshotManager';
import { LearningSession } from '@logic/application/ai/LearningSession';
import { LedgerService } from '@logic/application/services/LedgerService';
import { ReclassifyConfirmDialog, type ReclassifyMode } from './ReclassifyConfirmDialog';

interface SettingsPageProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 当前账本名称 */
  activeLedger: string;
  /** 账本列表 */
  ledgers: Array<{ name: string; transactionCount: number }>;
  /** 切换账本回调 */
  onSwitchLedger: () => void;
  /** 版本号 */
  version?: string;
}

// 设置项数据结构
interface SettingItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
}

// 设置分类数据结构
interface SettingCategory {
  title: string;
  items: SettingItem[];
}

// 预定义的提供商列表
// 注意：baseUrl 包含 API 版本路径，如 /v1
const PREDEFINED_PROVIDERS = [
  { key: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  { key: 'moonshot', name: 'Moonshot (Kimi)', baseUrl: 'https://api.moonshot.cn/v1' },
  { key: 'siliconflow', name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1' },
  { key: 'modelscope', name: 'ModelScope', baseUrl: 'https://api-inference.modelscope.cn/v1' },
  { key: 'zhipu', name: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { key: 'custom', name: '自定义', baseUrl: '' },
] as const;

// 预定义的模型列表
// Moonshot (Kimi) 模型列表来源: https://platform.moonshot.cn/docs/introduction
const PREDEFINED_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  // Moonshot v1 系列: https://platform.moonshot.cn/docs/introduction#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90%E6%A8%A1%E5%9E%8B
  moonshot: [
    'moonshot-v1-8k',      // 标准版，8k 上下文
    'moonshot-v1-32k',     // 长上下文版，32k 上下文
    'moonshot-v1-128k',    // 超长上下文版，128k 上下文
    'moonshot-v1-auto',    // 自动选择上下文长度
    'kimi-k2.5',           // Kimi K2.5 系列模型
  ],
  siliconflow: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'],
  modelscope: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1'],
  zhipu: ['glm-4-flash', 'glm-4-air', 'glm-4-plus'],
  custom: [],
};

type PanelView = 'main' | 'ai-config' | 'theme' | 'user-context' | 'ai-memory' | 'manage-categories' | 'budget';

/**
 * [设置页面] 组件
 * 采用二级面板样式，从顶部滑入
 * 包含全局设置和账本设置两个分类
 *
 * 设计规范：
 * - 顶部绿色边框暗示"入口"隐喻
 * - 双栏分类布局
 * - 列表项左侧 3x3 像素图标
 * - 与 LedgerSwitcher 保持一致的视觉语言
 */
export const SettingsPage: React.FC<SettingsPageProps> = ({
  isOpen,
  onClose,
  activeLedger,
  ledgers,
  onSwitchLedger,
  version = 'v1.0.0'
}) => {
  // 当前显示的面板
  const [currentView, setCurrentView] = useState<PanelView>('main');
  // 使用全局设置上下文 - 只保留主题
  const { theme, setTheme } = useSettings();

  // 重置视图状态当设置页面关闭时
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => setCurrentView('main'), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // 全局设置项
  const globalSettings: SettingCategory = {
    title: '[GLOBAL_SETTINGS]',
    items: [
      {
        id: 'ai-api',
        icon: <PixelIcon color="pixel-green" pattern="ai" />,
        label: 'AI_API_CONFIG',
        value: 'CONFIGURE',
        onClick: () => setCurrentView('ai-config')
      },
      {
        id: 'theme',
        icon: <PixelIcon color="pixel-green" pattern={theme} />,
        label: 'THEME',
        value: theme === 'dark' ? 'DARK' : 'LIGHT',
        onClick: () => setCurrentView('theme')
      },
      {
        id: 'user-context',
        icon: <PixelIcon color="pixel-green" />,
        label: 'SELF_DESCRIPTION',
        value: 'CONFIGURE',
        onClick: () => setCurrentView('user-context')
      },
      {
        id: 'export',
        icon: <PixelIcon color="income-yellow" />,
        label: 'EXPORT_DATA',
        onClick: () => console.log('Export data')
      },
      {
        id: 'about',
        icon: <PixelIcon color="text-dim" />,
        label: 'ABOUT',
        onClick: () => console.log('About')
      }
    ]
  };

  // 账本设置项
  const ledgerSettings: SettingCategory = {
    title: '[LEDGER_SETTINGS]',
    items: [
      {
        id: 'current-ledger',
        icon: <PixelIcon color="pixel-green" />,
        label: 'CURRENT_LEDGER',
        value: activeLedger.toUpperCase(),
        onClick: onSwitchLedger
      },
      {
        id: 'ai-memory',
        icon: <PixelIcon color="pixel-green" pattern="ai" />,
        label: 'AI_MEMORY',
        value: 'CONFIGURE',
        onClick: () => setCurrentView('ai-memory')
      },
      {
        id: 'categories',
        icon: <PixelIcon color="income-yellow" />,
        label: 'MANAGE_CATEGORIES',
        value: 'CONFIGURE',
        onClick: () => setCurrentView('manage-categories')
      },
      {
        id: 'budget',
        icon: <PixelIcon color="pixel-green" />,
        label: 'BUDGET_SETTINGS',
        value: 'CONFIGURE',
        onClick: () => setCurrentView('budget')
      },
      {
        id: 'clear',
        icon: <PixelIcon color="expense-red" />,
        label: 'CLEAR_LEDGER',
        danger: true,
        onClick: () => console.log('Clear ledger')
      }
    ]
  };

  const handleClose = async () => {
    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    onClose();
  };

  // 优化：使用更短的动画时长和硬件加速友好的缓动函数
  const transition = {
    type: "tween",
    ease: [0.32, 0.72, 0, 1],
    duration: 0.45
  } as const;

  const backdropTransition = {
    duration: 0.25
  } as const;

  // 子面板动画配置
  const panelTransition = {
    type: "tween" as const,
    ease: [0.32, 0.72, 0, 1] as const,
    duration: 0.35
  } satisfies Transition;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9997] flex flex-col">
          {/* 背景遮罩 - 点击关闭 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={backdropTransition}
            className="absolute inset-0 bg-black/40"
            onClick={handleClose}
          />

          {/* 设置页面容器 - 从顶部滑入 */}
          <motion.div
            initial={{ y: '-100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={transition}
            className="relative z-10 w-full bg-card border-b-2 border-pixel-green/30 rounded-b-lg shadow-2xl flex flex-col"
            style={{
              height: 'min(85vh, 700px)',
              willChange: 'transform',
            }}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
              <div className="text-dim text-xs font-mono tracking-wider">
                {currentView === 'main' ? '[SETTINGS]' :
                 currentView === 'ai-config' ? '[AI_API_CONFIG]' :
                 currentView === 'theme' ? '[THEME]' :
                 currentView === 'user-context' ? '[SELF_DESCRIPTION]' :
                 currentView === 'manage-categories' ? '[MANAGE_CATEGORIES]' :
                 currentView === 'ai-memory' ? '[AI_MEMORY]' :
                 currentView === 'budget' ? '[BUDGET_SETTINGS]' : '[SETTINGS]'}
              </div>
              <button
                onClick={handleClose}
                className="text-dim text-xs font-mono tracking-wider px-3 py-1.5
                  border border-gray-700 rounded
                  hover:border-gray-500 hover:text-white transition-colors"
              >
                [CLOSE]
              </button>
            </div>

            {/* 内容区域 - 使用相对定位实现滑动切换 */}
            <div className="flex-1 overflow-hidden relative">
              <AnimatePresence mode="popLayout" initial={false}>
                {currentView === 'main' && (
                  <MainSettingsPanel
                    key="main"
                    globalSettings={globalSettings}
                    ledgerSettings={ledgerSettings}
                    ledgers={ledgers}
                    activeLedger={activeLedger}
                    transition={panelTransition}
                  />
                )}
                {currentView === 'ai-config' && (
                  <AIConfigPanel
                    key="ai-config"
                    onBack={() => setCurrentView('main')}
                    transition={panelTransition}
                  />
                )}
                {currentView === 'theme' && (
                  <ThemePanel
                    key="theme"
                    currentTheme={theme}
                    onBack={() => setCurrentView('main')}
                    transition={panelTransition}
                    onChange={setTheme}
                  />
                )}
                {currentView === 'user-context' && (
                  <UserContextPanel
                    key="user-context"
                    onBack={() => setCurrentView('main')}
                    transition={panelTransition}
                  />
                )}
                {currentView === 'ai-memory' && (
                  <AIMemoryPanel
                    key="ai-memory"
                    ledgerName={activeLedger}
                    onBack={() => setCurrentView('main')}
                    transition={panelTransition}
                  />
                )}
                {currentView === 'manage-categories' && (
                  <CategoryManagementPanel
                    key="manage-categories"
                    onBack={() => setCurrentView('main')}
                    transition={panelTransition}
                  />
                )}
                {currentView === 'budget' && (
                  <BudgetConfigPanel
                    key="budget"
                    ledgerName={activeLedger}
                    onBack={() => setCurrentView('main')}
                    transition={panelTransition}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* 底部版本信息 */}
            <div className="flex-shrink-0 py-3 text-center border-t border-gray-800 bg-card">
              <div className="text-[10px] font-mono text-dim/60 tracking-wider">
                PIXELBILL {version} • DESIGNED BY CYBERZEN
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

/**
 * 主设置面板组件
 */
interface MainSettingsPanelProps {
  globalSettings: SettingCategory;
  ledgerSettings: SettingCategory;
  ledgers: Array<{ name: string; transactionCount: number }>;
  activeLedger: string;
  transition: Transition;
}

const MainSettingsPanel: React.FC<MainSettingsPanelProps> = ({
  globalSettings,
  ledgerSettings,
  ledgers,
  activeLedger,
  transition
}) => {
  return (
    <motion.div
      initial={{ x: 0, opacity: 1 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -50, opacity: 0 }}
      transition={transition}
      className="absolute inset-0 overflow-y-auto p-6"
    >
      <div className="space-y-6">
        {/* 全局设置 */}
        <SettingCategorySection
          category={globalSettings}
          delay={0}
        />

        {/* 账本设置 */}
        <SettingCategorySection
          category={ledgerSettings}
          delay={0.05}
        />
      </div>

      {/* 账本统计信息 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.35 }}
        className="mt-6 p-4 bg-zinc-950 rounded border border-gray-800"
      >
        <div className="text-dim text-[10px] font-mono mb-3 tracking-wider">
          [LEDGER_STATISTICS]
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-mono text-pixel-green">
              {ledgers.length}
            </div>
            <div className="text-[10px] text-dim font-mono mt-1">
              TOTAL_LEDGERS
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-mono text-income-yellow">
              {ledgers.find(l => l.name === activeLedger)?.transactionCount || 0}
            </div>
            <div className="text-[10px] text-dim font-mono mt-1">
              ACTIVE_TXNS
            </div>
          </div>
        </div>
      </motion.div>

      {/* 底部垫片 */}
      <div className="h-4" />
    </motion.div>
  );
};

/**
 * AI API 配置面板组件
 */
interface AIConfigPanelProps {
  onBack: () => void;
  transition: Transition;
}

const AIConfigPanel: React.FC<AIConfigPanelProps> = ({ onBack, transition }) => {
  const [selectedProvider, setSelectedProvider] = useState<string>('deepseek');
  const [apiKey, setApiKey] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [customModel, setCustomModel] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  // 连接测试状态
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const manager = ConfigManager.getInstance();
        const cfg = await manager.getConfig();

        // 解析当前激活的提供商和模型
        const candidate = cfg.candidateModels[0] || 'deepseek::deepseek-chat';
        const [provider, model] = candidate.split('::');

        setSelectedProvider(provider in cfg.providers ? provider : 'custom');
        setSelectedModel(model || '');

        const provConfig = cfg.providers[provider];
        if (provConfig) {
          setApiKey(provConfig.apiKey || '');
          // 如果 baseUrl 与预设不同，说明是自定义
          const predefined = PREDEFINED_PROVIDERS.find(p => p.key === provider);
          if (predefined && provConfig.baseUrl !== predefined.baseUrl) {
            setBaseUrl(provConfig.baseUrl || '');
          } else if (!predefined) {
            setBaseUrl(provConfig.baseUrl || '');
          }
        }
      } catch (e) {
        console.error('[AIConfigPanel] Failed to load config:', e);
      } finally {
        setIsLoading(false);
      }
    };

    void loadConfig();
  }, []);

  // 当选择提供商变化时更新 baseUrl
  useEffect(() => {
    const predefined = PREDEFINED_PROVIDERS.find(p => p.key === selectedProvider);
    if (predefined && predefined.baseUrl) {
      setBaseUrl(predefined.baseUrl);
    } else if (selectedProvider === 'custom') {
      setBaseUrl('');
    }
  }, [selectedProvider]);

  // 保存配置
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const manager = ConfigManager.getInstance();
      const currentConfig = await manager.getConfig();

      // 构建新的提供商配置
      const providerConfig: ProviderConfig = {
        apiKey: apiKey.trim(),
        baseUrl: selectedProvider === 'custom' ? baseUrl.trim() : (PREDEFINED_PROVIDERS.find(p => p.key === selectedProvider)?.baseUrl || baseUrl.trim()),
      };

      // 确定使用的模型名称
      const modelName = selectedProvider === 'custom' ? customModel.trim() : selectedModel;

      const newConfig: Partial<MultiProviderConfig> = {
        providers: {
          ...currentConfig.providers,
          [selectedProvider]: providerConfig,
        },
        candidateModels: [`${selectedProvider}::${modelName || 'default'}`],
      };

      await manager.saveConfig(newConfig);
      setSaveStatus('success');
      await triggerHaptic(HapticFeedbackLevel.MEDIUM);

      // 2秒后返回主面板
      setTimeout(() => {
        onBack();
      }, 800);
    } catch (e) {
      console.error('[AIConfigPanel] Failed to save config:', e);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }, [apiKey, baseUrl, selectedProvider, selectedModel, customModel, onBack]);

  // 测试连接
  const handleTest = useCallback(async () => {
    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    setTestStatus('testing');
    setTestMessage('');

    try {
      // 构建测试用的配置
      const finalBaseUrl = selectedProvider === 'custom'
        ? baseUrl.trim()
        : (PREDEFINED_PROVIDERS.find(p => p.key === selectedProvider)?.baseUrl || baseUrl.trim());

      const finalModel = selectedProvider === 'custom' ? customModel.trim() : selectedModel;

      if (!apiKey.trim()) {
        throw new Error('请先填写 API Key');
      }
      if (!finalBaseUrl) {
        throw new Error('请先填写 Base URL');
      }

      // 构建请求 URL（去掉末尾的 /，避免双斜杠）
      const cleanBaseUrl = finalBaseUrl.replace(/\/$/, '');
      const url = `${cleanBaseUrl}/chat/completions`;

      // 发送一个简单的测试请求
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: finalModel || 'default',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || errorData.message || `HTTP ${response.status}`;
        throw new Error(errorMsg);
      }

      // 解析响应验证模型是否正常工作
      const data = await response.json();
      if (data.choices?.[0]?.message?.content) {
        setTestStatus('success');
        const successMsg = `✓ 连接成功（模型：${finalModel || 'default'}）`;
        setTestMessage(successMsg);
        await triggerHaptic(HapticFeedbackLevel.MEDIUM);
      } else {
        throw new Error('响应格式无效');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setTestStatus('error');
      setTestMessage(`✗ ${errorMsg}`);
      console.error('[AIConfigPanel] Test connection failed:', err);
    }
  }, [apiKey, baseUrl, selectedProvider, selectedModel, customModel]);

  if (isLoading) {
    return (
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 50, opacity: 0 }}
        transition={transition}
        className="absolute inset-0 flex items-center justify-center"
      >
        <div className="text-dim text-xs font-mono">[LOADING_CONFIG...]</div>
      </motion.div>
    );
  }

  const availableModels = PREDEFINED_MODELS[selectedProvider] || [];
  const isCustomProvider = selectedProvider === 'custom';
  const canSave = apiKey.trim() && (isCustomProvider ? baseUrl.trim() && customModel.trim() : selectedModel);

  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 50, opacity: 0 }}
      transition={transition}
      className="absolute inset-0 overflow-y-auto p-6"
    >
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-dim text-xs font-mono mb-6
          hover:text-white transition-colors"
      >
        <span>‹</span>
        <span>[BACK_TO_SETTINGS]</span>
      </button>

      {/* 提供商选择 */}
      <div className="mb-6">
        <div className="text-dim text-[10px] font-mono tracking-wider mb-3">
          [SELECT_PROVIDER]
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PREDEFINED_PROVIDERS.map((provider) => (
            <button
              key={provider.key}
              onClick={() => setSelectedProvider(provider.key)}
              className={`px-3 py-2.5 rounded border text-xs font-mono transition-all duration-200
                ${selectedProvider === provider.key
                  ? 'border-pixel-green bg-pixel-green/10 text-pixel-green'
                  : 'border-gray-700 bg-zinc-950 text-gray-400 hover:border-gray-500'
                }`}
            >
              {provider.name}
            </button>
          ))}
        </div>
      </div>

      {/* API Key 输入 */}
      <div className="mb-6">
        <div className="text-dim text-[10px] font-mono tracking-wider mb-3">
          [API_KEY]
        </div>
        <div className="relative">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-xxxxxxxxxxxxxxxx"
            className="w-full px-4 py-3 bg-zinc-950 border border-gray-700 rounded
              text-sm font-mono text-gray-200 placeholder-gray-600
              focus:border-pixel-green focus:outline-none focus:ring-1 focus:ring-pixel-green/30
              transition-all"
          />
          {apiKey && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <PixelIcon color="pixel-green" size="sm" />
            </div>
          )}
        </div>
        <div className="mt-2 text-[10px] text-dim font-mono">
          您的 API Key 将被加密存储在本地设备上
        </div>
      </div>

      {/* Base URL 输入（仅自定义提供商时显示） */}
      {isCustomProvider && (
        <div className="mb-6">
          <div className="text-dim text-[10px] font-mono tracking-wider mb-3">
            [BASE_URL]
          </div>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="w-full px-4 py-3 bg-zinc-950 border border-gray-700 rounded
              text-sm font-mono text-gray-200 placeholder-gray-600
              focus:border-pixel-green focus:outline-none focus:ring-1 focus:ring-pixel-green/30
              transition-all"
          />
          <div className="mt-2 text-[10px] text-dim font-mono"
          >
            提示：Kimi/Moonshot 请使用 https://api.moonshot.cn/v1
          </div>
        </div>
      )}

      {/* 模型选择 */}
      <div className="mb-8">
        <div className="text-dim text-[10px] font-mono tracking-wider mb-3">
          [MODEL_SELECTION]
        </div>
        {isCustomProvider ? (
          <input
            type="text"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="输入模型名称，如 gpt-4"
            className="w-full px-4 py-3 bg-zinc-950 border border-gray-700 rounded
              text-sm font-mono text-gray-200 placeholder-gray-600
              focus:border-pixel-green focus:outline-none focus:ring-1 focus:ring-pixel-green/30
              transition-all"
          />
        ) : (
          <div className="space-y-2">
            {availableModels.map((model) => (
              <button
                key={model}
                onClick={() => setSelectedModel(model)}
                className={`w-full px-4 py-3 rounded border text-left text-sm font-mono transition-all duration-200
                  ${selectedModel === model
                    ? 'border-pixel-green bg-pixel-green/10 text-pixel-green'
                    : 'border-gray-700 bg-zinc-950 text-gray-400 hover:border-gray-500'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span>{model}</span>
                  {selectedModel === model && <PixelIcon color="pixel-green" size="sm" />}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="space-y-3">
        <button
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className={`w-full py-3.5 rounded font-mono text-sm tracking-wider transition-all duration-200
            ${canSave && !isSaving
              ? 'bg-pixel-green/20 border border-pixel-green text-pixel-green hover:bg-pixel-green/30 active:bg-pixel-green/40'
              : 'bg-gray-800/50 border border-gray-700 text-gray-500 cursor-not-allowed'
            }`}
        >
          {isSaving ? '[SAVING...]' : saveStatus === 'success' ? '[SAVED ✓]' : '[SAVE_CONFIGURATION]'}
        </button>

        <button
          onClick={handleTest}
          disabled={!canSave || testStatus === 'testing'}
          className={`w-full py-3.5 rounded font-mono text-sm tracking-wider transition-all duration-200
            ${!canSave
              ? 'bg-gray-800/30 border border-gray-700 text-gray-600 cursor-not-allowed'
              : testStatus === 'testing'
                ? 'bg-zinc-950 border border-gray-600 text-gray-400 cursor-wait'
                : testStatus === 'success'
                  ? 'bg-pixel-green/10 border border-pixel-green text-pixel-green'
                  : testStatus === 'error'
                    ? 'bg-expense-red/10 border border-expense-red text-expense-red'
                    : 'bg-zinc-950 border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white'
            }`}
        >
          {testStatus === 'testing' ? '[TESTING...]' :
           testStatus === 'success' ? '[CONNECTION_OK]' :
           testStatus === 'error' ? '[CONNECTION_FAILED]' :
           '[TEST_CONNECTION]'}
        </button>

        {/* 测试结果提示 */}
        {testMessage && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-xs font-mono text-center py-2 rounded ${
              testStatus === 'success' ? 'text-pixel-green bg-pixel-green/5' : 'text-expense-red bg-expense-red/5'
            }`}
          >
            {testMessage}
          </motion.div>
        )}

        {saveStatus === 'error' && (
          <div className="text-center text-expense-red text-xs font-mono py-2">
            [SAVE_FAILED_PLEASE_RETRY]
          </div>
        )}
      </div>

      {/* 安全提示 */}
      <div className="mt-8 p-4 bg-zinc-950/50 border border-gray-800 rounded">
        <div className="text-[10px] text-dim font-mono leading-relaxed">
          <span className="text-pixel-green">[SECURITY_NOTICE]</span>
          <br />
          所有配置信息均使用 AES-256 加密存储在设备本地，不会上传到任何服务器。
        </div>
      </div>

      {/* 底部垫片 */}
      <div className="h-4" />
    </motion.div>
  );
};

/**
 * 主题选择面板组件
 */
interface ThemePanelProps {
  currentTheme: 'dark' | 'light';
  onBack: () => void;
  onChange: (theme: 'dark' | 'light') => Promise<void>;
  transition: Transition;
}

const ThemePanel: React.FC<ThemePanelProps> = ({
  currentTheme,
  onBack,
  onChange,
  transition
}) => {
  const themes = [
    { key: 'dark' as const, label: 'Dark Mode', desc: '适合夜间使用' },
    { key: 'light' as const, label: 'Light Mode', desc: '适合白天使用' },
  ];

  const handleSelect = async (theme: 'dark' | 'light') => {
    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    await onChange(theme);
  };

  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 50, opacity: 0 }}
      transition={transition}
      className="absolute inset-0 overflow-y-auto p-6"
    >
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-dim text-xs font-mono mb-6
          hover:text-white transition-colors"
      >
        <span>‹</span>
        <span>[BACK_TO_SETTINGS]</span>
      </button>

      {/* 主题选项 */}
      <div className="space-y-4">
        {themes.map((theme) => (
          <button
            key={theme.key}
            onClick={() => handleSelect(theme.key as 'dark' | 'light')}
            className={`w-full p-4 rounded border text-left transition-all duration-200
              ${currentTheme === theme.key
                ? 'border-pixel-green bg-pixel-green/10'
                : 'border-gray-700 bg-zinc-950 hover:border-gray-500'
              }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-mono ${
                  currentTheme === theme.key ? 'text-pixel-green' : 'text-gray-200'
                }`}>
                  {theme.label}
                </div>
                <div className="text-[10px] text-dim font-mono mt-1">
                  {theme.desc}
                </div>
              </div>
              {currentTheme === theme.key && (
                <PixelIcon color="pixel-green" size="sm" />
              )}
            </div>
          </button>
        ))}
      </div>

      {/* 提示 */}
      <div className="mt-8 p-4 bg-zinc-950/50 border border-gray-800 rounded">
        <div className="text-[10px] text-dim font-mono leading-relaxed">
          <span className="text-pixel-green">[NOTE]</span>
          <br />
          主题设置已应用并保存，部分界面元素可能需要刷新后生效。
        </div>
      </div>

      {/* 底部垫片 */}
      <div className="h-4" />
    </motion.div>
  );
};

/**
 * 用户 AI 上下文配置面板组件
 * 允许用户输入自定义上下文，帮助 AI 更好地理解分类偏好
 */
interface UserContextPanelProps {
  onBack: () => void;
  transition: Transition;
}

const UserContextPanel: React.FC<UserContextPanelProps> = ({ onBack, transition }) => {
  const MAX_SELF_DESCRIPTION_LENGTH = 500;
  const [userContext, setUserContext] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 加载保存的用户上下文（从独立文件）
  useEffect(() => {
    const loadContext = async () => {
      try {
        const manager = ConfigManager.getInstance();
        const context = await manager.getUserContext();
        setUserContext(context);
      } catch (e) {
        console.error('[UserContextPanel] Failed to load context:', e);
      } finally {
        setIsLoading(false);
      }
    };
    void loadContext();
  }, []);

  // 自动调整 textarea 高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(200, textareaRef.current.scrollHeight)}px`;
    }
  }, [userContext, isLoading]);

  // 保存用户上下文（保存到独立文件）
  const handleSave = useCallback(async () => {
    if (userContext.length > MAX_SELF_DESCRIPTION_LENGTH) {
      setSaveStatus('error');
      return;
    }

    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const manager = ConfigManager.getInstance();
      await manager.saveUserContext(userContext.trim());
      setSaveStatus('success');
      await triggerHaptic(HapticFeedbackLevel.MEDIUM);

      // 2秒后返回主面板
      setTimeout(() => {
        onBack();
      }, 800);
    } catch (e) {
      console.error('[UserContextPanel] Failed to save context:', e);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }, [userContext, onBack]);

  // 清空上下文
  const handleClear = useCallback(async () => {
    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    setUserContext('');
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  if (isLoading) {
    return (
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 50, opacity: 0 }}
        transition={transition}
        className="absolute inset-0 flex items-center justify-center"
      >
        <div className="text-dim text-xs font-mono">[LOADING...]</div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 50, opacity: 0 }}
      transition={transition}
      className="absolute inset-0 overflow-y-auto p-6"
    >
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-dim text-xs font-mono mb-6
          hover:text-white transition-colors"
      >
        <span>‹</span>
        <span>[BACK_TO_SETTINGS]</span>
      </button>

      {/* 标题和说明 */}
      <div className="mb-6">
        <h3 className="text-sm font-mono text-gray-200 mb-2">[SELF_DESCRIPTION]</h3>
        <p className="text-[10px] text-dim font-mono leading-relaxed">
          添加你的消费习惯与分类偏好，帮助 AI 更准确理解你的记账方式。
          这段内容会作为补充上下文注入提示词。
        </p>
      </div>

      {/* 输入区域 */}
      <div className="space-y-4">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={userContext}
            onChange={(e) => setUserContext(e.target.value)}
            maxLength={MAX_SELF_DESCRIPTION_LENGTH}
            placeholder={`示例：\n我经常把星巴克归到餐饮，因为大多是在开会时购买咖啡。\n\n交通费用中，50 元以下归为“日常通勤”，50 元以上归为“出行”。`}
            className="w-full min-h-[200px] p-4 bg-zinc-950 border border-gray-700 rounded
              text-xs font-mono text-gray-200 placeholder:text-gray-600
              focus:border-pixel-green focus:outline-none resize-none
              leading-relaxed"
            style={{ fieldSizing: 'content' }}
          />
          {/* 字符计数 */}
          <div className="absolute bottom-2 right-2 text-[10px] text-dim font-mono">
            {userContext.length} / {MAX_SELF_DESCRIPTION_LENGTH}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <button
            onClick={handleClear}
            disabled={isSaving || userContext.length === 0}
            className="px-4 py-2 border border-gray-700 rounded text-xs font-mono text-dim
              hover:border-gray-500 hover:text-white transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            [CLEAR]
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex-1 px-4 py-2 rounded text-xs font-mono transition-all
              ${saveStatus === 'success'
                ? 'bg-pixel-green/20 border border-pixel-green text-pixel-green'
                : saveStatus === 'error'
                  ? 'bg-expense-red/20 border border-expense-red text-expense-red'
                  : 'bg-pixel-green/10 border border-pixel-green/50 text-pixel-green hover:bg-pixel-green/20'
              }
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isSaving ? '[SAVING...]' :
             saveStatus === 'success' ? '[SAVED]' :
             saveStatus === 'error' ? '[ERROR]' : '[SAVE]'}
          </button>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="mt-8 p-4 bg-zinc-950/50 border border-gray-800 rounded">
        <div className="text-[10px] text-dim font-mono leading-relaxed space-y-2">
          <div>
            <span className="text-pixel-green">[USAGE_TIPS]</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-gray-500">
            <li>描述你的消费习惯和分类偏好</li>
            <li>说明你希望长期遵循的特殊分类规则</li>
            <li>可提及常见商户及对应分类方式</li>
            <li>建议精炼表达（推荐控制在 500 字以内）</li>
          </ul>
        </div>
      </div>

      {/* 隔离说明 */}
      <div className="mt-4 p-4 bg-zinc-950/50 border border-gray-800 rounded">
        <div className="text-[10px] text-dim font-mono leading-relaxed">
          <span className="text-alipay-blue">[ISOLATION_NOTE]</span>
          <br />
          用户自述与系统提示词、交易数据相互隔离。
          它仅用于补充 AI 理解，不会改变规则引擎优先级。
        </div>
      </div>

      {/* 底部垫片 */}
      <div className="h-4" />
    </motion.div>
  );
};

interface CategoryManagementPanelProps {
  onBack: () => void;
  transition: Transition;
}

const CategoryManagementPanel: React.FC<CategoryManagementPanelProps> = ({ onBack, transition }) => {
  const [categories, setCategories] = useState<Array<{ name: string; description: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; text: string }>({
    type: 'idle',
    text: ''
  });

  /**
   * 渐进式重分类对话框状态
   * - dialogMode: 操作类型（add / delete / update_desc）
   * - dialogCategory: 操作涉及的标签名
   * - dialogAffectedDates: delete 模式下前置改写已计算的受影响日期
   */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<ReclassifyMode>('add');
  const [dialogCategory, setDialogCategory] = useState<string | undefined>(undefined);
  const [dialogAffectedDates, setDialogAffectedDates] = useState<string[]>([]);
  const [editorMode, setEditorMode] = useState<'rename' | 'edit_desc' | 'delete' | null>(null);
  const [editorTarget, setEditorTarget] = useState<string>('');
  const [editorName, setEditorName] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [isEditorSubmitting, setIsEditorSubmitting] = useState(false);

  const loadCategories = useCallback(async () => {
    const service = LedgerService.getInstance();
    const categoryMap = service.getCategories();
    const items = Object.entries(categoryMap).map(([name, description]) => ({
      name,
      description
    }));
    setCategories(items);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        await loadCategories();
      } finally {
        setIsLoading(false);
      }
    };
    void init();
  }, [loadCategories]);

  const showStatus = useCallback((type: 'success' | 'error', text: string) => {
    setStatus({ type, text });
    setTimeout(() => {
      setStatus((prev) => (prev.text === text ? { type: 'idle', text: '' } : prev));
    }, 2500);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorMode(null);
    setEditorTarget('');
    setEditorName('');
    setEditorDescription('');
    setIsEditorSubmitting(false);
  }, []);

  /**
   * 新增标签：先完成标签写入，再弹出范围确认对话框
   */
  const handleAdd = useCallback(async () => {
    const service = LedgerService.getInstance();
    const result = await service.addCategory(newName, newDescription);
    if (!result.success) {
      showStatus('error', '新增标签失败，请检查名称格式（支持中文/小写字母/数字/下划线）');
      return;
    }
    await triggerHaptic(HapticFeedbackLevel.MEDIUM);
    setNewName('');
    setNewDescription('');
    await loadCategories();
    showStatus('success', '标签已新增');
    // 弹出范围确认对话框（模式 A：新增标签）
    setDialogMode('add');
    setDialogCategory(undefined);
    setDialogAffectedDates([]);
    setDialogOpen(true);
  }, [newDescription, newName, loadCategories, showStatus]);

  /**
   * 重命名标签：v5.1 冻结口径 —— 只改名，不触发重分类，不弹范围确认
   */
  const handleRename = useCallback(async () => {
    if (!editorTarget || !editorName.trim()) {
      return;
    }
    setIsEditorSubmitting(true);
    const service = LedgerService.getInstance();
    const result = await service.renameCategory(editorTarget, editorName);
    if (!result.success) {
      setIsEditorSubmitting(false);
      showStatus('error', '重命名失败，请检查名称格式或是否重复');
      return;
    }
    await triggerHaptic(HapticFeedbackLevel.MEDIUM);
    await loadCategories();
    showStatus('success', `已将 [${editorTarget}] 重命名为 [${editorName.toLowerCase().trim()}]`);
    closeEditor();
  }, [closeEditor, editorName, editorTarget, loadCategories, showStatus]);

  /**
   * 修改标签描述：先完成描述写入，再弹出范围确认对话框
   */
  const handleUpdateDescription = useCallback(async () => {
    if (!editorTarget) {
      return;
    }
    setIsEditorSubmitting(true);
    const service = LedgerService.getInstance();
    const result = await service.updateCategoryDescription(editorTarget, editorDescription);
    if (!result.success) {
      setIsEditorSubmitting(false);
      showStatus('error', '更新说明失败，请稍后重试');
      return;
    }
    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    await loadCategories();
    showStatus('success', `标签 [${editorTarget}] 说明已更新`);
    const updatedCategory = editorTarget;
    closeEditor();
    setDialogMode('update_desc');
    setDialogCategory(updatedCategory);
    setDialogAffectedDates([]);
    setDialogOpen(true);
  }, [closeEditor, editorDescription, editorTarget, loadCategories, showStatus]);

  /**
   * 删除标签：先完成删除与前置改写，再弹出范围确认对话框
   * 前置改写（重置分类+解锁+清理实例库）在 deleteCategory 内部同步完成。
   */
  const handleDelete = useCallback(async () => {
    if (!editorTarget) {
      return;
    }
    setIsEditorSubmitting(true);
    const service = LedgerService.getInstance();
    const result = await service.deleteCategory(editorTarget);
    if (!result.success) {
      setIsEditorSubmitting(false);
      showStatus('error', '删除失败，请稍后重试');
      return;
    }
    await triggerHaptic(HapticFeedbackLevel.HEAVY);
    await loadCategories();
    showStatus('success', `标签已删除，受影响交易 ${result.affectedTxIds.length} 条`);
    const deletedCategory = editorTarget;
    closeEditor();
    setDialogMode('delete');
    setDialogCategory(deletedCategory);
    setDialogAffectedDates(result.dirtyDates);
    setDialogOpen(true);
  }, [closeEditor, editorTarget, loadCategories, showStatus]);

  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 50, opacity: 0 }}
      transition={transition}
      className="absolute inset-0 overflow-y-auto p-6"
    >
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-dim text-xs font-mono mb-6 hover:text-white transition-colors"
      >
        <span>‹</span>
        <span>[BACK_TO_SETTINGS]</span>
      </button>

      <div className="mb-6 p-4 bg-zinc-950 border border-gray-800 rounded space-y-3">
        <div className="text-[10px] text-dim font-mono tracking-wider">[ADD_CATEGORY]</div>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={LedgerService.CATEGORY_NAME_MAX_LENGTH}
          placeholder="标签名（支持中文/小写字母/数字/下划线）"
          className="w-full px-4 py-3 bg-black/30 border border-gray-700 rounded
            text-xs font-mono text-gray-200 placeholder:text-gray-600
            focus:border-pixel-green focus:outline-none"
        />
        <input
          type="text"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          maxLength={LedgerService.CATEGORY_DESCRIPTION_MAX_LENGTH}
          placeholder="标签说明（可选）"
          className="w-full px-4 py-3 bg-black/30 border border-gray-700 rounded
            text-xs font-mono text-gray-200 placeholder:text-gray-600
            focus:border-pixel-green focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="w-full py-2.5 border border-pixel-green/50 rounded text-xs font-mono text-pixel-green
            hover:bg-pixel-green/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          [ADD]
        </button>
      </div>

      {editorMode && (
        <div className="mb-6 p-4 bg-zinc-950 border border-pixel-green/30 rounded space-y-3">
          <div className="text-[10px] text-pixel-green font-mono tracking-wider">
            {editorMode === 'rename' ? '[RENAME_CATEGORY]' : editorMode === 'edit_desc' ? '[EDIT_CATEGORY_DESC]' : '[DELETE_CATEGORY]'}
          </div>
          <div className="text-[11px] font-mono text-dim break-all">
            当前标签：[{editorTarget}]
          </div>

          {editorMode === 'rename' && (
            <input
              type="text"
              value={editorName}
              onChange={(e) => setEditorName(e.target.value)}
              maxLength={LedgerService.CATEGORY_NAME_MAX_LENGTH}
              placeholder="新标签名（支持中文/小写字母/数字/下划线）"
              className="w-full px-4 py-3 bg-black/30 border border-gray-700 rounded text-xs font-mono text-gray-200 placeholder:text-gray-600 focus:border-pixel-green focus:outline-none"
            />
          )}

          {editorMode === 'edit_desc' && (
            <textarea
              value={editorDescription}
              onChange={(e) => setEditorDescription(e.target.value)}
              maxLength={LedgerService.CATEGORY_DESCRIPTION_MAX_LENGTH}
              placeholder="新的标签说明"
              rows={4}
              className="w-full px-4 py-3 bg-black/30 border border-gray-700 rounded text-xs font-mono text-gray-200 placeholder:text-gray-600 focus:border-pixel-green focus:outline-none resize-none"
            />
          )}

          {editorMode === 'delete' && (
            <div className="text-[11px] font-mono text-expense-red leading-relaxed">
              删除后，该标签下条目会被重置为未分类，并在下一步由你决定是否立即重新分类。
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={closeEditor}
              disabled={isEditorSubmitting}
              className="flex-1 py-2 border border-gray-700 rounded text-[11px] font-mono text-dim hover:border-gray-500 transition-colors disabled:opacity-40"
            >
              [CANCEL]
            </button>
            <button
              onClick={() => {
                if (editorMode === 'rename') {
                  void handleRename();
                  return;
                }
                if (editorMode === 'edit_desc') {
                  void handleUpdateDescription();
                  return;
                }
                void handleDelete();
              }}
              disabled={
                isEditorSubmitting ||
                (editorMode === 'rename' && !editorName.trim()) ||
                (editorMode === 'edit_desc' && editorDescription === undefined)
              }
              className={`flex-1 py-2 border rounded text-[11px] font-mono transition-colors disabled:opacity-40 ${
                editorMode === 'delete'
                  ? 'border-expense-red/40 text-expense-red hover:bg-expense-red/10'
                  : 'border-pixel-green/40 text-pixel-green hover:bg-pixel-green/10'
              }`}
            >
              {editorMode === 'rename' ? '[SAVE_RENAME]' : editorMode === 'edit_desc' ? '[SAVE_DESC]' : '[CONFIRM_DELETE]'}
            </button>
          </div>
        </div>
      )}

      {status.text && (
        <div className={`mb-4 px-3 py-2 rounded text-xs font-mono ${
          status.type === 'success' ? 'text-pixel-green bg-pixel-green/5 border border-pixel-green/30' : 'text-expense-red bg-expense-red/5 border border-expense-red/30'
        }`}>
          {status.text}
        </div>
      )}

      {isLoading ? (
        <div className="text-dim text-xs font-mono">[LOADING_CATEGORIES...]</div>
      ) : categories.length === 0 ? (
        <div className="text-xs font-mono text-gray-500">当前账本暂无标签</div>
      ) : (
        <div className="space-y-3">
          {categories.map((item) => (
            <div key={item.name} className="p-4 bg-zinc-950 border border-gray-800 rounded">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-mono text-income-yellow break-all">[{item.name}]</div>
                  <div className="text-[10px] font-mono text-dim mt-1 break-words">
                    {item.description || '暂无说明'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setEditorMode('rename');
                      setEditorTarget(item.name);
                      setEditorName(item.name);
                      setEditorDescription('');
                    }}
                    className="px-2 py-1.5 border border-gray-700 rounded text-[10px] font-mono text-gray-300 hover:border-gray-500"
                  >
                    [RENAME]
                  </button>
                  <button
                    onClick={() => {
                      setEditorMode('edit_desc');
                      setEditorTarget(item.name);
                      setEditorName('');
                      setEditorDescription(item.description);
                    }}
                    className="px-2 py-1.5 border border-gray-700 rounded text-[10px] font-mono text-gray-300 hover:border-gray-500"
                  >
                    [EDIT_DESC]
                  </button>
                  <button
                    onClick={() => {
                      setEditorMode('delete');
                      setEditorTarget(item.name);
                      setEditorName('');
                      setEditorDescription('');
                    }}
                    disabled={item.name === 'others'}
                    className="px-2 py-1.5 border rounded text-[10px] font-mono transition-colors
                      text-expense-red border-expense-red/30 hover:bg-expense-red/10
                      disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    [DELETE]
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-zinc-950/50 border border-gray-800 rounded">
        <div className="text-[10px] text-dim font-mono leading-relaxed">
          <span className="text-alipay-blue">[CATEGORY_POLICY]</span>
          <br />
          删除标签后，关联交易会被重置为未分类并强制解锁；标签名支持中文、小写字母、数字和下划线；others 会固定排在最后。
          修改标签说明后，可选择暂不重分类，或立即对该标签下所有未锁定条目执行重置与入队。
        </div>
      </div>

      <div className="h-4" />

      {/* 渐进式重分类范围确认对话框 */}
      <ReclassifyConfirmDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode={dialogMode}
        categoryName={dialogCategory}
        affectedDirtyDates={dialogAffectedDates}
      />
    </motion.div>
  );
};

/**
 * AI 记忆面板组件
 * 显示当前记忆内容、修正计数、学习阈值配置和历史版本
 */
interface AIMemoryPanelProps {
  ledgerName: string;
  onBack: () => void;
  transition: Transition;
}

const AIMemoryPanel: React.FC<AIMemoryPanelProps> = ({
  ledgerName,
  onBack,
  transition
}) => {
  const [memories, setMemories] = useState<string[]>([]);
  const [exampleCount, setExampleCount] = useState(0);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [currentSnapshotId, setCurrentSnapshotId] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(5);
  const [isLoading, setIsLoading] = useState(true);
  const [isLearning, setIsLearning] = useState(false);
  const [learnResult, setLearnResult] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);
  const [editingMemories, setEditingMemories] = useState<string[]>([]);
  const [isSavingMemories, setIsSavingMemories] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotContent | null>(null);

  const loadPanelData = useCallback(async () => {
    const [mems, stats, snaps, currentSnapId] = await Promise.all([
      MemoryManager.load(ledgerName),
      ExampleStore.getStats(ledgerName),
      SnapshotManager.list(ledgerName),
      SnapshotManager.findMatchingSnapshot(ledgerName)
    ]);

    let finalSnapshots = snaps;
    let finalCurrentSnapshotId = currentSnapId;

    if (!finalCurrentSnapshotId) {
      const baselineId = await SnapshotManager.create(
        ledgerName,
        mems.map((m, i) => `${i + 1}. ${m}`).join('\n'),
        'manual',
        mems.length > 0 ? `基线快照：${mems.length} 条记忆` : '基线快照：空记忆'
      );
      if (baselineId) {
        finalCurrentSnapshotId = baselineId;
        finalSnapshots = await SnapshotManager.list(ledgerName);
      }
    }

    setMemories(mems);
    setEditingMemories(mems);
    setExampleCount(stats.count);
    setSnapshots(finalSnapshots);
    setCurrentSnapshotId(finalCurrentSnapshotId);
  }, [ledgerName]);

  // 加载数据
  useEffect(() => {
    const loadData = async () => {
      try {
        await loadPanelData();
      } catch (e) {
        console.error('[AIMemoryPanel] Failed to load data:', e);
      } finally {
        setIsLoading(false);
      }
    };
    void loadData();
  }, [ledgerName, loadPanelData]);

  // 立即学习
  const handleLearn = useCallback(async () => {
    setIsLearning(true);
    setLearnResult('');
    await triggerHaptic(HapticFeedbackLevel.LIGHT);

    try {
      const categories = LedgerService.getInstance().getCategories();

      const result = await LearningSession.run(ledgerName, categories);

      if (result.success) {
        setLearnResult(result.summary || '学习完成');
        await loadPanelData();
        // 使用返回的快照 ID 作为当前快照（如果没有则尝试查找匹配）
        if (result.snapshotId) {
          setCurrentSnapshotId(result.snapshotId);
        } else {
          const currentSnapId = await SnapshotManager.findMatchingSnapshot(ledgerName);
          setCurrentSnapshotId(currentSnapId);
        }
        await triggerHaptic(HapticFeedbackLevel.MEDIUM);
      } else {
        setLearnResult(`学习失败: ${result.error || '未知错误'}`);
      }
    } catch (e) {
      console.error('[AIMemoryPanel] Learning failed:', e);
      setLearnResult('学习失败');
    } finally {
      setIsLearning(false);
    }
  }, [ledgerName, loadPanelData]);

  // 回退到指定版本
  const handleRollback = useCallback(async (snapshotId: string) => {
    console.log(`[SettingsPage] 点击激活按钮: ${snapshotId}`);
    if (!confirm(`确定要切换到 ${snapshotId} 吗？`)) {
      console.log('[SettingsPage] 用户取消回退');
      return;
    }

    console.log(`[SettingsPage] 开始回退到 ${snapshotId}...`);
    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    const success = await SnapshotManager.rollback(ledgerName, snapshotId);
    console.log(`[SettingsPage] 回退结果: ${success ? '成功' : '失败'}`);

    if (success) {
      await loadPanelData();
      setCurrentSnapshotId(snapshotId);
      setSelectedSnapshot(null);
      console.log(`[SettingsPage] 已更新记忆和快照列表，当前快照: ${snapshotId}`);
      await triggerHaptic(HapticFeedbackLevel.MEDIUM);
      alert(`已切换到 ${snapshotId}`);
    } else {
      alert('回退失败，请查看控制台日志');
    }
  }, [ledgerName, loadPanelData]);

  // 删除快照
  const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
    const isCurrent = snapshotId === currentSnapshotId;
    if (isCurrent) {
      alert('当前激活快照不可删除');
      return;
    }

    const confirmMsg = isCurrent
      ? `确定要删除 ${snapshotId} 吗？\n这是当前活跃的快照，删除后当前记忆将不再与任何快照关联。`
      : `确定要删除 ${snapshotId} 吗？\n删除后无法恢复。`;

    if (!confirm(confirmMsg)) return;

    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    const success = await SnapshotManager.delete(ledgerName, snapshotId);

    if (success) {
      await loadPanelData();
      if (selectedSnapshot?.id === snapshotId) {
        setSelectedSnapshot(null);
      }
      await triggerHaptic(HapticFeedbackLevel.MEDIUM);
    }
  }, [ledgerName, currentSnapshotId, loadPanelData, selectedSnapshot?.id]);

  const handlePreviewSnapshot = useCallback(async (snapshotId: string) => {
    const snap = await SnapshotManager.read(ledgerName, snapshotId);
    if (!snap) {
      alert('读取快照详情失败');
      return;
    }
    setSelectedSnapshot(snap);
  }, [ledgerName]);

  const updateMemoryLine = useCallback((index: number, value: string) => {
    setEditingMemories(prev => prev.map((item, i) => (i === index ? value : item)));
  }, []);

  const addMemoryLine = useCallback(() => {
    setEditingMemories(prev => [...prev, '']);
  }, []);

  const removeMemoryLine = useCallback((index: number) => {
    setEditingMemories(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSaveMemories = useCallback(async () => {
    setIsSavingMemories(true);
    try {
      const normalized = editingMemories.map(item => item.trim()).filter(item => item.length > 0);
      await MemoryManager.save(ledgerName, normalized);
      const newSnapshotId = await SnapshotManager.create(
        ledgerName,
        normalized.map((m, i) => `${i + 1}. ${m}`).join('\n'),
        'user_edit',
        normalized.length > 0 ? `手动编辑记忆：${normalized.length} 条` : '手动编辑记忆：空记忆'
      );
      await loadPanelData();
      if (newSnapshotId) {
        setCurrentSnapshotId(newSnapshotId);
      }
      setSelectedSnapshot(null);
      await triggerHaptic(HapticFeedbackLevel.MEDIUM);
    } catch (e) {
      console.error('[AIMemoryPanel] Failed to save memories:', e);
      alert('保存记忆失败，请重试');
    } finally {
      setIsSavingMemories(false);
    }
  }, [editingMemories, ledgerName, loadPanelData]);

  if (isLoading) {
    return (
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 50, opacity: 0 }}
        transition={transition}
        className="absolute inset-0 flex items-center justify-center"
      >
        <div className="text-dim text-xs font-mono">[LOADING...]</div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 50, opacity: 0 }}
      transition={transition}
      className="absolute inset-0 overflow-y-auto p-6"
    >
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-dim text-xs font-mono mb-6
          hover:text-white transition-colors"
      >
        <span>‹</span>
        <span>[BACK_TO_SETTINGS]</span>
      </button>

      {/* 标题 */}
      <div className="mb-6">
        <h3 className="text-sm font-mono text-gray-200 mb-2">[AI_MEMORY]</h3>
        <p className="text-[10px] text-dim font-mono leading-relaxed">
          AI 从您的修正行为中学习的分类模式。
        </p>
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-zinc-950 border border-gray-800 rounded text-center">
          <div className="text-2xl font-mono text-pixel-green">{exampleCount}</div>
          <div className="text-[10px] text-dim font-mono mt-1">修正记录</div>
        </div>
        <div className="p-4 bg-zinc-950 border border-gray-800 rounded text-center">
          <div className="text-2xl font-mono text-pixel-green">{memories.length}</div>
          <div className="text-[10px] text-dim font-mono mt-1">学习条目</div>
        </div>
      </div>

      {/* 立即学习按钮 */}
      <div className="mb-6">
        <button
          onClick={handleLearn}
          disabled={isLearning || exampleCount === 0}
          className={`w-full py-3.5 rounded font-mono text-sm tracking-wider transition-all duration-200
            ${isLearning
              ? 'bg-zinc-950 border border-gray-600 text-gray-400 cursor-wait'
              : exampleCount === 0
                ? 'bg-gray-800/50 border border-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-pixel-green/20 border border-pixel-green text-pixel-green hover:bg-pixel-green/30'
            }`}
        >
          {isLearning ? '[LEARNING...]' : '[LEARN_NOW]'}
        </button>

        {learnResult && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 text-xs font-mono text-center py-2 rounded bg-pixel-green/10 text-pixel-green"
          >
            {learnResult}
          </motion.div>
        )}
      </div>

      {/* 学习阈值配置 */}
      <div className="mb-6 p-4 bg-zinc-950 border border-gray-800 rounded">
        <div className="text-[10px] text-dim font-mono mb-3 tracking-wider">
          [LEARNING_THRESHOLD]
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="20"
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value))}
            className="flex-1 accent-pixel-green"
          />
          <span className="text-sm font-mono text-pixel-green w-8 text-center">
            {threshold}
          </span>
        </div>
        <div className="text-[10px] text-gray-500 font-mono mt-2">
          累计 {threshold} 条修正后自动触发学习
        </div>
      </div>

      {/* 当前记忆内容 */}
      <div className="mb-6">
        <div className="text-[10px] text-dim font-mono mb-3 tracking-wider">
          [CURRENT_MEMORY]
        </div>
        {editingMemories.length === 0 ? (
          <div className="space-y-3">
            <div className="p-4 bg-zinc-950 border border-gray-800 rounded text-center">
              <div className="text-xs font-mono text-gray-500">暂无记忆</div>
            </div>
            <button
              onClick={addMemoryLine}
              className="w-full py-2 text-xs font-mono border border-gray-700 rounded text-gray-300
                hover:border-gray-500 transition-colors"
            >
              [ADD_MEMORY]
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {editingMemories.map((mem, index) => (
              <div key={index} className="p-3 bg-zinc-950 border border-gray-800 rounded">
                <div className="flex items-start gap-2">
                  <span className="text-pixel-green text-xs font-mono mt-2 shrink-0">{index + 1}.</span>
                  <textarea
                    value={mem}
                    onChange={(e) => updateMemoryLine(index, e.target.value)}
                    className="flex-1 min-h-[64px] p-2 bg-black/30 border border-gray-700 rounded
                      text-xs font-mono text-gray-200 focus:border-pixel-green focus:outline-none
                      resize-y leading-relaxed"
                  />
                  <button
                    onClick={() => removeMemoryLine(index)}
                    className="px-2 py-1.5 text-[10px] font-mono text-gray-500 border border-gray-700 rounded
                      hover:text-expense-red hover:border-expense-red/30 transition-colors"
                  >
                    [DEL]
                  </button>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <button
                onClick={addMemoryLine}
                className="flex-1 py-2 text-xs font-mono border border-gray-700 rounded text-gray-300
                  hover:border-gray-500 transition-colors"
              >
                [ADD_MEMORY]
              </button>
              <button
                onClick={handleSaveMemories}
                disabled={isSavingMemories}
                className={`flex-1 py-2 text-xs font-mono rounded border transition-colors ${
                  isSavingMemories
                    ? 'text-gray-500 border-gray-700 cursor-not-allowed'
                    : 'text-pixel-green border-pixel-green/50 hover:bg-pixel-green/10'
                }`}
              >
                {isSavingMemories ? '[SAVING...]' : '[SAVE_MEMORY]'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 历史版本入口 */}
      <div className="mb-6">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full py-3 border border-gray-700 rounded text-xs font-mono text-gray-300
            hover:border-gray-500 transition-colors"
        >
          {showHistory ? '[HIDE_HISTORY]' : `[VIEW_HISTORY (${snapshots.length})]`}
        </button>

        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 space-y-2"
          >
            {snapshots.length === 0 ? (
              <div className="p-4 bg-zinc-950 border border-gray-800 rounded text-center">
                <div className="text-xs font-mono text-gray-500">暂无历史版本</div>
              </div>
            ) : (
              snapshots.slice(0, 10).map((snap) => {
                const isCurrent = snap.id === currentSnapshotId;
                return (
                  <div
                    key={snap.id}
                    className={`p-3 bg-zinc-950 border rounded flex items-center justify-between ${
                      isCurrent ? 'border-pixel-green' : 'border-gray-800'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono ${isCurrent ? 'text-pixel-green' : 'text-gray-300'}`}>
                          {snap.id}
                          {isCurrent && ' ← 当前'}
                        </span>
                      </div>
                      <div className="text-[10px] text-dim font-mono mt-1">
                        {new Date(snap.timestamp).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono truncate">
                        {snap.summary}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <button
                        onClick={() => handlePreviewSnapshot(snap.id)}
                        className="px-3 py-1.5 text-[10px] font-mono border border-gray-700 rounded
                          text-gray-300 hover:border-gray-500 transition-colors"
                      >
                        [VIEW]
                      </button>
                      <button
                        onClick={() => handleRollback(snap.id)}
                        disabled={isCurrent}
                        className={`px-3 py-1.5 text-[10px] font-mono border rounded transition-colors ${
                          isCurrent
                            ? 'text-gray-600 border-gray-700 cursor-not-allowed'
                            : 'text-expense-red border-expense-red/30 hover:bg-expense-red/10'
                        }`}
                        title={isCurrent ? '当前已在此版本' : undefined}
                      >
                        {isCurrent ? '[ACTIVE]' : '[SELECT]'}
                      </button>
                      <button
                        onClick={() => handleDeleteSnapshot(snap.id)}
                        disabled={isCurrent}
                        className={`px-2 py-1.5 text-[10px] font-mono border rounded transition-colors ${
                          isCurrent
                            ? 'text-gray-600 border-gray-700 cursor-not-allowed'
                            : 'text-gray-500 border-gray-700 hover:text-expense-red hover:border-expense-red/30'
                        }`}
                        title={isCurrent ? '当前激活快照不可删除' : '删除此快照'}
                      >
                        [X]
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </motion.div>
        )}
      </div>

      {selectedSnapshot && (
        <div className="mb-6 p-4 bg-zinc-950 border border-gray-800 rounded">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-dim font-mono tracking-wider">
              [SNAPSHOT_DETAIL: {selectedSnapshot.id}]
            </div>
            <button
              onClick={() => setSelectedSnapshot(null)}
              className="text-[10px] font-mono text-gray-500 hover:text-white transition-colors"
            >
              [CLOSE]
            </button>
          </div>
          <div className="text-[10px] text-gray-500 font-mono mb-3">
            {new Date(selectedSnapshot.timestamp).toLocaleString()}
          </div>
          {selectedSnapshot.content.length === 0 ? (
            <div className="text-xs font-mono text-gray-500">该快照为空记忆</div>
          ) : (
            <div className="space-y-2">
              {selectedSnapshot.content.map((line, index) => (
                <div key={`${selectedSnapshot.id}-${index}`} className="text-xs font-mono text-gray-300 leading-relaxed">
                  <span className="text-pixel-green mr-2">{index + 1}.</span>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 底部垫片 */}
      <div className="h-4" />
    </motion.div>
  );
};

/**
 * 设置分类区域组件
 */
interface SettingCategorySectionProps {
  category: SettingCategory;
  delay: number;
}

const SettingCategorySection: React.FC<SettingCategorySectionProps> = ({
  category,
  delay
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
    >
      {/* 分类标题 */}
      <div className="text-dim text-[10px] font-mono tracking-wider mb-3 px-1">
        {category.title}
      </div>

      {/* 设置项列表 */}
      <div className="bg-zinc-950 rounded border border-gray-800 overflow-hidden">
        {category.items.map((item, index) => (
          <SettingItemRow
            key={item.id}
            item={item}
            index={index}
            delay={delay + index * 0.03}
            isLast={index === category.items.length - 1}
          />
        ))}
      </div>
    </motion.div>
  );
};

/**
 * 设置项行组件
 */
interface SettingItemRowProps {
  item: SettingItem;
  index: number;
  delay: number;
  isLast: boolean;
}

const SettingItemRow: React.FC<SettingItemRowProps> = ({
  item,
  delay,
  isLast
}) => {
  const handleClick = async () => {
    if (item.onClick) {
      await triggerHaptic(HapticFeedbackLevel.LIGHT);
      item.onClick();
    }
  };

  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      onClick={handleClick}
      className={`
        w-full flex items-center gap-4 px-4 py-3.5
        transition-colors duration-150
        hover:bg-white/5
        active:bg-white/10
        ${!isLast ? 'border-b border-gray-800/50' : ''}
      `}
      style={{ willChange: 'opacity, transform' }}
    >
      {/* 左侧像素图标 */}
      <div className="flex-shrink-0">
        {item.icon}
      </div>

      {/* 中间标签 */}
      <span className={`
        flex-1 text-left text-sm font-mono
        ${item.danger ? 'text-expense-red' : 'text-gray-200'}
      `}>
        {item.label}
      </span>

      {/* 右侧值或箭头 */}
      {item.value ? (
        <span className="text-xs font-mono text-pixel-green">
          {item.value}
        </span>
      ) : (
        <span className={`
          text-lg font-mono transition-transform duration-200
          group-hover:translate-x-1
          ${item.danger ? 'text-expense-red' : 'text-dim'}
        `}>
          ›
        </span>
      )}
    </motion.button>
  );
};

/**
 * 预算配置面板组件
 *
 * 提供月度总预算配置 + 分类预算配置（按规格 §7.2/7.3）。
 * 保存后立即通过 BudgetManager 写入沙箱 budget_config/{ledger}.json。
 */
interface BudgetConfigPanelProps {
  ledgerName: string;
  onBack: () => void;
  transition: Transition;
}

const BudgetConfigPanel: React.FC<BudgetConfigPanelProps> = ({ ledgerName, onBack, transition }) => {
  const { BudgetManager } = React.useMemo(() => {
    // 动态导入避免循环依赖
    const { BudgetManager: BM } = require('@logic/application/services/BudgetManager') as typeof import('@logic/application/services/BudgetManager');
    return { BudgetManager: BM };
  }, []);

  const service = LedgerService.getInstance();

  // ── 月度总预算 ────────────────────────────────
  const [monthlyAmountInput, setMonthlyAmountInput] = useState('');
  const [monthlySaving, setMonthlySaving] = useState(false);
  const [monthlySaved, setMonthlySaved] = useState(false);

  // ── 分类预算 ──────────────────────────────────
  // key = 分类键名，value = 输入框字符串
  const [categoryAmounts, setCategoryAmounts] = useState<Record<string, string>>({});
  const [categorySaving, setCategorySaving] = useState(false);
  const [categorySaved, setCategorySaved] = useState(false);
  const [categoryBudgetInvalidated, setCategoryBudgetInvalidated] = useState(false);

  // 当前账本的分类列表
  const categories = React.useMemo(() => {
    const catMap = service.getState().ledgerMemory?.defined_categories ?? {};
    return Object.keys(catMap);
  }, [service]);

  // 初始化：从 BudgetManager 读取现有配置
  useEffect(() => {
    let cancelled = false;
    BudgetManager.getInstance().loadBudgetConfig(ledgerName).then((config) => {
      if (cancelled) return;
      if (config?.monthly?.amount && config.monthly.amount > 0) {
        setMonthlyAmountInput(String(config.monthly.amount));
      }
      if (config?.categoryBudgets) {
        const initial: Record<string, string> = {};
        for (const [key, entry] of Object.entries(config.categoryBudgets)) {
          initial[key] = String(entry.amount);
        }
        setCategoryAmounts(initial);
      } else if (config?.categoryBudgets === null && config?.categoryBudgetSchemaVersion > 0) {
        // null 且 schemaVersion > 0 表示曾经配置过但已因标签变更失效
        setCategoryBudgetInvalidated(true);
      }
    });
    return () => { cancelled = true; };
  }, [BudgetManager, ledgerName]);

  // 保存月度总预算
  const handleSaveMonthly = async () => {
    const amount = parseFloat(monthlyAmountInput);
    const budget = isNaN(amount) || amount <= 0 ? null : { amount, currency: 'CNY' };
    setMonthlySaving(true);
    try {
      await BudgetManager.getInstance().saveMonthlyBudget(ledgerName, budget);
      await triggerHaptic(HapticFeedbackLevel.LIGHT);
      setMonthlySaved(true);
      setTimeout(() => setMonthlySaved(false), 2000);
    } finally {
      setMonthlySaving(false);
    }
  };

  // 保存分类预算
  const handleSaveCategoryBudgets = async () => {
    // 总额校验：所有分类预算之和不超过月度总预算（若已设置）
    const monthlyAmount = parseFloat(monthlyAmountInput);
    const categoryEntries: Record<string, { amount: number }> = {};
    let categorySum = 0;
    for (const [key, val] of Object.entries(categoryAmounts)) {
      const amt = parseFloat(val);
      if (!isNaN(amt) && amt > 0) {
        categoryEntries[key] = { amount: amt };
        categorySum += amt;
      }
    }

    if (!isNaN(monthlyAmount) && monthlyAmount > 0 && categorySum > monthlyAmount) {
      alert(`分类预算合计 ¥${categorySum.toFixed(0)} 超过月度总预算 ¥${monthlyAmount.toFixed(0)}，请调整。`);
      return;
    }

    const config = await BudgetManager.getInstance().loadBudgetConfig(ledgerName);
    const schemaVersion = (config?.categoryBudgetSchemaVersion ?? 0);

    setCategorySaving(true);
    try {
      await BudgetManager.getInstance().saveCategoryBudgets(
        ledgerName,
        Object.keys(categoryEntries).length > 0 ? categoryEntries : null,
        schemaVersion
      );
      await triggerHaptic(HapticFeedbackLevel.LIGHT);
      setCategoryBudgetInvalidated(false);
      setCategorySaved(true);
      setTimeout(() => setCategorySaved(false), 2000);
    } finally {
      setCategorySaving(false);
    }
  };

  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 50, opacity: 0 }}
      transition={transition}
      className="absolute inset-0 overflow-y-auto p-6"
    >
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-mono text-pixel-green mb-6"
      >
        ‹ BACK
      </button>

      {/* 月度总预算区块 */}
      <div className="mb-8">
        <div className="text-[10px] font-mono text-dim mb-3 tracking-wider">MONTHLY_TOTAL_BUDGET</div>
        <div className="flex gap-2 items-center">
          <span className="text-gray-400 font-mono text-sm">¥</span>
          <input
            type="number"
            min="0"
            step="100"
            placeholder="留空表示不设置"
            value={monthlyAmountInput}
            onChange={(e) => setMonthlyAmountInput(e.target.value)}
            className="flex-1 bg-card/50 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-pixel-green/60"
          />
          <motion.button
            onClick={handleSaveMonthly}
            disabled={monthlySaving}
            whileTap={{ scale: 0.97 }}
            className={`px-4 py-2 text-xs font-mono rounded border transition-colors ${
              monthlySaved
                ? 'border-pixel-green text-pixel-green bg-pixel-green/10'
                : 'border-gray-600 text-gray-300 hover:border-pixel-green/60 hover:text-pixel-green'
            }`}
          >
            {monthlySaved ? 'SAVED' : monthlySaving ? '...' : 'SAVE'}
          </motion.button>
        </div>
        <div className="text-[10px] text-dim/60 font-mono mt-2">
          预算卡始终表达当前自然月，不跟随数据范围改变
        </div>
      </div>

      {/* 分类预算区块 */}
      <div>
        <div className="text-[10px] font-mono text-dim mb-3 tracking-wider">CATEGORY_BUDGETS</div>

        {/* 失效提示 */}
        {categoryBudgetInvalidated && (
          <div className="mb-4 p-3 bg-expense-red/10 border border-expense-red/30 rounded text-xs font-mono text-expense-red">
            标签结构已变更，分类预算已重置，请重新配置
          </div>
        )}

        {categories.length === 0 ? (
          <div className="text-xs font-mono text-dim/60">当前账本暂无分类</div>
        ) : (
          <>
            <div className="space-y-3 mb-4">
              {categories.map((cat) => (
                <div key={cat} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400 w-20 flex-shrink-0 truncate">{cat}</span>
                  <span className="text-gray-500 font-mono text-sm">¥</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    placeholder="不限"
                    value={categoryAmounts[cat] ?? ''}
                    onChange={(e) => setCategoryAmounts((prev) => ({ ...prev, [cat]: e.target.value }))}
                    className="flex-1 bg-card/50 border border-gray-700 rounded px-3 py-1.5 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-pixel-green/60"
                  />
                </div>
              ))}
            </div>
            <motion.button
              onClick={handleSaveCategoryBudgets}
              disabled={categorySaving}
              whileTap={{ scale: 0.97 }}
              className={`w-full py-2 text-xs font-mono rounded border transition-colors ${
                categorySaved
                  ? 'border-pixel-green text-pixel-green bg-pixel-green/10'
                  : 'border-gray-600 text-gray-300 hover:border-pixel-green/60 hover:text-pixel-green'
              }`}
            >
              {categorySaved ? 'SAVED' : categorySaving ? '...' : 'SAVE_CATEGORY_BUDGETS'}
            </motion.button>
            <div className="text-[10px] text-dim/60 font-mono mt-2">
              分类预算之和不超过月度总预算；标签新增/删除后分类预算会自动重置
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

/**
 * 3x3 像素图标组件
 */
interface PixelIconProps {
  color: 'pixel-green' | 'alipay-blue' | 'income-yellow' | 'expense-red' | 'text-dim';
  pattern?: 'default' | 'ai' | 'dark' | 'light';
  size?: 'sm' | 'md';
}

const PixelIcon: React.FC<PixelIconProps> = ({ color, pattern = 'default', size = 'md' }) => {
  const colorClasses = {
    'pixel-green': 'bg-pixel-green shadow-[0_0_6px_rgba(16,185,129,0.6)]',
    'alipay-blue': 'bg-alipay-blue shadow-[0_0_6px_rgba(14,165,233,0.6)]',
    'income-yellow': 'bg-income-yellow shadow-[0_0_6px_rgba(234,179,8,0.6)]',
    'expense-red': 'bg-expense-red shadow-[0_0_6px_rgba(239,68,68,0.6)]',
    'text-dim': 'bg-gray-500'
  };

  const dimensions = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';
  const gap = size === 'sm' ? 'gap-[1px]' : 'gap-0.5';

  // AI 模式：不同的像素图案
  if (pattern === 'ai') {
    return (
      <div className={`grid grid-cols-3 ${gap} ${dimensions}`}>
        {/* AI 图案：一个"大脑"形状 */}
        <div className={`w-full h-full ${colorClasses[color]} opacity-50`} />
        <div className={`w-full h-full ${colorClasses[color]}`} />
        <div className={`w-full h-full ${colorClasses[color]} opacity-50`} />
        <div className={`w-full h-full ${colorClasses[color]}`} />
        <div className={`w-full h-full ${colorClasses[color]} brightness-125`} />
        <div className={`w-full h-full ${colorClasses[color]}`} />
        <div className={`w-full h-full ${colorClasses[color]} opacity-50`} />
        <div className={`w-full h-full ${colorClasses[color]}`} />
        <div className={`w-full h-full ${colorClasses[color]} opacity-50`} />
      </div>
    );
  }

  // 暗黑模式图标：月亮形状
  if (pattern === 'dark') {
    return (
      <div className={`grid grid-cols-3 ${gap} ${dimensions}`}>
        <div className="w-full h-full bg-transparent" />
        <div className={`w-full h-full ${colorClasses[color]}`} />
        <div className={`w-full h-full ${colorClasses[color]} opacity-50`} />
        <div className={`w-full h-full ${colorClasses[color]} opacity-80`} />
        <div className={`w-full h-full ${colorClasses[color]}`} />
        <div className="w-full h-full bg-transparent" />
        <div className={`w-full h-full ${colorClasses[color]} opacity-50`} />
        <div className={`w-full h-full ${colorClasses[color]} opacity-80`} />
        <div className="w-full h-full bg-transparent" />
      </div>
    );
  }

  // 明亮模式图标：太阳形状
  if (pattern === 'light') {
    return (
      <div className={`grid grid-cols-3 ${gap} ${dimensions}`}>
        <div className={`w-full h-full ${colorClasses[color]} opacity-50`} />
        <div className={`w-full h-full ${colorClasses[color]}`} />
        <div className={`w-full h-full ${colorClasses[color]} opacity-50`} />
        <div className={`w-full h-full ${colorClasses[color]}`} />
        <div className={`w-full h-full ${colorClasses[color]} brightness-125`} />
        <div className={`w-full h-full ${colorClasses[color]}`} />
        <div className={`w-full h-full ${colorClasses[color]} opacity-50`} />
        <div className={`w-full h-full ${colorClasses[color]}`} />
        <div className={`w-full h-full ${colorClasses[color]} opacity-50`} />
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-3 ${gap} ${dimensions}`}>
      {[...Array(9)].map((_, i) => (
        <div
          key={i}
          className={`w-full h-full ${colorClasses[color]}`}
        />
      ))}
    </div>
  );
};
