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
 *  6. 声纳扩散：轨道图中心徽记的深空 ping，与波动条共用同一活动门。
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
/* 满月揭示运行态：左右侧栏全收 → html[data-palis-moon="full"]（见 syncMoonReveal） */
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
    // 开机自检是纯装饰性 steps() 闪烁动画——reduced-motion 下整段跳过（直接进桌面）
    bootPlayed = true
    playBoot()
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
 * 渲染 640px 内部分辨率，CSS 响应式放大（1100-1500px）。
 * 卫星层（与球呼应）：一颗 accent 卫星沿贴 r1 HUD 环的倾斜轨道公转——方向与球面
 * 漂移一致（前半球右→左），轨道面缓慢进动；绕到球盘后（后半程且落在球盘半径内）
 * 被遮蔽淡出。球自转、卫星公转、进动共用活动门 boost（×(1+2·heat)，快起慢落）。
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
const PT_MAX = 24000 // 点云上限（超出按步长抽稀，各密度档等比收缩）
const SAT_PERIOD_S = 20 // 卫星公转周期（静默）：球自转的 1/5
const SAT_PRECESS_S = 240 // 轨道面进动周期
const SAT_ORBIT_A = 514 // 轨道半长轴 = r1 HUD 环半径（1100px 层 inset:36）
const SAT_TILT = 0.45 // 轨道倾角：半短轴 = A·tilt
const GLOBE_DISC_R = 450 // 球盘半径（inset:100 → 直径 900），遮挡判定用

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
  const dither = document.createElement('div')
  dither.className = 'palis-globe-dither'
  // 表面粒子尘埃：三层异相闪烁（单元素 box-shadow 列表，低成本）；d3 是蓝色火花
  const mkDust = (cls: string, n: number, accent: boolean): HTMLDivElement => {
    const el = document.createElement('div')
    el.className = 'palis-globe-dust ' + cls
    const dots: string[] = []
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * 400
      const x = 450 + Math.cos(a) * r
      const y = 450 + Math.sin(a) * r
      const s = (Math.random() * 1.6 + 0.4).toFixed(1)
      const alpha = (Math.random() * 0.26 + 0.12).toFixed(2)
      dots.push(accent
        ? `${x.toFixed(0)}px ${y.toFixed(0)}px 0 ${s}px rgba(127,168,255,${alpha})`
        : `${x.toFixed(0)}px ${y.toFixed(0)}px 0 ${s}px rgba(226,236,246,${alpha})`)
    }
    el.style.boxShadow = dots.join(',')
    return el
  }
  sphere.append(canvas, dither, mkDust('d1', 16, false), mkDust('d2', 12, false), mkDust('d3', 5, true))
  const geo = document.createElement('div')
  geo.className = 'palis-globe-geo'
  for (const cls of ['palis-globe-r1', 'palis-globe-r2', 'palis-globe-hline', 'palis-globe-vline', 'palis-globe-cross']) {
    const el = document.createElement('i')
    el.className = cls
    geo.appendChild(el)
  }
  // 卫星层：倾斜轨道环 + 卫星点（减免动态时不挂，球体自转不受影响）。
  // 轨道环插在球体之下——掠过球盘的弧段被球遮蔽（卫星在 geo 层上，前半程完整可见）。
  let orbit: HTMLElement | null = null
  let sat: HTMLElement | null = null
  if (!waveReducedMotion()) {
    orbit = document.createElement('i')
    orbit.className = 'palis-globe-orbit'
    sat = document.createElement('u')
    sat.className = 'palis-globe-sat'
    geo.appendChild(sat)
  }
  // 代码读数（live：LON = 球面中央经线随自转走，SIGNAL 随活动门降，TRACK = 9 行星 + 1 卫星）
  const ro1 = document.createElement('pre')
  const ro2 = document.createElement('pre')
  ro1.className = 'palis-globe-ro palis-globe-ro1'
  ro2.className = 'palis-globe-ro palis-globe-ro2'
  geo.append(ro1, ro2)
  if (orbit !== null) root.append(orbit, sphere, geo)
  else root.append(sphere, geo)
  stopGlobeEngine()
  // reduced-motion：卫星层不挂载（上方已跳过），球体贴图只渲染一帧静帧（不启动自转循环）
  startGlobeEngine(canvas, { sat, orbit, ro1, ro2 }, { still: waveReducedMotion() })
  return root
}

interface GlobeFx { sat: HTMLElement | null; orbit: HTMLElement | null; ro1: HTMLElement; ro2: HTMLElement }

