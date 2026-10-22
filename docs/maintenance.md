# 维护指南

## 旅行内容与代码分别管理

旅行、照片、地图名称和共同口令在网站 `/edit` 管理，写入 Supabase，通常不需要发布代码。首页仍公开所有已保存记录；不要把编辑口令当成浏览密码。分享链接过期或撤销也不会隐藏首页内容。

网页、地图交互和接口代码通过 Git 管理。Node.js、Git、VS Code、Vercel 和 Supabase 即可完成开发、部署与维护，不要求 Codex 或其他 AI 服务。

## 第一次接入 GitHub

项目的公开模板是 [Lucas-2687/our-atlas](https://github.com/Lucas-2687/our-atlas)。新用户可从模板生成自己的仓库，后续使用自己的远程地址和 Supabase 配置。

此目录已初始化本地 Git；源码包也可用 `git init -b main` 重新建立仓库。地图的授权、转换和来源已说明于 [第三方说明](../THIRD_PARTY.md)，公开前仍应检查自己的实际配置和拟提交文件。使用已含初始提交的版本时，可先用 `git log -1 --oneline` 查看，不必重复创建初始提交。

如果从源码压缩包开始，在自己的 GitHub 账户创建空仓库；不要在网页上预先生成 README，以免产生不必要的初始分支冲突。已经通过模板创建或克隆项目时，直接检查现有 remote 并跳过重复创建步骤。下面的 OWNER、REPO 是占位符，必须换成自己的目标；维护作者的本地目录时使用已连接的 `origin`。

```powershell
git status --short
git add .
npm run check:public -- --staged --release
git diff --cached --stat
git diff --cached
```

本地准备的初始提交使用项目匿名署名，避免自动公开你的全局 Git 邮箱；保留 AI 协作署名。之后的提交会读取你自己的 Git 配置，公开前核对姓名和邮箱，可使用 GitHub 提供的 noreply 邮箱。

检查结果通过后，如仓库还没有提交则创建首个提交，再设置远程地址和推送：

```powershell
git commit -m "Prepare Our Atlas for open source"
git remote add origin https://github.com/OWNER/REPO.git
git push -u origin main
npm run deploy:link
```

如果已经存在 remote，先查看 `git remote -v`，不要直接覆盖地址。模板仓库设置、实际部署按钮和既有 Vercel 项目的连接均需使用同一个确认过的目标。

`.gitignore` 会排除 `.env.local`、`backups`、`private`、`uploads` 和构建缓存，但不能移除已加入 Git 的内容。敏感文件若误入暂存区，先取消追踪再检查；如果真实密钥已进入提交或公开远程，先轮换密钥，再处理历史记录，单纯删文件不足以恢复保密性。

`check:public` 检查常见密钥和敏感路径，只输出文件名与风险类型，不打印匹配值。`--staged` 检查暂存区实际字节，避免工作区已脱敏而暂存区仍含秘密；人工仍需检查截图、故事、照片和所有历史提交。

## 日常代码更新

旅行内容在 `/edit` 管理；下面的流程用于修改页面、功能和文档。只想新增一段旅行时，跳过本节。

### 1. 同步代码，再开自己的修改分支

在含 `package.json` 的目录打开 VS Code 终端，先运行 `git status --short`。如果已有本地改动，先确认并保存，不用重置或覆盖来消除提示。

```powershell
git status --short
git pull --ff-only
npm ci
git switch -c improve-map
```

`improve-map` 是示例分支名，每次修改选一个新的名字。`pull --ff-only` 无法快进时先检查分支差异，不强制覆盖远程或丢弃本地修改。`npm ci` 按锁文件安装依赖，不读取 Supabase 生产数据。

### 2. 修改并检查

在 VS Code 修改代码后运行现有检查。需要实际试用页面时，用独立测试 Supabase 配置 `.env.local`，再运行 `npm run dev`；不要把试验录入生产库。

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run check:public
```

看到报错先处理当前修改引起的问题，不以关闭检查代替修复。只改说明文字时，重点检查链接、图片和内容是否正确；仓库的 GitHub Actions 仍会在推送后执行自动检查。

### 3. 检查拟提交内容，再提交和推送

```powershell
git status --short
git add .
git diff --cached --stat
git diff --cached
npm run check:public -- --staged --release
```

核对列出的文件都是本次修改，不含真实旅行、照片、环境配置或备份。检查通过后提交，并把自己的分支推到自己的仓库：

```powershell
git commit -m "Describe this change"
git push -u origin improve-map
```

提交说明改成能描述实际改动的文字。第一条保存本地版本，第二条才上传 GitHub；本地提交成功不代表远程已经更新。

### 4. 在 GitHub 合并，再看部署结果

1. 打开自己的仓库，使用 **Compare & pull request** 或 **Pull requests → New pull request**。
2. Base 选择 `main`，Compare 选择本次分支，确认文件差异后创建 Pull Request。
3. 等待 **Checks** 自动检查通过。若失败，进入对应检查查看失败步骤，修复后继续推送同一个分支。
4. 需要 Preview 时先为 Preview 配置独立的测试 Supabase，确认页面和编辑流程后再合并。
5. 选择合并到 `main`。**仅在 Vercel 已连接正确仓库和生产分支时**，合并推送才会触发对应站点部署。
6. 到 Vercel 的 Deployments 查看新版本是否成功，再打开正式网站确认旧记录、照片与编辑入口仍正常。GitHub 检查成功不等于 Vercel 发布已经成功。

GitHub Actions 不使用生产密钥，不自动修改数据库。数据库结构变更要另外按迁移流程处理；回退代码也不等于回退数据库。

### 只想修改 README 或说明文字

也可以在 GitHub 打开 Markdown 文件，用网页编辑入口修改文字；提交时选择新分支并创建 Pull Request。预览图片与链接，等检查通过再合并，无需 Codex 或本地运行 AI 工具。不要把密钥、个人数据或真实控制台截图粘进去。

依赖锁文件属于源码，应和依赖清单一起提交。升级框架或更换数据结构时先做备份、在测试环境验证，再部署生产。

## 环境配置

服务端读取 `SUPABASE_URL`、`SUPABASE_SECRET_KEY`；兼容旧名 `SUPABASE_SERVICE_ROLE_KEY`，新部署优先使用前者。不能添加 `NEXT_PUBLIC_`，不能将密钥写进 README、部署链接或 CI 日志。GitHub 的公共代码不需要知道你的真实配置。

本地配置保存为被忽略的 `.env.local`。Vercel 的 Production 与 Preview 环境分别配置，避免预览操作生产数据。修改 Vercel 环境变量后重新部署，使新值生效。完成首次设图后删除 `ATLAS_SETUP_KEY` 不影响现有地图登录。

## 数据库升级

结构变更以 [迁移目录](../supabase/migrations) 为准。记录每个环境已执行的版本，已有环境只执行新增迁移。`db:setup` 汇总的是新站全部 SQL，不是生产升级命令。

执行任何 SQL 前，核对 Supabase 项目与环境，先在测试项目演练。`0003` 只自动绑定唯一一张旧地图；有多张时，先私下查询确认：

```sql
select id, title from public.spaces;
```

确认目标后再执行，不要直接使用示例字符串：

```sql
insert into public.site_map (id, space_id)
values (1, '你已确认的现有地图UUID'::uuid)
on conflict (id) do update set space_id = excluded.space_id;
```

绑定哪张地图就会公开哪张的已保存内容。不要在已有地图上重新初始化，不要删除地图来解决登录问题。

## 备份与恢复

代码、数据库、照片、环境配置是四份不同的资产。Git 保存代码，不能恢复 Supabase 中丢失的旅行或照片；足迹卡片 PNG 也不是数据备份。

1. **数据库：** 使用 Supabase 的备份功能，或在你已确认链接到目标项目的 Supabase CLI 中导出应用结构和数据。备份须包含 `public` 下的地图、旅行、访问口令哈希、分享、站点绑定等关联表，不只是 `trips`。
2. **照片：** 单独备份 Storage `travel-photos` 的所有对象及原对象路径。数据库备份通常不包含实际文件字节。可以通过 Supabase Storage 管理或你有权使用的下载工具完成，不能把 bucket 改成公开来方便备份。
3. **配置：** 私下保存项目标识、bucket 名和必要环境配置；服务密钥使用密码管理工具，不提交 Git。
4. **验证：** 在独立测试项目恢复结构和数据，创建私有 bucket，再按原 key 上传照片。核对行数、地图绑定、口令、旅行照片和分享行为后，备份才算可用。若备份包含个人旅行，不要把恢复验证站点公开发布。

可选 CLI 导出示例（先自行安装 Supabase CLI 并核对 `supabase link` 的目标；以下命令只做导出）：

```powershell
New-Item -ItemType Directory -Force backups
supabase db dump --linked --schema public --file backups/schema.sql
supabase db dump --linked --schema public --data-only --use-copy --file backups/data.sql
```

`backups` 目录已忽略，但本地忽略不是备份策略。另存一份受保护、可恢复的异地副本；不要把 SQL 或照片压缩包上传公开 Issue、仓库或 CI artifact。备份能力和可用保留策略以你的 Supabase 套餐为准。

## 回退与故障定位

- **代码问题：** Vercel 可以回退到先前部署；Git 可撤销某次改动。先确保该代码版本兼容当前数据库结构。回退代码不会撤销迁移或恢复已删除内容。
- **数据库问题：** 暂停写入，保留当前状态，在隔离项目验证备份再决定恢复方案；不要直接在生产执行 `db reset` 或用旧 dump 覆盖现有数据。
- **首页提示配置缺失：** 检查 Vercel 对应环境是否有正确变量，并确认已经重新部署。不要为了排错打印密钥。
- **建图失败或数据库不可用：** 核对所有迁移、Data API 的 `public` schema、服务端角色授权；在 Vercel 日志和 Supabase 中查看对应错误，分享日志前先脱敏。
- **照片保存失败：** 确认私有 bucket 名为 `travel-photos`，密钥属于同一 Supabase 项目，图片为有效 JPG/PNG/WebP 且未超上传或像素限制。Vercel 也有请求大小限制，正常网页会先压缩照片。
- **忘记编辑口令：** 如任一设备仍登录，在设置中修改口令。当前没有自助邮件找回；全部退出时，站主需在私有管理环境使用 [口令哈希算法](../lib/map-access.ts) 执行经审核的管理员恢复并使旧会话失效。不要在公共聊天贴密码，不需要删除旅行重新建图。

## 验证的范围

离线测试使用 PostgreSQL 内存引擎、模拟 REST/Storage 和虚构数据，可验证迁移及核心接口合同，不替代真实 Supabase、Vercel 配额、网络、生产版本和升级验收。发布时仍需在独立测试项目完整走一遍初始化、编辑、图片上传和公开浏览；本次整理没有访问或修改既有线上服务。
