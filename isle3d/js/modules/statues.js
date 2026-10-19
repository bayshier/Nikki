/* ============================================================
   猫岛胜景 · 雕像道石猫(statues.js)
   6 尊几何化坐姿石猫:沿 (-52,14) 向 -z 每 7 一尊,左右夹道、
   面朝道心;石材质 + 顶背苔藓绿 + 极简刻痕脸;道口立猫纹石碑。
   苔感 / 排列 / 古旧感对齐 refs/ref5.png 与 ref1.png。
   全场仅 5 个 mesh:底座 InstancedMesh + 石身 / 苔 / 刻痕 /
   假阴影各 1 个合并网格,静态无 update。
   ============================================================ */
export function build(ctx) {
  const { THREE, mats, heightAt } = ctx;
  const group = new THREE.Group();

  /* ---------- 小工具:矩阵组合 / 几何合并(不依赖 addons) ---------- */
  const V3 = THREE.Vector3;
  function mat4(px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    return new THREE.Matrix4().compose(
      new V3(px, py, pz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new V3(sx, sy, sz));
  }
  function put(arr, geo, m) { if (m) geo.applyMatrix4(m); arr.push(geo); return geo; }
  function mergeGeos(list) {                       // 拼接 position/normal/uv
    const pos = [], nor = [], uv = [];
    for (const src of list) {
      const g = src.toNonIndexed();
      const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv.array;
      for (let i = 0; i < p.length; i++) pos.push(p[i]);
      for (let i = 0; i < n.length; i++) nor.push(n[i]);
      for (let i = 0; i < u.length; i++) uv.push(u[i]);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    return out;
  }

  /* ---------- 一尊石猫(局部:脚底为原点、面向 +z,总高约 1.82) ----------
     收腰圆柱坐身 + 臀球 + 头球 + 四棱锥双耳 + 盘尾;
     脸为极简刻痕:两个深色凹点眼 + 鼻;头顶/背覆苔藓绿。 */
  function buildCat(cfg, stone, moss, dark) {
    const { s, tilt, pitch, paw, chip, x, y, z, yaw } = cfg;
    const W = mat4(x, y, z, 0, yaw, 0, s);                        // 落位 + 整体缩放
    const HW = new THREE.Matrix4().multiplyMatrices(              // 头部:先歪头/抬头再落位
      W, mat4(0, 1.40, 0.13, -pitch, 0, tilt));
    // 坐身:收腰圆柱(截面压扁)+ 左右臀球
    put(stone, new THREE.CylinderGeometry(0.36, 0.58, 1.06, 7), mat4(0, 0.55, 0, 0, 0, 0, 1, 1, 0.84).premultiply(W));
    put(stone, new THREE.SphereGeometry(0.30, 8, 6), mat4(-0.33, 0.34, -0.20, 0, 0, 0, 1, 0.92, 0.9).premultiply(W));
    put(stone, new THREE.SphereGeometry(0.30, 8, 6), mat4(0.33, 0.34, -0.20, 0, 0, 0, 1, 0.92, 0.9).premultiply(W));
    // 前爪:平搭在前,或一爪缩抬胸前
    put(stone, new THREE.BoxGeometry(0.18, 0.13, 0.34), mat4(-0.19, 0.075, 0.44).premultiply(W));
    if (paw) put(stone, new THREE.BoxGeometry(0.17, 0.13, 0.34), mat4(0.16, 0.50, 0.33, -0.95, 0, 0.15).premultiply(W));
    else put(stone, new THREE.BoxGeometry(0.18, 0.13, 0.34), mat4(0.19, 0.075, 0.44).premultiply(W));
    // 尾:贴背盘半圈
    put(stone, new THREE.TorusGeometry(0.36, 0.075, 5, 9, 2.5), mat4(0, 0.10, -0.20, Math.PI / 2, 0, 2.9).premultiply(W));
    // 头球 + 双耳(缺耳老猫 chip)
    put(stone, new THREE.SphereGeometry(0.34, 10, 8), mat4(0, 0, 0, 0, 0, 0, 1, 0.94, 0.96).premultiply(HW));
    put(stone, new THREE.ConeGeometry(0.115, 0.23, 4), mat4(-0.155, 0.30, -0.02, 0, Math.PI / 4, 0.16).premultiply(HW));
    if (chip) put(stone, new THREE.ConeGeometry(0.10, 0.14, 4), mat4(0.16, 0.27, -0.02, 0, Math.PI / 4, -0.22).premultiply(HW));
    else put(stone, new THREE.ConeGeometry(0.115, 0.23, 4), mat4(0.155, 0.30, -0.02, 0, Math.PI / 4, -0.16).premultiply(HW));
    // 刻痕脸:凹点眼 + 鼻(深色小盒嵌进头球面)
    put(dark, new THREE.BoxGeometry(0.065, 0.085, 0.055), mat4(-0.125, 0.03, 0.30).premultiply(HW));
    put(dark, new THREE.BoxGeometry(0.065, 0.085, 0.055), mat4(0.125, 0.03, 0.30).premultiply(HW));
    put(dark, new THREE.BoxGeometry(0.075, 0.05, 0.05), mat4(0, -0.095, 0.315).premultiply(HW));
    // 苔藓绿:头顶帽 + 背脊一片(古旧感)
    put(moss, new THREE.SphereGeometry(0.29, 7, 5), mat4(0, 0.25, -0.03, 0, 0, 0, 1.02, 0.42, 1.0).premultiply(HW));
    put(moss, new THREE.SphereGeometry(0.30, 7, 5), mat4(0.02, 1.00, -0.22, 0, 0, 0, 0.9, 0.4, 0.8).premultiply(W));
  }

  /* ---------- 道口石碑:圆顶猫耳碑,碑面刻极简猫脸 ---------- */
  function buildStele(x, z, yaw, stone, moss, dark, shadow) {
    const W = mat4(x, heightAt(x, z) - 0.08, z, 0, yaw, 0);
    put(stone, new THREE.BoxGeometry(1.35, 0.36, 0.66), mat4(0, 0.18, 0).premultiply(W));           // 台座
    put(stone, new THREE.BoxGeometry(0.95, 1.78, 0.26), mat4(0, 1.25, 0).premultiply(W));           // 碑身
    put(stone, new THREE.CylinderGeometry(0.475, 0.475, 0.26, 9), mat4(0, 2.14, 0, 0, 0, Math.PI / 2).premultiply(W)); // 圆顶
    put(stone, new THREE.ConeGeometry(0.17, 0.34, 4), mat4(-0.30, 2.42, 0, 0, Math.PI / 4, 0.12).premultiply(W));       // 双耳
    put(stone, new THREE.ConeGeometry(0.17, 0.34, 4), mat4(0.30, 2.42, 0, 0, Math.PI / 4, -0.12).premultiply(W));
    put(dark, new THREE.BoxGeometry(0.07, 0.10, 0.05), mat4(-0.19, 1.62, 0.135).premultiply(W));    // 碑面猫脸刻痕
    put(dark, new THREE.BoxGeometry(0.07, 0.10, 0.05), mat4(0.19, 1.62, 0.135).premultiply(W));
    put(dark, new THREE.BoxGeometry(0.08, 0.055, 0.05), mat4(0, 1.42, 0.135).premultiply(W));
    put(dark, new THREE.BoxGeometry(0.17, 0.022, 0.035), mat4(-0.26, 1.30, 0.13, 0, 0, -0.14).premultiply(W)); // 须线
    put(dark, new THREE.BoxGeometry(0.17, 0.022, 0.035), mat4(0.26, 1.30, 0.13, 0, 0, 0.14).premultiply(W));
    put(moss, new THREE.SphereGeometry(0.30, 7, 5), mat4(0.02, 2.34, 0.02, 0, 0, 0, 0.55, 0.18, 0.42).premultiply(W)); // 顶苔
    put(shadow, new THREE.CircleGeometry(1.15, 16), mat4(x - 0.15, heightAt(x - 0.15, z + 0.25) + 0.06, z + 0.25, -Math.PI / 2, 0, 0, 1.15, 0.85, 1));
  }

  /* ---------- 布阵:沿道每 7 一尊,左右夹道、斜面朝道心(偏迎客向) ---------- */
  const CX = -52;                                   // 道心线
  const stoneG = [], mossG = [], darkG = [], shadowG = [];
  const CFG = [                                     // s=目标高/1.82;姿态微差
    { h: 2.20, tilt: 0.14, pitch: 0.00, paw: 0 },          // 镇口大猫,正视
    { h: 1.90, tilt: -0.20, pitch: 0.18, paw: 0 },         // 歪头望远
    { h: 1.70, tilt: 0.00, pitch: 0.05, paw: 1 },          // 缩爪
    { h: 2.05, tilt: -0.12, pitch: -0.08, paw: 1, chip: 1 }, // 缺耳老猫,低头
    { h: 1.60, tilt: 0.22, pitch: 0.00, paw: 0 },          // 小猫歪头
    { h: 1.85, tilt: 0.00, pitch: 0.22, paw: 0 },          // 仰望远山
  ];
  const pedGeo = mergeGeos([                        // 底座石台:stoneD 两层方台
    put([], new THREE.BoxGeometry(2.1, 0.5, 2.1), mat4(0, 0.25, 0)),
    put([], new THREE.BoxGeometry(1.62, 0.44, 1.62), mat4(0, 0.72, 0)),
  ]);
  const peds = new THREE.InstancedMesh(pedGeo, mats.stoneD, 6);
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
  for (let i = 0; i < 6; i++) {
    const z = 14 - 7 * i;                           // (-52,14) → z≈-21,每 7 一尊
    const west = i % 2 === 0;
    const x = west ? CX - 2.3 : CX + 2.3;
    const yaw = (west ? 1 : -1) * (Math.PI / 2 - 0.28) + ((i * 37) % 7 - 3) * 0.02;
    const sc = 1 + ((i * 53) % 5 - 2) * 0.02;       // 底座微差
    const y0 = heightAt(x, z) - 0.12;               // 台体沉入坡面,防悬空
    peds.setMatrixAt(i, tmpM.compose(
      new V3(x, y0, z), tmpQ.setFromEuler(tmpE.set(0, (west ? 1 : -1) * 0.06, 0)), new V3(sc, sc, sc)));
    buildCat({ ...CFG[i], s: CFG[i].h / 1.82, x, y: y0 + 0.94 * sc, z, yaw }, stoneG, mossG, darkG);
    // 脚下假阴影:半透明深色圆片,偏向西南(与东北日光相对)
    put(shadowG, new THREE.CircleGeometry(1.55, 18),
      mat4(x - 0.22, heightAt(x - 0.22, z + 0.3) + 0.06, z + 0.3, -Math.PI / 2, 0, 0, 1.25, 0.9, 1));
  }
  peds.instanceMatrix.needsUpdate = true;

  /* ---------- 石碑立于道口(雕像道起点旁,面向东南来客) ---------- */
  buildStele(-49.2, 16.6, 0.5, stoneG, mossG, darkG, shadowG);

  /* ---------- 汇总:4 材质 + 底座实例,共 5 个 mesh ---------- */
  const stoneMesh = new THREE.Mesh(mergeGeos(stoneG), mats.stone);           // 石白 #cfc9dc
  const mossMesh = new THREE.Mesh(mergeGeos(mossG),
    new THREE.MeshStandardMaterial({ color: 0x7aa86b, roughness: 1 }));      // 苔藓绿
  const darkMesh = new THREE.Mesh(mergeGeos(darkG), mats.dark);              // 刻痕深色
  const shadowMesh = new THREE.Mesh(mergeGeos(shadowG),
    new THREE.MeshBasicMaterial({ color: 0x302a44, transparent: true, opacity: 0.3, depthWrite: false }));
  group.add(peds, stoneMesh, mossMesh, darkMesh, shadowMesh);
  return { group };
}
