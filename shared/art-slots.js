/* ============================================================
   art-slots.js · 美术槽位（借鉴 dsh-game-studio 的 slots 约定）
   每个游戏声明若干"槽位"——一张可选的图片文件与标准尺寸。
   · 谁都没放图时,游戏照旧用代码画的精灵(零依赖不受影响);
   · 往 assets/art/<游戏>/<槽位>.png 丢一张图,刷新即换装。
   这就是 T1「AI 美术」的前置工程:出图渠道恢复后,生成图按文件名
   丢进目录即可,不用改任何游戏代码。
   ============================================================ */
const ArtSlots = (() => {
  const defs = {};        // game -> { slot: { file, size:[w,h] } }
  const imgs = {};        // game -> { slot: HTMLImageElement|null }
  let nseed = 1;

  function define(game, slots) {
    defs[game] = slots;
    imgs[game] = {};
    for (const key in slots) {
      const im = new Image();
      im.onload = () => { imgs[game][key] = im; };
      im.onerror = () => { imgs[game][key] = null; };   // 没放图 = 用代码画的
      im.src = slots[key].file;
    }
  }
  function img(game, key) { return (imgs[game] || {})[key] || null; }

  /* 居中绘制一个槽位;size 是精灵的"逻辑直径"(按声明尺寸等比适配)。
     rot 可选(弧度)。画了返回 true,没图返回 false —— 调用处据此走代码绘制。 */
  function draw(ctx, game, key, x, y, size, rot) {
    const im = img(game, key);
    if (!im || !im.naturalWidth) return false;
    const d = (defs[game] || {})[key] || {};
    const w0 = (d.size && d.size[0]) || im.naturalWidth;
    const h0 = (d.size && d.size[1]) || im.naturalHeight;
    const k = size / Math.max(w0, h0), w = w0 * k, h = h0 * k;
    ctx.save();
    if (rot) { ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(im, -w / 2, -h / 2, w, h); }
    else ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
    ctx.restore();
    return true;
  }

  /* 依次尝试多个槽位(比如先找 enemy-gunner 再退回 enemy) */
  function drawFirst(ctx, game, x, y, size, keys, rot) {
    for (const k of keys) if (draw(ctx, game, k, x, y, size, rot)) return k;
    return null;
  }

  return { define, img, draw, drawFirst, has: (g, k) => !!img(g, k) };
})();