import * as THREE from 'three'

/**
 * 珠体几何参数（相对格子尺寸归一化，行业实测 5mm 大豆尺寸，含 ±0.2mm 公差）：
 * - s：珠体相对格子的比例（大豆填满格子）
 * - hole：中心孔径 / 外径——实测 5mm≈0.5，此处略放大（+0.05）让空心更明显
 * - tol：生产公差 ±0.2mm 相对外径的比例，用于每颗豆的尺寸抖动
 */
export const BEAD_SCALE = { s: 1, hole: 0.55, tol: 0.2 / 5 }

/** 珠体高度系数：无熔融时珠高 = 规格比例 s × 此系数（熔融时按 1−0.92×melt 压扁） */
export const BEAD_HEIGHT = 2.0

/**
 * 把 ExtrudeGeometry 的侧壁组（materialIndex 1）按顶点半径拆成两段：
 * group 1 = 外壁（清漆反光带）、group 2 = 孔内壁（哑光，俯视时孔洞不发亮）。
 * ExtrudeGeometry 侧壁顶点顺序固定——先外轮廓、后孔轮廓——且顶点半径要么≈外径
 * 要么≈孔径，半径分类天然连续，正好分成两个 run。
 */
function splitSideWallGroups(geo: THREE.BufferGeometry, threshold: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const side = geo.groups.find((g) => g.materialIndex === 1)
  if (!side) return
  const isOuter = (v0: number): boolean => {
    for (let k = 0; k < 3; k++) {
      const i = v0 + k
      if (pos.getX(i) * pos.getX(i) + pos.getZ(i) * pos.getZ(i) < threshold * threshold) return false
    }
    return true
  }
  const groups: { start: number; count: number; materialIndex: number }[] = []
  for (const g of geo.groups) if (g.materialIndex === 0) groups.push({ start: g.start, count: g.count, materialIndex: 0 })
  let runStart = side.start
  let runMat = isOuter(side.start) ? 1 : 2
  for (let i = side.start + 3; i < side.start + side.count; i += 3) {
    const m = isOuter(i) ? 1 : 2
    if (m !== runMat) {
      groups.push({ start: runStart, count: i - runStart, materialIndex: runMat })
      runStart = i
      runMat = m
    }
  }
  groups.push({ start: runStart, count: side.start + side.count - runStart, materialIndex: runMat })
  geo.clearGroups()
  for (const g of groups) geo.addGroup(g.start, g.count, g.materialIndex)
}

/**
 * 空心珠几何体（EVA 空心短圆筒）：圆环拉伸（高细分、圆润边缘），俯视可见贯穿珠孔。
 * 拼豆棋盘（three/board.ts）专用。
 */
export function createHollowBeadGeometry(): THREE.ExtrudeGeometry {
  const ringShape = new THREE.Shape()
  ringShape.absarc(0, 0, 1, 0, Math.PI * 2, false)
  const hp = new THREE.Path()
  hp.absarc(0, 0, BEAD_SCALE.hole, 0, Math.PI * 2, true)
  ringShape.holes.push(hp)
  const geo = new THREE.ExtrudeGeometry(ringShape, {
    depth: 0.55,
    // 不开 bevel：真实 EVA 拼豆是锐利直角切面的中空短管，无内外倒角
    bevelEnabled: false,
    curveSegments: 32,
  })
  geo.center()
  geo.rotateX(Math.PI / 2)
  // 侧壁拆成外壁/内壁两组材质（外壁清漆反光、内壁哑光）
  splitSideWallGroups(geo, (1 + BEAD_SCALE.hole) / 2)
  return geo
}

/**
 * 熔融扁珠几何体：圆角矩形拉伸，中心保留小孔——EVA 熨烫后孔洞不容易完全消失，
 * 只略微收缩（残留孔随 instance 的 y 缩放一起压扁）。
 */
export function createFilledBeadGeometry(): THREE.ExtrudeGeometry {
  const rw = 0.95
  const rh = 0.95
  const rr = 0.25
  const rrect = new THREE.Shape()
  rrect.moveTo(-rw + rr, -rh)
  rrect.lineTo(rw - rr, -rh)
  rrect.quadraticCurveTo(rw, -rh, rw, -rh + rr)
  rrect.lineTo(rw, rh - rr)
  rrect.quadraticCurveTo(rw, rh, rw - rr, rh)
  rrect.lineTo(-rw + rr, rh)
  rrect.quadraticCurveTo(-rw, rh, -rw, rh - rr)
  rrect.lineTo(-rw, -rh + rr)
  rrect.quadraticCurveTo(-rw, -rh, -rw + rr, -rh)
  // 熨烫残留孔（小于未熨烫时的孔径）
  const hp = new THREE.Path()
  hp.absarc(0, 0, 0.22, 0, Math.PI * 2, true)
  rrect.holes.push(hp)
  const geo = new THREE.ExtrudeGeometry(rrect, {
    depth: 1,
    // 不开 bevel：熔融扁珠的切面同样锐利（俯视圆角矩形仅表示熨烫融合轮廓）
    bevelEnabled: false,
    curveSegments: 32,
  })
  geo.center()
  geo.rotateX(Math.PI / 2)
  // 侧壁拆成外壁/内壁两组材质（圆角矩形的角顶点半径可达 ~1.24，孔半径 0.22，阈值取 0.45）
  splitSideWallGroups(geo, 0.45)
  return geo
}

