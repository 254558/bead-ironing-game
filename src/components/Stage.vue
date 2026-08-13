<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import { setupGrid, showStatus, store } from '../stores/game'
import BoardView from './BoardView.vue'
import StatusBar from './StatusBar.vue'

const root = useTemplateRef<HTMLDivElement>('root')
let resizeTimer: ReturnType<typeof setTimeout> | undefined

/** 按容器尺寸重建网格，并通知画布/3D 适配 */
function measure() {
  const el = root.value
  const w = el?.clientWidth || window.innerWidth
  const h = el?.clientHeight || window.innerHeight - 70
  setupGrid(w, h)
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
  <div ref="root" class="canvas-wrap">
    <BoardView />
    <StatusBar />
  </div>
</template>
