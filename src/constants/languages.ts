export type Language = {
  code: string;
  name: string;
  flag: string;
  bcp47: string;
};

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'ru', name: 'Russian', flag: '🇷🇺', bcp47: 'ru' },
  { code: 'he', name: 'Hebrew', flag: '🇮🇱', bcp47: 'he' },
  { code: 'en', name: 'English', flag: '🇬🇧', bcp47: 'en' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵', bcp47: 'ja' },
];

export const DEFAULT_LANGUAGE = 'en';
