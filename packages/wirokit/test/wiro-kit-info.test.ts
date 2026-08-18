import { describe, expect, it } from 'vitest';

import packageJson from '../package.json';
import { WIROKIT_VERSION, WiroKitInfo } from '../src';

describe('WiroKitInfo', () => {
  it('matches the package version', () => {
    expect(WIROKIT_VERSION).toBe(packageJson.version);
    expect(WiroKitInfo.version).toBe(WIROKIT_VERSION);
    expect(Object.isFrozen(WiroKitInfo)).toBe(true);
  });
});
