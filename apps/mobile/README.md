# CABO Human Capital — native Flutter client

CABO Solutions' native-rendered Human Capital prototype for Android, iOS, Windows, macOS and Linux. It connects to the **existing** Render-hosted Node API backed by Neon PostgreSQL; it does not ship with a database, hardcoded login, or private credentials.

## Develop

Install Flutter stable and the required platform toolchain, then run:

```bash
cd apps/mobile
flutter create . --project-name cabo_human_capital --platforms android,ios,windows,macos,linux
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=CABO_API_BASE_URL=https://cabo-human-capital.onrender.com
```

GitHub Actions validates Flutter analyzer/test and attempts unsigned debug builds on Android, Windows, Linux, macOS and iOS. The Android debug artifact is an internal test build, **not** a signed Play Store release. iOS needs Apple signing, real-device QA and a developer team; desktop platforms need installers/signing/distribution. Native binaries must never be represented as released until those gates pass.

## Available in this iteration

- CABO branding, light/dark Material 3 theme, adaptive wide-screen navigation.
- Email or username sign-in; authenticator or recovery code where enabled.
- Session cookies stored in operating-system secure storage; HTTPS required except localhost.
- Live vacancies and recruitment dashboard using scoped CABO API.
- Verified staff profile, leave history, finalized reviews, development plans and human-reviewed progression request.
- Sign-out clears credentials even when temporarily offline.

## Boundaries

No real candidate data or CV documents are cached offline. No advertising trackers or analytics SDK. The app is an authenticated viewer and workflow client, not an automatic AI hiring authority. Public applications are still disabled pending POPIA approval. MFA setup, platform-admin management, payroll, notifications, offline sync and staff hiring decisions remain primarily web-based or future native phases.

**Security release gates:** native device tests; authentication and session-expiry tests; OS keychain validation; secret rotation; mobile penetration test; signing; accessibility testing and Play Store/App Store privacy declarations.
