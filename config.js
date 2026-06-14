/* =========================================================
   せってい — ここを変えると挙動を調整できます
   （このファイルだけ編集すれば、ゲームの調整・もんだい追加ができます）
   ========================================================= */
const CONFIG = {
  startHearts: 5,        // ヒーローのライフ
  yokaiHp: 3,            // 妖怪をたおすのに必要な正解数（1レベル＝妖怪1体）
  choiceCount: 5,        // えらぶ文字の数
  // まちがえたときの罰: 'heart'（ライフ-1・やさしめ）か 'score'（スコア-1）
  penaltyMode: 'heart',
  speakPrompt: true,     // 妖怪が文字を読み上げるか（※これはTTS=読み上げ。マイクは不要）
  showPromptText: false, // 問題の文字を吹き出しに表示するか（false=ネタバレなし。音をきいて当てる）
  rate: 0.65,            // 読み上げ速度（小さいほどゆっくり）
  sound: true            // 効果音（ビーム音・着弾音）のオン/オフ
};

/* =========================================================
   もんだいデータ（レベルが上がると 1→2→3 文字に）
   ・name : レベル名（表示用）
   ・hp   : その妖怪をたおすのに必要な正解数（省略時は CONFIG.yokaiHp）
   ・items: {t:'よみ', p:'絵文字'} の配列
   ========================================================= */
const LEVELS = [
  { name: '2もじ ①', hp: 6, items: [
    {t:'あし',p:'🦶'},{t:'うみ',p:'🌊'},{t:'ふえ',p:'🎵'},{t:'そら',p:'☁️'},{t:'てら',p:'⛩️'},{t:'にわ',p:'🪴'}
  ]},
  { name: '2もじ ②', hp: 6, items: [
    {t:'はれ',p:'☀️'},{t:'ゆめ',p:'💭'},{t:'つき',p:'🌙'},{t:'ねこ',p:'🐱'},{t:'へや',p:'🚪'},{t:'ふろ',p:'🛁'}
  ]},
  { name: '3もじ ①', hp: 7, items: [
    {t:'きりん',p:'🦒'},{t:'すいか',p:'🍉'},{t:'くるま',p:'🚗'},{t:'ことり',p:'🐦'},{t:'たぬき',p:'🦝'},
    {t:'せかい',p:'🌍'},{t:'ほたる',p:'🪲'}
  ]},
  { name: '3もじ ②', hp: 6, items: [
    {t:'けむり',p:'💨'},{t:'ひよこ',p:'🐤'},{t:'おもち',p:'🍡'},
    {t:'きのこ',p:'🍄'},{t:'やさい',p:'🥬'},{t:'みなと',p:'⚓'}
  ]},
  { name: 'てんてん（濁点）', hp: 6, items: [
    {t:'りんご',p:'🍎'},{t:'ぶどう',p:'🍇'},{t:'ばなな',p:'🍌'},{t:'だんご',p:'🍡'},{t:'でんわ',p:'☎️'},
    {t:'かばん',p:'🎒'},{t:'たまご',p:'🥚'},{t:'めがね',p:'👓'},{t:'ごりら',p:'🦍'}
  ]},
  { name: 'まる（半濁点）', hp: 6, items: [
    {t:'ぱんだ',p:'🐼'},{t:'ぴあの',p:'🎹'},{t:'ぷりん',p:'🍮'},{t:'ぱんや',p:'🥐'},{t:'ぴんく',p:'🩷'},
    {t:'ぺん',p:'🖊️'},{t:'たんぽぽ',p:'🌼'},{t:'えんぴつ',p:'✏️'},{t:'てんぷら',p:'🍤'}
  ]},
  { name: 'ちいさい っ', hp: 6, items: [
    {t:'きって',p:'📮'},{t:'かっぱ',p:'🥒'},{t:'しっぽ',p:'🐕'},{t:'こっぷ',p:'🥤'},
    {t:'らっぱ',p:'🎺'},{t:'きっぷ',p:'🎫'},{t:'ばった',p:'🦗'}
  ]},
  { name: 'のばすおと ー', hp: 6, items: [
    {t:'けーき',p:'🍰'},{t:'かれー',p:'🍛'},{t:'すきー',p:'🎿'},{t:'ぼーる',p:'⚽'},{t:'ぷーる',p:'🏊'},
    {t:'ごーる',p:'🥅'},{t:'らーめん',p:'🍜'},{t:'こーひー',p:'☕'},{t:'せーたー',p:'🧥'}
  ]},
  { name: 'ちいさい ゃゅょ（拗音）', hp: 6, items: [
    {t:'おちゃ',p:'🍵'},{t:'ちょう',p:'🦋'},{t:'りゅう',p:'🐉'},{t:'きしゃ',p:'🚂'},
    {t:'ちゃわん',p:'🍵'},{t:'おもちゃ',p:'🧸'},{t:'にんじゃ',p:'🥷'},{t:'きんぎょ',p:'🐠'},
    {t:'でんしゃ',p:'🚃'},{t:'かぼちゃ',p:'🎃'}
  ]}
];

