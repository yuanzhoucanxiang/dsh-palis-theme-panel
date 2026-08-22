/**
 * PALIS 档案终端主题 — 共享核心（host 与 client 共用，浏览器安全，零 node 依赖）。
 *
 * 分工：
 *  - host（index.ts）在 index-inject 时把 PALIS_CSS + bootScriptOf() 注入启动 HTML，
 *    保证"主题已开启"的页面从第一帧就是 PALIS（无闪烁）；
 *  - client（client/index.ts）持有同一份 PALIS_CSS，负责实时开关/调参；
 *  - PANEL_CSS 始终由 client 注入（主题关闭时设置页面板也要好看）。
 *
 * 纪律：
 *  - 只通过三类选择器动手：① 内核设计令牌（--dsw-alias-* / --dsw-static-*）；
 *    ② 内核语义 data 属性（data-chat-flow-* / data-composer-* 等，官方 selector-check
 *    门禁在监控的稳定契约）；③ 本插件自有 .ptp-* / .palis-boot-* 类名。
 *  - 绝不依赖编译 hash 类名（内核重构即碎）。
 */

export const PLUGIN_ID = '@dsh-local/palis-theme-panel'
export const SETTINGS_NS = 'palis-theme'
export const API_ROUTE = '/palis-theme/api'
/** 主题开启时挂在 <html> 上的门禁属性。 */
export const ATTR = 'data-palis-theme'

export interface PalisSettings {
  enabled: boolean
  intensity: 'low' | 'mid' | 'high'
  scanlines: boolean
  noise: boolean
  vignette: boolean
  glow: boolean
  monospace: boolean
  square: boolean
  labels: boolean
  boot: boolean
  artwork: boolean
}

export const DEFAULT_SETTINGS: PalisSettings = {
  enabled: false,
  intensity: 'mid',
  scanlines: true,
  noise: true,
  vignette: true,
  glow: false,
  monospace: true,
  square: true,
  labels: true,
  boot: true,
  artwork: true,
}

/** 对任意来源的值做类型守卫式归一化（缺省/非法字段回落到默认）。 */
export function normalizeSettings(raw: unknown): PalisSettings {
  const r = (raw ?? {}) as Record<string, unknown>
  const b = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d)
  const intensity = r.intensity === 'low' || r.intensity === 'high' ? r.intensity : r.intensity === 'mid' ? 'mid' : DEFAULT_SETTINGS.intensity
  return {
    enabled: b(r.enabled, DEFAULT_SETTINGS.enabled),
    intensity,
    scanlines: b(r.scanlines, DEFAULT_SETTINGS.scanlines),
    noise: b(r.noise, DEFAULT_SETTINGS.noise),
    vignette: b(r.vignette, DEFAULT_SETTINGS.vignette),
    glow: b(r.glow, DEFAULT_SETTINGS.glow),
    monospace: b(r.monospace, DEFAULT_SETTINGS.monospace),
    square: b(r.square, DEFAULT_SETTINGS.square),
    labels: b(r.labels, DEFAULT_SETTINGS.labels),
    boot: b(r.boot, DEFAULT_SETTINGS.boot),
    artwork: b(r.artwork, DEFAULT_SETTINGS.artwork),
  }
}

/** 把设置写入 <html> 门禁属性（client 实时应用与 boot 脚本共用的同一套语义）。 */
export function applyAttributes(s: PalisSettings, root: HTMLElement): void {
  if (s.enabled) root.setAttribute(ATTR, '1')
  else root.removeAttribute(ATTR)
  root.setAttribute('data-palis-intensity', s.intensity)
  root.setAttribute('data-palis-scan', s.scanlines ? 'on' : 'off')
  root.setAttribute('data-palis-noise', s.noise ? 'on' : 'off')
  root.setAttribute('data-palis-vignette', s.vignette ? 'on' : 'off')
  root.setAttribute('data-palis-glow', s.glow ? 'on' : 'off')
  root.setAttribute('data-palis-mono', s.monospace ? 'on' : 'off')
  root.setAttribute('data-palis-square', s.square ? 'on' : 'off')
  root.setAttribute('data-palis-labels', s.labels ? 'on' : 'off')
  root.setAttribute('data-palis-artwork', s.artwork ? 'on' : 'off')
}

/** 首帧 boot 脚本（host index-inject 行）：零闪烁应用门禁属性。 */
export function bootScriptOf(s: PalisSettings): string {
  return [
    '(function(){',
    'var s=' + JSON.stringify(s) + ';',
    'var r=document.documentElement;',
    'if(!s||!s.enabled)return;',
    `r.setAttribute(${JSON.stringify(ATTR)},'1');`,
    "r.setAttribute('data-palis-intensity',s.intensity||'mid');",
    "r.setAttribute('data-palis-scan',s.scanlines===false?'off':'on');",
    "r.setAttribute('data-palis-noise',s.noise===false?'off':'on');",
    "r.setAttribute('data-palis-vignette',s.vignette===false?'off':'on');",
    "r.setAttribute('data-palis-glow',s.glow===true?'on':'off');",
    "r.setAttribute('data-palis-mono',s.monospace===false?'off':'on');",
    "r.setAttribute('data-palis-square',s.square===false?'off':'on');",
    "r.setAttribute('data-palis-labels',s.labels===false?'off':'on');",
    "r.setAttribute('data-palis-artwork',s.artwork===false?'off':'on');",
    '})()',
  ].join('')
}

/* ═══════════════════════════════════════════════════════════════════════
 * 背景图形（参考 PALIS 09A 总目录屏）：3D 地球（右侧，大陆纹理 + 云层 + 自转）
 * + 环形轨道图（居中）。地球为 DOM 层（client 注入），贴图为内联 SVG data-URI。
 * ═══════════════════════════════════════════════════════════════════════ */

/** 星尘背景（600x600 平铺）：低透明度散点，做暗面配角。 */
const ART_STARS = [
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'>",
  '<g fill=\'rgba(226,236,246,.55)\'>',
  "<circle cx='37' cy='88' r='1'/><circle cx='146' cy='31' r='.7'/><circle cx='251' cy='123' r='1.1'/>",
  "<circle cx='333' cy='64' r='.8'/><circle cx='428' cy='150' r='1'/><circle cx='548' cy='52' r='.7'/>",
  "<circle cx='82' cy='212' r='.7'/><circle cx='192' cy='266' r='1.1'/><circle cx='298' cy='204' r='.8'/>",
  "<circle cx='404' cy='292' r='.7'/><circle cx='512' cy='230' r='1'/><circle cx='572' cy='328' r='.7'/>",
  "<circle cx='46' cy='352' r='.9'/><circle cx='138' cy='418' r='.7'/><circle cx='258' cy='372' r='1'/>",
  "<circle cx='372' cy='452' r='.8'/><circle cx='482' cy='398' r='.9'/><circle cx='566' cy='470' r='.7'/>",
  "<circle cx='74' cy='522' r='.8'/><circle cx='184' cy='548' r='.7'/><circle cx='296' cy='500' r='1'/>",
  "<circle cx='408' cy='560' r='.8'/><circle cx='520' cy='532' r='.7'/><circle cx='586' cy='590' r='.6'/>",
  "<circle cx='30' cy='30' r='.6'/><circle cx='580' cy='120' r='.6'/><circle cx='120' cy='590' r='.6'/>",
  '</g>',
  '<g fill=\'rgba(107,156,255,.5)\'>',
  "<circle cx='470' cy='88' r='1.4'/><circle cx='108' cy='472' r='1.2'/>",
  '</g>',
  '</svg>',
].join('')

