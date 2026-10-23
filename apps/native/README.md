# CABO Human Capital — Native Flutter client

This is a genuinely rendered Flutter UI for Android, iOS, Windows, macOS and Linux, not a WebView or repackaged PWA. It uses the shared CABO HR backend for authentication, a personal employee dashboard, and evidence-based career review requests. CABO Clay, Gold and dark background are embedded as design tokens.

## Development

Requires the current stable Flutter SDK and the platform's own build tools.

1. From apps/native run: `flutter create --project-name cabo_human_capital --platforms android,ios,windows,macos,linux --no-overwrite .`
2. Run `flutter pub get`, `flutter analyze` and `flutter test`.
3. Run with a real HTTPS backend: `flutter run --dart-define=CABO_API_BASE_URL=https://your-verified-hr-domain.example`.
4. After registering an organization member with the backend, HR must link that existing account to the employee profile.

Platform-specific builds include `flutter build apk`, `flutter build appbundle`, `flutter build ios`, `flutter build windows`, `flutter build macos` and `flutter build linux`. Apple builds require macOS/Xcode and valid provisioning; production Android builds require signing. This repository does not yet contain signed distributable binaries.

## Security and scope

The client uses native Flutter widgets with encrypted secure storage for the server's session cookie, platform-supported authentication and HTTPS. The backend remains the authority for access control. Never use HTTP for a publicly deployed service. Real phones need a reachable backend, not localhost. A device reaching sign-in does not imply all HR modules are supported.

**Incomplete:** native recruiter/admin workflows, offline-safe queueing, notification permissions, automated APK/IPA/EXE distribution, app store compliance, device compatibility testing, secure renewal and remote logout validation, accessibility review and production privacy assessment. Exact device support depends on Flutter's supported OS versions; no claim of all historic devices is made.
