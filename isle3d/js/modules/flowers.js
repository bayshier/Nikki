/* ============================================================
   猫岛胜景 · 花树层(flowers.js)
   樱花树 ×8(粉团簇冠 + 深色干 + 假阴影圆片)
   草丛 ×~220(压扁锥,双色)· 小花 ×~160(粉/黄/白)
   审美对齐 refs/ref6(粉团樱冠)· ref7(草丛野花)
   全部合并 InstancedMesh:共 9 个 mesh = 9 draw call
   ============================================================ */
import * as THREE from "three";

/* ---------- 模块级临时对象(update 每帧复用,零分配) ---------- */
const _d = new THREE.Object3D();
const _up = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();

/* ---------- 固定手选樱树位:崖缘一排 + 主亭两排(取对称感) ---------- */
const TREES = [
  // 崖缘排(x∈[-6,2],沿崖线错落,东南视角最上镜)
  { x: -4, z: -21, h: 7.2, s: 1.00 },
  { x: 0, z: -9, h: 8.2, s: 1.12 },
  { x: -3, z: 4, h: 6.6, s: 0.92 },
  { x: -6, z: 17, h: 7.6, s: 1.05 },
  // 主亭(-34,-6)左右两排各两棵,绕亭对称
  { x: -43, z: -15, h: 7.0, s: 0.95 },
  { x: -43, z: 3, h: 8.0, s: 1.08 },
  { x: -25, z: -16, h: 7.4, s: 1.02 },
  { x: -25, z: 2, h: 6.8, s: 0.90 },
];

/* ---------- 可复现随机(仅构建期用) ---------- */
let seed = 20260401;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

