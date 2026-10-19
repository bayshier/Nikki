/* ============================================================
   猫岛胜景 · 八只活猫(modules/cats.js)
   ref4 亭前檐下打盹猫 / ref5 石道旁晒太阳猫
   复用 shared/three-kit 低模方块猫:8 猫 group + 8 假阴影圆片
   ============================================================ */
import { makeCat, idleCat } from "../../../shared/three-kit.js";

/* ---------- 八猫名册(契约毛色;编号 0/3 为散步猫) ---------- */
/* pos:[x,z] 落点 | rot:朝向风景(模型原生朝 +z 南,PI/2 朝东);
   walk:沿 (dx,dz) 6 单位小径缓慢往返,rot 即去程朝向 */
const ROSTER = [
  { name: "chenpi",   opt: { body: 0xfbf7ee, patch: 0x23232c },   // 0 主亭前·东向西小径
    pos: [-32, -1.5], rot: Math.PI / 2, walk: { ax: -32, az: -1.5, dx: 6, dz: 0, spd: 0.5, off: 0.0 } },
  { name: "baozi",    opt: { body: 0xfff5f0, belly: 0xffe4ec },   // 1 主亭前·望东南海
    pos: [-38, -2],   rot: 0.5 },
  { name: "niannian", opt: { body: 0xffb38a },                    // 2 桥头·面朝桥与海
    pos: [10.5, -4],  rot: Math.PI / 2 - 0.15 },
  { name: "jinzhang", opt: { body: 0x9aa7b8 },                    // 3 雕像道口·沿道小径
    pos: [-51, 12],   rot: Math.PI, walk: { ax: -51, az: 12, dx: 0, dz: -6, spd: 0.42, off: 1.3 } },
  { name: "daer",     opt: { body: 0xff9e5e },                    // 4 草台东缘·看海
    pos: [4.5, -7],   rot: Math.PI / 2 - 0.1 },
  { name: "youyu",    opt: { body: 0xffc9a0, belly: 0xffffff },   // 5 樱花树旁·崖缘望海
    pos: [0, 16],     rot: Math.PI / 4 + 0.25 },
  { name: "ali",      opt: { body: 0xd9776e, belly: 0xffe0d2 },   // 6 樱花树旁·回望镜头
    pos: [-4, 19.5],  rot: Math.PI / 4 - 0.2 },
  { name: "songlu",   opt: { body: 0x6b4a3a },                    // 7 雕像道中·面南晒太阳
    pos: [-52.5, 2],  rot: 0.35 },
];
const SCALE = 0.045;

/* ---------- 主入口 ---------- */
export function build(ctx) {
  const group = new ctx.THREE.Group();

  /* 假阴影:共享一片几何 + 一种材质(半透明深色圆片,契约禁实时阴影) */
  const shGeo = new ctx.THREE.CircleGeometry(11, 16);
  const shMat = new ctx.THREE.MeshBasicMaterial({
    color: 0x1e2430, transparent: true, opacity: 0.26, depthWrite: false,
  });

  const items = [];
  for (const def of ROSTER) {
    const cat = makeCat({ ...def.opt, scale: SCALE, name: def.name });
    const gy = ctx.heightAt(def.pos[0], def.pos[1]);
    cat.position.set(def.pos[0], gy, def.pos[1]);
    cat.rotation.y = def.rot;
    cat.userData.baseY = gy;                              // idleCat 呼吸以此为基准

    let walk = null;
    if (def.walk) {                                       // 预存往返朝向,update 里只换值不 new
      walk = { ...def.walk, h0: def.rot, target: def.rot, lastDir: 0 };
    }

    const sh = new ctx.THREE.Mesh(shGeo, shMat);          // 脚下假阴影
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(def.pos[0], gy + 0.22, def.pos[1]);
    group.add(cat, sh);
    items.push({ cat, sh, walk });
  }

  /* ---------- 每帧:散步猫贴地往返 + 平滑掉头,全员呼吸摆尾 ---------- */
  function update(t, dt) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i], u = it.cat.userData;
      if (it.walk) {
        const w = it.walk;
        const s = (t * w.spd + w.off) % 2;                // 0..2 三角波 → 往返
        const k = s < 1 ? s : 2 - s;                      // 0..1 段内进度
        it.cat.position.x = w.ax + w.dx * k;
        it.cat.position.z = w.az + w.dz * k;
        u.baseY = ctx.heightAt(it.cat.position.x, it.cat.position.z);
        const dir = s < 1 ? 1 : -1;                       // 行进方向翻转即掉头
        if (dir !== w.lastDir) {
          w.lastDir = dir;
          w.target = dir > 0 ? w.h0 : w.h0 + Math.PI;
        }
        it.cat.rotation.y += (w.target - it.cat.rotation.y) * Math.min(1, dt * 4);
      }
      idleCat(it.cat, t);                                 // 呼吸 + 尾巴(内部写 position.y)
      it.sh.position.set(it.cat.position.x, u.baseY + 0.22, it.cat.position.z);
    }
  }

  /* 低画质收起假阴影,省 8 个 draw call */
  const qHook = q => { const v = q !== "low"; for (const it of items) it.sh.visible = v; };
  if (Array.isArray(ctx.onQuality)) ctx.onQuality.push(qHook); else ctx.onQuality(qHook);

  return { group, update };
}