/* ヒーロー（タイトル後の選択肢） */
const HEROES = [
  {face:'🔥', nm:'ふぁいあ',     col:'#ff5a2b', img:'images/fire_hero_512.webp'},
  {face:'⚡', nm:'さんだー',     col:'#ffd23f', img:'images/lightning_hero_512.webp'},
  {face:'❄️', nm:'あいす',       col:'#34c2e3', img:'images/water_ice_hero_512.webp'},
  {face:'🥷', nm:'かぜにんじゃ', col:'#46e07a', img:'images/wind_ninja_hero_512.webp'},
  {face:'✨', nm:'ぱらでぃん',   col:'#ffe27a', img:'images/hero_holy_paladin_512.webp'},
  {face:'🔮', nm:'まほうつかい', col:'#b14aed', img:'images/hero_dark_mage_512.webp'},
  {face:'🥋', nm:'かくとうか',   col:'#d59433', img:'images/hero_earth_martial_artist_512.webp'},
  {face:'🐲', nm:'りゅうきし',   col:'#8a7bff', img:'images/hero_black_dragoon_512.webp'}
];

/* 妖怪マスター（図鑑はこの全部を表示）。id は図鑑の保存キー。 */
const YOKAI = [
  // もとからの7体
  {id:'kodamaru',       face:'🌳', nm:'こだまる',       col:'#46e07a', img:'images/kodamaru_512.png'},
  {id:'patamon',        face:'🐦', nm:'ぱたもん',       col:'#6ec6ff', img:'images/patamon_512.png'},
  {id:'moyakage',       face:'🌫️', nm:'もやかげ',       col:'#9aa0c0', img:'images/moyakage_512.png'},
  {id:'shuppou',        face:'🚂', nm:'しゅっぽう',     col:'#b0b6c0', img:'images/shuppou_512.png'},
  {id:'noroizao',       face:'🪄', nm:'のろいざお',     col:'#b14aed', img:'images/noroizao_512.png'},
  {id:'kyouran_gitsune',face:'🦊', nm:'きょうらんぎつね',col:'#ff8a3d', img:'images/kyouran_gitsune_512.png'},
  {id:'garan_oni',      face:'👹', nm:'がらんおに',     col:'#ff3b3b', img:'images/garan_oni_512.png'},
  // 追加（よわい系）
  {id:'wood_sprite',    face:'🌱', nm:'もりのせい',     col:'#7bd66a', img:'images/enemy_wood_sprite_512.webp'},
  {id:'small_skeleton', face:'💀', nm:'ちびがいこつ',   col:'#e8e3d0', img:'images/enemy_small_skeleton_512.webp'},
  {id:'lantern_yokai',  face:'🏮', nm:'ちょうちんおばけ',col:'#ff8a2b', img:'images/enemy_lantern_yokai_512.webp'},
  {id:'mud_golem',      face:'🟤', nm:'どろごーれむ',   col:'#9b7a4a', img:'images/enemy_mud_golem_512.webp'},
  // 追加（つよい系）
  {id:'rock_monster',   face:'🪨', nm:'いわおとこ',     col:'#b0a08c', img:'images/yokai_rock_monster_512.webp'},
  {id:'gorilla',        face:'🦍', nm:'ごりら',         col:'#8a6b4a', img:'images/yokai_gorilla_512.webp'},
  {id:'robot_red',      face:'🔴', nm:'あかろぼ',       col:'#ff4a4a', img:'images/yokai_robot_red_512.webp'},
  {id:'robot_ninja',    face:'🤖', nm:'にんじゃろぼ',   col:'#5a6cff', img:'images/yokai_robot_ninja_512.webp'},
  {id:'skeleton_knight',face:'⚔️', nm:'がいこつきし',   col:'#cfd6e0', img:'images/yokai_skeleton_knight_512.webp'},
  {id:'weapon_octopus', face:'🐙', nm:'ぶきだこ',       col:'#ff5aa0', img:'images/yokai_weapon_octopus_512.webp'},
  {id:'multiarm_giant', face:'🦾', nm:'うでだらけきょじん',col:'#c06ad6', img:'images/yokai_multiarm_giant_512.webp'},
  {id:'robot_castle',   face:'🏰', nm:'おしろろぼ',     col:'#c9a24a', img:'images/yokai_robot_castle_512.webp'},
  {id:'thunder_dragon', face:'⚡', nm:'かみなりどらごん',col:'#ffd23f', img:'images/yokai_thunder_dragon_512.webp'},
  {id:'humanoid_dragon',face:'🐉', nm:'りゅうじん',     col:'#46c2e3', img:'images/yokai_humanoid_dragon_512.webp'}
];

/* レベルごとに登場する妖怪（id）。バトルのたびに この中から ランダムで1体でる。
   ※やさしい見た目を前半、つよそうを後半に。並べ替え/入れ替え自由。 */
