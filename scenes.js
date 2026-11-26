/* Living photo scenes for Photo Frame.
   Each scene is a real photo (free Unsplash photos, see CREDITS.md) with realistic moving effects:
   a slow camera move done with a CSS transform, plus effects drawn on two transparent canvases:
   one that moves with the photo (lights, smoke, clouds, traffic) and one in front (snow, leaves, birds).
   Kept light enough for an old iPad (about 30 frames per second, small sprites). */
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
  const glowCache = {};
  function glow(r, g, b) {
    r = Math.round(r / 16) * 16; g = Math.round(g / 16) * 16; b = Math.round(b / 16) * 16;
    const key = r + ',' + g + ',' + b;
    if (!glowCache[key]) {
      const c = 'rgba(' + Math.min(255, r) + ',' + Math.min(255, g) + ',' + Math.min(255, b) + ',';
      glowCache[key] = sprite(64, [[0, c + '1)'], [0.12, c + '0.85)'], [0.35, c + '0.25)'], [1, c + '0)']]);
    }
    return glowCache[key];
  }
  function div(cls, parent) {
    const e = document.createElement('div');
    e.className = cls;
    parent.appendChild(e);
    return e;
  }

  // ==================================================================
  // Scene list. Positions are fractions of the photo's width/height.
  // ==================================================================
  const SCENES = [
    {
      id: 'village', name: 'Snowy village', src: 'scenes/village.jpg', focus: [0.5, 0.5],
      motion: { type: 'zoom', origin: [0.53, 0.45], from: 1.0, to: 1.1, period: 90 },
      lights: { count: 280, min: 0.78, contrast: 0.12, region: [0, 0.15, 1, 1], warm: true, size: 18, base: 0.05, amp: 0.75 },
      halos: 26,
      smoke: [[0.965, 0.15], [0.745, 0.225]],
      snow: true
    },
    {
      id: 'road', name: 'Autumn road', src: 'scenes/road.jpg', focus: [0.78, 0.5],
      motion: { type: 'zoom', origin: [0.8, 0.36], from: 1.0, to: 1.12, period: 80 },
      leaves: true,
      sunlight: { from: [0.95, -0.15] }
    },
    {
      id: 'mountains', name: 'Mountain range', src: 'scenes/mountains.jpg', focus: [0.5, 0.5],
      motion: { type: 'pan', scale: 1.1, amp: 0.08, period: 100 },
      clouds: { sky: [0.04, 0.34], haze: [0.44, 0.56] },
      mask: true,
      birds: true
    },
    {
      id: 'city', name: 'Night city', src: 'scenes/city.jpg', focus: [0.65, 0.5],
      motion: { type: 'zoom', origin: [0.65, 0.55], from: 1.02, to: 1.09, period: 100 },
      lights: { count: 220, min: 0.72, contrast: 0.12, region: [0, 0.05, 1, 1], warm: false, size: 14, base: 0.0, amp: 0.6 },
      signs: [
        { r: [0.829, 0.181, 0.038, 0.044], c: [255, 50, 60] },
        { r: [0.505, 0.331, 0.072, 0.036], c: [255, 40, 50] },
        { r: [0.148, 0.127, 0.052, 0.022], c: [255, 60, 60] },
        { r: [0.148, 0.087, 0.048, 0.024], c: [120, 170, 255] },
        { r: [0.864, 0.14, 0.012, 0.155], c: [255, 40, 60] },
        { r: [0.463, 0.777, 0.058, 0.03], c: [170, 210, 255] },
        { r: [0.948, 0.424, 0.041, 0.018], c: [255, 230, 120] },
        { r: [0.528, 0.804, 0.01, 0.08], c: [255, 50, 50] }
      ],
      lanes: [
        { path: [[1.02, 0.825], [0.715, 1.02]], kind: 'head', n: 5, dur: 9 },
        { path: [[0.77, 1.02], [1.02, 0.87]], kind: 'tail', n: 5, dur: 10 }
      ]
    },
    {
      id: 'ocean', name: 'Ocean sunset', src: 'scenes/ocean.jpg', focus: [0.5, 0.5],
      motion: { type: 'zoom', origin: [0.51, 0.53], from: 1.0, to: 1.07, period: 100 },
      clouds: { sky: [0.08, 0.4] },
      glitter: { mode: 'sunpath', cx: 0.512, top: 0.535, bottom: 0.83, spread: [0.008, 0.13], count: 170, color: [255, 222, 165] },
      swash: { y0: 0.862, y1: 0.935, period: 10 },
      birds: true
    },
    {
      id: 'flowers', name: 'Flower field', src: 'scenes/flowers.jpg', focus: [0.5, 0.5],
      motion: { type: 'pan', scale: 1.08, amp: 0.06, period: 110 },
      clouds: { sky: [0.06, 0.3] },
      mask: true,
      breeze: { top: 0.44, period: 12 },
      pollen: true,
      birds: true
    },
    {
      id: 'cabin', name: 'Mountain cabin', src: 'scenes/cabin.jpg', focus: [0.45, 0.5],
      motion: { type: 'zoom', origin: [0.5, 0.64], from: 1.0, to: 1.08, period: 100 },
      lights: { count: 70, min: 0.45, contrast: 0.06, region: [0.25, 0.55, 0.8, 0.8], warm: true, warmOnly: true, size: 16, base: 0.15, amp: 0.55 },
      halos: 16, haloMode: 'fire',
      smoke: [[0.483, 0.577], [0.663, 0.657]],
      snow: true,
      lanes: [
        { path: [[0.28, 0.667], [0.165, 0.693], [0.085, 0.724], [0.075, 0.782], [0.165, 0.853], [0.35, 0.942], [0.52, 1.04]], kind: 'head', n: 1, dur: 13, gap: 18, sizes: [6, 80] },
        { path: [[0.52, 1.04], [0.35, 0.942], [0.165, 0.853], [0.075, 0.782], [0.085, 0.724], [0.165, 0.693], [0.28, 0.667]], kind: 'tail', n: 1, dur: 15, gap: 30, sizes: [6, 80] }
      ]
    },
    {
      id: 'positano', name: 'Positano', src: 'scenes/positano.jpg', focus: [0.4, 0.5],
      motion: { type: 'zoom', origin: [0.45, 0.6], from: 1.0, to: 1.07, period: 110 },
      water: { region: [0, 0.42, 0.47, 1] },
      glitter: { mode: 'water', count: 140, color: [255, 255, 245] },
      boats: [
        { from: [-0.05, 0.655], to: [0.3, 0.6], size: 34, dur: 75 },
        { from: [0.36, 0.9], to: [-0.08, 0.82], size: 62, dur: 60 },
        { from: [-0.02, 0.5], to: [0.22, 0.48], size: 15, dur: 95 }
      ],
      birds: true
    }
  ];
  const byId = (id) => SCENES.find((s) => s.id === id);

  // ==================================================================
  // Photo analysis (done once per scene): find the little lights to twinkle,
  // and for the mountains, which parts are trees (so clouds pass behind them).
  // ==================================================================
  const analysis = {};
  function analyse(def, img) {
    if (analysis[def.id]) return analysis[def.id];
    const res = { lights: [], mask: null, water: [] };
    try {
      const sw = 480, sh = Math.round(img.naturalHeight * sw / img.naturalWidth);
      const c = C(sw, sh), g = c.getContext('2d');
      g.drawImage(img, 0, 0, sw, sh);
      const d = g.getImageData(0, 0, sw, sh).data;
      if (def.lights) {
        const L = def.lights, lum = new Float32Array(sw * sh);
        for (let i = 0; i < sw * sh; i++) lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
        const cand = [];
        for (let y = 2; y < sh - 2; y++) {
          const fy = y / sh;
          if (fy < L.region[1] || fy > L.region[3]) continue;
          next: for (let x = 2; x < sw - 2; x++) {
            const i = y * sw + x, v = lum[i];
            if (v < L.min) continue;
            let sum = 0;
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                if (!dx && !dy) continue;
                const u = lum[i + dy * sw + dx];
                if (u > v) continue next;
                sum += u;
              }
            }
            const contrast = v - sum / 24;
            if (contrast < L.contrast) continue;
            if (L.warmOnly && !(d[i * 4] > d[i * 4 + 2] + 40 && d[i * 4] > 140)) continue;
            cand.push({ x: (x + 0.5) / sw, y: (y + 0.5) / sh, c: contrast, r: d[i * 4], g: d[i * 4 + 1], b: d[i * 4 + 2] });
          }
        }
        cand.sort((a, b) => b.c - a.c);
        res.lights = cand.slice(0, L.count);
      }
      if (def.water) {
        // open sea: clearly blue/turquoise pixels inside the given area
        const rg = def.water.region, pts = [];
        for (let y = Math.floor(rg[1] * sh); y < Math.min(sh, rg[3] * sh); y += 2) {
          for (let x = Math.floor(rg[0] * sw); x < Math.min(sw, rg[2] * sw); x += 2) {
            const i = y * sw + x, r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
            if (b > r + 25 && gg > r + 10) pts.push({ x: (x + 0.5) / sw, y: (y + 0.5) / sh });
          }
        }
        res.water = pts;
      }
      if (def.mask) {
        // trees are dark and green; sky, rock and snow are not
        const m = C(sw, sh), mg = m.getContext('2d'), md = mg.createImageData(sw, sh);
        for (let i = 0; i < sw * sh; i++) {
          const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
          const l = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
          const tree = l < 0.36 && gg >= r && gg >= b * 0.85;
          md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = 255;
          md.data[i * 4 + 3] = tree ? 0 : 255;
        }
        mg.putImageData(md, 0, 0);
        const small = C(sw / 2, sh / 2);
        small.getContext('2d').drawImage(m, 0, 0, sw / 2, sh / 2);
        const soft = C(sw, sh);
        soft.getContext('2d').drawImage(small, 0, 0, sw, sh);
        res.mask = soft;
      }
    } catch (e) {
      // reading pixels can fail when the page is opened straight from a file; effects still run without it
    }
    analysis[def.id] = res;
    return res;
  }

  // ==================================================================
  // Effects
  // ==================================================================

  // Small lights that sparkle and shimmer, plus slow-breathing halos around the brightest ones.
  function twinkle(rn, def, an) {
    const L = def.lights;
    const items = an.lights.map((l) => {
      const p = rn.map(l.x, l.y);
      let r = l.r, g = l.g, b = l.b;
      if (L.warm) { r = 255; g = 214 + Math.random() * 30; b = 150 + Math.random() * 50; }
      else { const mx = Math.max(r, g, b) || 1; r = r / mx * 255; g = g / mx * 255; b = b / mx * 255; }
      return { x: p[0], y: p[1], spr: glow(r, g, b), ph: R(0, 6.28), sp: R(0.6, 2.2), flare: Math.random() < 0.1 };
    });
    const halos = [], fire = def.haloMode === 'fire';
    for (let i = 0; i < Math.min(def.halos || 0, an.lights.length); i++) {
      const l = an.lights[i], p = rn.map(l.x, l.y);
      halos.push({ x: p[0], y: p[1], ph: R(0, 6.28), sp: R(0.15, 0.4), s: (fire ? R(40, 80) : R(60, 130)) * rn.k });
    }
    const warmGlow = glow(255, 200, 130), fireGlow = glow(255, 150, 60);
    return {
      draw(ctx, t) {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < halos.length; i++) {
          const h = halos[i];
          if (fire) {
            // firelight inside: an uneven flicker
            const f = 0.5 + 0.25 * Math.sin(t * 7.3 + h.ph) + 0.15 * Math.sin(t * 13.7 + h.ph * 2) + 0.1 * Math.sin(t * 2.1 + h.ph);
            ctx.globalAlpha = 0.08 + 0.14 * f;
            ctx.drawImage(fireGlow, h.x - h.s / 2, h.y - h.s / 2, h.s, h.s);
          } else {
            ctx.globalAlpha = 0.05 + 0.05 * Math.sin(t * h.sp + h.ph);
            ctx.drawImage(warmGlow, h.x - h.s / 2, h.y - h.s / 2, h.s, h.s);
          }
        }
        const base = L.size * rn.k;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const s = 0.5 + 0.5 * Math.sin(t * it.sp + it.ph);
          const sparkle = Math.pow(s, 6);
          const a = L.base + L.amp * sparkle;
          if (a < 0.02) continue;
          const size = base * (0.6 + 0.7 * sparkle);
          ctx.globalAlpha = a;
          ctx.drawImage(it.spr, it.x - size / 2, it.y - size / 2, size, size);
          if (it.flare && sparkle > 0.6) {
            const fl = size * 1.6;
            ctx.globalAlpha = (sparkle - 0.6) * 1.2;
            ctx.drawImage(it.spr, it.x - fl / 2, it.y - 0.6, fl, 1.2);
            ctx.drawImage(it.spr, it.x - 0.6, it.y - fl / 2, 1.2, fl);
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  }

  // Falling snow in three depths: tiny distant flakes, medium flakes, and big out-of-focus flakes close to the camera.
  function snow(rn) {
    const W = rn.W, H = rn.H, kh = H / 768;
    const small = sprite(16, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]);
    const soft = sprite(32, [[0, 'rgba(255,253,248,0.95)'], [0.55, 'rgba(255,253,248,0.4)'], [1, 'rgba(255,253,248,0)']]);
    const bokeh = sprite(64, [[0, 'rgba(255,250,240,0.32)'], [0.72, 'rgba(255,250,240,0.24)'], [0.86, 'rgba(255,250,240,0.1)'], [1, 'rgba(255,250,240,0)']]);
    const layers = [
      { n: 200, spr: small, size: [1.6, 3], v: [22, 40], a: [0.45, 0.85], z: 0.4 },
      { n: 95, spr: soft, size: [4, 7.5], v: [45, 75], a: [0.6, 0.95], z: 0.8 },
      { n: 10, spr: bokeh, size: [18, 34], v: [85, 130], a: [0.5, 0.9], z: 1.6 }
    ];
    const flakes = [];
    layers.forEach((L) => {
      for (let i = 0; i < L.n; i++) {
        flakes.push({ L: L, x: R(0, W), y: R(-H * 0.1, H), s: R(L.size[0], L.size[1]) * kh, v: R(L.v[0], L.v[1]) * kh, a: R(L.a[0], L.a[1]), ph: R(0, 6.28), f: R(0.4, 1.2), amp: R(6, 18) * kh * L.z });
      }
    });
    let wind = 0;
    return {
      update(dt, t) {
        wind = (Math.sin(t * 0.07) * 0.6 + Math.sin(t * 0.19 + 1) * 0.4) * 14 * kh;
        for (let i = 0; i < flakes.length; i++) {
          const f = flakes[i];
          f.y += f.v * dt;
          f.x += (wind * f.L.z + Math.cos(t * f.f + f.ph) * f.amp) * dt;
          if (f.y > H + f.s) { f.y = -f.s - R(0, 20); f.x = R(-W * 0.1, W * 1.1); }
          if (f.x > W + f.s) f.x = -f.s; else if (f.x < -f.s) f.x = W + f.s;
        }
      },
      draw(ctx) {
        for (let i = 0; i < flakes.length; i++) {
          const f = flakes[i];
          ctx.globalAlpha = f.a;
          ctx.drawImage(f.L.spr, f.x - f.s / 2, f.y - f.s / 2, f.s, f.s);
        }
        ctx.globalAlpha = 1;
      }
    };
  }

  // Thin chimney smoke curling up and drifting.
  function smoke(rn, points) {
    const puff = sprite(64, [[0, 'rgba(215,205,195,0.55)'], [0.5, 'rgba(200,190,180,0.25)'], [1, 'rgba(190,180,170,0)']]);
    const k = rn.k;
    const sources = points.map((p) => ({ p: rn.map(p[0], p[1]), acc: 0 }));
    const puffs = [];
    return {
      update(dt, t) {
        sources.forEach((s) => {
          s.acc += dt * 3;
          while (s.acc >= 1) {
            s.acc--;
            puffs.push({ x: s.p[0] + R(-4, 4) * k, y: s.p[1], life: 0, max: R(6, 9), vx: R(4, 10) * k, vy: -R(22, 34) * k, s0: R(16, 26) * k, ph: R(0, 6) });
          }
        });
        for (let i = puffs.length - 1; i >= 0; i--) {
          const p = puffs[i];
          p.life += dt;
          if (p.life > p.max) { puffs.splice(i, 1); continue; }
          p.x += (p.vx + Math.sin(t * 0.6 + p.ph) * 6 * k - 12 * k * Math.sin(t * 0.05)) * dt;
          p.y += p.vy * dt;
          p.vy *= 0.995;
        }
      },
      draw(ctx) {
        for (let i = 0; i < puffs.length; i++) {
          const p = puffs[i], q = p.life / p.max;
          const s = p.s0 * (1 + q * 5);
          ctx.globalAlpha = 0.22 * Math.min(1, q * 6) * (1 - q);
          ctx.drawImage(puff, p.x - s / 2, p.y - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
      }
    };
  }

  // Real-looking leaves: shaded, veined, a few shapes, tumbling as they fall, some blurred close to the camera.
  const LEAF_COLORS = [['#e3a33a', '#9c5a14'], ['#cf5a22', '#7a2a10'], ['#e8c04a', '#a77a1a'], ['#a8602c', '#5a3214'], ['#c48a35', '#6e4c17'], ['#d8752a', '#8a3c0f'], ['#b9472a', '#6b1f10']];
  function leafPath(g, kind, S) {
    g.beginPath();
    if (kind === 0) {           // simple oval leaf
      g.moveTo(0, -S * 0.46);
      g.bezierCurveTo(S * 0.3, -S * 0.28, S * 0.3, S * 0.18, 0, S * 0.4);
      g.bezierCurveTo(-S * 0.3, S * 0.18, -S * 0.3, -S * 0.28, 0, -S * 0.46);
    } else if (kind === 1) {    // maple-like
      const pts = [[0, -0.48], [0.1, -0.22], [0.3, -0.36], [0.24, -0.1], [0.46, -0.06], [0.26, 0.1], [0.32, 0.26], [0.08, 0.16], [0, 0.36], [-0.08, 0.16], [-0.32, 0.26], [-0.26, 0.1], [-0.46, -0.06], [-0.24, -0.1], [-0.3, -0.36], [-0.1, -0.22]];
      pts.forEach((p, i) => { const x = p[0] * S * R(0.95, 1.05), y = p[1] * S; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath();
    } else {                    // oak-like, lobed
      const n = 28;
      for (let i = 0; i <= n; i++) {
        const q = i / n, y = -S * 0.46 + q * S * 0.86;
        const w = S * 0.2 * Math.sin(Math.PI * q) * (1 + 0.38 * Math.sin(q * Math.PI * 9));
        if (i) g.lineTo(w, y); else g.moveTo(0, y);
      }
      for (let i = n; i >= 0; i--) {
        const q = i / n, y = -S * 0.46 + q * S * 0.86;
        const w = S * 0.2 * Math.sin(Math.PI * q) * (1 + 0.38 * Math.sin(q * Math.PI * 9));
        g.lineTo(-w, y);
      }
      g.closePath();
    }
  }
  function leafSprite(kind, colors, blur) {
    const S = 64, pad = blur ? 22 : 4;
    const c = C(S + pad * 2, S + pad * 2), g = c.getContext('2d');
    g.translate(pad + S / 2, pad + S / 2);
    const gr = g.createRadialGradient(-S * 0.08, -S * 0.1, 0, 0, 0, S * 0.55);
    gr.addColorStop(0, colors[0]); gr.addColorStop(0.65, colors[0]); gr.addColorStop(1, colors[1]);
    if (blur) {
      g.shadowColor = colors[1]; g.shadowBlur = 5; g.shadowOffsetX = 1000;
      g.translate(-1000, 0);
      leafPath(g, kind, S); g.fillStyle = colors[0]; g.fill();
      g.shadowColor = colors[0]; g.shadowBlur = 3;
      g.scale(0.8, 0.8); leafPath(g, kind, S); g.fill();
      return c;
    }
    leafPath(g, kind, S); g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(50,25,8,0.4)'; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(0, -S * 0.42); g.lineTo(0, S * 0.52); g.stroke();
    g.lineWidth = 0.7;
    for (let i = 0; i < 4; i++) {
      const y = -S * 0.25 + i * S * 0.15;
      g.beginPath(); g.moveTo(0, y); g.lineTo(S * 0.16, y - S * 0.09); g.moveTo(0, y); g.lineTo(-S * 0.16, y - S * 0.09); g.stroke();
    }
    // a little speckling for texture
    for (let i = 0; i < 18; i++) {
      g.fillStyle = 'rgba(60,30,10,' + R(0.05, 0.15) + ')';
      g.beginPath(); g.arc(R(-S * 0.18, S * 0.18), R(-S * 0.3, S * 0.3), R(0.6, 1.8), 0, Math.PI * 2); g.fill();
    }
    return c;
  }
  let leafSprites = null;
  function leaves(rn) {
    if (!leafSprites) {
      leafSprites = { sharp: [], blur: [] };
      for (let i = 0; i < 14; i++) leafSprites.sharp.push(leafSprite(i % 3, pick(LEAF_COLORS), false));
      for (let i = 0; i < 5; i++) leafSprites.blur.push(leafSprite(i % 3, pick(LEAF_COLORS), true));
    }
    const W = rn.W, H = rn.H, kh = H / 768;
    const all = [];
    const make = (z, anywhere) => {
      const near = z > 1.3;
      return {
        z: z, spr: near ? pick(leafSprites.blur) : pick(leafSprites.sharp), size: (near ? R(80, 120) : R(20, 36) * z) * kh,
        x: R(-W * 0.1, W), y: anywhere ? R(-H * 0.2, H) : R(-H * 0.25, -40), vy: R(38, 62) * z * kh,
        amp: R(20, 55) * z * kh, f: R(0.5, 1.2), ph: R(0, 6.28), rot: R(0, 6.28), rs: R(-1.6, 1.6), ff: R(1.2, 3), fph: R(0, 6.28)
      };
    };
    for (let i = 0; i < 10; i++) all.push(make(R(0.45, 0.7), true));
    for (let i = 0; i < 14; i++) all.push(make(R(0.8, 1.15), true));
    for (let i = 0; i < 3; i++) all.push(make(R(1.6, 2), true));
    let gust = 0;
    return {
      update(dt, t) {
        gust = (Math.sin(t * 0.11) * 0.5 + Math.sin(t * 0.37 + 2) * 0.3 + 0.35) * 45 * kh;
        for (let i = 0; i < all.length; i++) {
          const l = all[i];
          const flat = Math.abs(Math.cos(t * l.ff + l.fph));
          l.y += l.vy * (0.55 + 0.45 * (1 - flat)) * dt;
          l.x += (gust * l.z + Math.cos(t * l.f + l.ph) * l.amp) * dt;
          l.rot += l.rs * dt;
          if (l.y > H + l.size || l.x > W + l.size * 2) all[i] = make(l.z, false);
        }
      },
      draw(ctx, t) {
        for (let i = 0; i < all.length; i++) {
          const l = all[i];
          let sx = Math.cos(t * l.ff + l.fph);
          if (Math.abs(sx) < 0.12) sx = sx < 0 ? -0.12 : 0.12;
          const cs = Math.cos(l.rot), sn = Math.sin(l.rot);
          ctx.setTransform(cs * sx, sn * sx, -sn, cs, l.x, l.y);
          const s = l.size;
          ctx.drawImage(l.spr, -s / 2, -s / 2, s, s);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    };
  }

  // Warm sunlight: soft beams through the trees and drifting patches of dappled light.
  function sunlight(rn, opt) {
    const src = rn.map(opt.from[0], opt.from[1]);
    const W = rn.W, H = rn.H;
    const beams = [];
    for (let i = 0; i < 5; i++) beams.push({ ang: R(0.5, 1.1), spread: R(0.04, 0.09), ph: R(0, 6.28), sp: R(0.08, 0.2), a: R(0.05, 0.1) });
    const spot = sprite(128, [[0, 'rgba(255,222,150,0.9)'], [0.4, 'rgba(255,200,120,0.35)'], [1, 'rgba(255,190,110,0)']]);
    const spots = [];
    for (let i = 0; i < 7; i++) {
      const p = rn.map(R(0.05, 0.95), R(0.1, 0.75));
      spots.push({ x: p[0], y: p[1], s: R(0.12, 0.25) * W, ph: R(0, 6.28), sp: R(0.05, 0.15), dx: R(10, 30), a: R(0.06, 0.12) });
    }
    const len = Math.hypot(W, H) * 1.3;
    return {
      draw(ctx, t) {
        ctx.globalCompositeOperation = 'lighter';
        beams.forEach((b) => {
          const a = b.a * (0.5 + 0.5 * Math.sin(t * b.sp + b.ph));
          const ang = b.ang + Math.sin(t * 0.03 + b.ph) * 0.03;
          const ex = src[0] - Math.sin(ang) * len, ey = src[1] + Math.cos(ang) * len;
          const gr = ctx.createLinearGradient(src[0], src[1], ex, ey);
          gr.addColorStop(0, 'rgba(255,235,190,' + a + ')'); gr.addColorStop(1, 'rgba(255,235,190,0)');
          ctx.fillStyle = gr;
          const ox = Math.cos(ang) * len * b.spread, oy = Math.sin(ang) * len * b.spread;
          ctx.beginPath(); ctx.moveTo(src[0], src[1]); ctx.lineTo(ex - ox, ey - oy); ctx.lineTo(ex + ox, ey + oy); ctx.closePath(); ctx.fill();
        });
        spots.forEach((s) => {
          ctx.globalAlpha = s.a * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph)));
          const x = s.x + Math.sin(t * s.sp * 0.7 + s.ph) * s.dx;
          ctx.drawImage(spot, x - s.s / 2, s.y - s.s * 0.3, s.s, s.s * 0.6);
        });
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  }

  // Wispy clouds and haze drifting past the peaks (behind the trees), plus their shadows on the slopes.
  function cloudSprite(w, h, density) {
    const c = C(w, h), g = c.getContext('2d');
    const puff = sprite(64, [[0, 'rgba(255,255,255,0.6)'], [0.5, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]);
    for (let i = 0; i < 70 * density; i++) {
      const x = R(0.12, 0.88) * w;
      const spread = 1 - Math.abs(x / w - 0.5) * 1.6;
      const cy = h * 0.5 + (Math.random() - 0.5) * h * 0.35 * spread;
      const rw = R(0.08, 0.22) * w, rh = rw * R(0.18, 0.35);
      g.globalAlpha = R(0.25, 0.6) * spread;
      g.drawImage(puff, x - rw / 2, cy - rh / 2, rw, rh);
    }
    for (let i = 0; i < 14; i++) {
      const rw = R(0.2, 0.4) * w, rh = R(0.08, 0.16) * h;
      g.globalAlpha = R(0.08, 0.2);
      g.drawImage(puff, R(0, w - rw), h * 0.5 + R(-0.15, 0.15) * h - rh / 2, rw, rh);
    }
    return c;
  }
  function clouds(rn, opt, an) {
    const W = rn.W, H = rn.H;
    const layer = C(W, H), lg = layer.getContext('2d');
    const list = [];
    for (let i = 0; i < 4; i++) {
      const cw = R(0.35, 0.6) * W, ch = R(0.08, 0.14) * H;
      const y = rn.map(0, R(opt.sky[0], opt.sky[1]))[1];
      list.push({ c: cloudSprite(cw, ch, 1), x: R(-cw, W), y: y - ch / 2, v: R(6, 12) * W / 1000, a: R(0.55, 0.85) });
    }
    for (let i = 0; opt.haze && i < 2; i++) {
      const cw = R(0.6, 0.9) * W, ch = R(0.06, 0.1) * H;
      const y = rn.map(0, R(opt.haze[0], opt.haze[1]))[1];
      list.push({ c: cloudSprite(cw, ch, 0.6), x: R(-cw, W), y: y - ch / 2, v: R(4, 8) * W / 1000, a: R(0.3, 0.45) });
    }
    const shade = sprite(128, [[0, 'rgba(10,20,35,0.5)'], [0.6, 'rgba(10,20,35,0.2)'], [1, 'rgba(10,20,35,0)']]);
    const shadows = [];
    for (let i = 0; opt.haze && i < 3; i++) {
      shadows.push({ x: R(-W * 0.5, W), y: rn.map(0, R(0.5, 0.8))[1], w: R(0.4, 0.7) * W, h: R(0.15, 0.25) * H, v: R(6, 12) * W / 1000 });
    }
    return {
      update(dt) {
        list.forEach((c) => { c.x += c.v * dt; if (c.x > W) c.x = -c.c.width; });
        shadows.forEach((s) => { s.x += s.v * dt; if (s.x > W) s.x = -s.w; });
      },
      draw(ctx) {
        ctx.globalAlpha = 0.35;
        shadows.forEach((s) => ctx.drawImage(shade, s.x, s.y - s.h / 2, s.w, s.h));
        ctx.globalAlpha = 1;
        lg.clearRect(0, 0, W, H);
        list.forEach((c) => { lg.globalAlpha = c.a; lg.drawImage(c.c, c.x, c.y); });
        lg.globalAlpha = 1;
        if (an.mask) {
          lg.globalCompositeOperation = 'destination-in';
          lg.drawImage(an.mask, rn.ox, rn.oy, rn.dw, rn.dh);
          lg.globalCompositeOperation = 'source-over';
        }
        ctx.drawImage(layer, 0, 0);
      }
    };
  }

  // A few distant birds now and then.
  function birds(rn) {
    const W = rn.W, H = rn.H, kh = H / 768;
    let flock = null, wait = R(6, 15);
    return {
      update(dt) {
        if (!flock) {
          wait -= dt;
          if (wait <= 0) {
            const dir = Math.random() < 0.5 ? 1 : -1;
            const n = 2 + Math.floor(R(0, 4));
            const list = [];
            for (let i = 0; i < n; i++) list.push({ dx: -dir * i * R(14, 24) * kh, dy: R(-10, 10) * kh, ph: R(0, 6), s: R(3.5, 6) * kh });
            flock = { x: dir > 0 ? -60 : W + 60, y: R(0.12, 0.3) * H, dir: dir, v: R(25, 40) * kh, list: list };
          }
        } else {
          flock.x += flock.dir * flock.v * dt;
          if (flock.x < -200 || flock.x > W + 200) { flock = null; wait = R(20, 45); }
        }
      },
      draw(ctx, t) {
        if (!flock) return;
        ctx.strokeStyle = 'rgba(20,28,40,0.75)';
        ctx.lineWidth = Math.max(1, kh * 1.2);
        flock.list.forEach((b) => {
          const x = flock.x + b.dx, y = flock.y + b.dy + Math.sin(t * 0.8 + b.ph) * 4 * kh;
          const flap = Math.sin(t * 9 + b.ph) * b.s * 0.7;
          ctx.beginPath();
          ctx.moveTo(x - b.s, y - flap); ctx.quadraticCurveTo(x - b.s * 0.4, y - flap * 0.2, x, y);
          ctx.quadraticCurveTo(x + b.s * 0.4, y - flap * 0.2, x + b.s, y - flap);
          ctx.stroke();
        });
      }
    };
  }

  // Neon signs that hum with light and now and then flicker or cut out.
  function neon(rn, signs) {
    const dark = sprite(64, [[0, 'rgba(8,4,12,0.85)'], [0.6, 'rgba(8,4,12,0.6)'], [1, 'rgba(8,4,12,0)']]);
    const list = signs.map((s) => {
      const p = rn.map(s.r[0], s.r[1]), q = rn.map(s.r[0] + s.r[2], s.r[1] + s.r[3]);
      return { x: p[0], y: p[1], w: q[0] - p[0], h: q[1] - p[1], spr: glow(s.c[0], s.c[1], s.c[2]), ph: R(0, 6), glitch: 0, next: R(3, 18), off: false };
    });
    return {
      update(dt) {
        list.forEach((s) => {
          if (s.glitch > 0) {
            s.glitch -= dt;
            if (Math.random() < 0.35) s.off = !s.off;
            if (s.glitch <= 0) s.off = false;
          } else {
            s.next -= dt;
            if (s.next <= 0) { s.glitch = R(0.25, 0.9); s.next = R(6, 25); }
          }
        });
      },
      draw(ctx, t) {
        list.forEach((s) => {
          const gw = s.w * 1.8 + 20 * rn.k, gh = s.h * 1.8 + 20 * rn.k;
          if (s.off) {
            ctx.globalAlpha = 0.85;
            ctx.drawImage(dark, s.x - s.w * 0.1, s.y - s.h * 0.1, s.w * 1.2, s.h * 1.2);
          } else {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.16 + 0.06 * Math.sin(t * 3.1 + s.ph) + (s.glitch > 0 ? 0.2 : 0);
            ctx.drawImage(s.spr, s.x + s.w / 2 - gw / 2, s.y + s.h / 2 - gh / 2, gw, gh);
            ctx.globalCompositeOperation = 'source-over';
          }
        });
        ctx.globalAlpha = 1;
      }
    };
  }

  // Car lights moving along a road (straight or winding): headlights coming, tail lights going.
  // Lights get bigger the closer the road is to the bottom of the photo (closer to the camera).
  function traffic(rn, lanes) {
    const head = glow(255, 240, 210), tail = glow(255, 40, 30), wash = glow(255, 230, 190);
    const cars = [];
    lanes.forEach((ln) => {
      const pts = ln.path.map((p) => rn.map(p[0], p[1]));
      const segs = [];
      let total = 0, minY = 1e9, maxY = -1e9;
      ln.path.forEach((p) => { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, Math.min(1, p[1])); });
      for (let i = 1; i < pts.length; i++) {
        const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        segs.push({ a: pts[i - 1], b: pts[i], len: len, start: total });
        total += len;
      }
      const sizes = ln.sizes || [24, 50];
      const lane = { segs: segs, total: total, kind: ln.kind, dur: ln.dur, gap: ln.gap || 0, minY: minY, maxY: maxY, sizes: sizes };
      for (let i = 0; i < ln.n; i++) {
        cars.push({ lane: lane, u: ln.gap ? -R(0.2, 1) * ln.gap / ln.dur : i / ln.n + R(0, 0.1), sp: R(0.85, 1.2) / ln.dur });
      }
    });
    function at(lane, u) {
      const d = Math.max(0, Math.min(1, u)) * lane.total;
      for (let i = 0; i < lane.segs.length; i++) {
        const s = lane.segs[i];
        if (d <= s.start + s.len || i === lane.segs.length - 1) {
          const q = s.len ? (d - s.start) / s.len : 0;
          const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], len = s.len || 1;
          return { x: s.a[0] + dx * q, y: s.a[1] + dy * q, nx: -dy / len, ny: dx / len };
        }
      }
      return null;
    }
    return {
      update(dt) {
        cars.forEach((c) => {
          c.u += c.sp * dt;
          if (c.u > 1.05) {
            c.u = c.lane.gap ? -R(0.6, 1.4) * c.lane.gap / c.lane.dur : -R(0.05, 0.3);
            c.sp = R(0.85, 1.2) / c.lane.dur;
          }
        });
      },
      draw(ctx) {
        ctx.globalCompositeOperation = 'lighter';
        cars.forEach((c) => {
          if (c.u < 0) return;
          const L = c.lane, p = at(L, c.u);
          if (!p) return;
          const yf = (p.y - rn.oy) / rn.dh;
          const q = Math.max(0, Math.min(1, (yf - L.minY) / Math.max(0.01, L.maxY - L.minY)));
          const s = (L.sizes[0] + (L.sizes[1] - L.sizes[0]) * q * q) * rn.k;
          const sep = s * 0.45;
          const fade = Math.min(1, c.u * 8, (1.05 - c.u) * 8);
          if (L.kind === 'head') {
            ctx.globalAlpha = 0.14 * fade;
            ctx.drawImage(wash, p.x - s * 1.6, p.y - s * 1.1, s * 3.2, s * 2.2);
          }
          const spr = L.kind === 'head' ? head : tail;
          ctx.globalAlpha = (L.kind === 'head' ? 0.75 : 0.65) * fade;
          ctx.drawImage(spr, p.x + p.nx * sep - s / 2, p.y + p.ny * sep - s / 2, s, s);
          ctx.drawImage(spr, p.x - p.nx * sep - s / 2, p.y - p.ny * sep - s / 2, s, s);
        });
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  }

  // Sun glitter on water: tiny brief flashes, either along the path of the sun or anywhere on open sea.
  function glitter(rn, opt, an) {
    const spr = glow(opt.color[0], opt.color[1], opt.color[2]);
    const items = [];
    for (let i = 0; i < opt.count; i++) {
      let fx, fy, depth;
      if (opt.mode === 'sunpath') {
        depth = Math.pow(Math.random(), 1.4);                 // 0 = horizon, 1 = near
        const spread = opt.spread[0] + (opt.spread[1] - opt.spread[0]) * depth;
        const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        fx = opt.cx + g * spread; fy = opt.top + (opt.bottom - opt.top) * depth;
      } else {
        if (!an.water || !an.water.length) break;
        const w = pick(an.water);
        fx = w.x; fy = w.y; depth = 0.5;
      }
      const p = rn.map(fx, fy);
      items.push({ x: p[0], y: p[1], s: (5 + 12 * depth) * rn.k * R(0.7, 1.3), ph: R(0, 6.28), sp: R(2, 6) });
    }
    return {
      draw(ctx, t) {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const f = Math.pow(Math.max(0, Math.sin(t * it.sp + it.ph)), 14);
          if (f < 0.03) continue;
          ctx.globalAlpha = f;
          ctx.drawImage(spr, it.x - it.s / 2, it.y - it.s / 4, it.s, it.s / 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    };
  }

  // Waves washing up the sand: a thin sheet of water with a foamy edge that runs up, then slides back.
  function swash(rn, opt) {
    const W = rn.W, N = 48;
    const y0 = rn.map(0, opt.y0)[1], y1 = rn.map(0, opt.y1)[1], band = y1 - y0;
    let waves = [R(0, 6), R(0, 6), R(0, 6)];
    let cycle = -1;
    const bubble = sprite(32, [[0, 'rgba(255,255,255,0.95)'], [0.45, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]);
    const M = Math.ceil(W / 4);
    let foam = [];
    const fk = Math.max(0.6, rn.k) * 1.6;
    const newFoam = () => {
      foam = [];
      for (let i = 0; i < M; i++) {
        foam.push({ x: (i + Math.random()) * W / M, dy: R(-0.06, 0.03), s: R(6, 18) * fk, a: R(0.4, 0.95) });
        if (Math.random() < 0.7) foam.push({ x: (i + Math.random()) * W / M, dy: R(-0.3, -0.06), s: R(4, 12) * fk, a: R(0.12, 0.45) });
      }
    };
    newFoam();
    const edge = (x, reach, t) => y0 + band * reach +
      band * 0.32 * (Math.sin(x / W * 5 + waves[0]) + 0.55 * Math.sin(x / W * 13 + waves[1]) + 0.3 * Math.sin(x / W * 29 + waves[2] + t * 0.3));
    return {
      draw(ctx, t) {
        const c = Math.floor(t / opt.period);
        if (c !== cycle) { cycle = c; waves = [R(0, 6), R(0, 6), R(0, 6)]; newFoam(); }
        const ph = (t % opt.period) / opt.period;
        let reach, a;
        if (ph < 0.35) { const q = ph / 0.35; reach = Math.sin(q * Math.PI / 2); a = 0.55; }
        else { const q = (ph - 0.35) / 0.65; reach = 1 - q * 0.9; a = 0.55 * (1 - q); }
        if (a < 0.02) return;
        // the thin water sheet
        ctx.beginPath();
        ctx.moveTo(0, y0 - band * 0.6);
        for (let i = 0; i <= N; i++) { const x = i * W / N; ctx.lineTo(x, edge(x, reach, t)); }
        ctx.lineTo(W, y0 - band * 0.6);
        ctx.closePath();
        const gr = ctx.createLinearGradient(0, y0 - band * 0.6, 0, y0 + band * reach);
        gr.addColorStop(0, 'rgba(225,215,200,0)');
        gr.addColorStop(1, 'rgba(235,228,215,' + (a * 0.35) + ')');
        ctx.fillStyle = gr;
        ctx.fill();
        // lacy foam along the leading edge, made of many small soft bubbles
        for (let i = 0; i < foam.length; i++) {
          const f = foam[i];
          const y = edge(f.x, reach, t) + f.dy * band;
          ctx.globalAlpha = a * f.a;
          ctx.drawImage(bubble, f.x - f.s / 2, y - f.s / 3, f.s, f.s * 0.66);
        }
        ctx.globalAlpha = 1;
      }
    };
  }

  // A breeze moving across the field: soft bands of light rolling over the flowers.
  function breeze(rn, opt) {
    const W = rn.W, H = rn.H, top = rn.map(0, opt.top)[1];
    return {
      draw(ctx, t) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, top, W, H - top); ctx.clip();
        [0, 0.45].forEach((off, i) => {
          const ph = ((t / opt.period) + off) % 1;
          const x = -W * 0.5 + ph * W * 2;
          const bw = W * (0.22 + 0.08 * i);
          ctx.setTransform(1, 0, -0.4, 1, (H - top) * 0.2, 0);
          ctx.globalCompositeOperation = 'lighter';
          let gr = ctx.createLinearGradient(x - bw, 0, x + bw, 0);
          gr.addColorStop(0, 'rgba(255,248,225,0)'); gr.addColorStop(0.5, 'rgba(255,248,225,' + (0.08 - i * 0.03) + ')'); gr.addColorStop(1, 'rgba(255,248,225,0)');
          ctx.fillStyle = gr; ctx.fillRect(x - bw, top, bw * 2, H - top);
          ctx.globalCompositeOperation = 'source-over';
          gr = ctx.createLinearGradient(x - bw * 2.2, 0, x - bw * 0.6, 0);
          gr.addColorStop(0, 'rgba(0,20,0,0)'); gr.addColorStop(0.6, 'rgba(0,20,0,' + (0.06 - i * 0.02) + ')'); gr.addColorStop(1, 'rgba(0,20,0,0)');
          ctx.fillStyle = gr; ctx.fillRect(x - bw * 2.2, top, bw * 1.6, H - top);
        });
        ctx.restore();
      }
    };
  }

  // Sunlit pollen and the odd petal carried on the breeze.
  function pollen(rn) {
    const W = rn.W, H = rn.H, kh = H / 768;
    const speck = sprite(32, [[0, 'rgba(255,250,215,1)'], [0.3, 'rgba(255,240,190,0.6)'], [1, 'rgba(255,235,180,0)']]);
    const petalSprites = [['#ff9fc0', '#e0346a'], ['#ff6b5a', '#c5121f'], ['#ffd0dd', '#f06292']].map((c) => {
      const s = C(48, 32), g = s.getContext('2d');
      const gr = g.createRadialGradient(20, 14, 2, 24, 16, 22);
      gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(4, 16); g.bezierCurveTo(10, 2, 36, 0, 45, 12); g.bezierCurveTo(40, 26, 14, 30, 4, 16); g.fill();
      return s;
    });
    const specks = [];
    for (let i = 0; i < 45; i++) specks.push({ x: R(0, W), y: R(H * 0.2, H), s: R(2, 5) * kh, ph: R(0, 6.28), f: R(0.2, 0.6), v: R(6, 16) * kh, a: R(0.3, 0.8) });
    const petals = [];
    const newPetal = (any) => ({ x: any ? R(0, W) : -30, y: R(H * 0.55, H * 0.95), s: R(16, 28) * kh, spr: pick(petalSprites), vx: R(35, 70) * kh, ph: R(0, 6.28), rot: R(0, 6), rs: R(-2, 2), ff: R(1.5, 3) });
    for (let i = 0; i < 5; i++) petals.push(newPetal(true));
    return {
      update(dt, t) {
        const wind = (0.6 + 0.4 * Math.sin(t * 0.12)) * 14 * kh;
        specks.forEach((p) => {
          p.x += (wind + Math.sin(t * p.f + p.ph) * 10 * kh) * dt;
          p.y += (Math.cos(t * p.f * 1.3 + p.ph) * 8 * kh - p.v * 0.3) * dt;
          if (p.x > W + 10) p.x = -10;
          if (p.y < H * 0.15) p.y = H + 5;
        });
        petals.forEach((p, i) => {
          p.x += p.vx * dt;
          p.y += Math.sin(t * 0.9 + p.ph) * 20 * kh * dt + 6 * kh * dt;
          p.rot += p.rs * dt;
          if (p.x > W + 40) petals[i] = newPetal(false);
        });
      },
      draw(ctx, t) {
        ctx.globalCompositeOperation = 'lighter';
        specks.forEach((p) => {
          ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t * 2 + p.ph));
          ctx.drawImage(speck, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
        });
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        petals.forEach((p) => {
          let sx = Math.cos(t * p.ff + p.ph);
          if (Math.abs(sx) < 0.15) sx = sx < 0 ? -0.15 : 0.15;
          const cs = Math.cos(p.rot), sn = Math.sin(p.rot);
          ctx.setTransform(cs * sx, sn * sx, -sn, cs, p.x, p.y);
          ctx.globalAlpha = 0.9;
          ctx.drawImage(p.spr, -p.s / 2, -p.s / 3, p.s, p.s * 0.66);
        });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
      }
    };
  }

  // Small boats crossing the bay, each pulling a white wake.
  function boats(rn, list) {
    const foam = sprite(64, [[0, 'rgba(255,255,255,0.8)'], [0.5, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]);
    const items = list.map((b) => {
      const a = rn.map(b.from[0], b.from[1]), e = rn.map(b.to[0], b.to[1]);
      return { a: a, dx: e[0] - a[0], dy: e[1] - a[1], ang: Math.atan2(e[1] - a[1], e[0] - a[0]), s: b.size * rn.k, dur: b.dur, u: R(0, 0.8) };
    });
    return {
      update(dt) {
        items.forEach((b) => { b.u += dt / b.dur; if (b.u > 1) b.u = -R(0.05, 0.25); });
      },
      draw(ctx, t) {
        items.forEach((b) => {
          if (b.u < 0) return;
          const x = b.a[0] + b.dx * b.u, y = b.a[1] + b.dy * b.u, s = b.s;
          const fade = Math.min(1, b.u * 10, (1 - b.u) * 10);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(b.ang);
          ctx.scale(1, 0.55);           // seen from above at an angle
          // wake: churned water behind and a spreading V
          ctx.globalAlpha = 0.55 * fade;
          ctx.drawImage(foam, -s * 4.5, -s * 0.28, s * 4.5, s * 0.56);
          const gr = ctx.createLinearGradient(0, 0, -s * 3.8, 0);
          gr.addColorStop(0, 'rgba(255,255,255,' + (0.45 * fade) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = gr; ctx.lineWidth = Math.max(1, s * 0.08);
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.moveTo(-s * 0.3, -s * 0.18); ctx.quadraticCurveTo(-s * 2, -s * 0.8, -s * 3.8, -s * 1.5);
          ctx.moveTo(-s * 0.3, s * 0.18); ctx.quadraticCurveTo(-s * 2, s * 0.8, -s * 3.8, s * 1.5);
          ctx.stroke();
          // hull
          ctx.globalAlpha = fade;
          ctx.fillStyle = 'rgba(0,30,40,0.25)';
          ctx.beginPath(); ctx.ellipse(-s * 0.02, s * 0.06, s * 0.52, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#f5f3ee';
          ctx.beginPath();
          ctx.moveTo(s * 0.5, 0);
          ctx.quadraticCurveTo(s * 0.15, s * 0.22, -s * 0.48, s * 0.16);
          ctx.lineTo(-s * 0.48, -s * 0.16);
          ctx.quadraticCurveTo(s * 0.15, -s * 0.22, s * 0.5, 0);
          ctx.fill();
          ctx.fillStyle = '#c9d2d8';
          ctx.fillRect(-s * 0.18, -s * 0.09, s * 0.24, s * 0.18);
          ctx.restore();
        });
        ctx.globalAlpha = 1;
      }
    };
  }

  // ==================================================================
  // Runner: shows a scene inside a container element.
  // ==================================================================
  function Runner(el) {
    this.el = el;
    el.innerHTML = '';
    el.classList.add('scene-host');
    this.move = div('scene-move', el);
    this.img = new Image();
    this.img.className = 'scene-img';
    this.img.alt = '';
    this.move.appendChild(this.img);
    this.fx = C(1, 1); this.fx.className = 'scene-fx'; this.move.appendChild(this.fx);
    this.wx = C(1, 1); this.wx.className = 'scene-fx'; el.appendChild(this.wx);
    this.fctx = this.fx.getContext('2d');
    this.wctx = this.wx.getContext('2d');
    this.running = false; this.ready = false; this.id = null; this.def = null;
    this.raf = 0; this.last = 0; this.t = 0;
    this._loop = this.loop.bind(this);
  }
  Runner.prototype.start = function (id) {
    this.stop();
    const def = byId(id) || SCENES[0], self = this;
    this.def = def; this.id = def.id; this.running = true; this.ready = false;
    if (this.img.getAttribute('src') !== def.src) {
      this.img.classList.remove('on');
      this.img.onload = function () { if (self.def === def && self.running) self.setup(); };
      this.img.src = def.src;
    } else if (this.img.complete && this.img.naturalWidth) {
      this.setup();
    }
    this.last = 0;
    this.raf = requestAnimationFrame(this._loop);
  };
  Runner.prototype.setup = function () {
    const def = this.def, img = this.img;
    const W = Math.max(1, this.el.clientWidth), H = Math.max(1, this.el.clientHeight);
    this.W = W; this.H = H;
    this.fx.width = this.wx.width = W;
    this.fx.height = this.wx.height = H;
    // where the photo sits on screen (object-fit: cover, positioned by the scene's focus point)
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const sc = Math.max(W / iw, H / ih);
    this.dw = iw * sc; this.dh = ih * sc;
    this.ox = (W - this.dw) * def.focus[0]; this.oy = (H - this.dh) * def.focus[1];
    this.k = this.dw / 2048;
    img.style.objectPosition = (def.focus[0] * 100) + '% ' + (def.focus[1] * 100) + '%';
    img.classList.add('on');
    const m = def.motion;
    if (m.type === 'zoom') {
      const o = this.map(m.origin[0], m.origin[1]);
      this.move.style.transformOrigin = o[0] + 'px ' + o[1] + 'px';
    } else {
      this.move.style.transformOrigin = '50% 50%';
    }
    const an = analyse(def, img);
    const attached = [], front = [];
    if (def.clouds) attached.push(clouds(this, def.clouds, an));
    if (def.breeze) attached.push(breeze(this, def.breeze));
    if (def.glitter) attached.push(glitter(this, def.glitter, an));
    if (def.swash) attached.push(swash(this, def.swash));
    if (def.boats) attached.push(boats(this, def.boats));
    if (def.sunlight) attached.push(sunlight(this, def.sunlight));
    if (def.smoke) attached.push(smoke(this, def.smoke));
    if (def.signs) attached.push(neon(this, def.signs));
    if (def.lights && an.lights.length) attached.push(twinkle(this, def, an));
    if (def.lanes) attached.push(traffic(this, def.lanes));
    if (def.snow) front.push(snow(this));
    if (def.leaves) front.push(leaves(this));
    if (def.pollen) front.push(pollen(this));
    if (def.birds) front.push(birds(this));
    this.attached = attached; this.front = front;
    // let falling things spread out before showing
    this.t = 0;
    for (let i = 0; i < 45; i++) { this.t += 1 / 30; this.step(1 / 30); }
    this.ready = true;
  };
  Runner.prototype.map = function (fx, fy) { return [this.ox + fx * this.dw, this.oy + fy * this.dh]; };
  Runner.prototype.step = function (dt) {
    const t = this.t;
    this.attached.forEach((e) => { if (e.update) e.update(dt, t); });
    this.front.forEach((e) => { if (e.update) e.update(dt, t); });
  };
  Runner.prototype.loop = function (now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._loop);
    if (!this.ready) return;
    if (this.last && now - this.last < 30) return;   // about 30 frames per second
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 30;
    this.last = now;
    this.t += dt;
    const t = this.t, m = this.def.motion;
    const p = (1 - Math.cos(2 * Math.PI * t / m.period)) / 2;
    if (m.type === 'zoom') this.move.style.transform = 'scale(' + (m.from + (m.to - m.from) * p).toFixed(4) + ')';
    else this.move.style.transform = 'translate3d(' + ((p - 0.5) * m.amp * this.W).toFixed(1) + 'px,0,0) scale(' + m.scale + ')';
    this.step(dt);
    this.fctx.clearRect(0, 0, this.W, this.H);
    this.attached.forEach((e) => e.draw(this.fctx, t));
    this.wctx.clearRect(0, 0, this.W, this.H);
    this.front.forEach((e) => e.draw(this.wctx, t));
  };
  Runner.prototype.stop = function () {
    this.running = false;
    this.ready = false;
    cancelAnimationFrame(this.raf);
  };
  Runner.prototype.resize = function () {
    if (this.running && this.id) this.start(this.id);
  };

  window.Scenes = {
    LIST: SCENES.map((s) => ({ id: s.id, name: s.name, src: s.src })),
    Runner: Runner
  };
})();
