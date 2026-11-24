/* ============================================================
   猫岛胜景 · 画面升级层(post.js)
   HDR 渲染 → 泛光 → 描边(深度 + 法线边缘检测)→ 调色/暗角/颗粒 → ACES 输出
   另含「卡通着色注入」:给全场 MeshStandardMaterial 换成三阶色阶 + 边缘光,
   模块专员一行都不用改。

   画质阶梯(由 main.js 的 applyQuality 驱动):
     high  — MSAA×4 + 泛光 + 描边 + 实时投影
     mid   — HDR + 泛光 + 调色(无描边、无投影)
     low   — 直出(renderer.render,不带后期),给弱核显
   约定:本文件只读场景,不改任何模块的几何与材质参数(除了 onBeforeCompile)。
   ============================================================ */
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════
   一、卡通着色注入
   原理:three 的 PBR 片元里,每个光源都会调一次 RE_Direct_Physical()。
   我们在它的函数体开头插入"三阶色阶漫反射"然后直接 return,
   原来的高光/能量守恒路径成了死代码,由编译器消掉。
   阴影信息 already 被折进 directLight.color,所以投影边与色阶边天然一致。
   ═══════════════════════════════════════════════════════════ */
export const TOON = {
  on: false,
  uRimColor: { value: new THREE.Color(0xffd6ea) },   // 边缘光:晚霞粉
  uRimStrength: { value: 0.16 },
};

const DIRECT_HEAD = "void RE_Direct_Physical(";
const TOON_DIRECT = `
	{
		/* —— 猫岛卡通着色:直接光分三阶,不算高光 —— */
		float toonNL = dot( geometryNormal, directLight.direction );
		float toonLit = smoothstep( -0.03, 0.09, toonNL );
		float toonMid = smoothstep( -0.40, -0.26, toonNL ) * 0.42;
		reflectedLight.directDiffuse += directLight.color * BRDF_Lambert( material.diffuseColor ) * max( toonLit, toonMid );
		return;
	}
`;
const TOON_RIM = `
	{
		/* —— 边缘光:逆光轮廓提亮一笔 —— */
		float toonRim = 1.0 - saturate( dot( normalize( normal ), normalize( vViewPosition ) ) );
		reflectedLight.indirectDiffuse += uRimColor * pow( toonRim, 3.5 ) * uRimStrength;
	}
`;

function patchToon(shader) {
  shader.uniforms.uRimColor = TOON.uRimColor;
  shader.uniforms.uRimStrength = TOON.uRimStrength;

  /* 注意:onBeforeCompile 拿到的片元里 #include 还没展开,RE_Direct_Physical
     藏在 lights_physical_pars_fragment 这个 chunk 里。必须先手动展开 chunk,
     在展开后的文本里打补丁,再把整段替换回原位。 */
  const INC = "#include <lights_physical_pars_fragment>";
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  const head = chunk.indexOf(DIRECT_HEAD);
  if (head < 0 || shader.fragmentShader.indexOf(INC) < 0) return;   // three 版本对不上:静默退回 PBR
  const brace = chunk.indexOf("{", head);
  const patched = chunk.slice(0, brace + 1) + TOON_DIRECT + chunk.slice(brace + 1);

  let out = shader.fragmentShader.replace(INC, patched);
  out = out.replace("#include <lights_fragment_end>", "#include <lights_fragment_end>" + TOON_RIM);
  /* uniform 挂进了 shader.uniforms 还不够,GLSL 里必须有声明,否则整个程序编译失败 */
  shader.fragmentShader = "uniform vec3 uRimColor;\nuniform float uRimStrength;\n" + out;
}

/** 给场景里所有标准材质开关卡通着色(on=false 时还原 PBR) */
export function applyToon(root, on) {
  const done = new Set();
  root.traverse((obj) => {
    const list = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of list) {
      if (done.has(m) || !m.isMeshStandardMaterial) continue;
      done.add(m);
      m.onBeforeCompile = on ? patchToon : function () {};
      m.customProgramCacheKey = () => (on ? "isle-toon" : "isle-pbr");
      m.needsUpdate = true;                           // 触发重编译
    }
  });
  TOON.on = on;
  return done.size;
}

