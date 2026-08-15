# Security policy

## Reporting

Do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting feature when enabled. If it is unavailable, contact the maintainer privately through the address on their GitHub profile and include affected version, reproduction steps, impact, and any suggested mitigation.

Please do not include private PGNs, credentials, tokens, or personal data unless strictly required; redact first.

## Scope

Important areas include PGN injection, unsafe imported tags/comments, provider URL handling, worker/message abuse, denial of service through large games or deep analysis, IndexedDB data exposure, share-link access control, cross-origin isolation mistakes, dependency compromise, and untrusted engine/model binaries.

No released version is supported during pre-alpha. That status is not permission to publish a vulnerability without giving maintainers a reasonable private window.
