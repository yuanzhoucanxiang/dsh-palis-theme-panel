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

## 7. v0.1.1 声线波动条（2026-08-22）

用户指认输入框顶上的蓝线（本主题 v0.1.0 的「终端窗口化」设计：`[data-composer-card]` 的
`border-top: 2px solid var(--palis-accent)`）可以做成随 AI 思考/输出起伏的声线波动条。

- **状态信号调研**：静态扒内核 bundle 否定若干候选（hash 类名/aria 文案均不稳）后，
  锁定语义属性 `[data-streaming]`——assistant 消息根（AssistantMarkdown.root）在
  推理/输出全程置位（reasoning 块 `running: streaming && i === last` 同源），
  与官方 selector-check 门禁监控的是同一类稳定契约。活探（CDP 发 "hi" 逐 600ms 采样）
  证实：流式全程置位、结束即消失。
- **实现**（`src/client/index.ts`，与 3D 地球同一套 ensure/observer 纪律）：
  composer 顶边贴 `canvas.palis-wave`（顶边居中，±6.5px 振幅域），MutationObserver
  （childList+characterData+attributeFilter:data-streaming）兼顾信号扫描（120ms 节流 +
  700ms 软着陆保持）、输出突发计数（→ 0..1 boost 加成）与宿主重建重挂；
  rAF 仅在活动/过渡期间运转，静默清零后睡眠（静止基线交还 CSS 蓝边，零成本零差异）。
  `prefers-reduced-motion` 下整个引擎不动工。
- **坑**：canvas 是**替换元素**——绝对定位 `left+right` 双向拉伸对替换元素无效
  （固有尺寸 300×150 胜出，且 sizeWave 回写 `canvas.width` 形成正反馈，实测塌成 36px），
  CSS 必须显式 `width: calc(100% + 2px)` 盖过固有尺寸。
- **验证**：隔离实例（DSH_DESKTOP_USER_DATA 一次一目录）+ CDP 连拍——
  静默/结束后顶边直线与原观感逐像素一致；流式帧可见全宽起伏（思考段缓涌、
  token 突发段振幅拉大）。探针脚本：`verify-wave-probe*.mjs` / `verify-wave-live.mjs`，
  截图在 `verify-out/wave-v-*.png`。

## 8. v0.1.1 续：轨道图声纳扩散（2026-08-22）

用户以宇宙探索为灵感，要让背景环形轨道图的中心圆点发出声纳式扩散，呼应声线波动条。

- **靶心归属**：环形轨道图（ART_ORBIT）是 `[data-conversation-scroll]` 的 CSS 背景
  （`size:70% auto; position:50% 58%`，1000×1000 SVG），背景图无法做局部动效——
  正确逻辑 = 与 3D 地球同款的 client DOM 层（`.palis-sonar`：三环 `<i>` 错峰 scale 扩散 +
  中心 `<b>` 蓝点脉动），挂不滚动的根容器 `[data-phase]`（z-index:-1，透过滚动体透明背景
  可见，轨道线压其上形成纵深），**按背景定位公式反解圆心**：
  `cx = 50%·W`，`cy = (H − 0.7W)·0.58 + 0.35W`（滚动体 padding 框），ResizeObserver 跟随。
- **活动门复用**：波动条引擎本就在按 `[data-streaming]` 算 active——加一个门闩，
  翻转时同步 `html[data-palis-activity]`，声纳 CSS 分两档消费：静默 6.4s 慢 ping（--pk:.3），
  活动 2.3s 快 ping（--pk:.62 + 描边更亮 + 中心点脉动）。峰值透明度走 CSS 变量
  （`@keyframes` 里 `opacity: var(--pk)`，随元素解析），避免两套 keyframes。
- **层级坑**：`[data-conversation-scroll]` 自身 z-index:0 成独立层叠上下文，其背景会压在
  `[data-phase]` 的负 z 子节点之上——但轨道/星尘是透明 SVG，声纳环从下面透出来、
  轨道线压在上面，恰好是想要的纵深，无需改层。
- **验证**：隔离实例 CDP（`verify-sonar-live.mjs`）——圆心对位像素级吻合
  （实测 (700,475)/(700,507) == 公式复算值），活动门 on/off 随流式正确翻转
  （含 700ms 软着陆保持）；截图 `verify-out/sonar-*.png`：流式帧可见中心蓝点亮起 +
  扩散环中段形态，composer 波动条同帧共舞。

## 8a. v0.1.1 声纳迭代（2026-08-22，用户实机反馈后）

用户实机看后的反馈：不明显、环是方的、范围小、与静态轨道图割裂。四条全修：

- **方环根因**：直角模式的全局 `border-radius:0 !important`（`data-palis-square="on"] *`）
  把 ping 环切方——`.palis-sonar i/b` 按更高特异性豁免回 50%。
- **不明显/范围小**：ping 环 520→760px（越过最外轨道环）、峰值透明度 .3/.62→.45/.85、
  描边换亮蓝 rgba(79,128,245) + 26px 光晕。
- **割裂感（原来的元素也要动）**：① 中心蓝点静默也缓慢呼吸（3.4s alternate），
  活动转 1.1s 强脉动；② 新增 `.palis-sonar s` 同径旋转虚线环——mask 出虚线圆
  （颜色用 live 的 --palis-accent，避免 SVG 烤死色值），JS 按轨道蓝环渲染直径
  0.368·S 定径，盖在静态蓝环上 = 蓝环开始转动（静默 48s/活动 10s）。
- **排查插曲（虚惊）**：验证时 spin 环 getBoundingClientRect 报 305px 而内联 216px——
  旋转中的方形元素其 bounding rect 含 rotate() 变换（216×√2=305），元素本身尺寸
  一直是对的，窗口 resize 也正常跟随（RO 链路完好）。教训：测尺寸用 inline style
  或 offsetWidth，别信旋转元素的 bounding rect。
- 预览交付按新约定执行：可见隔离实例（%TEMP%\dsh-preview）直接拉起给用户看。
  插曲：TaskStop 杀旧实例后 3s 内重启撞上单实例锁残留，新实例静默退出——
  重拉预览实例要等旧内核 LISTEN 消失再起（netstat 确认 TIME_WAIT 也可）。

## 8b. v0.1.1 轨道旋转 + 行星公转（2026-08-22，用户实机反馈后）

用户反馈：中间的圆和旁边的圆圈也要适度旋转（不规律顺/逆时针交替），
背景环上的白点应像星环行星一样公转。直接改正确逻辑：

- **旋转的正确逻辑**：ART_ORBIT 的虚线环是 CSS 背景、角度动不了——不修补背景，
  在声纳层叠 5 个与各环**同径**的 mask 虚线环（`<s>`：蓝 r=184 + 灰 r=348/264/96/30），
  盖在静态环上 = 原环转了起来。角度 JS 逐帧积分：
  `ω = speed·(sin(f1·t+p1) + 0.6·sin(f2·t+p2) + 0.3)`——双频正弦叠加，符号自然翻转，
  即不规律顺/逆时针交替；大环慢小环快，各环频率/相位错开互不共振。
- **定径精解**：上一版蓝环按 0.368·S（=r/1000）定径，漏算 mask 圆半径只占元素边长
  47%，环偏小 6% 与静态环错开——正确边长 = S·r/470，本轮全部按此折算
  （蓝 .3915 / g3 .7404 / g2 .5617 / g1 .2043 / g0 .0638），虚线节奏也按各环
  SVG dasharray 折算 mask dash 数（g2≈111 段、g3≈273 段），对齐时与静态环无缝。
- **行星公转**：ART_ORBIT 的 8 个节点白点从 SVG 抠掉（不删会和新行星重影），
  由 `<u>` DOM 点接替：正交 4 颗巡 r=430、对角 4 颗巡 r=294（原角位作初相，
  构图不变），开普勒式内快外慢（ω ∝ r^-1.5），另加 1 颗 accent 卫星巡蓝环 r=184。
  静默 4 分钟/圈持续慢转——波动条引擎静默即休眠，故行星/转环用**独立 rAF**
  （orbitFrame）驱动；活动门经 orbitHeat 快起慢落（0.05/0.015 双系数）把角速度
  ×(1+3·heat)，呼应声纳与波动条。
- **CSS 分工**：`.palis-sonar s/u` 只背基态样式（定位/颜色/透明度/过渡），transform
  全由 JS 每帧覆写；旧的 palis-sonar-spin keyframes 删除。行星点 `u` 加入直角模式
  border-radius:50% 豁免（全局 !important 会切方）。
- **坑**：TaskStop 只杀 npm 包装进程，electron 子树残留占着单实例锁，新实例静默退出
  （kernel.log 无新行即信号）——换载预览要 taskkill //T 整棵树（注意别碰用户正式版
  的 DeepSeek Harness Desktop 进程，按命令行路径区分）。
- **验证**：`verify-orbit.mjs`（CDP 无头）——5 环 9 行星齐全、环径/轨道半径像素级吻合、
  两采样点间环转角与行星坐标均在变、背景静态白点已抠、静默活动门 off。
  教训同 8a：旋转元素的 bounding rect 含 rotate() 变换，量尺寸要用内联 style。

## 8c. v0.1.1 数据天体卫星呼应（2026-08-22，用户实机反馈后）

用户反馈：右侧靠近球的部分没有动效，要动起来并与球呼应。

- **呼应设计**：不是给球旁边随便加点动的，而是让运动在物理上属于这个球——
  一颗 accent 卫星沿贴 r1 HUD 环半径（514px）的倾斜轨道公转：周期取球自转的 1/5
  （静默 20s/圈），方向与球面漂移一致（正交投影前半球纹理右→左，卫星前半球同样
  右→左）；轨道面 240s 缓慢进动（屏幕平面 rotate + scaleY(0.45) 倾角）。
- **真 3D 遮挡**：后半程（轨道面局部 sinθ<0）且屏幕位置落进球盘半径 450 内 →
  卫星被球遮蔽淡出至 0；盘外后半程仅压暗 .3；前半程 .95 全亮并 scale +22%（近大远小）。
  透明度走帧率无关的 dt 平滑（dt·9），无 CSS transition 打架。
- **活动门进引擎**：球自转原本恒定 100s/圈、不参与活动门——本轮把 globe 引擎 loop
  接上 waveActive（自己的 globeHeat 快起慢落），boost ×(1+2·heat) 同时作用于
  球自转、卫星公转、进动：AI 工作时整个天体系统一起加速，与声纳/行星同节奏。
- **顺带抓出的旧缺陷**：探针实测预览环境 square=on 且 `.palis-globe-sphere`
  border-radius 被全局 !important 切成 0——球形容器一直是方盒（边界/内阴影走方形），
  只是大部分出屏不易察觉。HUD 环 r1/r2 同样被切。按声纳环同例豁免复圆
  （具象图形 ≠ UI 铬件）。
- **减免动态**：卫星层不挂载（球体自转保留，与 0.1.0 行为一致）。
- **实现位置**：buildGlobe 加 `palis-globe-orbit`（mask 虚线圆，inset:30 盒 1040，
  r=49.42% 展开恰 514px）+ `palis-globe-sat`；startGlobeEngine 加签 (canvas, sat, orbit)，
  同一 rAF 驱动，无额外循环。卫星轨道几何全部屏幕坐标常量（globe 层是固定 1100px，
  不随视口缩放），无需 layout 反解。
- **验证**：`verify-globe-sat.mjs`（CDP 无头，26s 全程跟踪）——卫星位移、遮挡周期
  （透明度 0.00↔0.95，盘外后半程 0.3 档清晰）、进动角在变、方形模式下卫星/球体均为
  50% 圆。截图 `verify-out/globe-sat.png`。

## 8d. v0.1.1 视觉平衡：压暗静态中心 + 提亮全部动效（2026-08-22，用户实机反馈后）

用户反馈：中间部分压暗一点（抢内容视线），声纳和别的动效更明显一点。
纯数值调平，无结构改动：

- **压暗静态中心**（ART_ORBIT 中心三件套）：r=96 圆盘 fill .04→.018 /
  stroke .16→.10，r=30 中心环 stroke .42→.30，中心点 fill .45→.34；
  蓝环描边 .34→.30（微压，保留轨道存在感）。原则：静态背景退后，让位于内容。
- **提亮全部动效**（PALIS_CSS/引擎参数）：ping 峰值 --pk .45→.58（活动 .85→.95）、
  描边 .6→.7、光晕 26px/.22→30px/.3；中心蓝点静默 .3→.5（活动 .95）；
  五档旋转环静默档 .26~.45→.38~.6、活动档 .42~.85→.58~.95；
  行星 5px→6px、静默 .75→.92、光晕 6px→8px；卫星轨道环 .4→.52（活动 .78）、
  卫星前半程亮度 .95→1、盘外后半程 .3→.35。
- **验证**：verify-orbit.mjs 结构项全过（五环九行星/半径/旋转/公转）；
  截图核对观感——静态环退居幕后、行星与蓝环卫星更醒目。

## 8e. v0.1.1 细节打磨：六环补齐 / ping 超宽屏 / 轨道环遮挡 / live 读数（2026-08-22）

用户让继续打磨细节，本轮四项：

- **六环补齐**：最外圈 r=430 之前没有旋转覆盖环（别的圈都转它不转）——补 g4
  （ratio .9149，mask 按 dash '2 11' 折算 208 段、厚度 .164），整套六环全部不规则交替转。
- **ping 超宽屏定径**：760px 硬编码在超宽屏会小于最外轨道环（r=430 → 0.86·S）——
  改 JS 定径 max(760, 1.1·S)，layoutSonar 统一写 width/height/margin。
- **轨道环遮挡一致**：卫星轨道环原来在 geo 层（球体之上），后弧会画在球脸上而卫星
  却消失了——轨道环移到球体之下（DOM 层序），掠过球盘的弧段被球遮蔽；
  卫星保留在上层，前半程从球脸前掠过。几何不变（geo 非定位元素，inset 都相对根层）。
- **live 代码读数**：原 ::before/::after 死文字换成 globe 引擎 500ms 覆写的 <pre>：
  LON = 球面中央经线（由自转 angle 反解，真数据），SIGNAL 随机游走 24ms↔活动 9ms，
  TRACK 10 OBJECTS = 9 行星+1 卫星真实数量，INDEX 末位 hex 每拍跳动。
  外观样式 1:1 沿用原伪元素规则。
- **startGlobeEngine 签名改对象参**（fx: {sat, orbit, ro1, ro2}），不再叠位置参数。
- **坑**：tsconfig 目标下 NodeListOf 不可 for..of 迭代（TS2488）——按项目惯例用
  forEach。探针预期同步更新（verify-orbit 六环 + ping 定径，verify-globe-sat
  读数跳动 + 层序断言）。

## 8f. v0.1.1 球面质感重写（2026-08-22，用户实机反馈后）

用户反馈：球的质感继续打磨。实机图问题诊断：表面块状锯齿（最近邻采样 +
阶梯化湍流叠加）、光照平（引擎无光照，只靠静态 CSS 遮光）、临边硬切。

- **双线性采样**：渲染循环改 4-tap bilinear，x 向 `(x0+1) & 1023` 位与无缝环绕；
  贴图本就全灰度（saturate 0 + 白线），只取 R 通道，4 tap 而非 12 tap。
- **逐像素方向光照**：预计算法线 (nx, ny, nz=√(1-nx²-ny²))，固定光源屏幕左上前方
  L=(-.55,-.45,.7)——太阳不随球转；light = 0.2 + 0.72·max(0, N·L)，昼 .92/夜 .2，
  昼夜分明。可见左弧恰在昼侧。
- **临边大气辉光 + 柔和临边**：rim=(1-nz)³ 偏蓝 (26,48,110)；alpha 按 nz/0.18
  渐隐（~6px 过渡带），替代硬切边。
- **零运行时三角**：光照/辉光/alpha 全在初始化预计算成数组，渲染循环只有乘加。
- **CSS 遮光层减负**：原 4 层渐变含 rgba(0,0,0,.93) 重径向（与引擎光照双重压暗）——
  删至轻垂直渐变 + 顶部微光；球体 inset 阴影 .6→.35（不再压灭临边辉光）。
- **验证**：`verify-globe-texture.mjs`（CDP 直接读 canvas 像素）——昼侧亮度 163 vs
  夜侧 40（4× 对比）、临边蓝色偏置 +34、临边 alpha 137/中心 255（柔边生效）；
  截图 `verify-out/globe-texture.png` 目视：球体有明暗体积感，块状感消失。

## 8g. v0.1.1 质感重心调整：从光照到构成元素（2026-08-22，用户实机反馈后）

用户反馈：没必要加强光照，要的是表面粒子、等高线、几何元素这些构成元素的质感。
方向修正——数据天体的美在线条与网点（印刷/测绘风），不在 3D 渲染感：

- **光照降回暗示**：light 0.2+0.72·diff → 0.76+0.16·diff（实测昼夜对比 4× → 1.13×），
  临边辉光 ×0.6（只剩勾边）。双线性采样与柔和临边保留（锯齿消除与柔边不是"光照"）。
- **贴图构成元素全面加强**：等高线 6→9 条、透明度 .10→.17、线宽 1→1.2；
  经纬网 .04→.07；半调网点 r.6→.7、.07→.09；陆块阈值阶梯上限 .9→1；
  云层 .26→.3。新增**数据刻度**：8 个测量十字 + 2 个标记环散布表面
  （stroke .24，画在贴图里 = 随球面卷曲旋转，与地形一体）。
- **表面粒子**：单层 14 点同步闪烁 → 三层 33 点异相（7s/9.7s/5.3s 错相位），
  第三层是 5 颗蓝色火花（rgba(127,168,255)），闪烁幅度 .34~.55 → .4~.66。
- **验证**：verify-globe-texture.mjs 断言更新后全过——光照压平（161/143 = 1.13×）、
  线元素密度（扫行跳变 15 次）、临边蓝偏置 +21（勾边级）、柔边保持、尘埃 3 层。
  截图目视：球面均匀印刷质感，等高线/经纬网可读。

## 8h. v0.1.1 去光照：纯纹理灰度球（2026-08-22，用户实机反馈后）

用户反馈：球还是太亮——不要光照，只改纹理质感。8f 引入的逐像素光照到这一步
整体退役（8g 已降到暗示级，仍嫌亮），方向彻底定为"印刷灰度球"：

- **删光照**：预计算里的光源向量/光照数组/临边辉光数组全删，render 循环不再
  引用；`GLOBE_EXPOSURE = 0.55` 固定曝光取而代之（无光照时代码原是 ×0.7，
  因 CSS 遮光层已在 8f 减负，取更低值压暗）。
- **删辉光**：临边 (1-nz)³ 偏蓝大气辉光移除，临边只保留 alpha 柔边（nz/0.18
  渐隐，~6px）——柔边是抗切边手段，不是光效。
- **不动**：双线性采样、贴图全部构成元素（9 等高线/经纬网/网点/数据刻度/
  陆块阶梯/云层）、三层异相表面粒子、卫星层、live 读数、CSS 轻遮光层。
- **验证**：verify-globe-texture.mjs 断言改向（noLighting 昼夜比 <1.08、
  darkened 昼侧 <140、noRimGlow 蓝偏置 <4）后全过——实测 96/97（1.01×）、
  蓝偏置 0、柔边 137/255、线跳变 6、尘埃 3 层。截图目视：均匀暗灰纹理球，
  无方向明暗、无蓝边。

## 8i. v0.1.1 去柔边：硬切边（2026-08-22，用户实机反馈后）

用户反馈：柔边也去掉。至此球面渲染全部"软"手段（光照/辉光/柔边）清零：

- **删 alpha 渐隐**：预计算的 alphaArr 移除（nz 随光照删除后已只剩这一个用途，
  一并清掉），render 对圆盘像素写死 alpha 255。硬切边成立——圆盘外像素本就不写
  （validIdx 只含盘内），视觉边缘由 `.palis-globe-sphere` 的 border-radius:50%
  裁剪 + 细描边提供。