/** 等距投影地球贴图（2048x1024，横向无缝平铺）：湍流生成的有机陆块（梯田化多层）
 *  + 云层 + 多尺度半调网点（细/中/粗三层 + 陆块密度调制层）+ 经纬网 + 13 条加密等高线
 *  + 纵向波纹线（编织感）+ 数据刻度标记。client 的球面引擎按正交投影逐像素采样。 */
export const ART_EARTH_MAP = [
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2048 1024'>",
  '<defs>',
  "<filter id='land' x='-15%' y='-15%' width='130%' height='130%'>",
  "<feTurbulence type='fractalNoise' baseFrequency='0.0035 0.005' numOctaves='5' seed='3'/>",
  "<feColorMatrix type='saturate' values='0'/>",
  /* 梯田化 7 档阶梯（原 6 档）：更多地形台阶，海岸线层次更碎 */
  "<feComponentTransfer><feFuncA type='table' tableValues='0 0 0 1 .8 .55 .32'/></feComponentTransfer>",
  '</filter>',
  "<filter id='soft'><feGaussianBlur stdDeviation='2.5'/></filter>",
  "<filter id='cloud'><feTurbulence type='fractalNoise' baseFrequency='0.006 0.009' numOctaves='6' seed='7'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 0 0 .5 .22'/></feComponentTransfer></filter>",
  "<filter id='wisp'><feTurbulence type='fractalNoise' baseFrequency='0.025 0.035' numOctaves='4' seed='11'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 0 0 .28 .12'/></feComponentTransfer></filter>",
  "<filter id='d'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix type='saturate' values='0'/></filter>",
  /* 位移加强 60→85：等高线/波纹线更锯齿，地形感更野 */
  "<filter id='disloc'><feTurbulence type='fractalNoise' baseFrequency='0.008 0.02' numOctaves='2' seed='17' result='t'/><feDisplacementMap in='SourceGraphic' in2='t' scale='85' xChannelSelector='R' yChannelSelector='G'/></filter>",
  "<pattern id='h' width='4' height='4' patternUnits='userSpaceOnUse'><circle cx='1.2' cy='1.2' r='0.7' fill='rgba(236,236,236,.18)'/></pattern>",
  /* 多尺度网点（参考 PALIS 总目录屏：密度随明度走）——细粒底噪/粗疏暗区粒/陆块调制加密粒 */
  "<pattern id='h2' width='9' height='9' patternUnits='userSpaceOnUse'><circle cx='2' cy='2' r='1.1' fill='rgba(236,236,236,.1)'/></pattern>",
  "<pattern id='h3' width='3' height='3' patternUnits='userSpaceOnUse'><circle cx='.8' cy='.8' r='.45' fill='rgba(236,236,236,.07)'/></pattern>",
  "<pattern id='hm' width='5' height='5' patternUnits='userSpaceOnUse'><circle cx='1.4' cy='1.4' r='1' fill='rgba(236,236,236,.3)'/></pattern>",
  /* 陆块蒙版：陆块湍流的明度×阶梯 alpha 作 mask → 网点在陆地密、海洋疏 */
  "<mask id='ml' maskUnits='userSpaceOnUse' x='0' y='0' width='2048' height='1024'><rect x='0' y='0' width='2048' height='1024' filter='url(%23land)' fill='white'/></mask>",
  '</defs>',
  /* 有机陆块：阈值化湍流 → 碎片化"海岸线"，两层叠加 + 模糊软边，低对比 */
  "<rect x='0' y='0' width='2048' height='1024' filter='url(%23land)' opacity='.55'/>",
  "<g filter='url(%23soft)'><rect x='0' y='0' width='2048' height='1024' filter='url(%23land)' opacity='.26'/></g>",
  /* 等高线：位移后的水平波纹线（起止同 y，横向无缝）→ 地形等高感（加密为 13 条） */
  "<g stroke='rgba(226,236,246,.3)' stroke-width='1.2' fill='none' filter='url(%23disloc)'>",
  "<path d='M0,40 C256,18 512,62 768,40 S1280,18 1536,44 S1792,24 2048,40'/>",
  "<path d='M0,116 C256,94 512,138 768,116 S1280,94 1536,120 S1792,100 2048,116'/>",
  "<path d='M0,192 C256,170 512,214 768,192 S1280,170 1536,196 S1792,176 2048,192'/>",
  "<path d='M0,268 C256,246 512,290 768,268 S1280,246 1536,272 S1792,252 2048,268'/>",
  "<path d='M0,344 C256,322 512,366 768,344 S1280,322 1536,348 S1792,328 2048,344'/>",
  "<path d='M0,420 C256,398 512,442 768,420 S1280,398 1536,424 S1792,404 2048,420'/>",
  "<path d='M0,496 C256,474 512,518 768,496 S1280,474 1536,500 S1792,480 2048,496'/>",
  "<path d='M0,572 C256,550 512,594 768,572 S1280,550 1536,576 S1792,556 2048,572'/>",
  "<path d='M0,648 C256,626 512,670 768,648 S1280,626 1536,652 S1792,632 2048,648'/>",
  "<path d='M0,724 C256,702 512,746 768,724 S1280,702 1536,728 S1792,708 2048,724'/>",
  "<path d='M0,800 C256,778 512,822 768,800 S1280,778 1536,804 S1792,784 2048,800'/>",
  "<path d='M0,876 C256,854 512,898 768,876 S1280,854 1536,880 S1792,860 2048,876'/>",
  "<path d='M0,952 C256,930 512,974 768,952 S1280,930 1536,956 S1792,936 2048,952'/>",
  '</g>',
  /* 纵向波纹线：与等高线正交的"编织"第二方向（纵向线不跨横向接缝，天然无缝） */
  "<g stroke='rgba(226,236,246,.2)' stroke-width='1' fill='none' filter='url(%23disloc)'>",
  "<path d='M128,0 C112,128 144,256 128,384 S112,640 128,768 S144,896 128,1024'/>",
  "<path d='M384,0 C368,128 400,256 384,384 S368,640 384,768 S400,896 384,1024'/>",
  "<path d='M640,0 C624,128 656,256 640,384 S624,640 640,768 S656,896 640,1024'/>",
  "<path d='M896,0 C880,128 912,256 896,384 S880,640 896,768 S912,896 896,1024'/>",
  "<path d='M1152,0 C1136,128 1168,256 1152,384 S1136,640 1152,768 S1168,896 1152,1024'/>",
  "<path d='M1408,0 C1392,128 1424,256 1408,384 S1392,640 1408,768 S1424,896 1408,1024'/>",
  "<path d='M1664,0 C1648,128 1680,256 1664,384 S1648,640 1664,768 S1680,896 1664,1024'/>",
  "<path d='M1920,0 C1904,128 1936,256 1920,384 S1904,640 1920,768 S1936,896 1920,1024'/>",
  '</g>',
  /* 经纬网（几何基准） */
  "<g stroke='rgba(236,236,236,.12)' stroke-width='1'>",
  "<line x1='256' y1='0' x2='256' y2='1024'/><line x1='512' y1='0' x2='512' y2='1024'/>",
  "<line x1='768' y1='0' x2='768' y2='1024'/><line x1='1024' y1='0' x2='1024' y2='1024'/>",
  "<line x1='1280' y1='0' x2='1280' y2='1024'/><line x1='1536' y1='0' x2='1536' y2='1024'/>",
  "<line x1='1792' y1='0' x2='1792' y2='1024'/>",
  "<line x1='0' y1='256' x2='2048' y2='256'/><line x1='0' y1='512' x2='2048' y2='512'/>",
  "<line x1='0' y1='768' x2='2048' y2='768'/>",
  '</g>',
  /* 数据刻度：散布表面的测量十字 + 标记环（随球面卷曲旋转） */
  "<g stroke='rgba(226,236,246,.36)' stroke-width='1.2' fill='none'>",
  "<path d='M388,169 h14 M395,162 v14'/><path d='M753,293 h14 M760,286 v14'/>",
  "<path d='M1223,203 h14 M1230,196 v14'/><path d='M1533,463 h14 M1540,456 v14'/>",
  "<path d='M893,593 h14 M900,586 v14'/><path d='M293,693 h14 M300,686 v14'/>",
  "<path d='M1323,773 h14 M1330,766 v14'/><path d='M1803,613 h14 M1810,606 v14'/>",
  "<path d='M548,369 h14 M555,362 v14'/><path d='M1073,93 h14 M1080,86 v14'/>",
  "<path d='M1443,843 h14 M1450,836 v14'/><path d='M683,903 h14 M690,896 v14'/>",
  "<circle cx='1660' cy='400' r='5'/><circle cx='610' cy='470' r='4'/><circle cx='1080' cy='640' r='4'/>",
  '</g>',
  "<rect x='0' y='0' width='2048' height='1024' filter='url(%23cloud)' opacity='.3'/>",
  "<rect x='0' y='0' width='2048' height='1024' filter='url(%23wisp)' opacity='.16'/>",
  "<rect x='0' y='0' width='2048' height='1024' filter='url(%23d)' opacity='.15'/>",
  '<rect x=\'0\' y=\'0\' width=\'2048\' height=\'1024\' fill=\'url(%23h)\'/>',
  "<rect x='0' y='0' width='2048' height='1024' fill='url(%23h3)'/>",
  "<rect x='0' y='0' width='2048' height='1024' fill='url(%23h2)'/>",
  "<rect x='0' y='0' width='2048' height='1024' fill='url(%23hm)' mask='url(%23ml)'/>",
  '</svg>',
].join('')

