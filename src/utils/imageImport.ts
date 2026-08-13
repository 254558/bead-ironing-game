import { clearCellContent, MAX_GRID, showStatus, store, switchMode } from '../stores/game'
import { COLORS, COLORS_RGB, MAX_PIX } from '../utils/color'
import type { ImportMode } from '../types'

/**
 * 图片导入 → 拼豆图纸。
 * - pattern：只做图纸，对照手动放豆；放下的珠子覆盖图纸格，擦除即露出图纸。
 * - beads：优先「从图纸生成豆子」——检测标准网格图纸（如 40×40），逐格取中心色
 *   精确生成豆子；检测不到网格时回退到逐像素缩放识别。
 * 画布固定 40×40：图案最长边 ≤ MAX_PIX（=画布边长），写入前自动缩放并居中，不扩容画布。
 */

/** 网格线行：平均灰度比前后行显著更暗（网格线比格子深；阈值取小，靠下方均匀性校验兜底） */
const LINE_DARK_DIFF = 5

/** sRGB 转 Oklab（感知均匀色空间，用于修正加权 RGB 无法区分的同明度不同色相） */
function srgbToLinear(c: number): number {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function oklab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r)
  const G = srgbToLinear(g)
  const B = srgbToLinear(b)
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ]
}
const COLORS_OK = COLORS_RGB.map(([r, g, b]) => oklab(r, g, b))

/**
 * 调色板最近色。混合量化：
 * - 明度 L < 0.25 的极暗格退回加权 RGB（暗端调色板只有黑 #16 与藏青 #0，Oklab 的暗部压缩
 *   会把近黑 (9,7,5) 误判成藏青），保证黑色仍然是黑色；
 * - 其余用 Oklab 感知距离，修正加权 RGB 把绿认成灰/蓝、棕认成红等色相偏差。
 */
function nearestColor(cr: number, cg: number, cb: number): number {
  const cl = oklab(cr, cg, cb)
  if (cl[0] < 0.25) {
    let best = 0
    let bd = Infinity
    for (let k = 0; k < COLORS_RGB.length; k++) {
      const [pr, pg, pb] = COLORS_RGB[k]
      const d = 0.3 * (cr - pr) ** 2 + 0.59 * (cg - pg) ** 2 + 0.11 * (cb - pb) ** 2
      if (d < bd) {
        bd = d
        best = k
      }
    }
    return best
  }
  let best = 0
  let bd = Infinity
  for (let k = 0; k < COLORS_OK.length; k++) {
    const [pl, pa, pb] = COLORS_OK[k]
    const d = (cl[0] - pl) ** 2 + (cl[1] - pa) ** 2 + (cl[2] - pb) ** 2
    if (d < bd) {
      bd = d
      best = k
    }
  }
  return best
}

/** 一维平均灰度 + 方差数组上的网格线检测（聚类连续行/列，取线中心） */
function detectGridLines(mean: Float32Array, variance: Float32Array): number[] {
  const lines: number[] = []
  let start = -1
  let prev = -10
  const len = mean.length
  for (let i = 2; i < len - 2; i++) {
    // 网格线可能比格子暗，也可能比格子亮（暗色图纸内容比线更暗）——均值双向检测局部极值；
    // 内容与线同色时均值无差异，改用方差：网格线整行/列都是同一灰色（方差≈0），
    // 内容有纹理（方差大）→ 方差局部极小（灵敏度高，纯色块内部邻居也小不会误触发，
    // 块边界产生的假线会被下方相位一致性过滤）
    const dark = mean[i] < mean[i - 2] - LINE_DARK_DIFF && mean[i] < mean[i + 2] - LINE_DARK_DIFF
    const bright = mean[i] > mean[i - 2] + LINE_DARK_DIFF && mean[i] > mean[i + 2] + LINE_DARK_DIFF
    const uniform = variance[i] < variance[i - 2] * 0.9 && variance[i] < variance[i + 2] * 0.9
    if (dark || bright || uniform) {
      if (i - prev > 2) start = i
      prev = i
    } else if (start >= 0) {
      lines.push(Math.round((start + prev) / 2))
      start = -1
    }
  }
  if (start >= 0) lines.push(Math.round((start + prev) / 2))
  return lines
}