const YOKAI_BY_LEVEL = [
  ['kodamaru','wood_sprite'],                         // Lv1 2もじ①
  ['patamon','small_skeleton'],                       // Lv2 2もじ②
  ['moyakage','lantern_yokai'],                       // Lv3 3もじ①
  ['shuppou','mud_golem'],                            // Lv4 3もじ②
  ['noroizao','rock_monster','gorilla'],              // Lv5 てんてん
  ['kyouran_gitsune','robot_red','robot_ninja'],      // Lv6 まる
  ['skeleton_knight','weapon_octopus'],               // Lv7 っ
  ['multiarm_giant','robot_castle'],                  // Lv8 ー
  ['garan_oni','thunder_dragon','humanoid_dragon']    // Lv9 拗音（ボス）
];

/* バトルの背景（緑のフィールドのかわり）。バトルごとに この中から ランダムで1枚。
   ※増やすときは images/ に入れて、ここにファイル名を足すだけ。 */
const BATTLE_BGS = [
  'images/battle_bg_01.png',          // 和風ステージ（最初の1枚）
  'images/01_volcano.png',
  'images/02_thunderstorm.png',
  'images/03_enchanted_forest.png',
  'images/04_ice_cavern.png',
  'images/05_desert_wasteland.png',
  'images/06_purple_ruins.png',
  'images/07_sky_temple.png',
  'images/08_poison_swamp.png',
  'images/09_cosmic_arena.png',
  'images/10_moonlit_shrine.png'
];

/* レベルクリアで1こもらえる どうぐ（3こから1こえらぶ）。
   ※いまは「あつめて ながめる」だけ。将来バトルで使えるようにする予定（effect は予約）。 */
const ITEMS = [
  {id:'fire_sword',      face:'⚔️', nm:'ほのおのけん',      img:'images/01_fire_sword_512.webp'},
  {id:'light_blaster',   face:'🔫', nm:'びーむがん',        img:'images/02_light_blaster_512.webp'},
  {id:'guard_shield',    face:'🛡️', nm:'まもりのたて',      img:'images/03_guard_shield_512.webp'},
  {id:'energy_drink',    face:'🥤', nm:'げんきどりんく',    img:'images/04_energy_drink_512.webp'},
  {id:'speed_boots',     face:'👟', nm:'はやあしのくつ',    img:'images/05_speed_boots_512.webp'},
  {id:'power_glove',     face:'🥊', nm:'ちからのてぶくろ',  img:'images/06_power_glove_512.webp'},
  {id:'lightning_bomb',  face:'💣', nm:'かみなりばくだん',  img:'images/07_lightning_bomb_512.webp'},
  {id:'shadow_shuriken', face:'🌀', nm:'かげのしゅりけん',  img:'images/08_shadow_shuriken_512.webp'},
  {id:'ninja_mask',      face:'🥷', nm:'にんじゃのめん',    img:'images/09_ninja_mask_512.webp'},
  {id:'fox_mask',        face:'🦊', nm:'きつねのめん',      img:'images/10_fox_mask_512.webp'},
  {id:'oni_mask',        face:'👹', nm:'おにのめん',        img:'images/11_oni_mask_512.webp'},
  {id:'tengu_mask',      face:'👺', nm:'てんぐのめん',      img:'images/12_tengu_mask_512.webp'},
  {id:'energy_onigiri',  face:'🍙', nm:'げんきおにぎり',    img:'images/13_energy_onigiri_512.webp'},
  {id:'healing_dango',   face:'🍡', nm:'かいふくだんご',    img:'images/14_healing_dango_512.webp'},
  {id:'healing_bun',     face:'🥟', nm:'かいふくまんじゅう',img:'images/15_healing_bun_512.webp'},
  {id:'orange_potion',   face:'🧪', nm:'だいだいのくすり',  img:'images/16_orange_healing_potion_512.webp'},
  {id:'blue_drink',      face:'🧋', nm:'あおいのみもの',    img:'images/17_blue_recovery_drink_512.webp'},
  {id:'revival_charm',   face:'🪬', nm:'ふっかつのおまもり',img:'images/18_revival_charm_512.webp'},
  {id:'hint_glasses',    face:'👓', nm:'ひんとめがね',      img:'images/19_hint_glasses_512.webp'},
  {id:'helper_pencil',   face:'✏️', nm:'おたすけえんぴつ',  img:'images/20_helper_pencil_512.webp'},
  {id:'retry_ticket',    face:'🎟️', nm:'やりなおしけん',    img:'images/21_retry_ticket_512.webp'},
  {id:'slow_clock',      face:'⏰', nm:'ゆっくりどけい',    img:'images/22_slow_clock_512.webp'},
  {id:'bazooka',         face:'🚀', nm:'ばずーか',          img:'images/23_bazooka_512.webp'},
  {id:'bow_and_arrow',   face:'🏹', nm:'ゆみや',            img:'images/24_bow_and_arrow_512.webp'},
  {id:'nunchaku',        face:'🥢', nm:'ぬんちゃく',        img:'images/25_nunchaku_512.webp'}
];
