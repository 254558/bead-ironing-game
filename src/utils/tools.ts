import { clearAll, hasBeads, saveBoard, setSavePanel, showStatus, store, switchMode } from '../stores/game'

/** 工具菜单项（桌面 LineSidebar 与手机浮层工具栏共用同一份动作） */
export const TOOLS = ['设计', '熨烫', '视角', '导入', '图纸', '保存', '恢复', '清空'] as const

/** 高亮项随模式/视角工具状态联动（外部受控） */
export function toolActiveIndex(): number {
  return store.viewMode ? 2 : store.mode === 'ironing' ? 1 : 0
}

/** 视角工具：隐藏棋盘线，左键拖拽旋转视角、WASD 移动视角；再点或点「设计」退出，视角保持不变可继续放豆 */
export function toggleView(v: boolean) {
  store.viewMode = v
  // 从熨烫模式进入视角工具：直接切回设计（不走 switchMode，避免清空熨烫成果的熔融度）
  if (v && store.mode === 'ironing') store.mode = 'design'
  showStatus(
    v ? '视角调整：按住左键拖拽旋转视角，WASD 移动视角，调整好点「设计」继续放豆' : '回到设计：视角已保留，可继续放豆',
  )
}

/** 执行第 index 个工具动作（0 设计 / 1 熨烫 / 2 视角 / 3 导入 / 4 图纸 / 5 保存 / 6 恢复 / 7 清空） */
export function handleToolAction(index: number) {
  switch (index) {
    case 0:
      switchMode('design')
      break
    case 1:
      if (hasBeads) switchMode('ironing')
      else showStatus('先放一些拼豆再熨烫')
      break
    case 2:
      toggleView(!store.viewMode)
      break
    case 3:
      // 先问导入方式（图纸 / 直接变豆子），选完再挑文件
      store.showImportDialog = true
      break
    case 4:
      // 图纸库：宝可梦卡牌全息效果参考页（全屏 iframe，右上/左上返回）
      store.cardsView = true
      break
    case 5:
      if (hasBeads) saveBoard()
      else showStatus('还没有拼豆可保存')
      break
    case 6:
      setSavePanel(true)
      break
    case 7:
      clearAll()
      break
  }
}
