# 📋 复盘与升级计划(RETROSPECTIVE)

> **给未来的我们**:本文写于 2026-10-08。作者对当时产出物的**整体效果不满意**,
> 尤其是视觉品质与原版参考项目的差距。当时的模型能力(手绘 canvas 表现力、
> 出图渠道、音频合成)都有硬天花板,所以把全部资产、第三方引用、已知短板、
> 升级路线固化在这里。**等模型能力升级后,按本文逐项复盘、重做、升级。**
>
> 复盘时先读「一、现状盘点」和「四、升级路线图」,验收标准都写好了。

---

## 一、现状盘点(截至 2026-10-08,main = b6916cd)

| 资产 | 文件 | 状态 | 主要短板(复盘重点) |
|------|------|------|----------------------|
| 游戏大厅 | `index.html` | ✅ 可用 | 卡片全 emoji 图标,缺统一插画;无排序/搜索 |
| 猫咪消消乐 | `games/match3/` | ✅ 可用 | 本次未动;美术仍是色块猫 |
| 猫咪配对 / 猫吃小鱼 / 飞飞猫 / 打地鼠 | `games/memory.html` 等 | ✅ 可用 | 本次未动;同为早期画风 |
| 猫猫马里奥 | `games/mario.html` | ✅ 较好 | v5 引擎+SMB1 物理+大逃杀,是全站标杆;但角色仍为代码绘制 |
| 🆕 猫猫守塔 | `games/td.html` | ⚠️ 玩法成立 | 画面粗糙(圆盘+emoji);平衡偏难;路径只有一张图;无关卡概念 |
| 🆕 猫猫弹幕 | `games/shmup.html` | ⚠️ 玩法成立 | 敌型只有三种;弹幕密度偏低;无擦弹/计分深度;音效单薄 |
| 🆕 猫猫高尔夫 | `games/golf.html` | ⚠️ 玩法成立 | 9 洞固定;无坡度/风;球场视觉简单 |
| 🎨 陈皮穿越艺术史 | `art.html` | ⚠️ 三幕真迹撑场 | **7/10 世界仍是手绘代码场景**(岩洞/莫奈/克里姆特/包豪斯/8bit/蒸汽波/新海诚),与三幅真迹差距明显;猫为代码绘制;转场只有字卡+硬切,没有原版的"签名式转场";BGM 只是五声音阶随机拨弦 |
| 公共系统 | `shared/common.js` | ✅ 稳定 | 每日挑战池 8 项;钱包/图鉴正常 |
| 真迹素材 | `assets/art/*.jpg` | ✅ 三幅 | 见「四、路线图 T1」:待补四幅 |

**作者核心不满**(复盘时优先解决):视觉品质整体达不到参考项目水准;
"精美"依赖真迹撑场,自绘部分依然抽象。

---

## 二、第三方引用总表(全部外部依赖/灵感来源)

复盘升级时**先重读这些参考项目**,它们就是标杆:

