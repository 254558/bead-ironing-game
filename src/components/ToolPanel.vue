<script setup lang="ts">
import { computed } from 'vue'
import LineSidebar from './bits/LineSidebar.vue'
import { hasBeads, showStatus, store, switchMode } from '../stores/game'

/** 左侧工具菜单（vue-bits LineSidebar）：设计 / 熨烫 / 视角 / 图纸 */
const items = ['设计', '熨烫', '视角', '图纸']

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
      // 已处于设计模式时 store.mode 值不变，BoardView 的 mode watch 不触发归中；
      // 无条件自增 fitViewTick → 3D 渲染循环下一帧把整块画布收进视口（幂等），
      // 保证「点设计」无论从哪个状态进入都画布居中
      store.fitViewTick++
      break
    case 1:
      if (hasBeads) switchMode('ironing')
      else showStatus('先放一些拼豆再熨烫')
      break
    case 2:
      toggleView(!store.viewMode)
      break
    case 3:
      // 图纸页面：全息卡牌效果（一行 10 张卡牌图纸，iframe 展示）
      store.cardsView = true
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
