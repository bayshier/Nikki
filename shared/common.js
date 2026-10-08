/* ============================================================
   Nikki 游戏合集 · 公共系统层
   💰 Wallet 统一钱包 | 📅 Daily 每日挑战 | 🐱 Dex 猫咪图鉴
   所有游戏共用;金币、图鉴跨游戏通用
   ============================================================ */
const Nikki = (() => {
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  /* ---------- 💰 统一钱包 ----------
     兼容迁移:首次访问时,把消消乐存档里的金币(nikki_save.coins)
     迁移进全局钱包(nikki_wallet),之后所有游戏共同读写这一个池子 */
  const Wallet = {
    get() {
      if (localStorage.getItem("nikki_wallet") === null) {
        const sv = jget("nikki_save", {});
        jset("nikki_wallet", sv.coins || 0);   // 一次性迁移
      }
      return jget("nikki_wallet", 0);
    },
    add(n) { const v = this.get() + n; jset("nikki_wallet", v); return v; },
    spend(n) { const v = this.get(); if (v < n) return false; jset("nikki_wallet", v - n); return true; },
  };

  /* ---------- 📅 每日挑战 ----------
     用日期做种子从奖池固定抽一条,当天全员同一任务;
     达标自动发金币奖励,一天仅可领取一次 */
  function today() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  const DAILY_POOL = [
    { gameId: "memory", game: "猫咪配对",   desc: "40 步内完成一局配对", metric: "steps", cmp: "lte", goal: 40,  reward: 100 },
    { gameId: "snake",  game: "猫吃小鱼",   desc: "单局拿到 60 分",      metric: "score", cmp: "gte", goal: 60,   reward: 100 },
    { gameId: "flappy", game: "飞飞猫",     desc: "单局飞过 6 根管道",   metric: "score", cmp: "gte", goal: 6,    reward: 100 },
    { gameId: "whack",  game: "猫咪打地鼠", desc: "单局拿到 120 分",     metric: "score", cmp: "gte", goal: 120,  reward: 100 },
    { gameId: "mario",  game: "猫猫马里奥", desc: "跑过一次终点线 🏁",   metric: "score", cmp: "gte", goal: 1,    reward: 100 },
    { gameId: "td",     game: "猫猫守塔",   desc: "守住 5 波进攻 🏰",    metric: "waves", cmp: "gte", goal: 5,    reward: 100 },
    { gameId: "shmup",  game: "猫猫弹幕",   desc: "单局拿到 1000 分 ✈️", metric: "score", cmp: "gte", goal: 1000, reward: 100 },
    { gameId: "golf",   game: "猫猫高尔夫", desc: "推进 3 个球洞 ⛳",    metric: "holes", cmp: "gte", goal: 3,    reward: 100 },
  ];
  function hash(str) { let h = 0; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }
  function dailyInfo() {
    const d = today();
    const pick = DAILY_POOL[hash(d) % DAILY_POOL.length];
    const st = jget("nikki_daily", {});
    if (st.date !== d) {          // 跨天:重置今日挑战
      jset("nikki_daily", { date: d, gameId: pick.gameId, done: false });
      return { ...pick, done: false, date: d };
    }
    return { ...(DAILY_POOL.find(p => p.gameId === st.gameId) || pick), done: !!st.done, date: d };
  }
  const Daily = {
    today: dailyInfo,
    /* 游戏结束时上报成绩:若正是今日挑战且达标 → 发奖励,返回奖励信息(否则 null) */
    report(gameId, metrics) {
      const d = dailyInfo();
      if (d.done || d.gameId !== gameId) return null;
      const v = metrics[d.metric];
      if (v === undefined) return null;
      const ok = d.cmp === "lte" ? v <= d.goal : v >= d.goal;
      if (!ok) return null;
      const st = jget("nikki_daily", {});
      st.done = true; jset("nikki_daily", st);
      Wallet.add(d.reward);
      const fresh = Dex.check({ dailyDone: true });   // 完成挑战也可能解锁阿狸
      Nikki.announce(fresh);
      return { reward: d.reward };
    },
  };

  /* ---------- 🐱 猫咪图鉴 ----------
     通过各游戏的成就解锁 8 只猫咪的收集进度 */
  const DEX_RULES = [
    { id: "chenpi",   name: "陈皮", how: "消消乐解锁第 3 关",      test: st => (st.unlocked || 0) >= 3 },
    { id: "baozi",    name: "包子", how: "消消乐解锁第 6 关",      test: st => (st.unlocked || 0) >= 6 },
    { id: "niannian", name: "年年", how: "配对 40 步内通关",       test: st => (st.memorySteps || 999) <= 40 },
    { id: "songlu",   name: "松露", how: "猫吃鱼单局 60 分",       test: st => (st.snakeScore || 0) >= 60 },
    { id: "youyu",    name: "有鱼", how: "猫吃鱼单局 120 分",      test: st => (st.snakeScore || 0) >= 120 },
    { id: "jinzhang", name: "警长", how: "打地鼠单局 120 分",      test: st => (st.whackScore || 0) >= 120 },
    { id: "daer",     name: "大儿", how: "飞飞猫飞过 6 根管道",    test: st => (st.flappyScore || 0) >= 6 },
    { id: "ali",      name: "阿狸", how: "完成 1 次每日挑战",      test: st => !!st.dailyDone },
  ];
  const Dex = {
    owned() { const d = jget("nikki_dex", {}); return DEX_RULES.map(r => ({ ...r, owned: !!d[r.id] })); },
    count() { return this.owned().filter(x => x.owned).length; },
    /* 游戏结束时上报统计,评估解锁条件;返回本轮新解锁的猫咪列表 */
    check(stats) {
      const d = jget("nikki_dex", {});
      const fresh = [];
      DEX_RULES.forEach(r => {
        if (!d[r.id] && r.test(stats)) { d[r.id] = 1; fresh.push(r); }
      });
      if (fresh.length) jset("nikki_dex", d);
      return fresh;
    },
  };

  /* ---------- 通用解锁提示(全游戏复用) ---------- */
  function announce(fresh) {
    if (!fresh || !fresh.length) return;
    let delay = 300;
    fresh.forEach(f => {
      setTimeout(() => {
        const t = document.createElement("div");
        t.style.cssText = "position:fixed;left:50%;top:12%;transform:translateX(-50%);background:linear-gradient(135deg,#ff6b9d,#ffd56b);color:#fff;padding:12px 26px;border-radius:99px;font-weight:800;z-index:999;font-size:15px;box-shadow:0 8px 20px rgba(255,107,157,0.5);white-space:nowrap;";
        t.textContent = "🔓 图鉴解锁:" + f.name + "!";
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2600);
      }, delay);
      delay += 900;
    });
  }

  return { Wallet, Daily, Dex, jget, jset, announce };
})();
