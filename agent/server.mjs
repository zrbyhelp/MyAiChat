import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const currentDir = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: resolve(currentDir, ".env") });
dotenv.config({ path: resolve(currentDir, "..", ".env") });

const { createApp } = await import("./src/app.mjs");
const PORT = Number(process.env.PORT || process.env.AGENT_PORT || process.env.AGENT_NODE_PORT || 8000);
const app = await createApp();

createServer(app).listen(PORT, () => {
  console.log(`AI agent running at http://127.0.0.1:${PORT}`);
});
