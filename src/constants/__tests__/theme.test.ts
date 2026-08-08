import { Theme, colors, typography, spacing, borderRadius, glassStyle } from '../theme';

describe('Theme Constants', () => {
  it('should have colors defined', () => {
    expect(colors.background).toBe('#0A0E1A');
    expect(Theme.colors).toEqual(colors);
  });

  it('should have typography defined', () => {
    expect(typography.family).toBe('Inter');
    expect(Theme.typography).toEqual(typography);
  });

  it('should have spacing defined', () => {
    expect(spacing.md).toBe(16);
    expect(Theme.spacing).toEqual(spacing);
  });

  it('should have borderRadius defined', () => {
    expect(borderRadius.lg).toBe(16);
    expect(Theme.borderRadius).toEqual(borderRadius);
  });

  it('should return valid glassStyle object', () => {
    const style = glassStyle();
    expect(style).toHaveProperty('backgroundColor', colors.surfaceGlass);
    expect(style).toHaveProperty('borderWidth', 1);
    expect(style).toHaveProperty('borderColor', colors.border);
    expect(style).toHaveProperty('borderRadius', borderRadius.lg);
    expect(Theme.glassStyle).toEqual(glassStyle);
  });
});
