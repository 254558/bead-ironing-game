import { computed, markRaw, reactive } from 'vue'
import type { Cell, IronCenter, Mode, MouseState } from '../types'
import { CELL, COLORS, DISPLAY_CELL } from '../utils/color'

/** 网格上限（防止极端缩放下内存/遍历失控） */
export const MAX_GRID = 200

/** 状态提示（toast）显示时长：game 的 status 隐藏与 StatusBar 的 toast life 共用 */
export const STATUS_DISPLAY_MS = 3500

function createGrid(cols: number, rows: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ color: null, melt: 0, pixel: null })),
  )
}

/** 全局共享状态：网格 / 模式 / 鼠标 / 进度等 */
export const store = reactive({
  cols: 30,
  rows: 30,
  /** 网格内容：markRaw 脱离深度代理（无任何 UI 模板读取格子，变化经 gridVersion 手动失效）。
   *  否则最大 200×200=4 万格 × 每格对象都会被 reactive 深代理——扩容/熨烫每帧写穿
   *  Proxy setter，纯开销无收益 */
  grid: markRaw(createGrid(30, 30)) as Cell[][],
  /** 网格内容版本号：任何珠子/图纸变更时 +1，供画布静态层缓存失效检测 */
  gridVersion: 0,
  /** 图纸（pixel 层）版本号：仅导入/清空/载入时 +1。
   *  与 gridVersion 分开：放豆/擦除只改珠子层，不必重建图纸实例 */
  patternVersion: 0,
  mode: 'design' as Mode,
  /** 图纸选择器开关（点「图纸」打开：可导入本地图片当图纸参考，或从 38 张内置图纸挑一张自动放豆） */
  showPatternPicker: false,
  /** 图纸库：宝可梦卡牌全息效果参考页（全屏 iframe），打开时盖住整个应用 */
  cardsView: false,
  mouse: { x: -1, y: -1, down: false } as MouseState,
  /** 熨烫中心：游标小人的脚踩到的地面点（脚的位置 = 鼠标 + 图标脚偏移），脚踩到哪就烫到哪 */
  iron: { x: -1, y: -1 } as IronCenter,
  /** 默认选中色取亮色区（#a7f070 两侧是黄/绿）：轮盘选中项的前后邻居会竖着排成一条列，
   *  若默认选深色（藏青+深紫+暗红）会像一条黑色竖线；选亮绿可让所有深色至少距选中项 3 格 */
  selectedColor: COLORS[5],
  isEraser: false,
  /** 视角工具：隐藏棋盘线，左键拖拽旋转视角、WASD 移动视角；关闭时恢复放豆（相机视角保持不变） */
  viewMode: false,
  status: '',
  statusVisible: false,
  /** 窗口 resize 后 +1，通知画布/3D 重新适配 */
  resizeTick: 0,
  /** 导入图纸成功后 +1，通知 3D 自动调整视角让整个棋盘完整入镜（豆子太多超出视野时不用手动缩小） */
  fitViewTick: 0,
})

/** 存在任意珠子（熨烫按钮可用）。
 *  grid 已 markRaw 脱离响应式，改依赖 gridVersion（内容任何变化都 +1）触发重算 */
export const hasBeads = computed(() => {
  void store.gridVersion
  return store.grid.some((row) => row.some((c) => c.color !== null))
})

let statusTimer: ReturnType<typeof setTimeout> | undefined

export function showStatus(text: string) {
  store.status = text
  store.statusVisible = true
  clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    store.statusVisible = false
  }, STATUS_DISPLAY_MS)
}

/**
 * 无限画布：网格按需扩容到覆盖视口（只增不减、保留已有内容，在右/下侧追加空行/列），
 * 供滚轮缩放 / 平移 / 窗口变化时保证视口内有格子可放豆。
 */
export function expandGridKeep(minCols: number, minRows: number) {
  const nc = Math.min(MAX_GRID, Math.max(store.cols, Math.ceil(minCols)))
  const nr = Math.min(MAX_GRID, Math.max(store.rows, Math.ceil(minRows)))
  if (nc === store.cols && nr === store.rows) return
  const g = createGrid(nc, nr)
  for (let r = 0; r < store.rows; r++)
    for (let c = 0; c < store.cols; c++) g[r][c] = store.grid[r][c]
  store.grid = markRaw(g)
  store.cols = nc
  store.rows = nr
  store.gridVersion++ // 网格线数量变化，静态层缓存失效
}