/** 启动正交投影自转引擎；贴图加载完成后开始逐帧渲染（帧率上限 ~20fps）。
 *  同一 rAF 顺带驱动卫星层（公转 + 轨道面进动 + 球盘遮挡）与 live 代码读数，
 *  并与球自转共用活动门 boost。
 *  still=true（reduced-motion）：贴图只渲染一帧静帧 + 写一次读数，不启动任何循环。 */
function startGlobeEngine(canvas: HTMLCanvasElement, fx: GlobeFx, opts?: { still?: boolean }): void {
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
        cloud.push({
          lon: (lo * Math.PI) / 180,
          sinLat,
          cosLat,
          b,
          // 矿质着色（月海已抽空，蓝调上移到亮边带）：全收档（岸线/亮坡/坑环）
          // ~1/3 钛蓝着色——亮边带冷调显形，呼应矿质蓝罩；中亮带保留 ~3.4% 随机
          // 蓝火花（哈希另一比特段，与密度门不相关）
          blue: s >= PT_RIM_MIN ? ((h >>> 20) % 3) === 0 : ((h >>> 10) % 29) === 0,
        })
      }
    }
    if (cloud.length > PT_MAX) {
      const keep = Math.ceil(cloud.length / PT_MAX)
      const thinned = cloud.filter((_, i) => i % keep === 0)
      cloud.length = 0
      for (const p of thinned) cloud.push(p)
    }
    ;(window as unknown as Record<string, unknown>).__palisPoints = cloud.length // 探针断言用

    const { sat, orbit, ro1, ro2 } = fx
    let angle = 0
    let lastT = performance.now()
    let lastFrame = 0
    let lastRo = 0
    let globeHeat = 0
    let satTheta = 0.9
    let satPsi = 0
    let satOp = 0
    let signal = 24

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

    // live 读数（500ms 节流覆写）：UTC 真时钟每拍跳动、LON 由自转角反解（真数据）、
    // SIGNAL 随活动门降速随机游走；still 模式下只写一次（静态读数）
    const pad2 = (n: number): string => String(n).padStart(2, '0')
    const writeRo = (): void => {
      const lonDeg = ((((0.5 - angle / (2 * Math.PI)) % 1) + 1) % 1) * 360 - 180
      const lonTxt = Math.abs(lonDeg).toFixed(2).padStart(6, '0') + (lonDeg >= 0 ? 'E' : 'W')
      const sigTarget = globeHeat > 0.5 ? 9 : 24
      signal = Math.min(38, Math.max(6, signal + (sigTarget - signal) * 0.3 + (Math.random() * 6 - 3)))
      const hex = ((Math.random() * 0xffff) | 0).toString(16).toUpperCase().padStart(4, '0')
      const d = new Date()
      const utc = pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds())
      ro1.textContent = 'LAT 054.23N  LON ' + lonTxt + '\nSECTOR 09A-C2  GRID 7X14\nUTC ' + utc
      ro2.textContent = 'TRACK 10 OBJECTS  SIGNAL ' + Math.round(signal) + 'ms\nINDEX 0x8C41 0x77E2 0x' + hex
    }

    const loop = (t: number): void => {
      if (disposed) return
      const dt = Math.min(0.1, (t - lastT) / 1000)
      lastT = t
      // 活动门：与声纳/行星同一节奏（快起慢落），球自转、卫星、进动一起加速
      const heatTarget = waveActive ? 1 : 0
      globeHeat += (heatTarget - globeHeat) * (heatTarget > globeHeat ? 0.05 : 0.015)
      const boost = 1 + 2 * globeHeat + 3 * moonSlideBoost
      moonSlideBoost *= 0.97 // 衰减：约 1.2s 回落正常转速
      angle += (dt * 2 * Math.PI * boost) / GLOBE_PERIOD_S
      if (sat !== null && orbit !== null) {
        satTheta += (dt * 2 * Math.PI * boost) / SAT_PERIOD_S
        satPsi += (dt * 2 * Math.PI * boost) / SAT_PRECESS_S
        // 轨道面局部坐标 (a·cosθ, a·k·sinθ) → 随进动角 ψ 在屏幕平面旋转
        const sx = Math.cos(satTheta)
        const sy = Math.sin(satTheta)
        const lx = SAT_ORBIT_A * sx
        const ly = SAT_ORBIT_A * SAT_TILT * sy
        const cp = Math.cos(satPsi)
        const sp = Math.sin(satPsi)
        const dx = lx * cp - ly * sp
        const dy = lx * sp + ly * cp
        // 后半程（sy<0）在球后方：落进球盘半径则被遮蔽淡出，盘外仅压暗
        const behind = sy < 0
        const occluded = behind && Math.hypot(dx, dy) < GLOBE_DISC_R
        const opTarget = occluded ? 0 : behind ? 0.35 : 1
        satOp += (opTarget - satOp) * Math.min(1, dt * 9)
        const sc = 1 + 0.22 * sy // 近大远小
        sat.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')'
        sat.style.opacity = satOp.toFixed(3)
        orbit.style.transform = 'rotate(' + satPsi.toFixed(4) + 'rad) scaleY(' + SAT_TILT + ')'
      }
      if (t - lastRo >= 500) {
        lastRo = t
        writeRo()
      }
      if (t - lastFrame >= 50) {
        lastFrame = t
        render()
      }
      raf = requestAnimationFrame(loop)
    }
    render()
    if (opts?.still === true) {
      writeRo()
      return // reduced-motion：静帧点云——粒子已画，读数已写，不进循环
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

function dropStarfield(): void {
  if (starRaf !== 0) {
    cancelAnimationFrame(starRaf)
    starRaf = 0
  }
  starLast = 0
  starResizeObs?.disconnect()
  starResizeObs = null
  starDots = []
  starCanvas?.remove()
  starCanvas = null
  starCtx = null
}

function seedStars(w: number, h: number): void {
  const n = Math.min(240, Math.max(80, Math.round((w * h) / 26000)))
  ;(window as unknown as Record<string, unknown>).__palisStars = n // 探针断言用
  starDots = []
  for (let i = 0; i < n; i++) {
    const tone = i % 23 === 0 ? 2 : i % 8 === 0 ? 1 : 0 // 少量暖橙/蓝火花，余为冷灰白
    starDots.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: -(Math.random() * 4.5 + 2.5), // 统一缓向左漂（深空风）
      vy: Math.random() * 3 - 1.5,
      ph: Math.random() * Math.PI * 2,
      w: 0.35 + Math.random() * 0.5,
      tone,
    })
  }
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
    starResizeObs = new ResizeObserver(() => sizeStars())
    starResizeObs.observe(host)
  }
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
    '<span class="tl-tag">SYS//09A-C2</span>' +
    '<span class="tr-tag">ARCHIVE TERMINAL</span>'
  document.body.prepend(el)
  frameEl = el
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
    '<span class="sb-ver">ARCHIVE TERMINAL · REV 09A</span>'
  document.body.append(el)
  statusbarEl = el
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
  if (!current.enabled || !current.artwork) {
    dropStarfield()
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
  ensureStarfield(host)
}

