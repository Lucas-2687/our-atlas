import { execFileSync } from "node:child_process";

let repository = process.argv[2];
if (!repository) {
  try {
    repository = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    console.error("请传入公开仓库地址：npm run deploy:link -- https://github.com/OWNER/REPO");
    process.exit(1);
  }
}
repository = repository.replace(/^git@github\.com:/, "https://github.com/").replace(/\.git$/, "").replace(/\/$/, "");
if (!/^https:\/\/github\.com\/[a-z\d][a-z\d-]*\/[\w.-]+$/i.test(repository)) {
  console.error("请使用不含凭证的 GitHub 仓库地址：https://github.com/OWNER/REPO");
  process.exit(1);
}

const url = new URL("https://vercel.com/new/clone");
url.searchParams.set("repository-url", repository);
url.searchParams.set("env", "SUPABASE_URL,SUPABASE_SECRET_KEY,ATLAS_SETUP_KEY");
url.searchParams.set("envDescription", "使用你自己的 Supabase 项目和服务器密钥；初始化密钥至少 12 个字符。");
url.searchParams.set("envLink", `${repository}/blob/main/README.md#快速搭建`);
console.log(`部署地址：\n${url.href}\n\nREADME 按钮：\n[![Deploy with Vercel](https://vercel.com/button)](${url.href})\n\nGitHub 模板入口：\n${repository}/generate`);
