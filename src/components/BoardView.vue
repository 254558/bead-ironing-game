<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { useIroning } from '../composables/useIroning'
import { createThreeBoard, type ThreeBoardHandle } from '../three/board'
import { store } from '../stores/game'

const wrap = useTemplateRef<HTMLDivElement>('wrap')
let board: ThreeBoardHandle | null = null

// 熨烫动画循环：仅 ironing 模式运行，每帧回调 update() 局部更新熔融珠子
const { start: startIronLoop, stop: stopIronLoop } = useIroning(() => board?.update())

// 模式/视角工具切换：熨烫时启动熔融循环；进入「设计且非视角工具」状态时把画布整体居中收进视口。
// 视角工具（viewMode）内不重置视角；从视角退出 / 熨烫切回设计时画布自动归中，
// 保证棋盘始终在屏幕中间（缩放/平移/旋转后点「设计」也回到整块画布视图）
watch(
  [() => store.mode, () => store.viewMode],
  ([m, viewMode]) => {
    if (m === 'ironing') startIronLoop()
    else stopIronLoop()
    if (m === 'design' && !viewMode) board?.fitView()
  },
)

// 网格内容变化（放豆/擦除/导入/清空/载入）→ 下一帧合并重建珠子实例。
// 拖拽连续放豆时每个 pointermove 都递增 gridVersion，requestRebuild 按帧去重，避免每 move 全量重建
watch(
  () => store.gridVersion,
  () => board?.requestRebuild(),
)

// 图纸层变化（导入/清空/载入）→ 仅重建图纸实例，不动珠子层
watch(
  () => store.patternVersion,
  () => board?.requestRebuildPattern(),
)

// 窗口 resize（Stage.measure → resizeTick）→ 适配视口
watch(
  () => store.resizeTick,
  () => board?.resize(),
)

onMounted(() => {
  if (wrap.value) {
    // createThreeBoard 内部已做初始 resize + rebuild（已有内容也一并渲染），
    // 此处不再二次 rebuild；后续 resizeTick/gridVersion/patternVersion 变化由上方 watch 接管
    board = createThreeBoard(wrap.value)
    // 页面加载时若已是 ironing 模式，上方 watch 不会触发（只在模式变化时运行）→ 手动启动熔融循环
    if (store.mode === 'ironing') startIronLoop()
  }
})

onUnmounted(() => {
  stopIronLoop()
  board?.dispose()
  board = null
})
</script>

<template>
  <div
    ref="wrap"
    class="scroll-wrap"
    :class="{
      'iron-cursor': store.mode === 'ironing',
      'view-mode': store.mode === 'design' && store.viewMode,
      'view-dragging': store.mode === 'design' && store.viewMode && store.mouse.down,
    }"
  />
</template>
