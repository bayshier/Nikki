/* ============================================================
   猫岛胜景 · 地形(terrain.js)
   草台 + 崖壁(竖向褶皱)+ 崖下碎石滩 + 土路色带
   整岛一个 mesh / 一个 draw call;高度全部取自 ctx.heightAt
   ============================================================ */

/* ---------- 小工具:平滑 / 插值值噪声 ---------- */
function smooth(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function hash2(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
/* 平滑插值值噪声,返回 [-1,1] */
function vn(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}

/* ---------- 色板(取自 ref1 / CONTRACT)---------- */
const GRASS_L = 0x8ed07a, GRASS_D = 0x5da052;   // 草亮 / 草暗
const CLIFF_L = 0x9b8f9c, CLIFF_D = 0x7c6f80;   // 崖壁紫灰亮 / 暗
const CLIFF_BOT = 0x6b5f70;                      // 崖脚压暗
const STRATA = 0xa5828a;                         // 地层淡玫瑰(ref1 崖上红纹)
const LIP = 0x4e8a48;                            // 崖缘深绿草唇
const BEACH_L = 0xccc8d4, BEACH_D = 0xaaa6b4;    // 碎石滩浅灰
const WET = 0x8f8b9e;                            // 水线湿沙
const SEABED = 0x6f8a88;                         // 水下偏青
const DIRT = 0xc9a878;                           // 土路

/* ---------- 土路折线:拱桥 → 主亭 → 雕像道 ---------- */
const PATH = [[16, -2], [8, 2], [-6, -2], [-20, -4], [-34, -6], [-40, 6], [-52, 14]];
function distPath(x, z) {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const ax = PATH[i][0], az = PATH[i][1];
    const bx = PATH[i + 1][0], bz = PATH[i + 1][1];
    const dx = bx - ax, dz = bz - az;
    let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t - x, pz = az + dz * t - z;
    const d = px * px + pz * pz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/* ---------- 临时颜色(build 期用,不进每帧)---------- */

/* ---------- build:整岛一张位移网格 ---------- */
export function build(ctx) {
  const { THREE } = ctx;
  const heightAt = ctx.heightAt;
  const cGrass = new ctx.THREE.Color();
  const cCliff = new ctx.THREE.Color();
  const cBeach = new ctx.THREE.Color();
  const cOut = new ctx.THREE.Color();
  const cTmp = new ctx.THREE.Color();

  const geo = new THREE.PlaneGeometry(190, 130, 110, 80);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);

    /* 草台掩码(与 main.js heightAt 同式,只用于分色带,不算高度) */
    const plat = smooth(30, 6, x) * smooth(56, 34, Math.abs(z + 4));

    /* 土路距离 → 路带宽度;崖带锯齿在路面附近避让,保桥基对位 */
    const dP = distPath(x, z);
    const pathFade = smooth(3.2, 9, dP);

    /* 崖壁竖向褶皱:x 6~30 落差带内给采样 x 加锯齿噪声,
       经坡度放大即成顺坡而下的褶皱;两阶噪声叠出棱线 */
    const band = plat * (1 - plat) * 4;
    const jagA = band * pathFade;
    const fold = vn(x * 0.11 + 3.7, z * 0.52 + 8.1)
               + 0.45 * vn(x * 0.28 + 1.3, z * 1.15 + 4.2);
    const sx = x + fold * 2.1 * jagA;
    let h = heightAt(sx, z) + vn(x * 0.9, z * 0.9) * 0.55 * jagA;

    /* 外缘没入海面:远草地/滩地向外平滑跌到海床,岛才是岛 */
    const shelf = (1 - smooth(40, 68, Math.abs(x + 12)))
                * (1 - smooth(34, 60, Math.abs(z + 4)));
    h = -2.2 + (h + 2.2) * shelf;
    pos.setY(i, h);

    /* 坡度(草色深浅用) */
    const sl = Math.max(
      Math.abs(heightAt(sx + 1.4, z) - h),
      Math.abs(heightAt(sx, z + 1.4) - h)) / 1.4;

    /* --- 草:亮暗斑块 + 陡处偏深 --- */
    const patch = vn(x * 0.13 + 5.2, z * 0.13 + 9.7) * 0.5 + 0.5;
    const gk = Math.min(1, 0.18 + patch * 0.5 + Math.min(0.35, sl * 0.22));
    cGrass.setHex(GRASS_L).lerp(cTmp.setHex(GRASS_D), gk);

    /* --- 崖壁:褶皱明暗 + 地层淡玫瑰 + 崖脚压暗 --- */
    cCliff.setHex(CLIFF_L).lerp(cTmp.setHex(CLIFF_D),
      Math.max(0, Math.min(1, 0.42 + fold * 0.28 - (h - 8) * 0.02)));
    const strata = Math.sin(h * 0.55 + vn(x * 0.3 + 1.1, z * 0.3 + 6.6) * 2.4);
    if (strata > 0.55) cCliff.lerp(cTmp.setHex(STRATA), 0.3 * smooth(0.55, 0.85, strata));
    cCliff.lerp(cTmp.setHex(CLIFF_BOT), 0.45 * smooth(12, 3, h));

    /* --- 碎石滩:砾石斑 + 水线湿痕 --- */
    const peb = vn(x * 0.5 + 2.2, z * 0.5 + 4.4) * 0.5 + 0.5;
    cBeach.setHex(BEACH_L).lerp(cTmp.setHex(BEACH_D), peb * 0.7);
    cBeach.lerp(cTmp.setHex(WET), 0.5 * smooth(1.6, 0.2, h));

    /* --- 按高度混三区:滩(低)→ 崖(中)→ 草(高)--- */
    const wG = smooth(13.5, 16.2, h);
    const wB = 1 - smooth(3.0, 6.0, h);
    const wC = Math.max(0, 1 - wG - wB);
    cOut.setRGB(
      cGrass.r * wG + cCliff.r * wC + cBeach.r * wB,
      cGrass.g * wG + cCliff.g * wC + cBeach.g * wB,
      cGrass.b * wG + cCliff.b * wC + cBeach.b * wB);

    /* 崖缘深绿草唇(ref1 崖顶包边) */
    const lip = smooth(0.75, 0.92, plat) * (1 - smooth(0.97, 0.999, plat));
    if (lip > 0) cOut.lerp(cTmp.setHex(LIP), Math.min(0.7, lip * 0.7));

    /* 水下压暗偏青,透水更俏 */
    cOut.lerp(cTmp.setHex(SEABED), 0.55 * smooth(-0.1, -2.2, h));

    /* --- 土路色带:噪声抖边的软边混合 --- */
    const dE = dP - (vn(x * 0.33 + 7.7, z * 0.33 + 2.9) * 0.5 + 0.5) * 1.2;
    const road = 1 - smooth(1.8, 3.5, dE);
    if (road > 0) cOut.lerp(cTmp.setHex(DIRT), road * 0.9);

    col[i * 3] = cOut.r;
    col[i * 3 + 1] = cOut.g;
    col[i * 3 + 2] = cOut.b;
  }

  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.matrixAutoUpdate = false;

  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.add(mesh);
  return { group };
}
