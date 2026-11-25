# Nikki 游戏合集 · Agent 开发约定

给 AI 编码代理的项目速览。动手前先读这里,可以少踩坑。

## 项目形态

- **纯原生 HTML/CSS/JS,零依赖、零构建**:打开网页即玩,部署在 GitHub Pages。
  不引入 npm/打包器;three.js 走 `vendor/three/` 本地 vendor + importmap(r160)。
- 每个游戏一个自包含文件:`games/*.html`;大型游戏用目录(`games/match3/`、`games/dopa/`)。
- 3D 大场景在 `isle3d/`(模块化 js + `CONTRACT.md`),公共 three.js 封装在 `shared/three-kit.js`。
  画面升级层在 `isle3d/js/post.js`(卡通着色注入 / 描边 / 泛光 / 调色),约定见下方「isle3d 渲染约定」。
- 公共系统层 `shared/common.js`(命名空间 `Nikki`):统一钱包 Wallet、每日挑战 Daily、
  猫咪图鉴 Dex、存档读写 jget/jset(带 `{v}` schema 版本包裹)、手感系统 Feel。
  所有游戏共用金币与图鉴,新游戏必须接这套而不是自己开新的 localStorage 键。
- **有独立上游的游戏不要手改副本**:`games/pelican-isle/`(鹈鹕环岛记)来自独立仓库
  [bayshier/pelican-isle](https://github.com/bayshier/pelican-isle)。改游戏请改上游,
  再跑 `python3 tools/sync_pelican.py` 同步进合集(脚本只做三件事:复制 `js/`、改写 index.html
  的 importmap 并挂上 `common.js`、把用到的 addons 补到 `vendor/three/addons/`)。
  上游里所有合集相关代码都用 `typeof Nikki !== 'undefined'` 守卫,独立运行时自动跳过。

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
- **`Nikki` 是顶层 `const`(词法绑定),不是 `window` 的属性**——判断"是否在合集里"要写
  `typeof Nikki !== 'undefined'`,写成 `window.Nikki` 永远是 undefined(踩过:并入了却没发金币)。
- 新游戏接入三件套:最佳成绩键 `nikki_<game>_best`、`DAILY_POOL` 加一条、主页卡片加一行。
- 子目录里的游戏在 `common.js` / 主页里没有统一的路径表,每日挑战横幅靠主页里的 `PATHS` 查表——
  新增子目录游戏记得补。

## 主页(index.html)约定

- 主页是「纸上游戏架」:精选舞台 → 猫窝大厅(3D 猫窝 + 今日挑战票券 + 资产便签 + 图鉴进度)→
  带分类筛选的游戏架。皮肤(纸 / 墨线 / 胶带 / 便利贴)直接写在 `index.html` 里,
  **不再引用 `shared/sketch.css`**(那个文件现在只给 `dex.html` 用)。
- **封面用真图,不用 emoji 当图标**:3D 游戏放真实游戏截图到 `assets/covers/`(960×540 JPEG);
  其余游戏画成墨线贴纸插画,统一写在页面顶部的 `<symbol id="c-*">` 里(160×120,线宽 / 墨色由
  外层 svg 继承,底色取 `--bg`)。新增游戏 = 加一个 symbol + 一张 `.card`。
- 卡片是静态 HTML(不依赖 JS 也能看到全部游戏),JS 只负责成绩、每日挑战和筛选。
- 改版后跑设计审计(两种屏宽必须修的应为 0):
  `node <design 技能目录>/scripts/audit.mjs "http://127.0.0.1:8931/index.html" --project`。

## isle3d 渲染约定

- **主循环只调 `post.render(t)`**,不要直接 `renderer.render`:低画质时它内部会退化成直出。
- **卡通着色是自动的**:模块装载完后 `applyToon(scene)` 给全场 `MeshStandardMaterial` 注入
  三阶色阶 + 边缘光,模块写普通标准材质即可,不用自己处理。自定义 `ShaderMaterial` 不在注入范围内。
- **改 three 内置着色器的三个坑**(都踩过,症状都是"画面全白/物体消失"而不是报错):
  1. `onBeforeCompile` 拿到的着色器里 `#include <...>` **还没展开**。要改某个 chunk 内部,
     必须手动展开 `THREE.ShaderChunk.xxx`、在展开后的文本上打补丁、再替换回原位;
     直接搜函数名会搜不到,补丁静默失效。
  2. 挂进 `shader.uniforms` 的同时,GLSL 里必须写 `uniform vec3 uX;` 声明,否则整个程序编译失败。
  3. 自定义 `ShaderMaterial` 开 `fog: true` 时,uniforms 必须合并 `THREE.UniformsLib.fog`。
- **自定义着色器收尾两行不能省**:`#include <tonemapping_fragment>` + `#include <colorspace_fragment>`。
  渲染进 HDR 缓冲时它们自动为空操作,低画质直出时才做色调映射——两条路径的画面才一致。
- 画质三档:high = 描边 + 实时投影 + 泛光(整帧约为中档 3 倍),mid = 泛光 + 调色,low = 直出。
  切换画质走 `applyQuality()`(会通知模块的 `ctx.onQuality` 回调),不要只调 `post.setQuality`。
- 循环平移 / 超出画面的内容要自己裁剪或做到"够大"(海面 3000²、穹顶 1100);
  海平线处天空的"地平线以下色"必须等于 `scene.fog.color`,否则会出一条接缝线。

## 验证方式

- 零构建没有测试框架;3D 游戏留确定性钩子(参考 `window.__golf3d.step(n)`,
  后台标签 rAF 冻结时也能跑物理断言),改动后起本地服务 + 浏览器冒烟。
- **本地服务用 `python3 tools/serve.py 8931`**(带 `Cache-Control: no-store`),不要用
  `python -m http.server`:后者不发缓存头,Chrome 会给"很久没改过的模块"判很长的缓存新鲜期,
  改完刷新可能还在跑旧代码(而刚改过的文件又能生效),测试结论会悄悄失真。
- isle3d 的钩子都在 `window.__isle`:`step(t)` 确定性推进并跑一遍模块 update、`checkViewport()` 视口自检、
  `setQualityLevel(0|1|2)` 切画质、`post.debug(1..5)` 看预通道 / 描边掩码 / 纯场景色 / 纯泛光。
  IAB 后台标签 rAF 会暂停,相机停在原点——测试要自己摆好 `camera.position` + `lookAt` 再渲染。
- **改过着色器必须查编译结果**:`renderer.info.programs.filter(p => p.diagnostics).length` 应为 0。
  three 的编译错误只打在控制台,不抛异常,表现是"那些面没画出来"。
- 2D 游戏至少验证:加载无报错、开局、核心事件路径(死亡/进洞/消行)不抛错。
