import { describe, expect, it } from 'vitest';

import {
  parseWiroJson,
  WiroRunResult,
  WiroTask,
  WiroTaskFailure,
  WiroTaskFailureReason,
  WiroTaskOutput,
  WiroTaskProgress,
  WiroTaskResult,
  WiroTaskStatus,
  WiroTaskSuccess,
  WiroValue,
} from '../src';

const KNOWN_STATUSES = [
  ['queued', 'task_queue'],
  ['accepted', 'task_accept'],
  ['preprocessing', 'task_preprocess_start'],
  ['preprocessed', 'task_preprocess_end'],
  ['assigned', 'task_assign'],
  ['running', 'task_start'],
  ['output', 'task_output'],
  ['outputComplete', 'task_output_full'],
  ['errorOutput', 'task_error'],
  ['errorOutputComplete', 'task_error_full'],
  ['processEnded', 'task_end'],
  ['postProcessing', 'task_postprocess_start'],
  ['completed', 'task_postprocess_end'],
  ['cancelled', 'task_cancel'],
  ['streamReady', 'task_stream_ready'],
  ['streamEnded', 'task_stream_end'],
] as const;

describe('Wiro task status', () => {
  it.each(KNOWN_STATUSES)('round-trips %s status', (kind, apiValue) => {
    const status = WiroTaskStatus.parse(apiValue);

    expect(status.kind).toBe(kind);
    expect(status.apiValue).toBe(apiValue);
    expect(status.rawValue).toBeUndefined();
  });

  it('treats only completed and cancelled as terminal', () => {
    const terminal = KNOWN_STATUSES.filter(
      ([, apiValue]) => WiroTaskStatus.parse(apiValue).isTerminal,
    ).map(([kind]) => kind);

    expect(terminal).toEqual(['completed', 'cancelled']);
  });

  it('preserves unknown raw values as non-terminal', () => {
    const status = WiroTaskStatus.parse('task_future_state');

    expect(status).toMatchObject({
      apiValue: 'task_future_state',
      isTerminal: false,
      kind: 'unknown',
      rawValue: 'task_future_state',
    });
    expect(status.equals(WiroTaskStatus.unknown('task_future_state'))).toBe(
      true,
    );
  });
});

describe('Wiro task decoding', () => {
  it('parses task fields, nested parameters, and outputs', () => {
    const task = WiroTask.parse(
      parseWiroJson(
        JSON.stringify({
          debugoutput: 'done',
          elapsedseconds: '1.2345',
          endtime: 1_700_000_001_000,
          id: 12345,
          modeldescription: 'An image model',
          modelslugowner: 'owner',
          modelslugproject: 'project',
          outputs: [
            {
              content: {
                answer: ['first', 2],
                prompt: 'hello',
                raw: 'raw text',
                thinking: ['step'],
              },
              contenttype: 'application/json',
              name: 'result',
              size: '42',
              url: 'https://cdn.example.com/result.json',
            },
          ],
          parameters: JSON.stringify({ prompt: 'hello' }),
          pexit: '0',
          socketaccesstoken: 'token',
          starttime: 1_700_000_000,
          status: 'task_postprocess_end',
          totalcost: '0.125',
        }),
      ),
    );

    expect(task.id?.rawValue).toBe('12345');
    expect(task.taskToken?.rawValue).toBe('token');
    expect(task.parameters.prompt).toEqual(WiroValue.string('hello'));
    expect(task.status).toBe(WiroTaskStatus.completed);
    expect(task.statusRawValue).toBe('task_postprocess_end');
    expect(task.exitCode).toBe(0);
    expect(task.startTime?.getTime()).toBe(1_700_000_000_000);
    expect(task.endTime?.getTime()).toBe(1_700_000_001_000);
    expect(task.elapsed).toBe(1235);
    expect(task.totalCost).toBe(0.125);
    expect(task.isFinished).toBe(true);
    expect(task.isSuccessful).toBe(true);
    expect(task.outputs[0]).toMatchObject({
      contentType: 'application/json',
      isText: true,
      name: 'result',
      size: 42,
    });
    expect(task.outputs[0]?.content?.answers).toEqual(['first', '2']);
    expect(task.outputs[0]?.url?.toString()).toBe(
      'https://cdn.example.com/result.json',
    );
  });

  it('supports the singular output alias and sparse defaults', () => {
    const task = WiroTask.parse(
      parseWiroJson(
        JSON.stringify({
          output: [
            {
              content: {},
              contenttype: 'image/png',
            },
            {},
          ],
          status: 'task_start',
        }),
      ),
    );

    expect(task.id).toBeUndefined();
    expect(task.taskToken).toBeUndefined();
    expect(task.parameters).toEqual({});
    expect(task.outputs).toHaveLength(1);
    expect(task.outputs[0]?.content).toBeUndefined();
    expect(task.outputs[0]?.isImage).toBe(true);
    expect(task.isFinished).toBe(false);
    expect(task.isSuccessful).toBe(false);
  });

  it.each([
    ['IMAGE/PNG', 'isImage'],
    ['video/mp4', 'isVideo'],
    ['audio/mpeg', 'isAudio'],
    ['text/plain', 'isText'],
    ['raw', 'isText'],
    ['application/json', 'isText'],
  ] as const)('classifies %s output', (contentType, property) => {
    const output = WiroTaskOutput.parse(
      parseWiroJson(JSON.stringify({ contenttype: contentType })),
    );

    expect(output[property]).toBe(true);
  });

  it('returns defensive Date and URL values', () => {
    const task = WiroTask.parse(
      parseWiroJson(
        '{"starttime":1700000000,"status":"task_start",' +
          '"outputs":[{"url":"https://example.com/a"}]}',
      ),
    );
    const date = task.startTime;
    const url = task.outputs[0]?.url;
    date?.setTime(0);
    if (url !== undefined) {
      url.pathname = '/changed';
    }

    expect(task.startTime?.getTime()).toBe(1_700_000_000_000);
    expect(task.outputs[0]?.url?.pathname).toBe('/a');
  });
});

