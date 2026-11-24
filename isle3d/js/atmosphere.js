/* ============================================================
   猫岛胜景 · 气氛层(atmosphere.js)
   天空穹顶(程序化着色器)/ 太阳 / 雾 / 灯光 / 远岛剪影 / 地平线远山
   色板对齐 refs/ref1.png(粉紫晚霞 + 青绿海)

   v2(画面升级):天空由"渐变贴图 + 面片云"改为单个着色器——
     · 三段霞色:天顶紫 → 霞粉 → 地平线暖
     · 云:视线方向投影到高空平面取 fbm,横向拉长成层积云,两阶色阶
     · 日轮 + 光晕直接写进 HDR,交给后期泛光
   ============================================================ */
import * as THREE from "three";

export function buildAtmosphere(ctx) {
  const { THREE, scene } = ctx;

  /* 灯光:半球环境 + 一盏暖阳。强度按 HDR 配(亮面略超 1,才有泛光余量) */
  const hemi = new THREE.HemisphereLight(0xffe4f2, 0x7fc4dc, 1.0);
  const sun = new THREE.DirectionalLight(0xffe2b8, 1.9);
  sun.position.set(120, 90, -60);                        // 太阳在东北高空,对齐 ref1 逆光位
  scene.add(hemi, sun, sun.target);
  ctx.sun = sun;                                         // 交给 main.js / post.js 配阴影、给海面算高光
  const fill = new THREE.DirectionalLight(0xb0c8ff, 0.45);
  fill.position.set(-80, 40, 60);
  scene.add(fill);

  /* 雾:远山融进霞色 */
  scene.fog = new THREE.Fog(0xecccf0, 200, 660);

  /* ---------- 天空穹顶:程序化着色器 ---------- */
  const sunDir = new THREE.Vector3(300, 210, -170).normalize();   // 日轮的方向(与暖阳同侧)
  const skyUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: sunDir },
    uZenith: { value: new THREE.Color(0x8d7fe0) },    // 天顶:蓝紫
    uMid: { value: new THREE.Color(0xf3a9d6) },       // 中段:霞粉
    uHorizon: { value: new THREE.Color(0xffe4c2) },   // 地平线:暖杏
    uHaze: { value: new THREE.Color(0xecccf0) },      // 地平线以下:必须等于 scene.fog 的颜色
    uSunCol: { value: new THREE.Color(0xffd9a0) },
    uCloudLit: { value: new THREE.Color(0xfff6fb) },
    uCloudShade: { value: new THREE.Color(0xc9aee2) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1100, 32, 20),      // 要罩住远山环(620~740),又要在远裁剪面(1200)之内
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: skyUniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform float uTime;
        uniform vec3 uSunDir, uZenith, uMid, uHorizon, uHaze, uSunCol, uCloudLit, uCloudShade;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        /* fbm:detail 控制高倍频的占比(远处/贴地平线处压掉高频,免得闪烁) */
        float fbm(vec2 p, float detail) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) {
            v += a * noise(p) * (i < 2 ? 1.0 : detail);
            p = p * 2.03 + vec2(17.3, 9.1);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;

          /* 三段霞色 + 地平线以下的雾色 */
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.26, h));
          col = mix(col, uZenith, smoothstep(0.20, 0.72, h));
          col = mix(col, uHaze, smoothstep(0.012, -0.012, h));   // 紧贴地平线就切成雾色:与远处的海面同色,接缝才不会成线

          /* 太阳:宽晕 + 日轮(HDR,交给泛光) */
          vec3 S = normalize(uSunDir);
          float sd = max(dot(d, S), 0.0);
          col += uSunCol * (pow(sd, 16.0) * 0.26 + pow(sd, 140.0) * 0.85);
          col += vec3(1.0, 0.97, 0.88) * smoothstep(0.99925, 0.99965, sd) * 3.2;

          /* 云:视线投影到高空平面取 fbm,横向拉长 → 成层的积云 */
          if (h > 0.0) {
            vec2 cp = d.xz / (h + 0.10);
            cp.x *= 0.62;
            cp += vec2(uTime * 0.0045, uTime * 0.0018);
            float detail = 1.0 - smoothstep(2.5, 9.0, length(cp));
            float n = fbm(cp * 0.9 + 3.1, mix(0.25, 1.0, detail));
            float cov = smoothstep(0.47, 0.60, n);
            /* 云顶亮部:朝太阳方向偏移再采一次,亮面落在受光的一侧(体积感) */
            float nLit = fbm(cp * 0.9 + 3.1 + normalize(S.xz) * 0.16 + vec2(0.0, -0.12), mix(0.25, 1.0, detail));
            float top = smoothstep(-0.02, 0.10, nLit - n);
            vec3 cloud = mix(uCloudShade, uCloudLit, top);
            cloud += uSunCol * pow(sd, 10.0) * 0.35;           // 朝太阳一侧的云被染暖
            float fade = smoothstep(0.012, 0.13, h) * (1.0 - smoothstep(0.72, 0.97, h));
            col = mix(col, cloud, cov * fade);
          }
          gl_FragColor = vec4(col, 1.0);
          /* 收尾:低画质直出时由这里做 ACES + sRGB;高画质渲染进 HDR 缓冲时
             这两步自动为空操作,交给后期合成统一处理。两条路径的天空才一致。 */
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
  sky.name = "sky";
  scene.add(sky);
  ctx.onUpdate((t) => { skyUniforms.uTime.value = t; });

  /* ---------- 远岛剪影(雾中层叠,对齐 ref1 远景):两层色 ---------- */
  const isleMatA = new THREE.MeshBasicMaterial({ color: 0xa890c8, fog: true });
  const isleMatB = new THREE.MeshBasicMaterial({ color: 0xc8b0e0, fog: true });
  [[190, -70, 52, 11, 0], [250, 70, 66, 14, 0], [-210, -120, 58, 10, 0],
   [70, -260, 84, 17, 1], [-150, 230, 46, 9, 1], [320, -180, 70, 13, 1],
   [-300, 40, 64, 12, 1], [150, 200, 54, 10, 0]]
    .forEach(([x, z, r, h, near]) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), near ? isleMatA : isleMatB);
      m.position.set(x, h / 2 - 10, z);
      m.rotation.y = x * 0.37;
      scene.add(m);
    });

  /* ---------- 地平线远山环:一圈大锥埋进雾里,补出 ref1 的层叠山影 ---------- */
  const mtnGeo = new THREE.ConeGeometry(1, 1, 7);
  const mtnMat = new THREE.MeshBasicMaterial({ color: 0xd8c0e4, fog: true });
  const mtns = new THREE.InstancedMesh(mtnGeo, mtnMat, 14);
  const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _p4 = new THREE.Vector3(), _s4 = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    const rad = 620 + (i % 3) * 60;                 // 拉远到 620~740:只做水平线薄薄一层
    const h = 44 + (i % 5) * 16;                    // 矮山:角高度约 5~9°
    _p4.set(Math.cos(a) * rad, h / 2 - 22, Math.sin(a) * rad);   // 底座沉到海面以下
    _s4.set(150 + (i % 4) * 70, h, 150 + (i % 4) * 70);
    _q4.setFromAxisAngle(_up, i * 0.9);
    _m4.compose(_p4, _q4, _s4);
    mtns.setMatrixAt(i, _m4);
  }
  mtns.computeBoundingSphere();
  scene.add(mtns);

  return sun.position.clone().normalize();
}