/** 环形轨道图：同心虚线环 + 中心徽记（贴对话区/欢迎屏居中）。
 *  环上 8 个节点白点不在此绘制——由 client 声纳层的行星点接替（沿原半径公转）。 */
const ART_ORBIT = [
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 1000'>",
  "<g fill='none' stroke='rgba(236,236,236,.13)' stroke-width='1.5'>",
  "<circle cx='500' cy='500' r='430' stroke-dasharray='2 11'/>",
  "<circle cx='500' cy='500' r='348' stroke-dasharray='1 7'/>",
  "<circle cx='500' cy='500' r='264' stroke-dasharray='2 13'/>",
  '</g>',
  "<circle cx='500' cy='500' r='184' fill='none' stroke='rgba(43,95,217,.3)' stroke-width='1.5' stroke-dasharray='3 9'/>",
  "<circle cx='500' cy='500' r='96' fill='rgba(236,236,236,.018)' stroke='rgba(236,236,236,.1)' stroke-width='1.5'/>",
  "<circle cx='500' cy='500' r='30' fill='none' stroke='rgba(236,236,236,.3)' stroke-width='2'/>",
  "<circle cx='500' cy='500' r='10' fill='rgba(236,236,236,.34)'/>",
  '</svg>',
].join('')

/* ═══════════════════════════════════════════════════════════════════════
 * PALIS_CSS — 深度换肤层。门禁：html[data-palis-theme]。
 * 层次：① 令牌覆盖（静态色板 + 78 个别名）→ ② 全局铬（直角/等宽/滚动条/焦点）
 *      → ③ CRT 三层（噪点/扫描线/暗角）→ ④ 语义组件（消息标签/输入区/辉光）
 *      → ⑤ 开机自检覆盖层（.palis-boot-*）。
 * ═══════════════════════════════════════════════════════════════════════ */
