/* ============================================================
   art-music.js · 每个时代一首的生成式配乐（T2-3）
   之前是「每 640ms 随机拨一个五声音阶音」——那不叫配乐。
   这里给十个时代各写一条曲子：BPM、调式、和弦进行、鼓组、音色都不同，
   16 分音符网格 + 100ms 前瞻调度（Web Audio 的标准做法，不会因主线程忙而抖）。
   ============================================================ */
const AM = (() => {
  const TAU = Math.PI * 2;
  let AC = null, master = null, revSend = null, comp = null;
  let timer = null, nextT = 0, step = 0, cur = 0, playing = false, muted = false;
  const LOOKAHEAD = 0.12, TICK = 25;
  let nseed = 987654321;                        // 噪声走种子:每次开声同样的混响尾音
  const nrand = () => ((nseed = (nseed * 1664525 + 1013904223) % 4294967296) / 4294967296);

  /* ---------- 总线:压缩 + 卷积混响(脉冲用噪声生成) ---------- */
  function bus() {
    if (master) return;
    comp = AC.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3.2; comp.attack.value = 0.006; comp.release.value = 0.18;
    master = AC.createGain(); master.gain.value = 0.9;
    comp.connect(master); master.connect(AC.destination);
    // 混响
    const len = Math.floor(AC.sampleRate * 2.2);
    const ir = AC.createBuffer(2, len, AC.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const n = (nrand() * 2 - 1) * Math.pow(1 - i / len, 2.6);
        lp = lp * 0.72 + n * 0.28;                 // 稍暗的尾音
        d[i] = lp;
      }
    }
    const conv = AC.createConvolver(); conv.buffer = ir;
    revSend = AC.createGain(); revSend.gain.value = 0.9;
    revSend.connect(conv); conv.connect(comp);
  }

  /* ---------- 基础音色 ---------- */
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function env(g, t, a, d, s, r, peak) {          // 简易 ADSR
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * s), t + a + d);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r);
  }
  function osc(type, freq, t, dur, peak, send, filt) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    let node = o;
    if (filt) { const f = AC.createBiquadFilter(); f.type = filt.type || "lowpass"; f.frequency.value = filt.f || 1200; f.Q.value = filt.q || 0.7; o.connect(f); node = f; }
    node.connect(g); g.connect(comp);
    if (send > 0) { const s = AC.createGain(); s.gain.value = send; g.connect(s); s.connect(revSend); }
    const peakSafe = Math.max(0.0002, peak);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peakSafe, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  function noise(t, dur, peak, hp, send) {        // 噪声打击
    const len = Math.max(1, Math.floor(AC.sampleRate * dur));
    const buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (nrand() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = AC.createBufferSource(); src.buffer = buf;
    const f = AC.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp || 3000;
    const g = AC.createGain(); g.gain.value = peak;
    src.connect(f); f.connect(g); g.connect(comp);
    if (send > 0) { const s = AC.createGain(); s.gain.value = send; g.connect(s); s.connect(revSend); }
    src.start(t);
  }

  /* ---------- 乐器 ---------- */
  const I = {
    pluck: (m, t, dur, v, send = 0.25) => osc("triangle", mtof(m), t, Math.min(dur, 0.5), v, send, { f: 2600 }),
    bell: (m, t, dur, v, send = 0.5) => {
      osc("sine", mtof(m), t, dur * 1.6, v, send);
      osc("sine", mtof(m) * 2.01, t, dur * 1.1, v * 0.32, send);
      osc("triangle", mtof(m) * 3.02, t, dur * 0.6, v * 0.14, send);
    },
    pad: (m, t, dur, v, send = 0.55) => {
      const o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = mtof(m); f.type = "lowpass"; f.frequency.value = 900; f.Q.value = 0.6;
      o.connect(f); f.connect(g); g.connect(comp);
      const s = AC.createGain(); s.gain.value = send; g.connect(s); s.connect(revSend);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.05);
    },
    sub: (m, t, dur, v) => osc("sine", mtof(m), t, dur, v, 0.06),
    square: (m, t, dur, v, send = 0.12) => osc("square", mtof(m), t, dur, v, send, { f: 3400 }),
    pulse: (m, t, dur, v, send = 0.1) => {          // 8bit 主音
      osc("square", mtof(m), t, dur, v, send, { f: 5200 });
      osc("square", mtof(m) * 1.005, t, dur, v * 0.4, send, { f: 4200 });
    },
    koto: (m, t, dur, v) => {                       // 拨弦带弯音
      const o = osc("triangle", mtof(m), t, dur, v * 0.9, 0.4, { f: 2400 });
      o.frequency.setValueAtTime(mtof(m) * 1.012, t);
      o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.09);
      osc("sine", mtof(m + 12), t, dur * 0.5, v * 0.18, 0.4);
    },
    kick: (t, v = 0.5) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      o.connect(g); g.connect(comp); o.start(t); o.stop(t + 0.28);
    },
    snare: (t, v = 0.32) => { noise(t, 0.14, v, 1800, 0.3); osc("triangle", 190, t, 0.09, v * 0.35, 0.2); },
    hat: (t, v = 0.12) => noise(t, 0.045, v, 7000, 0.08),
    taiko: (t, v = 0.5) => { I.kick(t, v * 0.8); noise(t, 0.1, v * 0.4, 700, 0.35); },
    wood: (t, v = 0.14) => osc("square", 1180, t, 0.035, v, 0.1, { f: 3000 }),
    brush: (t, v = 0.1) => noise(t, 0.22, v, 2400, 0.4),
  };

  /* ---------- 十条曲子 ----------
     chord: 相对主音的半音集合(三个音), prog: 每小节用第几个和弦,
     scale: 旋律可选音级, drum: 每小节鼓型 */
  const SONGS = [
    { // 0 岩洞:骨笛与手鼓
      bpm: 62, root: 50, mode: [0, 3, 5, 7, 10], prog: [0, 0, 3, 4], bars: 4,
      inst: "bone", reverb: 0.7, drums: "tribal",
    },
    { // 1 埃及:竖琴 + 手鼓
      bpm: 86, root: 52, mode: [0, 1, 4, 5, 7, 8, 11], prog: [0, 0, 5, 4], bars: 4,
      inst: "harp", reverb: 0.55, drums: "tribal",
    },
    { // 2 浮世绘:筝
      bpm: 72, root: 55, mode: [0, 1, 5, 7, 8], prog: [0, 3, 1, 4], bars: 4,
      inst: "koto", reverb: 0.45, drums: "taiko",
    },
    { // 3 莫奈:六八拍,雾一样的和弦
      bpm: 96, root: 53, mode: [0, 2, 4, 7, 9, 11], prog: [0, 3, 4, 5], bars: 4,
      inst: "pad", reverb: 0.75, drums: "soft",
    },
    { // 4 梵高:涡旋般的颤音
      bpm: 104, root: 57, mode: [0, 2, 3, 7, 9], prog: [0, 4, 3, 5], bars: 4,
      inst: "swirl", reverb: 0.7, drums: "timpani",
    },
    { // 5 克里姆特:华尔兹,钢片琴
      bpm: 84, root: 58, mode: [0, 2, 4, 7, 9, 11], prog: [0, 3, 4, 0], bars: 4,
      inst: "celesta", reverb: 0.8, drums: "waltz",
    },
    { // 6 包豪斯:机械,方波与木鱼
      bpm: 122, root: 50, mode: [0, 2, 3, 7, 10], prog: [0, 0, 4, 3], bars: 4,
      inst: "machine", reverb: 0.2, drums: "machine",
    },
    { // 7 8bit:芯片音乐
      bpm: 140, root: 57, mode: [0, 2, 4, 7, 9], prog: [0, 4, 5, 3], bars: 4,
      inst: "chip", reverb: 0.18, drums: "chip",
    },
    { // 8 蒸汽波:慢速合成器
      bpm: 88, root: 48, mode: [0, 2, 3, 5, 7, 10], prog: [0, 5, 3, 4], bars: 4,
      inst: "synthwave", reverb: 0.85, drums: "gated",
    },
    { // 9 新海诚:钢琴与暖垫
      bpm: 96, root: 55, mode: [0, 2, 4, 7, 9, 11], prog: [0, 5, 3, 4], bars: 4,
      inst: "piano", reverb: 0.7, drums: "soft",
    },
  ];

  const chordAt = (s, bar) => {
    const deg = s.prog[bar % s.prog.length];
    return [0, 3, 5].map(x => s.root + ((x + deg) % 12) + 12 * Math.floor((x + deg) / 12));
  };
  const scaleNote = (s, i) => {
    const m = s.mode;
    const oct = Math.floor(i / m.length), k = ((i % m.length) + m.length) % m.length;
    return s.root + 12 + m[k] + oct * 12;
  };

  /* 旋律:用固定种子,同一小节永远同一串音,不会乱飘 */
  function seeded(n) { let x = n * 2654435761 % 4294967296; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }

  /* ---------- 调度 ---------- */
  function playStep(t, absStep) {
    const s = SONGS[cur];
    const spb = 60 / s.bpm;                        // 一拍秒数
    const sixteenth = spb / 4;
    const bar = Math.floor(absStep / 16) % s.bars;
    const k = absStep % 16;
    const chord = chordAt(s, bar);
    const rnd = seeded(bar * 97 + k * 13 + cur * 7);

    /* 低音:每小节第 1、第 9 格 */
    if (k === 0 || k === 8) I.sub(chord[0] - 12, t, spb * 0.9, 0.16);

    /* 和声:按音色铺 */
    if (s.inst === "pad" || s.inst === "synthwave") {
      if (k === 0) chord.forEach((m, i) => I.pad(m, t, spb * 3.6, 0.045 + i * 0.004, 0.7));
    } else if (s.inst === "machine") {
      if (k % 4 === 0) chord.forEach((m, i) => I.square(m + 12, t, sixteenth * 1.6, 0.035));
    } else if (s.inst === "waltz") {
      if (k === 0) I.pad(chord[0] + 12, t, spb * 2.8, 0.04);
    }

    /* 旋律:音色各自的和弦音游走 */
    const notePick = () => {
      const pick = rnd();
      if (pick < 0.55) return chord[Math.floor(rnd() * 3)] + 12;
      if (pick < 0.85) return scaleNote(s, 3 + Math.floor(rnd() * 4));
      return chord[0] + 24;
    };
    const mel = () => {
      const m = notePick();
      const v = 0.055 + rnd() * 0.02;
      switch (s.inst) {
        case "bone": if (k % 8 === 0 || k === 6) I.pluck(m, t, 0.9, v * 1.1, 0.8); break;
        case "harp": if (k % 3 === 0) I.pluck(m, t, 0.5, v, 0.6); break;
        case "koto": if (k % 4 === 0 || (k % 4 === 2 && rnd() < 0.5)) I.koto(m, t, 0.7, v * 1.2); break;
        case "pad": if (k % 4 === 0) I.bell(m + 12, t, 0.8, v * 0.6, 0.8); break;
        case "swirl": if (k % 2 === 0) { I.pluck(m, t, 0.3, v); I.pluck(m + 0.12, t + 0.02, 0.3, v * 0.6); } break;
        case "celesta": if (k % 4 === 0) { I.bell(m + 12, t, 1.1, v * 1.1); } break;
        case "machine": if (k % 2 === 0) I.square(m, t, sixteenth * 0.9, v * 0.8); break;
        case "chip": { const seq = [0, 12, 7, 12]; I.pulse(m + seq[k % 4], t, sixteenth * 0.85, v * 0.9); break; }
        case "synthwave": if (k % 2 === 0) I.pluck(m + 12, t, 0.45, v * 0.9, 0.9); break;
        case "piano": if (k % 4 === 0 || (k === 6 && rnd() < 0.6)) { I.bell(m + 12, t, 0.9, v * 0.9, 0.7); } break;
      }
    };
    mel();

    /* 鼓:16 格网格 */
    switch (s.drums) {
      case "tribal":
        if (k === 0 || k === 6 || k === 10) I.taiko(t, 0.4);
        if (k === 4) I.snare(t, 0.16);
        if (k % 4 === 2) I.hat(t, 0.06);
        break;
      case "taiko":
        if (k === 0 || k === 8) I.taiko(t, 0.42);
        if (k === 4 || k === 12) I.snare(t, 0.12);
        break;
      case "soft":
        if (k === 0) I.kick(t, 0.32);
        if (k === 8) I.brush(t, 0.1);
        break;
      case "timpani":
        if (k === 0) I.kick(t, 0.4);
        if (k === 6) I.timpani ? I.timpani(t) : I.taiko(t, 0.26);
        if (k === 12) I.brush(t, 0.08);
        break;
      case "waltz":
        if (k % 4 === 0) I.pluck(chord[0] - 12, t, 0.28, 0.07, 0.5);
        if (k === 4 || k === 12) I.brush(t, 0.07);
        break;
      case "machine":
        if (k % 4 === 0) I.kick(t, 0.34);
        if (k % 2 === 1) I.wood(t, 0.1);
        if (k === 8) I.snare(t, 0.14);
        break;
      case "chip":
        if (k % 4 === 0) I.kick(t, 0.36);
        if (k === 4 || k === 12) I.snare(t, 0.2);
        if (k % 2 === 0) I.hat(t, 0.05);
        break;
      case "gated":
        if (k === 0) I.kick(t, 0.42);
        if (k === 8) I.snare(t, 0.26);
        if (k % 4 === 2) I.hat(t, 0.08);
        break;
    }
  }

  function tick() {
    if (!playing || !AC) return;
    const spb = 60 / SONGS[cur].bpm, sixteenth = spb / 4;
    while (nextT < AC.currentTime + LOOKAHEAD) {
      if (!muted) playStep(nextT, step);
      step++;
      nextT += sixteenth;
    }
  }

  /* ---------- 外部接口 ---------- */
  function attach(ctx) {
    if (AC === ctx) return;
    AC = ctx;
    master = null; bus();
  }
  function start(era) {
    if (!AC) return;
    cur = ((era % 10) + 10) % 10;
    if (!playing) {
      playing = true; step = 0; nextT = AC.currentTime + 0.08;
      timer = setInterval(tick, TICK);
    }
    tick();
  }
  function setEra(era) { if (!AC) return; cur = ((era % 10) + 10) % 10; }
  function stop() { playing = false; if (timer) { clearInterval(timer); timer = null; } }
  function setMuted(m) { muted = m; }
  function duck(on) { if (master) master.gain.value = on ? 0.35 : 0.9; }

  return { attach, start, setEra, stop, setMuted, duck, SONGS };
})();