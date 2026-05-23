import { NextRequest } from 'next/server';
import { createReadStream, type ReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { getChannel } from '@/lib/channels';

/**
 * Envuelve un ReadStream de Node en un ReadableStream Web tolerante a cancel.
 * El adapter built-in (Readable.toWeb) hace enqueue en el controller incluso
 * cuando éste ya fue cerrado por desconexión del cliente (típico de un <video>
 * haciendo seek/range hop), lo que tira el proceso con
 * `ERR_INVALID_STATE: Controller is already closed`.
 */
function nodeStreamToWeb(nodeStream: ReadStream): ReadableStream<Uint8Array> {
  let closed = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk) => {
        if (closed) return;
        try {
          controller.enqueue(chunk as Uint8Array);
        } catch {
          closed = true;
          nodeStream.destroy();
        }
      });
      nodeStream.on('end', () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch {}
      });
      nodeStream.on('error', (err) => {
        if (closed) return;
        closed = true;
        try { controller.error(err); } catch {}
      });
    },
    cancel() {
      closed = true;
      nodeStream.destroy();
    },
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function tryStat(p: string) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

/**
 * GET /api/channels/[channel]/videos/[video]/media?file=RENDER/foo.mp4
 *
 * Sirve un archivo dentro de la carpeta del vídeo con soporte HTTP Range.
 * Valida path traversal — file no puede escapar de la carpeta del vídeo.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { channel: string; video: string } },
) {
  const channel = getChannel(params.channel);
  if (!channel || !channel.enabled) {
    return new Response(JSON.stringify({ error: 'Channel not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const fileQuery = url.searchParams.get('file');
  if (!fileQuery) {
    return new Response(JSON.stringify({ error: 'Missing ?file=' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const videoTitle = decodeURIComponent(params.video);

  // Buscar la carpeta del vídeo en cualquiera de los 4 estados
  const stateDirs = Object.values(channel.stateFolders);
  let videoDir: string | null = null;
  for (const sf of stateDirs) {
    const cand = path.join(channel.rootPath, sf, videoTitle);
    const s = await tryStat(cand);
    if (s && s.isDirectory()) {
      videoDir = cand;
      break;
    }
  }
  if (!videoDir) {
    return new Response(JSON.stringify({ error: 'Video folder not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Resolver el path absoluto y validar que está dentro de videoDir
  const absFile = path.resolve(videoDir, fileQuery);
  const relCheck = path.relative(videoDir, absFile);
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
    return new Response(JSON.stringify({ error: 'Path traversal blocked' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const fileStat = await tryStat(absFile);
  if (!fileStat || !fileStat.isFile()) {
    return new Response(JSON.stringify({ error: 'File not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const size = fileStat.size;
  const ext = path.extname(absFile).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';

  const range = req.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      return new Response('Bad Range', { status: 416 });
    }
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : size - 1;
    if (start > end || end >= size) {
      return new Response('Range not satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }
    const chunkSize = end - start + 1;
    const nodeStream = createReadStream(absFile, { start, end });
    const webStream = nodeStreamToWeb(nodeStream);
    return new Response(webStream, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // Sin Range: enviar entero (streaming)
  const nodeStream = createReadStream(absFile);
  const webStream = nodeStreamToWeb(nodeStream);
  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
