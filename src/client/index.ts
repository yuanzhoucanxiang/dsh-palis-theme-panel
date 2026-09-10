/**
 * PALIS 档案终端主题面板 — client 半侧。
 *
 * 职责：
 *  1. settings.section 面板（React 函数组件，按 slots 服务的 register 契约——options + 组件——注册）：
 *     PALIS 控制台（总开关/强度档位/效果开关/自检日志）；
 *  2. 实时应用：把设置写入 <html> 门禁属性 + 注入 PALIS_CSS（与 host 首帧同源）；
 *  3. 右下角浮动快捷开关（一键接入/断开）；
 *  4. 开机自检动画（开启 + boot 开启时，每次页面加载一次）；
 *  5. 声线波动条：composer 顶边蓝线随 [data-streaming] 起伏（canvas 叠加层）；
 *  6. 声纳扩散：轨道图中心徽记的深空 ping，与波动条共用同一活动门；
 *  7. 美术构成扩充层（.palis-glyphs）：平面月盘 / 月面铭牌标题 / 等高线地形碎片 / 测量十字 /
 *     右缘 hex 数据流 / 错位图版 / 单色色卡阶梯 / 栏栅格碎片——补「点+圆+横线」之外的构成类；
 *  8. 星尘星座连线：近邻星点间的极淡连线，点阵升级为缓慢重构的网络构成。
 *
 * 通信：同源 fetch → host /palis-theme/api（revision 守卫；409 冲突回读服务器）。
 * 注意：面板 = React 组件（本内核 slots 契约）；主题应用 = 命令式副作用（与 React 解耦）。
 */
import { createElement, useEffect, useState } from 'react'
import {
  API_ROUTE,
  ART_MOON_MAP,
  DEFAULT_SETTINGS,
  normalizeSettings,
  PALIS_CSS,
  PANEL_CSS,
  applyAttributes,
  type PalisSettings,
} from '../theme-core.ts'

/* ── slots 服务的结构化最小面（运行时无外部 import，react 由 shell 提供）── */
interface SlotRegistration {
  name: string
  id: string
  order?: number
  label: () => string
  locale?: string
}
interface SlotsService {
  inject(name: string, factory: () => unknown): void
  register(reg: SlotRegistration, component: unknown): void
}
interface ClientContext {
  slots: SlotsService
  effect(fn: () => void | (() => void), label?: string): void
}

export const name = 'palis-theme-panel'
export const inject = ['slots']

const h = createElement

/* ═══ 模块级状态（面板 React 组件订阅；主题应用层命令式读写）═══ */
let cssTag: HTMLStyleElement | null = null
let panelTag: HTMLStyleElement | null = null
let bootPlayed = false
let current: PalisSettings = { ...DEFAULT_SETTINGS }
let revision = 0
let settingsPoll = 0 // host 侧变更轮询句柄（见 runtime effect）
let floatBtn: HTMLButtonElement | null = null
let globeEl: HTMLDivElement | null = null
let globeObserver: MutationObserver | null = null
let globeLastEnsure = 0
/* 侧栏收放监听运行态：收放瞬间冻结声纳 + 球自转加速（见 syncMoonReveal） */
let moonRevealObserver: MutationObserver | null = null
/* 声线波动条运行态（引擎见下文「声线波动条」节） */
interface WaveLane {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  w: number // CSS 像素宽（0 = 未量到，跳过绘制）
  accent: string
  resizeTimer?: number // 落定防抖句柄（见 scheduleWaveResize）
}
const waveLanes = new Map<HTMLElement, WaveLane>()
let waveObserver: MutationObserver | null = null
let waveResize: ResizeObserver | null = null
let waveRaf = 0
let waveAmp = 0
let waveBoost = 0
let waveLastSeen = 0
let waveLastScan = 0
let waveMutations = 0
let waveLastEnsure = 0
let waveActive = false // 活动门闩：翻转时同步 html[data-palis-activity]（声纳扩散消费）
const logLines: Array<{ text: string; cls: string }> = []

const listeners = new Set<() => void>()
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function notify(): void {
  for (const listener of listeners) listener()
}

function logLine(text: string, cls: 'ok' | 'err' | 'accent' | '' = ''): void {
  logLines.push({ text: '> ' + text, cls })
  while (logLines.length > 9) logLines.shift()
  notify()
}

function ensurePanelCss(): void {
  // 按 DOM 实况对齐，不信模块变量：cordis effect 重跑时新回调可能先于旧清理
  // 执行，旧的非 null 守卫会让 tag 永远丢失（实测：floatBtn 在而 panelTag 不在）。
  const existing = document.getElementById('palis-theme-panel-css') as HTMLStyleElement | null
  if (existing !== null) {
    panelTag = existing
    return
  }
  panelTag = document.createElement('style')
  panelTag.id = 'palis-theme-panel-css'
  panelTag.textContent = PANEL_CSS
  document.head.appendChild(panelTag)
}

function ensureThemeCss(): void {
  if (cssTag !== null) return
  cssTag = document.getElementById('palis-theme-css') as HTMLStyleElement | null
  if (cssTag === null) {
    cssTag = document.createElement('style')
    cssTag.id = 'palis-theme-css'
    cssTag.textContent = PALIS_CSS
    document.head.appendChild(cssTag)
  }
}

function dropThemeCss(): void {
  if (cssTag !== null) {
    cssTag.remove()
    cssTag = null
  }
}

function syncFloat(): void {
  if (floatBtn === null) return
  floatBtn.classList.toggle('on', current.enabled)
  floatBtn.setAttribute('title', current.enabled ? 'PALIS 已接入 — 点击断开' : 'PALIS 未接入 — 点击接入')
}

/** 本地立即应用（乐观路径），面板/浮动开关同步。 */
function applySettings(next: PalisSettings, opts?: { allowBoot?: boolean }): void {
  current = next
  applyAttributes(next, document.documentElement)
  if (next.enabled) ensureThemeCss()
  else dropThemeCss()
  if (next.enabled && (opts?.allowBoot ?? next.boot) && !bootPlayed && !waveReducedMotion()) {
    // 开机自检（reduced-motion 下整段跳过）。内部先取真凭实据再播放，故为异步 fire-and-forget
    bootPlayed = true
    void playBoot()
  }
  syncFloat()
  ensureGlobe()
  ensureWave()
  ensureSonar()
  ensureCrtSweep()
  ensureFrame()
  ensureStatusBar()
  notify()
}

/* ═══ 数据天体（canvas 正交投影「月面点云」引擎，真·球面自转）═══
 * 风格定位（用户参考：TouchDesigner 式代码粒子建模 + 半调网点海报，追求高级感）：
 * 不再逐像素位图填充，而是构建期从月面贴图（ART_MOON_MAP：月海/环形山/分区网点）
 * 按经纬网格采样反照率 → 一万多颗「月貌粒子」组成旋转点云。渲染期每帧做正交投影
 * （x=cosLat·sin(lon+a)，z=cosLat·cos(lon+a) 后半球剔除）、深度调透明度/尺寸
 * （近亮近大）、alpha 分桶批量绘制（万级粒子只有 ~28 次 fill 状态切换），
 * globalCompositeOperation='lighter' 加法混合叠出微光。密度分档跟贴图亮度走
 * （PT_BANDS 亮度带 → 离散 keep 概率，档间陡跳切出锐利边界）：月海整片彻底
 * 留空（空洞 = 粒子的绝对缺席），空洞岸线亮边一档全收——月海/环形山/射纹
 * 由密度的「无/有」涨落成形，空洞边缘自然显出一圈致密亮边。
 * 渲染 640px 内部分辨率，transform 整体缩放。
 * v0.5.0：月球迁入声纳轨道系中心（星系圆心，layoutGlobe 定位缩放）——自带的
 * HUD 几何层/卫星轨道/live 读数随之退役（仪器语言由声纳环系接管）。
 */
const GLOBE_RENDER = 640
const GLOBE_PERIOD_S = 100
const GLOBE_EXPOSURE = 0.32 // 固定曝光：无光照无辉光，深压暗（贴图线元素已相应补强）
const GLOBE_CONTRAST = 1.4 // 纹理对比：绕中灰 128 拉伸——暗部更暗亮部更亮，均值近似不变
/* 地形点云采样参数 */
const PT_LON_DEG = 0.7 // 经度采样步长（度）
const PT_LAT_DEG = 0.7 // 纬度采样步长（度）
/* 密度分档（海报半调逻辑：亮度带 → 离散密度档，档间陡跳让月海/高地/亮核的
   形状边界锐利可读）：分档边界卡在实测直方图谷底与岸线起点（128：月海峰 ~85
   与高地峰 ~167 之间的真空带；152：岸线亮边主体起点，实测岸线高亮 R 集中在
   144-175）。月海彻底抽空（空洞 = 粒子的绝对缺席），岸线/亮坡一档全收——
   月海空洞由「无/有」一刀切开，空洞边缘自然显出一圈致密亮边 */
const PT_BANDS: readonly (readonly [number, number])[] = [
  [56, 0], // 深月海：空——暗部由粒子的缺席表达
  [128, 0], // 月海：彻底抽空——空洞绝对化，与岸线形成「无/有」硬边界
  [152, 0.78], // 暗高地/过渡带主体
  [256, 1], // 岸线亮边 + 高地亮坡全收（环形山亮环/射纹/喷发毯）——月海描边由此显形
]
const PT_RIM_MIN = 152 // 亮边带下限：全收档粒子的钛蓝强调判定边界
const PT_RIM_SUB = 3 // 亮边带格点子点数：坑环/岸线/射纹每格 3 颗哈希微抖粒子（月坑加密，
// 格点一格一颗是密度上限——亮带破格 = 坑环从格点环变致密环带；其余格 1 颗）
const PT_MAX = 32000 // 点云上限（超出按步长抽稀，各密度档等比收缩）

let globeStop: (() => void) | null = null

function stopGlobeEngine(): void {
  globeStop?.()
  globeStop = null
}

function buildGlobe(): HTMLDivElement {
  const root = document.createElement('div')
  root.className = 'palis-globe'
  root.setAttribute('aria-hidden', 'true')
  const sphere = document.createElement('div')
  sphere.className = 'palis-globe-sphere'
  const canvas = document.createElement('canvas')
  canvas.className = 'palis-globe-canvas'
  // v0.5.11 极简化：删除 dither 噪点层与三层表面尘埃（d1/d2/d3 的异相闪烁）——
  // 它们不承载信息、只是持续吸引注意力的"微噪"，且与扫描线/噪点在质感上重复。
  sphere.append(canvas)
  // v0.5.0：HUD 几何层/卫星轨道/live 读数/铭牌全部退役——月球迁入声纳轨道系中心
  // （星系圆心定位见 layoutGlobe），仪器语言由声纳环系接管，铭牌迁平面月盘。
  root.append(sphere)
  stopGlobeEngine()
  // reduced-motion：球体贴图只渲染一帧静帧（不启动自转循环）
  startGlobeEngine(canvas, { still: waveReducedMotion() })
  return root
}

/* 星系中心定位（v0.5.0）：月球 = 声纳轨道系的中心天体（替换原中心圆点）。
 * 与 layoutSonar 同一圆心公式与 S 基准（orbit 背景 70% 宽 / 58% 高反解）；布局由
 * layoutSonar 末尾统一驱动（v0.5.2 起逐帧跟随、不进冻结窗——纯 transform 写入
 * 无重尺寸风险；整体冻结曾在落定帧产生 ~112px 瞬变回跳，WORKLOG §53），
 * reduced-motion（声纳不挂）时由 ensureGlobe
 * 自己的 ResizeObserver 驱动。缩放走 transform（origin 0 0：scale(k) translate(-50%,-50%)
 * 使元素中心精确压圆心）——内部 1100px 固定几何（球盘 900 / 尘埃坐标）整体等比缩放，
 * 侧栏收放逐帧跟随零重排、零位图重置。盘径 = clamp(0.30·S, 220, 520)：
 * 恰嵌进蓝环（r=184）以内——行星居于轨道系中心。 */
