import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { eraseCell, expandGridKeep, getCellAt, MAX_GRID, placeBead, store } from '../stores/game'
import { BURN, CELL, DISPLAY_CELL, FUSE_MAX, FUSE_SEALED, IRON_RADIUS, beadHash } from '../utils/color'
import {
  BEAD_HEIGHT,
  BEAD_SCALE,
  createEvaFilledMaterials,
  createEvaHollowMaterials,
  createFilledBeadGeometry,
  createFusedBeadGeometry,
  createHollowBeadGeometry,
} from './beadGeometry'
import clawdDizzyUrl from '../assets/clawd-dizzy.svg'

export interface ThreeBoardHandle {
  resize(): void
  /** 熨烫动画帧：局部更新鼠标周围珠子的熔融形态 */
  update(): void
  /** 珠子层变化（放豆/擦除/熔融跨形态边界）→ 下一帧合并重建珠子实例（rAF 去重，拖拽连发时每帧至多一次） */
  requestRebuild(): void
  /** 图纸层变化（导入/清空/载入，patternVersion++）→ 下一帧仅重建图纸实例（不重建珠子） */
  requestRebuildPattern(): void
  /** 同步立即重建珠子与图纸实例（初始渲染等不能延迟的场景） */
  rebuild(): void
  dispose(): void
}

/** 初始俯视角（视线与水平面夹角，°）与相机 fov */
const TILT_DEG = 55
const FOV = 50
/** 缩放范围（1 = 每格 DISPLAY_CELL 显示像素） */
const MIN_SCALE = 0.25
const MAX_SCALE = 12
/** 每格显示像素低于该值时隐藏网格线 */
const MIN_GRID_LINE_PX = 10
/** 视角旋转灵敏度（rad/px）与俯仰角可调范围（±89.5°，初始 55°）。
 *  配合无限制的 yaw，可环绕棋盘无死角观赏：上到头顶、下到板底。
 *  正负 90° 极点有万向锁（水平拖拽无效），各留 0.5° 余量即可 */
const ROT_SPEED = 0.006
const PITCH_MIN = (-89.5 * Math.PI) / 180
const PITCH_MAX = (89.5 * Math.PI) / 180
/** 设计模式放豆的最低俯仰角：相机低于板面时射线够不到 y=0 地面，点不中格子、WASD 失效 */
const DESIGN_PITCH_MIN = (3 * Math.PI) / 180
/** 熔融扁珠起始阈值：低于此值仍为空心珠，达到此值起转为带残留孔的熔融扁珠（FILL_MELT~FUSE_SEALED） */
const FILL_MELT = 0.35

/**
 * 拼豆棋盘渲染器：three.js 实时光照（EVA 哑光塑料材质），
 * 倾斜俯视角（可旋转）+ 无限画布（滚轮锚点缩放 / 拖拽平移，网格按需扩容）。
 * 世界坐标：X = 列 c、Z = 行 r、Y 向上，格子 (r,c) 中心 = (c, 0, r)。
 */
