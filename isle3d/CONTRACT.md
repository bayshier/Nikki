# 猫岛胜景 · 模块契约(CONTRACT)

12 个模块专员各写一个文件,合起来是 `isle.html` 的一个 Ghibli 风猫岛大场景。
参考图是**唯一审美标准**:构图、比例、材质、颜色尽量对准 `isle3d/refs/` 里的图。

## 铁律(违反 = 打回)

1. 只写自己那一个文件,**不动任何其他文件**。
2. 接口固定:`export function build(ctx)` 返回 `{ group, update(t, dt) }`(`update` 可省略,`group` 必须有)。
3. 一切通过 `ctx` 取:禁止 `import "../main.js"`、禁止自建 renderer/camera/scene/循环/雾/灯。
4. **禁实时阴影**。接触阴影用"半透明深色圆片/矩形"贴地假阴影。
5. 预算:每模块 ≤ 25 个 mesh(draw call)、≤ 2 万三角面。重复元素**必须 InstancedMesh**。
6. update 里不许 new 对象(每帧分配会卡弱核显),向量/颜色复用模块级临时变量。
7. 写完必须 `node --check 文件` 通过(用 `/c/Program Files/nodejs/node.exe`)。
8. 材质优先用 `ctx.mats`(见下表);要新颜色就自己 MeshStandardMaterial,roughness ≥ 0.7,色值从参考图取。
9. 代码风格参考 `D:\GitHub\pelican-isle\js\*.js`(注释用中文分节横线)。
10. 文件 ≤ 380 行。

## ctx 字段

| 字段 | 说明 |
|------|------|
| `ctx.THREE` | three r160(页面 importmap 已配) |
| `ctx.scene / camera / renderer` | 只读使用 |
| `ctx.mats` | 共享材质:grass/grassD/cliff/cliffD/rock/wood/woodD/roof/roofD/pillar/stone/stoneD/white/gold/dark |
| `ctx.heightAt(x, z)` | 地形高度解析式,**任意落点都用它**,自己不算 |
| `ctx.LAYOUT` | 关键地标常量(SEA_Y=0 / PLATEAU_Y=18 / WATERFALL / PAVILION / BRIDGE / STATUE_PATH) |
| `ctx.G` | `{ t, dt, quality("high"/"mid"/"low"), camPos }` |
| `ctx.onUpdate(fn)` | 注册每帧回调 `fn(t, dt)` |
| `ctx.onQuality(fn)` | 注册画质回调;`low` 时主动隐藏粒子/减实例数 |

## 坐标系与布局(x 向东,z 向南;y 上)

- 海平面 `y=0`;草台顶 `y=18`;悬崖缘在 `x≈8`(以西是高出海面 18 的草台,以东跌落海中)。
- `ctx.heightAt(x,z)` 已含:草台缓坡、崖壁、东西两处小丘(主亭/雕像台)、崖下碎石滩。
- **瀑布槽**:崖缘 `(x=5, z=6)` 越过悬崖,水落到海面 `(x≈5, z≈26)`,槽宽 7。
- **主亭** `(-34,-6)`;**拱桥**爬升段中心 `(16,-2)`;**雕像道**从 `(-52,14)` 向 -z 延伸。
- 相机默认在东南向空中环绕看岛(对应 ref1 视角),所以**岛的东南立面最上镜**,细节优先级最高。

```
        北 -z                ☁ 太阳在东北远空
   ┌─────────────────────────────┐
   │  松林   主亭(-34,-6)  悬崖缘 x≈8   ↘ 瀑布(5,6→26)
   │  雕像道     草台 y=18            ↓
   │ (-52,14)→-z   樱树     拱桥(16,-2)   海 y=0
   └─────────────────────────────┘
        南 +z(相机在这一侧)
```

## 色板(从 ref1 取)

天顶紫 `#b48ae0` · 霞粉 `#ffc9d8` · 海青 `#5fc4d8`/深 `#2e8ba8` · 草绿 `#8ed07a`/深 `#5da052`
崖岩紫灰 `#9b8f9c` · 木暖 `#d8a878` · 亭柱红 `#e06a5a` · 瓦青 `#5a7a9a` · 石白 `#cfc9dc`

## 模块 × 参考图 × 落位