### 灵感/玩法参考
| 项目 | 许可 | 用在哪 | 备注 |
|------|------|--------|------|
| [alchaincyf/huashu-art-motion](https://github.com/alchaincyf/huashu-art-motion) | MIT(角色帧除外) | `art.html` 整体玩法 | **最重要标杆**。35 种风格配方+9 种解说语法+"让画动起来"。我们的差距:它有签名式转场、更细的笔触系统、人工调过的构图。复盘时精读其 SKILL.md 与示例源码 |
| [bayshier/open-source-games-zh](https://github.com/bayshier/open-source-games-zh) | CC0(作者本人) | 守塔/弹幕/高尔夫选型 | 基于 bobeff/open-source-games 的中文清单,后续补类型继续从这里选 |
| [bobeff/open-source-games](https://github.com/bobeff/open-source-games) | CC0 | 上游清单 | 类型选型的原始池 |
| [grmchn/dopa-drill](https://github.com/grmchn/dopa-drill) | MIT | `games/dopa/` 多巴算术祭 | 非官方中文复刻,已在 README 致谢 |
| vaclisinc/jyMario | 参考研究 | `games/mario.html` v2 问号砖/食人花 | 物理最终以 SMB1 实测值为准(×2.25 缩放) |
| Igoorx/PyRoyale | 玩法概念 | `games/mario.html` v4 大逃杀 | 只借鉴赛制概念,未复制代码 |

### 图片素材(公有领域,已入仓 `assets/art/`)
| 素材 | 来源 | Met objectID | 文件 |
|------|------|--------------|------|
| 北斋《神奈川冲浪里》 | 大都会博物馆 Open Access | 39799 (JP1847) | `ukiyo.jpg` |
| 梵高《麦田与柏树》1889 | 同上 (Met 49.30) | 436535 | `vangogh.jpg` |
| Menna 墓狩猎图摹本 | 同上 (Theban facsimile) | 548437 | `egypt.jpg` |

> Met API 备忘:`collectionapi.metmuseum.org`;search 已升级 **v1.1**(v1 于 2026-10 退役,
> objects 仍走 v1);**莫奈《日本桥》《睡莲》、全部门 Kandinsky 均 isPublicDomain=false 拿不到**。
> 本机网络访问 Wikimedia/Wikipedia 全断,但 Met + GitHub 走 `--http1.1` 可用。

### 猫咪原型
`assets/cats/`:陈皮(**黑白奶牛猫**,黑帽+额头"八"字垂斑+黄绿大眼,`art.html` 主角)/
包子/年年/松露/大儿/警长/有鱼/阿狸 —— 全部真实照片,© Easin。
**教训:别按名字猜猫色,画角色前先 Read 照片。**

---

## 三、出图渠道状态(复盘时先重测)

| 渠道 | 2026-10-08 状态 | 恢复条件 |
|------|-----------------|----------|
| 内网中转 `192.168.1.61:3000` 的 `qwen-image-2.0-pro` 与 `wan2.7-image-pro` | ❌ 全部 403。两类错误:①"Access to model denied…eligible"(上游资格收回,涉及智谱1/千问/DeepSeek 三条规则共用 key …h1c4KF);②"This token has no access to model …"(智谱2/3 的 token 未勾选图像模型) | ① 上游(阿里云百炼)重新开通图像模型资格;② new-api 后台给 token 模型范围加勾 |
| Codex 内置 `image_gen` 工具 | ❌ 本会话未提供该工具 | 宿主环境升级/启用 |
| `imagegen` skill CLI(`scripts/image_gen.py`) | ❌ 需用户自己的 `OPENAI_API_KEY` | 用户愿意配置 |
| Wikimedia/Wikipedia 直连 | ❌ 网络不通(HTTP/1.1 也救不活) | 网络环境变化;可用 Met Open Access 替代 |

---

## 四、升级路线图(按触发条件分组,含验收标准)

### T1 · 出图模型恢复后(最优先,投入小见效大)
1. **补齐四幅风格画**,替换 art.html 里最弱的手绘场景:
   - `monet.jpg` 莫奈日本桥与睡莲池风格(当前莫奈世界是代码场景,可整体换真画风)
   - `cave.jpg` 拉斯科洞穴壁画风(替换手绘岩洞的**背景层**,火光/火星/鹿群保留做动效)
   - `klimt.jpg` 克里姆特金色风格(替换手绘金色场景背景)
   - `bauhaus.jpg` 康定斯基构成风格(替换手绘包豪斯背景)
   - 生成提示词草稿已写在 git 历史 da022ba 的开发过程中;尺寸 1024×1024 即可,canvas 是 cover-fit
   - 接入方式照抄现有 `paintBG(key,x0,t)` + `PSTATE` 锚点体系(见 art.html「真迹世界」段)
2. **陈皮精灵图**:用出图模型生成行走帧序列(4~6 帧 × 白底),走
   `~/Desktop/cat-game-icons/generate_icons.py` 的白底抠图管线;替换 `drawCat` 的代码绘制
3. **验收**:十个世界连续截图,无明显"手绘感"断层;陈皮形象与照片一致

### T2 · 模型代码能力升级后(重写手绘场景为"配方级"品质)
1. **精读 huashu-art-motion 的风格配方实现**,把 7 个手绘世界逐个重写:
   程序化笔触系统(短弧方向场/厚涂堆叠)、签名式转场(水墨晕染/金箔扫过/像素溶解,
   替代现在的字卡硬切)、每个世界的专属后期(不只全局颗粒)
2. **守塔/弹幕/高尔夫的画面重做**:对齐 mario.html v5 的绘制水准(粒子/缓动/打击感),
   塔防加关卡与路径变体,弹幕补擦弹计分,高尔夫加坡度与风
3. **音频升级**:真 BGM(每时代/每游戏一首),替代五声音阶随机拨弦
4. **验收**:作者主观满意为准;对照 huashu 示例逐帧比较构图密度

### T3 · 随时可做的小改进
- 大厅卡片图标统一插画化(需要出图或手绘 SVG)
- match3/memory/snake/flappy/whack 五款老游戏对齐全站品质(本次未动)
- 图鉴页接入陈皮(艺术长卷成就)
- art.html 加"自由观赏模式"(拖动进度条逐帧看)

---

## 五、基础设施备忘(踩坑记录,复盘先读)

- **本机网络**:GitHub/Met 走 `curl --http1.1` 或 urllib(默认 1.1)可用;
  GitHub 偶发 HTTP/2 framing 错误与 75s 超时,**重试+HTTP/1.1 必救**;push 被拒先 rebase
- **Met API**:search=v1.1(分页),objects=v1;`primaryImageSmall` 约 600px(糊),
  要 `primaryImage` 原图后自行 `sips -Z 1400 -s format jpeg -s formatOptions 75`
- **IAB 测试三坑**:rAF 可能停摆(手动 `frame(手造时间戳)` 步进,**但别设 ST.paused 防干扰——会把更新逻辑一起冻住**);标签页会中途回收(终局验证必须单 evaluate 原子完成);合成 PointerEvent 要 try/catch setPointerCapture 且坐标要加 rect 偏移
- **部署**:push 后 Pages 约 30-90s 生效,验证别心急
- 游戏最佳成绩 key 惯例:`nikki_<game>_best`(下划线)

---

*本文由 agent 代笔,作者审定方向。复盘日快乐。*
