/* =========================================================
   ゲームロジック
   CONFIG / LEVELS / HEROES / YOKAI は config.js で定義しています。
   （config.js を index.html で先に読み込んでください）
   ========================================================= */
const state = {
  mode: 'battle',   // 'battle'（ようかいばとる）か 'shoot'（しゅーてぃんぐ）
  hero: null, hearts: CONFIG.startHearts, score: 0,
  levelIdx: 0, queue: [], current: null,
  yokaiIdx: 0, yokaiHp: CONFIG.yokaiHp, busy: false,
  hintReady: false,   // ヒントどうぐ使用中：つぎの こたえで まちがいを2つ消す
  armedAtkDmg: 0,     // こうげきどうぐで ためた追加ダメージ（つぎの せいかいで 発動）
  guardArmed: false,  // ガードどうぐ使用中：つぎに まちがえても ハートが へらない
  sessionAttempts: 0, // 今回のバトルで答えた回数
  sessionCorrect: 0,  // 今回のバトルで正解した回数
  pendingYokai: null, // ステージえらび中の あいて妖怪
  battleBg: null,     // えらんだ たたかう ばしょ（背景）
  session: 0   // バトルを開始/中断するたびに +1。古いタイマーを無効化するために使う
};

const $ = id => document.getElementById(id);
function show(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); $(id).classList.add('active'); }

/* ---- 見た目（絵文字 or 画像） ----
   config.js の各エントリに img:'images/xxx.png' があれば画像を、
   なければ絵文字 face を表示する。1体ずつ差し替え可能。 */
const IMGV = '5';   // 画像を更新したら ここを上げると 古いキャッシュを無視して読み直す
function imgSrc(e){ return e.img + (e.img.indexOf('?')<0 ? '?v='+IMGV : ''); }
function faceHTML(e){
  return e.img ? '<img class="face-img" src="'+imgSrc(e)+'" alt="'+(e.nm||'')+'">' : e.face;
}
function setFace(el, e){
  if(e.img){ el.innerHTML = '<img class="face-img" src="'+imgSrc(e)+'" alt="'+(e.nm||'')+'">'; }
  else { el.textContent = e.face; }
}
function shuffle(a){ return a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]); }

/* ---- セーブデータ（localStorage に保存） ---- */
const SAVE_KEY = 'hiraganaBattle.progress.v1';
function loadProgress(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(raw){
      const p = JSON.parse(raw);
      return {
        collection: p.collection || {},
        items: p.items || [],
        stats: p.stats || {},
        bestScore: p.bestScore || 0,
        shootBest: p.shootBest || 0,
        mojiBest: p.mojiBest || 0
      };
    }
  }catch(e){}
  return { collection: {}, items: [], stats: {}, bestScore: 0, shootBest: 0, mojiBest: 0 };  // collection: {yokaiId:{count,firstDate,lastDate,lastLevel}} / items: [itemId,...]
}
function saveProgress(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); }catch(e){}
}
const progress = loadProgress();

function totalDefeats(){
  return Object.values(progress.collection).reduce((a, r) => a + (r.count || 0), 0);
}
function renderTitleStats(){
  if(!$('titleBest')) return;
  $('titleBest').textContent = progress.bestScore || 0;
  $('titleYokai').textContent = totalDefeats();
  if($('titleShoot')) $('titleShoot').textContent = progress.shootBest || 0;
  if($('titleMoji')) $('titleMoji').textContent = progress.mojiBest || 0;
}
function updateBestScore(){
  if(state.score > (progress.bestScore || 0)){
    progress.bestScore = state.score;
    saveProgress();
  }
}
function sessionAccuracy(){
  if(!state.sessionAttempts) return 0;
  return Math.round(state.sessionCorrect / state.sessionAttempts * 100);
}
function itemKey(item){
  return (LEVELS[state.levelIdx].name || ('Lv' + (state.levelIdx + 1))) + '::' + item.t;
}
/* 単語ごとの せいせきを 記録する共通処理（ばとる/しゅーてぃんぐ 両方から使う） */
function bumpStat(key, t, level, correct){
  const rec = progress.stats[key] || { t: t, level: level, attempts: 0, correct: 0, wrong: 0, streak: 0 };
  rec.attempts++;
  if(correct){
    rec.correct++;
    rec.streak = Math.max(0, rec.streak) + 1;
  } else {
    rec.wrong++;
    rec.streak = 0;
  }
  progress.stats[key] = rec;
  saveProgress();
}
function recordAnswer(correct){
  if(!state.current) return;
  state.sessionAttempts++;
  if(correct) state.sessionCorrect++;
  bumpStat(itemKey(state.current), state.current.t, state.levelIdx + 1, correct);
}
function scheduleReview(item){
  if(!item || state.queue.some(q => q.t === item.t)) return;
  const pos = Math.min(state.queue.length, 2 + Math.floor(Math.random() * 3));
  state.queue.splice(pos, 0, item);
}

/* 倒した妖怪を図鑑に登録 */
function registerYokai(yk, levelIdx){
  const today = new Date().toLocaleDateString('ja-JP');
  const rec = progress.collection[yk.id] || { count: 0, firstDate: today };
  rec.count++;
  rec.lastDate = today;
  rec.lastLevel = levelIdx + 1;
  progress.collection[yk.id] = rec;
  saveProgress();
}

/* ---- 読み上げ（TTS・マイク不要） ---- */
let jaVoice = null;
/* 日本語音声の中から いちばん自然なものを選ぶ。
   端末によって持っている音声が違うので、上等なもの（Siri/拡張/プレミアム）を優先し、
   機械っぽい compact 版を避ける。 */
function pickVoice(){
  if(!('speechSynthesis' in window)) return null;
  const ja = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('ja'));
  if(!ja.length) return null;
  const score = v => {
    const n = (v.name || '').toLowerCase();
    let s = 0;
    if(/google/.test(n)) s += 100;                        // Google 日本語がいちばん自然（最優先）
    if(/siri/.test(n)) s += 60;                           // Siri音声も自然
    if(/enhanced|premium|neural|拡張|高品質/.test(n)) s += 40;
    if(/o-?ren|otoya|hattori|kyoko/.test(n)) s += 10;    // 既知の良い声
    if(/compact|eloquence/.test(n)) s -= 30;             // 機械っぽいので下げる
    if(!v.localService) s += 5;                           // ネット音声は自然なことが多い
    return s;
  };
  ja.sort((a, b) => score(b) - score(a));
  return ja[0];
}
if('speechSynthesis' in window){
  jaVoice = pickVoice();
  speechSynthesis.onvoiceschanged = () => { jaVoice = pickVoice(); };
}
function speak(text){
  if(!CONFIG.speakPrompt || !('speechSynthesis' in window)) return;
  try{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = CONFIG.rate;
    u.pitch = (CONFIG.pitch != null) ? CONFIG.pitch : 1;
    const v = jaVoice || pickVoice();
    if(v) u.voice = v;
    speechSynthesis.speak(u);
  }catch(e){}
}

/* ---- ヒーロー選択 ---- */
function buildHeroGrid(){
  const g = $('heroGrid'); g.innerHTML = '';
  HEROES.forEach(h => {
    const c = document.createElement('div');
    c.className = 'hero-card';
    c.innerHTML = '<span class="face">'+faceHTML(h)+'</span><div class="nm">'+h.nm+'</div>';
    c.onclick = () => {
      document.querySelectorAll('.hero-card').forEach(x=>x.classList.remove('sel'));
      c.classList.add('sel'); state.hero = h;
      $('goBattle').disabled = false; $('goBattle').style.opacity = 1;
    };
    g.appendChild(c);
  });
}

/* ---- ゲーム ---- */
function startGame(){
  state.session++;
  state.hearts = CONFIG.startHearts; state.score = 0;
  state.levelIdx = 0; state.yokaiIdx = 0;
  state.sessionAttempts = 0; state.sessionCorrect = 0;
  state.hintReady = false;
  state.armedAtkDmg = 0;
  state.guardArmed = false;
  $('heroMon').classList.remove('charged', 'guarding');
  closeItemTray();
  renderTop();
  startLevel();
}
function newQueue(){ state.queue = shuffle(LEVELS[state.levelIdx].items.slice()); }
function yokaiById(id){ return YOKAI.find(y => y.id === id); }

