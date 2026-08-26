# TrailTeam mobile release checklist

This workspace produces the iOS and Android shells from the same Vite build. The
native package identifiers are permanent:

- iOS: `com.trailtribemtb.trailtribe`
- Android: `com.trailtribemtb.trailtribe`
- Store listing name: TrailTeam
- Support: support@trailtribemtb.com / https://trailtribemtb.com
- Current public domain: https://trailtribemtb.com (retained for link compatibility)

## Local development

1. Install the platform toolchains (Xcode on macOS and Android Studio/JDK for
   Android).
2. Set the same Clerk and API environment values used by the web artifact.
3. Run `pnpm --filter @workspace/trailtribe run build`.
4. Run `pnpm --filter @workspace/trailtribe run mobile:sync`.
5. Open the platform project with `mobile:ios` or `mobile:android`.
6. For a live dev server, use `CAP_SERVER_URL=https://... CAP_CLEAR_TEXT=true`
   before `cap sync`; never ship a build with `CAP_SERVER_URL`.

## Release configuration

- Replace the `REPLACE_WITH_*` values in `public/.well-known/apple-app-site-association`
  and `public/.well-known/assetlinks.json` with the Apple Team ID and the
  Play App Signing SHA-256 fingerprint. Verify both files over HTTPS on
  `https://trailtribemtb.com/.well-known/`.
- Configure Google and Sign in with Apple in Clerk, including native redirect
  URLs for the production domain. Keep invitation links on the verified
  production domain so the app can open `/events/*`, `/messages/*`,
  `/carpools/*`, `/family-invite/*`, and `/rider-invite/*`.
- In Xcode, enable Push Notifications and Associated Domains
  (`applinks:trailtribemtb.com`), set the App Group only if a later native
  extension needs it, and provide APNs production credentials.
- In Android Studio, confirm the package ID, HTTPS app links intent filter,
  notification permission, release keystore, and Play App Signing.
- Only request push permission after sign-in. Logout removes the device token
  from the authenticated account; the API also removes tokens with the owning
  user on account deletion.

## Test tracks and rollback

- Web: `pnpm --filter @workspace/trailtribe run typecheck`, `test`, and `build`.
- Native: `mobile:release:ios` on a macOS signing runner and
  `mobile:release:android` with the upload key.
- Test cold start, warm start, invite links while signed out, notification
  taps after sign-in, back navigation, keyboard forms, safe-area devices,
  offline retry, account switching, and logout on iPhone 12 mini, Pixel 8,
  Pixel 4a, and Galaxy Z Flip 6.
- Upload iOS to TestFlight and Android to Play internal testing first. Store
  records still need privacy policy/terms URLs, screenshots, age/content
  ratings, Data Safety/privacy labels, reviewer credentials, and account
  deletion support before production submission.
- Increment the native version/build number for every upload. Roll back by
  stopping staged rollout and promoting the last known-good build; never reuse
  an already-uploaded build number.