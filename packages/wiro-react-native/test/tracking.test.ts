import { describe, expect, it } from 'vitest';

import {
  Wiro,
  type WiroClient,
  WiroModelId,
  WiroTask,
  WiroTaskFailureReason,
  WiroTaskSnapshotUpdate,
  WiroTaskToken,
  type WiroTaskTrackingMode,
  WiroTaskUpdate,
  WiroValidationError,
  WiroValue,
} from '../src';
import { createWiroClientForTests } from '../src/client/wiro-client';
import { createAbortError } from '../src/internal/runtime';
import { FakeHttpTransport } from './support/fake-http-transport';

interface Timeline {
  readonly slept: number[];
  readonly runtime: {
    readonly delay: {
      sleep(durationMs: number, signal?: AbortSignal): Promise<void>;
    };
    readonly monotonicClock: {
      milliseconds(): number;
    };
  };
}

function timeline(
  onSleep?: (durationMs: number, signal: AbortSignal | undefined) => void,
): Timeline {
  let now = 0;
  const slept: number[] = [];
  return {
    runtime: {
      delay: {
        async sleep(durationMs: number, signal?: AbortSignal): Promise<void> {
          throwIfAborted(signal);
          slept.push(durationMs);
          onSleep?.(durationMs, signal);
          throwIfAborted(signal);
          now += durationMs;
        },
      },
      monotonicClock: {
        milliseconds(): number {
          return now;
        },
      },
    },
    slept,
  };
}

function client(transport: FakeHttpTransport, clock: Timeline): WiroClient {
  return createWiroClientForTests(
    {
      apiKey: 'test-api-key',
      pollIntervalMs: 3_000,
      transport,
    },
    clock.runtime,
  );
}

describe('watchTask and waitForTask', () => {
  it('emits the initial snapshot and polls until terminal', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, taskResponse('task_queue'));
    transport.enqueueJson(200, taskResponse('task_start'));
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    const clock = timeline();

    const tasks = await collect(client(transport, clock).watchTask(token()));

    expect(tasks.map((task) => task.status.kind)).toEqual([
      'queued',
      'running',
      'completed',
    ]);
    expect(clock.slept).toEqual([3_000, 3_000]);
    expect(transport.requests).toHaveLength(3);
  });

  it('emits a terminal initial snapshot without sleeping', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    const clock = timeline();

    const tasks = await collect(client(transport, clock).watchTask(token()));

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.isSuccessful).toBe(true);
    expect(clock.slept).toEqual([]);
  });

  it('clamps every sleep to the remaining deadline', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, taskResponse('task_queue'));
    transport.enqueueJson(200, taskResponse('task_start'));
    const clock = timeline();

    await expect(
      collect(
        client(transport, clock).watchTask(token(), {
          timeoutMs: 5_000,
        }),
      ),
    ).rejects.toMatchObject({
      message: 'Task did not finish within 5000 ms.',
      timeoutMs: 5_000,
    });
    expect(clock.slept).toEqual([3_000, 2_000]);
    expect(transport.requests).toHaveLength(2);
  });

  it('is explicitly single-consumer', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    const watch = client(transport, timeline()).watchTask(token());

    await collect(watch);
    await expect(collect(watch)).rejects.toThrow(
      'This task watch can only be consumed once.',
    );
    expect(transport.requests).toHaveLength(1);
  });

  it('stops without a sleep when the consumer breaks', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, taskResponse('task_queue'));
    const clock = timeline();

    for await (const task of client(transport, clock).watchTask(token())) {
      expect(task.status.kind).toBe('queued');
      break;
    }

    expect(clock.slept).toEqual([]);
    expect(transport.requests).toHaveLength(1);
  });

  it('preserves AbortError raised during polling sleep', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('stop', 'AbortError');
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, taskResponse('task_queue'));
    const clock = timeline(() => {
      controller.abort(abortError);
    });

    await expect(
      collect(
        client(transport, clock).watchTask(token(), {
          signal: controller.signal,
        }),
      ),
    ).rejects.toBe(abortError);
    expect(transport.requests).toHaveLength(1);
  });

  it('returns the terminal task from waitForTask', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, taskResponse('task_start'));
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    const clock = timeline();

    const task = await client(transport, clock).waitForTask(token());

    expect(task.isSuccessful).toBe(true);
    expect(clock.slept).toEqual([3_000]);
  });

  it('validates timeout before polling', async () => {
    const transport = new FakeHttpTransport();
    const sdk = client(transport, timeline());

    expect(() => sdk.watchTask(token(), { timeoutMs: 0 })).toThrow(
      WiroValidationError,
    );
    await expect(
      sdk.waitForTask(token(), {
        timeoutMs: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toThrow('timeout must be finite and greater than zero.');
    expect(transport.requests).toHaveLength(0);
  });
});

describe('subscribe', () => {
  it('runs once, reports snapshots, and returns success', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    transport.enqueueJson(200, taskResponse('task_queue'));
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    const updates: WiroTaskSnapshotUpdate[] = [];

    const result = await client(transport, timeline()).subscribe(
      new WiroModelId('owner', 'project'),
      {
        prompt: WiroValue.string('hello'),
      },
      {
        onUpdate(update) {
          if (update instanceof WiroTaskSnapshotUpdate) {
            updates.push(update);
          }
        },
      },
    );

    expect(result.kind).toBe('success');
    expect(updates.map((update) => update.status.kind)).toEqual([
      'queued',
      'completed',
    ]);
    expect(updates[0]?.isTerminal).toBe(false);
    expect(updates[1]?.isTerminal).toBe(true);
    expect(runRequestCount(transport)).toBe(1);
  });

  it.each([
    ['task_cancel', undefined, WiroTaskFailureReason.cancelled],
    ['task_postprocess_end', 2, WiroTaskFailureReason.nonZeroExit],
  ] as const)('maps %s to a task failure', async (status, exitCode, reason) => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    transport.enqueueJson(200, taskResponse(status, exitCode));

    const result = await client(transport, timeline()).subscribe(
      new WiroModelId('owner', 'project'),
    );

    expect(result).toMatchObject({
      kind: 'failure',
      reason,
    });
  });

  it('rejects a run response without a task token', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"result":true}');

    await expect(
      client(transport, timeline()).subscribe(
        new WiroModelId('owner', 'project'),
      ),
    ).rejects.toMatchObject({
      message: 'The model run response did not contain a task token.',
      statusCode: 200,
    });
    expect(transport.requests).toHaveLength(1);
  });

  it('validates timeout and tracking mode before Run', async () => {
    const transport = new FakeHttpTransport();
    const sdk = client(transport, timeline());

    await expect(
      sdk.subscribe(
        new WiroModelId('owner', 'project'),
        {},
        {
          timeoutMs: -1,
        },
      ),
    ).rejects.toThrow(WiroValidationError);
    await expect(
      sdk.subscribe(
        new WiroModelId('owner', 'project'),
        {},
        {
          trackingMode: 'invalid' as WiroTaskTrackingMode,
        },
      ),
    ).rejects.toThrow('trackingMode must be polling or webSocket.');
    expect(transport.requests).toHaveLength(0);
  });

  it('supports typed polling requests', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));

    const result = await client(transport, timeline()).subscribe(
      Wiro.model('owner/project', {
        prompt: WiroValue.string('hello'),
      }),
    );

    expect(result.kind).toBe('success');
    expect(runRequestCount(transport)).toBe(1);
  });
});