function layoutGlobe(host: HTMLElement): void {
  if (globeEl === null) return
  const scroller = host.querySelector('[data-conversation-scroll]')
  if (!(scroller instanceof HTMLElement)) return
  const hr = host.getBoundingClientRect()
  const sr = scroller.getBoundingClientRect()
  const s = sr.width * 0.7
  const cx = sr.left - hr.left + sr.width * 0.5
  const cy = sr.top - hr.top + (sr.height - s) * 0.58 + s * 0.5
  const k = Math.min(520, Math.max(220, s * 0.3)) / 900
  globeEl.style.left = cx.toFixed(1) + 'px'
  globeEl.style.top = cy.toFixed(1) + 'px'
  globeEl.style.transform = 'scale(' + k.toFixed(4) + ') translate(-50%,-50%)'
}

/** 启动正交投影自转引擎；贴图加载完成后开始逐帧渲染（帧率上限 ~20fps）。
 *  still=true（reduced-motion）：贴图只渲染一帧静帧，不启动任何循环。 */
function startGlobeEngine(canvas: HTMLCanvasElement, opts?: { still?: boolean }): void {
  const SIZE = GLOBE_RENDER
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (ctx === null) return

  let raf = 0
  let disposed = false
  const finish = (): void => {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(raf)
  }
  globeStop = finish

  const img = new Image()
  img.onload = () => {
    if (disposed) return
    // 贴图降采样到 1024x512，取像素数据（一次）
    const MAP_W = 1024
    const MAP_H = 512
    const off = document.createElement('canvas')
    off.width = MAP_W
    off.height = MAP_H
    const octx = off.getContext('2d')
    if (octx === null) return
    octx.drawImage(img, 0, 0, MAP_W, MAP_H)
    const map = octx.getImageData(0, 0, MAP_W, MAP_H).data

    // ── 地形点云采样（构建期一次）：贴图亮度 → 粒子。密度分档跟地形走——
    // 亮度带查表得离散 keep 概率（PT_BANDS），档间陡跳切出锐利形状边界：
    // 月海彻底留空（空洞 = 粒子的绝对缺席），暗高地主体密，岸线亮边一档全收。
    // 每颗粒子只背球面静态量（lon/sinLat/cosLat/亮度），运行帧零查表。 ──
    const cx = SIZE / 2
    const cy = SIZE / 2
    const R = SIZE / 2 - 2
    interface CloudPt { lon: number; sinLat: number; cosLat: number; b: number; blue: boolean }
    const cloud: CloudPt[] = []
    for (let la = -84; la <= 84; la += PT_LAT_DEG) {
      const latRad = (la * Math.PI) / 180
      const sinLat = Math.sin(latRad)
      const cosLat = Math.cos(latRad)
      const vRow = Math.max(0, Math.min(MAP_H - 1, Math.round((0.5 - la / 180) * (MAP_H - 1))))
      for (let lo = 0; lo < 360; lo += PT_LON_DEG) {
        const uCol = Math.round((lo / 360) * (MAP_W - 1))
        const s = map[(vRow * MAP_W + uCol) * 4]
        let p = 1
        for (const [lim, q] of PT_BANDS) {
          if (s < lim) {
            p = q
            break
          }
        }
        if (p === 0) continue
        const h = ((la * 73856093) ^ (lo * 19349663)) | 0 // 确定性哈希：同一格点跨帧稳定
        if (p < 1) {
          const u = (((h % 1024) + 1024) % 1024) / 1024 // [0,1) 均匀
          if (u >= p) continue
        }
        // 与旧位图同一影调：绕中灰对比拉伸 × 固定曝光（构建期算死），封顶防加法混合
        // 过曝；亮边带（≥PT_RIM_MIN）再提 1.3×——月海已黑得彻底，亮边更亮才压得住对比
        const bRaw = ((s - 128) * GLOBE_CONTRAST + 128) * GLOBE_EXPOSURE
        const b = Math.min(120, Math.max(6, s >= PT_RIM_MIN ? bRaw * 1.3 : bRaw))
        // 矿质着色（月海已抽空，蓝调上移到亮边带）：全收档（岸线/亮坡/坑环）
        // ~1/3 钛蓝着色——亮边带冷调显形，呼应矿质蓝罩；中亮带保留 ~3.4% 随机
        // 蓝火花（哈希另一比特段，与密度门不相关）
        const blue = s >= PT_RIM_MIN ? ((h >>> 20) % 3) === 0 : ((h >>> 10) % 29) === 0
        // 坑环/岸线亮带加密（PT_RIM_SUB）：全收档格点按哈希链确定性微抖追加——
        // 月坑环从「格点环」变「致密环带」，坑感由粒子密度直接成形。
        // k=0 不抖动 = 原格点；抖动幅度取半格步长（±0.35°）：恰铺满相邻格点间隙，
        // 子点与邻格子点连成连续带——幅度再小会露出「三连珠」虫状纹理，再大则糊出带外
        const sub = s >= PT_RIM_MIN ? PT_RIM_SUB : 1
        for (let k = 0; k < sub; k++) {
          const hj = (h * (2654435761 + k * 2)) | 0
          const jLo = k === 0 ? 0 : ((((hj >>> 8) % 512) / 512) - 0.5) * PT_LON_DEG
          const jLa = k === 0 ? 0 : ((((hj >>> 18) % 512) / 512) - 0.5) * PT_LAT_DEG
          const latRadJ = ((la + jLa) * Math.PI) / 180
          cloud.push({
            lon: ((lo + jLo) * Math.PI) / 180,
            sinLat: Math.sin(latRadJ),
            cosLat: Math.cos(latRadJ),
            b,
            blue,
          })
        }
      }
    }
    if (cloud.length > PT_MAX) {
      const keep = Math.ceil(cloud.length / PT_MAX)
      const thinned = cloud.filter((_, i) => i % keep === 0)
      cloud.length = 0
      for (const p of thinned) cloud.push(p)
    }
    ;(window as unknown as Record<string, unknown>).__palisPoints = cloud.length // 探针断言用

    let angle = 0
    let lastT = performance.now()
    let lastFrame = 0
    let globeHeat = 0

    // 渲染：正交投影 + 深度衰减 alpha；按 alpha 分桶批量 fill——万级粒子每帧只有
    // 2 色 × 13 档次状态切换。'lighter' 加法混合让粒子叠出微光（高级感的关键一手）。
    const LVL = 14
    const bucketsG: number[][] = []
    const bucketsB: number[][] = []
    for (let l = 0; l < LVL; l++) {
      bucketsG.push([])
      bucketsB.push([])
    }
    const render = (): void => {
      ctx.clearRect(0, 0, SIZE, SIZE)
      for (let l = 1; l < LVL; l++) {
        bucketsG[l].length = 0
        bucketsB[l].length = 0
      }
      for (let i = 0; i < cloud.length; i++) {
        const p = cloud[i]
        const lonA = p.lon + angle
        const z = p.cosLat * Math.cos(lonA)
        if (z <= 0.05) continue // 后半球剔除：硬剪影，无透视穿帮
        const x = p.cosLat * Math.sin(lonA)
        const aBase = (p.b / 120) * (0.14 + 0.86 * z) // 近亮远暗
        const lvl = Math.min(LVL - 1, (aBase * LVL) | 0)
        if (lvl <= 0) continue
        const sx = cx + x * R
        const sy = cy - p.sinLat * R
        const sz = z > 0.62 ? 2 : 1 // 近大远小（内部像素；CSS 放大后呈 1.4/2.8 css px）
        ;(p.blue ? bucketsB : bucketsG)[lvl].push(sx, sy, sz)
      }
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = '#c9d4e2'
      for (let l = 1; l < LVL; l++) {
        const arr = bucketsG[l]
        if (arr.length === 0) continue
        ctx.globalAlpha = Math.min(0.92, l / (LVL - 1))
        for (let k = 0; k < arr.length; k += 3) ctx.fillRect(arr[k], arr[k + 1], arr[k + 2], arr[k + 2])
      }
      ctx.fillStyle = '#6f9cff'
      for (let l = 1; l < LVL; l++) {
        const arr = bucketsB[l]
        if (arr.length === 0) continue
        ctx.globalAlpha = Math.min(0.95, (l / (LVL - 1)) * 1.05)
        for (let k = 0; k < arr.length; k += 3) ctx.fillRect(arr[k], arr[k + 1], arr[k + 2], arr[k + 2])
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      // 遮光/亮边渐变直接画进画布（与粒子同一纹理）：此前是独立 DOM 层
      // （.palis-globe-shade），canvas 每 50ms 重绘上传新纹理时该层可能晚一帧
      // 合成 → 单帧裸亮（实机区域级取证：右下角/中央带单帧 +25~35 再恢复）。
      // 画进画布后月球明暗完全原子化，无层可竞态。
      const g1 = ctx.createRadialGradient(SIZE / 2, SIZE * 0.06, 0, SIZE / 2, SIZE * 0.06, SIZE * 0.14)
      g1.addColorStop(0, 'rgba(255,255,255,.07)')
      g1.addColorStop(1, 'rgba(255,255,255,0)')
      const g2 = ctx.createLinearGradient(0, 0, 0, SIZE)
      g2.addColorStop(0, 'rgba(0,0,0,.16)')
      g2.addColorStop(0.34, 'rgba(0,0,0,.05)')
      g2.addColorStop(0.78, 'rgba(0,0,0,.2)')
      ctx.fillStyle = g1
      ctx.fillRect(0, 0, SIZE, SIZE)
      ctx.fillStyle = g2
      ctx.fillRect(0, 0, SIZE, SIZE)
    }

    const loop = (t: number): void => {
      if (disposed) return
      const dt = Math.min(0.1, (t - lastT) / 1000)
      lastT = t
      // 活动门：与声纳/行星同一节奏（快起慢落），球自转随活动加速
      const heatTarget = waveActive ? 1 : 0
      globeHeat += (heatTarget - globeHeat) * (heatTarget > globeHeat ? 0.05 : 0.015)
      const boost = 1 + 2 * globeHeat + 3 * moonSlideBoost
      moonSlideBoost *= 0.97 // 衰减：约 1.2s 回落正常转速
      angle += (dt * 2 * Math.PI * boost) / GLOBE_PERIOD_S
      if (t - lastFrame >= 50) {
        lastFrame = t
        render()
      }
      raf = requestAnimationFrame(loop)
    }
    render()
    if (opts?.still === true) {
      return // reduced-motion：静帧点云——粒子已画，不进循环
    }
    raf = requestAnimationFrame(loop)
  }
  img.src = 'data:image/svg+xml;utf8,' + ART_MOON_MAP
}

/* ═══ 星尘漂移场：全屏微粒缓漂 + 异相闪烁（背景生命力；独立轻 rAF，同 orbitFrame 先例）═══
 * 静态 SVG 星尘（ART_STARS）之上的一层"活"粒子：~80-240 颗按视口面积定量，
 * 向左缓漂 + 正弦异相闪烁，少量蓝火花与暖橙点缀（呼应参考图的橙色温度）。
 * reduced-motion 只画一帧静态散点。与 globe 同挂 [data-phase]，DOM 序在其前 = 压其下。 */
interface StarDot { x: number; y: number; vx: number; vy: number; ph: number; w: number; tone: number }
let starCanvas: HTMLCanvasElement | null = null
let starCtx: CanvasRenderingContext2D | null = null
let starRaf = 0
let starLast = 0
let starFrameSkip = false // 隔帧重绘门（见 starFrame）
let starDots: StarDot[] = []
let starResizeObs: ResizeObserver | null = null
let starResizeTimer: number | undefined
/* 持久连线配对（§44）：key = (i<<16)|j（i<j，星数 ≤240 不会溢出）。
 * 跨帧保持既有配对，建立/断开走滞后带，避免逐帧贪心重选的整网生灭频闪。 */
const starLinks = new Set<number>()

function dropStarfield(): void {
  if (starRaf !== 0) {
    cancelAnimationFrame(starRaf)
    starRaf = 0
  }
  starLast = 0
  starResizeObs?.disconnect()
  starResizeObs = null
  if (starResizeTimer !== undefined) {
    clearTimeout(starResizeTimer)
    starResizeTimer = undefined
  }
  starLinks.clear()
  starDots = []
  starCanvas?.remove()
  starCanvas = null
  starCtx = null
}

function newStar(w: number, h: number, i: number): StarDot {
  const tone = i % 23 === 0 ? 2 : i % 8 === 0 ? 1 : 0 // 少量暖橙/蓝火花，余为冷灰白
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: -(Math.random() * 4.5 + 2.5), // 统一缓向左漂（深空风）
    vy: Math.random() * 3 - 1.5,
    ph: Math.random() * Math.PI * 2,
    w: 0.35 + Math.random() * 0.5,
    tone,
  }
}

