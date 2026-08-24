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
 * 背景图形（参考 PALIS 09A 总目录屏）：3D 月球（右侧，月海/环形山点云 + 自转）
 * + 环形轨道图（居中）。月球为 DOM 层（client 注入），贴图为内联 SVG data-URI。
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

/* 月面贴图（等距圆柱 2048×1024，横向无缝）：引擎按贴图 R 通道亮度撒点云——亮（≥96）
 * 密点、暗（34–95）疏点、<34 镂空。设计参照矿质月面摄影 + 月相网格地理 + 半调网点
 * 海报语言：中灰高地基底 → 6 倍频反照率湍流（兼作中粒网点明度蒙版 = 真半调）→
 * 远古盆地/坑群/链坑/南半球饱和坑群/微坑颗粒 → 月海十二片按 selenographic 坐标
 * 排布（冷海带/雨海/澄海/静海/危海/丰富海/酒海/云海/湿海/风暴洋/格里马尔迪/
 * 柏拉图，背面纯高地）+ 同位移场亮岸线/皱脊/月溪/海缘幽灵坑 → 年轻亮坑 + 喷发毯 +
 * 第谷/哥白尼/开普勒楔形射纹 + Aristarchus 蓝白闪点 → 矿质双色调罩层（高地暖铜/
 * 月海钛蓝，舷窗直视可读）→ 三档网点 → 极区微亮 → 高频颗粒。离散元素 PRNG 确定性
 * 生成，近缝元素 ±2048 复制保横向无缝。 */