describe('subscribeStream', () => {
  it('runs before returning the iterable', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    const sdk = client(transport, timeline());

    const stream = await sdk.subscribeStream(
      new WiroModelId('owner', 'project'),
    );

    expect(transport.requests).toHaveLength(1);
    expect(runRequestCount(transport)).toBe(1);
    const updates = await collect(stream);
    expect(updates[0]).toBeInstanceOf(WiroTaskSnapshotUpdate);
  });

  it('can be consumed again without repeating Run', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    const stream = await client(transport, timeline()).subscribeStream(
      Wiro.model('owner/project', {
        prompt: WiroValue.string('hello'),
      }),
    );

    expect(await collect(stream)).toHaveLength(1);
    expect(await collect(stream)).toHaveLength(1);
    expect(runRequestCount(transport)).toBe(1);
    expect(transport.requests).toHaveLength(3);
  });

  it('stops immediately when stream consumption is abandoned', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    transport.enqueueJson(200, taskResponse('task_queue'));
    const clock = timeline();
    const stream = await client(transport, clock).subscribeStream(
      new WiroModelId('owner', 'project'),
    );

    for await (const update of stream) {
      expect(update.kind).toBe('snapshot');
      break;
    }

    expect(clock.slept).toEqual([]);
    expect(transport.requests).toHaveLength(2);
    expect(runRequestCount(transport)).toBe(1);
  });

  it('validates before starting its billable Run', async () => {
    const transport = new FakeHttpTransport();

    await expect(
      client(transport, timeline()).subscribeStream(
        new WiroModelId('owner', 'project'),
        {},
        { timeoutMs: 0 },
      ),
    ).rejects.toThrow(WiroValidationError);
    expect(transport.requests).toHaveLength(0);
  });
});

describe('WiroTaskUpdate', () => {
  it('exposes snapshot status and terminal state', () => {
    const task = taskFromStatus('task_postprocess_end');
    const update = WiroTaskUpdate.snapshot(task);

    expect(update.kind).toBe('snapshot');
    expect(update.status.kind).toBe('completed');
    expect(update.isTerminal).toBe(true);
  });
});

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

function token(): WiroTaskToken {
  return new WiroTaskToken('task-token');
}

function runResponse(): string {
  return JSON.stringify({
    result: true,
    socketaccesstoken: token().rawValue,
    taskid: 'task-id',
  });
}

function taskResponse(status: string, exitCode?: number): string {
  return JSON.stringify({
    result: true,
    tasklist: [
      {
        id: 'task-id',
        ...(exitCode === undefined ? {} : { pexit: exitCode }),
        socketaccesstoken: token().rawValue,
        status,
      },
    ],
  });
}

function taskFromStatus(status: string) {
  return WiroTask.parse({
    pexit: WiroValue.number(0),
    status: WiroValue.string(status),
  });
}

function runRequestCount(transport: FakeHttpTransport): number {
  return transport.requests.filter((request) => request.url.includes('/Run/'))
    .length;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw signal.reason ?? createAbortError();
  }
}