/* 播种/调量：resize 不重撒——旧实现在此整组重建（星点随机换位 + 连线网络全量重连），
 * 布局过渡期 ResizeObserver 逐帧触发 = 实测一次收放 15 次重撒、星图网络频闪（§44）。
 * 正确逻辑：既有星位置保留、出界的环绕回场，只按面积目标补/减星数。 */
function seedStars(w: number, h: number): void {
  const n = Math.min(240, Math.max(80, Math.round((w * h) / 26000)))
  ;(window as unknown as Record<string, unknown>).__palisStars = n // 探针断言用
  for (const d of starDots) {
    if (d.x > w + 4) d.x = ((((d.x + 4) % (w + 8)) + w + 8) % (w + 8)) - 4
    if (d.y > h + 4) d.y = ((((d.y + 4) % (h + 8)) + h + 8) % (h + 8)) - 4
  }
  while (starDots.length > n) starDots.pop()
  let i = starDots.length
  while (starDots.length < n) starDots.push(newStar(w, h, i++))
  // pop 减星 / 换位留下的失效连线索引，由 drawStars 的断开判定统一清理
}

function sizeStars(): void {
  if (starCanvas === null || starCtx === null) return
  const host = starCanvas.parentElement
  if (host === null) return
  const w = host.clientWidth
  const h = host.clientHeight
  if (!w || !h) return
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  starCanvas.width = Math.round(w * dpr)
  starCanvas.height = Math.round(h * dpr)
  starCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  seedStars(w, h)
}

/* 落定防抖（§44，同 WAVE_RESIZE_SETTLE_MS 先例）：侧栏收放等布局过渡让宿主逐帧
 * resize，逐帧 canvas.width= 清空位图 = 星场频闪的另一半温床；改为落定 160ms 后
 * 一次性重置，过渡窗内由浏览器对旧位图短暂 CSS 拉伸（散点微粒，无感）。 */
const STAR_RESIZE_SETTLE_MS = 160

function scheduleStarResize(): void {
  if (starDots.length === 0) {
    sizeStars() // 首次：立即定型，否则没有可绘制内容
    return
  }
  if (starResizeTimer !== undefined) clearTimeout(starResizeTimer)
  starResizeTimer = window.setTimeout(() => {
    starResizeTimer = undefined
    sizeStars()
  }, STAR_RESIZE_SETTLE_MS)
}

function drawStars(t: number, dt: number): void {
  if (starCanvas === null || starCtx === null) return
  const ctx = starCtx
  const w = starCanvas.clientWidth
  const h = starCanvas.clientHeight
  ctx.clearRect(0, 0, w, h)
  for (const d of starDots) {
    d.x += d.vx * dt
    d.y += d.vy * dt
    if (d.x < -4) d.x += w + 8
    if (d.y < -4) d.y += h + 8
    else if (d.y > h + 4) d.y -= h + 8
  }
  /* 星座连线（点阵 → 网络构成）：持久配对 + 滞后带（§44）——既有配对跨帧保持，
   * 距离拉过 128px 才断开、近到 110px 内才建立，每星至多 2 条。旧实现逐帧贪心重选，
   * 星点缓漂使选择序抖动 = 整网连线高频生灭（频闪）。
   * 横向环绕复位的星与屏边星距离必然 >128，下一帧即断开，不会拖出横贯线；
   * 连线画在星点之下。 */
  const LINK_UP_D2 = 110 * 110 // 建立阈
  const LINK_DOWN_D2 = 128 * 128 // 断开阈（滞后带，防边界抖动反复生灭）
  const n = starDots.length
  ctx.strokeStyle = '#8fa8d8'
  ctx.lineWidth = 0.7
  ctx.globalAlpha = waveActive ? 0.13 : 0.08 // 活动门：AI 工作时星座略亮
  ctx.beginPath()
  // ① 保持/断开既有配对（Set.forEach 内 delete 当前键安全）；顺带 prune 失效索引
  for (const key of starLinks) {
    const i = key >> 16
    const j = key & 0xffff
    if (i >= n || j >= n) {
      starLinks.delete(key)
      continue
    }
    const a = starDots[i]
    const b = starDots[j]
    const dx = a.x - b.x
    const dy = a.y - b.y
    if (dx * dx + dy * dy > LINK_DOWN_D2) {
      starLinks.delete(key)
      continue
    }
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
  }
  // ② 补足新配对：从 starLinks 重建每星计数，只找 <110px 的未配对近邻
  const linkCounts = new Uint8Array(n)
  for (const key of starLinks) {
    linkCounts[key >> 16] += 1
    linkCounts[key & 0xffff] += 1
  }
  for (let i = 0; i < n; i++) {
    if (linkCounts[i] >= 2) continue
    const a = starDots[i]
    for (let j = i + 1; j < n; j++) {
      if (linkCounts[j] >= 2 || starLinks.has((i << 16) | j)) continue
      const b = starDots[j]
      const dx = a.x - b.x
      if (dx > 110 || dx < -110) continue
      const dy = a.y - b.y
      if (dx * dx + dy * dy >= LINK_UP_D2) continue
      starLinks.add((i << 16) | j)
      linkCounts[i] += 1
      linkCounts[j] += 1
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      if (linkCounts[i] >= 2) break
    }
  }
  ctx.stroke()
  ;(window as unknown as Record<string, unknown>).__palisLinks = starLinks.size // 探针断言用
  for (const d of starDots) {
    const tw = 0.55 + 0.45 * Math.sin((t / 1000) * d.w + d.ph) // 异相慢闪烁
    ctx.globalAlpha = 0.14 + 0.34 * tw
    ctx.fillStyle = d.tone === 2 ? '#e8a89f' : d.tone === 1 ? '#7fa8ff' : '#cdd8e4'
    ctx.fillRect(d.x, d.y, 1.3, 1.3)
  }
  ctx.globalAlpha = 1
}

function starFrame(t: number): void {
  starRaf = 0
  if (starCanvas === null || !starCanvas.isConnected) return
  const dt = starLast > 0 ? Math.min(0.1, (t - starLast) / 1000) : 0.016
  starLast = t
  // 隔帧重绘（30fps）：240 星闪烁差异人眼无感，释放主线程给布局/滑动动画
  starFrameSkip = !starFrameSkip
  if (starFrameSkip) { starRaf = requestAnimationFrame(starFrame); return }
  drawStars(t, dt)
  starRaf = requestAnimationFrame(starFrame)
}

/** 幂等挂载：须在 globe 挂载之后调用——prepend 让星场成为第一个子节点（画在最下）。 */
function ensureStarfield(host: Element): void {
  const rm = waveReducedMotion()
  if (!rm && starRaf === 0) {
    starLast = performance.now()
    starRaf = requestAnimationFrame(starFrame)
  } else if (rm && starRaf !== 0) {
    cancelAnimationFrame(starRaf)
    starRaf = 0
  }
  if (starCanvas !== null && starCanvas.parentElement === host) return
  dropStarfield()
  starCanvas = document.createElement('canvas')
  starCanvas.className = 'palis-starfield'
  starCanvas.setAttribute('aria-hidden', 'true')
  starCtx = starCanvas.getContext('2d')
  if (starCtx === null) {
    starCanvas = null
    return
  }
  host.prepend(starCanvas)
  sizeStars()
  if (rm) drawStars(0, 0) // reduced-motion：只画一帧静态散点
  else {
    starResizeObs = new ResizeObserver(() => scheduleStarResize())
    starResizeObs.observe(host)
  }
}

/* ═══ 美术构成扩充层（.palis-glyphs）：补「点+圆+横线」之外的构成类 ═══
 * ⓪ 平面月盘（平涂月面版画，右锚半露）① 月面铭牌标题（排版，平面月盘可视半盘常驻）
 * ② 等高线地形碎片（有机曲线，对完美圆环）③ 测量十字 + 编号坐标（散布测点）
 * ④ 右缘 hex 数据流（流动文本）⑤ 错位图版（块面）⑥ 单色色卡阶梯（色块）
 * ⑦ 栏栅格碎片（版式参考线）。
 * 全部静态或纯 CSS transform 动画，零逐帧 JS（帧预算铁律 WORKLOG §29）。 */

/** 右缘数据流内容：4 位 hex 组 ×170 行，整份复制一次供 translateY(-50%) 无缝循环。 */
function edgeStreamText(): string {
  const hex = '0123456789ABCDEF'
  const lines: string[] = []
  for (let i = 0; i < 170; i++) {
    let s = ''
    for (let k = 0; k < 4; k++) s += hex[(Math.random() * 16) | 0]
    lines.push(s)
  }
  const copy = lines.join('\n') + '\n'
  return copy + copy
}

function buildGlyphs(): HTMLDivElement {
  const root = document.createElement('div')
  root.className = 'palis-glyphs'
  root.setAttribute('aria-hidden', 'true')
  // ⓪ 平面月盘（v0.4.9，用户构图指令「不能全是粒子，也要加入平面设计」的平面主体）：
  //    开机舷窗同款平涂月面贴图（ART_MOON_MAP 数据 URI 复用，浏览器复用解码），
  //    右锚半露——粒子月球居中星系（v0.5.0），平面月盘在右（版画）。
  //    置于 glyphs 栈底（首子节点）：测点/图版/色卡等小件叠在盘面之上 = 图纸分层。
  const flatmoon = document.createElement('div')
  flatmoon.className = 'pg-flatmoon'
  const fmRing = document.createElement('i')
  fmRing.className = 'fm-ring'
  const fmDisc = document.createElement('div')
  fmDisc.className = 'fm-disc'
  // v0.5.2 无缝公转：单 img 宽 200% 时 translateX(-50%) 只走过半张图，
  // 循环点左/右半图内容不同 = 每 140s 一帧硬切。改双副本条带（宽 400%，
  // 各载一整张 2:1 贴图），位移一整张图宽 = 副本 B 精确顶替副本 A，无缝回绕。
  const fmStrip = document.createElement('div')
  fmStrip.className = 'fm-strip'
  for (let i = 0; i < 2; i++) {
    const fmImg = document.createElement('img')
    fmImg.alt = ''
    fmImg.src = 'data:image/svg+xml;utf8,' + ART_MOON_MAP
    fmStrip.appendChild(fmImg)
  }
  fmDisc.appendChild(fmStrip)
  // ① 月面铭牌（v0.5.0 迁上平面月盘，回归参考图「标题在月面上」构图）：
  //    球体已迁入星系中心（盘面小、多被内容覆盖），铭牌改挂平面月盘的可视半盘
  //    （左四分之一位 = 露出半区的中心），常驻静态（不再有揭示滑动）。
  const moontitle = document.createElement('div')
  moontitle.className = 'pg-moontitle'
  const mtBrand = document.createElement('b')
  mtBrand.textContent = 'PALIS 09A'
  const mtInfo = document.createElement('span')
  moontitle.append(mtBrand, mtInfo)
  void paintMoonLabel(mtInfo) // 月面铭牌：静态拟态文本 → 真实工作环境（工作区/内核版本）
  flatmoon.append(fmRing, fmDisc, moontitle)
  // ② 等高线地形碎片：三座山丘的嵌套闭合轮廓（测绘图语言）。轮廓用扁长肾形 +
  // 逐圈偏心错位（真等高线不是同心缩放副本——嵌套偏心才读得出"山"）
  const BLOB = 'M46,4 C62,2 84,10 91,26 C97,41 92,52 84,62 C74,74 66,88 48,88 C30,88 14,78 9,60 C5,44 10,30 20,18 C28,8 32,6 46,4 Z'
  const cluster = (cx: number, cy: number, base: number, rot0: number, scales: readonly number[]): string => {
    let s = ''
    scales.forEach((sc, i) => {
      const off = (i % 2 === 0 ? 1 : -1) * i * 1.7 // 逐圈偏心
      s += "<path d='" + BLOB + "' transform='translate(" + (cx + off).toFixed(1) + ' ' + (cy - off * 0.6).toFixed(1) + ') rotate(' + (rot0 + i * 13) + ') scale(' + (sc * base).toFixed(3) + ") translate(-50 -50)'/>"
    })
    return s
  }
  const topo = document.createElement('div')
  topo.className = 'pg-topo'
  topo.innerHTML =
    "<svg viewBox='0 0 100 100' fill='none' stroke='rgba(226,236,246,.16)' stroke-width='.6'>" +
    cluster(48, 58, 1, 0, [1, 0.8, 0.63, 0.48, 0.35, 0.23]) +
    cluster(80, 22, 0.4, 24, [1, 0.6, 0.28]) +
    cluster(14, 82, 0.3, -14, [1, 0.55]) +
    "<path d='M44,58 h8 M48,54 v8' stroke-width='.8'/></svg>"
  const topoTag = document.createElement('span')
  topoTag.className = 'pg-topo-tag'
  topoTag.textContent = 'TERRAIN // REL 240M'
  // 右缘 hex 数据流（胶片边缘码语义）
  const stream = document.createElement('div')
  stream.className = 'palis-edgestream'
  const lane = document.createElement('i')
  lane.textContent = edgeStreamText()
  stream.appendChild(lane)
  // v0.5.11 极简化：删除 6 组测量十字（PT-01…PT-06 固定假坐标）、色卡阶梯（SW.07+1）、
  // 栏栅格碎片、错位图版（PL.09A // COMP.04）——它们都是"不承载信息的装饰"，
  // 且占着 hero 中央的留白。保留等高线地形（降权到环境层）与右缘数据流。
  root.append(flatmoon, topo, topoTag, stream)
  return root
}

