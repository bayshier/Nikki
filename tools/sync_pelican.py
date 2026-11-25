#!/usr/bin/env python3
"""把「鹈鹕环岛记」(pelican-isle 仓库) 同步进 Nikki 合集。

鹈鹕环岛记有自己独立的仓库、独立运行;这里不手改副本,而是用脚本搬过来,
只做三处与合集相关的改写 —— 以后上游一改,重跑一次就同步:

  1. js/*.js            → games/pelican-isle/js/            (原样复制)
  2. index.html         → games/pelican-isle/index.html     (改写 importmap + 挂 common.js)
       · three 用合集共用的 vendor/three/three.module.min.js(两边都是 r160)
       · addons 只带游戏真正用到的那 11 个文件
       · <script src="../../shared/common.js">:统一钱包 / 每日挑战 / 存档
         (游戏代码里全部用 window.Nikki 守卫,独立运行时自动跳过)
  3. 用到的 addons      → vendor/three/addons/              (缺了才补,不覆盖已有文件)

用法:
  python3 tools/sync_pelican.py [pelican-isle 仓库路径]
  路径默认取环境变量 PELICAN_ISLE,或 ~/Downloads/gitlab127001/pelican-isle
"""
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PELICAN_ISLE")
       or os.path.expanduser("~/Downloads/gitlab127001/pelican-isle"))
DST = os.path.join(ROOT, "games", "pelican-isle")
ADDONS = os.path.join(ROOT, "vendor", "three", "addons")

# 游戏直接 import 的插件 + 它们的传递依赖(都是 r160,与 vendor 的 three 核心同版本)
ADDON_FILES = [
    "postprocessing/EffectComposer.js",
    "postprocessing/RenderPass.js",
    "postprocessing/UnrealBloomPass.js",
    "postprocessing/ShaderPass.js",
    "postprocessing/OutputPass.js",
    "postprocessing/Pass.js",
    "postprocessing/MaskPass.js",          # EffectComposer 的依赖
    "shaders/CopyShader.js",               # EffectComposer / UnrealBloom 的依赖
    "shaders/LuminosityHighPassShader.js", # UnrealBloom 的依赖
    "shaders/OutputShader.js",             # OutputPass 的依赖
    "utils/BufferGeometryUtils.js",
]

OLD_IMPORTMAP = re.compile(
    r'<script type="importmap">\s*\{\s*"imports":\s*\{.*?\}\s*\}\s*</script>', re.S)
NEW_IMPORTMAP = """<script src="../../shared/common.js"></script>
<script type="importmap">
{
  "imports": {
    "three": "../../vendor/three/three.module.min.js",
    "three/addons/": "../../vendor/three/addons/"
  }
}
</script>"""


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write_if_changed(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path) and read(path) == text:
        return False
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return True


def main():
    if not os.path.isdir(os.path.join(SRC, "js")):
        sys.exit(f"找不到 pelican-isle 源码:{SRC}(可用参数或环境变量 PELICAN_ISLE 指定)")

    # 自检:游戏实际 import 的插件必须在清单里(防止上游新增依赖后这里漏拷)
    imported = set()
    for name in sorted(os.listdir(os.path.join(SRC, "js"))):
        if name.endswith(".js"):
            imported |= set(re.findall(r"three/addons/([\w/.]+\.js)", read(os.path.join(SRC, "js", name))))
    missing = sorted(imported - set(ADDON_FILES))
    if missing:
        sys.exit(f"游戏新引用了清单外的插件,请先补进 ADDON_FILES:{missing}")

    changed = 0
    # 1. 脚本
    for name in sorted(os.listdir(os.path.join(SRC, "js"))):
        if name.endswith(".js"):
            changed += write_if_changed(os.path.join(DST, "js", name), read(os.path.join(SRC, "js", name)))

    # 2. 页面
    html, n = OLD_IMPORTMAP.subn(NEW_IMPORTMAP, read(os.path.join(SRC, "index.html")), count=1)
    if n != 1:
        sys.exit("上游 index.html 里找不到 importmap 块,改写规则需要更新")
    changed += write_if_changed(os.path.join(DST, "index.html"), html)

    # 3. 插件(只补缺)
    added = []
    for rel in ADDON_FILES:
        dst = os.path.join(ADDONS, rel)
        if not os.path.exists(dst):
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(os.path.join(SRC, "libs", "three", rel), dst)
            added.append(rel)

    print(f"同步自 {SRC}")
    print(f"  脚本/页面写入 {changed} 个文件 → games/pelican-isle/")
    print(f"  新增插件 {len(added)} 个 → vendor/three/addons/" + (f":{added}" if added else "(已齐全)"))


if __name__ == "__main__":
    main()
