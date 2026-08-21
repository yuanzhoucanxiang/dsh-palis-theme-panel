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
