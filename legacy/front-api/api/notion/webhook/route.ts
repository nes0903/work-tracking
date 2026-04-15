import { NextResponse, type NextRequest } from "next/server";
import { handleNotionWebhook } from "@/lib/notion-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const result = await handleNotionWebhook(
    rawBody,
    request.headers.get("x-notion-signature"),
  );

  return NextResponse.json(result.body, { status: result.status });
}
