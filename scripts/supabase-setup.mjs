import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export async function setupSql() {
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  const sections = await Promise.all(files.map(async (name) => `-- ${name}\n${await readFile(new URL(name, directory), "utf8")}`));
  return `-- New installations only. Review the target Supabase project before running.\n\n${sections.join("\n\n")}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(await setupSql());
}
