import { describe, it, expect } from 'vitest';
import { convertText } from '../t2s';

describe('convertText', () => {
  it('converts common traditional characters to simplified', () => {
    expect(convertText('來')).toBe('来');
    expect(convertText('後')).toBe('后');
    expect(convertText('書')).toBe('书');
    expect(convertText('語')).toBe('语');
    expect(convertText('體')).toBe('体');
    expect(convertText('傳')).toBe('传');
  });

  it('leaves simplified-only characters unchanged', () => {
    expect(convertText('来后书')).toBe('来后书');
  });

  it('converts mixed text correctly', () => {
    expect(convertText('繁體中文')).toBe('繁体中文');
  });

  it('leaves ASCII and punctuation unchanged', () => {
    expect(convertText('Hello, world!')).toBe('Hello, world!');
  });

  it('handles empty string', () => {
    expect(convertText('')).toBe('');
  });
});
