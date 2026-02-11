import { Preferences } from '@capacitor/preferences';

export const availableThemes = ['default', 'wine', 'forest', 'ocean'] as const;
export type AppTheme = (typeof availableThemes)[number];

const THEME_PREFERENCE_KEY = 'app_theme';

export const applyTheme = (theme: AppTheme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'default') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
};

export const loadTheme = async (): Promise<AppTheme> => {
  try {
    const result = await Preferences.get({ key: THEME_PREFERENCE_KEY });
    if (result.value && availableThemes.includes(result.value as AppTheme)) {
      return result.value as AppTheme;
    }
  } catch (error) {
    console.error('Error loading theme preference', error);
  }
  return 'default';
};

export const persistTheme = async (theme: AppTheme) => {
  try {
    await Preferences.set({ key: THEME_PREFERENCE_KEY, value: theme });
  } catch (error) {
    console.error('Error saving theme preference', error);
  }
};
