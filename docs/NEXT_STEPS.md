# Next steps after public alpha

The alpha ships local review, evidence, library recovery and practice. Earlier engine-spike gaps are superseded by docs/RELEASE.md.

1. Collect opt-in feedback from 5–10 players reviewing their own completed games. Measure whether they understand the labels and complete the review/practice loop.
2. Test physical Android/iOS devices and Safari, including slow network, storage eviction, battery use and full-game analysis. Keep mobile experimental until measured.
3. Build a human-reviewed chess position corpus. Validate mate handling, difficult moves and label stability at several node budgets; record false positives and uncertainty.
4. Only then add recurring motif detection with deterministic explanations and expert validation.
5. Evaluate peer coverage on 100–200 representative games before implementing corpus infrastructure. Keep missing coverage visible.
6. Track retry and delayed re-test results before claiming improvement.

Dependency majors must pass compatibility and production browser checks. Keep security patches current. Retain the single-threaded pinned engine until a measured reason justifies changing it.
