#!/usr/bin/env python3
"""本地开发服务器:静态文件 + Cache-Control: no-store。

为什么不用 `python -m http.server`:
  它不发缓存头,Chrome 会对 ES 模块做"启发式缓存"——很久没改过的文件
  会被判一段很长的新鲜期(约为距上次修改时间的 10%)。改了 .js 之后普通刷新
  可能还在跑旧模块,而刚改过的文件却能生效 → 测试结论不可信,极难察觉。

用法:
  python3 tools/serve.py [端口]        # 默认 8931,根目录 = 仓库根
  然后打开 http://127.0.0.1:8931/

注意:no-store 只管之后的新响应。如果某个模块已经被普通服务器缓存过,
用本服务器也救不回来 —— 换个端口,或在同源页面里对每个模块 URL
fetch(url, { cache: "reload" }) 覆盖缓存项。
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):        # 默认刷屏;需要时设 SERVE_VERBOSE=1
        if os.environ.get("SERVE_VERBOSE"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8931
    ThreadingHTTPServer.allow_reuse_address = True
    srv = ThreadingHTTPServer(("127.0.0.1", port), lambda *a, **k: NoCacheHandler(*a, directory=ROOT, **k))
    print(f"serving {ROOT} at http://127.0.0.1:{port}/ (no-store)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