/** 幂等挂载：主题 + 背景图形开启时挂到会话根容器（宿主更换自动重挂；由 ensureGlobe 统一驱动）。 */
function ensureGlyphs(): void {
  if (!current.enabled || !current.artwork) {
    glyphsEl?.remove()
    glyphsEl = null
    return
  }
  const host = document.querySelector('[data-phase]')
  if (host === null) return
  if (glyphsEl !== null && glyphsEl.parentElement === host) return
  glyphsEl?.remove()
  glyphsEl = buildGlyphs()
  host.prepend(glyphsEl)
}

/** 幂等挂载：主题开启 + 图形开启时，把月球插到会话根容器（不随消息滚动；宿主更换自动重挂）。 */
/** 幂等挂载 CRT 扫描频带（固定层，transform 动画=合成器友好；
 *  旧实现把频带并入 html::after 的 background-position 动画=全屏逐帧重绘，抢所有过渡的帧）。 */
/** 幂等挂载 ASCII 取景框层：四角裁切标记 + 角落铭牌 + 滚动深度读数。
 *  「整页是一份被归档观测的记录」的取景器语义；随主题启停挂/摘。 */
function ensureFrame(): void {
  if (!current.enabled) {
    frameEl?.remove()
    frameEl = null
    return
  }
  if (frameEl !== null && frameEl.isConnected) return
  frameEl?.remove()
  const el = document.createElement('div')
  el.className = 'palis-frame'
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML =
    '<i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>' +
    '<span class="tl-tag">SYS//----</span>' +
    '<span class="tr-tag">ARCHIVE TERMINAL</span>'
  document.body.prepend(el)
  frameEl = el
  void paintFrameTag(el) // 左上角标换成真实实例标识；拿不到数据则保留占位，不臆造
}

/** 左上角标真值：`SYS//P<端口> · WS//<工作区目录名>`（数据来自外壳，见 readShellState）。 */
async function paintFrameTag(el: HTMLElement): Promise<void> {
  const tag = el.querySelector('.tl-tag')
  if (tag === null) return
  const state = await readShellState()
  if (state === null) return
  const parts: string[] = []
  if (typeof state.port === 'number' && state.port > 0) parts.push('SYS//P' + String(state.port))
  const ws = String(state.workspace || '').split(/[\\/]/).filter(Boolean).pop() || ''
  if (ws !== '') parts.push('WS//' + ws.slice(0, 20))
  if (parts.length > 0) tag.textContent = parts.join(' · ')
}

/**
 * 外壳状态（可选依赖）：主题也可能跑在纯浏览器 `dsh web` 里，那里没有 preload 注入的
 * `window.dshShell`——一律特性探测，拿不到返回 null，由调用方保留静态占位。
 */
interface ShellState {
  version?: string
  kernelVersion?: string
  port?: number
  workspace?: string
  elapsedMs?: number
}

async function readShellState(): Promise<ShellState | null> {
  const shell = (window as unknown as { dshShell?: { status?: () => Promise<ShellState> } }).dshShell
  if (shell === undefined || typeof shell.status !== 'function') return null
  try {
    return (await shell.status()) || null
  } catch {
    return null
  }
}

/** 外壳的插件体检报告（可选依赖，同上特性探测）。 */
async function readPluginsReport(): Promise<{ items?: unknown[]; problems?: unknown[]; quarantined?: unknown[] } | null> {
  const shell = (window as unknown as { dshShell?: { pluginsReport?: () => Promise<Record<string, unknown>> } }).dshShell
  if (shell === undefined || typeof shell.pluginsReport !== 'function') return null
  try {
    return (await shell.pluginsReport()) as { items?: unknown[]; problems?: unknown[]; quarantined?: unknown[] }
  } catch {
    return null
  }
}

/**
 * 开机自检要报的"真凭实据"。每项都有真实来源，**拿不到就留空**，由调用方显示占位——
 * 这层覆盖以前整屏是拟态文本（`GROUND TRACK ... LOCKED` 之类），现在改为交代实际情况：
 * 接没接上外壳、内核是哪个版本跑在哪个端口、插件装了几个有没有问题、主题版本、视口与
 * DPR（视觉排查时这两个值最有用）、启动耗时。
 */
interface BootFacts {
  linked: boolean
  workspace: string
  shell: string
  kernel: string
  port: string
  plugins: string
  pluginsBad: boolean
  theme: string
  viewport: string
  boot: string
}

let bootFactsCache: BootFacts | null = null

async function collectBootFacts(): Promise<BootFacts> {
  if (bootFactsCache !== null) return bootFactsCache
  const facts: BootFacts = {
    linked: false, workspace: '', shell: '', kernel: '', port: '',
    plugins: '', pluginsBad: false, theme: '', viewport: '', boot: '',
  }
  facts.viewport = `${window.innerWidth}×${window.innerHeight} @${(window.devicePixelRatio || 1).toFixed(2)}x`
  try {
    const view = await apiGet()
    facts.theme = view.version ? `palis ${view.version} · rev ${view.revision}` : `rev ${view.revision}`
  } catch {
    /* 主题版本拿不到就留空 */
  }
  const state = await readShellState()
  if (state !== null) {
    facts.linked = true
    if (state.version) facts.shell = `dsh-desktop ${state.version}`
    if (state.kernelVersion) facts.kernel = state.kernelVersion
    if (typeof state.port === 'number' && state.port > 0) facts.port = 'P' + String(state.port)
    const ws = String(state.workspace || '').split(/[\\/]/).filter(Boolean).pop() || ''
    if (ws !== '') facts.workspace = ws.slice(0, 24)
    if (typeof state.elapsedMs === 'number' && state.elapsedMs > 0) facts.boot = (state.elapsedMs / 1000).toFixed(1) + 's'
  }
  const report = await readPluginsReport()
  if (report !== null) {
    const total = Array.isArray(report.items) ? report.items.length : 0
    const bad = Array.isArray(report.problems) ? report.problems.length : 0
    const quarantined = Array.isArray(report.quarantined) ? report.quarantined.length : 0
    facts.pluginsBad = bad > 0 || quarantined > 0
    facts.plugins = `${total} loaded` + (bad > 0 ? ` · ${bad} problem` : '') + (quarantined > 0 ? ` · ${quarantined} quarantined` : '')
  }
  bootFactsCache = facts // 一次会话内不变（端口/版本/插件装载都是启动期事实），供角标与铭牌复用
  return facts
}

/** 月面铭牌真值：`WS//<工作区> · KRN <内核版本> · P<端口>`（拿不到则保持空，不臆造）。 */
async function paintMoonLabel(el: HTMLElement): Promise<void> {
  const facts = await collectBootFacts()
  const parts: string[] = []
  if (facts.workspace !== '') parts.push('WS//' + facts.workspace)
  if (facts.kernel !== '') parts.push('KRN ' + facts.kernel)
  if (facts.port !== '') parts.push(facts.port)
  if (parts.length > 0) el.textContent = parts.join(' · ')
}

function ensureStatusBar(): void {
  if (!current.enabled) {
    statusbarEl?.remove()
    statusbarEl = null
    return
  }
  if (statusbarEl !== null && statusbarEl.isConnected) return
  statusbarEl?.remove()
  const el = document.createElement('div')
  el.className = 'palis-statusbar'
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML =
    '<b class="sb-brand">▲ PALIS 09A</b>' +
    '<span id="palis-sb-phase">PHASE:--</span>' +
    '<span id="palis-sb-sess"></span>' +
    '<span id="palis-sb-utc">UTC --:--:--</span>' +
    '<span id="palis-sb-scroll">SCROLL 000%</span>' +
    '<span id="palis-sb-model"></span>' +
    '<span id="palis-composer-count">LN 000 · CHR 0000</span>' +
    '<span class="sb-live"></span>' +
    '<span class="sb-ver"></span>'
  document.body.append(el)
  statusbarEl = el
  void paintVersionPlate(el) // 右侧铭牌换成"外壳·内核·主题"三方版本真值（此前是写死的 REV 09A）
}

/**
 * 右侧铭牌真值：`SHL <外壳版本> · KRN <内核版本> · REV <主题版本>`。
 * 三段各自独立取值，任一段拿不到就少显示一段（不臆造）——外壳缺席时（纯浏览器 dsh web）
 * 该铭牌保持空白，而不是显示一个假的版本号。
 */
async function paintVersionPlate(el: HTMLElement): Promise<void> {
  const plate = el.querySelector('.sb-ver')
  if (plate === null) return
  const state = await readShellState()
  let themeVersion = ''
  try {
    themeVersion = (await apiGet()).version || ''
  } catch {
    /* 主题版本拿不到就少一段 */
  }
  const parts: string[] = []
  if (state !== null && state.version) parts.push('SHL ' + state.version)
  if (state !== null && state.kernelVersion) parts.push('KRN ' + state.kernelVersion)
  if (themeVersion !== '') parts.push('REV ' + themeVersion)
  if (parts.length > 0) plate.textContent = parts.join(' · ')
}

function ensureCrtSweep(): void {
  if (!current.enabled) {
    crtSweepEl?.remove()
    crtSweepEl = null
    return
  }
  if (crtSweepEl !== null && crtSweepEl.isConnected) return
  crtSweepEl?.remove()
  crtSweepEl = document.createElement('div')
  crtSweepEl.className = 'palis-crt-sweep'
  crtSweepEl.setAttribute('aria-hidden', 'true')
  document.body.prepend(crtSweepEl)
}

function ensureGlobe(): void {
  ensureGlyphs() // 构成层与天体同门（enabled+artwork）、同宿主（[data-phase]）
  if (!current.enabled || !current.artwork) {
    dropStarfield()
    globeResizeObs?.disconnect()
    globeResizeObs = null
    globeEl?.remove()
    globeEl = null
    stopGlobeEngine()
    return
  }
  const host = document.querySelector('[data-phase]') ?? document.querySelector('[data-conversation-scroll]')
  if (host === null) return
  if (globeEl !== null && globeEl.parentElement === host) {
    ensureStarfield(host) // 已挂载：只需保证星场跟随（reduced-motion 热切换路径）
    return
  }
  globeEl?.remove()
  globeEl = buildGlobe()
  host.prepend(globeEl)
  if (host instanceof HTMLElement) {
    layoutGlobe(host) // 星系中心定位（非 RM 路径随后由 layoutSonar 统一驱动）
    // reduced-motion：声纳不挂（其 ResizeObserver 缺席），月球自挂一个布局跟随
    if (waveReducedMotion()) {
      globeResizeObs?.disconnect()
      const scroller = host.querySelector('[data-conversation-scroll]')
      if (scroller instanceof HTMLElement) {
        globeResizeObs = new ResizeObserver(() => layoutGlobe(host))
        globeResizeObs.observe(scroller)
      }
    }
  }
  ensureStarfield(host)
}
let globeResizeObs: ResizeObserver | null = null

