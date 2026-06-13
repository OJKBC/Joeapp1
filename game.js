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
      return { collection: p.collection || {}, stickers: p.stickers || [] };
    }
  }catch(e){}
  return { collection: {}, stickers: [] };  // collection: {yokaiId: {count, firstDate, lastDate, lastLevel}}
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

/* ---- タイトルに並ぶヒーロー（飾り） ---- */
function buildTitleHeroes(){
  const g = $('titleHeroes'); g.innerHTML = '';
  HEROES.forEach(h => {
    const d = document.createElement('span');
    d.className = 'th';
    d.innerHTML = faceHTML(h);
    g.appendChild(d);
  });
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
  newQueue(); spawnYokai(); renderTop();
  show('battle'); nextQuestion();
}
function newQueue(){ state.queue = shuffle(LEVELS[state.levelIdx].items.slice()); }
function spawnYokai(){
  state.yokaiHpMax = LEVELS[state.levelIdx].hp || CONFIG.yokaiHp;
  state.yokaiHp = state.yokaiHpMax;
  state.yokai = YOKAI[state.yokaiIdx % YOKAI.length];
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
    flash('⭕', 'var(--good)');
    state.score++; state.yokaiHp--;
    renderTop();
    $('heroMon').classList.add('attack'); setTimeout(()=>$('heroMon').classList.remove('attack'),360);
    const pct = (state.yokaiHp / state.yokaiHpMax * 100) + '%';
    fireProjectile($('heroMon'), $('yokai'), 'hero', () => { $('yokaiHp').style.width = pct; });

    if(state.yokaiHp <= 0){
      registerYokai(state.yokai, state.levelIdx);          // 図鑑に登録
      const wasLast = state.levelIdx >= LEVELS.length - 1;
      flashText(wasLast ? 'ぜんぶ クリア！' : 'やっつけた！','var(--gold)');
      setTimeout(()=>{ if(sid !== state.session) return; openStickerPick(wasLast); }, 900);  // シールを1枚えらぶ
      return;
    } else {
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
  if(win){ $('clearScore').textContent = state.score; show('cleared'); }
  else { $('overScore').textContent = state.score; show('over'); }
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
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = 'sawtooth';
  const f0 = kind === 'enemy' ? 520 : 940;
  const f1 = kind === 'enemy' ? 120 : 280;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + 0.18);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(g).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.22);
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
function screenShake(){
  const app = $('app');
  app.classList.remove('shake'); void app.offsetWidth; app.classList.add('shake');
}

function centerIn(field, el){
  const fr = field.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left + r.width/2 - fr.left, y: r.top + r.height/2 - fr.top };
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
  const s = centerIn(field, fromEl), e = centerIn(field, toEl);
  const p = document.createElement('div');
  p.className = 'projectile ' + kind;
  p.style.left = s.x + 'px'; p.style.top = s.y + 'px';
  field.appendChild(p);
  const dx = e.x - s.x, dy = e.y - s.y;
  const tx = `calc(-50% ${dx>=0?'+':'-'} ${Math.abs(dx)}px)`;
  const ty = `calc(-50% ${dy>=0?'+':'-'} ${Math.abs(dy)}px)`;
  const anim = p.animate(
    [{ transform:'translate(-50%,-50%) scale(.5)', opacity:.6 },
     { transform:`translate(${tx}, ${ty}) scale(1)`, opacity:1 }],
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

/* ---- シール（レベルクリアのごほうび） ---- */
function openStickerPick(wasLast){
  state.pendingLast = wasLast;
  const picks = shuffle(STICKERS.slice()).slice(0, 3);
  const box = $('stickerChoices'); box.innerHTML = '';
  picks.forEach(s => {
    const b = document.createElement('button');
    b.className = 'sticker-choice';
    b.textContent = s;
    b.onclick = () => pickSticker(s);
    box.appendChild(b);
  });
  show('stickerPick');
}
function pickSticker(s){
  progress.stickers.push(s);
  saveProgress();
  flash(s, 'var(--gold)');
  if(state.pendingLast){
    setTimeout(()=> endGame(true), 500);
  } else {
    state.levelIdx++; state.yokaiIdx++; newQueue();
    spawnYokai(); renderTop();
    show('battle');
    setTimeout(nextQuestion, 500);
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
        '<div class="z-meta">たおした '+rec.count+'かい<br>レベル '+rec.lastLevel+'<br>'+rec.lastDate+'</div>';
    } else {
      card.innerHTML =
        '<div class="z-face">❓</div>'+
        '<div class="z-nm">？？？</div>'+
        '<div class="z-meta">まだ あえてないよ</div>';
    }
    g.appendChild(card);
  });
}

/* ---- シールちょう ---- */
function buildBook(){
  const g = $('bookGrid'); g.innerHTML = '';
  if(progress.stickers.length === 0){
    g.innerHTML = '<div class="book-empty">まだ シールが ないよ。<br>バトルで あつめよう！</div>';
    return;
  }
  progress.stickers.forEach(s => {
    const d = document.createElement('div');
    d.className = 'book-sticker';
    d.textContent = s;
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
$('bookBtn').onclick  = () => { buildBook(); show('stickerBook'); };
$('zukanBack').onclick = () => show('title');
$('bookBack').onclick  = () => show('title');

/* ---- 初期表示 ---- */
buildTitleHeroes();
