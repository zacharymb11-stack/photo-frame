/* Animated scenes for Photo Frame.
   Plain canvas drawing at ~30 frames per second, kept light so old iPads run them smoothly.
   Each scene paints its still parts once into hidden canvases, then only animates the moving bits. */
(function () {
  'use strict';

  const R = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function C(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function sprite(size, stops) {
    const c = C(size, size), g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach((s) => gr.addColorStop(s[0], s[1]));
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  }
  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  // Jagged mountain line using midpoint displacement. Returns y values across the width.
  function ridge(base, amp, rough) {
    const n = 129, pts = new Array(n);
    pts[0] = base + R(-amp, amp) * 0.6;
    pts[n - 1] = base + R(-amp, amp) * 0.6;
    let step = n - 1, a = amp;
    while (step > 1) {
      const half = step / 2;
      for (let i = half; i < n; i += step) pts[i] = (pts[i - half] + pts[i + half]) / 2 + R(-a, a);
      step = half; a *= rough;
    }
    return pts;
  }
  function ridgePath(g, pts, w, h) {
    g.beginPath();
    g.moveTo(0, h);
    for (let i = 0; i < pts.length; i++) g.lineTo(i * w / (pts.length - 1), pts[i]);
    g.lineTo(w, h);
    g.closePath();
  }
  function ridgeLine(g, pts, w) {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = i * w / (pts.length - 1);
      if (i === 0) g.moveTo(x, pts[i]); else g.lineTo(x, pts[i]);
    }
  }
  function linear(g, x0, y0, x1, y1, stops) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((s) => gr.addColorStop(s[0], s[1]));
    return gr;
  }

  // ==================================================================
  // Cozy fireplace
  // ==================================================================
  function fireplace(w, h) {
    const bg = C(w, h), g = bg.getContext('2d');
    g.fillStyle = linear(g, 0, 0, 0, h, [[0, '#140c08'], [1, '#26160e']]);
    g.fillRect(0, 0, w, h);
    // wallpaper stripes
    g.fillStyle = 'rgba(255,220,180,0.025)';
    const stripe = w / 32;
    for (let x = 0; x < w; x += stripe * 2) g.fillRect(x, 0, stripe, h);

    const fw = Math.min(w * 0.8, h * 1.15), fx = (w - fw) / 2;
    const mantelY = h * 0.2, mantelH = h * 0.045, floorY = h * 0.86;
    const sy = mantelY + mantelH, sh = floorY - sy;

    // wooden floor
    g.fillStyle = linear(g, 0, floorY, 0, h, [[0, '#2b1a10'], [1, '#120a06']]);
    g.fillRect(0, floorY, w, h - floorY);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
    for (let i = 1; i < 5; i++) { const y = floorY + (h - floorY) * i / 5; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }

    // brick surround
    g.fillStyle = '#1f130e';
    g.fillRect(fx, sy, fw, sh);
    const bh = Math.max(6, h * 0.032), bw = bh * 2.6, gap = Math.max(1, bh * 0.12);
    const bricks = ['#6b3424', '#5c2c1f', '#743b28', '#52281c', '#7d432e', '#64301f'];
    for (let row = 0, y = sy; y < floorY; row++, y += bh) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = fx - off; x < fx + fw; x += bw) {
        const x0 = Math.max(fx, x + gap / 2), x1 = Math.min(fx + fw, x + bw - gap / 2);
        const y1 = Math.min(floorY, y + bh - gap / 2);
        if (x1 > x0 && y1 > y + gap / 2) { g.fillStyle = pick(bricks); g.fillRect(x0, y + gap / 2, x1 - x0, y1 - y - gap / 2); }
      }
    }
    // shade the bricks toward the edges
    g.fillStyle = linear(g, fx, 0, fx + fw, 0, [[0, 'rgba(0,0,0,0.45)'], [0.3, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.45)']]);
    g.fillRect(fx, sy, fw, sh);

    // firebox opening
    const ow = fw * 0.58, ox = fx + (fw - ow) / 2, oy = sy + sh * 0.2, archH = sh * 0.12;
    const openingPath = (c) => {
      c.beginPath();
      c.moveTo(ox, floorY);
      c.lineTo(ox, oy + archH);
      c.quadraticCurveTo(ox + ow / 2, oy - archH, ox + ow, oy + archH);
      c.lineTo(ox + ow, floorY);
      c.closePath();
    };
    g.save(); g.lineWidth = bh * 0.7; g.strokeStyle = '#3b2b23'; openingPath(g); g.stroke(); g.restore();
    openingPath(g);
    const inner = g.createRadialGradient(w / 2, floorY, 0, w / 2, floorY, ow * 0.85);
    inner.addColorStop(0, '#2c1006'); inner.addColorStop(1, '#060201');
    g.fillStyle = inner; g.fill();

    // mantel shelf
    g.fillStyle = linear(g, 0, mantelY, 0, mantelY + mantelH, [[0, '#6a4428'], [0.5, '#4a2e1a'], [1, '#2a190d']]);
    g.fillRect(fx - fw * 0.06, mantelY, fw * 1.12, mantelH);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(fx - fw * 0.04, mantelY + mantelH, fw * 1.08, mantelH * 0.35);

    // candles on the mantel
    const candles = [];
    [0.06, 0.13, 0.9].forEach((p, i) => {
      const cw = fw * 0.025, ch = fw * (i === 1 ? 0.06 : 0.09), cx = fx + fw * p;
      g.fillStyle = linear(g, cx - cw / 2, 0, cx + cw / 2, 0, [[0, '#d9cbb0'], [0.5, '#f4ead6'], [1, '#bfae90']]);
      g.fillRect(cx - cw / 2, mantelY - ch, cw, ch);
      g.fillStyle = '#222'; g.fillRect(cx - 0.75, mantelY - ch - cw * 0.35, 1.5, cw * 0.35);
      candles.push({ x: cx, y: mantelY - ch - cw * 0.6, s: cw * 2.2, ph: R(0, 6) });
    });

    // hearth stone
    g.fillStyle = linear(g, 0, floorY, 0, floorY + h * 0.05, [[0, '#4a423d'], [1, '#2a2522']]);
    g.fillRect(fx - fw * 0.08, floorY, fw * 1.16, h * 0.05);

    // vignette
    const vig = g.createRadialGradient(w / 2, h * 0.6, Math.min(w, h) * 0.3, w / 2, h * 0.6, Math.max(w, h) * 0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.65)');
    g.fillStyle = vig; g.fillRect(0, 0, w, h);

    // logs (drawn on top of the flames' base)
    const logs = C(w, h), lg = logs.getContext('2d');
    const lr = ow * 0.055, logY = floorY - lr * 1.1;
    const log = (cx, cy, len, rad, ang) => {
      lg.save(); lg.translate(cx, cy); lg.rotate(ang);
      lg.fillStyle = linear(lg, 0, -rad, 0, rad, [[0, '#5a361d'], [0.45, '#2e1b0e'], [1, '#120904']]);
      roundRect(lg, -len / 2, -rad, len, rad * 2, rad); lg.fill();
      lg.strokeStyle = 'rgba(0,0,0,0.35)'; lg.lineWidth = 1;
      for (let i = 0; i < 4; i++) { lg.beginPath(); lg.moveTo(-len * 0.4, -rad * 0.5 + i * rad * 0.35); lg.lineTo(len * 0.35, -rad * 0.45 + i * rad * 0.33); lg.stroke(); }
      lg.fillStyle = '#9a7048';
      lg.beginPath(); lg.ellipse(len / 2 - rad * 0.3, 0, rad * 0.35, rad * 0.95, 0, 0, Math.PI * 2); lg.fill();
      lg.strokeStyle = '#6a4a2c';
      lg.beginPath(); lg.ellipse(len / 2 - rad * 0.3, 0, rad * 0.18, rad * 0.5, 0, 0, Math.PI * 2); lg.stroke();
      lg.restore();
    };
    log(w / 2 - ow * 0.13, logY, ow * 0.55, lr, -0.08);
    log(w / 2 + ow * 0.13, logY, ow * 0.55, lr, 0.1);
    log(w / 2, logY - lr * 1.35, ow * 0.5, lr * 0.9, 0.03);

    const yellow = sprite(64, [[0, 'rgba(255,250,220,1)'], [0.3, 'rgba(255,215,110,0.8)'], [1, 'rgba(255,150,40,0)']]);
    const orange = sprite(64, [[0, 'rgba(255,185,80,0.9)'], [0.4, 'rgba(255,110,25,0.5)'], [1, 'rgba(200,50,0,0)']]);
    const red = sprite(64, [[0, 'rgba(255,85,20,0.7)'], [0.5, 'rgba(150,25,0,0.3)'], [1, 'rgba(80,0,0,0)']]);
    const glow = sprite(256, [[0, 'rgba(255,140,50,0.6)'], [0.4, 'rgba(255,100,30,0.2)'], [1, 'rgba(255,80,20,0)']]);
    const candleGlow = sprite(64, [[0, 'rgba(255,240,200,1)'], [0.25, 'rgba(255,200,100,0.7)'], [1, 'rgba(255,140,40,0)']]);

    const baseY = logY - lr * 1.2;
    const flames = [], embers = [];
    const coals = [];
    for (let i = 0; i < 14; i++) coals.push({ x: w / 2 + R(-ow * 0.28, ow * 0.28), y: logY + R(-lr * 1.8, lr * 0.4), s: R(lr * 0.8, lr * 2), f: R(1, 4), ph: R(0, 6) });
    let emitF = 0, emitE = 0, flicker = 1;

    return {
      update(dt, t) {
        emitF += 110 * dt;
        while (emitF >= 1 && flames.length < 140) {
          emitF--;
          const life = R(0.6, 1.25);
          flames.push({ x: w / 2 + (Math.random() + Math.random() - 1) * ow * 0.27, y: baseY + R(-lr, lr * 0.6), vx: R(-8, 8), vy: -R(ow * 0.18, ow * 0.38), life: life, max: life, size: R(ow * 0.07, ow * 0.14), seed: R(0, 10) });
        }
        if (emitF > 1) emitF = 1;
        emitE += 5 * dt;
        while (emitE >= 1) {
          emitE--;
          const life = R(1.4, 3);
          embers.push({ x: w / 2 + R(-ow * 0.2, ow * 0.2), y: baseY, vx: R(-15, 15), vy: -R(30, 90), life: life, max: life, seed: R(0, 10) });
        }
        for (let i = flames.length - 1; i >= 0; i--) {
          const p = flames[i];
          p.life -= dt;
          if (p.life <= 0) { flames[i] = flames[flames.length - 1]; flames.pop(); continue; }
          p.x += (p.vx + Math.sin(t * 4 + p.seed) * ow * 0.04) * dt + (w / 2 - p.x) * 0.6 * dt;
          p.y += p.vy * dt;
        }
        for (let i = embers.length - 1; i >= 0; i--) {
          const p = embers[i];
          p.life -= dt;
          if (p.life <= 0) { embers[i] = embers[embers.length - 1]; embers.pop(); continue; }
          p.x += (p.vx + Math.sin(t * 3 + p.seed) * 20) * dt;
          p.y += p.vy * dt;
        }
        flicker = 0.78 + 0.12 * Math.sin(t * 7.3) + 0.1 * Math.sin(t * 13.1 + 1.3);
      },
      draw(ctx, t) {
        ctx.drawImage(bg, 0, 0);
        ctx.save();
        openingPath(ctx); ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        const gs = ow * 0.95 * flicker;
        ctx.globalAlpha = 0.8;
        ctx.drawImage(glow, w / 2 - gs / 2, baseY - gs / 2, gs, gs);
        for (let i = 0; i < flames.length; i++) {
          const p = flames[i], k = p.life / p.max;
          const spr = k > 0.65 ? yellow : k > 0.35 ? orange : red;
          const s = p.size * (0.4 + k * 0.8);
          ctx.globalAlpha = Math.min(1, k * 1.3) * 0.85;
          ctx.drawImage(spr, p.x - s / 2, p.y - s * 0.65, s, s * 1.3);
        }
        ctx.restore();
        ctx.drawImage(logs, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < coals.length; i++) {
          const c = coals[i];
          ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * c.f + c.ph);
          ctx.drawImage(orange, c.x - c.s / 2, c.y - c.s / 2, c.s, c.s);
        }
        openingPath(ctx); ctx.clip();
        for (let i = 0; i < embers.length; i++) {
          const p = embers[i], k = p.life / p.max, s = 3 + k * 4;
          ctx.globalAlpha = k;
          ctx.drawImage(yellow, p.x - s / 2, p.y - s / 2, s, s);
        }
        ctx.restore();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < candles.length; i++) {
          const c = candles[i], f = 0.85 + 0.15 * Math.sin(t * 9 + c.ph) * Math.sin(t * 5.3 + c.ph * 2);
          ctx.globalAlpha = 0.9;
          ctx.drawImage(candleGlow, c.x - c.s * f / 2, c.y - c.s * f * 0.8, c.s * f, c.s * f * 1.4);
          ctx.globalAlpha = 0.12 * f;
          ctx.drawImage(glow, c.x - c.s * 4, c.y - c.s * 4, c.s * 8, c.s * 8);
        }
        ctx.globalAlpha = 0.2 * flicker;
        const rg = Math.max(w, h) * 1.4;
        ctx.drawImage(glow, w / 2 - rg / 2, baseY - rg / 2, rg, rg);
        ctx.restore();
      }
    };
  }

  // ==================================================================
  // Colorful fall woods
  // ==================================================================
  function woods(w, h) {
    const bg = C(w, h), g = bg.getContext('2d');
    const leafColors = ['#c2410c', '#ea580c', '#f59e0b', '#d97706', '#b91c1c', '#dc2626', '#facc15', '#e76f51', '#9a3412'];
    g.fillStyle = linear(g, 0, 0, 0, h, [[0, '#8fb3d9'], [0.4, '#f2d6a2'], [0.7, '#eeb07a'], [1, '#d98b52']]);
    g.fillRect(0, 0, w, h);
    const sunX = w * 0.78, sunY = h * 0.16;
    const sun = g.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(w, h) * 0.5);
    sun.addColorStop(0, 'rgba(255,245,215,0.95)'); sun.addColorStop(0.15, 'rgba(255,230,180,0.5)'); sun.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = sun; g.fillRect(0, 0, w, h);

    const horizon = h * 0.58, groundY = h * 0.74;
    const far = ['rgba(214,140,95,0.55)', 'rgba(196,110,80,0.5)', 'rgba(224,170,110,0.5)', 'rgba(170,120,90,0.45)', 'rgba(200,150,100,0.5)'];
    for (let i = 0; i < 260; i++) {
      g.fillStyle = pick(far);
      g.beginPath(); g.arc(R(0, w), horizon + R(-h * 0.12, h * 0.06), R(h * 0.03, h * 0.07), 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = linear(g, 0, horizon - h * 0.2, 0, horizon + h * 0.1, [[0, 'rgba(245,215,170,0)'], [0.6, 'rgba(245,215,170,0.35)'], [1, 'rgba(245,215,170,0.15)']]);
    g.fillRect(0, horizon - h * 0.2, w, h * 0.3);

    // ground
    g.fillStyle = linear(g, 0, groundY - h * 0.03, 0, h, [[0, '#a3612f'], [1, '#4f2d15']]);
    g.fillRect(0, groundY - h * 0.02, w, h);

    // Foliage: a shadowed under-layer, then sunlit leaves on top, built from many small dabs.
    const shade = ['#7c2d12', '#9a3412', '#78350f', '#7f1d1d', '#92400e'];
    const lit = ['#ea580c', '#f97316', '#f59e0b', '#fbbf24', '#dc2626', '#ef4444', '#facc15', '#fb923c'];
    const dab = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    function foliage(cx, cy, rad, alpha) {
      const subs = [];
      const n = 5 + Math.floor(R(0, 4));
      for (let i = 0; i < n; i++) subs.push([cx + R(-rad * 0.65, rad * 0.65), cy + R(-rad * 0.45, rad * 0.35), rad * R(0.4, 0.65)]);
      subs.forEach((s) => {
        for (let k = 0; k < 28; k++) {
          const a = R(0, Math.PI * 2), d = Math.sqrt(Math.random()) * s[2];
          g.fillStyle = pick(shade); g.globalAlpha = alpha * R(0.75, 0.95);
          dab(s[0] + Math.cos(a) * d, s[1] + Math.sin(a) * d + s[2] * 0.15, R(s[2] * 0.12, s[2] * 0.26));
        }
      });
      subs.forEach((s) => {
        for (let k = 0; k < 34; k++) {
          const a = R(0, Math.PI * 2), d = Math.sqrt(Math.random()) * s[2] * 0.85;
          g.fillStyle = pick(lit); g.globalAlpha = alpha * R(0.7, 0.95);
          dab(s[0] + Math.cos(a) * d + s[2] * 0.08, s[1] + Math.sin(a) * d - s[2] * 0.12, R(s[2] * 0.07, s[2] * 0.17));
        }
        for (let k = 0; k < 8; k++) {
          g.fillStyle = '#fde68a'; g.globalAlpha = alpha * R(0.4, 0.8);
          dab(s[0] + R(0, s[2] * 0.6), s[1] - R(s[2] * 0.2, s[2] * 0.7), R(s[2] * 0.03, s[2] * 0.07));
        }
      });
      g.globalAlpha = 1;
    }
    function trunk(x, top, bottom, tw, color) {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(x - tw * 0.35, top); g.lineTo(x + tw * 0.35, top);
      g.lineTo(x + tw * 0.6, bottom); g.lineTo(x - tw * 0.6, bottom);
      g.closePath(); g.fill();
      g.strokeStyle = color; g.lineCap = 'round';
      for (let b = 0; b < 4; b++) {
        const by = top + (bottom - top) * R(0.02, 0.25), dir = b % 2 ? 1 : -1;
        g.lineWidth = Math.max(1, tw * R(0.2, 0.4));
        g.beginPath(); g.moveTo(x, by); g.quadraticCurveTo(x + dir * tw * 2, by - tw * 2, x + dir * tw * R(3, 6), by - tw * R(4, 7)); g.stroke();
      }
    }
    // back row of trees (smaller, hazier), then a front row
    [[16, 0.55, 0.42, 0.06, 0.09, '#5b4034', 0.75], [9, 1, 0.3, 0.1, 0.14, '#3f2a20', 1]].forEach((row) => {
      const count = row[0], scale = row[1];
      for (let i = 0; i < count; i++) {
        const x = (i + R(0.1, 0.9)) * w / count;
        const top = h * R(row[2] - 0.06, row[2] + 0.06);
        const tw = w * 0.012 * scale * R(0.7, 1.3);
        trunk(x, top, groundY + h * 0.01 * scale, tw, row[5]);
        foliage(x, top, h * R(row[3], row[4]), row[6]);
      }
      if (scale < 1) {
        g.fillStyle = 'rgba(245,215,170,0.25)';
        g.fillRect(0, 0, w, groundY);
      }
    });

    // fallen leaves on the ground
    for (let i = 0; i < 900; i++) {
      const y = R(groundY - h * 0.01, h);
      g.fillStyle = pick(leafColors);
      g.globalAlpha = R(0.5, 0.9);
      g.beginPath(); g.ellipse(R(0, w), y, R(2, 5) * (0.6 + (y - groundY) / h * 3), R(1, 3), R(0, Math.PI), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;

    // big trunks in front
    [[w * 0.03, w * 0.075], [w * 0.88, w * 0.065], [w * 0.62, w * 0.03]].forEach((tr) => {
      const x = tr[0], tw = tr[1];
      g.fillStyle = linear(g, x, 0, x + tw, 0, [[0, '#1d120b'], [0.4, '#3a271b'], [1, '#160d08']]);
      g.fillRect(x, -10, tw, h + 20);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = Math.max(1, tw * 0.04);
      for (let i = 0; i < 14; i++) { const bx = x + R(tw * 0.1, tw * 0.9); g.beginPath(); g.moveTo(bx, R(0, h)); g.lineTo(bx + R(-3, 3), R(0, h)); g.stroke(); }
    });
    // branches of the big front trees reaching in from the top corners
    foliage(w * 0.05, -h * 0.02, h * 0.2, 1);
    foliage(w * 0.2, -h * 0.06, h * 0.14, 1);
    foliage(w * 0.92, -h * 0.03, h * 0.2, 1);
    foliage(w * 0.76, -h * 0.07, h * 0.12, 1);

    // light rays
    const rays = C(w, h), rg = rays.getContext('2d');
    for (let i = 0; i < 7; i++) {
      const a = R(-0.2, 0.9), spread = R(0.02, 0.06);
      rg.fillStyle = 'rgba(255,245,210,' + R(0.05, 0.1) + ')';
      rg.beginPath();
      rg.moveTo(sunX, sunY);
      rg.lineTo(sunX - Math.tan(a) * h * 1.2 - Math.tan(spread) * h, h * 1.2);
      rg.lineTo(sunX - Math.tan(a) * h * 1.2 + Math.tan(spread) * h, h * 1.2);
      rg.closePath(); rg.fill();
    }

    const leaves = [];
    const newLeaf = (anywhere) => ({
      x: R(-w * 0.1, w * 1.05), y: anywhere ? R(-h * 0.1, h) : R(-h * 0.15, -10),
      vy: R(h * 0.04, h * 0.09), amp: R(w * 0.01, w * 0.05), f: R(0.5, 1.4), ph: R(0, 6),
      rot: R(0, 6), rs: R(-1.5, 1.5), ff: R(1, 3), s: R(Math.min(w, h) * 0.008, Math.min(w, h) * 0.018), c: pick(leafColors)
    });
    for (let i = 0; i < 50; i++) leaves.push(newLeaf(true));
    let wind = 0;

    return {
      update(dt, t) {
        wind = Math.sin(t * 0.13) * w * 0.012 + w * 0.006;
        for (let i = 0; i < leaves.length; i++) {
          const l = leaves[i];
          l.y += l.vy * dt;
          l.x += (Math.cos(t * l.f + l.ph) * l.amp + wind) * dt;
          l.rot += l.rs * dt;
          if (l.y > h + 20 || l.x > w + 40) leaves[i] = newLeaf(false);
        }
      },
      draw(ctx, t) {
        ctx.drawImage(bg, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 0.25);
        ctx.drawImage(rays, 0, 0);
        ctx.restore();
        for (let i = 0; i < leaves.length; i++) {
          const l = leaves[i], s = l.s;
          ctx.save();
          ctx.translate(l.x, l.y);
          ctx.rotate(l.rot);
          ctx.scale(1, Math.cos(t * l.ff + l.ph) || 0.01);
          ctx.fillStyle = l.c;
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.quadraticCurveTo(s * 0.9, -s * 0.2, 0, s);
          ctx.quadraticCurveTo(-s * 0.9, -s * 0.2, 0, -s);
          ctx.fill();
          ctx.strokeStyle = 'rgba(70,30,10,0.6)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, -s * 0.8); ctx.lineTo(0, s * 1.35); ctx.stroke();
          ctx.restore();
        }
      }
    };
  }

  // ==================================================================
  // Beautiful mountain range at sunset
  // ==================================================================
  function mountains(w, h) {
    const horizon = h * 0.62, lakeTop = h * 0.74;
    const sky = C(w, h), sg = sky.getContext('2d');
    sg.fillStyle = linear(sg, 0, 0, 0, lakeTop, [[0, '#0d1636'], [0.35, '#33306b'], [0.62, '#a24f7a'], [0.8, '#f08a4b'], [1, '#f8c27a']]);
    sg.fillRect(0, 0, w, h);
    const sunX = w * 0.66, sunY = horizon - h * 0.03;
    const sglow = sg.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.45);
    sglow.addColorStop(0, 'rgba(255,210,150,0.9)'); sglow.addColorStop(0.2, 'rgba(255,170,120,0.4)'); sglow.addColorStop(1, 'rgba(255,150,120,0)');
    sg.fillStyle = sglow; sg.fillRect(0, 0, w, h);
    sg.fillStyle = '#ffe6b8';
    sg.beginPath(); sg.arc(sunX, sunY, h * 0.045, 0, Math.PI * 2); sg.fill();

    // A range of distinct peaks with jagged detail.
    function peaks(base, peakH, count, noise) {
      const n = 129, list = [], nz = ridge(0, noise, 0.62), pts = [];
      for (let i = 0; i < count; i++) list.push({ x: R(-0.1, 1.1) * w, h: peakH * R(0.45, 1), s: w * R(0.1, 0.26) });
      for (let i = 0; i < n; i++) {
        const x = i * w / (n - 1);
        let m = 0;
        list.forEach((p) => {
          const d = Math.abs(x - p.x) / p.s;
          if (d < 1) { const v = p.h * Math.pow(1 - d, 1.25); if (v > m) m = v; }
        });
        pts.push(base - m + nz[i]);
      }
      return pts;
    }
    function range(g, pts, color, hazeColor, rim) {
      ridgePath(g, pts, w, h); g.fillStyle = color; g.fill();
      let minY = h; pts.forEach((y) => { if (y < minY) minY = y; });
      if (hazeColor) {
        g.save(); ridgePath(g, pts, w, h); g.clip();
        g.fillStyle = linear(g, 0, minY, 0, minY + (h - minY) * 0.5, [[0, 'rgba(0,0,0,0)'], [1, hazeColor]]);
        g.fillRect(0, minY, w, h - minY); g.restore();
      }
      if (rim) { ridgeLine(g, pts, w); g.strokeStyle = rim; g.lineWidth = 1.5; g.stroke(); }
      return minY;
    }
    const far = C(w, h), fg = far.getContext('2d');
    const l1 = peaks(h * 0.52, h * 0.3, 4, h * 0.015);
    const top1 = range(fg, l1, '#a86e95', 'rgba(240,150,170,0.45)', 'rgba(255,215,190,0.45)');
    // snowcaps: a band that follows the ridge, only on the high parts
    const snowLine = top1 + (h * 0.52 - top1) * 0.4, depth = h * 0.05;
    fg.beginPath();
    for (let i = 0; i < l1.length; i++) fg.lineTo(i * w / (l1.length - 1), l1[i]);
    for (let i = l1.length - 1; i >= 0; i--) {
      const y = l1[i];
      fg.lineTo(i * w / (l1.length - 1), y < snowLine ? Math.min(y + depth * R(0.5, 1.2), snowLine + R(0, h * 0.01)) : y);
    }
    fg.closePath(); fg.fillStyle = 'rgba(255,228,238,0.9)'; fg.fill();
    const l2 = peaks(h * 0.57, h * 0.2, 5, h * 0.012);
    range(fg, l2, '#7a5690', 'rgba(220,130,160,0.4)', 'rgba(255,200,180,0.25)');
    const l3 = peaks(h * 0.62, h * 0.13, 6, h * 0.01);
    range(fg, l3, '#544684', 'rgba(170,110,150,0.35)', null);

    const near = C(w, h), ng = near.getContext('2d');
    const l4 = peaks(h * 0.68, h * 0.08, 7, h * 0.008);
    range(ng, l4, '#34305f', 'rgba(110,80,130,0.3)', null);
    const l5 = peaks(h * 0.73, h * 0.05, 8, h * 0.006);
    range(ng, l5, '#1c1a3a', null, null);
    // pine trees along the nearest ridge
    ng.fillStyle = '#151330';
    for (let x = 0; x < w; x += R(4, 12)) {
      const i = Math.min(l5.length - 1, Math.round(x / w * (l5.length - 1)));
      const th = R(h * 0.015, h * 0.045), tw = th * 0.35;
      ng.beginPath(); ng.moveTo(x, l5[i] - th); ng.lineTo(x + tw, l5[i] + 2); ng.lineTo(x - tw, l5[i] + 2); ng.closePath(); ng.fill();
    }

    const lake = C(w, h), lk = lake.getContext('2d');
    lk.save();
    lk.beginPath(); lk.rect(0, lakeTop, w, h - lakeTop); lk.clip();
    lk.translate(0, lakeTop * 2); lk.scale(1, -1);
    lk.drawImage(sky, 0, 0); lk.drawImage(far, 0, 0); lk.drawImage(near, 0, 0);
    lk.restore();
    lk.fillStyle = linear(lk, 0, lakeTop, 0, h, [[0, 'rgba(10,14,40,0.35)'], [1, 'rgba(5,8,25,0.75)']]);
    lk.fillRect(0, lakeTop, w, h - lakeTop);
    lk.fillStyle = '#141130'; lk.fillRect(0, lakeTop - 1, w, 2);

    // drifting fog bands
    const fogW = Math.ceil(w * 1.5), fogH = Math.ceil(h * 0.14);
    const fog = C(fogW, fogH), fgc = fog.getContext('2d');
    const puff = sprite(128, [[0, 'rgba(255,230,240,0.22)'], [1, 'rgba(255,230,240,0)']]);
    for (let i = 0; i < 90; i++) {
      const s = R(fogH * 0.4, fogH * 0.95);
      const x = R(0, fogW);
      fgc.drawImage(puff, x - s / 2, fogH / 2 - s / 2 + R(-(fogH - s) / 2, (fogH - s) / 2), s, s);
      if (x < s) fgc.drawImage(puff, x + fogW - s / 2, fogH / 2 - s / 2, s, s);
      if (x > fogW - s) fgc.drawImage(puff, x - fogW - s / 2, fogH / 2 - s / 2, s, s);
    }

    const cloudPuff = sprite(128, [[0, 'rgba(255,190,205,0.32)'], [1, 'rgba(255,190,205,0)']]);
    const clouds = [];
    for (let i = 0; i < 6; i++) {
      const cw = R(w * 0.18, w * 0.35), chh = cw * 0.3, c = C(cw, chh), cg = c.getContext('2d');
      for (let j = 0; j < 14; j++) { const s = R(chh * 0.6, chh * 1.2); cg.drawImage(cloudPuff, R(0, cw - s), R(0, chh - s), s, s); }
      clouds.push({ c: c, x: R(-cw, w), y: R(h * 0.06, h * 0.32), v: R(3, 9) * w / 1000 });
    }
    const stars = [];
    for (let i = 0; i < 140; i++) stars.push({ x: R(0, w), y: R(0, h * 0.4), r: R(0.5, 1.4), ph: R(0, 6), sp: R(0.5, 2) });
    const shimmer = [];
    for (let i = 0; i < 55; i++) shimmer.push({ x: sunX + (Math.random() + Math.random() - 1) * w * 0.25, y: R(lakeTop + 3, h), len: R(8, 40), ph: R(0, 6), sp: R(0.5, 2) });
    let birds = null, birdTimer = R(4, 12), fogA = 0, fogB = 0;

    return {
      update(dt, t) {
        clouds.forEach((c) => { c.x += c.v * dt; if (c.x > w) c.x = -c.c.width; });
        fogA = (fogA + w * 0.008 * dt) % fogW;
        fogB = (fogB + w * 0.005 * dt) % fogW;
        birdTimer -= dt;
        if (!birds && birdTimer <= 0) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          birds = { x: dir > 0 ? -60 : w + 60, y: R(h * 0.2, h * 0.4), dir: dir, v: R(w * 0.03, w * 0.05), n: 3 + Math.floor(R(0, 4)), s: R(5, 9) };
        }
        if (birds) {
          birds.x += birds.dir * birds.v * dt;
          if (birds.x < -100 || birds.x > w + 100) { birds = null; birdTimer = R(15, 35); }
        }
      },
      draw(ctx, t) {
        ctx.drawImage(sky, 0, 0);
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          ctx.globalAlpha = (1 - s.y / (h * 0.42)) * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
          ctx.fillStyle = '#fff';
          ctx.fillRect(s.x, s.y, s.r, s.r);
        }
        ctx.globalAlpha = 1;
        clouds.forEach((c) => ctx.drawImage(c.c, c.x, c.y));
        ctx.drawImage(far, 0, 0);
        ctx.globalAlpha = 0.6;
        ctx.drawImage(fog, -fogA, h * 0.56);
        ctx.drawImage(fog, -fogA + fogW, h * 0.56);
        ctx.globalAlpha = 1;
        ctx.drawImage(near, 0, 0);
        ctx.drawImage(lake, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < shimmer.length; i++) {
          const s = shimmer[i];
          ctx.globalAlpha = 0.35 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph)) * (1 - (s.y - lakeTop) / (h - lakeTop) * 0.7);
          ctx.fillStyle = '#ffc9a0';
          ctx.fillRect(s.x - s.len / 2, s.y, s.len, 1.5);
        }
        ctx.restore();
        ctx.globalAlpha = 0.35;
        ctx.drawImage(fog, -fogB, lakeTop - fogH * 0.6);
        ctx.drawImage(fog, -fogB + fogW, lakeTop - fogH * 0.6);
        ctx.globalAlpha = 1;
        if (birds) {
          ctx.strokeStyle = '#1a1530'; ctx.lineWidth = 1.5;
          for (let i = 0; i < birds.n; i++) {
            const bx = birds.x - birds.dir * i * birds.s * 2.4, by = birds.y + (i % 2 ? 1 : -1) * i * birds.s * 0.8 + Math.sin(t + i) * 3;
            const flap = Math.sin(t * 8 + i * 1.3) * birds.s * 0.6;
            ctx.beginPath(); ctx.moveTo(bx - birds.s, by - flap); ctx.quadraticCurveTo(bx - birds.s * 0.4, by, bx, by + 1); ctx.quadraticCurveTo(bx + birds.s * 0.4, by, bx + birds.s, by - flap); ctx.stroke();
          }
        }
      }
    };
  }

  // ==================================================================
  // Cyberpunk city at night
  // ==================================================================
  function city(w, h) {
    const sky = C(w, h), sg = sky.getContext('2d');
    sg.fillStyle = linear(sg, 0, 0, 0, h, [[0, '#03010a'], [0.45, '#16052b'], [0.78, '#3c0a4d'], [1, '#7a1460']]);
    sg.fillRect(0, 0, w, h);
    const haze = sg.createRadialGradient(w / 2, h, 0, w / 2, h, w * 0.75);
    haze.addColorStop(0, 'rgba(255,60,160,0.35)'); haze.addColorStop(1, 'rgba(255,60,160,0)');
    sg.fillStyle = haze; sg.fillRect(0, 0, w, h);
    const mx = w * 0.2, my = h * 0.15, mr = Math.min(w, h) * 0.05;
    const mg = sg.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 4);
    mg.addColorStop(0, 'rgba(255,170,230,0.35)'); mg.addColorStop(1, 'rgba(255,170,230,0)');
    sg.fillStyle = mg; sg.fillRect(0, 0, w, h);
    sg.fillStyle = '#ffd6f2'; sg.beginPath(); sg.arc(mx, my, mr, 0, Math.PI * 2); sg.fill();

    const winColors = ['rgba(255,212,121,0.8)', 'rgba(124,243,255,0.75)', 'rgba(255,123,213,0.75)', 'rgba(255,240,200,0.7)'];
    function skyline(g, color, minH, maxH, winProb, winSize, record, edgeBoost) {
      let x = -R(0, w * 0.03);
      while (x < w) {
        const bw = R(w * 0.03, w * 0.08);
        const edge = edgeBoost ? Math.pow(Math.abs((x + bw / 2) / w - 0.5) * 2, 2) * h * edgeBoost : 0;
        const bh = R(minH, maxH) + edge;
        const top = h - bh;
        g.fillStyle = color;
        g.fillRect(x, top, bw, bh);
        if (Math.random() < 0.3) { g.fillRect(x + bw * 0.25, top - bh * 0.06, bw * 0.5, bh * 0.06); }
        const ww = winSize, wh = winSize * 1.5;
        for (let wy = top + wh * 1.5; wy < h - wh; wy += wh * 2) {
          for (let wx = x + ww; wx < x + bw - ww; wx += ww * 2) {
            if (Math.random() < winProb) {
              g.fillStyle = pick(winColors);
              g.fillRect(wx, wy, ww, wh);
              g.fillStyle = color;
            }
          }
        }
        if (record) record.push({ x: x, w: bw, top: top, h: bh, ww: ww, wh: wh });
        x += bw + R(0, w * 0.006);
      }
    }
    const far = C(w, h), fg = far.getContext('2d');
    skyline(fg, '#1d0c33', h * 0.22, h * 0.45, 0.1, Math.max(1.5, w * 0.003), null, 0);
    const mid = C(w, h), mgc = mid.getContext('2d');
    const midB = [];
    skyline(mgc, '#12071f', h * 0.3, h * 0.6, 0.28, Math.max(2, w * 0.004), midB, 0);
    const antennas = [];
    midB.forEach((b) => {
      if (Math.random() < 0.35) {
        const ax = b.x + b.w / 2, ah = R(h * 0.03, h * 0.08);
        mgc.strokeStyle = '#12071f'; mgc.lineWidth = 2;
        mgc.beginPath(); mgc.moveTo(ax, b.top); mgc.lineTo(ax, b.top - ah); mgc.stroke();
        antennas.push({ x: ax, y: b.top - ah, ph: R(0, 6) });
      }
    });
    const near = C(w, h), ngc = near.getContext('2d');
    const nearB = [];
    skyline(ngc, '#07030d', h * 0.25, h * 0.42, 0.12, Math.max(2.5, w * 0.005), nearB, 0.45);
    ngc.fillStyle = linear(ngc, 0, h * 0.92, 0, h, [[0, 'rgba(255,40,140,0.0)'], [0.5, 'rgba(255,40,140,0.25)'], [1, 'rgba(0,200,255,0.2)']]);
    ngc.fillRect(0, h * 0.92, w, h * 0.08);

    // windows that switch on and off
    const flick = [];
    nearB.forEach((b) => {
      for (let k = 0; k < 3; k++) {
        const wx = b.x + b.ww + Math.floor(R(0, Math.max(1, (b.w - b.ww * 2) / (b.ww * 2)))) * b.ww * 2;
        const wy = b.top + b.wh * 1.5 + Math.floor(R(0, Math.max(1, (b.h - b.wh * 3) / (b.wh * 2)))) * b.wh * 2;
        if (wy < h * 0.9) flick.push({ x: wx, y: wy, w: b.ww, h: b.wh, on: Math.random() < 0.5, next: R(1, 12), c: pick(winColors) });
      }
    });

    // neon signs
    const neon = ['#ff2a6d', '#05d9e8', '#f9f871', '#ff6ec7', '#7cff6b', '#b388ff'];
    const words = ['NOODLES', 'HOTEL', 'OPEN', 'BAR', 'ARCADE', 'SUSHI', '24H', 'CAFE', 'RAMEN', 'NEON', 'CLUB', 'TECH'];
    function makeSign(text, color, vertical, fs) {
      const font = 'bold ' + fs + 'px "Avenir Next", "Segoe UI", Arial, sans-serif';
      const meas = C(1, 1).getContext('2d'); meas.font = font;
      const bw = vertical ? fs * 1.5 : meas.measureText(text).width + fs * 0.9;
      const bh = vertical ? text.length * fs * 1.05 + fs * 0.5 : fs * 1.6;
      const pad = fs * 0.9;
      const c = C(bw + pad * 2, bh + pad * 2), g = c.getContext('2d');
      g.translate(pad, pad);
      g.fillStyle = 'rgba(10,0,20,0.75)'; roundRect(g, 0, 0, bw, bh, fs * 0.25); g.fill();
      g.shadowColor = color; g.shadowBlur = fs * 0.7;
      g.strokeStyle = color; g.lineWidth = Math.max(1.5, fs * 0.09);
      roundRect(g, 0, 0, bw, bh, fs * 0.25); g.stroke();
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      const drawText = () => {
        if (vertical) for (let i = 0; i < text.length; i++) g.fillText(text[i], bw / 2, fs * 0.25 + fs * 1.05 * (i + 0.5));
        else g.fillText(text, bw / 2, bh / 2 + fs * 0.05);
      };
      g.fillStyle = color; drawText();
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.55)'; drawText();
      return { c: c, pad: pad, w: bw, h: bh };
    }
    const signs = [];
    const fs = Math.max(10, Math.min(28, h * 0.028));
    nearB.slice().sort(() => Math.random() - 0.5).forEach((b) => {
      if (signs.length >= 7 || b.h < h * 0.3) return;
      const text = pick(words), color = pick(neon);
      const horiz = text.length * fs * 0.78 + fs * 0.9 < b.w * 0.9;
      if (!horiz && b.w < fs * 1.7) return;
      const s = makeSign(text, color, !horiz, fs);
      if (s.h > b.h * 0.6) return;
      signs.push({ s: s, x: b.x + (b.w - s.w) / 2 - s.pad, y: b.top + R(b.h * 0.08, Math.max(b.h * 0.1, b.h * 0.55 - s.h)) - s.pad, burst: 0, next: R(3, 15) });
    });

    const red = sprite(32, [[0, 'rgba(255,60,60,1)'], [0.3, 'rgba(255,40,40,0.6)'], [1, 'rgba(255,0,0,0)']]);
    const cars = [];
    for (let i = 0; i < 8; i++) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      cars.push({ x: R(0, w), y: R(h * 0.12, h * 0.55), dir: dir, v: R(50, 140) * w / 1000, len: R(30, 80) * w / 1000 });
    }
    const drops = [];
    for (let i = 0; i < 170; i++) drops.push({ x: R(0, w), y: R(0, h), len: R(10, 22), v: R(600, 900) * h / 800 });
    const beams = [{ x: w * 0.3, ph: 0 }, { x: w * 0.72, ph: 2.1 }];

    return {
      update(dt, t) {
        cars.forEach((c) => {
          c.x += c.dir * c.v * dt;
          if (c.x > w + c.len * 2) c.x = -c.len * 2;
          if (c.x < -c.len * 2) c.x = w + c.len * 2;
        });
        drops.forEach((d) => {
          d.y += d.v * dt; d.x += d.v * 0.12 * dt;
          if (d.y > h) { d.y = -d.len; d.x = R(-w * 0.1, w); }
        });
        flick.forEach((f) => { f.next -= dt; if (f.next <= 0) { f.on = !f.on; f.next = R(2, 20); } });
        signs.forEach((s) => {
          if (s.burst > 0) s.burst -= dt;
          else { s.next -= dt; if (s.next <= 0) { s.burst = R(0.3, 0.9); s.next = R(4, 20); } }
        });
      },
      draw(ctx, t) {
        ctx.drawImage(sky, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        beams.forEach((b) => {
          ctx.save();
          ctx.translate(b.x, h);
          ctx.rotate(Math.sin(t * 0.15 + b.ph) * 0.4);
          const len = h * 1.1;
          const gr = ctx.createLinearGradient(0, 0, 0, -len);
          gr.addColorStop(0, 'rgba(170,190,255,0.16)'); gr.addColorStop(1, 'rgba(170,190,255,0)');
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-len * 0.08, -len); ctx.lineTo(len * 0.08, -len); ctx.lineTo(3, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
        });
        ctx.restore();
        ctx.drawImage(far, 0, 0);
        ctx.drawImage(mid, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        antennas.forEach((a) => {
          ctx.globalAlpha = Math.sin(t * 2 + a.ph) > 0.5 ? 1 : 0.15;
          ctx.drawImage(red, a.x - 6, a.y - 6, 12, 12);
        });
        ctx.globalAlpha = 1;
        cars.forEach((c) => {
          const tail = c.x - c.dir * c.len;
          const gr = ctx.createLinearGradient(tail, 0, c.x, 0);
          const col = c.dir > 0 ? '124,243,255' : '255,59,107';
          gr.addColorStop(0, 'rgba(' + col + ',0)'); gr.addColorStop(1, 'rgba(' + col + ',0.8)');
          ctx.strokeStyle = gr; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(tail, c.y); ctx.lineTo(c.x, c.y); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.fillRect(c.x - 1.5, c.y - 1.5, 3, 3);
        });
        ctx.restore();
        ctx.drawImage(near, 0, 0);
        flick.forEach((f) => { ctx.fillStyle = f.on ? f.c : '#07030d'; ctx.fillRect(f.x, f.y, f.w, f.h); });
        signs.forEach((s) => {
          ctx.globalAlpha = s.burst > 0 ? (Math.random() < 0.5 ? 0.2 : 1) : 1;
          ctx.drawImage(s.s.c, s.x, s.y);
        });
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(160,190,255,0.28)'; ctx.lineWidth = 1;
        ctx.beginPath();
        drops.forEach((d) => { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.len * 0.12, d.y + d.len); });
        ctx.stroke();
      }
    };
  }

  const BUILDERS = { fireplace: fireplace, woods: woods, mountains: mountains, city: city };
  const LIST = [
    { id: 'fireplace', name: 'Cozy fireplace' },
    { id: 'woods', name: 'Fall woods' },
    { id: 'mountains', name: 'Mountain range' },
    { id: 'city', name: 'Neon city' }
  ];

  // Plays a scene on a canvas, sized to the canvas's on-screen size.
  function Runner(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scene = null; this.id = null; this.running = false; this.raf = 0; this.last = 0; this.t = 0;
    this._loop = this.loop.bind(this);
  }
  Runner.prototype.build = function (id) {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    this.canvas.width = w; this.canvas.height = h;
    this.id = id;
    this.scene = (BUILDERS[id] || fireplace)(w, h);
    this.t = 0;
  };
  Runner.prototype.start = function (id) {
    this.stop();
    this.build(id);
    this.running = true; this.last = 0;
    this.raf = requestAnimationFrame(this._loop);
  };
  Runner.prototype.loop = function (now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._loop);
    if (this.last && now - this.last < 30) return;   // about 30 frames per second
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 30;
    this.last = now;
    this.t += dt;
    this.scene.update(dt, this.t);
    this.scene.draw(this.ctx, this.t);
  };
  Runner.prototype.stop = function () {
    this.running = false;
    cancelAnimationFrame(this.raf);
  };
  Runner.prototype.resize = function () {
    if (this.running && this.id) this.start(this.id);
  };
  // Draws a single frame (for thumbnails), after letting the animation settle for a few seconds.
  function still(canvas, id) {
    const r = new Runner(canvas);
    r.build(id);
    for (let i = 0; i < 90; i++) { r.t += 1 / 30; r.scene.update(1 / 30, r.t); }
    r.scene.draw(r.ctx, r.t);
  }

  window.Scenes = { LIST: LIST, Runner: Runner, still: still };
})();
