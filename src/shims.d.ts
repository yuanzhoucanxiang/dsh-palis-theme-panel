/**
 * 构建/类型 shim：@deepseek-ai/dsh-settings 的 npm 包只发布 JS（无 .d.ts），
 * 这里声明运行时会真实解析到的最小接口面（运行时由 build.sh 的 junction 提供）。
 */
declare module '@deepseek-ai/dsh-settings' {
  /** Brand a raw string as a SettingsNamespace（lowercase kebab-case 校验）。 */
  export function settingsNamespace(value: string): string
  /** Revision 冲突错误（settings.update 在预期 revision 过期时抛出）。 */
  export class SettingsConflictError extends Error {}
}

/**
 * React 最小类型面（运行时由 shell 提供，仅用于本插件的 tsc 编译；
 * 与 client 侧仅使用 useState/useEffect/createElement 对齐）。
 */
declare module 'react' {
  export type ReactNode = unknown
  export function useState<T>(initial: T | (() => T)): [T, (updater: T | ((prev: T) => T)) => void]
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  export function createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown
}

/**
 * node 内置模块的最小类型面：本仓库的 node_modules 不含 @types/node（build.sh 只链
 * cordis / cosmokit / schemastery / dsh-settings / tsdown），而 host 侧要从随包的
 * package.json 读一次自身版本（供状态栏铭牌做"外壳·内核·主题"三方对账）。
 * 只声明实际用到的两个函数。将来若装上 @types/node，本段应删除以免重复声明。
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
}

declare module 'node:url' {
  export function fileURLToPath(url: URL | string): string
}
