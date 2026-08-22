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
