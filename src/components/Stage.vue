<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { showStatus, store } from '../stores/game'
import BoardView from './BoardView.vue'
import StatusBar from './StatusBar.vue'

let resizeTimer: ReturnType<typeof setTimeout> | undefined

/** 容器尺寸变化（窗口 resize / 布局调整）→ 通知画布/3D 适配（画布固定 40×40，无需重设网格） */
function measure() {
  store.resizeTick++
}

function onWindowResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(measure, 300)
}

onMounted(() => {
  measure()
  showStatus('点击/拖拽放置拼豆')
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
})
</script>

<template>
  <div class="canvas-wrap">
    <BoardView />
    <StatusBar />
  </div>
</template>
