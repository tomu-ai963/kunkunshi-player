import React, { useState, useRef, useEffect, useCallback } from "react";

/* ============================================================
   工工四プレイヤー / Kunkunshi Player
   調弦: 本調子 (男弦 C3 / 中弦 F3 / 女弦 C4)

   ▼ 本物の三線サンプル音源への差し替えについて
   現在は Karplus-Strong 合成で撥弦音を近似しています。
   実サンプルに差し替える場合は SAMPLE_URLS に
   「工工四文字 → 音源ファイルURL」を登録するだけで、
   自動的にサンプル再生に切り替わります（未登録の文字は合成音にフォールバック）。
   例:
     const SAMPLE_URLS = {
       "合": "/sounds/ai.wav",
       "乙": "/sounds/otsu.wav",
       ...
     };
   ============================================================ */

const SAMPLE_URLS = {
  // "合": "/sounds/ai.wav",
};

/* ---------- 音色・パレット ---------- */
const C = {
  ai: "#16293D",       // 琉球藍（地）
  aiSoft: "#22405C",
  basho: "#EFE6D2",    // 芭蕉布（紙）
  bashoDim: "#DED2B8",
  sumi: "#241F1A",     // 墨
  shu: "#CC3B29",      // 紅型 朱
  ki: "#E0A32E",       // 紅型 黄
  midori: "#4E7F63",
};

const MINCHO =
  '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP","Songti SC",serif';
const GOTHIC =
  '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",system-ui,sans-serif';

/* ---------- 工工四 定義（本調子） ---------- */
// 弦の開放音（MIDIノート番号）: 男弦 C3=48 / 中弦 F3=53 / 女弦 C4=60
const STRING_BASE = [48, 53, 60];
const STRING_NAME = ["男弦", "中弦", "女弦"];
const STRING_YOMI = ["ウーヂル", "ナカヂル", "ミーヂル"];

// semi: 開放弦からの半音数, finger: 押さえる指
const NOTES = {
  合:   { s: 0, semi: 0, yomi: "アイ",     doremi: "ド",   finger: "開放" },
  乙:   { s: 0, semi: 2, yomi: "オツ",     doremi: "レ",   finger: "人差指" },
  老:   { s: 0, semi: 4, yomi: "ロウ",     doremi: "ミ",   finger: "中指" },
  下老: { s: 0, semi: 5, yomi: "シタロウ", doremi: "ファ", finger: "小指" },

  四:   { s: 1, semi: 0, yomi: "シ",       doremi: "ファ", finger: "開放" },
  上:   { s: 1, semi: 2, yomi: "ジョウ",   doremi: "ソ",   finger: "人差指" },
  中:   { s: 1, semi: 4, yomi: "チュウ",   doremi: "ラ",   finger: "中指" },
  尺:   { s: 1, semi: 5, yomi: "シャク",   doremi: "シ♭", finger: "小指" },
  "尺♯": { s: 1, semi: 6, yomi: "シャクシャープ", doremi: "シ", finger: "小指" },
  下尺: { s: 1, semi: 7, yomi: "シタシャク", doremi: "ド", finger: "小指" },

  工:   { s: 2, semi: 0, yomi: "コウ",     doremi: "ド",   finger: "開放" },
  五:   { s: 2, semi: 2, yomi: "ゴ",       doremi: "レ",   finger: "人差指" },
  六:   { s: 2, semi: 4, yomi: "ロク",     doremi: "ミ",   finger: "中指" },
  七:   { s: 2, semi: 5, yomi: "シチ",     doremi: "ファ", finger: "小指" },
  八:   { s: 2, semi: 7, yomi: "ハチ",     doremi: "ソ",   finger: "小指" },
  九:   { s: 2, semi: 9, yomi: "キュウ",   doremi: "ラ",   finger: "小指" },
};

