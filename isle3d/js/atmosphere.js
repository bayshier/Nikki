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

  /* 远岛剪影(雾中层叠,对齐 ref1 远景):两层色 + 更近更大,肉眼可辨 */
  const isleMatA = new THREE.MeshBasicMaterial({ color: 0xa890c8, fog: true });   // 近层偏紫
  const isleMatB = new THREE.MeshBasicMaterial({ color: 0xc8b0e0, fog: true });   // 远层偏粉(被雾吃掉更多)
  [[190, -70, 52, 11, 0], [250, 70, 66, 14, 0], [-210, -120, 58, 10, 0],
   [70, -260, 84, 17, 1], [-150, 230, 46, 9, 1], [320, -180, 70, 13, 1],
   [-300, 40, 64, 12, 1], [150, 200, 54, 10, 0]]
    .forEach(([x, z, r, h, near]) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), near ? isleMatA : isleMatB);
      m.position.set(x, h / 2 - 10, z);
      m.rotation.y = x * 0.37;
      scene.add(m);
    });
  /* 地平线远山环:一圈大锥埋进雾里,补出 ref1 的层叠山影 */
  const mtnGeo = new THREE.ConeGeometry(1, 1, 7);
  const mtnMat = new THREE.MeshBasicMaterial({ color: 0xd8c0e4, fog: true });
  const mtns = new THREE.InstancedMesh(mtnGeo, mtnMat, 14);
  const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _p4 = new THREE.Vector3(), _s4 = new THREE.Vector3();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    const rad = 620 + (i % 3) * 60;                 // 拉远到 620~740:只做水平线薄薄一层
    const h = 44 + (i % 5) * 16;                    // 矮山:角高度约 5~9°
    _p4.set(Math.cos(a) * rad, h / 2 - 22, Math.sin(a) * rad);   // 底座沉到海面以下
    _s4.set(150 + (i % 4) * 70, h, 150 + (i % 4) * 70);
    _q4.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.9);
    _m4.compose(_p4, _q4, _s4);
    mtns.setMatrixAt(i, _m4);
  }
  mtns.computeBoundingSphere();
  scene.add(mtns);

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
