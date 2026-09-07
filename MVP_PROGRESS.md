# MVP implementation checkpoints

- [x] Accounts, authentication, and ownership boundaries
- [x] Private storage and authenticated stem delivery
- [x] Bounded uploads, audio validation, real separation and labelled demo mode
- [x] Processing stages, transient retries, idempotence and stale-job retry
- [x] Validated project API and account libraries
- [x] Responsive studio and multi-file upload queue
- [x] Shared Web Audio playback, seek, mute, solo, volume and offsets
- [x] Autosave, explicit save and project restoration
- [x] Matching offline stereo WAV export
- [x] Backend regression tests: eight passing
- [x] Browser tests: four passing, including the live production stack
- [x] Desktop screenshot inspection and responsive overflow checks
- [x] Production Docker frontend build
- [x] Real two-track separation and private-storage verification
- [x] Final acceptance report: MVP_ACCEPTANCE.md

Each coherent stage is committed separately. Related plan items were combined where
they shared implementation boundaries. Manual alignment is the MVP scope;
pitch/tempo correction remains deferred. Test outputs and local environment files
are ignored, and test-created audio/accounts are retained for inspection.
