/**
 * PALIS 档案终端主题面板 — client 半侧。
 *
 * 职责：
 *  1. settings.section 面板（React 函数组件，经 slots.register(options, Component) 注册）：
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
  ART_EARTH_MAP,
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
let floatBtn: HTMLButtonElement | null = null
let globeEl: HTMLDivElement | null = null
let globeObserver: MutationObserver | null = null
let globeLastEnsure = 0
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
  if (next.enabled && (opts?.allowBoot ?? next.boot) && !bootPlayed) {
    bootPlayed = true
    playBoot()
  }
  syncFloat()
  ensureGlobe()
  ensureWave()
  ensureSonar()
  notify()
}

/* ═══ 3D 地球层（canvas 正交投影引擎，真·球面）═══
 * 原理：屏幕每像素 (x,y) → lat=asin(y/R)、lon=asin(x/(R·cos lat))（正交投影，前半球），
 * 贴图按 (lon+rotation, lat) 双线性采样——大陆绕球体卷曲、极区压缩，边缘透视收敛。
 * 无光照、无辉光、无柔边——纯纹理固定曝光（×.32 深压暗）+ 绕中灰对比拉伸（×1.4），
 * 硬切边，质感全部来自构成元素：等高线/纵向波纹线/经纬网/多尺度半调网点
 * （细/中/粗 + 陆块密度调制）/数据刻度（贴图内，随球卷曲）+ 三层异相表面
 * 粒子（DOM）。渲染 640px 内部分辨率，CSS 放大到 900px。
 * 卫星层（与球呼应）：一颗 accent 卫星沿贴 r1 HUD 环的倾斜轨道公转——方向与球面
 * 漂移一致（前半球右→左），轨道面缓慢进动；绕到球盘后（后半程且落在球盘半径内）
 * 被遮蔽淡出。球自转、卫星公转、进动共用活动门 boost（×(1+2·heat)，快起慢落）。
 */
const GLOBE_RENDER = 640
const GLOBE_PERIOD_S = 100
const GLOBE_EXPOSURE = 0.32 // 固定曝光：无光照无辉光，深压暗（贴图线元素已相应补强）
const GLOBE_CONTRAST = 1.4 // 纹理对比：绕中灰 128 拉伸——暗部更暗亮部更亮，均值近似不变
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
  const shade = document.createElement('div')
  shade.className = 'palis-globe-shade'
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
  sphere.append(canvas, shade, dither, mkDust('d1', 16, false), mkDust('d2', 12, false), mkDust('d3', 5, true))
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
  startGlobeEngine(canvas, { sat, orbit, ro1, ro2 })
  return root
}

interface GlobeFx { sat: HTMLElement | null; orbit: HTMLElement | null; ro1: HTMLElement; ro2: HTMLElement }

/** 启动正交投影自转引擎；贴图加载完成后开始逐帧渲染（帧率上限 ~20fps）。
 *  同一 rAF 顺带驱动卫星层（公转 + 轨道面进动 + 球盘遮挡）与 live 代码读数，
 *  并与球自转共用活动门 boost。 */
