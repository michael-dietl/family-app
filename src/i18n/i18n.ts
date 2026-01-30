import { createI18n } from 'vue-i18n';
import { messages } from './index';

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: 'de',
  fallbackLocale: 'de',
  messages
});

export default i18n;
