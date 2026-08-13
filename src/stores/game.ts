import { computed, markRaw, reactive } from 'vue'
import type { Cell, IronCenter, Mode, MouseState } from '../types'
import { CELL, COLORS } from '../utils/color'

/** 网格上限：固定 40×40 画布（不随视口/图片扩容），超出部分为工作台深色区域 */
export const MAX_GRID = 40

/** 状态提示（toast）显示时长：game 的 status 隐藏与 StatusBar 的 toast life 共用 */
export const STATUS_DISPLAY_MS = 3500

function createGrid(cols: number, rows: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ color: null, melt: 0, pixel: null })),
  )
}

/** 全局共享状态：网格 / 模式 / 鼠标 / 进度等 */
export const store = reactive({
  cols: 40,
  rows: 40,
  /** 网格内容：markRaw 脱离深度代理（无任何 UI 模板读取格子，变化经 gridVersion 手动失效）。
     *  否则最大 200×200=4 万格 × 每格对象都会被 reactive 深代理——扩容/熨烫每帧写穿
     *  Proxy setter，纯开销无收益 */
  grid: markRaw(createGrid(40, 40)) as Cell[][],
  /** 网格内容版本号：任何珠子/图纸变更时 +1，供画布静态层缓存失效检测 */
  gridVersion: 0,
  /** 图纸（pixel 层）版本号：仅导入/清空/载入时 +1。
   *  与 gridVersion 分开：放豆/擦除只改珠子层，不必重建图纸实例 */
  patternVersion: 0,
  mode: 'design' as Mode,
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
  /** 视角归中请求：导入图纸成功后 +1（自动调整视角让整个棋盘入镜）；点「设计」也 +1
   *  （即使已处于设计模式——mode 值不变 watch 不触发，靠 tick 变化让 3D 下一帧兜底归中） */
  fitViewTick: 0,
})

/** 存在任意珠子（熨烫按钮可用）。
 *  grid 已 markRaw 脱离响应式，改依赖 gridVersion（内容任何变化都 +1）触发重算 */
export const hasBeads = computed(() => {
  void store.gridVersion
  return store.grid.some((row) => row.some((c) => c.color !== null))
})

/** 设计放豆模式（非视角工具）：画布放豆/擦除操作可用 */
export const isDesignView = computed(() => store.mode === 'design' && !store.viewMode)

let statusTimer: ReturnType<typeof setTimeout> | undefined

export function showStatus(text: string) {
  store.status = text
  store.statusVisible = true
  clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    store.statusVisible = false
  }, STATUS_DISPLAY_MS)
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
  if (target.color === store.selectedColor) return
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
  // 熔融状态在模式间保持（颜色与熔融解耦后无需复位）：切回设计只处理视角工具退出与画布归中
  let msg = '点击/拖拽放置拼豆'
  if (m === 'design') {
    if (store.viewMode) {
      store.viewMode = false
      msg = '回到设计：画布已居中'
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
