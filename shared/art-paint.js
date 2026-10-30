/* ============================================================
   art-paint.js · 签名渲染器库（陈皮穿越艺术史 T2 升级）
   方法论来自 huashu-art-motion 的「04 纯代码绘制」与 7 份风格配方：
   平涂底稿 → 风格渲染器整幅重画 → 小物件单独一层 → 角色 → 会动的母题。
   本库只提供"风格语言"这一层，构图与角色仍由 art.html 负责。
   所有随机走种子，同一 t 渲两次逐像素一致。
   ============================================================ */
const AP = (() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const easeOut = k => 1 - Math.pow(1 - k, 3);

  /* ---------- 确定性噪声 ---------- */
  function rng(seed) {                       // xorshift32：同种子同序列
    let s = (seed | 0) || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0; return (s >>> 0) / 4294967296; };
  }
  function hash2(x, y, seed) {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function noise2(x, y, seed = 0) {          // 平滑值噪声
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, y, oct = 4, seed = 0) {    // 分形叠加（岩面/云/斑驳）
    let s = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += noise2(x * f, y * f, seed + i * 11) * amp; amp *= 0.5; f *= 2; }
    return s;
  }

  /* ---------- 离屏画布 ---------- */
  function mk(w, h, read) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    if (read) c.getContext("2d", { willReadFrequently: true });
    return c;
  }
  const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  /* 入参既接受 2D context 也接受 canvas：需要"读自己"的函数必须先拿到画布 */
  const ctxOf = c => (c && c.canvas) ? c : c.getContext("2d");
  const cvOf = c => (c && c.canvas) ? c.canvas : c;
  function nearest(rgb, pal) {               // 吸附到区域色板：配方说「色板比颜色抖动重要」
    let best = pal[0], bd = 1e9;
    for (const p of pal) {
      const q = hex2rgb(p);
      const d = (q[0] - rgb[0]) ** 2 + (q[1] - rgb[1]) ** 2 + (q[2] - rgb[2]) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /* ---------- ① 流场笔触：梵高/表现主义的整幅重画 ----------
     c 上已有平涂底稿；本函数按方向场重绘一遍，底稿当取色源。
     o: { w,h, seed, cell, len, width, palette, angle(x,y,t)->rad,
          outline, density, alpha, skew, bend, cover:[x0,x1,y0,y1] } */
  function flowPass(c, o) {
    const W = o.w, H = o.h, rnd = rng(o.seed || 7);
    const oc = ctxOf(c), cv = cvOf(c);
    const src = mk(W, H, true), sg = src.getContext("2d");
    sg.drawImage(cv, 0, 0, W, H, 0, 0, W, H);
    const data = sg.getImageData(0, 0, W, H).data;
    const dst = mk(W, H), dg = dst.getContext("2d");
    dg.lineCap = "round"; dg.lineJoin = "round";
    const cell = o.cell || 12, len = o.len || 30, wid = o.width || 5;
    const pal = o.palette || null, outline = o.outline;
    const cover = o.cover || [0, W, 0, H];
    const bend = o.bend == null ? 0.35 : o.bend;
    for (let gy = cover[2]; gy < cover[3]; gy += cell) {
      for (let gx = cover[0]; gx < cover[1]; gx += cell) {
        if (o.density != null && rnd() > o.density) continue;
        const x = gx + rnd() * cell, y = gy + rnd() * cell;
        const px = clamp(x | 0, 0, W - 1), py = clamp(y | 0, 0, H - 1);
        const i = (py * W + px) * 4;
        if (data[i + 3] < 24) continue;
        let col = "#" + ((1 << 24) + (data[i] << 16) + (data[i + 1] << 8) + data[i + 2]).toString(16).slice(1);
        if (pal) col = nearest([data[i], data[i + 1], data[i + 2]], pal);
        const a = o.angle(x, y, 0) + (rnd() - 0.5) * (o.skew == null ? 0.5 : o.skew);
        const l = len * (0.55 + rnd() * 0.9);
        const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
        const cx = (x + x2) / 2 - Math.sin(a) * l * bend, cy = (y + y2) / 2 + Math.cos(a) * l * bend;
        const wq = wid * (0.6 + rnd() * 0.8);
        if (outline) {                       // 深色描边垫底＝厚涂的"厚度"
          dg.strokeStyle = outline; dg.globalAlpha = 0.5;
          dg.lineWidth = wq + 1.6;
          dg.beginPath(); dg.moveTo(x, y); dg.quadraticCurveTo(cx, cy, x2, y2); dg.stroke();
        }
        dg.strokeStyle = col;
        dg.globalAlpha = (o.alpha == null ? 0.82 : o.alpha) * (0.55 + rnd() * 0.45);
        dg.lineWidth = wq;
        dg.beginPath(); dg.moveTo(x, y); dg.quadraticCurveTo(cx, cy, x2, y2); dg.stroke();
      }
    }
    dg.globalAlpha = 1;
    oc.save(); oc.globalAlpha = o.layerAlpha == null ? 1 : o.layerAlpha;
    oc.drawImage(dst, 0, 0); oc.restore();
  }

  /* ---------- ② 色点：印象派（冷暖偏移的短椭圆笔，不是点彩） ---------- */
  function dabPass(c, o) {
    const W = o.w, H = o.h, rnd = rng(o.seed || 21);
    const src = mk(W, H, true), sg = src.getContext("2d");
    sg.drawImage(cvOf(c), 0, 0, W, H, 0, 0, W, H);
    const data = sg.getImageData(0, 0, W, H).data;
    const pal = o.palette, cell = o.cell || 8;
    c = ctxOf(c);
    c.save();
    for (let gy = 0; gy < H; gy += cell) {
      for (let gx = 0; gx < W; gx += cell) {
        const x = gx + rnd() * cell, y = gy + rnd() * cell;
        const i = ((y | 0) * W + (x | 0)) * 4;
        if (data[i + 3] < 24) continue;
        const cold = rnd() < 0.35;           // 冷暖偏移：印象派的呼吸感
        const rr2 = clamp(data[i] + (cold ? -14 : 12), 0, 255);
        const gg2 = clamp(data[i + 1] + (cold ? 2 : 6), 0, 255);
        const bb2 = clamp(data[i + 2] + (cold ? 16 : -10), 0, 255);
        const col = pal ? nearest([rr2, gg2, bb2], pal)
                        : "#" + ((1 << 24) + (rr2 << 16) + (gg2 << 8) + bb2).toString(16).slice(1);
        c.globalAlpha = 0.35 + rnd() * 0.35;
        c.fillStyle = col;
        const a = (o.angle ? o.angle(x, y) : 0) + (rnd() - 0.5) * 0.5;
        c.beginPath();
        c.ellipse(x, y, (o.rx || 9) * (0.7 + rnd() * 0.7), (o.ry || 3.2) * (0.7 + rnd() * 0.7), a, 0, TAU);
        c.fill();
      }
    }
    c.restore();
  }

  /* ---------- ③ 岩壁浮雕：高度场＋有限差分法线（洞穴的"墙"） ----------
     半分辨率算完平滑放大；中频系数压低，否则整面墙变迷彩（配方 01 的坑） */
  function bakeRock(c, w, h, seed) {
    const sw = Math.max(2, w >> 1), sh = Math.max(2, h >> 1);
    const sm = mk(sw, sh, true), sg = sm.getContext("2d");
    const img = sg.createImageData(sw, sh), d = img.data;
    const L = [-0.55, -0.62, 0.56];
    const Hf = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const X = x * 2, Y = y * 2;          // 用全分辨率坐标算场
      Hf[y * sw + x] = fbm(X * 0.0022, Y * 0.0022, 4, seed) * 1.0
                     + fbm(X * 0.011, Y * 0.011, 3, seed + 3) * 0.16
                     + noise2(X * 0.05, Y * 0.05, seed + 9) * 0.03;
    }
    const light = hex2rgb("#ce925a"), dark = hex2rgb("#6e4426"), blush = hex2rgb("#b6643a");
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const i0 = y * sw + Math.max(0, x - 1), i1 = y * sw + Math.min(sw - 1, x + 1);
      const j0 = Math.max(0, y - 1) * sw + x, j1 = Math.min(sh - 1, y + 1) * sw + x;
      const dx = (Hf[i1] - Hf[i0]) * 52, dy = (Hf[j1] - Hf[j0]) * 52;
      const nz = 1, il = 1 / Math.hypot(dx, dy, nz);
      const nx = -dx * il, ny = -dy * il, nz2 = nz * il;
      const dot = nx * L[0] + ny * L[1] + nz2 * L[2];
      const shade = clamp(0.5 + (dot - 0.56) * 0.9, 0, 1.4);
      const m1 = fbm(x * 0.008, y * 0.008, 3, seed + 31);
      const m2 = fbm(x * 0.03, y * 0.03, 2, seed + 47);
      let r = lerp(dark[0], light[0], clamp(m1 * 1.2, 0, 1));
      let g = lerp(dark[1], light[1], clamp(m1 * 1.2, 0, 1));
      let b = lerp(dark[2], light[2], clamp(m1 * 1.2, 0, 1));
      const red = clamp((m2 - 0.55) * 2.4, 0, 1);
      r = lerp(r, blush[0], red * 0.5); g = lerp(g, blush[1], red * 0.5); b = lerp(b, blush[2], red * 0.5);
      const k = 0.72 + shade * 0.55;
      const o = (y * sw + x) * 4;
      d[o] = clamp(r * k, 0, 255); d[o + 1] = clamp(g * k, 0, 255); d[o + 2] = clamp(b * k, 0, 255); d[o + 3] = 255;
    }
    sg.putImageData(img, 0, 0);
    c.save();
    c.imageSmoothingEnabled = true;
    c.drawImage(sm, 0, 0, w, h);
    c.restore();
    return c;
  }

  /* ---------- ④ 裂缝：随机游走＋分叉，暗线下垫亮线＝刻痕 ---------- */
  function cracks(c, w, h, seed, n) {
    const rnd = rng(seed);
    c.save(); c.lineCap = "round";
    for (let k = 0; k < n; k++) {
      let x = rnd() * w, y = rnd() * h, a = rnd() * TAU;
      const steps = 10 + (rnd() * 18 | 0);
      const pts = [[x, y]];
      for (let s = 0; s < steps; s++) {
        a += (rnd() - 0.5) * 0.9;
        x += Math.cos(a) * (14 + rnd() * 26); y += Math.sin(a) * (14 + rnd() * 26);
        pts.push([x, y]);
      }
      const draw = (dx, dy, col, lw, al) => {
        c.globalAlpha = al; c.strokeStyle = col; c.lineWidth = lw;
        c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0] + dx, p[1] + dy) : c.moveTo(p[0] + dx, p[1] + dy)); c.stroke();
      };
      draw(0, 0, "#1b1008", 1.6, 0.55);
      draw(1.6, 1.4, "#e8c090", 1.1, 0.3);
    }
    c.restore();
  }

  /* ---------- ⑤ 岩画颜料：fuzz 毛边 + ink 实心线 + 平涂 ---------- */
  function caveShape(c, path, fill, lw, rnd) {
    c.save();
    // 毛边：稀疏炭点沿路径撒
    c.strokeStyle = "rgba(33,21,13,.30)"; c.lineWidth = lw * 2 + 7; c.lineCap = "round";
    path(c); c.stroke();
    c.strokeStyle = "#21150d"; c.lineWidth = lw; c.lineCap = "round";
    path(c); c.stroke();
    if (fill) { c.fillStyle = fill; path(c); c.fill(); }
    c.restore();
  }

  /* ---------- ⑥ 金箔墙：逐像素打磨纹 + 贴片接缝 ---------- */
  function goldWall(c, w, h, seed) {
    const sw = w >> 1, sh = h >> 1;
    const sm = mk(sw, sh, true), sg = sm.getContext("2d");
    const img = sg.createImageData(sw, sh), d = img.data;
    const c0 = [120, 78, 18], c1 = [196, 148, 52], c2 = [246, 216, 128];
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const f = 0.5 + fbm(x * 0.008, y * 0.008, 4, seed) * 0.55 + noise2(x * 0.06, y * 0.006, seed + 5) * 0.5 - 0.25;
      const k = clamp(f, 0, 1);
      const r = k < 0.5 ? lerp(c0[0], c1[0], k * 2) : lerp(c1[0], c2[0], (k - 0.5) * 2);
      const g = k < 0.5 ? lerp(c0[1], c1[1], k * 2) : lerp(c1[1], c2[1], (k - 0.5) * 2);
      const b = k < 0.5 ? lerp(c0[2], c1[2], k * 2) : lerp(c1[2], c2[2], (k - 0.5) * 2);
      const o = (y * sw + x) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    sg.putImageData(img, 0, 0);
    c.drawImage(sm, 0, 0, w, h);
    // 金箔接缝：每 96px 一道极淡方块线
    c.save(); c.globalAlpha = 0.12; c.strokeStyle = "#6b4410"; c.lineWidth = 1;
    for (let y = 0; y < h; y += 96) for (let x = 0; x < w; x += 96) {
      c.strokeRect(x + 0.5, y + 0.5, 96, 96);
    }
    c.restore();
  }

  /* ---------- ⑦ 金粉与碎片（每帧，便宜） ---------- */
  function goldShimmer(c, w, h, t, seed, n) {
    const rnd = rng(seed);
    c.save(); c.globalCompositeOperation = "lighter";
    for (let i = 0; i < n; i++) {
      const x = rnd() * w, y = rnd() * h, sp = 1.2 + rnd() * 2.4, ph = rnd() * TAU;
      const v = Math.sin(t * sp + ph);
      if (v < 0.5) continue;
      const a = (v - 0.5) * 2;
      const r = (0.7 + rnd() * 1.4) * (0.6 + 1.1 * a);
      c.fillStyle = `rgba(255,236,170,${0.25 + 0.6 * a})`;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      if (a > 0.75) {                        // 四角星只在高亮瞬间出现
        c.strokeStyle = `rgba(255,248,210,${(a - 0.75) * 2})`; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(x - r * 3, y); c.lineTo(x + r * 3, y);
        c.moveTo(x, y - r * 3); c.lineTo(x, y + r * 3); c.stroke();
      }
    }
    c.restore();
  }
  function goldShards(c, w, h, t, seed, n) {
    const rnd = rng(seed);
    c.save();
    for (let i = 0; i < n; i++) {
      const x0 = rnd() * w, y0 = rnd() * h, sp = 55 + rnd() * 95, sz = 5 + rnd() * 11;
      const y = (y0 + t * sp) % (h + 40) - 20;
      const x = x0 + Math.sin(t * 1.1 + i) * 14;
      const rot = t * (0.7 + rnd()) + i;
      c.save(); c.translate(x, y); c.rotate(rot);
      const g = c.createLinearGradient(-sz, -sz, sz, sz);
      g.addColorStop(0, "#a8741e"); g.addColorStop(0.45, "#fbe6a0"); g.addColorStop(1, "#c8962e");
      c.fillStyle = g; c.globalAlpha = 0.75;
      if (i % 2) c.fillRect(-sz / 2, -sz / 2, sz, sz);
      else { c.beginPath(); c.arc(0, 0, sz / 2, 0, TAU); c.fill(); }
      c.restore();
    }
    c.restore();
  }

  /* ---------- ⑧ 克里姆特纹样：同心圆／螺旋／眼形／白点簇 ---------- */
  function klimtPattern(c, x, y, w, h, t, seed, n) {
    const rnd = rng(seed);
    c.save();
    for (let i = 0; i < n; i++) {
      const px = x + rnd() * w, py = y + rnd() * h, r = 5 + rnd() * 13, k = rnd();
      if (k < 0.3) {                          // 同心圆三色
        const cols = [["#c8322a", "#f6efd8", "#2a4a8a"], ["#2a4a8a", "#ffd76e", "#c8322a"], ["#6a2a6a", "#f6efd8", "#ffd76e"]][i % 3];
        cols.forEach((col, j) => {
          c.fillStyle = col; c.beginPath(); c.arc(px, py, r * (1 - j * 0.28), 0, TAU); c.fill();
        });
      } else if (k < 0.62) {                  // 金螺旋
        c.strokeStyle = "#ffd76e"; c.lineWidth = 1.7; c.beginPath();
        const spin = t * 1.5 + i;
        for (let a = 0; a < Math.PI * 4.5; a += 0.25) {
          const rr = r * 1.5 * a / (Math.PI * 4.5);
          const aa = a + spin;
          a ? c.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr) : c.moveTo(0, 0);
        }
        c.save(); c.translate(px, py); c.stroke(); c.restore();
      } else if (k < 0.84) {                  // 荷鲁斯眼形（轮流眨）
        const closed = Math.sin(t * 2.2 + i) > 0.86;
        c.fillStyle = "#f6efd8";
        c.beginPath(); c.ellipse(px, py, r, closed ? r * 0.16 : r * 0.55, 0, 0, TAU); c.fill();
        if (!closed) { c.fillStyle = "#1a1208"; c.beginPath(); c.arc(px, py, r * 0.3, 0, TAU); c.fill(); }
        c.strokeStyle = "#1a1208"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(px - r, py); c.lineTo(px + r, py); c.stroke();
      } else {                                 // 白点簇＋红心
        c.fillStyle = "#f6efd8";
        for (let j = 0; j < 6; j++) { c.beginPath(); c.arc(px + Math.cos(j * 1.05) * r * 0.6, py + Math.sin(j * 1.05) * r * 0.6, 1.6, 0, TAU); c.fill(); }
        c.fillStyle = "#c8322a"; c.beginPath(); c.arc(px, py, r * 0.22, 0, TAU); c.fill();
      }
    }
    c.restore();
  }

  /* ---------- ⑨ 像素化：低分辨率 + 最近邻放大（8-bit 的正统做法） ----------
     960×540 正好是 240×135 的 4 倍，比例天然对齐 */
  function pixelize(c, src, w, h, cols, fxIn) {
    const fx = fxIn || Math.max(2, Math.round(w / 240));
    const fy = fx;
    const lw = Math.ceil(w / fx), lh = Math.ceil(h / fy);
    const low = mk(lw, lh, true), lg = low.getContext("2d");
    lg.imageSmoothingEnabled = true;
    lg.drawImage(src, 0, 0, w, h, 0, 0, lw, lh);
    if (cols) {                              // 限色板：整幅吸附到 14 色
      const img = lg.getImageData(0, 0, lw, lh), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const q = nearest([d[i], d[i + 1], d[i + 2]], cols), rgb = hex2rgb(q);
        d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
      }
      lg.putImageData(img, 0, 0);
    }
    c.save(); c.imageSmoothingEnabled = false;
    c.drawImage(low, 0, 0, lw * fx, lh * fy);
    c.restore();
  }

  /* ---------- ⑩ VHS 后期：RGB 错位 + 扫描线 + 跟踪噪声带 ---------- */
  function vhs(c, x, y, w, h, t, lt) {
    c = ctxOf(c);
    const oc = c;
    const snap = mk(w, h), sg = snap.getContext("2d");
    sg.drawImage(cvOf(c), x, y, w, h, 0, 0, w, h);
    const shift = 3 + 1.5 * Math.sin(t * 7);
    const ch = (col, dx) => {
      const t1 = mk(w, h), g1 = t1.getContext("2d");
      g1.drawImage(snap, 0, 0);
      g1.globalCompositeOperation = "multiply"; g1.fillStyle = col; g1.fillRect(0, 0, w, h);
      c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.5;
      c.drawImage(t1, x + dx, y); c.restore();
    };
    c.save();
    c.fillStyle = "#000"; c.fillRect(x, y, w, h);
    ch("#ff0000", -shift); ch("#00ff00", 0); ch("#0000ff", shift);
    // 扫描线
    c.globalAlpha = 0.16; c.fillStyle = "#000";
    for (let yy = 0; yy < h; yy += 4) c.fillRect(x, y + yy, w, 1.6);
    c.globalAlpha = 1;
    // 跟踪噪声带（自上而下滚）
    const bh = 70, by = ((520 * lt + 200) % (h + 160)) - 80;
    c.save(); c.beginPath(); c.rect(x, y + by, w, bh); c.clip();
    for (let i = 0; i < 70; i++) {
      const yy = by + (i / 70) * bh;
      const off = Math.sin((i / 70) * Math.PI) * 30 * Math.sin(t * 9 + i);
      c.globalAlpha = 0.16;
      c.drawImage(snap, 0, Math.max(0, Math.min(h - 2, yy)), w, 2, x + off, y + yy, w, 2);
    }
    c.globalAlpha = 0.1; c.fillStyle = "#dfe8ff";
    const nr = rng(97);                       // 确定性：同一 t 两次渲染必须一致
    for (let i = 0; i < 90; i++) c.fillRect(x + nr() * w, y + by + nr() * bh, 18 + nr() * 60, 1);
    c.restore();
    c.restore();
  }

  /* ---------- ⑪ 泛光：缩小→模糊→screen 叠回（新海诚的透光） ---------- */
  function bloom(c, x, y, w, h, amt) {
    const cv = cvOf(c);
    c = ctxOf(c);
    const dw = Math.max(2, w >> 1), dh = Math.max(2, h >> 1);
    const sm = mk(dw, dh), sg = sm.getContext("2d");
    sg.drawImage(cv, x, y, w, h, 0, 0, dw, dh);
    c.save();
    c.globalCompositeOperation = "screen"; c.globalAlpha = amt == null ? 0.26 : amt;
    c.filter = "blur(6px) brightness(1.1)";
    c.drawImage(sm, 0, 0, dw, dh, x, y, w, h);
    c.filter = "none"; c.restore();
  }

  /* ---------- ⑫ 丁达尔光柱（缓存楔形，每帧只改明灭） ---------- */
  function godRays(c, x, y, w, h, t, seed, cache) {
    if (!cache.cv) {
      const cw = w, chh = h, cv = mk(cw, chh), g = cv.getContext("2d");
      const rnd = rng(seed);
      g.filter = "blur(30px)";                 // 糊够才像光,硬边会读成玻璃碎片
      for (let i = 0; i < 3; i++) {
        const ox = cw * (0.05 + rnd() * 0.22); // 光从左上窗来
        g.globalAlpha = 0.34;
        g.fillStyle = "rgba(255,244,214,.55)";
        g.beginPath();
        g.moveTo(ox, -30); g.lineTo(ox + cw * (0.07 + rnd() * 0.06), -30);
        g.lineTo(ox + cw * (0.26 + rnd() * 0.12), chh + 30); g.lineTo(ox + cw * (0.06 + rnd() * 0.06), chh + 30);
        g.closePath(); g.fill();
      }
      cache.cv = cv;
    }
    c.save();
    c.globalCompositeOperation = "screen";
    c.globalAlpha = 0.42 + 0.22 * Math.sin(t * 3.4);
    c.drawImage(cache.cv, x, y);
    c.restore();
  }

  /* ---------- ⑬ 签名转场：边界带内两界内容按风格互相侵入 ----------
     画布上边界左侧是旧世界、右侧是新世界。抓取整条带子，再按每个小块的
     "侵入权重"从对侧取像素重新贴回 —— 于是接缝不再是硬直线，而是两幅画
     用各自的语言咬合。decor 负责风格装饰（金箔/扫描线/墨边…）。 */
  const TRANS = {
    /* 洞穴→埃及：石块砌进来（旧世界被整块石板覆盖） */
    stone(c, bx, bw, h, t, tmp) { return this.blocks(c, bx, bw, h, t, tmp, 118, 0); },
    /* 埃及→浮世绘：套色错位，细横条左右滑移 */
    misreg(c, bx, bw, h, t, tmp) { return this.bands(c, bx, bw, h, t, tmp, 9, 26); },
    /* 浮世绘→莫奈：水墨洇开（软边团块，无硬边） */
    ink(c, bx, bw, h, t, tmp) { return this.blobs(c, bx, bw, h, t, tmp); },
    /* 莫奈→梵高：短笔触桥接 */
    dabs(c, bx, bw, h, t, tmp) { return this.strokeMix(c, bx, bw, h, t, tmp); },
    /* 梵高→克里姆特：金箔碎片翻面 */
    gold(c, bx, bw, h, t, tmp) { return this.shards(c, bx, bw, h, t, tmp); },
    /* 克里姆特→包豪斯：几何图形擦除 */
    geo(c, bx, bw, h, t, tmp) { return this.shapes(c, bx, bw, h, t, tmp); },
    /* 包豪斯→8bit：像素溶解 */
    pixel(c, bx, bw, h, t, tmp) { return this.pixels(c, bx, bw, h, t, tmp); },
    /* 8bit→蒸汽波：CRT 扫描＋色差 */
    crt(c, bx, bw, h, t, tmp) { return this.scan(c, bx, bw, h, t, tmp); },
    /* 蒸汽波→新海诚：光晕扫过 */
    flare(c, bx, bw, h, t, tmp) { return this.glow(c, bx, bw, h, t, tmp); },

    xf(c, bx, bw, h, t, snap) {
      const rnd = rng(101);
      const blocks = [];
      const cell = 14;
      for (let y = 0; y < h; y += cell) for (let x = 0; x < bw; x += cell) {
        const u = (x + cell / 2) / bw;                 // 0=旧侧 1=新侧
        const d = Math.abs(u - 0.5) * 2;               // 距接缝
        const n = noise2(x * 0.035, y * 0.035 + t * 0.6, 3);
        const inv = clamp((n - d * 0.55) * 1.6 + 0.18, 0, 1);   // 侵入权重
        if (rnd() < inv) blocks.push({ x, y, w: cell, h: cell, u });
      }
      for (const b of blocks) {                        // 从对侧取同一行像素贴进来
        const srcX = b.u < 0.5 ? bw - b.w - 2 : 2;
        c.drawImage(snap, srcX, b.y, b.w, b.h, bx - bw / 2 + b.x, b.y, b.w, b.h);
      }
    },
    blocks(c, bx, bw, h, t, snap, bs) {
      const x0 = bx - bw / 2 | 0;
      const rnd = rng(7);
      c.save();
      for (let y = 0; y < h; y += bs) {
        const off = (rnd() - 0.5) * bs * 0.5;
        const w = bs * (0.8 + rnd() * 0.5);
        const d = Math.abs((y + bs / 2) / h - 0.5) * 2;
        c.globalAlpha = 0.9;
        c.drawImage(snap, Math.max(0, Math.min(bw - w, bw / 2 - w / 2 + off)), y, w, bs,
                    x0 + bw / 2 - w / 2 + off, y, w, bs);
      }
      c.globalAlpha = 1;
      c.strokeStyle = "rgba(30,20,10,.25)"; c.lineWidth = 1;
      for (let y = 0; y < h; y += bs) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + bw, y); c.stroke(); }
      c.restore();
    },
    bands(c, bx, bw, h, t, snap, bh, amp) {
      const x0 = bx - bw / 2 | 0, rnd = rng(13);
      c.save();
      for (let y = 0; y < h; y += bh) {
        const u = (y / h) * 2 - 1;
        const off = Math.sin(u * 3.1 + t * 3.4) * amp * easeOut(clamp(1 - Math.abs(u), 0, 1));
        c.drawImage(snap, 0, y, bw, bh, x0 + off, y, bw, bh);
      }
      c.restore();
    },
    blobs(c, bx, bw, h, t, snap) {
      const x0 = bx - bw / 2 | 0;
      const mk2 = mk(bw, h), g = mk2.getContext("2d");
      const rnd = rng(29);
      g.drawImage(snap, 0, 0);
      // 用软遮罩把新旧两侧咬合：遮罩本身是墨团形状
      const m = mk(bw, h), mg = m.getContext("2d");
      mg.filter = "blur(14px)"; mg.fillStyle = "#000";
      for (let i = 0; i < 9; i++) {
        const cx = bw / 2 + (rnd() - 0.5) * bw * 0.9, cy = rnd() * h, r = 24 + rnd() * 62;
        mg.beginPath();
        for (let j = 0; j <= 40; j++) {
          const a = j / 40 * TAU;
          const rr = r * (1 + 0.3 * noise2(Math.cos(a) * 1.6 + i, Math.sin(a) * 1.6 + t * 0.3, 4));
          j ? mg.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : mg.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        mg.closePath(); mg.fill();
      }
      c.save(); c.drawImage(mk2, x0, 0);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 0.25; c.drawImage(m, x0, 0, bw, h);   // 墨色压一层
      c.restore();
    },
    strokeMix(c, bx, bw, h, t, snap) {
      const x0 = bx - bw / 2 | 0, rnd = rng(37);
      c.drawImage(snap, x0, 0);
      c.save(); c.lineCap = "round";
      for (let i = 0; i < 260; i++) {
        const u = rnd(), y = rnd() * h;
        const x = x0 + u * bw;
        const a = -0.5 + rnd() * 0.6;
        const l = 14 + rnd() * 34;
        c.strokeStyle = ["#e8c060", "#8fa6d6", "#c8b0d8", "#f0a0b8", "#6aa0a8"][i % 5];
        c.globalAlpha = 0.18 + rnd() * 0.3;
        c.lineWidth = 2 + rnd() * 4;
        c.beginPath(); c.moveTo(x, y);
        c.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 + 6, x + Math.cos(a) * l, y + Math.sin(a) * l);
        c.stroke();
      }
      c.restore();
    },
    shards(c, bx, bw, h, t, snap) {
      const x0 = bx - bw / 2 | 0, rnd = rng(41);
      c.drawImage(snap, x0, 0);
      c.save();
      for (let i = 0; i < 90; i++) {
        const u = rnd(), y = rnd() * h, sz = 6 + rnd() * 16;
        const x = x0 + u * bw, a = t * (0.8 + rnd()) + i;
        c.save(); c.translate(x, y); c.rotate(a);
        const g = c.createLinearGradient(-sz, -sz, sz, sz);
        g.addColorStop(0, "#a8741e"); g.addColorStop(0.45, "#fbe6a0"); g.addColorStop(1, "#c8962e");
        c.fillStyle = g; c.globalAlpha = 0.7;
        c.fillRect(-sz / 2, -sz / 2, sz, sz);
        c.restore();
      }
      c.restore();
    },
    shapes(c, bx, bw, h, t, snap) {
      const x0 = bx - bw / 2 | 0;
      c.drawImage(snap, x0, 0);
      c.save();
      const cx = x0 + bw / 2, cy = h * 0.5;
      c.globalAlpha = 0.92;
      c.fillStyle = "#d3262b"; c.beginPath(); c.arc(cx, cy, 54, 0, TAU); c.fill();
      c.fillStyle = "#2a58b4"; c.fillRect(x0 + 26, h * 0.16, 46, 46);
      c.fillStyle = "#efc12f"; c.beginPath(); c.moveTo(x0 + bw - 78, h * 0.30); c.lineTo(x0 + bw - 34, h * 0.30); c.lineTo(x0 + bw - 56, h * 0.16); c.closePath(); c.fill();
      c.globalAlpha = 0.85;
      c.strokeStyle = "#161514"; c.lineWidth = 6;
      c.beginPath(); c.arc(cx, cy, 92, -0.6, 1.9); c.stroke();
      c.restore();
    },
    pixels(c, bx, bw, h, t, snap) {
      const x0 = bx - bw / 2 | 0, bs = 12, rnd = rng(53);
      c.drawImage(snap, x0, 0);
      for (let y = 0; y < h; y += bs) for (let x = 0; x < bw; x += bs) {
        const u = x / bw, d = Math.abs(u - 0.5) * 2;
        const n = noise2(x * 0.08, y * 0.08 + t * 1.2, 6);
        if (n > d * 1.1) {
          const srcX = u < 0.5 ? bw - bs - 2 : 2;
          c.drawImage(snap, srcX, y, bs, bs, x0 + x, y, bs, bs);
        }
      }
    },
    scan(c, bx, bw, h, t, snap) {
      const x0 = bx - bw / 2 | 0;
      c.save();
      c.drawImage(snap, x0, 0);
      const g = c.createLinearGradient(x0, 0, x0 + bw, 0);
      g.addColorStop(0, "rgba(63,246,255,0)"); g.addColorStop(0.5, "rgba(255,79,216,.30)"); g.addColorStop(1, "rgba(63,246,255,0)");
      c.fillStyle = g; c.fillRect(x0, 0, bw, h);
      c.globalAlpha = 0.22; c.fillStyle = "#000";
      for (let y = 0; y < h; y += 4) c.fillRect(x0, y, bw, 1.6);
      c.globalAlpha = 1;
      c.restore();
    },
    glow(c, bx, bw, h, t, snap) {
      const x0 = bx - bw / 2 | 0, cx = x0 + bw / 2;
      c.save(); c.drawImage(snap, x0, 0);
      const g = c.createRadialGradient(cx, h * 0.5, 0, cx, h * 0.5, bw * 0.9);
      g.addColorStop(0, "rgba(255,248,226,.55)"); g.addColorStop(0.4, "rgba(255,226,180,.22)"); g.addColorStop(1, "rgba(255,226,180,0)");
      c.globalCompositeOperation = "screen"; c.fillStyle = g; c.fillRect(x0, 0, bw, h);
      c.strokeStyle = "rgba(255,252,240,.75)"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx, 0); c.lineTo(cx, h); c.stroke();
      c.restore();
    },
  };

  return {
    clamp, lerp, ease, easeOut, rng, noise2, fbm, mk, hex2rgb, nearest,
    flowPass, dabPass, bakeRock, cracks, caveShape, goldWall, goldShimmer,
    goldShards, klimtPattern, pixelize, vhs, bloom, godRays, TRANS,
  };
})();