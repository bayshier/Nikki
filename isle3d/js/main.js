/* ============================================================
   猫岛胜景 · 引擎底座(main.js)
   渲染循环 / 相机 / 画质阶梯 / 模块装载 / 截图
   模块契约见 isle3d/CONTRACT.md
   ============================================================ */
import * as THREE from "three";
import { initRenderer } from "../../shared/three-kit.js";
import { buildAtmosphere } from "./atmosphere.js";

/* ---------- 世界常量(与 CONTRACT.md 一致,专员不许改) ---------- */
export const LAYOUT = {
  SEA_Y: 0,                 // 海平面
  PLATEAU_Y: 18,            // 草台顶
  CLIFF_X: 8,               // 悬崖缘(以西为草台)
  WATERFALL: { x: 8, z: 14, xSea: 26, w: 7 },            // 瀑布:崖缘 (8,14) 落到水湾 (26,14)
  PAVILION: [-34, -6],      // 主亭
  BRIDGE: [16, -2],         // 拱桥中心(崖壁爬升段)
  STATUE_PATH: [-52, 14],   // 雕像道起点(向 -z 延伸)
  CAMERA: { r: 118, h: 46, target: [-16, 9, 4] },
};

/* 地形高度解析式:专员用它取任意点地面高度(不许自算) */
function smooth(a, b, v) { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
function noise2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; }
export function heightAt(x, z) {
  const plat = smooth(30, 6, x) * smooth(56, 34, Math.abs(z + 4));   // 草台掩码
  const knoll = 2.6 * Math.exp(-((x + 34) ** 2 + (z + 6) ** 2) / 700);
  const knoll2 = 2.0 * Math.exp(-((x + 56) ** 2 + (z - 14) ** 2) / 420);
  const roll = 1.1 * noise2(Math.round(x * 0.05) / 20, Math.round(z * 0.05) / 20) * plat;
  const beach = 2.4 * smooth(-20, 44, x) * (1 - plat);               // 崖下碎石滩缓坡
  let h = 1.2 + 16.8 * plat + knoll + knoll2 + roll + beach;
  /* 瀑布入海凹槽:沿东侧落水线(z=14)凿出低于海面的水湾,海水倒灌进来 */
  const cove = smooth(11, 16, Math.abs(z - 14)) * smooth(36, 26, x) * smooth(4, 9, x);
  h -= 5.2 * cove;
  return h;
}

/* ---------- 渲染器 / 场景 / 相机 ---------- */
const cv = document.getElementById("cv");
const renderer = initRenderer(cv, { shadows: false, exposure: 1.06, maxPixelRatio: 1.75 });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1200);
scene.add(camera);

/* 共享材质(模块优先用这些,省 draw call 与内存) */
const std = (color, opt = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...opt });
const mats = {
  grass:   std(0x8ed07a),
  grassD:  std(0x6cb35c),
  cliff:   std(0x9b8f9c),
  cliffD:  std(0x7c6f80),
  rock:    std(0xa8a4b8),
  wood:    std(0xd8a878),
  woodD:   std(0xa87850),
  roof:    std(0x7d9db0, { roughness: 0.7 }),
  roofD:   std(0x5f7d92, { roughness: 0.7 }),
  pillar:  std(0xe06a5a, { roughness: 0.75 }),
  stone:   std(0xcfc9dc),
  stoneD:  std(0xa9a2ba),
  white:   std(0xfff6ea),
  gold:    new THREE.MeshStandardMaterial({ color: 0xe8c56a, roughness: 0.4, metalness: 0.6 }),
  dark:    std(0x3a3148),
};

/* 模块上下文 */
const updates = [];
const qualityFns = [];
function onQuality(fn) { qualityFns.push(fn); }          // 兼容函数式与 .push 式两种专员写法
onQuality.push = fn => qualityFns.push(fn);
const ctx = {
  THREE, scene, camera, renderer, mats,
  LAYOUT, heightAt,
  G: { t: 0, dt: 0, quality: "high", camPos: new THREE.Vector3() },
  onUpdate: fn => updates.push(fn),                      // 注册每帧回调
  onQuality,                                             // 画质变化回调(低配关特效)
};

