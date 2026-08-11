import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // three.js 独立分包：体积大（~635KB）且基本不变，单独下载、独立长缓存
        // vue/primevue/@primeuix（含 @vue/* 运行时）并入 vendor 分包：与应用代码分开，
        // 发布后应用代码 hash 变化不影响框架 chunk 缓存
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
          if (
            id.includes('node_modules/vue') ||
            id.includes('node_modules/@vue/') ||
            id.includes('node_modules/primevue') ||
            id.includes('node_modules/@primeuix')
          ) return 'vendor'
        },
      },
    },
  },
})
