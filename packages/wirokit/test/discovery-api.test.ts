import { describe, expect, it } from 'vitest';

import {
  WiroApiResultError,
  WiroClient,
  type WiroLogEvent,
  WiroModelId,
  WiroModelSort,
  WiroRetryPolicy,
  WiroSortOrder,
  WiroTextModelParameter,
  WiroUnknownApiError,
  WiroValidationError,
} from '../src';
import toolDetail from './fixtures/wire/endpoints/tool-detail.json';
import toolExplore from './fixtures/wire/endpoints/tool-explore.json';
import toolList from './fixtures/wire/endpoints/tool-list.json';
import { FakeHttpTransport } from './support/fake-http-transport';

function client(
  transport: FakeHttpTransport,
  events?: WiroLogEvent[],
): WiroClient {
  return new WiroClient({
    apiKey: 'test-api-key',
    ...(events === undefined
      ? {}
      : {
          logger: {
            log: (event: WiroLogEvent) => events.push(event),
          },
        }),
    retryPolicy: WiroRetryPolicy.none,
    transport,
  });
}

describe('WiroClient discovery wire contract', () => {
  it('matches the Tool/List golden fixture', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"result":true,"total":0,"tool":[]}');

    await client(transport).searchModels({
      categories: ['image'],
      limit: 20,
      order: WiroSortOrder.descending,
      owner: 'openai',
      search: 'flux',
      sort: WiroModelSort.relevance,
      start: 0,
    });

    expect(transport.requests[0]?.url).toBe('https://api.wiro.ai/v1/Tool/List');
    expect(JSON.parse(transport.requests[0]?.body ?? '')).toEqual(toolList);
  });

  it('sends defaults, fixed flags, and omits optionals', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"result":true,"total":0,"tool":[]}');

    await client(transport).searchModels();

    const body = JSON.parse(transport.requests[0]?.body ?? '') as Record<
      string,
      unknown
    >;
    expect(body).toEqual({
      categories: [],
      hideworkflows: true,
      limit: '20',
      search: '',
      sort: 'relevance',
      start: '0',
      summary: true,
    });
    expect(body.slugowner).toBeUndefined();
    expect(body.order).toBeUndefined();
  });

  it('uses all sort and order wire values', () => {
    expect(Object.values(WiroModelSort)).toEqual([
      'averagepoint',
      'commentcount',
      'ratedusercount',
      'relevance',
      'time',
    ]);
    expect(Object.values(WiroSortOrder)).toEqual(['ASC', 'DESC']);
  });

  it('validates pagination before transport work', async () => {
    const transport = new FakeHttpTransport();
    const sdk = client(transport);

    await expect(sdk.searchModels({ start: -1 })).rejects.toThrow(
      'start cannot be negative.',
    );
    await expect(sdk.searchModels({ start: 1.5 })).rejects.toThrow(
      WiroValidationError,
    );
    await expect(sdk.searchModels({ limit: 0 })).rejects.toThrow(
      'limit must be between 1 and 100.',
    );
    await expect(sdk.searchModels({ limit: 101 })).rejects.toThrow(
      'limit must be between 1 and 100.',
    );
    expect(transport.requests).toHaveLength(0);
  });

  it('accepts pagination boundaries', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"result":true,"total":0,"tool":[]}');
    transport.enqueueJson(200, '{"result":true,"total":0,"tool":[]}');
    const sdk = client(transport);

    await sdk.searchModels({ limit: 1, start: 0 });
    await sdk.searchModels({ limit: 100, start: 1 });

    expect(JSON.parse(transport.requests[0]?.body ?? '')).toMatchObject({
      limit: '1',
      start: '0',
    });
    expect(JSON.parse(transport.requests[1]?.body ?? '')).toMatchObject({
      limit: '100',
      start: '1',
    });
  });

  it('matches Tool/Explore golden and parses categories', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(
      200,
      JSON.stringify({
        explore: [
          {
            id: 'category-1',
            name: 'Featured',
            tools: [
              {
                id: 'model-1',
                slugowner: 'openai',
                slugproject: 'gpt-image-2',
              },
            ],
            total: '2',
            url: 'https://wiro.ai/explore',
          },
        ],
      }),
    );

    const categories = await client(transport).explore();

    expect(transport.requests[0]?.url).toBe(
      'https://api.wiro.ai/v1/Tool/Explore',
    );
    expect(JSON.parse(transport.requests[0]?.body ?? '')).toEqual(toolExplore);
    expect(categories[0]?.title).toBe('Featured');
    expect(categories[0]?.total).toBe(2);
    expect(categories[0]?.models[0]?.owner).toBe('openai');
    expect(categories[0]?.url?.toString()).toBe('https://wiro.ai/explore');
    expect(Object.isFrozen(categories)).toBe(true);
  });

  it('matches Tool/Detail golden and parses schema', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(
      200,
      JSON.stringify({
        tool: [
          {
            id: '1',
            parameters: [
              {
                items: [
                  {
                    id: 'prompt',
                    label: 'Prompt',
                    required: true,
                    type: 'textarea',
                  },
                ],
                title: 'Inputs',
              },
            ],
            slugowner: 'black-forest-labs',
            slugproject: 'flux-2-pro',
          },
        ],
      }),
    );

    const schema = await client(transport).getModelSchema(
      new WiroModelId('black-forest-labs', 'flux-2-pro'),
    );

    expect(transport.requests[0]?.url).toBe(
      'https://api.wiro.ai/v1/Tool/Detail',
    );
    expect(JSON.parse(transport.requests[0]?.body ?? '')).toEqual(toolDetail);
    expect(schema.parameters[0]).toBeInstanceOf(WiroTextModelParameter);
    expect(schema.parameters[0]?.name).toBe('prompt');
  });

  it('fails when schema response contains no model', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"tool":[]}');

    const error = await client(transport)
      .getModelSchema(new WiroModelId('openai', 'gpt-image-2'))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WiroUnknownApiError);
    expect(error).toMatchObject({
      message: 'The model schema response did not contain a model.',
      statusCode: 200,
    });
  });

  it('keeps API result failures typed', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(
      200,
      '{"result":false,"errors":[{"code":"E1","message":"nope"}]}',
    );

    const error = await client(transport)
      .searchModels()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WiroApiResultError);
    expect(error).toMatchObject({
      apiCode: 'E1',
      message: 'nope',
    });
  });

  it('logs malformed nested JSON by length only', async () => {
    const malformed = '{"secret":"not closed"';
    const events: WiroLogEvent[] = [];
    const transport = new FakeHttpTransport();
    transport.enqueueJson(
      200,
      JSON.stringify({
        result: true,
        tool: [{ taskstat: malformed }],
        total: 1,
      }),
    );

    const result = await client(transport, events).searchModels();

    expect(result.items[0]?.taskStats?.runCount).toBe(0);
    expect(
      events.some(
        (event) =>
          event.message ===
          `Ignored malformed nested JSON string (length ${malformed.length}).`,
      ),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toContain(malformed);
  });
});
