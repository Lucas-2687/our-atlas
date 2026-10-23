# travel-map

中文 | [English](README.en.md)

两个人共用的旅行地图与手账：记录国家、省份和城市，保存日期、故事与照片。一个部署对应一张地图，中文地图名称可使用“我们的旅行地图”。

目前应用界面为中文；双语仅指项目文档，不包含运行时语言切换。

[使用模板创建自己的地图](https://github.com/Lucas-2687/travel-map/generate)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FLucas-2687%2Ftravel-map&env=SUPABASE_URL%2CSUPABASE_SECRET_KEY%2CATLAS_SETUP_KEY&envLink=https%3A%2F%2Fgithub.com%2FLucas-2687%2Ftravel-map%2Fblob%2Fmain%2FREADME.md)

部署前请完成下方的 Supabase 初始化，使用自己的数据库与服务端密钥。

[从零部署图文教程](docs/deployment.md) · [日常使用指南](docs/usage.md) · [代码维护与备份](docs/maintenance.md)

![旅行地图实际界面：地图、共同足迹和最近旅行](docs/images/overview.png)

*文中界面截图使用虚构旅行和项目自制插画，不包含真实用户记录。新部署的网站从空白地图开始，不会自动导入截图中的旅行。点击图片可查看大图。*

## 这个项目能做什么

- `/`：任何访客都能浏览已保存的旅行、称呼、地点、日期、故事和照片。
- `/edit`：你和伴侣使用共同口令记录和修改，无需 Codex、ChatGPT 登录或地图编号。
- 支持日期精度、重复到访、选定旅行分享和足迹卡片导出。

| 功能 | 使用方式与结果 |
| --- | --- |
| 足迹地图 | 在一张图上查看全球国家与城市；中国支持省级、地市级层级，部分新行政区以城市标记展示 |
| 多地点旅行 | 一次旅行可以同时记录京都、大阪等多个地点，不必拆成多条回忆 |
| 模糊日期 | 可以填写具体日期、月份、年份，或先留空，适合补录记不清日期的旧旅行 |
| 故事与照片 | 每段旅行保存标题、文字和最多 12 张照片；网页自动压缩图片再上传 |
| 重复到访 | 同一座城市可以有多段旅行；两次到访保留两段回忆，城市足迹仍只计一次 |
| 共同维护 | 两个人使用同一个 `/edit` 地址和口令，在各自设备记录旅行 |
| 分享与导出 | 生成选定旅行的只读链接，或下载一张带地图与统计的足迹 PNG 卡片 |

### 看看实际界面

<table>
<tr>
<td width="50%" valign="top">
<a href="docs/images/journal.png"><img src="docs/images/journal.png" alt="虚构示例：旅行手账按时间呈现京都、大理和杭州三段旅行" width="100%" /></a>
<p><strong>旅行手账</strong><br />按时间查看旅行；同一个地方可以记录多次。</p>
</td>
<td width="50%" valign="top">
<a href="docs/images/trip-detail.png"><img src="docs/images/trip-detail.png" alt="虚构示例：京都旅行详情中的日期、地点、故事和插画" width="100%" /></a>
<p><strong>旅程详情</strong><br />点开一段旅行，查看这一趟的日期、多个地点、照片和故事。</p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="docs/images/record-trip.png"><img src="docs/images/record-trip.png" alt="虚构示例：编辑旅行表单，包含地点、日期精度、故事与照片" width="100%" /></a>
<p><strong>记录与编辑</strong><br />至少添加一个地点，日期和故事都可以以后补。图中是已有示例旅行的编辑表单，新建旅行使用相同字段。</p>
</td>
<td width="50%" valign="top">
<a href="docs/images/share.png"><img src="docs/images/share.png" alt="虚构示例：分享面板中的足迹图片、国家数和城市数" width="100%" /></a>
<p><strong>分享与导出</strong><br />PNG 适合保存和分享；只读链接可以选范围和有效期。它们不能代替数据库与照片备份。</p>
</td>
</tr>
</table>

第一次使用的流程是：打开 `/edit` → 验证口令 → 点击“记录共同旅行” → 添加地点、日期、故事或照片 → 保存 → 返回首页查看。完整操作、照片限制和分享规则见 [日常使用图文指南](docs/usage.md)。

地图使用许可明确的 Natural Earth、HDX/geoBoundaries 等固定来源；自有代码采用 MIT，地图按各自许可分发，见 [第三方来源](THIRD_PARTY.md)。原有地点编号全部保留，少数缺少核实边界的新行政区以城市标记展示。

## 代码、数据与公开范围

![项目结构示意：GitHub 保存代码，Vercel 运行网站，Supabase 保存自己的旅行和照片](docs/images/architecture.svg)

采用 Next.js + Vercel + Supabase。代码由 Git 管理，旅行数据在部署者自己的 Supabase Postgres，照片在私有 Storage bucket `travel-photos`。公开源码不会自动导出数据库或照片，也不应包含个人配置、备份和真实数据截图。

**网站本身是公开旅行册。** 编辑口令限制修改，不限制浏览；分享链接的范围、过期和撤销仅作用于分享入口，不会隐藏首页已有的记录。私有 bucket 阻止直接访问存储，但网站 API 会向访客提供已关联旅行的照片。未关联照片仅允许编辑者读取。

新照片在服务器端校正方向、重编码并清除 EXIF/GPS 等元数据；支持 JPG、PNG、WebP，每张最多 4 MiB、40MP，输入任一边不超过 16384px，处理后最长边 4096px。历史照片不会被自动重写。足迹卡片导出的是 PNG，**不能代替数据和照片备份**。

## 快速搭建

**第一次部署，建议打开 [从零部署图文教程](docs/deployment.md)。** 教程按“在哪里点、填什么、成功后看到什么、失败怎么查”展开；推荐路线只需浏览器，不要求先安装 Node.js 或使用终端。已有线上网站请先读 [保留数据的升级流程](docs/deployment.md#已有网站升级保留数据与原口令)。

![从复制模板到开始记录的六步部署流程示意](docs/images/deployment-flow.svg)

| 阶段 | 做什么 | 完成标志 |
| --- | --- | --- |
| 1. 拥有代码 | 用 GitHub 模板生成自己的仓库 | 地址位于自己的账户下，能看到项目文件 |
| 2. 准备数据 | 创建自己的 Supabase 项目 | SQL Editor、数据库和 Storage 可用 |
| 3. 建好结构 | 按顺序执行五段 SQL | 应用表与函数存在，`travel-photos` 是私有 bucket |
| 4. 部署网站 | Vercel 导入自己的仓库，添加三个变量 | 部署 Ready，得到网站地址 |
| 5. 首次设图 | 打开 `/edit` 设置称呼和编辑口令；完成后删除初始化变量并重新部署 | 用编辑口令仍能进入，不再需要初始化密钥 |
| 6. 开始记录 | 在网页新增旅行并保存 | 刷新后记录仍在，首页能公开浏览 |

下面是部署速查；详细操作和排错见图文教程。**模板生成与 Vercel Deploy 按钮是两条入口：已生成自己的仓库时，直接在 Vercel 导入它，避免再创建第二份。**

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

在含 `package.json` 的项目根目录打开终端，先安装依赖并准备本地配置。已有 `.env.local` 时不要覆盖：

```powershell
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

打开 `.env.local`，填写你自己的**测试** Supabase 配置，保存后启动：

```powershell
npm run dev
```

浏览器打开 `http://localhost:3000`。开发或 Preview 环境使用独立的测试 Supabase；不要把试验写入生产数据库。首次建图步骤与线上相同，见部署教程。

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

## 常见问题

**上传到 GitHub 后，就已经有网站了吗？**
GitHub 保存项目代码；实际网站地址来自 Vercel 部署，旅行和照片由自己的 Supabase 保存。先完成部署教程，再用 Vercel 给出的域名访问网站。

**两个人记录旅行，需要各自注册账号吗？**
当前版本使用共同编辑口令。一个部署对应一张地图，两个人在各自设备打开同一个 `/edit` 地址并验证口令，不需要 ChatGPT 登录。

**仓库设为私有，或者关闭分享链接，能隐藏网站内容吗？**
这些设置不会改变首页的公开模型。编辑口令只控制修改；首页依然公开已保存的记录和关联照片。只读分享的范围和有效期仅作用于那条链接。

**不用 Codex、没有地图 API Key，还能维护吗？**
可以。项目使用标准 Next.js、Git 和自带的静态底图，不需要 Codex 云端或地图服务 Key。仍需管理自己的 Vercel、Supabase 配置、使用额度及数据备份。

## 文档导航

| 想了解什么 | 从哪里开始 |
| --- | --- |
| 第一次把项目部署成自己的网站 | [从零部署图文教程](docs/deployment.md)：账户、模板、五段 SQL、三个变量、首次设图与排错 |
| 网站建好以后怎么记录和分享 | [日常使用图文指南](docs/usage.md)：地点、日期、照片、重复旅行与只读分享 |
| 已有线上网站怎么更新和备份 | [维护指南](docs/maintenance.md)：Git、隔离 Preview、迁移、回退与恢复 |
| 地图从哪里来、城市标记有什么范围 | [地图数据说明](docs/map-data.md) 与 [第三方来源](THIRD_PARTY.md) |

## 不用 Codex 也能维护

- **旅行内容：** 使用 `/edit`，不需要改代码或重新部署。
- **页面与功能：** VS Code 修改 → 本地验证 → Git 提交和推送 → Vercel 自动部署。
- **配置与数据：** 密钥在 Vercel 管理，数据库及照片在 Supabase 管理；备份独立保存。

详细步骤见 [维护指南](docs/maintenance.md)。当前运行、构建和离线测试不依赖 Codex 云端；仍需持续管理 Vercel、Supabase 账户及其存储和使用额度。

## 公开前检查与许可

公开前人工检查拟提交内容，并执行 `npm run check:public -- --staged --release`。该检查覆盖常见敏感文件、密钥模式及地图来源和哈希，不会替你判断照片、故事或截图是否私人，也不能证明历史提交没有秘密。底图已随源码提供，日常构建无需下载上游数据；更新来源和重新生成的方法见 [地图数据说明](docs/map-data.md)。

自有代码采用 [MIT](LICENSE)，示例旅行为虚构文字，三张示例插画为项目自制 SVG。第三方地图、Leaflet 与依赖遵循各自许可，见 [第三方来源](THIRD_PARTY.md)。
