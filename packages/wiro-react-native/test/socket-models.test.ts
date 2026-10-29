import { describe, expect, it } from 'vitest';

import {
  WiroSocketBinaryEvent,
  WiroSocketLogPayload,
  WiroSocketMessageEvent,
  WiroSocketOutputsPayload,
  WiroSocketProgressPayload,
  WiroSocketUnknownPayload,
  WiroTaskBinaryUpdate,
  WiroTaskEventUpdate,
  WiroTaskUpdate,
  WiroWebSocketError,
} from '../src';
import { decodeSocketFrame } from '../src/models/socket-event';

const limits = {
  maxBinaryBytes: 1_024,
  maxTextBytes: 1_024,
};

describe('socket message decoding', () => {
  it('decodes progress objects with wire coercions', () => {
    const event = decodeText({
      message: {
        answer: ['done'],
        percentage: '42.5',
        stepCurrent: '2',
        stepTotal: 4,
      },
      result: '1',
      tasktoken: 'task-token',
      type: 'task_start',
    });
    expect(event).toBeInstanceOf(WiroSocketMessageEvent);
    if (event instanceof WiroSocketMessageEvent) {
      expect(event.message.payload).toBeInstanceOf(WiroSocketProgressPayload);
      expect(event.message.progress).toMatchObject({
        answers: ['done'],
        currentStep: 2,
        percentage: 42.5,
        totalSteps: 4,
      });
      expect(event.message.result).toBe(true);
      expect(event.message.taskToken?.rawValue).toBe('task-token');
      expect(event.isTerminal).toBe(false);
    }
  });

  it('decodes stringified progress and plain logs', () => {
    const progress = decodeText({
      message: '{"percentage":10,"stepCurrent":1}',
      type: 'task_output',
    });
    const log = decodeText({
      message: '{"custom":"value"}',
      type: 'task_output',
    });

    if (
      progress instanceof WiroSocketMessageEvent &&
      log instanceof WiroSocketMessageEvent
    ) {
      expect(progress.message.payload).toBeInstanceOf(
        WiroSocketProgressPayload,
      );
      expect(log.message.payload).toBeInstanceOf(WiroSocketLogPayload);
      expect(log.message.messageText).toBe('{"custom":"value"}');
    }
  });

  it('decodes completed outputs and terminal status', () => {
    const event = decodeText({
      message: [
        {
          content: {
            answer: ['hello'],
          },
          contenttype: 'application/json',
          name: 'result.json',
          size: '12',
          url: 'https://cdn.wiro.ai/result.json',
        },
      ],
      result: true,
      type: 'task_postprocess_end',
    });

    if (event instanceof WiroSocketMessageEvent) {
      expect(event.message.payload).toBeInstanceOf(WiroSocketOutputsPayload);
      expect(event.message.outputs[0]).toMatchObject({
        contentType: 'application/json',
        name: 'result.json',
        size: 12,
      });
      expect(event.message.outputs[0]?.content?.answers).toEqual(['hello']);
      expect(event.isTerminal).toBe(true);
    }
  });

  it('preserves unknown payloads and false result defaults', () => {
    const event = decodeText({
      message: [1, 'two'],
      type: 'future_status',
    });

    if (event instanceof WiroSocketMessageEvent) {
      expect(event.message.payload).toBeInstanceOf(WiroSocketUnknownPayload);
      expect(event.message.result).toBe(false);
      expect(event.message.status.kind).toBe('unknown');
      expect(event.isTerminal).toBe(false);
    }
  });

  it('decodes and defensively copies binary frames', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const event = decodeSocketFrame(
      {
        bytes,
        kind: 'binary',
      },
      limits,
    );
    bytes[0] = 9;

    expect(event).toBeInstanceOf(WiroSocketBinaryEvent);
    if (event instanceof WiroSocketBinaryEvent) {
      const exposed = event.bytes;
      exposed[1] = 9;
      expect(event.bytes).toEqual(new Uint8Array([1, 2, 3]));
      expect(event.isTerminal).toBe(false);
    }
  });
});

describe('socket protocol validation', () => {
  it.each([
    ['{', 'The Wiro task WebSocket returned invalid JSON.'],
    ['[1,2]', 'The Wiro task WebSocket returned a non-object JSON payload.'],
  ])('rejects invalid text payload %s', (text, message) => {
    expect(() =>
      decodeSocketFrame(
        {
          kind: 'text',
          text,
        },
        limits,
      ),
    ).toThrow(message);
  });

  it('enforces UTF-8 text and binary limits', () => {
    expect(() =>
      decodeSocketFrame(
        {
          kind: 'text',
          text: '{"é":"é"}',
        },
        {
          maxBinaryBytes: 10,
          maxTextBytes: 5,
        },
      ),
    ).toThrow(
      'The Wiro task WebSocket returned a text frame ' +
        'that exceeds the size limit.',
    );
    expect(() =>
      decodeSocketFrame(
        {
          bytes: new Uint8Array(9),
          kind: 'binary',
        },
        {
          maxBinaryBytes: 8,
          maxTextBytes: 10,
        },
      ),
    ).toThrow(
      'The Wiro task WebSocket returned a binary frame ' +
        'that exceeds the size limit.',
    );
  });

  it('uses typed WebSocket errors', () => {
    expect(() =>
      decodeSocketFrame(
        {
          kind: 'text',
          text: 'null',
        },
        limits,
      ),
    ).toThrow(WiroWebSocketError);
  });
});

describe('socket task updates', () => {
  it('maps message and binary events to typed updates', () => {
    const messageEvent = decodeText({
      message: 'cancelled',
      type: 'task_cancel',
    });
    const eventUpdate = WiroTaskUpdate.fromSocketEvent(messageEvent);
    const binaryUpdate = WiroTaskUpdate.fromSocketEvent(
      new WiroSocketBinaryEvent(new Uint8Array([7])),
    );

    expect(eventUpdate).toBeInstanceOf(WiroTaskEventUpdate);
    expect(eventUpdate.status?.kind).toBe('cancelled');
    expect(eventUpdate.isTerminal).toBe(true);
    expect(binaryUpdate).toBeInstanceOf(WiroTaskBinaryUpdate);
    expect(binaryUpdate.status).toBeUndefined();
    expect(binaryUpdate.isTerminal).toBe(false);
    if (binaryUpdate instanceof WiroTaskBinaryUpdate) {
      const exposed = binaryUpdate.bytes;
      exposed[0] = 9;
      expect(binaryUpdate.bytes).toEqual(new Uint8Array([7]));
    }
    if (messageEvent instanceof WiroSocketMessageEvent) {
      expect(WiroTaskUpdate.event(messageEvent.message)).toBeInstanceOf(
        WiroTaskEventUpdate,
      );
    }
    expect(WiroTaskUpdate.binary(new Uint8Array([1]))).toBeInstanceOf(
      WiroTaskBinaryUpdate,
    );
  });

  it('rejects unsupported event implementations', () => {
    expect(() => WiroTaskUpdate.fromSocketEvent({} as never)).toThrow(
      'Unsupported socket event',
    );
  });
});

function decodeText(value: unknown) {
  return decodeSocketFrame(
    {
      kind: 'text',
      text: JSON.stringify(value),
    },
    limits,
  );
}