function scheduleEnsureGlobe(): void {
  const now = Date.now()
  if (now - globeLastEnsure < 600) return
  globeLastEnsure = now
  queueMicrotask(ensureGlobe)
}

/* 侧栏收放监听（v0.5.0 起不再驱动月球位移——月球常驻星系中心，layoutSonar 逐帧
 * 跟随滚动体几何；本观察者保留原职：收放瞬间冻结 ping 重尺寸 + 给球自转
 * 短暂加速，沿用滑动甩感）。左侧栏 = data-sidebar-collapsed 数据属性（内核 layout
 * 契约）；右侧栏 = --dsh-sidebar-width 布局变量（'0px'/未设置 = 收起）。
 * 真闪源 = 声纳 ping 环逐帧重尺寸（已阈值门根治），冻结窗是过渡期双保险
 * （v0.5.2 起只冻 ping 段——环/月球整体冻结会在落定帧瞬变回跳，WORKLOG §53）。
 * 必须带变化检测（full 翻转才冻结）：无条件冻结会把启动时的 syncMoonReveal()
 * 也变成冻结源——ensureSonar 的首次布局落进冻结窗被跳过，声纳/月球永远不定位 */
let moonSlideBoost = 0
let sidebarFullLast = false

function syncMoonReveal(): void {
  const root = document.documentElement
  const leftCollapsed = document.querySelector('[data-sidebar-collapsed]') !== null
  const rightW = root.style.getPropertyValue('--dsh-sidebar-width').trim()
  const full = leftCollapsed && (rightW === '' || rightW === '0px')
  if (full === sidebarFullLast) return
  sidebarFullLast = full
  moonSlideBoost = 1
  sonarFreezeUntil = performance.now() + 700
}

/* ═══ 声线波动条（composer 顶边蓝线 → 随 AI 思考/输出起伏）═══
 * 信号：内核语义属性 [data-streaming]（assistant 消息根在推理/输出全程置位——
 * 与官方 selector-check 门禁监控的是同一类稳定契约，不碰 hash 类名/aria 文案）。
 * 画布叠加在 [data-composer-card] 顶边上：静默时清空（原 2px 蓝边 = 静止基线），
 * 活动时画复合正弦波，振幅 = 基础值 + 输出突发密度加成（思考缓涌、输出起舞）。 */
const WAVE_MAX_AMP = 6.5 // px，单边最大振幅（画布高 18，留 2px 描边余量）
const WAVE_HOLD_MS = 700 // 信号消失后的软着陆保持（跨 thinking→output 间隙）
const WAVE_SCAN_MS = 120 // 活动信号扫描节流
const WAVE_BOOST_DECAY = 0.92 // 每帧突发加成衰减

function waveReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ═══ CRT 开关机闪屏（POWER 切换的签名瞬间）═══
 * 通电：黑幕中一条水平亮线从中心展开 → 纵向涨满成光带 → 幕布淡出露出主题 UI；
 * 断电：暗罩先扣住画面（遮住摘主题瞬间的裸 UI），亮线收束成点熄灭，罩布再淡出。
 * 样式在 PANEL_CSS（常驻表）——"断电"播放时 PALIS_CSS 已被摘除。reduced-motion 不播。 */
function playCrtFlash(kind: 'on' | 'off'): void {
  if (waveReducedMotion()) return
  const fx = document.createElement('div')
  fx.className = 'palis-crt-fx ' + kind
  const line = document.createElement('i')
  fx.appendChild(line)
  document.documentElement.appendChild(fx)
  window.setTimeout(() => fx.remove(), kind === 'on' ? 620 : 560)
}

function waveAccent(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--palis-accent').trim()
  return v || '#2b5fd9'
}

function sizeWave(lane: WaveLane): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = lane.canvas.clientWidth
  const h = lane.canvas.clientHeight
  if (!w || !h) return
  lane.w = w
  lane.canvas.width = Math.round(w * dpr)
  lane.canvas.height = Math.round(h * dpr)
  lane.ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // 之后全部按 CSS 像素作画
}

/* 画布元素由 CSS（width:calc(100% + 2px)）跟随 composer 卡片宽度；真正会清空画面的是
 * backing store 重置（canvas.width=）。侧栏开合等布局动画期间 ResizeObserver 逐帧触发，
 * 逐帧重置 = 波形闪断（实测侧栏推拉时蓝线频闪）——改成落定后一次性重置，动画窗口内
 * 由浏览器对旧位图做短暂 CSS 拉伸（细线条，160ms 内无感）。 */
const WAVE_RESIZE_SETTLE_MS = 160

function scheduleWaveResize(lane: WaveLane): void {
  if (lane.w === 0) {
    sizeWave(lane) // 首次量宽：立即定型，否则没有可绘制的 backing store
    return
  }
  if (lane.resizeTimer !== undefined) clearTimeout(lane.resizeTimer)
  lane.resizeTimer = window.setTimeout(() => {
    lane.resizeTimer = undefined
    sizeWave(lane)
  }, WAVE_RESIZE_SETTLE_MS)
}

function dropWave(): void {
  if (waveRaf) cancelAnimationFrame(waveRaf)
  waveRaf = 0
  for (const lane of waveLanes.values()) {
    if (lane.resizeTimer !== undefined) clearTimeout(lane.resizeTimer)
    lane.canvas.remove()
  }
  waveLanes.clear()
  waveAmp = 0
  waveBoost = 0
  waveLastSeen = 0
  if (waveActive) {
    waveActive = false
    document.documentElement.removeAttribute('data-palis-activity')
  }
}

/** 幂等挂载：主题开启时给每个 [data-composer-card] 顶边贴一块波动画布（宿主重建自动重挂）。 */
function ensureWave(): void {
  if (!current.enabled || waveReducedMotion()) {
    if (waveLanes.size > 0) dropWave()
    return
  }
  for (const [card, lane] of waveLanes) {
    if (!card.isConnected) {
      if (lane.resizeTimer !== undefined) clearTimeout(lane.resizeTimer)
      lane.canvas.remove()
      waveLanes.delete(card)
    }
  }
  document.querySelectorAll<HTMLElement>('[data-composer-card]').forEach((card) => {
    if (waveLanes.has(card)) return
    if (getComputedStyle(card).position === 'static') card.style.position = 'relative'
    const canvas = document.createElement('canvas')
    canvas.className = 'palis-wave'
    canvas.setAttribute('aria-hidden', 'true')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    card.appendChild(canvas)
    const lane: WaveLane = { canvas, ctx, w: 0, accent: waveAccent() }
    waveLanes.set(card, lane)
    sizeWave(lane)
    waveResize?.observe(card)
    if (Date.now() - waveLastSeen < WAVE_HOLD_MS) wakeWave() // 挂上时已在流式中：立即起舞
  })
}

function scheduleEnsureWave(): void {
  const now = Date.now()
  if (now - waveLastEnsure < 600) return
  waveLastEnsure = now
  queueMicrotask(ensureWave)
}

/** 节流扫描活动信号；输出突发密度沉淀为 waveBoost（0..1）。 */
function scanWave(): void {
  const now = Date.now()
  if (now - waveLastScan < WAVE_SCAN_MS) return
  waveLastScan = now
  const streaming = document.querySelector('[data-streaming]') !== null
  if (streaming) waveLastSeen = now
  // 突变计数只在流式活动期生效：侧栏收放等结构性 DOM 突变风暴会误抬 waveBoost
  // （波动条振幅异常起伏，与闪同源的信号污染，WORKLOG 25/26）
  waveBoost = streaming ? Math.max(waveBoost * 0.55, Math.min(1, waveMutations / 24)) : waveBoost * 0.55
  waveMutations = 0
  if (now - waveLastSeen < WAVE_HOLD_MS) wakeWave()
}

function wakeWave(): void {
  if (waveRaf || waveLanes.size === 0) return
  waveRaf = requestAnimationFrame(waveFrame)
}

function waveFrame(t: number): void {
  waveRaf = 0
  if (waveLanes.size === 0) return
  const active = Date.now() - waveLastSeen < WAVE_HOLD_MS
  if (active !== waveActive) {
    waveActive = active
    if (active) document.documentElement.setAttribute('data-palis-activity', 'on')
    else document.documentElement.removeAttribute('data-palis-activity')
  }
  const target = active ? 0.5 + 0.5 * waveBoost : 0
  waveAmp += (target - waveAmp) * (target > waveAmp ? 0.24 : 0.05) // 快起慢落
  waveBoost *= WAVE_BOOST_DECAY
  if (!active && waveAmp < 0.02) {
    waveAmp = 0
    for (const lane of waveLanes.values()) lane.ctx.clearRect(0, 0, lane.w + 2, 18)
    return // 睡眠：静止基线交还 CSS 顶蓝边
  }
  for (const lane of waveLanes.values()) drawWave(lane, t, waveAmp)
  waveRaf = requestAnimationFrame(waveFrame)
}

