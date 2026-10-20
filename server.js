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
  if(initialRooms[room].phase !== 'playing') initialRooms[room].phase = 'making';
  return initialRooms[room];
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
function initialMe(st){
  return {
    made: isInitialPair(st.made) ? st.made : null,
    hand: isInitialPair(st.hand) ? st.hand : null,
    matched: initialMatchCount(st.made, st.hand),
    clearedAt: st.clearedAt || null
  };
}
function publicInitialList(room){
  const list = Object.keys(initialStudents).filter(function(id){
    return normalizeRoom(initialStudents[id].room) === room;
  }).map(function(id){
    const s = initialStudents[id];
    return {
      id: id,
      no: s.no || null,
      role: s.role || 'student',
      photo: s.photo ? '/api/initial/photo?id=' + id : null,
      made: isInitialPair(s.made) ? s.made : null,
      hand: isInitialPair(s.hand) ? s.hand : null,
      matched: initialMatchCount(s.made, s.hand),
      exchanges: s.exchanges || 0,
      clearedAt: s.clearedAt || null,
      registeredAt: s.registeredAt,
      updatedAt: s.updatedAt
    };
  }).sort(function(a, b){
    // クリアずみを早い順に先頭へ。まだの人はそろった枚数が多い順。
    if(a.clearedAt && b.clearedAt) return a.clearedAt - b.clearedAt;
    if(a.clearedAt && !b.clearedAt) return -1;
    if(!a.clearedAt && b.clearedAt) return 1;
    if(b.matched !== a.matched) return b.matched - a.matched;
    return a.registeredAt - b.registeredAt;
  });
  list.forEach(function(s, idx){ s.rank = idx + 1; });
  return list;
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
  let best = null, bestCleared = Infinity;
  for(let t = 0; t < 300; t++){
    const p = shuffle(pool.slice());
    let cleared = 0;
    ids.forEach(function(id, k){
      if(initialMatchCount(initialStudents[id].made, [p[k * 2], p[k * 2 + 1]]) === 2) cleared++;
    });
    if(cleared < bestCleared){ best = p; bestCleared = cleared; }
    if(cleared === 0) break;
  }
  const now = Date.now();
  ids.forEach(function(id, k){
    const s = initialStudents[id];
    s.hand = [best[k * 2], best[k * 2 + 1]];
    s.dealt = s.hand.slice();
    s.exchanges = 0;
    s.clearedAt = initialMatchCount(s.made, s.hand) === 2 ? now : null;
    s.updatedAt = now;
  });
  // カードを作っていない人（あとから来た人など）は、配りなおされるまで待つ
  Object.keys(initialStudents).forEach(function(id){
    const s = initialStudents[id];
    if(normalizeRoom(s.room) === room && ids.indexOf(id) < 0){
      s.hand = null; s.dealt = null; s.exchanges = 0; s.clearedAt = null;
    }
  });
  const r = getInitialRoom(room);
  r.phase = 'playing';
  r.dealtAt = now;
  saveInitialRooms();
  saveInitialStudents();
  return { ok: true, count: ids.length };
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
    sendJson(res, 200, { room: room, phase: r.phase, dealtAt: r.dealtAt, exists: exists, me: exists ? initialMe(st) : null });
    return;
  }

  if(req.method === 'GET' && url === '/api/initial/state'){
    const room = normalizeRoom(getQueryParam(queryString, 'room'));
    const r = getInitialRoom(room);
    const list = publicInitialList(room);
    sendJson(res, 200, {
      room: room, phase: r.phase, dealtAt: r.dealtAt, students: list,
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
      initialRooms[room] = { phase: 'making', dealtAt: null };
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
      if(typeof body.replaceId === 'string' && initialStudents[body.replaceId] && normalizeRoom(initialStudents[body.replaceId].room) === room){
        delete initialStudents[body.replaceId];
      }
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 40) : '';
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
        no: (body.role !== 'teacher' && typeof body.no === 'number' && body.no >= 1 && body.no <= 99) ? Math.floor(body.no) : null,
        photo: typeof body.photo === 'string' ? body.photo : null,
        made: null,
        hand: null,
        dealt: null,
        exchanges: 0,
        clearedAt: null,
        registeredAt: Date.now(),
        updatedAt: Date.now()
      };
      saveInitialStudents();
      sendJson(res, 200, { id: id, room: room });
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
      const s = initialStudents[body.id];
      if(isInitialPair(s.hand)){
        sendJson(res, 409, { error: 'already dealt' });
        return;
      }
      s.made = body.cards.slice();
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

  // 生徒：カードを交換したあとの手札を送る
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
      if(!isInitialPair(body.hand)){
        sendJson(res, 400, { error: 'invalid hand' });
        return;
      }
      const changed = body.hand[0] !== s.hand[0] || body.hand[1] !== s.hand[1];
      s.hand = body.hand.slice();
      if(changed) s.exchanges = (s.exchanges || 0) + 1;
      if(initialMatchCount(s.made, s.hand) === 2){
        if(!s.clearedAt) s.clearedAt = Date.now();
      } else {
        s.clearedAt = null;
      }
      s.updatedAt = Date.now();
      saveInitialStudents();
      sendJson(res, 200, { ok: true, me: initialMe(s) });
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