const midiOf = (ch, octaveUp = false) => {
  const n = NOTES[ch];
  if (!n) return null;
  return STRING_BASE[n.s] + n.semi + (octaveUp ? 12 : 0);
};
const freqOf = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/* ---------- パーサ ----------
   対応記法:
     合 乙 老 …          通常の勘所
     下老 下尺 尺♯ 尺#    2文字の勘所
     イ工 イ五 …          人偏 = 1オクターブ上
     ー |                 前の音を伸ばす
     〇 ・ 0              休符
   区切りは 空白 / 改行 / 、 / , を無視して1文字ずつ読む
------------------------------------------------------------- */
function parseKunkunshi(text) {
  const src = text.replace(/[\s、,]/g, "");
  const out = [];
  let i = 0;
  while (i < src.length) {
    let octaveUp = false;
    let ch = src[i];

    if (ch === "ー" || ch === "|" || ch === "｜" || ch === "ー") {
      if (out.length) out[out.length - 1].beats += 1;
      i += 1;
      continue;
    }
    if (ch === "〇" || ch === "○" || ch === "・" || ch === "0") {
      out.push({ char: ch, rest: true, beats: 1 });
      i += 1;
      continue;
    }
    if (ch === "イ") {
      octaveUp = true;
      i += 1;
      ch = src[i];
      if (!ch) break;
    }

    // 2文字の勘所を優先照合
    const two = src.slice(i, i + 2);
    const twoNorm = two === "尺#" ? "尺♯" : two;
    let token = null;
    if (NOTES[twoNorm]) {
      token = twoNorm;
      i += 2;
    } else if (NOTES[ch]) {
      token = ch;
      i += 1;
    } else {
      out.push({ char: ch, unknown: true, beats: 1 });
      i += 1;
      continue;
    }
    out.push({
      char: token,
      octaveUp,
      display: (octaveUp ? "イ" : "") + token,
      midi: midiOf(token, octaveUp),
      beats: 1,
    });
  }
  return out;
}

/* ---------- 音響エンジン ---------- */
function makePluckBuffer(ctx, freq) {
  const sr = ctx.sampleRate;
  const N = Math.max(2, Math.round(sr / freq));
  const dur = 2.2;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);

  // 撥（バチ）の励起：ノイズバーストを軽くローパス
  const d = new Float32Array(N);
  let lp = 0;
  for (let k = 0; k < N; k++) {
    const n = Math.random() * 2 - 1;
    lp = lp * 0.3 + n * 0.7;
    d[k] = lp;
  }
  let mx = 0;
  for (let k = 0; k < N; k++) mx = Math.max(mx, Math.abs(d[k]));
  if (mx > 0) for (let k = 0; k < N; k++) d[k] /= mx;

  // Karplus-Strong: 高い音ほど減衰を速く
  const decay = 0.9975 - Math.min(0.0045, freq / 150000);
  let prev = d[N - 1];
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = d[idx];
    out[i] = cur;
    const filtered = cur * 0.62 + prev * 0.38;
    prev = cur;
    d[idx] = filtered * decay;
    idx = (idx + 1) % N;
  }
  const fade = Math.floor(sr * 0.12);
  for (let i = len - fade; i < len; i++) out[i] *= (len - i) / fade;
  return buf;
}

class SanshinEngine {
  constructor() {
    this.ctx = null;
    this.cache = new Map();
    this.samples = new Map();
    this.master = null;
  }
  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();

    // 胴（蛇皮）の鳴りを模したフィルタチェーン
    const body = this.ctx.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = 420;
    body.Q.value = 1.1;
    body.gain.value = 4.5;

    const bright = this.ctx.createBiquadFilter();
    bright.type = "highshelf";
    bright.frequency.value = 2200;
    bright.gain.value = 3;

    const cut = this.ctx.createBiquadFilter();
    cut.type = "lowpass";
    cut.frequency.value = 7000;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;

