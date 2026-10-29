import { describe, expect, it } from 'vitest';

import {
  Wiro,
  WiroClient,
  WiroModelId,
  WiroRetryPolicy,
  WiroTaskId,
  WiroTaskToken,
  WiroUnknownApiError,
  WiroValidationError,
  WiroValue,
} from '../src';
import {
  isRetryablePath,
  percentEncodePathSegment,
} from '../src/client/wiro-client';
import runContract from './fixtures/wire/endpoints/run-flux2pro-callback.json';
import cancelContract from './fixtures/wire/endpoints/task-cancel.json';
import detailIdContract from './fixtures/wire/endpoints/task-detail-id.json';
import detailTokenContract from './fixtures/wire/endpoints/task-detail-token.json';
import killContract from './fixtures/wire/endpoints/task-kill.json';
import dynamicContract from './fixtures/wire/requests/dynamic.json';
import { FakeHttpTransport } from './support/fake-http-transport';

function client(
  transport: FakeHttpTransport,
  retryPolicy: WiroRetryPolicy = WiroRetryPolicy.none,
): WiroClient {
  return new WiroClient({
    apiKey: 'test-api-key',
    retryPolicy,
    transport,
  });
}

describe('run model wire contract', () => {
  it('matches the run path and body contract', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(
      200,
      '{"result":true,"taskid":"1",' + '"socketaccesstoken":"tok"}',
    );

    const result = await client(transport).runModel(
      new WiroModelId('black-forest-labs', 'flux-2-pro'),
      {
        prompt: WiroValue.string('lake'),
        width: WiroValue.number(1024),
      },
      { callbackUrl: 'https://example.com/hook' },
    );

    expect(transport.requests[0]?.url).toBe(
      'https://api.wiro.ai/v1/Run/' + 'black-forest-labs/flux-2-pro',
    );
    expect(JSON.parse(transport.requests[0]?.body ?? '')).toEqual(runContract);
    expect(result.isSuccess).toBe(true);
    expect(result.taskId?.rawValue).toBe('1');
    expect(result.taskToken?.rawValue).toBe('tok');
  });

  it('never retries a billable run', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(503, '{"message":"busy"}');
    transport.enqueueJson(200, '{"result":true,"taskid":"unexpected"}');

    await expect(
      client(transport, WiroRetryPolicy.default).runModel(
        new WiroModelId('owner', 'project'),
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(transport.requests).toHaveLength(1);
    expect(isRetryablePath('/Run/owner/project')).toBe(false);
    expect(isRetryablePath('/Task/Detail')).toBe(true);
  });

  it.each([
    'ftp://hooks.example.com/x',
    'https://user:pass@hooks.example.com/x',
    'https://hooks.example.com/x#fragment',
    'https:hooks.example.com/x',
    'not-a-url',
  ])('rejects invalid callback URL %s before transport', async (url) => {
    const transport = new FakeHttpTransport();

    await expect(
      client(transport).runModel(
        new WiroModelId('owner', 'project'),
        {},
        { callbackUrl: url },
      ),
    ).rejects.toMatchObject({
      message:
        'callbackURL must be an HTTP(S) URL without ' +
        'credentials or a fragment.',
    });
    expect(transport.requests).toHaveLength(0);
  });

  it('allows callback queries and normalizes IDN hosts', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"result":true}');

    await client(transport).runModel(
      new WiroModelId('owner', 'project'),
      {},
      {
        callbackUrl: 'https://münich.example/hook?x=1',
      },
    );

    expect(JSON.parse(transport.requests[0]?.body ?? '')).toEqual({
      callbackUrl: 'https://xn--mnich-kva.example/hook?x=1',
    });
  });

  it('runs the dynamic typed-request seam', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"result":true}');
    const request = Wiro.model('owner/project', {
      prompt: WiroValue.string('hi'),
      seed: WiroValue.number(1),
    });

    await client(transport).run(request);

    expect(request.model.slug).toBe('owner/project');
    expect(JSON.parse(transport.requests[0]?.body ?? '')).toEqual(
      dynamicContract,
    );
    expect(transport.requests[0]?.url).toContain('/Run/owner/project');
  });

  it('rejects malformed dynamic model slugs', () => {
    expect(() => Wiro.model('invalid', {})).toThrow(
      new WiroValidationError('slug must be a valid owner/project identifier.'),
    );
  });

  it('percent-encodes each path segment as UTF-8', () => {
    expect(percentEncodePathSegment('a b')).toBe('a%20b');
    expect(percentEncodePathSegment('a/b')).toBe('a%2Fb');
    expect(percentEncodePathSegment('🌊')).toBe('%F0%9F%8C%8A');
    expect(percentEncodePathSegment('plain-._~')).toBe('plain-._~');
    expect(percentEncodePathSegment('é')).toBe('%C3%A9');
  });

  it('preserves AbortError during a run', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueue(
      () =>
        new Promise(() => {
          // Intentionally pending until the signal aborts.
        }),
    );
    const controller = new AbortController();
    const pending = client(transport).runModel(
      new WiroModelId('owner', 'project'),
      {},
      { signal: controller.signal },
    );
    const rejection = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });

    controller.abort();

    await rejection;
  });
});

