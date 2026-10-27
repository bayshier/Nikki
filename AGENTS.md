# Nikki 游戏合集 · Agent 开发约定

给 AI 编码代理的项目速览。动手前先读这里,可以少踩坑。

## 项目形态

- **纯原生 HTML/CSS/JS,零依赖、零构建**:打开网页即玩,部署在 GitHub Pages。
  不引入 npm/打包器;three.js 走 `vendor/three/` 本地 vendor + importmap(r160)。
- 每个游戏一个自包含文件:`games/*.html`;大型游戏用目录(`games/match3/`、`games/dopa/`)。
- 3D 大场景在 `isle3d/`(模块化 js + `CONTRACT.md`),公共 three.js 封装在 `shared/three-kit.js`。
- 公共系统层 `shared/common.js`(命名空间 `Nikki`):统一钱包 Wallet、每日挑战 Daily、
  猫咪图鉴 Dex、存档读写 jget/jset(带 `{v}` schema 版本包裹)、手感系统 Feel。
  所有游戏共用金币与图鉴,新游戏必须接这套而不是自己开新的 localStorage 键。

## 游戏循环约定(重要)

- **逻辑必须跑在固定 60Hz 步长上**,不要裸 `requestAnimationFrame` 按渲染帧跑逻辑——
  高刷屏(144Hz)上游戏会等比加速。二选一:
  1. 接 `Nikki.Feel.play(update, draw)`(2D 游戏首选,自带 hit-stop 与 trauma 屏震);
  2. 自写累加器(参考 `games/mario.html` 的 STEP/acc 模式,渲染可用 alpha 插值)。
- update 里的数值都是「每 tick 常量」(60Hz 下校准),不要混入真实 dt;
  渲染侧动画(云、水纹)用真实 dt 缩放。
- 手感三件套从 `Nikki.Feel` 拿:`shake(0..1)` 屏震、`hitStop(ticks)` 顿帧、
  `offset(maxX, maxY)` 在 draw 开头取偏移量做 `ctx.translate`(背景多画一圈遮露边)。
- 切后台:rAF 会被浏览器冻结,恢复时累加器必须钳制(参考 Feel.play 的 MAX_LAG)。

## 存档约定

- 经 `Nikki.jget/jset` 读写,自动带 schema 版本;读取端兼容无版本的旧格式。
- 跨游戏数据(金币/图鉴/每日挑战)只走 Wallet/Daily/Dex,键名 `nikki_*`。

## 验证方式

- 零构建没有测试框架;3D 游戏留确定性钩子(参考 `window.__golf3d.step(n)`,
  后台标签 rAF 冻结时也能跑物理断言),改动后用本地 `python -m http.server` + 浏览器冒烟。
- 2D 游戏至少验证:加载无报错、开局、核心事件路径(死亡/进洞/消行)不抛错。
