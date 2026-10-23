# 地图数据与可复现生成

## 分发范围

地图作为静态 JSON 随源码提供，日常安装和 Vercel 构建不会访问地图上游服务，也不需要地图 API Key。旅行记录和照片仍由各自的 Supabase 保存，不会写进这些底图文件。

[Git 属性](../.gitattributes)将文本固定为 LF，避免 Windows 检出或 Git 源码 ZIP 导出改变换行而使文件哈希失效。

当前包括 239 个国家或地区、34 个省级地区和 7,303 个城市目录条目。替换前的 239 / 34 / 7,295 个目录编号已逐一对比，全部保留，旅行的地点编号、照片 key 和数据库内容不改写。

主要省市几何来自 HDX 经 geoBoundaries 发布的 2020 年参考数据；文昌补充使用 gbOpen 的 2017 年县界。行政名称和编码独立取自固定版本的 Administrative-divisions-of-China。城市定位点由多边形内部标签点算法生成，因此可能与旧底图的政府驻地点不同；已保存旅行仍使用其原始记录坐标。

11 个较新城市缺少经核实的边界，采用有明确来源说明的近似城市标记，列于 [数据清单](../public/data/sources.json) 的 `markerOnly`。它们仍可搜索、记录和在地图上显示足迹；选择这些城市时页面明确提示不含边界。不要将近似城市标记当作精确地址或行政区轮廓。

## 来源和许可证

[输入清单](../scripts/map-sources.json) 固定每个下载 URL、版本和 SHA-256，避免上游更新静默改变内容。原始许可和项目整理后的署名要求见 [第三方来源](../THIRD_PARTY.md)。geoBoundaries 的官方 [ADM1 元信息](https://www.geoboundaries.org/api/current/gbHumanitarian/CHN/ADM1/) 和 [ADM2 元信息](https://www.geoboundaries.org/api/current/gbHumanitarian/CHN/ADM2/) 明确记录 CC BY 3.0 IGO，项目衍生整理另保留 CC BY 4.0；下载实际固定到 `9469f09` 版本。

代码 MIT 许可不会覆盖地图的许可。分发经过修改的地图文件时，保留来源、许可证链接及修改说明；网页与导出卡片已包含对应署名，不应删除。

## 重新生成

```powershell
npm ci
npm run maps:build
npm run check:public -- --release
```

首次会下载约几十 MB 的公开输入，缓存于 Git 忽略的 `.cache/maps`。每个输入先检查 SHA-256，再解析和转换；网络失败、输入变化、无法唯一匹配的地名或缺少地点坐标都会报错，不能通过静默跳过来生成不完整目录。

如要先生成到独立目录供比较：

```powershell
$env:ATLAS_MAP_OUTPUT = "$env:TEMP\travel-map-maps"
npm run maps:build
Remove-Item Env:ATLAS_MAP_OUTPUT
```

还可通过 `ATLAS_MAP_CACHE` 指定已有输入缓存目录。Windows 与其他系统使用同一 Node 脚本。跨机器先核对输入清单、Node 和锁文件版本，确认输出哈希一致后才替换正式数据。

## 更新数据源

1. 确认新来源允许所需的修改与再分发，记录发布者、原始许可、固定版本和输入哈希。
2. 更新输入清单及明确地名别名；国际城市继续保留 Natural Earth ID，国内继续使用既有行政代码。
3. 在独立输出目录生成，比较旧编号的完整覆盖、重复编号、父省关联、几何有效性和城市中心。
4. 确认变更后更新公开静态文件、校验清单、署名及修改说明，运行测试和发布检查。

来源清单与实际文件校验用于发现误改或混入旧文件，不是自动证明一份新数据具有授权。不要仅修改哈希或删除许可说明来绕过来源复核。
