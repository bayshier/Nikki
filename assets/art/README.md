# 美术槽位（art slots）

借鉴 [dsh-game-studio](https://github.com/ZSeven-W/dsh-game-studio) 的 slots 约定：
每个游戏声明若干命名槽位，**往对应目录丢同名图片、刷新即换装**；
没有图时游戏照旧用代码画的精灵，零依赖不受影响。

| 游戏 | 槽位 | 路径 |
|---|---|---|
| 猫猫守塔 | `mouse`（小怪）/ `boss`（轰炸鼠） | `assets/art/td/<槽位>.png` |
| 猫猫弹幕 | `plane`（主角机）/ `enemy` / `enemy-dive` / `enemy-gunner` / `boss` | `assets/art/shmup/<槽位>.png` |
| 猫猫高尔夫 | `ball`（毛线球） | `assets/art/golf/<槽位>.png` |

- 透明背景 PNG，正方形（槽位声明里带标准尺寸，任意尺寸都会等比适配）
- `?autoplay=1` 进任何一局可自动试玩（塔防自动布塔、弹幕自动走位、高尔夫自动推杆），
  供无头浏览器验收
