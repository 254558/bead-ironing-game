<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { store } from '../stores/game'

/** 关闭图纸库，回到拼豆画布（画布状态原样保留） */
function close() {
  store.cardsView = false
}

/** iframe 内点顶部「Patterns」标题时通知父页面关闭 */
function onMessage(e: MessageEvent) {
  if (e.data && typeof e.data === 'object' && e.data.type === 'bead-close-cards') close()
}

onMounted(() => window.addEventListener('message', onMessage))
onUnmounted(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <div class="cards-view">
    <!-- 全屏 iframe：宝可梦卡牌全息效果参考页（静态资源位于 public/pokemon-cards/） -->
    <iframe
      class="cards-view-frame"
      src="pokemon-cards/index.html"
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
