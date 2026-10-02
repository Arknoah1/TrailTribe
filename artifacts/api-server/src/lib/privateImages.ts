import { ObjectNotFoundError, ObjectStorageService } from "./objectStorage";

export const MAX_PRIVATE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PRIVATE_IMAGE_TOTAL_BYTES = 15 * 1024 * 1024;
export const MAX_PRIVATE_IMAGE_COUNT = 4;
export const PRIVATE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export interface PrivateImageRecord {
  objectPath: string;
  contentType: string;
  size: number;
  generation: string;
}

export interface VerifiedPrivateImage extends PrivateImageRecord {
  bytes: Buffer;
}

const storage = new ObjectStorageService();

export async function loadVerifiedPrivateImage(
  image: PrivateImageRecord,
): Promise<VerifiedPrivateImage> {
  if (!PRIVATE_IMAGE_TYPES.has(image.contentType)
      || image.size <= 0
      || image.size > MAX_PRIVATE_IMAGE_BYTES
      || !image.generation) {
    throw new Error("Private image metadata is invalid");
  }

  try {
    const file = await storage.getObjectEntityFile(image.objectPath, image.generation);
    const [metadata] = await file.getMetadata();
    if (
      String(metadata.generation ?? "") !== image.generation
      || metadata.contentType !== image.contentType
      || Number(metadata.size ?? 0) !== image.size
    ) {
      throw new Error("Private image changed after attachment");
    }
    const response = await storage.downloadObject(file, 0);
    if (!response.body) throw new Error("Private image bytes are unavailable");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength !== image.size) throw new Error("Private image bytes failed verification");
    return { ...image, bytes };
  } catch (error) {
    if (error instanceof ObjectNotFoundError) throw new Error("Private image generation is no longer available");
    throw error;
  }
}

export function validatePrivateImageTotal(images: PrivateImageRecord[]): void {
  if (images.length > MAX_PRIVATE_IMAGE_COUNT) {
    throw new Error(`Attach no more than ${MAX_PRIVATE_IMAGE_COUNT} images`);
  }
  const totalBytes = images.reduce((total, image) => total + image.size, 0);
  if (totalBytes > MAX_PRIVATE_IMAGE_TOTAL_BYTES) {
    throw new Error("Images exceed the 15 MB total email attachment limit. Attach up to four images, each no larger than 10 MB.");
  }
}