function scheduleEnsureGlobe(): void {
  const now = Date.now()
  if (now - globeLastEnsure < 600) return
  globeLastEnsure = now
  queueMicrotask(ensureGlobe)
}

/** 满月揭示：左右侧栏都收起时置 html[data-palis-moon="full"]，CSS 把整盘滑进视野。
 *  左侧栏 = 布局框架的 data-sidebar-collapsed 数据属性（内核 layout 契约）；
 *  右侧栏 = better-sidebar 写到 <html> 的 --dsh-sidebar-width 布局变量
 *  （'0px'/未设置 = 收起）。条件不满足就摘除属性，球收回右缘半弧。 */
/* 月球滑动旋转增强：揭示/隐藏翻转时给自转一个短暂加速（缓出衰减），
 * 滑动自带甩动感；真闪源=声纳 ping 环（已阈值门根治），画布无需冻结 */
let moonSlideBoost = 0

function syncMoonReveal(): void {
  const root = document.documentElement
  const leftCollapsed = document.querySelector('[data-sidebar-collapsed]') !== null
  const rightW = root.style.getPropertyValue('--dsh-sidebar-width').trim()
  const rightCollapsed = rightW === '' || rightW === '0px'
  const full = leftCollapsed && rightCollapsed
  if ((root.getAttribute('data-palis-moon') === 'full') === full) return
  if (full) root.setAttribute('data-palis-moon', 'full')
  else root.removeAttribute('data-palis-moon')
  // 滑动旋转增强：翻转即加自转（引擎内指数衰减 ~1.2s）；同时冻结声纳几何/动画
  // 落盘（ping 环阈值门之外的过渡期双保险）
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
 *   ping 扩散（<i>×3 + 中心点 <b>，CSS animation，活动门变速）；
 *   轨道环旋转（<s>×5：蓝环 r=184 + 灰环 r=348/264/96/30，与各静态环同径的 mask 虚线环，
 *     JS 逐帧积分角度，ω = speed·(sin+0.6·sin+0.3) 符号自然翻转 = 不规律顺/逆时针交替）；
 *   行星公转（<u>×9：接替 ART_ORBIT 抠掉的 8 个节点白点，正交 4 颗巡 r=430、对角 4 颗巡
 *     r=294，开普勒式内快外慢，另加 1 颗 accent 卫星巡蓝环 r=184）。
 * 活动门：波动条引擎按 [data-streaming] 翻 html[data-palis-activity]（CSS 透明度/ping 变速），
 * JS 侧经 orbitHeat 快起慢落地把角速度 ×(1+3·heat)。 */
interface SonarRing { el: HTMLElement; ratio: number; angle: number; speed: number; f1: number; f2: number; p1: number; p2: number }
interface SonarPlanet { el: HTMLElement; ratio: number; angle: number; speed: number }
let sonarEl: HTMLDivElement | null = null
let crtSweepEl: HTMLDivElement | null = null // 扫描频带独立层（transform 动画，免全屏 background-position 逐帧重绘）
let frameEl: HTMLDivElement | null = null // ASCII 取景框层（四角标记/铭牌/滚动读数）
let frameReadRaf = 0 // 读数 rAF 句柄
let statusbarEl: HTMLDivElement | null = null // tmux 式底部状态栏
let statusbarClock = 0 // UTC/相位钟句柄

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
let sonarScale = 0
let sonarLastPingD = 0 // ping 环当前直径（阈值门用）
let sonarFreezeUntil = 0 // 侧栏过渡期冻结：ResizeObserver 逐帧重布局会把 ping 环动画插值顶到最坏帧（单帧爆亮，WORKLOG 27）
let orbitRaf = 0
let orbitLast = 0
let orbitHeat = 0

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
  sonarEl?.remove()
  sonarEl = null
}

