import { describe, expect, it } from 'vitest';

import packageJson from '../package.json';
import { WIRO_SDK_VERSION, WiroSdkInfo } from '../src';

describe('WiroSdkInfo', () => {
  it('matches the package version', () => {
    expect(WIRO_SDK_VERSION).toBe(packageJson.version);
    expect(WiroSdkInfo.version).toBe(WIRO_SDK_VERSION);
    expect(Object.isFrozen(WiroSdkInfo)).toBe(true);
  });
});
