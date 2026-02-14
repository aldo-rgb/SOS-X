import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

import es from './locales/es.json';
import en from './locales/en.json';
import zh from './locales/zh.json';

const resources = {
  es: { translation: es },
  en: { translation: en },
  zh: { translation: zh }
};

const LANGUAGE_KEY = '@entregax_language';

// Función para obtener el idioma guardado o detectar el del dispositivo
const getInitialLanguage = async (): Promise<string> => {
  try {
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (savedLanguage && ['es', 'en', 'zh'].includes(savedLanguage)) {
      return savedLanguage;
    }
  } catch (error) {
    console.log('Error reading language preference:', error);
  }
  
  // Si no hay idioma guardado, usar el del dispositivo
  const locales = getLocales();
  const deviceLanguage = locales[0]?.languageCode || 'es';
  return ['es', 'en', 'zh'].includes(deviceLanguage) ? deviceLanguage : 'es';
};

// Función para cambiar el idioma
export const changeLanguage = async (language: string) => {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, language);
    await i18n.changeLanguage(language);
  } catch (error) {
    console.error('Error saving language preference:', error);
  }
};

// Función para obtener el idioma actual
export const getCurrentLanguage = () => i18n.language || 'es';

// Inicializar i18n
const initI18n = async () => {
  const initialLanguage = await getInitialLanguage();
  
  await i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: initialLanguage,
      fallbackLng: 'es',
      interpolation: {
        escapeValue: false
      },
    });
};

// Inicializar inmediatamente
initI18n();

export default i18n;
