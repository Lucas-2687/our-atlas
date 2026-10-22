import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function inspectPublicFile(name, text) {
  const path = name.replaceAll("\\", "/");
  const problems = [];
  if (/(^|\/)\.env(?:\.|$)/i.test(path) && path !== ".env.example") problems.push("环境变量文件");
  if (/(^|\/)(?:backups?|private|uploads|\.openai|\.vercel|\.codex|\.sites-runtime)(\/|$)/i.test(path)
    || /\.(?:dump|backup|pem|p12|key|sql\.gz)$/i.test(path)) problems.push("私有文件、备份或凭证");
  const secrets = text.match(/sb_secret_[A-Za-z0-9_-]{20,}/g) || [];
  if (secrets.some((value) => value !== "sb_secret_your-server-only-secret-key")) problems.push("疑似 Supabase 服务密钥");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) problems.push("私钥");
  if (/postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/i.test(text)) problems.push("带密码的数据库连接");
  const tokens = text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
  for (const token of tokens) {
    try {
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      if (claims.role === "service_role") problems.push("Supabase service_role JWT");
    } catch { /* Other dotted strings are not necessarily JWTs. */ }
  }
  return [...new Set(problems)];
}

export async function inspectMapAssets(files, load) {
  const issues = [];
  try {
    const manifest = JSON.parse(await load("public/data/sources.json"));
    const sources = JSON.parse(await load("scripts/map-sources.json"));
    if (manifest.version !== 1 || JSON.stringify(manifest.sources) !== JSON.stringify(sources)
      || sources.length !== 6 || sources.some((source) => !/^[a-f0-9]{64}$/.test(source.sha256) || !source.licenseUrl.startsWith("https://"))) {
      throw new Error("Invalid source manifest");
    }
    const names = Object.keys(manifest.files);
    if (!["china.json", "world.json", "catalog.json"].every((name) => names.includes(name))) throw new Error("Incomplete maps");
    for (const name of names) {
      if (!/^(?:china|world|catalog)\.json$|^provinces\/\d{6}\.json$/.test(name)) throw new Error("Unexpected map path");
      const digest = createHash("sha256").update(await load(`public/data/${name}`)).digest("hex");
      if (digest !== manifest.files[name]) issues.push(`public/data/${name}: 地图内容与已审核来源的生成清单不匹配`);
    }
    for (const file of files.filter((name) => name.startsWith("public/data/"))) {
      if (file !== "public/data/sources.json" && !names.includes(file.slice("public/data/".length))) issues.push(`${file}: 未列入地图来源清单`);
    }
  } catch {
    issues.push("地图来源清单缺失、格式不符或地图文件不完整；请按 THIRD_PARTY.md 重新生成并核对授权。");
  }
  return issues;
}

export async function checkPublic({ staged = false, release = false } = {}) {
  const args = staged ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
    : ["ls-files", "--cached", "--others", "--exclude-standard", "-z"];
  const files = [...new Set(execFileSync("git", args, { encoding: "utf8" }).split("\0").filter(Boolean))];
  const issues = [];
  for (const file of files) {
    let bytes;
    try {
      bytes = staged ? execFileSync("git", ["show", `:${file}`], { maxBuffer: 32 * 1024 * 1024 }) : await readFile(file);
    } catch (error) {
      if (!staged && error.code === "ENOENT") continue;
      throw error;
    }
    const problems = inspectPublicFile(file, bytes.includes(0) ? "" : bytes.toString("utf8"));
    if (problems.length) issues.push(`${file}: ${problems.join("、")}`);
  }
  if (release) {
    const indexed = staged ? execFileSync("git", ["ls-files", "--cached", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean) : files;
    const load = (file) => staged ? execFileSync("git", ["show", `:${file}`], { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }) : readFile(file);
    issues.push(...await inspectMapAssets(indexed, load));
  }
  return { count: files.length, issues };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkPublic({ staged: process.argv.includes("--staged"), release: process.argv.includes("--release") });
    console.log(`已检查 ${result.count} 个文件；仅列出风险类型，不显示密钥值。`);
    if (result.issues.length) {
      result.issues.forEach((issue) => console.error(issue));
      process.exitCode = 1;
    } else console.log("常见敏感文件与密钥模式检查通过；仍需人工检查数据、截图和授权。");
  } catch {
    console.error("检查失败。请在已初始化的仓库根目录运行，确认 Git 可用、文件可读且 THIRD_PARTY.md 存在。");
    process.exitCode = 1;
  }
}
