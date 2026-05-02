import { describe, it, expect } from 'vitest';
import { formatBytes, formatNumber } from '../utils';

describe('utils', () => {
  describe('formatBytes', () => {
    it('handles bytes range', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });
    it('handles KB / MB / GB', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
    });
  });

  describe('formatNumber', () => {
    it('passes small numbers through', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(999)).toBe('999');
    });
    it('compacts thousands and millions', () => {
      expect(formatNumber(1500)).toBe('1.5K');
      expect(formatNumber(2_500_000)).toBe('2.5M');
    });
  });
});