/** 实时投影:只让"受光的标准材质物体"投影/接影(水面、特效、假阴影片都不参与) */
export function applyShadows(root, on) {
  let n = 0;
  root.traverse((obj) => {
    if (!(obj.isMesh || obj.isInstancedMesh)) return;
    const m = obj.material;
    const lit = m && m.isMeshStandardMaterial;
    obj.castShadow = !!(on && lit);
    obj.receiveShadow = !!(on && lit);
    if (on && lit) n++;
  });
  return n;
}

/* ═══════════════════════════════════════════════════════════
   二、后期管线
   ═══════════════════════════════════════════════════════════ */
const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/* 提亮:只留超过阈值的高光(软膝过渡) */
const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform float uThreshold, uKnee;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, l - uThreshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * contrib, 1.0);
}
`;

/* 可分离高斯模糊(9 抽头) */
const BLUR_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uDir;            // 已乘好纹素大小的步进
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tSrc, vUv).rgb * 0.2270270270;
  sum += (texture2D(tSrc, vUv + uDir * 1.3846153846).rgb + texture2D(tSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  sum += (texture2D(tSrc, vUv + uDir * 3.2307692308).rgb + texture2D(tSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(sum, 1.0);
}
`;

/* 合成:泛光 + 描边 + 调色 + 暗角 + 颗粒,最后交给 three 的 ACES 与 sRGB */
const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2  uPx;            // 深度/法线图的一个像素(UV)
uniform vec2  uFarFade;       // 超过这个距离(雾里)不再描边
uniform float uNear, uFar, uAspect, uTime;
uniform float uOutlineW;
uniform float uBloom, uOutline, uVignette, uGrain, uSat, uContrast;
uniform vec3  uInk;
uniform float uDebug;
varying vec2 vUv;

