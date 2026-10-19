/* ============================================================
   猫岛胜景 · 桥灯专员(bridge.js)
   木质拱桥(跨崖壁爬升段)+ 两端石径 + 灯笼柱 ×6
   审美对齐 ref8:暖木双扶手拱桥 / 石板小径 / 石柱方灯箱
   预算:全部重复件 InstancedMesh,共 11 个 mesh = 11 draw call
   ============================================================ */
import * as THREE from "three";

/* ---------- 模块级临时变量(build/update 复用,不逐帧分配) ---------- */
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

/* 确定性伪随机(每次刷新布局一致) */
let seed = 20260419;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/* 所有方件共用一个单位盒几何,靠实例矩阵缩放(省内存) */
const unitBox = new THREE.BoxGeometry(1, 1, 1);

/* ---------- 实例矩阵快捷写入:位置 / 欧拉 / 缩放 ---------- */
function setInst(im, i, x, y, z, rx, ry, rz, sx, sy, sz) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  im.setMatrixAt(i, _m);
}

/* ============================================================
   build(ctx) → { group, update(t, dt) }
   ============================================================ */
export function build(ctx) {
  const { mats, heightAt } = ctx;
  const group = new THREE.Group();

  /* ---------- 拱桥落位:滩地脚 → 草台缘 ---------- */
  const A = { x: 24, z: 9.5 };               // 滩地脚(24,10 附近)
  const B = { x: 8, z: -10.5 };              // 草台缘脚(8,-8 附近)
  const dX = B.x - A.x, dZ = B.z - A.z;
  const SPAN = Math.hypot(dX, dZ);           // 弦长 ≈ 25.6
  const YAW = Math.atan2(-dZ, dX);           // 桥轴向:局部 +X 对准 A→B
  const hA = heightAt(A.x, A.z);             // ≈ 5.4 滩地
  const hB = heightAt(B.x, B.z);             // ≈ 17.7 草台缘
  const RISE = hB - hA;
  const ARCH = 1.9;                          // 拱顶额外抬升
  const NP = 12;                             // 桥面 / 栏杆分段数

  /* 桥面高:线性爬升 + 圆拱;中段按地形再抬 0.8 防穿模 */
  function deckY(u) {
    const base = hA + 0.55 + RISE * u + ARCH * Math.sin(Math.PI * u);
    if (u < 0.04 || u > 0.96) return base;
    return Math.max(base, heightAt(A.x + dX * u, A.z + dZ * u) + 0.8);
  }
  function pitchAt(u) {                      // 桥面坡度(局部绕 Z)
    const e = 0.01;
    return Math.atan2(deckY(u + e) - deckY(u - e), 2 * e * SPAN);
  }

  /* 桥体独立组:局部 +X 沿 A→B,y 不受旋转影响 */
  const bridge = new THREE.Group();
  bridge.position.set((A.x + B.x) / 2, 0, (A.z + B.z) / 2);
  bridge.rotation.y = YAW;
  group.add(bridge);
  const cyw = dX / SPAN, syw = -dZ / SPAN;   // 局部→世界(仅 XZ)

  /* ---------- 桥面板(wood × 12) ---------- */
  const plankLen = (SPAN / NP) * 1.18;       // 略搭接,读成连续桥面
  const planks = new THREE.InstancedMesh(unitBox, mats.wood, NP);
  for (let i = 0; i < NP; i++) {
    const u = (i + 0.5) / NP;
    setInst(planks, i, -SPAN / 2 + u * SPAN, deckY(u) - 0.19, 0,
            0, 0, pitchAt(u), plankLen, 0.34, 3.3);
  }

  /* ---------- 栏杆柱(woodD × 26) ---------- */
  const nPost = (NP + 1) * 2;
  const posts = new THREE.InstancedMesh(unitBox, mats.woodD, nPost);
  let pi = 0;
  for (let k = 0; k <= NP; k++) {
    const u = k / NP;
    const px = -SPAN / 2 + u * SPAN;
    setInst(posts, pi++, px, deckY(u) + 0.5, -1.52, 0, 0, 0, 0.22, 1.1, 0.22);
    setInst(posts, pi++, px, deckY(u) + 0.5, 1.52, 0, 0, 0, 0.22, 1.1, 0.22);
  }

  /* ---------- 双扶手(wood × 48:上/中杆 × 两侧 × 12 段) ---------- */
  const rails = new THREE.InstancedMesh(unitBox, mats.wood, NP * 4);
  let ri = 0;
  for (let k = 0; k < NP; k++) {
    const u0 = k / NP, u1 = (k + 1) / NP;
    const x0 = -SPAN / 2 + u0 * SPAN, x1 = -SPAN / 2 + u1 * SPAN;
    const dy = deckY(u1) - deckY(u0);
    const ph = Math.atan2(dy, SPAN / NP);
    const len = Math.hypot(SPAN / NP, dy) * 1.14;
    const ym = (deckY(u0) + deckY(u1)) / 2;
    for (const rh of [1.04, 0.6]) {
      setInst(rails, ri++, (x0 + x1) / 2, ym + rh, -1.55, 0, 0, ph, len, 0.16, 0.14);
      setInst(rails, ri++, (x0 + x1) / 2, ym + rh, 1.55, 0, 0, ph, len, 0.16, 0.14);
    }
  }

  /* ---------- 桥脚石墩 + 墩旁碎护石(stone × 6) ---------- */
  const piers = new THREE.InstancedMesh(unitBox, mats.stone, 6);
  [[-1, hA], [1, hB]].forEach(([end, gy], j) => {
    const top = deckY(end < 0 ? 0 : 1) - 0.26, bot = gy - 0.4;
    setInst(piers, j, end * (SPAN / 2 - 0.5), (top + bot) / 2, 0,
            0, 0, 0, 1.6, top - bot, 3.6);
  });
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([ex, ez], j) => {
    const lx = ex * (SPAN / 2 + 1.05), lz = ez * 2.1;
    const wx = (A.x + B.x) / 2 + lx * cyw + lz * syw;
    const wz = (A.z + B.z) / 2 - lx * syw + lz * cyw;
    setInst(piers, 2 + j, lx, heightAt(wx, wz) + 0.18, lz,
            0, rnd() * 0.6, 0, 0.8, 0.72, 0.8);
  });

  /* ---------- 石径:两端落脚台 + 各 3 块石板(stoneD × 8) ---------- */
  const paths = new THREE.InstancedMesh(unitBox, mats.stoneD, 8);
  const outAx = -dX / SPAN, outAz = -dZ / SPAN;          // A 端延伸(向东南滩地)
  const yawA = Math.atan2(-outAz, outAx);
  {  // A 端落脚石台
    const px = A.x + outAx * 1.7, pz = A.z + outAz * 1.7;
    setInst(paths, 0, px, heightAt(px, pz) + 0.4, pz, 0, yawA, 0, 2.6, 0.8, 2.9);
  }
  for (let k = 1; k <= 3; k++) {                          // A 端石板
    const d = 3.9 + k * 2.2 + rnd() * 0.5;
    const px = A.x + outAx * d + (rnd() - 0.5) * 0.7;
    const pz = A.z + outAz * d + (rnd() - 0.5) * 0.7;
    setInst(paths, k, px, heightAt(px, pz) + 0.1, pz,
            0, yawA + (rnd() - 0.5) * 0.3, 0, 2.0, 0.2, 1.6);
  }
  const outBx = -0.985, outBz = 0.172;                    // B 端延伸(向西往主亭)
  const yawB = Math.atan2(-outBz, outBx);
  {  // B 端落脚石台
    const px = B.x + outBx * 1.5, pz = B.z + outBz * 1.5;
    setInst(paths, 4, px, heightAt(px, pz) + 0.2, pz, 0, yawB, 0, 2.4, 0.4, 2.7);
  }
  for (let k = 1; k <= 3; k++) {                          // B 端石板(往亭向)
    const d = 3.4 + k * 2.1 + rnd() * 0.5;
    const px = B.x + outBx * d + (rnd() - 0.5) * 0.6;
    const pz = B.z + outBz * d + (rnd() - 0.5) * 0.6;
    setInst(paths, 4 + k, px, heightAt(px, pz) + 0.1, pz,
            0, yawB + (rnd() - 0.5) * 0.3, 0, 2.0, 0.2, 1.6);
  }

  /* ---------- 灯笼柱 ×6:石座 / 石柱 / 暖光灯箱 / 瓦顶 / 金顶 ---------- */
  /* 各 6 实例 × 5 种部件 = 5 个 InstancedMesh */
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe2a8, emissive: 0xffc878, emissiveIntensity: 0.9, roughness: 0.7,
  });
  const LP = [                                // [x, z, 朝向]
    [28.1, 10.9, -0.9], [30.3, 13.6, -0.9],   // 滩地石径旁
    [9.0, -6.5, 2.2], [6.2, -8.2, -0.6],      // 草台缘桥头
    [2.4, -9.4, 1.4], [-3.2, -8.9, 1.5],      // 通亭石径旁
  ];
  const lBase = new THREE.InstancedMesh(unitBox, mats.stoneD, 6);
  const lPost = new THREE.InstancedMesh(unitBox, mats.stone, 6);
  const lamp = new THREE.InstancedMesh(unitBox, lampMat, 6);
  const lCap = new THREE.InstancedMesh(unitBox, mats.roofD, 6);
  const knob = new THREE.InstancedMesh(unitBox, mats.gold, 6);
  LP.forEach(([x, z, ry], i) => {
    const gy = heightAt(x, z);
    setInst(lBase, i, x, gy + 0.13, z, 0, ry, 0, 0.78, 0.26, 0.78);
    setInst(lPost, i, x, gy + 0.88, z, 0, ry, 0, 0.3, 1.24, 0.3);
    setInst(lamp, i, x, gy + 1.74, z, 0, ry, 0, 0.62, 0.48, 0.62);
    setInst(lCap, i, x, gy + 2.07, z, 0, ry, 0, 0.95, 0.18, 0.95);
    setInst(knob, i, x, gy + 2.27, z, 0, ry, 0, 0.2, 0.22, 0.2);
  });

  /* ---------- 接触假阴影(半透明深色圆片,贴 heightAt) ---------- */
  const shGeo = new THREE.CircleGeometry(1, 12);
  shGeo.rotateX(-Math.PI / 2);
  const shMat = new THREE.MeshBasicMaterial({
    color: 0x2a2340, transparent: true, opacity: 0.22, depthWrite: false,
  });
  const shadows = new THREE.InstancedMesh(shGeo, shMat, 8);
  const SH = [
    [28.1, 10.9, 0.75, 0.75], [30.3, 13.6, 0.75, 0.75],       // 灯笼
    [9.0, -6.5, 0.75, 0.75], [6.2, -8.2, 0.75, 0.75],
    [2.4, -9.4, 0.75, 0.75], [-3.2, -8.9, 0.75, 0.75],
    [23.7, 9.1, 2.4, 1.9], [8.3, -10.9, 2.4, 1.9],            // 桥墩
  ];
  SH.forEach(([x, z, sx, sz], i) => {
    setInst(shadows, i, x, heightAt(x, z) + 0.08, z, 0, i < 6 ? 0 : YAW, 0, sx, 1, sz);
  });
  shadows.renderOrder = 2;

  /* ---------- 收进组;关视锥剔除(实例包围球不含散布实例) ---------- */
  for (const im of [planks, posts, rails, piers, paths,
                    lBase, lPost, lamp, lCap, knob, shadows]) {
    im.frustumCulled = false;
    group.add(im);
  }

  /* ---------- 每帧:灯箱暖光轻微呼吸(仅赋值,无对象分配) ---------- */
  function update(t) {
    lampMat.emissiveIntensity = 0.86 + Math.sin(t * 2.2) * 0.06
                                   + Math.sin(t * 5.3 + 1.7) * 0.04;
  }

  return { group, update };
}
