/** 单个珠子的状态 */
export interface Cell {
  /** 颜色（调色板 hex），null 表示空格 */
  color: string | null
  /** 熔融程度 0~1 */
  melt: number
  /** 像素参考图颜色（导入图片的原色 hex），null 表示无；放豆后由珠子覆盖 */
  pixel: string | null
}

export type Mode = 'design' | 'ironing'

/** 导入图片的两种方式：图纸（像素参考层，自己放豆）／直接变豆子（自动铺好，只需熨烫） */
export type ImportMode = 'pattern' | 'beads'

export interface MouseState {
  x: number
  y: number
  down: boolean
}

/** 熨烫中心（地面世界坐标 × CELL，与 MouseState 同单位）：由游标图脚的位置换算，脚踩到哪就烫到哪 */
export interface IronCenter {
  x: number
  y: number
}
