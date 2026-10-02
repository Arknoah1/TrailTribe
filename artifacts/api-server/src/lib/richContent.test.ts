import { describe, expect, it } from "vitest";
import { hasInlineMarkdownImages, renderEmailContent } from "./richContent";

describe("discussion and broadcast email content", () => {
  it("keeps legacy plain text literal and escapes it in HTML", () => {
    const rendered = renderEmailContent("Keep **these** literal <script>alert(1)</script>", "plain");
    expect(rendered.text).toBe("Keep **these** literal <script>alert(1)</script>");
    expect(rendered.html).toContain("Keep **these** literal &lt;script&gt;");
    expect(rendered.html).not.toContain("<script>");
  });

  it("renders GFM tables and formatting while escaping raw HTML and unsafe links", () => {
    const rendered = renderEmailContent(
      "# Results\n\n| Rider | Time |\n| --- | ---: |\n| **Ari** | 1:23 |\n\n[x](javascript:alert(1))\n\n[team site](https://example.test/team) and [coach](mailto:coach@example.test) [relative](/account)\n\n<script>alert(1)</script>",
      "markdown",
    );
    expect(rendered.html).toContain("<h1>Results</h1>");
    expect(rendered.html).toContain("<table");
    expect(rendered.html).toContain("<strong>Ari</strong>");
    expect(rendered.html).toContain("text-align:right");
    expect(rendered.html).toContain("https://example.test/team");
    expect(rendered.html).toContain("mailto:coach@example.test");
    expect(rendered.html).not.toContain('href="/account"');
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain('href="javascript:');
    expect(rendered.text).toContain("Ari");
    expect(rendered.text).toContain("1:23");
    expect(rendered.text).toContain("team site (https://example.test/team)");
    expect(rendered.text).toContain("coach (mailto:coach@example.test)");
  });

  it("renders uploaded pictures as inline CID attachments and readable text references", () => {
    const rendered = renderEmailContent("Practice photos:", "markdown", [
      { cid: "reply-4-image-1@trailteam", filename: "discussion-image-1.png" },
    ]);
    expect(rendered.html).toContain('src="cid:reply-4-image-1@trailteam"');
    expect(rendered.text).toContain("[Attached image: discussion-image-1.png]");
  });

  it("recognizes Markdown image syntax so remote image URLs can be rejected", () => {
    expect(hasInlineMarkdownImages("![tracking pixel](https://example.test/pixel.png)")).toBe(true);
    expect(hasInlineMarkdownImages("![local](data:image/png;base64,AAAA)")).toBe(true);
    expect(hasInlineMarkdownImages("[ordinary link](https://example.test)")).toBe(false);
    expect(renderEmailContent("![external](https://example.test/image.png)", "markdown").html)
      .not.toContain("<img");
  });
});