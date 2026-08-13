/** 布局与物理常量 */
export const CELL = 14
export const DISPLAY_CELL = 36
/** 熨烫半径（×14 单位 ≈ 格数）：≈7 格，以熨斗图标中心为圆心，覆盖约 15×15 格 */
export const IRON_RADIUS = 98
export const FUSE_MAX = 0.7
/** 孔洞完全闭合的熔融下限：烫到此处起珠子无孔，保持到烫糊前（「刚好」容错区间） */
export const FUSE_SEALED = 0.5
/** 豆子烫糊阈值：烫过此值视为烫糊，珠子整体压暗 */
export const BURN = 0.85
export const IRON_SPEED = 1.0
/** 图片导入后图案最长边（格数）：画布固定 40×40，图案最长边不超过画布，居中写入 */
export const MAX_PIX = 40

/** 调色板（原应用完整颜色表） */
export const COLORS = [
  '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
  '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#a5aab0', '#566c86', '#333c57',
  '#000000', '#ffffff', '#ff004d', '#ff77a8', '#ffa300', '#ffec27', '#00e436', '#29adff',
  '#83769c', '#ffccaa', '#c2c3c7', '#7e2553', '#008751', '#ab5236', '#5f574f', '#ff6e27',
]

function hexToRgb(h: string): [number, number, number] {
  if (h.startsWith('rgb')) {
    const m = h.match(/\d+/g)!
    return [Number(m[0]), Number(m[1]), Number(m[2])]
  }
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]
}

/** 颜色调亮(a>0)/调暗(a<0)，与原实现一致 */
export function shade(h: string, a: number): string {
  let [r, g, b] = hexToRgb(h)
  if (a < 0) {
    r *= 1 + a
    g *= 1 + a
    b *= 1 + a
  } else {
    r += (255 - r) * a
    g += (255 - g) * a
    b += (255 - b) * a
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`
}

/** 珠子尺寸/反光的确定性伪随机散列 */
export function beadHash(r: number, c: number): number {
  return ((r * 73 + c * 37 + r * c * 13) % 100) / 100
}

export const COLORS_RGB = COLORS.map(hexToRgb)