- **探针阈值重新标定**：固定曝光 ×.55 后，原 14 的扫行跳变阈值（光照版 .92 曝光
  下标定）漏检经纬网（.07×255×.55≈10 < 14）——改 8 后同一片纹理跳变 16 次，
  纹理本身无回归，纯度量失真。断言 softLimb → hardLimb（limb 255/255）。
- **验证**：verify-globe-texture.mjs 全过（96/102、蓝偏置 0、硬边 255/255、
  跳变 16、尘埃 3 层）；截图目视边缘干脆，无羽化。

## 8j. v0.1.1 深压暗：对标早期暗色观感（2026-08-22，用户实机反馈后）

用户反馈：球还是太光亮，给了早期截图（暗底 + 清晰网点）做对标。诊断：8h 的
×0.55 是拿"无光照时代 ×0.7"折算的，但那时还有 8f 已删掉的重 CSS 遮光层在
压暗——等效曝光其实远低于 .55。

- **曝光 ×0.55 → ×0.32**：实测画面亮度 96 → 56，回到早期暗色区间。
- **线元素按低曝光补强**（否则纹理随基底一起沉掉，失去对标的"暗底清晰网点"）：
  等高线 .17→.26、经纬网 .07→.12、半调网点 .09→.14、数据刻度 .24→.36——
  绝对线亮度与 ×0.55 时代持平，基底降 42%，线/底对比反而更高。
- **探针抗相位**：单行扫线跳变随自转相位大幅波动（同版本测出 16/5/2），改扫
  3 行（y=200/300/450）求和、阈值 ≥10——v12 两相位实测 10/12，稳定通过。
  darkened 断言同步收紧 <140 → <80。
- **验证**：verify-globe-texture.mjs 全过（昼/夜 56/55、蓝偏置 0、硬边 255/255、
  跳变 10/12、尘埃 3 层）；截图目视：暗灰底 + 颗粒网点清晰，与对标图同区间。

## 8k. v0.1.1 多尺度网点体系（2026-08-22，用户给 PALIS 总目录屏参考图）

用户给了原作总目录屏参考：其质感精髓是不同细腻程度粒子的密度搭配——球体亮部
细密近连续、机械面板中密度、暗底稀疏粗点，密度随明度走。我们原来只有单层 4px
网点，过于均匀。

- **四层网点**：细粒 h3（3px 栅 r.45/.07，底噪）+ 中粒 h（4px r.7/.14，原层）
  + 粗疏粒 h2（9px 栅 r1.1/.10，暗区散布的孤立点）+ **陆块密度调制层 hm**
  （5px 栅 r1/.22）——mask `ml` 直接复用陆块湍流（明度×阶梯 alpha），网点在
  陆地自动加密、海洋缺席，实现"密度跟明度走"。
- **代价/取舍**：mask 内滤镜、四层 pattern 平铺都在贴图栅格化时一次性结算，
  渲染循环零新增开销；细粒 3px 在 1024 贴图里约 1.5px，双线性采样后呈细腻
  颗粒而非孤立点（符合参考图球体的"连续颗粒感"）。
- **验证**：verify-globe-texture.mjs 全过（昼/夜 56/61——网点补回少许夜侧亮度、
  蓝偏置 0、硬边 255/255、跳变 13、尘埃 3 层）；截图原尺寸目视：陆块区细密
  颗粒、暗区稀疏孤立点，层次拉开。

## 8l. v0.1.1 纹理质感继续加强（2026-08-22，用户实机反馈）

- **陆块梯田化**：阶梯 6 档 → 7 档（'0 0 0 1 .8 .55 .32'），地形台阶更碎。
- **等高线 9 → 13 条**（全高均布 76px 间隔），位移 60 → 85 更锯齿。
- **新增纵向波纹线** 8 条（.2，与等高线同位移）：正交编织感。纵向线不跨横向
  接缝，天然无缝（横向线的起止同 y 约束对纵向不适用）。
- **数据刻度加量**：十字 8 → 12、标记环 2 → 3。噪点层 .08 → .15（颗粒更脆）。
- **修正对比衰减**（这轮的真问题）：线以 alpha 叠加在亮陆块上时实际增量 =
  α×(236-基底)×曝光——陆地上等高线增量仅 ~5 亮度，被基底冲淡。加强：等高线
  .26→.3、波纹线 .2、中粒网点 .14→.18、陆块调制网点 .22→.3。
- **探针度量换代**：跳变计数制在陆块上漏检（同版本测出 16/5/2/4），换**纹理
  能量**（3 行逐 4px 相邻亮度差绝对值平均 ×100，相位稳健）。标定：v15 实测
  131~141，纯平滑球面 10~30，阈值定 ≥100。noLighting 阈值 1.08 → 1.2
  （颗粒加强后两固定采样点的纯纹理亮度差最高 1.16×，原阈值误判）。
- **调试工具**：verify-globe-rowdump.mjs（工作区根）——打印扫行亮度剖面，
  排查"纹理是否在位/是否低于阈值"用的，本轮靠它定位的对比衰减。
- **验证**：verify-globe-texture.mjs 全过（昼/夜 58/56、蓝偏置 0、硬边 255/255、
  能量 131~141、尘埃 3 层）；截图目视：颗粒更脆、纵向编织与梯田层次可见。

## 8m. v0.1.1 表面纹理对比加强（2026-08-22，用户实机反馈）

用户反馈：加强表面的纹理对比。上一轮是"加元素"，这轮是"拉开反差"。

- **对比拉伸曲线**：render 循环从 `v = s×E` 改为 `v = ((s-128)×1.4+128)×E`——
  绕中灰拉伸，暗部更暗、亮部更亮、均值近似不变（不会触发此前"太亮"回退）。
  写入 Uint8ClampedArray 自动截断 [0,255]，循环内只多一次乘减，零预计算变更。
- **不堆 alpha 的理由**：线/网点 alpha 已在上轮顶到对比衰减的极限（叠在亮陆块
  上增量被基底吃掉），全局曲线对一切构成元素一视同仁地拉开——包括湍流基底
  本身的梯田台阶。
- **验证**：verify-globe-texture.mjs 全过——纹理能量 131~141 → 177（+30%），
  昼侧 58 → 64（< 80 压暗线保持）、夜侧不变、蓝偏置 0、硬边 255/255、尘埃
  3 层。截图目视：明暗分离明显更脆。

## 9. v0.1.1 动效节奏令牌化 + better-sidebar 联动（2026-08-22，窗口切换衔接优化）

**需求**：优化动效和窗口切换的衔接（左右侧边栏/底部面板开合）。

**PALIS 侧（本仓库）**
- `src/theme-core.ts` PALIS_CSS 动效节奏块（强度档之后）：主题开启时覆盖
  `--ds-transition-duration .16s / -fast .08s / -slow .24s` 与
  `--ds-ease-in-out: cubic-bezier(.3,.85,.25,1)`。侧栏/面板/控件都挂内核这组
  令牌，一处覆盖全局同步——这是"主题统一动效语言"的正确杠杆点，不用逐组件改。
- 已 build（lib 刷新）并随预览实例实机验证。

**联动侧（dsh-better-sidebar 0.12.2，源改动 + 构建链重建）**
- 面板内容交叉淡化：`.panelBody` 展开时 opacity .16s 延迟 84ms（.35×slow）淡入、
  收起时 .08s 快速淡出——面板滑动期间内容不闪烁不抢戏；reduced-motion 同步豁免。
- 开关按钮状态指示：两个 toggle 加 `data-open`，开启态 accent 着色 + 图标
  transform 过渡，收起/展开方向一目了然。
- **事故与重建（记录）**：本轮在插件包内跑 `npm run build`，脚本首步 `rm -rf lib`
  删掉了预构建产物，而仓库缺 `tsconfig.build.json`/`tsdown.config.ts`（两者均不在
  工作区副本中），lib/ 不可恢复；内核前置体检随即自动隔离插件（disabled-bundles.json
  + 从 profile package.json 的 bundles 列表摘除）。重建动作：
  - 重写 `tsdown.config.ts`（四 bundle：host ESM 全外部化 / client 核心 CJS +
    `__ModuleLoader__.load` 包装 / terminal、editor 懒加载分包 `__dshChunks__`
    包装），产物包装格式与官方内核 client bundle 逐字节同构；
  - CSS modules 自实现插件：`.css` 导入在 resolveId 阶段改写到 `.js` 结尾的虚拟
    id（绕开 tsdown 内置 css-guard 对 .css 后缀的硬报错），load 里按文件路径 sha1
    作用域化类名并生成 `<style>` 运行时注入（按 id 去重，核心/分包共享哈希）；
  - 依赖策略踩坑：tsdown 默认把 dependencies 也全部外部化，首版 client 在浏览器里
    `require("clsx")` miss module table——改 `alwaysBundle` 谓词（平台 seed 词
    react 系 + `@deepseek-ai/*` 保持外部，其余全打进包）；
  - **顺手修掉的真缺陷**：懒加载分包的模块系统取自 `window.__DSH_MODULES__`——
    当前内核从未安装这个全局（终端/编辑器分包因此一直加载失败）。平台实际通过
    cordis 发布（dsh-client-modules `ctx.reflect.provide('modules', …)`），改为
    client 入口 apply() 用 `provideChunkModuleSystem(ctx.modules)` 显式交接，
    inject 列表同步加 `modules`；
  - 补 `tsconfig.build.json`（emitDeclarationOnly → lib/types，73 个 .d.ts），
    build 脚本顺序修正为 `rm -rf lib && tsdown && tsc`（避免 tsdown clean  wipe
    类型）；修复 node_modules 下 189 个失效 junction（原指向已改为 runtime.tar.gz
    分发的旧安装目录，现指向工作区 `dsh-desktop/runtime`）；剩 6 个 client 端平台包
    （ui-primitives 等）本机无实体类型源（内核从打包资产服务），tsc 类型步对此
    报 TS2307 但声明照常产全——环境问题记录在案，运行时无影响。
- **验证**：preview 实例（隔离解除后）verify-motion.mjs 8/8 全过——PALIS 令牌
  生效、data-open 在位、面板 transitionDuration=0.24s、panelBody 交叉淡化延迟
  84ms、收起动画中段抓到 transform matrix 位移 + opacity 0.024 的真实中间帧；
  终端分包实测加载成功（xterm 挂载、无 chunk 报错）。截图 verify-out/motion.png。

## 10. v0.1.1 侧栏开合闪烁治理（2026-08-22，用户实机反馈）

用户反馈：右侧边栏弹出/收回时发生闪烁。headless Chrome 逐帧 screencast 抓包
（帧存 verify-out/flicker/）逐条定位——三根因 + 一个够不着的第三方来源：

**根因 1：margin 过渡晚起一帧（better-sidebar）**
`Sidebar.tsx` 把 `--dsh-sidebar-width/height` 写进 documentElement 的时机是
`useEffect`（paint 后），而面板 class 翻转在 commit 前——margin 的 CSS 过渡因此
比面板滑移晚起一帧，两边缘错位实测 ~10px。改 `useLayoutEffect`（import 同步加），
变量写入与 class 翻转同帧生效；复测错位 ≤7px（残余 = 逐帧采样间隔量化，非真实
错位）。

**根因 2：合成层升层闪帧风险（better-sidebar，预防性）**
全高面板滑移中途可能被临时提升合成层，升/降层瞬间存在光栅化闪帧风险——
`.panel` / `.bottomPanel` 加 `will-change: transform`（sidebar.module.css，带
注释），滑移全程独立合成层稳定。

**根因 3：波动条清零风暴（palis，本仓库）**
`sizeWave` 的 `canvas.width=` 赋值按 spec 清空画布，而侧栏推拉/窗口缩放期间
ResizeObserver 逐帧触发——每帧"清空→重画"，蓝线呈现闪断。新增
`scheduleWaveResize` 落定防抖（`WAVE_RESIZE_SETTLE_MS=160`：落定 160ms 无新尺寸
才重置；`lane.w===0` 首次挂载仍立即重置，否则首帧空等 160ms）。`WaveLane` 接口
加 `resizeTimer?: number`，dropWave/ensureWave 拆除路径同步清 timer。复测：动画
窗口内 `backingChangesDuringAnim: 0`（修复前每次 resize 均 >0）。

**够不着的来源：桌宠自主眨眼（dsh-pet，第三方打包插件，不在工作区）**
pet-probe 实测桌宠在 toggle 后 ~0.4s 有一次 opacity 1→0.02→1 的自主眨眼
（~200ms），且其 z-40 层级会被 z-50 面板瞬时遮/露——属 dsh-pet 自身的拟人化
行为逻辑，不属于本次修复范围。若观感仍困扰，建议向 dsh-pet 作者反馈或接受其
自主行为。

**验证**：预览实例 v21（kernel 8770）verify-motion.mjs 8/8 全过——PALIS 令牌、
data-open、面板 0.24s、交叉淡化延迟 84ms、收起中段 matrix(363px 位移) +
opacity 0.003 真实中间帧；flicker 逐帧复测错位 ≤7px、波动条 backing 零重置。
better-sidebar 仍 0.12.2、palis 仍 0.1.1（改动均 client 侧，内核按页加载直发
磁盘 client.js，预览内核无需重启）。

## 11. v0.1.1 设置面板三伤修复（2026-08-22，用户截图反馈）

用户截图问「主题设置界面是不是有些问题」。截图 + headless 探针（verify-panel.mjs）
逐项定位：

**伤 1（最重）：PANEL_CSS 整体丢失——面板无标题栏/边框/网格，退化为裸 inline 排布**
取证链：floatBtn 在 + panelTag 不在 + 零 console 报错 + 手动重放的 style tag 存活
→ 排除「创建后被删」，锁定「创建路径被跳过」。根因：cordis effect 重跑时新回调
可能先于旧清理执行——旧 `if (panelTag !== null) return` 守卫让新回调跳过创建，
旧清理随后把唯一 tag 移除。floatBtn 因「无条件重建 + 双实例残留」反而在。
正确逻辑覆盖（不打补丁）：
- `ensurePanelCss` 按 DOM 实况自愈（getElementById 为准，不认模块变量）；
- effect 清理函数删除 `panelTag?.remove(); panelTag = null`——PANEL_CSS 的设计
  语义本就是「与主题开关无关、始终注入」，原实现的删除行为与自身注释矛盾；
- Panel 组件挂载 effect 里补一次 ensurePanelCss 自愈。
顺带说明：PALIS_CSS 与主题开关联动（关时必须删），维持原语义不动。

**伤 2：开关折行断字**（「开机自检 BOOT SEQ」断成「开机自/检」）
实测：设置页 main 列仅 564px → cell 263px → toggles 两列各 110px < 标签所需
~134px。修：`.ptp-toggles` 改 `repeat(auto-fill,minmax(150px,1fr))`（窄了自动
减列）+ 标签 nowrap；STYLE cell 加 `.ptp-cell-wide` 通栏——顺手消灭三 cell 进
两列网格的右下空洞。复测：FX 单列竖排、STYLE 通栏三列、boot 标签单行（h 26→13）。

**伤 3：POWER 行残留白色聚焦框**
`:focus:not(:focus-visible)` 去框 + `:focus-visible` 主题蓝框（power/seg/float
三处），键盘可达性保留。

**联动修复（非本仓库）**：设置左导航出现两个「插件」——内核自带插件管理页与
dsh-super-injector 的 settings.section（`label: () => '插件'`）撞名。改 super-
injector label 为「模组注入」（运行时 `~/.dsh/plugins/dsh-super-injector` 的
src + lib 重建，工作区 `dsh-super-injector-main` 源码副本同步一行）。

**验证**：预览实例 v25（kernel 5736）verify-panel.mjs 复测——gridCols 恢复、
bootLabel 单行 nowrap、左导航 插件×1 + 模组注入×1；截图 verify-out/panel-audit.png
目视：标题栏/卡片边框/通栏 STYLE/无白框，面板回归 PALIS 审美。

## 12. v0.1.2 点云天体 + 签名瞬间批（2026-08-23，用户风格参考驱动）

用户给了一张风格参考图（当前模型无图像输入，用自研零依赖 PNG 解析器
`analyze-style.mjs` 提取像素 DNA：亮色纸灰底 + 军橄榄绿块 + 高饱和橙主导），
追问后定案：**要的不是配色而是「TouchDesigner 式代码粒子建模」的质感路线**
（像素粒子），追求设计高级感。本轮五件套：

### 12.1 数据天体 → 地形点云引擎（本轮主菜）
- 位图逐像素填充退役：改为构建期按经纬网格（0.9°步长）采样贴图亮度 →
  **12498 颗地形粒子**组成旋转点云（实测值，`window.__palisPoints` 探针可见）。
  采样两层：亮核层（s≥96 全收：线元素/亮梯田台阶）+ 暗部稀疏层（s≥34 且
  确定性哈希命中 1/5，海洋暗底保轮廓连续）；密度自然跟地形亮度走。
- 渲染帧零查表：每颗粒子只背静态量（lon/sinLat/cosLat/构建期算死的亮度）；
  正交投影后 z≤0.05 后半球剔除（硬剪影），深度调 alpha（近亮远暗）与尺寸
  （内部 1px/2px → CSS 放大后 1.4/2.8px 的颗粒感）；alpha 分 14 桶批量 fill
  （万级粒子每帧仅 ~28 次状态切换）；`globalCompositeOperation='lighter'`
  加法混合叠出微光——TD 观感的关键一手；~3.4% 蓝火花（#6f9cff）。
- 影调连续性：对比拉伸 ×1.4 与固定曝光 ×0.32 从旧位图管线原样继承到采样期。
- 卫星/HUD 环/live 读数/DOM 尘埃层全部保留不动（本来就是线条粒子语言）。

### 12.2 星尘漂移场 `.palis-starfield`
- 全屏 canvas 贴 `[data-phase]`（z-index:-1，DOM 序在 globe 前 = 画在其下）：
  80–240 颗按视口面积定量，统一缓向左漂（深空风 vx -2.5~-7 px/s）+
  异相慢闪烁；色调冷灰白为主，8% 蓝火花 + 4% 暖橙（呼应参考图的橙色温度）。
  独立轻 rAF（同 orbitFrame 先例）；ResizeObserver 跟随宿主；reduced-motion
  只画一帧静态散点。

### 12.3 CRT 开关机闪屏（POWER 签名瞬间）
- 通电：黑幕中水平亮线从中心展开 → 纵向涨满成光带 → 幕布淡出露出主题 UI；
  断电：暗罩先扣住画面（遮住摘主题瞬间的裸 UI）→ 亮线收束成点熄灭 → 罩布淡出。
- 样式放 **PANEL_CSS（常驻表）**——断电闪屏播放时 PALIS_CSS 已被摘除，只有
  常驻表能兜住；触发在 setField 的 enabled 分支（面板/浮动键/快捷键全覆盖），
  首帧加载不播（boot 序列负责）。reduced-motion 不播。

### 12.4 快捷键 + 预设 + UTC 时钟
- Ctrl+Alt+P 一键开关（window capture 段；AltGraph 放行防 Windows AltGr
  特殊字符输入误触）；状态行加操作提示。
- 面板新增 PRESET 行：CRT·MAX / TERMINAL / BARE——逐字段走 setField 统一
  写路径（quiet 跳过逐字段日志，末尾一条汇总），revision 守卫天然成立。
- live 读数 VER 行换 UTC 真时钟（500ms 节流内每拍走秒，探针证实 ticked）。

### 12.5 reduced-motion 完整治理
- 球体：still 模式（贴图点云渲染一帧 + 写一次读数，循环不启动）；星场：
  单帧静态；boot 自检整段跳过；（声纳/波动条/卫星层此前已豁免）。
- 探针 Emulation.setEmulatedMedia 实测五项全过：bootSkipped / globeStatic /
  starStatic / sonarAbsent / satAbsent。

### 12.6 插入器预检适配（坑）
- super-injector 注入前检的正则按 `register\(\{[\s\S]*?name:'<slot>'` 扫描
  src+lib——多行排版的 `register(\n {` 不匹配被误判坏骨架。注册调用收单行
  （源码留注释说明该排版约束）；顺带发现源码头注释里的 `slots.register(`
  字样也会被扫，措辞避开。注入器正则本身可放宽为 `register\s*\(\s*\{`，
  属注入器侧改进项，未动。

