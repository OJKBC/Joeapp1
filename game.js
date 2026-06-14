/* =========================================================
   ゲームロジック
   CONFIG / LEVELS / HEROES / YOKAI は config.js で定義しています。
   （config.js を index.html で先に読み込んでください）
   ========================================================= */
const state = {
  hero: null, hearts: CONFIG.startHearts, score: 0,
  levelIdx: 0, queue: [], current: null,
  yokaiIdx: 0, yokaiHp: CONFIG.yokaiHp, busy: false,
  session: 0   // バトルを開始/中断するたびに +1。古いタイマーを無効化するために使う
};

const $ = id => document.getElementById(id);
function show(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); $(id).classList.add('active'); }

/* ---- 見た目（絵文字 or 画像） ----
   config.js の各エントリに img:'images/xxx.png' があれば画像を、
   なければ絵文字 face を表示する。1体ずつ差し替え可能。 */
function faceHTML(e){
  return e.img ? '<img class="face-img" src="'+e.img+'" alt="'+(e.nm||'')+'">' : e.face;
}
function setFace(el, e){
  if(e.img){ el.innerHTML = '<img class="face-img" src="'+e.img+'" alt="'+(e.nm||'')+'">'; }
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
      return { collection: p.collection || {}, items: p.items || [] };
    }
  }catch(e){}
  return { collection: {}, items: [] };  // collection: {yokaiId:{count,firstDate,lastDate,lastLevel}} / items: [itemId,...]
}
function saveProgress(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); }catch(e){}
}
const progress = loadProgress();

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
if('speechSynthesis' in window){ speechSynthesis.onvoiceschanged = ()=>{}; }
function speak(text){
  if(!CONFIG.speakPrompt || !('speechSynthesis' in window)) return;
  try{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP'; u.rate = CONFIG.rate;
    const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('ja'));
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
  spawnYokai(yk);
  renderTop();
  show('battle');
  state.busy = false;
  nextQuestion();
}
/* えらばれた妖怪をバトルにセット */
function spawnYokai(yk){
  state.yokai = yk;
  // バトル背景をランダムに（緑のフィールドのかわり）
  if(typeof BATTLE_BGS !== 'undefined' && BATTLE_BGS.length){
    const bg = BATTLE_BGS[Math.floor(Math.random() * BATTLE_BGS.length)];
    const field = document.querySelector('.field');
    if(field) field.style.backgroundImage = "url('" + bg + "')";
  }
  state.yokaiHpMax = LEVELS[state.levelIdx].hp || CONFIG.yokaiHp;
  state.yokaiHp = state.yokaiHpMax;
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

  $('pic').textContent = item.p || '';
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
}

