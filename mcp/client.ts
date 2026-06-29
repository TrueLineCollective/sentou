const base = () => process.env.SENTOU_URL ?? "http://localhost:3000";

function authHeaders(): Record<string, string> {
  return process.env.SENTOU_OWNER_TOKEN ? { authorization: `Bearer ${process.env.SENTOU_OWNER_TOKEN}` } : {};
}

export async function publishArtifact(html: string) {
  const r = await fetch(`${base()}/api/publish`, {
    method: "POST", headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ html }),
  });
  if (!r.ok) throw new Error(`publish failed: ${r.status}`);
  return (await r.json()) as { url: string; id: string; version: number };
}

export async function republishArtifact(id: string, html: string) {
  const r = await fetch(`${base()}/api/republish`, {
    method: "POST", headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ id, html }),
  });
  if (!r.ok) throw new Error(`republish failed: ${r.status}`);
  return (await r.json()) as { url: string; version: number };
}