    body.connect(bright);
    bright.connect(cut);
    cut.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.input = body;
    return this.ctx;
  }
  resume() {
    this.init();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  bufferFor(freq) {
    const key = Math.round(freq * 100);
    if (!this.cache.has(key)) {
      this.cache.set(key, makePluckBuffer(this.ctx, freq));
    }
    return this.cache.get(key);
  }
  play(midi, when = 0, gain = 1) {
    this.resume();
    const t = when || this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.bufferFor(freqOf(midi));
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    src.connect(g);
    g.connect(this.input);
    src.start(t);
    return src;
  }
  now() {
    this.resume();
    return this.ctx.currentTime;
  }
}

/* ---------- 棹（勘所）の位置比 ---------- */
const posRatio = (semi) => 1 - Math.pow(2, -semi / 12);

const BOARD = [
  { s: 0, chars: ["合", "乙", "老", "下老"] },
  { s: 1, chars: ["四", "上", "中", "尺", "尺♯", "下尺"] },
  { s: 2, chars: ["工", "五", "六", "七", "八", "九"] },
];

/* ============================================================ */
export default function KunkunshiPlayer() {
  const engine = useRef(null);
  if (!engine.current) engine.current = new SanshinEngine();

  const [text, setText] = useState(
    "合乙老下老四上中尺工五六七八九ー\n九八七六尺中上四下老老乙合ー"
  );
  const [tempo, setTempo] = useState(96);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [lit, setLit] = useState(null);

  const notes = parseKunkunshi(text);
  const scheduleRef = useRef([]);
  const rafRef = useRef(null);
  const sourcesRef = useRef([]);

  const strike = useCallback((ch, octaveUp = false) => {
    const midi = midiOf(ch, octaveUp);
    if (midi == null) return;
    engine.current.play(midi);
    setLit(ch);
    setTimeout(() => setLit((v) => (v === ch ? null : v)), 220);
  }, []);

  const stop = useCallback(() => {
    setPlaying(false);
    setCursor(-1);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    sourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch (e) {
        /* already stopped */
      }
    });
    sourcesRef.current = [];
  }, []);

  const play = useCallback(() => {
    stop();
    const eng = engine.current;
    eng.resume();
    const beat = 60 / tempo;
    const start = eng.now() + 0.12;
    const sched = [];
    let t = start;
    for (const n of notes) {
      sched.push({ time: t, note: n });
      if (!n.rest && !n.unknown && n.midi != null) {
        sourcesRef.current.push(eng.play(n.midi, t));
      }
      t += beat * n.beats;
    }
    scheduleRef.current = sched;
    const endAt = t;
    setPlaying(true);

    const tick = () => {
      const now = eng.now();
      if (now >= endAt) {
        stop();
        return;
      }
      let idx = -1;
      for (let i = 0; i < sched.length; i++) {
        if (now >= sched[i].time) idx = i;
        else break;
      }
      setCursor(idx);
      const cur = sched[idx];
      setLit(cur && !cur.note.rest ? cur.note.char : null);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [notes, tempo, stop]);

  useEffect(() => () => stop(), [stop]);

  /* --- 楽譜を縦組みの列に分割（右から左へ） --- */
  const PER_COL = 8;
  const columns = [];
  for (let i = 0; i < notes.length; i += PER_COL) {
    columns.push({ start: i, items: notes.slice(i, i + PER_COL) });
  }

  return (
    <div
      style={{
        background: C.ai,
        minHeight: "100%",
        padding: "28px 20px 48px",
        fontFamily: GOTHIC,
        color: C.basho,
      }}
    >
      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        {/* ヘッダ */}
        <header style={{ marginBottom: 26 }}>
          <h1
            style={{
              fontFamily: MINCHO,
              fontSize: "clamp(30px,6vw,46px)",
              letterSpacing: "0.22em",
              margin: 0,
              lineHeight: 1.15,
              color: C.basho,
            }}
          >
            工工四
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13.5,
              lineHeight: 1.75,
              color: "rgba(239,230,210,.68)",
              maxWidth: "58ch",
            }}
          >
            勘所をタップすると音が鳴ります。下の欄に工工四を書き込めば、そのまま通して弾きます。調弦は本調子（男弦ド・中弦ファ・女弦ド）。
          </p>
        </header>

        {/* 棹 */}
        <Fingerboard lit={lit} onStrike={strike} />

        {/* 楽譜入力 */}
        <section style={{ marginTop: 30 }}>
          <label
            htmlFor="score"
            style={{
              display: "block",
              fontSize: 13,
              marginBottom: 8,
              color: "rgba(239,230,210,.75)",
            }}
          >
            工工四を書く
          </label>
          <textarea
            id="score"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            spellCheck={false}
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "rgba(239,230,210,.07)",
              border: "1px solid rgba(239,230,210,.24)",
              borderRadius: 3,
              color: C.basho,
              fontFamily: MINCHO,
              fontSize: 19,
              letterSpacing: "0.12em",
              lineHeight: 1.9,
              padding: "12px 14px",
              resize: "vertical",
              outline: "none",
            }}
          />
          <p
            style={{
              fontSize: 12,
              color: "rgba(239,230,210,.5)",
              margin: "8px 0 0",
              lineHeight: 1.8,
            }}
          >
            ー は音を伸ばす、〇 は休み、イ工 のように人偏を付けると一オクターブ上。下老・下尺・尺♯ もそのまま書けます。
          </p>
        </section>

        {/* 操作 */}
        <section
          style={{
            marginTop: 20,
            display: "flex",
            gap: 18,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={playing ? stop : play}
            style={{
              background: playing ? "transparent" : C.shu,
              color: playing ? C.shu : C.basho,
              border: `1.5px solid ${C.shu}`,
              borderRadius: 2,
              padding: "11px 30px",
              fontSize: 15,
              fontFamily: MINCHO,
              letterSpacing: "0.18em",
              cursor: "pointer",
            }}
          >
            {playing ? "止める" : "弾く"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "rgba(239,230,210,.7)" }}>
              速さ
            </span>
            <input
              type="range"
              min={40}
              max={180}
              value={tempo}
              onChange={(e) => setTempo(Number(e.target.value))}
              style={{ width: 150, accentColor: C.ki }}
            />
            <span
              style={{
                fontSize: 13,
                color: C.ki,
                minWidth: 58,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {tempo} 拍
            </span>
          </div>

          <span style={{ fontSize: 12.5, color: "rgba(239,230,210,.45)" }}>
            {notes.length} 音
          </span>
        </section>

        {/* 楽譜表示（縦組み・右から左） */}
        <ScoreSheet columns={columns} cursor={cursor} perCol={PER_COL} />
      </div>
    </div>
  );
}

/* ---------- 棹 ---------- */
function Fingerboard({ lit, onStrike }) {
  const W = 900;
  const H = 220;
  const padL = 68;
  const padR = 44;
  const nut = padL;
  const scaleLen = W - padL - padR;
  const rowY = [56, 112, 168];

  return (
    <div
      style={{
        background: "linear-gradient(180deg,#1B1512 0%,#241C17 100%)",
        border: "1px solid rgba(239,230,210,.18)",
        borderRadius: 3,
        padding: "6px 4px",
        overflowX: "auto",
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", minWidth: 620, display: "block" }}
        role="group"
        aria-label="三線の棹。勘所を選ぶと音が鳴ります"
      >
        {/* 歌口 */}
        <rect x={nut - 7} y={30} width={7} height={160} fill={C.bashoDim} />

        {BOARD.map((row, ri) => {
          const y = rowY[ri];
          return (
            <g key={ri}>
              {/* 弦 */}
              <line
                x1={nut}
                y1={y}
                x2={W - padR + 18}
                y2={y}
                stroke="rgba(239,230,210,.42)"
                strokeWidth={1 + (2 - ri) * 0.7}
              />
              {/* 弦名 */}
              <text
                x={nut - 16}
                y={y + 5}
                textAnchor="end"
                fontFamily={MINCHO}
                fontSize={14}
                fill="rgba(239,230,210,.55)"
              >
                {STRING_NAME[ri]}
              </text>
              <text
                x={nut - 16}
                y={y + 20}
                textAnchor="end"
                fontFamily={GOTHIC}
                fontSize={9}
                fill="rgba(239,230,210,.3)"
              >
                {STRING_YOMI[ri]}
              </text>

              {row.chars.map((ch) => {
                const n = NOTES[ch];
                const x = nut + scaleLen * posRatio(n.semi);
                const on = lit === ch;
                const open = n.semi === 0;
                return (
                  <g
                    key={ch}
                    onClick={() => onStrike(ch)}
                    style={{ cursor: "pointer" }}
                    tabIndex={0}
                    role="button"
                    aria-label={`${ch} ${n.yomi}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onStrike(ch);
                      }
                    }}
                  >
                    <circle cx={x} cy={y} r={19} fill="transparent" />
                    <circle
                      cx={x}
                      cy={y}
                      r={on ? 16 : 13.5}
                      fill={on ? C.shu : open ? "rgba(224,163,46,.16)" : "rgba(239,230,210,.09)"}
                      stroke={on ? C.ki : open ? C.ki : "rgba(239,230,210,.42)"}
                      strokeWidth={on ? 2 : 1}
                      style={{ transition: "r .08s, fill .08s" }}
                    />
                    <text
                      x={x}
                      y={y + 5.5}
                      textAnchor="middle"
                      fontFamily={MINCHO}
                      fontSize={ch.length > 1 ? 10.5 : 15}
                      fill={on ? C.basho : "rgba(239,230,210,.9)"}
                    >
                      {ch}
                    </text>
                    <text
                      x={x}
                      y={y - 23}
                      textAnchor="middle"
                      fontFamily={GOTHIC}
                      fontSize={9.5}
                      fill={on ? C.ki : "rgba(239,230,210,.34)"}
                    >
                      {n.doremi}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------- 楽譜（縦組み） ---------- */
function ScoreSheet({ columns, cursor, perCol }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (cursor < 0 || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-idx="${cursor}"]`);
    if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [cursor]);

  if (!columns.length) {
    return (
      <div
        style={{
          marginTop: 26,
          background: C.basho,
          color: "rgba(36,31,26,.5)",
          padding: "44px 20px",
          textAlign: "center",
          fontFamily: MINCHO,
          fontSize: 15,
          borderRadius: 2,
        }}
      >
        上の欄に工工四を書くと、ここに譜が並びます。
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        marginTop: 26,
        background: C.basho,
        borderRadius: 2,
        padding: 18,
        overflowX: "auto",
        boxShadow: "0 2px 0 rgba(0,0,0,.25)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row-reverse",
          justifyContent: "flex-start",
          gap: 0,
          minWidth: "min-content",
        }}
      >
        {columns.map((col, ci) => (
          <div
            key={ci}
            style={{
              display: "flex",
              flexDirection: "column",
              borderLeft: `1px solid ${C.bashoDim}`,
            }}
          >
            {Array.from({ length: perCol }).map((_, ri) => {
              const n = col.items[ri];
              const idx = col.start + ri;
              const active = idx === cursor && n;
              return (
                <div
                  key={ri}
                  data-idx={n ? idx : undefined}
                  style={{
                    width: 46,
                    height: 46,
                    borderBottom: `1px solid ${C.bashoDim}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: MINCHO,
                    fontSize: n && n.display && n.display.length > 1 ? 15 : 21,
                    color: !n
                      ? "transparent"
                      : n.unknown
                      ? "rgba(204,59,41,.55)"
                      : n.rest
                      ? "rgba(36,31,26,.3)"
                      : C.sumi,
                    background: active ? C.ki : "transparent",
                    transition: "background .06s",
                  }}
                >
                  {n ? n.display || n.char : "・"}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