| 文件 | 管 | 对齐参考图 | 要点 |
|------|----|-----------|------|
| `modules/terrain.js` | 岛体:草台+崖壁+滩+小径 | ref1, ref8 | PlaneGeometry 96×72 段按 heightAt 位移,顶点色草绿→崖灰渐变;崖壁要有力度的竖向褶皱 |
| `modules/water.js` | 海面 | ref1, ref3 | 大平面 y=0,近岸透明渐变青绿;波光用两层错速滚动的半透明纹理(程序 canvas);岸边白泡沫环 |
| `modules/waterfall.js` | 瀑布 | ref2 | 水帘(半透明白青多层错速)+ 崖顶槽口 + 落点白沫与雾片 + 涟漪环;update 里流动 |
| `modules/trees.js` | 松树群 | ref1, ref6 | InstancedMesh 2~3 层锥/球簇,40 棵上下;树干共用;位置撒 heightAt>15 的草台,别挡主亭和相机东南视线 |
| `modules/flowers.js` | 樱花树+花簇+草丛 | ref6, ref7 | 樱树 8 棵(粉球簇)放崖缘与亭旁;草丛/小花 InstancedMesh 数百 |
| `modules/pavilion.js` | 主亭+两小亭 | ref4 | 红柱青瓦白台基,飞檐用弯 Box/斜切;主亭(-34,-6) 台基对齐 heightAt;小亭 2 座错落 |
| `modules/bridge.js` | 拱桥+石径+灯笼 | ref8 | 木拱桥跨崖壁爬升段(16,-2 附近),栏杆柱+扶手;石径连桥→亭→雕像道;灯笼柱 6 根 |
| `modules/statues.js` | 猫石雕像道 | ref5 | 6 尊坐姿石猫(几何化,stone 材质+苔藓绿顶),沿 (-52,14)→-z;底座石台 |
| `modules/cats.js` | 八只活猫 | ref4, ref5 | **必须** `import { makeCat, idleCat } from "../../shared/three-kit.js"`;毛色:chenpi 白+patch #23232c / baozi #fff5f0 / niannian #ffb38a / songlu #6b4a3a / youyu #ffc9a0 / jinzhang #9aa7b8 / daer #ff9e5e / ali #d9776e;散在亭前/桥头/雕像道,待机+1~2 只缓步往返 |
| `modules/rocks.js` | 海蚀岩+踏石+杂件 | ref8 | 崖下大海蚀岩群(海里也立几块,对齐 ref1 右下)、岸边踏石、木牌/篱笆 |
| `modules/skyprops.js` | 鸟群+蝴蝶 | ref9 | 鸟 5~7 只 V 形排绕岛缓飞(双三角面扇翅);蝴蝶 6 只绕花 |
| `modules/effects.js` | 光斑+雾气+落樱 | ref7 | additive 光带 3~4 条斜插树间;低空雾片 sprite;樱花瓣飘落 30~60 片;`low` 画质全隐 |

## 验收(整合者执行)

- `isle.html` 全模块装载 ✅,`node --check` 全过
- 截图 vs ref1:构图/色板肉眼接近;瀑布、水面、远山层次成立
- 弱核显档(像素比 0.75、关特效)帧率优先

---

## 附:v2 画面升级(2026-11-24,引擎层)

模块接口(`build(ctx)` → `{ group, update }`)**没有变**,已有模块一行没改也自动享受新画面。
以下是引擎层新增的能力,以及它们对上面铁律的修订。

### 对铁律的修订

| 原铁律 | 现在 |
|---|---|
| 4. 禁实时阴影 | 引擎在高画质档**自动**给所有"标准材质的物体"开实时投影(标记由 `applyShadows` 统一打)。模块**不要**自己碰 `renderer.shadowMap` / `castShadow`;假阴影片请**保留**,中/低画质档没有实时投影,仍靠它做接触暗部 |
| 8. 材质用 `ctx.mats` 或自建 MeshStandardMaterial | 不变。但要知道:**所有 MeshStandardMaterial 都会被自动换成卡通着色**(三阶色阶 + 边缘光,没有高光)。选色请按"固有色"选,偏饱和一些;想要的光泽不会再由 PBR 高光提供 |

### 新增的 ctx / 全局能力

- `ctx.sun`:太阳平行光(main.js 配阴影相机用;海面着色器取它算反光方向)。
- 自定义着色器(海面、天空)不受卡通注入影响,需要自己遵守三条:
  1. 开 `fog: true` 的 `ShaderMaterial`,uniforms 必须 `THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {...}])`;
  2. 片元末尾必须有 `#include <tonemapping_fragment>` + `#include <colorspace_fragment>`
     (渲染进 HDR 缓冲时为空操作,低画质直出时才生效——两条路径才一致);
  3. 要参与雾就照常写 `fog_pars_*` / `fog_vertex` / `fog_fragment`,顶点里那个变量必须叫 `mvPosition`。

### 描边(仅高画质)

渲染前引擎会用"法线材质"把整个场景**再画一遍**,拿到屏幕空间的法线 + 深度做边缘检测。所以:

- 物体的**轮廓**和**折痕**(法线突变)都会自动出墨线,不需要模块做任何事。
- 以下东西会被描边预通道**跳过**(它们没有稳定的"面"):精灵、以及材质为
  `MeshBasicMaterial` 且(半透明 或 双面)的物体——光带、花瓣、假阴影片都属此类。
  新模块如果画类似的"特效片",请沿用同样的材质组合,否则会凭空多出一圈黑边。
- 半透明的水面在预通道里是**不透明**的:水下的东西不会被描边(通常正是想要的效果)。

### 画质三档(由 main.js 的 `applyQuality()` 统一切换)

| 档位 | 内容 | 整帧开销(1280×720 实测) |
|---|---|---|
| high | MSAA×4 + 描边 + 实时投影 + 泛光 + 调色 | ~630 draw calls / ~22.6 万三角面 |
| mid | HDR + 泛光 + 调色 | ~190 / ~5.8 万 |
| low | 直出(像素比 0.75) | ~145 / ~5.2 万 |

模块的 `ctx.onQuality` 回调照旧生效(低配减实例、隐特效)。切换画质会改变着色器变体,
main.js 在启动后会偷偷把三档都渲染一帧做**预热**,避免自动降档时卡顿。

### 测试钩子(`window.__isle`)

- `step(t)`:把时间推到 t 并跑一遍所有模块的 `update` —— 后台标签 rAF 冻结时的确定性步进。
- `setQualityLevel(0|1|2)`:切画质,走的是和自动降档同一条路径。
- `post.debug(1..5)`:看深度 / 法线 / 描边掩码 / 纯场景色 / 纯泛光。
- IAB 后台标签里 rAF 不跑、相机停在原点:测试要自己 `camera.position.set(...)` + `lookAt(...)` 再渲染。
