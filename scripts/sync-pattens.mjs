/**
 * 同步图纸库：构建 pattern-library → 合并复制到 public/pattens/（游戏 iframe 加载的静态产物）。
 *
 * 规则：
 *  - 构建：在 pattern-library/ 内执行 vite build
 *  - 合并复制：dist/* 复制进 public/pattens/，不删除目标里已有的文件
 *    （favicon.png / thumb.png 只存在于 pattens，dist 没有，靠合并复制保留）
 *  - 忽略清单：.DS_Store（macOS 系统文件，不入库）
 *  - patch：index.html 里 "/assets/ → ./assets/（iframe 以子路径 /pattens/ 加载，绝对路径会 404）
 */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'pattern-library', 'dist')
const DEST = join(ROOT, 'public', 'pattens')

// 1. 构建图纸库
execSync('npm run build', { cwd: join(ROOT, 'pattern-library'), stdio: 'inherit' })

if (!existsSync(SRC)) {
  throw new Error(`图纸库产物不存在：${SRC}，请先确认 pattern-library 能正常构建`)
}

// 2. 合并复制
function copyTree(src, dest) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue
    const s = join(src, entry.name)
    const d = join(dest, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(d, { recursive: true })
      copyTree(s, d)
    } else {
      cpSync(s, d)
    }
  }
}
mkdirSync(DEST, { recursive: true })
copyTree(SRC, DEST)

// 3. patch index.html：/assets/ → ./assets/（iframe 子路径加载）
const htmlPath = join(DEST, 'index.html')
const patched = readFileSync(htmlPath, 'utf8').replaceAll('"/assets/', '"./assets/')
writeFileSync(htmlPath, patched)

// 4. 清理 assets/ 里旧的 index.* 入口包残留（vite 内容哈希会随版本/内容变化，旧包不再被引用）
//    只处理 index.*.js / index.*.css 两个入口，不动 bundle 内引用的其他哈希资源
const referenced = new Set([...patched.matchAll(/\.\/assets\/([^"']+)/g)].map((m) => m[1]))
for (const file of readdirSync(join(DEST, 'assets'))) {
  if (/^index\..+\.(js|css)$/.test(file) && !referenced.has(file)) {
    rmSync(join(DEST, 'assets', file))
  }
}

console.log('✔ 图纸库已同步到 public/pattens/（跳过 .DS_Store）')