export function createThreeBoard(container: HTMLElement): ThreeBoardHandle {
  const scene = new THREE.Scene()
  // 背景深色：棋盘地面/背景一体（侧栏透明悬浮其上）。不用纯透明——
  // 有些浏览器的默认页面底色为白，透明处会露出白块
  scene.background = new THREE.Color(0x171a21)
  // 与背景同色的雾（仅设计模式工作台启用）：地面在远处（70~550 单位）平滑渐隐为背景色，
  // 消除低视角时地面与背景的硬交界（地平线）；棋盘在 50 单位内不受影响
  const fog = new THREE.Fog(0x171a21, 70, 550)
  scene.fog = fog

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 600)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  // pixelRatio 上限 1.5：retina 下帧缓冲像素减少约 44%，画面略软但高帧率更稳
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  // Neutral tone mapping：相比 ACES 不压缩高饱和色，拼豆颜色更浓郁
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  // OrbitControls 仅提供阻尼；旋转/平移/缩放全手写（保证无限画布行为）
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableRotate = false
  controls.enablePan = false
  controls.enableZoom = false
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  // 光照：房间环境贴图（侧面高光的来源）+ 低环境光 + 主光（阴影）+ 补光（暗面细节）。
  // 直射光只影响漫反射：顶部漫反射峰值必须 < 0.76（Neutral 色调映射的压缩起点），
  // 否则红色通道被压缩/去饱和，颜色发白。侧面的清漆高光由 envMap 独立提供，不受影响。
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.add(new THREE.AmbientLight(0xffffff, 0.18))
  const key = new THREE.DirectionalLight(0xffffff, 1.05)
  scene.add(key)
  scene.add(key.target) // 阴影相机跟随注视中心，无限画布平移后阴影不丢
  key.castShadow = true
  // 1024×1024：阴影 pass 更快，边缘更软；拼豆场景无细小投影细节，画质损失可忽略
  key.shadow.mapSize.set(1024, 1024)
  const SHADOW_RANGE = 150
  key.shadow.camera.left = -SHADOW_RANGE
  key.shadow.camera.right = SHADOW_RANGE
  key.shadow.camera.top = SHADOW_RANGE
  key.shadow.camera.bottom = -SHADOW_RANGE
  key.shadow.camera.near = 10
  key.shadow.camera.far = 300
  key.shadow.camera.updateProjectionMatrix()
  key.shadow.bias = -0.002
  const fill = new THREE.DirectionalLight(0xffffff, 0.15)
  scene.add(fill)
  fill.target = new THREE.Object3D()
  scene.add(fill.target) // 补光方向固定跟随注视中心，平移画布时光照一致

  // 工作台地面（深色，比背景略亮以区分平面，接收珠子的投影）；范围足够大，任何缩放下都盖住视口
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshStandardMaterial({ color: 0x21252d, roughness: 0.95, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.receiveShadow = true
  scene.add(ground)

  // 网格线：MAX_GRID 全范围一次构建，相机自动裁剪
  const linePts: number[] = []
  for (let i = 0; i <= MAX_GRID; i++) {
    linePts.push(i, 0, 0, i, 0, MAX_GRID)
    linePts.push(0, 0, i, MAX_GRID, 0, i)
  }
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3))
  // 网格线：深色地上用比地面亮的灰蓝。toneMapped:false 让线色按原值渲染——
  // 否则 Neutral 色调映射会把暗色压得更暗，网格线反而比地面暗、看不见
  const gridLines = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({ color: 0x505c74, toneMapped: false }),
  )
  gridLines.position.y = 0.005
  scene.add(gridLines)

  // 珠子几何体与 EVA 材质组（[0]=cap 顶/底面、[1]=外壁清漆、[2]=孔内壁哑光，配合 ExtrudeGeometry groups）
  const hollowGeo = createHollowBeadGeometry()
  const filledGeo = createFilledBeadGeometry()
  const fusedGeo = createFusedBeadGeometry()
  const hollowMats = createEvaHollowMaterials()
  const filledMats = createEvaFilledMaterials()
  let hollowMesh: THREE.InstancedMesh | null = null
  let filledMesh: THREE.InstancedMesh | null = null
  let fusedMesh: THREE.InstancedMesh | null = null

  // 图纸色块（导入图片的像素参考层，放豆后由珠子盖住）
  const patternGeo = new THREE.PlaneGeometry(0.98, 0.98)
  patternGeo.rotateX(-Math.PI / 2)
  const patternMat = new THREE.MeshBasicMaterial()
  let patternMesh: THREE.InstancedMesh | null = null

  // 悬停格子框（设计模式）
  const hoverBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.05, 1)),
    new THREE.LineBasicMaterial({ color: 0xef7d57, transparent: true, opacity: 0.95 }),
  )
  hoverBox.visible = false
  scene.add(hoverBox)
  // 熨斗光标：SVG 动画（眩晕小角色原地摇摆 + 星星绕头转）直接叠加在画布上方（不做 3D 投影），跟随鼠标
  const ironImg = document.createElement('img')
  ironImg.src = clawdDizzyUrl
  ironImg.alt = ''
  ironImg.style.cssText =
    'position:absolute;left:0;top:0;width:120px;height:auto;pointer-events:none;' +
    'transform:translate(-50%,-50%);display:none;z-index:2;'
  container.appendChild(ironImg)

  // 视角操作提示（进入视角调整拖拽时弹出，自动消失；pointer-events:none 不挡拖拽）
  const viewHint = document.createElement('div')
  viewHint.innerHTML =
    '<div style="font-size:13px;font-weight:600">WASD 可以移动 · 按住鼠标左键可以调整视角</div>' +
    '<div style="font-size:11px;opacity:.8;margin-top:4px">调整好后点「设计」按钮继续放豆（视角保持不变）</div>'
  viewHint.style.cssText =
    'position:absolute;top:26px;left:50%;transform:translateX(-50%);padding:10px 18px;' +
    'background:rgba(42,45,50,0.92);color:#fff;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,0.28);' +
    'text-align:center;white-space:nowrap;pointer-events:none;display:none;opacity:0;transition:opacity .25s;z-index:5;'
  container.appendChild(viewHint)
  let hintTimer: ReturnType<typeof setTimeout> | undefined

  function showViewHint() {
    viewHint.style.display = 'block'
    viewHint.style.opacity = '1'
    clearTimeout(hintTimer)
    hintTimer = setTimeout(() => {
      viewHint.style.opacity = '0'
      // 隐藏定时器也记入 hintTimer：拖拽中再次显示时能清掉，避免新提示被过早隐藏
      hintTimer = setTimeout(() => {
        viewHint.style.display = 'none'
      }, 260)
    }, 2600)
  }

  /** WASD/方向键平移视角：W/↑ 沿视线方向前后、A/D 与 ←/→ 沿屏幕左右（跟随当前 yaw），步长≈一格（默认缩放下 36px） */
  function onKeyDown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (store.mode !== 'design' || store.showSavePanel) return
    const fwd =
      e.code === 'KeyW' || e.code === 'ArrowUp' ? 1 : e.code === 'KeyS' || e.code === 'ArrowDown' ? -1 : 0
    const strafe =
      e.code === 'KeyD' || e.code === 'ArrowRight'
        ? 1
        : e.code === 'KeyA' || e.code === 'ArrowLeft'
          ? -1
          : 0
    if (fwd === 0 && strafe === 0) return
    e.preventDefault()
    const { w } = viewportSize()
    // 同时需要左右缘两个结果：分别用 _gpOut / _gpOut2，避免共享缓冲互相覆盖
    const pr = groundPoint(1, 0, _gpOut)!
    const pl = groundPoint(-1, 0, _gpOut2)!
    // 屏幕左右缘的地面距离 ÷ 屏宽 = 每像素地面步长；注意相机朝向不同时该差值为负，取绝对值。
    // 每按移动 36px（默认缩放下恰好一格），按住时系统自动连发
    const step = Math.max(1e-6, Math.abs(pr.x - pl.x) / w) * 36
    center.x += (fwd * -Math.sin(yaw) + strafe * Math.cos(yaw)) * step
    center.z += (fwd * -Math.cos(yaw) + strafe * -Math.sin(yaw)) * step
    applyView()
    ensureGridFitsViewport()
  }

  // 视口状态：缩放倍率 + 相机注视的地面中心（世界单位）
  let scale = 1
  let baseDist = 50
  const center = { x: 0, z: 0 }
  // 视角（球坐标）：yaw 绕 Y 轴（0 = 正 +Z 侧看），pitch 与水平面夹角。初始固定 55° 俯视
  let yaw = Math.PI
  let pitch = (TILT_DEG * Math.PI) / 180

  /** 珠子 instance 索引：key = r×MAX_GRID + c → (mesh, idx)，供熨烫局部更新 */
  const beadIndex = new Map<number, { mesh: THREE.InstancedMesh; idx: number }>()

  function viewportSize() {
    return { w: Math.max(1, container.clientWidth), h: Math.max(1, container.clientHeight) }
  }

  // 画布 rect 缓存：getBoundingClientRect 会强制同步布局，而 pointermove 挂在 window 上高频触发，
  // 每帧读一次等于每帧强制布局。改为缓存 + 失效：仅窗口 resize / 容器尺寸变化（ResizeObserver）时
  // 刷新；页面 body overflow:hidden 不滚动，缓存不会因滚动失效
  let canvasRect: DOMRect | null = null
  function cachedRect(): DOMRect {
    return canvasRect ?? (canvasRect = renderer.domElement.getBoundingClientRect())
  }
  function invalidateRect() {
    canvasRect = null
  }

  /** 标定 scale=1 时相机到注视点的距离，使每格显示 DISPLAY_CELL 像素 */
  function computeBaseDist(vh: number): number {
    const T = (TILT_DEG * Math.PI) / 180
    const a = ((FOV / 2) * Math.PI) / 180
    const f = Math.abs(1 / Math.tan(T + a) - 1 / Math.tan(T - a))
    const H = vh / (DISPLAY_CELL * f)
    return H / Math.sin(T)
  }

  // groundPoint 的 scratch 向量（与 writeInstance 共用 scratch 的模式一致）：pointermove 每帧
  // 多次射线求交，逐次新建 Vector3 会产生高频 GC。返回的 out（默认 _gpOut）是内部复用的缓冲，
  // 调用方必须在下一次 groundPoint 前消费完；需同时持有两个结果时（onKeyDown 的屏幕左右缘）用
  // _gpOut2 作为第二输出参数
  const _gpDir = new THREE.Vector3()
  const _gpOut = new THREE.Vector3()
  const _gpOut2 = new THREE.Vector3()

  /** 屏幕 NDC → 地面世界点（射线与 y=0 平面求交，精确） */
  function groundPoint(nx: number, ny: number, out: THREE.Vector3 = _gpOut): THREE.Vector3 | null {
    camera.updateMatrixWorld()
    _gpDir.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize()
    if (_gpDir.y >= -1e-4) return null
    const t = -camera.position.y / _gpDir.y
    return out.set(camera.position.x + _gpDir.x * t, 0, camera.position.z + _gpDir.z * t)
  }

  function groundFromClient(cx: number, cy: number, out: THREE.Vector3 = _gpOut): THREE.Vector3 | null {
    const rect = cachedRect()
    const nx = ((cx - rect.left) / rect.width) * 2 - 1
    const ny = -(((cy - rect.top) / rect.height) * 2 - 1)
    return groundPoint(nx, ny, out)
  }

  /** 熨斗游标（clawd-dizzy.svg）：img translate(-50%,-50%) 使图标中心始终位于鼠标点，
   *  熨烫面积以图标中心（即鼠标点正下方）为圆心，无需额外偏移。
   *  返回鼠标点的地面交点（_gpOut 缓冲），供调用方直接消费，避免同一事件重复射线求交 */
  function positionIron(cx: number, cy: number): THREE.Vector3 | null {
    const rect = cachedRect()
    ironImg.style.left = `${cx - rect.left}px`
    ironImg.style.top = `${cy - rect.top}px`
    const p = groundFromClient(cx, cy)
    store.iron.x = p ? p.x * CELL : -1
    store.iron.y = p ? p.z * CELL : -1
    return p
  }

  /** 按当前相机可见范围扩容网格（只增不减、保留内容），保证视口内有格子 */
  function ensureGridFitsViewport() {
    let maxX = -Infinity
    let maxZ = -Infinity
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const p = groundPoint(nx, ny)
      if (!p) continue
      maxX = Math.max(maxX, p.x)
      maxZ = Math.max(maxZ, p.z)
    }
    if (maxX === -Infinity) return
    expandGridKeep(Math.ceil(maxX) + 2, Math.ceil(maxZ) + 2)
  }

  /** 场景可见性：视角模式隐藏全部平面（地面/网格线/图纸），只看拼豆悬浮，转正面↔背面无任何面挡在中间；
   *  设计模式显示工作台供放豆，网格线再按缩放后每格的显示密度决定。
   *  返回可见性是否变化（供按需渲染判断） */
  function updateSceneVisibility(): boolean {
    const showBoard = !store.viewMode
    const showGrid = showBoard && DISPLAY_CELL * scale >= MIN_GRID_LINE_PX
    let changed = false
    if (gridLines.visible !== showGrid) {
      gridLines.visible = showGrid
      changed = true
    }
    if (ground.visible !== showBoard) {
      ground.visible = showBoard
      changed = true
    }
    if (patternMesh && patternMesh.visible !== showBoard) {
      patternMesh.visible = showBoard
      changed = true
    }
    const fogShown = showBoard
    if (fogShown !== (scene.fog === fog)) {
      scene.fog = fogShown ? fog : null
      changed = true
    }
    // 退出视角工具：WASD/拖拽提示若还挂着（自动隐藏前）立即收起并清掉定时器，不留残留
    if (showBoard && viewHint.style.display === 'block') {
      viewHint.style.display = 'none'
      viewHint.style.opacity = '0'
      clearTimeout(hintTimer)
    }
    return changed
  }

  /** 相机按当前 center/scale/yaw/pitch 定位（yaw=π、pitch=55° 时与初始固定视角一致） */
  function applyView() {
    const r = baseDist / scale
    const cp = Math.cos(pitch)
    camera.position.set(
      center.x + r * cp * Math.sin(yaw),
      r * Math.sin(pitch),
      center.z + r * cp * Math.cos(yaw),
    )
    controls.target.set(center.x, 0, center.z)
    controls.update()
    // 主光跟随注视中心，保持一致的阴影方向与覆盖范围
    key.position.set(center.x + 60, 120, center.z + 40)
    key.target.position.set(center.x, 0, center.z)
    // 补光从斜对面照向注视中心，填充暗面
    fill.position.set(center.x - 70, 70, center.z - 50)
    fill.target.position.set(center.x, 0, center.z)
    updateSceneVisibility()
    markRender()
  }

  /** 写入单个珠子 instance 的矩阵/颜色（熔融形态公式，按豆子规格缩放）。
   *  网格线在整数坐标，格子 (r,c) 的方格中心 = (c+0.5, r+0.5)——拼豆放在格子中间，一格一颗。 */
  // writeInstance / rebuildPattern 共用的 scratch 对象：setMatrixAt/setColorAt 都是拷贝写入，
  // 连续调用间无引用残留，可安全复用，避免熨烫帧内每次调用新建 5 个临时对象
  const scratchColor = new THREE.Color()
  const scratchPos = new THREE.Vector3()
  const scratchScale = new THREE.Vector3()
  const scratchQuat = new THREE.Quaternion()
  const scratchMatrix = new THREE.Matrix4()

  /** 本帧 update() 实际写入的 mesh 集合（clear 后复用，避免每帧新建 Set） */
  const touchedMeshes = new Set<THREE.InstancedMesh>()

  function writeInstance(mesh: THREE.InstancedMesh, idx: number, r: number, c: number, melt: number) {
    const { s, tol } = BEAD_SCALE
    // ±0.2mm 生产公差：按 hash 确定性抖动每颗豆的尺寸，大小略有参差
    const jitter = 1 + (beadHash(r, c) - 0.5) * 2 * tol
    const h = s * jitter * BEAD_HEIGHT * (1 - melt * 0.92)
    const rad = s * jitter * (0.48 + melt * 0.18)
    const col = scratchColor
    col.set(store.grid[r][c].color!)
    const pos = scratchPos
    pos.set(c + 0.5, h / 2, r + 0.5)
    const sc = scratchScale
    const q = scratchQuat
    const m4 = scratchMatrix
    if (mesh === filledMesh || mesh === fusedMesh) {
      // 熔融/完全熔融：圆角矩形压扁形态，随机轴向略微拉伸模拟融合方向
      const bh2 = beadHash(r, c)
      const ax = 0.94 + bh2 * 0.12
      const az = 0.94 + (1 - bh2) * 0.12
      sc.set(rad * ax, h, rad * az)
      if (melt > BURN) col.multiplyScalar(0.35)
      else if (melt > FUSE_MAX) col.multiplyScalar(0.78)
    } else {
      sc.set(rad, h, rad)
    }
    m4.compose(pos, q, sc)
    mesh.setMatrixAt(idx, m4)
    mesh.setColorAt(idx, col)
  }

  /** 移除并释放 InstancedMesh 的实例缓冲（instanceMatrix/instanceColor 是 InstancedBufferAttribute，
   *  每 mesh 独占、可安全 dispose）。拖拽放豆/擦除时按帧重建 mesh，不释放会累积 GPU 内存 */
  function disposeInstancedMesh(mesh: THREE.InstancedMesh | null) {
    if (!mesh) return
    scene.remove(mesh)
    mesh.instanceMatrix?.dispose()
    mesh.instanceColor?.dispose()
  }

  /** 全量重建珠子实例（放豆/擦除/导入/载入/熔融跨形态边界时调用）。
   *  三形态：未熔融空心珠（<FILL_MELT）→ 熔融扁珠带残留孔（FILL_MELT~FUSE_SEALED）→ 完全熔融无孔（≥FUSE_SEALED，
   *  烫到「刚好」容错区间即无孔，直到烫糊前都保持闭合） */
  function buildBeadInstances() {
    const hollow: { r: number; c: number; m: number }[] = []
    const filled: { r: number; c: number; m: number }[] = []
    const fused: { r: number; c: number; m: number }[] = []
    for (let r = 0; r < store.rows; r++)
      for (let c = 0; c < store.cols; c++) {
        const cell = store.grid[r][c]
        if (!cell.color) continue
        if (cell.melt < FILL_MELT) hollow.push({ r, c, m: cell.melt })
        else if (cell.melt < FUSE_SEALED) filled.push({ r, c, m: cell.melt })
        else fused.push({ r, c, m: cell.melt })
      }

    disposeInstancedMesh(hollowMesh)
    disposeInstancedMesh(filledMesh)
    disposeInstancedMesh(fusedMesh)
    // 显式置空：某形态本轮数量为 0 时不新建 mesh，变量必须脱离对已释放旧 mesh 的引用
    hollowMesh = null
    filledMesh = null
    fusedMesh = null
    beadIndex.clear()

    if (hollow.length > 0) {
      hollowMesh = new THREE.InstancedMesh(hollowGeo, hollowMats, Math.max(hollow.length, 1))
      hollowMesh.castShadow = true
      for (let i = 0; i < hollow.length; i++) {
        const { r, c, m } = hollow[i]
        writeInstance(hollowMesh, i, r, c, m)
        beadIndex.set(r * MAX_GRID + c, { mesh: hollowMesh, idx: i })
      }
      hollowMesh.count = hollow.length
      hollowMesh.instanceMatrix.needsUpdate = true
      if (hollowMesh.instanceColor) hollowMesh.instanceColor.needsUpdate = true
      scene.add(hollowMesh)
    }
    if (filled.length > 0) {
      filledMesh = new THREE.InstancedMesh(filledGeo, filledMats, Math.max(filled.length, 1))
      filledMesh.castShadow = true
      for (let i = 0; i < filled.length; i++) {
        const { r, c, m } = filled[i]
        writeInstance(filledMesh, i, r, c, m)
        beadIndex.set(r * MAX_GRID + c, { mesh: filledMesh, idx: i })
      }
      filledMesh.count = filled.length
      filledMesh.instanceMatrix.needsUpdate = true
      if (filledMesh.instanceColor) filledMesh.instanceColor.needsUpdate = true
      scene.add(filledMesh)
    }
    if (fused.length > 0) {
      fusedMesh = new THREE.InstancedMesh(fusedGeo, filledMats, Math.max(fused.length, 1))
      fusedMesh.castShadow = true
      for (let i = 0; i < fused.length; i++) {
        const { r, c, m } = fused[i]
        writeInstance(fusedMesh, i, r, c, m)
        beadIndex.set(r * MAX_GRID + c, { mesh: fusedMesh, idx: i })
      }
      fusedMesh.count = fused.length
      fusedMesh.instanceMatrix.needsUpdate = true
      if (fusedMesh.instanceColor) fusedMesh.instanceColor.needsUpdate = true
      scene.add(fusedMesh)
    }
  }

  /** 重建图纸色块实例（导入/清空/载入时） */
  function rebuildPattern() {
    const cells: { r: number; c: number; px: string }[] = []
    for (let r = 0; r < store.rows; r++)
      for (let c = 0; c < store.cols; c++) {
        const px = store.grid[r][c].pixel
        if (px) cells.push({ r, c, px })
      }
    disposeInstancedMesh(patternMesh)
    patternMesh = null
    if (cells.length === 0) return
    patternMesh = new THREE.InstancedMesh(patternGeo, patternMat, cells.length)
    const m4 = scratchMatrix
    const pos = scratchPos
    const sc = scratchScale
    const q = scratchQuat
    const col = scratchColor
    // scratch 复用：显式重置为恒等，防止残留上一轮 writeInstance 的写入
    sc.set(1, 1, 1)
    q.identity()
    for (let i = 0; i < cells.length; i++) {
      // 色块同样居中在方格内（+0.5），放豆后由珠子盖住
      pos.set(cells[i].c + 0.5, 0.02, cells[i].r + 0.5)
      m4.compose(pos, q, sc)
      patternMesh.setMatrixAt(i, m4)
      col.set(cells[i].px)
      patternMesh.setColorAt(i, col)
    }
    patternMesh.instanceMatrix.needsUpdate = true
    if (patternMesh.instanceColor) patternMesh.instanceColor.needsUpdate = true
    scene.add(patternMesh)
  }

  /* ---------- 交互：放豆 / 擦除 / 悬停 / 锚点缩放 / WASD 移动 / 视角拖拽旋转 ---------- */

  let rotDrag: { sx: number; sy: number; yaw0: number; pitch0: number } | null = null

  function onPointerDown(e: PointerEvent) {
    if (e.button === 2) return
    // positionIron 已算出地面交点，直接复用（避免同一事件重复射线求交）
    const p = positionIron(e.clientX, e.clientY)
    if (p) {
      store.mouse.x = p.x * CELL
      store.mouse.y = p.z * CELL
    }
    store.mouse.down = true
    if (store.mode !== 'design' || e.button !== 0) return
    if (store.viewMode) {
      // 视角工具：左键拖拽旋转相机；首次拖拽弹出操作提示。
      // 相机钻到板下（地平线下）时地面射线无交点，旋转拖拽不依赖它，照常可用
      rotDrag = { sx: e.clientX, sy: e.clientY, yaw0: yaw, pitch0: pitch }
      showViewHint()
      return
    }
    if (!p) return
    placeBead(p.x * CELL, p.z * CELL)
  }

  function onPointerMove(e: PointerEvent) {
    // 命中过滤：pointermove 挂在 window 上，指针落在 UI 覆盖层（透明侧栏/对话框/作品列表）时
    // 直接跳过，不做射线与样式计算。画布铺满全窗口（覆盖层悬浮其上），不能用 rect 范围判断，
    // 用 elementFromPoint 取该点顶层元素：不是画布容器内的元素即为覆盖层；
    // 拖拽中指针移出画布仍需继续（跨边界连续放豆/熨烫），不裁剪
    const hit = document.elementFromPoint(e.clientX, e.clientY)
    if ((!hit || !container.contains(hit)) && !store.mouse.down) {
      // 清掉上一格的悬停框/熨斗游标残留，避免指针移到覆盖层上时高亮停在原地
      if (store.mouse.x >= 0 || hoverBox.visible) {
        store.mouse.x = -1
        store.mouse.y = -1
        store.iron.x = -1
        store.iron.y = -1
        hoverBox.visible = false
        markRender()
      }
      return
    }
    // positionIron 已算出地面交点，直接复用（避免同一事件重复射线求交）
    const p = positionIron(e.clientX, e.clientY)
    if (rotDrag) {
      // 视角拖拽（棋盘跟随鼠标的直觉方向）：水平右拖绕 Y 轴右转，向下拖视角变高更俯视
      yaw = rotDrag.yaw0 + (e.clientX - rotDrag.sx) * ROT_SPEED
      pitch = Math.max(
        PITCH_MIN,
        Math.min(PITCH_MAX, rotDrag.pitch0 + (e.clientY - rotDrag.sy) * ROT_SPEED),
      )
      applyView()
      ensureGridFitsViewport()
      return
    }
    if (!p) return
    store.mouse.x = p.x * CELL
    store.mouse.y = p.z * CELL

    // 设计模式按住拖拽连续放豆/擦除（placeBead 仅在内容实际变化时递增 gridVersion）
    if (store.mode === 'design' && !store.viewMode && store.mouse.down) placeBead(p.x * CELL, p.z * CELL)
  }

  function onPointerUp() {
    rotDrag = null
    store.mouse.down = false
  }

  function onLeave() {
    rotDrag = null
    store.mouse.x = -1
    store.mouse.y = -1
    store.mouse.down = false
    store.iron.x = -1
    store.iron.y = -1
    hoverBox.visible = false
    markRender()
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const p = groundFromClient(e.clientX, e.clientY)
    // 锚点缩放：鼠标下的地面点保持投影位置不变。相机在地平线下（地面射线无交点）时
    // 退化为绕注视中心缩放，钻到板下也能拉近/拉远
    const oldDist = baseDist / scale
    const factor = e.deltaY < 0 ? 1.15 : 0.87
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor))
    const r = (baseDist / scale) / oldDist
    if (p) {
      camera.position.x = p.x + (camera.position.x - p.x) * r
      camera.position.y = p.y + (camera.position.y - p.y) * r
      camera.position.z = p.z + (camera.position.z - p.z) * r
      center.x = p.x + (center.x - p.x) * r
      center.z = p.z + (center.z - p.z) * r
    } else {
      camera.position.x = controls.target.x + (camera.position.x - controls.target.x) * r
      camera.position.y = controls.target.y + (camera.position.y - controls.target.y) * r
      camera.position.z = controls.target.z + (camera.position.z - controls.target.z) * r
    }
    controls.target.set(center.x, 0, center.z)
    updateSceneVisibility()
    ensureGridFitsViewport()
    markRender()
  }

  function onContext(e: MouseEvent) {
    if (store.mode !== 'design') return
    e.preventDefault()
    const p = groundFromClient(e.clientX, e.clientY)
    if (!p) return
    const cell = getCellAt(p.x * CELL, p.z * CELL)
    if (cell) eraseCell(cell.r, cell.c)
  }

  /* ---------- 每帧 ---------- */

  /** 悬停框跟随鼠标：返回本帧位置/可见性是否变化（供按需渲染判断） */
  function updateHover(): boolean {
    if (store.mode !== 'design' || store.viewMode) {
      if (hoverBox.visible) {
        hoverBox.visible = false
        return true
      }
      return false
    }
    const cell = getCellAt(store.mouse.x, store.mouse.y)
    if (!cell) {
      if (hoverBox.visible) {
        hoverBox.visible = false
        return true
      }
      return false
    }
    const b = store.grid[cell.r][cell.c]
    const m = b?.melt ?? 0
    const s = BEAD_SCALE.s
    const h = b?.color ? s * BEAD_HEIGHT * (1 - m * 0.92) + 0.1 : 0.08
    const x = cell.c + 0.5
    const y = h
    const z = cell.r + 0.5
    const moved =
      !hoverBox.visible ||
      hoverBox.position.x !== x ||
      hoverBox.position.y !== y ||
      hoverBox.position.z !== z
    if (moved) {
      hoverBox.position.set(x, y, z)
      hoverBox.visible = true
    }
    return moved
  }

  /** 熨斗游标显隐：返回本帧是否切换（供按需渲染判断） */
  function updateIronOverlay(): boolean {
    const show = store.mode === 'ironing' && store.mouse.x >= 0
    const shown = ironImg.style.display === 'block'
    if (show !== shown) {
      ironImg.style.display = show ? 'block' : 'none'
      return true
    }
    return false
  }

  /** 按需渲染：静止（无交互/无动画变化）时挂起 renderer.render，GPU 完全空闲；
   *  任何状态变更路径（指针/滚轮/键盘/熨烫/重建/缩放）都通过 markRender 或上面的
   *  *_changed 返回值唤醒一帧渲染。rAF 循环保留（每帧只做廉价比较），静止时不再
   *  每帧重绘整场景 + 1024² 阴影贴图 */
  let renderDirty = true
  function markRender() {
    renderDirty = true
  }

  let raf = 0
  function animate() {
    raf = requestAnimationFrame(animate)
    let changed = false
    // 设计模式兜底：若视角仍低于 DESIGN_PITCH_MIN（从背面视角直接切回放豆），抬回安全俯仰角
    if (!store.viewMode && pitch < DESIGN_PITCH_MIN) {
      pitch = DESIGN_PITCH_MIN
      applyView()
      changed = true
    }
    changed = updateIronOverlay() || changed
    changed = updateHover() || changed
    changed = updateSceneVisibility() || changed
    if (renderDirty || changed) {
      renderDirty = false
      controls.update()
      renderer.render(scene, camera)
    }
  }

  /* ---------- 对外接口 ---------- */

  function resize() {
    invalidateRect() // 画布尺寸变化 → 缓存的 rect 失效，下次指针事件重新读取
    const { w, h } = viewportSize()
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    baseDist = computeBaseDist(h)
    applyView()
    ensureGridFitsViewport()
  }

  function update() {
    // 鼠标未按下时熔融值不会变化，跳过整个窗口遍历与 buffer 重写（熨烫 idle 帧零开销）
    if (store.mode !== 'ironing' || store.mouse.x < 0 || !store.mouse.down) return
    // 渲染更新区域与熔融判定一致：以熨斗图标中心（熨烫中心）为圆心
    const mx = store.iron.x / CELL
    const mz = store.iron.y / CELL
    const rad = (IRON_RADIUS * 1.5) / CELL
    const c0 = Math.max(0, Math.floor(mx - rad))
    const c1 = Math.min(store.cols - 1, Math.ceil(mx + rad))
    const r0 = Math.max(0, Math.floor(mz - rad))
    const r1 = Math.min(store.rows - 1, Math.ceil(mz + rad))
    // 有珠子跨过熔融形态边界（hollow ↔ filled ↔ fused）→ 下一帧合并重建
    const formOf = (m: number) => (m >= FUSE_SEALED ? 2 : m >= FILL_MELT ? 1 : 0)
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const cell = store.grid[r][c]
        if (!cell.color) continue
        const entry = beadIndex.get(r * MAX_GRID + c)
        if (!entry) continue
        const entryForm = entry.mesh === fusedMesh ? 2 : entry.mesh === filledMesh ? 1 : 0
        if (formOf(cell.melt) !== entryForm) {
          requestRebuild()
          return
        }
      }
    // 局部更新鼠标周围珠子的矩阵/颜色；只标记实际写入的 mesh，未动的 buffer 不整块重传
    touchedMeshes.clear()
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const cell = store.grid[r][c]
        if (!cell.color) continue
        const entry = beadIndex.get(r * MAX_GRID + c)
        if (!entry) continue
        touchedMeshes.add(entry.mesh)
        writeInstance(entry.mesh, entry.idx, r, c, cell.melt)
      }
    for (const m of touchedMeshes) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    markRender()
  }

  function rebuild() {
    buildBeadInstances()
    rebuildPattern()
    markRender()
  }

  let rebuildPending = false
  let rebuildRaf = 0

  /** 珠子层内容变化（放豆/擦除/熔融跨形态边界）→ 下一帧合并重建珠子实例（不重建图纸层：
   *  放豆/擦除不会改变 pixel 层，图纸实例无需动）。
   *  同一帧内多次触发只重建一次：拖拽放豆/6×6 擦除每个 pointermove 都可能触发 gridVersion++，
   *  同步全量重建会反复扫描整表 + 新建 InstancedMesh；延迟一帧后肉眼不可见，
   *  重建次数从“每 move”降到“每帧一次” */
  function requestRebuild() {
    if (rebuildPending) return
    rebuildPending = true
    rebuildRaf = requestAnimationFrame(() => {
      rebuildPending = false
      buildBeadInstances()
      markRender()
    })
  }

  let rebuildPatternPending = false
  let rebuildPatternRaf = 0

  /** 图纸层变化（导入/清空/载入，patternVersion++）→ 下一帧仅重建图纸实例。
   *  与 requestRebuild 分开：放豆/擦除只改珠子层，不必重建图纸层 */
  function requestRebuildPattern() {
    if (rebuildPatternPending) return
    rebuildPatternPending = true
    rebuildPatternRaf = requestAnimationFrame(() => {
      rebuildPatternPending = false
      rebuildPattern()
      markRender()
    })
  }

  function dispose() {
    cancelAnimationFrame(raf)
    cancelAnimationFrame(rebuildRaf)
    cancelAnimationFrame(rebuildPatternRaf)
    rebuildPending = false
    rebuildPatternPending = false
    controls.dispose()
    // 释放实例缓冲与场景内全部几何/材质：renderer.dispose 只释放渲染器级资源，
    // 对象级 GPU 缓冲（instanceMatrix 等）必须逐个 dispose，否则热重载/反复进出会累积
    disposeInstancedMesh(hollowMesh)
    disposeInstancedMesh(filledMesh)
    disposeInstancedMesh(fusedMesh)
    disposeInstancedMesh(patternMesh)
    hollowMesh = null
    filledMesh = null
    fusedMesh = null
    patternMesh = null
    // 材质统一是单 Material（构造时直接传入），按窄类型释放
    const hoverMat = hoverBox.material as THREE.Material
    const groundMat = ground.material as THREE.Material
    const gridMat = gridLines.material as THREE.Material
    hoverBox.geometry.dispose()
    hoverMat.dispose()
    ground.geometry.dispose()
    groundMat.dispose()
    gridMat.dispose()
    patternMat.dispose()
    pmrem.dispose()
    scene.environment?.dispose()
    scene.environment = null
    renderer.dispose()
    renderer.domElement.remove()
    ironImg.remove()
    viewHint.remove()
    clearTimeout(hintTimer)
    hollowGeo.dispose()
    filledGeo.dispose()
    fusedGeo.dispose()
    lineGeo.dispose()
    patternGeo.dispose()
    for (const m of hollowMats) m.dispose()
    for (const m of filledMats) m.dispose()
    const el = renderer.domElement
    el.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('keydown', onKeyDown)
    container.removeEventListener('pointerleave', onLeave)
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('contextmenu', onContext)
    rectObserver.disconnect()
  }

  /* ---------- 初始化 ---------- */

  const el = renderer.domElement
  // 容器尺寸变化（窗口 resize / 布局调整）→ rect 缓存失效；不 observe renderer.domElement，
  // 它由 CSS 撑满容器，尺寸只随容器变化
  const rectObserver = new ResizeObserver(invalidateRect)
  rectObserver.observe(container)
  el.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('keydown', onKeyDown)
  container.addEventListener('pointerleave', onLeave)
  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('contextmenu', onContext)

  resize()
  ensureGridFitsViewport()
  center.x = store.cols / 2
  center.z = store.rows / 2
  applyView()
  rebuild()
  animate()

  return { resize, update, requestRebuild, requestRebuildPattern, rebuild, dispose }
}