/* レベル開始：もんだいを用意して「ようかいをえらぶ」画面へ */
function startLevel(){
  newQueue();
  openYokaiSelect();
}
/* このレベルの妖怪グループから1体えらばせる（案②） */
function openYokaiSelect(){
  const group = (typeof YOKAI_BY_LEVEL !== 'undefined' && YOKAI_BY_LEVEL[state.levelIdx]) || YOKAI.map(y => y.id);
  $('yokaiSelLv').textContent = state.levelIdx + 1;
  const box = $('yokaiChoices'); box.innerHTML = '';
  group.forEach(id => {
    const yk = yokaiById(id);
    if(!yk) return;
    const b = document.createElement('button');
    b.className = 'yokai-choice';
    b.innerHTML = faceHTML(yk) + '<span class="yc-nm">' + yk.nm + '</span>';
    b.onclick = () => chooseYokai(yk);
    box.appendChild(b);
  });
  show('yokaiSelect');
}
function chooseYokai(yk){
  state.pendingYokai = yk;     // 妖怪を決めて、つぎは ステージえらびへ
  openStageSelect();
}
/* たたかう ばしょ（背景）を えらぶ（ばとる/しゅーてぃんぐ 共通） */
function openStageSelect(){
  $('stageTitle').textContent =
    state.mode === 'shoot' ? ('🚀 れべる ' + (shoot.levelIdx + 1) + '！ どこで たたかう？') :
    state.mode === 'moji'  ? ('🔤 れべる ' + (moji.levelIdx + 1) + '！ どこで たたかう？') :
    '⚔️ どこで たたかう？';
  const box = $('stageChoices'); box.innerHTML = '';
  if(typeof BATTLE_BGS === 'undefined' || !BATTLE_BGS.length){ chooseStage(null); return; }
  BATTLE_BGS.forEach(bg => {
    const b = document.createElement('button');
    b.className = 'stage-choice';
    b.style.backgroundImage = "url('" + bg + "')";
    b.onclick = () => chooseStage(bg);
    box.appendChild(b);
  });
  show('stageSelect');
}
function chooseStage(bg){
  state.battleBg = bg;
  if(state.mode === 'shoot'){ beginShootLevel(bg); return; }
  if(state.mode === 'moji'){ beginMojiLevel(bg); return; }
  spawnYokai(state.pendingYokai);
  renderTop();
  show('battle');
  state.busy = false;
  nextQuestion();
}
/* えらばれた妖怪をバトルにセット */
function spawnYokai(yk){
  state.yokai = yk;
  // バトル背景：えらんだ ステージ（なければ ランダム）
  const field = document.querySelector('.field');
  if(field && typeof BATTLE_BGS !== 'undefined' && BATTLE_BGS.length){
    const bg = state.battleBg || BATTLE_BGS[Math.floor(Math.random() * BATTLE_BGS.length)];
    field.style.backgroundImage = "url('" + bg + "')";
  }
  state.yokaiHpMax = LEVELS[state.levelIdx].hp || CONFIG.yokaiHp;
  state.yokaiHp = state.yokaiHpMax;
  $('yokai').classList.remove('faint', 'hit', 'attack');   // 前のたおれる演出をリセット
  $('heroMon').classList.remove('charged', 'guarding');    // ためた こうげき/まもりは レベルごとにリセット
  state.armedAtkDmg = 0;
  state.guardArmed = false;
  setFace($('yokai'), state.yokai);
  $('enemyName').textContent = state.yokai.nm;
  $('yokaiHp').style.width = '100%';
  // ヒーロー＆レベル表示
  if(state.hero){ setFace($('heroMon'), state.hero); $('heroName').textContent = state.hero.nm; }
  $('heroLv').textContent = state.levelIdx + 1;
  $('enemyLv').textContent = state.levelIdx + 1;
}
function renderTop(){
  let h = '';
  for(let i=0;i<CONFIG.startHearts;i++) h += i < state.hearts ? '❤️' : '🤍';
  $('hearts').textContent = h;
  $('score').textContent = state.score;
}

function nextQuestion(){
  state.busy = false;
  if(state.queue.length === 0) newQueue();
  const item = state.current = state.queue.shift();

  $('pic').textContent = CONFIG.showPromptPic ? (item.p || '') : '';
  $('question').textContent = CONFIG.showPromptText ? ('「'+item.t+'」は どれだ〜！') : 'きいて どれだ〜！';
  buildChoices(item);
  speak(item.t);
}

function buildChoices(item){
  const others = LEVELS[state.levelIdx].items.filter(x => x.t !== item.t);
  const sameLen = shuffle(others.filter(x => x.t.length === item.t.length));
  const diffLen = shuffle(others.filter(x => x.t.length !== item.t.length));
  const pool = sameLen.concat(diffLen); // 同じ文字数を優先（読まないと当てられない）
  const picks = shuffle(pool.slice(0, CONFIG.choiceCount - 1).concat([item]));
  const box = $('choices'); box.innerHTML = '';
  picks.forEach(p => {
    const b = document.createElement('button');
    b.className = 'choice';
    b.textContent = p.t;
    b.onclick = () => choose(b, p.t === item.t);
    box.appendChild(b);
  });
  applyHint();   // ヒントどうぐ使用中なら こたえを ひからせる
}

function choose(btn, correct){
  if(state.busy) return;
  state.busy = true;
  const sid = state.session;   // この回答が属するバトル。中断したら以降の処理は無効

  if(correct){
    recordAnswer(true);
    btn.classList.add('correct');
    const bonus = state.armedAtkDmg;          // どうぐで ためた こうげき
    state.armedAtkDmg = 0;
    $('heroMon').classList.remove('charged');
    state.score++; state.yokaiHp -= (1 + bonus);
    renderTop();
    $('heroMon').classList.add('attack'); setTimeout(()=>$('heroMon').classList.remove('attack'),360);
    const pct = (Math.max(0, state.yokaiHp) / state.yokaiHpMax * 100) + '%';
    fireProjectile($('heroMon'), $('yokai'), 'hero', () => { $('yokaiHp').style.width = pct; }, bonus > 0);  // ためてたら 大きな波動拳

    if(state.yokaiHp <= 0){
      defeatYokai(sid);
      return;
    } else {
      flash('⭕', 'var(--good)');   // まだ続くときだけ ⭕ を出す
      setTimeout(()=>{ if(sid !== state.session) return; nextQuestion(); }, 700);
    }
  } else {
    recordAnswer(false);
    scheduleReview(state.current);
    btn.classList.add('wrong');
    const guarded = state.guardArmed;          // ガードどうぐで まもっていたか
    state.guardArmed = false;
    $('heroMon').classList.remove('guarding');

    if(guarded){
      flash('🛡️', 'var(--good)');             // まもった！ ハートは へらない
    } else {
      flash('❌', 'var(--heart)');
      fireProjectile($('yokai'), $('heroMon'), 'enemy');
      if(CONFIG.penaltyMode === 'score') state.score = Math.max(0, state.score - 1);
      else state.hearts--;
      renderTop();
    }

    if(!guarded && state.hearts <= 0 && CONFIG.penaltyMode === 'heart'){
      setTimeout(()=>{ if(sid !== state.session) return; endGame(false); }, 700);
    } else {
      // 同じ問題のまま、もう一度えらべる（正解を光らせて教える）
      setTimeout(()=>{
        if(sid !== state.session) return;
        document.querySelectorAll('.choice').forEach(c=>{
          if(c.textContent === state.current.t) c.classList.add('correct');
          else c.classList.add('dim');
        });
      }, 450);
      setTimeout(()=>{ if(sid !== state.session) return; state.busy = false; nextQuestion(); }, 1500);
    }
  }
}

function endGame(win){
  updateBestScore();
  renderTitleStats();
  if(win){
    $('clearScore').textContent = state.score;
    $('clearBest').textContent = progress.bestScore || 0;
    $('clearAccuracy').textContent = sessionAccuracy();
    $('clearItems').textContent = progress.items.length;   // もらった どうぐの かず
    $('clearYokai').textContent = totalDefeats();           // たおした ようかいの かず
    show('cleared');
  } else {
    $('overScore').textContent = state.score;
    $('overAccuracy').textContent = sessionAccuracy();
    $('overBest').textContent = progress.bestScore || 0;
    show('over');
  }
}

