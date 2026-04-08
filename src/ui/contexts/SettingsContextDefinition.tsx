import { createContext } from 'react';

type Theme = 'dark' | 'light';

export interface SettingsContextType {
  theme: Theme;
  setTheme: (theme: Theme) => Promise<void>;
  isLoading: boolean;
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);
