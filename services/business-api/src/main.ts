import { createPrismaClient } from "@aeroquetzal/database";
import { readBusinessConfig } from "./config.js";
import { buildBusinessServer } from "./server.js";

const config = readBusinessConfig();
const db = createPrismaClient();
const app = await buildBusinessServer({ config, db });
app.addHook("onClose", () => db.$disconnect());
await app.listen({ host: config.BUSINESS_HOST, port: config.BUSINESS_PORT });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
}