/* ---- 演出 ---- */
/* 効果音（Web Audio・ファイル不要） */
let audioCtx = null;
function ensureAudio(){
  if(!CONFIG.sound) return null;
  if(!audioCtx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    audioCtx = new AC();
  }
  if(audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function playBeam(kind){
  const ctx = ensureAudio(); if(!ctx) return;
  const t = ctx.currentTime;
  const heavy = kind !== 'enemy';
  const f0 = heavy ? 200 : 150, f1 = heavy ? 46 : 64;   // 低音の下降（ドゥン）
  // 1) 低音の本体（sine）
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + 0.26);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.42, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  osc.connect(g).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.36);
  // 2) 重み用の倍音（triangle）
  const osc2 = ctx.createOscillator(), g2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(f0 * 1.5, t);
  osc2.frequency.exponentialRampToValueAtTime(f1 * 1.5, t + 0.2);
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.exponentialRampToValueAtTime(0.13, t + 0.02);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  osc2.connect(g2).connect(ctx.destination);
  osc2.start(t); osc2.stop(t + 0.26);
  // 3) 空気のウーッシュ（ノイズ＋lowpassを動かす）
  const dur = 0.3;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(); noise.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(heavy ? 900 : 1100, t);
  lp.frequency.exponentialRampToValueAtTime(180, t + 0.28);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.2, t + 0.04);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  noise.connect(lp).connect(ng).connect(ctx.destination);
  noise.start(t); noise.stop(t + dur);
}
/* 大きな こうげきの 爆発音「ドッカーン！」（最初から ドンと くる） */
function playHadouken(){
  const ctx = ensureAudio(); if(!ctx) return;
  const t = ctx.currentTime, dur = 0.9;

  // 1) 「ドッ」… 鋭い破裂のクラック（高めのノイズを一瞬だけ）
  const cb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate);
  const cd = cb.getChannelData(0);
  for(let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1;
  const crack = ctx.createBufferSource(); crack.buffer = cb;
  const chp = ctx.createBiquadFilter(); chp.type = 'highpass'; chp.frequency.value = 1800;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.6, t);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  crack.connect(chp).connect(cg).connect(ctx.destination);
  crack.start(t); crack.stop(t + 0.06);

  // 2) 「ドーン」… 深い爆発の胴鳴り（急降下するキック）
  const kick = ctx.createOscillator(), kg = ctx.createGain();
  kick.type = 'sine';
  kick.frequency.setValueAtTime(180, t);
  kick.frequency.exponentialRampToValueAtTime(38, t + 0.5);   // ストンと低音へ落ちる
  kg.gain.setValueAtTime(0.9, t);                              // 立ち上がりは一瞬（溜めない）
  kg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  kick.connect(kg).connect(ctx.destination);
  kick.start(t); kick.stop(t + dur);

  // 3) サブ低音の ずっしり感
  const sub = ctx.createOscillator(), sg = ctx.createGain();
  sub.type = 'triangle';
  sub.frequency.setValueAtTime(70, t);
  sub.frequency.exponentialRampToValueAtTime(28, t + 0.6);
  sg.gain.setValueAtTime(0.5, t);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  sub.connect(sg).connect(ctx.destination);
  sub.start(t); sub.stop(t + dur);

  // 4) 「カーン／シャーッ」… 爆発のノイズが ゆっくり減衰
  const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for(let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(); noise.buffer = nb;
  const nlp = ctx.createBiquadFilter(); nlp.type = 'lowpass';
  nlp.frequency.setValueAtTime(3500, t);
  nlp.frequency.exponentialRampToValueAtTime(180, t + dur);   // だんだん こもって 遠ざかる
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.7, t);                             // ドンと出て
  ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);      // 長めに減衰
  noise.connect(nlp).connect(ng).connect(ctx.destination);
  noise.start(t); noise.stop(t + dur);
}
function playImpact(){
  const ctx = ensureAudio(); if(!ctx) return;
  const t = ctx.currentTime, dur = 0.25;
  // ノイズの「バシッ」
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for(let i=0;i<data.length;i++){ data[i] = (Math.random()*2-1) * (1 - i/data.length); }
  const noise = ctx.createBufferSource(); noise.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.38, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  noise.connect(lp).connect(ng).connect(ctx.destination);
  noise.start(t); noise.stop(t + dur);
  // 低い「ドン」
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(170, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(g).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.22);
}
/* クリアの「パンパカパーン」ファンファーレ */
function playFanfare(){
  const ctx = ensureAudio(); if(!ctx) return;
  const t0 = ctx.currentTime;
  function note(freq, start, dur, vol){
    const t = t0 + start;
    const o = ctx.createOscillator(), g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const C = 523.25, E = 659.25, G = 783.99, C2 = 1046.5;
  note(C, 0.00, 0.16, 0.16);     // パン
  note(E, 0.16, 0.16, 0.16);     // パカ
  note(G, 0.32, 0.18, 0.16);     // パー
  [C2, G, E].forEach(f => note(f, 0.52, 0.75, 0.12));  // ジャーン（和音）
  // キラッ（シンバル風ノイズ）
  const t = t0 + 0.52, dur = 0.5;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const noise = ctx.createBufferSource(); noise.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4500;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.12, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  noise.connect(hp).connect(ng).connect(ctx.destination);
  noise.start(t); noise.stop(t + dur);
}
/* ことば かんせいの「キラーン♪」（みじかい あかるい音） */
function playKira(){
  const ctx = ensureAudio(); if(!ctx) return;
  const t0 = ctx.currentTime;
  [[880, 0], [1318.5, 0.09], [1760, 0.18]].forEach(([f, st]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t0 + st);
    g.gain.setValueAtTime(0.0001, t0 + st);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + st + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + st + 0.28);
    o.connect(g).connect(ctx.destination);
    o.start(t0 + st); o.stop(t0 + st + 0.32);
  });
}
function screenShake(){
  const app = $('app');
  app.classList.remove('shake'); void app.offsetWidth; app.classList.add('shake');
}

function centerIn(field, el){
  const fr = field.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left + r.width/2 - fr.left, y: r.top + r.height/2 - fr.top };
}
/* 要素の相対位置(fx,fy: 0=左上, 1=右下)の点。発射を手元（上・前）から出すのに使う */
function pointIn(field, el, fx, fy){
  const fr = field.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left + r.width*fx - fr.left, y: r.top + r.height*fy - fr.top };
}
function impact(toEl){
  playImpact(); screenShake();
  toEl.classList.add('hit'); setTimeout(()=>toEl.classList.remove('hit'), 400);
  const field = document.querySelector('.field');
  const c = centerIn(field, toEl);
  const burst = document.createElement('div');
  burst.className = 'burst';
  burst.style.left = c.x + 'px'; burst.style.top = c.y + 'px';
  field.appendChild(burst);
  burst.animate(
    [{ transform:'translate(-50%,-50%) scale(.3)', opacity:1 },
     { transform:'translate(-50%,-50%) scale(6)', opacity:0 }],
    { duration: 360, easing: 'ease-out' }
  ).onfinish = () => burst.remove();
}
function fireProjectile(fromEl, toEl, kind, onImpact, big){
  if(big) playHadouken(); else playBeam(kind);
  const done = () => { impact(toEl); if(onImpact) onImpact(); };
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce){ done(); return; }
  const field = document.querySelector('.field');
  // ポーズに依存しないよう「体のどこか」ではなく "少し前（敵側）" に光の玉が現れて飛ぶ
  const ox = kind === 'enemy' ? -0.02 : 1.02;   // ヒーロー/妖怪の前方ふち
  const s = pointIn(field, fromEl, ox, 0.34);
  const e = pointIn(field, toEl, 0.5, 0.42);    // 着弾は相手の体の少し上
  const p = document.createElement('div');
  p.className = 'projectile ' + kind + (big ? ' big' : '');
  p.style.left = s.x + 'px'; p.style.top = s.y + 'px';
  // 攻撃者（ヒーロー/妖怪）の色にビームを合わせる
  const col = kind === 'enemy' ? (state.yokai && state.yokai.col) : (state.hero && state.hero.col);
  if(col){
    p.style.background = `radial-gradient(ellipse at 72% 50%, #fff, ${col} 44%, ${col}00 78%)`;
    p.style.boxShadow = big ? `0 0 60px 26px ${col}d0` : `0 0 26px 10px ${col}c0`;
  }
  field.appendChild(p);
  const dx = e.x - s.x, dy = e.y - s.y;
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;   // ビームを進行方向へ向ける
  const tx = `calc(-50% ${dx>=0?'+':'-'} ${Math.abs(dx)}px)`;
  const ty = `calc(-50% ${dy>=0?'+':'-'} ${Math.abs(dy)}px)`;
  const endScale = big ? 1.25 : 1;
  const anim = p.animate(
    [{ transform:`translate(-50%,-50%) rotate(${ang}deg) scale(${big?.7:.5})`, opacity:.6 },
     { transform:`translate(${tx}, ${ty}) rotate(${ang}deg) scale(${endScale})`, opacity:1 }],
    { duration: big ? 560 : 420, easing: 'cubic-bezier(.45,0,.75,1)' }
  );
  anim.onfinish = () => { p.remove(); done(); };
}
function flash(symbol, color){
  const f = $('flash'); f.textContent = symbol; f.style.color = color; f.style.fontSize = '';
  f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
}
function flashText(txt, color){
  const f = $('flash'); f.textContent = txt; f.style.color = color; f.style.fontSize = '14vw';
  f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
}
function flashImage(src){
  const p = $('popup'); $('popupImg').src = src;
  p.classList.remove('show'); void p.offsetWidth; p.classList.add('show');
}

