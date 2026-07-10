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
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8MB (写真データ用の余裕)

let students = {};

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

function publicList(){
  return Object.keys(students).map(function(id){
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
    if(b.score !== a.score) return b.score - a.score;
    if(b.best !== a.best) return b.best - a.best;
    return a.registeredAt - b.registeredAt;
  });
}

const server = http.createServer(function(req, res){
  const url = (req.url || '/').split('?')[0];

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

  if(req.method === 'GET' && url === '/api/state'){
    sendJson(res, 200, { students: publicList() });
    return;
  }

  if(req.method === 'POST' && url === '/api/register'){
    readJsonBody(req, function(body){
      if(!body){ sendJson(res, 400, { error: 'invalid body' }); return; }
      const id = crypto.randomBytes(4).toString('hex');
      students[id] = {
        id: id,
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
      sendJson(res, 200, { id: id });
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
    students = {};
    saveData();
    sendJson(res, 200, { ok: true });
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
