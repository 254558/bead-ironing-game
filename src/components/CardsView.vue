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

/** Esc 键退出图纸库（全屏 iframe 盖住了左侧菜单，必须给用户一个明显的退出途径） */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  window.removeEventListener('message', onMessage)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="cards-view">
    <!-- 全屏 iframe：宝可梦卡牌全息效果参考页（静态资源位于 public/pokemon-cards/） -->
    <iframe
      class="cards-view-frame"
      src="pokemon-cards/index.html"
      title="图纸库 · 宝可梦卡牌全息效果"
    />
    <!-- 明显的返回按钮：悬停/点击时让 iframe 失焦，避免被 iframe 盖住菜单后无法退出 -->
    <button class="cards-view-back" @click="close" title="关闭图纸库，回到拼豆画布（Esc 也可以）">
      ← 返回拼豆
    </button>
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

.cards-view-back {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 5; /* 相对 .cards-view，iframe 之上 */
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  background: rgba(15, 17, 22, 0.75);
  color: #e8e8e8;
  font-size: 14px;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.cards-view-back:hover {
  background: rgba(255, 213, 74, 0.15);
  border-color: rgba(255, 213, 74, 0.6);
  color: #ffd54a;
}
</style>