/** 网格信息：格子数 n、周期 T、相位 phase（格子边界的像素位置 mod T） */
interface GridInfo {
  n: number
  T: number
  phase: number
}

/**
 * 由网格线位置推断网格。标准网格的线严格等间距（周期 T = size/n），
 * 因此扫描候选格子数 n，用「相位对齐率 + 覆盖命中率」判定哪个 n 最吻合：
 * - 对齐率：≥80% 的检测线落在同一条相位上（容差 tol）——即使部分线因内容与线
 *   同色而漏检（暗色图可能只看到零星几条线），只要检出的线都对齐就是强证据；
 * - 命中率：推断的内部线位附近要有检测线（防止把局部等距碎片误判成整图网格）。
 * 返回 null 表示不是均匀网格图纸。
 */
function gridCount(lines: number[], size: number): GridInfo | null {
  if (lines.length < 3) return null
  const gaps: number[] = []
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i] - lines[i - 1])
  const sorted = [...gaps].sort((a, b) => a - b)
  const med = sorted[Math.floor(sorted.length / 2)]
  if (med < 4) return null
  const n0 = Math.round(size / med)
  let best: { score: number; n: number; T: number; phase: number } | null = null
  const nMin = Math.max(2, n0 - 3)
  const nMax = Math.min(MAX_GRID, n0 + 3)
  for (let n = nMin; n <= nMax; n++) {
    const T = size / n
    const tol = Math.max(2, T * 0.04)
    // 相位枚举：候选相位取每条线的 mod 值，选对齐线数最多的
    let phase = 0
    let bestAl = 0
    for (const L of lines) {
      let al = 0
      const ph = ((L % T) + T) % T
      for (const L2 of lines) {
        const d = ((L2 % T - ph) % T + T) % T
        if (Math.min(d, T - d) <= tol) al++
      }
      if (al > bestAl) {
        bestAl = al
        phase = ph
      }
    }
    if (bestAl / lines.length < 0.8) continue
    // 覆盖命中率
    let hit = 0
    const hitTol = tol * 2
    for (let k = 1; k < n; k++) {
      const p = phase + k * T
      let ok = false
      for (const L of lines) if (Math.abs(L - p) <= hitTol) { ok = true; break }
      if (ok) hit++
    }
    const hitr = n > 1 ? hit / (n - 1) : 1
    if (hitr < 0.5) continue
    const score = (bestAl / lines.length) * hitr
    if (best === null || score > best.score) best = { score, n, T, phase }
  }
  if (best === null) return null
  // 相位归一化：聚类中心可能在 T/2 外（例如检测到的第一条线是格子 1 的边界 25.6，
  // 聚类中心≈25.0）。格子 0 的左边界取「离 0 最近的环形等价」，使格子序列覆盖
  // [0, size)，否则格子会整体错位一格。
  let phase = best.phase
  if (phase > best.T / 2) phase -= best.T
  return { n: best.n, T: best.T, phase }
}

/** 全图像素上限：超过则跳过网格识别（防止超大图撑爆 canvas / 内存） */
const GRID_MAX_PIXELS = 40_000_000 // 4800×4800 = 2300 万，留足余量

