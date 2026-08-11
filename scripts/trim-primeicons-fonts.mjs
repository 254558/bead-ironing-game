// 构建收尾（build 脚本最后一步）：删除 primeicons 的 eot/ttf/svg/woff，只留 woff2。
// primeicons.css 的 @font-face 声明了 5 种格式，浏览器永远优先用 woff2（现代浏览器全支持），
// Vite 却会把 5 个文件全部拷进 dist——其余 4 个约 360KB 纯属冗余
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const dir = 'dist/assets'
let files
try {
  files = await readdir(dir)
} catch {
  process.exit(0) // dist/assets 不存在（构建被跳过等）时静默结束
}
const targets = files.filter((f) => /^primeicons-[^.]*\.(eot|ttf|svg|woff)$/.test(f))
await Promise.all(targets.map((f) => rm(join(dir, f), { force: true })))
if (targets.length > 0) console.log(`已裁剪 primeicons 多余字体格式：${targets.join(', ')}`)
