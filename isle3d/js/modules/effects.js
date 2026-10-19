/* ============================================================
   猫岛胜景 · 特效层(modules/effects.js)
   树隙光带 god rays / 低空晨雾 / 飘落樱花瓣
   对齐参考图 refs/ref7.png(光斑·晨雾·飘瓣)与 ref1.png(雾卧崖脚)
   预算:4 光带 + 6 雾片 + 1 花瓣 InstancedMesh = 11 draw call
   ============================================================ */

/* ---------- 入口 ---------- */
export function build(ctx) {
  const { THREE, heightAt } = ctx;

  /* ---------- 模块级临时对象(update 内零分配) ---------- */
  const _pos = new THREE.Vector3();
  const _scl = new THREE.Vector3();
  const _eul = new THREE.Euler();
  const _qua = new THREE.Quaternion();
  const _mat = new THREE.Matrix4();
  const _u = new THREE.Vector3();
  const _nrm = new THREE.Vector3();
  const _toCam = new THREE.Vector3();
  const _cP = new THREE.Vector3();
  const _e1 = new THREE.Vector3();
  const _e2 = new THREE.Vector3();
  const _qa = new THREE.Quaternion();
  const _qr = new THREE.Quaternion();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const group = new THREE.Group();
  group.name = "effects";

  /* ---------- 程序纹理:光带(上亮下透 + 左右淡出) ---------- */
  function makeRayTexture() {
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 256;
    const g = cv.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0.00, "rgba(255,244,218,0.95)");   // 顶端最亮
    gr.addColorStop(0.35, "rgba(255,236,200,0.55)");
    gr.addColorStop(0.75, "rgba(255,228,190,0.16)");
    gr.addColorStop(1.00, "rgba(255,224,180,0)");      // 底部全透
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    const gr2 = g.createLinearGradient(0, 0, 64, 0);   // 左右软边
    gr2.addColorStop(0, "rgba(0,0,0,0)");
    gr2.addColorStop(0.5, "rgba(0,0,0,1)");
    gr2.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-in";
    g.fillStyle = gr2; g.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ---------- 程序纹理:雾片(径向白渐变) ---------- */
  function makeFogTexture() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 63);
    rg.addColorStop(0.0, "rgba(255,252,250,0.9)");
    rg.addColorStop(0.55, "rgba(255,250,248,0.38)");
    rg.addColorStop(1.0, "rgba(255,250,248,0)");
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ---------- ① 树隙光带 ×4:东北高空斜插草台 ---------- */
  // 太阳方位取 atmosphere 的 (120,90,-60),东偏北
  const SUN = new THREE.Vector3(120, 90, -60).normalize();
  // 锚点:草台上光带落地处 [x, z, 宽缩放, 基础透明度]
  const RAY_CFG = [
    [3, -1, 0.80, 0.20],
    [-5, -5, 1.05, 0.15],
    [6, 7, 0.90, 0.22],
    [-13, 3, 1.20, 0.17],
  ];
  const rayTex = makeRayTexture();
  const rayGeo = new THREE.PlaneGeometry(4, 46);          // 共用一块细长几何
  const rayGroup = new THREE.Group();
  const rays = [];
  // 面片滚转角:让薄面朝向东南默认相机,build 时算一次
  _toCam.set(46, 14, 92).normalize();
  for (let i = 0; i < RAY_CFG.length; i++) {
    const cfg = RAY_CFG[i];
    _u.copy(SUN).applyAxisAngle(Y_AXIS, (i - 1.5) * 0.05); // 微扇形散开
    _qa.setFromUnitVectors(Y_AXIS, _u);                    // 长轴对齐太阳方向
    _nrm.set(0, 0, 1).applyQuaternion(_qa);
    _cP.copy(_toCam).addScaledVector(_u, -_toCam.dot(_u)).normalize();
    _e1.copy(_nrm).normalize();
    _e2.crossVectors(_u, _e1);
    _qr.setFromAxisAngle(Y_AXIS, Math.atan2(_cP.dot(_e2), _cP.dot(_e1)));
    const mat = new THREE.MeshBasicMaterial({
      map: rayTex, color: 0xfff0d0,
      transparent: true, opacity: cfg[3],
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, fog: false,
    });
    const mesh = new THREE.Mesh(rayGeo, mat);
    mesh.quaternion.copy(_qa).multiply(_qr);
    // 中心 = 落地锚点(用 heightAt 取地面)+ 半长向量
    mesh.position.set(
      cfg[0] + _u.x * 23,
      heightAt(cfg[0], cfg[1]) + _u.y * 23,
      cfg[1] + _u.z * 23);
    mesh.scale.set(cfg[2], 1, 1);
    mesh.renderOrder = 5;
    rayGroup.add(mesh);
    rays.push({ mat, baseO: cfg[3], sp: 0.35 + i * 0.09, ph: i * 1.9 });
  }
  group.add(rayGroup);

  /* ---------- ② 低空晨雾 ×6:横卧水面与崖脚 ---------- */
  const fogTex = makeFogTexture();
  // [x, z, 基础y, y上限, 宽, 高, 基础opacity, 漂移幅, 相位, 速度]
  const FOG_CFG = [
    [22, -8, 4.5, 9.0, 34, 12, 0.16, 3.0, 0.0, 0.12],   // 崖脚北段
    [27, 8, 4.5, 9.0, 40, 14, 0.18, 3.6, 2.1, 0.10],    // 崖脚中段
    [8, 27, 2.0, 3.6, 26, 9, 0.20, 2.2, 4.2, 0.15],     // 瀑布落水白沫
    [34, 26, 2.5, 6.0, 36, 12, 0.14, 4.0, 1.2, 0.09],   // 东南海面
    [-6, 40, 2.4, 5.0, 44, 13, 0.15, 4.4, 3.3, 0.08],   // 南面海面
    [40, -18, 2.5, 6.0, 32, 11, 0.13, 3.4, 5.0, 0.11],  // 东侧海面
  ];
  const fogs = [];
  for (let i = 0; i < FOG_CFG.length; i++) {
    const c = FOG_CFG[i];
    const mat = new THREE.SpriteMaterial({
      map: fogTex, transparent: true, opacity: c[6], depthWrite: false,
    });
    const spr = new THREE.Sprite(mat);
    // 贴地不穿地:heightAt 取地面,再被 capY 压住(瀑布槽处解析式不含切口)
    const y = Math.max(c[2], Math.min(heightAt(c[0], c[1]) + 1.4, c[3]));
    spr.position.set(c[0], y, c[1]);
    spr.scale.set(c[4], c[5], 1);
    spr.renderOrder = 6;
    group.add(spr);
    fogs.push({ spr, mat, x: c[0], y, z: c[1], dx: c[7], dz: c[7] * 0.7, ph: c[8], sp: c[9], baseO: c[6] });
  }

  /* ---------- ③ 樱花瓣 ×48:樱树区上空飘落循环 ---------- */
  const N_PETAL = 48;
  // 樱树撒瓣区(对齐契约:樱树在崖缘与主亭旁)[cx, cz, 半径]
  const PET_ZONES = [[2, -2, 9], [-33, -5, 8], [-14, 6, 7]];
  const petBX = new Float32Array(N_PETAL), petBZ = new Float32Array(N_PETAL);
  const petY = new Float32Array(N_PETAL), petTop = new Float32Array(N_PETAL);
  const petSp = new Float32Array(N_PETAL), petSc = new Float32Array(N_PETAL);
  const petAmp = new Float32Array(N_PETAL), petSw = new Float32Array(N_PETAL);
  const petRt = new Float32Array(N_PETAL), petPh = new Float32Array(N_PETAL);
  for (let i = 0; i < N_PETAL; i++) {
    const zn = PET_ZONES[i % PET_ZONES.length];
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * zn[2];
    const bx = zn[0] + Math.cos(ang) * rad;
    const bz = zn[1] + Math.sin(ang) * rad;
    const gh = heightAt(bx, bz);
    petBX[i] = bx; petBZ[i] = bz;
    petTop[i] = gh + 8 + Math.random() * 5;
    petY[i] = gh + Math.random() * 12;                    // 初始满场铺开
    petSp[i] = 0.55 + Math.random() * 0.6;                // 下落速度
    petAmp[i] = 0.7 + Math.random() * 1.5;                // 左右摆幅
    petSw[i] = 0.5 + Math.random() * 0.8;                 // 摆动频率
    petRt[i] = 1.2 + Math.random() * 2.2;                 // 翻滚速度
    petSc[i] = 0.75 + Math.random() * 0.6;
    petPh[i] = Math.random() * Math.PI * 2;
  }
  const petGeo = new THREE.PlaneGeometry(0.28, 0.22);     // 小双面片
  const petMat = new THREE.MeshBasicMaterial({ color: 0xffc4dd, side: THREE.DoubleSide });
  const petals = new THREE.InstancedMesh(petGeo, petMat, N_PETAL);
  petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  petals.frustumCulled = false;
  group.add(petals);

  /* ---------- 画质开关:low 全隐 ---------- */
  function setQuality(q) { group.visible = q !== "low"; }
  if (typeof ctx.onQuality === "function") ctx.onQuality(setQuality);
  else if (ctx.onQuality && typeof ctx.onQuality.push === "function") ctx.onQuality.push(setQuality);
  setQuality((ctx.G && ctx.G.quality) || "high");

  /* ---------- 每帧更新:摆动 / 呼吸 / 漂移 / 飘落 ---------- */
  function update(t, dt) {
    if (!group.visible) return;

    // 光带:整体缓慢摆动 + 逐条透明度呼吸
    rayGroup.rotation.y = Math.sin(t * 0.1) * 0.055;
    for (let i = 0; i < rays.length; i++) {
      const r = rays[i];
      r.mat.opacity = r.baseO * (0.72 + 0.28 * Math.sin(t * r.sp + r.ph));
    }

    // 雾片:缓慢漂移 + 呼吸
    for (let i = 0; i < fogs.length; i++) {
      const f = fogs[i];
      f.spr.position.set(
        f.x + Math.sin(t * f.sp + f.ph) * f.dx,
        f.y + Math.sin(t * f.sp * 1.7 + f.ph * 2.0) * 0.6,
        f.z + Math.cos(t * f.sp * 0.8 + f.ph) * f.dz);
      f.mat.opacity = f.baseO * (0.82 + 0.18 * Math.sin(t * f.sp * 1.3 + f.ph * 3.0));
    }

    // 花瓣:下落 + 左右摇摆 + 翻滚,落地回顶循环(临时对象全部复用)
    for (let i = 0; i < N_PETAL; i++) {
      const ph = petPh[i];
      petY[i] -= petSp[i] * dt;
      const px = petBX[i] + Math.sin(t * petSw[i] + ph) * petAmp[i];
      const pz = petBZ[i] + Math.cos(t * petSw[i] * 0.83 + ph * 1.7) * petAmp[i] * 0.6;
      if (petY[i] < heightAt(px, pz) + 0.35) petY[i] = petTop[i];
      _pos.set(px, petY[i], pz);
      _eul.set(t * petRt[i] + ph, t * petRt[i] * 0.7 + ph * 2.1, t * petRt[i] * 1.3 - ph);
      _qua.setFromEuler(_eul);
      _scl.setScalar(petSc[i]);
      _mat.compose(_pos, _qua, _scl);
      petals.setMatrixAt(i, _mat);
    }
    petals.instanceMatrix.needsUpdate = true;
  }

  return { group, update };
}
