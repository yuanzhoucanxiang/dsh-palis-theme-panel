/**
 * PALIS 档案终端主题面板 — host 半侧。
 *
 * 职责：
 *  1. 注册 `palis-theme` 设置命名空间（可持久化的主题参数）；
 *  2. 提供 fenced API（GET/POST /palis-theme/api）供 client 面板读写（revision 守卫）；
 *  3. index-inject：主题开启时把 PALIS_CSS + boot 脚本注入启动 HTML —— 首帧即 PALIS。
 *
 * 设计：
 *  - 复用内核自己的设计令牌机制（--dsw-alias-*），与官方 ui-theme 同层，不碰 DOM 结构；
 *  - 深度换肤的组件层（CRT 质感/角色标签/输入区）全部走语义 data 属性 + 自有类名；
 *  - 设置服务是可选的：缺席时 API 只读默认值、index-inject 不注入（页面回落到官方主题）。
 */
import type { Context } from 'cordis'
import z from 'schemastery'
import { SettingsConflictError, settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  API_ROUTE,
  bootScriptOf,
  DEFAULT_SETTINGS,
  normalizeSettings,
  PALIS_CSS,
  SETTINGS_NS,
  type PalisSettings,
} from './theme-core.ts'

export const name = 'palis-theme-panel'
export const inject = ['webServer']

export const Config = z.object({})

/** 主题设置 schema（schemastery；与 theme-core 的默认值保持同源）。 */
const ThemeSettingsSchema = z.object({
  enabled: z.boolean().default(DEFAULT_SETTINGS.enabled),
  intensity: z.union(['low', 'mid', 'high']).default(DEFAULT_SETTINGS.intensity),
  scanlines: z.boolean().default(DEFAULT_SETTINGS.scanlines),
  noise: z.boolean().default(DEFAULT_SETTINGS.noise),
  vignette: z.boolean().default(DEFAULT_SETTINGS.vignette),
  glow: z.boolean().default(DEFAULT_SETTINGS.glow),
  monospace: z.boolean().default(DEFAULT_SETTINGS.monospace),
  square: z.boolean().default(DEFAULT_SETTINGS.square),
  labels: z.boolean().default(DEFAULT_SETTINGS.labels),
  boot: z.boolean().default(DEFAULT_SETTINGS.boot),
  artwork: z.boolean().default(DEFAULT_SETTINGS.artwork),
})

/** 设置服务面的最小视图（settings 缺席时为 undefined，读默认值/写 503）。 */
interface SettingsFace {
  get(): { value?: unknown; revision?: number }
  update(patch: Record<string, unknown>, expectedRevision?: number): Promise<{ value?: unknown; revision?: number }>
}

function writeJson(res: any, status: number, obj: unknown): void {
  const body = JSON.stringify(obj)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(body)
}

function readBody(req: any): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: any) => {
      data += String(chunk)
      if (data.length > 1e6) req.destroy() // 1MB 防御上限
    })
    req.on('end', () => resolve(data))
    req.on('error', () => resolve(''))
  })
}

/** 只接受回环对端（桌面版绑定 127.0.0.1；LAN 绑定下也真拦截设置面）。
 *  以 socket 对端地址为准——Host 头是客户端可任意伪造的，按头判断等于没防。 */
