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

## Step 5 — Run and task management

| Area                 | React Native behavior                              | Reason                           |
| -------------------- | -------------------------------------------------- | -------------------------------- |
| Billable run retries | `/Run/*` is never retried                          | Prevents duplicate billable work |
| Path segments        | RFC 3986 UTF-8 percent encoding                    | Prevents path injection          |
| Callback URL         | HTTP(S), query allowed, no credentials or fragment | Matches Kotlin hardening         |
| Cancellation         | Native `AbortError` is preserved                   | Cancellation is not hidden       |
| Task statuses        | Unknown raw values remain inspectable              | Forward compatibility            |
| Terminal states      | Only completed and cancelled                       | Matches Swift and Kotlin         |
| Success              | Completed status and exit code zero                | Avoids false success results     |

Run, task detail, cancel, and kill request bodies remain wire-compatible with
the shared golden fixtures.

## Step 6 — Uploads and file resolution

| Area              | React Native behavior                           | Reason                                        |
| ----------------- | ----------------------------------------------- | --------------------------------------------- |
| Buffered files    | `Uint8Array` and `Blob`, capped at 16 MiB       | Bounded JavaScript heap usage                 |
| Expo picker files | Native `FormData` with `file://`/`content://`   | Avoids buffering large files in JavaScript    |
| URI content type  | Native stack owns the multipart boundary header | React Native's supported URI upload path      |
| Byte multipart    | Exact Swift/Kotlin CRLF framing and escaping    | Shared wire fixture compatibility             |
| Nested resolution | Sequential, one upload per local occurrence     | Deterministic order; no hidden deduplication  |
| Stream uploads    | Async byte streams with a declared length       | Dart `uploadStream` surface; JS still bounded |
| Remote URLs       | Converted directly to URL strings               | No unnecessary upload                         |
| Upload retries    | Never retried                                   | Prevents duplicate side effects               |
| Temporary files   | None created by the SDK                         | No cleanup dependency or filesystem module    |
| Cancellation      | Native `AbortError` is preserved                | Expo and React Native async convention        |
| Content source    | Injectable, with Expo-native default            | Platform-neutral core tests                   |

Native URI uploads intentionally omit a caller-supplied `Content-Type` header;
React Native adds the correct multipart boundary. Buffered uploads set the
boundary explicitly and match the Swift/Kotlin golden bytes. All file parts
use field name `file` and `application/octet-stream`.

## Step 7 — Polling and subscriptions

| Area                  | React Native behavior                             | Reason                                     |
| --------------------- | ------------------------------------------------- | ------------------------------------------ |
| Deadline clock        | Monotonic milliseconds                            | Immune to wall-clock changes               |
| Polling sleep         | Clamped to the remaining timeout                  | Never overshoots the tracking budget       |
| First snapshot        | Requested immediately before any sleep            | Matches Swift and Kotlin                   |
| `watchTask`           | Explicit single-consumer `AsyncIterable`          | Prevents accidental duplicate polling      |
| `subscribeStream` run | Completes once before returning the iterable      | Prevents duplicate billable runs           |
| Stream re-consumption | Re-polls the captured token; never repeats `/Run` | React Strict Mode-safe subscription handle |
| Cancellation          | Native `AbortError`                               | React Native async convention              |
| Terminal statuses     | Completed and cancelled only                      | Matches task-status parity                 |
| Step 7 WebSocket mode | Temporarily follows polling                       | WebSocket transport belongs to Step 8      |

`subscribe` and `subscribeStream` validate timeout and tracking mode before
starting a billable run. Polling emits only `WiroTaskSnapshotUpdate` values;
socket event and binary update variants are introduced with Step 8.

## Step 8 — WebSocket tracking

| Area                  | React Native behavior                        | Reason                                 |
| --------------------- | -------------------------------------------- | -------------------------------------- |
| Production socket     | Standard Expo Go / React Native `WebSocket`  | No custom native module                |
| Session seam          | Injectable `WiroSocketSessionFactory`        | Deterministic platform-neutral tests   |
| Authentication        | Exact `task_info` token handshake            | Matches Swift and Kotlin wire contract |
| Frame limits          | Configurable UTF-8 text and binary byte caps | Matches Kotlin hardening               |
| Binary ownership      | Defensive `Uint8Array` copies                | Prevents external mutation             |
| Tracking deadline     | Monotonic remaining budget                   | Prevents fallback timeout reset        |
| Early socket close    | Detail fetch, then remaining-budget polling  | No repeated billable run               |
| Terminal socket event | Canonical Detail snapshot emitted last       | Polling and socket terminal parity     |
| Cancellation          | Native `AbortError`                          | React Native async convention          |
| Cleanup               | Idempotent close on every termination path   | Prevents leaked sockets and listeners  |

