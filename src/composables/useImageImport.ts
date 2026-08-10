import { expandGrid, markDirty, MAX_GRID, showStatus, store, switchMode } from '../stores/game'
import { COLORS, COLORS_RGB, MAX_PIX } from '../utils/color'
import type { ImportMode } from '../types'

/**
 * 图片导入 → 拼豆图纸。
 * - pattern：只做图纸，对照手动放豆；放下的珠子覆盖图纸格，擦除即露出图纸。
 * - beads：优先「从图纸生成豆子」——检测标准网格图纸（如 40×40），逐格取中心色
 *   精确生成豆子；检测不到网格时回退到逐像素缩放识别。
 * 尺寸超出当前画布时自动扩容。
 */

/** 网格线行：平均灰度比前后行显著更暗（网格线比格子深；阈值取小，靠下方均匀性校验兜底） */
const LINE_DARK_DIFF = 5

/** 调色板最近色（加权 RGB 距离） */
function nearestColor(cr: number, cg: number, cb: number): number {
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
 * 3) 中心色量化到调色板，写入 pixel + color。
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

  expandGrid(nx, ny)
  for (const row of store.grid)
    for (const cell of row) {
      cell.color = null
      cell.melt = 0
      cell.pixel = null
    }

  // 相机从近侧俯视棋盘：整图 180° 镜像翻转（与普通识别一致），否则图纸在棋盘上倒置
  const offC = Math.floor((store.cols - nx) / 2)
  const offR = Math.floor((store.rows - ny) / 2)
  // 按检测到的周期+相位直接取格子中心（3×3 平均抗噪），
  // 不依赖格子恰好铺满整图，比 2nx×2ny 最近邻缩放更准
  const TC = vg!.T
  const TR = hg!.T
  const phC = vg!.phase
  const phR = hg!.phase
  for (let r = 0; r < ny; r++) {
    const gr = offR + (ny - 1 - r)
    const cy = Math.round(phR + (r + 0.5) * TR)
    for (let c = 0; c < nx; c++) {
      const gc = offC + (nx - 1 - c)
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
      const best = nearestColor(sr / cnt, sg / cnt, sb / cnt)
      store.grid[gr][gc].pixel = COLORS[best]
      store.grid[gr][gc].color = COLORS[best]
    }
  }

  switchMode('ironing')
  store.gridVersion++ // 图纸写入完成，通知画布静态层缓存失效
  markDirty()
  showStatus(`已从图纸生成 ${nx}×${ny} 豆子，按住拖动熨烫`)
  return true
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
    if (mode === 'beads') showStatus('未检测到网格线，按普通方式识别图片...')

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

    expandGrid(pw, ph)

    for (const row of store.grid)
      for (const cell of row) {
        cell.color = null
        cell.melt = 0
        cell.pixel = null
      }

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
        // 直接变豆子：自动铺好色块，导入完只需熨烫
        if (mode === 'beads') store.grid[gr][gc].color = COLORS[best]
      }
    }

    switchMode(mode === 'beads' ? 'ironing' : 'design')
    store.gridVersion++ // 图纸写入完成，通知画布静态层缓存失效
    markDirty()
    showStatus(
      mode === 'beads'
        ? '豆子已自动铺好，按住拖动熨烫'
        : '导入完成：拼豆图纸，可对照放豆',
    )
    URL.revokeObjectURL(url)
  }

  img.onerror = () => {
    showStatus('图片加载失败')
    URL.revokeObjectURL(url)
  }

  img.src = url
}
