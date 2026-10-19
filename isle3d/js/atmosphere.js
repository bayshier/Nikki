/* ============================================================
   猫岛胜景 · 气氛层(atmosphere.js)
   天空穹顶 / 太阳 / 雾 / 灯光 / 远岛剪影 / 云
   色板对齐 refs/ref1.png(粉紫晚霞 + 青绿海)
   ============================================================ */
import * as THREE from "three";

export function buildAtmosphere(ctx) {
  const { THREE, scene, mats } = ctx;

  /* 灯光:半球环境 + 一盏暖阳(默认无实时阴影,弱核显友好) */
  const hemi = new THREE.HemisphereLight(0xffe9f3, 0x7fb8d0, 0.95);
  const sun = new THREE.DirectionalLight(0xffd9a8, 1.55);
  sun.position.set(120, 90, -60);                        // 太阳在东北高空,对齐 ref1 逆光位
  scene.add(hemi, sun, sun.target);
  const fill = new THREE.DirectionalLight(0xb0c8ff, 0.35);
  fill.position.set(-80, 40, 60);
  scene.add(fill);

  /* 雾:远山融进霞色 */
  scene.fog = new THREE.Fog(0xe8c8ec, 180, 560);

  /* 天空穹顶:渐变贴图大球 */
  const skyGeo = new THREE.SphereGeometry(620, 24, 14);
  const c = document.createElement("canvas"); c.width = 4; c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0.00, "#b48ae0");                      // 天顶紫
  gr.addColorStop(0.34, "#e8a8d8");
  gr.addColorStop(0.55, "#ffc9d8");
  gr.addColorStop(0.72, "#ffe3b8");                      // 地平线暖
  gr.addColorStop(1.00, "#ffd9e8");
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(c);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
    map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  scene.add(sky);

  /* 太阳光晕 sprite */
  const sc = document.createElement("canvas"); sc.width = sc.height = 128;
  const sg = sc.getContext("2d");
  const rg = sg.createRadialGradient(64, 64, 4, 64, 64, 62);
  rg.addColorStop(0, "rgba(255,250,230,1)"); rg.addColorStop(0.25, "rgba(255,225,170,.85)");
  rg.addColorStop(1, "rgba(255,200,150,0)");
  sg.fillStyle = rg; sg.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, fog: false,
  }));
  glow.position.set(300, 210, -170); glow.scale.setScalar(180);
  scene.add(glow);

  /* 远岛剪影(雾中层叠,对齐 ref1 远景) */
  const isleMat = new THREE.MeshBasicMaterial({ color: 0xc0a8d8, fog: true });
  [[210, -80, 34, 7], [260, 60, 46, 9], [-240, -140, 40, 6], [80, -300, 60, 11], [-160, 260, 30, 5]]
    .forEach(([x, z, r, h]) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), isleMat);
      m.position.set(x, h / 2 - 5, z);
      m.rotation.y = x * 0.37;
      scene.add(m);
    });

  /* 云:几簇扁球,贴着天边慢慢漂 */
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffe8f2, fog: false, transparent: true, opacity: 0.9 });
  const clouds = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const cl = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(14 + Math.random() * 10, 10, 8), cloudMat);
      p.scale.y = 0.42;
      p.position.set(j * 16 - 16, Math.random() * 4, Math.random() * 10 - 5);
      cl.add(p);
    }
    cl.position.set(-320 + Math.random() * 640, 120 + Math.random() * 90, -260 + Math.random() * 420);
    cl.userData.v = 1.6 + Math.random() * 1.6;
    clouds.add(cl);
  }
  scene.add(clouds);
  ctx.onUpdate((t, dt) => {
    for (const cl of clouds.children) {
      cl.position.x += cl.userData.v * dt;
      if (cl.position.x > 380) cl.position.x = -380;
    }
  });

  return sun.position.clone().normalize();
}