/* ---- どうぐ（レベルクリアのごほうび。Aまで＝あつめて表示するだけ） ---- */
function itemById(id){ return ITEMS.find(x => x.id === id); }

/* 妖怪をたおした時の共通処理（通常の正解 と テスト勝利の両方から呼ぶ） */
function defeatYokai(sid){
  registerYokai(state.yokai, state.levelIdx);              // 図鑑に登録
  const wasLast = state.levelIdx >= LEVELS.length - 1;
  // まず妖怪がたおれる演出（約3秒）→ そのあとに「やっつけた」ポップアップ
  const yk = $('yokai');
  yk.classList.remove('attack', 'hit');
  yk.classList.add('faint');
  setTimeout(()=>{
    if(sid !== state.session) return;
    flashImage('images/defeat_popup.png');                 // 「やっつけた」演出カード（1.6秒）
    playFanfare();                                         // パンパカパーン！（毎回のクリアで）
    setTimeout(()=>{ if(sid !== state.session) return; openItemPick(wasLast ? 'final' : 'level'); }, 1600);
  }, 3000);
}
/* 4タイプ（attack/heal/guard/hint）から 1こずつ ランダムに えらぶ */
function pickOnePerEffect(){
  const picks = ['attack', 'heal', 'guard', 'hint'].map(eff => {
    const cands = ITEMS.filter(it => it.effect === eff);
    return cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
  }).filter(Boolean);
  return shuffle(picks);   // 並び順もランダムに
}
function openItemPick(mode){
  const isFinal = (mode === 'final');   // 最後だけ全25種から「3こ えらべる」、通常は4タイプ1こずつ
  state.finalPick = isFinal;
  state.finalPicksLeft = isFinal ? 3 : 0;
  const fc = $('finalCount');
  if(fc){ fc.style.display = isFinal ? '' : 'none'; if(isFinal) updateFinalCount(); }
  const list = isFinal ? ITEMS.slice() : pickOnePerEffect();
  const box = $('itemChoices');
  box.className = 'item-row' + (isFinal ? ' all' : '');
  box.innerHTML = '';
  list.forEach(it => {
    const b = document.createElement('button');
    b.className = 'item-choice eff-' + it.effect;
    b.innerHTML = faceHTML(it) +
      '<span class="ic-text">' +
        '<span class="ic-nm">'+it.nm+'</span>' +
        '<span class="ic-desc">' + (EFFECT_DESC[it.effect] || '') + '</span>' +
      '</span>';
    b.onclick = () => pickItem(it);
    box.appendChild(b);
  });
  show('itemPick');
}
function updateFinalCount(){
  const fc = $('finalCount');
  if(fc) fc.textContent = 'あと ' + state.finalPicksLeft + 'こ えらべるよ！';
}
function pickItem(it){
  progress.items.push(it.id);
  saveProgress();
  if(state.finalPick){
    state.finalPicksLeft--;
    if(state.finalPicksLeft <= 0){
      // 3こ えらび終わったら おめでとう画面へ
      if(state.mode === 'shoot') endShoot(true);
      else if(state.mode === 'moji') endMoji(true);
      else endGame(true);
    } else {
      updateFinalCount();          // まだ えらべる：カウンター更新＆選んだ演出
      popItem(it);
    }
  } else if(state.mode === 'shoot'){
    shoot.levelIdx++;
    setTimeout(openStageSelect, 400);   // 次レベルの「どこで たたかう？」へ
  } else if(state.mode === 'moji'){
    moji.levelIdx++;
    setTimeout(openStageSelect, 400);   // 次レベルの「どこで たたかう？」へ
  } else {
    state.levelIdx++; state.yokaiIdx++;
    renderTop();
    setTimeout(startLevel, 400);   // 次レベルの「ようかいをえらぶ」へ
  }
}

/* ---- ようかいずかん ---- */
function buildZukan(){
  const g = $('zukanGrid'); g.innerHTML = '';
  YOKAI.forEach(yk => {
    const rec = progress.collection[yk.id];
    const card = document.createElement('div');
    card.className = 'zukan-card' + (rec ? '' : ' locked');
    if(rec){
      card.innerHTML =
        '<div class="z-face">'+faceHTML(yk)+'</div>'+
        '<div class="z-nm">'+yk.nm+'</div>'+
        '<div class="z-meta">たおした '+rec.count+'かい<br>れべる '+rec.lastLevel+'<br>'+rec.lastDate+'</div>';
    } else {
      card.innerHTML =
        '<div class="z-face">❓</div>'+
        '<div class="z-nm">？？？</div>'+
        '<div class="z-meta">まだ あえてないよ</div>';
    }
    g.appendChild(card);
  });
}

/* ---- どうぐ一覧（ゲットしたアイテム） ---- */
function buildItems(){
  const g = $('itemGrid'); g.innerHTML = '';
  if(progress.items.length === 0){
    g.innerHTML = '<div class="book-empty">まだ ばとるあいてむが ないよ。<br>ばとるで あつめよう！</div>';
    return;
  }
  // 同じアイテムは1つにまとめて個数を数える
  const counts = {};
  progress.items.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  // ITEMS の並び順で表示（持っているものだけ）
  ITEMS.forEach(it => {
    const n = counts[it.id];
    if(!n) return;
    const d = document.createElement('div');
    d.className = 'item-cell';
    const badge = n > 1 ? '<span class="ic-count">×'+n+'</span>' : '';
    d.innerHTML = badge + faceHTML(it) + '<span class="ic-nm">'+it.nm+'</span>';
    g.appendChild(d);
  });
}

/* ---- どうぐを バトルでつかう ---- */
function ownedItemCounts(){
  const counts = {};
  progress.items.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  return counts;
}
function openItemTray(){
  // げーむ中だけ（ばとる / しゅーてぃんぐ / もじ）
  if(!$('battle').classList.contains('active') &&
     !$('shoot').classList.contains('active') &&
     !$('moji').classList.contains('active')) return;
  buildItemTray();
  $('itemTray').classList.add('show');
}
function closeItemTray(){ $('itemTray').classList.remove('show'); }
/* カテゴリごとの せつめい（トレイに表示） */
const EFFECT_DESC = {
  attack: 'こうげきが つよくなる',
  heal:   '❤️が かいふくする',
  guard:  'まちがえても ❤️が へらない',
  hint:   'ひんとが もらえる'
};
function buildItemTray(){
  const box = $('itemTrayList'); box.innerHTML = '';
  const counts = ownedItemCounts();
  const owned = ITEMS.filter(it => counts[it.id]);
  if(owned.length === 0){
    box.innerHTML = '<div class="tray-empty">まだ どうぐが ないよ。<br>ばとるで かって あつめよう！</div>';
    return;
  }
  owned.forEach(it => {
    const b = document.createElement('button');
    b.className = 'tray-item eff-' + it.effect;
    b.innerHTML =
      '<span class="ti-cnt">×' + counts[it.id] + '</span>' +
      '<span class="ti-face">' + faceHTML(it) + '</span>' +
      '<span class="ti-nm">' + it.nm + '</span>' +
      '<span class="ti-desc">' + (EFFECT_DESC[it.effect] || '') + '</span>';
    b.onclick = () => useItem(it);
    box.appendChild(b);
  });
}
function consumeItem(id){
  const i = progress.items.indexOf(id);
  if(i >= 0) progress.items.splice(i, 1);
  saveProgress();
}
/* 選んだ どうぐを ポップアップ表示 */
function popItem(it){
  const p = $('itemPop');
  $('itemPopImg').src = it.img ? imgSrc(it) : '';
  p.classList.remove('show'); void p.offsetWidth; p.classList.add('show');
}
function useItem(it){
  if($('shoot').classList.contains('active')){ useShootItem(it); return; }
  if($('moji').classList.contains('active')){ useMojiItem(it); return; }
  if(!$('battle').classList.contains('active')) return;
  if(it.effect === 'attack'){
    if(state.yokaiHp <= 0) return;          // もう たおれている
    consumeItem(it.id);
    state.armedAtkDmg += 2;                  // ためる：つぎの せいかいで 大きな波動拳！
    $('heroMon').classList.add('charged');
    closeItemTray();
    popItem(it);                             // 「じゅんびOK！」：選んだ どうぐが ポップアップ
  } else if(it.effect === 'heal'){
    if(state.hearts >= CONFIG.startHearts) return;  // 満タンなら使わない（トレイはそのまま）
    consumeItem(it.id);
    state.hearts = Math.min(CONFIG.startHearts, state.hearts + 1);
    renderTop();
    closeItemTray();
    popItem(it);
  } else if(it.effect === 'guard'){
    if(state.guardArmed) return;             // すでに ガード中なら むだづかいしない
    consumeItem(it.id);
    state.guardArmed = true;                 // ためる：つぎに まちがえても ハートが へらない
    $('heroMon').classList.add('guarding');
    closeItemTray();
    popItem(it);
  } else if(it.effect === 'hint'){
    consumeItem(it.id);
    state.hintReady = true;
    closeItemTray();
    popItem(it);
    applyHint();                            // いま出ている問題にも すぐ反映
  }
  buildItemTray();                          // 残りのトレイ表示を更新（次に開いた時のため）
}
function applyHint(){
  if(!state.hintReady || !state.current) return;
  const cs = Array.from(document.querySelectorAll('#choices .choice'));
  if(!cs.length) return;
  // まちがいの 選択肢を 2つ 消して えらびやすくする
  const wrongs = shuffle(cs.filter(c => c.textContent !== state.current.t && !c.classList.contains('removed')));
  wrongs.slice(0, 2).forEach(c => { c.classList.add('removed'); c.disabled = true; });
  state.hintReady = false;                  // 1問ぶんで つかいきり
}