function drawWave(lane: WaveLane, t: number, amp: number): void {
  const { ctx, w } = lane
  if (w <= 0) return
  const mid = 9
  ctx.clearRect(0, 0, w, 18)
  const tt = t / 1000
  const breathe = 0.78 + 0.22 * Math.sin(tt * 2.3 + Math.sin(tt * 0.9) * 1.6) // 平滑伪噪声呼吸
  const a = amp * WAVE_MAX_AMP * breathe
  ctx.beginPath()
  for (let x = 0; x <= w; x += 4) {
    const env = Math.pow(Math.sin((Math.PI * x) / w), 0.65) // 两端收拢的声线包络
    const y = mid + a * env * (
      0.6 * Math.sin(x * 0.021 + tt * 5.1) +
      0.3 * Math.sin(x * 0.047 - tt * 7.3 + 1.9) +
      0.16 * Math.sin(x * 0.013 + tt * 3.2 + 4.4)
    )
    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = lane.accent
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 0.18
  ctx.lineWidth = 4.5
  ctx.stroke()
  ctx.globalAlpha = 0.95
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.globalAlpha = 1
}

/* ═══ 声纳扩散 + 轨道旋转（轨道图中心徽记 → 深空声纳，与波动条共用活动门）═══
 * 轨道图（ART_ORBIT）是 [data-conversation-scroll] 的 CSS 背景，动不了；正确做法 =
 * 与月球同款的 client DOM 层：.palis-sonar 挂到不滚动的根容器 [data-phase]（z-index:-1，
 * 透过滚动体的透明背景可见，轨道线压在其上形成纵深），按背景定位公式反解圆心对位。
 * 三层动效：
 *   ping 扩散（<i>×3，v0.5.7 起 JS 逐帧写 width/height/margin/opacity——CSS transform:scale
 *     动画在分数 DPR 下走合成层位图缩放，周向采样不均，运动中读作"不圆"；
 *     圆形动效零合成层 = v0.5.5 月盘同法典。缓动/错相/活动变速与原 keyframes 同参）；
 *   轨道环旋转（<s>×4：蓝环 r=184 + 灰环 r=348/264/430，与各静态环同径的 mask 虚线环，
 *     JS 逐帧积分角度，ω = speed·(sin+0.6·sin+0.3) 符号自然翻转 = 不规律顺/逆时针交替；
 *     中心圆点/r=30 环/r=96 环已随 v0.5.0/v0.5.1 退役——粒子月球接替星系中心天体位）；
 *   行星公转（<u>×9：接替 ART_ORBIT 抠掉的 8 个节点白点，正交 4 颗巡 r=430、对角 4 颗巡
 *     r=294，开普勒式内快外慢，另加 1 颗 accent 卫星巡蓝环 r=184）。
 * 活动门：波动条引擎按 [data-streaming] 翻 html[data-palis-activity]（CSS 透明度/ping 变速），
 * JS 侧经 orbitHeat 快起慢落地把角速度 ×(1+3·heat)。 */
interface SonarRing { el: HTMLElement; ratio: number; angle: number; speed: number; f1: number; f2: number; p1: number; p2: number }
interface SonarPlanet { el: HTMLElement; ratio: number; angle: number; speed: number }
interface SonarDeg { el: HTMLElement; dx: number; dy: number } // 方位度数标记（最外环外缘 000/090/180/270）
let sonarEl: HTMLDivElement | null = null
let crtSweepEl: HTMLDivElement | null = null // 扫描频带独立层（transform 动画，免全屏 background-position 逐帧重绘）
let frameEl: HTMLDivElement | null = null // ASCII 取景框层（四角标记/铭牌/滚动读数）
let frameReadRaf = 0 // 读数 rAF 句柄
let statusbarEl: HTMLDivElement | null = null // tmux 式底部状态栏
let statusbarClock = 0 // UTC/相位钟句柄
let glyphsEl: HTMLDivElement | null = null // 美术构成扩充层（月面铭牌/等高线/测点/边缘数据流）

/** 磁带播放头：prepend 进滚动容器（随内容滚动，与磁带尺 ::before 对齐）。
 *  transform 移动 = 合成器合成，不用 background-position/变量（避免逐帧样式重算）。 */
function ensurePlayhead(sc: HTMLElement): void {
  if (sc.querySelector(':scope > .palis-playhead') !== null) return
  const el = document.createElement('div')
  el.className = 'palis-playhead'
  el.setAttribute('aria-hidden', 'true')
  sc.prepend(el)
}

/** 取景框滚动深度读数：rAF 节流，惰性定位会话滚动容器（window capture 捕获内层滚动）。 */
function scheduleFrameReadout(): void {
  const frame = frameEl
  if (frame === null || frameReadRaf !== 0) return
  frameReadRaf = requestAnimationFrame(() => {
    frameReadRaf = 0
    const read = document.getElementById("palis-sb-scroll")
    const scroller = document.querySelector("[data-conversation-scroll]")
    if (read === null || !(scroller instanceof HTMLElement)) return
    const max = scroller.scrollHeight - scroller.clientHeight
    const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((scroller.scrollTop / max) * 100))) : 0
    // 磁带走带：播放头（DOM+transform=合成器移动，零重算）滑到滚动比例处；
    // 变量写入会触发滚动容器全子树样式重算=卡顿（WORKLOG §36）
    ensurePlayhead(scroller)
    const ph = scroller.querySelector(".palis-playhead")
    if (ph instanceof HTMLElement) ph.style.transform = "translateX(" + Math.round((scroller.clientWidth - 3) * pct / 100) + "px)"
    if (pct === 0) {
      read.textContent = "TAPE//START"
      read.style.color = ""
    } else if (pct === 100) {
      read.textContent = "TAPE//END"
      read.style.color = "#6f9cff"
    } else {
      const filled = Math.round(pct / 10)
      read.style.color = ""
      read.textContent = "SCROLL " + String(pct).padStart(3, "0") + "% \u2555" + "\u2588".repeat(filled) + "\u2591".repeat(10 - filled) + "\u2561"
    }
  })
}
let sonarResize: ResizeObserver | null = null
let sonarLastEnsure = 0
let sonarRings: SonarRing[] = []
let sonarPlanets: SonarPlanet[] = []
let sonarDegs: SonarDeg[] = []
let sonarPings: HTMLElement[] = [] // ping 扩散环 ×3（JS 逐帧驱动，v0.5.7）
let pingOpacities: number[] = [] // 各环当前相位透明度（重尺寸不可见窗口判定）
let pingBaseDs: number[] = [] // 各环基准直径（k=1 展开径；逐帧实际径 = pingBaseDs[j]×k，各自在不可见窗口换径）
let sonarScale = 0
let sonarLastPingD = 0 // ping 环当前直径（阈值门用）
let sonarFreezeUntil = 0 // 侧栏过渡期 ping 重尺寸冻结（§25 定案防护；v0.5.2 起只冻 ping，几何/旋转逐帧跟随）
let pingPendingD = 0 // 待落盘的 ping 直径（等不可见窗口，v0.5.3）
let pingResizeTimer = 0
let orbitRaf = 0
let orbitLast = 0
let orbitHeat = 0

/** ping 重尺寸排队到各环自己的不可见窗口落笔（v0.5.3）：
 *  §25 定案：无限循环的扩散环在可见相位改径 = 用户可见的瞬时跳变；
 *  冻结窗+阈值门只压次数，落笔时机仍是随机相位（三环错相 1/3 周期，
 *  任意时刻大概率有一环可见 → 落定后那次重尺寸用户可见 = 残留闪烁）。
 *  改为：每环等到自己的 opacity≈0（循环 100%→0% 段）才换径——
 *  环完全透明时换径不可见。最坏等待 ≈ 一个循环，期间环径保持前值（无感）。
 *  v0.5.7：落笔对象从元素 width/margin 样式变为 pingBaseDs[j] 基准径数字
 *  （尺寸已由 JS 逐帧重写，不再有 CSS 动画插值可爆），判定机制不变；
 *  三环不共享不可见窗口（错相 1/3 周期），故各环持有自己的基准径。 */
function queuePingResize(d: number): void {
  pingPendingD = d
  if (pingResizeTimer !== 0 || sonarEl === null) return
  pingResizeTimer = window.setInterval(applyPingResizeWhenInvisible, 150)
}

function applyPingResizeWhenInvisible(): void {
  if (sonarEl === null || pingPendingD === 0) { stopPingResizeTimer(); return }
  let pending = 0
  for (let j = 0; j < sonarPings.length; j++) {
    if (pingBaseDs[j] === pingPendingD) continue
    if ((pingOpacities[j] ?? 0) <= 0.02) {
      pingBaseDs[j] = pingPendingD // 数字落笔，orbitFrame 下一帧拾取
    } else {
      pending++
    }
  }
  if (pending === 0) { pingPendingD = 0; stopPingResizeTimer() }
}

function stopPingResizeTimer(): void {
  if (pingResizeTimer !== 0) { window.clearInterval(pingResizeTimer); pingResizeTimer = 0 }
}

function removeSonar(): void {
  sonarResize?.disconnect()
  if (orbitRaf !== 0) {
    cancelAnimationFrame(orbitRaf)
    orbitRaf = 0
  }
  orbitLast = 0
  orbitHeat = 0
  sonarRings = []
  sonarPlanets = []
  sonarDegs = []
  sonarPings = []
  pingOpacities = []
  pingBaseDs = []
  sonarLastPingD = 0 // 重挂载的是全新 <i>（基态 760px）——阈值门基数必须清零，否则新环永不定径
  pingPendingD = 0
  stopPingResizeTimer()
  sonarEl?.remove()
  sonarEl = null
}

/** 背景图定位反解：orbit 在滚动体上以 size 70% auto / position 50% 58% 居中（SVG 正方）。
 *  旋转环定径：mask 圆半径 = 元素边长 ×47% → 边长 = S × 环半径/470；行星轨道半径 = S × r/1000。
 *  v0.5.2：冻结窗只冻 ping 重尺寸（§25 定案防护不动）；环/度数/月球逐帧跟随滚动体几何——
 *  v0.5.0 月球迁入星系中心后，整体冻结会在落定帧产生月球/环系 ~112px 瞬变回跳 +
 *  ping 一次重尺寸爆亮（verify-moon-teleport 取证：1184→1296 单帧）。 */
function layoutSonar(host: HTMLElement): void {
  if (sonarEl === null) return
  const scroller = host.querySelector('[data-conversation-scroll]')
  if (!(scroller instanceof HTMLElement)) return
  const hr = host.getBoundingClientRect()
  const sr = scroller.getBoundingClientRect()
  const s = sr.width * 0.7
  sonarScale = s
  sonarEl.style.left = (sr.left - hr.left + sr.width * 0.5).toFixed(1) + 'px'
  sonarEl.style.top = (sr.top - hr.top + (sr.height - s) * 0.58 + s * 0.5).toFixed(1) + 'px'
  for (const ring of sonarRings) {
    const d = ring.ratio * s
    ring.el.style.width = d.toFixed(1) + 'px'
    ring.el.style.height = d.toFixed(1) + 'px'
  }
  // 方位度数标记：最外环（r=430）外缘 20px 的四正点（仪表语言，固定不随环转）
  for (const deg of sonarDegs) {
    const r = 0.43 * s + 20
    deg.el.style.left = (deg.dx * r).toFixed(1) + 'px'
    deg.el.style.top = (deg.dy * r).toFixed(1) + 'px'
  }
  layoutGlobe(host) // 星系中心天体（月球）同圆心同基准跟随（v0.5.0；v0.5.2 起逐帧跟随不进冻结窗）
  // ping 环定径：保底 760px，超宽屏按 1.1·S 越过最外轨道环（r=430 → 0.86·S）。
  // 仅增量 >40px 才重尺寸：可见相位的环改径 = 用户可见的瞬时跳变（WORKLOG 25/27 最终定案）。
  // 冻结窗只冻这一段（v0.5.2）：过渡期 ping 几何保持前值。
  // 落笔排队到各环 opacity≈0 的不可见窗口（v0.5.3）：阈值门压次数、冻结窗压时机，
  // 但落定后那次重尺寸仍是随机相位——三环错相下大概率有一环可见（用户仍见闪）；
  // 等不可见窗口落笔后，重尺寸对画面零影响。
  // v0.5.7：落笔的只是 pingBaseDs[j] 基准径数字（orbitFrame 下一帧拾取），机制不变。
  if (performance.now() < sonarFreezeUntil) return
  const pingD = Math.max(760, 1.1 * s)
  if (Math.abs(sonarLastPingD - pingD) <= 40) return
  sonarLastPingD = pingD
  queuePingResize(pingD)
}

/** 旋转/公转驱动：独立 rAF（波动条引擎静默即休眠，行星是背景生命力，须持续慢转）。 */
function orbitFrame(t: number): void {
  orbitRaf = 0
  if (sonarEl === null || !sonarEl.isConnected) return
  // v0.5.2：旋转不再进冻结窗——几何已逐帧跟随（无落定跳变），冻结旋转反而
  // 造成「环停球转」的新不一致；transform 写入无重尺寸风险。
  const dt = orbitLast > 0 ? Math.min(0.1, (t - orbitLast) / 1000) : 0.016
  orbitLast = t
  const heatTarget = waveActive ? 1 : 0
  /* 活动态过渡放缓（0.05/0.015 → 0.02/0.008）：速度变化要"渐起渐落"才细腻，
     猛起猛落会读成"卡了一下" */
  orbitHeat += (heatTarget - orbitHeat) * (heatTarget > orbitHeat ? 0.02 : 0.008)
  /* 活动态只给 1.6×（原 2.2×）：细腻优先——活动感主要由 ping 波的密度表达，
     环的转速只是轻微加快（与月球同开时不抢戏） */
  const boost = 1 + 0.6 * orbitHeat
  const tt = t / 1000
  /* ping 波前逐帧驱动（v0.5.7 起 JS 驱动以避开合成层缩放；v0.5.11 起改"波前"质感）：
     · 半径用减速缓动（快出慢收）——像波前推进，而不是"圈弹出来"
     · 透明度用平滑包络 ph^.45·(1-ph)^1.5 归一化（峰值落在 ph≈0.23、长尾衰减）——
       取代原三段折线（段间斜率跳变在暗场里看得出"折"）
     · 每波带一个回声环（0.62× 半径、0.34× 不透明度；活动态 0.5×）——波有厚度
     · 仍逐帧写 width/height/margin/opacity，不走 transform（圆形动效零合成层） */
  const pingPeriod = waveActive ? 5.0 : 6.8
  const pingPk = waveActive ? 0.46 : 0.34
  const echoGain = waveActive ? 0.5 : 0.34
  const ph = (tt % pingPeriod) / pingPeriod
  const kMain = 0.05 + 0.95 * (1 - Math.pow(1 - ph, 3.2)) // 减速波前
  const env = (Math.pow(ph, 0.45) * Math.pow(1 - ph, 1.5)) / 0.3536 // 归一化到峰值 1（ph≈0.23）
  for (let j = 0; j < sonarPings.length; j++) {
    const isEcho = j === 1
    const k = isEcho ? Math.max(0.05, kMain * 0.62) : kMain
    const d = (pingBaseDs[j] ?? 760) * k
    const op = pingPk * env * (isEcho ? echoGain : 1)
    const el = sonarPings[j]
    el.style.width = d.toFixed(1) + 'px'
    el.style.height = d.toFixed(1) + 'px'
    el.style.margin = (-d / 2).toFixed(1) + 'px 0 0 ' + (-d / 2).toFixed(1) + 'px'
    el.style.opacity = op.toFixed(3)
    pingOpacities[j] = op
  }
  for (const r of sonarRings) {
    /* 三个相差一个数量级的时间尺度叠加：f1（数秒–数十秒）给"呼吸"、f2 给不规则换向、
       0.16·f1（分钟级）给长期漂移——合起来看不出循环，"像天气"而不是"像程序在转" */
    const w = r.speed * (
      Math.sin(tt * r.f1 + r.p1) +
      0.6 * Math.sin(tt * r.f2 + r.p2) +
      0.25 * Math.sin(tt * r.f1 * 0.16 + r.p2 * 1.7) +
      0.3
    )
    r.angle += w * dt * boost
    r.el.style.transform = 'translate(-50%,-50%) rotate(' + r.angle.toFixed(4) + 'rad)'
  }
  for (const p of sonarPlanets) {
    p.angle += p.speed * dt * boost
    const r = p.ratio * sonarScale
    p.el.style.transform =
      'translate(' + (Math.cos(p.angle) * r).toFixed(1) + 'px,' + (Math.sin(p.angle) * r).toFixed(1) + 'px) translate(-50%,-50%)'
  }
  orbitRaf = requestAnimationFrame(orbitFrame)
}

