/*
 * Do you like ...? ゲーム - 教室内リアルタイム連携サーバー
 *
 * 追加パッケージなしで動きます（Node.js の標準機能のみ使用）。
 * 使い方は README.md を見てください。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'students.json');
const ROOMS_FILE = path.join(__dirname, 'rooms.json');
const BINGO_FILE = path.join(__dirname, 'bingo_rooms.json');
const BINGO_STUDENTS_FILE = path.join(__dirname, 'bingo_students.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8MB (写真データ用の余裕)

let students = {};
let rooms = {}; // room名 -> { finished: boolean, finishedAt: number }
let bingoRooms = {}; // room名 -> { size: 3, calledWords: [] }
let bingoStudents = {}; // id -> { id, room, photo, lineCount, bingoAt, registeredAt, updatedAt }

function normalizeRoom(room){
  if(typeof room !== 'string') return 'default';
  const r = room.trim().toLowerCase().slice(0, 30);
  return r || 'default';
}

function getQueryParam(queryString, key){
  if(!queryString) return '';
  const parts = queryString.split('&');
  for(let i = 0; i < parts.length; i++){
    const kv = parts[i].split('=');
    if(decodeURIComponent(kv[0] || '') === key){
      try{ return decodeURIComponent(kv[1] || ''); }catch(e){ return ''; }
    }
  }
  return '';
}

function loadData(){
  try{
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    students = JSON.parse(raw);
  }catch(e){
    students = {};
  }
}
function saveData(){
  try{
    fs.writeFileSync(DATA_FILE, JSON.stringify(students));
  }catch(e){
    console.error('保存に失敗しました:', e.message);
  }
}
loadData();

function loadRooms(){
  try{
    const raw = fs.readFileSync(ROOMS_FILE, 'utf8');
    rooms = JSON.parse(raw);
  }catch(e){
    rooms = {};
  }
}
function saveRooms(){
  try{
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms));
  }catch(e){
    console.error('保存に失敗しました:', e.message);
  }
}
loadRooms();

function isRoomFinished(room){
  return !!(rooms[room] && rooms[room].finished);
}

function loadBingo(){
  try{
    const raw = fs.readFileSync(BINGO_FILE, 'utf8');
    bingoRooms = JSON.parse(raw);
  }catch(e){
    bingoRooms = {};
  }
}
function saveBingo(){
  try{
    fs.writeFileSync(BINGO_FILE, JSON.stringify(bingoRooms));
  }catch(e){
    console.error('保存に失敗しました:', e.message);
  }
}
loadBingo();

function loadBingoStudents(){
  try{
    const raw = fs.readFileSync(BINGO_STUDENTS_FILE, 'utf8');
    bingoStudents = JSON.parse(raw);
  }catch(e){
    bingoStudents = {};
  }
}
function saveBingoStudents(){
  try{
    fs.writeFileSync(BINGO_STUDENTS_FILE, JSON.stringify(bingoStudents));
  }catch(e){
    console.error('保存に失敗しました:', e.message);
  }
}
loadBingoStudents();

function getBingoRoom(room){
  if(!bingoRooms[room]){
    bingoRooms[room] = { size: 3, calledWords: [] };
  }
  if(!bingoRooms[room].size) bingoRooms[room].size = 3;
  if(!bingoRooms[room].calledWords) bingoRooms[room].calledWords = [];
  return bingoRooms[room];
}

function publicBingoList(room){
  const list = Object.keys(bingoStudents).filter(function(id){
    return normalizeRoom(bingoStudents[id].room) === room;
  }).map(function(id){
    const s = bingoStudents[id];
    return {
      id: id,
      no: s.no || null,
      role: s.role || "student",
      photo: s.photo ? "/api/bingo/photo?id=" + id : null,
      lineCount: s.lineCount || 0,
      bingoAt: s.bingoAt || null,
      registeredAt: s.registeredAt,
      updatedAt: s.updatedAt
    };
  }).sort(function(a, b){
    // ビンゴ達成ずみの人を、達成が早かった順に先頭へ。まだの人はライン数が多い順。
    if(a.bingoAt && b.bingoAt) return a.bingoAt - b.bingoAt;
    if(a.bingoAt && !b.bingoAt) return -1;
    if(!a.bingoAt && b.bingoAt) return 1;
    if(b.lineCount !== a.lineCount) return b.lineCount - a.lineCount;
    return a.registeredAt - b.registeredAt;
  });
  list.forEach(function(s, idx){ s.rank = idx + 1; });
  return list;
}


/* ===== What do you like? ゲーム（Unit5）用データ ===== */
const WHAT_STUDENTS_FILE = path.join(__dirname, 'what_students.json');
const WHAT_ROOMS_FILE = path.join(__dirname, 'what_rooms.json');
let whatStudents = {};
let whatRooms = {};
try{ whatStudents = JSON.parse(fs.readFileSync(WHAT_STUDENTS_FILE, 'utf8')); }catch(e){ whatStudents = {}; }
try{ whatRooms = JSON.parse(fs.readFileSync(WHAT_ROOMS_FILE, 'utf8')); }catch(e){ whatRooms = {}; }
function saveWhatStudents(){
  try{ fs.writeFileSync(WHAT_STUDENTS_FILE, JSON.stringify(whatStudents)); }catch(e){ console.error('保存に失敗しました:', e.message); }
}
function saveWhatRooms(){
  try{ fs.writeFileSync(WHAT_ROOMS_FILE, JSON.stringify(whatRooms)); }catch(e){ console.error('保存に失敗しました:', e.message); }
}
function publicWhatList(room){
  const list = Object.keys(whatStudents).filter(function(id){
    return normalizeRoom(whatStudents[id].room) === room;
  }).map(function(id){
    const s = whatStudents[id];
    return {
      id: id, no: s.no || null, role: s.role || "student", photo: s.photo ? "/api/what/photo?id=" + id : null, score: s.score, streak: s.streak, best: s.best,
      used: s.used, total: s.total, status: s.status,
      updatedAt: s.updatedAt, registeredAt: s.registeredAt
    };
  }).sort(function(a, b){
    if(b.score !== a.score) return b.score - a.score;
    return a.registeredAt - b.registeredAt;
  });
  list.forEach(function(s, idx){ s.rank = idx + 1; });
  return list;
}

/* ===== Do you like ...? ゲーム（新方式）用データ ===== */
const DYL_STUDENTS_FILE = path.join(__dirname, 'dyl_students.json');
const DYL_ROOMS_FILE = path.join(__dirname, 'dyl_rooms.json');
let dylStudents = {};
let dylRooms = {};
try{ dylStudents = JSON.parse(fs.readFileSync(DYL_STUDENTS_FILE, 'utf8')); }catch(e){ dylStudents = {}; }
try{ dylRooms = JSON.parse(fs.readFileSync(DYL_ROOMS_FILE, 'utf8')); }catch(e){ dylRooms = {}; }
function saveDylStudents(){
  try{ fs.writeFileSync(DYL_STUDENTS_FILE, JSON.stringify(dylStudents)); }catch(e){ console.error('保存に失敗しました:', e.message); }
}
function saveDylRooms(){
  try{ fs.writeFileSync(DYL_ROOMS_FILE, JSON.stringify(dylRooms)); }catch(e){ console.error('保存に失敗しました:', e.message); }
}
function publicDylList(room){
  const list = Object.keys(dylStudents).filter(function(id){
    return normalizeRoom(dylStudents[id].room) === room;
  }).map(function(id){
    const s = dylStudents[id];
    return {
      id: id, no: s.no || null, role: s.role || "student", photo: s.photo ? "/api/dyl/photo?id=" + id : null, score: s.score, streak: s.streak, best: s.best,
      used: s.used, total: s.total, status: s.status,
      updatedAt: s.updatedAt, registeredAt: s.registeredAt
    };
  }).sort(function(a, b){
    if(b.score !== a.score) return b.score - a.score;
    return a.registeredAt - b.registeredAt;
  });
  list.forEach(function(s, idx){ s.rank = idx + 1; });
  return list;
}

/* ===== 大文字ビンゴ（Unit6 ALPHABET）用データ ===== */
const ALPHABET_FILE = path.join(__dirname, 'alphabet_rooms.json');
const ALPHABET_STUDENTS_FILE = path.join(__dirname, 'alphabet_students.json');
let alphabetRooms = {}; // room名 -> { size: 3, calledWords: [] }
let alphabetStudents = {}; // id -> { id, room, photo, lineCount, bingoAt, registeredAt, updatedAt }
function loadAlphabet(){
  try{
    const raw = fs.readFileSync(ALPHABET_FILE, 'utf8');
    alphabetRooms = JSON.parse(raw);
  }catch(e){
    alphabetRooms = {};
  }
}
function saveAlphabet(){
  try{
    fs.writeFileSync(ALPHABET_FILE, JSON.stringify(alphabetRooms));
  }catch(e){
    console.error('保存に失敗しました:', e.message);
  }
}
loadAlphabet();

function loadAlphabetStudents(){
  try{
    const raw = fs.readFileSync(ALPHABET_STUDENTS_FILE, 'utf8');
    alphabetStudents = JSON.parse(raw);
  }catch(e){
    alphabetStudents = {};
  }
}
function saveAlphabetStudents(){
  try{
    fs.writeFileSync(ALPHABET_STUDENTS_FILE, JSON.stringify(alphabetStudents));
  }catch(e){
    console.error('保存に失敗しました:', e.message);
  }
}
loadAlphabetStudents();

function getAlphabetRoom(room){
  if(!alphabetRooms[room]){
    alphabetRooms[room] = { size: 3, calledWords: [] };
  }
  if(!alphabetRooms[room].size) alphabetRooms[room].size = 3;
  if(!alphabetRooms[room].calledWords) alphabetRooms[room].calledWords = [];
  return alphabetRooms[room];
}

