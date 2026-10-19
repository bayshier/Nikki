/* ============================================================
   猫岛胜景 · 岩石专员(rocks.js)
   ① 海蚀岩群:东南海面 8 块压扁变形岩(对齐 ref1 右下深色岩群)
      最大一块顶上放 2 棵小松 + 一座小亭剪影
   ② 岸边踏石:崖下滩上一串 14 块圆扁石(InstancedMesh)
   ③ 杂件:木牌 ×1 / 矮篱笆一段 / 石灯笼座 ×2
   阴影全部用半透明深色圆片假阴影(海里的岩石不用)
   draw call:10 个 mesh(其中 4 个 InstancedMesh)
   ============================================================ */
import * as THREE from "three";

/* ---------- 模块级临时变量(update 内零分配) ---------- */
const _d = new THREE.Object3D();            // 姿态复用
const _c = new THREE.Color();               // 颜色复用
let _seed = 71;                             // 确定性随机(每次刷新布局一致)
const rnd = () => ((_seed = (_seed * 16807) % 2147483647) - 1) / 2147483646;
const frac = v => v - Math.floor(v);

/* ---------- 几何合并小工具(非索引拼接,可选逐顶点色) ----------
   part: { g, x,y,z, rx,ry,rz, s, c }  变换顺序:缩放→旋转→平移 */