/** 幂等挂载：主题 + 背景图形开启时，把声纳层插到会话根容器（宿主更换自动重挂）。 */
function ensureSonar(): void {
  if (!current.enabled || !current.artwork || waveReducedMotion()) {
    removeSonar()
    return
  }
  const host = document.querySelector('[data-phase]')
  if (!(host instanceof HTMLElement)) return
  if (sonarEl !== null && sonarEl.parentElement === host) {
    layoutSonar(host)
    return
  }
  removeSonar()
  sonarEl = document.createElement('div')
  sonarEl.className = 'palis-sonar'
  sonarEl.setAttribute('aria-hidden', 'true')
  const ring = (cls: string, ratio: number, speed: number, f1: number, f2: number, p1: number, p2: number): SonarRing => {
    const el = document.createElement('s')
    if (cls !== '') el.className = cls
    return { el, ratio, angle: 0, speed, f1, f2, p1, p2 }
  }
  /* speed 正 = 屏上顺时针；双频正弦叠加使 ω 不规律换向；speed 大环慢、小环快。
     v0.5.0：中心环 g0（r=30）与中心圆点 <b> 退役——粒子月球迁入星系中心接替
     中心天体位（用户构图指令：月球对那圆点进行替换）；
     v0.5.1：g1（r=96）同退——盘面半径 0.15·S 已覆过 r=96，环弧会横穿月面 */
  sonarRings = [
    ring('', 0.3915, 0.16, 0.19, 0.53, 0, 2.1), // 蓝环 r=184（身份环，唯一强调色）
    ring('g3', 0.7404, 0.08, 0.12, 0.37, 5.2, 3.3), // 灰环 r=348
    // v0.5.11 极简化：g4（r=430）与 g2（r=264）退役——四条错相旋转环密集且互相干扰，
    // 保留"一蓝一灰"两级已够表达轨道系（后续若做密度档位可在此按档补回）。
  ]
  /* v0.5.11 极简化：公转行星点全部删除（5 颗）——它们在极简语汇里是"玩具感"来源，
     且与 ping 环/旋转环承担同一件事（表达活动）。保留环系即可。 */
  sonarPlanets = []
  // 方位度数标记：000 上 / 090 右 / 180 下 / 270 左（仪表语言；<n> 元素，
  // 不占 <i>/<s>/<u> 的既有选择器序位）
  sonarDegs = ([
    ['000°', 0, -1], ['090°', 1, 0], ['180°', 0, 1], ['270°', -1, 0],
  ] as Array<[string, number, number]>).map(([txt, dx, dy]) => {
    const el = document.createElement('n')
    el.textContent = txt
    return { el, dx, dy }
  })
  // ping 扩散环 ×3：v0.5.7 起由 orbitFrame 逐帧驱动（尺寸/透明度全在 JS 侧，CSS 只给基态）
  // v0.5.11：ping 扩散环 ×1 → 主波 + 回声波（波有厚度；仍少于原先的三环错相）
  sonarPings = [document.createElement('i'), document.createElement('i')]
  sonarPings[1].className = 'echo'
  pingOpacities = [0, 0]
  pingBaseDs = [760, 760]
  sonarEl.append(
    ...sonarPings,
    ...sonarRings.map((r) => r.el),
    ...sonarPlanets.map((p) => p.el),
    ...sonarDegs.map((d) => d.el),
  )
  host.prepend(sonarEl)
  layoutSonar(host)
  const scroller = host.querySelector('[data-conversation-scroll]')
  if (scroller instanceof HTMLElement) {
    sonarResize = new ResizeObserver(() => layoutSonar(host))
    sonarResize.observe(scroller)
  }
  if (orbitRaf === 0) orbitRaf = requestAnimationFrame(orbitFrame)
}

function scheduleEnsureSonar(): void {
  const now = Date.now()
  if (now - sonarLastEnsure < 600) return
  sonarLastEnsure = now
  queueMicrotask(ensureSonar)
}

/* ═══ API ═══ */
interface ApiView {
  settings: PalisSettings
  revision: number
  version?: string
}

async function apiGet(): Promise<ApiView> {
  const res = await fetch(API_ROUTE, { cache: 'no-store' })
  const json = await res.json()
  return {
    settings: normalizeSettings(json?.settings),
    revision: Number(json?.revision ?? 0),
    version: typeof json?.version === 'string' ? json.version : '',
  }
}

async function apiPatch(patch: Partial<PalisSettings>): Promise<ApiView | { conflict: true }> {
  const res = await fetch(API_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ patch, expectedRevision: revision }),
  })
  const json = await res.json()
  if (!res.ok) return { conflict: true }
  return { settings: normalizeSettings(json?.settings), revision: Number(json?.revision ?? 0) }
}

/** 面板/浮动开关/快捷键/预设的统一写路径：乐观应用 → POST → 冲突回读。
 *  quiet=true 不逐字段记日志（预设批量写入时只记一条汇总）；enabled 切换播 CRT 闪屏。 */
async function setField(
  key: keyof PalisSettings,
  value: boolean | 'low' | 'mid' | 'high',
  opts?: { quiet?: boolean },
): Promise<void> {
  const next = { ...current, [key]: value } as unknown as PalisSettings
  if (key === 'enabled') playCrtFlash(value === true ? 'on' : 'off')
  applySettings(next)
  try {
    const result = await apiPatch({ [key]: value } as Partial<PalisSettings>)
    if ('conflict' in result) {
      logLine('409 CONFLICT — 回读服务器状态', 'err')
      const fresh = await apiGet()
      revision = fresh.revision
      applySettings(fresh.settings)
      logLine(`STATE RE-SYNCED (rev ${revision})`, 'accent')
      return
    }
    revision = result.revision
    if (opts?.quiet !== true) logLine(`${String(key)} = ${String(value)} — COMMITTED · rev ${revision}`, 'ok')
  } catch {
    logLine('API WRITE FAILED — 主题已本地生效，未持久化', 'err')
  }
}

/* ═══ 开机自检动画（CRT 点火 + 舷窗月球：参考 PALIS 09A 总目录屏的大圆窗构图）═══ */
async function playBoot(): Promise<void> {
  const overlay = document.createElement('div')
  overlay.className = 'palis-boot'

  // 圆形视窗：月面贴图横向平移 = 舷窗里转动的月球（与右侧天体同一张贴图，浏览器复用解码）
  const port = document.createElement('div')
  port.className = 'pb-port'
  const moon = document.createElement('img')
  moon.className = 'pb-moon'
  moon.alt = ''
  moon.src = 'data:image/svg+xml;utf8,' + ART_MOON_MAP
  const portRing = document.createElement('i')
  portRing.className = 'pb-port-ring'
  const portCross = document.createElement('u')
  portCross.className = 'pb-port-cross'
  const portText = document.createElement('div')
  portText.className = 'pb-port-text'
  const title = document.createElement('div')
  title.className = 'pb-title'
  title.textContent = 'PALIS 09A'
  const sub = document.createElement('div')
  sub.className = 'pb-sub'
  // 副标题 = 真实接入状态（此前是拟态的"正在接入 PALIS 管理系统"）。
  // 拿不到外壳数据时明确报"独立会话"，而不是继续演一个并不存在的接入过程。
  const facts = await collectBootFacts()
  const em = (text: string): HTMLElement => {
    const b = document.createElement('b')
    b.textContent = text
    return b
  }
  sub.append(document.createTextNode(facts.linked ? '已接入 ' : '独立会话 '), em(facts.linked ? '内核' : '未接外壳'))
  if (facts.kernel !== '') sub.append(document.createTextNode(' ' + facts.kernel))
  if (facts.port !== '') sub.append(document.createTextNode(' ' + facts.port))
  if (facts.boot !== '') sub.append(document.createTextNode(' · ' + facts.boot))
  portText.append(title, sub)
  port.append(moon, portRing, portCross, portText)

  const bar = document.createElement('div')
  bar.className = 'pb-bar'
  const fill = document.createElement('i')
  bar.appendChild(fill)
  const lines = document.createElement('div')
  lines.className = 'pb-lines'
  overlay.append(port, bar, lines)

  // 自检行 = 真实"接入报告"（此前是 GROUND TRACK / IDENTITY_CHAIN 那类编造条目）。
  // 每一项都对应一个真实来源；缺失显示 `--` 且不标色，有问题的那行标红。
  const seq: Array<{ text: string; cls?: string; delay: number }> = [
    { text: `CHANNEL ......... ${facts.workspace !== '' ? facts.workspace : '--'}`, delay: 60 },
    { text: `SHELL ........... ${facts.shell !== '' ? facts.shell : '--'}`, cls: facts.shell !== '' ? 'ok' : '', delay: 240 },
    { text: `KERNEL .......... ${facts.kernel !== '' ? facts.kernel : '--'}${facts.port !== '' ? ' ' + facts.port : ''}`, cls: facts.kernel !== '' ? 'ok' : '', delay: 420 },
    { text: `PLUGINS ......... ${facts.plugins !== '' ? facts.plugins : '--'}`, cls: facts.plugins === '' ? '' : facts.pluginsBad ? 'err' : 'ok', delay: 600 },
    { text: `THEME ........... ${facts.theme !== '' ? facts.theme : '--'}`, cls: facts.theme !== '' ? 'accent' : '', delay: 780 },
    { text: `VIEWPORT ........ ${facts.viewport}`, delay: 960 },
    { text: `BOOT ............ ${facts.boot !== '' ? facts.boot : '--'}`, cls: facts.boot !== '' ? 'ok' : '', delay: 1140 },
    { text: `LINK ............ ${facts.linked ? 'ESTABLISHED' : 'STANDALONE'}`, cls: facts.linked ? 'accent' : 'err', delay: 1340 },
  ]
  for (const item of seq) {
    const span = document.createElement('span')
    span.textContent = item.text
    if (item.cls) span.className = item.cls
    span.style.animationDelay = item.delay + 'ms'
    lines.appendChild(span)
  }

  document.documentElement.appendChild(overlay)
  window.setTimeout(() => overlay.classList.add('off'), 2000)
  window.setTimeout(() => overlay.remove(), 2550)
}

/* ═══ 设置面板（React 函数组件）═══ */
const FX: Array<{ key: keyof PalisSettings; label: string }> = [
  { key: 'scanlines', label: '扫描线 SCANLINES' },
  { key: 'noise', label: '噪点 NOISE' },
  { key: 'vignette', label: '暗角 VIGNETTE' },
  { key: 'glow', label: '辉光 GLOW' },
]
const STYLE: Array<{ key: keyof PalisSettings; label: string }> = [
  { key: 'monospace', label: '等宽字体 MONO' },
  { key: 'square', label: '直角 SQUARE' },
  { key: 'labels', label: '角色标签 [USER]' },
  { key: 'artwork', label: '背景图形 ARTWORK' },
  { key: 'boot', label: '开机自检 BOOT SEQ' },
]

/* 渲染层预设：一键组合写入。逐字段走 setField 统一写路径（乐观应用 + revision 守卫，
 * quiet 跳过逐字段日志，最后只记一条汇总）；风格层开关不在预设射程内，保持用户手选。 */
