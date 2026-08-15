# Privacy design

ProphyLens is private by default, not private by slogan.

## Default behaviour

- PGNs and engine analysis stay in the browser's local storage.
- Stockfish runs on the user's device.
- There is no account requirement for core analysis.
- Analytics are absent unless a future, explicit opt-in decision is documented.
- Sharing and sync require deliberate user action and a separate threat model.

## Peer-data honesty

An online exact-position query discloses a position. A hash-prefix shard discloses less, but it is not zero disclosure. The UI and documentation must distinguish:

- offline pack: no position request;
- prefix-sharded fetch: reduced position fingerprint sent to CDN/server logs;
- online lookup: position and filters sent to the service.

Do not call all three “fully local.”

## Local data controls

Before beta, users need:

- visible storage use;
- per-game deletion and clear-all;
- export/import of their local library;
- documented cache expiry and schema migration;
- no sensitive PGN tags rendered unsafely.

If hosted features are added, this document must be replaced by a concrete data inventory, retention schedule, deletion workflow, subprocessors list, and incident process.
