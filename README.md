# 熨烫拼豆 · Bead Ironing

一个像素风拼豆（perler beads）创作应用：在 Three.js 实时 3D 棋盘上摆放彩色拼豆，模拟熨烫让豆子熔融变形，可旋转视角从任意角度欣赏成品。

基于 Vue 3 + Vite + TypeScript + Three.js。

**在线体验：[pindou520.fun](https://pindou520.fun)（免下载，浏览器直接玩）**

## 功能特性

- **实时 3D 棋盘** — 全程 Three.js 渲染（不再有 2D 画布）：EVA 哑光塑料材质、实时阴影、倾斜俯视角，点击/拖拽放豆，右键精细擦除，滚轮锚点缩放（0.25~12 倍），网格随窗口/视角自动扩容
- **设计模式** — 右侧 32 色轮盘选色，橡皮擦（✕，6×6 区域）与右键擦除互补；豆子分 5mm 大豆 / 2.6mm 迷你豆两种规格
- **熨烫模式** — 按住鼠标模拟熨斗，熔融度随距离椭圆衰减；豆子逐渐压扁、颜色加深，烫过头（burned）会变黑
- **视角工具** — 隐藏棋盘线，左键拖拽旋转视角、WASD 移动视角，回到设计模式后视角保留可继续放豆
- **图片导入** — 两种方式：导入成图纸（像素参考层，自己对照放豆）或直接生成豆子（自动铺好，只需熨烫）；自动量化为 32 色、居中放置、画布自动扩容，标准网格图纸（40×40 等）可精确 1:1 还原
- **内置图纸库** — 38 张宝可梦卡牌全息效果图纸（pattens/），点选一张自动铺好豆子
- **作品存档** — 多幅作品保存到 localStorage（自动缩略图），随时恢复/删除；每 5 秒 + 关页前自动存档，刷新不丢豆

## 快速开始

要求：Node.js ≥ 20.19（Vite 8 需要），npm

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173/）
npm run dev
```

生产构建与预览：

```bash
npm run build    # 类型检查（vue-tsc）+ 构建到 dist/
npm run preview  # 本地预览构建产物
```

## 玩法

1. **放豆**：左侧点「设计」，右侧色轮选颜色，在画布上点击或拖拽摆放拼豆；色轮第 0 项是橡皮擦（✕），右键可精细擦除单颗
2. **熨烫**：点「熨烫」进入，按住鼠标在豆子上来回移动，豆子会熔融变扁、颜色加深；迷你豆壁薄升温更快，更容易烫糊
3. **视角**：点「视角」调整——左键拖拽旋转视角、WASD 移动视角，调整好点「设计」继续放豆（视角保持不变）
4. **导入**：点「导入」选一张图片，可选择「图纸」（对照放豆）或「直接生成豆子」（自动铺好，只需熨烫）；也可以从内置 38 张图纸里挑
5. **保存**：点「保存」把当前画布存为作品，点「恢复」从列表载入或删除

> 提示：切回「设计」模式会重置所有熔融度。

## 项目结构

```text
src/
  types.ts                 # 核心类型（Cell / Mode / BeadSize 等）
  stores/game.ts           # 全局状态（模块级单例，reactive + actions，含自动存档）
  utils/
    color.ts               # 调色板、颜色工具、布局与物理常量
    thumbnail.ts           # 作品缩略图渲染（离屏 canvas）
    imageImport.ts         # 图片 → 32 色量化 → 写入网格（含标准网格图纸识别）
  three/
    board.ts               # three.js 3D 棋盘（光照/阴影/无限画布/放豆与视角交互，createThreeBoard 工厂）
    beadGeometry.ts        # 珠子几何体与 EVA 材质（空心 / 熔融带孔 / 完全熔融）
  composables/
    useIroning.ts          # 熨烫 rAF 循环 + 熔融计算
  components/
    ToolPanel.vue          # 左侧工具菜单（设计 / 熨烫 / 视角 / 导入 / 图纸 / 保存 / 恢复 / 清空）
    ColorWheelPanel.vue    # 右侧 32 色轮盘 + 橡皮擦
    Stage.vue              # 主舞台（3D 棋盘 + 覆盖层）
    BoardView.vue          # 3D 棋盘宿主（创建/销毁棋盘，响应模式与网格变化）
    SavePanel.vue          # 作品列表（恢复 / 删除）
    StatusBar.vue          # 状态提示（PrimeVue Toast）
    ImportDialog.vue       # 导入方式选择对话框
    PatternPicker.vue      # 内置 38 张图纸选择
    CardsView.vue          # 图纸库全屏 iframe（public/pattens/）
    bits/                  # 第三方组件（vue-bits：LineSidebar / OptionWheel，已本地化适配）
```

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
