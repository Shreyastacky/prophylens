# Privacy: public alpha 0.1.0

The application makes same-origin requests for its page, scripts and Stockfish assets. The Sites hosting provider receives ordinary connection metadata, including IP addresses and request information. The hosting edge may use security cookies and bot-protection scripts. ProphyLens has no analytics SDK, accounts, advertising, cloud game database or online peer lookup.

PGNs, headers, engine reviews, settings, timestamps, selected player and practice attempts remain in this browser's IndexedDB. A prior version's latest localStorage receipt is migrated only after successful validation and persistence; failed migration preserves the original record.

Delete removes one game and its attempts. Clear library removes all library records and the legacy receipt. Exported JSON and PGN files remain wherever the user saved them. Storage can be blocked, cleared or evicted by the browser; export backups. Storage failure does not prevent downloading a completed review.

Local data is not encrypted against someone with device access. Changing browsers, devices or site origins does not transfer the library; use export/import. External source and feedback links open GitHub, which has its own privacy policy. Do not include private headers in public feedback.

Limits: PGN import 2 MB / 100 games / 600 half-moves per game; library backup 20 MB / 100 records. Imports validate schemas, hashes, positions, legal engine variations and attempts before writing. PGN parsing runs in a bounded-time worker.

Any future sync, peer lookup or analytics requires a new documented data flow and clear user controls before release.
