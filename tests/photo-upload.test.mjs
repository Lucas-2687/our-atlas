import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_DIMENSION,
  MAX_PHOTO_PIXELS,
  MAX_PHOTO_REQUEST_BYTES,
  MAX_SAVED_PHOTO_DIMENSION,
  PhotoUploadError,
  preparePhotoUpload,
  sanitizePhoto,
} from "../lib/photo-upload.mjs";

// This TIFF contains only fabricated coordinates and an EXIF orientation of 6.
function syntheticExif() {
  const tiff = Buffer.alloc(140);
  tiff.write("II");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  function entry(offset, tag, type, count, value) {
    tiff.writeUInt16LE(tag, offset);
    tiff.writeUInt16LE(type, offset + 2);
    tiff.writeUInt32LE(count, offset + 4);
    tiff.writeUInt32LE(value, offset + 8);
  }
  entry(10, 0x0112, 3, 1, 6);
  entry(22, 0x8825, 4, 1, 38);
  tiff.writeUInt16LE(4, 38);
  entry(40, 1, 2, 2, 78); // N
  entry(52, 2, 5, 3, 92);
  entry(64, 3, 2, 2, 69); // E
  entry(76, 4, 5, 3, 116);
  for (const [index, value] of [12, 34, 56, 65, 43, 21].entries()) {
    tiff.writeUInt32LE(value, 92 + index * 8);
    tiff.writeUInt32LE(1, 96 + index * 8);
  }
  return Buffer.concat([Buffer.from("Exif\0\0"), tiff]);
}

function jpegSegment(marker, bytes) {
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(bytes.length + 2, 2);
  return Buffer.concat([header, bytes]);
}

async function makeFixture() {
  const pixels = Buffer.alloc(24 * 12 * 3);
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 24; x++) {
      pixels.set(x < 12 ? [240, 20, 20] : [20, 20, 240], (y * 24 + x) * 3);
    }
  }
  const jpeg = await sharp(pixels, { raw: { width: 24, height: 12, channels: 3 } })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
  const xmp = Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="12,34.56N" /></rdf:RDF></x:xmpmeta>');
  const caption = Buffer.from("synthetic-iptc-caption");
  const iptc = Buffer.concat([Buffer.from([0x1c, 2, 120, 0, caption.length]), caption]);
  const resource = Buffer.alloc(12);
  resource.write("8BIM");
  resource.writeUInt16BE(0x0404, 4);
  resource.writeUInt32BE(iptc.length, 8);
  const photoshop = Buffer.concat([Buffer.from("Photoshop 3.0\0"), resource, iptc, Buffer.alloc(iptc.length % 2)]);
  return Buffer.concat([
    jpeg.subarray(0, 2),
    jpegSegment(0xe1, syntheticExif()),
    jpegSegment(0xe1, xmp),
    jpegSegment(0xed, photoshop),
    jpeg.subarray(2),
    Buffer.from("SYNTHETIC_TRAILING_PRIVATE_PAYLOAD"),
  ]);
}

function gpsCoordinates(exif) {
  const tiff = exif.subarray(exif.toString("ascii", 0, 6) === "Exif\0\0" ? 6 : 0);
  assert.equal(tiff.toString("ascii", 0, 2), "II");
  function findTag(offset, tag) {
    const count = tiff.readUInt16LE(offset);
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;
      if (tiff.readUInt16LE(entry) === tag) return entry;
    }
    assert.fail(`Missing synthetic EXIF tag ${tag}`);
  }
  const gpsEntry = findTag(tiff.readUInt32LE(4), 0x8825);
  const gps = tiff.readUInt32LE(gpsEntry + 8);
  return [2, 4].map((tag) => {
    const offset = tiff.readUInt32LE(findTag(gps, tag) + 8);
    return [0, 8, 16].map((delta) => tiff.readUInt32LE(offset + delta) / tiff.readUInt32LE(offset + delta + 4));
  });
}

