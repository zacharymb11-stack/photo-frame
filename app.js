/* Photo Frame - runs entirely on the iPad.
   Photos are imported from the iPad's photo library, shrunk, and stored in the
   browser's on-device database (IndexedDB). Nothing is uploaded anywhere.
   Written for iOS 12+ Safari: no optional chaining (?.) or ?? operators. */
(function () {
  'use strict';

  const FULL_MAX = 2048;     // longest side of stored photos (iPad retina screen size)
  const FULL_QUALITY = 0.82;
  const THUMB_MAX = 480;
  const THUMB_QUALITY = 0.72;
  const GRID_PAGE = 60;      // thumbnails shown at a time in the album editor
  const STORE_KEY = 'photoframe.settings.v2';
  const RESUME_KEY = 'photoframe.resume';
  const BACKUP_MAGIC = 'PFRAME01';
  const BACKUP_LIMIT = 350 * 1048576;   // bigger than this risks running out of memory on an old iPad
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const CLOCK_BGS = {
    black: '#000',
    midnight: 'linear-gradient(160deg, #0b1026, #1c2a5a)',
    sunset: 'linear-gradient(160deg, #2b1055, #7b3f7a 55%, #d76d77)',
    ocean: 'linear-gradient(160deg, #0f2027, #203a43, #2c5364)',
    forest: 'linear-gradient(160deg, #08160f, #1f4030)',
    ember: 'linear-gradient(160deg, #1a0f0b, #3d2216)'
  };
  const COLORS = ['#ffffff', '#ffe8c7', '#ffb347', '#ff5a5a', '#ff7ad9', '#b18cff', '#6ec6ff', '#5ff6e8', '#7dff9b', '#9aa0a6'];

  const $ = (id) => document.getElementById(id);
  const each = (list, fn) => Array.prototype.forEach.call(list, fn);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function div(cls, parent) {
    const e = document.createElement('div');
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  const isLandscape = () => window.innerWidth > window.innerHeight;

  // ====================================================================
  // Database
  // ====================================================================
  let dbPromise = null;
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('photoframe', 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          d.createObjectStore('albums', { keyPath: 'id' });
          d.createObjectStore('photos', { keyPath: 'id' });   // metadata only
          d.createObjectStore('full');                         // id -> ArrayBuffer (JPEG)
          d.createObjectStore('thumbs');                       // id -> ArrayBuffer (JPEG)
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  // Runs fn(transaction) and resolves with whatever fn returned once the transaction commits.
  function tx(stores, mode, fn) {
    return openDb().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(stores, mode);
      let result;
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaction aborted'));
      result = fn(t);
    }));
  }
  function readAll(store) {
    return tx([store], 'readonly', (t) => {
      const out = [];
      t.objectStore(store).openCursor().onsuccess = (e) => {
        const c = e.target.result;
        if (c) { out.push(c.value); c.continue(); }
      };
      return out;
    });
  }
  function readOne(store, key) {
    return tx([store], 'readonly', (t) => {
      const box = {};
      t.objectStore(store).get(key).onsuccess = (e) => { box.value = e.target.result; };
      return box;
    }).then((box) => box.value);
  }
  function putPhoto(meta, full, thumb) {
    return tx(['photos', 'full', 'thumbs'], 'readwrite', (t) => {
      t.objectStore('photos').put(meta);
      t.objectStore('full').put(full, meta.id);
      t.objectStore('thumbs').put(thumb, meta.id);
    });
  }
  const isQuotaError = (e) => e && (e.name === 'QuotaExceededError' || /quota|space/i.test(String(e.message)));

  // ====================================================================
  // State
  // ====================================================================
  let albums = [];   // {id, name, created}
  let photos = [];   // {id, albumId, added, bytes, w, h, taken}

  const settings = {
    tab: 'photos', selected: [], interval: 10, shuffle: true, fit: 'contain', clock: false,
    style: 'plain', pairs: false, onThisDay: false,
    scene: 'village', sceneClock: false,
    clockStyle: 'digital', clockSize: 'm', clockFont: 'modern', clockColor: '#ffffff', clockBg: 'black',
    clock24: false, clockSeconds: false, clockDate: true,
    autostart: false, lastScreen: 'photos'
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved) Object.keys(saved).forEach((k) => { settings[k] = saved[k]; });
  } catch (e) {}
  // The drawn scenes were replaced by photo scenes; carry old choices over.
  const OLD_SCENES = { fireplace: 'village', woods: 'road' };
  if (OLD_SCENES[settings.scene]) settings.scene = OLD_SCENES[settings.scene];
  if (settings.clockBg.indexOf('scene:') === 0 && OLD_SCENES[settings.clockBg.slice(6)]) settings.clockBg = 'scene:' + OLD_SCENES[settings.clockBg.slice(6)];
  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  function photosOf(albumId) {
    return photos.filter((p) => p.albumId === albumId).sort((a, b) => a.added - b.added);
  }
  function albumById(id) { return albums.find((a) => a.id === id); }
  function selectedAlbums() { return albums.filter((a) => settings.selected.indexOf(a.id) >= 0); }
  function sceneName(id) {
    const s = Scenes.LIST.find((x) => x.id === id);
    return s ? s.name : '';
  }

  // Thumbnail object URLs, created on demand and reused.
  const thumbUrls = {};
  function thumbUrl(photoId) {
    if (thumbUrls[photoId]) return Promise.resolve(thumbUrls[photoId]);
    return readOne('thumbs', photoId).then((buf) => {
      if (!buf) return '';
      thumbUrls[photoId] = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }));
      return thumbUrls[photoId];
    });
  }
  function forgetThumb(photoId) {
    if (thumbUrls[photoId]) { URL.revokeObjectURL(thumbUrls[photoId]); delete thumbUrls[photoId]; }
  }

  // ====================================================================
  // Reading photo files
  // ====================================================================
  let browserAutoRotates = null;  // newer iOS rotates photos itself; older iOS needs us to

  function readAsArrayBuffer(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(blob);
    });
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = url;
    });
  }

  // Reads the camera's rotation flag and the date the photo was taken from a JPEG's EXIF data.
  function parseExif(buf) {
    const res = { orientation: 1, taken: null };
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return res;
    let off = 2;
    while (off + 4 <= v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
      const len = v.getUint16(off + 2);
      if (marker === 0xFFE1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) {
        readTiff(v, off + 10, res);
        return res;
      }
      off += 2 + len;
    }
    return res;
  }
  function readTiff(v, tiff, res) {
    if (tiff + 8 > v.byteLength) return;
    const le = v.getUint16(tiff) === 0x4949;
    const eachTag = (ifdOff, cb) => {
      const p = tiff + ifdOff;
      if (p + 2 > v.byteLength) return;
      const n = v.getUint16(p, le);
      for (let i = 0; i < n; i++) {
        const e = p + 2 + i * 12;
        if (e + 12 > v.byteLength) return;
        cb(v.getUint16(e, le), e);
      }
    };
    const ascii = (e) => {
      const count = v.getUint32(e + 4, le);
      const at = count > 4 ? tiff + v.getUint32(e + 8, le) : e + 8;
      let s = '';
      for (let i = 0; i < count && at + i < v.byteLength; i++) {
        const c = v.getUint8(at + i);
        if (!c) break;
        s += String.fromCharCode(c);
      }
      return s;
    };
    let exifIfd = 0, dateMain = null, dateOriginal = null, dateDigitized = null;
    eachTag(v.getUint32(tiff + 4, le), (tag, e) => {
      if (tag === 0x0112) { const o = v.getUint16(e + 8, le); if (o >= 1 && o <= 8) res.orientation = o; }
      else if (tag === 0x8769) exifIfd = v.getUint32(e + 8, le);
      else if (tag === 0x0132) dateMain = ascii(e);
    });
    if (exifIfd) eachTag(exifIfd, (tag, e) => {
      if (tag === 0x9003) dateOriginal = ascii(e);
      else if (tag === 0x9004) dateDigitized = ascii(e);
    });
    res.taken = parseExifDate(dateOriginal) || parseExifDate(dateDigitized) || parseExifDate(dateMain);
  }
  function parseExifDate(s) {
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(s || '');
    if (!m || +m[1] < 1900) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  }

  // Builds a JPEG with an EXIF orientation tag inserted (used to test the browser).
  function withOrientation(jpegBuf, orientation) {
    const app1 = new Uint8Array([
      0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08,
      0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ]);
    const src = new Uint8Array(jpegBuf);
    const out = new Uint8Array(src.length + app1.length);
    out.set(src.subarray(0, 2), 0);
    out.set(app1, 2);
    out.set(src.subarray(2), 2 + app1.length);
    return out.buffer;
  }

  function canvasToArrayBuffer(canvas, quality) {
    return new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('Could not encode image')); return; }
          readAsArrayBuffer(blob).then(resolve, reject);
        }, 'image/jpeg', quality);
      } else {
        const bin = atob(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve(arr.buffer);
      }
    });
  }

  function detectAutoRotate() {
    if (browserAutoRotates !== null) return Promise.resolve(browserAutoRotates);
    const c = document.createElement('canvas');
    c.width = 2; c.height = 1;
    c.getContext('2d').fillRect(0, 0, 2, 1);
    return canvasToArrayBuffer(c, 0.9)
      .then((buf) => {
        const url = URL.createObjectURL(new Blob([withOrientation(buf, 6)], { type: 'image/jpeg' }));
        return loadImage(url).then((img) => {
          URL.revokeObjectURL(url);
          return img.naturalWidth === 1;  // rotated by the browser -> 1x2
        });
      })
      .catch(() => false)
      .then((auto) => { browserAutoRotates = auto; return auto; });
  }

  const workCanvas = document.createElement('canvas');
  function renderJpeg(img, orientation, max, quality) {
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    const scale = Math.min(1, max / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const swap = orientation >= 5;
    workCanvas.width = swap ? h : w;
    workCanvas.height = swap ? w : h;
    const ctx = workCanvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, workCanvas.width, workCanvas.height);
    switch (orientation) {
      case 2: ctx.setTransform(-1, 0, 0, 1, w, 0); break;
      case 3: ctx.setTransform(-1, 0, 0, -1, w, h); break;
      case 4: ctx.setTransform(1, 0, 0, -1, 0, h); break;
      case 5: ctx.setTransform(0, 1, 1, 0, 0, 0); break;
      case 6: ctx.setTransform(0, 1, -1, 0, h, 0); break;
      case 7: ctx.setTransform(0, -1, -1, 0, h, w); break;
      case 8: ctx.setTransform(0, -1, 1, 0, 0, w); break;
      default: break;
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return canvasToArrayBuffer(workCanvas, quality);
  }

  async function processFile(file) {
    const exif = parseExif(await readAsArrayBuffer(file.slice(0, 256 * 1024)));
    const orientation = (await detectAutoRotate()) ? 1 : exif.orientation;
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const full = await renderJpeg(img, orientation, FULL_MAX, FULL_QUALITY);
      const w = workCanvas.width, h = workCanvas.height;
      const thumb = await renderJpeg(img, orientation, THUMB_MAX, THUMB_QUALITY);
      return { full: full, thumb: thumb, w: w, h: h, taken: exif.taken };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  let importing = false;
  async function importFiles(albumId, files) {
    if (importing || !files.length) return;
    importing = true;
    $('addPhotos').disabled = true;
    $('progress').className = 'progress';
    let done = 0, failed = 0, stoppedForSpace = false;
    const total = files.length;
    const update = () => {
      $('progressFill').style.width = Math.round((done + failed) / total * 100) + '%';
      $('progressText').textContent = 'Adding photo ' + Math.min(done + failed + 1, total) + ' of ' + total +
        (failed ? ' (' + failed + ' could not be read)' : '') + ' — keep this screen open';
    };
    update();
    for (let i = 0; i < files.length; i++) {
      try {
        const r = await processFile(files[i]);
        const meta = { id: newId(), albumId: albumId, added: Date.now() + i / 1000, bytes: r.full.byteLength + r.thumb.byteLength, w: r.w, h: r.h, taken: r.taken };
        await putPhoto(meta, r.full, r.thumb);
        photos.push(meta);
        done++;
        if (currentAlbumId === albumId && (done <= 6 || done % 10 === 0)) renderAlbumView();
      } catch (e) {
        if (isQuotaError(e)) { stoppedForSpace = true; break; }
        failed++;
      }
      update();
    }
    workCanvas.width = workCanvas.height = 1;  // release canvas memory
    importing = false;
    $('addPhotos').disabled = false;
    $('progress').className = 'progress hidden';
    if (currentAlbumId === albumId) renderAlbumView();
    updateStorage();
    let msg = '';
    if (stoppedForSpace) msg = 'The iPad ran out of space for the photo frame after ' + plural(done, 'photo') + '. Free up space on the iPad, or remove some photos, then try again.';
    else if (failed) msg = 'Added ' + plural(done, 'photo') + '. ' + plural(failed, 'photo') + ' could not be read and were skipped.';
    if (msg) alert(msg);
  }

  // Older photos (added before sizes were recorded): read their size from the thumbnail.
  async function fillMissingSizes() {
    for (const p of photos.slice()) {
      if (p.w) continue;
      try {
        const img = await loadImage(await thumbUrl(p.id));
        p.w = img.naturalWidth; p.h = img.naturalHeight;
        await tx(['photos'], 'readwrite', (t) => { t.objectStore('photos').put(p); });
      } catch (e) {}
    }
  }

  // ====================================================================
  // Pop-up dialog
  // ====================================================================
  function overlay(opts) {
    $('overlay').className = 'overlay';
    $('ovTitle').textContent = opts.title || '';
    $('ovText').textContent = opts.text || '';
    $('ovProgress').className = opts.progress === undefined ? 'bar hidden' : 'bar';
    if (opts.progress !== undefined) $('ovFill').style.width = Math.round(opts.progress * 100) + '%';
    const box = $('ovButtons');
    box.innerHTML = '';
    (opts.buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label;
      if (b.primary) btn.className = 'primary';
      btn.addEventListener('click', () => { closeOverlay(); if (b.onClick) b.onClick(); });
      box.appendChild(btn);
    });
  }
  function overlayProgress(frac, text) {
    $('ovFill').style.width = Math.round(frac * 100) + '%';
    if (text) $('ovText').textContent = text;
  }
  function closeOverlay() { $('overlay').className = 'overlay hidden'; }

  // ====================================================================
  // Backup and restore
  // ====================================================================
  // File layout: "PFRAME01" + 4-byte header length + JSON header + each photo's full JPEG then thumbnail.
  function canSaveFiles() {
    return ('download' in document.createElement('a')) || !!navigator.canShare;
  }
  function saveBlob(blob, name) {
    try {
      const file = new File([blob], name, { type: 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: name }).catch(() => {});
        return;
      }
    } catch (e) {}
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  async function prepareBackup(albumIds) {
    const list = albums.filter((a) => albumIds.indexOf(a.id) >= 0);
    const ps = photos.filter((p) => albumIds.indexOf(p.albumId) >= 0).sort((a, b) => a.added - b.added);
    if (!list.length) { alert('There are no albums to back up yet.'); return; }
    if (!canSaveFiles()) { alert('Saving backup files needs iOS 13 or newer on this iPad.'); return; }
    let total = 0;
    ps.forEach((p) => { total += p.bytes || 0; });
    if (total > BACKUP_LIMIT) {
      alert('That’s ' + Math.round(total / 1048576) + ' MB, which is too much for this iPad to save in one go. Back up your albums one at a time instead: open an album’s Edit page and tap “Back up”.');
      return;
    }
    overlay({ title: 'Preparing backup', text: 'Getting your photos ready…', progress: 0 });
    try {
      const parts = [], meta = [];
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const full = await readOne('full', p.id), thumb = await readOne('thumbs', p.id);
        if (full && thumb) {
          parts.push(full, thumb);
          meta.push({ id: p.id, albumId: p.albumId, added: p.added, taken: p.taken || null, w: p.w || 0, h: p.h || 0, fullLen: full.byteLength, thumbLen: thumb.byteLength });
        }
        overlayProgress((i + 1) / ps.length, 'Getting photo ' + (i + 1) + ' of ' + ps.length + ' ready…');
      }
      const header = new TextEncoder().encode(JSON.stringify({ app: 'photoframe', version: 1, created: Date.now(), albums: list, photos: meta }));
      const len = new ArrayBuffer(4);
      new DataView(len).setUint32(0, header.length);
      const blob = new Blob([BACKUP_MAGIC, len, header].concat(parts), { type: 'application/octet-stream' });
      const d = new Date();
      const stamp = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      const label = list.length === 1 ? list[0].name.replace(/[\\/:*?"<>|]/g, '') : 'all albums';
      const name = 'Photo Frame backup - ' + label + ' - ' + stamp + '.photoframe';
      overlay({
        title: 'Backup ready',
        text: plural(list.length, 'album') + ', ' + plural(meta.length, 'photo') + ' (' + Math.max(1, Math.round(blob.size / 1048576)) + ' MB). Tap Save, then choose “Save to Files” and pick a place such as iCloud Drive.',
        buttons: [{ label: 'Cancel' }, { label: 'Save backup', primary: true, onClick: () => saveBlob(blob, name) }]
      });
    } catch (e) {
      overlay({ title: 'Backup failed', text: String(e && e.message || e), buttons: [{ label: 'OK', primary: true }] });
    }
  }

  async function restoreBackup(file) {
    overlay({ title: 'Restoring backup', text: 'Reading the backup file…', progress: 0 });
    let added = 0, skipped = 0, newAlbums = 0;
    try {
      const head = new Uint8Array(await readAsArrayBuffer(file.slice(0, 12)));
      let magic = '';
      for (let i = 0; i < 8 && i < head.length; i++) magic += String.fromCharCode(head[i]);
      if (magic !== BACKUP_MAGIC) throw new Error('This isn’t a Photo Frame backup file.');
      const hlen = new DataView(head.buffer).getUint32(8);
      const header = JSON.parse(new TextDecoder().decode(await readAsArrayBuffer(file.slice(12, 12 + hlen))));
      for (const a of header.albums || []) {
        if (albumById(a.id)) continue;
        const al = { id: a.id, name: a.name, created: a.created || Date.now() };
        await tx(['albums'], 'readwrite', (t) => { t.objectStore('albums').put(al); });
        albums.push(al);
        settings.selected.push(al.id);
        newAlbums++;
      }
      albums.sort((a, b) => a.created - b.created);
      saveSettings();
      const have = {};
      photos.forEach((p) => { have[p.id] = true; });
      const list = header.photos || [];
      let off = 12 + hlen;
      for (let i = 0; i < list.length; i++) {
        const p = list[i], start = off;
        off += p.fullLen + p.thumbLen;
        if (have[p.id]) { skipped++; continue; }
        const full = await readAsArrayBuffer(file.slice(start, start + p.fullLen));
        const thumb = await readAsArrayBuffer(file.slice(start + p.fullLen, off));
        const meta = { id: p.id, albumId: p.albumId, added: p.added, bytes: full.byteLength + thumb.byteLength, w: p.w || 0, h: p.h || 0, taken: p.taken || null };
        await putPhoto(meta, full, thumb);
        photos.push(meta);
        added++;
        overlayProgress((i + 1) / list.length, 'Restoring photo ' + (i + 1) + ' of ' + list.length + '…');
      }
      renderHome();
      overlay({
        title: 'Restore complete',
        text: 'Added ' + plural(newAlbums, 'album') + ' and ' + plural(added, 'photo') + (skipped ? ' (' + skipped + ' were already here).' : '.'),
        buttons: [{ label: 'Done', primary: true }]
      });
    } catch (e) {
      renderHome();
      const msg = isQuotaError(e)
        ? 'The iPad ran out of space after restoring ' + plural(added, 'photo') + '. Free up some space and restore again; photos already restored will be skipped.'
        : String(e && e.message || e);
      overlay({ title: 'Restore stopped', text: msg, buttons: [{ label: 'OK', primary: true }] });
    }
  }

  // ====================================================================
  // Dashboard
  // ====================================================================
  function showPage(name) {
    $('home').className = name === 'home' ? 'page' : 'page hidden';
    $('albumView').className = name === 'album' ? 'page' : 'page hidden';
    window.scrollTo(0, 0);
  }

  function renderHome() {
    const grid = $('albums');
    grid.innerHTML = '';
    albums.forEach((album) => grid.appendChild(makeAlbumTile(album)));
    grid.appendChild(makeNewTile());
    showTab();
    updateStorage();
  }

  function showTab() {
    const tab = settings.tab;
    each(document.querySelectorAll('.tab'), (b) => { b.className = 'tab' + (b.getAttribute('data-tab') === tab ? ' on' : ''); });
    ['photos', 'scenes', 'clock'].forEach((t) => { $('tab-' + t).className = t === tab ? '' : 'hidden'; });
    if (tab !== 'clock') stopPreview();
    if (tab === 'scenes') renderSceneCards();
    if (tab === 'clock' && $('home').className === 'page') renderPreview();
    updatePlayButton();
  }
  each(document.querySelectorAll('.tab'), (b) => {
    b.addEventListener('click', () => { settings.tab = b.getAttribute('data-tab'); saveSettings(); showTab(); });
  });

  function makeAlbumTile(album) {
    const list = photosOf(album.id);
    const tile = div('tile' + (settings.selected.indexOf(album.id) >= 0 ? ' selected' : ''));
    tile.innerHTML =
      '<div class="tile-in"><div class="tile-label"><div class="tile-name"></div><div class="tile-count"></div></div>' +
      '<div class="check">&#10003;</div><button type="button" class="edit-btn">Edit</button></div>';
    const inner = tile.querySelector('.tile-in');
    tile.querySelector('.tile-name').textContent = album.name;
    tile.querySelector('.tile-count').textContent = plural(list.length, 'photo');
    if (list.length) {
      thumbUrl(list[0].id).then((u) => { if (u) inner.style.backgroundImage = 'url("' + u + '")'; });
    }
    tile.querySelector('.edit-btn').addEventListener('click', (e) => { e.stopPropagation(); openAlbum(album.id); });
    tile.addEventListener('click', () => {
      const idx = settings.selected.indexOf(album.id);
      if (idx >= 0) settings.selected.splice(idx, 1); else settings.selected.push(album.id);
      tile.className = 'tile' + (idx >= 0 ? '' : ' selected');
      saveSettings(); updatePlayButton();
    });
    return tile;
  }

  function makeNewTile() {
    const tile = div('tile new');
    tile.innerHTML = '<div class="tile-in"><div class="new-label"><div class="plus">+</div><div>New album</div></div></div>';
    tile.addEventListener('click', createAlbum);
    return tile;
  }

  async function createAlbum() {
    const name = (prompt('Name for the new album:', '') || '').trim();
    if (!name) return;
    const album = { id: newId(), name: name, created: Date.now() };
    await tx(['albums'], 'readwrite', (t) => { t.objectStore('albums').put(album); });
    albums.push(album);
    settings.selected.push(album.id);
    saveSettings();
    openAlbum(album.id);
  }

  function updatePlayButton() {
    const btn = $('play');
    if (settings.tab === 'scenes') {
      btn.disabled = false;
      btn.innerHTML = '&#9654;&nbsp; Start ' + sceneName(settings.scene);
      return;
    }
    if (settings.tab === 'clock') {
      btn.disabled = false;
      btn.innerHTML = '&#9654;&nbsp; Start clock';
      return;
    }
    const chosen = selectedAlbums();
    let count = 0;
    chosen.forEach((a) => { count += photosOf(a.id).length; });
    btn.disabled = count === 0;
    btn.innerHTML = count === 0
      ? (albums.length ? 'Pick albums to play' : 'Tap “New album” to get started')
      : '&#9654;&nbsp; Play ' + plural(chosen.length, 'album') + ' &middot; ' + plural(count, 'photo');
  }

  function updateStorage() {
    let bytes = 0;
    photos.forEach((p) => { bytes += p.bytes || 0; });
    $('storage').textContent = 'Stored on this iPad: ' + plural(photos.length, 'photo') + ', ' +
      (bytes / 1048576).toFixed(bytes > 104857600 ? 0 : 1) + ' MB. Photos never leave this iPad unless you save a backup.';
  }

  $('selAll').addEventListener('click', () => {
    settings.selected = albums.map((a) => a.id); saveSettings(); renderHome();
  });
  $('selNone').addEventListener('click', () => {
    settings.selected = []; saveSettings(); renderHome();
  });
  $('play').addEventListener('click', () => {
    if (settings.tab === 'scenes') startStage('scene');
    else if (settings.tab === 'clock') startStage('clock');
    else startShow();
  });
  $('backupAll').addEventListener('click', () => prepareBackup(albums.map((a) => a.id)));
  $('restoreBtn').addEventListener('click', () => $('restoreInput').click());
  $('restoreInput').addEventListener('change', () => {
    const f = $('restoreInput').files && $('restoreInput').files[0];
    $('restoreInput').value = '';
    if (f) restoreBackup(f);
  });

  // Font and colour buttons for the clock
  Object.keys(ClockFace.FONTS).forEach((key) => {
    const f = ClockFace.FONTS[key];
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('data-v', key); b.textContent = f.name;
    b.style.fontFamily = f.stack; b.style.fontWeight = f.weight;
    document.querySelector('.seg.fonts').appendChild(b);
  });
  COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('data-v', c); b.style.background = c; b.setAttribute('aria-label', c);
    document.querySelector('.seg.swatches').appendChild(b);
  });

  // segmented setting buttons
  const segs = document.querySelectorAll('.seg');
  function refreshSegs() {
    each(segs, (seg) => {
      const key = seg.getAttribute('data-key');
      each(seg.querySelectorAll('button'), (b) => {
        if (String(settings[key]) === b.getAttribute('data-v')) b.classList.add('on'); else b.classList.remove('on');
      });
    });
  }
  each(segs, (seg) => {
    const key = seg.getAttribute('data-key');
    each(seg.querySelectorAll('button'), (b) => {
      b.addEventListener('click', () => {
        const v = b.getAttribute('data-v');
        settings[key] = v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? parseInt(v, 10) : v;
        saveSettings(); refreshSegs();
        if (key.indexOf('clock') === 0 && key !== 'clock') renderPreview();
      });
    });
  });

  // ---------- Scenes tab ----------
  function renderSceneCards() {
    const grid = $('sceneGrid');
    if (!grid.children.length) {
      Scenes.LIST.forEach((s) => {
        const card = div('tile scene-tile');
        card.setAttribute('data-scene', s.id);
        card.innerHTML = '<div class="tile-in"><div class="tile-label"><div class="tile-name"></div></div><div class="check">&#10003;</div></div>';
        card.querySelector('.tile-name').textContent = s.name;
        card.querySelector('.tile-in').style.backgroundImage = 'url("' + s.src + '")';
        card.addEventListener('click', () => { settings.scene = s.id; saveSettings(); markSceneCards(); updatePlayButton(); });
        grid.appendChild(card);
      });
    }
    markSceneCards();
  }
  function markSceneCards() {
    each(document.querySelectorAll('.scene-tile'), (c) => {
      c.className = 'tile scene-tile' + (c.getAttribute('data-scene') === settings.scene ? ' selected' : '');
    });
  }

  // ---------- Clock tab ----------
  const previewFace = new ClockFace($('clockPreview'));
  const previewRunner = new Scenes.Runner($('previewScene'));
  function clockOpts() {
    return {
      style: settings.clockStyle, size: settings.clockSize, font: settings.clockFont, color: settings.clockColor,
      h24: settings.clock24, seconds: settings.clockSeconds, date: settings.clockDate
    };
  }
  function applyClockBg(box, runner) {
    const bg = settings.clockBg;
    if (bg.indexOf('scene:') === 0) {
      box.style.background = '#000';
      runner.el.style.display = 'block';
      if (!runner.running || runner.id !== bg.slice(6)) runner.start(bg.slice(6));
    } else {
      runner.stop();
      runner.el.style.display = 'none';
      box.style.background = CLOCK_BGS[bg] || '#000';
    }
  }
  function renderPreview() {
    if (settings.tab !== 'clock' || $('home').className !== 'page') return;
    applyClockBg($('clockPreviewBox'), previewRunner);
    previewFace.render(clockOpts());
  }
  function stopPreview() { previewRunner.stop(); previewFace.stop(); }

  // ====================================================================
  // Album editor
  // ====================================================================
  let currentAlbumId = null, gridLimit = GRID_PAGE, selecting = false, picked = {};

  function openAlbum(id) {
    currentAlbumId = id;
    gridLimit = GRID_PAGE;
    stopPreview();
    setSelecting(false);
    showPage('album');
    renderAlbumView();
  }

  function renderAlbumView() {
    const album = albumById(currentAlbumId);
    if (!album) return;
    const list = photosOf(album.id);
    const dated = list.filter((p) => p.taken).length;
    $('albumTitle').textContent = album.name;
    $('albumCount').textContent = plural(list.length, 'photo') + (list.length ? ' · ' + dated + ' with the date taken' : '');
    $('albumEmpty').className = list.length || importing ? 'empty hidden' : 'empty';
    const grid = $('photoGrid');
    grid.innerHTML = '';
    list.slice(0, gridLimit).forEach((p) => {
      const cell = div('thumb' + (picked[p.id] ? ' selected' : ''), grid);
      cell.innerHTML = '<div class="thumb-in"></div><div class="check">&#10003;</div>';
      const inner = cell.firstChild;
      thumbUrl(p.id).then((u) => { if (u) inner.style.backgroundImage = 'url("' + u + '")'; });
      cell.addEventListener('click', () => {
        if (!selecting) return;
        if (picked[p.id]) delete picked[p.id]; else picked[p.id] = true;
        cell.className = 'thumb' + (picked[p.id] ? ' selected' : '');
        updateDeleteButton();
      });
    });
    $('showMore').className = list.length > gridLimit ? 'show-more' : 'show-more hidden';
    $('showMore').textContent = 'Show more (' + (list.length - gridLimit) + ' more)';
  }

  function setSelecting(on) {
    selecting = on;
    picked = {};
    $('photoGrid').className = 'photo-grid' + (on ? ' selecting' : '');
    $('selectMode').textContent = on ? 'Cancel' : 'Select';
    each(document.querySelectorAll('.thumb.selected'), (el) => { el.className = 'thumb'; });
    updateDeleteButton();
  }
  function updateDeleteButton() {
    const n = Object.keys(picked).length;
    $('deleteSelected').className = selecting && n ? 'danger solid' : 'danger hidden';
    $('deleteSelected').textContent = 'Delete ' + plural(n, 'photo');
  }

  async function deletePhotos(ids) {
    await tx(['photos', 'full', 'thumbs'], 'readwrite', (t) => {
      ids.forEach((id) => {
        t.objectStore('photos').delete(id);
        t.objectStore('full').delete(id);
        t.objectStore('thumbs').delete(id);
      });
    });
    const gone = {};
    ids.forEach((id) => { gone[id] = true; forgetThumb(id); });
    photos = photos.filter((p) => !gone[p.id]);
  }

  $('back').addEventListener('click', () => { currentAlbumId = null; showPage('home'); renderHome(); });
  $('addPhotos').addEventListener('click', () => { $('fileInput').click(); });
  $('fileInput').addEventListener('change', () => {
    const files = Array.prototype.slice.call($('fileInput').files || []);
    $('fileInput').value = '';
    if (files.length) importFiles(currentAlbumId, files);
  });
  $('selectMode').addEventListener('click', () => setSelecting(!selecting));
  $('deleteSelected').addEventListener('click', async () => {
    const ids = Object.keys(picked);
    if (!ids.length || !confirm('Delete ' + plural(ids.length, 'photo') + ' from this album? (Your iPad’s Photos app is not affected.)')) return;
    await deletePhotos(ids);
    setSelecting(false);
    renderAlbumView();
    updateStorage();
  });
  $('showMore').addEventListener('click', () => { gridLimit += GRID_PAGE; renderAlbumView(); });
  $('backupAlbum').addEventListener('click', () => { if (currentAlbumId) prepareBackup([currentAlbumId]); });
  $('renameAlbum').addEventListener('click', async () => {
    const album = albumById(currentAlbumId);
    const name = (prompt('Rename album:', album.name) || '').trim();
    if (!name || name === album.name) return;
    album.name = name;
    await tx(['albums'], 'readwrite', (t) => { t.objectStore('albums').put(album); });
    renderAlbumView();
  });
  $('deleteAlbum').addEventListener('click', async () => {
    if (importing) { alert('Please wait until the photos finish adding.'); return; }
    const album = albumById(currentAlbumId);
    const list = photosOf(album.id);
    if (!confirm('Delete the album “' + album.name + '” and its ' + plural(list.length, 'photo') + ' from the photo frame? (Your iPad’s Photos app is not affected.)')) return;
    await deletePhotos(list.map((p) => p.id));
    await tx(['albums'], 'readwrite', (t) => { t.objectStore('albums').delete(album.id); });
    albums = albums.filter((a) => a.id !== album.id);
    settings.selected = settings.selected.filter((id) => id !== album.id);
    saveSettings();
    currentAlbumId = null;
    showPage('home');
    renderHome();
  });

  // ====================================================================
  // Photo slideshow
  // ====================================================================
  const show = $('show'), slideA = $('slideA'), slideB = $('slideB'), controls = $('controls'), collageEl = $('collage');
  const layerData = new Map();   // slide layer -> {urls, items, dims}
  let playlist = [], slotStart = 0, slotLen = 1, history = [], active = slideA;
  let timer = null, cleanupTimer = null, controlsTimer = null, clockTimer = null;
  let paused = false, loadSeq = 0, fails = 0, prefetch = null, wakeLock = null;
  let collageMode = false, tiles = [], collageCursor = 0, lastTile = -1;

  function makeItem(p, albumName) { return { id: p.id, album: albumName, w: p.w || 0, h: p.h || 0 }; }
  const isPortrait = (it) => it.w > 0 && it.h > it.w * 1.05;

  // Photos taken on today's date in past years (or within 3 days of it if there are none on the day).
  function onThisDayItems() {
    const now = new Date(), y = now.getFullYear();
    const today = new Date(y, now.getMonth(), now.getDate()).getTime();
    const exact = [], week = [];
    photos.forEach((p) => {
      if (!p.taken) return;
      const d = new Date(p.taken);
      if (d.getFullYear() >= y) return;
      const diff = Math.round(Math.abs(new Date(y, d.getMonth(), d.getDate()).getTime() - today) / 86400000);
      if (diff > 3) return;
      const a = albumById(p.albumId);
      const years = y - d.getFullYear();
      const it = makeItem(p, a ? a.name : '');
      it.otdLabel = (diff === 0 ? 'On this day' : 'This week') + ' · ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' · ' + plural(years, 'year') + ' ago';
      (diff === 0 ? exact : week).push(it);
    });
    return shuffle(exact.length ? exact : week);
  }

  function buildPlaylist() {
    const list = [];
    selectedAlbums().forEach((a) => photosOf(a.id).forEach((p) => list.push(makeItem(p, a.name))));
    if (settings.shuffle) shuffle(list);
    if (!settings.onThisDay) return list;
    const otd = onThisDayItems();
    if (!otd.length) return list;
    const ids = {};
    otd.forEach((o) => { ids[o.id] = true; });
    const rest = list.filter((x) => !ids[x.id]);
    if (!rest.length) return otd;
    // every 4th photo is an "On this day" photo
    const out = [];
    let k = 0;
    rest.forEach((x, i) => {
      if (i % 4 === 0) { out.push(otd[k % otd.length]); k++; }
      out.push(x);
    });
    while (k < otd.length) { out.push(otd[k]); k++; }
    return out;
  }

  function photoUrl(id) {
    if (prefetch && prefetch.id === id) {
      const u = prefetch.url; prefetch = null;
      return Promise.resolve(u);
    }
    return readOne('full', id).then((buf) => {
      if (!buf) throw new Error('missing');
      return URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }));
    });
  }
  function dropPrefetch() {
    if (prefetch) { URL.revokeObjectURL(prefetch.url); prefetch = null; }
  }

  function startShow() {
    playlist = buildPlaylist();
    if (!playlist.length) return;
    settings.lastScreen = 'photos';
    saveSettings();
    try { sessionStorage.setItem(RESUME_KEY, '1'); } catch (e) {}
    stopPreview();
    $('home').className = 'page hidden';
    $('albumView').className = 'page hidden';
    show.className = '';
    $('message').className = 'message hidden';
    $('otdLabel').className = 'otd hidden';
    paused = false; fails = 0; history = [];
    updatePauseUi();
    startClock();
    requestWakeLock();
    if (settings.style === 'collage') startCollage();
    else { collageEl.className = 'collage hidden'; showSlot(0); }
  }

  function stopShow() {
    clearTimeout(timer); clearTimeout(cleanupTimer); clearTimeout(controlsTimer); clearInterval(clockTimer);
    loadSeq++;
    try { sessionStorage.removeItem(RESUME_KEY); } catch (e) {}
    slideA.className = slideB.className = 'slide';
    releaseLayer(slideA); releaseLayer(slideB); dropPrefetch();
    stopCollage();
    controls.className = 'controls';
    show.className = 'hidden';
    releaseWakeLock();
    showPage('home');
    renderHome();
  }

  function decode(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = url;
    });
  }

  function showSlot(start) {
    clearTimeout(timer);
    const n = playlist.length;
    start = ((start % n) + n) % n;
    const first = playlist[start], items = [first];
    // Portrait pairs: find another tall photo coming up soon and show them together.
    if (settings.pairs && isLandscape() && isPortrait(first) && !first.otdLabel) {
      for (let j = start + 1; j < Math.min(n, start + 15); j++) {
        const c = playlist[j];
        if (isPortrait(c) && !c.otdLabel && c.id !== first.id) {
          if (j !== start + 1) { playlist.splice(j, 1); playlist.splice(start + 1, 0, c); }
          items.push(c);
          break;
        }
      }
    }
    slotStart = start; slotLen = items.length;
    const token = ++loadSeq;
    updateInfo();
    Promise.all(items.map((it) => photoUrl(it.id))).then((urls) => {
      Promise.all(urls.map(decode)).then((dims) => {
        if (token !== loadSeq) { urls.forEach((u) => URL.revokeObjectURL(u)); return; }
        fails = 0;
        display(urls, items, dims);
        schedule();
        prefetchNext(start + slotLen);
      }, () => { urls.forEach((u) => URL.revokeObjectURL(u)); failed(token); });
    }, () => failed(token));
  }

  function failed(token) {
    if (token !== loadSeq) return;
    fails++;
    if (fails >= playlist.length) {
      $('message').textContent = 'Couldn’t load any photos. Try going back to the menu and adding them again.';
      $('message').className = 'message';
      return;
    }
    timer = setTimeout(next, 300);
  }

  function prefetchNext(i) {
    dropPrefetch();
    if (playlist.length < 2) return;
    const item = playlist[i % playlist.length];
    const seq = loadSeq;
    readOne('full', item.id).then((buf) => {
      if (!buf || seq !== loadSeq) return;
      const url = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }));
      prefetch = { id: item.id, url: url };
      const warm = new Image(); warm.src = url;  // decode ahead of time
    }, () => {});
  }

  function releaseLayer(layer) {
    const d = layerData.get(layer);
    if (d) { d.urls.forEach((u) => URL.revokeObjectURL(u)); layerData.delete(layer); }
    layer.innerHTML = '';
    layer.style.backgroundImage = 'none';
  }

  function renderLayer(layer) {
    const d = layerData.get(layer);
    if (!d) return;
    layer.innerHTML = '';
    layer.style.backgroundImage = 'none';
    if (settings.style === 'wood') {
      layer.classList.add('wall');
      woodLayout(layer, d);
    } else {
      layer.classList.remove('wall');
      if (d.urls.length === 1) {
        layer.style.backgroundImage = 'url("' + d.urls[0] + '")';
        layer.style.backgroundSize = settings.fit;
      } else {
        d.urls.forEach((u, i) => {
          const half = div('half', layer);
          half.style.left = i ? '50.4%' : '0';
          half.style.backgroundImage = 'url("' + u + '")';
          half.style.backgroundSize = settings.fit;
        });
      }
    }
  }

  function woodLayout(layer, d) {
    const W = window.innerWidth, H = window.innerHeight, n = d.urls.length;
    const t = Math.round(Math.min(W, H) * 0.035), gap = W * 0.05;
    const aw = W * 0.88, ah = H * 0.84, slotW = (aw - gap * (n - 1)) / n;
    const boxes = d.dims.map((dm) => {
      const ar = dm.w / dm.h;
      let pw = slotW - 2 * t, ph = pw / ar;
      if (ph > ah - 2 * t) { ph = ah - 2 * t; pw = ph * ar; }
      return { fw: Math.round(pw + 2 * t), fh: Math.round(ph + 2 * t) };
    });
    let x = (W - (boxes.reduce((s, b) => s + b.fw, 0) + gap * (n - 1))) / 2;
    boxes.forEach((b, i) => {
      layer.appendChild(woodFrame(Math.round(x), Math.round((H - b.fh) / 2), b.fw, b.fh, t, d.urls[i]));
      x += b.fw + gap;
    });
  }

  // A picture frame made of four mitred wooden sides around the photo.
  function woodFrame(x, y, fw, fh, t, url) {
    const f = div('wood-frame');
    f.style.left = x + 'px'; f.style.top = y + 'px'; f.style.width = fw + 'px'; f.style.height = fh + 'px';
    const sides = [
      ['wood-side wood-h top', 0, 0, fw, t, [[0, 0], [fw, 0], [fw - t, t], [t, t]]],
      ['wood-side wood-h bottom', 0, fh - t, fw, t, [[t, 0], [fw - t, 0], [fw, t], [0, t]]],
      ['wood-side wood-v left', 0, 0, t, fh, [[0, 0], [t, t], [t, fh - t], [0, fh]]],
      ['wood-side wood-v right', fw - t, 0, t, fh, [[t, 0], [t, fh], [0, fh - t], [0, t]]]
    ];
    sides.forEach((s) => {
      const e = div(s[0], f);
      e.style.left = s[1] + 'px'; e.style.top = s[2] + 'px'; e.style.width = s[3] + 'px'; e.style.height = s[4] + 'px';
      const poly = 'polygon(' + s[5].map((p) => p[0] + 'px ' + p[1] + 'px').join(', ') + ')';
      e.style.webkitClipPath = poly;
      e.style.clipPath = poly;
    });
    const ph = div('wood-photo', f);
    ph.style.left = t + 'px'; ph.style.top = t + 'px';
    ph.style.width = (fw - 2 * t) + 'px'; ph.style.height = (fh - 2 * t) + 'px';
    ph.style.backgroundImage = 'url("' + url + '")';
    return f;
  }

  function display(urls, items, dims) {
    const incoming = active === slideA ? slideB : slideA;
    const outgoing = active;
    clearTimeout(cleanupTimer);
    releaseLayer(incoming);
    layerData.set(incoming, { urls: urls, items: items, dims: dims });
    renderLayer(incoming);
    incoming.classList.add('on');
    outgoing.classList.remove('on');
    active = incoming;
    const label = items[0].otdLabel;
    $('otdLabel').textContent = label || '';
    $('otdLabel').className = label ? 'otd' : 'otd hidden';
    // free the old photo's memory once the fade is done (old iPads have little RAM)
    cleanupTimer = setTimeout(() => { if (outgoing !== active) releaseLayer(outgoing); }, 1700);
  }

  function schedule() {
    clearTimeout(timer);
    if (paused) return;
    if (collageMode) timer = setTimeout(collageStep, Math.max(3, settings.interval / 2) * 1000);
    else timer = setTimeout(next, settings.interval * 1000);
  }

  function next() {
    if (collageMode) { clearTimeout(timer); collageStep(); return; }
    const s = slotStart + slotLen;
    if (s >= playlist.length) {
      // Finished a full pass. Reload (works offline thanks to the service worker) so a
      // long-running old iPad starts fresh; the slideshow resumes on its own.
      // (not while an alarm is set: a reload would stop the iPad from playing the alarm sound until the next tap)
      if (playlist.length >= 10 && navigator.serviceWorker && navigator.serviceWorker.controller && !(window.Alarm && Alarm.hasEnabled())) {
        try { sessionStorage.setItem(RESUME_KEY, '1'); } catch (e) {}
        location.reload();
        return;
      }
      dropPrefetch();
      playlist = buildPlaylist();
      history = [];
      showSlot(0);
      return;
    }
    history.push(slotStart);
    if (history.length > 300) history.shift();
    showSlot(s);
  }
  function prev() {
    if (collageMode) { clearTimeout(timer); collageStep(); return; }
    showSlot(history.length ? history.pop() : playlist.length - 1);
  }

  // ---------- Collage ----------
  function startCollage() {
    collageMode = true;
    slideA.className = slideB.className = 'slide';
    collageEl.className = 'collage ' + (isLandscape() ? 'land' : 'port');
    collageEl.innerHTML = '';
    tiles = []; collageCursor = 0; lastTile = -1;
    for (let i = 0; i < 6; i++) {
      const el = div('ctile', collageEl);
      tiles.push({ layers: [div('clayer', el), div('clayer', el)], urls: [null, null], active: 0 });
    }
    const seq = loadSeq;
    let chain = Promise.resolve();
    tiles.forEach((t, i) => { chain = chain.then(() => (seq === loadSeq ? loadTile(i) : null)); });
    chain.then(() => { if (seq === loadSeq) schedule(); });
    updateInfo();
  }
  function stopCollage() {
    tiles.forEach((t) => t.urls.forEach((u) => { if (u) URL.revokeObjectURL(u); }));
    tiles = [];
    collageEl.innerHTML = '';
    collageEl.className = 'collage hidden';
    collageMode = false;
  }
  function nextCollageItem() {
    if (collageCursor >= playlist.length) { playlist = buildPlaylist(); collageCursor = 0; }
    return playlist[collageCursor++];
  }
  function loadTile(i) {
    const it = nextCollageItem(), seq = loadSeq;
    return photoUrl(it.id).then((url) => decode(url).then(() => {
      if (seq !== loadSeq || !tiles[i]) { URL.revokeObjectURL(url); return; }
      const t = tiles[i], inc = 1 - t.active, out = t.active;
      t.layers[inc].style.backgroundImage = 'url("' + url + '")';
      t.urls[inc] = url;
      t.layers[inc].className = 'clayer on';
      t.layers[out].className = 'clayer';
      t.active = inc;
      setTimeout(() => {
        if (t.active !== out && t.urls[out]) {
          URL.revokeObjectURL(t.urls[out]); t.urls[out] = null;
          t.layers[out].style.backgroundImage = 'none';
        }
      }, 1500);
    }, () => URL.revokeObjectURL(url))).catch(() => {});
  }
  function collageStep() {
    if (!tiles.length) return;
    let i;
    do { i = Math.floor(Math.random() * tiles.length); } while (tiles.length > 1 && i === lastTile);
    lastTile = i;
    const seq = loadSeq;
    loadTile(i).then(() => { if (seq === loadSeq) schedule(); });
  }

  // ---------- Slideshow controls ----------
  function togglePause() {
    paused = !paused;
    updatePauseUi();
    if (paused) clearTimeout(timer); else schedule();
  }
  function updatePauseUi() {
    $('cPause').innerHTML = paused ? '&#9654; Play' : 'Pause';
    $('pausedBadge').className = paused ? 'badge' : 'badge hidden';
  }
  function updateInfo() {
    if (collageMode) {
      $('infoAlbum').textContent = 'Collage';
      $('infoCount').textContent = plural(playlist.length, 'photo');
      return;
    }
    const item = playlist[slotStart];
    $('infoAlbum').textContent = item ? item.album : '';
    $('infoCount').textContent = (slotStart + 1) + ' / ' + playlist.length;
  }

  function startClock() {
    clearInterval(clockTimer);
    const el = $('clock');
    if (!settings.clock) { el.className = 'clock hidden'; return; }
    el.className = 'clock';
    const f = ClockFace.FONTS[settings.clockFont] || ClockFace.FONTS.modern;
    el.style.fontFamily = f.stack;
    el.style.color = settings.clockColor;
    const tick = () => {
      const d = new Date(), m = d.getMinutes();
      const h = settings.clock24 ? ('0' + d.getHours()).slice(-2) : (d.getHours() % 12 || 12);
      el.textContent = h + ':' + (m < 10 ? '0' : '') + m;
    };
    tick();
    clockTimer = setInterval(tick, 10000);
  }

  // ====================================================================
  // Scenes and clock screen
  // ====================================================================
  const stage = $('stage'), stageControls = $('stageControls');
  const stageRunner = new Scenes.Runner($('stageScene'));
  const stageFace = new ClockFace($('stageClock'));
  let stageMode = null, stageControlsTimer = null;

  function startStage(mode) {
    stageMode = mode;
    settings.lastScreen = mode;
    saveSettings();
    stopPreview();
    $('home').className = 'page hidden';
    $('albumView').className = 'page hidden';
    stage.className = '';
    renderStage();
    requestWakeLock();
  }
  function renderStage() {
    const clockEl = $('stageClock');
    if (stageMode === 'scene') {
      stage.style.background = '#000';
      $('stageScene').style.display = 'block';
      stageRunner.start(settings.scene);
      if (settings.sceneClock) {
        clockEl.className = 'stage-clock corner';
        stageFace.render(Object.assign(clockOpts(), { style: 'digital', size: 'l' }));
      } else {
        clockEl.className = 'stage-clock hidden';
        stageFace.stop();
      }
      $('stageTitle').textContent = sceneName(settings.scene);
    } else {
      applyClockBg(stage, stageRunner);
      clockEl.className = 'stage-clock full';
      stageFace.render(clockOpts());
      $('stageTitle').textContent = ClockFace.STYLES[settings.clockStyle] + ' clock';
    }
  }
  function stopStage() {
    stageRunner.stop();
    stageFace.stop();
    clearTimeout(stageControlsTimer);
    stageControls.className = 'controls';
    stage.className = 'hidden';
    stageMode = null;
    releaseWakeLock();
    showPage('home');
    renderHome();
  }
  // The arrows switch scene, or clock style.
  function stageStep(dir) {
    if (stageMode === 'scene') {
      const ids = Scenes.LIST.map((s) => s.id);
      settings.scene = ids[(ids.indexOf(settings.scene) + dir + ids.length) % ids.length];
    } else {
      const st = ClockFace.STYLE_ORDER;
      settings.clockStyle = st[(st.indexOf(settings.clockStyle) + dir + st.length) % st.length];
    }
    saveSettings();
    refreshSegs();
    renderStage();
  }
  function showStageControls() {
    stageControls.className = 'controls visible';
    stage.className = 'cursor';
    clearTimeout(stageControlsTimer);
    stageControlsTimer = setTimeout(hideStageControls, 5000);
  }
  function hideStageControls() {
    stageControls.className = 'controls';
    stage.className = '';
    clearTimeout(stageControlsTimer);
  }

  // ====================================================================
  // Touch and keyboard
  // ====================================================================
  function isButtonIn(el, root) {
    while (el && el !== root) { if (el.tagName === 'BUTTON') return true; el = el.parentNode; }
    return false;
  }
  // tap = show controls, swipe left/right = next/previous
  function touchControls(root, onTap, onNext, onPrev) {
    let sx = 0, sy = 0, touching = false;
    root.addEventListener('touchstart', (e) => {
      if (isButtonIn(e.target, root)) return;
      touching = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, false);
    root.addEventListener('touchmove', (e) => { if (!isButtonIn(e.target, root)) e.preventDefault(); }, false);
    root.addEventListener('touchend', (e) => {
      if (!touching) return;
      touching = false;
      if (isButtonIn(e.target, root)) return;
      e.preventDefault();
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) onNext(); else onPrev(); }
      else onTap();
    }, false);
    root.addEventListener('click', (e) => { if (!isButtonIn(e.target, root)) onTap(); });
  }

  function showControls() {
    controls.className = 'controls visible';
    show.className = 'cursor';
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(hideControls, 5000);
  }
  function hideControls() {
    controls.className = 'controls';
    show.className = '';
    clearTimeout(controlsTimer);
  }
  touchControls(show, () => { if (controls.className.indexOf('visible') >= 0) hideControls(); else showControls(); }, next, prev);
  touchControls(stage, () => { if (stageControls.className.indexOf('visible') >= 0) hideStageControls(); else showStageControls(); },
    () => stageStep(1), () => stageStep(-1));

  function bindButton(id, fn, keepOpen) {
    $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); if (keepOpen) keepOpen(); });
  }
  bindButton('cPrev', prev, showControls);
  bindButton('cNext', next, showControls);
  bindButton('cPause', togglePause, showControls);
  bindButton('cExit', stopShow);
  bindButton('sPrev', () => stageStep(-1), showStageControls);
  bindButton('sNext', () => stageStep(1), showStageControls);
  bindButton('sExit', stopStage);

  document.addEventListener('keydown', (e) => {
    if (show.className !== 'hidden') {
      if (e.keyCode === 39) next();
      else if (e.keyCode === 37) prev();
      else if (e.keyCode === 32) { e.preventDefault(); togglePause(); }
      else if (e.keyCode === 27) stopShow();
    } else if (stage.className !== 'hidden') {
      if (e.keyCode === 39) stageStep(1);
      else if (e.keyCode === 37) stageStep(-1);
      else if (e.keyCode === 27) stopStage();
    }
  });

  // Keep the screen on where the browser supports it (newer iOS). Older iOS: set Auto-Lock to Never.
  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then((l) => { wakeLock = l; }, () => {});
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (show.className !== 'hidden' || stage.className !== 'hidden')) requestWakeLock();
  });

  // Turning the iPad: redo layouts that depend on the screen shape.
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (show.className !== 'hidden') {
        if (collageMode) collageEl.className = 'collage ' + (isLandscape() ? 'land' : 'port');
        else renderLayer(active);
      } else if (stage.className !== 'hidden') {
        renderStage();
      } else if ($('home').className === 'page') {
        if (settings.tab === 'scenes') renderSceneCards();
        if (settings.tab === 'clock') renderPreview();
      }
    }, 250);
  });

  // ====================================================================
  // Start up
  // ====================================================================
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // Ask the browser not to clear our storage (supported on newer iOS).
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // On an iPad, photos must be added from the Home Screen app (it has its own storage).
  if ('standalone' in navigator && !navigator.standalone) $('homeBanner').className = 'banner';

  refreshSegs();
  Alarm.init({ is24: () => settings.clock24, onRing: requestWakeLock });
  Promise.all([readAll('albums'), readAll('photos')]).then((res) => {
    albums = res[0].sort((a, b) => a.created - b.created);
    photos = res[1];
    settings.selected = settings.selected.filter((id) => albumById(id));
    renderHome();
    let resume = false;
    try { resume = sessionStorage.getItem(RESUME_KEY) === '1'; } catch (e) {}
    if (resume && buildPlaylist().length) startShow();
    else if (settings.autostart) {
      if (settings.lastScreen === 'scene') startStage('scene');
      else if (settings.lastScreen === 'clock') startStage('clock');
      else if (buildPlaylist().length) startShow();
    }
    fillMissingSizes();
  }).catch((err) => {
    $('albums').innerHTML = '<div class="empty">This browser couldn’t open the photo storage (' +
      String(err && err.message || err).replace(/</g, '&lt;') + '). If this is a Private Browsing tab, open it in a normal tab instead.</div>';
    showTab();
  });

  detectAutoRotate();
})();
