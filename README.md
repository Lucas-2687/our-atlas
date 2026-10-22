# 同行地图 · Our Atlas

两个人共同记录旅行的地图与手账：点亮国家、省份和城市，保存旅行日期、故事与照片。一个部署对应一张地图。

[使用模板创建自己的地图](https://github.com/Lucas-2687/our-atlas/generate)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FLucas-2687%2Four-atlas&env=SUPABASE_URL%2CSUPABASE_SECRET_KEY%2CATLAS_SETUP_KEY&envLink=https%3A%2F%2Fgithub.com%2FLucas-2687%2Four-atlas%2Fblob%2Fmain%2FREADME.md)

部署前请完成下方的 Supabase 初始化，使用自己的数据库与服务端密钥。

- `/`：任何访客都能浏览已保存的旅行、称呼、地点、日期、故事和照片。
- `/edit`：你和伴侣使用共同口令记录和修改，无需 Codex、ChatGPT 登录或地图编号。
- 支持日期精度、重复到访、选定旅行分享和足迹卡片导出。

源码已整理为独立维护的开源版本。地图使用许可明确的 Natural Earth、HDX/geoBoundaries 等固定来源；自有代码采用 MIT，地图按各自许可分发，见 [第三方来源](THIRD_PARTY.md)。原有地点编号全部保留，少数缺少核实边界的新行政区以城市标记展示。

## 代码、数据与公开范围

采用 Next.js + Vercel + Supabase。代码由 Git 管理，旅行数据在部署者自己的 Supabase Postgres，照片在私有 Storage bucket `travel-photos`。公开源码不会自动导出数据库或照片，也不应包含个人配置、备份和真实数据截图。

**网站本身是公开旅行册。** 编辑口令限制修改，不限制浏览；分享链接的范围、过期和撤销仅作用于分享入口，不会隐藏首页已有的记录。私有 bucket 阻止直接访问存储，但网站 API 会向访客提供已关联旅行的照片。未关联照片仅允许编辑者读取。

新照片在服务器端校正方向、重编码并清除 EXIF/GPS 等元数据；支持 JPG、PNG、WebP，每张最多 4 MiB、40MP，处理后最长边 4096px。历史照片不会被自动重写。足迹卡片导出的是 PNG，**不能代替数据和照片备份**。

## 快速搭建

### 1. 准备自己的仓库

维护者在自己的 GitHub 仓库 Settings 勾选 **Template repository**。使用者点击 **Use this template → Create a new repository**，即可拥有独立仓库。长期跟随上游更新也可选择 Fork；模板生成的仓库没有上游提交历史，更新需自行合并。

部署按钮需要真实公开仓库地址。维护者设置 Git remote 后运行 `npm run deploy:link`，或显式传入地址：

```powershell
npm run deploy:link -- https://github.com/OWNER/REPO
```

该命令只输出 Vercel 部署链接、可贴入 README 的按钮和 GitHub 模板入口，不上传代码或传输密钥。也可以在 [Vercel 新项目](https://vercel.com/new) 手动导入自己的 GitHub 仓库。

### 2. 初始化自己的 Supabase

1. 创建一个属于你的 Supabase 项目。不要使用示例作者的数据库地址或密钥。
2. 在应用根目录运行以下命令，复制输出的完整 SQL，到**新项目**的 SQL Editor 执行。无需安装依赖即可生成 SQL：

```powershell
npm run --silent db:setup
```

Windows 可直接复制到剪贴板：

```powershell
node .\scripts\supabase-setup.mjs | Set-Clipboard
```

此命令仅按文件名顺序输出 [数据库迁移](supabase/migrations)，不连接或修改数据库。包含应用表、函数、RLS、服务端授权和私有照片 bucket；不会导入旅行、称呼、口令或照片。也可在 SQL Editor 依次执行 `0001` 至 `0005`。已有网站升级请跳至下文，不要重复新站初始化流程。

3. 确认 Supabase Data API 已启用，并包含 `public` schema；应用使用服务端 REST API。`anon` / `authenticated` 不应获得应用表访问权限。
4. 在 Supabase 的项目设置取得 Project URL 和服务器密钥，推荐 `sb_secret_` 类型。密钥只交给你自己的服务端环境。

### 3. 部署到 Vercel

在 Vercel 导入自己的仓库，Framework Preset 选择 **Next.js**，Root Directory 选择含 [package.json](package.json) 的应用目录。使用本目录作为仓库根目录时无需再填嵌套路径。Node.js 选择受支持且不低于 22.13 的版本。

添加以下环境变量，再 Deploy：

| 变量 | 用途 | 放在哪里 |
| --- | --- | --- |
| `SUPABASE_URL` | 你自己的 Supabase 项目地址 | Vercel 服务端环境、本地 `.env.local` |
| `SUPABASE_SECRET_KEY` | 你自己的服务端密钥 | 同上，绝不加 `NEXT_PUBLIC_` 前缀 |
| `ATLAS_SETUP_KEY` | 你自己生成的随机初始化密钥，至少 12 字符 | 仅首次设图需要；不能与编辑口令混用 |

Vercel Deploy 按钮能创建仓库和 Vercel 项目，但仍需完成 Supabase 初始化及这三个变量的配置。不要将真实值写进部署 URL、README、代码或 GitHub Issue。

### 4. 首次设置与日常记录

1. 打开新站 `/edit`，输入初始化密钥，设置称呼、地图名称和至少 12 字符的编辑口令。
2. 首次设置仅成功一次。完成后在 Vercel 删除 `ATLAS_SETUP_KEY` 并重新部署。
3. 收藏 `/edit`，日后在网页直接新增旅行、管理照片、修改地图名和编辑口令。把编辑口令单独告诉伴侣，不放进链接。
4. 首页将公开你保存的旅行。口令目前不支持自动找回，恢复方法见 [维护指南](docs/maintenance.md)。

## 本地开发与验证

需要 Node.js >= 22.13.0 和 Git。

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

启动前在 `.env.local` 填写你自己的测试项目配置，浏览器打开 `http://localhost:3000`。开发或 Preview 环境使用独立的测试 Supabase；不要把试验写入生产数据库。

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check:public
```

测试使用虚构图片、内存数据库与模拟存储，不需要服务密钥或外部网络。生产构建也不需要连接数据库。CI 在 Node 22.13 和 24 上执行上述检查；不会自动运行生产数据库迁移或部署。继承代码中部分 `any` 和 React Hooks lint 债务暂保留为 warning，仅对原文件生效；`npm run lint` 检查 error，完整 warning 可用 `npx eslint .` 查看。

## 已部署网站升级

继续使用原 Vercel 项目、原 Supabase 与原环境变量，不必复制线上数据到仓库或另建网站。

1. 先按 [备份与回退](docs/maintenance.md#备份与恢复) 保存数据库和 Storage 对象。
2. 对照已执行的迁移，只补缺失版本。已有 `0001` 至 `0004` 的部署仅需新增 `0005_private_photo_bucket.sql`；它保留已有私有 bucket，如发现同名公开 bucket 则中止，供你核对设置，不会擅自改权限。
3. 老版本尚未绑定单站地图时，先执行 `0003_single_site_map.sql`；恰有一张旧地图会自动沿用，旅行、照片和口令不变。若有多张，需由站主确认绑定哪张，不能任意选一张公开。
4. 先在隔离 Preview 验证，再将生产项目连接到你确认的 GitHub 仓库和发布分支。推送后由 Vercel 自动构建。
5. 打开 `/edit` 输入原口令，核对旧记录及照片。更新只统一处理今后的上传，不批量处理历史照片。

多张旧地图的绑定步骤、口令恢复、日志与常见故障见 [维护指南](docs/maintenance.md)。

## 不用 Codex 也能维护

- **旅行内容：** 使用 `/edit`，不需要改代码或重新部署。
- **页面与功能：** VS Code 修改 → 本地验证 → Git 提交和推送 → Vercel 自动部署。
- **配置与数据：** 密钥在 Vercel 管理，数据库及照片在 Supabase 管理；备份独立保存。

详细步骤见 [维护指南](docs/maintenance.md)。当前运行、构建和离线测试不依赖 Codex 云端；仍需持续管理 Vercel、Supabase 账户及其存储和使用额度。

## 公开前检查与许可

公开前人工检查拟提交内容，并执行 `npm run check:public -- --staged --release`。该检查覆盖常见敏感文件、密钥模式及地图来源和哈希，不会替你判断照片、故事或截图是否私人，也不能证明历史提交没有秘密。底图已随源码提供，日常构建无需下载上游数据；更新来源和重新生成的方法见 [地图数据说明](docs/map-data.md)。

自有代码采用 [MIT](LICENSE)，示例旅行为虚构文字，三张示例插画为项目自制 SVG。第三方地图、Leaflet 与依赖遵循各自许可，见 [第三方来源](THIRD_PARTY.md)。