### 12.7 验证与交付
- `verify-palis-v012.mjs` 十项检查全过（PASS true）：点云规模/星场播种/
  首帧注入/球体旋转/UTC 走秒/tool-call 斜纹/CRT 闪屏生命周期/快捷键翻转/
  预设应用/RM 五项。截图 verify-out/v012-idle.png、v012-toggled.png、v012-panel.png。
- 探针怪癖存档：CDP returnByValue 路径上个别布尔表现为包装对象行为
  （JSON 打印 true 但 `=== true` 为 false）——探针布尔断言一律用
  `!== false` 或取反，别用严格等。
- 已知副作用：预览实例与正式版共用 ~/.dsh/settings.yaml，探针期间预设
  CRT·MAX 写入且恢复 POST 因 expectedRevision 过期未生效——现持久态为
  intensity high + 全 FX + glow on（一致可看的组合）；用户可面板随手调回。


## 13. v0.1.2 地球→月球形态转换（2026-08-23，用户海报参考驱动）

用户给半调网点海报参考（黑白高对比、复印颗粒、细白描边圆圈、稀疏蓝色点缀），
要求右侧转动天体往「月球」形态做形态+细节优化。

### 13.1 关键发现：工作树里躺着未提交的引擎改写
- 盘点 git 发现：已推送的 HEAD（95392af+2adfb93）是**逐像素位图引擎**——
  用户实机一直看到的「苍白大球」就是它；§12 的点云粒子引擎（~12.5k 粒子 +
  探针 __palisPoints）**从未提交、从未实机运行**，只存在于工作树。
- 两条路线都接月面贴图实测截图对比：点云在「只露球盘左缘 40%」的布局里
  读作散点噪声（加密到 20k 粒子 + 强化明暗后仍不出球体感），位图引擎直接
  呈现月海/环形山/网点 = 海报参考的本体语言。**决策：保留位图引擎，退役
  点云实验**（工作树粒子版留档 /tmp 备份后即被正确逻辑覆盖）。
- §12 里仍成立的可访问性修复逐条移植回位图引擎：boot 自检 reduced-motion
  整段跳过、球体 still 静帧模式（读数写一次、循环不启动）——读数覆写逻辑
  抽出 writeRo() 复用。

### 13.2 月面贴图生成器（ART_MOON_MAP 替换 ART_EARTH_MAP）
- 程序生成（mulberry32 确定性 PRNG，seed 20260823，构建/探针截图可复现）：
  中灰 150 高地基底 → 大块反照率湍流（线性拉伸增对比，opacity .42）→
  远古坑群（月海之下，被淹没成幽灵坑）→ 月海 4 片手排（雨海/澄海-静海/
  风暴洋/湿海，各海反照率微差，disloc 位移破边）→ 年轻亮坑×3 + 射纹大坑×3
  （月海之上，暗面亮点）→ 分区半调网点（高地 5px 细粒 / 海内 11px 粗粒，
  按引擎 1024 降采样标定，再细只会混成白噪）→ 经纬网 + 测量十字 + 高频颗粒。
- 近地面（x 480–1500）海系集中、背面纯高地——真月球正/背面不对称，
  自转一周讲完两面。
- 坑体配方收敛：细环（r·0.11-0.13）淡底（alpha .4-.5），只画反照率特征
  不画光照；坑最小 r=12@2048（降采样后 6px），再小只会变盐噪。

### 13.3 坑与验证
- **data URI 字面 `#` 截断**：基底写的 `fill='#6b6b6b'` 让未编码 data URI
  在 # 处截断 → SVG 静默加载失败（img.onload 不触发，无控制台报错）→
  整球消失。data URI 内联 SVG 一律 rgb()/rgba()，禁 #hex。由「球没了」
  症状 + DOM 在而探针空定位。
- 原图直验快循环：`node -e import lib/theme-core.js → 写 moon-map.svg` +
  headless Chrome 截 1024×512 原图，先看贴图本身再进整页——第一版月海
  连成一片黑大陆、坑密如泡沫，就是在这步抓出来的。
- 终版整页截图（1920×1080）：月海暗斑 + 海岸线破边 + 亮环坑 + 高地斑驳
  全部读出，中部内容区不被抢视线；读数 LON 随自转走，无控制台错误。


## 14. v0.1.2 引擎路线反转：粒子版常驻 + 开机舷窗改版（2026-08-23，用户实机裁决）

### 14.1 用户实机推翻 §13 的引擎决策
- §13 依隔离无头实例的截图判「点云在只露左缘的条带里读作散点噪声」，退役了
  点云引擎。用户随后在真实桌面端（经 profile link 直读工作区 lib/）看到了
  **粒子点云版**并明确认可：「要保持这种用粒子构建的 3D 感」。决策反转：
  **点云引擎常驻，逐像素位图引擎退役**（被正确逻辑覆盖，非补丁共存）。
- 教训存档：隔离实例截图的判读不能替代用户实机观感——美术路线的最终裁决权
  在用户眼睛，不在代理的截图。
- 恢复路径：/tmp 备份的点云版 → `src/client/index.ts`，重新打上密度补丁
  （经纬步长 0.9°→0.7°、PT_MAX 24000、暗层哈希命中 1/5→1/7、亮核 s≥96 /
  暗层 s≥34）。实测探针 `window.__palisPoints = 20197`——密度补丁后条带内
  球盘的月海暗斑/高地亮区疏密分区可读，3D 感成立。

### 14.2 开机动画改版（用户：「现在启动动画不好看」）
- **入场**：CRT 点火（`palis-boot-on`：clip-path 水平亮线从中心展开 + 亮度
  闪光收敛，.55s）；覆盖层自带扫描线 + 暗角——开机第一帧即入 CRT 质感，
  不再是秃黑屏。
- **构图**：380px 圆形舷窗 `.pb-port`（`border-radius:50%;overflow:hidden`）
  内放月面贴图 `.pb-moon`（200% 宽、60s 横向平移 = 舷窗里缓缓转动的月球，
  呼应 PALIS 09A 参考屏的大圆窗）；标题「PALIS 09A」/ 副标叠在视窗中央
  （`.pb-port-text` 文字阴影压过月面）；下方进度条 + 6 行自检日志保持原有
  节奏不变。off 2000ms / remove 2550ms 时序不动。
- **坑（直角模式）**：共享设置「直角 SQUARE」开着时，全局
  `border-radius:0 !important` 把舷窗切成圆角矩形——连拍抓出。按 globe/sonar
  先例把 `.pb-port` / `.pb-port-ring` 加进直角豁免清单（舷窗/天体是具象图形，
  非 UI 铬件）。
- **验证**：隔离内核 :4799 重启刷新 rev 后连拍 14 帧——点火展开、舷窗正圆、
  月面平移、日志逐行、尾段淡出全过；整页 1920×1080 探针 20197 粒子、
  零控制台错误。


## 15. v0.1.2 月面纹理深化（2026-08-23，用户：「继续优化月球表面的纹理」）

### 15.1 重大测试坑：原图直验快循环一直在看「裸图」
- `ART_MOON_MAP` 源码里的内部引用写成 `url(%23id)`——这是 data URI 转义，
  **只在 data: 上下文被解码**。直验循环把原始字符串写成 .svg 走 file:// 打开时，
  `%23` 保持字面 → 所有 filter/pattern/mask 引用静默失效 → v2/v3 截图里的
  「高地平坦、网点不可见」全是假象（其实滤镜层根本没渲染）。
- 修法：测试导出时 `replaceAll('%23','#')`——file:// 下 `url(#id)` 正常解析；
  app 内 data URI 用法不受影响（颜色仍禁 #hex）。修正后文件体积 150KB→528KB，
  滤镜层首次真正参与直验。

### 15.2 贴图配方升级（真图基础上迭代）
- **月海拆解提亮**：海面 s≈45-55（墨黑一团）→ s≈76-84——仍在引擎暗部稀疏层
  （1/7 撒点，宏对比不变），但舷窗直视/点云里海面留得出细节层次；各海反照率
  微差保留，椭圆整体收 15% 并拉开间距。
- **岸线描边**：月海描边与填充共用同一 disloc filter——feTurbulence 只随坐标
  走，两组形状位移场完全一致 → 亮岸线精确贴着破边（.18/3.5px）。
- **海内地质**：皱脊 ×2（亮，正弦抖动椭圆弧折线）+ 月溪 ×1（暗）+ 海缘幽灵坑
  （低 alpha 细环 = 浅海下透出），每海一套、参数按海序错开。
- **环形山谱系**：远古大盆地 ×2（背面高地，退化双环 + 缘上叠加中坑 = 地层
  叠压）；中坑 ×16；小坑 40→64 且 r 改平方分布（多小少中，贴近真月坑径谱），
  一半全纬度均匀撒（两极不再秃）；链坑 ×2（r 7-10 七连珠 = 次生坑链，
  海报虚线肌理）。
- **年轻坑 ×5 + 喷发毯**：radialGradient 径向渐隐亮晕（r×2.3）衬底，亮环坑
  压晕心；3 落月海内（暗面亮点）、2 落高地。
- **射纹大坑 ×3 改楔形**：等宽线放射 → polygon 楔形三角（基部宽 → 尖梢收 0），
  14-20 条/座、长 3.5-9r、alpha .2 + 喷发毯 r×2.6——真射纹的收束感。
- **三档网点（不同细腻程度的颗粒搭配）**：hf 细粒 5px（高地底噪）+ hm 中粒
  26px 经**反照率湍流蒙版**（mhf 的底从纯白换成 albedo 滤镜 rect = 亮点大密、
  暗点稀淡的真半调）+ hc 粗粒 20px（月海内颗粒，点云里化作海面亮砂）。
- **反照率加强**：6 倍频、slope 1.5/intercept -.18、opacity .5——高地银色
  斑驳成为基底主纹理；极区微亮渐变收尾（真月两极高地反照率略高）。

### 15.3 验证
- 原图直验（%23 修正后）：银色高地 + 网点肌理 / 月海破边 + 粗粒点阵 / 楔形
  射纹 / 链坑虚线全部读出（moon-v5.png）。
- 整页：隔离内核重启后开机舷窗 = 明暗分明的「真·月球」（连拍 boot-04 构图
  成立）；粒子球探针 `__palisPoints` 20197→**22611**（更亮的反照率 + 网点
  亮砂把更多采样推进亮核层），条带内球面颗粒结团、月海疏区/亮坑棱对比清晰，
  零控制台错误。


## 16. v0.1.2 月面地理仿真化 + 矿质双色调（2026-08-23，用户三张参考图驱动）

参考：① 矿质月面摄影（月海泛钛蓝/高地偏铜褐/微坑密布/第谷射纹系统）
② 黑白高反差 + 蓝色点缀的超现实构图 ③ 月相网格照片（正确的月海地理关系、
第谷居南半球拖横跨半盘的射纹）。

### 16.1 月海地理重写（手排 4 片 → selenographic 坐标 12 片）
- 映射 x = 990 + 5.5·东经、y = 512 − 5.7·北纬：冷海北极长带/雨海/澄海/静海/
  危海（孤立深黑圆海）/丰富海/酒海/云海/湿海/风暴洋（最大海系）/格里马尔迪
  （深黑小海）/柏拉图（雨海北缘暗斑）——「月面人脸」构图成立。背面仍纯高地。
- Maria 增 `tone` 字段索引双层覆盖色板（0-3 常规微差，4 = 深黑小海）；
  岸线描边跳过 rx<28 微型海（描边宽度会淹没本体）；皱脊/月溪仅大块圆海
  （R≥50 且近圆），冷海带除外不出错乱脊线。

### 16.2 射纹系统仿真位 + Aristarchus
- 第谷 Tycho（927,759 r42）居南半球：24 条楔形射纹长 3.5-13r 横跨半盘——
  全月最主宰射纹系统；哥白尼（880,457 r46，18 条）；开普勒（780,466 r26）。
  rayed 结构带 n/l0/l1 参数，wrap margin 随 l1 自适应。
- Aristarchus（729,377 r15）：全月最亮斑，蓝白变体喷发毯（gradEjectaB）+
  高亮环——参考图②的蓝色点缀落在月球本体上。

### 16.3 坑密度 + 矿质双色调
- 南半球饱和坑群 ×40（y 700-990，坑挨坑）+ 微坑颗粒 ×240（r 3-7，降采样后
  化作颗粒噪点 = 矿质摄影的密坑质感）。
- 双色调罩层（newCraters 之后、网点之前）：全图暖铜薄罩 .06 + 月海钛蓝薄罩
  .15（同 disloc 位移场贴破边）。**引擎只采样 R 通道**：蓝罩 R 低压月海、
  暖罩 R 高抬高地——色调同时服务直视与点云密度。

### 16.4 验证
- 原图直验：月海地理/钛蓝月海/暖银高地/第谷南半球射纹/密集坑群全部读出。
- 整页：开机舷窗 = 有地理、有矿质色、有颗粒的真月球；粒子球探针
  22611→**23331**，点云里射纹亮纹斜穿、月海疏区清晰，零控制台错误。

## 17. 预览环境卡「Loading plugins…」根因与正确拉起姿势（2026-08-23）

### 17.1 现象与根因
- 给用户拉可视测试实例（隔离内核 :4799 + 独立 Chrome --app 窗口），页面永远停在
  HARNESS「Loading plugins…」，零 console 错误、零挂起请求（仅 SSE 长连接）。
- 二分排除：最小 patch、禁用全部 5 个本地插件（super-injector/panel/auto-mode/
  better-sidebar/pet）后依旧卡 → 嫌疑落在内核本体而非插件。
- **根因：用错了 dsh 运行时**。全局 npm `@deepseek-ai/dsh` 是 0.1.0-rc.6
  （8-13 的旧版），而真实桌面端用自带运行时
  `C:\Users\DL\AppData\Local\DeepSeek Harness Desktop\runtime\`（node.exe +
  node_modules，dsh 0.1.1-rc.1）。rc.6 的 web 前端启动门（AppRoot 等
  `loader.await()` + 全 fiber ACTIVE 清扫）在该环境下有 entry 永久 PENDING
  （cordis inject 等待无超时 → 静默卡死）。
- 换桌面运行时同参重启（--profile web --patch kernel.patch.yml --port 4799
  --no-open）：一次点亮，globe 挂载、粒子探针 23257、artwork on。

### 17.2 固化结论（以后照此执行）
- **隔离内核唯一正确命令**：
  `cd /c/Users/DL && "C:/Users/DL/AppData/Local/DeepSeek Harness Desktop/runtime/node.exe" "C:/Users/DL/AppData/Local/DeepSeek Harness Desktop/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile web --patch "C:/Users/DL/AppData/Roaming/DeepSeek Harness Desktop/kernel.patch.yml" --port 4799 --no-open`
- 禁止再用全局 npm 的 dsh（rc.6）起内核——它与桌面端行为不一致，坑已记录。
- 诊断路径备查：`cdp-loadwatch.cjs` 抓 console/异常；`netwatch.cjs`（新增，
  存 backups/session-repair/netwatch.cjs）列未完成请求；前端启动门源码在
  dsh-client-web/lib/index.js 的 AppRoot/runPluginBoot（`window.__DSH_BOOT__`
  只有静态 graph，无实时状态）。
- 二分手段备查：`--patch` 支持 `{ id: <entryId>, disabled: true }` 覆盖；
  entry id 用 `--dump-config` 查看（顶层五个本地插件 id：dsh-super-injector /
  palis-theme-panel / auto-permission-mode / better-sidebar / pet）。

## 18. 点云密度门重写：月貌内容从「粒子缺席」里长出来（2026-08-23，用户：粒子蔓延保留，别的内容呢）

### 18.1 病因（数据实测，不猜）
- 把 ART_MOON_MAP 以引擎同参数（1024×512）离屏采样做直方图：R 通道 60% 像素挤在
  160-175 一档，但**月海暗底也有 64-110**；旧引擎 PT_CORE_MIN=96 → 网格采样 89%
  判为亮核全收、skip 为 0——整个球盘被 2.3 万颗粒子灌满成均匀霾，月海/射纹/坑群
  的亮度信息全被密度饱和洗掉。（分析页：analyze.html + 直方图/ASCII  coarse 图，
  月海在 ASCII 里清晰可读，证明贴图本身对比足够，是引擎二值阈值毁了它。）

### 18.2 正确逻辑（覆盖，不打补丁）
- 采样从「二值阈值」改「连续密度门」：亮核（≥176：环形山亮环/射纹/喷发毯）全收；
  暗部按 ((s-48)/(176-48))² 概率用确定性哈希收（同一格点跨帧稳定）；
  <48 彻底留空。**暗部由粒子的缺席表达**——月海成为点云里的空洞，不再用稀疏点
  填平。高地亮坡 keep≈91%、月海地板 2-5%，密度比 ≈9:1。
- 矿质着色落到点云：月海幸存者（暗部层）半数钛蓝着色（哈希另一比特段，与密度门
  不相关），呼应贴图的月海蓝罩；亮核层保留 3.4% 随机蓝火花。
- 总量仍由 PT_MAX=24000  stride 等比抽稀（实测 22836），粒子蔓延的体量感不变——
  变的只是分布：高地/坑环密，月海空。

### 18.3 验证
- 构建 → 内核重启（桌面运行时）→ 无头整页 + 临时居中球盘截图：月海空洞、
  高地簇、蓝色调和全部读出，零 console 错误，探针 22836。
- 用户可视窗口已重拉（内核重启后 rev 变更，必须重开页面）。

## 19. 密度分档海报化：形状边界的锐利化（2026-08-23，用户：「用不同程度的粒子密度组成更明确的形状」）

### 19.1 两代试错的关键数据
- v7 连续密度门（(s-48)/128 平方概率）治好了「全屏灌霾」，但边界软：亮度带之间
  是渐变，形状轮廓被中间调啃成毛边。
- 直方图谷底实测：月海峰值 R≈85、高地峰值 R≈167，**112-143 是两者之间的真空带**
  （只占 6.5% 像素）——分档边界应卡谷底，而不是卡特征峰。

### 19.2 PT_BANDS 分档（v8 → v9 收敛）
- v8 五档 [56:0][112:.10][150:.38][178:.85][256:1]：档太多，高地纹理（144-191）
  横跨 .38/.85/1.0 三档互啃成有机团块，形状仍糊。
- v9 四档 **[56:0][128:.06][176:.78][256:1]**：边界 128 落在直方图谷底——月海
  整片均一 .06 稀疏（形状不被中间调啃边），高地整片 .78 稠密，亮核全收。
  月海:高地密度比 1:13，岸线一刀切开。
- 月海带幸存尘粒钛蓝着色 1/2 → 2/3（PT_MARIA_MAX=128 判界）。
- 实测粒子 21570（自然落到 PT_MAX 内，stride 抽稀未触发）。

### 19.3 备注
- 引擎只读 R 通道不变；贴图/开机舷窗位图未动（直视层保留全部纹理细节，
  海报化只发生在点云采样层）。

## 20. 满月揭示：双侧边栏全收时整盘滑出（2026-08-23，用户：「双栏收起时露出完整满月」）

### 20.1 状态契约（找标记的过程比代码重要）
- 右侧栏：better-sidebar 把右面板宽度写进 `<html>` 内联变量 `--dsh-sidebar-width`
  （收起 = 0px/未设置）——布局推送变量，稳定契约（src/client/Sidebar.tsx writeGeometry）。
- 左侧栏：内核 layout 框架元素带 `data-sidebar-collapsed` 数据属性（收起才挂上，
  React 条件属性）——同样稳定，不碰 hash 类名（面板设计红线）。
- 排除项：localStorage 无相关键；`--dsw-*` 无侧栏宽度；layout 的 setAttribute 只有
  主题色。哈希类（pI_x6G_/akXzcW_）能看到 panelHidden 但不可用。

