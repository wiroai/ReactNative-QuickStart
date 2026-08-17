import { describe, expect, it } from 'vitest';

import {
  WiroModelId,
  WiroTaskId,
  WiroTaskToken,
  WiroValidationError,
} from '../src';

describe('WiroModelId', () => {
  it('stores immutable segments and exposes the wire slug', () => {
    const modelId = new WiroModelId('stability-ai', 'sd3.5');

    expect(modelId.owner).toBe('stability-ai');
    expect(modelId.project).toBe('sd3.5');
    expect(modelId.slug).toBe('stability-ai/sd3.5');
    expect(modelId.toString()).toBe(modelId.slug);
    expect(JSON.stringify(modelId)).toBe('"stability-ai/sd3.5"');
    expect(Object.isFrozen(modelId)).toBe(true);
  });

  it.each([
    ['', 'project'],
    ['owner', ''],
    ['-owner', 'project'],
    ['owner', '-project'],
    ['owner name', 'project'],
    ['owner', 'pro/ject'],
    ['öwner', 'project'],
  ])('rejects invalid segments %#', (owner, project) => {
    expect(() => new WiroModelId(owner, project)).toThrow(WiroValidationError);
  });

  it('parses only an exact two-segment slug', () => {
    expect(WiroModelId.parse(' owner/project ')?.slug).toBe('owner/project');

    for (const value of [
      '',
      'owner',
      '/project',
      'owner/',
      'owner/project/extra',
      'owner /project',
    ]) {
      expect(WiroModelId.parse(value)).toBeNull();
    }
  });

  it('uses value equality', () => {
    expect(
      new WiroModelId('owner', 'project').equals(
        new WiroModelId('owner', 'project'),
      ),
    ).toBe(true);
    expect(
      new WiroModelId('owner', 'project').equals(
        new WiroModelId('owner', 'other'),
      ),
    ).toBe(false);
  });
});

describe('task identifiers', () => {
  it('trims and serializes task ids', () => {
    const taskId = new WiroTaskId(' 42 ');

    expect(taskId.rawValue).toBe('42');
    expect(taskId.toString()).toBe('42');
    expect(JSON.stringify(taskId)).toBe('"42"');
    expect(taskId.equals(new WiroTaskId('42'))).toBe(true);
  });

  it('rejects blank ids and tokens without throwing from parse', () => {
    expect(() => new WiroTaskId(' \n ')).toThrow(WiroValidationError);
    expect(() => new WiroTaskToken('\t')).toThrow(WiroValidationError);
    expect(WiroTaskId.parse(' ')).toBeNull();
    expect(WiroTaskToken.parse(' ')).toBeNull();
  });

  it('keeps token wire access explicit and stringification redacted', () => {
    const token = new WiroTaskToken(' secret-task-token ');

    expect(token.rawValue).toBe('secret-task-token');
    expect(token.toString()).toBe('WiroTaskToken([REDACTED])');
    expect(String(token)).not.toContain('secret-task-token');
    expect(JSON.stringify(token)).toBe('"[REDACTED]"');
    expect(JSON.stringify(token)).not.toContain('secret-task-token');
    expect(token.equals(new WiroTaskToken('secret-task-token'))).toBe(true);
  });
});
