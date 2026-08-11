import { computed, markRaw, reactive } from 'vue'
import type { Cell, ImportMode, IronCenter, Mode, MouseState, SavedBoard } from '../types'
import { CELL, COLORS, DISPLAY_CELL } from '../utils/color'
import { renderThumb } from '../utils/thumbnail'

const STORAGE_KEY = 'bead-iron.savedBoards'

/** 网格上限（防止极端缩放下内存/遍历失控） */
export const MAX_GRID = 200

/** 状态提示（toast）显示时长：game 的 status 隐藏与 StatusBar 的 toast life 共用 */
export const STATUS_DISPLAY_MS = 3500

/** 生成作品缩略图 PNG dataURL（离屏 canvas，当前 renderThumb 规则） */
function regenerateThumb(grid: Cell[][]): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx) renderThumb(ctx, grid)
  return canvas.toDataURL('image/png')
}

/** 作品持久化用稀疏格式：只存非空格子（放豆的格子存 color+melt，未放豆但有图纸参考的存 pixel）。
 *  缩略图不落盘——载入时统一 regenerateThumb 重新生成，避免每幅几 KB~几十 KB 的冗余 dataURL 占配额 */
interface SavedBoardStored {
  id: string
  name: string
  cols: number
  rows: number
  cells: { r: number; c: number; color?: string; melt?: number; pixel?: string | null }[]
  savedAt: number
}

/** 作品 → 稀疏存储格式（内容与 autosave 同源策略：只序列化占用格子，防 5MB 配额爆仓静默丢档） */
function serializeBoard(b: SavedBoard): SavedBoardStored {
  const cells: SavedBoardStored['cells'] = []
  for (let r = 0; r < b.rows; r++) {
    const row = b.grid[r]
    if (!row) continue
    for (let c = 0; c < b.cols; c++) {
      const cell = row[c]
      if (!cell) continue
      // 占用格子即存（color 与 pixel 双图层都保留：豆子铺在图案上时两层都要还原）
      if (cell.color !== null || cell.pixel !== null) {
        const s: SavedBoardStored['cells'][number] = { r, c, pixel: cell.pixel }
        if (cell.color !== null) {
          s.color = cell.color
          s.melt = cell.melt
        }
        cells.push(s)
      }
    }
  }
  return { id: b.id, name: b.name, cols: b.cols, rows: b.rows, cells, savedAt: b.savedAt }
}

/** 稀疏存储格式 → 完整网格作品（兼容旧版全量 grid 数据；grid 用 markRaw 脱离深度代理） */
function deserializeBoard(d: Partial<SavedBoardStored> & { grid?: Cell[][] }): SavedBoard | null {
  if (!d || typeof d.cols !== 'number' || typeof d.rows !== 'number' || d.cols <= 0 || d.rows <= 0) return null
  const grid = createGrid(Math.min(d.cols, MAX_GRID), Math.min(d.rows, MAX_GRID))
  if (Array.isArray(d.cells)) {
    for (const s of d.cells) {
      if (!s || s.r < 0 || s.r >= grid.length || s.c < 0 || !grid[0] || s.c >= grid[0].length) continue
      grid[s.r][s.c] = { color: s.color ?? null, melt: s.melt ?? 0, pixel: s.pixel ?? null }
    }
  } else if (Array.isArray(d.grid)) {
    // 旧版：全量二维网格
    for (let r = 0; r < Math.min(grid.length, d.grid.length); r++) {
      const row = d.grid[r]
      if (!Array.isArray(row)) continue
      for (let c = 0; c < Math.min(grid[r].length, row.length); c++) {
        const s = row[c]
        if (!s) continue
        grid[r][c] = { color: s.color ?? null, melt: s.melt ?? 0, pixel: s.pixel ?? null }
      }
    }
  }
  // 忽略旧的 x/y/rotation/scale 姿态；缩略图不在此生成——改为打开作品列表时统一
  // ensureBoardThumbs 补齐（旧数据分辨率低，升级避免放大发糊；启动不阻塞首帧）
  return {
    id: typeof d.id === 'string' ? d.id : `restored-${Date.now()}`,
    name: typeof d.name === 'string' ? d.name : '作品',
    cols: grid[0]!.length,
    rows: grid.length,
    grid: markRaw(grid),
    thumb: null,
    savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
  }
}

/** 从 localStorage 读取已保存的作品（容错：损坏/不可用时返回空列表，兼容旧全量数据） */
function loadSavedBoards(): SavedBoard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.map(deserializeBoard).filter((b): b is SavedBoard => b !== null)
  } catch {
    return []
  }
}

function persistBoards() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.savedBoards.map(serializeBoard)))
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
  /** 稀疏存储：只保留已占用格子（颜色或图纸像素非空）的坐标与内容，空板不写 */
  cells: AutosaveCell[]
  savedAt: number
}

interface AutosaveCell {
  r: number
  c: number
  color: string | null
  pixel: string | null
}

/**
 * 从 localStorage 读取自动存档并展开为完整网格（容错：损坏/为空时返回 null）。
 * 兼容新版稀疏 cells 与旧版全量 grid（旧数据恢复时熔融度同样清零）。
 * 返回结构与 store 初始化所需一致（autosave.grid 为展开后的完整网格）。
 */