### 20.2 实现
- 客户端 syncMoonReveal()：左 collapsed（属性在）且右 0px/未设置 →
  `html[data-palis-moon="full"]`，否则摘除；MutationObserver 双挂：body 子树
  （childList + attributes filter data-sidebar-collapsed）+ documentElement
  （attributes filter style——右面板拖拽逐帧写变量也走这里，幂等守卫防抖）。
- CSS：`.palis-globe` 加 `transition:right var(--ds-transition-duration-slow)
  var(--ds-ease-in-out)`——与侧栏收放同节奏同相运动（衔接感）；`full` 态
  right:-560px→-60px（整盘 1100px 基本全露，z-index:-1 不挡内容）。

### 20.3 验证（真实点击往返）
- 无头实例真实点击侧栏开关：收起 → data-palis-moon=full、globeRight -660→-60px；
  再点开 → 属性摘除、回到 -660px（hero 态基线）。截图 v10-moonfull.png 存档。

## 21. 球体响应式放大：超宽屏的粒子不再碎成尘（2026-08-23，用户实机截图对比驱动）

### 21.1 差距诊断（用户 3799×2058 实机 vs 我 1920 验证图）
- 球体固定 1100px：1920 视口占屏 57%，3840 超宽只剩 29%——粒子相对尺寸减半，
  稠密簇碎成细尘，形状感全丢；叠加相位（背面高地均一）与对话态半弧（只露
  一条竖切片），实机观感 = 随机霾。
- 教训：**验证截图的视口要贴用户实机**（用户 3840 超宽，我一直在 1920 下验）。

### 21.2 修复 + 一个 CSS 坑
- 球径随视口：`width:min(1500px,max(1100px,56vw))`——1920 及以下原样 1100，
  3840 → 1500（粒子同步变粗，蔓延感回归）；JS 引擎仍按 1100 坐标系布局，
  CSS 整体放大，卫星轨道/遮挡判定等内部常数不动。
- 坑：`right:calc(540px-100%)` 的 % 是**相对容器**宽度（不是元素自身）——
  球直接被推出屏幕（截图抓现形：整球消失）。正解：right 归 0，露出量用
  `translateX`（% 相对元素自身）+ `--moon-x` 自定义属性表达：
  半弧 `calc(100%-540px)` / hero `calc(100%-440px)` / 满月 `60px`；
  过渡从 right 改挂 transform（同节奏令牌，月出衔接不变）。
- 验证：3840 tucked 弧带恒 540px、1920 tucked 与改版前逐像素一致（回归过）、
  3840 满月大盘粒子粗壮清晰。新工具 backups/session-repair/cdp-shot-w.cjs
  （任意视口宽截图）存档。

## 22. 月海抽空 + 岸线亮边：空洞的「无/有」图形化（2026-08-23，用户拍板方案）

### 22.1 方案来源与数据基础
- 用户方向：「给月海空洞描一圈亮边（贴图里本来就有岸线高亮，把它的密度档
  再抬高一档就会显形）；结合反过来把月海彻底抽空（6%→0）」。
- 离线模拟（Temp/palis-shot/simulate.html，无头 --dump-dom 直出）岸线 R 直方图：
  邻近暗区（<80）的亮像素集中 bins 6-10（R 96-175，2199 采样），bin 11
  （176-191）仅 34——岸线高亮主体在旧 0.78 档内，「抬一档」实指把全收边界
  从 176 降到 152（bins 9-10 / 144-175 占岸线大头，随档全收）。
- v9 四档基线：存活 86280/123600（69.8%）→ stride 抽稀后 21570。

### 22.2 改动（src/client/index.ts）
- PT_BANDS 四档 → 三档密度：[56:0][128:0][152:.78][256:1]。
  - 月海带 0.06→0：彻底抽空，空洞 = 粒子的绝对缺席；月海:高地密度比
    1:13 → 0:1（对比无穷大）。
  - 全收边界 176→152：岸线主体 + 亮坡 + 坑环 + 射纹一档全收，空洞边缘
    由致密粒子自然勾出亮边。
- 矿质着色随抽空上移：旧月海钛蓝分支（PT_MARIA_MAX）死亡删除；全收档
  （≥PT_RIM_MIN=152）~1/3 钛蓝（(h>>>20)%3），中亮带 ~3.4% 蓝火花改取
  (h>>>10) 比特段（与密度门不相关的传统不变）。
- 亮边带亮度 ×1.3（bRaw 加成，120 封顶不变）：月海黑得彻底后亮边必须更亮
  才压得住对比——空洞更黑 + 亮边更亮 = 海报感。
- 注释四处同步（文件头引擎说明 / PT_BANDS 块 / 采样循环 / 着色规则）。

### 22.3 验证
- 实测粒子 20923（v9 基线 21570：月海尘约 -2600 与岸线全收约 +2000 对冲，
  自然落 PT_MAX 内，stride 抽稀 keep=4）。
- 3840×2058 无头截图（v13-moon-3840.png，--moon-x:-88% 居中 expr）：月海
  大空洞纯黑、岸线致密亮边显形、亮带 1/3 钛蓝冷闪可辨。
- 坑存档：--moon-x 是 translateX 语义（% 相对球自身宽度），10% 在 3840 下
  并不居中（右切 150px）；居中 3840 需 -88%（≈-1320px）。
  expr-center-globe.js 已改存 Temp/palis-shot/。
- 可视预览窗口已重拉（1600×950 --app，palis-preview-profile）。

## 23. 过渡动画治理 + 正式发布：双重装配清理与外壳联动接通（2026-08-23）

### 23.1 debug 检查（发布前卫生）
- src 全量 grep：无 console.*/TODO/FIXME/__palisDebug 遗留。
- typecheck 跑不了：本地 node_modules 只有 tsdown，typescript devDependency 未安装
  （不为此装依赖）；tsdown 构建通过，改动均复刻既有路由/CSS 模式。
- 桌面端隔离名单 disabled-bundles.json 不存在——palis 从未被故障隔离。

### 23.2 过渡动画：三层 CRT + intensity 档位全部平滑化
- 原状：noise/scan/vignette 三层按 on/off 属性选择器增删伪元素 → 开关瞬灭瞬现；
  intensity 切未注册 CSS 变量 → 浓度突变。
- 方案：① 三层常驻 + opacity × 开关变量（--palis-*-on）门控 → on/off 走 opacity
  渐变；② 三个浓度变量注册 @property <number> 挂进 html transition → intensity
  切换变量插值（background rgba 里的 var() 引用跟着渐变）；③ 标题辉光 text-shadow
  过渡。降级路径：@property 不支持 → 退回瞬时（与旧版一致），零回归。
- 验证（无头 CDP 计算样式断言）：transitionProperty 三项注册 ✓；noise off 终值
  2.46e-06、on 方向抓到中间值 0.0341 ✓；intensity low→high 抓到插值 0.0401
  （.015→.0401→.045，符合贝塞尔快攻缓收）✓。headless 首帧延迟约 40-60ms
  （起步采样不变是时机问题，非过渡缺失）。

### 23.3 停用选项真相与双重装配清理
- 用户问"插件设置里没有停用选项"：官方「设置→插件→插件列表」是刻意只读的
  清单（dsh-client-ui-settings-plugin-inventory，只渲染徽标）；super-injector
  页只有卸载——**UI 层对任何插件都没有停用开关**，不是 PALIS 缺陷。
- 发现真问题：palis-theme-panel 双重装配（profile bundles + super-injector
  registry.json 2026-08-21 注入条目）；注入器对账会把官方 entry 标 disabled，
  列表徽标显示"已停用"但主题照跑——用户困惑的来源。
- 处置：registry.json 移除 palis（备份 Temp/palis-shot/registry.json.bak），
  保留官方 bundles 装配；两个 cordis.patch.yml 检查过无 disabled 落盘。
- 停用正路：① PALIS 面板 POWER / Ctrl+Alt+P / 浮动按钮 = 皮肤级开关；
  ② cordis 级停用：profiles/web/cordis.patch.yml 加 `- id: palis-theme-panel` +
  `disabled: true`，watcher 热生效免重启；③ 外壳皮肤切出 palis 即联动关主题。

### 23.4 外壳皮肤联动：/api/palis-theme 路由接通
- 桌面端 main.js pushThemeToKernel（L1095）：外壳皮肤切入/切出 palis 及内核
  ready 时 POST /api/palis-theme {theme:'palis'|''}——为内置扁平插件 palis-theme
  预留的契约（resources/plugin/palis-theme/ 不存在），启动 push 一直 404（静默）。
- 外壳 settings.json 当前 theme=palis → 接路由无回归风险（push 只会保持 on）。
- host 半侧实现同契约路由：POST → face.update({enabled})；GET → 当前主题态；
  回环门禁与既有 API 一致。client 初始化 apiGet 拿最新态（启动同步场景闭合）。
- 验证：4799 POST/GET 往返全对；桌面端重启后 kernel.log 404 消失、8772 两端点 ok。

### 23.5 发布动作
- npm pack → dsh-local-palis-theme-panel-0.1.2.tgz（138KB；0.1.0.tgz 60KB 先例在）。
- web profile bundles 直读工作区 lib（link），预览内核 4799 与桌面端（8772）
  双双跑上 0.1.2；桌面端重启 = 发布完成态。
- git：`release: v0.1.2` ab3e9f0（7 文件 +1386/-193）已推 origin/main
  （2adfb93..ab3e9f0）；tgz/lib 走 gitignore 不入仓。
- 遗留：dsh-desktop BUILTIN_PLUGINS 里的 palis-theme 槽位（resources 缺目录，
  自动跳过）是另一条单文件扁平内置路线，本次未走——bundle 路线已验证够用。

## 24. 满月揭示「闪烁」根治：揭示滑动与布局大换血解耦（2026-08-25）

- **用户报修**：侧边栏收起/展开界面闪烁。前一轮已修 better-sidebar 右栏联动左栏
  的误窄屏问题（fork 1f44e31，v0.15.3）；闪烁仍存。
- **实机帧流取证**（真实桌面 app + CDP screencast 200 帧 @合成器节奏）：
  左栏收起动画窗口内捕获**单帧全屏亮度突刺 +8.7**（26.9→35.6→26.9）——一帧
  亮月帧紧接正常暗月帧。帧对比（亮度分块定位）：亮区在月球下半盘；裁剪对比确认
  「闪帧 = 月球无遮光层的裸亮形态」。
- **判别链**（层层排除）：
  1. will-change 缺失 → 加入后突刺减半（35.6→29.5 尖峰，+8.7→+6.2）——层提升
     竞态是**部分**原因，方向正确未消除；
  2. `getBoundingClientRect` 逐帧采样显示位移「步进」——随后补测
     PerformanceObserver longtask = **零长任务**，且与 better-sidebar 面板
     做同帧双曲线对照：面板与月球**同一帧同步步进** → 步进是采样 API 对合成
     动画的固有滞后伪影，不是动画卡顿；主线程没有饱和；
  3. **最终定性**：闪帧是「月球滑动 × 布局列宽过渡」同窗口运行时的合成竞争
     （大换血帧 月球子层/画布晚一帧上图）。
- **修复（双管齐下，非补丁）**：
  - `theme-core.ts` `.palis-globe` 加 `will-change: transform` 常驻——合成层
    在动画前就存在（与 better-sidebar 面板 2758f3d 同款层提升修复模式）；
  - **揭示方向（滑入）挂同长 transition-delay**（`--ds-transition-duration-slow`）：
    月球等布局列宽过渡落定后在安静帧上滑，与侧栏收放完全错峰；隐藏方向不延迟
    （开侧栏立即收月——延迟只加在 `html[data-palis-moon="full"]` 规则的 transition）。
- **验证**（真实桌面重启后同法 screencast）：修复后全窗口亮度曲线**零突刺**；
  月球揭示仍旧到位（帧流 late 帧 = 完整满月）、隐藏即时响应；此前左栏稳定
  回归保持。月球位移仍经 `--moon-x`（状态只有 hero/full 两档，改造为直接
  transform 值的路线未做——延迟方案已闭环且零回归）。
- **坑**：①bash 双引号里的反引号会被命令替换吃掉（CHANGELOG 一段被吃，python
  修正）——含 markdown 反引号的文本写入一律用 Write 工具或 python；②screencast
  是 jpeg 有损编码，闪帧虽为真实帧但**单帧数据要先跨帧互证**（三帧对比+亮度
  分块）再下结论；③测合成动画的平滑度不能用 getBoundingClientRect 采样（主线程
  滞后采样），要用 longtask + 多次独立测量交叉验证。

— 署名：ox-alpha（2026-08-25）

## 25. 侧边栏收放「闪」最终定案：声纳逐帧重布局把 ping 环插值顶爆（2026-08-25）

- **用户精确定位**：左栏收放→界面中间上下闪；右栏收放→右下角闪；问「是不是球体
  移动的问题」。
- **活体二分（最终取证手段）**：在真实页面对候选层逐个 `display:none` + 快速连点
  toggle + screencast 角落区域亮度分析：隐藏 `palis-sonar`+星场 → **零尖峰**；
  仅藏星场（声纳在）→ **7 次尖峰**（角落飙至 122 亮度）——**闪的元凶 = 声纳
  （.palis-sonar），不是球体**（球体移动只是同时发生的背景现象）。
- **机制**：声纳的 `ResizeObserver` 观察滚动体——侧栏收放的布局列宽过渡让滚动体
  **每帧 resize** → `layoutSonar` 每帧重设几何（含 ping 环 width/margin）→ 被 CSS
  `palis-sonar-ping` 动画驱动的环在最坏瞬间被插值成整盘爆亮；
  另：`scanWave` 的 waveBoost 吃 DOM 突变计数（`waveMutations/24`），侧栏突变风暴
  会误飙波动条振幅（同源问题一并记录）。
- **修复**：`sonarFreezeUntil` 冻结窗——与月球换牌同一钩子（syncMoonReveal）置
  700ms：期间 `layoutSonar` 直接 return（几何保持过渡前值）、`orbitFrame` 照跑但
  不落盘。**验证：修复后快速连点 4 次 toggle，角落尖峰数 = 0**。
- **修复栈回顾**（v0.1.3→v0.1.4 累计）：球体 will-change 常驻 + 揭示改隐身换位交叉
  淡化（纯 opacity 零位移）+ 月球换牌期冻结画布 + **声纳过渡期冻结**（真正根治）。
- **教训（再次验证）**：①captureScreenshot 与渲染同步会**跳过闪帧**，只有 screencast
  （合成器帧流）能取证；②整屏平均亮度掩蔽局部闪——必须区域级分析；③活体二分
  （逐层隐藏+同方法复测）是定位渲染类 bug 的最快路径；④「看起来相关」≠因果——
  球体与闪同时发生让我带偏多轮，二分法一锤定音。

— 署名：ox-alpha（2026-08-25）

## 26. 回滚错误的「交叉淡化」+ 声纳 ping 环阈值门（2026-08-25）

- **用户反馈**：v0.1.4 还闪且更快，且月球滑动过渡没了。
- **分析**：v0.1.4 的「隐身换位交叉淡化」把用户喜欢的滑动换成 0.35s 快速明灭——
  本身被感知为「闪」；且声纳冻结只有 700ms 窗口，窗口结束后 layoutSonar 的
  单次大重尺寸仍是残余风险。
- **修复（v0.1.5）**：
  1. **恢复月球滑动**：transform 改**直接状态值**（默认/hero/满月三档各写完整
     transform，不再 var(--moon-x) 组合——组合值过渡在本机插值步进）；
     `transition: transform .24s` 照旧；
  2. **声纳 ping 环阈值门**：构建期定型一次 + 仅在增量 >40px 时重设
     width/margin——6.4s 无限动画元素被逐帧改样式是闪的最终根因（WORKLOG 25），
     阈值门从机制上消灭（不再依赖 700ms 冻结窗口单点防护）；
  3. 保留：月球换牌/滑动期画布冻结 + 声纳过渡期冻结（双保险）。
- **验证**：快速连点 4 次 toggle screencast 角落尖峰数 0；月球滑动曲线恢复平滑
  （967→367 缓出 ~300ms）。
- **教训**：用户感知的「闪」= 动画质感本身；「恢复+保留正确部分」比「叠加修复」
  重要——每次改动前先问这个改动是否本身就是交互回归。

— 署名：ox-alpha（2026-08-25）

## 27. 信号门控与帧预算优化（2026-08-25，用户「好点了，继续优化」）

- **waveBoost 流式门控**：突变计数只在 `[data-streaming]` 在场时计入波幅——
  侧栏收放等结构性 DOM 突变风暴曾会误抬波动条振幅（排查闪时定位的同源信号污染）。
- **星场隔帧重绘**：240 星 60fps 全量清屏+重绘 → 隔帧（30fps）——闪烁差异人眼无感，
  释放主线程（侧栏布局/月球滑动帧更稳：>120px 步进 2 帧→1 帧）。修正过一版 dt
  时序 bug（先置 starLast 再取 dt=0 → 星星不漂）。
- 验证：快速连点 4 次 toggle，角落尖峰数 0（无回归）。

— 署名：ox-alpha（2026-08-25）

## 28. 过渡动画顺滑化（2026-08-25，用户「让过渡动画更顺滑流畅一点」）

- **令牌**：`--ds-transition-duration-slow .24s→.3s`、fast `.08s→.1s`、
  `--ds-ease-in-out` → `cubic-bezier(.4,0,.15,1)`（标准柔和加减速，起步收尾都优雅；
  主题级令牌，侧栏面板/声纳/月球一致受益）；
- **揭示方向 100ms 起步延迟**（full 规则自带带 delay 的 transition）：滑入等布局
  列宽过渡猛冲段过去再动；隐藏方向保持即时。
- **实测**：滑动 25 帧（原 13-19）、单帧最大步进 108px（原 139）、>110px 突兀
  步进 0（原 1-2）；4 连点 toggle 尖峰 0。

— 署名：ox-alpha（2026-08-25）

## 29. 卡顿根治：CRT 扫描频带拆独立层（transform 动画），帧预算双指标归零（2026-08-25）

- **用户**：「侧边栏展开收起时有卡顿感」。
- **元凶**：`html::after` 全屏 CRT 覆盖层带 `palis-crt-sweep 11s linear infinite` 的
  **background-position 动画**——全视口背景位置逐帧重绘，永不停歇地与所有
  过渡动画抢帧（即使 on/off 切换，动画层常驻）。
- **修复**：频带拆到 client 注入的 `.palis-crt-sweep` 独立固定层（240% 高渐变带 +
  `transform: translateY` 动画，合成器友好零逐帧绘制）；`html::after` 只留静态
  扫描线。挂载/拆卸接线进 runtime effect（与 moon/星场同模式）。
- **量化**（页面侧 rAF 帧间隔卡顿表，3 连点 toggle）：
  修复前一帧间隔最大 ~139ms 级步进（滑动曲线佐证）；修复后 **214 帧平均 8ms、
  最大 24ms、>26ms 掉帧 0、>34ms 0**——零卡顿。闪回归尖峰 0。
- **新工具**：`backups/session-repair/jank-meter.cjs`（rAF 帧间隔表：avg/max/
  drops>26/34），帧预算问题从此可量化、可回归。

— 署名：ox-alpha（2026-08-25）

## 30. 月球旋转衔接：画布冻结退役 + 滑动旋转增强（2026-08-25，用户「球的旋转顿一下」）

- **用户**：左右侧栏收放时球的旋转要「顿一下才接上」。
- **根因**：v0.1.4「防闪画布冻结」——翻转后 700ms 内引擎不重绘（角度照常走、
  纹理不动），解冻时一次跳变 ~2.5° = 顿。闪的真源（声纳 ping 环阈值门）已修，
  画布冻结属过度防护，**退役**。
- **增强**：`moonSlideBoost`——揭示/隐藏翻转时自转 +3×（指数衰减 0.97/帧，
  ~1.2s 回落），滑动自带「甩一下」的动感；与活动 boost（globeHeat）叠加。
- **验证**：闪回归 0 尖峰；卡顿表 avg 11ms / max 28ms / >34ms 0（增强旋转的
  瞬时成本 3 帧 26-28ms，可接受）；旋转全程连续（无冻结窗口）。