const jpegFixture = makeFixture();
const formats = [
  ["jpeg", "image/jpeg", "jpg"],
  ["png", "image/png", "png"],
  ["webp", "image/webp", "webp"],
];

for (const [format, mime, extension] of formats) {
  test(`${format}: strips GPS/EXIF and other metadata, rotates pixels and remains decodable`, async () => {
    const jpeg = await jpegFixture;
    const input = format === "jpeg" ? jpeg : await sharp(jpeg).withMetadata().toFormat(format).toBuffer();
    const original = Buffer.from(input);
    const before = await sharp(input).metadata();
    assert.equal(before.orientation, 6);
    assert.deepEqual(gpsCoordinates(before.exif), [[12, 34, 56], [65, 43, 21]]);
    if (format === "jpeg") {
      assert.ok(before.xmp?.length);
      assert.ok(before.iptc?.length);
    }
    const photo = await sanitizePhoto(input, mime);
    assert.equal(photo.contentType, mime);
    assert.equal(photo.extension, extension);
    assert.ok(photo.bytes.byteLength <= MAX_PHOTO_BYTES);
    const after = await sharp(photo.bytes).metadata();
    assert.equal(after.format, format);
    assert.equal(after.width, 12);
    assert.equal(after.height, 24);
    for (const field of ["exif", "orientation", "xmp", "iptc", "icc"]) {
      assert.equal(after[field], undefined, `${field} must not be saved`);
    }
    assert.equal(Buffer.from(photo.bytes).includes(Buffer.from("SYNTHETIC_TRAILING_PRIVATE_PAYLOAD")), false);
    const { data, info } = await sharp(photo.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const top = (3 * info.width + 6) * info.channels;
    const bottom = (20 * info.width + 6) * info.channels;
    assert.ok(data[top] > data[top + 2] + 100, "red half must rotate to the top");
    assert.ok(data[bottom + 2] > data[bottom] + 100, "blue half must rotate to the bottom");
    assert.deepEqual(input, original, "input and historical bytes remain untouched");
  });
}

function failsWith(status) {
  return (error) => {
    assert.ok(error instanceof PhotoUploadError);
    assert.equal(error.status, status);
    assert.doesNotMatch(error.message, /sharp|vips|libpng|RIFF|stack|secret/i);
    return true;
  };
}

function uploadRequest(bytes, mime = "image/jpeg") {
  const form = new FormData();
  form.set("file", new File([bytes], "photo", { type: mime }));
  form.set("caption", "an ignored field accepted by the existing API");
  return new Request("https://atlas.invalid/api/media", { method: "POST", body: form });
}

test("multipart upload saves only the sanitized image", async () => {
  const input = await jpegFixture;
  const photo = await preparePhotoUpload(uploadRequest(input));
  assert.equal(photo.contentType, "image/jpeg");
  assert.equal((await sharp(photo.bytes).metadata()).exif, undefined);
  assert.notDeepEqual(Buffer.from(photo.bytes), input);
});

test("4 MiB file remains allowed with bounded multipart overhead", async () => {
  const input = Buffer.alloc(MAX_PHOTO_BYTES);
  (await jpegFixture).copy(input);
  const photo = await preparePhotoUpload(uploadRequest(input));
  assert.ok(photo.bytes.length < MAX_PHOTO_BYTES);
});

test("rejects oversized files as 413 before decoding", async () => {
  const input = new Uint8Array(MAX_PHOTO_BYTES + 1);
  await assert.rejects(sanitizePhoto(input, "image/jpeg"), failsWith(413));
  await assert.rejects(preparePhotoUpload(uploadRequest(input)), failsWith(413));
});

test("rejects unsupported MIME, MIME mismatch and fake/truncated headers as 400", async () => {
  const jpeg = await jpegFixture;
  const png = await sharp(jpeg).png().toBuffer();
  const webp = await sharp(jpeg).webp().toBuffer();
  const cases = [
    [jpeg, "application/octet-stream"],
    [Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml"],
    [png, "image/jpeg"],
    [webp, "image/png"],
    [jpeg, "image/webp"],
    [Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0]), "image/jpeg"],
    [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"],
    [Buffer.from("RIFF0000WEBP"), "image/webp"],
    [Buffer.alloc(0), "image/jpeg"],
    [jpeg.subarray(0, Math.floor(jpeg.length / 2)), "image/jpeg"],
    [png.subarray(0, Math.floor(png.length / 2)), "image/png"],
    [webp.subarray(0, Math.floor(webp.length / 2)), "image/webp"],
  ];
  for (const [input, mime] of cases) await assert.rejects(sanitizePhoto(input, mime), failsWith(400));
  await assert.rejects(preparePhotoUpload(uploadRequest(png, "image/jpeg")), failsWith(400));
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function pngWithDimensions(width, height) {
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).png().toBuffer();
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
  return png;
}

test("rejects excessive pixel counts and dimensions before decoding pixels", async () => {
  assert.ok(8000 * 6000 > MAX_PHOTO_PIXELS);
  for (const [width, height] of [[8000, 6000], [MAX_PHOTO_DIMENSION + 1, 1]]) {
    const png = await pngWithDimensions(width, height);
    assert.equal((await sharp(png, { limitInputPixels: false }).metadata()).width, width);
    await assert.rejects(sanitizePhoto(png, "image/png"), failsWith(413));
  }
});

test("bounds saved dimensions without enlarging small photographs", async () => {
  const input = await sharp({ create: { width: 5000, height: 2, channels: 3, background: "blue" } }).png().toBuffer();
  const photo = await sanitizePhoto(input, "image/png");
  const metadata = await sharp(photo.bytes).metadata();
  assert.equal(metadata.width, MAX_SAVED_PHOTO_DIMENSION);
  assert.equal(metadata.height, 2);
});

test("rejects declared and streamed requests over the multipart cap", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const declared = new Request("https://atlas.invalid/api/media", {
    method: "POST", duplex: "half", body: stream,
    headers: { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": String(MAX_PHOTO_REQUEST_BYTES + 1) },
  });
  await assert.rejects(preparePhotoUpload(declared), failsWith(413));
  assert.equal(cancelled, true);

  let streamedCancelled = false;
  let chunks = 0;
  const streamed = new Request("https://atlas.invalid/api/media", {
    method: "POST", duplex: "half",
    headers: { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": "1" },
    body: new ReadableStream({
      pull(controller) {
        if (chunks++ === 0) controller.enqueue(new Uint8Array(MAX_PHOTO_REQUEST_BYTES));
        else controller.enqueue(new Uint8Array(1));
      },
      cancel() { streamedCancelled = true; },
    }),
  });
  await assert.rejects(preparePhotoUpload(streamed), failsWith(413));
  assert.equal(streamedCancelled, true);
});

test("malformed multipart, missing file, and stream errors return sanitized 400 errors", async () => {
  const missing = new FormData();
  missing.set("file", "a string is not a photo");
  const requests = [
    new Request("https://atlas.invalid/api/media", { method: "POST", body: "not multipart" }),
    new Request("https://atlas.invalid/api/media", { method: "POST", body: "broken", headers: { "Content-Type": "multipart/form-data; boundary=test" } }),
    new Request("https://atlas.invalid/api/media", { method: "POST", body: missing }),
    new Request("https://atlas.invalid/api/media", {
      method: "POST", duplex: "half", headers: { "Content-Type": "multipart/form-data; boundary=test" },
      body: new ReadableStream({ start(controller) { controller.error(new Error("secret internal path")); } }),
    }),
  ];
  for (const req of requests) await assert.rejects(preparePhotoUpload(req), failsWith(400));
});
