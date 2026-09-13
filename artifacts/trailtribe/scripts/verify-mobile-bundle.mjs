import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultWebDir = path.join(packageRoot, "dist", "public");
const defaultNativeDir = path.join(
  packageRoot,
  "android",
  "app",
  "src",
  "main",
  "assets",
  "public",
);

const nativeGeneratedFiles = new Set(["cordova.js", "cordova_plugins.js"]);
const developmentClerkKeyPattern = /pk_test_[A-Za-z0-9_$-]{12,}/;
const startupFallbackMarkers = [
  "TrailTeam failed to start",
  'window.addEventListener("error"',
  'window.addEventListener("unhandledrejection"',
];

async function listFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      for (const nestedFile of await listFiles(entryPath)) {
        files.push(path.join(entry.name, nestedFile));
      }
    } else if (entry.isFile()) {
      files.push(entry.name);
    }
  }

  return files.sort();
}

async function readRequiredFile(filePath, description) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`[mobile bundle] ${description} is missing: ${filePath}`);
    }
    throw error;
  }
}

function fail(message) {
  throw new Error(`[mobile bundle] ${message}`);
}

function assertEntrypointIsUsable(indexHtml, label) {
  if (!indexHtml.trim()) {
    fail(`${label} is blank`);
  }

  if (!indexHtml.includes('<div id="root"></div>')) {
    fail(`${label} does not contain the app root`);
  }

  if (indexHtml.includes("/src/main.tsx")) {
    fail(`${label} still points at the development source entrypoint`);
  }

  for (const marker of startupFallbackMarkers) {
    if (!indexHtml.includes(marker)) {
      fail(`${label} is missing the startup fallback marker: ${marker}`);
    }
  }

  if (!/<script[^>]+src="\/assets\/[^"]+\.js"/.test(indexHtml)) {
    fail(`${label} does not contain a bundled JavaScript entrypoint`);
  }
}

function getAssetReferences(indexHtml) {
  return [...indexHtml.matchAll(/\b(?:src|href)="(\/assets\/[^"]+)"/g)].map(
    (match) => match[1],
  );
}

export async function verifyMobileBundle({
  webDir = defaultWebDir,
  nativeDir = defaultNativeDir,
} = {}) {
  const webFiles = await listFiles(webDir).catch((error) => {
    if (error?.code === "ENOENT") {
      throw new Error(`[mobile bundle] web build directory is missing: ${webDir}`);
    }
    throw error;
  });
  const nativeFiles = await listFiles(nativeDir).catch((error) => {
    if (error?.code === "ENOENT") {
      throw new Error(`[mobile bundle] native asset directory is missing: ${nativeDir}`);
    }
    throw error;
  });

  const webIndexPath = path.join(webDir, "index.html");
  const nativeIndexPath = path.join(nativeDir, "index.html");
  const webIndex = await readRequiredFile(webIndexPath, "web build entrypoint");
  const nativeIndex = await readRequiredFile(nativeIndexPath, "native web entrypoint");
  const webIndexText = webIndex.toString("utf8");
  const nativeIndexText = nativeIndex.toString("utf8");

  assertEntrypointIsUsable(webIndexText, "web build entrypoint");
  assertEntrypointIsUsable(nativeIndexText, "native web entrypoint");

  const expectedNativeFiles = new Set(webFiles);
  const actualNativeFiles = new Set(
    nativeFiles.filter((file) => !nativeGeneratedFiles.has(file)),
  );
  const missingFiles = webFiles.filter((file) => !actualNativeFiles.has(file));
  const staleFiles = [...actualNativeFiles].filter(
    (file) => !expectedNativeFiles.has(file),
  );

  if (missingFiles.length > 0) {
    fail(`native bundle is missing web build files: ${missingFiles.join(", ")}`);
  }
  if (staleFiles.length > 0) {
    fail(`native bundle contains stale web build files: ${staleFiles.join(", ")}`);
  }

  for (const relativeFile of webFiles) {
    const webFile = await fs.readFile(path.join(webDir, relativeFile));
    const nativeFile = await fs.readFile(path.join(nativeDir, relativeFile));
    if (!webFile.equals(nativeFile)) {
      fail(`native bundle file does not match the current web build: ${relativeFile}`);
    }
  }

  const missingAssetReferences = [];
  for (const reference of getAssetReferences(nativeIndexText)) {
    const relativeAsset = decodeURIComponent(reference.slice(1));
    const assetPath = path.join(nativeDir, relativeAsset);
    try {
      await fs.access(assetPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        missingAssetReferences.push(reference);
      } else {
        throw error;
      }
    }
  }
  if (missingAssetReferences.length > 0) {
    fail(`native entrypoint references missing assets: ${missingAssetReferences.join(", ")}`);
  }

  for (const relativeFile of nativeFiles) {
    if (nativeGeneratedFiles.has(relativeFile)) {
      continue;
    }
    const contents = await fs.readFile(path.join(nativeDir, relativeFile), "utf8");
    if (developmentClerkKeyPattern.test(contents)) {
      fail(`development Clerk key found in native web bundle: ${relativeFile}`);
    }
  }

  return {
    fileCount: webFiles.length,
    entrypoint: nativeIndexPath,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await verifyMobileBundle();
    console.log(
      `[mobile bundle] verified ${result.fileCount} web build files and native entrypoint`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}