/* ---------- 气氛(天空/雾/光/远岛/太阳) ---------- */
const sunDir = buildAtmosphere(ctx);

/* ---------- 模块装载(失败隔离:单个模块挂了不影响全场) ---------- */
const MODULES = [
  ["地形",     "./modules/terrain.js"],
  ["湖水",     "./modules/water.js"],
  ["瀑布",     "./modules/waterfall.js"],
  ["松树",     "./modules/trees.js"],
  ["花树",     "./modules/flowers.js"],
  ["主亭",     "./modules/pavilion.js"],
  ["桥灯",     "./modules/bridge.js"],
  ["猫雕像",   "./modules/statues.js"],
  ["八猫",     "./modules/cats.js"],
  ["岩石",     "./modules/rocks.js"],
  ["天物",     "./modules/skyprops.js"],
  ["特效",     "./modules/effects.js"],
];
const loaded = [];
for (const [name, path] of MODULES) {
  try {
    const m = await import(path);
    const inst = await m.build(ctx);
    inst.group && scene.add(inst.group);
    inst.update && updates.push(inst.update);
    loaded.push([name, inst]);
    console.log("✅ 模块", name);
  } catch (e) {
    console.error("❌ 模块装载失败:", name, e);
  }
}
window.__isle = { ctx, loaded, THREE, scene, camera, renderer, heightAt };

/* ---------- 相机:自动环绕 + 拖动/缩放 ---------- */
const cam = LAYOUT.CAMERA;
let yaw = 0.9, pitch = 0.34, dist = cam.r, auto = 0.02;
const look = new THREE.Vector3(...cam.target);
function applyCam() {
  camera.position.set(
    look.x + Math.cos(pitch) * Math.cos(yaw) * dist,
    look.y + Math.sin(pitch) * dist,
    look.z + Math.cos(pitch) * Math.sin(yaw) * dist);
  camera.lookAt(look);
}
let drag = null;
cv.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (err) {} });
cv.addEventListener("pointermove", e => {
  if (!drag) return;
  yaw -= (e.clientX - drag.x) * 0.0042;
  pitch = Math.max(0.08, Math.min(0.85, pitch + (e.clientY - drag.y) * 0.003));
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener("pointerup", () => drag = null);
cv.addEventListener("wheel", e => { dist = Math.max(46, Math.min(210, dist + e.deltaY * 0.09)); }, { passive: true });

/* ---------- 画质阶梯(弱核显自适应) ---------- */
let qLevel = 2;                                          // 2=高 1=中 0=低
const qEl = document.getElementById("quality");
const QNAMES = ["低(省电)", "中", "高"];
function applyQuality() {
  renderer.setPixelRatio(qLevel === 2 ? Math.min(devicePixelRatio || 1, 1.75) : qLevel === 1 ? 1 : 0.75);
  ctx.G.quality = qLevel === 2 ? "high" : qLevel === 1 ? "mid" : "low";
  for (const f of qualityFns) { try { f(ctx.G.quality); } catch (e) {} }
  qEl.textContent = `画质:${QNAMES[qLevel]} · 模块 ${loaded.length}/12`;
}
let slow = 0;
function autoQuality(fps) {
  if (fps < 34 && qLevel > 0) { if (++slow > 90) { qLevel--; slow = 0; applyQuality(); } }
  else slow = 0;
}

/* ---------- 截图(S 键 / 按钮):对照参考图打磨用 ---------- */
function shoot() {
  renderer.render(scene, camera);
  const a = document.createElement("a");
  a.download = `isle-${Date.now()}.png`;
  a.href = renderer.domElement.toDataURL("image/png");
  a.click();
}
document.getElementById("shot").onclick = shoot;
addEventListener("keydown", e => { if (e.key === "s" || e.key === "S") shoot(); });

/* ---------- 主循环 ---------- */
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
applyQuality();

let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  ctx.G.t += dt; ctx.G.dt = dt;
  if (!drag) yaw += auto * dt;
  applyCam();
  ctx.G.camPos.copy(camera.position);
  for (const u of updates) { try { u(ctx.G.t, dt); } catch (e) {} }
  renderer.render(scene, camera);
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT > 1) { autoQuality(fpsN / fpsAcc); fpsAcc = fpsN = fpsT = 0; }
});
