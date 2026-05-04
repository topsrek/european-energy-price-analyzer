/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

const devApiFileMap: Record<string, string> = {
  "/api/at_electricity_prices.bin": "at_electricity_prices.bin",
  "/api/at_electricity_prices_backup.bin": "at_electricity_prices_backup.bin",
  "/api/at_electricity_prices_15min.bin": "at_electricity_prices_15min.bin",
};

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
  plugins: [
    {
      name: "eepa-dev-api-files",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url) {
            next();
            return;
          }

          const requestPath = req.url.split("?")[0];
          const fileName = devApiFileMap[requestPath];

          if (!fileName) {
            next();
            return;
          }

          const filePath = path.resolve(__dirname, "public", fileName);
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
        });
      },
    },
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
