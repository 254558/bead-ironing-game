<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { showStatus, store } from '../stores/game'
import { importWebpPattern } from '../utils/imageImport'
import { useEscapeKey } from '../composables/useEscapeKey'

/** 关闭图纸库，回到拼豆画布（画布状态原样保留） */
function close() {
  store.cardsView = false
}

/** 图纸库 iframe 内点了「导入这张图纸」：按 id（pattern-01…38）拉取对应 webp，
 *  走 beads 模式自动识别 40×40 网格铺好豆子（等同原「从内置图纸选」），然后关闭图纸库 */
let importing = false
async function importPattern(id: string) {
  const m = /^pattern-(\d+)$/.exec(id)
  if (!m || importing) return
  importing = true
  const n = String(Number(m[1])).padStart(2, '0')
  try {
    await importWebpPattern(`pattens/patterns/p${n}.webp`, `p${n}.webp`)
  } catch {
    showStatus('图纸导入失败，请稍后重试')
  }
  importing = false
  close()
}

/** iframe 内点顶部「Patterns」标题 / 「导入这张图纸」时通知父页面处理 */
function onMessage(e: MessageEvent) {
  if (!e.data || typeof e.data !== 'object') return
  if (e.data.type === 'bead-close-cards') close()
  if (e.data.type === 'bead-import-pattern' && typeof e.data.id === 'string') importPattern(e.data.id)
}

useEscapeKey(close)

onMounted(() => window.addEventListener('message', onMessage))
onUnmounted(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <div class="cards-view">
    <!-- 全屏 iframe：宝可梦卡牌全息效果参考页（静态资源位于 public/pattens/） -->
    <iframe
      class="cards-view-frame"
      src="pattens/index.html"
      title="图纸库 · 宝可梦卡牌全息效果"
    />
  </div>
</template>

<style scoped>
.cards-view {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: #0f1116;
}

.cards-view-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>
