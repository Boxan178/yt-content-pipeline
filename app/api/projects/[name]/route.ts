// GET /api/projects/<name> — proxy al backend para hidratar un proyecto.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL;
const BACKEND_TOKEN = process.env.BACKEND_TOKEN;

export async function GET(
  _req: Request,
  { params }: { params: { name: string } },
) {
  if (!BACKEND_URL || !BACKEND_TOKEN) {
    return NextResponse.json({ error: "backend not configured" }, { status: 500 });
  }
  const url = `${BACKEND_URL.replace(/\/$/, "")}/projects/${encodeURIComponent(params.name)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${BACKEND_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `backend HTTP ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
