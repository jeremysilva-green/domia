import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

export const useI18n = create<I18nState>()(
  persist(
    (set, get) => ({
      language: 'en',
      t: en,
      setLanguage: (lang: Language) => {
        set({
          language: lang,
          t: translations[lang],
        });
      },
    }),
    {
      name: 'domus-language',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ language: state.language }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.t = translations[state.language];
        }
      },
    }
  )
);

export { en, es };
export type { Translations };
