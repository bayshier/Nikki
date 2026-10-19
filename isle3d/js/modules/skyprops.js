/* ============================================================
   猫岛胜景 · 天空生气(skyprops.js)
   远景鸟群(松散 V 形绕岛缓飞)+ 亭旁花丛蝴蝶(小圈扇翅)
   审美对齐 refs/ref9.png / ref1.png:紫霞天空里的一缕生气
   每只鸟/蝶只占 2 个三角面,扇翅靠顶点 y 的 sin 摆动
   ============================================================ */
import * as THREE from "three";

export function build(ctx) {
  const { THREE, heightAt } = ctx;
  const group = new THREE.Group();

  /* 确定性随机(刷新后鸟群队形一致) */
  let seed = 20260506;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  /* ---------- 材质:鸟深灰紫剪影 / 蝴蝶白·粉·黄 ---------- */
  const birdMat = new THREE.MeshStandardMaterial({
    color: 0x6a5a80, roughness: 0.85, side: THREE.DoubleSide,
  });
  const bfMats = [0xfff5f0, 0xffc9d8, 0xffe9a0].map((c) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, side: THREE.DoubleSide })
  );

  /* 模块级临时向量(update 内零分配) */
  const _v = new THREE.Vector3();

  /* ---------- 双翼几何:非索引 6 顶点 = 2 个三角面 ----------
     顶点排布:0 前根 / 1 左翼尖 / 2 后根 / 3 前根 / 4 后根 / 5 右翼尖
     扇翅时只写 1、5 号顶点的 y(分量下标 4 与 16)            */
  const TIP_Y = [4, 16];
  function wingGeom(span, len, tail) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array([
      0, 0, len,      -span, 0, tail,   0, 0, tail,     // 左翼
      0, 0, len,       0, 0, tail,     span, 0, tail,   // 右翼
    ]);
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.computeVertexNormals();
    return g;
  }

  /* ---------- 鸟群:7 只,松散 V 形绕岛大半径缓飞 ---------- */
  const BIRD_N = 7;
  const BC = { x: -16, z: 4 };                        // 绕飞中心
  const SPD = 0.05;                                   // 共用角速度(队形不散)
  const birds = [];
  for (let i = 0; i < BIRD_N; i++) {
    const mesh = new THREE.Mesh(wingGeom(2.6, 1.2, -0.9), birdMat);
    const side = i === 0 ? 0 : (i % 2 === 1 ? -1 : 1); // 0=头鸟,±1=左右侧
    const rank = i === 0 ? 0 : Math.ceil(i / 2);       // 第几排(越后越靠后)
    const b = {
      pos: mesh.geometry.attributes.position.array,
      angOff: -0.075 * rank - rnd() * 0.03,            // V 形拖后角
      r: THREE.MathUtils.clamp(150 + side * (8 + rank * 9) + (rnd() - 0.5) * 8, 130, 170),
      h: THREE.MathUtils.clamp(68 + rank * 3.5 + (rnd() - 0.5) * 16, 55, 85),
      fs: 2.3 + rnd() * 1.1,                           // 扇翅频率
      ph: rnd() * Math.PI * 2,
      glide: rnd() * Math.PI * 2,                      // 滑翔相位(缓慢收翅)
    };
    mesh.position.y = b.h;
    group.add(mesh);
    birds.push({ mesh, ...b });
  }

  /* ---------- 蝴蝶:6 只,绕主亭旁花丛小圈飞 ---------- */
  const BF_N = 6;
  const FLOWER = { x: -28, z: 2 };                    // 主亭旁花丛区
  const flies = [];
  for (let i = 0; i < BF_N; i++) {
    const mesh = new THREE.Mesh(wingGeom(0.42, 0.34, -0.26), bfMats[i % 3]);
    const bx = FLOWER.x + (rnd() - 0.5) * 7;
    const bz = FLOWER.z + (rnd() - 0.5) * 7;
    const f = {
      pos: mesh.geometry.attributes.position.array,
      bx, bz,
      r: 1.3 + rnd() * 1.8,                            // 小圈半径
      h: heightAt(bx, bz) + 1.4 + rnd() * 1.8,         // 离地 1~3 米
      spd: 0.8 + rnd() * 0.7,                          // 绕圈角速度
      ph: rnd() * Math.PI * 2,
      fs: 11 + rnd() * 4,                              // 扇翅频率(快)
    };
    mesh.position.y = f.h;
    group.add(mesh);
    flies.push({ mesh, ...f });
  }

  /* ---------- 画质回调:low 档鸟减半、蝴蝶全隐 ---------- */
  let lowMode = false;
  function applyQ(q) {
    lowMode = q === "low";
    for (let i = 0; i < BIRD_N; i++) birds[i].mesh.visible = !lowMode || i < 3;
    for (let i = 0; i < BF_N; i++) flies[i].mesh.visible = !lowMode;
  }
  if (typeof ctx.onQuality === "function") ctx.onQuality(applyQ);
  else ctx.onQuality.push(applyQ);                    // main.js 里 onQuality 是数组
  applyQ(ctx.G.quality);

  /* ---------- 每帧:绕飞 / 小圈飞 / sin 扇翅(绝对量写入,可重入) ---------- */
  function update(t) {
    /* 鸟:大圆弧前进,头鸟带 V 形;缓慢滑翔-扇翅交替 */
    for (let i = 0; i < BIRD_N; i++) {
      const b = birds[i];
      if (!b.mesh.visible) continue;
      const ang = t * SPD + b.angOff;
      const y = b.h + Math.sin(t * 0.55 + b.ph) * 1.8; // 高度轻浮
      b.mesh.position.set(BC.x + Math.cos(ang) * b.r, y, BC.z + Math.sin(ang) * b.r);
      const a2 = ang + 0.035;                          // 朝向切线前方一点
      b.mesh.lookAt(_v.set(BC.x + Math.cos(a2) * b.r, y, BC.z + Math.sin(a2) * b.r));
      const flap = Math.max(0, Math.sin(t * 0.13 + b.glide)); // 0.35~1 扇/滑交替
      const s = Math.sin(t * b.fs + b.ph) * (0.35 + 0.65 * flap);
      b.pos[TIP_Y[0]] = s * 1.05;                      // 左翼尖
      b.pos[TIP_Y[1]] = s * 1.05;                      // 右翼尖
      b.mesh.geometry.attributes.position.needsUpdate = true;
    }
    /* 蝶:花丛上小圈 + 抖动漂移,高频扇翅 */
    if (lowMode) return;
    for (let i = 0; i < BF_N; i++) {
      const f = flies[i];
      const ang = t * f.spd + f.ph;
      const x = f.bx + Math.cos(ang) * f.r + Math.sin(t * 1.7 + f.ph) * 0.35;
      const z = f.bz + Math.sin(ang) * f.r * 0.85 + Math.cos(t * 1.3 + f.ph) * 0.35;
      const y = f.h + Math.sin(t * 2.1 + f.ph) * 0.5;
      f.mesh.position.set(x, y, z);
      const a2 = ang + 0.3;
      f.mesh.lookAt(_v.set(
        f.bx + Math.cos(a2) * f.r, y,
        f.bz + Math.sin(a2) * f.r * 0.85
      ));
      const s = Math.sin(t * f.fs + f.ph) * 0.5;
      f.pos[TIP_Y[0]] = s * 0.55;                      // 翅尖上下拍
      f.pos[TIP_Y[1]] = s * 0.55;
      f.mesh.geometry.attributes.position.needsUpdate = true;
    }
  }
  ctx.onUpdate(update);

  return { group, update };
}