/* ============================================================ */
export function build(ctx) {
  const { mats, heightAt } = ctx;
  const group = new THREE.Group();

  /* ---------- 材质:樱冠双色 + 深色干 + 假阴影 + 花头 ---------- */
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4e3a2e, roughness: 0.95 });
  const bloomMatA = new THREE.MeshStandardMaterial({ color: 0xffc4dd, roughness: 0.9 });
  const bloomMatB = new THREE.MeshStandardMaterial({ color: 0xffd9ea, roughness: 0.9 });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x35284a, transparent: true, opacity: 0.3, depthWrite: false });
  const petalPink = new THREE.MeshStandardMaterial({ color: 0xffa0c6, roughness: 0.85 });
  const petalYellow = new THREE.MeshStandardMaterial({ color: 0xffd36b, roughness: 0.85 });

  /* ---------- 几何:樱冠球 / 树干 / 草锥 / 花头 / 阴影片 ---------- */
  const bloomGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.5, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  const grassGeo = new THREE.ConeGeometry(0.36, 1.05, 5, 1);
  grassGeo.scale(1, 1, 0.62);                            // 压扁成草叶簇
  const headGeo = new THREE.IcosahedronGeometry(0.17, 0);
  headGeo.scale(1, 0.85, 1);
  const discGeo = new THREE.CircleGeometry(1, 16);
  discGeo.rotateX(-Math.PI / 2);

  /* ---------- 樱冠数据:每树 3~5 颗粉球,双色分流 ---------- */
  const canA = [], canB = [];                            // 每项 [x,y,z,sx,sy,sz,rotY,phase]
  for (const tr of TREES) {
    const top = heightAt(tr.x, tr.z) + tr.h * 0.9;
    const n = 3 + (rnd() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const main = i === 0;
      const r = (main ? 2.7 : 1.7 + rnd() * 1.1) * tr.s;
      const a = rnd() * Math.PI * 2;
      const rad = main ? 0 : (1.5 + rnd() * 1.6) * tr.s;
      const arr = main || rnd() < 0.4 ? canB : canA;     // 主球偏浅粉,外围深粉
      arr.push(
        tr.x + Math.cos(a) * rad,
        top + (main ? r * 0.55 : r * 0.3 + rnd() * 1.5),
        tr.z + Math.sin(a) * rad,
        r * 1.12, r * (0.82 + rnd() * 0.1), r * 1.06,
        rnd() * 6.283, rnd() * 6.283);
    }
  }

  /* ---------- 树干 ×8(深色干,单 InstancedMesh) ---------- */
  const trunkIM = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES.length);
  TREES.forEach((tr, i) => {
    _d.position.set(tr.x, heightAt(tr.x, tr.z) - 0.25, tr.z);
    _d.rotation.set((rnd() - 0.5) * 0.12, rnd() * 6.283, (rnd() - 0.5) * 0.12);
    _d.scale.set(tr.s * 1.3, tr.h, tr.s * 1.3);
    _d.updateMatrix();
    trunkIM.setMatrixAt(i, _d.matrix);
  });
  trunkIM.instanceMatrix.needsUpdate = true;
  group.add(trunkIM);

  /* ---------- 樱树下假阴影圆片 ×8(半透明,贴地随坡) ---------- */
  const discIM = new THREE.InstancedMesh(discGeo, shadowMat, TREES.length);
  TREES.forEach((tr, i) => {
    const x = tr.x, z = tr.z;
    _n.set(
      (heightAt(x - 0.7, z) - heightAt(x + 0.7, z)) / 1.4, 1,
      (heightAt(x, z - 0.7) - heightAt(x, z + 0.7)) / 1.4).normalize();
    _q.setFromUnitVectors(_up, _n);
    _d.position.set(x, heightAt(x, z) + 0.16, z);
    _d.quaternion.copy(_q);
    _d.scale.setScalar(4.2 * tr.s);
    _d.updateMatrix();
    discIM.setMatrixAt(i, _d.matrix);
  });
  discIM.instanceMatrix.needsUpdate = true;
  discIM.renderOrder = 1;
  group.add(discIM);

  /* ---------- 樱冠 ×2 个 InstancedMesh(深粉 / 浅粉) ---------- */
  function bakeBloom(arr, mat) {
    const im = new THREE.InstancedMesh(bloomGeo, mat, arr.length / 8);
    for (let i = 0; i < im.count; i++) {
      const o = i * 8;
      _d.position.set(arr[o], arr[o + 1], arr[o + 2]);
      _d.rotation.set(0, arr[o + 6], 0);
      _d.scale.set(arr[o + 3], arr[o + 4], arr[o + 5]);
      _d.updateMatrix();
      im.setMatrixAt(i, _d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
    return im;
  }
  const bloomA = bakeBloom(canA, bloomMatA);
  const bloomB = bakeBloom(canB, bloomMatB);

  /* ---------- 落点规则:草台(heightAt>13),避亭基/槽口/树干 ---------- */
  const okGround = (x, z) =>
    heightAt(x, z) >= 13.2 &&
    (x + 34) ** 2 + (z + 6) ** 2 >= 20 &&                // 主亭台基
    (x - 5) ** 2 + (z - 6) ** 2 >= 42 &&                 // 瀑布槽口
    TREES.every(tr => (x - tr.x) ** 2 + (z - tr.z) ** 2 >= 4)
      ? [x, z] : null;
  const plateauSpot = () => okGround(-56 + rnd() * 62, -32 + rnd() * 58);

  /* 路径走廊(桥→亭→雕像道近似折线)与亭旁环带:小花更密 */
  const PATH = [[12, -1], [-6, -4], [-22, -5], [-34, -6], [-44, -1], [-52, 8], [-52, -4]];
  function pathSpot() {
    const s = 1 + (rnd() * (PATH.length - 1) | 0);
    const [ax, az] = PATH[s - 1], [bx, bz] = PATH[s];
    const t = rnd(), len = Math.hypot(bx - ax, bz - az) || 1;
    const off = (rnd() < 0.5 ? -1 : 1) * (1.3 + rnd() * 4.2);
    return okGround(ax + (bx - ax) * t - (bz - az) / len * off,
      az + (bz - az) * t + (bx - ax) / len * off);
  }
  function pavilionSpot() {
    const a = rnd() * 6.283, r = 5.5 + rnd() * 6.5;
    return okGround(-34 + Math.cos(a) * r, -6 + Math.sin(a) * r);
  }
  const flowerSpot = () => {
    const r = rnd();
    return r < 0.42 ? pathSpot() : r < 0.62 ? pavilionSpot() : plateauSpot();
  };

  /* ---------- 撒种器:收集落点,再一次性烘成 InstancedMesh ---------- */
  function scatter(n, spot, out) {
    for (let placed = 0, tries = 0; placed < n && tries < n * 30; tries++) {
      const p = spot();
      if (!p) continue;
      out.push(p[0], p[1], rnd() * 6.283, 0.72 + rnd() * 0.85);
      placed++;
    }
  }
  function bakeIM(geo, mat, data, lift, tilt) {
    const im = new THREE.InstancedMesh(geo, mat, data.length / 4);
    for (let i = 0; i < im.count; i++) {
      const o = i * 4;
      _d.position.set(data[o], heightAt(data[o], data[o + 1]) + lift, data[o + 1]);
      _d.rotation.set(tilt ? (rnd() - 0.5) * 0.5 : 0, data[o + 2], tilt ? (rnd() - 0.5) * 0.5 : 0);
      _d.scale.setScalar(data[o + 3]);
      _d.updateMatrix();
      im.setMatrixAt(i, _d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.userData.full = im.count;                         // 低配按比例减实例
    group.add(im);
    return im;
  }

  /* ---------- 草丛:双色 ×~220,撒 heightAt>13 草台 ---------- */
  const gA = [], gB = [];
  scatter(130, plateauSpot, gA);
  scatter(90, plateauSpot, gB);
  const grassA = bakeIM(grassGeo, mats.grass, gA, 0.05, true);
  const grassB = bakeIM(grassGeo, mats.grassD, gB, 0.05, true);

  /* ---------- 小花:粉/黄/白 ×~160,路径与亭旁密集 ---------- */
  const fP = [], fY = [], fW = [];
  scatter(68, flowerSpot, fP);
  scatter(40, flowerSpot, fY);
  scatter(52, flowerSpot, fW);
  const flowerP = bakeIM(headGeo, petalPink, fP, 0.1, false);
  const flowerY = bakeIM(headGeo, petalYellow, fY, 0.1, false);
  const flowerW = bakeIM(headGeo, mats.white, fW, 0.1, false);

  /* ---------- 画质回调:低配主动减实例数 ---------- */
  function onQuality(q) {
    const k = q === "low" ? 0.45 : q === "mid" ? 0.75 : 1;
    for (const im of [grassA, grassB, flowerP, flowerY, flowerW])
      im.count = Math.max(1, Math.round(im.userData.full * k));
  }
  if (typeof ctx.onQuality === "function") ctx.onQuality(onQuality);
  else ctx.onQuality.push(onQuality);

  /* ---------- update:樱冠随风轻摇(复用临时对象,零分配) ---------- */
  function sway(im, arr, t) {
    for (let i = 0, o = 0; i < im.count; i++, o += 8) {
      const ph = arr[o + 7];
      _d.position.set(
        arr[o] + Math.sin(t * 0.62 + ph) * 0.14,
        arr[o + 1] + Math.sin(t * 0.9 + ph * 1.7) * 0.07,
        arr[o + 2] + Math.cos(t * 0.5 + ph) * 0.12);
      _d.rotation.set(0, arr[o + 6], Math.sin(t * 0.55 + ph) * 0.05);
      _d.scale.set(arr[o + 3], arr[o + 4], arr[o + 5]);
      _d.updateMatrix();
      im.setMatrixAt(i, _d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  }

  return {
    group,
    update(t) {
      sway(bloomA, canA, t);
      sway(bloomB, canB, t);
    },
  };
}
