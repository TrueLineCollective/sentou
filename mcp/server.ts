import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { publishArtifact, republishArtifact } from "./client.js";

const server = new McpServer({ name: "sentou", version: "0.0.1" });

server.registerTool(
  "publish_artifact",
  { description: "Publish HTML to a Sentou link and return its URL.", inputSchema: { html: z.string() } },
  async ({ html }) => {
    const { url, id, version } = await publishArtifact(html);
    return { content: [{ type: "text", text: `Published v${version}: ${url} (id: ${id})` }] };
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
