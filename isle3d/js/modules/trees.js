/* ============================================================
   猫岛胜景 · 松树群(trees.js)
   崖顶草台松林 ~36 棵:树干圆柱 + 三层层叠锥簇(对齐 refs/ref1.png
   左上松林的层叠塔形,越往上越浅绿)+ 贴地假阴影。
   全部 InstancedMesh:共 5 个 mesh ≈ 5 个 draw call。
   ============================================================ */
import * as THREE from "three";

/* ---------- 模块级临时变量(构建/更新复用,不重复分配) ---------- */
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _up = new THREE.Vector3();
const _c = new THREE.Color();

/* ---------- 可复现随机(mulberry32,保证每次加载同一片林子) ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 撒点:草台拒绝采样 + 避让(主亭/雕像道/崖缘/东南视线走廊) ---------- */
function scatterTrees(ctx, rng) {
  const N = 36, pts = [];
  let tries = 0, corridor = 0;                 // 走廊里最多放 3 棵
  while (pts.length < N && tries < 8000) {
    tries++;
    const x = -54 + rng() * 58;                // x ∈ [-54, 4)
    const z = -40 + rng() * 74;                // z ∈ [-40, 34)
    if (x > 0) continue;                       // 崖缘留空
    if (ctx.heightAt(x, z) <= 14) continue;    // 只留草台(y>14)
    if (x < -44) continue;                     // 雕像道留空
    const dx = x + 34, dz = z + 6;             // 主亭(-34,-6)半径 14
    if (dx * dx + dz * dz < 196) continue;
    if (x > -10 && z > 10) {                   // 东南相机视线走廊:大幅少放
      if (corridor >= 3 || rng() > 0.25) continue;
      corridor++;
    }
    let clear = true;                          // 树冠不互相压:最小间距 7
    for (const o of pts) {
      const ex = o.x - x, ez = o.z - z;
      if (ex * ex + ez * ez < 49) { clear = false; break; }
    }
    if (!clear) continue;
    pts.push({ x, z });
  }
  return pts;
}

/* ---------- 主构建 ---------- */
export function build(ctx) {
  const { THREE, mats } = ctx;
  const group = new THREE.Group();
  const rng = mulberry32(20261019);
  const pts = scatterTrees(ctx, rng);
  const N = pts.length;

  /* --- 几何:单位尺寸,靠实例矩阵缩放 --- */
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.5, 1, 6);
  trunkGeo.translate(0, 0.5, 0);               // 底部落在原点,便于种进地里
  const coneGeo = new THREE.ConeGeometry(1, 1, 8);
  const shadowGeo = new THREE.CircleGeometry(1, 14);
  shadowGeo.rotateX(-Math.PI / 2);             // 圆片躺平贴地

  /* --- 材质:树干共用 woodD;三层绿从深到浅(取自 ref1 松林) --- */
  const GREENS = [0x4f9a58, 0x63b56a, 0x7cc47a];
  const tierMats = GREENS.map(c => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.9, flatShading: true,
  }));

  /* --- 假阴影:径向渐变半透明深色圆片 --- */
  const sc = document.createElement("canvas"); sc.width = sc.height = 64;
  const sg = sc.getContext("2d");
  const rg = sg.createRadialGradient(32, 32, 3, 32, 32, 31);
  rg.addColorStop(0, "rgba(26,40,30,0.5)");
  rg.addColorStop(0.65, "rgba(26,40,30,0.28)");
  rg.addColorStop(1, "rgba(26,40,30,0)");
  sg.fillStyle = rg; sg.fillRect(0, 0, 64, 64);
  const shadowMesh = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(sc), transparent: true,
    depthWrite: false, opacity: 0.85,
  }), N);
  shadowMesh.renderOrder = 1;

  /* --- 实例:树干 1 份 + 三层锥簇各 1 份 --- */
  const trunk = new THREE.InstancedMesh(trunkGeo, mats.woodD, N);
  const TIERS = [                              // [半径, 锥高, 中心占树高比例]
    [2.7, 3.9, 0.40],
    [2.05, 3.3, 0.63],
    [1.4, 2.9, 0.87],
  ];
  const tiers = TIERS.map((_, i) => new THREE.InstancedMesh(coneGeo, tierMats[i], N));

  for (let i = 0; i < N; i++) {
    const { x, z } = pts[i];
    const gy = ctx.heightAt(x, z);
    const h = 8 + rng() * 6;                   // 树高 8~14
    const s = 0.85 + rng() * 0.35;             // 冠幅随机缩放
    _e.set((rng() - 0.5) * 0.14, rng() * Math.PI * 2, (rng() - 0.5) * 0.14); // 倾斜≤4°
    _q.setFromEuler(_e);
    _up.set(0, 1, 0).applyQuaternion(_q);      // 倾斜后的"树轴"方向

    /* 树干:插进土里 0.3 */
    _p.set(x, gy - 0.3, z); _s.set(s, h, s);
    _m.compose(_p, _q, _s);
    trunk.setMatrixAt(i, _m);

    /* 三层锥簇:沿倾斜树轴叠放,层间略有抖动 */
    for (let k = 0; k < 3; k++) {
      const [r, hc, fy] = TIERS[k];
      const cy = (fy + (rng() - 0.5) * 0.04) * h;
      _p.set(x + _up.x * cy, gy - 0.3 + _up.y * cy, z + _up.z * cy);
      _s.set(r * s, hc, r * s);
      _m.compose(_p, _q, _s);
      tiers[k].setMatrixAt(i, _m);
      /* 每棵亮度微抖(±6%),打破色带感 */
      _c.setHex(GREENS[k]).multiplyScalar(0.94 + rng() * 0.12);
      tiers[k].setColorAt(i, _c);
    }

    /* 贴地假阴影:水平圆片,略抬避免入土 */
    const sr = 3.0 * s;
    _p.set(x, gy + 0.16, z); _s.set(sr, 1, sr);
    _m.compose(_p, _q.set(0, 0, 0, 1), _s);
    shadowMesh.setMatrixAt(i, _m);
  }
  [trunk, shadowMesh, ...tiers].forEach(m => {
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;                   // 实例分散全岛,关包围球剔除防闪消
    group.add(m);
  });
  tiers.forEach(t => { if (t.instanceColor) t.instanceColor.needsUpdate = true; });

  /* --- 画质阶梯:低配减实例 + 隐阴影 --- */
  ctx.onQuality(q => {
    const n = q === "low" ? Math.min(N, 22) : N;
    trunk.count = n;
    tiers.forEach(t => { t.count = n; });
    shadowMesh.visible = q !== "low";
  });

  return { group };
}
