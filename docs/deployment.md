# 从零部署同行地图

本手册用于将 [Our Atlas](https://github.com/Lucas-2687/our-atlas) 部署到自己的 GitHub、Supabase 和 Vercel 账户。主路线全程使用浏览器，无需终端；生成合并 SQL 是可选操作。

> 已有旅行或已上线网站：直接阅读文末“已有网站升级”。不要重复初始化、清空表或重置生产数据库。

## 先理解三个服务和公开范围

| 服务 | 保存什么 | 你要完成什么 |
| --- | --- | --- |
| GitHub | 网站源码，不包含线上旅行数据 | 创建自己的仓库，交给 Vercel 构建 |
| Supabase | Postgres 中的旅行、口令散列与会话；Storage 中的照片 | 建项目、运行迁移、提供服务端配置 |
| Vercel | 构建和运行 Next.js 网站、网站 API | 导入仓库、填变量、部署和维护域名 |

**首页 `/` 对访客公开所有已保存的旅行、称呼、地点、日期、故事和关联照片。** `/edit` 的共同口令只限制编辑，不限制浏览；不要上传不愿公开的内容。分享入口的范围、过期和撤销不会隐藏首页已有记录。

Storage 的 `travel-photos` bucket **必须是 private**。这阻止访客直接浏览存储，但网站 API 仍会提供已关联旅行的照片；未关联照片仅供编辑者读取。不要为了修复照片显示而把 bucket 改成 public。

![部署流程示意](images/deployment-flow.svg)

图：推荐流程为“模板生成仓库 → Supabase 新项目 → 五段 SQL → Vercel 导入 → 三个变量 → /edit 首次设置 → 删除初始化变量并重新部署”。流程与配置插图是示意图，非真实控制台界面；菜单名称可能随平台更新。

## 0. 准备账户并选定路线

- **入口：** 分别注册并登录 [GitHub](https://github.com)、[Supabase](https://supabase.com)、[Vercel](https://vercel.com)。
- **操作与填写：** 准备自己管理的账户；Vercel 后续授权访问你选定的 GitHub 仓库。数据库密码和各项密钥保存在密码管理器，不写进本文、源码、Issue 或部署链接。
- **成功标志：** 能进入三个服务的个人或团队工作区，有创建仓库和项目的权限。

推荐使用下方第 1～7 步。**README 的 Deploy with Vercel 按钮是另一条路线，会引导创建一份 Git 仓库和 Vercel 项目。** 已经用模板建好仓库的人应在 Vercel Import 已有仓库，不要再点按钮重复建仓库。

若你已经通过按钮创建了仓库，就保留那份仓库；先完成第 2～4 步，再回到对应 Vercel 项目补齐配置、部署。按钮不会代你初始化 Supabase，也不免除三个变量和首次设图操作。服务额度、费用和可用性以各平台当前方案为准，不保证完全一键或始终免费。

## 1. 用模板创建自己的 GitHub 仓库

1. **入口：** 打开 [项目仓库](https://github.com/Lucas-2687/our-atlas)，点击 **Use this template → Create a new repository**；也可打开[模板生成入口](https://github.com/Lucas-2687/our-atlas/generate)。
2. **填写：** Owner 选择自己的账户或团队，Repository name 填自己的仓库名，例如 `my-atlas`；按需要选择公开或私有，然后创建。仓库公开与否不改变网站首页的公开行为。
3. **成功标志：** 地址变成你的 `GitHub账户/仓库名`，文件列表中有 `package.json`、`app`、`supabase`。记住这份仓库，后续只导入它。

模板创建独立仓库，不自动同步上游更新；若入口未显示，先确认当前页面是模板仓库。需要长期跟随上游的人也可自行选择 Fork，但不需要同时创建两份仓库。

## 2. 创建一个全新的 Supabase 项目

1. **入口：** Supabase 工作区选择 **New project** 或当前同义入口。
2. **填写：** 选择自己的组织、项目名、数据库强密码和合适的地区。数据库密码不是网站编辑口令，也不是后面需要的 API Secret Key。
3. **操作：** 创建并等待项目就绪；执行 SQL 前再次核对项目名称和项目标识，确保这是本次新站的空项目。
4. **成功标志：** 能进入该项目的 SQL Editor、数据库和 Storage 页面。不要选作者的项目，也不要选已有旅行的生产项目。

如准备测试 Preview，另建一个 Supabase 测试项目并独立执行迁移。测试项目与生产项目不能共用数据库或照片存储。

## 3. 无需终端：按顺序手工运行五段 SQL

**入口：** 在自己的 GitHub 仓库打开 `supabase/migrations`；另一个浏览器标签页打开刚创建的 Supabase 项目的 **SQL Editor**。

每一段都按同样方式操作：打开对应 `.sql` 文件 → 使用 Raw 或复制文件内容的入口取得**完整 SQL** → SQL Editor 新建查询 → 粘贴 SQL → 核对目标项目 → Run。不要复制 GitHub 页面的行号、Markdown 代码围栏或只复制部分语句。

| 顺序与文件 | 作用 | 本段成功后检查 |
| --- | --- | --- |
| 1：[0001_initial_schema.sql](../supabase/migrations/0001_initial_schema.sql) | 应用表、索引、RLS，撤销匿名与普通登录角色的表权限 | 执行无错误；数据库中可见 `spaces`、`trips` 等表 |
| 2：[0002_vercel_functions.sql](../supabase/migrations/0002_vercel_functions.sql) | 原子创建、口令修改与访问限流函数 | 执行无错误；函数列表可见 `create_travel_space` 等 |
| 3：[0003_single_site_map.sql](../supabase/migrations/0003_single_site_map.sql) | 唯一网站地图绑定与首次初始化函数 | 执行无错误；可见 `site_map` 表，新站此时没有地图记录 |
| 4：[0004_server_table_privileges.sql](../supabase/migrations/0004_server_table_privileges.sql) | 授予 `service_role` 所需的服务端表权限 | 执行无错误；保留本段执行成功的记录 |
| 5：[0005_private_photo_bucket.sql](../supabase/migrations/0005_private_photo_bucket.sql) | 创建私有照片 bucket，遇到同名公开 bucket 会中止 | Storage 中有 `travel-photos`，Public 状态为关闭 |

**完成一段再执行下一段。** 成功结果可能显示类似“Success. No rows returned”，不返回数据行通常正常；以没有 SQL 错误为准。失败则停在当前段排查，不要跳过，更不要用重置数据库解决。

建议按文件名保存五份查询并自行记下成功执行的版本。手工 SQL Editor 路线不会因为源码出现新文件就自动运行迁移；保存的查询也不等于已经执行。

### 可选：用 Node 输出一份合并 SQL

已经完成上述五段的人跳过本节。此方式与手工路线二选一，仅适合新装，不是升级命令。

1. **入口：** 在 GitHub 下载源码 ZIP 并解压；打开含 `package.json` 和 `scripts` 的应用根目录，在该目录打开 PowerShell。
2. **准备：** 安装 Node.js，版本至少 `22.13.0`；推荐受支持的 22.x 或 24.x。只生成 SQL **不需要 `npm install` 或 `npm ci`**。
3. **操作：** 任选一条命令；第一条在终端输出，第二条把输出放进 Windows 剪贴板。

```powershell
node .\scripts\supabase-setup.mjs
node .\scripts\supabase-setup.mjs | Set-Clipboard
```

也可用项目已有命令 `npm run --silent db:setup` 输出 SQL。脚本只读取本地迁移文件，按文件名顺序合并输出；**不会连接 Supabase，也不会执行任何远程修改**。

4. **填写与执行：** 将完整输出粘贴到新 Supabase 项目的 SQL Editor，核对项目后 Run；不要再手工重复运行五段。
5. **成功标志：** 查询无错误，表、函数和私有 `travel-photos` 与上表一致。若中途错误，先确认哪些段已成功，再处理失败处，不要盲目重跑整份。

## 4. 核对 Data API 并取得正确配置

1. **入口：** 在该 Supabase 项目的设置中找到 Data API 配置；菜单位置以当前控制台为准。
2. **检查：** Data API 已启用，暴露的 schema 包含 `public`。这里的 schema 名叫 `public` 不代表应向匿名角色开放表；应用通过服务端 REST API 访问，`anon`、`authenticated` 不应取得应用表权限。
3. **入口与填写：** 在项目 **Connect** 对话框等项目连接信息处复制 **Project URL**，通常形如 `https://项目标识.supabase.co`；不要复制 Dashboard 地址或 PostgreSQL 连接字符串。
4. **入口与操作：** 打开项目 **Settings → API Keys**，选择或创建 Secret Key，复制 `sb_secret_` 开头的服务端密钥；不要误用 Connect 示例里默认显示的 Publishable Key。
5. **成功标志：** 你掌握同一项目的一对 Project URL 与 Secret Key；它们尚未出现在代码、聊天、公开截图或仓库中。

推荐新类型 **`sb_secret_...`**。旧版 **legacy `service_role`** 密钥仅作兼容；它与新 Secret Key 都具有高权限，只能保存在服务端。**`anon` 与 `sb_publishable_...` 不能代替本项目所需的服务器密钥。** 不需要把数据库密码填进 Vercel。

## 5. 在 Vercel 导入已有仓库并配置三个变量

### 5.1 导入与构建设置

1. **入口：** Vercel 工作区 **Add New → Project**，在导入 Git 仓库区域连接 GitHub。
2. **操作与填写：** 授权访问第 1 步创建的仓库，在列表中选择它并 **Import**；若列表为空，检查 GitHub 集成对该仓库的访问权限，不必再创建仓库。
3. **填写：** 项目名自定，Framework Preset 选择 **Next.js**；Root Directory 指向**仓库中 `package.json` 所在的应用根目录**。模板生成的仓库通常就是仓库根，保持默认根目录；不要填本机 `C:\...`，也不要因仓库名叫 `our-atlas` 就再填一层同名目录。
4. **检查：** Node.js 选择平台支持且不低于 `22.13.0` 的版本，推荐 22.x 或 24.x；版本选项通常在项目 Settings 的 Build and Deployment 中。构建、安装、输出目录保留 Next.js 自动检测值，除非日志明确需要调整。
5. **成功标志：** Vercel 显示的是你自己的仓库、预期分支和 Next.js 设置，能够找到 `package.json`。

### 5.2 添加服务端环境变量

![配置位置与变量关系示意](images/config-guide.svg)

图：Supabase 的 Project URL 和 Secret Key 填到 Vercel 环境变量；初始化密钥由你自己生成。本图是配置示意，非真实控制台界面，不含真实凭据。

**入口：** 首次导入页的 Environment Variables；项目已经创建时，进入该项目 Settings 中的 Environment Variables。逐项填写 Name 和 Value，值直接粘贴，不加引号或多余空格。

| Name（必须完全一致） | Value 填什么 | 生命周期 |
| --- | --- | --- |
| `SUPABASE_URL` | 第 4 步的 Project URL | 运行网站一直需要 |
| `SUPABASE_SECRET_KEY` | 同一项目的 `sb_secret_...`；legacy `service_role` 仅兼容 | 运行网站一直需要，仅服务端 |
| `ATLAS_SETUP_KEY` | 自己生成、妥善保管的随机初始化密钥，至少 12 字符 | 仅首次设图需要，完成后删除 |

三个变量均用于服务端配置，**任何一个都不要加 `NEXT_PUBLIC_` 前缀**；也不要把密钥写到 GitHub 或 Deploy URL 中。初始化密钥与编辑口令是两种凭据，必须使用不同的值，本文不提供可直接沿用的口令。

- **Production：** 为正式站填写正式 Supabase 项目的 URL 和密钥，以及本次正式站初始化密钥。
- **Preview：** 仅填写独立测试 Supabase 项目的 URL、密钥及其初始化密钥；测试库也先执行五段 SQL，并单独首次设图。
- **暂不测试 Preview：** 不要把生产变量一并勾选到 Preview；未配置的 Preview 无法完整运行，这是比误写生产数据更可控的状态。

**成功标志：** 三个变量名均已保存，作用环境正确，URL 与 Secret Key 属于同一个项目。后续增删改变量只影响新部署，不能靠刷新旧页面生效。

### 5.3 开始部署

1. **入口与操作：** 首次导入页点击 **Deploy**；已创建的项目从 Deployments 对目标环境发起重新部署（Redeploy 或当前同义操作）。
2. **检查：** 等待构建完成，失败时打开该次部署的 Build Logs；不要把构建成功当成数据库或首次设图已完成。
3. **成功标志：** 部署状态为 Ready 或当前等效成功状态，可用生成的网站域名打开页面。确认这是预期的 Production 部署，再进行下一步。

## 6. 在 `/edit` 完成一次首次设置

1. **入口：** 打开刚部署的网站，在域名后加 `/edit`。不要把 Supabase Dashboard 地址当作网站地址。
2. **应看到：** 首次设置表单，说明将设置网站唯一的共同地图，并提醒旅行和照片在首页公开。若只显示编辑口令登录，先确认是否已经设图，不要尝试创建第二张地图。
3. **填写：** 初始化密钥输入与 Vercel `ATLAS_SETUP_KEY` 完全一致的值；地图名字最多 80 字符；你的称呼、伴侣的称呼各最多 24 字符，留空时使用默认称呼。
4. **填写：** 设置另一个 **12～128 字符**的编辑口令，再输入一次确认。它是以后你和伴侣共同使用的口令，不是初始化密钥、数据库密码或 Supabase Secret Key。
5. **操作：** 点击“保存并进入编辑”；失败时按页面错误检查，避免反复猜测口令。
6. **成功标志：** 进入编辑界面并看到地图设置；刷新后地图仍存在。首次设置只能成功一次，一个部署对应一张地图，不能用初始化密钥继续新建地图。

![首次设置页面示例](images/setup.png)

图：`/edit` 页面示例；字段与当前页面为准。地图名称、称呼和口令均应使用你自己的内容，不照抄示例。

编辑口令请单独安全告诉伴侣；分享的编辑地址只需域名加 `/edit`，不要把口令放进链接。当前不支持自动找回，恢复操作见[维护指南](maintenance.md)。

## 7. 删除初始化变量，再重新部署

1. **入口：** Vercel 对应项目的环境变量设置，找到本次环境的 `ATLAS_SETUP_KEY`。
2. **操作：** 删除它并保存；保留 `SUPABASE_URL` 和 `SUPABASE_SECRET_KEY`。Production 与 Preview 各自完成首次设置后分别清理，不要删掉尚未初始化的测试环境配置。
3. **操作：** 在 Deployments 对相应环境执行一次 Redeploy，等待新部署成功，并确认正式域名指向新的 Production 部署。仅删除变量或刷新浏览器不会改变旧部署已读取的配置。
4. **成功标志：** 重新部署后退出编辑，用无痕窗口打开 `/edit`，输入**原编辑口令**仍可进入；首页地图和记录仍在。无需再次初始化，删除初始化密钥不会删除地图或改变编辑口令。

日常新增旅行、上传照片、修改地图名称和编辑口令都在 `/edit` 完成，无需改源码或重新部署。支持日期精度、重复到访、选定旅行分享和足迹卡片导出；卡片不是数据库与照片备份。

## 已有网站升级：保留数据与原口令

1. **入口与准备：** 使用原 GitHub 仓库、Vercel 项目和 Supabase 项目，先按[维护指南](maintenance.md)备份数据库与 Storage 照片；两者都要备份。
2. **操作：** 对照你实际执行过的迁移与当前迁移文件，只补缺失版本。不要运行面向新装的整份合并 SQL、重复 `/edit` 初始化或重置生产库；不确定历史时先核查，不能按文件存在与否推断已经执行。
3. **填写与执行：** 已执行 `0001`～`0004` 的站点仅补 `0005_private_photo_bucket.sql`。若它报告 bucket 为 public，先核实公开范围并将该 bucket 调整为 private，再重试此段，不要删除照片或新建替代 bucket。
4. **旧地图绑定：** 缺少 `0003` 时按依赖顺序补齐；恰有一张旧地图会自动沿用，旅行、照片、原口令保留。多张旧地图必须由站主确认绑定对象，按维护指南操作，不能任意挑一张公开或重新初始化绕过。
5. **验证再发布：** 在独立 Supabase 测试项目的隔离 Preview 验证升级；确认后对生产补缺失迁移、发布代码。保留原生产变量；已初始化站点不需重新添加 `ATLAS_SETUP_KEY`。
6. **成功标志：** Production `/edit` 可用原口令进入，旧旅行、照片和地图设置仍在，新记录能保存。历史照片不会被本次更新自动重写；出现问题先按维护指南评估备份恢复，不盲目删表。

## 排错：先定位入口，再做可验证的处理

平台的菜单与报错文字可能变化；以下入口描述用于定位功能，并不承诺标签永远一致。只在自己的账户检查，向他人求助时隐藏密钥、口令、照片和个人数据。

| 问题 | 检查入口 | 处理与验证 |
| --- | --- | --- |
| Vercel 找不到自己的仓库 | Vercel 的 Git 导入列表、GitHub 集成权限 | 授权对应账户与仓库，刷新列表；确认导入的是自己的仓库，不再建第二份 |
| 构建找不到 `package.json` 或 Node 版本不符 | 该次 Build Logs、项目构建设置 | Root Directory 指向含 `package.json` 的目录，Node ≥22.13，选受支持的 22.x/24.x 后重部署 |
| SQL 出错或缺表、缺函数 | 目标 Supabase SQL Editor 结果与迁移执行记录 | 核对项目、复制完整 SQL，按顺序定位失败段；先处理错误再继续，不重置库 |
| 首页或 `/edit` 数据请求失败 | Vercel 该次运行日志、变量环境；Supabase Data API | URL 与密钥需来自同项目，Data API 开启并含 `public`；确认迁移含 `0004`，修正后重部署，不向匿名角色授权 |
| Secret Key 无效或权限不足 | Supabase API Keys、Vercel `SUPABASE_SECRET_KEY` | 使用 `sb_secret_`，legacy `service_role` 仅兼容；排除 anon/publishable、复制空格与错环境，更新后重部署 |
| `/edit` 提示先添加初始化密钥 | Vercel 当前环境变量与最新部署 | 仅对确认未设图的新站添加至少 12 字符的 `ATLAS_SETUP_KEY` 并重部署；已有站先核对库和地图绑定 |
| 初始化密钥错误或两次口令不一致 | `/edit` 表单、当前部署所用变量 | 使用该环境对应的初始化密钥，编辑口令另设并确认一致；勿把数据库/API 密钥当口令 |
| 提示地图已存在、仍出现首次设置或旧图未绑定 | 当前部署 URL、对应 Supabase 的 `spaces`/`site_map` | 先确认项目与环境；已有地图走升级绑定流程，不删表或重复初始化；多地图按维护指南人工确认 |
| `travel-photos` 迁移中止或照片不能显示 | SQL 结果、Supabase Storage、网站运行日志 | 同名公开 bucket 需核实后改 private；确认 `0005` 成功及照片已关联保存的旅行，通过网站查看，勿开放 bucket |
| 上传照片被拒绝 | `/edit` 提示、文件属性与运行日志 | 用 JPG/PNG/WebP；网页先压缩原图，服务端接收上限为单张 4 MiB 和 40MP。按页面提示换较小文件，核对编辑登录、私有 bucket 和服务端配置 |
| 改了变量但行为没有变 | Vercel Deployments、变量作用环境、访问域名 | 对正确环境重新部署，确认访问新部署/正式域名；生产与测试变量不能交叉使用 |
| 删除初始化变量后无法编辑 | 新部署日志、`/edit`、保留的两个 Supabase 变量 | 用原编辑口令而非初始化密钥；核对数据库指向与服务端密钥，口令遗失走维护指南，不重建生产地图 |

## 上线验收清单

以下记录、照片和分享测试先在隔离 Preview 完成；正式站只使用愿意公开的内容复核，测试完成可在编辑界面移除测试记录。

- [ ] GitHub、Supabase、Vercel 都归自己管理；Vercel 导入正确仓库，Root Directory 和 Node 版本正确。
- [ ] 五段迁移均有成功记录；Data API 启用并含 `public`，应用表未向 `anon` / `authenticated` 放权。
- [ ] `travel-photos` 存在且为 private；网站能显示已保存旅行的关联照片，不依赖存储公共链接。
- [ ] Production 使用生产库，Preview 使用独立测试库；变量不含 `NEXT_PUBLIC_`，未出现在仓库和公开截图中。
- [ ] `/edit` 已创建唯一地图；删除 `ATLAS_SETUP_KEY` 后新部署成功，原编辑口令在无痕窗口可登录。
- [ ] 退出编辑后首页可浏览所有已保存旅行与关联照片，不能直接修改；已接受称呼、日期、故事等公开范围。
- [ ] 保存一条旅行并刷新仍在，照片关联正常；重复到访、日期精度、选定旅行分享和卡片导出按需验证。
- [ ] 伴侣可用同一个 `/edit` 地址和单独传递的编辑口令登录；没有把口令写进链接。
- [ ] 已制定数据库和 Storage 照片备份方式，知道卡片不等于备份，并查看平台额度与费用提醒。

## 官方入口参考

控制台步骤依官方公开文档核对；实际入口随账户权限、界面版本变化，以功能含义与项目身份为准。

- [GitHub：从模板创建仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template)
- [Supabase：密钥类型与查找位置](https://supabase.com/docs/guides/getting-started/api-keys)
- [Vercel：构建与 Root Directory](https://vercel.com/docs/builds/configure-a-build)、[支持的 Node.js 版本](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel：环境变量管理及变更后重新部署](https://vercel.com/docs/environment-variables/managing-environment-variables)
