/* 絵文字を画像(SVG)にして、どの端末でも同じ見た目・位置にする（Twemoji, CC-BY 4.0） */
(function(){
  var st = document.createElement("style");
  st.textContent = ".emo { width: 1em; height: 1em; display: inline-block; vertical-align: -0.12em; object-fit: contain; pointer-events: none; }";
  document.head.appendChild(st);
  window.emo = function(e){
    var cp = Array.from(e).map(function(ch){ return ch.codePointAt(0).toString(16); }).filter(function(x){ return x !== "fe0f"; }).join("-");
    return '<img class="emo" src="/emoji/' + cp + '.svg" alt="' + e + '" onerror="this.outerHTML=this.alt">';
  };
})();