/**
 * 窗口/容器尺寸变化 → 把网格扩容到覆盖视口（内容坐标不变，只追加空行/列）。
 * 视口状态由 three/board.ts 维护（scale=1 时每格 DISPLAY_CELL 显示像素），
 * 这里按默认缩放的可见格数估算，棋盘渲染器随后会按实际可见范围再次扩容。
 */
export function setupGrid(w: number, h: number) {
  expandGridKeep(Math.ceil(w / DISPLAY_CELL), Math.ceil(h / DISPLAY_CELL))
}

/** 图片导入时按需扩容画布（调用方随后会覆盖全部格子） */
export function expandGrid(minCols: number, minRows: number) {
  if (store.cols < minCols || store.rows < minRows) {
    store.cols = Math.max(store.cols, minCols)
    store.rows = Math.max(store.rows, minRows)
    store.grid = markRaw(createGrid(store.cols, store.rows))
  }
}

export function getCellAt(x: number, y: number): { r: number; c: number } | null {
  const c = Math.floor(x / CELL)
  const r = Math.floor(y / CELL)
  return r < 0 || r >= store.rows || c < 0 || c >= store.cols ? null : { r, c }
}

/** 橡皮擦除范围：以命中格为基准，向上 2 格、向下 3 格（6×6），越界自动裁剪 */
const ERASE_HALF_UP = 2
const ERASE_SIZE = 6

/** 擦除以 (r0, c0) 为基准的 6×6 区域（内容实际变化时递增 gridVersion，供缓存失效） */
function eraseArea(r0: number, c0: number) {
  const r1 = Math.max(0, r0 - ERASE_HALF_UP)
  const r2 = Math.min(store.rows - 1, r0 - ERASE_HALF_UP + ERASE_SIZE - 1)
  const c1 = Math.max(0, c0 - ERASE_HALF_UP)
  const c2 = Math.min(store.cols - 1, c0 - ERASE_HALF_UP + ERASE_SIZE - 1)
  let changed = false
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++) {
      const cell = store.grid[r][c]
      if (cell.color === null) continue
      cell.color = null
      cell.melt = 0
      changed = true
    }
  if (changed) {
    store.gridVersion++
  }
}

/** 画布坐标放置珠子 / 橡皮擦除（内容实际变化时递增 gridVersion，供缓存失效） */
export function placeBead(x: number, y: number) {
  const cell = getCellAt(x, y)
  if (!cell) return
  if (store.isEraser) {
    eraseArea(cell.r, cell.c)
    return
  }
  const target = store.grid[cell.r][cell.c]
  if (target.color === store.selectedColor) {
    // 同色豆被烫过（melt>0）：放豆重置熔融——让「放豆」能修复烫糊的珠子
    if (target.melt !== 0) {
      target.melt = 0
      store.gridVersion++
    }
    return
  }
  target.color = store.selectedColor
  target.melt = 0
  store.gridVersion++
}

/** 右键擦除：精细擦除，只删除命中的 1 颗豆（区别于橡皮工具的 6×6 区域） */
export function eraseCell(r: number, c: number) {
  if (r < 0 || r >= store.rows || c < 0 || c >= store.cols) return
  const cell = store.grid[r][c]
  if (cell.color === null) return
  cell.color = null
  cell.melt = 0
  store.gridVersion++
}

/** 清空格子全部内容（珠子 + 熔融 + 图纸像素）：清空画布与图片导入共用 */
export function clearCellContent(cell: Cell) {
  cell.color = null
  cell.melt = 0
  cell.pixel = null
}

export function switchMode(m: Mode) {
  store.mode = m
  // 视角工具只在设计模式使用，切走时关闭
  if (m !== 'design') store.viewMode = false
  // 切回设计模式：全部珠子恢复未熔融；若在视角调整中，点「设计」退出视角工具（相机视角保留，可继续放豆）
  let msg = '点击/拖拽放置拼豆'
  if (m === 'design') {
    if (store.viewMode) {
      store.viewMode = false
      msg = '回到设计：视角已保留，可继续放豆'
    }
    let touched = false
    for (const row of store.grid)
      for (const cell of row)
        if (cell.melt > 0) {
          cell.melt = 0
          touched = true
        }
    if (touched) {
      store.gridVersion++
    }
  } else {
    msg = '按住拖动来熨烫'
  }
  showStatus(msg)
}

export function selectColor(hex: string) {
  store.selectedColor = hex
  store.isEraser = false
}

export function toggleEraser() {
  store.isEraser = !store.isEraser
}
