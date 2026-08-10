<script setup lang="ts">
import CardsView from './components/CardsView.vue'
import ColorWheelPanel from './components/ColorWheelPanel.vue'
import ImportDialog from './components/ImportDialog.vue'
import Stage from './components/Stage.vue'
import ToolPanel from './components/ToolPanel.vue'
import { store } from './stores/game'
</script>

<template>
  <div class="app">
    <aside class="sidebar sidebar-left">
      <ToolPanel />
    </aside>
    <Stage />
    <aside class="sidebar sidebar-right">
      <ColorWheelPanel />
    </aside>
    <ImportDialog />
    <CardsView v-if="store.cardsView" />
  </div>
</template>
