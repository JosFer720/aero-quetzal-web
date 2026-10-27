import { readConfig } from "./config.js";
import { buildAuthServer } from "./server.js";

const config = readConfig();
const app = await buildAuthServer({ config });
await app.listen({ host: config.AUTH_HOST, port: config.AUTH_PORT });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().catch(() => { process.exitCode = 1; });
  });
}