function isLoopbackRequest(req: any): boolean {
  const addr = String(req?.socket?.remoteAddress ?? '')
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

export function apply(ctx: Context): void {
  /** cordis Context 的服务面依赖各包的声明增强；本地插件用宽松面（运行时结构一致）。 */
  const c = ctx as Context & { [key: string]: any }
  let face: SettingsFace | undefined

  // ── 设置命名空间（可选服务：缺席时下面 API 回退默认值）──────────────────
  c.inject(['settings'], (sctxRaw: any) => {
    const sctx = sctxRaw as any
    const ns = settingsNamespace(SETTINGS_NS)
    sctx.settings.register(ns, ThemeSettingsSchema)
    const view = (): { value?: unknown; revision?: number } => {
      const descriptor = sctx.settings.describe({ redactSecrets: true }).find((candidate: any) => candidate.ns === ns)
      return descriptor === undefined
        ? { value: undefined, revision: undefined }
        : { value: descriptor.value, revision: descriptor.revision }
    }
    face = {
      get: view,
      update: async (patch, expectedRevision) => {
        await sctx.settings.update(ns, patch, expectedRevision)
        return view()
      },
    }
  })

  const settingsOf = (): PalisSettings => normalizeSettings(face?.get().value)
  const revisionOf = (): number => face?.get().revision ?? 0

  // ── fenced API（client 面板读写）───────────────────────────────────────
  ctx.effect(
    () =>
      c.webServer.register({
        kind: 'exact',
        path: API_ROUTE,
        handler: async (req: any, res: any) => {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: 'forbidden' })
            return
          }
          if (req.method === 'GET') {
            writeJson(res, 200, { ok: true, settings: settingsOf(), revision: revisionOf() })
            return
          }
          if (req.method === 'POST') {
            if (face === undefined) {
              writeJson(res, 503, { ok: false, error: 'settings service unavailable' })
              return
            }
            let parsed: any
            try {
              parsed = JSON.parse((await readBody(req)) || '{}')
            } catch {
              writeJson(res, 400, { ok: false, error: 'invalid json' })
              return
            }
            const patch = parsed?.patch
            if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
              writeJson(res, 400, { ok: false, error: 'patch must be a plain object' })
              return
            }
            try {
              const next = await face.update(
                patch as Record<string, unknown>,
                typeof parsed.expectedRevision === 'number' ? parsed.expectedRevision : undefined,
              )
              writeJson(res, 200, {
                ok: true,
                settings: normalizeSettings(next.value),
                revision: next.revision ?? 0,
              })
            } catch (error) {
              if (error instanceof SettingsConflictError) {
                writeJson(res, 409, { ok: false, conflict: true, error: error.message })
                return
              }
              writeJson(res, 400, {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              })
            }
            return
          }
          writeJson(res, 405, { ok: false, error: 'method not allowed' })
        },
      }),
    'palis-theme-panel: /palis-theme/api route',
  )

  // ── 外壳皮肤联动：桌面外壳在「皮肤切入/切出 palis」及内核 ready 时 POST
  //    /api/palis-theme {theme:'palis'|''}（契约见 dsh-desktop/main.js pushThemeToKernel，
  //    原为内置扁平插件 palis-theme 预留——本插件直接实现同一契约：开 = 写入
  //    enabled:true，关 = enabled:false；GET 返回当前主题态，兼容轮询语义）──
  ctx.effect(
    () =>
      c.webServer.register({
        kind: 'exact',
        path: '/api/palis-theme',
        handler: async (req: any, res: any) => {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: 'forbidden' })
            return
          }
          if (req.method === 'GET') {
            writeJson(res, 200, { ok: true, theme: settingsOf().enabled ? 'palis' : '' })
            return
          }
          if (req.method === 'POST') {
            if (face === undefined) {
              writeJson(res, 503, { ok: false, error: 'settings service unavailable' })
              return
            }
            let parsed: any
            try {
              parsed = JSON.parse((await readBody(req)) || '{}')
            } catch {
              writeJson(res, 400, { ok: false, error: 'invalid json' })
              return
            }
            const on = parsed?.theme === 'palis'
            try {
              await face.update({ enabled: on })
              writeJson(res, 200, { ok: true, enabled: on })
            } catch (error) {
              writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
            }
            return
          }
          writeJson(res, 405, { ok: false, error: 'method not allowed' })
        },
      }),
    'palis-theme-panel: /api/palis-theme shell-theme link route',
  )

  // ── index-inject：主题开启时首帧注入（零闪烁）──────────────────────────
  ;(c as any).on('webserver/index-inject', (table: any[]) => {
    const settings = settingsOf()
    if (!settings.enabled) return
    table.push({ kind: 'style', text: PALIS_CSS })
    table.push({ kind: 'script', placement: 'body', text: bootScriptOf(settings) })
  })
}
