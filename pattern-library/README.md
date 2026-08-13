# pattern-library · 图纸库

宝可梦卡牌全息效果参考页（Vite + Svelte 3），作为 npm workspace 并入 **bead-ironing** 游戏仓库，为游戏提供「内置图纸」：游戏内点「图纸」打开全屏参考页，展开卡牌点「import」自动铺豆。

代码源自上游开源项目 [simeydotme/pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css)（Holographic Trading Card Effect）。并入后按游戏需求删减了废弃素材，并新增 `public/patterns/` 下的 38 张拼豆图纸。

## 与游戏的关系

游戏**不直接引用本目录**，加载的是同步后的静态产物 `public/pattens/`（游戏根目录下，iframe 直接引用）：

```
pattern-library/            （源码：改图纸、改卡面样式在这改）
    ↓ npm run build → dist/
    ↓ 根脚本 scripts/sync-pattens.mjs 同步
public/pattens/             （产物：游戏运行时加载的成品）
```

同步时脚本自动：

- 合并复制 `dist/*` → `public/pattens/`，保留 pattens 独有文件（favicon / thumb）
- 跳过 `.DS_Store`，自动清理旧版本 `assets/index.*` 入口残留
- 把 `index.html` 里的 `/assets/` patch 成 `./assets/`（iframe 以子路径加载，绝对路径会 404）

## 常用命令

依赖由仓库根目录 workspace 统一安装（在根目录 `npm install` 即可）。在 `pattern-library/` 内：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 独立运行参考页（http://localhost:5173） |
| `npm run build` | 构建到 `dist/`（产物会被根同步脚本复制到游戏） |
| `npm run preview` | 本地预览构建产物 |

> 平时**不需要**单独跑 build —— 根目录 `npm run build` 或 `npm run build:patterns` 会自动构建本目录并同步到 `public/pattens/`。

## 新增图纸

见根目录 README 的「新增一张图纸」章节，完整步骤：

1. 放图纸 → `public/patterns/p39.webp`（两位补零编号，1024×1024、40×40 网格）
2. `src/App.svelte` 末尾追加 `<Card id="pattern-39" …>`（id 必须按 `pattern-NN` 命名，游戏按 id 拉取）
3. 根目录跑 `npm run build:patterns` 同步
4. `npm run dev` 验证：展开新卡点「import」铺豆正常，参考页能看到新卡

## 关键文件

| 文件 | 说明 |
| --- | --- |
| `index.html` | 参考页入口（游戏 iframe 的 `src`） |
| `src/App.svelte` | 卡片列表，每张图纸一条 `<Card>` |
| `src/lib/components/Card.svelte` / `CardProxy.svelte` | 卡片组件（全息效果） |
| `public/patterns/p01~p38.webp` | 图纸图片（1024×1024、40×40 标准网格） |
| `public/css/cards/*.css` | 各种卡面全息样式（彩虹、闪卡、VMAX 等） |
| `src/lib/components/alternate-arts.json` / `promos.json` | 卡面元数据（换图、异画） |

## 上游与许可

全息卡面效果来自 [simeydotme/pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css)，在线演示见 [poke-holo.simey.me](https://poke-holo.simey.me/)；本目录保留上游 `LICENSE`（MIT）。

- Galaxy Holo 素材来自 [aschefield101](https://www.deviantart.com/aschefield101/art/HoloSheet-2012-313543843)
- 部分背景来自 [Vecteezy](https://www.vecteezy.com/free-photos)
