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