— 署名：ox-alpha（2026-08-25）

## 31. 侧边栏动效疑难排障档案（闪/卡顿/旋转/衔接 四症一案，2026-08-25 收官补写）

> 本节的定位：把 §24-30 的逐轮记录浓缩成「问题→根因→修法→验证→坑」一案档案，
> 供后续任何动效/渲染问题对照复用。四症同源相扣，牵一发动全身，故一案合述。

### 症一：「闪」（单帧整盘亮溃）

- **现象**：侧栏收放时画面单帧爆亮（左栏→中央上下带、右栏→右下角；亮度 +25~+90）；
  快速连点交替爆亮成频闪。
- **根因（分层，最终层才是真凶）**：
  1. 声纳 `.palis-sonar` 的 ResizeObserver 在布局过渡期**逐帧重设 ping 环
     width/margin**——被 `palis-sonar-ping`（6.4s 无限动画）驱动的环在最坏瞬间
     被插值成整盘爆亮。**真凶**；
  2. `transform` 用 `var(--moon-x)` 组合值过渡——本机插值步进/振荡（次因，
     已顺带修）；
  3. 早期误判「球体合成竞态」导致的 will-change/延迟/canvas-shade/冻结/交叉
     淡化——多为过度防护（见「误判教训」）。
- **修法**：ping 环**构建期定型 + 增量 >40px 才重尺寸**（阈值门，机制性根除）；
  transform 改**直接状态值**（默认/hero/满月三档各写完整 transform）；月球换牌期
  画布冻结与声纳 700ms 冻结窗保留为双保险。
- **验证**：快速连点 4 次 toggle，screencast 角落/中央区域亮度尖峰 **0**。
- **坑**：①`captureScreenshot` 与渲染同步会**跳过闪帧**，只有 `Page.startScreencast`
  （合成器帧流）能取证；②整屏平均亮度掩蔽局部闪——必须**区域级**（中央带/右下角）
  分析；③「看起来相关」≠「因果」——球体与闪同时发生带偏了多轮排查。

### 症二：「卡顿」（收放全程帧率掉）

- **现象**：收放侧栏感觉顿挫；月球滑动曲线出现 90-139px 单帧步进（掉帧）。
- **根因**：`html::after` 全屏 CRT 覆盖层的 `palis-crt-sweep 11s` 无限
  **background-position 动画**——全视口逐帧重绘，永不停歇与所有过渡抢帧。
- **修法**：扫描频带拆到 client 注入的 `.palis-crt-sweep` 独立固定层
  （240% 渐变带，**transform 动画**，合成器友好）；::after 只留静态扫描线。
- **验证**（jank-meter 帧间隔表）：3 连点 toggle 214 帧平均 8ms、最大 24ms、
  **>26ms 掉帧 0**。
- **坑**：background-position 类动画是「隐形抢帧者」，查卡顿先扫一遍全屏层的
  `animation` 是否动了 paint 类属性（background-position/color/filter）。

### 症三：「旋转顿」（球的旋转要顿一下才接上）

- **现象**：收放侧栏后月球自转停顿 ~0.7s 再跳变接上。
- **根因**：防闪的**画布冻结**——翻转后 700ms 不重绘（角度照常走、纹理不动），
  解冻时一次跳变 ~2.5°。
- **修法**：冻结退役（真闪源已根治）；补**滑动旋转增强** `moonSlideBoost`：
  翻转时自转 +3×（0.97/帧指数衰减 ≈1.2s），滑动自带甩动感。
- **验证**：闪回归 0 尖峰；avg 11ms / max 28ms / >34ms 0；旋转全程连续。
- **坑**：任何「防护性冻结」都有滞后代价——防护根因消亡后要及时摘除，否则
  防护本身变成新 bug 源。

### 症四：「衔接/顺滑」（过渡质感）

- **优化**：缓动令牌 `--ds-ease-in-out` → `cubic-bezier(.4,0,.15,1)`（标准柔和
  加减速）；慢时长 `.24s→.3s`；月球滑入 **100ms 错峰起步**（等布局列宽过渡的
  猛冲段过去，安静帧上滑）；滑出保持即时。
- **验证**：滑动 25 帧（原 13-19）、单帧最大步进 108px（原 139）、
  >110px 突兀步进 0；卡顿双指标全绿。
- **经验**：动效调优三抓手——时长、缓动、错峰（decorrelate）。主题的过渡令牌
  集中在 `html[data-palis-theme]` 一处（`--ds-transition-duration-*` +
  `--ds-ease-in-out`），调一处全链一致受益。

### 方法论沉淀（对任何动效/渲染问题复用）

1. **取证**：screencast 抓合成器帧流（闪/掉帧真相）；captureScreenshot 不可信。
2. **量化**：jank-meter（rAF 帧间隔表：avg/max/>26ms/>34ms）测卡顿；
   regional 亮度曲线测局部闪；globe-raf2（rAF 位移曲线）测动画平滑度。
3. **定案**：活体二分（逐层 `display:none` + 同方法复测）——渲染类 bug 最快；
   longtask 探针排除主线程饱和；双曲线对照（同帧同步步进=采样伪影排除）。
4. **回归**：每轮改完同时跑 闪尖峰 + 卡顿表 + 滑动曲线 三项。

### 误判教训（最值钱的一段）

- 「球体移动」是**相关而非因果**：把闪归因于月球后连续五轮手术
  （will-change/揭示延迟/canvas-shade/冻结/交叉淡化）——真实根因是声纳。
  教训：渲染类 bug 第一刀先用活体二分，不要把「同时发生的现象」当根因。
- 「交叉淡化」把用户喜欢的滑动换掉 = 交互回归（用户感知的「闪」= 动画质感
  本身）。教训：动效改动前先确认「这个改动本身会不会被感知为回归」。
- 排查要有**跨帧互证**：单帧数据（亮闪帧）要三帧对比+分块定位后再下结论；
  单帧数据也可能来自编码器（screencast 为 jpeg 有损）。

— 署名：ox-alpha（2026-08-25）

## 32. 架构审查修正：CRT 层生命周期契约对齐 + host 变更轮询同步（2026-08-25）

- **架构审查发现两处真实缺陷**：
  1. `applySettings` 的 ensure* 家族（globe/wave/sonar 均内建 enabled=false 摘除
     路径并在 applySettings 统一调用）漏了新加的 `ensureCrtSweep`——主题禁用后
     扫描频带层残留 DOM（靠 CSS 摘除才不显形，纯巧合非契约）。修：补进家族，
     禁用摘除/启用挂载走同一入口；
  2. **host 侧变更推不到已打开页面**：外壳切皮肤 POST /api/palis-theme 只写 host
     设置；客户端仅启动 apiGet 一次（「兼容轮询语义」是预留从未接线）——已打开
     页面要等重载才反映主题开关，多标签页的面板写入也互不可见。修：客户端
     revision 轮询（2s），变了才回读全量 applySettings；面板自身写入同步本地
     revision 故对自身 no-op。
- **验证**：POST theme:'' → ≤3s 内 sweep 层自动摘除（不重载）；theme:'palis' →
  自动挂载；双向均过。

— 署名：ox-alpha（2026-08-25）

## 33. 安全审查第二轮：回环校验改对端地址（2026-08-25）

- **漏洞**：`isLoopbackRequest` 校验的是 Host 请求头（客户端可任意伪造）——
  注释声称「LAN 绑定下也不暴露设置面」，但 LAN 攻击者带 `Host: 127.0.0.1`
  即可绕过，设置面（主题开关/面板 API）全暴露。
- **修法**：以 `req.socket.remoteAddress` 为准（不可伪造），接受
  127.0.0.1 / ::1 / ::ffff:127.0.0.1。当前内核绑定 127.0.0.1 下行为不变；
  若未来 LAN 绑定则真拦截。
- 教训：**访问控制永远校验连接对端身份，不校验客户端自报的头**。

— 署名：ox-alpha（2026-08-25）

## 34. ASCII 取景框系统 + 细节打磨批（2026-08-25，用户「加入更多 ascii 风格元素」）

- **新增 ASCII 元素**（全部走稳定契约，零哈希类名）：
  1. **取景框层** `.palis-frame`（client 注入 ensure* 家族）：四角 L 形裁切标记 +
     角落铭牌（SYS//09A-C2 / ARCHIVE TERMINAL / REC●）+ **左下 SCROLL 深度读数**
     （`SCROLL 042% ▕██████░░░░▏`，window capture scroll + rAF 节流，惰性定位
     会话滚动容器）——「整页是一份被归档观测的记录」的取景器语义；
  2. **会话区磁带尺**：滚动容器 ::before 顶部刻度带（24px 间距 tick）+
     ::after「SECTOR 09A-C2 // TAPE START」铭牌（随内容滚走=档案带头）；
  3. **Composer 标签耳 + 角括号**：IN//09A 铭牌压 accent 顶边 + 四角 L 括号
     （8 组 linear-gradient 拼角，伪元素空闲已确认）；
  4. **球体地面轨道尺**：geo::after 盘底下缘刻度带（25px tick + 中点游标 +
     GROUND TRACK 铭牌）——「球在尺上被观测」；
  5. **开机自检仪表行**：GROUND TRACK ..... LOCKED / VIEWFINDER [██████████░░] ARMED。
- **满月曝光增益**：揭示态 `filter:brightness(1.6) contrast(1.1)`——半弧黑底
  调的 0.32 曝光在整盘居中时太暗（实测采样 avg alpha 40），揭示态提亮后
  月面点云（月海点阵/高地/蓝卫星）清晰可读。
- **验证**：隔离实例截图（art-desktop.png 半弧态 / art-fullmoon.png 满月态）
  全元素就位；卡顿表 avg 9ms / max 24ms / 零掉帧；闪回归零尖峰。
- **坑**：①测试实例外壳皮肤=deep 时，v0.2.1 新加的轮询会在启动 2s 后把主题
  关掉（皮肤联动终于真正生效）——美术验证须先把实例皮肤设为 palis；②TS 模块级
  可变量在 rAF 回调里失去 null 收窄——回调开头先存局部常量。

— 署名：ox-alpha（2026-08-25）

## 35. tmux 式底部状态栏（2026-08-25，用户「继续迭代」）

- **新增**：`.palis-statusbar` 底部 22px 状态栏（client 注入 ensure* 家族 +
  1s 钟）：`▲ PALIS 09A` 蓝色品牌段 / `PHASE:HERO|CHAT`（读 [data-phase]）/
  `UTC 真时钟` / `SCROLL 深度仪表条`（原取景框 bl-read 迁入）/ `●LIVE ○IDLE`
  （data-palis-activity 驱动，流式时红字闪烁+品牌段变红）/ `ARCHIVE TERMINAL ·
  REV 09A` 版本段。
- **配套**：会话滚动容器 padding-bottom 26px（末条消息不被栏遮挡）；面板
  titlebar 加 REV·09A 铭牌。
- **验证**：截图全段就位（UTC 走秒、IDLE 默认显示）；卡顿表 avg 9ms（单帧
  36ms 一次性毛刺）；闪回归零尖峰。
- **坑**：①TS 源里的字面 `\u2555` 转义序列在 python 补丁里必须用 raw 串匹配
  （真实 unicode 字符匹配不上——两次失败后用 Write+raw 才对齐）；②CTP 截图连
  错页面（urlPart 为空匹配到第一个 target）——多页面实例必须带端口片段。

— 署名：ox-alpha（2026-08-25）

## 36. 磁带走带系统 + 卡顿回归修正（2026-08-25，用户「继续迭代」）

- **磁带走带**：磁带尺加「播放头」——滚动时蓝色游标滑到滚动比例处（档案带在走的
  隐喻）；状态栏 SCROLL 段叙事化：0% 显示 TAPE//START、100% 显示 TAPE//END
  （蓝色高亮）、中间显示百分比仪表条。
- **Hero 任务铭牌**：EXPEDITION // 09A — ARCHIVE OBSERVATION（居中顶部）。
- **会话头双线规**：header 底部主线 + 微光副线。
- **卡顿回归 + 修正**：首测发现变量写入（--palis-playhead-x 设在滚动容器上）
  导致全子树样式重算=11 帧 >26ms——修正：播放头改 **DOM 元素 + transform**
  （合成器移动零重算，与 CRT 频带同教训）。修正后 avg 9ms / max 34 / >34ms 0。
- **教训**：CSS 自定义属性设在滚动容器上=全子树继承失效重算；动效变量一律
  transform/compositor 通道（第三次验证同一条铁律）。

— 署名：ox-alpha（2026-08-25）

## 37. ASCII 细节批：Tool 边框 + 光标 + Hero 网格 + 计数器（2026-08-26）

- **Tool 结果块虚线框**：`border:1px dashed` + 左侧 2px 蓝边——「施工围挡」语义；
- **状态栏光标闪烁**：版本段末尾 `▊` 0.8s steps(1) 闪烁（终端光标感觉）；
- **Hero 坐标网格**：欢迎屏 56px 极淡蓝点阵网格（航海图坐标纸质感）；
- **Composer 字符/行计数器**：状态栏新增 LN/CHR 段，capture input 监听实时更新；
- **验证**：截图全元素就位（状态栏 LN/CHR 段可见、Tool 边框待有内容时确认、
  Hero 网格可见、光标闪烁 CSS 周期正确）；卡顿 avg 9ms。

— 署名：ox-alpha（2026-08-26）

## 38. 细节打磨：侧栏刻度 + 播放头三角 + playhead CSS 修正（2026-08-26）

- **侧栏右缘刻度线**：内核 sidebarCol 展开时右缘 7px 等距刻度（28px 间距，1px
  线条 rgba(.08)）——侧栏与对话区之间的「接触面」刻度；
- **播放头三角标**：磁带播放头 ::after ▼（指向当前读位下方）；
- **playhead CSS 修正**：此前 python 替换把 background/will-change 误落到 ::after
  上（主体丢失背景色+will-change）——已修正回主体声明。
- **验证**：全元素就位；回归 avg 10ms / max 42ms / 零尖峰（与上版持平）。

— 署名：ox-alpha（2026-08-26）

## 39. 流式动效层：内核 shimmer/sweep 的 PALIS 诠释（2026-08-26，参考桌面版内核模式）

- **参考来源**：内核 conversation UI 有三种精彩动效模式——
  ①turn-status-shimmer（background-clip:text + background-position 扫过文字）；
  ②reasoning-row-sweep（左侧高亮条从 -300px 横扫至 100%）；
  ③input-pending（脉冲点 0.35→1 交替）。这些都是内核正式 UI 已在用的模式。
- **PALIS 诠释**：
  1. **[CLERK] 标签流式闪烁**——activity=on 时，[CLERK] 标签文字从纯色切换为
     background-clip:text 闪烁模式（PALIS 灰白→蓝 → 灰白渐变扫过文字）；
  2. **[TOOL] 行扫描**——activity=on 时，tool-call 行出现一个 120px 宽的蓝色
     高亮条从左侧横扫至右侧（与内核 reasoning-row-sweep 同参数 2.6s ease-out）；
  3. 两者仅在 `data-palis-activity="on"` 时启用——非流式状态零开销。
- **验证**：隔离实例全元素就位；卡顿表 avg 9ms / max 26ms / 零掉帧；
  闪回归零尖峰。

— 署名：ox-alpha（2026-08-26）

## 40. Markdown 内容主题化（2026-08-26，用户「继续」）

- **思路**：内核 markdown 渲染用 CSS modules 哈希类（红线不碰），但稳定锚点
  `[data-chat-flow]` 可以做后代选择器匹配 HTML 标签（pre/blockquote/table/a/hr/ul）。
- **实现**：代码块（暗底+蓝边+左蓝条）、行内代码（蓝底暗字）、引用块（左蓝粗条+
  斜体）、表格（方角+表头蓝底）、链接（虚线下划线+hover 实线）、HR（虚线）、
  列表（`>` prompt 前缀+蓝 marker）。
- **验证**：实测行内代码背景色和链接虚线下划线已生效（当前页面暂无 pre/blockquote，
  选择器已就位出现即生效）；回归 avg 9ms（正常）。

— 署名：ox-alpha（2026-08-26）

## 41. 状态栏信息密度提升（2026-08-26，用户「继续」）

- **新增段**：`SES:会话名`（chat 态显示，hero 隐藏；蓝色，超长截断）+
  `MDL:模型名`（从 composer 模型选择器读取，灰色）。
- **1s 钟扩展**：UTC/相位/会话名/模型名 同一 interval 内更新。
- **CSS**：新段颜色/截断规则；会话名蓝色 #7a97e8、模型名灰色 #9c9c9c。
- **验证**：隔离实例截图确认全段就位（含 SES/MDL 段）；jank avg 9ms / max 31ms。

— 署名：ox-alpha（2026-08-26）

## 42. 声纳星系波纹降权（2026-08-31，用户「继续」）

- **问题**：声纳层（中心星系波纹：ping 扩散环 ×3 + 旋转虚线环 ×6 + 行星公转 ×9）
  静默态基色已亮、活动态更是一键全拉满（ping 峰值 .95、周期 2.3s、辉光 30px、
  环透明度 .62-.78、旋转 boost 到 4×）——视觉比重和右侧月球接近，动效同开时
  互相抢戏、整体凌乱。
- **设计语义修正**：月球是数据天体=主角，声纳是观测氛围=配角；配角活动态
  "略活跃"即可，不允许与主角对等。
- **CSS 降权（theme-core.ts）**：
  · ping 环：border .70→.42、辉光 30px/.3→18px/.16、峰值 --pk .58→.42；
    活动态峰值 .95→.60、border .95→.62、周期 2.3s→4s（延迟 .77/1.53→1.33/2.67）；
  · 旋转环：静默基态 opacitiy .5/.42/.4/.38/.36→.34/.30/.27/.25/.23，
    活动态 .78/.68/.62/.58/.55→.50/.44/.40/.36/.33；
  · 中心呼吸点：.5→.4，活动态 .95→.70（1.1s→1.8s）；
  · 行星点：亮底 .65→.5、光晕 8px→6px、透明度 .92→.78；活动态 1→.85。
- **JS 降权（client/index.ts）**：活动态旋转 boost `1+3×orbitHeat`→`1+1.2×orbitHeat`
  （最大 4×→2.2×：行星公转/环旋转只许略活跃）。月球自身活动提亮未动。
- **验证**：内核重启后实测计算样式全中（静默 --pk .42/环 .34..23/行星 .78；
  活动 --pk .60/4s/环 .50..33/行星 .85）；双态截图（verify-out/
  sonar-weaken-idle.png / -active.png）确认声纳退为暗衬、月球点云球体保持
  唯一主视觉。
- v0.4.3 已发布（tag v0.4.3）。

— 署名：ox-alpha（2026-08-31）


## 43. v0.4.4 美术构成扩充：打破「点+圆+横线」的单一构成（2026-09-02，用户「构成元素还是有些单一」）

### 43.1 设计诊断
- 盘点既有美术构成：全部元素只有三类——**点**（月面点云/星尘/网点）、**圆**（轨道环/声纳/
  HUD 环）、**横线**（刻度尺/扫描线/状态栏）。构成单一感来自元素类的匮乏，不是数量不足。
- 原则沿用既有纪律：新元素必须安静（低透明度、落空区、不抢内容视线 §8d）、
  全部静态或 transform 合成器动画（§29 帧预算铁律，零 paint 类动画、零逐帧 JS）、
  走稳定契约挂 [data-phase] 负 z 层、artwork 门控、reduced-motion 有降级。

### 43.2 新增四类构成（.palis-glyphs 层，client ensure* 家族）
1. **竖排幽灵大字 PALIS·09A**（排版类）：会话列左侧 gutter 空带，`writing-mode:
   vertical-rl + text-orientation:upright` 逐字直立堆叠，描边空心
   （-webkit-text-stroke rgba .09），font-size 5.8vh 流体跟随视口。
2. **等高线地形碎片**（有机曲线类，对完美圆环）：三峰嵌套闭合轮廓 SVG（主峰 6 圈 +
   两小峰）+ 中心测量十字 + 「TERRAIN // REL 240M」铭牌。关键配方：扁长肾形轮廓 +
   **逐圈偏心错位**（真等高线不是同心缩放副本——同心缩放在视觉上读作靶心/声纳环，
   与圆形系统撞类；偏心嵌套才读得出"山"）。