float viewDist(vec2 uv) {
  float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  c += texture2D(tBloom, vUv).rgb * uBloom;
  if (uDebug > 3.5) {                                    // 调试:4=纯场景色(无泛光无描边) 5=纯泛光
    vec3 part = uDebug < 4.5 ? c - texture2D(tBloom, vUv).rgb * uBloom : texture2D(tBloom, vUv).rgb * uBloom;
    gl_FragColor = vec4(part, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  if (uDebug > 0.5) {                                    // 调试:直接看预通道的内容
    if (uDebug < 1.5) { float dd = viewDist(vUv) / 300.0; gl_FragColor = vec4(fract(dd), dd, dd * 0.5, 1.0); return; }
    if (uDebug < 2.5) { gl_FragColor = vec4(nrm(vUv) * 0.5 + 0.5, 1.0); return; }
    vec2 dx = vec2(uPx.x * uOutlineW, 0.0), dy = vec2(0.0, uPx.y * uOutlineW);
    float dC = viewDist(vUv);
    float mn = min(min(viewDist(vUv + dx), viewDist(vUv - dx)), min(viewDist(vUv + dy), viewDist(vUv - dy)));
    float mx = max(max(viewDist(vUv + dx), viewDist(vUv - dx)), max(viewDist(vUv + dy), viewDist(vUv - dy)));
    float dEdge = max((mx - dC) / dC, (dC - mn) / dC);
    vec3 nC = nrm(vUv);
    float nEdge = 1.0 - min(min(dot(nC, nrm(vUv + dx)), dot(nC, nrm(vUv - dx))), min(dot(nC, nrm(vUv + dy)), dot(nC, nrm(vUv - dy))));
    gl_FragColor = vec4(smoothstep(0.07, 0.18, dEdge), smoothstep(0.32, 0.58, nEdge), dEdge > 0.02 ? 0.2 : 0.0, 1.0);
    return;
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>

  /* —— 描边:深度不连续(两侧都描,取更强的那侧)+ 法线突变(折痕) —— */
  if (uOutline > 0.001) {
    vec2 dx = vec2(uPx.x * uOutlineW, 0.0), dy = vec2(0.0, uPx.y * uOutlineW);
    float dC = viewDist(vUv);
    float dR = viewDist(vUv + dx), dL = viewDist(vUv - dx);
    float dU = viewDist(vUv + dy), dD = viewDist(vUv - dy);
    float mn = min(min(dR, dL), min(dU, dD));
    float mx = max(max(dR, dL), max(dU, dD));
    float dEdge = max((mx - dC) / dC, (dC - mn) / dC);   // 我比邻居近 / 我比邻居远,都算轮廓
    vec3 nC = nrm(vUv);
    float nEdge = 1.0 - min(min(dot(nC, nrm(vUv + dx)), dot(nC, nrm(vUv - dx))),
                             min(dot(nC, nrm(vUv + dy)), dot(nC, nrm(vUv - dy))));
    float e = max(smoothstep(0.05, 0.14, dEdge), smoothstep(0.24, 0.50, nEdge));
    e *= 1.0 - smoothstep(uFarFade.x, uFarFade.y, dC);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uInk, e * uOutline);
  }

  /* —— 调色:饱和 → S 曲线对比 → 暗角 → 颗粒 —— */
  float lum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor.rgb = mix(vec3(lum), gl_FragColor.rgb, uSat);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * gl_FragColor.rgb * (3.0 - 2.0 * gl_FragColor.rgb), uContrast);
  vec2 q = vUv - 0.5; q.x *= uAspect;
  gl_FragColor.rgb *= 1.0 - uVignette * smoothstep(0.30, 1.10, dot(q, q) * 1.7);
  gl_FragColor.rgb += (hash(vUv * 917.0 + fract(uTime) * 73.0) - 0.5) * uGrain;
  #include <colorspace_fragment>
}
`;

export function createPost({ renderer, THREE: T, scene, camera, sun }) {
  const gl2 = renderer.capabilities.isWebGL2;
  const canHDR = gl2 && (renderer.extensions.has("EXT_color_buffer_half_float") || renderer.extensions.has("EXT_color_buffer_float"));
  const hdrType = canHDR ? T.HalfFloatType : T.UnsignedByteType;

  const fsCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsMesh = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshBasicMaterial());
  fsMesh.frustumCulled = false;
  const fsScene = new T.Scene();
  fsScene.add(fsMesh);

  const normalMat = new T.MeshNormalMaterial();

  const brightMat = new T.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tSrc: { value: null }, uThreshold: { value: 1.22 }, uKnee: { value: 0.25 } } });
  const blurMat = new T.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tSrc: { value: null }, uDir: { value: new T.Vector2() } } });
  const compMat = new T.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      tScene: { value: null }, tBloom: { value: null }, tNormal: { value: null }, tDepth: { value: null },
      uPx: { value: new T.Vector2() }, uFarFade: { value: new T.Vector2(420, 560) },
      uNear: { value: camera.near }, uFar: { value: camera.far }, uAspect: { value: 1 }, uTime: { value: 0 },
      uBloom: { value: 0.34 }, uOutline: { value: 0.92 }, uVignette: { value: 0.26 }, uGrain: { value: 0.022 },
      uSat: { value: 1.14 }, uContrast: { value: 0.16 }, uInk: { value: new T.Color(0x1c1430) },
      uOutlineW: { value: 1.9 },
      uDebug: { value: 0 },
    } });

  let sceneRT = null, preRT = null, bloomA = null, bloomB = null;
  let W = 1, H = 1, level = "high";

  function makeSceneRT(samples) {
    if (sceneRT) sceneRT.dispose();
    sceneRT = new T.WebGLRenderTarget(W, H, { type: hdrType, samples, depthBuffer: true });
    sceneRT.texture.minFilter = T.LinearFilter;
  }
  function makeBloomRT() {
    const w = Math.max(1, W >> 1), h = Math.max(1, H >> 1);
    if (bloomA) { bloomA.dispose(); bloomB.dispose(); }
    bloomA = new T.WebGLRenderTarget(w, h, { type: hdrType, depthBuffer: false });
    bloomB = new T.WebGLRenderTarget(w, h, { type: hdrType, depthBuffer: false });
  }
  function makePreRT() {
    if (preRT) { preRT.depthTexture.dispose(); preRT.dispose(); }
    const depth = new T.DepthTexture(W, H);
    preRT = new T.WebGLRenderTarget(W, H, { minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: true, depthTexture: depth });
  }

  function blit(mat, target) {
    fsMesh.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(fsScene, fsCam);
  }

  /* 描边预通道:整场景用"法线材质"再画一遍,拿到屏幕空间的法线 + 深度 */
  const hidden = [];
  function prepass() {
    hidden.length = 0;
    scene.traverse((obj) => {
      const skip = obj.isSprite                                  // 精灵(光晕/雾片)没有稳定的"面法线"
        || (obj.material && obj.material.isMeshBasicMaterial && (obj.material.transparent || obj.material.side === T.DoubleSide)); // 光带/花瓣/假阴影片
      if (skip && obj.visible) { obj.visible = false; hidden.push(obj); }
    });
    scene.overrideMaterial = normalMat;
    renderer.setRenderTarget(preRT);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    for (const o of hidden) o.visible = true;
  }

  const api = {
    level,
    setSize() {
      const s = renderer.getDrawingBufferSize(new T.Vector2());
      if (s.x === W && s.y === H) return;
      W = Math.max(1, s.x); H = Math.max(1, s.y);
      makeSceneRT(level === "high" ? 4 : 0);
      makeBloomRT();
      makePreRT();
      compMat.uniforms.uAspect.value = W / H;
      compMat.uniforms.uPx.value.set(1 / W, 1 / H);
      compMat.uniforms.uOutlineW.value = 1.9 * Math.min(renderer.getPixelRatio() || 1, 1.75) / 1.0;   // 以 CSS 像素计约 1.9~3.3 缓冲像素
    },
    /** level: "high" | "mid" | "low" */
    setQuality(q) {
      level = q; api.level = q;
      const shadows = q === "high";
      if (sun) {
        sun.castShadow = shadows;
        renderer.shadowMap.enabled = shadows;
      }
      if (W > 1) { makeSceneRT(q === "high" ? 4 : 0); }
      compMat.uniforms.uOutline.value = q === "high" ? 0.92 : 0;
      compMat.uniforms.uBloom.value = q === "low" ? 0 : 0.34;
      // 开关投影会改着色器变体,通知 three 重编译
      scene.traverse((o) => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; }); });
    },
    /** 调试视图:0=正常 1=深度 2=法线 3=描边掩码 */
    debug(v) { compMat.uniforms.uDebug.value = v; },
    render(time) {
      if (level === "low" || !sceneRT) {         // 低配:直出,零后期开销
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      const u = compMat.uniforms;
      if (level === "high") {
        prepass();
        u.tNormal.value = preRT.texture;
        u.tDepth.value = preRT.depthTexture;
      }
      /* 1. 场景 → HDR(此时不做色调映射,保留高光余量) */
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      /* 2. 提亮 + 两轮可分离模糊(半分辨率) */
      brightMat.uniforms.tSrc.value = sceneRT.texture;
      blit(brightMat, bloomA);
      const bw = bloomA.width, bh = bloomA.height;
      for (let i = 0; i < 2; i++) {
        const r = 1 + i * 1.6;
        blurMat.uniforms.tSrc.value = bloomA.texture; blurMat.uniforms.uDir.value.set(r / bw, 0); blit(blurMat, bloomB);
        blurMat.uniforms.tSrc.value = bloomB.texture; blurMat.uniforms.uDir.value.set(0, r / bh); blit(blurMat, bloomA);
      }
      /* 3. 合成到屏幕 */
      u.tScene.value = sceneRT.texture;
      u.tBloom.value = bloomA.texture;
      u.uTime.value = time;
      blit(compMat, null);
    },
    dispose() {
      [sceneRT, preRT, bloomA, bloomB].forEach((rt) => rt && rt.dispose());
      [brightMat, blurMat, compMat, normalMat].forEach((m) => m.dispose());
    },
    get info() { return { W, H, hdr: canHDR, level }; },
  };
  return api;
}