/* =========================================================
   しゅーてぃんぐ（🚀 ミニゲーム）
   きこえた ことばの ようかいを タップして うちおとす。
   ことばは ばとると おなじ LEVELS。せいせきも おなじ stats に記録。
   ========================================================= */
const SHOOT_CFG = (typeof SHOOT !== 'undefined') ? SHOOT
  : { hearts: 5, baseFall: 13, minFall: 6, levelStep: 0.9 };
const shoot = {
  on: false, busy: false, hearts: 0, score: 0,
  levelIdx: 0, quota: 0,            // quota: このレベルで あと何体 うちおとすか
  attempts: 0, correctCount: 0,     // せいかいりつ用
  armedAtk: false,                  // こうげきどうぐ：つぎの めいちゅうで 大きなビーム（2たいぶん・とくてん2ばい）
  guardArmed: false,                // ガードどうぐ：つぎの しっぱいで ❤️が へらない
  hintReady: false,                 // ひんとどうぐ：まちがいの ようかい2体が きえる
  enemies: [], target: null,
  raf: 0, last: 0,
  session: 0   // ホームに戻る/やりなおすたびに +1。古いタイマーを無効化
};
function recordShootAnswer(correct){
  const key = (LEVELS[shoot.levelIdx].name || ('Lv' + (shoot.levelIdx + 1))) + '::' + shoot.target.t;
  bumpStat(key, shoot.target.t, shoot.levelIdx + 1, correct);
  shoot.attempts++;
  if(correct) shoot.correctCount++;
}
function shootAccuracy(){
  if(!shoot.attempts) return 0;
  return Math.round(shoot.correctCount / shoot.attempts * 100);
}
/* しゅーてぃんぐ開始：ばとると同じ れべる1〜9。まず「どこで たたかう？」へ */
function startShoot(){
  shoot.session++;
  shoot.levelIdx = 0;
  shoot.hearts = SHOOT_CFG.hearts; shoot.score = 0;
  shoot.attempts = 0; shoot.correctCount = 0;
  openStageSelect();
}
/* れべる開始（ステージを えらんだあと chooseStage から呼ばれる） */
function beginShootLevel(bg){
  shoot.on = true; shoot.busy = false;
  shoot.quota = LEVELS[shoot.levelIdx].hp || CONFIG.yokaiHp;   // ばとるの妖怪HPと同じ数
  shoot.armedAtk = false; shoot.guardArmed = false; shoot.hintReady = false;
  const f = $('shootField');
  const chosen = bg || ((typeof BATTLE_BGS !== 'undefined' && BATTLE_BGS.length)
    ? BATTLE_BGS[Math.floor(Math.random() * BATTLE_BGS.length)] : null);
  if(chosen) f.style.backgroundImage = "url('" + chosen + "')";
  if(state.hero) setFace($('shootHero'), state.hero);
  $('shootHero').classList.remove('charged', 'guarding');
  closeItemTray();
  renderShootTop();
  show('shoot');
  shootWave();
  shoot.last = performance.now();
  cancelAnimationFrame(shoot.raf);
  shoot.raf = requestAnimationFrame(shootLoop);
}
function renderShootTop(){
  let h = '';
  for(let i = 0; i < SHOOT_CFG.hearts; i++) h += i < shoot.hearts ? '❤️' : '🤍';
  $('shootHearts').textContent = h;
  $('shootQuota').textContent = Math.max(0, shoot.quota);
  $('shootScore').textContent = shoot.score;
}
function clearShootEnemies(){
  shoot.enemies.forEach(en => en.el.remove());
  shoot.enemies = [];
}
/* つぎの もんだい：ようかい3体が ことばの札を持って 落ちてくる */
function shootWave(){
  clearShootEnemies();
  shoot.busy = false;
  // ことばは いまのレベルのもの（ばとると同じ もんだいデータ）
  const items = LEVELS[shoot.levelIdx].items;
  const target = items[Math.floor(Math.random() * items.length)];
  shoot.target = target;
  // まちがい2つ（おなじ文字数を ゆうせん）
  const others = items.filter(w => w.t !== target.t);
  const sameLen = shuffle(others.filter(w => w.t.length === target.t.length));
  const diffLen = shuffle(others.filter(w => w.t.length !== target.t.length));
  const words = shuffle([target].concat(sameLen.concat(diffLen).slice(0, 2)));
  // おちる はやさ：れべるが あがるほど はやい
  const dur = Math.max(SHOOT_CFG.minFall, SHOOT_CFG.baseFall - shoot.levelIdx * SHOOT_CFG.levelStep);
  const lanes = shuffle([17, 50, 83]);   // 3れーん（よこ位置%）
  const f = $('shootField');
  words.forEach((w, i) => {
    const yk = YOKAI[Math.floor(Math.random() * YOKAI.length)];
    const el = document.createElement('div');
    el.className = 'shoot-enemy';
    el.innerHTML = '<span class="se-face">' + faceHTML(yk) + '</span><span class="se-word">' + w.t + '</span>';
    el.style.left = lanes[i] + '%';
    const y = -18 - i * 16;   // 時間差で とうじょう（正解の順番は words が shuffle 済みでランダム）
    el.style.top = y + '%';
    f.appendChild(el);
    const en = { el: el, item: w, y: y, vy: 100 / dur * (0.92 + Math.random() * 0.2) };
    el.onpointerdown = () => shootTap(en);
    shoot.enemies.push(en);
  });
  if(shoot.hintReady) applyShootHint();   // ひんとどうぐが たまっていたら すぐ きく
  speak(target.t);
}
function shootLoop(now){
  if(!shoot.on) return;
  const dt = Math.min(0.05, (now - shoot.last) / 1000);   // タブ復帰時に ワープしないよう上限
  shoot.last = now;
  if(!shoot.busy){
    for(const en of shoot.enemies.slice()){
      en.y += en.vy * dt;
      en.el.style.top = en.y + '%';
      if(en.y >= 72) shootLanded(en);
      if(shoot.busy) break;
    }
  }
  shoot.raf = requestAnimationFrame(shootLoop);
}
/* ようかいが 下まで おりてきた */
function shootLanded(en){
  if(en.item.t === shoot.target.t){
    // せいかいの ようかいを のがした → こうげきされる！
    shoot.busy = true;
    recordShootAnswer(false);
    const guarded = shoot.guardArmed;
    shoot.guardArmed = false;
    $('shootHero').classList.remove('guarding');
    if(guarded){
      flash('🛡️', 'var(--good)');   // まもった！ ハートは へらない
    } else {
      playImpact(); screenShake();
      flash('❌', 'var(--heart)');
      shoot.hearts--;
      renderShootTop();
    }
    const sid = shoot.session;
    setTimeout(() => {
      if(sid !== shoot.session) return;
      if(shoot.hearts <= 0) endShoot(false); else shootWave();
    }, 900);
  } else {
    // まちがいの ようかいは しずかに きえる（のこった正解が ヒントになる）
    removeShootEnemy(en, true);
  }
}
function removeShootEnemy(en, puff){
  const i = shoot.enemies.indexOf(en);
  if(i >= 0) shoot.enemies.splice(i, 1);
  if(puff){
    en.el.style.pointerEvents = 'none';
    en.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 }).onfinish = () => en.el.remove();
  } else {
    en.el.remove();
  }
}
function shootTap(en){
  if(!shoot.on || shoot.busy) return;
  if(en.item.t === shoot.target.t){
    shoot.busy = true;
    recordShootAnswer(true);
    shootFire(en);
  } else {
    recordShootAnswer(false);
    en.el.classList.add('hit');
    removeShootEnemy(en, true);
    const guarded = shoot.guardArmed;
    shoot.guardArmed = false;
    $('shootHero').classList.remove('guarding');
    if(guarded){
      flash('🛡️', 'var(--good)');   // まもった！ ハートは へらない
    } else {
      flash('❌', 'var(--heart)');
      shoot.hearts--;
      renderShootTop();
    }
    if(shoot.hearts <= 0){
      shoot.busy = true;
      const sid = shoot.session;
      setTimeout(() => { if(sid === shoot.session) endShoot(false); }, 700);
    } else {
      speak(shoot.target.t);   // もういちど きかせてあげる
    }
  }
}
/* ヒーローが ビームで うちおとす（こうげきどうぐを ためていたら 大きなビーム） */
function shootFire(en){
  const big = shoot.armedAtk;
  shoot.armedAtk = false;
  $('shootHero').classList.remove('charged');
  if(big) playHadouken(); else playBeam('hero');
  const f = $('shootField');
  const s = pointIn(f, $('shootHero'), 0.5, 0.15);
  const e = pointIn(f, en.el, 0.5, 0.4);
  const p = document.createElement('div');
  p.className = 'projectile hero' + (big ? ' big' : '');
  p.style.left = s.x + 'px'; p.style.top = s.y + 'px';
  const col = state.hero && state.hero.col;
  if(col){
    p.style.background = `radial-gradient(ellipse at 72% 50%, #fff, ${col} 44%, ${col}00 78%)`;
    p.style.boxShadow = big ? `0 0 60px 26px ${col}d0` : `0 0 26px 10px ${col}c0`;
  }
  f.appendChild(p);
  const dx = e.x - s.x, dy = e.y - s.y;
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;
  const tx = `calc(-50% ${dx>=0?'+':'-'} ${Math.abs(dx)}px)`;
  const ty = `calc(-50% ${dy>=0?'+':'-'} ${Math.abs(dy)}px)`;
  const sid = shoot.session;
  const anim = p.animate(
    [{ transform: `translate(-50%,-50%) rotate(${ang}deg) scale(${big ? .7 : .5})`, opacity: .6 },
     { transform: `translate(${tx}, ${ty}) rotate(${ang}deg) scale(${big ? 1.25 : 1})`, opacity: 1 }],
    { duration: big ? 320 : 240, easing: 'cubic-bezier(.45,0,.75,1)' }
  );
  anim.onfinish = () => {
    p.remove();
    if(sid !== shoot.session) return;
    shootHit(en, big);
  };
}
/* めいちゅう！ ばくはつ → とくてん加算（むずかしい ことばほど 高得点） → つぎへ */
function shootHit(en, big){
  const f = $('shootField');
  const c = centerIn(f, en.el);
  const b = document.createElement('div');
  b.className = 'burst';
  b.style.left = c.x + 'px'; b.style.top = c.y + 'px';
  f.appendChild(b);
  b.animate(
    [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 },
     { transform: 'translate(-50%,-50%) scale(7)', opacity: 0 }],
    { duration: 380, easing: 'ease-out' }
  ).onfinish = () => b.remove();
  playImpact(); screenShake();
  // とくてん：れべる1のことば=1てん…れべる9=9てん。大きなビームなら 2ばい＆2たいぶん
  const pts = (shoot.levelIdx + 1) * (big ? 2 : 1);
  shoot.score += pts;
  shoot.quota -= (big ? 2 : 1);
  ptsPop(f, c, pts);
  renderShootTop();
  clearShootEnemies();
  flash('⭕', 'var(--good)');
  const sid = shoot.session;
  if(shoot.quota <= 0){
    shootLevelClear(sid);
  } else {
    setTimeout(() => { if(sid === shoot.session) shootWave(); }, 750);
  }
}
/* とくてんの「+N」が とびだす */
function ptsPop(f, c, pts){
  const d = document.createElement('div');
  d.className = 'pts-pop';
  d.textContent = '+' + pts;
  d.style.left = c.x + 'px'; d.style.top = c.y + 'px';
  f.appendChild(d);
  d.animate(
    [{ transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 },
     { transform: 'translate(-50%,-90%) scale(1.2)', opacity: 1, offset: .25 },
     { transform: 'translate(-50%,-220%) scale(1)', opacity: 0 }],
    { duration: 900, easing: 'ease-out' }
  ).onfinish = () => d.remove();
}
/* れべるクリア！ ばとると同じ「やっつけた」演出 → どうぐえらび */
function shootLevelClear(sid){
  shoot.on = false;                 // 落下ループ停止
  cancelAnimationFrame(shoot.raf);
  const wasLast = shoot.levelIdx >= LEVELS.length - 1;
  setTimeout(() => {
    if(sid !== shoot.session) return;
    flashImage('images/defeat_popup.png');   // 「やっつけた」演出カード
    playFanfare();                           // パンパカパーン！
    setTimeout(() => { if(sid !== shoot.session) return; openItemPick(wasLast ? 'final' : 'level'); }, 1600);
  }, 700);
}
/* おわり：win=true なら おめでとう画面（ばとると同じ）、false なら げーむおーばー */
function endShoot(win){
  shoot.on = false;
  cancelAnimationFrame(shoot.raf);
  clearShootEnemies();
  closeItemTray();
  if(shoot.score > (progress.shootBest || 0)) progress.shootBest = shoot.score;
  saveProgress();
  renderTitleStats();
  if(win){
    $('clearScore').textContent = shoot.score;
    $('clearBest').textContent = progress.shootBest || 0;
    $('clearAccuracy').textContent = shootAccuracy();
    $('clearItems').textContent = progress.items.length;
    $('clearYokai').textContent = totalDefeats();
    show('cleared');
  } else {
    $('shootOverScore').textContent = shoot.score;
    $('shootOverBest').textContent = progress.shootBest || 0;
    show('shootOver');
  }
}
function quitShoot(){
  shoot.on = false;
  shoot.session++;
  cancelAnimationFrame(shoot.raf);
  clearShootEnemies();
  closeItemTray();
  if('speechSynthesis' in window){ try{ speechSynthesis.cancel(); }catch(e){} }
  renderTitleStats();
  show('title');
}
/* ---- どうぐを しゅーてぃんぐで つかう（もちものは ばとると共通） ---- */
function useShootItem(it){
  if(it.effect === 'attack'){
    if(shoot.armedAtk) return;               // すでに ためている
    consumeItem(it.id);
    shoot.armedAtk = true;                   // つぎの めいちゅうで 大きなビーム！
    $('shootHero').classList.add('charged');
    closeItemTray();
    popItem(it);
  } else if(it.effect === 'heal'){
    if(shoot.hearts >= SHOOT_CFG.hearts) return;   // 満タンなら使わない
    consumeItem(it.id);
    shoot.hearts = Math.min(SHOOT_CFG.hearts, shoot.hearts + 1);
    renderShootTop();
    closeItemTray();
    popItem(it);
  } else if(it.effect === 'guard'){
    if(shoot.guardArmed) return;             // すでに ガード中
    consumeItem(it.id);
    shoot.guardArmed = true;
    $('shootHero').classList.add('guarding');
    closeItemTray();
    popItem(it);
  } else if(it.effect === 'hint'){
    consumeItem(it.id);
    shoot.hintReady = true;
    closeItemTray();
    popItem(it);
    applyShootHint();                        // いまの もんだいにも すぐ きく
  }
  buildItemTray();
}
/* ひんと：まちがいの ようかい2体が きえる（のこるのは せいかいだけ） */
function applyShootHint(){
  if(!shoot.hintReady) return;
  const wrongs = shoot.enemies.filter(e => e.item.t !== shoot.target.t);
  if(!wrongs.length) return;
  wrongs.forEach(e => removeShootEnemy(e, true));
  shoot.hintReady = false;
}

