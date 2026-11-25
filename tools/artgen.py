#!/usr/bin/env python3
"""AI 美术生成管线:出图 → 白底抠图 → 按规格落进仓库。

出图走内网中转的 qwen-image-3.0-pro(密钥由 qwen-image 技能的 imggen.py 从
~/.zcode/v2/provider_config.json 读取)。**提示词就是素材配方**,和游戏一起进仓库 ——
以后想重出某张图、调风格、补新槽位,改这里的 SPECS 再跑一遍就行。

用法:
  python3 tools/artgen.py list                 # 列出全部条目与完成状态
  python3 tools/artgen.py slots                # 填美术槽位 assets/art/<游戏>/<槽位>.png
  python3 tools/artgen.py covers               # 主页插画封面 assets/covers/key/<游戏>.jpg
  python3 tools/artgen.py all --only mario,td/mouse --force
                                              # 只出指定的;--force 覆盖已有文件

规矩:
  · 串行、每张间隔 ≥20 秒(中转并发 3 路就 429),断点续跑(目标文件已存在就跳过)
  · 原图缓存 /tmp/artgen_raw(不入库);主体必须被完整描边包住,
    否则白色部分会连到背景被一起抠掉
  · 槽位尺寸必须和游戏里 ArtSlots.define 声明的一致(td/shmup/golf 各自 256²,母舰 512×256)
"""
import argparse
import os
import subprocess
import sys
import time

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = "/tmp/artgen_raw"
GAP = 21                       # 两次出图之间的间隔(秒)
IMGGEN = os.environ.get("QWEN_IMGGEN") or os.path.expanduser(
    "~/.zcode/skills/qwen-image/scripts/imggen.py")

# 游戏内精灵:和 assets/icons 已有的 24 张道具同一套风格
STYLE_ICON = ("cute cartoon game icon, kawaii style, thick clean dark-brown outline, "
              "vibrant saturated colors, soft shading with glossy highlights, single object "
              "perfectly centered, isolated on pure solid white background, no shadow, no ground, "
              "no text, no watermark, no border, mobile casual game asset, full object visible")
# 主页封面:粗墨线贴纸插画风
STYLE_COVER = ("cute kawaii cartoon sticker illustration, bold thick dark outline, flat vivid colors "
               "with simple cel shading, centered composition, isolated on pure solid white background, "
               "no shadow, no ground, no text, no watermark, no border, clean vector-like look, "
               "full subject visible with generous margin")

# ── 美术槽位:(输出文件, 画布宽, 画布高, 主体描述) ──────────────────
# 朝向要求来自各游戏的绘制代码:守塔的老鼠不旋转(正面即可);
# 弹幕的敌机朝向玩家、主角机头朝上、母舰是横构图;高尔夫是毛线球。
SLOTS = [
    ("assets/art/td/mouse.png", 256, 256,
     "a small gray robot mouse toy with big round pink ears, glowing red eyes, "
     "a wind-up key on its back and tiny wheels, front view"),
    ("assets/art/td/boss.png", 256, 256,
     "a big chubby dark-gray robot mouse boss wearing a black pilot cap and goggles, "
     "hugging a round black bomb with a lit fuse, wide mischievous grin, front view"),
    ("assets/art/shmup/enemy.png", 256, 256,
     "an orange robot mouse with big round pink ears and red eyes riding a tiny gray "
     "propeller airplane, top-down view, facing the viewer"),
    ("assets/art/shmup/enemy-dive.png", 256, 256,
     "a sleek silver-blue robot mouse with swept-back metal wings and red eyes, "
     "diving toward the viewer, top-down view"),
    ("assets/art/shmup/enemy-gunner.png", 256, 256,
     "a purple robot mouse with round pink ears and red eyes operating a small twin-gun "
     "turret, facing the viewer, top-down view"),
    ("assets/art/shmup/boss.png", 512, 256,
     "a huge wide flying fortress shaped like a dark-gray robot mouse head with big round "
     "pink ears, glowing red eyes and bomb bays under its belly, front view, very wide shape"),
    ("assets/art/shmup/plane.png", 256, 256,
     "a white paper airplane with a cute orange cat head wearing a tiny red pilot scarf "
     "sitting on it, nose pointing straight up, top-down view"),
    ("assets/art/golf/ball.png", 128, 128,
     "a round ball of white knitting yarn wrapped with pink thread stripes"),
    # 守塔的三座炮塔(画在底座圆盘上方,正面)
    ("assets/art/td/tower-orange.png", 256, 256,
     "a cute orange tabby cat peeking out of a small wooden cannon that shoots oranges, compact round turret, front view"),
    ("assets/art/td/tower-ice.png", 256, 256,
     "a cute white cat wearing a blue scarf sitting in a giant ice cream cone turret with a swirl top, compact round turret, front view"),
    ("assets/art/td/tower-elec.png", 256, 256,
     "a cute yellow cat with a lightning bolt shaped tuft wearing a tiny Tesla coil backpack with electric sparks, compact round turret, front view"),
    # 2048 方块图标里缺的五张(其余用 assets/icons、assets/items 里现成的道具图)
    ("assets/art/2048/kitten.png", 256, 256, "a tiny cute orange tabby kitten face with big round sparkling eyes, front view"),
    ("assets/art/2048/paw.png", 256, 256, "a big soft pink cat paw print with four round toe beans"),
    ("assets/art/2048/balloon.png", 256, 256, "a pink party balloon with a cute sleeping cat face printed on it, with a small curly string"),
    ("assets/art/2048/rainbow.png", 256, 256, "a glossy pastel rainbow arcing over a small fluffy white cloud"),
    ("assets/art/2048/castle.png", 256, 256, "a cute pink sand castle with cat-ear shaped towers and tiny flags"),
    # 飞飞猫的猫咪(随速度旋转,本身朝右)、猫吃小鱼的蛇头(不旋转,正面)
    ("assets/art/flappy/cat.png", 256, 256,
     "a chubby white cat with a pink collar and big round eyes, small pink wings spread wide, "
     "side view facing right, flying happily"),
    ("assets/art/snake/head.png", 256, 256,
     "a cute orange tabby cat face with big round eyes, a tiny smile and pink cheeks, front view"),
]