function mergeParts(parts) {
  const useC = parts.some(p => p.c !== undefined);
  let n = 0;
  const gs = parts.map(p => {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    if (p.s) g.scale(p.s, p.s, p.s);
    if (p.rx) g.rotateX(p.rx);
    if (p.ry) g.rotateY(p.ry);
    if (p.rz) g.rotateZ(p.rz);
    g.translate(p.x || 0, p.y || 0, p.z || 0);
    n += g.attributes.position.count;
    return g;
  });
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const col = useC ? new Float32Array(n * 3) : null;
  let o = 0;
  for (let i = 0; i < gs.length; i++) {
    const cnt = gs[i].attributes.position.count * 3;
    pos.set(gs[i].attributes.position.array, o);
    if (useC) {
      _c.set(parts[i].c || 0xffffff);
      for (let k = 0; k < cnt; k += 3) { col[o + k] = _c.r; col[o + k + 1] = _c.g; col[o + k + 2] = _c.b; }
    }
    o += cnt;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();                          // 非索引 → 平直棱面,岩石感
  if (useC) geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

/* ---------- 岩石几何:按坐标哈希抖动(重复顶点同步位移,不裂面) ---------- */
function joltedRock(src, amp) {
  const pos = src.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    pos.setXYZ(i,
      x * (1 - amp + frac(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) * amp * 2),
      y * (1 - amp + frac(Math.sin(x * 93.989 + y * 47.233 + z * 66.835) * 24634.6345) * amp * 2),
      z * (1 - amp + frac(Math.sin(x * 39.425 + y * 11.135 + z * 91.733) * 37585.453) * amp * 2));
  }
  src.computeVertexNormals();
  return src;
}

/* ---------- 岩顶小松(干 + 双层锥,顶点色) ---------- */
function pineParts(px, pz, py, s) {
  return [
    { g: new THREE.CylinderGeometry(0.07, 0.12, 0.6, 5), s, x: px, y: py + 0.28 * s, z: pz, c: 0x6b4a3a },
    { g: new THREE.ConeGeometry(0.52, 0.75, 6), s, x: px, y: py + 0.75 * s, z: pz, c: 0x2f6a3e },
    { g: new THREE.ConeGeometry(0.35, 0.55, 6), s, x: px, y: py + 1.22 * s, z: pz, c: 0x3f7a4a },
  ];
}

/* ============================================================ */
export function build(ctx) {
  const group = new THREE.Group();
  const shadows = [];                  // 陆上道具假阴影 {x,z,sx,sz,ry,y}
  const foamBase = [];                 // 浪花环脉冲参数
  const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });

  /* ---------- ① 海蚀岩群:东与东南海面 8 块(ref1 右下) ---------- */
  const SEA_ROCKS = [
    { x: 40, z: 46, r: 8.5, sy: 0.52, ry: 0.4, tint: 0x8a8296 },   // 主岩:顶置小松+小亭
    { x: 56, z: 34, r: 6.0, sy: 0.5,  ry: 2.1, tint: 0x7a7288 },
    { x: 24, z: 54, r: 5.0, sy: 0.46, ry: 4.0, tint: 0x8f879c },
    { x: 62, z: 52, r: 4.5, sy: 0.55, ry: 1.2, tint: 0x6f6780 },
    { x: 44, z: 64, r: 5.5, sy: 0.48, ry: 5.1, tint: 0x847c92 },
    { x: 70, z: 24, r: 4.0, sy: 0.5,  ry: 2.9, tint: 0x767088 },
    { x: 32, z: 66, r: 3.5, sy: 0.42, ry: 0.9, tint: 0x8a8296 },
    { x: 12, z: 42, r: 3.0, sy: 0.5,  ry: 3.6, tint: 0x7a7288 },
  ];
  const geoD = joltedRock(new THREE.DodecahedronGeometry(1, 0), 0.13);
  const geoI = joltedRock(new THREE.IcosahedronGeometry(1, 1), 0.2);
  const rocksA = new THREE.InstancedMesh(geoD, ctx.mats.rock, 4);
  const rocksB = new THREE.InstancedMesh(geoI, ctx.mats.rock, 4);
  SEA_ROCKS.forEach((rk, i) => {
    const sx = 0.85 + rnd() * 0.5, sz = 0.85 + rnd() * 0.5;
    _d.position.set(rk.x, rk.r * rk.sy * 0.22, rk.z);  // 底部沉入海面
    _d.rotation.set(0, rk.ry, 0);
    _d.scale.set(rk.r * sx, rk.r * rk.sy, rk.r * sz);  // 压扁 + 拉伸变形
    _d.updateMatrix();
    const im = i % 2 ? rocksB : rocksA;
    im.setMatrixAt(i >> 1, _d.matrix);
    im.setColorAt(i >> 1, _c.set(rk.tint));            // 深紫灰浓淡(ref1 暗色岩)
    foamBase.push({ x: rk.x, z: rk.z, s: rk.r * (1.04 + rnd() * 0.16), ph: rnd() * 6.28 });
  });
  rocksA.instanceMatrix.needsUpdate = rocksB.instanceMatrix.needsUpdate = true;
  if (rocksA.instanceColor) rocksA.instanceColor.needsUpdate = true;
  if (rocksB.instanceColor) rocksB.instanceColor.needsUpdate = true;
  group.add(rocksA, rocksB);

  /* ---------- 主岩顶部:小松 ×2 + 小亭剪影 ---------- */
  const topY = SEA_ROCKS[0].r * SEA_ROCKS[0].sy * 1.12;   // ≈ 岩顶高度(含抖动余量)
  group.add(new THREE.Mesh(mergeParts([
    ...pineParts(38.4, 47.6, topY - 0.15, 1.5),
    ...pineParts(41.9, 48.0, topY - 0.1, 1.15),
  ]), vcMat));
  const PX = 40.3, PZ = 44.9, PY = topY - 0.05;
  group.add(new THREE.Mesh(mergeParts([                   // 台基+四柱+攒尖顶,剪影
    { g: new THREE.BoxGeometry(2.3, 0.28, 1.8), x: PX, y: PY + 0.14, z: PZ },
    { g: new THREE.BoxGeometry(0.12, 0.8, 0.12), x: PX - 0.85, y: PY + 0.66, z: PZ - 0.6 },
    { g: new THREE.BoxGeometry(0.12, 0.8, 0.12), x: PX + 0.85, y: PY + 0.66, z: PZ - 0.6 },
    { g: new THREE.BoxGeometry(0.12, 0.8, 0.12), x: PX - 0.85, y: PY + 0.66, z: PZ + 0.6 },
    { g: new THREE.BoxGeometry(0.12, 0.8, 0.12), x: PX + 0.85, y: PY + 0.66, z: PZ + 0.6 },
    { g: new THREE.ConeGeometry(1.75, 0.95, 4), x: PX, y: PY + 1.5, z: PZ, ry: Math.PI / 4 },
  ]), ctx.mats.dark));

  /* ---------- 浪花环:岩脚半透明白环(update 里呼吸脉冲) ---------- */
  const foamGeo = new THREE.RingGeometry(1.1, 1.5, 26);
  foamGeo.rotateX(-Math.PI / 2);
  const foamIM = new THREE.InstancedMesh(foamGeo,
    new THREE.MeshStandardMaterial({ color: 0xeef8ff, roughness: 1, transparent: true, opacity: 0.5, depthWrite: false }),
    foamBase.length);
  foamBase.forEach((f, i) => {
    _d.position.set(f.x, 0.22, f.z);
    _d.rotation.set(0, 0, 0);
    _d.scale.set(f.s, 1, f.s);
    _d.updateMatrix();
    foamIM.setMatrixAt(i, _d.matrix);
  });
  foamIM.renderOrder = 2;
  group.add(foamIM);

  /* ---------- ② 岸边踏石:滩上一串 14 块圆扁石 ---------- */
  const stepGeo = new THREE.CylinderGeometry(1, 1.18, 0.5, 9);
  const stepIM = new THREE.InstancedMesh(stepGeo, ctx.mats.stone, 14);
  const stepTints = [0xffffff, 0xd8d2e2, 0xb2aac0, 0x9088a0];   // stone ↔ stoneD 浓淡
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const x = (1 - t) * (1 - t) * 28 + 2 * (1 - t) * t * 36 + t * t * 44 + (rnd() - 0.5) * 1.6;
    const z = (1 - t) * (1 - t) * 4 + 2 * (1 - t) * t * 15 + t * t * 30 + (rnd() - 0.5) * 1.6;
    const s = 0.85 + rnd() * 0.55;
    _d.position.set(x, ctx.heightAt(x, z) - 0.08, z);
    _d.rotation.set(0, rnd() * Math.PI, 0);
    _d.scale.set(s, 0.55, s * (0.8 + rnd() * 0.3));             // 圆扁石
    _d.updateMatrix();
    stepIM.setMatrixAt(i, _d.matrix);
    stepIM.setColorAt(i, _c.set(stepTints[(rnd() * 4) | 0]));
    shadows.push({ x, z, sx: s * 1.5, sz: s * 1.35, y: 0.05 });
  }
  stepIM.instanceMatrix.needsUpdate = true;
  if (stepIM.instanceColor) stepIM.instanceColor.needsUpdate = true;
  group.add(stepIM);

  /* ---------- ③ 杂件:木牌(两根柱 + 一块斜板) ---------- */
  const sgx = 32.5, sgz = 1.5, sgy = ctx.heightAt(sgx, sgz), sry = 0.6;
  group.add(new THREE.Mesh(mergeParts([
    { g: new THREE.BoxGeometry(0.16, 1.7, 0.16), x: sgx + Math.cos(sry) * 0.55, y: sgy + 0.7, z: sgz - Math.sin(sry) * 0.55, c: 0xa87850 },
    { g: new THREE.BoxGeometry(0.16, 1.7, 0.16), x: sgx - Math.cos(sry) * 0.55, y: sgy + 0.7, z: sgz + Math.sin(sry) * 0.55, c: 0xa87850 },
    { g: new THREE.BoxGeometry(1.6, 0.72, 0.1), x: sgx, y: sgy + 1.18, z: sgz, rx: -0.12, ry: sry, c: 0xd8a878 },
  ]), vcMat));
  shadows.push({ x: sgx, z: sgz, sx: 1.5, sz: 1.1, ry: sry });

  /* ---------- 矮篱笆一段(4 柱 + 2 横杆,woodD) ---------- */
  const fx = 35.5, fz = 7.5, fa = 0.5, fl = 5.4, fparts = [];
  for (let i = 0; i < 4; i++) {
    const px = fx + Math.cos(fa) * (i * fl / 3), pz = fz + Math.sin(fa) * (i * fl / 3);
    fparts.push({ g: new THREE.CylinderGeometry(0.09, 0.12, 1.2, 6), x: px, y: ctx.heightAt(px, pz) + 0.5, z: pz });
  }
  const fmx = fx + Math.cos(fa) * fl / 2, fmz = fz + Math.sin(fa) * fl / 2, fmy = ctx.heightAt(fmx, fmz);
  fparts.push(
    { g: new THREE.BoxGeometry(fl + 0.3, 0.09, 0.07), x: fmx, y: fmy + 0.62, z: fmz, ry: -fa },
    { g: new THREE.BoxGeometry(fl + 0.3, 0.09, 0.07), x: fmx, y: fmy + 0.98, z: fmz, ry: -fa });
  group.add(new THREE.Mesh(mergeParts(fparts), ctx.mats.woodD));
  shadows.push({ x: fmx, z: fmz, sx: 3.1, sz: 1.5, ry: -fa });

  /* ---------- 石灯笼座 ×2(stoneD:座+柱+灯室+顶) ---------- */
  const lparts = [];
  for (const [lx, lz] of [[30, 6.5], [42.5, 28.5]]) {
    const ly = ctx.heightAt(lx, lz);
    lparts.push(
      { g: new THREE.CylinderGeometry(0.5, 0.62, 0.3, 7), x: lx, y: ly + 0.12, z: lz },
      { g: new THREE.CylinderGeometry(0.13, 0.17, 0.75, 6), x: lx, y: ly + 0.62, z: lz },
      { g: new THREE.BoxGeometry(0.42, 0.4, 0.42), x: lx, y: ly + 1.18, z: lz },
      { g: new THREE.ConeGeometry(0.46, 0.34, 6), x: lx, y: ly + 1.53, z: lz });
    shadows.push({ x: lx, z: lz, sx: 0.95, sz: 0.85 });
  }
  group.add(new THREE.Mesh(mergeParts(lparts), ctx.mats.stoneD));

  /* ---------- 假阴影:半透明深色圆片(海里的岩石不用) ---------- */
  const shGeo = new THREE.CircleGeometry(1, 18);
  shGeo.rotateX(-Math.PI / 2);
  const shIM = new THREE.InstancedMesh(shGeo,
    new THREE.MeshBasicMaterial({ color: 0x272033, transparent: true, opacity: 0.3, depthWrite: false }),
    shadows.length);
  shadows.forEach((s, i) => {
    _d.position.set(s.x, ctx.heightAt(s.x, s.z) + (s.y || 0.12), s.z);
    _d.rotation.set(0, s.ry || 0, 0);
    _d.scale.set(s.sx, 1, s.sz);
    _d.updateMatrix();
    shIM.setMatrixAt(i, _d.matrix);
  });
  shIM.renderOrder = 1;
  group.add(shIM);

  /* ---------- 低画质:隐藏浪花环 ---------- */
  ctx.onQuality.push(q => { foamIM.visible = q !== "low"; });

  /* ---------- 每帧:浪花环呼吸脉冲(零分配,复用 _d) ---------- */
  function update(t) {
    for (let i = 0; i < foamBase.length; i++) {
      const f = foamBase[i];
      const s = f.s * (1 + 0.05 * Math.sin(t * 1.3 + f.ph));
      _d.position.set(f.x, 0.22, f.z);
      _d.rotation.set(0, 0, 0);
      _d.scale.set(s, 1, s);
      _d.updateMatrix();
      foamIM.setMatrixAt(i, _d.matrix);
    }
    foamIM.instanceMatrix.needsUpdate = true;
  }

  return { group, update };
}
