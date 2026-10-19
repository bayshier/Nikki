/* ============================================================
   猫岛胜景 · 湖水(water.js)
   环岛海面:青绿大平面 + 3 层错速程序波光 + 近岸呼吸泡沫 ×2
   对齐参考:refs/ref1.png(白波光卷线/崖脚泡沫)、refs/ref3.png(水面青绿/倒影柔光)
   契约:isle3d/CONTRACT.md —— build(ctx) → { group, update(t, dt) }
   ============================================================ */

/* ---------- 程序波光纹理:白波浪线 + 短弧光,256² 可无缝平铺 ---------- */
function sparkleTexture(THREE, seed) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const g = cv.getContext("2d");
  let s = (seed % 2147483646) + 1;                       // 固定种子,效果可复现
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

  /* 长波浪线 ×8:横向取整周期保无缝,纵向留边 30px 防接缝 */
  for (let i = 0; i < 8; i++) {
    const y0 = 34 + rnd() * 188;
    const k = 1 + Math.floor(rnd() * 3);                 // 256 宽内的整波数
    const ph = rnd() * Math.PI * 2;
    const amp = 5 + rnd() * 9;
    g.beginPath();
    for (let x = -16; x <= 272; x += 8) {
      const y = y0 + Math.sin((x / 256) * Math.PI * 2 * k + ph) * amp;
      if (x === -16) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokeStyle = "rgba(255,255,255," + (0.35 + rnd() * 0.5).toFixed(2) + ")";
    g.lineWidth = 1.2 + rnd() * 1.8;
    g.stroke();
  }
  /* 短弧光斑 ×14:卷曲小浪头(全部留在安全边内,不切缝) */
  for (let i = 0; i < 14; i++) {
    const x = 26 + rnd() * 204, y = 26 + rnd() * 204;
    const a0 = rnd() * Math.PI * 2;
    g.beginPath();
    g.arc(x, y, 3 + rnd() * 8, a0, a0 + 1.1 + rnd() * 1.6);
    g.strokeStyle = "rgba(255,255,255," + (0.3 + rnd() * 0.45).toFixed(2) + ")";
    g.lineWidth = 1 + rnd() * 1.6;
    g.stroke();
  }
  /* 宽淡光带 ×3:日光倒影的柔光底(ref3 水面亮带) */
  for (let i = 0; i < 3; i++) {
    const y0 = 44 + rnd() * 168, ph = rnd() * Math.PI * 2;
    g.beginPath();
    for (let x = -16; x <= 272; x += 16) {
      const y = y0 + Math.sin((x / 256) * Math.PI * 4 + ph) * 13;
      if (x === -16) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokeStyle = "rgba(255,255,255,0.10)";
    g.lineWidth = 6 + rnd() * 5;
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- 泡沫环几何:RingGeometry 径向正弦扰动 → 有机椭圆白带 ---------- */
function foamGeometry(THREE, rIn, rOut, wob) {
  const geo = new THREE.RingGeometry(rIn, rOut, 96, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {                  // 径向抖动,去掉死圆感
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.hypot(x, y), th = Math.atan2(y, x);
    const w = 1 + 0.05 * Math.sin(th * 3 + wob) + 0.028 * Math.sin(th * 7 + wob * 2.7);
    pos.setXY(i, Math.cos(th) * r * w, Math.sin(th) * r * w);
  }
  geo.scale(1.06, 0.88, 1);                              // 椭圆化:x 略长 z 略扁,贴岛轮廓
  geo.rotateX(-Math.PI / 2);                             // 放平,法向朝上
  return geo;
}

/* ============================================================
   build:海面 1 + 波光 3 + 泡沫 2 = 6 mesh(预算 ≤7)
   ============================================================ */
export function build(ctx) {
  const THREE = ctx.THREE;
  const group = new THREE.Group();
  group.name = "water";

  /* ---------- 海面本体:1300² 单面片,海青 #5fc4d8 微透 0.9 ---------- */
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1300, 1300, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0x5fc4d8, transparent: true, opacity: 0.9,
      roughness: 0.25, metalness: 0.1,                   // 低粗糙+微金属 → 天光倒影感(ref3)
    }));
  sea.rotation.x = -Math.PI / 2;
  sea.renderOrder = 0;
  group.add(sea);

  /* ---------- 波光层 ×3:700² 白纹平面,错向错速滚动 ---------- */
  /* 配置:[种子, 平铺数, vx, vz, 透明度, 高度y] */
  const GLINT = [
    [11, 6.5, 0.010, 0.004, 0.17, 0.14],
    [37, 8.0, -0.014, 0.007, 0.13, 0.26],
    [71, 5.0, 0.007, -0.009, 0.10, 0.38],
  ];
  const glintGeo = new THREE.PlaneGeometry(700, 700, 1, 1);
  glintGeo.rotateX(-Math.PI / 2);                        // 三层共用一份几何
  const sparkles = GLINT.map((c, i) => {
    const tex = sparkleTexture(THREE, c[0]);
    tex.repeat.set(c[1], c[1]);
    const mesh = new THREE.Mesh(glintGeo, new THREE.MeshStandardMaterial({
      map: tex, transparent: true, opacity: c[4],
      roughness: 0.7, depthWrite: false,
    }));
    mesh.position.y = c[5];
    mesh.renderOrder = 1 + i;
    group.add(mesh);
    return { mesh, tex, vx: c[2], vz: c[3] };
  });

  /* ---------- 近岸泡沫 ×2:贴崖脚与滩的白带(中径 ~62 / ~78) ---------- */
  const foamMat = (op) => new THREE.MeshStandardMaterial({
    color: 0xfff8ee, transparent: true, opacity: op,
    roughness: 0.8, depthWrite: false, side: THREE.DoubleSide,
  });
  const foamIn = new THREE.Mesh(foamGeometry(THREE, 59, 66, 0.7), foamMat(0.5));
  const foamOut = new THREE.Mesh(foamGeometry(THREE, 74, 82, 2.9), foamMat(0.32));
  foamIn.position.set(-3, 0.06, -2);                     // 对准岛体视觉中心
  foamOut.position.set(-3, 0.1, -2);
  foamIn.renderOrder = 5;
  foamOut.renderOrder = 6;
  group.add(foamIn, foamOut);

  /* ---------- 画质联动:低配隐波光层(泡沫极便宜,保留) ---------- */
  (ctx.onQuality || []).push(q => {
    const show = q !== "low";
    for (let i = 0; i < sparkles.length; i++) sparkles[i].mesh.visible = show;
  });

  /* ---------- 每帧:波光错速滚动 + 泡沫呼吸(零对象分配) ---------- */
  function update(t /* , dt */) {
    for (let i = 0; i < sparkles.length; i++) {
      const sp = sparkles[i];
      sp.tex.offset.x = (t * sp.vx) % 1;                 // RepeatWrapping 取模回绕
      sp.tex.offset.y = (t * sp.vz) % 1;
    }
    foamIn.material.opacity = 0.42 + 0.16 * Math.sin(t * 1.15);
    foamOut.material.opacity = 0.26 + 0.12 * Math.sin(t * 0.8 + 1.9);
    foamIn.scale.setScalar(1 + 0.01 * Math.sin(t * 1.15));      // 泡沫微微涨落
    foamOut.scale.setScalar(1 + 0.008 * Math.sin(t * 0.8 + 1.9));
  }

  return { group, update };
}
