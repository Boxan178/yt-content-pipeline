// GET /api/files/<project>/<kind>/<name>
//
// Proxea al endpoint /files/<project>/<kind>/<name> del backend del VPS,
// añadiendo el bearer token. Devuelve el binario al cliente.
//
// Middleware NextAuth ya protege que solo usuarios autorizados lleguen aquí.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL;
const BACKEND_TOKEN = process.env.BACKEND_TOKEN;

interface Params {
  project: string;
  kind: string;
  name: string;
}

export async function GET(
  _req: Request,
  { params }: { params: Params },
) {
  if (!BACKEND_URL || !BACKEND_TOKEN) {
    return new NextResponse("Backend not configured", { status: 500 });
  }
  if (params.kind !== "images" && params.kind !== "videos") {
    return new NextResponse("Invalid kind", { status: 400 });
  }
  const url = `${BACKEND_URL.replace(/\/$/, "")}/files/${encodeURIComponent(
    params.project,
  )}/${encodeURIComponent(params.kind)}/${encodeURIComponent(params.name)}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${BACKEND_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new NextResponse(`Backend HTTP ${res.status}: ${text}`, {
        status: res.status,
      });
    }
    // Forward 1:1 con su content-type
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "content-type":
          res.headers.get("content-type") || "application/octet-stream",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return new NextResponse(`Proxy error: ${e}`, { status: 502 });
  }
}