export const PALIS_CSS = [
  /* ── ① 令牌：黑白高反差 + 系统蓝 + 警示红（覆盖 body 上与 body[data-ds-dark-theme] 上的两套）── */
  'html[data-palis-theme] body{',
  '--dsw-static-neutral-00:#f2f2f2;--dsw-static-neutral-50:#161616;--dsw-static-neutral-100:#1a1a1a;',
  '--dsw-static-neutral-150:#1f1f1f;--dsw-static-neutral-200:#242424;--dsw-static-neutral-250:#2a2a2a;',
  '--dsw-static-neutral-300:#333333;--dsw-static-neutral-400:#4a4a4a;--dsw-static-neutral-500:#606060;',
  '--dsw-static-neutral-550:#6e6e6e;--dsw-static-neutral-600:#7d7d7d;--dsw-static-neutral-700:#8f8f8f;',
  '--dsw-static-neutral-800:#acacac;--dsw-static-neutral-850:#c7c7c7;--dsw-static-neutral-900:#e1e1e1;',
  '--dsw-static-neutral-1000:#f5f5f5;',
  '--dsw-static-neutral-bluish-00:#f2f2f2;--dsw-static-neutral-bluish-50:#161616;--dsw-static-neutral-bluish-60:#181818;',
  '--dsw-static-neutral-bluish-75:#1c1c1c;--dsw-static-neutral-bluish-100:#1a1a1a;--dsw-static-neutral-bluish-150:#1f1f1f;',
  '--dsw-static-neutral-bluish-200:#242424;--dsw-static-neutral-bluish-250:#2a2a2a;--dsw-static-neutral-bluish-300:#333333;',
  '--dsw-static-neutral-bluish-400:#4a4a4a;--dsw-static-neutral-bluish-500:#606060;--dsw-static-neutral-bluish-600:#7d7d7d;',
  '--dsw-static-neutral-bluish-700:#8f8f8f;--dsw-static-neutral-bluish-750:#3a3a3a;--dsw-static-neutral-bluish-800:#2c2c2c;',
  '--dsw-static-neutral-bluish-850:#262626;--dsw-static-neutral-bluish-900:#121212;--dsw-static-neutral-bluish-950:#0e0e0e;',
  '--dsw-static-neutral-bluish-1000:#0a0a0a;',
  '--dsw-static-blue-400:#6f9cff;--dsw-static-blue-450:#4f80f5;--dsw-static-blue-500:#2b5fd9;--dsw-static-blue-600:#2450b8;',
  '--dsw-static-blue-800:#1c3f8f;--dsw-static-blue-900:#16336f;--dsw-static-blue-950:#122a5c;',
  '--dsw-static-deepseek-400:#5b8cff;--dsw-static-deepseek-450:#4f80f5;--dsw-static-deepseek-500:#2b5fd9;',
  '--dsw-static-deepseek-600:#2450b8;--dsw-static-deepseek-700-delete:#1c3f8f;--dsw-static-deepseek-800:#183562;--dsw-static-deepseek-900:#142b4d;',
  '--dsw-static-red-50:#1c0f0e;--dsw-static-red-100:#241110;--dsw-static-red-400:#e05548;--dsw-static-red-500:#c8322b;',
  '--dsw-static-red-600:#a82821;--dsw-static-red-900:#3a0f0c;',
  '--dsw-static-amber-400:#c8322b;--dsw-static-amber-500:#c8322b;--dsw-static-amber-600:#a82821;--dsw-static-amber-900:#2c1310;',
  '--dsw-static-green-400:#9fb4c9;--dsw-static-green-500:#8aa0b8;--dsw-static-green-900:#1a222b;',
  /* aliases */
  '--dsw-alias-bg-base:#0a0a0a;--dsw-alias-bg-layer-1:#101010;--dsw-alias-bg-layer-2:#151515;--dsw-alias-bg-layer-3:#1b1b1b;',
  '--dsw-alias-bg-overlay:#0d0d0d;--dsw-alias-bg-module-platform:#101010;--dsw-alias-bg-multi-select:#151515;',
  '--dsw-alias-bg-skeleton:rgba(236,236,236,.06);',
  '--dsw-alias-bg-mask-1:rgba(0,0,0,.5);--dsw-alias-bg-mask-2:rgba(0,0,0,.35);--dsw-alias-bg-mask-3:rgba(0,0,0,.72);',
  '--dsw-alias-bg-mask-photo:rgba(0,0,0,.85);--dsw-alias-bg-mask-drop:rgba(236,236,236,.08);',
  '--dsw-alias-border-inverted:#0a0a0a;--dsw-alias-border-inverted2:#0a0a0a;',
  '--dsw-alias-border-l1:rgba(236,236,236,.12);--dsw-alias-border-l2:rgba(236,236,236,.22);',
  '--dsw-alias-border-l2-darkmode-thin:rgba(236,236,236,.10);--dsw-alias-border-l3:rgba(236,236,236,.36);--dsw-alias-border-l4:rgba(236,236,236,.55);',
  '--dsw-alias-brand-primary:#2b5fd9;--dsw-alias-brand-primary-invert:#0a0a0a;',
  '--dsw-alias-brand-primary-new-colorprimary-new-color:#2b5fd9;--dsw-alias-brand-text:#0a0a0a;',
  '--dsw-alias-label-primary:#ececec;--dsw-alias-label-primary-bluish:#ececec;--dsw-alias-label-primary-dimmed:#c6c6c6;',
  '--dsw-alias-label-primary-foreground:#0a0a0a;--dsw-alias-label-primary-inverted:#0a0a0a;',
  '--dsw-alias-label-secondary:#9c9c9c;--dsw-alias-label-tertiary:#767676;--dsw-alias-label-caption:#5c5c5c;--dsw-alias-label-dimmed:#4a4a4a;',
  '--dsw-alias-button-contrast-fill:#161616;--dsw-alias-button-elevated-fill:#141414;--dsw-alias-button-floating-fill:#0e0e0e;',
  '--dsw-alias-button-floating-hover:#1a1a1a;--dsw-alias-button-ghost-active-border:rgba(43,95,217,.65);',
  '--dsw-alias-button-ghost-active-fill:rgba(43,95,217,.22);--dsw-alias-button-ghost-active-hover:rgba(43,95,217,.3);',
  '--dsw-alias-button-info-fill:rgba(43,95,217,.2);--dsw-alias-button-info-hover:rgba(43,95,217,.3);',
  '--dsw-alias-button-primary-dimmed:#b8b8b8;--dsw-alias-button-primary-fill:#e8e8e8;--dsw-alias-button-primary-hover:#f7f7f7;',
  '--dsw-alias-button-tool-bar-fill:#121212;--dsw-alias-button-tool-bar-fill-invisible:transparent;--dsw-alias-button-tool-bar-hover:rgba(236,236,236,.08);',
  '--dsw-alias-interactive-bg-active:rgba(43,95,217,.32);--dsw-alias-interactive-bg-hover:rgba(236,236,236,.07);',
  '--dsw-alias-interactive-bg-hover-accent:rgba(43,95,217,.24);--dsw-alias-interactive-bg-hover-danger:rgba(200,50,43,.2);',
  '--dsw-alias-interactive-bg-hover-solid:rgba(236,236,236,.12);',
  '--dsw-alias-markdown-citation:#101010;--dsw-alias-markdown-code-block:#101010;--dsw-alias-markdown-code-block-banner:#171717;',
  '--dsw-alias-markdown-code-segment-selected:#2a2a2a;--dsw-alias-markdown-code-segment-unselected:#181818;',
  '--dsw-alias-markdown-inline-code:#1d1d1d;--dsw-alias-markdown-placeholder:rgba(236,236,236,.06);--dsw-alias-markdown-tag:rgba(236,236,236,.08);',
  '--dsw-alias-scrollbar-bg-l1:#2a2a2a;--dsw-alias-scrollbar-bg-l2:#333333;--dsw-alias-scrollbar-hover-l1:#464646;--dsw-alias-scrollbar-hover-l2:#5a5a5a;',
  '--dsw-alias-state-business-primary:#2b5fd9;--dsw-alias-state-business-tertiary:rgba(43,95,217,.16);',
  '--dsw-alias-state-error-primary:#e05548;--dsw-alias-state-error-secondary:rgba(200,50,43,.16);',
  '--dsw-alias-state-success-primary:#9fb4c9;--dsw-alias-state-success-secondary:rgba(159,180,201,.14);--dsw-alias-state-success-tertiary:rgba(159,180,201,.07);',
  '--dsw-alias-state-warn-label:#e8a89f;--dsw-alias-state-warn-primary:#c8322b;--dsw-alias-state-warn-secondary:rgba(200,50,43,.12);',
  '--dsw-alias-state-warn-tertiary:rgba(200,50,43,.07);',
  '--dsw-alias-toast-bg:#101010;--dsw-alias-tooltip-bg:#161616;',
  '--dsw-specific-sidebar-fill:#0c0c0c;',
  '--dsh-scrollbar-thumb:#333333;--dsh-scrollbar-thumb-hover:#4a4a4a;',
  /* PALIS 私有令牌 */
  '--palis-font-mono:"JetBrains Mono","IBM Plex Mono","Cascadia Mono",Consolas,"Courier New",monospace;',
  '--palis-accent:#2b5fd9;--palis-accent-soft:rgba(43,95,217,.22);--palis-red:#c8322b;',
  '--palis-fg:#ececec;--palis-fg-dim:#9c9c9c;--palis-fg-faint:#5c5c5c;',
  '--palis-border:rgba(236,236,236,.22);',
  '}',

  /* 强度档位（扫描线/噪点/暗角 alpha——默认档位整体调低，条纹不再密集刺眼） */
  'html[data-palis-theme][data-palis-intensity="low"]{--palis-scan-alpha:.015;--palis-noise-alpha:.012;--palis-vignette-alpha:.14}',
  'html[data-palis-theme][data-palis-intensity="mid"]{--palis-scan-alpha:.028;--palis-noise-alpha:.022;--palis-vignette-alpha:.22}',
  'html[data-palis-theme][data-palis-intensity="high"]{--palis-scan-alpha:.045;--palis-noise-alpha:.035;--palis-vignette-alpha:.34}',

  /* ── ①b 动效节奏：终端气质的快起稳落（快攻缓收）。左右侧栏滑动、面板挤压、
     控件变色全挂内核这组令牌——一处覆盖全局同步，衔接自然一致；
     prefers-reduced-motion 分支在内核/插件侧照旧生效（它们杀的是 transition 本身）── */
  'html[data-palis-theme]{',
  '--ds-transition-duration:.16s;--ds-transition-duration-fast:.08s;--ds-transition-duration-slow:.24s;',
  '--ds-ease-in-out:cubic-bezier(.3,.85,.25,1);',
  '}',

  /* ── ② 全局铬 ── */
  'html[data-palis-theme][data-palis-square="on"] *,',
  'html[data-palis-theme][data-palis-square="on"] *::before,',
  'html[data-palis-theme][data-palis-square="on"] *::after{border-radius:0 !important}',
  'html[data-palis-theme][data-palis-mono="on"] body,',
  'html[data-palis-theme][data-palis-mono="on"] body button,',
  'html[data-palis-theme][data-palis-mono="on"] body input,',
  'html[data-palis-theme][data-palis-mono="on"] body textarea,',
  'html[data-palis-theme][data-palis-mono="on"] body select{font-family:var(--palis-font-mono) !important}',
  'html[data-palis-theme] ::selection{background:#2b5fd9;color:#0a0a0a}',
  'html[data-palis-theme] *{scrollbar-width:thin;scrollbar-color:#333333 #0a0a0a}',
  'html[data-palis-theme] ::-webkit-scrollbar{width:10px;height:10px}',
  'html[data-palis-theme] ::-webkit-scrollbar-track{background:#0a0a0a}',
  'html[data-palis-theme] ::-webkit-scrollbar-thumb{background:#333333;border:1px solid #0a0a0a;border-radius:0}',
  'html[data-palis-theme] ::-webkit-scrollbar-thumb:hover{background:#4a4a4a}',
  'html[data-palis-theme] :focus-visible{outline:1px solid var(--palis-accent) !important;outline-offset:-1px}',

  /* ── ③ CRT 质感：噪点(html::before) / 扫描线+慢速扫描带(html::after) / 暗角(body::after) / 边框罩(body::before) ── */
  'html[data-palis-theme][data-palis-noise="on"]::before{',
  'content:"";position:fixed;inset:0;z-index:2147482000;pointer-events:none;',
  'background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'140\' height=\'140\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'2\' stitchTiles=\'stitch\'/><feColorMatrix type=\'saturate\' values=\'0\'/></filter><rect width=\'140\' height=\'140\' filter=\'url(%23n)\'/></svg>");',
  'opacity:var(--palis-noise-alpha);',
  '}',
  /* 扫描线：4px 周期细线（低透明度）+ 一条 11s 慢速下扫的 CRT 刷新带 */
  'html[data-palis-theme][data-palis-scan="on"]::after{',
  'content:"";position:fixed;inset:0;z-index:2147482000;pointer-events:none;',
  'background-image:repeating-linear-gradient(0deg,rgba(255,255,255,var(--palis-scan-alpha)) 0 1px,transparent 1px 4px),linear-gradient(180deg,transparent 0%,rgba(255,255,255,.026) 46%,rgba(255,255,255,.026) 54%,transparent 100%);',
  'background-size:100% 100%,100% 240%;background-position:0 0,0 -240%;',
  'animation:palis-crt-sweep 11s linear infinite;',
  '}',
  '@keyframes palis-crt-sweep{from{background-position:0 0,0 -240%}to{background-position:0 0,0 140%}}',
  'html[data-palis-theme][data-palis-vignette="on"] body::after{',
  'content:"";position:fixed;inset:0;z-index:2147482000;pointer-events:none;',
  'background:radial-gradient(ellipse 92% 84% at 50% 46%,transparent 55%,rgba(0,0,0,var(--palis-vignette-alpha)) 100%);',
  '}',
  /* CRT 边框罩：屏幕内沿压暗 + 细边框（增强"设备"感） */
  'html[data-palis-theme] body::before{',
  'content:"";position:fixed;inset:0;z-index:2147481000;pointer-events:none;',
  'border:1px solid rgba(236,236,236,.08);',
  'box-shadow:inset 0 0 90px rgba(0,0,0,.5),inset 0 0 3px rgba(43,95,217,.14);',
  '}',

  /* ── ④ 语义组件 ── */
  /* 对话区：点阵网格背景（终端纹理） */
  'html[data-palis-theme] [data-chat-flow]{',
  'background-image:radial-gradient(rgba(236,236,236,.03) 1px,transparent 1px);background-size:22px 22px;',
  '}',
  /* 背景图形（对话区/欢迎屏通用）：星尘 + 轨道环 + 点阵网格贴在滚动体上（滚动时静止）；
     数据天体为 client 注入的 DOM 层（.palis-globe，负 z-index 压在内容之下） */
  'html[data-palis-theme] [data-conversation-scroll]{position:relative;z-index:0}',
  'html[data-palis-theme] [data-phase]{position:relative;z-index:0}',
  'html[data-palis-theme][data-palis-artwork="on"] [data-conversation-scroll]{',
  'background-image:url("data:image/svg+xml;utf8,' + ART_STARS + '"),url("data:image/svg+xml;utf8,' + ART_ORBIT + '"),radial-gradient(rgba(236,236,236,.03) 1px,transparent 1px);',
  'background-size:340px auto,70% auto,22px 22px;',
  'background-position:0 0,50% 58%,0 0;',
  'background-repeat:repeat,no-repeat,repeat;',
  '}',
  /* 消息轨道：assistant 蓝轨 + tool 灰轨（左轨 + 渐变底） */
  'html[data-palis-theme] [data-chat-flow-key][data-chat-flow-kind="assistant-step"]{',
  'border-left:2px solid rgba(43,95,217,.5);padding-left:10px;margin-left:-2px;',
  'background:linear-gradient(90deg,rgba(43,95,217,.05),transparent 42%);',
  '}',
  'html[data-palis-theme] [data-chat-flow-key][data-chat-flow-kind="tool-call"]{',
  'border-left:2px solid rgba(236,236,236,.1);padding-left:10px;margin-left:-2px;',
  '}',
  /* 消息角色标签（本内核 conversation 视图实际渲染的 kind：assistant-step / tool-call；
     保留 user/steering/context/command/agent/assistant 选择器以兼容内核后续版本） */
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind]::before,',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="user"]::before,',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="steering"]::before,',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="context"]::before,',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="command"]::before,',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="agent"]::before,',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="assistant"]::before,',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="assistant-step"]::before,',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="tool-call"]::before{',
  'display:block;font-size:10px;font-weight:500;letter-spacing:.22em;margin-bottom:3px;',
  '}',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="assistant-step"]::before,',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="agent"]::before,',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="assistant"]::before{content:"[CLERK]";color:var(--palis-fg-dim)}',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="tool-call"]::before{content:"[TOOL]";color:var(--palis-fg-faint)}',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="user"]::before{content:"[USER]";color:var(--palis-accent)}',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="steering"]::before{content:"[STEER]";color:var(--palis-accent)}',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="context"]::before{content:"[CONTEXT]";color:var(--palis-fg-faint)}',
  'html[data-palis-theme][data-palis-labels="on"] [data-chat-flow-key][data-chat-flow-kind="command"]::before{content:"[CMD]";color:var(--palis-red)}',
  /* 输入区：终端窗口化（顶蓝条 + 渐变底 + text-fill 修复——内核用渐变文字，fill 必须覆盖） */
  'html[data-palis-theme] [data-composer-card]{',
  'background:linear-gradient(180deg,rgba(43,95,217,.045),transparent 90px),#0d0d0d;',
  'border:1px solid var(--palis-border);border-top:2px solid var(--palis-accent);',
  '}',
  'html[data-palis-theme] [data-input-backdrop]{background:#0a0a0a}',
  'html[data-palis-theme] [data-composer-seat] textarea{',
  'background:#0a0a0a;color:var(--palis-fg);-webkit-text-fill-color:var(--palis-fg);',
  'caret-color:var(--palis-fg);border:1px solid #2e2e2e !important;font-family:inherit;',
  '}',
  'html[data-palis-theme] [data-composer-seat] textarea::placeholder{color:var(--palis-fg-faint);-webkit-text-fill-color:var(--palis-fg-faint)}',
  'html[data-palis-theme] [data-composer-seat] textarea:focus{border-color:var(--palis-accent) !important;box-shadow:none}',
  'html[data-palis-theme] [data-input-mirror],html[data-palis-theme] [data-input-scroll]{background:transparent;color:var(--palis-fg);-webkit-text-fill-color:var(--palis-fg)}',
  /* 声线波动条画布（client 注入于 [data-composer-card] 顶边；静默时清空，顶蓝边即静止基线。
     canvas 是替换元素：left+right 拉伸对它无效，必须显式 width 盖过固有尺寸） */
  '.palis-wave{position:absolute;left:-1px;top:-10px;width:calc(100% + 2px);height:18px;pointer-events:none;z-index:6}',
  /* 声纳扩散 + 轨道旋转（client 注入 .palis-sonar，对位轨道图中心；与声线波动条共用
     [data-streaming] 活动门——html[data-palis-activity]）。
     <i>×3 = ping 扩散环（transform:scale 展开，GPU 友好，--pk 峰值分两态；
     JS 按 max(760px, 1.1·S) 定径，超宽屏也保证越过最外轨道环）；<b> = 中心蓝点呼吸。
     <s>×6 = 与各轨道环同径的旋转虚线环：mask 出虚线圆盖在静态环上 = 原环转了起来，
     厚度/虚线节奏按各环 SVG 参数折算；角度由 JS 逐帧驱动（不规律顺/逆时针交替），CSS 不背 animation。
     <u>×9 = 行星节点：接替 ART_ORBIT 抠掉的 8 个静态白点沿原半径公转（内快外慢），
     另加 1 颗 accent 卫星巡蓝环——位置也全由 JS 写。 */
  '.palis-sonar{position:absolute;width:0;height:0;pointer-events:none;z-index:-1}',
  '.palis-sonar i{position:absolute;left:0;top:0;width:760px;height:760px;margin:-380px 0 0 -380px;',
  'border:1px solid rgba(79,128,245,.7);border-radius:50%;transform:scale(.05);opacity:0;',
  'box-shadow:0 0 30px rgba(43,95,217,.3);',
  '--pk:.58;animation:palis-sonar-ping 6.4s cubic-bezier(.17,.67,.35,1) infinite}',
  '.palis-sonar i:nth-child(2){animation-delay:2.13s}',
  '.palis-sonar i:nth-child(3){animation-delay:4.27s}',
  'html[data-palis-activity="on"] .palis-sonar i{--pk:.95;border-color:rgba(79,128,245,.95);animation-duration:2.3s}',
  'html[data-palis-activity="on"] .palis-sonar i:nth-child(2){animation-delay:.77s}',
  'html[data-palis-activity="on"] .palis-sonar i:nth-child(3){animation-delay:1.53s}',
  /* 直角模式豁免：声纳环/中心点/行星必须保持圆形（全局 border-radius:0 !important 会切方） */
  'html[data-palis-theme][data-palis-square="on"] .palis-sonar i,',
  'html[data-palis-theme][data-palis-square="on"] .palis-sonar b,',
  'html[data-palis-theme][data-palis-square="on"] .palis-sonar u{border-radius:50% !important}',
  '.palis-sonar b{position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:50%;',
  'background:var(--palis-accent);opacity:.5;transition:opacity .4s;',
  'animation:palis-sonar-core 3.4s ease-in-out infinite alternate}',
  'html[data-palis-activity="on"] .palis-sonar b{opacity:.95;animation-duration:1.1s}',
  /* 旋转虚线环公共样式：JS 每帧覆写 transform（translate(-50%,-50%) rotate(θ)），这里只给基态 */
  '.palis-sonar s{position:absolute;left:0;top:0;display:block;transform:translate(-50%,-50%);',
  'background:var(--palis-accent);opacity:.6;transition:opacity .4s;',
  '-webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'47\' fill=\'none\' stroke=\'black\' stroke-width=\'.38\' stroke-dasharray=\'1.54 1.54\'/></svg>") center/100% 100% no-repeat;',
  'mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'47\' fill=\'none\' stroke=\'black\' stroke-width=\'.38\' stroke-dasharray=\'1.54 1.54\'/></svg>") center/100% 100% no-repeat}',
  'html[data-palis-activity="on"] .palis-sonar s{opacity:.95}',
  /* 灰环：与静态环同径同虚线节奏（g2≈111 段/g3≈273 段），g0/g1 是实线环改的旋转刻度盘 */
  '.palis-sonar s.g0{background:#ececec;opacity:.5;',
  '-webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'47\' fill=\'none\' stroke=\'black\' stroke-width=\'3.13\' stroke-dasharray=\'14.77 14.77\'/></svg>") center/100% 100% no-repeat;',
  'mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'47\' fill=\'none\' stroke=\'black\' stroke-width=\'3.13\' stroke-dasharray=\'14.77 14.77\'/></svg>") center/100% 100% no-repeat}',
  '.palis-sonar s.g1{background:#ececec;opacity:.42;',
  '-webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'47\' fill=\'none\' stroke=\'black\' stroke-width=\'.73\' stroke-dasharray=\'3 3.15\'/></svg>") center/100% 100% no-repeat;',
  'mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'47\' fill=\'none\' stroke=\'black\' stroke-width=\'.73\' stroke-dasharray=\'3 3.15\'/></svg>") center/100% 100% no-repeat}',
  '.palis-sonar s.g2{background:#ececec;opacity:.4;',
  '-webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'47\' fill=\'none\' stroke=\'black\' stroke-width=\'.267\' stroke-dasharray=\'.355 2.306\'/></svg>") center/100% 100% no-repeat;',
  'mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'47\' fill=\'none\' stroke=\'black\' stroke-width=\'.267\' stroke-dasharray=\'.355 2.306\'/></svg>") center/100% 100% no-repeat}',
  '.palis-sonar s.g3{background:#ececec;opacity:.38;',
  '-webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'47\' fill=\'none\' stroke=\'black\' stroke-width=\'.203\' stroke-dasharray=\'.135 .946\'/></svg>") center/100% 100% no-repeat;',
  'mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'47\' fill=\'none\' stroke=\'black\' stroke-width=\'.203\' stroke-dasharray=\'.135 .946\'/></svg>") center/100% 100% no-repeat}',
  'html[data-palis-activity="on"] .palis-sonar s.g0{opacity:.78}',
  'html[data-palis-activity="on"] .palis-sonar s.g1{opacity:.68}',
  'html[data-palis-activity="on"] .palis-sonar s.g2{opacity:.62}',
  'html[data-palis-activity="on"] .palis-sonar s.g3{opacity:.58}',
  '.palis-sonar s.g4{background:#ececec;opacity:.36;',
  '-webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'47\' fill=\'none\' stroke=\'black\' stroke-width=\'.164\' stroke-dasharray=\'.218 1.201\'/></svg>") center/100% 100% no-repeat;',
  'mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'47\' fill=\'none\' stroke=\'black\' stroke-width=\'.164\' stroke-dasharray=\'.218 1.201\'/></svg>") center/100% 100% no-repeat}',
  'html[data-palis-activity="on"] .palis-sonar s.g4{opacity:.55}',
  /* 行星节点：JS 逐帧写 transform 沿轨道公转；.d=对角小点带，.a=蓝环 accent 卫星 */
  '.palis-sonar u{position:absolute;left:0;top:0;width:6px;height:6px;border-radius:50%;',
  'background:rgba(236,236,236,.65);box-shadow:0 0 8px rgba(236,236,236,.42);opacity:.92;transition:opacity .4s}',
  '.palis-sonar u.d{width:4.5px;height:4.5px;background:rgba(236,236,236,.55)}',
  '.palis-sonar u.a{background:var(--palis-accent);box-shadow:0 0 10px rgba(43,95,217,.7)}',
  'html[data-palis-activity="on"] .palis-sonar u{opacity:1}',
  '@keyframes palis-sonar-ping{0%{transform:scale(.05);opacity:0}9%{opacity:var(--pk)}62%{opacity:calc(var(--pk) * .4)}100%{transform:scale(1);opacity:0}}',
  '@keyframes palis-sonar-core{from{transform:scale(.8)}to{transform:scale(1.35)}}',
  /* 会话顶部（hero）→ Win95 标题条 */
  'html[data-palis-theme] [data-slot="conversation.hero.agentPreset"] > *{',
  'background:linear-gradient(180deg,#1c1c1c,#101010);border-bottom:1px solid var(--palis-border);',
  '}',
  /* 辉光（标题与品牌文字） */
  'html[data-palis-theme][data-palis-glow="on"] h1,',
  'html[data-palis-theme][data-palis-glow="on"] h2,',
  'html[data-palis-theme][data-palis-glow="on"] h3{text-shadow:0 0 10px rgba(43,95,217,.5)}',

  /* ── 数据天体（client 注入 DOM 层）：球 = canvas 正交投影 + 双线性采样，
     无光照无辉光、固定曝光压暗——质感全部来自构成元素（等高线/经纬网/网点/数据刻度/表面粒子）。
     外包 HUD 几何层（细实线环/十字准线/live 代码读数）。
     球体之下另有卫星轨道环（掠过球盘的弧段被遮蔽）── */
  '.palis-globe{position:absolute;right:-560px;top:50%;width:1100px;height:1100px;',
  'transform:translateY(-50%);pointer-events:none;z-index:-1}',
  '.palis-globe-sphere{position:absolute;inset:100px;border-radius:50%;overflow:hidden;',
  'border:1px solid rgba(236,236,236,.12);',
  'box-shadow:inset 0 0 60px rgba(0,0,0,.35),0 0 90px rgba(43,95,217,.05)}',
  '.palis-globe-canvas{position:absolute;inset:0;width:100%;height:100%}',
  /* 遮光层只留印刷质感的轻渐变（无光照可算，纯做影调收边） */
  '.palis-globe-shade{position:absolute;inset:0;',
  'background:radial-gradient(circle at 50% 6%,rgba(255,255,255,.07),transparent 14%),',
  'linear-gradient(180deg,rgba(0,0,0,.16),rgba(0,0,0,.05) 34%,rgba(0,0,0,.2) 78%)}',
  '.palis-globe-dither{position:absolute;inset:0;opacity:.07;',
  'background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'140\' height=\'140\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\'/><feColorMatrix type=\'saturate\' values=\'0\'/></filter><rect width=\'140\' height=\'140\' filter=\'url(%23n)\'/></svg>")}',
  '.palis-globe-dust{position:absolute;inset:0;opacity:.6;animation:palis-dust-tw 7s ease-in-out infinite}',
  '.palis-globe-dust.d2{animation-duration:9.7s;animation-delay:-3.2s}',
  '.palis-globe-dust.d3{animation-duration:5.3s;animation-delay:-1.6s}',
  '@keyframes palis-dust-tw{0%,100%{opacity:.4}50%{opacity:.66}}',
  /* HUD 几何层（未裁切；细实线环，无放射刻度） */
  /* 直角模式豁免：天体与其 HUD 环是具象图形而非 UI 铬件，必须保持圆形（同声纳环先例） */
  'html[data-palis-theme][data-palis-square="on"] .palis-globe-sphere,',
  'html[data-palis-theme][data-palis-square="on"] .palis-globe-r1,',
  'html[data-palis-theme][data-palis-square="on"] .palis-globe-r2{border-radius:50% !important}',
  '.palis-globe-r1{position:absolute;inset:36px;border:1px solid rgba(236,236,236,.10);border-radius:50%}',
  '.palis-globe-r2{position:absolute;inset:10px;border:1px solid rgba(236,236,236,.06);border-radius:50%}',
  '.palis-globe-hline{position:absolute;left:6%;right:26%;top:46%;height:1px;',
  'background:linear-gradient(90deg,transparent,rgba(236,236,236,.12) 15% 85%,transparent)}',
  '.palis-globe-vline{position:absolute;top:8%;bottom:12%;left:30%;width:1px;',
  'background:linear-gradient(180deg,transparent,rgba(236,236,236,.10) 15% 85%,transparent)}',
  '.palis-globe-cross{position:absolute;left:30%;top:46%;width:5px;height:5px;',
  'border:1px solid rgba(43,95,217,.6);transform:translate(-50%,-50%)}',
  /* 卫星轨道层（与球呼应）：贴 r1 环半径的倾斜虚线轨道——inset:30 盒 1040px，
     mask 圆半径 49.42% 使展开半径恰为 514（=SAT_ORBIT_A）；JS 写 rotate(ψ) scaleY(.45)
     做轨道面进动。卫星点公转/遮挡透明度全由 JS 逐帧覆写（不背 transition） */
  '.palis-globe-orbit{position:absolute;inset:30px;background:rgba(236,236,236,.34);opacity:.52;',
  'transition:opacity .4s;',
  '-webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'49.42\' fill=\'none\' stroke=\'black\' stroke-width=\'.125\' stroke-dasharray=\'1.2 3.4\'/></svg>") center/100% 100% no-repeat;',
  'mask:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><circle cx=\'50\' cy=\'50\' r=\'49.42\' fill=\'none\' stroke=\'black\' stroke-width=\'.125\' stroke-dasharray=\'1.2 3.4\'/></svg>") center/100% 100% no-repeat}',
  'html[data-palis-activity="on"] .palis-globe-orbit{opacity:.78}',
  '.palis-globe-sat{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;',
  'border-radius:50%;background:var(--palis-accent);opacity:0;',
  'box-shadow:0 0 10px rgba(43,95,217,.75),0 0 3px rgba(127,168,255,.9)}',
  'html[data-palis-theme][data-palis-square="on"] .palis-globe-sat{border-radius:50% !important}',
  /* 代码读数（live，由 globe 引擎 500ms 节流覆写；外观沿用原 ::before/::after 的样式） */
  '.palis-globe-ro{position:absolute;margin:0;font-family:var(--palis-font-mono,monospace);font-size:9px;',
  'line-height:2;letter-spacing:.22em;color:rgba(168,168,168,.5);white-space:pre;pointer-events:none}',
  '.palis-globe-ro1{top:7%;left:5%}',
  '.palis-globe-ro2{bottom:9%;left:4%;letter-spacing:.2em;color:rgba(96,96,96,.55)}',
  'html[data-palis-artwork="off"] .palis-globe{display:none!important}',
  'html:not([data-palis-theme]) .palis-globe{display:none!important}',
  /* 欢迎屏（hero 态）：天体右移更多，只露左弧 */
  '[data-phase="hero"] .palis-globe{right:-660px;top:50%}',

  /* ── ⑤ 开机自检覆盖层 ── */
  '.palis-boot{position:fixed;inset:0;z-index:2147484000;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#050505;color:#e8e8e8;font-family:var(--palis-font-mono,monospace);opacity:1;transition:opacity .45s ease}',
  '.palis-boot.off{opacity:0;pointer-events:none}',
  '.palis-boot .pb-title{font-size:30px;letter-spacing:.4em;font-weight:600;color:#ececec;margin:0;text-shadow:0 0 18px rgba(43,95,217,.4)}',
  '.palis-boot .pb-sub{margin-top:14px;font-size:12px;letter-spacing:.3em;color:#8f8f8f}',
  '.palis-boot .pb-sub b{color:#2b5fd9;font-weight:400}',
  '.palis-boot .pb-bar{width:300px;height:2px;margin-top:26px;background:#1d1d1d;overflow:hidden;position:relative}',
  '.palis-boot .pb-bar i{display:block;position:absolute;inset:0;background:#2b5fd9;transform:scaleX(0);transform-origin:left;animation:palis-boot-bar 1.5s steps(30) forwards}',
  '.palis-boot .pb-lines{margin-top:22px;width:340px;min-height:120px;font-size:11px;line-height:1.95;letter-spacing:.14em;color:#5c5c5c}',
  '.palis-boot .pb-lines span{display:block;opacity:0;animation:palis-boot-line .18s steps(2) forwards}',
  '.palis-boot .pb-lines .ok{color:#9fb4c9}',
  '.palis-boot .pb-lines .accent{color:#6f9cff}',
  '@keyframes palis-boot-bar{to{transform:scaleX(1)}}',
  '@keyframes palis-boot-line{to{opacity:1}}',
].join('\n')

