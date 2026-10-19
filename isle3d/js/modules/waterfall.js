/* ============================================================
   猫岛胜景 · 瀑布(waterfall.js)
   三层错速水帘 / 崖顶石槽水口 / 落点泡沫·溅雾·涟漪
   审美对齐 refs/ref2.png:白青水幕丝缕层次 + ref1 落点白沫
   ============================================================ */
import * as THREE from "three";

export function build(ctx) {
  const { THREE, mats, LAYOUT } = ctx;
  /* 局部坐标:水口在原点、沿 +z 落水;整合时整体旋转 +90° 对准东侧崖壁(z=14 线) */
  const W = {
    x: 0, zTop: 0, zSea: LAYOUT.WATERFALL.xSea - LAYOUT.WATERFALL.x, w: LAYOUT.WATERFALL.w,
  };
  const lipY = ctx.heightAt(LAYOUT.WATERFALL.x, LAYOUT.WATERFALL.z);   // 崖缘顶实际高度
  const group = new THREE.Group();

  /* 确定性随机(整合后每次刷新瀑布形态一致) */
  let seed = 20260419;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  /* ---------- 程序贴图 1:竖向水纹(横向无缝平铺) ---------- */
  const sc = document.createElement("canvas");
  sc.width = 128; sc.height = 256;
  const sg = sc.getContext("2d");
  sg.fillStyle = "rgba(255,255,255,0.10)";
  sg.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 7; i++) {                     // 宽水带:整幅明暗起伏
    const x = rnd() * 128, w = 14 + rnd() * 22, a = 0.05 + rnd() * 0.09;
    sg.fillStyle = `rgba(235,252,255,${a})`;
    sg.fillRect(x, 0, w, 256);
    if (x + w > 128) sg.fillRect(x - 128, 0, w, 256);
  }
  for (let i = 0; i < 44; i++) {                    // 细水丝:水幕的丝缕感
    const x = rnd() * 128, w = 1.5 + rnd() * 4, a = 0.2 + rnd() * 0.5;
    sg.fillStyle = rnd() < 0.32 ? `rgba(191,239,255,${a})` : `rgba(255,255,255,${a})`;
    sg.fillRect(x, 0, w, 256);
    if (x + w > 128) sg.fillRect(x - 128, 0, w, 256);
  }
  for (let i = 0; i < 10; i++) {                    // 横向断口:水膜撕裂感
    const y = rnd() * 256, h = 3 + rnd() * 8, a = 0.12 + rnd() * 0.12;
    sg.fillStyle = `rgba(150,214,235,${a})`;
    sg.fillRect(0, y, 128, h);
    if (y + h > 256) sg.fillRect(0, y - 256, 128, h);
  }

  /* ---------- 程序贴图 2:溅雾径向渐变 ---------- */
  const mc = document.createElement("canvas");
  mc.width = mc.height = 64;
  const mg = mc.getContext("2d");
  const rg = mg.createRadialGradient(32, 32, 2, 32, 32, 30);
  rg.addColorStop(0, "rgba(255,255,255,0.9)");
  rg.addColorStop(0.45, "rgba(236,250,255,0.42)");
  rg.addColorStop(1, "rgba(224,245,255,0)");
  mg.fillStyle = rg;
  mg.fillRect(0, 0, 64, 64);
  const mistTex = new THREE.CanvasTexture(mc);
  mistTex.colorSpace = THREE.SRGBColorSpace;

  /* 每层水帘独立贴图实例(offset 错速必备,共享同一 canvas) */
  function waterTex(rx, ry) {
    const t = new THREE.CanvasTexture(sc);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ---------- 崖顶石槽水口:让水"有出处" ---------- */
  const chZ = W.zTop - 2.5;                         // 槽体中心(槽口后方)
  const wallGeo = new THREE.BoxGeometry(0.9, 1.7, 5.0);
  const wl = new THREE.Mesh(wallGeo, mats.stone);
  wl.position.set(W.x - W.w / 2 + 0.2, lipY + 0.5, chZ);
  const wr = new THREE.Mesh(wallGeo, mats.stone);
  wr.position.set(W.x + W.w / 2 - 0.2, lipY + 0.5, chZ);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W.w + 0.3, 0.6, 5.0), mats.stoneD);
  floor.position.set(W.x, lipY - 0.45, chZ);        // 槽底下沉,读作凿出的水道
  const lipStone = new THREE.Mesh(new THREE.BoxGeometry(W.w + 0.9, 0.72, 1.4), mats.stone);
  lipStone.position.set(W.x, lipY - 0.16, W.zTop + 0.5); // 溢流口沿石
  group.add(wl, wr, floor, lipStone);

  /* 槽内水面:与水帘顶衔接 */
  const chWater = new THREE.Mesh(
    new THREE.PlaneGeometry(W.w - 0.6, 4.6),
    new THREE.MeshStandardMaterial({ color: 0xbdeef6, transparent: true, opacity: 0.8, roughness: 0.7 }));
  chWater.rotation.x = -Math.PI / 2;
  chWater.position.set(W.x, lipY + 0.02, W.zTop - 2.2);
  chWater.renderOrder = 9;
  group.add(chWater);

  /* ---------- 三层水帘:同一抛物线,宽度/外扩/透明度/流速错开 ---------- */
  const curtainMeshes = [], curTex = [], curSpd = [];
  const CURTAINS = [
    // 后层:贴崖全宽,最透最慢
    { color: 0xbfefff, op: 0.35, w: W.w * 1.02, zOff: 0.0, lipUp: 0.28, repY: 6, spd: 0.8, order: 10 },
    // 中层
    { color: 0xdcf9ff, op: 0.5, w: W.w * 0.9, zOff: 0.6, lipUp: 0.12, repY: 7, spd: 1.25, order: 11 },
    // 前层:外抛最远,最实最快
    { color: 0xeafcff, op: 0.7, w: W.w * 0.78, zOff: 1.25, lipUp: -0.04, repY: 8, spd: 1.7, order: 12 },
  ];
  for (const c of CURTAINS) {
    const geo = new THREE.PlaneGeometry(c.w, 1, 1, 22); // 高 1,顶点沿程弯折成抛物线
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const sy = pos.getY(i) + 0.5;                     // 0=槽口顶 1=海面
      const span = W.zSea - W.zTop + 0.9;               // 底端略越过落点,没入海面
      pos.setX(i, pos.getX(i) * (1 + 0.15 * sy) + 0.2 * Math.sin(sy * 6.3 + c.zOff * 5) * sy);
      pos.setZ(i, W.zTop + span * sy + c.zOff);
      pos.setY(i, (lipY + c.lipUp) * (1 - 1.05 * Math.pow(sy, 2.1))); // 出口平缓·中段坠落
    }
    geo.computeVertexNormals();
    const tex = waterTex(2, c.repY);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: c.color, map: tex, transparent: true, opacity: c.op,
      depthWrite: false, side: THREE.DoubleSide, roughness: 0.85,
      emissive: 0x6fb6c8, emissiveIntensity: 0.25,      // 水幕微自亮,逆光不发黑
    }));
    mesh.renderOrder = c.order;
    group.add(mesh);
    curtainMeshes.push(mesh); curTex.push(tex); curSpd.push(c.spd);
  }

  /* ---------- 落水点:白色泡沫堆(压扁半透明球,微微脉动) ---------- */
  const foamMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.75, roughness: 1, depthWrite: false });
  const foamGeo = new THREE.SphereGeometry(1, 12, 9);
  const foam = [];
  [[-1.7, 0.9, 2.0], [1.6, -0.5, 1.7], [0.2, 1.4, 2.4], [-0.6, -1.5, 1.4]].forEach((f, i) => {
    const m = new THREE.Mesh(foamGeo, foamMat);
    m.position.set(W.x + f[0], f[2] * 0.16, W.zSea + 0.6 + f[1]); // 大半沉在水里
    m.scale.set(f[2], f[2] * 0.42, f[2] * 0.85);
    m.renderOrder = 13;
    m.userData = { r: f[2], ph: i * 1.9 };
    group.add(m);
    foam.push(m);
  });

  /* ---------- 溅雾 sprite:缓慢上飘·放大·淡出循环 ---------- */
  const sprays = [];
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    const x = W.x + (rnd() * 3.4 - 1.7), z = W.zSea + 0.6 + (rnd() * 3 - 1.5);
    spr.position.set(x, 1, z);
    spr.renderOrder = 14;
    group.add(spr);
    sprays.push({ spr, mat, x, z, ph: i * 0.211, v: 0.15 + rnd() * 0.07 });
  }

  /* ---------- 涟漪环:扩散淡出循环 ---------- */
  const ripGeo = new THREE.RingGeometry(0.8, 1, 30);
  const ripples = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xeafcff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const r = new THREE.Mesh(ripGeo, mat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(W.x + (i - 1) * 0.9, 0.06 + i * 0.02, W.zSea + 0.6 + (i - 1) * 0.7);
    r.renderOrder = 13;
    r.userData = { ph: i * 0.37 };
    group.add(r);
    ripples.push(r);
  }

  /* ---------- 画质联动:低配隐溅雾/涟漪,减一层水帘 ---------- */
  const onQ = (q) => {
    const low = q === "low";
    for (const s of sprays) s.spr.visible = !low;
    for (const r of ripples) r.visible = !low;
    curtainMeshes[0].visible = !low;
  };
  if (typeof ctx.onQuality === "function") ctx.onQuality(onQ);
  else ctx.onQuality.push(onQ);                     // main.js 里 onQuality 是数组

  /* ---------- 每帧:水纹错速下滚 + 泡沫脉动 + 溅雾升腾 + 涟漪扩散 ----------
     全程复用模块级引用,不 new 对象;相位统一由 t 驱动 */
  ctx.onUpdate((t) => {
    for (let i = 0; i < curTex.length; i++) {
      curTex[i].offset.y = -((t * curSpd[i]) % 1);  // 竖向下滚:前层快、后层慢
      curTex[i].offset.x = (t * 0.015 * (i - 1)) % 1; // 微量横漂,层间错位
    }
    for (let i = 0; i < foam.length; i++) {
      const u = foam[i].userData;
      const s = u.r * (1 + 0.09 * Math.sin(t * 2.3 + u.ph));
      foam[i].scale.set(s, s * 0.42, s * 0.85);
    }
    for (let i = 0; i < sprays.length; i++) {
      const sp = sprays[i], p = (t * sp.v + sp.ph) % 1;
      const s = 2.0 + 3.6 * p;
      sp.spr.position.set(sp.x + 0.4 * Math.sin(t * 0.8 + i * 2.1), 0.5 + 2.8 * p, sp.z);
      sp.spr.scale.set(s, s * 0.85, 1);
      sp.mat.opacity = 0.52 * (1 - p);
    }
    for (let i = 0; i < ripples.length; i++) {
      const r = ripples[i], p = (t * 0.42 + r.userData.ph) % 1;
      const s = 0.6 + 3.6 * p;
      r.scale.set(s, s, 1);
      r.material.opacity = 0.5 * (1 - p) * (1 - p);
    }
  });

  /* 整体安放:旋转 +90° 让落水沿 +x 冲出崖缘,水口对准崖缘点 */
  group.rotation.y = Math.PI / 2;
  group.position.set(LAYOUT.WATERFALL.x, 0, LAYOUT.WATERFALL.z);

  return { group };
}
