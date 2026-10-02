import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  generation: "gen-1",
  contentType: "image/png",
  size: 4,
  bytes: Buffer.from("test"),
  getObjectEntityFile: vi.fn(),
  downloadObject: vi.fn(),
}));

vi.mock("./objectStorage", () => ({
  ObjectNotFoundError: class ObjectNotFoundError extends Error {},
  ObjectStorageService: class {
    getObjectEntityFile = storage.getObjectEntityFile;
    downloadObject = storage.downloadObject;
  },
}));

import {
  loadVerifiedPrivateImage,
  validatePrivateImageTotal,
} from "./privateImages";

beforeEach(() => {
  storage.generation = "gen-1";
  storage.contentType = "image/png";
  storage.size = 4;
  storage.bytes = Buffer.from("test");
  storage.getObjectEntityFile.mockReset().mockImplementation(async (_path: string, generation: string) => ({
    generation,
    getMetadata: async () => [{
      generation: storage.generation,
      contentType: storage.contentType,
      size: String(storage.size),
    }],
  }));
  storage.downloadObject.mockReset().mockImplementation(async () =>
    new Response(storage.bytes, { headers: { "content-type": storage.contentType } }),
  );
});

describe("private image generation and size safeguards", () => {
  it("loads bytes only from the attachment's pinned generation after MIME/size verification", async () => {
    const image = await loadVerifiedPrivateImage({
      objectPath: "/objects/broadcast-images/abc",
      generation: "gen-1",
      contentType: "image/png",
      size: 4,
    });
    expect(storage.getObjectEntityFile).toHaveBeenCalledWith(
      "/objects/broadcast-images/abc",
      "gen-1",
    );
    expect(image.bytes.toString()).toBe("test");
  });

  it("refuses generation metadata mismatches rather than loading a mutable replacement", async () => {
    storage.generation = "gen-2";
    await expect(loadVerifiedPrivateImage({
      objectPath: "/objects/broadcast-images/abc",
      generation: "gen-1",
      contentType: "image/png",
      size: 4,
    })).rejects.toThrow();
    expect(storage.downloadObject).not.toHaveBeenCalled();
  });

  it("enforces four-image and 15 MB aggregate email limits", () => {
    expect(() => validatePrivateImageTotal(
      Array.from({ length: 5 }, (_, index) => ({
        objectPath: `/objects/discussion-images/${index}`,
        contentType: "image/png",
        size: 1,
        generation: "gen-1",
      })),
    )).toThrow(/no more than 4/);
    expect(() => validatePrivateImageTotal([
      { objectPath: "/objects/discussion-images/a", contentType: "image/png", size: 8_000_000, generation: "1" },
      { objectPath: "/objects/discussion-images/b", contentType: "image/png", size: 8_000_000, generation: "1" },
    ])).toThrow(/15 MB total email attachment limit/);
  });
});