function startGlobeEngine(canvas: HTMLCanvasElement, fx: GlobeFx): void {
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

    // 静态几何预计算：每个像素的贴图坐标（球面正交投影，与旋转无关）。
    // 无光照、无辉光、无柔边——纯纹理质感，硬切边（边缘由 CSS 圆形容器裁剪）。
    const cx = SIZE / 2
    const cy = SIZE / 2
    const R = SIZE / 2 - 2
    const uArr = new Float32Array(SIZE * SIZE)
    const vArr = new Float32Array(SIZE * SIZE)
    const validIdx: number[] = []
    for (let y = 0; y < SIZE; y++) {
      const ny = (y + 0.5 - cy) / R
      const lat = Math.asin(Math.min(1, Math.max(-1, ny)))
      const cosLat = Math.cos(lat)
      for (let x = 0; x < SIZE; x++) {
        const nx = (x + 0.5 - cx) / R
        if (nx * nx + ny * ny > 1) continue
        const sLon = nx / (cosLat || 1e-6)
        if (sLon < -1 || sLon > 1) continue
        const lon = Math.asin(sLon)
        const i = y * SIZE + x
        uArr[i] = (lon / (2 * Math.PI) + 0.5) * MAP_W // 贴图像素 x（u=0.5 为前半球中央经线）
        vArr[i] = (0.5 - lat / Math.PI) * (MAP_H - 1) // 贴图像素 y（0=北极）
        validIdx.push(i)
      }
    }

    const out = ctx.createImageData(SIZE, SIZE)
    const data = out.data
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

    const render = (): void => {
      // 双线性采样（x 向无缝环绕）；贴图为灰度图，只取 R 通道
      const shift = (angle / (2 * Math.PI)) * MAP_W
      for (const i of validIdx) {
        let fx = uArr[i] + shift
        fx -= Math.floor(fx / MAP_W) * MAP_W
        const fy = vArr[i]
        const x0 = fx | 0
        const y0 = fy | 0
        const x1 = (x0 + 1) & (MAP_W - 1) // MAP_W=1024，位与即环绕
        const y1 = y0 + 1 >= MAP_H ? MAP_H - 1 : y0 + 1
        const tx = fx - x0
        const ty = fy - y0
        const p00 = (y0 * MAP_W + x0) * 4
        const p10 = (y0 * MAP_W + x1) * 4
        const p01 = (y1 * MAP_W + x0) * 4
        const p11 = (y1 * MAP_W + x1) * 4
        const top = map[p00] * (1 - tx) + map[p10] * tx
        const bot = map[p01] * (1 - tx) + map[p11] * tx
        const s = top * (1 - ty) + bot * ty
        // 绕中灰拉伸对比（写入 uint8 自动截断到 [0,255]），再乘固定曝光
        const v = ((s - 128) * GLOBE_CONTRAST + 128) * GLOBE_EXPOSURE
        const o = i * 4
        data[o] = v
        data[o + 1] = v
        data[o + 2] = v
        data[o + 3] = 255 // 硬切边（圆盘外像素本就不写，CSS 圆形容器裁出边缘）
      }
      ctx.putImageData(out, 0, 0)
    }

    const loop = (t: number): void => {
      if (disposed) return
      const dt = Math.min(0.1, (t - lastT) / 1000)
      lastT = t
      // 活动门：与声纳/行星同一节奏（快起慢落），球自转、卫星、进动一起加速
      const heatTarget = waveActive ? 1 : 0
      globeHeat += (heatTarget - globeHeat) * (heatTarget > globeHeat ? 0.05 : 0.015)
      const boost = 1 + 2 * globeHeat
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
        const lonDeg = ((((0.5 - angle / (2 * Math.PI)) % 1) + 1) % 1) * 360 - 180
        const lonTxt = Math.abs(lonDeg).toFixed(2).padStart(6, '0') + (lonDeg >= 0 ? 'E' : 'W')
        const sigTarget = globeHeat > 0.5 ? 9 : 24
        signal = Math.min(38, Math.max(6, signal + (sigTarget - signal) * 0.3 + (Math.random() * 6 - 3)))
        const hex = ((Math.random() * 0xffff) | 0).toString(16).toUpperCase().padStart(4, '0')
        ro1.textContent = 'LAT 054.23N  LON ' + lonTxt + '\nSECTOR 09A-C2  GRID 7X14\nVER 0.1.1-RC'
        ro2.textContent = 'TRACK 10 OBJECTS  SIGNAL ' + Math.round(signal) + 'ms\nINDEX 0x8C41 0x77E2 0x' + hex
      }
      if (t - lastFrame >= 50) {
        lastFrame = t
        render()
      }
      raf = requestAnimationFrame(loop)
    }
    render()
    raf = requestAnimationFrame(loop)
  }
  img.src = 'data:image/svg+xml;utf8,' + ART_EARTH_MAP
}

/** 幂等挂载：主题开启 + 图形开启时，把地球插到会话根容器（不随消息滚动；宿主更换自动重挂）。 */
function ensureGlobe(): void {
  if (!current.enabled || !current.artwork) {
    globeEl?.remove()
    globeEl = null
    stopGlobeEngine()
    return
  }
  const host = document.querySelector('[data-phase]') ?? document.querySelector('[data-conversation-scroll]')
  if (host === null) return
  if (globeEl !== null && globeEl.parentElement === host) return
  globeEl?.remove()
  globeEl = buildGlobe()
  host.prepend(globeEl)
}

