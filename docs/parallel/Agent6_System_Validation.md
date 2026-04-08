# Agent 6 System Validation

## Runtime Constraints

- Target runtime is Android Capacitor native. Browser F12 mobile emulation is only a manual UI test surface, not a storage or device-capability equivalent.
- Native filesystem writes should be treated as app sandbox / Capacitor-managed storage semantics. Browser development may still route through Capacitor web or dev mocks, but must not be labeled as native runtime.
- Haptics support differs by runtime:
  - Android Capacitor native: Capacitor Haptics plugin
  - Browser mobile simulation: Web Vibration API if supported
  - Desktop browser: usually no-op

## Key Runtime Differences

- `Capacitor.isNativePlatform()` must remain `false` in browser development. Forcing it to `true` causes system branches to skip browser-only safeguards such as directory picker handling and safe fallback logic.
- Browser F12 cannot validate Android storage permissions, sandbox paths, lifecycle, backgrounding, or plugin-availability edge cases.
- Browser vibration support is weaker than native haptics and may be ignored by desktop browsers entirely.

## Current Risks

- `FilesystemService` still falls back to a Capacitor-compatible adapter in plain browser runtime because a dedicated browser filesystem adapter has not been implemented yet.
- Native permission behavior is only partially exercised in browser development; final validation still requires Android device or emulator runs.
- `capacitor.config.ts` is still minimal and does not yet encode any Android-specific tuning beyond base app identity and `webDir`.

## Coordination Notes For Agent 0

- If later agents need stronger browser/local persistence semantics, that should be a separate system task under Agent 6 scope rather than ad hoc logic in business services.
- Final integration should include one Android device or emulator pass for filesystem permission prompts, app restart persistence, and haptics behavior.
