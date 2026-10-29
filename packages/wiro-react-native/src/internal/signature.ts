import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { encodeUtf8 } from './utf8';

export function createWiroSignature(
  apiKey: string,
  apiSecret: string,
  nonce: string,
): string {
  const digest = hmac(
    sha256,
    encodeUtf8(apiKey),
    encodeUtf8(apiSecret + nonce),
  );
  let hex = '';
  for (const byte of digest) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
