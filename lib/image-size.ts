// Server-only. Lee las dimensiones (px) de una imagen mirando solo su cabecera
// (hasta 256KB), sin cargar el archivo entero ni depender de librerías nativas.
// Soporta JPEG / PNG / WebP / GIF — los formatos de IMAGE_EXT en progress.ts.
//
// Uso principal: validar que una miniatura de YouTube es 16:9 (landscape) y no
// una imagen CUADRADA (1:1), que es lo que devolvía a veces el flujo viejo de
// kie-bridge + nano-banana-2. Ver lib/progress.ts (hito "miniatura").

import 'server-only';
import { open } from 'node:fs/promises';

const MAX_HEADER_BYTES = 256 * 1024;

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Devuelve las dimensiones de la imagen, o `null` si no se pueden determinar
 * (formato no soportado, archivo corrupto, o SOF de JPEG más allá del límite de
 * cabecera). El caller decide qué hacer ante `null` (típicamente: fallback
 * conservador, no asumir nada).
 */
export async function readImageSize(filePath: string): Promise<ImageSize | null> {
  let fh: Awaited<ReturnType<typeof open>> | undefined;
  try {
    fh = await open(filePath, 'r');
    const st = await fh.stat();
    const len = Math.min(st.size, MAX_HEADER_BYTES);
    if (len <= 0) return null;
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, 0);
    return parseImageSize(buf);
  } catch {
    return null;
  } finally {
    try {
      await fh?.close();
    } catch {
      /* noop */
    }
  }
}

/** Parsea las dimensiones desde un buffer de cabecera ya leído. */
export function parseImageSize(buf: Buffer): ImageSize | null {
  if (buf.length < 16) return null;

  // PNG: 89 50 4E 47 ... IHDR con width@16, height@20 (uint32 BE)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // GIF: "GIF8" + width@6, height@8 (uint16 LE)
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // WebP: "RIFF"...."WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return parseWebpSize(buf);
  }

  // JPEG: FF D8 ...
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    return parseJpegSize(buf);
  }

  return null;
}

function parseJpegSize(buf: Buffer): ImageSize | null {
  let off = 2;
  const len = buf.length;
  while (off + 9 < len) {
    if (buf[off] !== 0xff) {
      off++; // resync sobre relleno/bytes sueltos
      continue;
    }
    const marker = buf[off + 1];
    // Marcadores sin longitud: SOI(D8), EOI(D9), TEM(01), RSTn(D0-D7)
    if (
      marker === 0xd8 || marker === 0xd9 || marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      off += 2;
      continue;
    }
    const segLen = buf.readUInt16BE(off + 2);
    if (segLen < 2) return null;
    // SOF (Start Of Frame) lleva las dimensiones: C0-CF excepto C4(DHT),
    // C8(JPG), CC(DAC). Payload: precision(1) height(2) width(2).
    const isSof =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (off + 9 > len) return null;
      const height = buf.readUInt16BE(off + 5);
      const width = buf.readUInt16BE(off + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    off += 2 + segLen;
  }
  return null;
}

function parseWebpSize(buf: Buffer): ImageSize | null {
  const fourcc = buf.toString('ascii', 12, 16);

  // VP8 (lossy): start code 9D 01 2A en 23..26, dims (14 bits c/u) en 26/28 LE
  if (fourcc === 'VP8 ') {
    if (buf.length < 30) return null;
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // VP8L (lossless): firma 0x2F en 20, luego 14b width-1 y 14b height-1
  if (fourcc === 'VP8L') {
    if (buf.length < 25 || buf[20] !== 0x2f) return null;
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // VP8X (extended): 24b width-1 @24 (LE), 24b height-1 @27 (LE)
  if (fourcc === 'VP8X') {
    if (buf.length < 30) return null;
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return width > 0 && height > 0 ? { width, height } : null;
  }

  return null;
}
