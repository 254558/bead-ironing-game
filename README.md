# 熨烫拼豆 · Bead Ironing

一个像素风拼豆（perler beads）创作应用：在 Three.js 实时 3D 棋盘上摆放彩色拼豆，模拟熨烫让豆子熔融变形，可旋转视角从任意角度欣赏成品。

基于 Vue 3 + Vite + TypeScript + Three.js。

**在线体验：[pindou520.fun](https://pindou520.fun)（免下载，浏览器直接玩）**

## 功能特性

- **实时 3D 棋盘** — 全程 Three.js 渲染（不再有 2D 画布）：EVA 哑光塑料材质、实时阴影、倾斜俯视角（可 360° 环绕），点击/拖拽放豆，右键精细擦除，滚轮锚点缩放（0.25~3 倍），画布固定 40×40
- **设计模式** — 右侧 32 色轮盘选色，橡皮擦（✕，6×6 区域）与右键擦除互补；豆子为 5mm 规格 EVA 拼豆
- **熨烫模式** — 按住鼠标模拟熨斗，熔融度随距离椭圆衰减；豆子逐渐压扁、孔洞闭合，颜色始终不变（不会烫糊）
- **视角工具** — 隐藏棋盘线，左键拖拽旋转视角、WASD 移动视角，回到设计模式后视角保留可继续放豆
- **图片导入** — 两种方式：导入成图纸（像素参考层，自己对照放豆）或直接生成豆子（自动铺好，只需熨烫）；标准网格图纸（40×40 等）按格子中心色精确 1:1 还原，其他图片按 32 色调色板识别
- **内置图纸库** — 38 张宝可梦卡牌全息效果图纸（pattens/），图纸库展开卡牌点「import」自动铺好豆子

## 快速开始

要求：Node.js ≥ 20.19（Vite 8 需要），npm

```bash
# 安装依赖（会同时安装 workspace 图纸库的依赖）
npm install

# 启动开发服务器（默认 http://localhost:5173/）
npm run dev
```

开发时改了 `pattern-library/` 里的图纸，`npm run build:patterns` 重新同步后刷新浏览器即可（详见下文「构建与打包」）。

## 构建与打包

### 一次完整构建

```bash
npm run build
```

一条命令完成三步，最终产物全部输出到 `dist/`：

| 步骤 | 命令 | 作用 |
| --- | --- | --- |
| 1 | `npm run build:patterns` | 构建图纸库（`pattern-library/`，Vite 3 + Svelte 3 静态站），并同步产物到 `public/pattens/`（游戏 iframe 加载的静态文件） |
| 2 | `vue-tsc -b` | 游戏代码 TypeScript 类型检查 |
| 3 | `vite build` | 构建游戏，并把 `public/` 原样复制进 `dist/` |

### 产物结构

```text
dist/
  index.html            # 游戏入口
  assets/               # 游戏 JS/CSS 包
  pattens/              # 图纸库静态文件（游戏 iframe 加载，来自 public/pattens/）
```

> `dist/` 是构建产物，已在 .gitignore 中，不入库。

### 本地预览构建产物

```bash
npm run preview        # 默认 http://localhost:4173/
```

### 部署（Cloudflare Pages）

部署在 Cloudflare Pages 控制台完成（仓库内没有 CI 配置），配置如下：

| 配置项 | 值 |
| --- | --- |
| 框架预设 | Vite |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |

push 到 GitHub 后自动触发构建部署。

### SEO 与搜索引擎收录

站点已接入 Google 与百度的站长平台，主动提交收录：

| 平台 | 状态 | 说明 |
| --- | --- | --- |
| Google Search Console | ✅ 已接入 | 域名已验证（`index.html` 里的 `google-site-verification` meta）、sitemap 已提交、首页已请求收录 |
| 百度搜索资源平台 | ✅ 已接入 | 站点已验证（`index.html` 里的 `baidu-site-verification` meta）、首页已通过 API 主动推送 |

相关文件（都在 `public/`，构建后进 `dist/`）：

- `robots.txt` — 允许全站抓取；`/pattens/`（图纸库，第三方内容）明确 Disallow
- `sitemap.xml` — 站点地图（首页地址 + 更新时间）
- `_headers` — `/pattens/*` 加 `X-Robots-Tag: noindex`；静态资源长缓存、HTML 不缓存
- `_redirects` — SPA 回退（`/* → /index.html 200`）
- `manifest.json` / `og-cover.jpg` / 各种尺寸 icon — PWA 与分享卡片

注意：

- **百度 sitemap 提交配额为 0**：需要先做 ICP 备案并在「站点属性」填写主体备案号，百度才会开放 sitemap 提交；目前用的是 API/手动提交普通收录。
- **两个验证 meta 别删**（`index.html` 中）：`google-site-verification` 和 `baidu-site-verification`，删了会导致站长平台验证失效。
- Cloudflare Pages 默认会把 `/xxx.html` 308 重定向到 `/xxx`（clean-URL），所以百度文件验证方式会失败——本项目用的是 HTML 标签验证，不受影响。


### 只重新同步图纸库

只改了 `pattern-library/` 里的图纸（加图纸、调样式），不必构建整个游戏：

```bash
npm run build:patterns
```

重新构建图纸库并同步到 `public/pattens/`。同步规则见下文「图纸库（pattern-library/）」一节。

## 玩法

1. **放豆**：左侧点「设计」，右侧色轮选颜色，在画布上点击或拖拽摆放拼豆；色轮第 0 项是橡皮擦（✕），右键可精细擦除单颗
2. **熨烫**：点「熨烫」进入，按住鼠标在豆子上来回移动，豆子会熔融变扁、孔洞闭合，颜色不变
3. **视角**：点「视角」调整——左键拖拽旋转视角、WASD 移动视角，调整好点「设计」继续放豆（视角保持不变）
4. **导入**：点「图纸」→「导入图片」选一张图片，可导入成图纸（对照放豆）或直接生成豆子（自动铺好，只需熨烫）；或打开全息卡牌图纸库，展开卡牌点「import」自动铺豆

> 提示：已熨平的豆子在「设计 / 熨烫」切换间保持压扁状态。

## 项目结构

```text
src/
  types.ts                 # 核心类型（Cell / Mode / ImportMode 等）
  stores/game.ts           # 全局状态（模块级单例，reactive + actions）
  utils/
    color.ts               # 调色板、布局与物理常量
    imageImport.ts         # 图片 → 写入网格（标准网格图纸 1:1 还原，其他按 32 色调色板识别）
  three/
    board.ts               # three.js 3D 棋盘（光照/阴影/固定 40×40 画布/放豆与视角交互，createThreeBoard 工厂）
    beadGeometry.ts        # 珠子几何体与 EVA 材质（空心 / 熔融带孔 / 完全熔融）
  composables/
    useIroning.ts          # 熨烫 rAF 循环 + 熔融计算
    useEscapeKey.ts        # Esc 关闭面板（对话框/全屏面板共用）
  components/
    ToolPanel.vue          # 左侧工具菜单（设计 / 熨烫 / 视角 / 图纸）
    ColorWheelPanel.vue    # 右侧 32 色轮盘 + 橡皮擦
    Stage.vue              # 主舞台（3D 棋盘 + 覆盖层）
    BoardView.vue          # 3D 棋盘宿主（创建/销毁棋盘，响应模式与网格变化）
    StatusBar.vue          # 状态提示（PrimeVue Toast）
    CardsView.vue          # 图纸库全屏 iframe（public/pattens/）
    bits/                  # 第三方组件（vue-bits：LineSidebar / OptionWheel，已本地化适配）
pattern-library/           # 图纸库源项目（原 pokemon-cards-css-main，Svelte 3 静态站，npm workspace）
scripts/
  sync-pattens.mjs         # 构建图纸库 → 同步到 public/pattens/（见下）
```

## 图纸库（pattern-library/）

内置 38 张图纸来自独立静态站点（Vite + Svelte 3，原 pokemon-cards-css-main），作为 npm workspace 并入本仓库：

- **源项目**在 `pattern-library/`，改图纸库代码就在这改
- **游戏加载**的是它的构建产物 `public/pattens/`（iframe 直接引用，与源码项目解耦）
- 修改后运行 `npm run build:patterns`（或直接 `npm run build`）自动重新构建并同步；同步规则：
  - 合并复制 `dist/*` → `public/pattens/`，保留 pattens 独有文件（favicon.png / thumb.png）
  - 跳过 `.DS_Store`，并自动清理旧版本 `assets/index.*` 入口残留
  - 自动把 `index.html` 里的 `/assets/` patch 成 `./assets/`（iframe 以子路径加载，绝对路径会 404）

### 新增一张图纸（以第 39 张为例）

图纸要求：**1024×1024、40×40 标准网格的 webp**（游戏自动识别网格精确 1:1 铺豆；其他尺寸也能导入，但不保证还原）。

**① 放图纸文件**

```text
pattern-library/public/patterns/p39.webp   ← 编号两位数字补零（p01…p38、p39…p99）
```

**② 参考页加卡**（`pattern-library/src/App.svelte`，在最后一张 `<Card>` 后追加）

```svelte
<Card
  id="pattern-39"
  name="新图纸 (p39)"
  types="pattern"
  img="./patterns/p39.webp"
  number="39"
  rarity="任意稀有度文字"
  supertype="Pokémon"
  subtypes="Basic"
/>
```

> 第 ② 步的 `id` 必须按 `pattern-39` 格式命名（游戏按 id 拉取 `pattens/patterns/p39.webp`）；参考页的展示效果由 `name` 决定。

**③ 同步**

```bash
npm run build:patterns
```

**④ 验证**：`npm run dev` → 游戏里「图纸」→ 全息卡牌图纸库，展开新卡点「import」铺豆正常；参考页也应能看到新卡。

## 技术栈

| 类别 | 选择 |
| --- | --- |
| 框架 | Vue 3.5（Composition API, `<script setup>`） |
| 构建 | Vite 8 + TypeScript 5.9 |
| 3D | three 0.185 + OrbitControls（旋转阻尼） |
| 状态管理 | 模块级单例 store（未引入 Pinia） |
| UI | PrimeVue（Toast 提示）+ Tailwind CSS 4 + vue-bits 交互组件 |

## 相关

- 仓库：[github.com/254558/bead-ironing-game](https://github.com/254558/bead-ironing-game)
