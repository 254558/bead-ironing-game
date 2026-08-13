import { onMounted, onUnmounted } from 'vue'

/** 按 Esc 触发回调：挂载时注册 keydown、卸载时注销（对话框/全屏面板统一出口） */
export function useEscapeKey(fn: () => void) {
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') fn()
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown))
}
