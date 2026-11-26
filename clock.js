/* Clock faces for Photo Frame: digital, analog, flip and words.
   A ClockFace draws into any element and sizes itself to that element. */
(function () {
  'use strict';

  const FONTS = {
    modern: { name: 'Modern', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 200 },
    clean: { name: 'Clean', stack: '"Avenir Next", Avenir, "Segoe UI", sans-serif', weight: 500 },
    geometric: { name: 'Geometric', stack: 'Futura, "Century Gothic", "Trebuchet MS", sans-serif', weight: 500 },
    elegant: { name: 'Elegant', stack: 'Didot, "Bodoni 72", "Bodoni MT", Georgia, serif', weight: 400 },
    typewriter: { name: 'Typewriter', stack: '"American Typewriter", "Courier New", Courier, monospace', weight: 400 },
    handwritten: { name: 'Handwritten', stack: '"Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive', weight: 400 }
  };
  const SIZES = { s: 0.6, m: 0.8, l: 1, xl: 1.2 };
  const STYLES = { digital: 'Digital', analog: 'Analog', flip: 'Flip', words: 'Words' };
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const NUMW = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
  const MINW = { 5: 'five', 10: 'ten', 20: 'twenty', 25: 'twenty-five' };

  const pad = (n) => (n < 10 ? '0' : '') + n;
  function rgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  const dateText = (d) => DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
  const hourText = (d, h24) => (h24 ? pad(d.getHours()) : String(d.getHours() % 12 || 12));
  function el(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function setText(e, t) { if (e.textContent !== t) e.textContent = t; }

  function wordsFor(d) {
    const h = d.getHours(), m = d.getMinutes();
    let r = Math.round(m / 5) * 5, hr = h;
    if (r === 60) { r = 0; hr = h + 1; }
    const shownHour = (r > 30 ? hr + 1 : hr) % 24;
    const cur = NUMW[hr % 12], nxt = NUMW[(hr + 1) % 12];
    let lines;
    if (r === 0 && (shownHour === 0 || shownHour === 12)) lines = [shownHour === 0 ? 'midnight' : 'noon'];
    else if (r === 0) lines = [cur, 'o’clock'];
    else if (r === 15) lines = ['quarter past', cur];
    else if (r === 30) lines = ['half past', cur];
    else if (r === 45) lines = ['quarter to', nxt];
    else if (r < 30) lines = [MINW[r] + ' past', cur];
    else lines = [MINW[60 - r] + ' to', nxt];
    let period = shownHour < 5 ? 'at night' : shownHour < 12 ? 'in the morning' : shownHour < 17 ? 'in the afternoon' : shownHour < 21 ? 'in the evening' : 'at night';
    if (lines.length === 1) period = '';
    return { intro: m % 5 === 0 ? 'It’s' : 'It’s about', lines: lines, period: period };
  }

  function ClockFace(host) {
    this.host = host;
    this.timer = null;
    this.opts = null;
  }

  ClockFace.prototype.stop = function () {
    clearInterval(this.timer);
    this.timer = null;
  };

  ClockFace.prototype.render = function (opts) {
    this.stop();
    this.opts = opts;
    const host = this.host;
    host.innerHTML = '';
    const W = host.clientWidth || window.innerWidth, H = host.clientHeight || window.innerHeight;
    const font = FONTS[opts.font] || FONTS.modern;
    this.W = W; this.H = H; this.font = font;
    this.mult = SIZES[opts.size] || 0.8;
    host.style.fontFamily = font.stack;
    host.style.fontWeight = font.weight;
    host.style.color = opts.color;
    this.wrap = el('div', 'cf cf-' + opts.style, host);
    this.last = {};
    const build = this['build_' + opts.style] || this.build_digital;
    build.call(this);
    this.tick(true);
    const self = this;
    this.timer = setInterval(function () { self.tick(false); }, 1000);
  };

  ClockFace.prototype.tick = function (first) {
    const d = new Date();
    if (this.dateEl) setText(this.dateEl, this.opts.date ? dateText(d) : '');
    const fn = this['tick_' + this.opts.style] || this.tick_digital;
    fn.call(this, d, first);
  };

  // ---------- Digital ----------
  ClockFace.prototype.build_digital = function () {
    const o = this.opts;
    let fs = Math.min(this.W * (o.h24 ? 0.2 : 0.22), this.H * 0.42) * this.mult;
    if (o.seconds) fs *= 0.76;
    const time = el('div', 'cf-time', this.wrap);
    time.style.fontSize = fs + 'px';
    this.hm = el('span', 'cf-hm', time);
    this.sec = el('span', 'cf-sec', time);
    this.ampm = el('span', 'cf-ampm', time);
    this.dateEl = el('div', 'cf-date', this.wrap);
    this.dateEl.style.fontSize = Math.max(12, fs * 0.16) + 'px';
  };
  ClockFace.prototype.tick_digital = function (d) {
    const o = this.opts;
    setText(this.hm, hourText(d, o.h24) + ':' + pad(d.getMinutes()));
    setText(this.sec, o.seconds ? ':' + pad(d.getSeconds()) : '');
    setText(this.ampm, o.h24 ? '' : (d.getHours() < 12 ? 'AM' : 'PM'));
  };

  // ---------- Flip ----------
  ClockFace.prototype.build_flip = function () {
    const o = this.opts, groups = o.seconds ? 3 : 2;
    const bound = (this.W * 0.9) / (groups * 0.9 + (groups - 1) * 0.12);
    const ch = Math.min(this.H * 0.55 * this.mult, bound * Math.min(1, this.mult + 0.2));
    const cw = ch * 0.9, radius = Math.max(4, ch * 0.06);
    const row = el('div', 'fc-row', this.wrap);
    this.cards = [];
    for (let i = 0; i < groups; i++) {
      const card = el('div', 'fc', row);
      card.style.width = cw + 'px'; card.style.height = ch + 'px';
      card.style.margin = '0 ' + (ch * 0.06) + 'px';
      card.style.fontSize = (ch * 0.7) + 'px';
      card.style.borderRadius = radius + 'px';
      const parts = {};
      ['top', 'bottom', 'flapTop', 'flapBottom'].forEach((name) => {
        const isTop = name === 'top' || name === 'flapTop';
        const half = el('div', 'fc-half ' + (isTop ? 'fc-top' : 'fc-bottom') + (name.indexOf('flap') === 0 ? (isTop ? ' fc-flap-top' : ' fc-flap-bottom') : ''), card);
        half.style.borderRadius = isTop ? radius + 'px ' + radius + 'px 0 0' : '0 0 ' + radius + 'px ' + radius + 'px';
        const span = el('span', '', half);
        span.style.height = ch + 'px'; span.style.lineHeight = ch + 'px';
        parts[name] = span;
      });
      this.cards.push({ el: card, p: parts, v: null, t: null });
    }
    this.ampm = el('div', 'fc-ampm', this.wrap);
    this.ampm.style.fontSize = Math.max(11, ch * 0.14) + 'px';
    this.dateEl = el('div', 'cf-date', this.wrap);
    this.dateEl.style.fontSize = Math.max(12, ch * 0.15) + 'px';
  };
  function setCard(card, v, animate) {
    if (card.v === v) return;
    const old = card.v;
    card.v = v;
    const p = card.p;
    clearTimeout(card.t);
    if (!animate || old === null) {
      p.top.textContent = p.bottom.textContent = p.flapTop.textContent = p.flapBottom.textContent = v;
      return;
    }
    p.top.textContent = v; p.bottom.textContent = old;
    p.flapTop.textContent = old; p.flapBottom.textContent = v;
    card.el.classList.remove('flip');
    void card.el.offsetWidth;   // restart the animation
    card.el.classList.add('flip');
    card.t = setTimeout(function () {
      p.bottom.textContent = v; p.flapTop.textContent = v;
      card.el.classList.remove('flip');
    }, 650);
  }
  ClockFace.prototype.tick_flip = function (d, first) {
    const o = this.opts;
    const vals = [o.h24 ? pad(d.getHours()) : String(d.getHours() % 12 || 12), pad(d.getMinutes())];
    if (o.seconds) vals.push(pad(d.getSeconds()));
    this.cards.forEach((c, i) => setCard(c, vals[i], !first));
    setText(this.ampm, o.h24 ? '' : (d.getHours() < 12 ? 'AM' : 'PM'));
  };

  // ---------- Analog ----------
  ClockFace.prototype.build_analog = function () {
    const D = Math.min(Math.min(this.W, this.H) * 0.82 * this.mult, Math.min(this.W, this.H) * 0.96);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = el('canvas', 'cf-canvas', this.wrap);
    c.width = Math.round(D * dpr); c.height = Math.round(D * dpr);
    c.style.width = D + 'px'; c.style.height = D + 'px';
    this.canvas = c; this.ctx = c.getContext('2d'); this.D = D; this.dpr = dpr;
    this.dateEl = null;
  };
  ClockFace.prototype.tick_analog = function (d) {
    const g = this.ctx, D = this.D, r = D / 2, col = this.opts.color, f = this.font, o = this.opts;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, D, D);
    g.translate(r, r);
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = r * 0.04;
    g.strokeStyle = rgba(col, 0.25); g.lineWidth = r * 0.012;
    g.beginPath(); g.arc(0, 0, r * 0.97, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 60; i++) {
      const a = i * Math.PI / 30, big = i % 5 === 0;
      const r1 = r * 0.9, r0 = r1 - (big ? r * 0.08 : r * 0.035);
      g.strokeStyle = rgba(col, big ? 0.9 : 0.4);
      g.lineWidth = big ? r * 0.022 : r * 0.008;
      g.beginPath(); g.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0); g.lineTo(Math.sin(a) * r1, -Math.cos(a) * r1); g.stroke();
    }
    g.fillStyle = col;
    g.font = f.weight + ' ' + (r * 0.15) + 'px ' + f.stack;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let n = 1; n <= 12; n++) {
      const a = n * Math.PI / 6;
      g.fillText(String(n), Math.sin(a) * r * 0.68, -Math.cos(a) * r * 0.68 + r * 0.01);
    }
    if (o.date) {
      g.fillStyle = rgba(col, 0.7);
      g.font = f.weight + ' ' + (r * 0.075) + 'px ' + f.stack;
      g.fillText(DAYS[d.getDay()].slice(0, 3) + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate(), 0, r * 0.36);
    }
    const hand = (angle, len, width, tail) => {
      g.save(); g.rotate(angle);
      g.lineCap = 'round'; g.lineWidth = width;
      g.beginPath(); g.moveTo(0, tail); g.lineTo(0, -len); g.stroke();
      g.restore();
    };
    const h = d.getHours() % 12, m = d.getMinutes(), s = d.getSeconds();
    g.strokeStyle = col;
    hand((h + m / 60) * Math.PI / 6, r * 0.5, r * 0.055, r * 0.08);
    hand((m + s / 60) * Math.PI / 30, r * 0.74, r * 0.035, r * 0.1);
    if (o.seconds) { g.strokeStyle = rgba(col, 0.85); hand(s * Math.PI / 30, r * 0.84, r * 0.012, r * 0.16); }
    g.fillStyle = col;
    g.beginPath(); g.arc(0, 0, r * 0.035, 0, Math.PI * 2); g.fill();
  };

  // ---------- Words ----------
  ClockFace.prototype.build_words = function () {
    this.fs = Math.min(this.W * 0.1, this.H * 0.17) * this.mult;
    this.wrap.style.fontSize = this.fs + 'px';
    this.intro = el('div', 'cw-small', this.wrap);
    this.lineEls = [el('div', 'cw-line', this.wrap), el('div', 'cw-line', this.wrap)];
    this.period = el('div', 'cw-small', this.wrap);
    this.dateEl = el('div', 'cf-date', this.wrap);
    this.dateEl.style.fontSize = Math.max(12, this.fs * 0.3) + 'px';
  };
  ClockFace.prototype.tick_words = function (d) {
    const w = wordsFor(d);
    const key = w.intro + w.lines.join('|') + w.period;
    if (key === this.last.words) return;
    this.last.words = key;
    setText(this.intro, w.intro);
    this.lineEls.forEach((e, i) => { setText(e, w.lines[i] || ''); e.style.display = w.lines[i] ? '' : 'none'; });
    setText(this.period, w.period);
    // shrink to fit if a long phrase overflows
    this.wrap.style.fontSize = this.fs + 'px';
    const maxW = this.W * 0.94, maxH = this.H * 0.94;
    let sw = 0, sh = 0;
    Array.prototype.forEach.call(this.wrap.children, (c) => { sw = Math.max(sw, c.offsetWidth); sh += c.offsetHeight; });
    const k = Math.min(1, maxW / Math.max(1, sw), maxH / Math.max(1, sh));
    if (k < 1) this.wrap.style.fontSize = (this.fs * k) + 'px';
  };

  ClockFace.FONTS = FONTS;
  ClockFace.STYLES = STYLES;
  ClockFace.STYLE_ORDER = ['digital', 'analog', 'flip', 'words'];
  window.ClockFace = ClockFace;
})();
