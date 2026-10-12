/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import type { IncomingMessage, ServerResponse } from "http";

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf-8")
) as { version: string };

// Mirrors PUBLIC_BINARY_PATH_RE in worker/server.py so every region works in dev and preview.
const DEV_API_BINARY_RE = /^\/api\/([a-z0-9-]+_electricity_prices(?:_15min)?\.bin)$/;

const serveApiBinary = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  if (!req.url) {
    next();
    return;
  }

  const requestPath = req.url.split("?")[0];
  const fileName = DEV_API_BINARY_RE.exec(requestPath)?.[1];

  if (!fileName) {
    next();
    return;
  }

  const filePath = path.resolve(import.meta.dirname, "public", fileName);
  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  const stat = fs.statSync(filePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", stat.size);

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
};

// https://vitejs.dev/config/
export default defineConfig(() => ({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: "::",
    port: 8080,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Default 5s is too tight on a loaded machine or shared CI runner.
    testTimeout: 20_000,
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
  plugins: [
    {
      name: "eepa-dev-api-files",
      // Serves /api/*.bin like the worker, for `vite dev` and `vite preview` (used by e2e tests).
      configureServer(server) {
        server.middlewares.use(serveApiBinary);
      },
      configurePreviewServer(server) {
        server.middlewares.use(serveApiBinary);
      },
    },
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
}));