function publicAlphabetList(room){
  const list = Object.keys(alphabetStudents).filter(function(id){
    return normalizeRoom(alphabetStudents[id].room) === room;
  }).map(function(id){
    const s = alphabetStudents[id];
    return {
      id: id,
      no: s.no || null,
      role: s.role || "student",
      photo: s.photo ? "/api/alphabet/photo?id=" + id : null,
      lineCount: s.lineCount || 0,
      bingoAt: s.bingoAt || null,
      registeredAt: s.registeredAt,
      updatedAt: s.updatedAt
    };
  }).sort(function(a, b){
    // ビンゴ達成ずみの人を、達成が早かった順に先頭へ。まだの人はライン数が多い順。
    if(a.bingoAt && b.bingoAt) return a.bingoAt - b.bingoAt;
    if(a.bingoAt && !b.bingoAt) return -1;
    if(!a.bingoAt && b.bingoAt) return 1;
    if(b.lineCount !== a.lineCount) return b.lineCount - a.lineCount;
    return a.registeredAt - b.registeredAt;
  });
  list.forEach(function(s, idx){ s.rank = idx + 1; });
  return list;
}


/* ============================================================
 * イニシャルカード交換ゲーム（Let's Try! 1 Unit6 ALPHABET）
 *   /initial（生徒用）/initial-teacher（先生用）/initial-tv（TV用）
 *   room -> { phase: 'making' | 'playing', dealtAt }
 *   生徒 -> { made:[苗字,名前のイニシャル], hand:[2枚], dealt:[配布時の2枚], ... }
 * ============================================================ */
const INITIAL_ROOMS_FILE = path.join(__dirname, 'initial_rooms.json');
const INITIAL_STUDENTS_FILE = path.join(__dirname, 'initial_students.json');
let initialRooms = {};
let initialStudents = {};
function loadInitial(){
  try{ initialRooms = JSON.parse(fs.readFileSync(INITIAL_ROOMS_FILE, 'utf8')); }catch(e){ initialRooms = {}; }
  try{ initialStudents = JSON.parse(fs.readFileSync(INITIAL_STUDENTS_FILE, 'utf8')); }catch(e){ initialStudents = {}; }
}
function saveInitialRooms(){
  try{ fs.writeFileSync(INITIAL_ROOMS_FILE, JSON.stringify(initialRooms)); }catch(e){ console.error('保存に失敗しました:', e.message); }
}
function saveInitialStudents(){
  try{ fs.writeFileSync(INITIAL_STUDENTS_FILE, JSON.stringify(initialStudents)); }catch(e){ console.error('保存に失敗しました:', e.message); }
}
loadInitial();

