/**
 * PALIS 档案终端主题面板 — client 半侧。
 *
 * 职责：
 *  1. settings.section 面板（React 函数组件，经 slots.register(options, Component) 注册）：
 *     PALIS 控制台（总开关/强度档位/效果开关/自检日志）；
 *  2. 实时应用：把设置写入 <html> 门禁属性 + 注入 PALIS_CSS（与 host 首帧同源）；
 *  3. 右下角浮动快捷开关（一键接入/断开）；
 *  4. 开机自检动画（开启 + boot 开启时，每次页面加载一次）。
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
  if (panelTag !== null) return
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
  notify()
}

/* ═══ 3D 地球层（canvas 正交投影引擎，真·球面）═══
 * 原理：屏幕每像素 (x,y) → lat=asin(y/R)、lon=asin(x/(R·cos lat))（正交投影，前半球），
 * 贴图按 (lon+rotation, lat) 采样——大陆绕球体卷曲、极区压缩，边缘透视收敛。
 * 渲染 520px 内部分辨率，CSS 放大到 900px（印刷网点风格容忍软边）。
 */
const GLOBE_RENDER = 640
const GLOBE_PERIOD_S = 100

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
  const dust = document.createElement('div')
  dust.className = 'palis-globe-dust'
  // 表面粒子尘埃：球内随机点（box-shadow 列表，单元素低成本）
  const dots: string[] = []
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * 400
    const x = 450 + Math.cos(a) * r
    const y = 450 + Math.sin(a) * r
    const s = (Math.random() * 1.6 + 0.4).toFixed(1)
    const alpha = (Math.random() * 0.22 + 0.08).toFixed(2)
    dots.push(`${x.toFixed(0)}px ${y.toFixed(0)}px 0 ${s}px rgba(226,236,246,${alpha})`)
  }
  dust.style.boxShadow = dots.join(',')
  sphere.append(canvas, shade, dither, dust)
  const geo = document.createElement('div')
  geo.className = 'palis-globe-geo'
  for (const cls of ['palis-globe-r1', 'palis-globe-r2', 'palis-globe-hline', 'palis-globe-vline', 'palis-globe-cross']) {
    const el = document.createElement('i')
    el.className = cls
    geo.appendChild(el)
  }
  root.append(sphere, geo)
  stopGlobeEngine()
  startGlobeEngine(canvas)
  return root
}

/** 启动正交投影自转引擎；贴图加载完成后开始逐帧渲染（帧率上限 ~20fps）。 */
function startGlobeEngine(canvas: HTMLCanvasElement): void {
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

    // 静态几何预计算：每个像素的 (u, v) 与有效性（球面正交投影，与旋转无关）
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
        uArr[i] = lon / (2 * Math.PI) + 0.5 // 0..1（u=0.5 为前半球中央经线）
        vArr[i] = 0.5 - lat / Math.PI // 0=北极
        validIdx.push(i)
      }
    }

    const out = ctx.createImageData(SIZE, SIZE)
    const data = out.data
    let angle = 0
    let lastT = performance.now()
    let lastFrame = 0

    const render = (): void => {
      const rotFrac = angle / (2 * Math.PI)
      for (const i of validIdx) {
        const uu = uArr[i] + rotFrac
        const mx = ((uu - Math.floor(uu)) * MAP_W) | 0
        const my = (vArr[i] * (MAP_H - 1)) | 0
        const mi = (my * MAP_W + mx) * 4
        const o = i * 4
        data[o] = (map[mi] * 0.7) | 0
        data[o + 1] = (map[mi + 1] * 0.7) | 0
        data[o + 2] = (map[mi + 2] * 0.7) | 0
        data[o + 3] = 255
      }
      ctx.putImageData(out, 0, 0)
    }

    const loop = (t: number): void => {
      if (disposed) return
      const dt = Math.min(0.1, (t - lastT) / 1000)
      lastT = t
      angle += (dt * 2 * Math.PI) / GLOBE_PERIOD_S
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
  useEffect(() => subscribe(() => force((n) => n + 1)), [])

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
            { className: 'ptp-cell' },
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
      dropThemeCss()
      panelTag?.remove()
      panelTag = null
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