3. **测量十字 + 编号坐标 ×6**（散布测点类）：PT-01..PT-06 + 坐标/扇区微标签，
   按宿主 % 流体定位（gutter ×2 / 顶部带 ×2 / 月球区 ×2——测点压在天体上 = 观测语义）。
4. **右缘 hex 数据流**（流动文本类）：视口右缘 20px 竖列 4 位 hex 组缓速上滚
   （120s 无缝循环，内容复制一份 translateY(-50%)），上下端 mask 渐隐（胶片边缘码语义）；
   活动门提速 42s；RM 静止（CSS media 分支）。

### 43.3 既有层升级两处
- **星尘 → 星座连线**（drawStars 重构为 移动→连线→画点）：近邻 <110px 且每星
  ≤2 条的极淡连线（alpha .08 / 活动 .13，0.7px），星点缓漂使星座缓慢重构；
  连线画在星点之下。横向环绕复位的星 |dx| 必然 >110 不会误连出横贯线。
  实测 3840×2058 下 ~116-125 条；微基准 **0.076ms/帧**。
  （注：逐帧贪心重选算法已在 §44 被「持久配对 + 滞后带」替换——贪心重选本身是频闪源。）
- **声纳方位读数**：最外轨道环（r=430）外缘 20px 四正点 000°/090°/180°/270°
  （仪表语言，固定不随环转——环是不规律交替转的，度数固定更像测量仪）；
  layoutSonar 按 S 定位（随阈值门/冻结窗同一纪律）；用 <n> 元素不占
  <i>/<s>/<u> 的既有选择器序位（ping 环 nth-child 延迟不受影响）。

### 43.4 接线与门控
- glyphs 层由 ensureGlobe() 统一驱动（同门 enabled+artwork、同宿主 [data-phase]、
  宿主更换自动重挂）；effect 拆卸路径同步清理。CSS 全部进 PALIS_CSS（首帧注入同源）。
- 声纳度数标记随声纳生命周期（enabled+artwork+!RM 门）。

### 43.5 验证
- `verify-glyphs.mjs`（headless CDP，3840×2058 贴用户实机 + 1920×1080 回归）全过：
  glyphs 6 元素就位、ghost rect/描边/字号正确（3840→119px / 1920→63px）、
  topo 12 path、数据流 transform 两采样点间位移变化、活动门 120s→42s + 读数提亮、
  点云 20923 / 星 240 / 连线 116+、度数标记 4 枚且定位 = 0.43·S+20 像素级吻合。
- 帧预算归因（`verify-glyphs-jank.mjs`，软件光栅化环境只看差值）：连线 JS 循环
  0.076ms/帧；glyphs/星场增量在环境噪声带内（±7ms）；绝对值高是 --disable-gpu
  软件渲染假象（全屏 canvas 层光栅化），真机 GPU 合成下静态层零成本。
- 侧栏交互回归 `verify-motion.mjs`：功能项全过（toggle 往返/中段 matrix/交叉淡化）；
  顺手修正该脚本三条 §9 时代的过期断言（.24s→.3s、旧缓动→新缓动）——非本轮回归。
- 截图：verify-out/glyphs-3840.png / glyphs-1920.png。
- 交付：预览内核 4799 重起（host 首帧注入刷新）+ Chrome --app 可视窗口
  （2560×1400，palis-preview-profile）拉起，保持运行由用户自关。

### 43.6 发布
- 版本 0.4.4（package.json + CHANGELOG；CHANGELOG 顺带补记 0.4.3 声纳降权条目）。
- lib 已重建（桌面端经 profile link 直读，重载页面即生效）。

— 署名：ox-alpha（2026-09-02）

## 44. 闪烁根治：星场 resize 重撒 + 连线逐帧重选双病灶（2026-09-02，用户「现在又出现闪烁bug了」）

### 44.1 根因（机制探针实锤，非猜）
v0.4.4 交付后用户即报侧栏收放时背景频闪。`verify-flicker-mech.mjs`（headless 贴 4799，
两次收放全程采样）实锤双病灶：
1. **resize 重撒**：星场 ResizeObserver 观察 [data-phase] 宿主，侧栏布局过渡逐帧触发
   → 逐帧 `canvas.width=`（按 spec 清空位图）+ 旧 seedStars **全量重撒随机坐标**。
   实测一次收放 **widthChanges=15**（15 次清空+重撒）。此缺陷 v0.1.2 星场落地即潜伏，
   星座连线（§43.3）把它从"散点换位"放大成"整网重连"的可见频闪。
2. **连线逐帧贪心重选**：每帧按扫描序重新配对，星点缓漂使选择序抖动，
   连线数 41→46→55→58→63→60→… 逐帧生灭 = 星图网络频闪。
- 注意：`verify-flicker.mjs`（区域亮度尖峰分析）对此全程 0 尖峰——它是给旧
  「单帧爆亮」bug 设计的，内容重绘式频闪不抬分区亮度均值，探不到，勿被误导。

### 44.2 修复（全部在 client/index.ts 星场段）
1. **seedStars 重构为 resize 不重撒**：既有星位置保留、出界环绕回场，只按面积目标
   pop/push 调量（新星由 newStar 工厂补入）。
2. **落定防抖**（照抄 §36 波动条 WAVE_RESIZE_SETTLE_MS 先例）：`STAR_RESIZE_SETTLE_MS=160`
   + `scheduleStarResize()`——首帧立即定型，此后 RO 触发只重置 160ms 定时器，落定才
   一次性 sizeStars；过渡窗内由浏览器对旧位图短暂 CSS 拉伸（散点微粒，无感）。
3. **连线持久配对 + 滞后带**：`starLinks: Set<(i<<16)|j>` 跨帧保持既有配对；
   距离 >128px 才断开、<110px 才建立（18px 滞后带防边界抖动反复生灭），每星仍 ≤2 条；
   每帧 prune 减星失效键（Set.forEach 内 delete 当前键安全），计数从 starLinks 重建。
4. dropStarfield 同步清 timer + starLinks。

### 44.3 验证（修复后同探针复测）
- `verify-flicker-mech.mjs`：**widthChanges 15→2**（每次收放只在落定后重置一次）；
  连线数各稳定段内**逐样本恒定**（44 恒定 → 落定一次重配 → 58 恒定），
  对比修复前逐帧 41→46→55→… 的生灭。44→58 的阶跃是正常重配：收放后同 80 星
  （面积下限）压进更窄宿主 = 密度升高 = 配对变多，且只发生在落定瞬间，非频闪。
- `verify-glyphs.mjs` 全项 PASS 防回归（glyphs/topo/数据流/活动门/度数标记/jank 同前）。

### 44.4 经验
- canvas 动效层接 ResizeObserver 的两条铁律：① backing store 重置必须落定防抖
  （波动条 §36 已趟过同坑）；② 内容状态（粒子坐标/配对关系）必须与 resize 解耦，
  重撒随机状态 = 把布局动画转译成内容频闪。
- 「网络/连线」类图形的稳定性 = 配对关系跨帧持久 + 滞后带，逐帧重选最优解在
  运动场景下必然抖（贪心对输入微扰敏感）。

— 署名：ox-alpha（2026-09-02）

## 45. v0.4.5 平面构成补位：「面」与「版式」对粒子/点线（2026-09-02，用户「不能全是粒子效果，也要加入平面设计」）

### 45.1 设计诊断
- §43 补完「点+圆+横线」之后，全层仍是**点阵/线条/文本**三类读感——星尘、连线、
  点云全是粒子语言。平面设计的缺位类是：**块面**（solid plane）与**版式**（grid/swatch）。
- 沿用 §43 纪律：安静（低透明度落空区）、纯静态 CSS（零逐帧 JS，§29 帧预算）、
  挂 [data-phase] 负 z 层、artwork 门控。

### 45.2 新增三类平面构成（.palis-glyphs 层）
1. **错位图版 .pg-plate**（块面类）：实心面（rgba(143,168,216,.07) 蓝灰）+ 描边面
   （rgba .13）套版偏移叠印 + 45° 剖面纹带（repeating-linear-gradient -45deg）+
   铭牌 PL.09A // COMP.04。套版偏移是印刷平面经典手法——一面一描错位 = 套准误差美学。
   位置 right:4% top:20%（右上空区）。
2. **单色色卡阶梯 .pg-swatch**（色块类）：6 灰阶递进（rgba .04→.17）+ 1 暖橙 accent
   （rgba(232,168,159,.40)，呼应星尘暖橙）竖排色条 + 竖排标签 SW.07+1
   （设计系统 swatch / 印刷校色条语义）。位置 left:1.2% top:80%（gutter 下段，
   幽灵大字终点之下、与等高线横向错开）。
3. **栏栅格碎片 .pg-grid**（版式参考线类）：6 竖 + 2 横参考线只露一角
   （两条 repeating-linear-gradient 背景一次成组，零多元素）+ 标签 GRID // 6×2。
   位置 left:47% top:15%（消息列右缘外空带）。

### 45.3 验证与一处实测修正
- `verify-flat.mjs`（headless CDP 双视口）：断言三元素就位、灰阶递进（首格 α < 末格）、
  与 ghost/topo/crosses 矩形零碰撞。
- **实测回归抓到一撞**：色卡标签初版横排（宽 92px），1920 视口下伸进等高线地形块
  （swatchTopo 碰撞 true）——改竖排标签（宽 26px）修复，双视口复测零碰撞。
  教训同 §21：任何流体定位必须 3840+1920 双视口验。
- `verify-glyphs.mjs` 回归 PASS（既有元素无影响）。
- 截图：verify-out/flat-3840.png / flat-1920.png（三元素全帧就位）。

### 45.4 发布
- 版本 0.4.5（package.json + CHANGELOG + README 背景图形条目）。
- lib 已重建（桌面端经 profile link 直读，重载页面即生效）；
  预览窗口重拉交付（palis-preview-profile，2560×1400）。

— 署名：ox-alpha（2026-09-02）

## 46. 闪烁排查第三轮：月球曝光瞬变 + 声纳迟滞跳变（2026-09-02，用户「修一下闪烁」）

### 46.1 方法论：先测量后动刀（本轮新增三件探针）
§44 修完星场后用户仍见闪烁。这轮不再猜——建全层取证链：
1. **verify-flicker-scan.mjs**：页加载前 hook 全部 canvas 的 width/height setter
   （backing reset 记账）+ screencast 8×6 网格帧间亮度波动 + 逐层隐藏二分归因。
2. **verify-flicker-frames.mjs / verify-flicker-closeup.mjs**：录屏帧页内拼版直读
   （mean|ΔL| 分不清「平滑滑动」与「闪」，必须用眼）。
3. **宿主置换探针**：收放前后元素身份比对（[data-phase]/globe/starfield/sonar/glyphs
   全不换、无 DOM 空窗）——排除「宿主被内核重建 → 层重挂载」假设。

### 46.2 初步归因（后被打回）
- 星场已稳：每次收放仅 1 次落定重置（§44 生效），隐藏星场分数不变 = 不再是闪源。
- 扫描把热区波动归因到 globe 层（隐藏后总分 13.8→8.7）——于是做了两刀：
  ① 月球揭示曝光 `filter:brightness(1.6)` 无过渡单帧瞬变 → 把 filter 并入 transition；
  ② 声纳冻结窗「把几何突变推迟到过渡后 = 迟滞跳变」→ 拆冻结，环/度数恢复逐帧跟随。
- 帧拼版里出现的「侧栏文字出现在屏幕右侧」属 headless 软渲染 screencast
  多图层撕裂伪影（几何上不可能），非真机表现——勿据此类帧下结论。

### 46.3 用户指正：定案早就在日志里（「你看一下工作日志，应该有记载」）
重读 §24-§31 排障档案，两刀全部违背已定案的架构：
1. **闪的真凶 = 声纳 ping 环逐帧重尺寸**（§25 活体二分定案：藏声纳+星场零尖峰，
   仅藏星场 7 次尖峰；球体只是同时发生的背景现象）。定案修法 = 冻结窗 +
   ping ±40px 阈值门双保险，真机验证尖峰归零。我拆冻结后，过渡期 S 扫程 ~230px
   会放行 ~5 次 ping 重尺寸——**亲手把 §25 的闪重新武装**。
2. §31 误判教训白纸黑字：「球体移动是**相关而非因果**，把闪归因于月球后连续五轮
   手术」——我又对着月球做了一次（filter 过渡）。且 §31 症二明确把 **filter 列为
   本机 paint 类嫌疑属性**：1500px 球盘逐帧重光栅 = 与滑动抢帧的新风险。
3. 我的「迟滞跳变」理论源自 headless 软渲染噪声底（NO-GLOBE 仍有 4-7 尖峰 =
   编码/合成噪声），把设计运动与编码伪影当成了缺陷证据。

### 46.4 处置：全量回滚，恢复 §25/§26 定案架构
- layoutSonar 顶部冻结早退恢复（过渡期几何保持前值）；ping 段阈值门原样；
  orbitFrame 冻结行恢复（冻结窗内帧照跑不落盘）。
- theme-core 月球 transition 恢复仅 transform（filter 移出，附注释说明为什么
  不进——防后人再加）。
- 保留 §44 星场修复（重撒频闪是真缺陷且不与定案冲突）与本轮三件探针。
- 复测：扫描 + glyphs/motion/flicker-mech 回归。

### 46.5 教训（置顶级）
- **渲染/动效问题先读 §31 档案再动刀**——四症一案（闪/卡顿/旋转/衔接）同源相扣，
  定案的每道防护都有真机零尖峰背书，拆任何一道前先证明根因已死。
- 「冻结窗」不是粗糙防护而是定案的一部分：它把过渡期的一切几何突变换成一次
  延迟落盘，而延迟落盘点由状态栏 1s 钟的 MutationObserver 心跳保证会到来
  （≤1s），且落盘时 ping 环大概率在 6.4s 循环的 opacity:0 段——不可见。
- 探针分数分不清设计与缺陷时，唯一仲裁是真机 screencast 帧（§24 方法），
  headless 软渲染的分数差只配做粗筛。
- 用户说「日志里有」的时候，先去读日志。

— 署名：ox-alpha（2026-09-02）

## 47. v0.4.6 月坑加密：坑感由粒子密度直接成形（2026-09-02，用户「月坑粒子更密集一点」）

### 47.1 归因链：为什么纯贴图侧不够
- 第一刀只动 buildMoonMap（坑底填粒 α→.30 + 坑环加粗提亮）：粒子 20923→21236，
  仅 +313；满月盘截图坑感仍弱——**地形点云「一格一颗」是密度上限**：贴图画得
  再亮，引擎每个经纬格也只吐一颗粒子，坑环在 0.7° 格距下天然是虚线环。
- 结论：要「致密」必须破格——亮边带（全收档）格点允许一格多颗子点。

### 47.2 配方
- 引擎（client/index.ts）：新增 `PT_RIM_SUB = 3`——全收档（s≥PT_RIM_MIN=152）
  格点按哈希链 `hj = h*(2654435761+k*2)` 确定性微抖追加子点；k=0 不抖动 =
  原格点，同一格点跨帧稳定（哈希全确定性，无随机源）。`PT_MAX` 24000→32000。
- 贴图（theme-core.ts buildMoonMap）：坑底填充 α .42/.4/.38→.30——高地坑内
  采样 ~131 落 0.78 档 = 疏粒盘，坑碗从空洞变可读地形；月海上的坑底仍抽空，
  海面保持干净。坑环全面加粗：主坑环宽 r*0.11→r*0.16、小坑 ×64 环
  max(1.3,r*.13)→max(1.7,r*.18)、南半球群 ×40 max(1.1,r*.12)→max(1.5,r*.16)、
  链坑 width 1.2→1.6 α .4→.45、微坑 ×240 环 α .28→.34 width 1→1.5。

### 47.3 实测修正：子点抖动幅度
- 初版 ±0.28°（0.8×半格）：截图放大见「三连珠」虫状纹理——同格子点抱团结块，
  相邻格点间留 0.14° 未覆盖空隙。
- 修正为 ±0.35°（恰半格步长）：子点与邻格子点连成连续均匀带，虫纹消失。
  代码注释已写明幅度依据（再小出虫纹、再大糊出带外），防后人盲调。

### 47.4 验证
- `verify-craters.mjs`：POINTS 21236→30335（未触发 32000 抽稀）；满月盘截图
  verify-out/craters-3840.png——坑环致密、亮带无过曝（加法混合封顶 120 仍生效）、
  月海空洞保留。
- 帧预算 A/B（同环境 PT_RIM_SUB 3↔1 各跑一遍 verify-glyphs）：avg 28.2/27.1ms、
  over26 102/98、over34 21/13——加密劣化在软渲染噪声带内。注意当前 ~27ms
  是 0.4.4/0.4.5 全层栈（glyphs/星座/声纳/球体）在 headless 软渲染下的环境
  基线，与旧版 11ms 基线（更薄层栈）不可直比。
- 回归：`verify-flicker-mech.mjs` widthChanges=2（§25/§26 定案架构未动）、
  `verify-motion.mjs` exit=0、`verify-glyphs.mjs` PASS。
- 排雷：reveal 后 1.6s 截图曾见两块半透明方块盖月盘——`verify-settle-once.mjs`
  双时延（1.6s/6s）证实是揭示过渡中的错位图版滑入帧，6s 落定后画面干净，
  非本轮回归。

— 署名：ox-alpha（2026-09-02）

## 48. v0.4.7 环形山定向坡影：凹凸起伏感（2026-09-02，用户「月坑有些平，表现凹凸不平的起伏感」）

### 48.1 诊断：平在哪
- 旧配方（§47 之前传承）是**反照率画法**：均匀亮环（α .5 全圈）+ 均匀坑底
  + 一对微弱的明暗弧装饰（暗弧 α.42/亮弧 α.09 宽，被主环淹没）。环处处等亮
  → 眼睛读不到光源方向 → 坑是「平面上的环」而非「凹下去的碗」。
- 起伏感的视觉本质是**方向性光影**（hillshade）：迎光壁亮、背光壁影、碗内
  偏移影核，三区齐备大脑才读出凹陷。且全图光源方位必须统一，否则互相抵消。

### 48.2 配方（纯贴图侧，引擎/运行时零改动）
- 太阳方位 SW≈217°（沿用旧明暗弧的既有光源方向，不另起炉灶）。
- `craterArcs` 重写为三区坡影：
  1. 迎光 SW 亮弧（143°→292°，宽 r*0.16，α .45-.65）——s≥152 全收档 +
     PT_RIM_SUB 子点加密 + 引擎 1.3× 提亮，三重叠加成致密亮月牙；
  2. 背光 NE 影弧（-37°→112°，宽 r*0.2，α .5 深暗）——压进 <128 抽空带 =
     粒子场被咬出暗缺口（真月坑阴影就是黑的，空洞此处读作影）；
  3. 坑碗 NE 偏移影核（r*0.5/r*0.28 双层暗斑，偏移 +.17r/-.13r）。
- 均匀主环让位：craterBody rimA 语义改为「极淡结构环」（α .16-.18，宽 r*0.1），
  只保轮廓连续；年轻/射纹坑主环 α .75/.72→.45。
- 小坑保护：r<18 影弧收窄（r*0.13）减淡（α .34），防影弧淹没本体；
  链坑（r 7-10）/微坑（r 3-7）不作坡影——尺寸不够三区，保持颗粒噪点语义。

### 48.3 验证
- POINTS 30335→29959（影弧抽空带吃掉 ~400 颗，符合设计）。
- verify-out/craters-3840.png：坑体呈「亮月牙+暗缺口」配对，凹陷读感成立；
  全盘无虫蚀感（影弧密度克制），月海空洞与高地颗粒平衡未破。
- 回归：flicker-mech widthChanges=2、motion exit=0、glyphs PASS
  （JANK avg 28.9ms，与 0.4.6 的 28.2 同噪声带——贴图侧改动零运行时成本）。

