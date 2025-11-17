# Release v0.1.0

Release date: 2025-11-17

Highlights
- Initial lightweight Flask + SPA Group Expense Tracker release.
- Features:
  - Add/edit/delete participants and expenses.
  - Per-expense split selection (choose who shares each expense).
  - Deterministic cent-splitting (integer-cent arithmetic and deterministic remainder distribution).
  - Undo/restore for deleted expenses/participants.
  - Settings: event name and currency (default CAD).
  - Modal-based edit flows and toast notifications for improved UX.
  - Report generation and copy-to-clipboard.

Notes
- Settlement algorithm: greedy matching with priority to the highest payer; per-expense splits computed in cents.
- Tiny residual micro-payments occasionally appear; recommended to merge very small payments in a post-process step.

How to create GitHub release (local steps shown below)

1. Commit and tag locally:

   ```bash
   git add VERSION RELEASE_NOTES.md
   git commit -m "chore(release): v0.1.0"
   git tag -a v0.1.0 -m "v0.1.0"
   ```

2. Push tag and publish release on GitHub (requires `gh` CLI or use the GitHub web UI):

   ```bash
   git push origin main
   git push origin v0.1.0
   gh release create v0.1.0 -t "v0.1.0" -n "Release notes..." 
   ```

3. Build artifacts: zip the project into `dist/GroupExpenseTracker-v0.1.0.zip` or create platform-specific builds.
