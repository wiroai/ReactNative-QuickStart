# Security policy

## Supported versions

Security fixes are provided for the latest published release. During the
pre-1.0 period, only the latest `0.x` release is supported.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Email `support@wiro.ai` with:

- A description of the issue
- Reproduction steps or a proof of concept
- The affected package version and platform
- The potential impact
- Any suggested remediation

Do not include active API credentials or private customer data. Wiro will
acknowledge the report, investigate it, and coordinate disclosure and release
timing with the reporter.

## Credential safety

Long-lived Wiro API keys and secrets must not be embedded in production
mobile applications. Use a trusted backend or `WiroClient` proxy mode.

Prefer redacted snapshots (`JSON.stringify(task)`, `WiroLogEvent`) over raw
tokens, URI inputs, and response bodies in application logs.
