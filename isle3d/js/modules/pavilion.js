/* ============================================================
   猫岛胜景 · 主亭 + 两座小亭(pavilion.js)
   红柱 · 青瓦双层飞檐 · 白石台基 · 对齐 refs/ref4.png + ref1.png
   全岛视觉主角:屋顶约占亭高一半,檐口大出挑、四角起翘(飞檐)
   台基高度全部对齐 ctx.heightAt,接触阴影用半透明贴地片(禁实时阴影)
   ============================================================ */
import * as THREE from "three";

export function build(ctx) {
  const { THREE, mats } = ctx;

  /* ---------- 工具:合并同材质几何(省 draw call) ---------- */
  function mergeGeos(list) {
    const pos = [], nor = [], uv = [];
    for (const g of list) {
      const ng = g.index ? g.toNonIndexed() : g;
      pos.push(...ng.attributes.position.array);
      nor.push(...ng.attributes.normal.array);
      uv.push(...ng.attributes.uv.array);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    return out;
  }

  /* ---------- 飞檐屋面板:Box 顶点变形(凹曲屋面 + 角部起翘) ---------- */
  // 脊边在 z=0、檐口在 z=l;droop 让檐口下垂成凹弧,lift 让四角起翘成飞檐
  // 再整体 rotateX 给基础坡度,4 块旋转 90° 拼成攒尖方顶
  function eavePanel(w, l, t, drop, lift) {
    const g = new THREE.BoxGeometry(w, t, l, 7, 1, 6);
    g.translate(0, 0, l / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = Math.abs(p.getX(i)) / (w / 2);
      const s = p.getZ(i) / l;
      p.setY(i, p.getY(i) - drop * s * s + lift * u * u * (0.25 + 0.75 * s * s));
    }
    g.rotateX(0.5);                                     // 基础坡度 ≈ 28.6°
    g.computeVertexNormals();
    return g;
  }
  const panel = eavePanel(9.9, 4.95, 0.22, 0.6, 0.9);   // 主亭板(小亭缩放复用)
  const dummy = new THREE.Object3D();

  /* ---------- 实例化辅助 ---------- */
  // 屋顶:layers = [{s 缩放, y 层高}],每层 4 块旋转拼合
  function roofInst(layers) {
    const im = new THREE.InstancedMesh(panel, mats.roof, layers.length * 4);
    let i = 0;
    for (const L of layers) for (let k = 0; k < 4; k++) {
      dummy.position.set(0, L.y, 0);
      dummy.rotation.set(0, k * Math.PI / 2, 0);
      dummy.scale.setScalar(L.s);
      dummy.updateMatrix();
      im.setMatrixAt(i++, dummy.matrix);
    }
    im.computeBoundingSphere();
    return im;
  }
  // 柱 / 枋:pts = [x, y, z, rotY?]
  function instanced(geo, mat, pts) {
    const im = new THREE.InstancedMesh(geo, mat, pts.length);
    pts.forEach((p, i) => {
      dummy.position.set(p[0], p[1], p[2]);
      dummy.rotation.set(0, p[3] || 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.computeBoundingSphere();
    return im;
  }

  /* ---------- 假阴影:细分平面逐点落在 heightAt 上 ---------- */
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x3f3a55, transparent: true, opacity: 0.26, depthWrite: false,
  });
  function shadowSlab(cx, cz, half) {
    const g = new THREE.PlaneGeometry(half * 2, half * 2, 8, 8);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, 0, cz);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, ctx.heightAt(p.getX(i), p.getZ(i)) + 0.2);
    }
    return g;
  }

  const group = new THREE.Group();

  /* ============================================================
     主亭(-34,-6):石台基两层 + 6 红柱 + 檐下枋 + 双层飞檐攒尖
     ============================================================ */
  const main = new THREE.Group();
  main.position.set(-34, ctx.heightAt(-34, -6) - 0.45, -6);
  main.rotation.y = Math.PI / 4;                        // 东南立面朝向相机

  // 石台基:下石色大方 + 上米白方台(附南侧一级踏步),台顶 y≈1.475
  const slab1 = new THREE.Mesh(new THREE.BoxGeometry(7.8, 1.1, 7.8), mats.stone);
  slab1.position.y = 0.25;
  const slab2 = new THREE.Mesh(mergeGeos([
    new THREE.BoxGeometry(6.6, 0.95, 6.6).translate(0, 1.0, 0),
    new THREE.BoxGeometry(3.0, 0.45, 1.0).translate(0, 0.22, 4.15),
  ]), mats.white);

  // 6 根红柱:4 角 + 入口双柱(柱身含 0.28→0.24 收分)
  const pillarGeo = new THREE.CylinderGeometry(0.24, 0.28, 3.3, 8).translate(0, 1.65, 0);
  const pillars = instanced(pillarGeo, mats.pillar, [
    [-2.6, 1.475, -2.6], [2.6, 1.475, -2.6],
    [-2.6, 1.475, 2.6], [2.6, 1.475, 2.6],
    [-1.05, 1.475, 2.6], [1.05, 1.475, 2.6],
  ]);

  // 檐下枋:柱头深木枋一圈(4 根旋转拼方,端头出挑)
  const beamGeo = new THREE.BoxGeometry(6.2, 0.3, 0.34).translate(0, 0, 2.6);
  const beams = instanced(beamGeo, mats.woodD, [
    [0, 4.62, 0, 0], [0, 4.62, 0, Math.PI / 2],
    [0, 4.62, 0, Math.PI], [0, 4.62, 0, Math.PI * 1.5],
  ]);

  // 双层飞檐:下层大出挑,上层收小(0.62),中间白矮墙收口
  const roof = roofInst([{ s: 1, y: 6.3 }, { s: 0.62, y: 7.9 }]);
  const drum = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.75, 2.3), mats.white);
  drum.position.y = 6.475;

  // 攒尖顶座 + 金色顶珠
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.62, 8), mats.roofD);
  socket.position.y = 8.21;
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), mats.gold);
  bead.position.y = 8.6;

  // 亭内小桌 + 两只木凳(同 wood 材质,合并成 1 mesh)
  const tableGeo = mergeGeos([
    new THREE.CylinderGeometry(0.8, 0.8, 0.14, 12).translate(0, 2.43, 1.2),
    new THREE.BoxGeometry(0.12, 0.9, 0.12).translate(0.39, 1.93, 0.81),
    new THREE.BoxGeometry(0.12, 0.9, 0.12).translate(-0.39, 1.93, 0.81),
    new THREE.BoxGeometry(0.12, 0.9, 0.12).translate(0.39, 1.93, 1.59),
    new THREE.BoxGeometry(0.12, 0.9, 0.12).translate(-0.39, 1.93, 1.59),
    new THREE.CylinderGeometry(0.3, 0.32, 0.55, 10).translate(-1.5, 1.75, 1.2),
    new THREE.CylinderGeometry(0.3, 0.32, 0.55, 10).translate(1.5, 1.75, 1.2),
  ]);
  const table = new THREE.Mesh(tableGeo, mats.wood);

  main.add(slab1, slab2, pillars, beams, roof, drum, socket, bead, table);
  group.add(main);

  /* ============================================================
     小亭 ×2(草台上错落):单层飞檐简化版
     ============================================================ */
  function smallPavilion(x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, ctx.heightAt(x, z) - 0.4, z);
    g.rotation.y = ry;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.0, 5.4), mats.white);
    slab.position.y = 0.2;
    const pg = new THREE.CylinderGeometry(0.2, 0.24, 2.35, 8).translate(0, 1.175, 0);
    const pil = instanced(pg, mats.pillar, [
      [-1.85, 0.7, -1.85], [1.85, 0.7, -1.85],
      [-1.85, 0.7, 1.85], [1.85, 0.7, 1.85],
    ]);
    const roof1 = roofInst([{ s: 0.55, y: 4.0 }]);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mats.gold);
    tip.position.y = 4.18;
    g.add(slab, pil, roof1, tip);
    return g;
  }
  group.add(smallPavilion(-14, -18, 0.5), smallPavilion(-46, -16, -0.45));

  /* ---------- 三座亭脚下假阴影(同材质合并,1 draw call) ---------- */
  group.add(new THREE.Mesh(mergeGeos([
    shadowSlab(-34, -6, 4.7),
    shadowSlab(-14, -18, 3.1),
    shadowSlab(-46, -16, 3.1),
  ]), shadowMat));

  /* 静态场景,无逐帧更新(弱核显零开销) */
  return { group };
}