const PRESETS: Array<{ label: string; patch: Array<[keyof PalisSettings, boolean | 'low' | 'mid' | 'high']> }> = [
  { label: 'CRT·MAX', patch: [['intensity', 'high'], ['scanlines', true], ['noise', true], ['vignette', true], ['glow', true]] },
  { label: 'TERMINAL', patch: [['intensity', 'low'], ['scanlines', true], ['noise', false], ['vignette', false], ['glow', false]] },
  { label: 'BARE', patch: [['scanlines', false], ['noise', false], ['vignette', false], ['glow', false]] },
]

async function applyPreset(preset: (typeof PRESETS)[number]): Promise<void> {
  for (const [key, value] of preset.patch) await setField(key, value, { quiet: true })
  logLine(`PRESET ${preset.label} — COMMITTED · rev ${revision}`, 'accent')
}

function Panel(): unknown {
  const [, force] = useState(0)
  useEffect(() => {
    ensurePanelCss() // 面板出现时样式必在（重跑抖动后的自愈点）
    return subscribe(() => force((n) => n + 1))
  }, [])

  const on = current.enabled
  const toggle = (key: keyof PalisSettings, value: boolean | 'low' | 'mid' | 'high') => () => void setField(key, value)

  const togglesOf = (items: Array<{ key: keyof PalisSettings; label: string }>) =>
    h(
      'div',
      { className: 'ptp-toggles' },
      items.map((item) =>
        h(
          'label',
          { className: 'ptp-toggle' },
          h('input', {
            type: 'checkbox',
            checked: current[item.key] === true,
            onChange: (e: { target: { checked: boolean } }) => toggle(item.key, e.target.checked)(),
          }),
          h('span', null, item.label),
        ),
      ),
    )

  return h(
    'div',
    { className: 'ptp-page' },
    h(
      'div',
      { className: 'ptp-console' },
      h(
        'div',
        { className: 'ptp-titlebar' },
        h('span', { className: 'ptp-min red' }),
        h('span', { className: 'ptp-min' }),
        h('span', { className: 'ptp-min blue' }),
        h('span', null, 'PALIS 09A — ', h('b', null, 'THEME CONTROL')),
      ),
      h(
        'div',
        { className: 'ptp-body' },
        h(
          'div',
          { className: 'ptp-status' },
          h('span', { className: 'ptp-dot' + (on ? ' on' : '') }),
          h('span', null, on ? `LINK ACTIVE · 已接入 · REV ${revision}` : `LINK IDLE · 未接入 · REV ${revision}`),
          h('span', { className: 'ptp-status-hint' }, 'CTRL+ALT+P 快速开关'),
        ),
        h(
          'button',
          { type: 'button', className: 'ptp-power' + (on ? ' on' : ''), onClick: toggle('enabled', !on) },
          h('span', { className: 'ptp-key' }, 'POWER'),
          h('span', { className: 'ptp-val' }, on ? '● 已接入 / ONLINE' : '○ 未接入 / OFFLINE'),
        ),
        h(
          'div',
          { className: 'ptp-preset' },
          h('span', { className: 'ptp-key' }, 'PRESET'),
          h(
            'div',
            { className: 'ptp-seg' },
            PRESETS.map((preset) =>
              h('button', { type: 'button', key: preset.label, onClick: () => void applyPreset(preset) }, preset.label),
            ),
          ),
        ),
        h(
          'div',
          { className: 'ptp-grid' },
          h(
            'div',
            { className: 'ptp-cell' },
            h('div', { className: 'ptp-cap' }, 'CRT 强度 / INTENSITY'),
            h(
              'div',
              { className: 'ptp-row' },
              h(
                'div',
                { className: 'ptp-seg' },
                (['low', 'mid', 'high'] as const).map((value) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      className: current.intensity === value ? 'sel' : '',
                      onClick: toggle('intensity', value),
                    },
                    value.toUpperCase(),
                  ),
                ),
              ),
            ),
          ),
          h(
            'div',
            { className: 'ptp-cell' },
            h('div', { className: 'ptp-cap' }, '渲染层 / FX LAYERS'),
            togglesOf(FX),
          ),
          h(
            'div',
            { className: 'ptp-cell ptp-cell-wide' },
            h('div', { className: 'ptp-cap' }, '风格 / STYLE'),
            togglesOf(STYLE),
          ),
        ),
        h(
          'div',
          { className: 'ptp-log' },
          logLines.map((line, index) => h('div', { key: index, className: line.cls || undefined }, line.text)),
        ),
      ),
    ),
  )
}

/* ═══ 插件入口 ═══ */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    ensurePanelCss()
    floatBtn = document.createElement('button')
    floatBtn.type = 'button'
    floatBtn.className = 'ptp-float'
    floatBtn.textContent = 'PALIS'
    floatBtn.title = 'PALIS 未接入 — 点击接入'
    floatBtn.addEventListener('click', () => void setField('enabled', !current.enabled))
    document.body.appendChild(floatBtn)

    // 快捷开关：Ctrl+Alt+P 一键接入/断开。capture 段先于应用层处理；Windows 上 AltGr
    // 虚拟为 Ctrl+Alt——getModifierState('AltGraph') 命中时放行，避免特殊字符输入误触。
    const hotkey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.repeat || !e.ctrlKey || !e.altKey) return
      if (typeof e.getModifierState === 'function' && e.getModifierState('AltGraph')) return
      if (e.key.toLowerCase() !== 'p') return
      e.preventDefault()
      logLine('HOTKEY CTRL+ALT+P — TOGGLE', 'accent')
      void setField('enabled', !current.enabled)
    }
    window.addEventListener('keydown', hotkey, true)

    // 滚动体（对话/欢迎屏容器）出现或重建时，幂等重挂 3D 月球
    globeObserver = new MutationObserver(() => scheduleEnsureGlobe())
    globeObserver.observe(document.body, { childList: true, subtree: true })
    ensureGlobe()

    // 侧栏收放监听：收放瞬间冻结声纳几何/动画落盘 + 球自转短暂加速（滑动甩感）。
    // 只信稳定契约：左侧栏 = 布局框架的 data-sidebar-collapsed 数据属性；
    // 右侧栏 = better-sidebar 写到 <html> 的 --dsh-sidebar-width 布局变量
    // （0px/未设置 = 收起）——不碰哈希类名（面板设计红线）。
    ensureCrtSweep()
    syncMoonReveal()
    moonRevealObserver = new MutationObserver(() => syncMoonReveal())
    moonRevealObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-sidebar-collapsed'],
    })
    moonRevealObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })

    // 取景框：滚动/尺寸变化时刷新左下 SCROLL 深度读数（capture 捕获内层滚动容器）
    const frameScroll = (): void => scheduleFrameReadout()
    window.addEventListener("scroll", frameScroll, { capture: true, passive: true })
    window.addEventListener("resize", frameScroll, { passive: true })

    ensureStatusBar()
    // Composer 字符/行计数器：textarea input → 右下卡内角落终端读数
    const composerCounter = (): void => {
      const ta = document.querySelector("[data-composer-seat] textarea")
      const counter = document.getElementById("palis-composer-count")
      if (!(ta instanceof HTMLTextAreaElement) || counter === null) return
      const text = ta.value
      const lines = text ? text.split('\n').length : 0
    }
    document.addEventListener("input", composerCounter, { capture: true, passive: true })
    // 状态栏 1s 钟：UTC 真时钟 + 相位段（hero/chat 由 [data-phase] 反映）
    statusbarClock = window.setInterval(() => {
      const utc = document.getElementById("palis-sb-utc")
      if (utc !== null) {
        const d = new Date()
        const pad = (n: number): string => String(n).padStart(2, "0")
        utc.textContent = "UTC " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds())
      }
      const phase = document.getElementById("palis-sb-phase")
      if (phase !== null) {
        const p = document.querySelector("[data-phase]")?.getAttribute("data-phase") || "--"
        phase.textContent = "PHASE:" + p.toUpperCase()
      }
      // 会话名（仅 chat 态显示；hero 隐藏）
      const sess = document.getElementById("palis-sb-sess")
      if (sess !== null) {
        const isHero = document.querySelector('[data-phase="hero"]') !== null
        if (isHero) { sess.textContent = ""; sess.style.display = "none" }
        else {
          const hdr = document.querySelector('[data-slot="conversation.session.header"] header') as HTMLElement | null
          const name = hdr?.innerText?.split('\n')[0]?.trim() || ''
          sess.textContent = name ? 'SES:' + name.slice(0, 20) : ''
          sess.style.display = name ? '' : 'none'
        }
      }
      // 模型名（从 composer 的模型选择器读取）
      const model = document.getElementById("palis-sb-model")
      if (model !== null) {
        const mb = Array.from(document.querySelectorAll('button')).find(b => /Ox Alpha|DeepSeek|Claude|GPT|Gemini/i.test(b.textContent || '') && b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().width < 200 && b.getBoundingClientRect().top > window.innerHeight * 0.5)
        model.textContent = mb ? 'MDL:' + (mb.textContent || '').trim().slice(0, 18) : ''
        model.style.display = mb ? '' : 'none'
      }
    }, 1000)

    // 声线波动条：同一 observer 兼顾活动信号（data-streaming 置位/卸载）、
    // 输出突发计数（characterData ≈ token 落地）与 composer 重建重挂。
    waveResize = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const lane = waveLanes.get(entry.target as HTMLElement)
        if (lane) scheduleWaveResize(lane)
      }
    })
    waveObserver = new MutationObserver((muts) => {
      waveMutations += muts.length
      scanWave()
      scheduleEnsureWave()
      scheduleEnsureSonar()
    })
    waveObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-streaming'],
    })
    ensureWave()
    ensureSonar()

    void (async () => {
      try {
        const view = await apiGet()
        revision = view.revision
        applySettings(view.settings, { allowBoot: true })
        logLine(`BOOT STATE LOADED · rev ${revision}`, 'accent')
      } catch {
        logLine('API UNAVAILABLE — 面板仅本地预览', 'err')
      }
    })()

    // host 侧变更同步：外壳切皮肤 POST /api/palis-theme、其它标签页的面板写入，
    // 都只落在 host 设置里——此前客户端仅启动 apiGet 一次，已打开页面要等重载才
    // 生效。轻量 revision 轮询（2s，与旧内置 palis-theme 的轮询节奏一致）：
    // revision 变了才回读全量并 applySettings（含 ensure* 家族的挂/摘，如 CRT 层）。
    // 面板自身写入会同步本地 revision，轮询对它是 no-op。
    settingsPoll = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(API_ROUTE, { cache: 'no-store' })
          if (!res.ok) return
          const json = await res.json()
          const rev = Number(json?.revision ?? 0)
          if (rev !== revision) {
            revision = rev
            applySettings(normalizeSettings(json?.settings))
          }
        } catch {
          /* 内核重启窗口等瞬态：下一轮再试 */
        }
      })()
    }, 2000)

    return () => {
      window.removeEventListener('keydown', hotkey, true)
      floatBtn?.remove()
      floatBtn = null
      globeObserver?.disconnect()
      globeObserver = null
      moonRevealObserver?.disconnect()
      moonRevealObserver = null
      globeEl?.remove()
      globeEl = null
      stopGlobeEngine()
      window.removeEventListener("scroll", frameScroll, { capture: true })
      window.removeEventListener("resize", frameScroll)
      document.removeEventListener("input", composerCounter, { capture: true })
      frameEl?.remove()
      frameEl = null
      glyphsEl?.remove()
      glyphsEl = null
      window.clearInterval(statusbarClock)
      statusbarEl?.remove()
      statusbarEl = null
      dropStarfield()
      waveObserver?.disconnect()
      waveObserver = null
      waveResize?.disconnect()
      waveResize = null
      dropWave()
      removeSonar()
      dropThemeCss()
      // panelTag 有意不清理：PANEL_CSS 与主题开关无关、页面生命周期内常驻；
      // effect 重跑的删建抖动曾导致设置面板样式丢失（见 ensurePanelCss 注释）。
    }
  }, 'palis-theme-panel: runtime')

  ctx.effect(
    () =>
      ctx.slots.inject('settings.section', () =>
        // 注入器预检正则按 register({…name:'<slot>'）扫描——保持单行排版，勿拆行
        ctx.slots.register({ name: 'settings.section', id: 'palis-theme-panel', order: 45, label: () => 'PALIS 主题' }, Panel),
      ),
    'palis-theme-panel: settings panel',
  )
}
