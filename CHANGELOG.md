# 更新日志

## 0.1.0 — 2026-08-21

首个正式版本：PALIS 档案终端深度换肤（可开关主题面板）。

**新增**
- 设置面板「PALIS 主题」（`settings.section`，React 契约）：POWER 总开关、CRT 强度（LOW/MID/HIGH）、FX 层（扫描线/噪点/暗角/辉光）、STYLE 层（等宽/直角/角色标签/开机自检/背景图形）、自检日志（revision 可见）
- 右下角浮动快捷开关（一键接入/断开）
- 深度换肤：内核设计令牌全覆盖（78 别名 + 静态色板 → 黑白 + 蓝 #2b5fd9 + 红 #c8322b）、直角、等宽字体、方形滚动条、蓝底选区
- CRT 质感：feTurbulence 噪点、4px 周期扫描线 + 11s 慢速刷新带、暗角、屏幕边框罩
- 语义组件：消息流 `[CLERK]` / `[TOOL]` 标签、终端风输入区、Win95 式会话标题条、淡蓝/灰消息轨道
- 背景图形：**数据天体**（canvas 正交投影自转引擎 + 有机地形 + 等高线 + 半调网点 + 表面粒子）+ HUD 几何层（细实线轨道环/十字准线/代码读数）+ 环形轨道图 + 星尘
- 开机自检动画（PALIS 09A · 正在接入 PALIS 管理系统，typewriter 自检行）
- 首帧零闪烁：`webserver/index-inject` 注入 `PALIS_CSS` + boot 脚本（主题开启时）
- 持久化：`palis-theme` 设置命名空间（settings.yaml），409 冲突自动回读

**修复**
- 输入框文字不可见：内核用渐变文字（`-webkit-text-fill-color: transparent`），补 `-webkit-text-fill-color` 覆盖
- settings.section 挂载失败：按本内核 slots 契约改 `register(options, ReactComponent)`
- 天体自转实现三易其稿：贴图横移（圆柱感）→ CSS 3D 面片（放大露棱）→ canvas 正交投影（最终）

**依赖**
- host：cordis ≥4-rc、schemastery ^3.18、@deepseek-ai/dsh-settings（运行时来自桌面版 runtime）
- client：react（shell 提供）、@deepseek-ai/dsh-client-ui-slots

## 0.0.1 — 2026-08-21

- dev_scaffold_plugin 生成 ui-panel 形态骨架（host tsc + client tsdown，自包含 build.sh，不依赖 npm）
