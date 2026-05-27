// GET /api/projects — proxy al backend del VPS para listar proyectos generados.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL;
const BACKEND_TOKEN = process.env.BACKEND_TOKEN;

export async function GET() {
  if (!BACKEND_URL || !BACKEND_TOKEN) {
    return NextResponse.json(
      { projects: [], output_root: null, error: "backend not configured" },
      { status: 200 },
    );
  }
  try {
    const res = await fetch(`${BACKEND_URL.replace(/\/$/, "")}/projects`, {
      headers: { Authorization: `Bearer ${BACKEND_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { projects: [], error: `backend HTTP ${res.status}` },
        { status: 502 },
      );
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    return NextResponse.json(
      { projects: [], error: String(e) },
      { status: 502 },
    );
  }
}
