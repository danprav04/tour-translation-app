import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../languages';

describe('Languages Constants', () => {
  it('should have supported languages defined', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThan(0);
    expect(SUPPORTED_LANGUAGES[0]).toHaveProperty('code');
    expect(SUPPORTED_LANGUAGES[0]).toHaveProperty('name');
    expect(SUPPORTED_LANGUAGES[0]).toHaveProperty('flag');
    expect(SUPPORTED_LANGUAGES[0]).toHaveProperty('bcp47');
  });

  it('should have english as default language', () => {
    expect(DEFAULT_LANGUAGE).toBe('en');
  });
});