/**
 * 完全熔融扁珠几何体：圆角矩形拉伸，无孔——熔融达到 FUSE_SEALED 后孔洞完全闭合，
 * 表面不再有凹点。轮廓与 filled 相同，仅去掉残留孔（侧壁单一材质，无需拆组）。
 */
export function createFusedBeadGeometry(): THREE.ExtrudeGeometry {
  const rw = 0.95
  const rh = 0.95
  const rr = 0.25
  const rrect = new THREE.Shape()
  rrect.moveTo(-rw + rr, -rh)
  rrect.lineTo(rw - rr, -rh)
  rrect.quadraticCurveTo(rw, -rh, rw, -rh + rr)
  rrect.lineTo(rw, rh - rr)
  rrect.quadraticCurveTo(rw, rh, rw - rr, rh)
  rrect.lineTo(-rw + rr, rh)
  rrect.quadraticCurveTo(-rw, rh, -rw, rh - rr)
  rrect.lineTo(-rw, -rh + rr)
  rrect.quadraticCurveTo(-rw, -rh, -rw + rr, -rh)
  const geo = new THREE.ExtrudeGeometry(rrect, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 32,
  })
  geo.center()
  geo.rotateX(Math.PI / 2)
  return geo
}

/**
 * 豆子外壁材质：哑光 EVA 塑料，保留轻微光泽。
 * 原清漆参数（roughness 0.25/0.3、clearcoat 0.7、envMapIntensity 1.1）会让侧壁反射环境贴图——
 * 翻到板底拖动视角时，反光高光带随视角连续扫动，图案边缘出现"细微波动"（用户反馈）；
 * 改为近哑光后侧壁亮度几乎只由静态灯光决定，任意视角下不再波动。
 * 圆柱曲面受光仍形成垂直亮带（立体感来源），env 保留 ~0.2-0.3 只留一丝环境光泽，
 * 俯视时外壁窄环不再是一圈白眩光。
 */
function createEvaSideMaterial(opts: { glossy: boolean }): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    roughness: opts.glossy ? 0.5 : 0.6,
    metalness: 0,
    clearcoat: opts.glossy ? 0.35 : 0.25,
    clearcoatRoughness: 0.3,
    envMapIntensity: opts.glossy ? 0.55 : 0.4,
    specularIntensity: 0.6,
  })
}

/**
 * 豆子孔内壁材质：哑光、整体压暗（假 AO 模拟孔洞内部阴影）。
 * 俯视透过珠孔看到的应是暗色腔体而不是反光——内壁不再用外壁的清漆材质。
 * 颜色系数乘 instanceColor 一起参与漫反射，孔内壁呈现"变暗的豆色"。
 * 用无光照 MeshBasicMaterial：MeshPhysical 的内壁受环境贴图（envMapIntensity>0）影响，
 * 翻到板底看孔隧道时，内壁明暗随视角连续变化，图案上出现"细微波动"；
 * 无光照后内壁恒色，任意视角下孔的颜色/明暗都不再变化。
 */
function createEvaInnerMaterial(): THREE.Material {
  return new THREE.MeshBasicMaterial({ color: 0x6f6f6f })
}

/**
 * 空心珠材质组：[0]=cap 顶/底面（无光照：顶环渲染色=豆子原色/图纸色，所见即所得）、
 * [1]=外壁（清漆反光，立体感来源）、[2]=孔内壁（哑光压暗，模拟孔洞阴影）。
 * ExtrudeGeometry 的 material groups 与之对应（group 0 = 上下 cap，group 1/2 = 外/内壁）。
 */
export function createEvaHollowMaterials(): THREE.Material[] {
  return [
    new THREE.MeshBasicMaterial(),
    createEvaSideMaterial({ glossy: false }),
    createEvaInnerMaterial(),
  ]
}

/**
 * 熔融扁珠材质组：顶面用无光照 MeshBasicMaterial（instanceColor 直接渲染 = 豆子原色/图纸色）。
 * 扁平的顶面整片朝上，MeshPhysical 的漫反射（0.9 主光 + 0.2 环境 + 补光 ≈ 1.0+）会把亮色通道
 * 顶到 255 裁剪、环境高光再蒙一层白——整体过曝发白、颜色发糊（旧空心珠顶面是弧面，光照分散
 * 不裁剪；全板熨平后整片平面累积成"过曝"）。无光照顶面 = 所见即所得，颜色恒等于图纸原色。
 * 侧面仍是清漆塑料材质（立体感由侧面反光 + 地面投影 + 透视角度提供），空心珠保持物理受光不变。
 */
export function createEvaFilledMaterials(): THREE.Material[] {
  return [
    new THREE.MeshBasicMaterial(),
    createEvaSideMaterial({ glossy: true }),
    createEvaInnerMaterial(),
  ]
}