/** mulberry32：确定性 PRNG（月貌稳定，构建/探针截图可复现）。 */
function moonPrng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildMoonMap(): string {
  const rnd = moonPrng(20260823)
  const W = 2048
  const H = 1024
  const f1 = (n: number): string => n.toFixed(1)
  /** 圆心角 a0→a1（度，0=东向逆时针）的圆弧 path（环形山明暗弧用） */
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
    const p = (a: number): string => f1(cx + r * Math.cos((a * Math.PI) / 180)) + ',' + f1(cy - r * Math.sin((a * Math.PI) / 180))
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0
    return 'M' + p(a0) + ' A' + f1(r) + ',' + f1(r) + ' 0 ' + large + ' 0 ' + p(a1)
  }
  /** 横向接缝 wrap：x 距缝 margin 内时在 x±W 各复制一份（回调产出元素字符串） */
  const wrap = (x: number, margin: number, draw: (x: number) => string): string => {
    let s = draw(x)
    if (x < margin) s += draw(x + W)
    if (x > W - margin) s += draw(x - W)
    return s
  }

  /* ── 月海地理：按真月正面 selenographic 坐标排布（参考月相网格照片）──
   * 映射：x = 990 + 5.5·东经，y = 512 − 5.7·北纬（近地面带宽 ≈ ±90°）；
   * x<350 / x>1600 留纯高地=月球背面（自转一周讲完两面）。每片 1-3 个交叠椭圆
   * + disloc 位移破边；tone 索引两层覆盖的色板（0-3 常规微差，4 = 危海/格里
   * 马尔迪/柏拉图式深黑）。色值标定：基底 150 之上压到海面 s≈76-84 → 引擎暗部
   * 稀疏层（1/7 撒点），与高地（s≈110-190 密点阵）形成宏结构对比。 ── */
  interface Maria { x: number; y: number; tone: number; blobs: Array<{ dx: number; dy: number; rx: number; ry: number; rot: number }> }
  const marias: Maria[] = [
    { x: 950, y: 195, tone: 1, blobs: [ // 冷海 Frigoris：北极长带
      { dx: 0, dy: 0, rx: 300, ry: 48, rot: -4 },
      { dx: -260, dy: 18, rx: 130, ry: 34, rot: 8 },
      { dx: 250, dy: 14, rx: 140, ry: 36, rot: -10 },
    ] },
    { x: 904, y: 325, tone: 0, blobs: [ // 雨海 Imbrium
      { dx: 0, dy: 0, rx: 108, ry: 84, rot: -10 },
      { dx: -70, dy: 40, rx: 60, ry: 44, rot: 15 },
      { dx: 70, dy: 36, rx: 56, ry: 40, rot: -18 },
    ] },
    { x: 1086, y: 352, tone: 2, blobs: [ // 澄海 Serenitatis
      { dx: 0, dy: 0, rx: 64, ry: 56, rot: 8 },
    ] },
    { x: 1163, y: 464, tone: 1, blobs: [ // 静海 Tranquillitatis
      { dx: 0, dy: 0, rx: 82, ry: 62, rot: -6 },
      { dx: 60, dy: 36, rx: 48, ry: 34, rot: 14 },
    ] },
    { x: 1315, y: 415, tone: 4, blobs: [ // 危海 Crisium：孤立深黑圆海
      { dx: 0, dy: 0, rx: 42, ry: 34, rot: 10 },
    ] },
    { x: 1272, y: 556, tone: 1, blobs: [ // 丰富海 Fecunditatis
      { dx: 0, dy: 0, rx: 56, ry: 74, rot: 8 },
      { dx: -20, dy: 60, rx: 36, ry: 30, rot: -12 },
    ] },
    { x: 1185, y: 599, tone: 2, blobs: [ // 酒海 Nectaris
      { dx: 0, dy: 0, rx: 34, ry: 28, rot: 0 },
    ] },
    { x: 899, y: 633, tone: 1, blobs: [ // 云海 Nubium
      { dx: 0, dy: 0, rx: 64, ry: 44, rot: 16 },
      { dx: -50, dy: 20, rx: 38, ry: 26, rot: -8 },
    ] },
    { x: 776, y: 653, tone: 2, blobs: [ // 湿海 Humorum
      { dx: 0, dy: 0, rx: 40, ry: 34, rot: -14 },
    ] },
    { x: 704, y: 542, tone: 0, blobs: [ // 风暴洋 Oceanus Procellarum：最大海系
      { dx: 0, dy: -40, rx: 120, ry: 140, rot: 6 },
      { dx: 60, dy: 90, rx: 110, ry: 80, rot: -10 },
      { dx: -90, dy: 60, rx: 90, ry: 110, rot: 18 },
    ] },
    { x: 613, y: 542, tone: 4, blobs: [ // 格里马尔迪 Grimaldi：深黑小海
      { dx: 0, dy: 0, rx: 24, ry: 18, rot: -8 },
    ] },
    { x: 939, y: 218, tone: 4, blobs: [ // 柏拉图 Plato：雨海北缘暗斑
      { dx: 0, dy: 0, rx: 12, ry: 10, rot: 0 },
    ] },
  ]
  const mariaShapes = (fill: string | ((i: number) => string)): string =>
    marias
      .map((m, i) =>
        m.blobs
          .map(
            (b) =>
              "<ellipse cx='" + f1(m.x + b.dx) + "' cy='" + f1(m.y + b.dy) + "' rx='" + f1(b.rx) + "' ry='" + f1(b.ry) +
              "' transform='rotate(" + f1(b.rot) + ' ' + f1(m.x + b.dx) + ' ' + f1(m.y + b.dy) + ")' fill='" +
              (typeof fill === 'function' ? fill(i) : fill) + "'/>",
          )
          .join(''),
      )
      .join('')
  /** 月海岸线描边：与填充共用同一 disloc filter = 同一位移场，亮岸线贴着破边走；
   * rx<28 的微型海（柏拉图/格里马尔迪）跳过——描边宽度会淹没本体 */
  const mariaStrokes = (stroke: string, w: number): string =>
    marias
      .map((m) =>
        m.blobs
          .filter((b) => b.rx >= 28)
          .map(
            (b) =>
              "<ellipse cx='" + f1(m.x + b.dx) + "' cy='" + f1(m.y + b.dy) + "' rx='" + f1(b.rx) + "' ry='" + f1(b.ry) +
              "' transform='rotate(" + f1(b.rot) + ' ' + f1(m.x + b.dx) + ' ' + f1(m.y + b.dy) + ")' fill='none' stroke='" +
              stroke + "' stroke-width='" + f1(w) + "'/>",
          )
          .join(''),
      )
      .join('')
  /** 海内皱脊/月溪：沿椭圆弧行进 + 正弦抖动的折线（亮脊/暗溪，月面地质语言）；
   * aspect 随行——长带形海（冷海）画出顺带的脊线 */
  const mareWinding = (m: Maria, a0: number, a1: number, rad: number, amp: number, phase: number): string => {
    const aspect = m.blobs[0].ry / m.blobs[0].rx
    const pts: string[] = []
    for (let k = 0; k <= 9; k++) {
      const a = a0 + ((a1 - a0) * k) / 9
      const rr = rad * (1 + amp * Math.sin(phase + k * 1.7))
      pts.push(f1(m.x + Math.cos(a) * rr * 1.05) + ',' + f1(m.y + Math.sin(a) * rr * aspect * 0.9))
    }
    return 'M' + pts.join(' L')
  }
  /* 海内细节：大块圆海给皱脊×2（亮）+ 月溪×1（暗）；R≥45 给海缘幽灵坑
   * （低 alpha 细环 = 浅海下透出）；微型海保持干净 */
  const mareDetails: string[] = []
  marias.forEach((m, i) => {
    const R = m.blobs[0].rx
    if (R >= 50 && m.blobs[0].ry / R > 0.5) {
      mareDetails.push(
        "<path d='" + mareWinding(m, 0.4 + i, 2.6 + i, R * 0.52, 0.16, i * 2.1) + "' fill='none' stroke='rgba(226,236,246,.13)' stroke-width='3' stroke-linejoin='round'/>",
        "<path d='" + mareWinding(m, 3.4 + i * 0.7, 5.4 + i * 0.7, R * 0.68, 0.13, i * 1.3) + "' fill='none' stroke='rgba(226,236,246,.1)' stroke-width='2.4' stroke-linejoin='round'/>",
        "<path d='" + mareWinding(m, 1.8 + i * 0.9, 3.9 + i * 0.9, R * 0.4, 0.2, i * 3.7) + "' fill='none' stroke='rgba(8,10,14,.4)' stroke-width='2.2' stroke-linejoin='round'/>",
      )
    }
    if (R >= 45) {
      mareDetails.push(
        "<circle cx='" + f1(m.x + Math.cos(0.9 + i * 1.1) * R * 0.92) + "' cy='" + f1(m.y + Math.sin(0.9 + i * 1.1) * R * 0.6) + "' r='" + f1(16 + i * 4) + "' fill='rgba(28,32,38,.22)' stroke='rgba(232,238,245,.2)' stroke-width='2'/>",
      )
    }
  })

  /* ── 环形山（细环淡底，反照率特征而非光照；海报式细白描边）──
   * 层序考古学：古老盆地/中坑画在月海之下→被海面半掩成幽灵坑；年轻亮坑、射纹
   * 大坑与喷发毯画在月海之上（第谷/开普勒式暗面亮点）。坑最小 r=12（2048 尺度）
   * =降采样后 6px，再小只会混成盐噪；链坑 r 7-10 服务原图直视，点云里化作点状
   * 虚线纹理。 */
  const oldCraters: string[] = [] // 月海之下（远古盆地 + 高地坑群 + 链坑）
  const newCraters: string[] = [] // 月海之上（喷发毯/年轻坑/射纹大坑）
  const bellY = (): number => 512 + ((rnd() + rnd() + rnd()) / 3 - 0.5) * 2 * 400
  const craterArcs = (cx: number, y: number, r: number, hiA: string): string =>
    "<path d='" + arc(cx, y, r * 0.82, -25, 115) + "' fill='none' stroke='rgba(16,20,26,.42)' stroke-width='" + f1(r * 0.16) + "'/>" +
    "<path d='" + arc(cx, y, r * 0.88, 140, 295) + "' fill='none' stroke='rgba(240,244,250," + hiA + ")' stroke-width='" + f1(r * 0.09) + "'/>"
  /** 坑体公共配方：暗底 + 细亮环 + 明暗弧 + （可选）中央峰 */
  const craterBody = (cx: number, y: number, r: number, rimA: string, hiA: string, peakA: string): string =>
    "<circle cx='" + f1(cx) + "' cy='" + f1(y) + "' r='" + f1(r * 0.78) + "' fill='rgba(45,50,57,.42)'/>" +
    "<circle cx='" + f1(cx) + "' cy='" + f1(y) + "' r='" + f1(r) + "' fill='none' stroke='rgba(232,238,245," + rimA + ")' stroke-width='" + f1(r * 0.11) + "'/>" +
    craterArcs(cx, y, r, hiA) +
    (peakA === '0' ? '' : "<circle cx='" + f1(cx) + "' cy='" + f1(y) + "' r='" + f1(r * 0.11) + "' fill='rgba(232,238,245," + peakA + ")'/>")
  // 古老大盆地 ×2（背面高地：退化双环 + 缘上叠加中坑 = 地层叠压感）
  const basins: Array<{ x: number; y: number; r: number }> = [
    { x: 180, y: 300, r: 120 }, { x: 1850, y: 700, r: 145 },
  ]
  for (const b of basins) {
    oldCraters.push(wrap(b.x, b.r + 60, (cx) =>
      "<circle cx='" + f1(cx) + "' cy='" + f1(b.y) + "' r='" + f1(b.r) + "' fill='rgba(42,47,54,.16)'/>" +
      "<circle cx='" + f1(cx) + "' cy='" + f1(b.y) + "' r='" + f1(b.r) + "' fill='none' stroke='rgba(232,238,245,.18)' stroke-width='" + f1(b.r * 0.05) + "'/>" +
      "<circle cx='" + f1(cx) + "' cy='" + f1(b.y) + "' r='" + f1(b.r * 0.68) + "' fill='none' stroke='rgba(232,238,245,.12)' stroke-width='" + f1(b.r * 0.035) + "'/>" +
      craterBody(cx + b.r * 0.7, b.y - b.r * 0.45, b.r * 0.24, '.4', '.34', '.36'),
    ))
  }
  // 古老中坑 ×16（月海之下，部分将被海面淹没成幽灵坑）
  for (let i = 0; i < 16; i++) {
    const x = rnd() * W
    const y = bellY()
    const r = 18 + rnd() * 16
    oldCraters.push(wrap(x, 60, (cx) => craterBody(cx, y, r, '.5', '.42', rnd() < 0.4 ? '.45' : '0')))
  }
  // 小坑 ×64（全幅：一半钟形中纬带、一半全纬度均匀——两极高地不秃；
  // r 平方分布 = 多小坑少中坑，贴近真月坑径谱）
  for (let i = 0; i < 64; i++) {
    const x = rnd() * W
    const y = i % 2 === 0 ? bellY() : rnd() * H
    const r = 12 + rnd() * rnd() * 22
    oldCraters.push(wrap(x, 36, (cx) =>
      "<circle cx='" + f1(cx) + "' cy='" + f1(y) + "' r='" + f1(r * 0.75) + "' fill='rgba(45,50,57,.4)'/>" +
      "<circle cx='" + f1(cx) + "' cy='" + f1(y) + "' r='" + f1(r) + "' fill='none' stroke='rgba(232,238,245,.5)' stroke-width='" + f1(Math.max(1.3, r * 0.13)) + "'/>",
    ))
  }
  // 链坑 ×2（一排小坑 = 次生坑链/月沟缀坑，海报虚线肌理）
  for (let c = 0; c < 2; c++) {
    const x0 = [430, 1620][c]
    const y0 = [760, 240][c]
    const dir = [0.35, -0.5][c]
    let chain = ''
    for (let k = 0; k < 7; k++) {
      const x = x0 + Math.cos(dir) * k * 26 + (rnd() - 0.5) * 8
      const y = y0 + Math.sin(dir) * k * 26 + (rnd() - 0.5) * 8
      const r = 7 + rnd() * 3
      chain += "<circle cx='" + f1(x) + "' cy='" + f1(y) + "' r='" + f1(r) + "' fill='rgba(45,50,57,.3)' stroke='rgba(232,238,245,.4)' stroke-width='1.2'/>"
    }
    oldCraters.push(chain)
  }
  // 南半球坑群 ×40（参考矿质月面：南极附近高地坑挨坑到饱和；y 700-990）
  for (let i = 0; i < 40; i++) {
    const x = 480 + rnd() * 1040
    const y = 700 + rnd() * 290
    const r = 8 + rnd() * rnd() * 12
    oldCraters.push(wrap(x, 30, (cx) =>
      "<circle cx='" + f1(cx) + "' cy='" + f1(y) + "' r='" + f1(r * 0.75) + "' fill='rgba(45,50,57,.38)'/>" +
      "<circle cx='" + f1(cx) + "' cy='" + f1(y) + "' r='" + f1(r) + "' fill='none' stroke='rgba(232,238,245,.45)' stroke-width='" + f1(Math.max(1.1, r * 0.12)) + "'/>",
    ))
  }
  // 微坑颗粒 ×240（r 3-7：降采样后化作颗粒噪点 = 矿质月面那种密到饱和的
  // 微坑质感；服务原图直视与点云密度微调，不作结构）
  for (let i = 0; i < 240; i++) {
    const x = rnd() * W
    const y = rnd() * H
    const r = 3 + rnd() * 4
    oldCraters.push(wrap(x, 10, (cx) =>
      "<circle cx='" + f1(cx) + "' cy='" + f1(y) + "' r='" + f1(r) + "' fill='rgba(42,47,54,.34)'/>" +
      "<circle cx='" + f1(cx) + "' cy='" + f1(y) + "' r='" + f1(r + 0.8) + "' fill='none' stroke='rgba(232,238,245,.28)' stroke-width='1'/>",
    ))
  }
  // 年轻亮坑 ×5：落点仿真（雨海内 Timocharis 位/静海/云海缘/风暴洋/丰富海）；
  // 喷发毯 = 径向渐隐亮晕
  const young: Array<{ x: number; y: number; r: number }> = [
    { x: 1030, y: 300, r: 16 }, { x: 1160, y: 470, r: 20 }, { x: 940, y: 585, r: 18 },
    { x: 660, y: 500, r: 14 }, { x: 1290, y: 560, r: 12 },
  ]
  for (const c of young) {
    newCraters.push(
      "<circle cx='" + c.x + "' cy='" + c.y + "' r='" + f1(c.r * 2.3) + "' fill='url(%23gradEjecta)'/>" +
      "<circle cx='" + c.x + "' cy='" + c.y + "' r='" + f1(c.r * 0.76) + "' fill='rgba(38,42,49,.5)'/>" +
      "<circle cx='" + c.x + "' cy='" + c.y + "' r='" + f1(c.r) + "' fill='none' stroke='rgba(238,243,249,.75)' stroke-width='" + f1(c.r * 0.12) + "'/>" +
      craterArcs(c.x, c.y, c.r, '.6') +
      "<circle cx='" + c.x + "' cy='" + c.y + "' r='" + f1(c.r * 0.12) + "' fill='rgba(238,243,249,.6)'/>",
    )
  }
  // 射纹大坑 ×3（仿真位）：第谷 Tycho 居南半球 = 全月最主宰的射纹系统（24 条
  // 楔形射纹横跨半盘）；哥白尼 Copernicus 居风暴洋东；开普勒 Kepler 居其西。
  // 射纹 = 楔形三角（基部宽 → 尖梢收 0，真射纹的收束感）
  const rayed: Array<{ x: number; y: number; r: number; n: number; l0: number; l1: number }> = [
    { x: 927, y: 759, r: 42, n: 24, l0: 3.5, l1: 13 },
    { x: 880, y: 457, r: 46, n: 18, l0: 3, l1: 8 },
    { x: 780, y: 466, r: 26, n: 14, l0: 2.5, l1: 5 },
  ]
  for (const c of rayed) {
    // 射纹只存参数（角度/长度/基宽），坐标在 wrap 回调里按 cx 重算
    const raySpec: Array<{ a: number; len: number; w: number }> = []
    for (let k = 0; k < c.n; k++) {
      raySpec.push({ a: rnd() * Math.PI * 2, len: c.r * (c.l0 + rnd() * (c.l1 - c.l0)), w: 1.6 + rnd() * 2 })
    }
    newCraters.push(wrap(c.x, c.r * (c.l1 + 1), (cx) =>
      "<circle cx='" + f1(cx) + "' cy='" + f1(c.y) + "' r='" + f1(c.r * 2.6) + "' fill='url(%23gradEjecta)'/>" +
      "<g fill='rgba(230,238,248,.2)'>" + raySpec.map((ray) => {
        const dx = Math.cos(ray.a)
        const dy = Math.sin(ray.a)
        const px = (-dy * ray.w) / 2
        const py = (dx * ray.w) / 2
        const bx = cx + dx * c.r * 0.9
        const by = c.y + dy * c.r * 0.9
        return "<polygon points='" + f1(bx + px) + ',' + f1(by + py) + ' ' + f1(bx - px) + ',' + f1(by - py) + ' ' + f1(cx + dx * ray.len) + ',' + f1(c.y + dy * ray.len) + "'/>"
      }).join('') + "</g>" +
      "<circle cx='" + f1(cx) + "' cy='" + f1(c.y) + "' r='" + f1(c.r * 0.76) + "' fill='rgba(40,44,51,.5)'/>" +
      "<circle cx='" + f1(cx) + "' cy='" + f1(c.y) + "' r='" + f1(c.r) + "' fill='none' stroke='rgba(238,243,249,.72)' stroke-width='" + f1(c.r * 0.12) + "'/>" +
      craterArcs(cx, c.y, c.r, '.6') +
      "<circle cx='" + f1(cx) + "' cy='" + f1(c.y) + "' r='" + f1(c.r * 0.13) + "' fill='rgba(238,243,249,.65)'/>",
    ))
  }
  // 阿里斯塔克 Aristarchus：全月最亮斑，蓝白闪点（呼应参考图的蓝色点缀）——
  // 大喷发毯 + 高亮环 + 亮芯，无射纹
  newCraters.push(
    "<circle cx='729' cy='377' r='39' fill='url(%23gradEjectaB)'/>" +
    "<circle cx='729' cy='377' r='11.4' fill='rgba(38,42,49,.45)'/>" +
    "<circle cx='729' cy='377' r='15' fill='none' stroke='rgba(215,232,255,.9)' stroke-width='1.8'/>" +
    craterArcs(729, 377, 15, '.75') +
    "<circle cx='729' cy='377' r='1.8' fill='rgba(230,240,255,.85)'/>",
  )

  /* ── 测量十字（星图味，稀疏 6 枚）── */
  const crosses: string[] = []
  for (let i = 0; i < 6; i++) {
    const x = 120 + rnd() * (W - 240)
    const y = 90 + rnd() * (H - 180)
    crosses.push("<path d='M" + f1(x - 7) + ',' + f1(y) + ' h14 M' + f1(x) + ',' + f1(y - 7) + " v14'/>")
  }

  return [
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2048 1024'>",
    '<defs>',
    /* 反照率斑驳：大块低对比湍流（高地明度起伏）+ 线性拉伸增对比。
     * 同时充作细粒/中粒网点的明度蒙版 = 真半调（亮点大密、暗点稀淡）。 */
    "<filter id='albedo' x='-5%' y='-5%' width='110%' height='110%'>",
    "<feTurbulence type='fractalNoise' baseFrequency='0.003 0.006' numOctaves='6' seed='29'/>",
    "<feColorMatrix type='saturate' values='0'/>",
    "<feComponentTransfer><feFuncR type='linear' slope='1.5' intercept='-0.18'/><feFuncG type='linear' slope='1.5' intercept='-0.18'/><feFuncB type='linear' slope='1.5' intercept='-0.18'/></feComponentTransfer>",
    '</filter>',
    /* 月海破边位移（填充/岸线描边共用同一 filter：湍流只随坐标走 →
     * 两组形状位移场完全一致，岸线精确贴着破边） */
    "<filter id='disloc' x='-10%' y='-10%' width='120%' height='120%'><feTurbulence type='fractalNoise' baseFrequency='0.008 0.02' numOctaves='2' seed='17' result='t'/><feDisplacementMap in='SourceGraphic' in2='t' scale='85' xChannelSelector='R' yChannelSelector='G'/></filter>",
    /* 高频颗粒（海报复印颗粒感） */
    "<filter id='grain'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='5'/><feColorMatrix type='saturate' values='0'/></filter>",
    /* 喷发毯：径向渐隐亮晕（年轻坑/射纹坑）；B = 蓝白变体（Aristarchus 专用） */
    "<radialGradient id='gradEjecta'><stop offset='0' stop-color='rgba(238,243,249,.3)'/><stop offset='.55' stop-color='rgba(238,243,249,.12)'/><stop offset='1' stop-color='rgba(238,243,249,0)'/></radialGradient>",
    "<radialGradient id='gradEjectaB'><stop offset='0' stop-color='rgba(168,200,255,.4)'/><stop offset='.55' stop-color='rgba(150,185,250,.14)'/><stop offset='1' stop-color='rgba(150,185,250,0)'/></radialGradient>",
    /* 极区微亮（真月两极高地反照率略高；点云里极冠略密） */
    "<linearGradient id='gradPolar' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='rgba(236,240,246,.12)'/><stop offset='.14' stop-color='rgba(236,240,246,0)'/><stop offset='.86' stop-color='rgba(236,240,246,0)'/><stop offset='1' stop-color='rgba(236,240,246,.12)'/></linearGradient>",
    /* 三档网点（不同细腻程度的颗粒搭配）：hf 细粒 5px = 高地底噪纹理；hm 中粒 26px
     * 经反照率蒙版 = 舷窗直视可读的真半调；hc 粗粒 20px = 月海内颗粒。网格尺寸按
     * 引擎降采样（1024）标定：hm/hc 降采样后仍呈颗粒结构，hf 退化为细微亮度起伏。 */
    "<pattern id='hf' width='5' height='5' patternUnits='userSpaceOnUse'><circle cx='1.3' cy='1.3' r='.8' fill='rgba(236,236,236,.2)'/></pattern>",
    "<pattern id='hm' width='26' height='26' patternUnits='userSpaceOnUse'><circle cx='7' cy='7' r='4.2' fill='rgba(232,238,245,.42)'/></pattern>",
    "<pattern id='hc' width='20' height='20' patternUnits='userSpaceOnUse'><circle cx='5.5' cy='5.5' r='3.4' fill='rgba(226,236,246,.45)'/></pattern>",
    /* 网点蒙版：mhf = 反照率明度场挖去月海（细粒随明度呼吸）；mmc = 月海以内 */
    "<mask id='mhf' maskUnits='userSpaceOnUse' x='0' y='0' width='2048' height='1024'><rect x='0' y='0' width='2048' height='1024' filter='url(%23albedo)'/><g>" + mariaShapes('black') + "</g></mask>",
    "<mask id='mmc' maskUnits='userSpaceOnUse' x='0' y='0' width='2048' height='1024'><rect x='0' y='0' width='2048' height='1024' fill='black'/><g>" + mariaShapes('white') + "</g></mask>",
    '</defs>',
    /* 基底：中灰高地（整盘有粒子存在感）。rgb() 不用 #hex——data URI 里 # 会截断。
     * 明度标定：引擎 b=((s-128)·1.4+128)·0.32——高地 150→≈51 盘体存在感；月海 ≈80→≈17
     * 暗部疏点（有细节层次，不再是纯黑虚空）；环形山亮环 ≥200→63+ 亮棱。 */
    "<rect x='0' y='0' width='2048' height='1024' fill='rgb(150,150,150)'/>",
    /* 反照率斑驳（大块明暗起伏） */
    "<rect x='0' y='0' width='2048' height='1024' filter='url(%23albedo)' opacity='.5'/>",
    /* 远古盆地 + 高地坑群 + 链坑（月海之下，部分被淹成幽灵坑） */
    "<g>" + oldCraters.join('') + '</g>',
    /* 月海（位移破边）两层半透覆盖：古坑幽灵般透出；tone 色板微差（真月海也不均一，
     * tone 4 = 危海/格里马尔迪/柏拉图式深黑）。压到 s≈76-84：引擎暗部稀疏层 1/7 撒点。 */
    "<g filter='url(%23disloc)'>" + mariaShapes((i) => ['rgba(40,46,54,.55)', 'rgba(48,55,64,.5)', 'rgba(36,42,50,.58)', 'rgba(52,59,68,.48)', 'rgba(26,31,38,.62)'][marias[i].tone]) + '</g>',
    "<g filter='url(%23disloc)'>" + mariaShapes((i) => ['rgba(40,46,54,.28)', 'rgba(48,55,64,.25)', 'rgba(36,42,50,.3)', 'rgba(52,59,68,.24)', 'rgba(26,31,38,.36)'][marias[i].tone]) + '</g>',
    /* 岸线描边（同一位移场，贴破边） */
    "<g filter='url(%23disloc)'>" + mariaStrokes('rgba(232,238,245,.18)', 3.5) + '</g>',
    /* 海内细节：皱脊/月溪/海缘幽灵坑 */
    "<g>" + mareDetails.join('') + '</g>',
    /* 年轻亮坑 + 喷发毯 + 射纹大坑 + Aristarchus 蓝白闪点（月海之后，暗面亮点） */
    "<g>" + newCraters.join('') + '</g>',
    /* 矿质双色调（参考矿质月面摄影）：高地暖铜薄罩 + 月海钛蓝薄罩。引擎只采样
     * R 通道：蓝罩 R 低 → 月海在点云里更稀疏；暖罩 R 高 → 高地略密——色调同时
     * 服务直视与点云密度。 */
    "<rect x='0' y='0' width='2048' height='1024' fill='rgba(196,168,120,.06)'/>",
    "<g filter='url(%23disloc)'>" + mariaShapes('rgba(70,115,190,.15)') + '</g>',
    /* 三档半调网点 */
    "<rect x='0' y='0' width='2048' height='1024' fill='url(%23hf)' mask='url(%23mhf)'/>",
    "<rect x='0' y='0' width='2048' height='1024' fill='url(%23hm)' mask='url(%23mhf)'/>",
    "<rect x='0' y='0' width='2048' height='1024' fill='url(%23hc)' mask='url(%23mmc)'/>",
    /* 极区微亮 */
    "<rect x='0' y='0' width='2048' height='1024' fill='url(%23gradPolar)'/>",
    /* 极淡经纬网（星图基准）+ 测量十字 */
    "<g stroke='rgba(236,236,236,.07)' stroke-width='1'>",
    "<line x1='512' y1='0' x2='512' y2='1024'/><line x1='1024' y1='0' x2='1024' y2='1024'/><line x1='1536' y1='0' x2='1536' y2='1024'/>",
    "<line x1='0' y1='256' x2='2048' y2='256'/><line x1='0' y1='512' x2='2048' y2='512'/><line x1='0' y1='768' x2='2048' y2='768'/>",
    '</g>',
    "<g stroke='rgba(226,236,246,.3)' stroke-width='1.2' fill='none'>" + crosses.join('') + '</g>',
    /* 高频颗粒 */
    "<rect x='0' y='0' width='2048' height='1024' filter='url(%23grain)' opacity='.14'/>",
    '</svg>',
  ].join('')
}