/** 背景图定位反解：orbit 在滚动体上以 size 70% auto / position 50% 58% 居中（SVG 正方）。
 *  旋转环定径：mask 圆半径 = 元素边长 ×47% → 边长 = S × 环半径/470；行星轨道半径 = S × r/1000。 */
function layoutSonar(host: HTMLElement): void {
  if (sonarEl === null) return
  if (performance.now() < sonarFreezeUntil) return // 冻结窗：几何保持过渡前值
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
  // ping 环定径：保底 760px，超宽屏按 1.1·S 越过最外轨道环（r=430 → 0.86·S）。
  // 仅增量 >40px 才重尺寸（构建期已定一次）：ping 环是 6.4s 无限动画元素，逐帧改
  // width/margin 会把动画插值顶爆成单帧亮闪（WORKLOG 25/27 最终定案）。
  const pingD = Math.max(760, 1.1 * s)
  if (Math.abs(sonarLastPingD - pingD) <= 40) return
  sonarLastPingD = pingD
  sonarEl.querySelectorAll<HTMLElement>('i').forEach((ping) => {
    ping.style.width = pingD.toFixed(1) + 'px'
    ping.style.height = pingD.toFixed(1) + 'px'
    ping.style.margin = (-pingD / 2).toFixed(1) + 'px 0 0 ' + (-pingD / 2).toFixed(1) + 'px'
  })
}

