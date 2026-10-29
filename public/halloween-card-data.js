/*
 * ハロウィン カードあつめ — カードのデータ（サーバーと3つの画面で共通）
 * ステージごとに12まいのカードがあります。★レアは、クラスに少ししかありません。
 */
(function(root){
  var D = {
    sets: {
      1: {
        title: "モンスターずかん",
        cards: [
          { id: "pumpkin",  en: "pumpkin",   ja: "かぼちゃ",     emoji: "🎃", art: "a" },
          { id: "ghost",    en: "ghost",     ja: "おばけ",       emoji: "👻", art: "a" },
          { id: "witch",    en: "witch",     ja: "まじょ",       emoji: "🧙", art: "a" },
          { id: "bat",      en: "bat",       ja: "コウモリ",     emoji: "🦇", art: "a" },
          { id: "spider",   en: "spider",    ja: "くも",         emoji: "🕷️", art: "a" },
          { id: "skeleton", en: "skeleton",  ja: "がいこつ",     emoji: "💀", art: "a" },
          { id: "blackcat", en: "black cat", ja: "くろねこ",     emoji: "🐈‍⬛", art: "a" },
          { id: "zombie",   en: "zombie",    ja: "ゾンビ",       emoji: "🧟", art: "a" },
          { id: "owl",      en: "owl",       ja: "ふくろう",     emoji: "🦉", art: "an" },
          { id: "vampire",  en: "vampire",   ja: "ドラキュラ",   emoji: "🧛", art: "a", rare: true },
          { id: "dragon",   en: "dragon",    ja: "ドラゴン",     emoji: "🐉", art: "a", rare: true },
          { id: "devil",    en: "devil",     ja: "あくま",       emoji: "👿", art: "a", rare: true }
        ]
      },
      2: {
        title: "おかし＆まほうずかん",
        cards: [
          { id: "candy",     en: "candy",        ja: "キャンディ",       emoji: "🍬", art: "" },
          { id: "lollipop",  en: "lollipop",     ja: "ぺろぺろキャンディ", emoji: "🍭", art: "a" },
          { id: "cookie",    en: "cookie",       ja: "クッキー",         emoji: "🍪", art: "a" },
          { id: "chocolate", en: "chocolate",    ja: "チョコレート",     emoji: "🍫", art: "" },
          { id: "candle",    en: "candle",       ja: "ろうそく",         emoji: "🕯️", art: "a" },
          { id: "castle",    en: "castle",       ja: "おしろ",           emoji: "🏰", art: "a" },
          { id: "bone",      en: "bone",         ja: "ほね",             emoji: "🦴", art: "a" },
          { id: "apple",     en: "apple",        ja: "りんご",           emoji: "🍎", art: "an" },
          { id: "broom",     en: "broom",        ja: "ほうき",           emoji: "🧹", art: "a" },
          { id: "potion",    en: "potion",       ja: "まほうのくすり",   emoji: "🧪", art: "a", rare: true },
          { id: "wand",      en: "wand",         ja: "まほうのつえ",     emoji: "🪄", art: "a", rare: true },
          { id: "crystal",   en: "crystal ball", ja: "すいしょうだま",   emoji: "🔮", art: "a", rare: true }
        ]
      }
    },
    find: function(id){
      for(var k in D.sets){
        var cs = D.sets[k].cards;
        for(var i = 0; i < cs.length; i++){ if(cs[i].id === id) return cs[i]; }
      }
      return null;
    },
    noun: function(c){ return (c.art ? c.art + " " : "") + c.en; },
    ask: function(c){ return "Do you have " + D.noun(c) + "?"; },
    have: function(c){ return "I have " + D.noun(c) + "."; }
  };
  D.sets[3] = { title: "ハロウィンずかん（24まい）", cards: D.sets[1].cards.concat(D.sets[2].cards) };
  if(typeof module !== "undefined" && module.exports){ module.exports = D; }
  else { root.HWC = D; }
})(typeof window !== "undefined" ? window : this);
