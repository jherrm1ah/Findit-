import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

const TEST_DB_PATH = path.resolve(__dirname, "data", "findit.test.db");

for (const suffix of ["", "-wal", "-shm"]) {
  const p = TEST_DB_PATH + suffix;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    env: { FINDIT_DB_PATH: TEST_DB_PATH },
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