/**
 * 从标准网格图纸精确生成豆子：
 * 1) 全尺寸绘制 → 单趟 getImageData，逐像素累加行/列灰度均值与方差（真实平均）→
 *    均值极值（比格子暗/亮）+ 方差极小（内容与线同色时线整行均匀）检测网格线 →
 *    扫描候选格子数，按「相位对齐率 + 覆盖命中率」确定 nx×ny 与周期/相位；
 * 2) 按周期+相位直接取每个格子中心的 3×3 平均色（远离网格线）；
 * 3) 中心色直接作为豆子颜色写入 pixel + color——所见即所得：图纸格子是什么纯色，
 *    豆子就是什么颜色，不再量化到 32 色板（浅绿等图纸色不会落白/落灰）。
 *    仅把 webp 压缩产生的 ±1~3 噪声变体（同一视觉颜色的几个接近值）合并回一种。
 * 成功返回 true（调用方不再走普通缩放识别）。
 *
 * 注意：不能把原图缩成 1 列/1 行再读像素——canvas 缩小是点采样（取最左/最上行），
 * 会把网格线当成整行均值，导致一条线都检测不到。必须逐像素真实平均。
 */
function importGridBeads(img: HTMLImageElement): boolean {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (iw < 40 || ih < 40) return false
  if (iw * ih > GRID_MAX_PIXELS) return false

  let nx: number | null
  let ny: number | null
  let vg: GridInfo | null = null
  let hg: GridInfo | null = null
  let full: Uint8ClampedArray | null = null
  try {
    const oc = document.createElement('canvas')
    oc.width = iw
    oc.height = ih
    const octx = oc.getContext('2d', { willReadFrequently: true })!
    octx.drawImage(img, 0, 0)
    full = octx.getImageData(0, 0, iw, ih).data
    oc.width = 1 // 尽早释放全尺寸 canvas 缓冲（full 是独立副本，仍可用）

    // 单趟遍历：行/列的总灰度与总平方同时累加（均值 + 方差，注意别在循环里分配数组）。
    // 用 Float64 累加避免 g² 累计超过 Float32 精度。
    const rowSum = new Float64Array(ih)
    const rowSq = new Float64Array(ih)
    const colSum = new Float64Array(iw)
    const colSq = new Float64Array(iw)
    let p = 0
    for (let r = 0; r < ih; r++) {
      let rs = 0
      let rsq = 0
      for (let c = 0; c < iw; c++) {
        const g = 0.3 * full[p] + 0.59 * full[p + 1] + 0.11 * full[p + 2]
        p += 4
        rs += g
        rsq += g * g
        colSum[c] += g
        colSq[c] += g * g
      }
      rowSum[r] = rs
      rowSq[r] = rsq
    }
    const rowMean = new Float32Array(ih)
    const rowVar = new Float32Array(ih)
    const colMean = new Float32Array(iw)
    const colVar = new Float32Array(iw)
    for (let r = 0; r < ih; r++) {
      const m = rowSum[r] / iw
      rowMean[r] = m
      const v = rowSq[r] / iw - m * m
      rowVar[r] = v > 0 ? v : 0
    }
    for (let c = 0; c < iw; c++) {
      const m = colSum[c] / ih
      colMean[c] = m
      const v = colSq[c] / ih - m * m
      colVar[c] = v > 0 ? v : 0
    }

    vg = gridCount(detectGridLines(colMean, colVar), iw)
    hg = gridCount(detectGridLines(rowMean, rowVar), ih)
    nx = vg?.n ?? null
    ny = hg?.n ?? null
    if (nx === null || ny === null) return false
  } catch {
    return false // canvas 尺寸超限（如 iOS Safari）等异常：回退普通识别
  }

  clearGrid()

  // 相机从近侧俯视棋盘：整图 180° 镜像翻转（与普通识别一致），否则图纸在棋盘上倒置
  const offC = Math.floor((store.cols - nx) / 2)
  const offR = Math.floor((store.rows - ny) / 2)
  // 按检测到的周期+相位直接取格子中心（3×3 平均抗噪），
  // 不依赖格子恰好铺满整图，比 2nx×2ny 最近邻缩放更准
  const TC = vg!.T
  const TR = hg!.T
  const phC = vg!.phase
  const phR = hg!.phase
  // 第一趟：采样所有格子中心色（先不进调色板，按图纸原色生成豆子）
  const cellSamples: [number, number, number][][] = Array.from({ length: ny }, () => Array(nx))
  for (let r = 0; r < ny; r++) {
    const cy = Math.round(phR + (r + 0.5) * TR)
    for (let c = 0; c < nx; c++) {
      const cx = Math.round(phC + (c + 0.5) * TC)
      let sr = 0
      let sg = 0
      let sb = 0
      let cnt = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = cy + dy
        if (yy < 0 || yy >= ih) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx
          if (xx < 0 || xx >= iw) continue
          const i = (yy * iw + xx) * 4
          sr += full![i]
          sg += full![i + 1]
          sb += full![i + 2]
          cnt++
        }
      }
      cellSamples[r][c] = [sr / cnt, sg / cnt, sb / cnt]
    }
  }
  // 第二趟：合并 webp 噪声变体。同一视觉颜色在压缩后会有几个接近值
  // （如 (255,126,1)/(255,126,0)/(254,126,1)），Oklab 色距 < MERGE_DE 视为同色合并，
  // 取加权平均作代表色；频次降序让主色当锚点，噪声变体归并进去。
  const MERGE_DE = 0.02
  const freq = new Map<string, { r: number; g: number; b: number; n: number }>()
  for (const row of cellSamples)
    for (const [sr, sg, sb] of row) {
      const key = `${Math.round(sr)},${Math.round(sg)},${Math.round(sb)}`
      const hit = freq.get(key)
      if (hit) {
        hit.r += sr
        hit.g += sg
        hit.b += sb
        hit.n++
      } else {
        freq.set(key, { r: sr, g: sg, b: sb, n: 1 })
      }
    }
  const sorted = [...freq.entries()].sort((a, b) => b[1].n - a[1].n)
  const clusters: { r: number; g: number; b: number; n: number }[] = []
  const keyToCluster = new Map<string, number>()
  for (const [key, c] of sorted) {
    const cl = oklab(c.r / c.n, c.g / c.n, c.b / c.n)
    let ci = -1
    for (let k = 0; k < clusters.length; k++) {
      const pc = clusters[k]
      const pk = oklab(pc.r / pc.n, pc.g / pc.n, pc.b / pc.n)
      const d = (cl[0] - pk[0]) ** 2 + (cl[1] - pk[1]) ** 2 + (cl[2] - pk[2]) ** 2
      if (d < MERGE_DE * MERGE_DE) {
        ci = k
        break
      }
    }
    if (ci < 0) {
      clusters.push({ r: c.r, g: c.g, b: c.b, n: c.n })
      ci = clusters.length - 1
    } else {
      clusters[ci].r += c.r
      clusters[ci].g += c.g
      clusters[ci].b += c.b
      clusters[ci].n += c.n
    }
    keyToCluster.set(key, ci)
  }
  const repHex = clusters.map((c) => {
    const rr = Math.round(c.r / c.n)
    const gg = Math.round(c.g / c.n)
    const bb = Math.round(c.b / c.n)
    return '#' + [rr, gg, bb].map((v) => v.toString(16).padStart(2, '0')).join('')
  })
  // 第三趟：写入（图纸像素层与豆子层同色，所见即所得）
  for (let r = 0; r < ny; r++) {
    const gr = offR + (ny - 1 - r)
    for (let c = 0; c < nx; c++) {
      const gc = offC + (nx - 1 - c)
      const [sr, sg, sb] = cellSamples[r][c]
      const key = `${Math.round(sr)},${Math.round(sg)},${Math.round(sb)}`
      const hex = repHex[keyToCluster.get(key)!]
      store.grid[gr][gc].pixel = hex
      store.grid[gr][gc].color = hex
      // 豆子为空心圆柱（与手动放豆一致），从 melt=0 开始：颜色与熔融解耦，
      // 顶环无光照渲染色=图纸色，不会随熨烫变暗；熨烫压扁、孔闭合后颜色不变，
      // 无需靠熨烫「找颜色」
    }
  }

  finishImport('ironing', `已从图纸生成 ${nx}×${ny} 豆子，颜色与图纸一致，可熨烫压平`)
  return true
}

