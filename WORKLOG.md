# 工作日志

`@dsh-local/palis-theme-panel` — PALIS 档案终端主题面板（DeepSeek Harness 桌面版插件）

> 构建 → 注入 → 视觉验证 → 迭代的全过程记录（2026-08-21）。

## 0. 背景

用户以 PALIS 复古科幻档案终端美学（参考图：自检屏/总目录屏）为原型，
为 DeepSeek Harness Desktop（内嵌 webserver，GUI: `http://127.0.0.1:1524`）
做一套 ui-panel 形态、可开关的深度换肤插件。

## 1. 调研（生产前了解生态）

| 事项 | 结论 |
|---|---|
| 主题机制 | 官方 `dsh-client-ui-theme` 用 `--dsw-alias-*` 令牌（78 个别名 + 静态色板），`body[data-ds-dark-theme]` 双主题覆盖；第三方可通过更高特异性选择器覆盖 |
| slot 契约 | **本内核（2026-08）是 `slots.register(options, ReactComponent)`**——纯 DOM `{ render(){} }` 旧写法已失效（React error #130；连 super-injector 自己的插件管理页都是坏的） |
| 首帧注入 | `webserver/index-inject` 支持 `{kind:'style'}`（head）+ `{kind:'script', placement:'body'}` 行——零闪烁前提 |
| 设置持久化 | `@deepseek-ai/dsh-settings`：`register(ns, schema)` + `describe().revision` + `update(ns, patch, expectedRevision)`（冲突 `SettingsConflictError`） |
| client bundle | `package.json` 声明 `dsh.client` + `exports["./client"]`，client-modules 自动挂 `/plugins/<id>/client.js?rev=` |

## 2. v0.0.1 骨架（dev_scaffold_plugin，ui-panel 形态）

- 结构：`src/index.ts`（host, tsc）+ `src/theme-core.ts`（共享 CSS/常量）+ `src/client/index.ts`（tsdown → `lib/client.js`，ModuleLoader 包装）
- 构建：`scripts/build.sh`（junction 链接 cordis/schemastery 自 `$HOME/dsh-harness/vendor/`，dsh-settings 自桌面版 runtime node_modules，tsdown 自 super-injector node_modules；**自包含，不依赖 npm**——本机 npm 不在 PATH，`dev_build_plugin` 的 npm pack 步骤用 tar 替代）
- 首次注入即发现：面板挂载空白 → 定位 slot RNA 契约（上述 ♯1）

## 3. v0.1.0 功能主线

### 3.1 host（`src/index.ts`）
- 设置命名空间 `palis-theme`：enabled / intensity / scanlines / noise / vignette / glow / monospace / square / labels / boot / artwork
- fenced API `GET|POST /palis-theme/api`（回环 Host 校验、revision 守卫、409 冲突）
- `webserver/index-inject`：主题开启时注入 `PALIS_CSS` + boot 脚本（首帧无闪烁）

### 3.2 client（`src/client/index.ts`）
- `settings.section` 面板「PALIS 主题」：Win95 式控制台（POWER 总开关、CRT 强度 LOW/MID/HIGH、FX 层开关、STYLE 层开关、自检日志）
- 右下角浮动快捷开关（PALIS 竖排小方块，一键接入/断开）
- 开机自检动画（typewriter：INDEX BUS SELF-TEST / IDENTITY_CHAIN / ARCHIVE DIRECTORY，~2.5s）
- 409 冲突自动回读服务器状态

### 3.3 深度换肤层次（全部不依赖编译 hash 类名）
1. **令牌层**：78 个 `--dsw-alias-*` + 全套静态色板 → 黑白高反差 + 系统蓝 `#2b5fd9` + 警示红 `#c8322b`
2. **全局铬**：直角、等宽字体栈、方形滚动条、蓝底选区、单像素焦点
3. **CRT 质感**：feTurbulence 噪点 / 4px 周期扫描线 + 11s 慢速刷新带 / 暗角 / 屏幕内沿边框罩
4. **语义组件**：消息流 `[CLERK]`/`[TOOL]` 标签（`data-chat-flow-kind`）、终端风输入区（`-webkit-text-fill-color` 修复）、Win95 式会话标题条（`conversation.hero.agentPreset`）、淡蓝/灰消息轨道
5. **背景图形**：数据天体 + 环形轨道图 + 星尘（见 §4）+ 点阵网格

