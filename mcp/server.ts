import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { publishArtifact, republishArtifact } from "./client.js";

// Keep this version in sync with package.json.
const server = new McpServer({ name: "sentou", version: "0.1.0" });

server.registerTool(
  "publish_artifact",
  {
    description:
      "Publish HTML to a Sentou link and return its URL. Optionally gate access (email, domain " +
      "allowlist, expiry), turn on per-viewer open tracking, and set a title. With no options the " +
      "link is public, untracked, and untitled.",
    inputSchema: {
      html: z.string().describe("The full HTML document to publish."),
      title: z.string().optional().describe("A title shown in the dashboard."),
      requireEmail: z
        .boolean()
        .optional()
        .describe("Ask the viewer for an email before showing the artifact."),
      verifyEmail: z
        .boolean()
        .optional()
        .describe(
          "Require a one-time code sent to the viewer's email (a real lock; needs an email sender " +
            "configured on the server). Implies requireEmail.",
        ),
      allowedDomains: z
        .array(z.string())
        .optional()
        .describe("Restrict access to these email domains, e.g. [\"acme.com\"]."),
      expiresAt: z
        .string()
        .optional()
        .describe("ISO 8601 date-time after which the link stops working."),
      track: z
        .boolean()
        .optional()
        .describe("Record per-viewer opens and dwell time (off by default)."),
    },
  },
  async ({ html, title, requireEmail, verifyEmail, allowedDomains, expiresAt, track }) => {
    const { url, id, version } = await publishArtifact(html, {
      title,
      requireEmail,
      verifyEmail,
      allowedDomains,
      expiresAt,
      track,
    });
    const gate: string[] = [];
    if (verifyEmail) gate.push("verified email");
    else if (requireEmail) gate.push("email required");
    if (allowedDomains?.length) gate.push(`domains: ${allowedDomains.join(", ")}`);
    if (expiresAt) gate.push(`expires ${expiresAt}`);
    const suffix =
      `${gate.length ? ` [gate: ${gate.join("; ")}]` : " [open]"}` +
      `${track ? " [tracking on]" : ""}`;
    return { content: [{ type: "text", text: `Published v${version}: ${url} (id: ${id})${suffix}` }] };
  },
);

server.registerTool(
  "republish",
  { description: "Republish HTML to an existing Sentou link id, same URL.", inputSchema: { id: z.string(), html: z.string() } },
  async ({ id, html }) => {
    const { url, version } = await republishArtifact(id, html);
    return { content: [{ type: "text", text: `Republished v${version}: ${url}` }] };
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
