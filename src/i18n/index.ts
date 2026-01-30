import en from './en';
import de from './de';
import it from './it';
import fr from './fr';
import bar from './bar';

export const AVAILABLE_LOCALES = ['de', 'en', 'it', 'fr', 'bar'] as const;

export const messages = {
  en,
  de,
  it,
  fr,
  bar
};

export type LocaleKey = typeof AVAILABLE_LOCALES[number];
