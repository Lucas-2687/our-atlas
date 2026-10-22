# 第三方来源与授权

根目录 MIT 许可适用于本项目自有代码、文档及自制 SVG 插画，不会替换依赖和第三方数据的原有许可。

| 内容 | 来源 | 授权与处理 |
| --- | --- | --- |
| Leaflet JS/CSS | [Leaflet](https://leafletjs.com/)，当前内置版本以文件头为准 | BSD-2-Clause；保留 [原许可](public/vendor/leaflet.LICENSE) |
| 世界边界与国际城市目录 | [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/)，[原始数据](https://github.com/nvkelso/natural-earth-vector) | 官方明确为公有领域，可修改、再分发；本项目进行了取字段、坐标简化和目录转换 |
| 中国省市边界 | [HDX China administrative boundaries](https://data.humdata.org/dataset/cod-ab-chn)，经 [geoBoundaries](https://www.geoboundaries.org/) 发布的固定版本 | 原始数据 CC BY 3.0 IGO；geoBoundaries 衍生整理遵守 CC BY 4.0。保留署名、许可链接和修改说明 |
| 文昌补充边界 | geoBoundaries gbOpen，中国 ADM2；来源 National Administration of Surveying, Mapping and Geoinformation of China / Revolutionary GIS | 原始 PDDL-1.0；整理版 CC BY 4.0 |
| 行政代码和中文名称 | [Administrative-divisions-of-China](https://github.com/modood/Administrative-divisions-of-China) 固定版本 | WTFPL；按名称和代码独立映射，不采用旧供应商的地理几何 |
| 示例旅行与插画 | [lib/demo.ts](lib/demo.ts)、[public/demo](public/demo) | 虚构文字与项目自制 SVG，采用 MIT；原来源未核实的三张 JPEG 已替换 |
| 文档图示与界面截图 | [docs/images](docs/images)，本地实际界面配合虚构数据与自制插画 | 自制流程与配置 SVG 采用 MIT；含底图的截图保留 Natural Earth、HDX/geoBoundaries 与相关许可署名，不把第三方底图改称 MIT |
| npm 依赖 | [package.json](package.json)、[package-lock.json](package-lock.json) | 分别遵守各包自带的 LICENSE；不随源码提交 `node_modules` |

## 地图改动与许可范围

旧 DataV 几何与其混合衍生文件已全部重新生成替换。世界图中的中国几何使用 HDX/geoBoundaries 省级图，因此不能把整个 `world.json` 简称为 Natural Earth 公有领域。地图数据与自有 MIT 代码分别授权。

转换包括坐标取整、行政名称及代码映射、原莱芜边界合并至济南、文昌边界补充，以及少数城市的明确标记。HDX 记录的数据年份为 2020，补充县界来源记录为 2017，均为示意底图。11 个缺少经核实边界的较新城市保留公开地理事实构成的近似城市标记，不杜撰行政边界。已有旅行数据和坐标不受这些底图转换影响。

[固定输入版本与 SHA-256](scripts/map-sources.json)、[实际分发文件校验清单](public/data/sources.json) 和 [可复现转换说明](docs/map-data.md) 随源码分发。网页底图及足迹导出图片保留来源署名；不暗示 HDX、联合国或 geoBoundaries 对本项目的认可。

许可文本：[CC BY 3.0 IGO](https://creativecommons.org/licenses/by/3.0/igo/legalcode)、[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode)、[PDDL 1.0](https://opendatacommons.org/licenses/pddl/1-0/)。

公开前运行 `npm run check:public -- --release`。检查会验证敏感文件模式、来源清单及所有实际地图文件的哈希；更换数据源时仍需人工复核该来源及许可，不能仅改校验值来替代授权审查。