function scheduleEnsureGlobe(): void {
  const now = Date.now()
  if (now - globeLastEnsure < 600) return
  globeLastEnsure = now
  queueMicrotask(ensureGlobe)
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
  if (document.querySelector('[data-streaming]') !== null) waveLastSeen = now
  waveBoost = Math.max(waveBoost * 0.55, Math.min(1, waveMutations / 24))
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
 * 与地球同款的 client DOM 层：.palis-sonar 挂到不滚动的根容器 [data-phase]（z-index:-1，
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
let sonarResize: ResizeObserver | null = null
let sonarLastEnsure = 0
let sonarRings: SonarRing[] = []
let sonarPlanets: SonarPlanet[] = []
let sonarScale = 0
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
  // ping 环定径：保底 760px，超宽屏按 1.1·S 越过最外轨道环（r=430 → 0.86·S）
  const pingD = Math.max(760, 1.1 * s)
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

/** 面板/浮动开关的统一写路径：乐观应用 → POST → 冲突回读。 */
async function setField(key: keyof PalisSettings, value: boolean | 'low' | 'mid' | 'high'): Promise<void> {
  const next = { ...current, [key]: value } as unknown as PalisSettings
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
    logLine(`${String(key)} = ${String(value)} — COMMITTED · rev ${revision}`, 'ok')
  } catch {
    logLine('API WRITE FAILED — 主题已本地生效，未持久化', 'err')
  }
}

/* ═══ 开机自检动画 ═══ */
function playBoot(): void {
  const overlay = document.createElement('div')
  overlay.className = 'palis-boot'

  const title = document.createElement('div')
  title.className = 'pb-title'
  title.textContent = 'PALIS 09A'
  const sub = document.createElement('div')
  sub.className = 'pb-sub'
  sub.innerHTML = '正在接入 <b>PALIS 管理系统</b>'
  const bar = document.createElement('div')
  bar.className = 'pb-bar'
  const fill = document.createElement('i')
  bar.appendChild(fill)
  const lines = document.createElement('div')
  lines.className = 'pb-lines'
  overlay.append(title, sub, bar, lines)

  const seq: Array<{ text: string; cls?: string; delay: number }> = [
    { text: 'CHANNEL: 09A / ARCHIVE TERMINAL', delay: 60 },
    { text: 'INDEX BUS SELF-TEST ......... OK', cls: 'ok', delay: 260 },
    { text: 'NINE RECORD FAMILIES ........ OK', cls: 'ok', delay: 440 },
    { text: 'IDENTITY_CHAIN ............... VERIFIED', cls: 'accent', delay: 620 },
    { text: 'CRT RENDER LAYER ............ ONLINE', cls: 'ok', delay: 800 },
    { text: 'ARCHIVE DIRECTORY ........... READY', cls: 'ok', delay: 980 },
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
        ),
        h(
          'button',
          { type: 'button', className: 'ptp-power' + (on ? ' on' : ''), onClick: toggle('enabled', !on) },
          h('span', { className: 'ptp-key' }, 'POWER'),
          h('span', { className: 'ptp-val' }, on ? '● 已接入 / ONLINE' : '○ 未接入 / OFFLINE'),
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

    // 滚动体（对话/欢迎屏容器）出现或重建时，幂等重挂 3D 地球
    globeObserver = new MutationObserver(() => scheduleEnsureGlobe())
    globeObserver.observe(document.body, { childList: true, subtree: true })
    ensureGlobe()

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

    return () => {
      floatBtn?.remove()
      floatBtn = null
      globeObserver?.disconnect()
      globeObserver = null
      globeEl?.remove()
      globeEl = null
      stopGlobeEngine()
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
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'palis-theme-panel',
            order: 45,
            label: () => 'PALIS 主题',
          },
          Panel,
        ),
      ),
    'palis-theme-panel: settings panel',
  )
}
