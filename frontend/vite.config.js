import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const frontendRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: frontendRoot,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
