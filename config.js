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
  { name: '2もじ（あ〜ん）', hp: 12, items: [
    {t:'あし',p:'🦶'},{t:'うみ',p:'🌊'},{t:'ふえ',p:'🎵'},{t:'そら',p:'☁️'},{t:'てら',p:'⛩️'},{t:'にわ',p:'🪴'},
    {t:'はれ',p:'☀️'},{t:'ゆめ',p:'💭'},{t:'つき',p:'🌙'},{t:'ねこ',p:'🐱'},{t:'へや',p:'🚪'},{t:'ふろ',p:'🛁'}
  ]},
  { name: '3もじ（あ〜ん）', hp: 13, items: [
    {t:'きりん',p:'🦒'},{t:'すいか',p:'🍉'},{t:'くるま',p:'🚗'},{t:'ことり',p:'🐦'},{t:'たぬき',p:'🦝'},
    {t:'せかい',p:'🌍'},{t:'ほたる',p:'🪲'},{t:'けむり',p:'💨'},{t:'ひよこ',p:'🐤'},{t:'おもち',p:'🍡'},
    {t:'きのこ',p:'🍄'},{t:'やさい',p:'🥬'},{t:'みなと',p:'⚓'}
  ]},
  { name: 'てんてん（濁点）', items: [
    {t:'りんご',p:'🍎'},{t:'ぶどう',p:'🍇'},{t:'ばなな',p:'🍌'},{t:'だんご',p:'🍡'},{t:'でんわ',p:'☎️'},
    {t:'かばん',p:'🎒'},{t:'たまご',p:'🥚'},{t:'めがね',p:'👓'},{t:'ごりら',p:'🦍'}
  ]},
  { name: 'まる（半濁点）', items: [
    {t:'ぱんだ',p:'🐼'},{t:'ぴあの',p:'🎹'},{t:'ぷりん',p:'🍮'},{t:'ぱんや',p:'🥐'},{t:'ぴんく',p:'🩷'},
    {t:'ぺん',p:'🖊️'},{t:'たんぽぽ',p:'🌼'},{t:'えんぴつ',p:'✏️'},{t:'てんぷら',p:'🍤'}
  ]},
  { name: 'ちいさい っ', items: [
    {t:'きって',p:'📮'},{t:'かっぱ',p:'🥒'},{t:'しっぽ',p:'🐕'},{t:'こっぷ',p:'🥤'},
    {t:'らっぱ',p:'🎺'},{t:'きっぷ',p:'🎫'},{t:'ばった',p:'🦗'}
  ]},
  { name: 'のばすおと ー', items: [
    {t:'けーき',p:'🍰'},{t:'かれー',p:'🍛'},{t:'すきー',p:'🎿'},{t:'ぼーる',p:'⚽'},{t:'ぷーる',p:'🏊'},
    {t:'ごーる',p:'🥅'},{t:'らーめん',p:'🍜'},{t:'こーひー',p:'☕'},{t:'せーたー',p:'🧥'}
  ]},
  { name: 'ちいさい ゃゅょ（拗音）', items: [
    {t:'おちゃ',p:'🍵'},{t:'ちょう',p:'🦋'},{t:'りゅう',p:'🐉'},{t:'きしゃ',p:'🚂'},
    {t:'ちゃわん',p:'🍵'},{t:'おもちゃ',p:'🧸'},{t:'にんじゃ',p:'🥷'},{t:'きんぎょ',p:'🐠'},
    {t:'でんしゃ',p:'🚃'},{t:'かぼちゃ',p:'🎃'}
  ]}
];

/* ヒーロー（タイトル後の選択肢） */
const HEROES = [
  {face:'🔥', nm:'ふぁいあ',     img:'images/fire_hero_512.webp'},
  {face:'⚡', nm:'さんだー',     img:'images/lightning_hero_512.webp'},
  {face:'❄️', nm:'あいす',       img:'images/water_ice_hero_512.webp'},
  {face:'🥷', nm:'かぜにんじゃ', img:'images/wind_ninja_hero_512.webp'},
  {face:'✨', nm:'ぱらでぃん',   img:'images/hero_holy_paladin_512.webp'},
  {face:'🔮', nm:'まほうつかい', img:'images/hero_dark_mage_512.webp'},
  {face:'🥋', nm:'かくとうか',   img:'images/hero_earth_martial_artist_512.webp'},
  {face:'🐲', nm:'りゅうきし',   img:'images/hero_black_dragoon_512.webp'}
];