export const ART_MOON_MAP = buildMoonMap()

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
     prefers-reduced-motion 分支在内核/插件侧照旧生效（它们杀的是 transition 本身）。
     CRT 三层的浓度变量注册成 @property <number> 并挂进 html 的 transition：
     intensity 档位切换时扫描线/噪点/暗角平滑渐变（变量插值会带进 background
     rgba 里的 var() 引用）；不支持 @property 的引擎静默退回瞬时切换，无回归 ── */
  'html[data-palis-theme]{',
  '--ds-transition-duration:.16s;--ds-transition-duration-fast:.1s;--ds-transition-duration-slow:.3s;',
  '--ds-ease-in-out:cubic-bezier(.4,0,.15,1);',
  '--palis-noise-on:1;--palis-scan-on:1;--palis-vignette-on:1;',
  'transition:--palis-scan-alpha var(--ds-transition-duration-slow) var(--ds-ease-in-out),--palis-noise-alpha var(--ds-transition-duration-slow) var(--ds-ease-in-out),--palis-vignette-alpha var(--ds-transition-duration-slow) var(--ds-ease-in-out);',
  '}',
  '@property --palis-scan-alpha{syntax:"<number>";inherits:true;initial-value:.028}',
  '@property --palis-noise-alpha{syntax:"<number>";inherits:true;initial-value:.022}',
  '@property --palis-vignette-alpha{syntax:"<number>";inherits:true;initial-value:.22}',
  /* on/off 开关变量：CRT 三层常驻、opacity 门控——切换走 opacity 渐隐渐现，不再瞬灭瞬现 */
  'html[data-palis-theme][data-palis-noise="off"]{--palis-noise-on:0}',
  'html[data-palis-theme][data-palis-scan="off"]{--palis-scan-on:0}',
  'html[data-palis-theme][data-palis-vignette="off"]{--palis-vignette-on:0}',

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

  /* ── ③ CRT 质感：噪点(html::before) / 扫描线+慢速扫描带(html::after) / 暗角(body::after) / 边框罩(body::before)。
     三层常驻、opacity × 开关变量门控（off → 渐隐、on → 渐现），不再按 on/off 增删伪元素 ── */
  'html[data-palis-theme]::before{',
  'content:"";position:fixed;inset:0;z-index:2147482000;pointer-events:none;',
  'background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'140\' height=\'140\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'2\' stitchTiles=\'stitch\'/><feColorMatrix type=\'saturate\' values=\'0\'/></filter><rect width=\'140\' height=\'140\' filter=\'url(%23n)\'/></svg>");',
  'opacity:calc(var(--palis-noise-alpha)*var(--palis-noise-on));',
  'transition:opacity var(--ds-transition-duration-slow) var(--ds-ease-in-out);',
  '}',
  /* 扫描线：4px 周期细线（低透明度）+ 一条 11s 慢速下扫的 CRT 刷新带 */
  'html[data-palis-theme]::after{',
  'content:"";position:fixed;inset:0;z-index:2147482000;pointer-events:none;',
  'background-image:repeating-linear-gradient(0deg,rgba(255,255,255,var(--palis-scan-alpha)) 0 1px,transparent 1px 4px),linear-gradient(180deg,transparent 0%,rgba(255,255,255,.026) 46%,rgba(255,255,255,.026) 54%,transparent 100%);',
  'background-size:100% 100%,100% 240%;background-position:0 0,0 -240%;',
  'opacity:var(--palis-scan-on);',
  'transition:opacity var(--ds-transition-duration-slow) var(--ds-ease-in-out);',
  'animation:palis-crt-sweep 11s linear infinite;',
  '}',
  '@keyframes palis-crt-sweep{from{background-position:0 0,0 -240%}to{background-position:0 0,0 140%}}',
  'html[data-palis-theme] body::after{',
  'content:"";position:fixed;inset:0;z-index:2147482000;pointer-events:none;',
  'background:radial-gradient(ellipse 92% 84% at 50% 46%,transparent 55%,rgba(0,0,0,var(--palis-vignette-alpha)) 100%);',
  'opacity:var(--palis-vignette-on);',
  'transition:opacity var(--ds-transition-duration-slow) var(--ds-ease-in-out);',
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
  /* 工具调用行 = 蓝图上的"施工区"：135° 细斜纹区分于 assistant 的蓝轨渐变 */
  'background-image:repeating-linear-gradient(135deg,rgba(236,236,236,.022) 0 5px,transparent 5px 10px)',
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
  /* 辉光（标题与品牌文字）；transition 挂全量标题选择器——on/off 切换时辉光渐显渐隐 */
  'html[data-palis-theme] h1,html[data-palis-theme] h2,html[data-palis-theme] h3{',
  'transition:text-shadow var(--ds-transition-duration-slow) var(--ds-ease-in-out)}',
  'html[data-palis-theme][data-palis-glow="on"] h1,',
  'html[data-palis-theme][data-palis-glow="on"] h2,',
  'html[data-palis-theme][data-palis-glow="on"] h3{text-shadow:0 0 10px rgba(43,95,217,.5)}',

  /* ── 数据天体（client 注入 DOM 层）：球 = canvas 正交投影 + 双线性采样，
     无光照无辉光、固定曝光压暗——质感全部来自构成元素（等高线/经纬网/网点/数据刻度/表面粒子）。
     外包 HUD 几何层（细实线环/十字准线/live 代码读数）。
     球体之下另有卫星轨道环（掠过球盘的弧段被遮蔽）── */
  /* 球体尺寸随视口缩放（超宽屏不再显得细碎）：1920 及以下保持 1100 原样，
     3840 超宽 → 1500px 上限；露出量用 translateX 表达（% 相对元素自身宽度——
     right 的 % 是相对容器的，不能用），半弧露出恒 540px 与球径解耦 */
  '.palis-globe{position:absolute;right:0;top:50%;width:min(1500px,max(1100px,56vw));height:min(1500px,max(1100px,56vw));',
  'transform:translateY(-50%) translateX(calc(100% - 540px));pointer-events:none;z-index:-1;',
  /* will-change 常驻：合成层在滑动前就存在（vs 过渡启动才提升=晚一帧上图） */
  'will-change:transform;',
  /* 月出动效：transform 直接状态值过渡（不用 var 组合——var 组合值过渡在本机
     插值步进/振荡，WORKLOG 25/27；闪的真源是声纳 ping 环逐帧重尺寸，见 sonar 节） */
  'transition:transform var(--ds-transition-duration-slow,.24s) var(--ds-ease-in-out,ease)}',
  /* 满月揭示：左右侧栏全收（客户端置 html[data-palis-moon="full"]）时整盘滑进视野 */
  'html[data-palis-moon="full"] .palis-globe{transform:translateY(-50%) translateX(60px);',
  /* 揭示方向滑入等布局列宽过渡猛冲段过去再动（安静帧上滑，掉帧更少）；隐藏方向保持即时 */
  'transition:transform var(--ds-transition-duration-slow,.3s) var(--ds-ease-in-out,ease) var(--ds-transition-duration-fast,.1s)}',
  '.palis-globe-sphere{position:absolute;inset:100px;border-radius:50%;overflow:hidden;',
  'border:1px solid rgba(236,236,236,.12);',
  'box-shadow:inset 0 0 60px rgba(0,0,0,.35),0 0 90px rgba(43,95,217,.05)}',
  '.palis-globe-canvas{position:absolute;inset:0;width:100%;height:100%}',
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
  /* 星尘漂移场：与 globe 同挂 [data-phase]、同负 z；DOM 序在其前 = 画在其下 */
  '.palis-starfield{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1}',
  'html[data-palis-artwork="off"] .palis-starfield{display:none!important}',
  'html:not([data-palis-theme]) .palis-starfield{display:none!important}',
  /* 欢迎屏（hero 态）：天体右移更多，只露左弧（440px，同 translateX 基准） */
  '[data-phase="hero"] .palis-globe{transform:translateY(-50%) translateX(calc(100% - 440px))}',

  /* ── ⑤ 开机自检覆盖层 ── */
  '.palis-boot{position:fixed;inset:0;z-index:2147484000;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#050505;color:#e8e8e8;font-family:var(--palis-font-mono,monospace);opacity:1;transition:opacity .45s ease;animation:palis-boot-on .55s cubic-bezier(.2,.8,.3,1)}',
  /* CRT 点火入场：亮线水平展开（clip-path 收敛/展开 + 亮度闪光），与 POWER 通断电同族 */
  '@keyframes palis-boot-on{0%{clip-path:inset(49.6% 0 49.6% 0);filter:brightness(2.4)}55%{clip-path:inset(0 0 0 0);filter:brightness(1.5)}100%{clip-path:inset(0 0 0 0);filter:brightness(1)}}',
  '.palis-boot.off{opacity:0;pointer-events:none}',
  /* 覆盖层自带扫描线 + 暗角（开机即入 CRT 质感，不再是秃黑屏） */
  ".palis-boot::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.028) 0 1px,transparent 1px 3px),radial-gradient(ellipse at center,transparent 52%,rgba(0,0,0,.55));pointer-events:none}",
  '.palis-boot>*{position:relative;z-index:1}',
  /* 圆形视窗：月面贴图横向平移 = 舷窗里转动的月球（呼应 PALIS 09A 参考屏的大圆窗） */
  '.palis-boot .pb-port{position:relative;width:380px;height:380px;border-radius:50%;overflow:hidden;border:1px solid rgba(236,236,236,.2);box-shadow:0 0 60px rgba(43,95,217,.08),inset 0 0 40px rgba(0,0,0,.4)}',
  '.palis-boot .pb-moon{position:absolute;left:0;top:0;height:100%;width:200%;max-width:none;opacity:.92;animation:palis-boot-pan 60s linear infinite}',
  '@keyframes palis-boot-pan{from{transform:translateX(0)}to{transform:translateX(-50%)}}',
  '.palis-boot .pb-port-ring{position:absolute;inset:12px;border:1px solid rgba(236,236,236,.14);border-radius:50%}',
  /* 直角模式豁免：舷窗与内环是具象图形而非 UI 铬件，必须保持圆形（同 globe/sonar 先例） */
  'html[data-palis-theme][data-palis-square="on"] .palis-boot .pb-port,',
  'html[data-palis-theme][data-palis-square="on"] .palis-boot .pb-port-ring{border-radius:50% !important}',
  '.palis-boot .pb-port-cross{position:absolute;left:50%;top:50%;width:6px;height:6px;border:1px solid rgba(111,156,255,.7);transform:translate(-50%,-50%)}',
  /* 标题/副标叠在视窗中央（参考屏构图），文字带阴影压过月面 */
  '.palis-boot .pb-port-text{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-shadow:0 1px 10px rgba(0,0,0,.85),0 0 3px rgba(0,0,0,.9)}',
  '.palis-boot .pb-title{font-size:30px;letter-spacing:.4em;font-weight:600;color:#ececec;margin:0;text-indent:.4em}',
  '.palis-boot .pb-sub{margin-top:14px;font-size:12px;letter-spacing:.3em;color:#b9c2cc;text-indent:.3em}',
  '.palis-boot .pb-sub b{color:#6f9cff;font-weight:400}',
  '.palis-boot .pb-bar{width:380px;height:2px;margin-top:30px;background:#1d1d1d;overflow:hidden;position:relative}',
  '.palis-boot .pb-bar i{display:block;position:absolute;inset:0;background:#2b5fd9;transform:scaleX(0);transform-origin:left;animation:palis-boot-bar 1.5s steps(30) forwards}',
  '.palis-boot .pb-lines{margin-top:22px;width:380px;min-height:120px;font-size:11px;line-height:1.95;letter-spacing:.14em;color:#787878}',
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
  /* 预设行（一键切换渲染层组合）+ 状态行右侧操作提示 */
  '.ptp-preset{display:flex;align-items:center;gap:10px;margin-bottom:14px}',
  '.ptp-preset>.ptp-key{font-size:10px;letter-spacing:.2em;color:#2b5fd9;flex:none}',
  '.ptp-status-hint{margin-left:auto;font-size:10px;letter-spacing:.1em;color:#3f3f3f}',

  /* ── CRT 开关机闪屏（POWER 切换的签名瞬间；样式必须放 PANEL_CSS——"关机"闪屏
     播放的瞬间 PALIS_CSS 已被摘除，只有常驻表能兜住）。水平亮线展开 = 通电、
     收束成点熄灭 = 断电，暗罩负责遮住主题切换瞬间的裸 UI。reduced-motion 不播 ── */
  '.palis-crt-fx{position:fixed;inset:0;z-index:2147483600;pointer-events:none;background:transparent}',
  '.palis-crt-fx>i{position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;',
  'background:#e7efff;box-shadow:0 0 26px 5px rgba(96,140,255,.85),0 0 110px 30px rgba(43,95,217,.35)}',
  '.palis-crt-fx.on{animation:palis-crt-veil-on .52s linear forwards}',
  '.palis-crt-fx.on>i{animation:palis-crt-line-on .52s cubic-bezier(.2,.7,.3,1) forwards}',
  '@keyframes palis-crt-veil-on{0%{background:rgba(2,3,6,1)}55%{background:rgba(2,3,6,.85)}100%{background:rgba(2,3,6,0)}}',
  '@keyframes palis-crt-line-on{0%{transform:scaleX(0) scaleY(1);opacity:1}45%{transform:scaleX(1) scaleY(1)}',
  '80%{transform:scaleX(1) scaleY(150)}100%{transform:scaleX(1) scaleY(320);opacity:0}}',
  '.palis-crt-fx.off{animation:palis-crt-veil-off .46s linear forwards}',
  '.palis-crt-fx.off>i{animation:palis-crt-line-off .46s cubic-bezier(.3,.6,.2,1) forwards}',
  '@keyframes palis-crt-veil-off{0%{background:rgba(2,3,6,0)}12%{background:rgba(2,3,6,.96)}70%{background:rgba(2,3,6,.96)}100%{background:rgba(2,3,6,0)}}',
  '@keyframes palis-crt-line-off{0%{transform:scaleX(.08) scaleY(160);opacity:0}20%{transform:scaleX(1) scaleY(1);opacity:1}',
  '62%{transform:scaleX(1) scaleY(1);opacity:1}86%{transform:scaleX(.05) scaleY(5);opacity:.9}100%{transform:scaleX(0) scaleY(2);opacity:0}}',
].join('\n')
