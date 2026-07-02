const base = () => process.env.SENTOU_URL ?? "http://localhost:3000";

function authHeaders(): Record<string, string> {
  return process.env.SENTOU_API_KEY ? { authorization: `Bearer ${process.env.SENTOU_API_KEY}` } : {};
}

// Optional gate + tracking + title, matching what /api/publish already accepts. Left undefined,
// each falls to the API default (open, untracked, untitled). Only defined fields are sent.
export type PublishOptions = {
  title?: string;
  requireEmail?: boolean;
  verifyEmail?: boolean;
  allowedDomains?: string[];
  expiresAt?: string;
  track?: boolean;
};

export async function publishArtifact(html: string, opts: PublishOptions = {}) {
  const body: Record<string, unknown> = { html };
  if (opts.title !== undefined) body.title = opts.title;
  if (opts.requireEmail !== undefined) body.requireEmail = opts.requireEmail;
  if (opts.verifyEmail !== undefined) body.verifyEmail = opts.verifyEmail;
  if (opts.allowedDomains !== undefined) body.allowedDomains = opts.allowedDomains;
  if (opts.expiresAt !== undefined) body.expiresAt = opts.expiresAt;
  if (opts.track !== undefined) body.track = opts.track;

  const r = await fetch(`${base()}/api/publish`, {
    method: "POST", headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
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
