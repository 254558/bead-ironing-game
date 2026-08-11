import { computed, reactive } from 'vue'
import type { BeadSize, Cell, ImportMode, IronCenter, Mode, MouseState, SavedBoard } from '../types'
import { CELL, COLORS } from '../utils/color'
import { renderThumb } from '../utils/thumbnail'

const STORAGE_KEY = 'bead-iron.savedBoards'

/** 网格上限（防止极端缩放下内存/遍历失控） */
export const MAX_GRID = 200

/** 生成作品缩略图 PNG dataURL（离屏 canvas，当前 renderThumb 规则） */
function regenerateThumb(grid: Cell[][]): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx) renderThumb(ctx, grid)
  return canvas.toDataURL('image/png')
}

/** 从 localStorage 读取已保存的作品（容错：损坏/不可用时返回空列表，兼容旧冰箱贴数据） */
function loadSavedBoards(): SavedBoard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    // 只取核心字段，忽略旧的 x/y/rotation/scale 姿态；
    // 缩略图统一按当前高清规则重新生成（旧数据分辨率低，升级避免放大发糊）
    return (list as SavedBoard[]).map((b) => ({
      id: b.id,
      name: typeof b.name === 'string' ? b.name : '作品',
      cols: b.cols,
      rows: b.rows,
      grid: b.grid,
      thumb: regenerateThumb(b.grid),
      savedAt: typeof b.savedAt === 'number' ? b.savedAt : 0,
    }))
  } catch {
    return []
  }
}

function persistBoards() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.savedBoards))
  } catch {
    /* 存储超限等场景静默失败 */
  }
}

function createGrid(cols: number, rows: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ color: null, melt: 0, pixel: null })),
  )
}

/* ---------- 自动保存（每 5 秒 + 关页面前，防止误触/刷新丢豆子） ---------- */

const AUTOSAVE_KEY = 'bead-iron.autosave'

interface AutosaveState {
  cols: number
  rows: number
  grid: Cell[][]
  savedAt: number
}

/** 从 localStorage 读取自动存档（容错：损坏/为空时返回 null） */
function readAutosave(): AutosaveState | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as AutosaveState
    if (!d || !Array.isArray(d.grid) || d.grid.length === 0 || !Array.isArray(d.grid[0])) return null
    // 恢复时统一回设计模式：熔融度清零，豆子颜色与图纸像素保留
    return {
      cols: d.cols,
      rows: d.rows,
      grid: d.grid.map((row) =>
        row.map((c) => ({ color: c.color ?? null, melt: 0, pixel: c.pixel ?? null })),
      ),
      savedAt: d.savedAt,
    }
  } catch {
    return null
  }
}

/** 启动时的自动存档（存在则整体恢复，防止刷新后丢豆） */
const autosave = readAutosave()

/** 全局共享状态：网格 / 模式 / 鼠标 / 进度等 */
export const store = reactive({
  cols: autosave?.cols ?? 30,
  rows: autosave?.rows ?? 30,
  grid: (autosave?.grid ?? createGrid(30, 30)) as Cell[][],
  /** 网格内容版本号：任何珠子/图纸变更时 +1，供画布静态层缓存失效检测 */
  gridVersion: 0,
  mode: 'design' as Mode,
  /** 豆子规格：大豆 5mm（新手/手摆）／迷你豆 2.6mm（像素精细、更易烫糊） */
  beadSize: 'big' as BeadSize,
  /** 导入图片的两种方式：图纸（像素参考层，自己放豆）／直接变豆子（自动铺好，只需熨烫） */
  importMode: 'pattern' as ImportMode,
  /** 导入方式选择对话框开关（点「导入」后先问怎么导） */
  showImportDialog: false,
  /** 内置图纸选择器开关（点「导入」→「从内置图纸选」后打开，从 38 张图纸挑一张自动放豆） */
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
  /** 已保存的作品列表（localStorage 持久化，点「恢复」展示） */
  savedBoards: loadSavedBoards(),
  /** 作品列表显示开关（覆盖在画布上） */
  showSavePanel: false,
  /** 本次启动从自动存档恢复了上次进度（用于提示） */
  restoredFromAutosave: autosave !== null,
})

/** 存在任意珠子（熨烫按钮可用） */
export const hasBeads = computed(() =>
  store.grid.some((row) => row.some((c) => c.color !== null)),
)

let statusTimer: ReturnType<typeof setTimeout> | undefined

export function showStatus(text: string) {
  store.status = text
  store.statusVisible = true
  clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    store.statusVisible = false
  }, 3500)
}

/** 画布上是否已有内容（豆子或导入的图纸像素），有内容时 resize/自动保存不覆盖 */
function hasContent(): boolean {
  return store.grid.some((row) => row.some((c) => c.color !== null || c.pixel !== null))
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
  store.grid = g
  store.cols = nc
  store.rows = nr
  store.gridVersion++ // 网格线数量变化，静态层缓存失效
  markDirty()
}

