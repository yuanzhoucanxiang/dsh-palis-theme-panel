# @dsh-local/palis-theme-panel

PALIS 档案终端主题面板 —— 为 DeepSeek Harness Web GUI 做的可开关深度换肤（ui-panel 形态插件）。

## 形态

- **host 半侧**（`src/index.ts`）：注册 `palis-theme` 设置命名空间 + fenced API（`/palis-theme/api`，回环 Host 校验、revision 守卫）+ **首帧注入**（主题开启时把 PALIS_CSS 与 boot 脚本写进 index.html——从第一帧就是 PALIS，零闪烁）。
- **client 半侧**（`src/client/index.ts`）：`settings.section` 面板（**React 函数组件**，`slots.register(options, Component)` 契约）+ 右下角浮动快捷开关 + 开机自检动画 + 实时调参。

## 功能

- **总开关 POWER**：一键接入/断开（写入持久化设置，刷新/重启后保持）。
- **CRT 强度**：LOW / MID / HIGH（扫描线、噪点、暗角三层的透明度档位）。
- **渲染层**：扫描线（4px 周期细线 + 11s CRT 慢速扫描带）/ 噪点 / 暗角 / 辉光 独立开关。
- **风格层**：等宽字体 / 直角 / 角色标签（[CLERK] [TOOL] [USER]…）/ 开机自检 / **背景图形** 独立开关。
- **背景图形**：右侧**数据天体**（canvas 正交投影自转引擎：暗色有机地形 + 等高线 + 半调网点，球面真旋转）+ **HUD 几何层**（虚线轨道环、刻度环、十字准线、代码读数 LAT/LON/SECTOR、表面粒子尘埃）+ 居中**环形轨道图** + 星尘背景（参考 PALIS 自检/总目录屏）。
- **自检日志**：每次写操作的提交/冲突记录（`rev` 版本号可见）。
- **浮动快捷开关**：右下角 PALIS 小方块，一键接入/断开。

## 深度改造的层次（全部不依赖编译 hash 类名）

1. **内核设计令牌**：覆盖 `--dsw-static-*` 色板与 78 个 `--dsw-alias-*` 别名（`html[data-palis-theme] body` 选择器，特异性高于官方 `body[data-ds-dark-theme]`）→ 黑白高反差 + 系统蓝 #2b5fd9 + 警示红 #c8322b。
2. **全局铬**：直角（`border-radius: 0 !important`）、等宽字体栈、方形滚动条、蓝底选区、单像素焦点框。
3. **CRT 三层**：噪点（SVG feTurbulence data-URI，`html::before`）+ 扫描线（repeating-linear-gradient，`html::after`）+ 暗角（radial-gradient，`body::after`），均 `pointer-events: none`，透明度由强度档位驱动。
4. **语义组件**：消息流角色标签（`[data-chat-flow-kind]`，兼容 `assistant-step`/`tool-call`/`user`/`steering`/`context`/`command`/`agent`/`assistant`）、输入区（终端风 caret/边框/占位符）、辉光标题。
5. **开机自检覆盖层**：`PALIS 09A · 正在接入 PALIS 管理系统` + 打字机自检行（INDEX BUS SELF-TEST …），约 2.5s 淡出。

## 首帧协议（零闪烁）

- host `webserver/index-inject`：`{ kind: 'style', text: PALIS_CSS }` + `{ kind: 'script', placement: 'body', text: bootScriptOf(settings) }`（仅当 `enabled`）。
- boot 脚本把设置写入 `<html>` 门禁属性（`data-palis-theme` / `data-palis-intensity` / `data-palis-*`），CSS 全靠这些属性门控。
- client 持有同一份 PALIS_CSS（`src/theme-core.ts` 单一来源，host 与 client 共用），负责实时开关/调参；409 冲突自动回读服务器状态。

## 构建 / 装配

```bash
# 构建（host tsc + client tsdown，自包含，不依赖 npm）
bash scripts/build.sh          # 或 dev_build_plugin（需 npm 在 PATH 才走 npm pack）

# 运行时注入（免重启）
dev_inject_plugin {"dir": "E:/Deepseek harness/dsh-palis-theme-panel"}

# 持久化装配（重启后由 bundles 接管）
dev_install_package {"dir": "E:/Deepseek harness/dsh-palis-theme-panel"}
```

构建依赖 junction：`cordis` / `cosmokit` / `schemastery` ← `$HOME/dsh-harness/vendor/`，`@deepseek-ai/dsh-settings` ← DSH 桌面版 runtime node_modules，`tsdown` ← `~/.dsh/plugins/dsh-super-injector/node_modules`。

## 注意

- 本内核（2026-08）的 slots 契约是 **`register(options, ReactComponent)`**——纯 DOM `{ render() {} }` 写法已失效（`settings.section` 会抛 React error #130；super-injector 旧面板即此问题，需要单独升级）。
- 设置命名空间为 `palis-theme`（`~/.dsh/settings.yaml` 持久化）；旧版 `palis-theme`（profiles/node_modules/@dsh-local/palis-theme）已存根停用。
