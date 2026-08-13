<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import CardsView from './components/CardsView.vue'
import ColorWheelPanel from './components/ColorWheelPanel.vue'
import Stage from './components/Stage.vue'
import ToolPanel from './components/ToolPanel.vue'
import { store } from './stores/game'

// 图纸选择器：点开才下载对应代码（含图片识别逻辑），减小首屏 JS
const PatternPicker = defineAsyncComponent(() => import('./components/PatternPicker.vue'))

// 取色器（右侧颜色轮）仅在「设计」模式出现；熨烫/视角工具时滑走隐藏
const showColorWheel = computed(() => store.mode === 'design' && !store.viewMode)
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
    <PatternPicker v-if="store.showPatternPicker" />
    <CardsView v-if="store.cardsView" />
  </div>
</template>
