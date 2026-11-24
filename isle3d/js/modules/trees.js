/* ============================================================
   猫岛胜景 · 树林(trees.js)v2 —— 混交林
   崖顶草台 ~30 棵,两种树混着长(对齐 refs/ref1.png 左上角的林子):
     · 阔叶树(约 56%):矮壮树干 + 6 团多面体球簇。底下的团偏暗、顶上的团偏亮,
       卡通着色下也自带体积;树冠圆滚滚,和尖顶的松树拉开轮廓差异
     · 松树(约 44%):树干圆柱 + 三层层叠锥簇(越往上越浅绿)
   全部 InstancedMesh:树干 / 3 层锥 / 球簇 / 假阴影 = 6 个 mesh ≈ 6 个 draw call。
   ============================================================ */
import * as THREE from "three";

/* ---------- 模块级临时变量(构建/更新复用,不重复分配) ---------- */
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _up = new THREE.Vector3();
const _c = new THREE.Color();
const IDENT = new THREE.Quaternion();

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

/* ---------- 撒点:草台拒绝采样 + 避让(主亭/小亭/雕像道/崖缘/东南视线走廊) ---------- */
function scatterTrees(ctx, rng) {
  /* 小亭避让位(与 pavilion.js 的 SMALL 表一致):树冠不许穿屋顶 */
  const KIOSKS = [[-14, -18], [-46, -16], [-8, 2], [-22, 10], [-3, -12], [-30, 18]];
  const N = 30, pts = [];
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
    let hit = false;                           // 小亭避让:半径 6.5
    for (const [kx, kz] of KIOSKS) {
      const ex = x - kx, ez = z - kz;
      if (ex * ex + ez * ez < 42) { hit = true; break; }
    }
    if (hit) continue;
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
  group.name = "trees";
  const rng = mulberry32(20261019);
  const pts = scatterTrees(ctx, rng);
  const N = pts.length;
  const broad = pts.map(() => rng() < 0.56);             // true = 阔叶树
  const nBroad = broad.filter(Boolean).length, nCon = N - nBroad;
  /* 前 i 棵里的两种树各有多少(画质阶梯减实例时用) */
  const conBefore = [0], blobBefore = [0];
  for (let i = 0; i < N; i++) {
    conBefore.push(conBefore[i] + (broad[i] ? 0 : 1));
    blobBefore.push(blobBefore[i] + (broad[i] ? 6 : 0));
  }

  /* --- 几何:单位尺寸,靠实例矩阵缩放 --- */
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.5, 1, 6);
  trunkGeo.translate(0, 0.5, 0);               // 底部落在原点,便于种进地里
  const coneGeo = new THREE.ConeGeometry(1, 1, 8);
  const blobGeo = new THREE.IcosahedronGeometry(1, 1);   // 80 面的"球",平直着色出多面体感
  const shadowGeo = new THREE.CircleGeometry(1, 14);
  shadowGeo.rotateX(-Math.PI / 2);             // 圆片躺平贴地

  /* --- 材质:树干共用 woodD;松三层绿从深到浅;阔叶球簇一色靠实例色分浓淡 --- */
  const CONIFER = [0x3f8f5a, 0x56a866, 0x70bd74];
  const BROAD = [0x5fc25c, 0x86da72];                        // 阔叶:主体绿 / 亮部的黄绿
  const tierMats = CONIFER.map(c => new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.9, flatShading: true,     // 颜色全交给实例色
  }));
  const blobMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });

  /* --- 假阴影:径向渐变半透明深色圆片(高画质下实时投影为主,它只做接触暗部) --- */
  const sc = document.createElement("canvas"); sc.width = sc.height = 64;
  const sg = sc.getContext("2d");
  const rg = sg.createRadialGradient(32, 32, 3, 32, 32, 31);
  rg.addColorStop(0, "rgba(26,40,30,0.42)");
  rg.addColorStop(0.65, "rgba(26,40,30,0.22)");
  rg.addColorStop(1, "rgba(26,40,30,0)");
  sg.fillStyle = rg; sg.fillRect(0, 0, 64, 64);
  const shadowMesh = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(sc), transparent: true,
    depthWrite: false, opacity: 0.8,
  }), N);
  shadowMesh.renderOrder = 1;

  /* --- 实例:树干 1 份(全树)+ 松三层锥各 1 份 + 阔叶球簇 1 份 --- */
  const trunk = new THREE.InstancedMesh(trunkGeo, mats.woodD, N);
  const TIERS = [                              // [半径, 锥高, 中心占树高比例]
    [2.7, 3.9, 0.40],
    [2.05, 3.3, 0.63],
    [1.4, 2.9, 0.87],
  ];
  const tiers = TIERS.map((_, i) => new THREE.InstancedMesh(coneGeo, tierMats[i], Math.max(1, nCon)));
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, Math.max(1, nBroad * 6));

  let ci = 0, bi = 0;
  for (let i = 0; i < N; i++) {
    const { x, z } = pts[i];
    const gy = ctx.heightAt(x, z);
    const h = 7 + rng() * 4.5;                 // 树高 7~11.5:略矮于亭顶,亭台能露头
    const s = 0.85 + rng() * 0.35;             // 冠幅随机缩放
    _e.set((rng() - 0.5) * 0.14, rng() * Math.PI * 2, (rng() - 0.5) * 0.14); // 倾斜≤4°
    _q.setFromEuler(_e);
    _up.set(0, 1, 0).applyQuaternion(_q);      // 倾斜后的"树轴"方向
    let shadowR = 3.0 * s;

    if (broad[i]) {
      /* ── 阔叶树:矮壮树干,树冠是 6 团球 ── */
      _p.set(x, gy - 0.3, z); _s.set(0.78 * s, h * 0.62, 0.78 * s);
      _m.compose(_p, _q, _s);
      trunk.setMatrixAt(i, _m);
      const r0 = 0.265 * h * s;               // 主球半径
      const cy = 0.68 * h;                     // 树冠中心高度
      const cx = x + _up.x * cy, cyy = gy - 0.3 + _up.y * cy, cz = z + _up.z * cy;
      const a0 = rng() * Math.PI * 2;
      for (let b = 0; b < 6; b++) {            // 0=主球 1~4=四周围一圈 5=顶上补一团
        let ox = 0, oy = 0, oz = 0, rr = r0;
        if (b > 0) {
          const a = a0 + (b - 1) * Math.PI / 2 + (rng() - 0.5) * 0.5;
          const out = b === 5 ? 0 : 0.58 * r0;
          ox = Math.cos(a) * out; oz = Math.sin(a) * out;
          oy = (b === 5 ? 0.62 : -0.10 - rng() * 0.12) * r0;
          rr = r0 * (b === 5 ? 0.64 : 0.68 + rng() * 0.12);
        }
        _p.set(cx + ox, cyy + oy, cz + oz);
        _e.set(rng() * 0.7, rng() * Math.PI * 2, rng() * 0.7);
        _qb.setFromEuler(_e);                  // 每团朝向不同,多面体的切面才错落
        _s.set(rr, rr * (0.82 + rng() * 0.14), rr);
        _m.compose(_p, _qb, _s);
        blobs.setMatrixAt(bi, _m);
        const shade = 0.78 + (oy / r0 + 0.22) * 0.55;        // 底下的团暗、顶上的团亮
        _c.setHex(b === 0 ? BROAD[1] : BROAD[0]).multiplyScalar(shade * (0.95 + rng() * 0.1));
        blobs.setColorAt(bi, _c);
        bi++;
      }
      shadowR = 3.3 * s;
    } else {
      /* ── 松树:高树干 + 三层锥簇沿树轴叠放 ── */
      _p.set(x, gy - 0.3, z); _s.set(s, h, s);
      _m.compose(_p, _q, _s);
      trunk.setMatrixAt(i, _m);
      for (let k = 0; k < 3; k++) {
        const [r, hc, fy] = TIERS[k];
        const cy = (fy + (rng() - 0.5) * 0.04) * h;
        _p.set(x + _up.x * cy, gy - 0.3 + _up.y * cy, z + _up.z * cy);
        _s.set(r * s, hc, r * s);
        _m.compose(_p, _q, _s);
        tiers[k].setMatrixAt(ci, _m);
        _c.setHex(CONIFER[k]).multiplyScalar(0.94 + rng() * 0.12);   // 每棵亮度微抖(±6%)
        tiers[k].setColorAt(ci, _c);
      }
      ci++;
    }

    /* 贴地假阴影:水平圆片,略抬避免入土 */
    _p.set(x, gy + 0.16, z); _s.set(shadowR, 1, shadowR);
    _m.compose(_p, IDENT, _s);
    shadowMesh.setMatrixAt(i, _m);
  }
  [trunk, shadowMesh, blobs, ...tiers].forEach(m => {
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;                   // 实例分散全岛,关包围球剔除防闪消
    group.add(m);
  });
  [...tiers, blobs].forEach(t => { if (t.instanceColor) t.instanceColor.needsUpdate = true; });

  /* --- 画质阶梯:低配减实例 + 隐阴影 --- */
  ctx.onQuality(q => {
    const n = q === "low" ? Math.min(N, 22) : N;
    trunk.count = n;
    shadowMesh.count = n;
    tiers.forEach(t => { t.count = conBefore[n]; });
    blobs.count = blobBefore[n];
    shadowMesh.visible = q !== "low";
  });

  return { group };
}
