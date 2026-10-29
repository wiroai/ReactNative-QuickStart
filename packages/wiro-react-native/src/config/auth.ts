export const WiroAuthType = Object.freeze({
  apiKey: 'apiKey',
  signature: 'signature',
  proxy: 'proxy',
} as const);

export type WiroAuthType = (typeof WiroAuthType)[keyof typeof WiroAuthType];

export const WiroClientDefaults = Object.freeze({
  pollIntervalMs: 3_000,
  requestTimeoutMs: 30_000,
  restBaseUrl: 'https://api.wiro.ai/v1',
  webSocketUrl: 'wss://socket.wiro.ai/v1',
});