# ── 主页插画封面:游戏 id → (便签底色, 主体描述) ────────────────────
# 只给"没有真实截图"的游戏用;3D 游戏的封面是真实截图(assets/covers/*.jpg)。
COVERS = {
    "mario":    ("#f6b8b0", "a cute orange tabby cat wearing a red cap with a white round badge, "
                 "mid-jump with one paw raised, beside a red mushroom with white spots and a "
                 "yellow block with a question mark"),
    "flappy":   ("#bcd8f0", "a chubby white cat with tiny blue wings flapping, flying in the gap "
                 "between two green pipes, one pipe from above and one from below"),
    "snake":    ("#cfe6c0", "a cute orange tabby kitten whose long striped body stretches back "
                 "in an S-curve like a snake, chasing three small golden fish snacks"),
    "shmup":    ("#c9b6e4", "a white paper airplane with a cute orange cat pilot flying upward, "
                 "trailed by yellow bullet lines, with three small gray robot mouse planes above it"),
    "breakout": ("#f7e38a", "a pink cat paw paddle at the bottom bouncing a white yarn ball toward "
                 "a wall of colorful candy bricks"),
    "2048":     ("#bcd8f0", "a cute orange cat sitting proudly on top of a pyramid of big plain "
                 "pastel tiles in yellow, orange and pink"),
    "tetris":   ("#f6b8b0", "colorful glossy puzzle blocks in blue, orange, green and pink stacking "
                 "up like tetrominoes, with a white cat paw placing the top piece"),
    "golf":     ("#cfe6c0", "a white yarn ball on a putting green beside a golf hole with a tall "
                 "red flag"),
    "td":       ("#c9b6e4", "a gray stone castle tower with cat-ear shaped battlements and a red "
                 "paw-print flag on top, a small robot mouse marching toward it on the grass"),
    "dopa":     ("#f7e38a", "a cheerful orange calculator character with a smiling face on its "
                 "screen showing a big plus sign, surrounded by yellow sparks and stars"),
    "destroy":  ("#bcd8f0", "a cartoon browser window cracking apart into colorful pixel cubes "
                 "with a star burst"),
    "floorplan": ("#cfe6c0", "an isometric cutaway of a cozy little room with a coral sofa, a bed "
                 "with a pink blanket, a potted plant and a white cat on a yellow rug"),
    "list":     ("#f6b8b0", "a cute white game controller with colored buttons beside a clipboard "
                 "with a checklist"),
    "dex":      ("#c9b6e4", "an open picture book with a cute cat face on the right page and a pink "
                 "paw print on the left page, with a yellow bookmark ribbon"),
}