/**
 * 窗口/容器尺寸变化 → 把网格扩容到覆盖视口（内容坐标不变，只追加空行/列）。
 * 视口状态由 three/board.ts 维护（scale=1 时每格 DISPLAY_CELL 显示像素），
 * 这里按默认缩放的可见格数估算，棋盘渲染器随后会按实际可见范围再次扩容。
 */
export function setupGrid(w: number, h: number) {
  expandGridKeep(Math.ceil(w / 36), Math.ceil(h / 36))
}

/** 图片导入时按需扩容画布（调用方随后会覆盖全部格子） */
export function expandGrid(minCols: number, minRows: number) {
  if (store.cols < minCols || store.rows < minRows) {
    store.cols = Math.max(store.cols, minCols)
    store.rows = Math.max(store.rows, minRows)
    store.grid = createGrid(store.cols, store.rows)
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
export function eraseArea(r0: number, c0: number) {
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
    markDirty()
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
  markDirty()
}

/** 右键擦除：精细擦除，只删除命中的 1 颗豆（区别于橡皮工具的 6×6 区域） */
export function eraseCell(r: number, c: number) {
  if (r < 0 || r >= store.rows || c < 0 || c >= store.cols) return
  const cell = store.grid[r][c]
  if (cell.color === null) return
  cell.color = null
  cell.melt = 0
  store.gridVersion++
  markDirty()
}

export function clearAll() {
  for (const row of store.grid)
    for (const cell of row) {
      cell.color = null
      cell.melt = 0
      cell.pixel = null
    }
  store.gridVersion++
  markDirty()
  switchMode('design')
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
      markDirty()
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

/** 切换豆子规格（5mm / 2.6mm）：几何体与珠体尺寸变化 → gridVersion++ 触发棋盘重建 */
export function setBeadSize(size: BeadSize) {
  if (store.beadSize === size) return
  store.beadSize = size
  store.gridVersion++
  markDirty()
  showStatus(
    size === 'big'
      ? '大豆 5mm：新手友好，可手拿摆放'
      : '迷你豆 2.6mm：像素精细，熨烫更容易糊边',
  )
}

export function toggleEraser() {
  store.isEraser = !store.isEraser
}

/* ---------- 作品存档（可保存多幅，点「恢复」列表取回） ---------- */

/** 把当前画布保存为一幅新作品（自动命名 + 缩略图），并打开列表即时反馈 */
export function saveBoard() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const name = `作品 ${store.savedBoards.length + 1}`
  const grid = store.grid.map((row) => row.map((cell) => ({ ...cell })))
  store.savedBoards.push({
    id,
    name,
    cols: store.cols,
    rows: store.rows,
    grid,
    thumb: regenerateThumb(grid),
    savedAt: Date.now(),
  })
  persistBoards()
  store.showSavePanel = true
  showStatus(`已保存「${name}」`)
}

/** 把列表中的一幅作品整表载入画布（保留熔融度，不走 switchMode） */
export function loadBoard(id: string) {
  const board = store.savedBoards.find((b) => b.id === id)
  if (!board) return
  store.cols = board.cols
  store.rows = board.rows
  store.grid = board.grid.map((row) => row.map((cell) => ({ ...cell })))
  store.gridVersion++
  markDirty()
  store.mode = 'design' // 直接赋值：避免 switchMode 清零 melt
  store.showSavePanel = false
  showStatus(`已载入「${board.name}」`)
}

export function deleteBoard(id: string) {
  store.savedBoards = store.savedBoards.filter((b) => b.id !== id)
  persistBoards()
}

export function setSavePanel(show: boolean) {
  store.showSavePanel = show
}

/* ---------- 自动保存（每 5 秒 + 关页面前，防止误触/刷新丢豆子） ---------- */

const AUTOSAVE_INTERVAL = 5000

/** 内容脏标记：放豆/擦除/熨烫/导入/清空/载入等真实内容变化后置位，空闲时自动保存零开销 */
let contentDirty = false

/** 标记画布内容发生变化（供 autosaveNow 判断是否需要写入） */
export function markDirty() {
  contentDirty = true
}

/** 把当前画布整体写入自动存档（空板不覆盖旧档，保证误触清空后仍能找回） */
export function autosaveNow() {
  if (!contentDirty) return
  contentDirty = false
  if (!hasContent()) return
  try {
    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({ cols: store.cols, rows: store.rows, grid: store.grid, savedAt: Date.now() } as AutosaveState),
    )
  } catch {
    /* 存储超限等场景静默失败 */
  }
}

let autoTimer: ReturnType<typeof setInterval> | undefined

/** 启动自动保存：定时写入 + 关闭页面/刷新前兜底写一次 */
export function startAutosave() {
  stopAutosave()
  autoTimer = setInterval(autosaveNow, AUTOSAVE_INTERVAL)
  window.addEventListener('beforeunload', autosaveNow)
}

export function stopAutosave() {
  if (autoTimer) clearInterval(autoTimer)
  autoTimer = undefined
  window.removeEventListener('beforeunload', autosaveNow)
}