### 48.4 教训
- 「平」先查光影方向性，别先加细节——§47 的密度加密让坑「密而平」，
  本版密度没加反减（影弧抽空），起伏感反而出来了：凹凸 = 亮暗的**方向性
  配对**，不是粒子多少。
- 抽空带（<128 镂空）不止是月海工具：作阴影语义时，「粒子的缺席」就是
  最黑的颜料。

— 署名：ox-alpha（2026-09-02）

## 49. v0.4.8 构图改版：月球左锚半露 + 月面铭牌（2026-09-02，用户「把粒子月球放到左侧去，只露一半，把这个加入进来」+ PALIS 接入屏参考图）

### 49.1 构图
- 数据天体右锚→左锚：默认态左缘弧带（translateX(540px-100%)，镜像原右弧语法）；
  满月揭示态 = 球心压左缘（translateX(-50%)）——右半盘成画，「只露一半」；
  hero 态镜像左藏（440px-100%）。揭示/滑动动效机制零改动（transform 直接状态值
  过渡定案不动）。
- 球内 HUD 微件（hline/vline/cross/ro1/ro2）镜像到元素右半部——左锚后右半 =
  默认/满月两态的恒可见区（原左侧微件会全部藏进屏外）。
- 新增 `.pg-moontitle`：衬线（Georgia/Songti 栈）宽字距 PALIS 09A + 副标
  「正在接入 PALIS 管理系统」（PALIS 钛蓝 accent），居中半盘可视区
  （left = 球径×0.2 ≈ 半盘中心），随 data-palis-moon="full" 从藏侧滑入
  （translateX(-120px)→0 + opacity，与球体同 duration/delay 变量）；
  默认态隐去——标题是揭示报头不常驻。竖排幽灵大字退役（品牌位移交）。

### 49.2 排雷（置顶级教训）：host 首帧 CSS 是内核启动时快照
- 症状：topo 右迁规则（right:6.2%）构建/注入都成功，实测 rect 纹丝不动（x=444）。
- 归因：document 里有两份 PALIS 表——host 首帧注入的匿名快照（内核启动时读取，
  不重启不刷新）+ client 实时注入的 #palis-theme-css（新）。迁向类改动（left→right）
  两份表**按属性合并**：旧 left:4.6% 与新 right:6.2% 共存 → 过约束 LTR 下 left 胜
  → 新规则形同虚设。同属性改动（transform 值）不受影响（文档序后者胜）——
  所以 0.4.5 以来的纯 JS/贴图改动全都正常，首个 CSS 迁动才踩雷。
- 处置双轨：① 所有迁向规则补显式复位（left:auto/right:auto）——陈旧快照并存时
  也降级正确；② 预览内核重起刷新首帧快照。**CSS 迁动类更新的交付必须提示
  重启应用/内核**（纯 JS/贴图更新重载页面即可）。
- 探针：verify-topo-debug.mjs（styleSheets 全表扫 selectorText + 包含块链）。

### 49.3 避碰重排
- topo → right:6.2% top:68%（+tag 随锚）；swatch → right:2.4% top:78%；
  PT-01 (12%,24%)→(24%,13%)、PT-02 (7%,47%)→(24%,68%)（原两位压月盘）；
  plate/grid/数据流不动。verify-flat 碰撞矩阵换血（去 ghost，加 stream 邻对），
  双视口零撞 PASS。

### 49.4 验证与帧预算注记
- verify-craters：moon state full = 左缘半盘 + 铭牌居中（craters-3840.png）；
  标题 44px 衬线在粒子场上可读性成立（粒子穿字形 = 质感非干扰，不加 scrim）。
- 回归：flicker-mech widthChanges=2、motion exit=0、glyphs PASS。
- JANK avg 28.9→33.4ms（over26 112→159）：半盘在默认态藏于展开侧栏下方 =
  软渲染合成过绘（headless --disable-gpu 无 GPU 合成，此开销高估真机）；
  JS 逐帧成本未变（引擎/粒子数/画布尺寸全未动）。真机若见卡顿再议
  （候选：侧栏展开时降引擎帧率）。

— 署名：ox-alpha（2026-09-02）

### 49.5 修订：铭牌被 hero 输入卡吞字（用户截图反馈）
- 症状：hero 态满月揭示时，铭牌右半（「09A」+ 副标尾）淡没——被 hero 居中的
  输入卡（半透明深色卡片）盖住。
- 双重根因：① 铭牌挂 glyphs 层，left 按宿主宽度算——宿主带侧栏偏移（x=280）
  时落点被整体推右 280px，偏进卡区；② 落点 46% 正中位与 hero 卡同高同区。
- 修法：铭牌从 glyphs 层迁入球体元素（buildGlobe 末尾挂载，叠球盘各罩层之上）——
  月面相对定位，宿主偏移不再影响；落点下迁至可视半盘下三分之一区
  （元素 70%/68%）：3840/1920 双视口与 hero 卡、会话底栏 composer 均不撞
  （verify-craters 新增铭牌×[data-composer-card] 重叠断言：overlap=false）。
- 教训：挂层选坐标系比调数值优先——「月面上的字」就该用月面坐标系（球体元素），
  用宿主坐标系就要永远追着侧栏偏移补；卡片遮挡类问题先量双方 rect 再动刀。

— 署名：ox-alpha（2026-09-02）

## 50. v0.4.9 平面月盘：粒子月球的平面构成对位（2026-09-03，用户指正「不是参考标题，而是平面的月球」）

### 50.1 需求正名
- 0.4.8 把「把这个加入进来」误读为参考图上的标题文字 → 做了月面铭牌；用户真正要的
  是参考图里的**平面月面插画本体**（开机舷窗同款：浅灰圆盘 + 蓝灰月海 + 环形山线稿
  + 半调网点）。铭牌保留（揭示态报头已成立），本轮补平面月盘。

### 50.2 构成决策
- 落点：glyphs 层栈底（首子节点），右锚半露（盘心压宿主右缘 translate(50%,-50%)，
  尺寸 min(880px,46vw)）——粒子月球锚左（点云）/平面月盘锚右（版画），双月对望；
  测点/图版/色卡/数据流等小件 DOM 序在其后 = 叠在盘面之上，图纸分层。
- 贴图零成本复用 ART_MOON_MAP（与点云采样、开机舷窗同一张 data URI，浏览器复用解码）；
  2:1 贴图等高铺满圆窗，横移 -50% 恰为经度一周 = 无缝公转，直接复用 palis-boot-pan
  关键帧（140s）；唯一动效在 transform 合成器通道，RM 媒体查询静止。
- limb 渐暗 veil（::after 径向罩 + inset 内阴影）让右半盘没入黑场；fm-ring 细外环
  呼应球体 HUD 环；直角模式补圆形豁免（data-palis-square 全局 border-radius:0 的
  既定例外通道）。

### 50.3 验证
- verify-flat 新增月盘断言（就位/正圆/动画名/盘心压右缘 ±40px）双视口 PASS，
  碰撞矩阵零撞；craters（29959 粒子、铭牌 overlap=false）/flicker-mech（widthChanges=2）
  /motion（exit=0）/glyphs（PASS，JANK 同软渲染噪声带）全绿。
- 截图：flat-3840.png（hero 默认态右缘平涂半盘）、craters-3840.png（满月揭示态
  双月对望 + 铭牌）。
- 交付注记：本轮含 CSS 新增规则——正式桌面端需重启应用刷新 host 首帧快照（§49.2）。

— 署名：ox-alpha（2026-09-03）

## 51. v0.5.0 构图改版：月球迁入星系中心 + 铭牌迁平面月盘（2026-09-03，用户「粒子月球在左和右边的有些视觉比重冲突，放到星系中间对那圆点进行替换」）

### 51.1 构图决策
- 双月对望（0.4.9）视觉比重冲突：左点云 + 右版画两头重。用户裁定：粒子月球
  移入声纳轨道环系正中，替换中心圆点——月球成为星系的中心天体，环/行星绕它转。
- 盘径 clamp(0.30·S, 220, 520)：嵌进蓝环（r=184）以内、压过 r=96 虚线环——
  行星居于轨道系中心的读感；hero 态被输入卡盖中腰、上下弧露出 = 行星晕。
- 铭牌迁平面月盘（参考图原构图「标题在月面上」）：可视半盘中心（元素 25%/50%）
  常驻静态；球体盘面小且多被内容覆盖，不再是标题载体。

### 51.2 定位机制（布局新范式）
- layoutGlobe 与 layoutSonar 同圆心公式、同 S 基准、同冻结窗；由 layoutSonar
  末尾统一驱动（ResizeObserver 逐帧跟随滚动体几何），RM 路径（声纳不挂）由
  ensureGlobe 自挂的 ResizeObserver 驱动。
- 缩放走 transform：1100px 固定内部几何（球盘 900/尘埃坐标不动），origin 0 0 +
  scale(k) translate(-50%,-50%) = 元素中心精确压圆心。零重排、零位图重置、
  零 transition——旧「CSS transform 过渡滑月」机制整体退役（月球无藏可揭，
  data-palis-moon 属性退役；syncMoonReveal 保留为纯侧栏收放监听：冻结+自转加速）。
- 退役清单：球体 HUD 几何层（准线/十字/细环/GROUND TRACK）、卫星轨道环+卫星、
  live 读数（仪器语言归声纳）；声纳中心圆点 <b> + 中心环 g0（月球接替）。

### 51.3 排雷：无条件冻结把启动首布局打进冻结窗
- 症状：改造后首验 FAIL——degs/sonar 定位全 null，月球位置陈旧。
- 根因：syncMoonReveal 去掉属性写入后变成无条件冻结，而 apply() 启动时同步调用
  一次 → ensureSonar 的首次 layoutSonar 落进 700ms 冻结窗被跳过；此后无 resize
  不再触发 → 声纳/月球永远不定位（旧实现有属性变化检测，启动时早退不冻结）。
- 修法：恢复 full 状态变化检测（sidebarFullLast 模块变量），翻转才冻结/加速，
  不置任何属性。教训：**副作用门槛（变化检测）不能随载体（属性）一起删**——
  删载体前先确认门槛没有寄生其上。

### 51.4 验证
- verify-craters 换断言（中心压圆心 dx=0 dy=0 / 盘径 clamp 区间 / 粒子 29959 /
  铭牌 overlap=false）PASS；flat/flicker-mech(=2)/motion(0)/glyphs(degs 归位) 全绿。
- 截图 craters-3840.png：月盘居轨道系中心、蓝环贴盘外缘、右缘平面月盘+铭牌成画。
- JANK avg 32（同软渲染噪声带）；球盘从 1100-1500px 缩到 ≤520px，过绘开销大降。

— 署名：ox-alpha（2026-09-03）

## 52. v0.5.1 收尾：星系中心圆点+圆弧退役（2026-09-03，用户「有了粒子月球，中间的圆点和一圈圆弧就可以去掉了」）

### 52.1 残留物取证：先查背景再查层
- chat 态截图中心仍有灰圆点 + 一圈圆弧。排查教训：**先看 CSS 背景，再查 DOM 层**——
  圆点/圆弧的真身是 ART_ORBIT（[data-conversation-scroll] 的 background-image SVG）
  中心三件套：r=96 碟（fill .018+stroke .1）+ r=30 圈（stroke .3）+ r=10 圆点（fill .34）。
  v0.5.0 退役的 <b>/g0 只是声纳 DOM 层那份，烙在背景里的这份漏拆了。
- 第二处：声纳旋转环 g1（r=96）——月盘半径 0.15·S 已覆过 r=96，环弧横穿月面，同退。

### 52.2 拆除清单
- theme-core.ts ART_ORBIT：中心三件套从 SVG 字符串移除（留 v0.5.1 注释）。
- client/index.ts sonarRings：g1 环退役，剩 蓝环 r=184 + 灰环 r=348/264/430（<s>×4）。
- theme-core.ts：.palis-sonar s.g1 基础规则 + activity 规则同删；声纳头注释同步。
- package.json → 0.5.1。

### 52.3 验证
- craters PASS（中心 dx/dy=0、盘径 clamp 区间、粒子 29959、铭牌 overlap=false）；
  flicker-mech widthChanges=2；glyphs PASS（degs 归位）。
- 新建 verify-chat-moon.mjs（chat 态截图链路）：点侧栏既有会话进 active 态，
  探针 globe/sonar 圆心一致；chat-moon-2560.png 确认中心圆点/圆弧消失、
  月盘居轨道系中心。坑：选择器第一版误点「新会话」按钮（phase 停在 hero）——
  排除功能件文案（新会话/设置/工作区/未分组）后正常点到既有会话。
- 交付注记：本轮含 CSS 删除——正式桌面端需重启应用刷新 host 首帧快照（§49.2）。

— 署名：ox-alpha（2026-09-03）

## 53. v0.5.2 闪烁修复：落定帧瞬变回跳 + flatmoon 公转硬切（2026-09-03，用户「那个闪烁bug又出现了，还有一些动效上的问题」）

### 53.1 取证（先测量后动刀，§46 方法论）
- 新探针 verify-moon-teleport.mjs：收放全程 50ms 采样月球中心/声纳圆心/ping 宽。
  实测一次收起：过渡期月球随宿主平移逐帧滑（1408→1185，正常）；但声纳 style
  冻结不动，轨道背景（CSS background 随滚动体连续居中）与声纳/月球**越漂越偏**；
  t=1251 冻结窗结束瞬间一帧之内：月球 1184→1296（+112px 瞬变）、盘径 579→636、
  声纳 1128→1240、ping 1737→1910 重尺寸（Δ>40 门放行 = §25 单帧爆亮）。
  展开对称回跳 -112px。用户看到的「闪烁+动效别扭」= 这一帧的内容。
- 根因：v0.5.0 月球迁入星系中心后，§25 冻结窗「整体冻结、落定一次落盘」的
  代价变了——细线环延迟落盘无感，又亮又大的月球延迟落盘 = 一帧传送。
  §46.5 的警告仍成立（定案防护不能盲拆），但冻结的**范围**可以收窄到真凶。

### 53.2 修复
- **冻结窗只冻 ping 重尺寸**（§25 阈值门+冻结双保险原样保留）：layoutSonar 的
  冻结早退下移到 ping 段前；旋转环/度数/月球逐帧跟随滚动体几何——落定零跳变。
  orbitFrame 旋转冻结行同退（否则环停球转 = 新的不一致）。
  安全论证：环/度数写 width/left/top（无 CSS animation 可顶爆）、月球写 transform
  （合成器通道，无位图重置）——§25 实锤的闪源只有 ping 环（6.4s 无限动画元素
  被逐帧重尺寸顶爆插值）。
- **flatmoon 公转无缝化**（0.4.9 潜伏）：单 img 宽 200% 时 translateX(-50%) 只走
  半张图，循环点内容不连续 = 每 140s 一帧硬切。改 .fm-strip 双副本条带
  （宽 400%，各载一整张 2:1 贴图），位移 -50% 条带宽 = 恰好一整张图宽，
  副本 B 精确顶替副本 A。开机舷窗 pb-moon 同构但启动屏只活 ~1s，不循环，不动。
- 注释同步：theme-core 声纳头注释补登 <b>/g0/g1 退役（0.5.0/0.5.1 漏改）。

### 53.3 验证
- teleport 复测：收/放全程月球逐帧平滑跟随（1408→1297→落定不动），声纳同步
  逐帧，ping 每次落定只重尺寸一次（冻结+阈值门行为不变）。
- 回归全绿：craters（dx/dy=0、粒子 29959）/ flicker-mech（widthChanges=2）/
  glyphs（PASS，JANK 同噪声带）/ flat（断言更新：动画改断 .fm-strip + 双副本 +
  条带 4×盘径 ±12，PASS）。
- 交付注记：含 CSS 迁动——正式桌面端需重启应用刷新 host 首帧快照（§49.2）。

### 53.4 经验
- 冻结窗的代价随被冻元素的视觉权重变化：元素越亮越大，延迟落盘越像缺陷。
  定案防护的正确姿势不是整体扩大/整体拆除，而是**把防护半径收窄到实锤根因**
  （ping 环），让无风险元素（transform-only）自由逐帧。
- 无缝循环动画的判据：位移距离必须等于**内容周期**（一整张贴图宽），
  不是元素宽度的一半——单 img 200% 宽时 -50% 只走半张图，必然硬切。

— 署名：ox-alpha（2026-09-03）

## 54. v0.5.3 闪烁收尾：ping 重尺寸等不可见窗口落笔（2026-09-03，用户「面板切换时还是会发生闪烁」）

### 54.1 排查路径
- 重跑 flicker-scan：波动仍归 glyphs 层（flatmoon 慢平移的软渲染逐帧重光栅 =
  设计运动伪影，§46.2 教训——headless 分数只配粗筛），非闪源。
- verify-panel-switch.mjs（新）：对话/轨迹 tab、工作区分组、会话项切换全程——
  [data-phase]/globe/sonar/glyphs 元素零置换、canvas 零重置。面板切换不重挂载层，
  排除「宿主重建 → 月球重挂载空窗」嫌疑。
- 真凶 = §25 阈值门+冻结窗压不住的**落笔相位**：ping 重尺寸在落定后 ~1s 心跳
  落盘（teleport 探针实测 pingW 1731→1910 落在 settle 后近 1s），相位随机；
  三环错相（0/2.13/4.27s，6.4s 循环）下任意时刻大概率有一环可见 → 单帧爆亮。
  0.5.0 月球居中后环闪光贴亮盘，存在感放大。用户描述「切换完过一会儿闪一下」
  与时间解耦特征吻合。

### 54.2 修复
- queuePingResize：重尺寸排队不立即落笔，150ms 轮询各环 computed opacity，
  每环等到自己的 opacity≤0.02（循环 100%→0% 段）才写 width/margin——
  环透明时改尺寸对画面零影响。最坏等待 ≈ 一个循环，期间环径保持前值（无感）。
- removeSonar 重置 sonarLastPingD/pingPendingD + 停轮询——修掉潜伏 bug：
  重挂载的全新 <i> 是 CSS 默认 760px，旧基数让阈值门误判「增量 ≤40」永不定径。

### 54.3 验证
- verify-ping-invisible.mjs（新）：两次收放 6 次重尺寸全部落在 opacity
  0.015–0.02 的不可见窗口，resizeVisible=0；三环各自等到自己的窗口
  （t=1853/4107/6203 自然错开，无需对齐）。
- 回归：teleport（月球逐帧跟随零跳变）/ craters（dx/dy=0）/
  flicker-mech（widthChanges=2）/ glyphs（PASS）全绿。
- 交付注记：正式桌面端需重启应用刷新（§49.2）。

### 54.4 经验
- 阈值门管「多少次」，冻结窗管「哪段时间」，但只有**相位对齐**管得住「哪一帧」——
  无限循环动画元素的属性改写，终极防护是把写入对齐到它自己的不可见相位
  （opacity≈0 窗口），而不是寄望于落笔时刻碰巧不可见。

— 署名：ox-alpha（2026-09-03）

## 55. v0.5.4 内核 0.1.2-rc.1 适配：settingsNamespace 退役（2026-09-08，用户「直接安装新内核，并对其进行桌面端的更新适配」）

### 55.1 断点
0.1.2 删了 `@deepseek-ai/dsh-settings` 的 `settingsNamespace()` 帮助函数，
`lib/index.js` import 即抛 → 插件加载失败 → 整个主题缺席（设置 API 503、
index-inject 不注入、页面回落官方主题）。其余 settings 面
（register/describe/update/SettingsConflictError）签名未动——
0.1.2 命名空间直接收小写连字符字符串，`SETTINGS_NS = 'palis-theme'` 天然合法。

### 55.2 修法
`src/index.ts` 两行：删 `settingsNamespace` 导入；
`const ns = settingsNamespace(SETTINGS_NS)` → `const ns = SETTINGS_NS`。
改动对老内核同样合法（register 本就收字符串），无前向分支。

