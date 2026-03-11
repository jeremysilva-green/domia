import { create } from 'zustand';
import { getLocales } from 'expo-localization';
import { en, Translations } from './translations/en';
import { es } from './translations/es';

export type Language = 'en' | 'es';

interface I18nState {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const translations: Record<Language, Translations> = {
  en,
  es,
};

// Reads the device's system language. English device → 'en', everything else → 'es'.
// Defaults to Spanish since the app targets Paraguay.
function getDeviceLanguage(): Language {
  try {
    const locale = getLocales()[0]?.languageCode ?? 'es';
    return locale === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

const deviceLanguage = getDeviceLanguage();

export const useI18n = create<I18nState>()((set) => ({
  language: deviceLanguage,
  t: translations[deviceLanguage],
  setLanguage: (lang: Language) => {
    set({ language: lang, t: translations[lang] });
  },
}));

export { en, es };
export type { Translations };