Swift fetches canonical task detail after a terminal socket event but does not
emit that detail as a final update. React Native follows Kotlin hardening and
emits `WiroTaskSnapshotUpdate` last. Socket timeouts and aborts never fall back;
protocol errors and early closure may recover without starting another model
run.

## Step 9 — Typed model requests

| Area                | React Native behavior                              | Parity basis                          |
| ------------------- | -------------------------------------------------- | ------------------------------------- |
| Factory namespace   | `Wiro` static factory object                       | Swift/Kotlin discoverability          |
| Factory arguments   | Strict TypeScript options objects                  | Idiomatic named-argument equivalent   |
| Typed catalog       | 13 typed factories plus dynamic `model`            | Swift/Kotlin golden catalog           |
| Enum representation | Frozen string-valued objects and literal unions    | Exact provider wire values            |
| Optional values     | `undefined` omits the wire key                     | Kotlin null / Swift optional omission |
| Empty file arrays   | Encoded as empty arrays                            | Reference wire behavior               |
| Local file inputs   | Preserved until Expo upload resolution             | Step 6 integration                    |
| Numeric safety      | Requires safe integers for integer provider fields | Kotlin/Swift integer type equivalent  |
| Runway seed         | Enforces `0...4294967295`                          | Swift documented/provider range       |
| Upscaler            | No `google/upscaler` typed factory                 | Explicit port exclusion               |

Provider-specific string booleans, string integers, Kling `on`/`off`, file
key remapping, Kling's always-present `multiPrompt`, and Hailuo's singular
input-to-array encoding match the shared golden fixtures. The TypeScript
options-object shape is the only API-style difference from Swift and Kotlin
named parameters.

## Step 10 — Hardening and parity audit

| Area                    | React Native behavior                                                      | Reason                                                  |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| Client concurrency      | Concurrent requests share one client; no actor isolation                   | Idiomatic JavaScript async model                        |
| Signature nonces        | Process-wide monotonic numeric nonces                                      | Prevents same-millisecond parallel collisions           |
| Cancellation            | Native `AbortError` and custom abort reasons preserved                     | React Native async contract; no retry after abort       |
| Retry-After             | Non-finite/negative ignored; finite delays clamped to `2^31-1` ms          | Prevents `setTimeout` overflow; HTTP-date still ignored |
| API code lexemes        | Fractional numbers keep wire text (`7.0` → `"7.0"`)                        | Matches Kotlin `BigDecimal.intValueExact`               |
| Public `postJson` paths | Query, fragment, NUL/CRLF/`\`, decoded `.`/`..` rejected                   | Path injection hardening before networking              |
| JSON depth              | Shared 128 limit for parse, stringify, and file resolution                 | Matches Kotlin recursion ceiling                        |
| REST body streaming     | Chunked read when `ReadableStream` exists; else Content-Length + post-read | Expo Go may omit streams; fallback remains bounded      |
| WebSocket enqueue       | Text/binary limits and queued-byte budget before buffering                 | Prevents unbounded memory growth                        |
| Socket deadline         | Session closed immediately when timeout wins                               | Avoids leaked sockets after `WiroTimeoutError`          |
| Redacted snapshots      | `toJSON` omits tokens, URI/URL inputs, and raw payloads                    | Safe logging; raw diagnostics stay on direct accessors  |
| Public export surface   | `decodeSocketFrame` / `WiroSocketFrameLimits` not exported                 | Internal protocol helpers stay private                  |
| Injectable seams        | `WiroHttpTransport` and `WiroSocketSessionFactory` remain public           | Deterministic tests without native modules              |
| Coverage exclusion      | Only `src/index.ts` is excluded                                            | Re-export barrel; business logic stays covered          |
| User-Agent              | `WiroKit-ReactNative/0.1.0`, best-effort                                   | RN/Expo may replace the header                          |
| Expo URI uploads        | Native `FormData` `file://` / `content://`                                 | No JS heap buffering of large picker files              |

Intentional differences from Swift remain: concurrent (non-actor) client,
native abort semantics, Expo URI uploads, React Native User-Agent, Kotlin-style
terminal Detail snapshot after socket completion, monotonic tracking clock, and
REST/WebSocket body limits where Swift is less strict.