function readAutosave(): { cols: number; rows: number; grid: Cell[][]; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<AutosaveState> & { grid?: Cell[][] }
    if (!d || typeof d.cols !== 'number' || typeof d.rows !== 'number' || d.cols <= 0 || d.rows <= 0) return null
    const grid = createGrid(Math.min(d.cols, MAX_GRID), Math.min(d.rows, MAX_GRID))
    const firstRow = grid[0]
    if (Array.isArray(d.cells)) {
      // 新版：稀疏单元格列表，逐格放回对应坐标
      for (const s of d.cells) {
        if (!s || s.r < 0 || s.r >= grid.length || s.c < 0 || !firstRow || s.c >= firstRow.length) continue
        grid[s.r][s.c] = { color: s.color ?? null, melt: 0, pixel: s.pixel ?? null }
      }
    } else if (Array.isArray(d.grid)) {
      // 旧版：全量二维网格（含 melt，恢复时统一清零）
      for (let r = 0; r < Math.min(grid.length, d.grid.length); r++) {
        const row = d.grid[r]
        if (!Array.isArray(row)) continue
        for (let c = 0; c < Math.min(grid[r].length, row.length); c++) {
          const s = row[c]
          if (!s) continue
          grid[r][c] = { color: s.color ?? null, melt: 0, pixel: s.pixel ?? null }
        }
      }
    } else {
      return null
    }
    // 恢复时统一回设计模式：熔融度清零（稀疏存储不保存 melt，旧全量数据同样清零）
    // createGrid 由 rows≥1 构造，首行必然存在
    return { cols: firstRow!.length, rows: grid.length, grid, savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0 }
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
  /** 网格内容：markRaw 脱离深度代理（无任何 UI 模板读取格子，变化经 gridVersion 手动失效）。
   *  否则最大 200×200=4 万格 × 每格对象都会被 reactive 深代理——扩容/熨烫每帧写穿
   *  Proxy setter，纯开销无收益 */
  grid: markRaw(autosave?.grid ?? createGrid(30, 30)) as Cell[][],
  /** 网格内容版本号：任何珠子/图纸变更时 +1，供画布静态层缓存失效检测 */
  gridVersion: 0,
  /** 图纸（pixel 层）版本号：仅导入/清空/载入时 +1。
   *  与 gridVersion 分开：放豆/擦除只改珠子层，不必重建图纸实例 */
  patternVersion: 0,
  mode: 'design' as Mode,
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
  store.grid = markRaw(g)
  store.cols = nc
  store.rows = nr
  store.gridVersion++ // 网格线数量变化，静态层缓存失效
  // 内容未变：不 markDirty（纯扩容不触发 autosave，恢复时按可见范围再扩即可）
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
  if (target.color === store.selectedColor) {
    // 同色豆被烫过（melt>0）：放豆重置熔融——让「放豆」能修复烫糊的珠子
    if (target.melt !== 0) {
      target.melt = 0
      store.gridVersion++
      markDirty()
    }
    return
  }
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

/** 清空格子全部内容（珠子 + 熔融 + 图纸像素）：清空画布与图片导入共用 */
export function clearCellContent(cell: Cell) {
  cell.color = null
  cell.melt = 0
  cell.pixel = null
}

export function clearAll() {
  for (const row of store.grid) for (const cell of row) clearCellContent(cell)
  store.gridVersion++
  store.patternVersion++ // 图纸层清空，通知画布重建图纸实例
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

export function toggleEraser() {
  store.isEraser = !store.isEraser
}

/* ---------- 作品存档（可保存多幅，点「恢复」列表取回） ---------- */

/** 把当前画布保存为一幅新作品（自动命名 + 缩略图），并打开列表即时反馈 */
export function saveBoard() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const name = `作品 ${store.savedBoards.length + 1}`
  const grid = markRaw(store.grid.map((row) => row.map((cell) => ({ ...cell }))))
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
  store.grid = markRaw(board.grid.map((row) => row.map((cell) => ({ ...cell }))))
  store.gridVersion++
  store.patternVersion++ // 图纸层整体替换，通知画布重建图纸实例
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

/** 补齐缺失的作品缩略图（作品列表打开时调用）：启动时 loadSavedBoards 不生成，
 *  首次展示列表才一次性按当前高清规则生成，避免首帧前同步跑离屏 canvas */
export function ensureBoardThumbs() {
  for (const b of store.savedBoards) if (b.thumb === null) b.thumb = regenerateThumb(b.grid)
}

/* ---------- 自动保存（每 5 秒 + 关页面前，防止误触/刷新丢豆子） ---------- */

const AUTOSAVE_INTERVAL = 5000

/** 内容脏标记：放豆/擦除/熨烫/导入/清空/载入等真实内容变化后置位，空闲时自动保存零开销 */
let contentDirty = false

/** 标记画布内容发生变化（供 autosaveNow 判断是否需要写入） */
export function markDirty() {
  contentDirty = true
}

/** 把当前画布写入自动存档（空板不覆盖旧档，保证误触清空后仍能找回）。
 *  稀疏存储：只序列化非空格子（{r,c,color,pixel}），不整表 JSON.stringify——
 *  全空画布 0 条记录，画满也远小于完整 40k 格网格。熔融度不存（恢复时本就清零） */
function autosaveNow() {
  if (!contentDirty) return
  contentDirty = false
  if (!hasContent()) return
  try {
    const cells: AutosaveState['cells'] = []
    for (let r = 0; r < store.rows; r++)
      for (let c = 0; c < store.cols; c++) {
        const cell = store.grid[r][c]
        if (cell.color !== null || cell.pixel !== null) cells.push({ r, c, color: cell.color, pixel: cell.pixel })
      }
    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({ cols: store.cols, rows: store.rows, cells, savedAt: Date.now() } as AutosaveState),
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
