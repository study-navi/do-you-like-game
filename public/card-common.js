/* グリーティングカード 共通部品（生徒用・先生用で つかう） */
'use strict';
var COLORS = [
  { id: 'red',    ja: 'あか',       en: 'red',    hex: '#E53935', ink: '#fff' },
  { id: 'orange', ja: 'オレンジ',   en: 'orange', hex: '#FB8C00', ink: '#fff' },
  { id: 'yellow', ja: 'きいろ',     en: 'yellow', hex: '#FDD835', ink: '#333' },
  { id: 'green',  ja: 'みどり',     en: 'green',  hex: '#43A047', ink: '#fff' },
  { id: 'lblue',  ja: 'みずいろ',   en: 'light blue', hex: '#4FC3F7', ink: '#333', extra: true },
  { id: 'blue',   ja: 'あお',       en: 'blue',   hex: '#1E67D6', ink: '#fff' },
  { id: 'purple', ja: 'むらさき',   en: 'purple', hex: '#8E5BD0', ink: '#fff' },
  { id: 'pink',   ja: 'ピンク',     en: 'pink',   hex: '#F78FB3', ink: '#333' },
  { id: 'brown',  ja: 'ちゃいろ',   en: 'brown',  hex: '#8D5B3A', ink: '#fff' },
  { id: 'white',  ja: 'しろ',       en: 'white',  hex: '#FFFFFF', ink: '#333' },
  { id: 'gray',   ja: 'はいいろ',   en: 'gray',   hex: '#9E9E9E', ink: '#fff', extra: true },
  { id: 'black',  ja: 'くろ',       en: 'black',  hex: '#2B2B2B', ink: '#fff' }
];

var BIG_S = 1.5, SMALL_S = 0.6;
function sizeWord(it){
  if(!it || it.type === 'piece' || it.type === 'text') return '';
  return it.s >= 1.2 ? 'big' : (it.s <= 0.8 ? 'small' : '');
}
function colorById(id){ for(var i = 0; i < COLORS.length; i++){ if(COLORS[i].id === id) return COLORS[i]; } return COLORS[0]; }