## 4. 背景图形迭代（用户视觉反馈驱动，共 6 轮）

| 轮 | 用户反馈 | 处置 |
|---|---|---|
| 4.1 | "和参考图那种背景图形结合" | 初始：纯 CSS 暗色星球（渐变+大理石纹）+ 轨道环（内联 SVG），贴 `[data-chat-flow]` |
| 4.2 | （续） | 欢迎屏 hero 态加轨道图（发现 `data-phase="hero"` 无 `data-chat-flow`，改贴 `[data-conversation-scroll]`） |
| 4.3 | "星球换成带地形纹理的地球，甚至3D" | 换等距投影地球贴图（手绘大陆多边形 + 云层）；先做贴图横移假自转 |
| 4.4 | "我说的是半个圆的地球在自转，不是贴图在动" | 改 CSS 3D 圆柱球面（32 面片 rotateY+translateZ）——**被否：放大后圆柱感明显** |
| 4.5 | "是这种球体"（参考图巨型半圆） | 放大 900px 只露左弧 + 高对比地形 + 半调网点 |
| 4.6 | "太亮、灰色方块像足球" | 网纹 7px→4px、渲染分辨率提到 640、地形降对比——**被否：手绘多边形像足球皮** |
| 4.7 | "还是像足球" | 弃手绘大陆 → **canvas 正交投影引擎**：逐像素 `lat=asin(y/R)、lon=asin(x/(R·cos lat))` 采样湍流有机地形（阈值化纹理软边），真·球面自转 |
| 4.8 | "再暗一点 + 粒子/代码块/等高线/几何线" | 渲染 ×0.7 压暗；等高线（位移波纹线）入贴图；HUD 层（轨道环/刻度环/十字准线/代码读数）+ 表面粒子尘埃 + 星尘背景 |
| 4.9 | "放射线太丑" | 删刻度环（repeating-conic 放射刻度）、虚线环改细实线 |

**关键教训**：
- 手绘几何（多边形大陆）在放大后必然露馅；**湍流纹理 + 软边**才耐看
- 大球"自转"的错觉：贴图横移 = 圆柱感；**正交投影**才是球（有透视压缩/极区收敛）
- CSS 3D 圆柱面片在大尺寸下棱面感无法被遮蔽盖住，最终方案是 canvas 逐像素投影
- `background-attachment: fixed` 会被滚动容器内部定位搅乱，天体改挂不滚动的根容器 `[data-phase]`

## 5. 验证体系

- 自研 CDP 驱动脚本（headless Chrome + Node 内置 WebSocket，零依赖）：
  - 导航/点击/截图/`Runtime.evaluate` 探针（`verify-palis-*.mjs` 系列，验证输出在 `verify-out/`）
  - 自转验证：t0/t10 相隔 10s 双截图对比大陆位移
  - 面板流程：设置 → PALIS 主题 → POWER 开/关 → 确认令牌属性与样式标签增删
- 首帧验证：GET `/` 检查 `<style>`（PALIS_CSS）与 boot 脚本行存在
- API 验证：GET/POST revision 递增、409 冲突回读
- 输入框文字验证：`Input.insertText` + computed style（`-webkit-text-fill-color`）

## 6. 安装/退役

- 运行时注入：`dev_inject_plugin`；持久化：`dev_install_package`（profile dependencies + bundles 双路径）
- 旧版 `palis-theme`（两处副本：`resources/plugin/` 与 `profiles/node_modules/@dsh-local/`）已存根为 no-op，防双主题竞争
- 遗留观察：super-injector 的"插件管理"设置页受本内核 slots 契约变更影响已失效（React error #130），需要按 `register(options, Component)` 升级——与本品无关，单独跟进
