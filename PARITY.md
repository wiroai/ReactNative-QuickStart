# WiroKit React Native parity

This document records intentional differences from the Swift and Kotlin SDKs.
It will expand as each porting step is completed.

## Step 2 — Core types and errors

| Area              | React Native behavior                          | Reason                                                         |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| Identifier naming | `WiroModelId`, `WiroTaskId`                    | Idiomatic TypeScript casing; matches Kotlin                    |
| JSON numbers      | Original number lexemes are preserved          | Matches Kotlin hardening; avoids Swift `Double` precision loss |
| Cancellation      | Native `AbortError` is preserved               | React Native cancellation contract                             |
| Error model       | `Error` subclasses with stable category codes  | Supports reliable `instanceof`; matches Kotlin class hierarchy |
| Durations         | Finite millisecond `number` values             | Idiomatic JavaScript representation                            |
| Local files       | Expo URI variant replaces Android `ContentUri` | Expo Go-compatible platform integration                        |
| Blob input        | Immutable `Blob` variant is supported          | Standard React Native and Expo runtime type                    |
| Mutable bytes     | `Uint8Array` inputs and getters are copied     | Prevents public mutation of SDK state                          |
| Token rendering   | `WiroTaskToken.toString()` is redacted         | Matches Kotlin security hardening                              |

Wire-visible endpoint, retry, status-code, and identifier rules remain aligned
with the source SDKs.

## Step 3 — HTTP, authentication, and retries

| Area                 | React Native behavior                                    | Reason                                                   |
| -------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Production transport | Expo Go `fetch` with `AbortSignal`                       | No custom native module                                  |
| HMAC                 | Audited pure-JavaScript `@noble/hashes`                  | Runs in Hermes without native crypto or RNG              |
| User agent           | `WiroKit-ReactNative/0.1.0`, best-effort                 | React Native may replace `User-Agent`, especially on iOS |
| Cancellation         | Native `AbortError` is preserved                         | Matches React Native async conventions                   |
| Disposal             | Client aborts in-flight request and retry-delay work     | Matches Kotlin lifecycle hardening                       |
| Proxy headers        | Caller cannot replace SDK `User-Agent` or `Content-Type` | Matches Kotlin header hardening                          |
| Billable retries     | `/Run/*` and `/File/Upload` never retry                  | Matches Kotlin path-level safety gate                    |
| Invalid raw bodies   | Stored diagnostically, never used as error messages      | Prevents response-body leakage in rendered errors        |

HMAC input, nonce regeneration, retry defaults, `Retry-After` delta-seconds,
HTTP status mapping, and structured envelope extraction remain wire-compatible
with Swift and Kotlin.

## Step 4 — Discovery and schemas

| Area                    | React Native behavior                                 | Reason                                      |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------- |
| Pagination              | `start` and `limit` remain string-encoded on the wire | Matches Swift and Kotlin fixtures           |
| Unknown fields          | Retained in immutable `raw` values                    | Forward compatibility and diagnostics       |
| Unknown parameter kinds | Decode as `WiroUnknownModelParameter`                 | New server kinds do not crash older clients |
| Schema validation       | Unknown input keys are allowed                        | Matches dynamic Wiro request behavior       |
| Dates and URLs          | Defensive `Date` and `URL` copies                     | Prevents mutation of SDK state              |
| JSON numbers            | Lossless raw lexemes remain available                 | Matches Kotlin precision hardening          |

Discovery endpoint paths, fixed search flags, sort/order values, pagination
boundaries, and schema validation messages remain aligned with both source
SDKs.
