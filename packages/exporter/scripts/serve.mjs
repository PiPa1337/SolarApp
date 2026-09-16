/** Adaptador HTTP local para el handler compartido de SolaraCommerce. */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { ensureLocalLayout, resolveLocalLayout } from "./local-layout.mjs";
import { removeSessionRecord, writeSessionRecord } from "./session-registry.mjs";
import { createSolaraRequestHandler } from "./solara-request-handler.mjs";

const root = resolve(process.argv[2] ?? "site");
const port = Number(process.argv[3] ?? process.env.SOLARA_PORT ?? "4174");
const shutdownToken = process.argv[4] ?? "";
const applicationRoot = resolve(process.argv[5] ?? process.cwd());
const sessionId = process.argv[6] || randomUUID().replaceAll("-", "");
const layout = resolveLocalLayout({ applicationRoot });
const serverOrigin = `http://127.0.0.1:${port}`;
let server;
let shuttingDown = false;

async function start() {
  await ensureLocalLayout(layout, { appVersion: "0.1.0" });
  const handler = createSolaraRequestHandler({
    staticRoot: root,
    applicationRoot: layout.applicationRoot,
    projectsRoot: layout.projectsRoot,
    transactionRoot: layout.transactionRoot,
    shutdownToken,
    sessionId,
    origin: serverOrigin,
    onShutdown: stopServer,
  });
  await handler.storage.cleanupStaging();
  await handler.storage.cleanupAutomaticBackups();

  server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", serverOrigin);
      const result = await handler.handle({
        method: request.method ?? "GET",
        pathname: `${url.pathname}${url.search}`,
        headers: request.headers,
        body: request,
      });
      response.writeHead(result.status, result.headers);
      response.end(result.body);
    })().catch((error) => {
      if (!response.headersSent) {
        response.writeHead(500, {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
        });
        response.end(
          JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : "Error del servidor local.",
          }),
        );
      } else {
        response.destroy(error);
      }
    });
  });

  await new Promise((resolveListening, reject) => {
    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        const friendly = new Error(
          `El puerto ${port} ya está en uso por otra instancia de SolaraCommerce. ` +
            "Cerrá esa instancia o usá SOLARA_PORT para elegir otro puerto.",
        );
        friendly.code = "EADDRINUSE";
        reject(friendly);
        return;
      }
      reject(error);
    });
    server.listen(port, "127.0.0.1", resolveListening);
  });

  try {
    await writeSessionRecord(layout, {
      format: "solara-local-session",
      version: 1,
      sessionId,
      processId: process.pid,
      port,
      projectRoot: layout.applicationRoot,
      startedAt: new Date().toISOString(),
      managed: true,
      shutdownToken,
    });
  } catch (error) {
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    throw error;
  }
  console.log(`Solara export disponible en http://localhost:${port}`);

  async function shutdown() {
    await handler.close();
    await removeSessionRecord(layout, sessionId).catch(() => {});
    server.close(() => process.exit(0));
    server.closeAllConnections?.();
    setTimeout(() => process.exit(0), 1000).unref();
  }

  function stopServer() {
    if (shuttingDown) return;
    shuttingDown = true;
    void shutdown();
  }

  process.once("SIGINT", stopServer);
  process.once("SIGTERM", stopServer);
}

start().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error?.code === "EADDRINUSE") process.exit(1);
  process.exitCode = 1;
});
