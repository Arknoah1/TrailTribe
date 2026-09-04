import { describe, expect, it } from "vitest";
import {
  extractYouTubeVideoId,
  fallbackLinkPreview,
  isPrivatePreviewAddress,
  parseLinkPreviewHtml,
  safeImageDataUri,
} from "./linkPreview";

describe("link preview metadata", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=20", "dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("extracts the video ID from %s", (input, expected) => {
    expect(extractYouTubeVideoId(new URL(input))).toBe(expected);
  });

  it("provides a useful YouTube fallback without remote metadata", () => {
    expect(fallbackLinkPreview(new URL("https://youtu.be/dQw4w9WgXcQ"))).toMatchObject({
      title: "YouTube video",
      siteName: "YouTube",
      provider: "youtube",
      imageUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
  });

  it("extracts and sanitizes rich Open Graph metadata", () => {
    const metadata = parseLinkPreviewHtml(
      new URL("https://example.com/trails/skills"),
      `<html><head>
        <meta content="Trail Skills &amp; Drills" property="og:title">
        <meta property="og:description" content="  Practice &lt;b&gt;cornering&lt;/b&gt; safely.  ">
        <meta property="og:site_name" content="Trail Academy">
        <meta property="og:image" content="/images/skills.jpg">
      </head></html>`,
    );

    expect(metadata).toMatchObject({
      title: "Trail Skills & Drills",
      description: "Practice cornering safely.",
      siteName: "Trail Academy",
      imageUrl: "https://example.com/images/skills.jpg",
      provider: null,
    });
  });

  it("rejects unsafe image schemes and falls back cleanly", () => {
    const metadata = parseLinkPreviewHtml(
      new URL("https://example.com"),
      `<meta property="og:image" content="javascript:alert(1)"><title>Example</title>`,
    );
    expect(metadata.imageUrl).toBeNull();
    expect(metadata.title).toBe("Example");
  });

  it.each([
    "127.0.0.1",
    "10.20.30.40",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:c0a8:101",
    "64:ff9b::127.0.0.1",
    "2001:db8::1",
    "ff02::1",
  ])("blocks private preview address %s", (address) => {
    expect(isPrivatePreviewAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows public preview address %s",
    (address) => {
      expect(isPrivatePreviewAddress(address)).toBe(false);
    },
  );

  it("only creates inline images from successful bounded raster responses", () => {
    expect(safeImageDataUri(302, "image/jpeg", Buffer.from("image"))).toBeNull();
    expect(safeImageDataUri(200, "text/html", Buffer.from("<script>bad()</script>"))).toBeNull();
    expect(safeImageDataUri(200, "image/svg+xml", Buffer.from("<svg/>"))).toBeNull();
    expect(safeImageDataUri(200, "image/jpeg", Buffer.alloc(512 * 1024 + 1))).toBeNull();
    expect(safeImageDataUri(200, "image/png", Buffer.from("image"))).toBe(
      "data:image/png;base64,aW1hZ2U=",
    );
  });
});