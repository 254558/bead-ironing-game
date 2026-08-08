<script setup lang="ts">
import { computed } from 'vue'
import LineSidebar from './bits/LineSidebar.vue'
import { clearAll, hasBeads, saveBoard, setSavePanel, showStatus, store, switchMode } from '../stores/game'

/** 左侧工具菜单（vue-bits LineSidebar）：设计 / 熨烫 / 视角 / 导入 / 保存 / 恢复 / 清空 */
const items = ['设计', '熨烫', '视角', '导入', '保存', '恢复', '清空']

/** 高亮项随模式/视角工具状态联动（外部受控） */
const active = computed(() => (store.viewMode ? 2 : store.mode === 'ironing' ? 1 : 0))

/** 视角工具：隐藏棋盘线，左键拖拽旋转视角、WASD 移动视角；再点或点「设计」退出，视角保持不变可继续放豆 */
function toggleView(v: boolean) {
  store.viewMode = v
  // 从熨烫模式进入视角工具：直接切回设计（不走 switchMode，避免清空熨烫成果的熔融度）
  if (v && store.mode === 'ironing') store.mode = 'design'
  showStatus(
    v ? '视角调整：按住左键拖拽旋转视角，WASD 移动视角，调整好点「设计」继续放豆' : '回到设计：视角已保留，可继续放豆',
  )
}

function onItemClick(index: number) {
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
      if (hasBeads) saveBoard()
      else showStatus('还没有拼豆可保存')
      break
    case 5:
      setSavePanel(true)
      break
    case 6:
      clearAll()
      break
  }
}
</script>

<template>
  <div class="sidebar-tools">
    <div class="menu-wrap">
      <LineSidebar
        :items="items"
        :active="active"
        :show-index="false"
        accent-color="#ef7d57"
        text-color="#cdd2da"
        marker-color="#5d6572"
        :marker-length="52"
        :marker-gap="0"
        :item-gap="26"
        :font-size="1.2"
        :proximity-radius="110"
        :max-shift="18"
        :smoothing="90"
        @item-click="onItemClick"
      />
    </div>
  </div>
</template>