/** 旋转/公转驱动：独立 rAF（波动条引擎静默即休眠，行星是背景生命力，须持续慢转）。 */
function orbitFrame(t: number): void {
  orbitRaf = 0
  if (sonarEl === null || !sonarEl.isConnected) return
  if (performance.now() < sonarFreezeUntil) { orbitRaf = requestAnimationFrame(orbitFrame); return } // 冻结窗：帧照跑不落盘
  const dt = orbitLast > 0 ? Math.min(0.1, (t - orbitLast) / 1000) : 0.016
  orbitLast = t
  const heatTarget = waveActive ? 1 : 0
  orbitHeat += (heatTarget - orbitHeat) * (heatTarget > orbitHeat ? 0.05 : 0.015) // 快起慢落
  const boost = 1 + 3 * orbitHeat
  const tt = t / 1000
  for (const r of sonarRings) {
    const w = r.speed * (Math.sin(tt * r.f1 + r.p1) + 0.6 * Math.sin(tt * r.f2 + r.p2) + 0.3)
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
  /* speed 正 = 屏上顺时针；双频正弦叠加使 ω 不规律换向；speed 大环慢、小环快 */
  sonarRings = [
    ring('', 0.3915, 0.16, 0.19, 0.53, 0, 2.1), // 蓝环 r=184
    ring('g3', 0.7404, 0.08, 0.12, 0.37, 5.2, 3.3), // 灰环 r=348
    ring('g4', 0.9149, 0.06, 0.1, 0.31, 0.8, 5.7), // 灰环 r=430（最外圈也转）
    ring('g2', 0.5617, -0.1, 0.15, 0.41, 3.9, 1.8), // 灰环 r=264
    ring('g1', 0.2043, -0.22, 0.23, 0.61, 1.3, 4.0), // 灰环 r=96
    ring('g0', 0.0638, 0.3, 0.31, 0.83, 2.6, 0.7), // 中心环 r=30
  ]
  const WO = (2 * Math.PI) / 240 // 外环带公转基速：静默 4 分钟/圈
  const planet = (cls: string, ratio: number, angle: number, speed: number): SonarPlanet => {
    const el = document.createElement('u')
    if (cls !== '') el.className = cls
    return { el, ratio, angle, speed }
  }
  /* 初相 = 原 SVG 节点角位（正交 4 颗巡 r=430、对角 4 颗巡 r=294）；内环按 (r外/r内)^1.5 提速 */
  sonarPlanets = [
    planet('', 0.43, -Math.PI / 2, WO), planet('', 0.43, 0, WO),
    planet('', 0.43, Math.PI / 2, WO), planet('', 0.43, Math.PI, WO),
    planet('d', 0.29416, -Math.PI / 4, WO * 1.77), planet('d', 0.29416, (-3 * Math.PI) / 4, WO * 1.77),
    planet('d', 0.29416, Math.PI / 4, WO * 1.77), planet('d', 0.29416, (3 * Math.PI) / 4, WO * 1.77),
    planet('a', 0.184, 0.9, WO * 3.58), // 蓝环 accent 卫星
  ]
  sonarEl.append(
    document.createElement('i'), document.createElement('i'), document.createElement('i'),
    document.createElement('b'),
    ...sonarRings.map((r) => r.el),
    ...sonarPlanets.map((p) => p.el),
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
}

async function apiGet(): Promise<ApiView> {
  const res = await fetch(API_ROUTE, { cache: 'no-store' })
  const json = await res.json()
  return { settings: normalizeSettings(json?.settings), revision: Number(json?.revision ?? 0) }
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
function playBoot(): void {
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
  sub.innerHTML = '正在接入 <b>PALIS 管理系统</b>'
  portText.append(title, sub)
  port.append(moon, portRing, portCross, portText)

  const bar = document.createElement('div')
  bar.className = 'pb-bar'
  const fill = document.createElement('i')
  bar.appendChild(fill)
  const lines = document.createElement('div')
  lines.className = 'pb-lines'
  overlay.append(port, bar, lines)

  const seq: Array<{ text: string; cls?: string; delay: number }> = [
    { text: 'CHANNEL: 09A / ARCHIVE TERMINAL', delay: 60 },
    { text: 'INDEX BUS SELF-TEST ......... OK', cls: 'ok', delay: 260 },
    { text: 'NINE RECORD FAMILIES ........ OK', cls: 'ok', delay: 440 },
    { text: 'IDENTITY_CHAIN ............... VERIFIED', cls: 'accent', delay: 620 },
    { text: 'CRT RENDER LAYER ............ ONLINE', cls: 'ok', delay: 800 },
    { text: 'ARCHIVE DIRECTORY ........... READY', cls: 'ok', delay: 980 },
    { text: 'GROUND TRACK ............. LOCKED', cls: 'ok', delay: 1160 },
    { text: 'VIEWFINDER [\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2591\u2591] ARMED', cls: 'accent', delay: 1340 },
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

    // 满月揭示：左右侧栏全收 → html[data-palis-moon="full"]（CSS 把整盘滑进视野）。
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
      document.documentElement.removeAttribute('data-palis-moon')
      globeEl?.remove()
      globeEl = null
      stopGlobeEngine()
      window.removeEventListener("scroll", frameScroll, { capture: true })
      window.removeEventListener("resize", frameScroll)
      document.removeEventListener("input", composerCounter, { capture: true })
      frameEl?.remove()
      frameEl = null
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
