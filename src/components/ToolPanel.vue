<script setup lang="ts">
import { computed } from 'vue'
import LineSidebar from './bits/LineSidebar.vue'
import { handleToolAction, TOOLS, toolActiveIndex } from '../utils/tools'

/** 左侧工具菜单（vue-bits LineSidebar）：设计 / 熨烫 / 视角 / 导入 / 图纸 / 保存 / 恢复 / 清空 */
const items = [...TOOLS]

/** 高亮项随模式/视角工具状态联动（外部受控） */
const active = computed(() => toolActiveIndex())

function onItemClick(index: number) {
  handleToolAction(index)
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