function getInitialRoom(room){
  if(!initialRooms[room]) initialRooms[room] = { phase: 'making', dealtAt: null };
  // mode: 'endless'=先生が終了を押すまで何周でも / 'single'=全員が1周クリアしたら自動で終了
  if(initialRooms[room].mode !== 'single') initialRooms[room].mode = 'endless';
  if(initialRooms[room].phase !== 'playing' && initialRooms[room].phase !== 'finished') initialRooms[room].phase = 'making';
  return initialRooms[room];
}
// ひらがな（カタカナ・のばす棒・空白もOK）だけの名前か。最大12文字。
function cleanKanaName(v){
  if(typeof v !== 'string') return '';
  const t = v.replace(/[\s\u3000]+/g, '').slice(0, 12);
  return /^[\u3041-\u3096\u30A1-\u30FA\u30FC]+$/.test(t) ? t : '';
}
function initialNameOf(st){
  if(st.role === 'teacher' && !st.family && !st.given) return '';
  const f = st.family || '', g = st.given || '';
  return (f && g) ? (f + ' ' + g) : (f || g || '');
}
function isInitialLetter(v){ return typeof v === 'string' && /^[A-Z]$/.test(v); }
function isInitialPair(a){ return Array.isArray(a) && a.length === 2 && isInitialLetter(a[0]) && isInitialLetter(a[1]); }
// 自分のイニシャルのうち、手元にそろっている枚数（0〜2）
function initialMatchCount(made, hand){
  if(!isInitialPair(made) || !isInitialPair(hand)) return 0;
  const rest = hand.slice();
  let n = 0;
  made.forEach(function(c){
    const i = rest.indexOf(c);
    if(i >= 0){ n++; rest.splice(i, 1); }
  });
  return n;
}
// いま集めている目標のカード（1周め=自分のイニシャル、2周め以降=ともだちのイニシャル）
function initialTarget(st){ return isInitialPair(st.target) ? st.target : st.made; }
function initialLapCount(st){ return Array.isArray(st.laps) ? st.laps.length : 0; }
function initialTargetFrom(st){
  const o = st.targetFrom && initialStudents[st.targetFrom] ? initialStudents[st.targetFrom] : st;
  return {
    id: o.id,
    self: o.id === st.id,
    no: o.no || null,
    role: o.role || 'student',
    name: initialNameOf(o),
    photo: o.photo ? '/api/initial/photo?id=' + o.id : null
  };
}
// 交換の依頼（メモリ上のみ。再起動で消えてよい）。生徒id -> { id, room, from, to, giveIdx, give, at }
const initialOffers = {};
const INITIAL_OFFER_TTL = 90 * 1000;
function pruneInitialOffers(){
  const now = Date.now();
  Object.keys(initialOffers).forEach(function(k){
    const o = initialOffers[k];
    const a = initialStudents[o.from], b = initialStudents[o.to];
    if(!a || !b){ delete initialOffers[k]; return; }
    if(now - o.at > INITIAL_OFFER_TTL){
      a.notice = { kind: 'expired', at: now, no: b.no || null, role: b.role || 'student', name: initialNameOf(b) };
      delete initialOffers[k];
    }
  });
}
function initialLabel(st){
  return { no: st.no || null, role: st.role || 'student' };
}
function initialMe(st){
  pruneInitialOffers();
  const incoming = [];
  Object.keys(initialOffers).forEach(function(k){
    const o = initialOffers[k];
    if(o.to === st.id && initialStudents[o.from]){
      incoming.push({ id: o.id, from: o.from, fromNo: initialStudents[o.from].no || null, fromRole: initialStudents[o.from].role || 'student', fromName: initialNameOf(initialStudents[o.from]), give: o.give });
    }
  });
  const mine = initialOffers[st.id];
  const outgoing = mine && initialStudents[mine.to]
    ? { id: mine.id, to: mine.to, toNo: initialStudents[mine.to].no || null, toRole: initialStudents[mine.to].role || 'student', toName: initialNameOf(initialStudents[mine.to]), giveIdx: mine.giveIdx }
    : null;
  return {
    incoming: incoming,
    outgoing: outgoing,
    notice: (st.notice && Date.now() - st.notice.at < 30000) ? st.notice : null,
    name: initialNameOf(st),
    family: st.family || '',
    given: st.given || '',
    made: isInitialPair(st.made) ? st.made : null,
    target: isInitialPair(initialTarget(st)) ? initialTarget(st) : null,
    targetFrom: initialTargetFrom(st),
    hand: isInitialPair(st.hand) ? st.hand : null,
    matched: initialMatchCount(initialTarget(st), st.hand),
    laps: initialLapCount(st),
    clearedAt: st.clearedAt || null
  };
}
// クリアしたら、つぎの周へ（配った順にならんだ「ともだち」のイニシャルを、つぎの目標にする）
function advanceInitialRound(st){
  const r = initialRooms[normalizeRoom(st.room)];
  const order = r && Array.isArray(r.order) ? r.order : null;
  const k = order ? order.indexOf(st.id) : -1;
  if(k < 0) return false;
  const n = order.length;
  let round = st.round || 1;
  for(let t = 0; t < n; t++){
    round++;
    const ownerId = order[(k + round - 1) % n];
    const o = initialStudents[ownerId];
    if(!o || !isInitialPair(o.made)) continue;
    if(initialMatchCount(o.made, st.hand) === 2) continue; // もう手元にそろっている目標はとばす
    st.round = round;
    st.target = o.made.slice();
    st.targetFrom = ownerId;
    return true;
  }
  return false;
}
// 手札が目標とそろっていたら1周クリアとして記録して、つぎの周へ進める
function checkInitialLap(st, now){
  if(!isInitialPair(st.made) || !isInitialPair(st.hand)) return false;
  if(initialMatchCount(initialTarget(st), st.hand) !== 2) return false;
  if(!Array.isArray(st.laps)) st.laps = [];
  const room = normalizeRoom(st.room);
  if(getInitialRoom(room).mode === 'single'){
    // 1周で終了モード：最初のクリアだけ記録（クリア後は、ほかの友だちのために交換だけつづける）
    if(st.laps.length > 0) return false;
    st.laps.push({ round: 1, at: now });
    if(!st.clearedAt) st.clearedAt = now;
    st.pendingAdvance = true;
    maybeAutoFinishInitial(room);
    return true;
  }
  st.laps.push({ round: st.laps.length + 1, at: now });
  if(!st.clearedAt) st.clearedAt = now;
  advanceInitialRound(st);
  return true;
}
// 1周で終了モード：全員が1周クリアしたら、じどうでゲームを終了する
function maybeAutoFinishInitial(room){
  const r = getInitialRoom(room);
  if(r.mode !== 'single' || r.phase !== 'playing') return false;
  const order = Array.isArray(r.order) ? r.order : [];
  const players = order.filter(function(id){
    const x = initialStudents[id];
    return x && isInitialPair(x.made) && isInitialPair(x.hand);
  });
  if(players.length < 2) return false;
  const all = players.every(function(id){ return initialLapCount(initialStudents[id]) >= 1; });
  if(!all) return false;
  r.phase = 'finished';
  r.finishedAt = Date.now();
  r.autoFinished = true;
  saveInitialRooms();
  return true;
}
function publicInitialList(room){
  const list = Object.keys(initialStudents).filter(function(id){
    return normalizeRoom(initialStudents[id].room) === room;
  }).map(function(id){
    const s = initialStudents[id];
    const laps = initialLapCount(s);
    return {
      id: id,
      no: s.no || null,
      role: s.role || 'student',
      name: initialNameOf(s),
      photo: s.photo ? '/api/initial/photo?id=' + id : null,
      made: isInitialPair(s.made) ? s.made : null,
      target: isInitialPair(initialTarget(s)) ? initialTarget(s) : null,
      targetFrom: initialTargetFrom(s),
      hand: isInitialPair(s.hand) ? s.hand : null,
      matched: initialMatchCount(initialTarget(s), s.hand),
      lapCount: laps,
      lastLapAt: laps ? s.laps[laps - 1].at : null,
      exchanges: s.exchanges || 0,
      hints: s.hints || 0,
      clearedAt: s.clearedAt || null,
      registeredAt: s.registeredAt,
      updatedAt: s.updatedAt
    };
  }).sort(function(a, b){
    // 周回数が多い順。同じなら、早くその周回数に届いた順。まだの人はそろった枚数が多い順。
    if(b.lapCount !== a.lapCount) return b.lapCount - a.lapCount;
    if(a.lapCount && b.lapCount) return a.lastLapAt - b.lastLapAt;
    if(b.matched !== a.matched) return b.matched - a.matched;
    return a.registeredAt - b.registeredAt;
  });
  list.forEach(function(s, idx){ s.rank = idx + 1; });
  return list;
}
// 2人のカードを、同時に1枚ずつ入れかえる（カードの総数は変わらない）
function swapInitialCards(a, ai, b, bi, now){
  const tmp = a.hand[ai];
  a.hand[ai] = b.hand[bi];
  b.hand[bi] = tmp;
  a.exchanges = (a.exchanges || 0) + 1;
  b.exchanges = (b.exchanges || 0) + 1;
  a.updatedAt = now; b.updatedAt = now;
  // 手札が変わった2人が出していた依頼は無効にする
  delete initialOffers[a.id];
  delete initialOffers[b.id];
  const lapA = checkInitialLap(a, now);
  const lapB = checkInitialLap(b, now);
  return { lapA: lapA, lapB: lapB };
}
// 全員のカードを集めてシャッフルし、2枚ずつ配りなおす。最初から自分のイニシャルがそろう人が出ないようにする（できる範囲で）。
function dealInitialCards(room){
  const ids = Object.keys(initialStudents).filter(function(id){
    const s = initialStudents[id];
    return normalizeRoom(s.room) === room && isInitialPair(s.made);
  });
  if(ids.length < 2) return { ok: false, count: ids.length };
  const pool = [];
  ids.forEach(function(id){ pool.push(initialStudents[id].made[0], initialStudents[id].made[1]); });
  function shuffle(a){
    for(let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // 配られたカードが、その人自身のイニシャルと同じ文字になる「もったいない」位置の数
  function ownCount(p){
    let c = 0;
    for(let k = 0; k < ids.length; k++){
      const m = initialStudents[ids[k]].made;
      if(m.indexOf(p[k * 2]) >= 0) c++;
      if(m.indexOf(p[k * 2 + 1]) >= 0) c++;
    }
    return c;
  }
  function isOwn(p, pos){
    return initialStudents[ids[pos >> 1]].made.indexOf(p[pos]) >= 0;
  }
  // できるだけ、2枚とも自分のイニシャルではないカードを配る（ランダム配置から、ぶつかった位置を入れかえて直す）
  let best = null, bestCost = Infinity;
  for(let t = 0; t < 20 && bestCost > 0; t++){
    const p = shuffle(pool.slice());
    let cost = ownCount(p);
    for(let it = 0; it < 3000 && cost > 0; it++){
      const bad = [];
      for(let pos = 0; pos < p.length; pos++){ if(isOwn(p, pos)) bad.push(pos); }
      if(bad.length === 0) break;
      const a = bad[Math.floor(Math.random() * bad.length)];
      const b = Math.floor(Math.random() * p.length);
      if(a === b) continue;
      const before = (isOwn(p, a) ? 1 : 0) + (isOwn(p, b) ? 1 : 0);
      const tmp = p[a]; p[a] = p[b]; p[b] = tmp;
      const after = (isOwn(p, a) ? 1 : 0) + (isOwn(p, b) ? 1 : 0);
      if(after <= before){ cost += after - before; } else { const t2 = p[a]; p[a] = p[b]; p[b] = t2; }
    }
    if(cost < bestCost){ best = p.slice(); bestCost = cost; }
  }
  // 万一、最初からクリアになる人が出てしまう場合は、ランダムで引きなおして減らす
  function clearedCount(p){
    let c = 0;
    ids.forEach(function(id, k){
      if(initialMatchCount(initialStudents[id].made, [p[k * 2], p[k * 2 + 1]]) === 2) c++;
    });
    return c;
  }
  if(clearedCount(best) > 0){
    for(let t = 0; t < 300; t++){
      const p = shuffle(pool.slice());
      if(clearedCount(p) < clearedCount(best)){ best = p; }
      if(clearedCount(best) === 0) break;
    }
  }
  const now = Date.now();
  ids.forEach(function(id, k){
    const s = initialStudents[id];
    s.hand = [best[k * 2], best[k * 2 + 1]];
    s.dealt = s.hand.slice();
    s.exchanges = 0;
    s.hints = 0;
    s.clearedAt = null;
    s.laps = [];
    s.pendingAdvance = false;
    s.round = 1;
    s.target = s.made.slice();
    s.targetFrom = id;
    s.updatedAt = now;
  });
  getInitialRoom(room).order = ids.slice();
  Object.keys(initialOffers).forEach(function(k){ if(initialOffers[k].room === room) delete initialOffers[k]; });
  ids.forEach(function(id){ checkInitialLap(initialStudents[id], now); });
  // カードを作っていない人（あとから来た人など）は、配りなおされるまで待つ
  Object.keys(initialStudents).forEach(function(id){
    const s = initialStudents[id];
    if(normalizeRoom(s.room) === room && ids.indexOf(id) < 0){
      s.hand = null; s.dealt = null; s.exchanges = 0; s.clearedAt = null; s.laps = []; s.round = 1; s.target = null; s.targetFrom = null;
    }
  });
  const r = getInitialRoom(room);
  r.phase = 'playing';
  r.autoFinished = false;
  r.dealtAt = now;
  saveInitialRooms();
  saveInitialStudents();
  return { ok: true, count: ids.length };
}

/* ---------- 🎯 イニシャルクイズ（先生が出題 → 児童がタップ → はやいほど高ポイント） ---------- */
const initialQuizzes = {};   // room -> quiz（メモリ上のみ）
function getInitialQuiz(room){
  if(!initialQuizzes[room]){
    initialQuizzes[room] = { state: 'idle', qid: 0, duration: 15, startedAt: 0, ansId: null, letters: null, choices: [], answers: {}, seen: {}, scores: {}, used: [] };
  }
  const q = initialQuizzes[room];
  // 制限時間がすぎても、おそく こたえた人も ポイントが入る（100点）。猶予（30びょう）のあと、じどうで「こたえ合わせ」へ
  if(q.state === 'question' && Date.now() >= q.startedAt + (q.duration + 30) * 1000) q.state = 'reveal';
  return q;
}
function quizEligible(room){
  return Object.keys(initialStudents).filter(function(id){
    const x = initialStudents[id];
    return normalizeRoom(x.room) === room && x.role !== 'teacher' && isInitialPair(x.made) && initialNameOf(x);
  });
}
function quizShuffle(a){
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function startInitialQuiz(room, seconds){
  const q = getInitialQuiz(room);
  const ids = quizEligible(room);
  if(ids.length < 3) return { ok: false, count: ids.length };
  let pool = ids.filter(function(id){ return q.used.indexOf(id) < 0; });
  if(!pool.length){ q.used = []; pool = ids.slice(); }
  const ansId = pool[Math.floor(Math.random() * pool.length)];
  const key = initialStudents[ansId].made.join('');
  const seen = {}; seen[key] = 1;
  const ds = [];
  quizShuffle(ids.slice()).forEach(function(id){
    const k = initialStudents[id].made.join('');
    if(ds.length < 3 && id !== ansId && !seen[k]){ seen[k] = 1; ds.push(id); }
  });
  if(!ds.length) return { ok: false, count: ids.length, same: true };
  q.used.push(ansId);
  q.qid++;
  q.state = 'question';
  q.duration = [10, 15, 20, 30].indexOf(seconds) >= 0 ? seconds : 15;
  q.startedAt = Date.now();
  q.ansId = ansId;
  q.letters = initialStudents[ansId].made.slice();
  q.choices = quizShuffle([ansId].concat(ds));
  q.answers = {};
  q.seen = {};
  return { ok: true };
}
// こたえた人数／こたえられる人数（こたえの本人も、こたえられる）
function quizCounts(room, q){
  const ids = quizEligible(room);
  let n = 0;
  ids.forEach(function(id){ if(q.answers[id]) n++; });
  return { answered: n, players: ids.length };
}
function quizPoints(elapsedSec, duration){
  const e = Math.max(0, Math.min(duration, elapsedSec));
  return Math.max(100, Math.round(1000 - 900 * e / duration));
}
function quizRanking(room, q){
  const list = quizEligible(room).map(function(id){
    const x = initialStudents[id];
    const sc = q.scores[id] || { points: 0, correct: 0, played: 0 };
    return { id: id, no: x.no || null, name: initialNameOf(x), points: sc.points, correct: sc.correct, played: sc.played };
  }).sort(function(a, b){
    if(b.points !== a.points) return b.points - a.points;
    if(b.correct !== a.correct) return b.correct - a.correct;
    return (a.no || 999) - (b.no || 999);
  });
  list.forEach(function(r, i){ r.rank = (i > 0 && list[i - 1].points === r.points) ? list[i - 1].rank : i + 1; });
  return list;
}
function quizChoicesPublic(q){
  return q.choices.map(function(id){ return { id: id, name: initialStudents[id] ? initialNameOf(initialStudents[id]) : '' }; });
}
// 先生・TV用（こたえも入っている。TVは こたえ合わせまで表示しない）
function quizTeacherView(room){
  const q = getInitialQuiz(room);
  const c = quizCounts(room, q);
  const ans = q.ansId && initialStudents[q.ansId] ? initialStudents[q.ansId] : null;
  const dist = {};
  Object.keys(q.answers).forEach(function(id){ const ch = q.answers[id].choice; dist[ch] = (dist[ch] || 0) + 1; });
  return {
    state: q.state, qid: q.qid, duration: q.duration,
    remainingMs: q.state === 'question' ? Math.max(0, q.startedAt + q.duration * 1000 - Date.now()) : 0,
    letters: q.letters, choices: quizChoicesPublic(q),
    answer: ans ? { id: ans.id, name: initialNameOf(ans), no: ans.no || null, photo: ans.photo ? '/api/initial/photo?id=' + ans.id : null } : null,
    answered: c.answered, players: c.players, dist: dist,
    eligible: quizEligible(room).length,
    ranking: quizRanking(room, q).slice(0, 10)
  };
}
// 児童用
function quizStudentView(room, st){
  const q = getInitialQuiz(room);
  if(q.state === 'idle' || !q.qid) return null;
  const mine = q.answers[st.id] || null;
  const isAns = q.ansId === st.id;
  if(q.state === 'question'){
    if(!q.seen[st.id]) q.seen[st.id] = Date.now();   // この子の画面に、もんだいが出た時刻（通信のおくれで ふりにならないように）
    return { state: 'question', qid: q.qid, duration: q.duration, remainingMs: Math.max(0, q.startedAt + q.duration * 1000 - Date.now()), letters: q.letters, choices: quizChoicesPublic(q), mine: mine ? mine.choice : null, isAns: isAns };
  }
  const rk = quizRanking(room, q);
  const me = rk.filter(function(r){ return r.id === st.id; })[0];
  const ans = initialStudents[q.ansId];
  return {
    state: 'reveal', qid: q.qid, letters: q.letters, choices: quizChoicesPublic(q),
    correctId: q.ansId, correctName: ans ? initialNameOf(ans) : '', correctPhoto: ans && ans.photo ? '/api/initial/photo?id=' + ans.id : null,
    mine: mine ? mine.choice : null, gained: mine ? mine.points : 0, isAns: isAns,
    total: me ? me.points : 0, rank: me ? me.rank : null, players: rk.length,
    top: rk.slice(0, 3).map(function(r){ return { name: r.name, points: r.points, rank: r.rank }; })
  };
}
function quizAnswer(room, st, choiceId, qid){
  const q = getInitialQuiz(room);
  if(q.state !== 'question' || q.qid !== qid) return { ok: false, reason: 'closed' };
  if(st.role === 'teacher') return { ok: false, reason: 'teacher' };
  if(q.answers[st.id]) return { ok: true, already: true };
  if(q.choices.indexOf(choiceId) < 0) return { ok: false, reason: 'bad' };
  const now = Date.now();
  const from = q.seen[st.id] || q.startedAt;
  const good = choiceId === q.ansId;
  const points = good ? quizPoints((now - from) / 1000, q.duration) : 0;
  q.answers[st.id] = { choice: choiceId, at: now, points: points };
  const sc = q.scores[st.id] || (q.scores[st.id] = { points: 0, correct: 0, played: 0 });
  sc.points += points; sc.played++; if(good) sc.correct++;
  // みんな こたえたら、じどうで「こたえ合わせ」
  const c = quizCounts(room, q);
  if(c.answered >= c.players) q.state = 'reveal';
  return { ok: true, points: points };
}
function remapInitialQuizId(room, oldId, newId){
  const q = initialQuizzes[room];
  if(!q) return;
  ['answers', 'seen', 'scores'].forEach(function(k){
    if(q[k] && q[k][oldId] !== undefined){ q[k][newId] = q[k][oldId]; delete q[k][oldId]; }
  });
  if(q.ansId === oldId) q.ansId = newId;
  q.choices = q.choices.map(function(x){ return x === oldId ? newId : x; });
  q.used = q.used.map(function(x){ return x === oldId ? newId : x; });
}

function sendJson(res, status, obj){
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function serveFile(res, filePath, contentType){
  fs.readFile(filePath, function(err, data){
    if(err){
      sendJson(res, 404, { error: 'not found' });
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function readJsonBody(req, cb){
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  req.on('data', function(chunk){
    size += chunk.length;
    if(size > MAX_BODY_BYTES){
      tooLarge = true;
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', function(){
    if(tooLarge){ cb(null); return; }
    const raw = Buffer.concat(chunks).toString('utf8');
    let json = null;
    try{ json = raw ? JSON.parse(raw) : {}; }catch(e){ json = null; }
    cb(json);
  });
  req.on('error', function(){ cb(null); });
}

function publicList(room){
  const list = Object.keys(students).filter(function(id){
    return normalizeRoom(students[id].room) === room;
  }).map(function(id){
    const s = students[id];
    return {
      id: id,
      photo: s.photo,
      score: s.score,
      streak: s.streak,
      best: s.best,
      used: s.used,
      total: s.total,
      status: s.status,
      updatedAt: s.updatedAt,
      registeredAt: s.registeredAt
    };
  }).sort(function(a, b){
    // 合計ポイント(スコア)順。同点の場合は先に登録した人を上にする（れんぞく記録では並び替えない）
    if(b.score !== a.score) return b.score - a.score;
    return a.registeredAt - b.registeredAt;
  });
  list.forEach(function(s, idx){ s.rank = idx + 1; });
  return list;
}

const server = http.createServer(function(req, res){
  const fullUrl = req.url || '/';
  const url = fullUrl.split('?')[0];
  const queryString = fullUrl.indexOf('?') >= 0 ? fullUrl.slice(fullUrl.indexOf('?') + 1) : '';

  if(req.method === 'OPTIONS'){
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }

  if(req.method === 'GET' && url === '/'){
    serveFile(res, path.join(PUBLIC_DIR, 'game.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/teacher'){
    serveFile(res, path.join(PUBLIC_DIR, 'teacher.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/tv'){
    serveFile(res, path.join(PUBLIC_DIR, 'tv.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/bingo'){
    serveFile(res, path.join(PUBLIC_DIR, 'bingo.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/bingo-teacher'){
    serveFile(res, path.join(PUBLIC_DIR, 'bingo-teacher.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/bingo-tv'){
    serveFile(res, path.join(PUBLIC_DIR, 'bingo-tv.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/halloween-bingo'){
    serveFile(res, path.join(PUBLIC_DIR, 'halloween-bingo.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/halloween-bingo-teacher'){
    serveFile(res, path.join(PUBLIC_DIR, 'halloween-bingo-teacher.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/halloween-bingo-tv'){
    serveFile(res, path.join(PUBLIC_DIR, 'halloween-bingo-tv.html'), 'text/html; charset=utf-8');
    return;
  }

  if(req.method === 'GET' && url === '/api/state'){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    sendJson(res, 200, { students: publicList(room), room: room, finished: isRoomFinished(room) });
    return;
  }

  if(req.method === 'POST' && url === '/api/register'){
    readJsonBody(req, function(body){
      if(!body){ sendJson(res, 400, { error: 'invalid body' }); return; }
      const room = normalizeRoom(body.room);
      const id = crypto.randomBytes(4).toString('hex');
      students[id] = {
        id: id,
        room: room,
        photo: typeof body.photo === 'string' ? body.photo : null,
        score: 0,
        streak: 0,
        best: 0,
        used: 0,
        total: typeof body.total === 'number' ? body.total : 0,
        status: 'とうろくしました',
        updatedAt: Date.now(),
        registeredAt: Date.now()
      };
      saveData();
      sendJson(res, 200, { id: id, room: room });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/event'){
    readJsonBody(req, function(body){
      if(!body || !body.id || !students[body.id]){
        sendJson(res, 404, { error: 'unknown student' });
        return;
      }
      const s = students[body.id];
      if(typeof body.score === 'number') s.score = body.score;
      if(typeof body.streak === 'number') s.streak = body.streak;
      if(typeof body.best === 'number') s.best = body.best;
      if(typeof body.used === 'number') s.used = body.used;
      if(typeof body.total === 'number') s.total = body.total;
      if(typeof body.status === 'string') s.status = body.status;
      s.updatedAt = Date.now();
      saveData();
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/reset'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      Object.keys(students).forEach(function(id){
        if(normalizeRoom(students[id].room) === room) delete students[id];
      });
      delete rooms[room];
      saveData();
      saveRooms();
      sendJson(res, 200, { ok: true, room: room });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/finish'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      rooms[room] = { finished: true, finishedAt: Date.now() };
      saveRooms();
      sendJson(res, 200, { ok: true, room: room, finished: true });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/resume'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      rooms[room] = { finished: false };
      saveRooms();
      sendJson(res, 200, { ok: true, room: room, finished: false });
    });
    return;
  }

  if(req.method === 'GET' && url === '/api/bingo/photo'){
    const st = bingoStudents[getQueryParam(queryString, 'id')];
    const m = st && typeof st.photo === 'string' ? st.photo.match(/^data:(image\/[a-z]+);base64,(.+)$/) : null;
    if(!m){ sendJson(res, 404, { error: 'not found' }); return; }
    const buf = Buffer.from(m[2], 'base64');
    res.writeHead(200, { 'Content-Type': m[1], 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=604800, immutable', 'Access-Control-Allow-Origin': '*' });
    res.end(buf);
    return;
  }

  if(req.method === 'GET' && url === '/api/bingo/state' && getQueryParam(queryString, 'me')){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    const me = getQueryParam(queryString, 'me');
    const b = getBingoRoom(room);
    const exists = !!(bingoStudents[me] && normalizeRoom(bingoStudents[me].room) === room);
    sendJson(res, 200, { room: room, size: b.size, calledWords: b.calledWords, exists: exists });
    return;
  }

  if(req.method === 'POST' && url === '/api/bingo/remove'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const id = body && typeof body.id === 'string' ? body.id : '';
      if(id && bingoStudents[id] && normalizeRoom(bingoStudents[id].room) === room){
        delete bingoStudents[id];
        saveBingoStudents();
      }
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  if(req.method === 'GET' && url === '/api/bingo/state'){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    const b = getBingoRoom(room);
    sendJson(res, 200, { room: room, size: b.size, calledWords: b.calledWords, students: publicBingoList(room) });
    return;
  }

  if(req.method === 'POST' && url === '/api/bingo/size'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const size = (body && [3, 4, 5].indexOf(body.size) >= 0) ? body.size : 3;
      bingoRooms[room] = { size: size, calledWords: [] };
      saveBingo();
      sendJson(res, 200, { ok: true, room: room, size: size });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/bingo/call'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const pool = (body && Array.isArray(body.pool)) ? body.pool : [];
      const b = getBingoRoom(room);
      const remaining = pool.filter(function(w){ return b.calledWords.indexOf(w) < 0; });
      if(remaining.length === 0){
        sendJson(res, 200, { room: room, size: b.size, calledWords: b.calledWords, done: true });
        return;
      }
      const pick = remaining[Math.floor(Math.random() * remaining.length)];
      b.calledWords.push(pick);
      saveBingo();
      sendJson(res, 200, { room: room, size: b.size, calledWords: b.calledWords, word: pick, done: false });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/bingo/reset'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const b = getBingoRoom(room);
      bingoRooms[room] = { size: b.size, calledWords: [] };
      saveBingo();
      Object.keys(bingoStudents).forEach(function(id){
        if(normalizeRoom(bingoStudents[id].room) === room) delete bingoStudents[id];
      });
      saveBingoStudents();
      sendJson(res, 200, { ok: true, room: room, size: bingoRooms[room].size });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/bingo/register'){
    readJsonBody(req, function(body){
      if(!body){ sendJson(res, 400, { error: 'invalid body' }); return; }
      const room = normalizeRoom(body.room);
      if(typeof body.replaceId === 'string' && bingoStudents[body.replaceId] && normalizeRoom(bingoStudents[body.replaceId].room) === room){
        delete bingoStudents[body.replaceId];
      }
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 40) : '';
      if(deviceId){
        Object.keys(bingoStudents).forEach(function(k){
          if(bingoStudents[k].deviceId === deviceId && normalizeRoom(bingoStudents[k].room) === room) delete bingoStudents[k];
        });
      }
      const id = crypto.randomBytes(4).toString('hex');
      bingoStudents[id] = {
        id: id,
        room: room,
        deviceId: deviceId,
        role: body.role === 'teacher' ? 'teacher' : 'student',
        no: (body.role !== 'teacher' && typeof body.no === 'number' && body.no >= 1 && body.no <= 99) ? Math.floor(body.no) : null,
        photo: typeof body.photo === 'string' ? body.photo : null,
        lineCount: 0,
        bingoAt: null,
        registeredAt: Date.now(),
        updatedAt: Date.now()
      };
      saveBingoStudents();
      sendJson(res, 200, { id: id, room: room });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/bingo/progress'){
    readJsonBody(req, function(body){
      if(!body || !body.id || !bingoStudents[body.id]){
        sendJson(res, 404, { error: 'unknown student' });
        return;
      }
      const s = bingoStudents[body.id];
      if(body.reset){
        s.lineCount = 0;
        s.bingoAt = null;
      } else if(typeof body.lineCount === 'number'){
        s.lineCount = body.lineCount;
        if(s.lineCount >= 1 && !s.bingoAt) s.bingoAt = Date.now();
      }
      s.updatedAt = Date.now();
      saveBingoStudents();
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  if(req.method === 'GET' && url === '/what'){
    serveFile(res, path.join(PUBLIC_DIR, 'what.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/what-teacher'){
    serveFile(res, path.join(PUBLIC_DIR, 'what-teacher.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/qrcode.js'){
    serveFile(res, path.join(PUBLIC_DIR, 'qrcode.js'), 'application/javascript; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/what-tv'){
    serveFile(res, path.join(PUBLIC_DIR, 'what-tv.html'), 'text/html; charset=utf-8');
    return;
  }

  if(req.method === 'GET' && url === '/api/what/photo'){
    const pid = getQueryParam(queryString, 'id');
    const st = whatStudents[pid];
    const m = st && typeof st.photo === 'string' ? st.photo.match(/^data:(image\/[a-z]+);base64,(.+)$/) : null;
    if(!m){ sendJson(res, 404, { error: 'not found' }); return; }
    const buf = Buffer.from(m[2], 'base64');
    res.writeHead(200, {
      'Content-Type': m[1],
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=604800, immutable',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(buf);
    return;
  }

  if(req.method === 'GET' && url === '/api/what/state' && getQueryParam(queryString, 'me')){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    const me = getQueryParam(queryString, 'me');
    const finished = !!(whatRooms[room] && whatRooms[room].finished);
    const exists = !!(whatStudents[me] && normalizeRoom(whatStudents[me].room) === room);
    sendJson(res, 200, { room: room, finished: finished, exists: exists, students: finished ? publicWhatList(room) : [] });
    return;
  }

  if(req.method === 'GET' && url === '/api/what/state'){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    sendJson(res, 200, { students: publicWhatList(room), room: room, finished: !!(whatRooms[room] && whatRooms[room].finished) });
    return;
  }

  if(req.method === 'POST' && url === '/api/what/register'){
    readJsonBody(req, function(body){
      if(!body){ sendJson(res, 400, { error: 'invalid body' }); return; }
      const room = normalizeRoom(body.room);
      if(typeof body.replaceId === 'string' && whatStudents[body.replaceId] && normalizeRoom(whatStudents[body.replaceId].room) === room){
        delete whatStudents[body.replaceId];
      }
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 40) : '';
      if(deviceId){
        Object.keys(whatStudents).forEach(function(k){
          if(whatStudents[k].deviceId === deviceId && normalizeRoom(whatStudents[k].room) === room) delete whatStudents[k];
        });
      }
      const id = crypto.randomBytes(4).toString('hex');
      whatStudents[id] = {
        id: id, room: room, deviceId: deviceId,
        role: body.role === 'teacher' ? 'teacher' : 'student',
        no: (body.role !== 'teacher' && typeof body.no === 'number' && body.no >= 1 && body.no <= 99) ? Math.floor(body.no) : null,
        photo: typeof body.photo === 'string' ? body.photo : null,
        score: 0, streak: 0, best: 0, used: 0,
        total: typeof body.total === 'number' ? body.total : 0,
        status: 'とうろくしました',
        updatedAt: Date.now(), registeredAt: Date.now()
      };
      saveWhatStudents();
      sendJson(res, 200, { id: id, room: room });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/what/event'){
    readJsonBody(req, function(body){
      if(!body || !body.id || !whatStudents[body.id]){
        sendJson(res, 404, { error: 'unknown student' });
        return;
      }
      const s = whatStudents[body.id];
      ['score', 'streak', 'best', 'used', 'total'].forEach(function(k){
        if(typeof body[k] === 'number') s[k] = body[k];
      });
      if(typeof body.status === 'string') s.status = body.status;
      s.updatedAt = Date.now();
      saveWhatStudents();
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/what/remove'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const id = body && typeof body.id === 'string' ? body.id : '';
      if(id && whatStudents[id] && normalizeRoom(whatStudents[id].room) === room){
        delete whatStudents[id];
        saveWhatStudents();
      }
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/what/reset'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      Object.keys(whatStudents).forEach(function(id){
        if(normalizeRoom(whatStudents[id].room) === room) delete whatStudents[id];
      });
      delete whatRooms[room];
      saveWhatStudents();
      saveWhatRooms();
      sendJson(res, 200, { ok: true, room: room });
    });
    return;
  }

  if(req.method === 'POST' && (url === '/api/what/finish' || url === '/api/what/resume')){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const finished = url === '/api/what/finish';
      whatRooms[room] = finished ? { finished: true, finishedAt: Date.now() } : { finished: false };
      saveWhatRooms();
      sendJson(res, 200, { ok: true, room: room, finished: finished });
    });
    return;
  }

  if(req.method === 'GET' && url === '/api/dyl/photo'){
    const pid = getQueryParam(queryString, 'id');
    const st = dylStudents[pid];
    const m = st && typeof st.photo === 'string' ? st.photo.match(/^data:(image\/[a-z]+);base64,(.+)$/) : null;
    if(!m){ sendJson(res, 404, { error: 'not found' }); return; }
    const buf = Buffer.from(m[2], 'base64');
    res.writeHead(200, {
      'Content-Type': m[1],
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=604800, immutable',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(buf);
    return;
  }

  if(req.method === 'GET' && url === '/api/dyl/state' && getQueryParam(queryString, 'me')){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    const me = getQueryParam(queryString, 'me');
    const finished = !!(dylRooms[room] && dylRooms[room].finished);
    const exists = !!(dylStudents[me] && normalizeRoom(dylStudents[me].room) === room);
    sendJson(res, 200, { room: room, finished: finished, exists: exists, students: finished ? publicDylList(room) : [] });
    return;
  }

  if(req.method === 'GET' && url === '/api/dyl/state'){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    sendJson(res, 200, { students: publicDylList(room), room: room, finished: !!(dylRooms[room] && dylRooms[room].finished) });
    return;
  }

  if(req.method === 'POST' && url === '/api/dyl/register'){
    readJsonBody(req, function(body){
      if(!body){ sendJson(res, 400, { error: 'invalid body' }); return; }
      const room = normalizeRoom(body.room);
      if(typeof body.replaceId === 'string' && dylStudents[body.replaceId] && normalizeRoom(dylStudents[body.replaceId].room) === room){
        delete dylStudents[body.replaceId];
      }
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 40) : '';
      if(deviceId){
        Object.keys(dylStudents).forEach(function(k){
          if(dylStudents[k].deviceId === deviceId && normalizeRoom(dylStudents[k].room) === room) delete dylStudents[k];
        });
      }
      const id = crypto.randomBytes(4).toString('hex');
      dylStudents[id] = {
        id: id, room: room, deviceId: deviceId,
        role: body.role === 'teacher' ? 'teacher' : 'student',
        no: (body.role !== 'teacher' && typeof body.no === 'number' && body.no >= 1 && body.no <= 99) ? Math.floor(body.no) : null,
        photo: typeof body.photo === 'string' ? body.photo : null,
        score: 0, streak: 0, best: 0, used: 0,
        total: typeof body.total === 'number' ? body.total : 0,
        status: 'とうろくしました',
        updatedAt: Date.now(), registeredAt: Date.now()
      };
      saveDylStudents();
      sendJson(res, 200, { id: id, room: room });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/dyl/event'){
    readJsonBody(req, function(body){
      if(!body || !body.id || !dylStudents[body.id]){
        sendJson(res, 404, { error: 'unknown student' });
        return;
      }
      const s = dylStudents[body.id];
      ['score', 'streak', 'best', 'used', 'total'].forEach(function(k){
        if(typeof body[k] === 'number') s[k] = body[k];
      });
      if(typeof body.status === 'string') s.status = body.status;
      s.updatedAt = Date.now();
      saveDylStudents();
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/dyl/remove'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const id = body && typeof body.id === 'string' ? body.id : '';
      if(id && dylStudents[id] && normalizeRoom(dylStudents[id].room) === room){
        delete dylStudents[id];
        saveDylStudents();
      }
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/dyl/reset'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      Object.keys(dylStudents).forEach(function(id){
        if(normalizeRoom(dylStudents[id].room) === room) delete dylStudents[id];
      });
      delete dylRooms[room];
      saveDylStudents();
      saveDylRooms();
      sendJson(res, 200, { ok: true, room: room });
    });
    return;
  }

  if(req.method === 'POST' && (url === '/api/dyl/finish' || url === '/api/dyl/resume')){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const finished = url === '/api/dyl/finish';
      dylRooms[room] = finished ? { finished: true, finishedAt: Date.now() } : { finished: false };
      saveDylRooms();
      sendJson(res, 200, { ok: true, room: room, finished: finished });
    });
    return;
  }

  if(req.method === 'GET' && url === '/alphabet'){
    serveFile(res, path.join(PUBLIC_DIR, 'alphabet.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/alphabet-teacher'){
    serveFile(res, path.join(PUBLIC_DIR, 'alphabet-teacher.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/alphabet-tv'){
    serveFile(res, path.join(PUBLIC_DIR, 'alphabet-tv.html'), 'text/html; charset=utf-8');
    return;
  }

  if(req.method === 'GET' && url === '/api/alphabet/photo'){
    const st = alphabetStudents[getQueryParam(queryString, 'id')];
    const m = st && typeof st.photo === 'string' ? st.photo.match(/^data:(image\/[a-z]+);base64,(.+)$/) : null;
    if(!m){ sendJson(res, 404, { error: 'not found' }); return; }
    const buf = Buffer.from(m[2], 'base64');
    res.writeHead(200, { 'Content-Type': m[1], 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=604800, immutable', 'Access-Control-Allow-Origin': '*' });
    res.end(buf);
    return;
  }

  if(req.method === 'GET' && url === '/api/alphabet/state' && getQueryParam(queryString, 'me')){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    const me = getQueryParam(queryString, 'me');
    const b = getAlphabetRoom(room);
    const exists = !!(alphabetStudents[me] && normalizeRoom(alphabetStudents[me].room) === room);
    sendJson(res, 200, { room: room, size: b.size, calledWords: b.calledWords, exists: exists });
    return;
  }

  if(req.method === 'POST' && url === '/api/alphabet/remove'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const id = body && typeof body.id === 'string' ? body.id : '';
      if(id && alphabetStudents[id] && normalizeRoom(alphabetStudents[id].room) === room){
        delete alphabetStudents[id];
        saveAlphabetStudents();
      }
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  if(req.method === 'GET' && url === '/api/alphabet/state'){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    const b = getAlphabetRoom(room);
    sendJson(res, 200, { room: room, size: b.size, calledWords: b.calledWords, students: publicAlphabetList(room) });
    return;
  }

  if(req.method === 'POST' && url === '/api/alphabet/size'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const size = (body && [3, 4, 5].indexOf(body.size) >= 0) ? body.size : 3;
      alphabetRooms[room] = { size: size, calledWords: [] };
      saveAlphabet();
      sendJson(res, 200, { ok: true, room: room, size: size });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/alphabet/call'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const pool = (body && Array.isArray(body.pool)) ? body.pool : [];
      const b = getAlphabetRoom(room);
      const remaining = pool.filter(function(w){ return b.calledWords.indexOf(w) < 0; });
      if(remaining.length === 0){
        sendJson(res, 200, { room: room, size: b.size, calledWords: b.calledWords, done: true });
        return;
      }
      const pick = remaining[Math.floor(Math.random() * remaining.length)];
      b.calledWords.push(pick);
      saveAlphabet();
      sendJson(res, 200, { room: room, size: b.size, calledWords: b.calledWords, word: pick, done: false });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/alphabet/reset'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const b = getAlphabetRoom(room);
      alphabetRooms[room] = { size: b.size, calledWords: [] };
      saveAlphabet();
      Object.keys(alphabetStudents).forEach(function(id){
        if(normalizeRoom(alphabetStudents[id].room) === room) delete alphabetStudents[id];
      });
      saveAlphabetStudents();
      sendJson(res, 200, { ok: true, room: room, size: alphabetRooms[room].size });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/alphabet/register'){
    readJsonBody(req, function(body){
      if(!body){ sendJson(res, 400, { error: 'invalid body' }); return; }
      const room = normalizeRoom(body.room);
      if(typeof body.replaceId === 'string' && alphabetStudents[body.replaceId] && normalizeRoom(alphabetStudents[body.replaceId].room) === room){
        delete alphabetStudents[body.replaceId];
      }
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 40) : '';
      if(deviceId){
        Object.keys(alphabetStudents).forEach(function(k){
          if(alphabetStudents[k].deviceId === deviceId && normalizeRoom(alphabetStudents[k].room) === room) delete alphabetStudents[k];
        });
      }
      const id = crypto.randomBytes(4).toString('hex');
      alphabetStudents[id] = {
        id: id,
        room: room,
        deviceId: deviceId,
        role: body.role === 'teacher' ? 'teacher' : 'student',
        no: (body.role !== 'teacher' && typeof body.no === 'number' && body.no >= 1 && body.no <= 99) ? Math.floor(body.no) : null,
        photo: typeof body.photo === 'string' ? body.photo : null,
        lineCount: 0,
        bingoAt: null,
        registeredAt: Date.now(),
        updatedAt: Date.now()
      };
      saveAlphabetStudents();
      sendJson(res, 200, { id: id, room: room });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/alphabet/progress'){
    readJsonBody(req, function(body){
      if(!body || !body.id || !alphabetStudents[body.id]){
        sendJson(res, 404, { error: 'unknown student' });
        return;
      }
      const s = alphabetStudents[body.id];
      if(body.reset){
        s.lineCount = 0;
        s.bingoAt = null;
      } else if(typeof body.lineCount === 'number'){
        s.lineCount = body.lineCount;
        if(s.lineCount >= 1 && !s.bingoAt) s.bingoAt = Date.now();
      }
      s.updatedAt = Date.now();
      saveAlphabetStudents();
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  /* ---------- イニシャルカード交換ゲーム ---------- */
  if(req.method === 'GET' && url === '/initial'){
    serveFile(res, path.join(PUBLIC_DIR, 'initial.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/initial-teacher'){
    serveFile(res, path.join(PUBLIC_DIR, 'initial-teacher.html'), 'text/html; charset=utf-8');
    return;
  }
  if(req.method === 'GET' && url === '/initial-tv'){
    serveFile(res, path.join(PUBLIC_DIR, 'initial-tv.html'), 'text/html; charset=utf-8');
    return;
  }

  if(req.method === 'GET' && url === '/api/initial/photo'){
    const st = initialStudents[getQueryParam(queryString, 'id')];
    const m = st && typeof st.photo === 'string' ? st.photo.match(/^data:(image\/[a-z]+);base64,(.+)$/) : null;
    if(!m){ sendJson(res, 404, { error: 'not found' }); return; }
    const buf = Buffer.from(m[2], 'base64');
    res.writeHead(200, { 'Content-Type': m[1], 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=604800, immutable', 'Access-Control-Allow-Origin': '*' });
    res.end(buf);
    return;
  }

  if(req.method === 'GET' && url === '/api/initial/state' && getQueryParam(queryString, 'me')){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    const me = getQueryParam(queryString, 'me');
    const r = getInitialRoom(room);
    const st = initialStudents[me];
    const exists = !!(st && normalizeRoom(st.room) === room);
    let rank = null, total = 0;
    if(exists){
      const list = publicInitialList(room);
      total = list.length;
      const mine = list.filter(function(x){ return x.id === me; })[0];
      rank = mine ? mine.rank : null;
    }
    sendJson(res, 200, { room: room, phase: r.phase, mode: r.mode, autoFinished: !!r.autoFinished, dealtAt: r.dealtAt, exists: exists, rank: rank, total: total, me: exists ? initialMe(st) : null, quiz: (exists && st.role !== 'teacher') ? quizStudentView(room, st) : null });
    return;
  }

  if(req.method === 'GET' && url === '/api/initial/state'){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    const r = getInitialRoom(room);
    const list = publicInitialList(room);
    sendJson(res, 200, {
      room: room, phase: r.phase, mode: r.mode, autoFinished: !!r.autoFinished, dealtAt: r.dealtAt, students: list,
      madeCount: list.filter(function(s){ return !!s.made; }).length,
      clearedCount: list.filter(function(s){ return !!s.clearedAt; }).length
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/initial/remove'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const id = body && typeof body.id === 'string' ? body.id : '';
      if(id && initialStudents[id] && normalizeRoom(initialStudents[id].room) === room){
        delete initialStudents[id];
        saveInitialStudents();
      }
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/initial/reset'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      initialRooms[room] = { phase: 'making', dealtAt: null, mode: getInitialRoom(room).mode };
      delete initialQuizzes[room];
      Object.keys(initialOffers).forEach(function(k){ if(initialOffers[k].room === room) delete initialOffers[k]; });
      saveInitialRooms();
      Object.keys(initialStudents).forEach(function(id){
        if(normalizeRoom(initialStudents[id].room) === room) delete initialStudents[id];
      });
      saveInitialStudents();
      sendJson(res, 200, { ok: true, room: room });
    });
    return;
  }

  if(req.method === 'POST' && url === '/api/initial/register'){
    readJsonBody(req, function(body){
      if(!body){ sendJson(res, 400, { error: 'invalid body' }); return; }
      const room = normalizeRoom(body.room);
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 40) : '';
      // ログインしなおし：前の登録（同じ教室の、同じ端末のもの）をさがす
      let old = null;
      if(typeof body.replaceId === 'string' && initialStudents[body.replaceId] && normalizeRoom(initialStudents[body.replaceId].room) === room){
        old = initialStudents[body.replaceId];
      }
      if(!old && deviceId){
        Object.keys(initialStudents).forEach(function(k){
          if(!old && initialStudents[k].deviceId === deviceId && normalizeRoom(initialStudents[k].room) === room) old = initialStudents[k];
        });
      }
      if(typeof body.replaceId === 'string' && initialStudents[body.replaceId] && normalizeRoom(initialStudents[body.replaceId].room) === room){
        delete initialStudents[body.replaceId];
      }
      if(deviceId){
        Object.keys(initialStudents).forEach(function(k){
          if(initialStudents[k].deviceId === deviceId && normalizeRoom(initialStudents[k].room) === room) delete initialStudents[k];
        });
      }
      const id = crypto.randomBytes(4).toString('hex');
      initialStudents[id] = {
        id: id,
        room: room,
        deviceId: deviceId,
        role: body.role === 'teacher' ? 'teacher' : 'student',
        family: '',
        given: '',
        no: (body.role !== 'teacher' && typeof body.no === 'number' && body.no >= 1 && body.no <= 99) ? Math.floor(body.no) : null,
        photo: typeof body.photo === 'string' ? body.photo : null,
        made: null,
        hand: null,
        dealt: null,
        exchanges: 0,
        clearedAt: null,
        laps: [],
        round: 1,
        target: null,
        targetFrom: null,
        registeredAt: Date.now(),
        updatedAt: Date.now()
      };
      // 「つづきから」：カード・周回数をそのまま引きつぐ（番号や写真をまちがえて登録したときなど）
      let inherited = false;
      if(body.inherit === true && old && (old.made || old.hand)){
        const n = initialStudents[id];
        ['family', 'given', 'made', 'hand', 'dealt', 'exchanges', 'clearedAt', 'laps', 'round', 'target', 'pendingAdvance'].forEach(function(f){
          if(old[f] !== undefined) n[f] = old[f];
        });
        n.targetFrom = old.targetFrom === old.id ? id : (old.targetFrom || null);
        n.registeredAt = old.registeredAt || n.registeredAt;
        // 古い id を指している情報を、新しい id につけかえる
        Object.keys(initialStudents).forEach(function(k){
          if(initialStudents[k].targetFrom === old.id) initialStudents[k].targetFrom = id;
        });
        remapInitialQuizId(room, old.id, id);
        const rr = initialRooms[room];
        if(rr && Array.isArray(rr.order)){
          rr.order = rr.order.map(function(x){ return x === old.id ? id : x; });
          saveInitialRooms();
        }
        inherited = true;
      }
      // 古い id の交換の依頼は、とりけす
      Object.keys(initialOffers).forEach(function(k){
        if(old && (initialOffers[k].from === old.id || initialOffers[k].to === old.id)) delete initialOffers[k];
      });
      saveInitialStudents();
      sendJson(res, 200, { id: id, room: room, inherited: inherited });
    });
    return;
  }

  // イニシャルカードを作る（苗字・名前の頭文字）。配られたあとは変えられません。
  if(req.method === 'POST' && url === '/api/initial/make'){
    readJsonBody(req, function(body){
      if(!body || !body.id || !initialStudents[body.id]){
        sendJson(res, 404, { error: 'unknown student' });
        return;
      }
      if(!isInitialPair(body.cards)){
        sendJson(res, 400, { error: 'invalid cards' });
        return;
      }
      // なまえ（ひらがな）は かならず必要
      const family = cleanKanaName(body.family);
      const given = cleanKanaName(body.given);
      if(!family || !given){
        sendJson(res, 400, { error: 'name required' });
        return;
      }
      const s = initialStudents[body.id];
      if(isInitialPair(s.hand)){
        sendJson(res, 409, { error: 'already dealt' });
        return;
      }
      s.made = body.cards.slice();
      s.family = family;
      s.given = given;
      s.updatedAt = Date.now();
      saveInitialStudents();
      sendJson(res, 200, { ok: true, me: initialMe(s) });
    });
    return;
  }

  // 先生：カードを回収して、2枚ずつ配りなおす
  if(req.method === 'POST' && url === '/api/initial/deal'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const result = dealInitialCards(room);
      if(!result.ok){
        sendJson(res, 200, { ok: false, error: 'need2', count: result.count });
        return;
      }
      sendJson(res, 200, { ok: true, count: result.count });
    });
    return;
  }

  // 先生：モードを切りかえる（'single'=1周で終了 / 'endless'=終了を押すまで何周でも）
  if(req.method === 'POST' && url === '/api/initial/mode'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const r = getInitialRoom(room);
      r.mode = (body && body.mode === 'single') ? 'single' : 'endless';
      if(r.mode === 'endless'){
        // 1周で終了モードでクリアした人は、つぎの周へ進める
        Object.keys(initialStudents).forEach(function(id){
          const x = initialStudents[id];
          if(normalizeRoom(x.room) === room && x.pendingAdvance){
            x.pendingAdvance = false;
            advanceInitialRound(x);
          }
        });
        saveInitialStudents();
      }
      if(r.mode === 'single') maybeAutoFinishInitial(room);
      saveInitialRooms();
      sendJson(res, 200, { ok: true, room: room, mode: r.mode, phase: r.phase });
    });
    return;
  }

  // 先生：ゲームを終了する／再開する（手札・周回数はそのまま）
  if(req.method === 'POST' && (url === '/api/initial/finish' || url === '/api/initial/resume')){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const r = getInitialRoom(room);
      if(url === '/api/initial/finish'){
        if(r.phase === 'playing'){ r.phase = 'finished'; r.finishedAt = Date.now(); r.autoFinished = false; }
      } else if(r.phase === 'finished'){
        r.phase = 'playing'; r.finishedAt = null; r.autoFinished = false;
      }
      saveInitialRooms();
      sendJson(res, 200, { ok: true, room: room, phase: r.phase });
    });
    return;
  }


  // 交換できる友だちの一覧（交換画面をひらいたときだけ取得）
  if(req.method === 'GET' && url === '/api/initial/peers'){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    const me = getQueryParam(queryString, 'me');
    const peers = Object.keys(initialStudents).filter(function(id){
      const x = initialStudents[id];
      return id !== me && normalizeRoom(x.room) === room && isInitialPair(x.made) && isInitialPair(x.hand);
    }).map(function(id){
      const x = initialStudents[id];
      return { id: id, no: x.no || null, role: x.role || 'student', name: initialNameOf(x) };
    }).sort(function(a, b){
      if(a.role !== b.role) return a.role === 'teacher' ? 1 : -1;
      return (a.no || 999) - (b.no || 999);
    });
    sendJson(res, 200, { peers: peers });
    return;
  }

  // ヒント：いま自分がほしいカードを、手元に持っている友だち
  if(req.method === 'GET' && url === '/api/initial/hint'){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    const me = initialStudents[getQueryParam(queryString, 'me')];
    if(!me || normalizeRoom(me.room) !== room || !isInitialPair(me.hand)){
      sendJson(res, 200, { ok: false, need: [], groups: [] });
      return;
    }
    if(getInitialRoom(room).phase !== 'playing'){
      sendJson(res, 200, { ok: false, need: [], groups: [] });
      return;
    }
    // まだ そろっていない文字
    const rest = me.hand.slice();
    const need = [];
    initialTarget(me).forEach(function(c){
      const i = rest.indexOf(c);
      if(i >= 0) rest.splice(i, 1); else need.push(c);
    });
    const uniq = need.filter(function(c, i){ return need.indexOf(c) === i; });
    const others = Object.keys(initialStudents).filter(function(id){
      const x = initialStudents[id];
      return id !== me.id && normalizeRoom(x.room) === room && isInitialPair(x.hand);
    });
    const groups = uniq.map(function(L){
      const people = others.filter(function(id){ return initialStudents[id].hand.indexOf(L) >= 0; });
      // いつも同じ人にあつまらないよう、ランダムな順にして、多すぎるときは6人まで
      for(let i = people.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        const t = people[i]; people[i] = people[j]; people[j] = t;
      }
      return {
        letter: L,
        total: people.length,
        people: people.slice(0, 6).map(function(id){
          const x = initialStudents[id];
          return { id: id, no: x.no || null, role: x.role || 'student', name: initialNameOf(x) };
        }).sort(function(a, b){ return (a.no || 999) - (b.no || 999); })
      };
    });
    me.hints = (me.hints || 0) + 1;
    saveInitialStudents();
    sendJson(res, 200, { ok: true, need: need, groups: groups });
    return;
  }

  // ---- イニシャルクイズ ----
  if(req.method === 'GET' && url === '/api/initial/quiz'){
    sendJson(res, 200, quizTeacherView(normalizeRoom(getQueryParam(queryString, 'room'))));
    return;
  }
  if(req.method === 'POST' && url === '/api/initial/quiz/start'){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const r = startInitialQuiz(room, body && body.seconds);
      if(!r.ok){ sendJson(res, 200, { ok: false, error: r.same ? 'same' : 'need3', count: r.count }); return; }
      sendJson(res, 200, { ok: true, quiz: quizTeacherView(room) });
    });
    return;
  }
  if(req.method === 'POST' && (url === '/api/initial/quiz/reveal' || url === '/api/initial/quiz/stop' || url === '/api/initial/quiz/reset')){
    readJsonBody(req, function(body){
      const room = normalizeRoom(body && body.room);
      const q = getInitialQuiz(room);
      if(url.endsWith('/reveal')){ if(q.state === 'question') q.state = 'reveal'; }
      else if(url.endsWith('/stop')){ q.state = 'idle'; }
      else { delete initialQuizzes[room]; }
      sendJson(res, 200, { ok: true, quiz: quizTeacherView(room) });
    });
    return;
  }
  if(req.method === 'POST' && url === '/api/initial/quiz/answer'){
    readJsonBody(req, function(body){
      const st = body && initialStudents[body.id];
      if(!st){ sendJson(res, 404, { error: 'unknown student' }); return; }
      const room = normalizeRoom(st.room);
      const r = quizAnswer(room, st, body.choiceId, body.qid);
      sendJson(res, 200, { ok: r.ok, reason: r.reason || null, quiz: quizStudentView(room, st) });
    });
    return;
  }

  // 交換の依頼：「この友だちと、このカードを交換したい」
  if(req.method === 'POST' && url === '/api/initial/offer'){
    readJsonBody(req, function(body){
      const a = body && initialStudents[body.id];
      const b = body && initialStudents[body.to];
      if(!a || !b || a.id === b.id || normalizeRoom(a.room) !== normalizeRoom(b.room)){
        sendJson(res, 404, { error: 'unknown student' });
        return;
      }
      const ai = body.giveIdx;
      if((ai !== 0 && ai !== 1) || !isInitialPair(a.hand) || !isInitialPair(b.hand)){
        sendJson(res, 409, { error: 'not dealt' });
        return;
      }
      if(getInitialRoom(normalizeRoom(a.room)).phase !== 'playing'){
        sendJson(res, 409, { error: 'not playing' });
        return;
      }
      pruneInitialOffers();
      // 相手がすでに自分に依頼を出していたら、そのまま交換成立
      const back = initialOffers[b.id];
      if(back && back.to === a.id && b.hand[back.giveIdx] === back.give){
        const now = Date.now();
        const res2 = swapInitialCards(a, ai, b, back.giveIdx, now);
        b.notice = { kind: 'done', at: now, no: a.no || null, role: a.role || 'student', name: initialNameOf(a) };
        saveInitialStudents();
        sendJson(res, 200, { ok: true, done: true, lapJustCleared: res2.lapA, me: initialMe(a) });
        return;
      }
      initialOffers[a.id] = { id: crypto.randomBytes(4).toString('hex'), room: normalizeRoom(a.room), from: a.id, to: b.id, giveIdx: ai, give: a.hand[ai], at: Date.now() };
      a.notice = null;
      sendJson(res, 200, { ok: true, done: false, me: initialMe(a) });
    });
    return;
  }

  // 依頼をとりけす
  if(req.method === 'POST' && url === '/api/initial/offer-cancel'){
    readJsonBody(req, function(body){
      if(body && body.id) delete initialOffers[body.id];
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  // 依頼を受ける（自分が出すカードをえらんで、交換成立）
  if(req.method === 'POST' && url === '/api/initial/accept'){
    readJsonBody(req, function(body){
      const b = body && initialStudents[body.id];
      if(!b){ sendJson(res, 404, { error: 'unknown student' }); return; }
      pruneInitialOffers();
      let offer = null;
      Object.keys(initialOffers).forEach(function(k){ if(initialOffers[k].id === body.offerId && initialOffers[k].to === b.id) offer = initialOffers[k]; });
      const a = offer ? initialStudents[offer.from] : null;
      if(!offer || !a){ sendJson(res, 409, { error: 'expired', me: initialMe(b) }); return; }
      const bi = body.giveIdx;
      if((bi !== 0 && bi !== 1) || !isInitialPair(a.hand) || !isInitialPair(b.hand)){
        sendJson(res, 400, { error: 'invalid' });
        return;
      }
      if(getInitialRoom(normalizeRoom(b.room)).phase !== 'playing'){
        sendJson(res, 409, { error: 'finished' });
        return;
      }
      if(a.hand[offer.giveIdx] !== offer.give){
        delete initialOffers[a.id];
        a.notice = { kind: 'expired', at: Date.now(), no: b.no || null, role: b.role || 'student', name: initialNameOf(b) };
        saveInitialStudents();
        sendJson(res, 409, { error: 'expired', me: initialMe(b) });
        return;
      }
      const now = Date.now();
      const r2 = swapInitialCards(a, offer.giveIdx, b, bi, now);
      a.notice = { kind: 'done', at: now, no: b.no || null, role: b.role || 'student', name: initialNameOf(b) };
      saveInitialStudents();
      sendJson(res, 200, { ok: true, lapJustCleared: r2.lapB, me: initialMe(b) });
    });
    return;
  }

  // 依頼をことわる
  if(req.method === 'POST' && url === '/api/initial/decline'){
    readJsonBody(req, function(body){
      const b = body && initialStudents[body.id];
      if(b){
        Object.keys(initialOffers).forEach(function(k){
          const o = initialOffers[k];
          if(o.id === body.offerId && o.to === b.id){
            const a = initialStudents[o.from];
            if(a) a.notice = { kind: 'declined', at: Date.now(), no: b.no || null, role: b.role || 'student', name: initialNameOf(b) };
            delete initialOffers[k];
          }
        });
        saveInitialStudents();
      }
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  // （旧）手札を直接送る：画面からは使わない
  if(req.method === 'POST' && url === '/api/initial/hand'){
    readJsonBody(req, function(body){
      if(!body || !body.id || !initialStudents[body.id]){
        sendJson(res, 404, { error: 'unknown student' });
        return;
      }
      const s = initialStudents[body.id];
      if(!isInitialPair(s.made) || !isInitialPair(s.hand)){
        sendJson(res, 409, { error: 'not dealt' });
        return;
      }
      if(getInitialRoom(normalizeRoom(s.room)).phase === 'finished'){
        sendJson(res, 409, { error: 'finished' });
        return;
      }
      if(!isInitialPair(body.hand)){
        sendJson(res, 400, { error: 'invalid hand' });
        return;
      }
      const changed = body.hand[0] !== s.hand[0] || body.hand[1] !== s.hand[1];
      s.hand = body.hand.slice();
      if(changed) s.exchanges = (s.exchanges || 0) + 1;
      // 目標がそろったら1周クリア。記録を残して、じどうでつぎの周（ともだちのイニシャル）へ
      const lapJustCleared = changed ? checkInitialLap(s, Date.now()) : false;
      s.updatedAt = Date.now();
      saveInitialStudents();
      sendJson(res, 200, { ok: true, lapJustCleared: lapJustCleared, me: initialMe(s) });
    });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', function(){
  const nets = os.networkInterfaces();
  const addrs = [];
  Object.keys(nets).forEach(function(name){
    (nets[name] || []).forEach(function(net){
      if(net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    });
  });

  console.log('');
  console.log('サーバーが起動しました（ポート ' + PORT + '）');
  console.log('');
  if(addrs.length === 0){
    console.log('※ Wi-Fiに接続されていないため、IPアドレスが見つかりませんでした。');
    console.log('  この端末をWi-Fiに接続してからやり直してください。');
  } else {
    console.log('■ 生徒用（各タブレット・スマホのブラウザで開く）');
    addrs.forEach(function(a){ console.log('   http://' + a + ':' + PORT + '/'); });
    console.log('');
    console.log('■ 先生用ダッシュボード（先生の端末で開く）');
    addrs.forEach(function(a){ console.log('   http://' + a + ':' + PORT + '/teacher'); });
    console.log('');
    console.log('■ TV表示用（TVにつないだ端末のブラウザで開く）');
    addrs.forEach(function(a){ console.log('   http://' + a + ':' + PORT + '/tv'); });
  }
  console.log('');
  console.log('終了するには Ctrl+C を押してください。');
  console.log('');
});
