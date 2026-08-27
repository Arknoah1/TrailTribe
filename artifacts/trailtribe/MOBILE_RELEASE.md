# TrailTeam mobile release checklist

This workspace produces the iOS and Android shells from the same Vite build. The
native package identifiers are permanent:

- iOS: `app.trailteam.trailteam`
- Android: `app.trailteam.trailteam`
- Store listing name: TrailTeam
- Support: coaches@methowcyclingteam.com / https://trailteam.app
- Current public domain: https://trailteam.app

## Local development

1. Install the platform toolchains (Xcode on macOS and Android Studio/JDK for
   Android).
2. Set the same Clerk and API environment values used by the web artifact.
3. Run `pnpm --filter @workspace/trailtribe run build`.
4. Run `pnpm --filter @workspace/trailtribe run mobile:sync`.
5. Open the platform project with `mobile:ios` or `mobile:android`.
6. For a live dev server, use `CAP_SERVER_URL=https://... CAP_CLEAR_TEXT=true`
   before `cap sync`; never ship a build with `CAP_SERVER_URL`.

## Debug APK sideloading

Use the debug build to install TrailTeam on an Android device before the Play
Store release process is ready:

1. Install a JDK plus Android SDK Platform 36 and Build Tools 36.0.0.
2. From the workspace root, run
   `pnpm --filter @workspace/trailtribe run mobile:debug:android`.
3. The debug-signed APK is created at
   `artifacts/trailtribe/android/app/build/outputs/apk/debug/app-debug.apk`.
4. On the Android device, download the APK, allow the browser or file manager
   to install unknown apps when Android prompts, then open TrailTeam.

This APK is for pre-store testing only. It uses the Android debug signing key
and must not be uploaded to Google Play. The app bundles the production web
build pointed at `https://trailteam.app`; do not set `CAP_SERVER_URL` for a
sideload build.

## GitHub debug releases

The `Build Android Debug APK` workflow runs manually or when a
`sideload-v*` tag is pushed. It builds a debug APK on GitHub, verifies the
TrailTeam package ID and the absence of deprecated identifiers, then attaches
the APK and a SHA-256 checksum to a prerelease.

- Start the workflow with a unique tag such as `sideload-v1.0.0-1`, or push a
  tag following that pattern.
- Download `trailteam-debug.apk` and `trailteam-debug.apk.sha256` from the
  release, verify the checksum, then follow the sideload steps above.
- GitHub releases are used for generated binaries. Do not commit APK files,
  keystores, or signing credentials to the source repository.

## Release configuration

- Replace the `REPLACE_WITH_*` values in `public/.well-known/apple-app-site-association`
  and `public/.well-known/assetlinks.json` with the Apple Team ID and the
  Play App Signing SHA-256 fingerprint. Verify both files over HTTPS on
  `https://trailteam.app/.well-known/`.
- Configure Google and Sign in with Apple in Clerk, including native redirect
  URLs for the production domain. Keep invitation links on the verified
  production domain so the app can open `/events/*`, `/messages/*`,
  `/carpools/*`, `/family-invite/*`, and `/rider-invite/*`.
- In Xcode, enable Push Notifications and Associated Domains
  (`applinks:trailteam.app`), set the App Group only if a later native
  extension needs it, and provide APNs production credentials.
- In Android Studio, confirm the package ID, HTTPS app links intent filter,
  notification permission, release keystore, and Play App Signing.
- Only request push permission after sign-in. Logout removes the device token
  from the authenticated account; the API also removes tokens with the owning
  user on account deletion.

## In-app account deletion review path

Both store builds use the same signed-in TrailTeam experience. A reviewer can
delete an account without leaving the installed app:

1. Sign in with an ordinary parent, rider, coach, or administrator account.
2. Open the top actions menu on a phone and choose **Profile** (or use
   **Profile** in the desktop/tablet navigation).
3. Keep **My Account** selected, scroll to **Delete Account**, and tap
   **Permanently delete my account**.
4. Type `DELETE MY ACCOUNT` and choose **Delete my account permanently**.

The app sends the authenticated request directly to TrailTeam, clears local
account data, and returns to the in-app sign-in screen. If the request cannot
finish, the account remains available and the dialog stays open so the person
can retry. This is the same flow on iOS and Android; it does not require email,
an external browser, or contacting support.

## Test tracks and rollback

- Web: `pnpm --filter @workspace/trailtribe run typecheck`, `test`, and `build`.
- Native: `mobile:release:ios` on a macOS signing runner and
  `mobile:release:android` with the upload key.
- Test cold start, warm start, invite links while signed out, notification
  taps after sign-in, back navigation, keyboard forms, safe-area devices,
  offline retry, account switching, logout, and in-app account deletion on iPhone 12 mini, Pixel 8,
  Pixel 4a, and Galaxy Z Flip 6.
- Upload iOS to TestFlight and Android to Play internal testing first. Store
  records still need privacy policy/terms URLs, screenshots, age/content
  ratings, Data Safety/privacy labels, reviewer credentials, and account
  deletion support before production submission.
- Increment the native version/build number for every upload. Roll back by
  stopping staged rollout and promoting the last known-good build; never reuse
  an already-uploaded build number.
