import { describe, it, expect } from 'vitest';
import { PlayerUI } from './index.js';

describe('PlayerUI', () => {
  it('should export PlayerUI class', () => {
    expect(PlayerUI).toBeDefined();
    expect(typeof PlayerUI).toBe('function');
  });
});
