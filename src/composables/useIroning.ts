import { markDirty, store } from '../stores/game'
import { CELL, IRON_RADIUS, IRON_SPEED } from '../utils/color'

/**
 * 熨烫 rAF 循环：按住鼠标时按椭圆衰减半径累计 melt。
 * 仅在 ironing 模式下运行，模式切换后自动退出。
 */
export function useIroning(render: () => void) {
  let raf: number | null = null
  let last = 0

  function loop(ts: number) {
    if (store.mode !== 'ironing') {
      raf = null
      return
    }
    if (!last) last = ts
    const dt = Math.min((ts - last) / 1000, 0.05)
    last = ts

    if (store.mouse.down && store.mouse.x >= 0 && store.iron.x >= 0) {
      // 迷你豆壁薄升温快：熔化速度 ×1.2，更容易烫糊
      const speed = IRON_SPEED * (store.beadSize === 'mini' ? 1.2 : 1)
      // 只遍历熨斗周围的热区窗口（椭圆最大半轴 R*1.25，+1 格余量），避免每帧全表扫描
      const rad = Math.ceil((IRON_RADIUS * 1.25) / CELL) + 1
      const c0 = Math.max(0, Math.floor(store.iron.x / CELL - rad))
      const c1 = Math.min(store.cols - 1, Math.ceil(store.iron.x / CELL + rad))
      const r0 = Math.max(0, Math.floor(store.iron.y / CELL - rad))
      const r1 = Math.min(store.rows - 1, Math.ceil(store.iron.y / CELL + rad))
      let wrote = false
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cell = store.grid[r][c]
          if (!cell.color) continue
          const cx = c * CELL + CELL / 2
          const cy = r * CELL + CELL / 2
          // 以熨斗图标中心（熨烫中心）为圆心：图标指到哪就烫到哪
          const ex = (cx - store.iron.x) / (IRON_RADIUS * 1.25)
          const ey = (cy - store.iron.y) / (IRON_RADIUS * 1.15)
          const d2 = ex * ex + ey * ey
          if (d2 < 1) {
            const f = 1 - Math.sqrt(d2)
            cell.melt = Math.min(1, cell.melt + speed * f * dt)
            wrote = true
          }
        }
      }
      // 熔融有变化 → 标记内容变脏（供自动保存按需写入）
      if (wrote) markDirty()
    }
    render()
    raf = requestAnimationFrame(loop)
  }

  function start() {
    if (raf === null) {
      last = 0
      raf = requestAnimationFrame(loop)
    }
  }

  function stop() {
    if (raf !== null) cancelAnimationFrame(raf)
    raf = null
  }

  return { start, stop }
}
