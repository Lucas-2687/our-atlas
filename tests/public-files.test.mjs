import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { inspectPublicFile } from "../scripts/check-public.mjs";

const secret = ["sb", "secret", "a".repeat(30)].join("_");
test("flags secrets even inside an environment example without echoing the value", () => {
  const results = inspectPublicFile(".env.example", `SUPABASE_SECRET_KEY=${secret}`);
  assert.ok(results.length > 0);
  assert.ok(results.every((result) => !result.includes(secret)));
});
test("accepts documented placeholders but rejects private paths and key material", () => {
  assert.deepEqual(inspectPublicFile(".env.example", "SUPABASE_SECRET_KEY=sb_secret_your-server-only-secret-key"), []);
  for (const path of [".env.local", "nested/.env", "backups/atlas.sql", "private/photo.jpg", ".vercel/project.json", "database.dump"]) {
    assert.ok(inspectPublicFile(path, "").length, path);
  }
  const header = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  assert.ok(inspectPublicFile("config.txt", header).length);
  const claims = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  assert.ok(inspectPublicFile("config.txt", `eyJhbGciOiJIUzI1NiJ9.${claims}.signature`).length);
});
test("checks staged bytes rather than a subsequently cleaned working copy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atlas-public-"));
  const git = (...args) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
  try {
    git("init", "--initial-branch=main");
    await mkdir(join(directory, "scripts"));
    await writeFile(join(directory, "config.txt"), secret);
    git("add", "config.txt");
    await writeFile(join(directory, "config.txt"), "redacted");
    const command = fileURLToPath(new URL("../scripts/check-public.mjs", import.meta.url));
    assert.throws(() => execFileSync(process.execPath, [command, "--staged"], { cwd: directory, stdio: "pipe" }), (error) => {
      assert.equal(error.status, 1);
      assert.ok(!String(error.stderr).includes(secret));
      return true;
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
