import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const [
  source,
  cssSource,
  nativeAppSource,
  capacitorConfigSource,
  androidStylesSource,
  androidManifestSource,
  capacitorAndroidStatusBarSource,
  capacitorAndroidPluginSource,
  capacitorIosStatusBarSource,
] = await Promise.all([
  readFile(resolve(sourceDir, "layout.tsx"), "utf8"),
  readFile(resolve(sourceDir, "../index.css"), "utf8"),
  readFile(resolve(sourceDir, "../lib/native-app.ts"), "utf8"),
  readFile(resolve(sourceDir, "../../capacitor.config.ts"), "utf8"),
  readFile(resolve(sourceDir, "../../android/app/src/main/res/values/styles.xml"), "utf8"),
  readFile(resolve(sourceDir, "../../android/app/src/main/AndroidManifest.xml"), "utf8"),
  readFile(resolve(sourceDir, "../../node_modules/@capacitor/status-bar/android/src/main/java/com/capacitorjs/plugins/statusbar/StatusBar.java"), "utf8"),
  readFile(resolve(sourceDir, "../../node_modules/@capacitor/status-bar/android/src/main/java/com/capacitorjs/plugins/statusbar/StatusBarPlugin.java"), "utf8"),
  readFile(resolve(sourceDir, "../../node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBarPlugin.swift"), "utf8"),
]);

test("the mobile actions menu keeps notifications visible while grouping account controls", () => {
  assert.match(source, /<NotificationBell\s*\/>/);
  assert.match(source, /<DropdownMenu>/);
  assert.match(source, /<MoreHorizontal className="h-5 w-5"\s*\/>/);
  assert.match(source, /rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground data-\[state=open\]:bg-secondary data-\[state=open\]:text-primary transition-colors/);
  assert.match(source, /onSelect=\{\(\) => navigate\("\/profile"\)\}/);
  assert.match(source, /\{showAdminTabs && \(/);
  assert.match(source, /onSelect=\{toggleTheme\}/);
});

test("the mobile bottom bar links to the dedicated Volunteer destination", () => {
  assert.match(source, /href: "\/volunteer"/);
  assert.match(source, /label: "Volunteer"/);
  assert.match(source, /preloadHref: "\/volunteer"/);
  assert.match(source, /const mobileItems = \[\.\.\.baseNavItems\.slice\(0, 4\), volunteerNavItem\]/);
  assert.doesNotMatch(source, /const mobileItems = baseNavItems/);
});

test("the Volunteer route stays highlighted and the bottom-nav safe area remains measured", () => {
  assert.match(source, /getPathname\(location\) === "\/volunteer"/);
  assert.match(source, /--mobile-bottom-nav-height/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
});

test("the fixed mobile header reserves top and horizontal device safe areas", () => {
  assert.match(cssSource, /--app-safe-area-top:\s*env\(safe-area-inset-top,\s*0px\)/);
  assert.match(cssSource, /--app-safe-area-left:\s*env\(safe-area-inset-left,\s*0px\)/);
  assert.match(cssSource, /--app-safe-area-right:\s*env\(safe-area-inset-right,\s*0px\)/);
  assert.match(cssSource, /padding-top:\s*var\(--app-safe-area-top\)/);
  assert.match(source, /height:\s*"var\(--app-safe-area-top\)"/);
  assert.match(source, /paddingLeft:\s*"max\(1rem,\s*var\(--app-safe-area-left\)\)"/);
  assert.match(source, /paddingRight:\s*"max\(1rem,\s*var\(--app-safe-area-right\)\)"/);
  assert.match(source, /pt-16 md:pt-0/);
});

test("native status-bar icon contrast follows the selected theme", () => {
  assert.match(nativeAppSource, /StatusBar\.setStyle\(\{ style: theme === "dark" \? Style\.Dark : Style\.Light \}\);\s*\}, \[theme\]\);/);
  assert.match(capacitorConfigSource, /StatusBar:\s*\{[^}]*style:\s*"DARK"[^}]*\}/);
  assert.match(capacitorConfigSource, /backgroundColor:\s*"#0f1117"/);
});

test("Capacitor status-bar styles keep icon contrast correct on Android and iOS", () => {
  // Android LIGHT enables dark icons; DARK disables that flag for light icons.
  assert.match(capacitorAndroidStatusBarSource, /setAppearanceLightStatusBars\(!style\.equals\("DARK"\)\)/);
  // The iOS bridge maps those same style names to dark and light status content.
  assert.match(capacitorIosStatusBarSource, /case "dark", "lightcontent":\s*return \.lightContent/);
  assert.match(capacitorIosStatusBarSource, /case "light", "darkcontent":\s*return \.darkContent/);
});

test("Android starts with light icons over the dark splash regardless of device theme", () => {
  assert.match(androidStylesSource, /style name="AppTheme\.NoActionBar" parent="Theme\.AppCompat\.DayNight\.NoActionBar"[\s\S]*?android:windowLightStatusBar">false/);
  assert.match(androidStylesSource, /style name="AppTheme\.NoActionBarLaunch" parent="Theme\.SplashScreen"[\s\S]*?android:windowLightStatusBar">false/);
  assert.match(androidManifestSource, /configChanges="[^"]*uiMode/);
  assert.match(capacitorAndroidPluginSource, /handleOnConfigurationChanged[\s\S]*?implementation\.updateStyle\(\)/);
});