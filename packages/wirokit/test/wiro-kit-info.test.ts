import { describe, expect, it } from 'vitest';

import { WIROKIT_VERSION, WiroKitInfo } from '../src';

describe('WiroKitInfo', () => {
  it('exposes the initial package version', () => {
    expect(WIROKIT_VERSION).toBe('0.1.0');
    expect(WiroKitInfo.version).toBe(WIROKIT_VERSION);
    expect(Object.isFrozen(WiroKitInfo)).toBe(true);
  });
});