/* =========================================================
   もじを とりもどせ！（🔤 ミニゲーム）
   ようかいが ことばの もじを かくしている。ただしい もじタイルを
   えらぶと もじビームで ようかいを たおして もじを とりもどせる。
   ことばは ばとると同じ LEVELS。れべるで 穴のばしょが むずかしくなる。
   ========================================================= */
const MOJI_CFG = (typeof MOJI !== 'undefined') ? MOJI : { hearts: 5, tiles: 8 };
const moji = {
  on: false, busy: false, hearts: 0, score: 0,
  levelIdx: 0, quota: 0,            // quota: このレベルで あと何この ことばを かんせいさせるか
  attempts: 0, correctCount: 0,     // せいかいりつ用
  armedAtk: false,                  // こうげきどうぐ：つぎの せいかいで 大きなもじビーム（とくてん2ばい）
  guardArmed: false,                // ガードどうぐ：つぎの しっぱいで ❤️が へらない
  word: null, holes: [],            // holes: [{pos, ch, done, el}]
  usedWords: [],                    // このレベルで もう出した ことば（かたよらないように）
  session: 0
};
function recordMojiAnswer(correct){
  const key = (LEVELS[moji.levelIdx].name || ('Lv' + (moji.levelIdx + 1))) + '::' + moji.word.t;
  bumpStat(key, moji.word.t, moji.levelIdx + 1, correct);
  moji.attempts++;
  if(correct) moji.correctCount++;
}
function mojiAccuracy(){
  if(!moji.attempts) return 0;
  return Math.round(moji.correctCount / moji.attempts * 100);
}
/* かいし：れべる1から。まず「どこで たたかう？」へ */
function startMoji(){
  moji.session++;
  moji.levelIdx = 0;
  moji.hearts = MOJI_CFG.hearts; moji.score = 0;
  moji.attempts = 0; moji.correctCount = 0;
  openStageSelect();
}
/* れべる開始（ステージを えらんだあと chooseStage から呼ばれる） */
function beginMojiLevel(bg){
  moji.on = true; moji.busy = false;
  moji.quota = LEVELS[moji.levelIdx].hp || CONFIG.yokaiHp;   // ばとるの妖怪HPと同じ数の ことば
  moji.armedAtk = false; moji.guardArmed = false;
  moji.usedWords = [];
  const f = $('mojiField');
  const chosen = bg || ((typeof BATTLE_BGS !== 'undefined' && BATTLE_BGS.length)
    ? BATTLE_BGS[Math.floor(Math.random() * BATTLE_BGS.length)] : null);
  if(chosen) f.style.backgroundImage = "url('" + chosen + "')";
  if(state.hero) setFace($('mojiHero'), state.hero);
  $('mojiHero').classList.remove('charged', 'guarding');
  closeItemTray();
  renderMojiTop();
  show('moji');
  mojiNext();
}
function renderMojiTop(){
  let h = '';
  for(let i = 0; i < MOJI_CFG.hearts; i++) h += i < moji.hearts ? '❤️' : '🤍';
  $('mojiHearts').textContent = h;
  $('mojiQuota').textContent = Math.max(0, moji.quota);
  $('mojiScore').textContent = moji.score;
}
/* 穴のばしょ：れべるが あがるほど むずかしい ばしょ・かず に */
function mojiHolePositions(t, li){
  const n = t.length;
  const all = Array.from({ length: n }, (_, i) => i);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  // そのレベルの「とくべつな もじ」を ゆうせんして かくす（てんてん/まる/っ/ー/ゃゅょ）
  const SPECIAL = {
    4: 'がぎぐげござじずぜぞだぢづでどばびぶべぼ',
    5: 'ぱぴぷぺぽ',
    6: 'っ',
    7: 'ー',
    8: 'ゃゅょ'
  };
  const specialPos = SPECIAL[li] ? all.filter(i => SPECIAL[li].indexOf(t[i]) >= 0) : [];
  if(li === 0) return [0];                 // れべる1: せんとう
  if(li === 1) return [n - 1];             // れべる2: さいご
  if(li === 2) return [Math.floor(n / 2)]; // れべる3: まんなか
  if(li === 3) return [pick(all)];         // れべる4: ランダム
  if(li <= 5) return [specialPos.length ? pick(specialPos) : pick(all)];   // れべる5-6: とくべつな もじ
  // れべる7-9: 2つ（とくべつな もじを 1つ ふくめる）
  const first = specialPos.length ? pick(specialPos) : pick(all);
  if(n < 3) return [first];
  const rest = all.filter(i => i !== first);
  return [first, pick(rest)].sort((a, b) => a - b);
}
/* もじタイル8まい：こたえ＋にている もじ＋このレベルの もじ */
function mojiBuildTiles(){
  const answers = [];
  moji.holes.forEach(h => { if(answers.indexOf(h.ch) < 0) answers.push(h.ch); });
  const pool = [];
  const add = ch => {
    if(ch && answers.indexOf(ch) < 0 && pool.indexOf(ch) < 0) pool.push(ch);
  };
  // にている もじを ゆうせんして まぜる（よくみて！）
  answers.forEach(ch => {
    const sim = (typeof SIMILAR_KANA !== 'undefined' && SIMILAR_KANA[ch]) || '';
    sim.split('').forEach(add);
  });
  // のこりは このレベルの ことばに 出てくる もじから
  shuffle(LEVELS[moji.levelIdx].items.map(it => it.t).join('').split('')).forEach(add);
  // まだ たりなければ 五十音から
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'
    .split('').forEach(add);
  return shuffle(answers.concat(pool.slice(0, MOJI_CFG.tiles - answers.length)));
}
/* つぎの ことば */
function mojiNext(){
  moji.busy = false;
  $('mojiWord').classList.remove('done');
  const items = LEVELS[moji.levelIdx].items;
  let cands = items.filter(it => moji.usedWords.indexOf(it.t) < 0);
  if(!cands.length){ moji.usedWords = []; cands = items; }
  const item = cands[Math.floor(Math.random() * cands.length)];
  moji.usedWords.push(item.t);
  moji.word = item;
  moji.holes = mojiHolePositions(item.t, moji.levelIdx)
    .map(p => ({ pos: p, ch: item.t[p], done: false, el: null }));
  // ことばマス（かくされた ところに ようかい）
  const w = $('mojiWord'); w.innerHTML = '';
  w.style.setProperty('--n', item.t.length);
  item.t.split('').forEach((ch, i) => {
    const hole = moji.holes.find(h => h.pos === i);
    const d = document.createElement('div');
    if(hole){
      d.className = 'moji-slot hole';
      const yk = YOKAI[Math.floor(Math.random() * YOKAI.length)];
      d.innerHTML = '<span class="ms-yk">' + faceHTML(yk) + '</span>';
      hole.el = d;
    } else {
      d.className = 'moji-slot okay';
      d.textContent = ch;
    }
    w.appendChild(d);
  });
  // もじタイル
  const g = $('mojiTiles'); g.innerHTML = '';
  mojiBuildTiles().forEach(ch => {
    const b = document.createElement('button');
    b.className = 'moji-tile';
    b.textContent = ch;
    b.onclick = () => mojiTap(b, ch);
    g.appendChild(b);
  });
  $('mojiPic').textContent = item.p || '';   // 絵ヒント（もじ探しゲームなので出してOK）
  speak(item.t);
}
function mojiTap(btn, ch){
  if(!moji.on || moji.busy || btn.disabled) return;
  const hole = moji.holes.find(h => !h.done && h.ch === ch);
  if(hole){
    moji.busy = true;
    recordMojiAnswer(true);
    btn.classList.add('good');
    mojiBeam(hole);
  } else {
    recordMojiAnswer(false);
    btn.classList.add('wrong');
    setTimeout(() => { btn.classList.remove('wrong'); btn.classList.add('dim'); btn.disabled = true; }, 450);
    // ようかいが わらう
    moji.holes.filter(h => !h.done).forEach(h => {
      h.el.classList.add('laugh');
      setTimeout(() => h.el.classList.remove('laugh'), 550);
    });
    const guarded = moji.guardArmed;
    moji.guardArmed = false;
    $('mojiHero').classList.remove('guarding');
    if(guarded){
      flash('🛡️', 'var(--good)');   // まもった！ ハートは へらない
    } else {
      flash('❌', 'var(--heart)');
      moji.hearts--;
      renderMojiTop();
    }
    if(moji.hearts <= 0){
      moji.busy = true;
      const sid = moji.session;
      setTimeout(() => { if(sid === moji.session) endMoji(false); }, 700);
    } else {
      speak(moji.word.t);   // もういちど きかせてあげる
    }
  }
}
/* もじビーム：ヒーローから もじが とんでいく */
function mojiBeam(hole){
  const big = moji.armedAtk;
  moji.armedAtk = false;
  $('mojiHero').classList.remove('charged');
  if(big) playHadouken(); else playBeam('hero');
  const f = $('mojiField');
  const s = pointIn(f, $('mojiHero'), 0.5, 0.15);
  const e = centerIn(f, hole.el);
  const p = document.createElement('div');
  p.className = 'moji-beam' + (big ? ' big' : '');
  p.textContent = hole.ch;
  const col = state.hero && state.hero.col;
  if(col) p.style.textShadow = `0 0 18px ${col}, 0 0 36px ${col}`;
  p.style.left = s.x + 'px'; p.style.top = s.y + 'px';
  f.appendChild(p);
  const sid = moji.session;
  p.animate(
    [{ transform: 'translate(-50%,-50%) scale(.6) rotate(-8deg)', opacity: .7 },
     { transform: `translate(calc(-50% + ${e.x - s.x}px), calc(-50% + ${e.y - s.y}px)) scale(1.15) rotate(6deg)`, opacity: 1 }],
    { duration: 340, easing: 'cubic-bezier(.4,0,.8,1)' }
  ).onfinish = () => {
    p.remove();
    if(sid !== moji.session) return;
    mojiHitHole(hole, big);
  };
}
/* めいちゅう！ ようかい たいさん → もじが スポッと はいる */
function mojiHitHole(hole, big){
  hole.done = true;
  playImpact(); screenShake();
  const f = $('mojiField');
  const c = centerIn(f, hole.el);
  const b = document.createElement('div');
  b.className = 'burst';
  b.style.left = c.x + 'px'; b.style.top = c.y + 'px';
  f.appendChild(b);
  b.animate(
    [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 },
     { transform: 'translate(-50%,-50%) scale(6)', opacity: 0 }],
    { duration: 360, easing: 'ease-out' }
  ).onfinish = () => b.remove();
  hole.el.classList.remove('hole');
  hole.el.classList.add('okay', 'pop');
  hole.el.textContent = hole.ch;
  // とくてん：れべるNの もじ=Nてん（大きなビームなら 2ばい）
  const pts = (moji.levelIdx + 1) * (big ? 2 : 1);
  moji.score += pts;
  ptsPop(f, c, pts);
  renderMojiTop();
  // もう つかわない もじタイルは おやすみ
  document.querySelectorAll('#mojiTiles .moji-tile').forEach(t => {
    if(t.textContent === hole.ch && !moji.holes.some(h => !h.done && h.ch === hole.ch)){
      t.disabled = true; t.classList.add('used');
    }
  });
  const sid = moji.session;
  if(moji.holes.every(h => h.done)){
    setTimeout(() => { if(sid === moji.session) mojiWordComplete(); }, 350);
  } else {
    moji.busy = false;   // まだ かくれた もじが ある
  }
}
/* ことば かんせい！ */
function mojiWordComplete(){
  playKira();
  $('mojiWord').classList.add('done');
  flash('⭕', 'var(--good)');
  moji.quota--;
  renderMojiTop();
  const sid = moji.session;
  if(moji.quota <= 0){
    mojiLevelClear(sid);
  } else {
    setTimeout(() => { if(sid === moji.session) mojiNext(); }, 1400);
  }
}
/* れべるクリア！ ばとると同じ「やっつけた」演出 → どうぐえらび */
function mojiLevelClear(sid){
  moji.on = false;
  const wasLast = moji.levelIdx >= LEVELS.length - 1;
  setTimeout(() => {
    if(sid !== moji.session) return;
    flashImage('images/defeat_popup.png');
    playFanfare();
    setTimeout(() => { if(sid !== moji.session) return; openItemPick(wasLast ? 'final' : 'level'); }, 1600);
  }, 1200);
}
/* おわり：win=true なら おめでとう画面（ばとると同じ）、false なら げーむおーばー */
function endMoji(win){
  moji.on = false;
  closeItemTray();
  if(moji.score > (progress.mojiBest || 0)) progress.mojiBest = moji.score;
  saveProgress();
  renderTitleStats();
  if(win){
    $('clearScore').textContent = moji.score;
    $('clearBest').textContent = progress.mojiBest || 0;
    $('clearAccuracy').textContent = mojiAccuracy();
    $('clearItems').textContent = progress.items.length;
    $('clearYokai').textContent = totalDefeats();
    show('cleared');
  } else {
    $('mojiOverScore').textContent = moji.score;
    $('mojiOverBest').textContent = progress.mojiBest || 0;
    show('mojiOver');
  }
}
function quitMoji(){
  moji.on = false;
  moji.session++;
  closeItemTray();
  if('speechSynthesis' in window){ try{ speechSynthesis.cancel(); }catch(e){} }
  renderTitleStats();
  show('title');
}
/* ---- どうぐを もじゲームで つかう（もちものは ばとると共通） ---- */
function useMojiItem(it){
  if(it.effect === 'attack'){
    if(moji.armedAtk) return;                // すでに ためている
    consumeItem(it.id);
    moji.armedAtk = true;                    // つぎの せいかいで 大きなもじビーム！
    $('mojiHero').classList.add('charged');
    closeItemTray();
    popItem(it);
  } else if(it.effect === 'heal'){
    if(moji.hearts >= MOJI_CFG.hearts) return;
    consumeItem(it.id);
    moji.hearts = Math.min(MOJI_CFG.hearts, moji.hearts + 1);
    renderMojiTop();
    closeItemTray();
    popItem(it);
  } else if(it.effect === 'guard'){
    if(moji.guardArmed) return;
    consumeItem(it.id);
    moji.guardArmed = true;
    $('mojiHero').classList.add('guarding');
    closeItemTray();
    popItem(it);
  } else if(it.effect === 'hint'){
    consumeItem(it.id);
    closeItemTray();
    popItem(it);
    // まちがいの もじタイルを 3まい けす
    const tiles = Array.from(document.querySelectorAll('#mojiTiles .moji-tile')).filter(b => !b.disabled);
    const wrongs = shuffle(tiles.filter(b => !moji.holes.some(h => !h.done && h.ch === b.textContent)));
    wrongs.slice(0, 3).forEach(b => { b.disabled = true; b.classList.add('removed'); });
  }
  buildItemTray();
}

