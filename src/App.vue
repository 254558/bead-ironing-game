<script setup lang="ts">
import { computed } from 'vue'
import CardsView from './components/CardsView.vue'
import ColorWheelPanel from './components/ColorWheelPanel.vue'
import Stage from './components/Stage.vue'
import ToolPanel from './components/ToolPanel.vue'
import { isDesignView, store } from './stores/game'

// 取色器（右侧颜色轮）仅在「设计」模式出现；熨烫/视角工具时滑走隐藏
const showColorWheel = computed(() => isDesignView.value)
</script>

<template>
  <div class="app">
    <!-- 视觉隐藏的页面标题：供搜索引擎 / 读屏识别页面主题（3D 棋盘本身无法被解析） -->
    <h1 class="sr-only">在线拼豆游戏 · Bead Ironing</h1>
    <aside class="sidebar sidebar-left">
      <ToolPanel />
    </aside>
    <Stage />
    <Transition name="wheel-slide">
      <aside v-show="showColorWheel" class="sidebar sidebar-right">
        <ColorWheelPanel />
      </aside>
    </Transition>
    <CardsView v-if="store.cardsView" />
  </div>
</template>
