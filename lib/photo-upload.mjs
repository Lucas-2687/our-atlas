import sharp from "sharp";

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
// Leave multipart overhead below Vercel's 4.5 MB request limit.
export const MAX_PHOTO_REQUEST_BYTES = MAX_PHOTO_BYTES + 64 * 1024;
export const MAX_PHOTO_PIXELS = 40_000_000;
export const MAX_PHOTO_DIMENSION = 16_384;
export const MAX_SAVED_PHOTO_DIMENSION = 4096;

const invalidPhoto = "无法读取这张图片，请选择有效的 JPG、PNG 或 WebP 照片";

export class PhotoUploadError extends Error {
  /** @param {400 | 413} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.name = "PhotoUploadError";
    this.status = status;
  }
}

/** @param {Request} req @returns {Promise<File>} */
async function readPhotoFile(req) {
  const contentType = req.headers.get("content-type") || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !req.body) {
    throw new PhotoUploadError(400, "请选择要上传的照片");
  }
  const length = req.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_PHOTO_REQUEST_BYTES)) {
    await req.body.cancel().catch(() => {});
    throw new PhotoUploadError(413, "上传内容太大，请选择 4 MB 以内的照片");
  }

  const reader = req.body.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PHOTO_REQUEST_BYTES) {
        await reader.cancel().catch(() => {});
        throw new PhotoUploadError(413, "上传内容太大，请选择 4 MB 以内的照片");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof PhotoUploadError) throw error;
    throw new PhotoUploadError(400, "上传内容无法读取，请重新选择照片");
  } finally {
    reader.releaseLock();
  }

  let form;
  try {
    form = await new Response(Buffer.concat(chunks, size), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new PhotoUploadError(400, "上传内容无法读取，请重新选择照片");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new PhotoUploadError(400, "请选择要上传的照片");
  return file;
}

/**
 * @param {Uint8Array} bytes
 * @param {string} contentType
 * @returns {Promise<{ bytes: Uint8Array<ArrayBuffer>, contentType: string, extension: string }>}
 */
export async function sanitizePhoto(bytes, contentType) {
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new PhotoUploadError(413, "请选择 4 MB 以内的照片");
  }
  const format = contentType === "image/jpeg" ? "jpeg"
    : contentType === "image/png" ? "png"
      : contentType === "image/webp" ? "webp" : null;
  const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signatureMatches = format === "jpeg"
    ? input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff
    : format === "png"
      ? input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : format === "webp" && input.length >= 12 && input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP";
  if (!format || !signatureMatches) throw new PhotoUploadError(400, invalidPhoto);

  /** @type {import("sharp").Metadata} */
  let metadata;
  try {
    // Header inspection does not decode pixels; enforce our own limits before decoding.
    metadata = await sharp(input, { limitInputPixels: false, failOn: "warning" }).metadata();
  } catch {
    throw new PhotoUploadError(400, invalidPhoto);
  }
  if (metadata.format !== format || !metadata.width || !metadata.height) {
    throw new PhotoUploadError(400, invalidPhoto);
  }
  if (metadata.width > MAX_PHOTO_DIMENSION || metadata.height > MAX_PHOTO_DIMENSION || metadata.width * metadata.height > MAX_PHOTO_PIXELS) {
    throw new PhotoUploadError(413, "照片像素过大，请缩小后再上传");
  }

  let output;
  try {
    const image = sharp(input, { limitInputPixels: MAX_PHOTO_PIXELS, failOn: "warning" })
      .rotate()
      .resize({ width: MAX_SAVED_PHOTO_DIMENSION, height: MAX_SAVED_PHOTO_DIMENSION, fit: "inside", withoutEnlargement: true })
      .timeout({ seconds: 10 });
    // Sharp strips EXIF/GPS, XMP, IPTC and profiles unless metadata retention is requested.
    output = await (format === "jpeg" ? image.jpeg({ quality: 85 })
      : format === "png" ? image.png()
        : image.webp({ quality: 85 })).toBuffer();
  } catch {
    throw new PhotoUploadError(400, invalidPhoto);
  }
  if (output.byteLength > MAX_PHOTO_BYTES) {
    throw new PhotoUploadError(413, "照片处理后超过 4 MB，请缩小后再上传");
  }
  return {
    bytes: new Uint8Array(output),
    contentType,
    extension: format === "jpeg" ? "jpg" : format,
  };
}

/** @param {Request} req */
export async function preparePhotoUpload(req) {
  const file = await readPhotoFile(req);
  if (file.size > MAX_PHOTO_BYTES) throw new PhotoUploadError(413, "请选择 4 MB 以内的照片");
  return sanitizePhoto(new Uint8Array(await file.arrayBuffer()), file.type);
}
