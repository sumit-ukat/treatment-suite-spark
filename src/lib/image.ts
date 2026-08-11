/**
 * Client-side photograph downscaling, so a 12MP phone photo becomes something sensible before it is
 * uploaded rather than being rejected at the bucket for exceeding its 5MB limit (migration 0016).
 *
 * Deliberately a *resize*, not merely a re-encode: the size problem with a modern camera photo is
 * pixel count, and re-encoding 4032×3024 at a lower quality still produces a large file. Capping the
 * long edge is what actually brings it down, and 1600px is far more than a 96px identification
 * avatar will ever need while staying good enough to open full-size and recognise a face.
 *
 * Everything is normalised to JPEG. The bucket accepts JPEG/PNG/WebP, but a photograph gains nothing
 * from PNG (it is a lossless format for line art, and a PNG photo is typically several times larger),
 * and a transparent source flattened onto white is the honest reading for a portrait. That flatten is
 * explicit below — without it, transparent pixels encode as black.
 *
 * `imageOrientation: 'from-image'` matters more than it looks: phone cameras store the sensor image
 * unrotated plus an EXIF orientation flag. Drawing to a canvas discards EXIF, so without this every
 * portrait photo taken on a phone would be silently saved on its side.
 */

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.85;

export interface PreparedImage {
  file: File;
  /** Bytes before processing, so the caller can report what actually happened rather than guess. */
  originalBytes: number;
}

/**
 * Returns a downscaled JPEG, or the original file when processing would not help (it is already
 * small, or the browser cannot decode it — in which case the upload proceeds and the bucket remains
 * the authority on what it will accept).
 */
export async function preparePhotoForUpload(file: File): Promise<PreparedImage> {
  const originalBytes = file.size;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Not decodable here (an exotic colour profile, a corrupt file). Let the server decide.
    return { file, originalBytes };
  }

  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > MAX_EDGE_PX ? MAX_EDGE_PX / longEdge : 1;

    // Already small enough and already a JPEG: re-encoding would only lose quality for nothing.
    if (scale === 1 && file.type === 'image/jpeg') {
      return { file, originalBytes };
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { file, originalBytes };

    // Flatten onto white before drawing — see the file header on transparency.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) return { file, originalBytes };

    // A tiny source can encode *larger* as JPEG than it arrived. Keep whichever is actually smaller.
    if (blob.size >= originalBytes && scale === 1) {
      return { file, originalBytes };
    }

    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return {
      file: new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified }),
      originalBytes,
    };
  } finally {
    bitmap.close();
  }
}

/** `1.4 MB` / `812 KB` — for telling the user what was uploaded, not for storage. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
