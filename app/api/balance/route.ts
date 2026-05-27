// GET /api/balance — proxy al backend del VPS para leer créditos KIE actuales.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL;
const BACKEND_TOKEN = process.env.BACKEND_TOKEN;

export async function GET() {
  if (!BACKEND_URL || !BACKEND_TOKEN) {
    return NextResponse.json({ credits: null, error: "backend not configured" });
  }
  try {
    const res = await fetch(`${BACKEND_URL.replace(/\/$/, "")}/balance`, {
      headers: { Authorization: `Bearer ${BACKEND_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { credits: null, error: `backend HTTP ${res.status}` },
        { status: 502 },
      );
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    return NextResponse.json(
      { credits: null, error: String(e) },
      { status: 502 },
    );
  }
}