describe('run and terminal result models', () => {
  it('parses run identifiers and errors with coercion', () => {
    const result = WiroRunResult.parse(
      parseWiroJson(
        JSON.stringify({
          errors: [{ code: 7, message: 'warning' }],
          result: 'true',
          socketaccesstoken: 'token',
          taskid: 99,
        }),
      ),
    );

    expect(result.isSuccess).toBe(true);
    expect(result.taskId?.rawValue).toBe('99');
    expect(result.taskToken?.rawValue).toBe('token');
    expect(result.errors[0]).toMatchObject({
      code: '7',
      message: 'warning',
    });
  });

  it('classifies success and each failure reason', () => {
    const success = task('completed', 0);
    const cancelled = task('cancelled', 0);
    const failed = task('completed', 2);
    const missingExit = task('completed');
    const running = task('running');

    expect(WiroTaskResult.from(success)).toBeInstanceOf(WiroTaskSuccess);
    expect(WiroTaskResult.from(cancelled)).toMatchObject({
      reason: WiroTaskFailureReason.cancelled,
    });
    expect(WiroTaskResult.from(failed)).toMatchObject({
      reason: WiroTaskFailureReason.nonZeroExit,
    });
    expect(WiroTaskResult.from(missingExit)).toMatchObject({
      reason: WiroTaskFailureReason.nonZeroExit,
    });
    expect(WiroTaskResult.from(running)).toMatchObject({
      reason: WiroTaskFailureReason.other,
    });
    expect(WiroTaskResult.from(running)).toBeInstanceOf(WiroTaskFailure);
  });
});

describe('WiroTaskProgress', () => {
  it('maps progress and language-model fields', () => {
    const progress = WiroTaskProgress.parse(
      parseWiroJson(
        JSON.stringify({
          answer: ['answer'],
          elapsedTime: '1s',
          isThinking: 'true',
          percentage: '12.5',
          raw: 'chunk',
          remainingTime: '7s',
          speed: '2.5',
          speedType: 'it/s',
          stepCurrent: '2',
          stepTotal: 10,
          task: 'task-1',
          thinking: ['thought'],
          type: 'progress',
        }),
      ),
    );

    expect(progress).toMatchObject({
      answers: ['answer'],
      currentStep: 2,
      elapsedTime: '1s',
      isThinking: true,
      percentage: 12.5,
      rawText: 'chunk',
      remainingTime: '7s',
      speed: '2.5',
      speedType: 'it/s',
      task: 'task-1',
      thinking: ['thought'],
      totalSteps: 10,
      type: 'progress',
    });
  });
});

function task(
  kind: 'completed' | 'cancelled' | 'running',
  exitCode?: number,
): WiroTask {
  const status = WiroTaskStatus[kind];
  return new WiroTask({
    exitCode,
    raw: {},
    status,
    statusRawValue: status.apiValue,
  });
}