def gen_raw(key, prompt, style):
    """调技能脚本出一张原图(1024×1024 白底)。已有缓存的直接复用。"""
    os.makedirs(RAW, exist_ok=True)
    raw = os.path.join(RAW, key.replace("/", "_") + ".png")
    if os.path.exists(raw) and os.path.getsize(raw) > 10000:
        return raw, False
    out = os.path.join(RAW, key.replace("/", "_") + "_dl.png")
    cmd = [sys.executable, IMGGEN, f"{prompt}, {style}", "-o", out, "--size", "1024x1024"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(out):
        raise RuntimeError(f"出图失败 {key}: {(r.stderr or r.stdout).strip()[-300:]}")
    os.replace(out, raw)
    return raw, True


def cutout(raw_path):
    """去白底:与边界相连的近白连通域当背景;边缘按"离白程度"反抠,再去白边。"""
    a = np.asarray(Image.open(raw_path).convert("RGB")).astype(np.float32)
    cand = a.min(axis=2) > 238
    lab, _ = ndimage.label(cand)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border != 0])
    alpha = np.where(bg, 0, 255).astype(np.float32)
    near = ndimage.binary_dilation(bg, iterations=2) & ~bg
    d = 255.0 - a.min(axis=2)
    alpha = np.where(near, np.clip(d / 80.0 * 255.0, 0, 255), alpha)
    alpha = ndimage.gaussian_filter(alpha, 0.6)
    af = (alpha / 255.0)[..., None]
    fg = np.clip((a - (1 - np.clip(af, 1e-3, 1)) * 255.0) / np.clip(af, 1e-3, 1), 0, 255)
    fg = np.where(af > 0.02, fg, 0)
    img = Image.fromarray(np.dstack([fg, alpha]).astype(np.uint8))
    return img.crop(img.getbbox())


def fit(subject, w, h, fill):
    """主体等比缩放到画布的 fill 比例并居中。"""
    k = min(w * fill / subject.width, h * fill / subject.height)
    if k < 1:
        subject = subject.resize((max(1, round(subject.width * k)), max(1, round(subject.height * k))), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(subject, ((w - subject.width) // 2, (h - subject.height) // 2), subject)
    return canvas


def jobs(what):
    if what in ("slots", "all", "list"):
        for out, w, h, prompt in SLOTS:
            yield dict(kind="slot", key=out, out=os.path.join(ROOT, out), w=w, h=h, prompt=prompt, style=STYLE_ICON)
    if what in ("covers", "all", "list"):
        for gid, (bg, prompt) in COVERS.items():
            yield dict(kind="cover", key="cover/" + gid, out=os.path.join(ROOT, "assets/covers/key", gid + ".jpg"),
                       w=960, h=720, bg=bg, prompt=prompt, style=STYLE_COVER)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["list", "slots", "covers", "all"])
    ap.add_argument("--only", default="", help="逗号分隔:槽位用 相对路径,封面用 游戏 id")
    ap.add_argument("--force", action="store_true", help="目标已存在也重做(原图仍复用缓存)")
    a = ap.parse_args()
    only = {s.strip() for s in a.only.split(",") if s.strip()}
    todo = []
    for j in jobs(a.what):
        stem = j["key"].rsplit(".", 1)[0]           # 去掉扩展名再比对,--only golf/ball 即可命中
        if only and not any(stem.endswith(o) for o in only):
            continue
        done = os.path.exists(j["out"])
        if a.what == "list":
            print(("✓ " if done else "  ") + j["key"] + f"  [{j['w']}×{j['h']}]")
        elif not done or a.force:
            todo.append(j)
    if a.what == "list" or not todo:
        print("没有要生成的条目" if a.what != "list" else "", flush=True)
        return
    print(f"待生成 {len(todo)} 张", flush=True)
    last = 0.0
    for j in todo:
        raw, fresh = gen_raw(j["key"], j["prompt"], j["style"])
        if fresh and last:
            time.sleep(GAP)                       # 两次真实出图之间留足间隔
        last = time.time()
        try:
            sub = cutout(raw)
            canvas = fit(sub, j["w"], j["h"], 0.93 if j["kind"] == "slot" else 0.90)
            os.makedirs(os.path.dirname(j["out"]), exist_ok=True)
            if j["kind"] == "slot":
                canvas.save(j["out"], "PNG", optimize=True)
            else:
                plate = Image.new("RGB", (j["w"], j["h"]), j["bg"])
                plate.paste(canvas, (0, 0), canvas)
                plate.save(j["out"], "JPEG", quality=86, optimize=True, progressive=True)
            print(f"[ok] {j['key']} → {os.path.relpath(j['out'], ROOT)} "
                  f"({os.path.getsize(j['out']) // 1024} KB, 原图{'新出' if fresh else '缓存'})", flush=True)
        except Exception as e:
            print(f"[FAIL] {j['key']}: {e}", flush=True)


if __name__ == "__main__":
    main()
