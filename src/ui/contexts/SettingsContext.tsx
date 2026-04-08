import React, { useState, useEffect, useCallback } from 'react';
import { ConfigManager } from '@system/config/ConfigManager';
import { SettingsContext } from './SettingsContextDefinition';

type Theme = 'dark' | 'light';

const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [isLoading, setIsLoading] = useState(true);

  // 加载保存的设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const manager = ConfigManager.getInstance();
        const config = await manager.getConfig();

        const savedTheme = config.ui?.theme || 'dark';

        setThemeState(savedTheme);

        // 应用主题
        if (savedTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (e) {
        console.error('[SettingsContext] Failed to load settings:', e);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);

    // 立即应用主题
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    try {
      const manager = ConfigManager.getInstance();
      const config = await manager.getConfig();
      await manager.saveConfig({
        ui: { ...config.ui, theme: newTheme }
      });
    } catch (e) {
      console.error('[SettingsContext] Failed to save theme:', e);
    }
  }, []);

  return (
    <SettingsContext.Provider value={{
      theme,
      setTheme,
      isLoading,
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export { SettingsProvider };
