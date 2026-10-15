import { describe, it, expect } from 'vitest';
import { matchingResume } from '../src/media/resume';
import { subtitleSettings, wrapSubtitle } from '../src/media/subtitleLayout';

describe('subtitle composition and resume boundaries', () => {
  it('wraps Chinese and long lines within the actual canvas width', () => {
    const lines = wrapSubtitle('今天一起看电影，明天继续。', (s) => Array.from(s).length * 10, 50);
    expect(lines).toHaveLength(3);
    expect(lines.every((s) => Array.from(s).length <= 5)).toBe(true);
  });
  it('limits text to three lines and preserves Unicode characters', () => {
    const lines = wrapSubtitle('😀😀😀😀😀😀😀😀😀😀', (s) => Array.from(s).length * 10, 20);
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith('…')).toBe(true);
    expect(lines.join('')).not.toContain('\uFFFD');
  });
  it('clamps subtitle offset and rejects invalid scale values', () => {
    expect(subtitleSettings({ scale: 100, offset: 99 })).toEqual({ scale: 100, offset: 10 });
    expect(subtitleSettings({ scale: 30 as 80, offset: NaN })).toEqual({ scale: 100, offset: 0 });
  });
  it('only offers resuming a matching recent file with an interior position', () => {
    const f = { name: 'film.mp4', size: 123, lastModified: 5 },
      r = { name: f.name, size: f.size, modified: 5, duration: 100, position: 40, at: 1000 };
    expect(matchingResume(r, f, 100, 2000)).toBe(40);
    expect(matchingResume({ ...r, size: 321 }, f, 100, 2000)).toBeUndefined();
    expect(matchingResume(r, f, 120, 2000)).toBeUndefined();
    expect(matchingResume(r, f, 100, 86402000)).toBeUndefined();
    expect(matchingResume({ ...r, position: NaN }, f, 100, 2000)).toBeUndefined();
  });
});
