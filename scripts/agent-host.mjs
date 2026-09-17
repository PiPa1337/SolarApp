import {
  AGENT_PROTOCOL,
  AGENT_PROTOCOL_VERSION,
  AgentRequestSchema,
  protocolError,
  protocolOk,
} from "../packages/agent-contracts/src/index.ts";
import {
  agentError,
  createAgentController,
  dispatchAgentMethod,
} from "../packages/agent-control/src/index.ts";

const MCP_VERSION = "2024-11-05";

const mcpVariantInputSchema = {
  type: "object",
  required: ["title", "priceCents"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 160 },
    sku: { type: "string", maxLength: 120 },
    priceCents: { type: "integer", minimum: 0 },
    compareAtPriceCents: { type: "integer", minimum: 0 },
    available: { type: "boolean" },
    stockStatus: { enum: ["in_stock", "out_of_stock", "preorder"] },
    optionValues: { type: "object", additionalProperties: { type: "string" } },
    imageId: { type: "string" },
  },
  additionalProperties: false,
};

export const AGENT_MCP_TOOL_DEFINITIONS = [
  {
    name: "solara_health",
    description: "Comprueba que SolaraCommerce está disponible y puede escribir.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    method: "health",
  },
  {
    name: "solara_protocol_describe",
    description: "Describe métodos, scopes, límites y garantías de seguridad del canal.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    method: "protocol.describe",
  },
  {
    name: "solara_stores_list",
    description: "Lista tiendas y reportes de recuperación sin abrir el catálogo completo.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    method: "stores.list",
  },
  {
    name: "solara_store_get",
    description: "Obtiene el resumen o el catálogo acotado de una tienda.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["storeId"],
      properties: { storeId: { type: "string" }, include: { enum: ["summary", "catalog"] } },
    },
    method: "stores.get",
  },
  {
    name: "solara_store_restore",
    description: "Restaura una tienda archivada a estado activo.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["storeId"],
      properties: {
        storeId: { type: "string" },
        expectedVersion: { type: "integer", minimum: 0 },
      },
    },
    method: "stores.restore",
  },
  {
    name: "solara_template_get",
    description: "Obtiene el estado y la versión de la plantilla protegida.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    method: "templates.get",
  },
  {
    name: "solara_template_preview_upgrade",
    description: "Previsualiza un upgrade explícito de la plantilla base.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { baseVersion: { type: "integer", minimum: 0 } },
    },
    method: "templates.previewUpgrade",
  },
  {
    name: "solara_template_commit_upgrade",
    description: "Aplica un upgrade previamente previsualizado y confirmado.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["previewId", "baseVersion", "confirmation"],
      properties: {
        previewId: { type: "string" },
        baseVersion: { type: "integer", minimum: 0 },
        confirmation: { const: "ACTUALIZAR_PLANTILLA" },
        idempotencyKey: { type: "string" },
      },
    },
    method: "templates.commitUpgrade",
  },
  {
    name: "solara_rollout_preview",
    description: "Previsualiza una reconstrucción o migración para tiendas activas.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: {
        kind: { enum: ["site-rebuild", "project-migration"] },
        migrationId: { type: "string" },
        target: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { const: "active" },
            excludeProtected: { type: "boolean" },
            storeIds: { type: "array", items: { type: "string" }, maxItems: 500 },
          },
        },
      },
    },
    method: "rollouts.preview",
  },
  {
    name: "solara_rollout_commit",
    description: "Ejecuta un rollout previsualizado como trabajo durable.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["previewId"],
      properties: {
        previewId: { type: "string" },
        idempotencyKey: { type: "string" },
        async: { type: "boolean" },
      },
    },
    method: "rollouts.commit",
  },
  {
    name: "solara_rollout_get",
    description: "Consulta el estado y resultados de un rollout.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["rolloutId"],
      properties: { rolloutId: { type: "string" } },
    },
    method: "rollouts.get",
  },
  {
    name: "solara_rollout_rollback",
    description: "Revierte una tienda al backup anterior de un rollout.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["rolloutId", "storeId", "expectedVersion"],
      properties: {
        rolloutId: { type: "string" },
        storeId: { type: "string" },
        expectedVersion: { type: "integer", minimum: 0 },
      },
    },
    method: "rollouts.rollback",
  },
  {
    name: "solara_plan_create",
    description: "Valida y prepara operaciones tipadas sin escribir en disco.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["operations"],
      properties: {
        storeId: { type: "string" },
        baseVersion: { type: ["integer", "null"] },
        idempotencyKey: { type: "string" },
        includeDiff: { type: "boolean" },
        operations: {
          type: "array",
          maxItems: 500,
          items: {
            type: "object",
            required: ["type"],
            properties: {
              type: {
                enum: [
                  "store.create",
                  "store.updateIdentity",
                  "store.updateSeo",
                  "store.updatePage",
                  "store.updatePublicCopy",
                  "store.updatePolicies",
                  "store.updateLegalProfile",
                  "store.updateWhatsapp",
                  "store.updateNavigation",
                  "category.create",
                  "category.update",
                  "category.delete",
                  "collection.create",
                  "collection.update",
                  "product.create",
                  "product.update",
                  "product.delete",
                  "product.setStatus",
                  "store.archive",
                  "asset.attach",
                  "section.updateSettings",
                  "product.createBatch",
                  "theme.applyPreset",
                  "theme.updateTokens",
                ],
              },
              source: {
                oneOf: [
                  {
                    type: "object",
                    required: ["kind", "templateId"],
                    properties: {
                      kind: { const: "base-template" },
                      templateId: { const: "catalog-modern" },
                    },
                    additionalProperties: false,
                  },
                  {
                    type: "object",
                    required: ["kind"],
                    properties: { kind: { const: "clean" } },
                    additionalProperties: false,
                  },
                ],
              },
              variants: { type: "array", minItems: 1, items: mcpVariantInputSchema },
              changes: {
                type: "object",
                properties: {
                  status: { enum: ["active", "hidden"] },
                  variants: { type: "array", minItems: 1, items: mcpVariantInputSchema },
                },
              },
            },
          },
        },
      },
    },
    method: "plans.create",
  },
  {
    name: "solara_plan_commit",
    description: "Relee la versión, valida, exporta y publica una transacción atómica.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["planId"],
      properties: {
        planId: { type: "string" },
        idempotencyKey: { type: "string" },
        async: { type: "boolean" },
      },
    },
    method: "plans.commit",
  },
  {
    name: "solara_plan_create_and_commit",
    description: "Crea el plan y lo commitea en una sola llamada atómica.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["operations"],
      properties: {
        storeId: { type: "string" },
        baseVersion: { type: ["integer", "null"] },
        idempotencyKey: { type: "string" },
        operations: {
          type: "array",
          maxItems: 500,
          items: {
            type: "object",
            properties: {
              variants: { type: "array", minItems: 1, items: mcpVariantInputSchema },
              changes: {
                type: "object",
                properties: {
                  status: { enum: ["active", "hidden"] },
                  variants: { type: "array", minItems: 1, items: mcpVariantInputSchema },
                },
              },
            },
          },
        },
      },
    },
    method: "plans.createAndCommit",
  },
  {
    name: "solara_plan_get",
    description: "Obtiene un plan durable, su diff y advertencias antes del commit.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["planId"],
      properties: { planId: { type: "string" }, includeProject: { type: "boolean" } },
    },
    method: "plans.get",
  },
  {
    name: "solara_plan_discard",
    description: "Descarta un plan y libera el lock cooperativo de la tienda.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["planId"],
      properties: { planId: { type: "string" } },
    },
    method: "plans.discard",
  },
  {
    name: "solara_plan_heartbeat",
    description: "Renueva el lock de un plan que sigue siendo revisado por la IA.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["planId"],
      properties: { planId: { type: "string" } },
    },
    method: "plans.heartbeat",
  },
  {
    name: "solara_job_get",
    description: "Consulta progreso y resultado de un commit asíncrono.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["jobId"],
      properties: { jobId: { type: "string" } },
    },
    method: "jobs.get",
  },
  {
    name: "solara_audit_list",
    description: "Lee la bitácora estructurada de operaciones del agente.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { limit: { type: "integer", minimum: 1, maximum: 200 } },
    },
    method: "audit.list",
  },
  {
    name: "solara_asset_stage",
    description:
      "Valida una imagen por bytes, MIME, firma, hash y dimensiones antes de adjuntarla.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["name", "mimeType", "source"],
      properties: {
        name: { type: "string" },
        alt: { type: "string" },
        mimeType: { enum: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/x-icon"] },
        source: { type: "object" },
      },
    },
    method: "assets.stage",
  },
  {
    name: "solara_asset_generate_placeholder",
    description: "Genera una imagen PNG determinística para completar un catálogo.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["name", "seed"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 160 },
        alt: { type: "string", maxLength: 500 },
        width: { type: "integer", minimum: 64, maximum: 2000 },
        height: { type: "integer", minimum: 64, maximum: 2000 },
        pattern: { enum: ["solid", "stripes", "circles", "triangles"] },
        seed: { type: "string", minLength: 1, maxLength: 120 },
      },
    },
    method: "assets.generatePlaceholder",
  },
  {
    name: "solara_asset_upload_begin",
    description: "Inicia un upload de asset por chunks base64 con progreso durable.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["name", "mimeType"],
      properties: {
        name: { type: "string" },
        alt: { type: "string" },
        mimeType: { enum: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/x-icon"] },
        expectedBytes: { type: "integer", minimum: 1, maximum: 20000000 },
      },
    },
    method: "assets.upload.begin",
  },
  {
    name: "solara_asset_upload_chunk",
    description: "Agrega un chunk ordenado al upload de un asset.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["uploadId", "sequence", "data"],
      properties: {
        uploadId: { type: "string" },
        sequence: { type: "integer", minimum: 0 },
        data: { type: "string", maxLength: 1400000 },
      },
    },
    method: "assets.upload.chunk",
  },
  {
    name: "solara_asset_upload_finish",
    description: "Finaliza, verifica y stagea el asset subido por chunks.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["uploadId"],
      properties: { uploadId: { type: "string" }, sha256: { type: "string" } },
    },
    method: "assets.upload.finish",
  },
  {
    name: "solara_qa_read_backlog",
    description: "Lee el backlog perpetuo y retorna el siguiente item pendiente.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    method: "qa.readBacklog",
  },
  {
    name: "solara_qa_run_export",
    description: "Ejecuta una exportación draft acotada para auditar una tienda.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["storeId", "projectData"],
      properties: {
        storeId: { type: "string", minLength: 1, maxLength: 96 },
        mode: { enum: ["draft", "production"] },
        projectData: { type: "object" },
      },
    },
    method: "qa.runExport",
  },
  {
    name: "solara_qa_write_test",
    description: "Escribe un archivo de test en packages/*/src/. Requiere scope qa:write.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["filePath", "content"],
      properties: {
        filePath: { type: "string" },
        content: { type: "string" },
      },
    },
    method: "qa.writeTest",
  },
  {
    name: "solara_qa_run_gates",
    description: "Ejecuta gates de test (quick/full/affected) via vitest.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        suite: { enum: ["quick", "full", "affected"] },
        filter: { type: "string" },
      },
    },
    method: "qa.runGates",
  },
  {
    name: "solara_qa_detect_flaky",
    description: "Detecta flakiness corriendo un test N veces.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["testFile"],
      properties: {
        testFile: { type: "string" },
        runs: { type: "integer", minimum: 2, maximum: 20 },
      },
    },
    method: "qa.detectFlaky",
  },
  {
    name: "solara_qa_log_progress",
    description: "Escribe al log de progreso perpetuo con timestamp.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["entry"],
      properties: { entry: { type: "string" } },
    },
    method: "qa.logProgress",
  },
  {
    name: "solara_qa_update_state",
    description: "Actualiza campos del perpetual-state.json.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["patch"],
      properties: { patch: { type: "object" } },
    },
    method: "qa.updateState",
  },
  {
    name: "solara_qa_run_cycle",
    description: "Ejecuta un ciclo completo del QA perpetuo sobre el backlog.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    method: "qa.runCycle",
  },
  {
    name: "solara_qa_status",
    description: "Estado del QA perpetuo: ciclo activo, completados y bloqueados.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    method: "qa.status",
  },
];

function mcpResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function mcpError(id, error) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32000,
      message: error.message,
      data: { code: error.code, details: error.details },
    },
  };
}

function writeLine(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

/** Host local del agente. stdout queda reservado al protocolo y stderr a diagnósticos. */
export async function runAgentHost({
  storage,
  applicationRoot,
  appVersion = "0.1.0",
  mode = "mcp",
  scopes,
}) {
  const controller = createAgentController({ storage, applicationRoot, scopes });
  await controller.ready();

  const handleJsonl = async (payload) => {
    let request;
    try {
      request = AgentRequestSchema.parse(payload);
    } catch (error) {
      const id = payload && typeof payload === "object" && "id" in payload ? payload.id : "invalid";
      writeLine(
        protocolError(
          typeof id === "string" || typeof id === "number" ? id : "invalid",
          "REQUEST_INVALID",
          error instanceof Error ? error.message : String(error),
        ),
      );
      return;
    }
    try {
      writeLine(
        protocolOk(
          request.id,
          await dispatchAgentMethod(controller, request.method, request.params, request.id),
        ),
      );
    } catch (error) {
      const detail = agentError(error);
      writeLine(protocolError(request.id, detail.code, detail.message, detail.details));
    }
  };

  const handleMcp = async (payload) => {
    if (!payload || payload.jsonrpc !== "2.0" || typeof payload.method !== "string") return;
    if (
      payload.method === "notifications/initialized" ||
      payload.method.startsWith("notifications/")
    )
      return;
    try {
      if (payload.method === "initialize") {
        writeLine(
          mcpResult(payload.id, {
            protocolVersion: MCP_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "solara-commerce-agent", version: appVersion },
            instructions:
              "Usá protocol.describe y planes tipados; no hay acceso a HTML, JS, parches arbitrarios ni shell.",
          }),
        );
        return;
      }
      if (payload.method === "ping") {
        writeLine(mcpResult(payload.id, {}));
        return;
      }
      if (payload.method === "tools/list") {
        writeLine(
          mcpResult(payload.id, {
            tools: AGENT_MCP_TOOL_DEFINITIONS.map(({ method, ...tool }) => tool),
          }),
        );
        return;
      }
      if (payload.method === "tools/call") {
        const name = payload.params?.name;
        const tool = AGENT_MCP_TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
        if (!tool)
          throw Object.assign(new Error(`Herramienta MCP desconocida: ${String(name)}.`), {
            code: "METHOD_NOT_FOUND",
          });
        const result = await dispatchAgentMethod(
          controller,
          tool.method,
          payload.params?.arguments ?? {},
          payload.id,
        );
        writeLine(
          mcpResult(payload.id, {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
            isError: false,
          }),
        );
        return;
      }
      throw Object.assign(new Error(`Método MCP desconocido: ${payload.method}.`), {
        code: "METHOD_NOT_FOUND",
      });
    } catch (error) {
      writeLine(mcpError(payload.id, agentError(error)));
    }
  };

  // Escuchar data/end directamente mantiene el protocolo estable también cuando
  // stdin llega por pipes sin TTY ni readline interactivo.
  await new Promise((resolveInput) => {
    process.stdin.setEncoding("utf8");
    let buffer = "";
    let chain = Promise.resolve();
    const handleLine = (line) => {
      if (!line.trim()) return;
      let payload;
      try {
        payload = JSON.parse(line);
      } catch {
        writeLine(
          protocolError("invalid", "JSON_INVALID", "Cada línea debe ser un objeto JSON válido."),
        );
        return;
      }
      chain = chain.then(() => (mode === "jsonl" ? handleJsonl(payload) : handleMcp(payload)));
    };
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      lines.forEach(handleLine);
    });
    process.stdin.once("end", () => {
      if (buffer.trim()) handleLine(buffer);
      void chain.finally(resolveInput);
    });
    process.stdin.resume();
  });
}

export { AGENT_PROTOCOL, AGENT_PROTOCOL_VERSION };
