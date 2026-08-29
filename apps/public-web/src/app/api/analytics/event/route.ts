import { NextResponse } from "next/server";

const defaultHost = "https://eu.i.posthog.com";

function cleanHost(value: string | undefined) {
  return (value || defaultHost).replace(/\/$/, "");
}

export async function POST(request: Request) {
  const apiKey = process.env.POSTHOG_PROJECT_API_KEY;
  if (!apiKey) return NextResponse.json({ accepted: false, reason: "analytics-disabled" }, { status: 202 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid-body" }, { status: 400 });
  const value = body as Record<string, unknown>;
  const event = typeof value.event === "string" ? value.event.slice(0, 120) : "";
  const distinctId = typeof value.distinctId === "string" ? value.distinctId.slice(0, 180) : "";
  const properties = value.properties && typeof value.properties === "object" ? value.properties as Record<string, unknown> : {};

  if (!event || !distinctId) return NextResponse.json({ error: "event-and-distinct-id-required" }, { status: 400 });

  const response = await fetch(`${cleanHost(process.env.POSTHOG_HOST)}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      event,
      properties: {
        ...properties,
        distinct_id: distinctId,
        app: "public-web",
      },
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    console.error("PostHog capture failed", response.status, await response.text());
    return NextResponse.json({ accepted: false }, { status: 502 });
  }

  return NextResponse.json({ accepted: true });
}