/* ═══════════════════════════════════════════════════════════════════════
 * PANEL_CSS — 设置页面板 + 浮动快捷开关（与主题开关无关，始终注入）。
 * 面板自身就是 PALIS 审美：Win95 式窗口标题栏 + 终端控制台。
 * ═══════════════════════════════════════════════════════════════════════ */
export const PANEL_CSS = [
  '.ptp-page{max-width:760px;padding:4px 2px;font-family:var(--palis-font-mono,"JetBrains Mono",Consolas,monospace);color:#e8e8e8}',
  '.ptp-console{border:1px solid #2c2c2c;background:#0a0a0a;box-shadow:0 0 0 1px #000}',
  '.ptp-titlebar{display:flex;align-items:center;gap:8px;padding:7px 10px;background:linear-gradient(180deg,#1b1b1b,#101010);border-bottom:1px solid #2c2c2c;font-size:11px;letter-spacing:.24em;color:#9c9c9c}',
  '.ptp-titlebar b{color:#ececec;font-weight:600}',
  '.ptp-titlebar .ptp-min{width:10px;height:10px;border:1px solid #444;display:inline-block;flex:none}',
  '.ptp-titlebar .ptp-min.red{border-color:#7a2b26;background:#c8322b}',
  '.ptp-titlebar .ptp-min.blue{border-color:#1c3f8f;background:#2b5fd9}',
  '.ptp-body{padding:14px 14px 10px}',
  '.ptp-status{display:flex;gap:10px;align-items:center;font-size:11px;letter-spacing:.14em;color:#5c5c5c;margin-bottom:12px}',
  '.ptp-dot{width:8px;height:8px;border-radius:50%;background:#c8322b;box-shadow:0 0 6px rgba(200,50,43,.8);flex:none}',
  '.ptp-dot.on{background:#2b5fd9;box-shadow:0 0 8px rgba(43,95,217,.9)}',
  '.ptp-power{display:flex;align-items:center;gap:10px;border:1px solid #333;background:#0d0d0d;padding:10px 12px;margin-bottom:14px;cursor:pointer;width:100%;color:#e8e8e8;font-family:inherit;font-size:12px}',
  '.ptp-power:hover{border-color:#2b5fd9}',
  '.ptp-power .ptp-key{font-size:10px;letter-spacing:.2em;color:#2b5fd9}',
  '.ptp-power .ptp-val{font-size:12px;letter-spacing:.18em;margin-left:auto;color:#5c5c5c}',
  '.ptp-power.on .ptp-val{color:#2b5fd9}',
  '.ptp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
  '.ptp-cell{border:1px solid #242424;background:#0d0d0d;padding:10px 12px}',
  /* 三个 cell 两列会留右下空洞：STYLE 通栏，其 toggles 也得以三列排开 */
  '.ptp-cell-wide{grid-column:1/-1}',
  '.ptp-cell .ptp-cap{font-size:10px;letter-spacing:.22em;color:#5c5c5c;margin-bottom:8px}',
  '.ptp-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
  '.ptp-seg{display:flex;border:1px solid #2c2c2c}',
  '.ptp-seg button{background:transparent;border:none;border-right:1px solid #2c2c2c;color:#8f8f8f;padding:5px 12px;font-size:11px;letter-spacing:.12em;cursor:pointer;font-family:inherit}',
  '.ptp-seg button:last-child{border-right:none}',
  '.ptp-seg button.sel{background:#2b5fd9;color:#0a0a0a}',
  '.ptp-seg button:hover:not(.sel){background:#161616}',
  /* 设置页 main 列可能很窄（实测 564px）：minmax 自适应减列，nowrap 防断字折行 */
  '.ptp-toggles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:2px 14px}',
  '.ptp-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;padding:3px 0;user-select:none;font-size:11px;letter-spacing:.08em;color:#b8b8b8;white-space:nowrap}',
  '.ptp-toggle:hover{color:#ececec}',
  '.ptp-toggle input{appearance:none;-webkit-appearance:none;width:26px;height:13px;border:1px solid #3a3a3a;background:#111;position:relative;cursor:pointer;flex:none;margin:0}',
  '.ptp-toggle input::after{content:"";position:absolute;top:1px;left:1px;width:9px;height:9px;background:#5c5c5c;transition:left .12s steps(2)}',
  '.ptp-toggle input:checked{background:#122a5c;border-color:#2b5fd9}',
  '.ptp-toggle input:checked::after{left:14px;background:#6f9cff}',
  /* 聚焦框收入主题语言：鼠标点击不留白框，键盘聚焦给主题蓝框 */
  '.ptp-power:focus:not(:focus-visible),.ptp-seg button:focus:not(:focus-visible),.ptp-float:focus:not(:focus-visible){outline:none}',
  '.ptp-power:focus-visible,.ptp-seg button:focus-visible,.ptp-float:focus-visible{outline:1px solid #2b5fd9;outline-offset:2px}',
  '.ptp-log{margin-top:12px;border:1px dashed #242424;padding:8px 10px;font-size:10px;line-height:1.9;letter-spacing:.12em;color:#5c5c5c;min-height:64px;white-space:pre-wrap}',
  '.ptp-log .ok{color:#9fb4c9}',
  '.ptp-log .err{color:#e05548}',
  '.ptp-log .accent{color:#6f9cff}',
  /* 浮动快捷开关 */
  '.ptp-float{position:fixed;right:14px;bottom:40px;z-index:2147482500;width:46px;height:46px;display:flex;align-items:center;justify-content:center;background:#0c0c0c;border:1px solid #333;color:#8f8f8f;font-family:var(--palis-font-mono,monospace);font-size:9px;letter-spacing:.2em;cursor:pointer;user-select:none;padding:0;writing-mode:vertical-rl;text-orientation:mixed}',
  '.ptp-float:hover{border-color:#2b5fd9;color:#ececec}',
  '.ptp-float.on{background:#2b5fd9;border-color:#2b5fd9;color:#0a0a0a}',
  '.ptp-float:disabled{opacity:.5;cursor:wait}',
].join('\n')
