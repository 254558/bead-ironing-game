<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { store } from '../stores/game'
import { importImage } from '../utils/imageImport'

/** 38 张内置图纸（与图纸库 pattens/patterns/ 一一对应，1024×1024、40×40 标准网格图纸） */
const PATTERNS = [
  'Rainbow Alt', 'Radiant', 'Reverse Holo', 'Pikachu Promo', 'Cosmos',
  'TG V', 'TG Gold', 'Shiny V', 'Regular Holo', 'Plain (No Foil)',
  'Shiny VMAX', 'Ultra Full Art', 'Amazing Rare', 'Gold Secret', 'Trainer Full Art',
  'VMAX', 'TG VMAX', 'Rainbow', 'VSTAR', 'Sunpillar V',
  'TG Holo', 'Shiny', 'Pikachu Promo', 'VSTAR', 'Cosmos',
  'Gold Secret', 'TG VMAX', 'Amazing Rare', 'Cosmos', 'VSTAR',
  'VSTAR', 'Ultra Full Art', 'Pikachu Promo', 'Ultra Full Art', 'Regular Holo',
  'Rainbow Alt', 'Plain (No Foil)', 'Amazing Rare',
].map((name, i) => ({ name, src: `pattens/patterns/p${String(i + 1).padStart(2, '0')}.webp` }))

const loading = ref('')

function close() {
  store.showPatternPicker = false
}

/** 点击图纸：拉取内置 webp 当图片文件导入（beads 模式自动识别 40×40 网格放好豆子） */
async function pick(p: { name: string; src: string }) {
  if (loading.value) return
  loading.value = p.name
  try {
    const res = await fetch(p.src)
    if (!res.ok) throw new Error(res.statusText)
    const file = new File([await res.blob()], p.src.split('/').pop()!, { type: 'image/webp' })
    importImage(file, 'beads')
    close()
  } catch {
    loading.value = ''
    store.status = '内置图纸加载失败，请稍后重试'
    store.statusVisible = true
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="pattern-picker" @click.self="close">
    <header class="pattern-picker-head">
      <div>
        <h3>从内置 38 张图纸选</h3>
        <p class="pattern-picker-desc">点一张图纸，自动识别 40×40 网格铺好豆子，你只需要熨烫</p>
      </div>
      <button class="pattern-picker-close" @click="close" title="关闭（Esc 也可以）">✕</button>
    </header>

    <div class="pattern-picker-grid">
      <button
        v-for="p in PATTERNS"
        :key="p.src"
        class="pattern-card"
        :disabled="!!loading"
        @click="pick(p)"
      >
        <img :src="p.src" :alt="p.name" loading="lazy" class="pattern-card-img">
        <span class="pattern-card-name">{{ p.name }}</span>
        <span v-if="loading === p.name" class="pattern-card-loading">正在识别...</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.pattern-picker {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  flex-direction: column;
  background: rgba(15, 17, 22, 0.96);
  backdrop-filter: blur(6px);
  padding: 20px 24px;
  box-sizing: border-box;
}

.pattern-picker-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.pattern-picker-head h3 {
  margin: 0;
  color: #ffd54a;
  font-size: 20px;
  font-weight: 600;
}

.pattern-picker-desc {
  margin: 6px 0 0;
  color: rgba(232, 232, 232, 0.65);
  font-size: 13px;
}

.pattern-picker-close {
  flex: none;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #e8e8e8;
  font-size: 15px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.pattern-picker-close:hover {
  background: rgba(255, 213, 74, 0.15);
  border-color: rgba(255, 213, 74, 0.6);
  color: #ffd54a;
}

.pattern-picker-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: 14px;
  padding: 4px 4px 12px;
}

.pattern-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  color: #e8e8e8;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.15s ease;
}

.pattern-card:hover:not(:disabled) {
  border-color: rgba(255, 213, 74, 0.6);
  background: rgba(255, 213, 74, 0.1);
  transform: translateY(-2px);
}

.pattern-card:disabled {
  cursor: default;
  opacity: 0.75;
}

.pattern-card-img {
  display: block;
  width: 100%;
  aspect-ratio: 0.718;
  object-fit: cover;
  border-radius: 6px;
  background: #1a1d25;
}

.pattern-card-name {
  font-size: 12px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pattern-card-loading {
  position: absolute;
  inset: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(15, 17, 22, 0.7);
  color: #ffd54a;
  font-size: 12px;
}
</style>
