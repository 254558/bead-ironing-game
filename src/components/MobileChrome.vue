<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from 'vue'
import { selectColor, showStatus, store, toggleEraser } from '../stores/game'
import { COLORS } from '../utils/color'
import { handleToolAction, TOOLS, toolActiveIndex } from '../utils/tools'

/** 顶部工具栏：与桌面 LineSidebar 同一份动作，高亮项随模式联动 */
const tools = [...TOOLS]
const activeTool = computed(() => toolActiveIndex())

/** 底部调色板：0 = 橡皮，1..32 = 颜色色块（与桌面 OptionWheel 一致） */
const swatches = computed(() => ['✕', ...COLORS])

/** 当前选中：橡皮模式 → 0；否则当前颜色下标 +1（跳过橡皮） */
const selected = computed(() => (store.isEraser ? 0 : COLORS.indexOf(store.selectedColor) + 1))

function onSwatch(index: number) {
  if (index === 0) toggleEraser()
  else selectColor(COLORS[index - 1])
}

/** 选中色变化时把它横滑进可视区（手指点选后色块不跑出屏幕边缘） */
watch(selected, async (idx) => {
  await nextTick()
  document.querySelector<HTMLElement>(`.mobile-swatch[data-index="${idx}"]`)?.scrollIntoView({
    inline: 'center',
    block: 'nearest',
    behavior: 'smooth',
  })
})

onMounted(() => {
  // 手机没有右键/键盘：单指点按放豆、双指拖动平移、双指捏合缩放、长按擦除。
  // 首次进站提示一次手势（同一标签页会话只弹一次，不打扰）
  if (window.matchMedia('(max-width: 767px)').matches && !sessionStorage.getItem('bead-iron.gesture-hint')) {
    sessionStorage.setItem('bead-iron.gesture-hint', '1')
    showStatus('手势：单指点按放豆 · 双指拖动平移 · 双指捏合缩放 · 长按擦除')
  }
})
</script>

<template>
  <div class="mobile-chrome">
    <nav class="mobile-toolbar" aria-label="工具">
      <button
        v-for="(label, i) in tools"
        :key="label"
        class="mobile-tool-btn"
        :class="{ active: activeTool === i }"
        @click="handleToolAction(i)"
      >{{ label }}</button>
    </nav>

    <div class="mobile-palette" role="listbox" aria-label="颜色">
      <button
        v-for="(hex, i) in swatches"
        :key="hex"
        class="mobile-swatch"
        :class="{
          'mobile-swatch-eraser': i === 0,
          selected: selected === i,
        }"
        :data-index="i"
        :role="'option'"
        :aria-selected="selected === i"
        :aria-label="i === 0 ? '橡皮' : hex"
        :style="i === 0 ? undefined : { backgroundColor: hex }"
        @click="onSwatch(i)"
      >{{ i === 0 ? '✕' : '' }}</button>
    </div>
  </div>
</template>
