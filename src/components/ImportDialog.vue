<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { store } from '../stores/game'
import { importImage } from '../composables/useImageImport'
import type { ImportMode } from '../types'

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

/** 选定导入方式：记录模式、关对话框、打开文件选择器 */
function choose(mode: ImportMode) {
  store.importMode = mode
  store.showImportDialog = false
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) importImage(file, store.importMode)
  input.value = ''
}
</script>

<template>
  <Teleport to="body">
    <div v-if="store.showImportDialog" class="import-dialog-mask" @click.self="store.showImportDialog = false">
      <div class="import-dialog">
        <h3>怎么导入这张图？</h3>
        <p class="import-dialog-desc">选一种方式，之后选图片文件</p>
        <button class="import-dialog-btn import-dialog-btn-pattern" @click="choose('pattern')">
          <span class="import-dialog-btn-title">图纸</span>
          <span class="import-dialog-btn-sub">只显示像素参考图，自己对照放豆</span>
        </button>
        <button class="import-dialog-btn import-dialog-btn-beads" @click="choose('beads')">
          <span class="import-dialog-btn-title">直接变成豆子</span>
          <span class="import-dialog-btn-sub">自动铺好豆子，你只需要熨烫</span>
        </button>
        <button class="import-dialog-cancel" @click="store.showImportDialog = false">取消</button>
      </div>
    </div>
  </Teleport>
  <input ref="fileInput" type="file" accept="image/*" class="file-input" @change="onFileChange">
</template>