describe('task management wire contract', () => {
  it('matches token and ID detail contracts', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(
      200,
      '{"tasklist":[{"id":"1","status":"task_start"}]}',
    );
    transport.enqueueJson(
      200,
      '{"tasklist":[{"id":"2","status":"task_queue"}]}',
    );
    const sdk = client(transport);

    const byToken = await sdk.getTask(new WiroTaskToken('tok-abc'));
    const byId = await sdk.getTaskById(new WiroTaskId('task-123'));

    expect(transport.requests[0]?.url).toContain('/Task/Detail');
    expect(JSON.parse(transport.requests[0]?.body ?? '')).toEqual(
      detailTokenContract,
    );
    expect(JSON.parse(transport.requests[1]?.body ?? '')).toEqual(
      detailIdContract,
    );
    expect(byToken.id?.rawValue).toBe('1');
    expect(byId.id?.rawValue).toBe('2');
  });

  it('rejects task responses without a task', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"tasklist":[]}');

    const error = await client(transport)
      .getTask(new WiroTaskToken('tok'))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WiroUnknownApiError);
    expect(error).toMatchObject({
      message: 'The task response did not contain a task.',
      statusCode: 200,
    });
  });

  it('matches cancel and kill contracts', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"result":true}');
    transport.enqueueJson(200, '{"result":true}');
    transport.enqueueJson(200, '{"result":true}');
    const sdk = client(transport);

    expect(await sdk.cancelTask(new WiroTaskId('task-123'))).toBe(true);
    expect(await sdk.killTask(new WiroTaskToken('tok-abc'))).toBe(true);
    expect(await sdk.killTask(new WiroTaskId('task-123'))).toBe(true);

    expect(JSON.parse(transport.requests[0]?.body ?? '')).toEqual(
      cancelContract,
    );
    expect(JSON.parse(transport.requests[1]?.body ?? '')).toEqual(killContract);
    expect(JSON.parse(transport.requests[2]?.body ?? '')).toEqual(
      detailIdContract,
    );
    expect(transport.requests.map((request) => request.url)).toEqual([
      'https://api.wiro.ai/v1/Task/Cancel',
      'https://api.wiro.ai/v1/Task/Kill',
      'https://api.wiro.ai/v1/Task/Kill',
    ]);
  });

  it('defaults missing cancel and kill results to false', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{}');
    transport.enqueueJson(200, '{}');
    const sdk = client(transport);

    expect(await sdk.cancelTask(new WiroTaskId('task'))).toBe(false);
    expect(await sdk.killTask(new WiroTaskToken('token'))).toBe(false);
  });
});