/* ---- バトル中断 → ホームへ ---- */
function goHome(){
  state.session++;             // 走っているタイマーを無効化（タイトルを上書きさせない）
  state.busy = true;
  closeItemTray();
  if('speechSynthesis' in window){ try{ speechSynthesis.cancel(); }catch(e){} }
  renderTitleStats();
  show('title');
}

/* ---- イベント ---- */
$('startBtn').onclick = () => { state.mode = 'battle'; $('goBattle').textContent = 'ばとるへ！'; buildHeroGrid(); show('select'); };
$('shootBtn').onclick = () => { state.mode = 'shoot'; $('goBattle').textContent = 'しゅっぱつ！'; buildHeroGrid(); show('select'); };
$('mojiBtn').onclick = () => { state.mode = 'moji'; $('goBattle').textContent = 'しゅっぱつ！'; buildHeroGrid(); show('select'); };
$('goBattle').onclick = () => {
  if(!state.hero) return;
  if(state.mode === 'shoot') startShoot();
  else if(state.mode === 'moji') startMoji();
  else startGame();
};
$('listenBtn').onclick = () => { if(state.current) speak(state.current.t); };
$('retryBtn').onclick = startGame;
$('againBtn').onclick = () => { renderTitleStats(); show('title'); };
$('homeBtn').onclick = goHome;
$('douguBtn').onclick = openItemTray;
$('trayClose').onclick = closeItemTray;
$('itemTray').onclick = (e) => { if(e.target === $('itemTray')) closeItemTray(); };  // 背景タップで閉じる
$('shootHome').onclick = quitShoot;
$('shootDougu').onclick = openItemTray;
$('shootListen').onclick = () => { if(shoot.on && shoot.target) speak(shoot.target.t); };
$('shootRetry').onclick = startShoot;
$('shootOverHome').onclick = () => { renderTitleStats(); show('title'); };
$('mojiHome').onclick = quitMoji;
$('mojiDougu').onclick = openItemTray;
$('mojiListen').onclick = () => { if(moji.on && moji.word) speak(moji.word.t); };
$('mojiRetry').onclick = startMoji;
$('mojiOverHome').onclick = () => { renderTitleStats(); show('title'); };
$('zukanBtn').onclick = () => { buildZukan(); show('zukan'); };
$('itemsBtn').onclick  = () => { buildItems(); show('items'); };
$('zukanBack').onclick = () => show('title');
$('itemsBack').onclick  = () => show('title');

/* ---- テスト用ショートカット（URLに #dev を付けた時だけ有効） ---- */
function devLast(){            // いきなり最終レベルのバトルへ
  state.hero = state.hero || HEROES[0];
  state.session++;
  state.hearts = CONFIG.startHearts; state.score = 0;
  state.levelIdx = LEVELS.length - 1; state.yokaiIdx = 0;
  renderTop();
  startLevel();
}
function devWin(){             // 今のバトルを即勝利
  if(!$('battle').classList.contains('active')) return;
  state.yokaiHp = 0; $('yokaiHp').style.width = '0%'; state.busy = true;
  defeatYokai(state.session);
}
if(location.hash.indexOf('dev') >= 0){
  const bar = $('devbar'); if(bar) bar.style.display = 'flex';
  $('devLast').onclick = devLast;
  $('devWin').onclick = devWin;
  window.addEventListener('keydown', e => {
    if(e.key === 'l') devLast();
    if(e.key === 'k') devWin();
  });
}

renderTitleStats();