/* 形は -50〜50 の多角形（0,0 が中心）。曲線も細かい点で作るので、きれいに切れる */
function circlePts(rx, ry, n, a0, a1){
  var pts = [];
  for(var i = 0; i <= n; i++){
    var a = a0 + (a1 - a0) * i / n;
    pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  return pts;
}
function starPts(n, ro, ri){
  var pts = [];
  for(var i = 0; i < n * 2; i++){
    var r = i % 2 === 0 ? ro : ri;
    var a = -Math.PI / 2 + Math.PI * i / n;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}
function heartPts(){
  var pts = [];
  for(var i = 0; i < 64; i++){
    var t = Math.PI * 2 * i / 64;
    var x = 16 * Math.pow(Math.sin(t), 3);
    var y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push([x * 3.0, (y + 2.5) * 3.0]);
  }
  return pts;
}
function flowerPts(){
  var pts = [];
  for(var i = 0; i < 120; i++){
    var t = Math.PI * 2 * i / 120;
    var r = 30 + 18 * Math.cos(5 * t);
    pts.push([Math.cos(t) * r * 1.0, Math.sin(t) * r * 1.0]);
  }
  return pts;
}
var SHAPES = [
  { std: true, id: 'circle',   ja: 'まる',         en: 'circle',    pts: circlePts(45, 45, 48, 0, Math.PI * 2 * 47 / 48) },
  { std: true, id: 'triangle', ja: 'さんかく',     en: 'triangle',  pts: [[0, -46], [50, 40], [-50, 40]] },
  { std: true, id: 'square',   ja: 'ましかく',     en: 'square',    pts: [[-40, -40], [40, -40], [40, 40], [-40, 40]] },
  { std: true, id: 'rect',     ja: 'ながしかく',   en: 'rectangle', pts: [[-50, -28], [50, -28], [50, 28], [-50, 28]] },
  { std: true, id: 'diamond',  ja: 'ひしがた',     en: 'diamond',   pts: [[0, -50], [32, 0], [0, 50], [-32, 0]] },
  { id: 'half',     ja: 'はんえん',     en: 'semicircle',pts: circlePts(50, 50, 32, Math.PI, Math.PI * 2).map(function(p){ return [p[0], p[1] + 25]; }) },
  { std: true, id: 'star',     ja: 'ほし',         en: 'star',      pts: starPts(5, 50, 21) },
  { std: true, id: 'heart',    ja: 'ハート',       en: 'heart',     pts: heartPts() },
  { id: 'flower',   ja: 'はな',         en: 'flower',    pts: flowerPts() },
  { id: 'hexagon',  ja: 'ろっかっけい', en: 'hexagon',   pts: circlePts(46, 46, 6, 0, Math.PI * 2 * 5 / 6).map(function(p){ return p; }) },
  { id: 'pentagon', ja: 'ごかっけい',   en: 'pentagon',  pts: circlePts(46, 46, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 4 / 5) },
  { id: 'arrow',    ja: 'やじるし',     en: 'arrow',     pts: [[-50, -14], [8, -14], [8, -34], [50, 0], [8, 34], [8, 14], [-50, 14]] }
];
function shapeById(id){ for(var i = 0; i < SHAPES.length; i++){ if(SHAPES[i].id === id) return SHAPES[i]; } return null; }


var NS = 'http://www.w3.org/2000/svg';

function itemPts(it){
  if(it.type === 'shape'){ return shapeById(it.shape).pts; }
  if(it.type === 'piece'){ return it.pts; }
  return null;
}

function el(name, attrs){
  var e = document.createElementNS(NS, name);
  if(attrs) Object.keys(attrs).forEach(function(k){ e.setAttribute(k, attrs[k]); });
  return e;
}
function ptsAttr(pts){ return pts.map(function(p){ return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' '); }
function itemTransform(it){
  if(it.type === 'text') return 'translate(' + it.x + ' ' + it.y + ') rotate(' + it.r + ')';
  return 'translate(' + it.x + ' ' + it.y + ') rotate(' + it.r + ') scale(' + (it.s * it.asp) + ' ' + (it.s / it.asp) + ')';
}

/* 1まいの カードを svg に えがく（じぶんの画面・ともだちの画面・一覧で共通） */
function drawCardInto(svg, st, opts){
  opts = opts || {};
  svg.setAttribute('viewBox', '0 0 ' + st.w + ' ' + st.h);
  while(svg.firstChild) svg.removeChild(svg.firstChild);
  var shadow = !opts.noShadow;
  if(shadow){
    var defs = el('defs');
    var f = el('filter', { id: 'paperShadow', x: '-20%', y: '-20%', width: '140%', height: '140%' });
    f.appendChild(el('feDropShadow', { dx: '1.5', dy: '2.5', stdDeviation: '2.2', 'flood-color': '#000', 'flood-opacity': '0.28' }));
    defs.appendChild(f);
    svg.appendChild(defs);
  }
  var bgc = colorById(st.bg);
  svg.appendChild(el('rect', { x: 0, y: 0, width: st.w, height: st.h, fill: bgc.hex, rx: 8, stroke: '#00000022', 'stroke-width': 1 }));
  var g = el('g', { id: opts.noIds ? '' : 'items' });
  st.items.forEach(function(it){
    var c = colorById(it.color);
    var node;
    if(it.type === 'text'){
      node = el('text', { transform: itemTransform(it), 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: c.hex,
        'font-size': it.s * 40, 'font-weight': 700, 'font-family': '"Chalkboard SE","Comic Sans MS","Hiragino Maru Gothic ProN","Hiragino Sans",sans-serif' });
      node.textContent = it.text;
      if(c.id === 'white'){ node.setAttribute('stroke', '#00000055'); node.setAttribute('stroke-width', 1); }
    } else {
      node = el('polygon', { points: ptsAttr(itemPts(it)), transform: itemTransform(it), fill: c.hex });
      if(shadow) node.setAttribute('filter', 'url(#paperShadow)');
      if(c.id === 'white'){ node.setAttribute('stroke', '#00000033'); node.setAttribute('stroke-width', 1 / it.s); }
    }
    node.setAttribute('data-id', it.id);
    if(opts.interactive) node.style.cursor = 'move';
    g.appendChild(node);
  });
  svg.appendChild(g);
}

function escapeHtml(s){ return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function miniShapeSvg(pts, hex){
  var b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
  pts.forEach(function(p){ if(p[0] < b.x0) b.x0 = p[0]; if(p[0] > b.x1) b.x1 = p[0]; if(p[1] < b.y0) b.y0 = p[1]; if(p[1] > b.y1) b.y1 = p[1]; });
  var w = b.x1 - b.x0, h = b.y1 - b.y0, m = Math.max(w, h) * 1.1;
  var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return '<svg viewBox="' + (cx - m / 2) + ' ' + (cy - m / 2) + ' ' + m + ' ' + m + '"><polygon points="' + ptsAttr(pts) + '" fill="' + hex + '" stroke="#00000033" stroke-width="2"/></svg>';
}
function countCard(st){
  var byShape = {}, pieces = { n: 0, colors: {}, variants: {} }, texts = 0, byColor = {}, total = 0;
  function addV(row, it){
    row.n++; row.colors[it.color] = (row.colors[it.color] || 0) + 1;
    var sz = sizeWord(it), k = sz + '|' + it.color;
    var v = row.variants[k] || (row.variants[k] = { size: sz, color: it.color, n: 0 });
    v.n++;
  }
  st.items.forEach(function(it){
    if(it.type === 'text'){ texts++; return; }
    total++;
    byColor[it.color] = (byColor[it.color] || 0) + 1;
    if(it.type === 'piece'){ addV(pieces, it); return; }
    var row = byShape[it.shape] || (byShape[it.shape] = { n: 0, colors: {}, variants: {} });
    addV(row, it);
  });
  return { byShape: byShape, pieces: pieces, texts: texts, byColor: byColor, total: total };
}

var NUMW = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function numWord(n){ return n <= 10 ? NUMW[n] : String(n); }
function plural(w, n){ return n === 1 ? w : w + 's'; }

function article(w){ return /^[aeiou]/i.test(w) ? 'an' : 'a'; }
function phrase(size, colorEn, shapeEn, n){
  var words = [size, colorEn].filter(Boolean).join(' ') + ' ' + shapeEn;
  if(n === 1) return article(words) + ' ' + words;
  return numWord(n) + ' ' + words + 's';
}