### 55.3 0.1.2 附带变化核验
- Web 启用一次性 token 鉴权（启动行 `dsh web: <url?token=…>` → 303 + 签名
  cookie）。主题面板的 `/palis-theme/api` 走 webServer 直连（不经 connection
  /api 网关），不受影响；verify 探针改为带 token URL 导航即可（303 自动
  置 cookie）。桌面外壳侧的就绪探测/loadURL//api 调用适配见
  dsh-desktop 日志〔102〕。
- 「会话视图工程大幅拆分 + 会话流默认折叠」未冲垮主题契约：预览内核
  全套回归 7/7 绿（glyphs / craters / flat / flicker-mech / moon-teleport /
  panel-switch / ping-invisible），2560×1400 截图目检正常。

### 55.4 经验
- 插件对内核 API 的依赖面越小，跨代越稳——本次断点只有一处，因为设置面
  自始至终只用 register/describe/update 三件套。
- 外壳按 runtime-marker 对账重解包：手换 runtime 目录会被下次启动覆盖，
  正路是换 resources/runtime.tar.gz + marker（详见 dsh-desktop 日志〔102〕）。

— 署名：kimi（2026-09-08）

## 56. v0.5.5 月盘变形：分数 DPR 下 transform 合成层光栅化错位（2026-09-08，用户「右侧的月球还是变形」）

### 56.1 现象
桌面端右侧平面月盘（flatmoon）横向拉伸：月坑变椭圆、盘左缘压成直线。
用户机器 Electron 窗口 DPR=2.73（3840×2160 物理、非整数缩放；以页面
`devicePixelRatio` 为准，PowerShell 系统级 API 报的 175% 与每监视器值不一致）。

### 56.2 排查（结论先行：CSS 层无错，变形在合成器）
- DOM 实测：`.pg-flatmoon` 647.4×647.4 正圆、`aspect-ratio:1/1` 生效、
  祖先链零变形 transform——几何数据源完全正确。
- 无头 Chrome `Emulation.setDeviceMetricsOverride{1407×746, deviceScaleFactor:2.73}`
  复现出完全一致的变形 → 与 Electron 无关，是 Chromium 合成器在分数 DPR>2
  下的通用问题。
- A/B 实锤（`verify-moon-ab.mjs`）：向活页面注入
  `.fm-strip{animation:none!important;transform:none!important}` 后月盘立刻
  恢复正圆、月坑变圆 → 罪魁 = `.fm-strip` 的 `animation:palis-boot-pan`
  （`translateX` 关键帧）产生的**合成层**被光栅化/合成错位，横向拉伸 ~1.2×。
- 对照证据：`ab-anim.png`（变形）vs `ab-noanim.png`（正圆）。

### 56.3 修法
位移从 `transform:translateX`（合成层）改成 `left` 属性动画（主线程 layout
驱动，不产生合成层），位移量数学保持等价：
- `@keyframes palis-boot-pan` 本体改 `{from{left:0}to{left:-100%}}`
  （pb-moon 宽 200%，-100% 容器 = 旧 -50% 自身）；
- fm-strip 宽 400% 需 -200% 容器位移，与 pb-moon 不同 → 独立新关键帧
  `palis-fm-pan{from{left:0}to{left:-200%}}`（140s 周期不变，无缝回绕逻辑不变）。
- RM（prefers-reduced-motion）分支本就 `animation:none`，不用动。

### 56.4 验证
- 无头 DPR 2.73 复验：月盘/月坑正圆、盘缘平滑弧线。
- 桌面端活窗口（CDP `Page.reload{ignoreCache}` 刷新后）实测：
  `anim=palis-fm-pan`、`stripTransform=none`、647.4×647.4、截图月坑正圆。
- 回归全绿：verify-flat（fmAnim 断言同步更新）/ verify-craters / verify-glyphs。

### 56.5 经验
- **分数 DPR>2 下，任何「圆形容器 + transform 动画子层」组合都有被合成器
  拉扁的风险**。排查变形先查合成层（动画 transform / will-change），
  不要在 DOM/CSS 几何上空耗——本次 DOM 层一切正常，坑在光栅化。
- 慢速平移类动画（60s/140s 周期）用 left 驱动完全够，layout 成本可忽略
  （条带内仅 2 张 img），不必执着于 transform 的"性能最优"教条。
- ping 环（palis-sonar-ping）同为 transform scale 关键帧，理论上有同样风险，
  但环不可见窗口透明度 0.015 且与闪烁修复（§25/§53/§54）耦合——未实锤不动它，
  改 ping 前必须重读那三节。

— 署名：kimi（2026-09-08）

## 57. v0.5.6 月盘硬化：容器静态 transform 移除 + 新旧代码链路排查（2026-09-09，用户「仍然有变形」）

### 57.1 起点
v0.5.5（条带 left 动画）落码后用户仍报右侧月盘变形。沿「用户实例是否在跑新代码」
全链路核查：
- 插件加载路径：`~/.dsh/profiles/web/node_modules/@dsh-local/palis-theme-panel`
  是指向 dev 项目的符号链接，重建即生效。
- 内核 rev 机制（`dsh-client-modules/lib/index.js`）：per-plugin rev =
  `randomBytes(8) nonce + 计数器`（**每进程随机**），combo rev = 内容哈希
  （`framedHash`）。重启必换 URL → 磁盘缓存（`cache-control: immutable 1年`）
  不会跨进程命中旧代码。
- 实测当前内核（7134）所供 HTML + client.js 均含新代码（palis-fm-pan）。
- **坑**：宿主内联 CSS（PALIS_CSS）只在内核启动时读盘——插件重建后若不重启
  内核，Page.reload 只刷新 client.js 注入的 `#palis-theme-css`，造成
  「内联旧 CSS + 运行时新 CSS」并存的混合态（旧 transform 规则仍生效）。
  改版后必须重启应用，不能只看页面刷新。
- 实测矩阵（0.5.5 代码）：活窗口真 GPU DPR 2.73 / 模拟 1.75 / 无头 2.73 /
  无头 1.75 —— 月盘月坑全部正圆，无法复现用户所报残留变形。

### 57.2 修法（硬化）
`.pg-flatmoon` 容器的 `transform:translate(50%,-50%)`（静态，但同样把整棵子树
提升为合成层）改为无 transform 等价定位：
`right:calc(min(880px,46vw)/-2); top:50%; margin-top:calc(min(880px,46vw)/-2)`。
注意 margin 百分比相对**容器宽度**而非自身，故必须用 calc 绝对量。
至此月盘栈（容器/圆窗/条带/贴图/铭牌）零 transform、零合成层——
整个月盘在页面基绘制层一次光栅化，分数 DPR 下无合成器错位可趁。

### 57.3 验证
- 重启应用后活窗口实测：容器 `transform:none`、盘 647.4×647.4、
  盘心压宿主右缘（偏差 0.3px）、垂直居中（0.1px）——与 transform 版像素级一致。
- 截图目检：盘缘平滑弧线、月坑正圆。
- 回归全绿：verify-flat / verify-craters / verify-glyphs。

### 57.4 经验
- 排查「样式没生效/生效一半」先想**多份样式表并存**：本主题有内核内联 +
  client 运行时注入两份 PALIS_CSS，只刷新其一 = 混合态。
- Chromium 合成层来源不止动画：`transform`（哪怕静态）、`will-change`、
  `filter`、`backdrop-filter`、`overflow:hidden+动画后代` 都会分层。
  分数 DPR 环境下，能被静态布局表达的定位就不要用 transform。

— 署名：kimi（2026-09-09）

## 58. v0.5.7 声纳 ping 环变形修复：CSS scale 动画 → JS 逐帧驱动（2026-09-09，用户「依旧不圆，而且中间扩散出去的声纳波纹也不圆」）

### 58.1 定位
- 对用户当前截图逐像素测量：月盘轮廓、r=430 点环、蓝色虚线环、月坑、粒子云**全部几何正圆**——静态渲染已健康，残留的「不圆」是**动态过程**的观感。
- 全主题审计后，唯一还在用合成层 transform 做圆形缩放的元素 = ping 环
  （`@keyframes palis-sonar-ping` 的 `scale(.05→1)`）。分数 DPR（用户机 2.73）下
  合成层位图逐帧缩放、周向采样不均，运动中读作"不圆"——与 v0.5.5 月盘
  变形同一法典（圆形动效零合成层）。

### 58.2 修法
- `theme-core.ts`：`.palis-sonar i` 删 `transform:scale(.05)` 与
  `animation:palis-sonar-ping`（含 nth-child 错相 delay、活动态 duration），
  `@keyframes palis-sonar-ping` 退役；CSS 只留基态尺寸/描边（活动态描边提亮保留）。
- `client/index.ts`：新增 `PING_EASE`（cubic-bezier(.17,.67,.35,1) 二分求解器）；
  `orbitFrame` 逐帧驱动三环 `width/height/margin/opacity`——展开曲线、
  1/3 周期错相、透明度包络（0→pk@9%→0.4·pk@62%→0）、活动态变速
  （6.4s/.42 ↔ 4s/.60）与原 keyframes 同参复刻。
- ping 重尺寸机制（§25 阈值门+冻结窗、v0.5.3 不可见窗口落笔）保留，
  落笔对象从元素样式改为 `pingBaseDs[j]` 数字（三环错相下不存在全环同隐窗口，
  各环持有自己的基准径，各等自己的不可见窗口换径）。

### 58.3 验证（测试内核 17891 + Electron 探针，桌面版同二进制同分数 DPR 2.73）
- CSS 层：三环 `animationName:none`、`transform:none`、`border-radius:50%`，
  样式表内 `palis-sonar-ping` 已不存在。
- 逐帧采样 8s×3 环共 1440 帧：width≡height（构造等径）零偏差；
  |Δw|>30 且前后帧均可见的跳变 = 0（周期回绕 868→52.8 发生在 opacity≈0，与原 keyframes 相同）。
- 包络同参：三环 maxOp=0.42、minOp=0，峰值时刻 1153/3294/5424ms ≈ 1/3 周期错相。
- 截图目检 + 蓝色像素半径直方图：ping 环（r≈1160 物理 px）分角度半径
  1158.7–1163.6（±0.2%），正圆。
- 回归全绿：verify-flat / verify-craters / verify-glyphs / verify-ping-invisible（新 verify-ping-jsdriven）。

### 58.4 交付注记
- 宿主内联 CSS 只在内核启动时读盘（§57 经验）——**用户必须完全重启应用**，
  刷新页面会得到新旧 CSS 混合态。
- 探针基建教训：Windows 下 Electron 窗口被遮挡时页面 visibilityState=hidden、
  rAF 停火、截图失败——probe-main.js 需加
  `disable-backgrounding-occluded-windows` / `disable-renderer-backgrounding` /
  `disable-background-timer-throttling` 三个开关。

— 署名：kimi（2026-09-09）

## 59. 变形终局：A/B 实锤 0.1.2 内核渲染管线，回退 0.1.1（2026-09-09）

### 59.1 决定性 A/B
- 用户机同主题 v0.5.7：内核 0.1.2-rc.1 = 变形可见；回退 0.1.1-rc.1 = 用户确认
  「这个版本是没有变形的」。触发点在 0.1.2 内核前端（会话视图 DOM 重构 /
  根容器新增 position:relative 等改变了合成层判定），不在主题。
- 反证回顾：0.1.2 下用户截图逐像素测量全圆（月盘盘缘与干净探针 36/45 角度
  零偏差，离群 4 处=贴图平移相位+前景遮挡；ping 环分角度 ±2% 内）——
  **静态截图是圆的，变形只存在于 0.1.2 运行时的动态合成路径**，
  截图抓不到 = 以后此类"截图正常但用户眼见变形"的案子直接怀疑合成器/呈现路径。

### 59.2 回退操作（runtime.tar.gz+marker 置换法的逆操作）
- resources：runtime.tar.gz(.bak-0.1.1 还原) + runtime-marker.json(0.1.1)，
  0.1.2 留档 .bak-0.1.2；app.asar 还原 .bak-0.1.31（token 补丁版留档
  app.asar.bak-token-patch）。
- 外壳自动解包 EPERM 失败三连：rename runtime→runtime.prev 被锁（**测试内核
  进程正运行在 runtime 目录里**是锁源——以后换 runtime 前必须先杀干净所有
  从该目录起的 node 进程）；runtime.prev（0.1.1 原始树）还被 rm 掉了。
  最终手动解 tar.gz 落位，marker 三方一致后外壳跳过重解包。
- 冷启动验证：0.1.1 内核 `dsh web:` 无 token 正常就绪，与老外壳配对。

### 59.3 后续悬置
- 若哪天要回 0.1.2：需先在 0.1.2 下用 CDP LayerTree 对比月盘/ping 环的合成层
  差异找出具体触发器；主题侧候选还剩 globe canvas 的静态 transform:scale(k)。
- 桌面端自动更新若装上新 dist（prepare-runtime.ps1 已锁 0.1.2），变形会回归
  ——更新前先打招呼。

— 署名：kimi（2026-09-09）

## 60. 输入区双写：主题与内核版本解耦（2026-09-10）

- **背景**：官方内核 latest 已到 0.1.5-rc.1（我们钉 0.1.1-rc.1）。契约验收（dsh-desktop
  contracts/kernel-surface.json + verify:kernel --runtime）在候选内核上实测出输入区重构：
  textarea → div[contenteditable][role=textbox]，锚点 data-input-backdrop → data-composer-input、
  data-input-mirror → data-composer-placeholder（用 Hermetic 起内核 + headless Chrome 取实时
  DOM 锚点清单，新旧两代对比得出，不是猜的）。
- **做法**：三条规则并列新旧两代选择器（双写）。只改新选择器会让 0.1.1 用户立刻失去输入框
  主题化（版本绑定改动）；双写后同一份主题在两代内核下都生效，可独立发布，不必与内核升级同步。
- **验证**：新增探针 render.composer-theme 在两代内核上均命中（底色 rgb(10,10,10)、
  JetBrains Mono）；契约锚点行改 either/or 语义后两侧各 12 项全命中；渲染不变量四项全绿。
- 顺带发现：0.1.5 上开机自检舷窗（.pb-port）看着我方截图疑似圆角方（非正圆），待内核侧
  合成层排查（本轮未定性，记此备查）。

署名：ox-alpha

## 61. 角标/铭牌换真值（2026-09-10）

- 方向：把"无意义的修饰"换成"有信息表达的内容"。主题里有一批假数据标注（SYS//09A-C2、
  ARCHIVE TERMINAL · REV 09A、TERRAIN // REL 240M 等），而状态栏的 PHASE/UTC/SCROLL/SES/MDL
  早已是 live——本版先让角标与铭牌归队。
- 做法：宿主暴露自身版本（GET 响应加 version，从随包 package.json 读）；客户端特性探测
  window.dshShell（纯浏览器 dsh web 下不存在），拿得到就写真值、拿不到保留占位（不臆造）。
  左上角标 = SYS//P<端口> · WS//<工作区名>；右铭牌 = SHL · KRN · REV 三段独立、缺则少显示。
- 验证：浏览器上下文只显示 REV 0.5.8（真值）；真机 Electron 截图显示
  SYS//P5491 · WS//DL 与 SHL 0.1.34 · KRN 0.1.1-rc.1 · REV 0.5.8。
- 待办：工作区=主目录时显示成 WS//DL 不够可读，考虑显示 ~ 或末两段；
  天体上的假标注（TERRAIN // REL 240M 等）与 starfield 无信息闪烁留待后续。

署名：ox-alpha

## 62. 开机自检换真实接入报告（0.5.10，2026-09-10）

- 拟态自检文本（INDEX BUS SELF-TEST / IDENTITY_CHAIN / GROUND TRACK 等 8 行 + 副标题
  「正在接入 PALIS 管理系统」+ 月面铭牌同款文案）全部换成真实来源：工作区、外壳版本、
  内核版本与端口、插件装载/问题/隔离数、主题版本与 revision、视口与 DPR、启动耗时。
- 原则延续 0.5.9：取不到就显示 -- 且不标色，没有外壳时明确报「独立会话/STANDALONE」
  红字，而不是演一个不存在的接入过程；插件有问题的那行标红（新增 .pb-lines .err）。
- 验证：headless 上下文（无外壳）截图 verify-out/boot-report-browser.png —— THEME/VIEWPORT
  为真值，其余 --，LINK STANDALONE 红字。真机三段版本已由 0.5.9 的 E2E 截图验证。
- 排坑：抓覆盖层要在它存活的 2.5s 内截图——把「关掉内核首启弹窗」从截图前挪到挂载后
  立刻执行，否则它把取景时间推后；渲染探针因此新增 --settle 可调等待。

署名：ox-alpha

## 63. 极简与视觉比重（0.5.11，2026-09-10）

- 用户方向：「更极简高级一些」「删除一些不太明显的多余元素，重要的则规划一套视觉比重」。
- 删除 6 类无信息装饰：dither 噪点 + 三层尘埃闪烁、6 组 PT 假坐标十字、色卡阶梯 SW.07+1、
  栏栅格碎片 GRID 6×2、错位图版 PL.09A//COMP.04；声纳减量（旋转环 4→2、行星 5→0、ping 3→1）。
- 新增视觉比重四级 token（--palis-w1 信息 / w2 结构 / w3 环境，w4 介质沿用 intensity 档）
  + --palis-accent / --palis-danger / --palis-moon-lift；装饰层一律从 token 取值，
  杜绝散落的魔法数字再造成隐性层级倒挂。硬规则：蓝只用于身份与当前态，红只留给真实错误。
- 同时提亮信息层（四角标 .30→.44、状态栏正文 #767676→#8f8f8f）、月盘压到 .86。
- **自我纠正**：先前"装饰比信息还亮"的说法不严谨——等高线 .55 是 opacity 乘数，
  乘内部描边 .16 后实际 .088；真正的不平衡是面积×亮度（月盘 vs 信息层），按此调。
- 验证：渲染不变量全绿；hero 截图 theme-minimal-1.png 对比简化前 theme-current.png。

署名：ox-alpha

## 64. 声纳"更细腻"（0.5.12，2026-09-10）

- 用户方向：「声纳效果虽然可以减弱，但可以变化的更细腻」——减弱不变，改的是"变化的质感"。
- ping：半径改减速波前 `1-(1-ph)^3.2`；透明度改平滑包络 `ph^.45·(1-ph)^1.5` 归一化
  （峰值 ph≈0.23、长尾），取代三段折线；另加 0.62× 半径的细淡回声环（波有厚度）。
- 旋转环：角速度叠加三个相差一个数量级的时间尺度（含分钟级漂移），看不出循环。
- 活动态：boost 2.2×→1.6×、过渡放缓（渐起渐落）；活动感改由波的密度表达
  （周期 6.8→5.0s、峰值 .34→.46、回声 .34→.5）。
- 验证：逐帧采样 420 帧——半径单调无回落且减速（+853/+97px）、峰值 .335@相位20
## 64. 声纳"更细腻"（0.5.12，2026-09-10）

- 用户方向：「声纳效果虽然可以减弱，但可以变化的更细腻」——减弱不变，改的是"变化的质感"。
- ping：半径改减速波前 `1-(1-ph)^3.2`；透明度改平滑包络 `ph^.45·(1-ph)^1.5` 归一化
  （峰值 ph≈0.23、长尾），取代三段折线；另加 0.62× 半径的细淡回声环（波有厚度）。
- 旋转环：角速度叠加三个相差一个数量级的时间尺度（含分钟级漂移），看不出循环。
- 活动态：boost 2.2×→1.6×、过渡放缓（渐起渐落）；活动感改由波的密度表达
  （周期 6.8→5.0s、峰值 .34→.46、回声 .34→.5）。
- 验证：逐帧采样 420 帧——半径单调无回落且减速（+853/+97px）、峰值 .335@相位20%、
  包络二阶差分 ≤.009、回声比恒 .62、周期实测 6.64s。
- 清理：PING_EASE 求解器退役（包络改写后无用）。
- 排坑：`printf` 会把正文里的 `%`（如 `.45`）当格式符解析而报错——写含 % 的长文本用
  heredoc（`cat << 'EOF'`）而不是 printf。

署名：ox-alpha
