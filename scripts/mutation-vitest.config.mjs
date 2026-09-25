import { Buffer } from "node:buffer";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const mutationFile = process.env.SOLARA_MUTATION_FILE
  ? resolve(process.env.SOLARA_MUTATION_FILE)
  : null;
const mutationFrom = process.env.SOLARA_MUTATION_FROM_B64
  ? Buffer.from(process.env.SOLARA_MUTATION_FROM_B64, "base64").toString("utf8")
  : null;
const mutationTo = process.env.SOLARA_MUTATION_TO_B64
  ? Buffer.from(process.env.SOLARA_MUTATION_TO_B64, "base64").toString("utf8")
  : null;
const mutationId = process.env.SOLARA_MUTATION_ID ?? "unknown";
let applied = false;

export default defineConfig({
  root: process.cwd(),
  plugins: [
    {
      name: "solara-mutation-probe",
      enforce: "pre",
      transform(code, id) {
        if (!mutationFile || !mutationFrom || mutationTo === null) return null;
        const cleanId = id.split("?", 1)[0];
        if (resolve(cleanId) !== mutationFile) return null;
        if (applied) return null;
        if (!code.includes(mutationFrom)) {
          throw new Error(
            `[mutation-invalid:${mutationId}] patrón no encontrado en ${mutationFile}`,
          );
        }
        applied = true;
        console.error(`[mutation-applied:${mutationId}]`);
        return { code: code.replace(mutationFrom, mutationTo), map: null };
      },
    },
  ],
});