function choose(btn, correct){
  if(state.busy) return;
  state.busy = true;
  const sid = state.session;   // この回答が属するバトル。中断したら以降の処理は無効

  if(correct){
    btn.classList.add('correct');
    state.score++; state.yokaiHp--;
    renderTop();
    $('heroMon').classList.add('attack'); setTimeout(()=>$('heroMon').classList.remove('attack'),360);
    const pct = (state.yokaiHp / state.yokaiHpMax * 100) + '%';
    fireProjectile($('heroMon'), $('yokai'), 'hero', () => { $('yokaiHp').style.width = pct; });

    if(state.yokaiHp <= 0){
      defeatYokai(sid);
      return;
    } else {
      flash('⭕', 'var(--good)');   // まだ続くときだけ ⭕ を出す
      setTimeout(()=>{ if(sid !== state.session) return; nextQuestion(); }, 700);
    }
  } else {
    btn.classList.add('wrong');
    flash('❌', 'var(--heart)');
    fireProjectile($('yokai'), $('heroMon'), 'enemy');
    if(CONFIG.penaltyMode === 'score') state.score = Math.max(0, state.score - 1);
    else state.hearts--;
    renderTop();

    if(state.hearts <= 0 && CONFIG.penaltyMode === 'heart'){
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
  if(win){
    $('clearScore').textContent = state.score;
    $('clearItems').textContent = progress.items.length;   // もらった どうぐの かず
    const defeats = Object.values(progress.collection).reduce((a, r) => a + (r.count || 0), 0);
    $('clearYokai').textContent = defeats;                  // たおした ようかいの かず
    show('cleared');
    playFanfare();                                          // パンパカパーン！
  } else {
    $('overScore').textContent = state.score; show('over');
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
function fireProjectile(fromEl, toEl, kind, onImpact){
  playBeam(kind);
  const done = () => { impact(toEl); if(onImpact) onImpact(); };
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce){ done(); return; }
  const field = document.querySelector('.field');
  // ポーズに依存しないよう「体のどこか」ではなく "少し前（敵側）" に光の玉が現れて飛ぶ
  const ox = kind === 'enemy' ? -0.02 : 1.02;   // ヒーロー/妖怪の前方ふち
  const s = pointIn(field, fromEl, ox, 0.34);
  const e = pointIn(field, toEl, 0.5, 0.42);    // 着弾は相手の体の少し上
  const p = document.createElement('div');
  p.className = 'projectile ' + kind;
  p.style.left = s.x + 'px'; p.style.top = s.y + 'px';
  // 攻撃者（ヒーロー/妖怪）の色にビームを合わせる
  const col = kind === 'enemy' ? (state.yokai && state.yokai.col) : (state.hero && state.hero.col);
  if(col){
    p.style.background = `radial-gradient(ellipse at 72% 50%, #fff, ${col} 44%, ${col}00 78%)`;
    p.style.boxShadow = `0 0 26px 10px ${col}c0`;
  }
  field.appendChild(p);
  const dx = e.x - s.x, dy = e.y - s.y;
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;   // ビームを進行方向へ向ける
  const tx = `calc(-50% ${dx>=0?'+':'-'} ${Math.abs(dx)}px)`;
  const ty = `calc(-50% ${dy>=0?'+':'-'} ${Math.abs(dy)}px)`;
  const anim = p.animate(
    [{ transform:`translate(-50%,-50%) rotate(${ang}deg) scale(.5)`, opacity:.6 },
     { transform:`translate(${tx}, ${ty}) rotate(${ang}deg) scale(1)`, opacity:1 }],
    { duration: 420, easing: 'cubic-bezier(.45,0,.75,1)' }
  );
  anim.onfinish = () => { p.remove(); done(); };
}
function flash(symbol, color){
  const f = $('flash'); f.textContent = symbol; f.style.color = color; f.style.fontSize = '26vw';
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
  flashImage('images/defeat_popup.png');                   // 「やっつけた」演出カード（1.6秒）
  setTimeout(()=>{ if(sid !== state.session) return; openItemPick(wasLast ? 'final' : 'level'); }, 1600);
}
function openItemPick(mode){
  const isFinal = (mode === 'final');   // 最後だけ全25種から「選び放題」、通常は3こからランダム
  state.finalPick = isFinal;
  const list = isFinal ? ITEMS.slice() : shuffle(ITEMS.slice()).slice(0, 3);
  const box = $('itemChoices');
  box.className = 'item-row' + (isFinal ? ' all' : '');
  box.innerHTML = '';
  list.forEach(it => {
    const b = document.createElement('button');
    b.className = 'item-choice';
    b.innerHTML = faceHTML(it) + '<span class="ic-nm">'+it.nm+'</span>';
    b.onclick = () => pickItem(it);
    box.appendChild(b);
  });
  show('itemPick');
}
function pickItem(it){
  progress.items.push(it.id);
  saveProgress();
  if(state.finalPick){
    endGame(true);                 // 最後：そのまま おめでとう画面へ
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

/* ---- バトル中断 → ホームへ ---- */
function goHome(){
  state.session++;             // 走っているタイマーを無効化（タイトルを上書きさせない）
  state.busy = true;
  if('speechSynthesis' in window){ try{ speechSynthesis.cancel(); }catch(e){} }
  show('title');
}

/* ---- イベント ---- */
$('startBtn').onclick = () => { buildHeroGrid(); show('select'); };
$('goBattle').onclick = () => { if(state.hero) startGame(); };
$('listenBtn').onclick = () => { if(state.current) speak(state.current.t); };
$('retryBtn').onclick = startGame;
$('againBtn').onclick = () => show('title');
$('homeBtn').onclick = goHome;
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