/* 妖怪マスター（図鑑はこの全部を表示）。id は図鑑の保存キー。 */
const YOKAI = [
  // もとからの7体
  {id:'kodamaru',       face:'🌳', nm:'こだまる',       img:'images/kodamaru_512.png'},
  {id:'patamon',        face:'🐦', nm:'ぱたもん',       img:'images/patamon_512.png'},
  {id:'moyakage',       face:'🌫️', nm:'もやかげ',       img:'images/moyakage_512.png'},
  {id:'shuppou',        face:'🚂', nm:'しゅっぽう',     img:'images/shuppou_512.png'},
  {id:'noroizao',       face:'🪄', nm:'のろいざお',     img:'images/noroizao_512.png'},
  {id:'kyouran_gitsune',face:'🦊', nm:'きょうらんぎつね',img:'images/kyouran_gitsune_512.png'},
  {id:'garan_oni',      face:'👹', nm:'がらんおに',     img:'images/garan_oni_512.png'},
  // 追加（よわい系）
  {id:'wood_sprite',    face:'🌱', nm:'もりのせい',     img:'images/enemy_wood_sprite_512.webp'},
  {id:'small_skeleton', face:'💀', nm:'ちびがいこつ',   img:'images/enemy_small_skeleton_512.webp'},
  {id:'lantern_yokai',  face:'🏮', nm:'ちょうちんおばけ',img:'images/enemy_lantern_yokai_512.webp'},
  {id:'mud_golem',      face:'🟤', nm:'どろごーれむ',   img:'images/enemy_mud_golem_512.webp'},
  // 追加（つよい系）
  {id:'rock_monster',   face:'🪨', nm:'いわおとこ',     img:'images/yokai_rock_monster_512.webp'},
  {id:'gorilla',        face:'🦍', nm:'ごりら',         img:'images/yokai_gorilla_512.webp'},
  {id:'robot_red',      face:'🔴', nm:'あかろぼ',       img:'images/yokai_robot_red_512.webp'},
  {id:'robot_ninja',    face:'🤖', nm:'にんじゃろぼ',   img:'images/yokai_robot_ninja_512.webp'},
  {id:'skeleton_knight',face:'⚔️', nm:'がいこつきし',   img:'images/yokai_skeleton_knight_512.webp'},
  {id:'weapon_octopus', face:'🐙', nm:'ぶきだこ',       img:'images/yokai_weapon_octopus_512.webp'},
  {id:'multiarm_giant', face:'🦾', nm:'うでだらけきょじん',img:'images/yokai_multiarm_giant_512.webp'},
  {id:'robot_castle',   face:'🏰', nm:'おしろろぼ',     img:'images/yokai_robot_castle_512.webp'},
  {id:'thunder_dragon', face:'⚡', nm:'かみなりどらごん',img:'images/yokai_thunder_dragon_512.webp'},
  {id:'humanoid_dragon',face:'🐉', nm:'りゅうじん',     img:'images/yokai_humanoid_dragon_512.webp'}
];

/* レベルごとに登場する妖怪（id）。バトルのたびに この中から ランダムで1体でる。
   ※やさしい見た目を前半、つよそうを後半に。並べ替え/入れ替え自由。 */
const YOKAI_BY_LEVEL = [
  ['kodamaru','wood_sprite','small_skeleton'],        // Lv1
  ['patamon','lantern_yokai','mud_golem'],            // Lv2
  ['moyakage','rock_monster','gorilla'],              // Lv3
  ['shuppou','robot_red','robot_ninja'],              // Lv4
  ['noroizao','skeleton_knight','weapon_octopus'],    // Lv5
  ['kyouran_gitsune','multiarm_giant','robot_castle'],// Lv6
  ['garan_oni','thunder_dragon','humanoid_dragon']    // Lv7（ボス）
];

/* レベルクリアで1こもらえる どうぐ（3こから1こえらぶ）。
   ※いまは「あつめて ながめる」だけ。将来バトルで使えるようにする予定（effect は予約）。 */
const ITEMS = [
  {id:'fire_sword',    face:'⚔️', nm:'ほのおのけん',    img:'images/fire_sword_512.webp'},
  {id:'light_blaster', face:'🔫', nm:'びーむがん',      img:'images/light_blaster_512.webp'},
  {id:'guard_shield',  face:'🛡️', nm:'まもりのたて',    img:'images/guard_shield_512.webp'},
  {id:'energy_drink',  face:'🥤', nm:'げんきどりんく',  img:'images/energy_drink_512.webp'},
  {id:'lightning_bomb',face:'💣', nm:'かみなりばくだん',img:'images/lightning_bomb_512.webp'},
  {id:'power_glove',   face:'🥊', nm:'ちからのてぶくろ',img:'images/power_glove_512.webp'},
  {id:'speed_boots',   face:'👟', nm:'はやあしのくつ',  img:'images/speed_boots_512.webp'}
];