/** 清空全部格子（珠子 + 图纸像素），导入写新图前调用 */
function clearGrid() {
  for (const row of store.grid) for (const cell of row) clearCellContent(cell)
}

/** 导入写入完成后的统一收尾：切换模式、失效珠子/图纸两层缓存、请求视角归中、提示文案 */
function finishImport(mode: 'ironing' | 'design', text: string) {
  switchMode(mode)
  store.gridVersion++ // 图纸写入完成，通知画布静态层缓存失效
  store.patternVersion++ // 图纸层重写，通知画布重建图纸实例
  store.fitViewTick++ // 导入完成，通知 3D 自动适配视角（整个棋盘入镜）
  showStatus(text)
}

/** 拉取内置 webp 图纸并按 beads 模式导入（自动识别 40×40 网格铺好豆子）。
 *  图纸选择器 / 图纸库共用；失败时抛出，由调用方负责 loading 复位与报错 toast */
export async function importWebpPattern(src: string, filename?: string) {
  const res = await fetch(src)
  if (!res.ok) throw new Error(res.statusText)
  const file = new File([await res.blob()], filename ?? src.split('/').pop()!, { type: 'image/webp' })
  importImage(file, 'beads')
}

export function importImage(file: File, mode: ImportMode) {
  showStatus('正在读取图片...')
  const url = URL.createObjectURL(file)
  const img = new Image()

  img.onload = () => {
    // 直接变成豆子：优先精确网格识别（标准图纸 1:1 还原）
    if (mode === 'beads' && importGridBeads(img)) {
      URL.revokeObjectURL(url)
      return
    }
    if (mode === 'beads') {
      showStatus('未检测到网格线，按普通方式识别图片...')
    }

    const ir = img.width / img.height
    let pw: number
    let ph: number
    if (ir >= 1) {
      pw = MAX_PIX
      ph = Math.max(1, Math.round(MAX_PIX / ir))
    } else {
      ph = MAX_PIX
      pw = Math.max(1, Math.round(MAX_PIX * ir))
    }

    clearGrid()

    const oc = document.createElement('canvas')
    oc.width = pw
    oc.height = ph
    const octx = oc.getContext('2d')!
    octx.imageSmoothingEnabled = true
    octx.drawImage(img, 0, 0, pw, ph)
    const data = octx.getImageData(0, 0, pw, ph).data

    const offC = Math.floor((store.cols - pw) / 2)
    const offR = Math.floor((store.rows - ph) / 2)
    for (let r = 0; r < ph; r++) {
      // 相机从近侧俯视棋盘：屏幕上的左右/上下与 grid 行列都相反（整图 180° 镜像），
      // 导入时行列一起翻转，否则图纸在棋盘上会是倒置的
      const gr = offR + (ph - 1 - r)
      for (let c = 0; c < pw; c++) {
        const gc = offC + (pw - 1 - c)
        const i = (r * pw + c) * 4
        if (data[i + 3] < 128) continue
        const best = nearestColor(data[i], data[i + 1], data[i + 2])
        store.grid[gr][gc].pixel = COLORS[best]
        // 直接变豆子：自动铺好色块；豆子为空心圆柱（与手动放豆一致），顶环
        // 无光照渲染色=图纸色，熨烫压扁后颜色不变（颜色与熔融解耦）
        if (mode === 'beads') {
          store.grid[gr][gc].color = COLORS[best]
        }
      }
    }

    finishImport(
      mode === 'beads' ? 'ironing' : 'design',
      mode === 'beads' ? '豆子已自动铺好，颜色与图纸一致，可熨烫压平' : '导入完成：拼豆图纸，可对照放豆',
    )
    URL.revokeObjectURL(url)
  }

  img.onerror = () => {
    showStatus('图片加载失败')
    URL.revokeObjectURL(url)
  }

  img.src = url
}
