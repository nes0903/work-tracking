import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NOTION_UPDATES_PATH = path.join(process.cwd(), "data", "notion-updates.json");

export async function GET() {
  try {
    const payload = JSON.parse(await readFile(NOTION_UPDATES_PATH, "utf-8"));
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        lastSyncedAt: null,
        items: [],
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
