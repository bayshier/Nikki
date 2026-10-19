/* ============================================================
   Nikki 游戏合集 · three.js 公共组件层(shared/three-kit.js)
   供 3D 化页面复用:渲染器初始化 / 程序化贴图 / 低模方块猫
   依赖页面级 importmap: "three" → ../vendor/three/three.module.min.js
   ============================================================ */
import * as THREE from "three";

/* ---------- 程序化 canvas 贴图 ---------- */
export function canvasTex(w, h, draw, opt = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (opt.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* ---------- 渲染器统一初始化(手机性能基线) ---------- */
export function initRenderer(canvas, opt = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: opt.antialias !== false,
    alpha: !!opt.alpha, powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opt.maxPixelRatio || 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opt.exposure || 1.05;
  if (opt.shadows !== false) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  return renderer;
}

/* ---------- 低模方块猫 ----------
   opts: { body, patch, belly, scale, name }
   patch: 头顶/背斑颜色(陈皮的"八字黑斑"即此),belly: 肚皮补丁
   返回 group,userData 里有可动部件与 phase */
const CAT_GEO = {
  body: new THREE.BoxGeometry(20, 17, 26),
  head: new THREE.BoxGeometry(15, 13, 13),
  ear: new THREE.ConeGeometry(3.6, 6.5, 4),
  eye: new THREE.SphereGeometry(1.4, 8, 6),
  nose: new THREE.SphereGeometry(1.1, 8, 6),
  patch: new THREE.BoxGeometry(15.6, 3.4, 13.6),
  belly: new THREE.BoxGeometry(12, 9, 2),
  tailBit: [new THREE.SphereGeometry(2.2, 8, 6), new THREE.SphereGeometry(1.9, 8, 6), new THREE.SphereGeometry(1.5, 8, 6)],
};
export function makeCat(opts = {}) {
  const s = opts.scale || 1;
  const mat = new THREE.MeshStandardMaterial({ color: opts.body || 0xffb38a, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2233, roughness: 0.6 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(CAT_GEO.body, mat); body.position.y = 8.5;
  const head = new THREE.Mesh(CAT_GEO.head, mat); head.position.set(0, 22.5, 8);
  const earL = new THREE.Mesh(CAT_GEO.ear, mat); earL.position.set(-4.6, 31.5, 8);
  const earR = new THREE.Mesh(CAT_GEO.ear, mat); earR.position.set(4.6, 31.5, 8);
  const eyeL = new THREE.Mesh(CAT_GEO.eye, dark); eyeL.position.set(-4, 23.5, 14.6);
  const eyeR = new THREE.Mesh(CAT_GEO.eye, dark); eyeR.position.set(4, 23.5, 14.6);
  const nose = new THREE.Mesh(CAT_GEO.nose,
    new THREE.MeshStandardMaterial({ color: 0xff8fb0, roughness: 0.5 }));
  nose.position.set(0, 20.5, 15);
  g.add(body, head, earL, earR, eyeL, eyeR, nose);
  const parts = { tail: null, head, body, eyeL, eyeR };
  if (opts.patch) {                                          // 头顶黑斑(陈皮同款)
    const p = new THREE.Mesh(CAT_GEO.patch,
      new THREE.MeshStandardMaterial({ color: opts.patch, roughness: 0.9 }));
    p.position.set(0, 28.1, 7.6); g.add(p);
  }
  if (opts.belly) {                                          // 肚皮补丁
    const b = new THREE.Mesh(CAT_GEO.belly,
      new THREE.MeshStandardMaterial({ color: opts.belly, roughness: 0.9 }));
    b.position.set(0, 5.5, 13.2); g.add(b);
  }
  const tailPivot = new THREE.Group(); tailPivot.position.set(0, 12.5, -13);
  [[0, 0, -2, 0], [0, 4, -4.5, 1], [0, 8, -5.5, 2]].forEach(([x, y, z, gi]) => {
    const t = new THREE.Mesh(CAT_GEO.tailBit[gi], mat);
    t.position.set(x, y, z); tailPivot.add(t);
  });
  g.add(tailPivot); parts.tail = tailPivot;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(s);
  g.userData = { ...parts, phase: Math.random() * 6.28 };
  return g;
}

/* ---------- 通用动画:呼吸 / 尾巴摆(每帧调用) ---------- */
export function idleCat(cat, t) {
  const u = cat.userData;
  cat.position.y = (u.baseY || 0) + Math.sin(t * 0.03 + u.phase) * 1.2;
  u.tail.rotation.x = Math.sin(t * 0.05 + u.phase) * 0.18;
  u.tail.rotation.z = Math.cos(t * 0.04 + u.phase) * 0.12;
}

/* ---------- 毛线球 ---------- */
export function makeYarn(color = 0xffb0c8, r = 5) {
  const tex = canvasTex(128, 128, (g) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#ffb0c8"; g.lineWidth = 9;
    g.beginPath(); g.arc(64, 64, 40, 0.4, 2.6); g.stroke();
    g.beginPath(); g.arc(64, 64, 24, 3.4, 5.6); g.stroke();
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14),
    new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.8 }));
  m.castShadow = true;
  return m;
}
