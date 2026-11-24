/* ============================================================
   猫岛胜景 · 海面(water.js) v2
   一张带自定义着色器的海面,替代 v1 的"平面 + 三层滚动贴图 + 两圈泡沫环":
     · 岸线距离场:由 ctx.heightAt 烘地形高度 → 两遍倒角距离变换 → 每格到最近岸线的距离
       深浅 / 泡沫 / 透明度全部按这个距离算,泡沫才会真正"贴着岸"
     · 深浅:浅滩青绿 → 中海青 → 远海蓝紫;浅水半透,能透出水下的沙石
     · 泡沫:离岸越近越多,一圈圈向外推的白带 + 紧贴岸线的浪花
     · 浪线:低频噪声场的等值线(有机的曲线),再被一张掩膜切成段
     · 菲涅尔:掠射角反射霞色天空;太阳方向的碎金高光
   对齐参考:refs/ref1.png(白波光卷线/崖脚泡沫)、refs/ref3.png(水面青绿/倒影柔光)
   契约:isle3d/CONTRACT.md —— build(ctx) → { group, update(t, dt) }
   预算:1 mesh / 1 draw call
   ============================================================ */

/* ---------- 小工具 ---------- */
function smooth(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/* ---------- 烘焙:地形高度(R 通道)+ 到最近岸线的距离(G 通道) ---------- */
const N = 256, X0 = -120, Z0 = -100, SX = 240, SZ = 200;   // 范围要罩住地形网格(190×130)
const D_MAX = 48;                                            // 距离编码上限(世界单位)
function bakeField(ctx, THREE) {
  const dx = SX / N, dz = SZ / N, diag = Math.hypot(dx, dz);
  const INF = 1e9;
  const hgt = new Float32Array(N * N), dist = new Float32Array(N * N);

  /* 1) 高度:与 terrain.js 同一套"外缘没入海面"的收口;网格之外当陆地外缘之外(全是水) */
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X0 + (i + 0.5) / N * SX, z = Z0 + (j + 0.5) / N * SZ;
    let h = -6;
    if (Math.abs(x) < 95 && Math.abs(z) < 65) {
      const shelf = (1 - smooth(40, 68, Math.abs(x + 12))) * (1 - smooth(34, 60, Math.abs(z + 4)));
      h = -2.2 + (ctx.heightAt(x, z) + 2.2) * shelf;
    }
    hgt[j * N + i] = h;
    dist[j * N + i] = h >= 0 ? 0 : INF;                     // 露出水面的格子是"岸"
  }
  /* 2) 两遍倒角距离变换:3×4 邻域,各向异性步长 */
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i; let d = dist[k];
    if (i > 0) d = Math.min(d, dist[k - 1] + dx);
    if (j > 0) { const u = k - N; d = Math.min(d, dist[u] + dz); if (i > 0) d = Math.min(d, dist[u - 1] + diag); if (i < N - 1) d = Math.min(d, dist[u + 1] + diag); }
    dist[k] = d;
  }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
    const k = j * N + i; let d = dist[k];
    if (i < N - 1) d = Math.min(d, dist[k + 1] + dx);
    if (j < N - 1) { const b = k + N; d = Math.min(d, dist[b] + dz); if (i < N - 1) d = Math.min(d, dist[b + 1] + diag); if (i > 0) d = Math.min(d, dist[b - 1] + diag); }
    dist[k] = d;
  }
  /* 3) 打包:R = 高度 [-8,20],G = 岸线距离 [0,D_MAX] */
  const data = new Uint8Array(N * N * 4);
  for (let k = 0; k < N * N; k++) {
    data[k * 4] = Math.round((Math.max(-8, Math.min(20, hgt[k])) + 8) / 28 * 255);
    data[k * 4 + 1] = Math.round(Math.min(dist[k], D_MAX) / D_MAX * 255);
    data[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/* ============================================================
   build
   ============================================================ */
export function build(ctx) {
  const THREE = ctx.THREE;
  const group = new THREE.Group();
  group.name = "water";

  const field = bakeField(ctx, THREE);
  const sunDir = ctx.sun ? ctx.sun.position.clone().normalize() : new THREE.Vector3(120, 90, -60).normalize();

  /* 注意:ShaderMaterial 开了 fog:true 之后,three 会到"材质自己的 uniforms"里刷新
     fogColor / fogNear / fogFar。内置材质自带,自定义的必须把 UniformsLib.fog 合并进来,
     否则渲染时抛 "Cannot read properties of undefined (reading 'value')"。 */
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true, depthWrite: false,
    extensions: { derivatives: true },
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uSunDir: { value: sunDir },
      uField: { value: null },                            // 纹理在 merge 之后单独赋(避免被克隆)
      uBounds: { value: new THREE.Vector4(X0, Z0, SX, SZ) },
      uShallow: { value: new THREE.Color(0x74e6d4) },      // 浅滩:透亮的青绿
      uMid: { value: new THREE.Color(0x24b4cf) },          // 中海:青
      uDeep: { value: new THREE.Color(0x3f74c2) },         // 远海:偏紫的蓝
      uSkyTint: { value: new THREE.Color(0xf2c2e2) },      // 掠射角反射的霞色
      uFoam: { value: new THREE.Color(0xffffff) },
      uDetail: { value: 1 },                               // 画质联动:低配减掉高频层
    }]),
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uDetail;
      uniform vec3 uCam, uSunDir, uShallow, uMid, uDeep, uSkyTint, uFoam;
      uniform sampler2D uField;
      uniform vec4 uBounds;
      varying vec3 vWorld;
      #include <fog_pars_fragment>

      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
                   mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float shoreDist(vec2 xz) {
        vec2 uv = (xz - uBounds.xy) / uBounds.zw;
        return texture2D(uField, clamp(uv, 0.002, 0.998)).g * ${D_MAX}.0;
      }

      void main() {
        vec2 p = vWorld.xz;
        float t = uTime;
        float camD = length(uCam - vWorld);
        float nearF = 1.0 - smoothstep(110.0, 280.0, camD);    // 远处压掉高频:300 单位外一个噪声周期不到 2 像素,不压会出摩尔纹

        /* —— 到岸线的距离 + 有机抖动(泡沫才不会是死板的同心圆) —— */
        float wob = vnoise(p * 0.22 + 3.0) - 0.5;
        float d = shoreDist(p) + wob * 0.45;

        /* —— 深浅色:离岸越远越深 —— */
        vec3 col = mix(uShallow, uMid, smoothstep(0.6, 7.0, d));
        col = mix(col, uDeep, smoothstep(9.0, 34.0, d));

        /* —— 波纹:三层方向/频率不同的行波 —— */
        vec2 d1 = normalize(vec2(0.9, 0.35)), d2 = normalize(vec2(-0.55, 0.83)), d3 = normalize(vec2(0.2, -0.98));
        vec2 g = d1 * 0.42 * cos(dot(p, d1) * 0.42 + t * 1.3);
        g += d2 * 0.71 * cos(dot(p, d2) * 0.71 + t * 1.9) * 0.55;
        g += d3 * 1.5 * cos(dot(p, d3) * 1.5 + t * 2.7) * 0.22 * uDetail * nearF;
        vec2 d4 = normalize(vec2(-0.87, -0.49));
        g += d4 * 4.2 * cos(dot(p, d4) * 4.2 + t * 3.9) * 0.07 * uDetail * nearF;   // 细波:把太阳反光打散成粼粼的点
        vec3 N = normalize(vec3(-g.x * 0.16, 1.0, -g.y * 0.16));
        vec3 V = normalize(uCam - vWorld);
        /* 远处把法线压平:掠射角下菲涅尔对法线极敏感,不压平会出横向条纹 */
        vec3 Nf = normalize(mix(vec3(0.0, 1.0, 0.0), N, nearF));

        /* —— 菲涅尔:掠射角反射霞色天空 —— */
        float fres = pow(1.0 - max(dot(Nf, V), 0.0), 3.0);
        col = mix(col, uSkyTint, fres * 0.45);

        /* —— 太阳碎金 —— */
        vec3 L = normalize(uSunDir);
        float spec = pow(max(dot(N, normalize(L + V)), 0.0), 260.0) * 1.7 * uDetail;
        col += vec3(1.0, 0.92, 0.75) * spec;

        /* —— 浪线:低频噪声场的等值线(有机的曲线),再被掩膜切成段 —— */
        float n1 = vnoise(p * 0.055 + vec2(t * 0.018, -t * 0.006));
        float n2 = vnoise(p * 0.13 + vec2(-t * 0.012, t * 0.010) + 5.0);
        float lv = (n1 * 0.78 + n2 * 0.22) * 3.0;
        float iso = abs(fract(lv + 0.5) - 0.5);
        float lines = (1.0 - smoothstep(0.0, fwidth(lv) * 0.85, iso)) * step(0.52, vnoise(p * 0.09 + 13.0));
        lines *= smoothstep(1.8, 5.0, d) * uDetail * nearF;

        /* —— 岸边泡沫:离岸越近越多;一圈圈向外推的白带 + 贴岸浪花 —— */
        float push = sin(d * 4.4 - t * 1.8 + wob * 3.0);
        float band = smoothstep(0.55, 0.92, push) * smoothstep(3.4, 0.8, d);
        float shore = smoothstep(0.70, 0.12, d);
        float foam = clamp(band * 0.75 + shore, 0.0, 1.0);
        col = mix(col, uFoam, foam);
        col = mix(col, uFoam, lines * 0.55);

        /* —— 浅水半透:透出水下的沙石 —— */
        float alpha = mix(0.36, 1.0, smoothstep(0.0, 2.6, d));
        alpha = max(alpha, foam);
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
        /* 收尾:低画质直出时做 ACES + sRGB;进 HDR 缓冲时为空操作(见 atmosphere.js) */
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const uniforms = mat.uniforms;
  uniforms.uField.value = field;

  /* 3000²:环绕机位最远离岛心 210,到方块边至少 1290 > 远裁剪面 1200 → 任何角度都看不到海面的"边" */
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 1, 1), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.name = "sea";
  sea.renderOrder = 0;
  sea.matrixAutoUpdate = false;
  sea.updateMatrix();
  group.add(sea);

  /* ---------- 画质联动:低配减掉高频波纹、碎金与浪线 ---------- */
  (ctx.onQuality || []).push((q) => { uniforms.uDetail.value = q === "low" ? 0.15 : q === "mid" ? 0.6 : 1; });

  /* ---------- 每帧:只推时间和相机位置(零对象分配) ---------- */
  function update(t /* , dt */) {
    uniforms.uTime.value = t;
    uniforms.uCam.value.copy(ctx.G.camPos);
  }

  return { group, update };
}
