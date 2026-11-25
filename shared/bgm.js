/* ============================================================
   bgm.js · 小游戏的生成式 BGM 胶水(复用 art-music.js 的曲库)
   ──────────────────────────────────────────────────────────
   三款小游戏(守塔 / 弹幕 / 高尔夫)原来只有单音音效。这里直接复用
   艺术长卷那十首生成式曲子,不新写音乐引擎。

   用法(先引 shared/art-music.js,再引本文件;都要在游戏脚本之前):
     BGM.use(6, "#overlay", "#bar");    // 曲目号、开局/结算遮罩层、放"音乐"开关的容器
                                         // 容器选择器可以省略(就不放开关)

   规则:
     · 遮罩层(开局 / 结算)显示时停,隐藏(进入对局)时播 —— 用 MutationObserver
       兜住所有显示 / 隐藏的写法,不用逐个改调用点
     · 切到后台停,回来接着播(后台里 setInterval 被节流,硬播会一顿一顿)
     · 音频上下文只在用户手势之后创建(浏览器自动播放策略);无头验收的
       ?autoplay=1 没有手势,自然不出声
   ============================================================ */
const BGM = (() => {
  let song = 0, ov = null, ac = null, muted = false;

  /* 该不该播:遮罩隐藏(= 对局中)且页面可见且没静音 */
  function sync() {
    const inGame = ov && getComputedStyle(ov).display !== "none";
    if (inGame && !document.hidden && ac && !muted) AM.start(song);
    else AM.stop();
  }

  /* 第一次用户手势:建上下文、接上曲库、把音量压到背景乐的程度 */
  function unlock() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return; }
      AM.attach(ac);
      AM.setLevel(0.42);
    }
    if (ac.state === "suspended") ac.resume();
    sync();
  }

  function toggle() {
    muted = !muted;
    AM.setMuted(muted);
    paint();
    sync();
  }
  function paint(btn) {
    btn.textContent = muted ? "♪ 音乐关" : "♪ 音乐开";
    btn.setAttribute("aria-pressed", String(muted));
  }

  function use(songIdx, overlaySel, mountSel) {
    song = songIdx;
    ov = document.querySelector(overlaySel);
    if (!ov) return;
    new MutationObserver(sync).observe(ov, { attributes: true, attributeFilter: ["style", "class"] });
    document.addEventListener("visibilitychange", sync);
    document.addEventListener("pointerdown", unlock, { capture: true });
    document.addEventListener("keydown", unlock, { capture: true });

    const mount = mountSel && document.querySelector(mountSel);
    if (mount) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bgm-btn";
      btn.setAttribute("aria-label", "背景音乐开关");
      // 样式写在这里:三款游戏的粉色主题一致,不必各改一份 CSS
      btn.style.cssText = "font:700 12px/1.4 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;" +
        "padding:6px 12px;border-radius:99px;border:2px solid var(--hk-deep,#c2185b);background:#fff;" +
        "color:var(--hk-deep,#c2185b);cursor:pointer;margin-left:8px;vertical-align:middle;";
      paint(btn);
      btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); paint(btn); });
      mount.appendChild(btn);
    }
  }

  return { use };
})();
