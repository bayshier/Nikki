# 美术槽位（art slots）

借鉴 [dsh-game-studio](https://github.com/ZSeven-W/dsh-game-studio) 的 slots 约定：
每个游戏声明若干命名槽位（`shared/art-slots.js`），**往对应目录丢同名图片、刷新即换装**；
没有图时游戏照旧用代码画的精灵，零依赖不受影响。

2026-11-25 出图渠道恢复后，下表里的槽位已经**全部用 AI 出的图填上**
（qwen-image-3.0-pro，管线是 `tools/artgen.py`，提示词就是配方，写在脚本的 `SLOTS` 里）。

| 游戏 | 槽位 | 路径 | 画的是什么 |
|---|---|---|---|
| 猫猫守塔 | `mouse`（小怪）/ `boss`（轰炸鼠） | `assets/art/td/<槽位>.png` | 踩着轮子的发条机器人老鼠；戴飞行帽抱炸弹的胖老鼠 |
| 猫猫守塔 | `tower-orange` / `tower-ice` / `tower-elec` | `assets/art/td/tower-*.png` | 木炮筒里的橘猫 / 坐在冰淇淋筒里的白猫 / 背着特斯拉线圈的黄猫 |
| 猫猫弹幕 | `plane`（主角机，机头朝上） | `assets/art/shmup/plane.png` | 纸飞机上的橘猫飞行员，系红围巾 |
| 猫猫弹幕 | `enemy` / `enemy-dive` / `enemy-gunner` | `assets/art/shmup/enemy*.png` | 开螺旋桨飞机的橙鼠 / 张着金属翅膀俯冲的银鼠 / 架双管的紫鼠 |
| 猫猫弹幕 | `boss`（轰炸母舰，512×256 横构图） | `assets/art/shmup/boss.png` | 宽大的老鼠头形飞行要塞 |
| 猫猫高尔夫 | `ball`（毛线球，128²） | `assets/art/golf/ball.png` | 缠着粉线的白毛线球 |
| 飞飞猫 | `cat`（主角，本身朝右，随速度旋转） | `assets/art/flappy/cat.png` | 张着蓝翅膀的白猫 |
| 猫吃小鱼 | `head`（蛇头，正面不旋转） | `assets/art/snake/head.png` | 橘猫脸 |
| 猫咪 2048 | `kitten` / `paw` / `balloon` / `rainbow` / `castle` | `assets/art/2048/*.png` | 方块图标里仓库原先没有的五张（其余用 `assets/icons`、`assets/items`） |

## 想重出 / 补一张

```bash
python3 tools/artgen.py list                   # 看全部条目与完成状态
python3 tools/artgen.py slots --only td/mouse --force     # 重出某一张(原图有缓存就复用,想换构图先删 /tmp/artgen_raw/...)
python3 tools/artgen.py covers                 # 主页 Key Art → assets/covers/key/
```

- 出图是串行的，每张约 40 秒；并发 3 路会 429。
- 主体必须被**完整的描边**包住，否则白色部分会连到背景被一起抠掉
  （比如白猫的轮廓有断口，身体就会被抠没）。
- 透明背景 PNG，按槽位声明的尺寸输出；游戏里按"逻辑直径"等比适配。
- 带朝向的槽位（弹幕主机机头朝上）出图后一定进游戏看一眼，模型不一定听话。
- `?autoplay=1` 进任何一局可自动试玩（塔防自动布塔、弹幕自动走位、高尔夫自动推杆），
  供无头浏览器验收。后台标签里 rAF 不跑时，直接在页面里手动调 `update()` / `render()` 再取图。
