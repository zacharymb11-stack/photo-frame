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

  const $ = (id) => document.getElementById(id);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

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

  // ====================================================================
  // State
  // ====================================================================
  let albums = [];   // {id, name, created}
  let photos = [];   // {id, albumId, added, bytes}

  const settings = { selected: [], interval: 10, shuffle: true, fit: 'contain', clock: false, autostart: false };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved) Object.keys(saved).forEach((k) => { settings[k] = saved[k]; });
  } catch (e) {}
  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  function photosOf(albumId) {
    return photos.filter((p) => p.albumId === albumId).sort((a, b) => a.added - b.added);
  }
  function albumById(id) { return albums.find((a) => a.id === id); }
  function selectedAlbums() { return albums.filter((a) => settings.selected.indexOf(a.id) >= 0); }

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
  // Importing photos (resize on the iPad with a canvas)
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

  // Reads the EXIF orientation (1-8) from the start of a JPEG.
  function exifOrientation(buf) {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return 1;
    let off = 2;
    while (off + 4 <= v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
      const len = v.getUint16(off + 2);
      if (marker === 0xFFE1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) {
        const tiff = off + 10;
        if (tiff + 8 > v.byteLength) return 1;
        const little = v.getUint16(tiff) === 0x4949;
        const ifd = tiff + v.getUint32(tiff + 4, little);
        if (ifd + 2 > v.byteLength) return 1;
        const count = v.getUint16(ifd, little);
        for (let i = 0; i < count; i++) {
          const e = ifd + 2 + i * 12;
          if (e + 12 > v.byteLength) return 1;
          if (v.getUint16(e, little) === 0x0112) {
            const o = v.getUint16(e + 8, little);
            return o >= 1 && o <= 8 ? o : 1;
          }
        }
        return 1;
      }
      off += 2 + len;
    }
    return 1;
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
    let orientation = 1;
    if (!(await detectAutoRotate())) {
      orientation = exifOrientation(await readAsArrayBuffer(file.slice(0, 256 * 1024)));
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const full = await renderJpeg(img, orientation, FULL_MAX, FULL_QUALITY);
      const thumb = await renderJpeg(img, orientation, THUMB_MAX, THUMB_QUALITY);
      return { full, thumb };
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
        const meta = { id: newId(), albumId: albumId, added: Date.now() + i / 1000, bytes: r.full.byteLength + r.thumb.byteLength };
        await tx(['photos', 'full', 'thumbs'], 'readwrite', (t) => {
          t.objectStore('photos').put(meta);
          t.objectStore('full').put(r.full, meta.id);
          t.objectStore('thumbs').put(r.thumb, meta.id);
        });
        photos.push(meta);
        done++;
        if (currentAlbumId === albumId && (done <= 6 || done % 10 === 0)) renderAlbumView();
      } catch (e) {
        if (e && (e.name === 'QuotaExceededError' || /quota|space/i.test(String(e.message)))) { stoppedForSpace = true; break; }
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
    updatePlayButton();
    updateStorage();
  }

  function makeAlbumTile(album) {
    const list = photosOf(album.id);
    const tile = document.createElement('div');
    tile.className = 'tile' + (settings.selected.indexOf(album.id) >= 0 ? ' selected' : '');
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
    const tile = document.createElement('div');
    tile.className = 'tile new';
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
    const chosen = selectedAlbums();
    let count = 0;
    chosen.forEach((a) => { count += photosOf(a.id).length; });
    const btn = $('play');
    btn.disabled = count === 0;
    btn.innerHTML = count === 0
      ? (albums.length ? 'Pick albums to play' : 'Tap “New album” to get started')
      : '&#9654;&nbsp; Play ' + plural(chosen.length, 'album') + ' &middot; ' + plural(count, 'photo');
  }

  function updateStorage() {
    let bytes = 0;
    photos.forEach((p) => { bytes += p.bytes || 0; });
    $('storage').textContent = 'Stored on this iPad: ' + plural(photos.length, 'photo') + ', ' +
      (bytes / 1048576).toFixed(bytes > 104857600 ? 0 : 1) + ' MB. Photos never leave this iPad.';
  }

  $('selAll').addEventListener('click', () => {
    settings.selected = albums.map((a) => a.id); saveSettings(); renderHome();
  });
  $('selNone').addEventListener('click', () => {
    settings.selected = []; saveSettings(); renderHome();
  });

  const segs = document.querySelectorAll('.seg');
  function refreshSegs() {
    Array.prototype.forEach.call(segs, (seg) => {
      const key = seg.getAttribute('data-key');
      Array.prototype.forEach.call(seg.querySelectorAll('button'), (b) => {
        b.className = String(settings[key]) === b.getAttribute('data-v') ? 'on' : '';
      });
    });
  }
  Array.prototype.forEach.call(segs, (seg) => {
    const key = seg.getAttribute('data-key');
    Array.prototype.forEach.call(seg.querySelectorAll('button'), (b) => {
      b.addEventListener('click', () => {
        const v = b.getAttribute('data-v');
        settings[key] = v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? parseInt(v, 10) : v;
        saveSettings(); refreshSegs();
      });
    });
  });

  $('play').addEventListener('click', () => startShow());

  // ====================================================================
  // Album editor
  // ====================================================================
  let currentAlbumId = null, gridLimit = GRID_PAGE, selecting = false, picked = {};

  function openAlbum(id) {
    currentAlbumId = id;
    gridLimit = GRID_PAGE;
    setSelecting(false);
    showPage('album');
    renderAlbumView();
  }

  function renderAlbumView() {
    const album = albumById(currentAlbumId);
    if (!album) return;
    const list = photosOf(album.id);
    $('albumTitle').textContent = album.name;
    $('albumCount').textContent = plural(list.length, 'photo');
    $('albumEmpty').className = list.length || importing ? 'empty hidden' : 'empty';
    const grid = $('photoGrid');
    grid.innerHTML = '';
    list.slice(0, gridLimit).forEach((p) => {
      const cell = document.createElement('div');
      cell.className = 'thumb' + (picked[p.id] ? ' selected' : '');
      cell.innerHTML = '<div class="thumb-in"></div><div class="check">&#10003;</div>';
      const inner = cell.firstChild;
      thumbUrl(p.id).then((u) => { if (u) inner.style.backgroundImage = 'url("' + u + '")'; });
      cell.addEventListener('click', () => {
        if (!selecting) return;
        if (picked[p.id]) delete picked[p.id]; else picked[p.id] = true;
        cell.className = 'thumb' + (picked[p.id] ? ' selected' : '');
        updateDeleteButton();
      });
      grid.appendChild(cell);
    });
    $('showMore').className = list.length > gridLimit ? 'show-more' : 'show-more hidden';
    $('showMore').textContent = 'Show more (' + (list.length - gridLimit) + ' more)';
  }

  function setSelecting(on) {
    selecting = on;
    picked = {};
    $('photoGrid').className = 'photo-grid' + (on ? ' selecting' : '');
    $('selectMode').textContent = on ? 'Cancel' : 'Select';
    Array.prototype.forEach.call(document.querySelectorAll('.thumb.selected'), (el) => { el.className = 'thumb'; });
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
  // Slideshow
  // ====================================================================
  const show = $('show'), slideA = $('slideA'), slideB = $('slideB'), controls = $('controls');
  const layerUrl = new Map();
  let playlist = [], cur = -1, active = slideA;
  let timer = null, cleanupTimer = null, controlsTimer = null, clockTimer = null;
  let paused = false, loadSeq = 0, fails = 0, prefetch = null, wakeLock = null;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function buildPlaylist() {
    const list = [];
    selectedAlbums().forEach((a) => {
      photosOf(a.id).forEach((p) => list.push({ id: p.id, album: a.name }));
    });
    return settings.shuffle ? shuffle(list) : list;
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
    try { sessionStorage.setItem(RESUME_KEY, '1'); } catch (e) {}
    $('home').className = 'page hidden';
    $('albumView').className = 'page hidden';
    show.className = '';
    $('message').className = 'message hidden';
    slideA.style.backgroundSize = slideB.style.backgroundSize = settings.fit;
    paused = false; fails = 0;
    updatePauseUi();
    startClock();
    requestWakeLock();
    showPhoto(0);
  }

  function clearLayer(layer) {
    const u = layerUrl.get(layer);
    if (u) { URL.revokeObjectURL(u); layerUrl.delete(layer); }
    layer.style.backgroundImage = 'none';
  }

  function stopShow() {
    clearTimeout(timer); clearTimeout(cleanupTimer); clearTimeout(controlsTimer); clearInterval(clockTimer);
    loadSeq++;
    try { sessionStorage.removeItem(RESUME_KEY); } catch (e) {}
    slideA.className = slideB.className = 'slide';
    clearLayer(slideA); clearLayer(slideB); dropPrefetch();
    controls.className = 'controls';
    show.className = 'hidden';
    releaseWakeLock();
    showPage('home');
    renderHome();
  }

  function showPhoto(i) {
    clearTimeout(timer);
    const n = playlist.length;
    i = ((i % n) + n) % n;
    cur = i;
    const item = playlist[i], token = ++loadSeq;
    updateInfo();
    photoUrl(item.id).then((url) => {
      const img = new Image();
      img.onload = () => {
        if (token !== loadSeq) { URL.revokeObjectURL(url); return; }
        fails = 0;
        display(url);
        schedule();
        prefetchNext(i + 1);
      };
      img.onerror = () => { URL.revokeObjectURL(url); failed(token); };
      img.src = url;
    }, () => failed(token));
  }

  function failed(token) {
    if (token !== loadSeq) return;
    fails++;
    if (fails >= playlist.length) {
      $('message').textContent = 'Couldn’t load any photos. Try going back to Albums and adding them again.';
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

  function display(url) {
    const incoming = active === slideA ? slideB : slideA;
    const outgoing = active;
    clearTimeout(cleanupTimer);
    if (layerUrl.get(incoming)) clearLayer(incoming);
    layerUrl.set(incoming, url);
    incoming.style.backgroundImage = 'url("' + url + '")';
    incoming.className = 'slide on';
    outgoing.className = 'slide';
    active = incoming;
    // free the old photo's memory once the fade is done (old iPads have little RAM)
    cleanupTimer = setTimeout(() => { if (outgoing !== active) clearLayer(outgoing); }, 1700);
  }

  function schedule() {
    clearTimeout(timer);
    if (!paused) timer = setTimeout(next, settings.interval * 1000);
  }

  function next() {
    if (cur + 1 >= playlist.length) {
      // Finished a full pass. Reload (works offline thanks to the service worker) so a
      // long-running old iPad starts fresh; the slideshow resumes on its own.
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        try { sessionStorage.setItem(RESUME_KEY, '1'); } catch (e) {}
        location.reload();
        return;
      }
      dropPrefetch();
      playlist = buildPlaylist();
      showPhoto(0);
      return;
    }
    showPhoto(cur + 1);
  }
  function prev() { showPhoto(cur - 1); }

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
    const item = playlist[cur];
    $('infoAlbum').textContent = item ? item.album : '';
    $('infoCount').textContent = (cur + 1) + ' / ' + playlist.length;
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
  function toggleControls() {
    if (controls.className.indexOf('visible') >= 0) hideControls(); else showControls();
  }

  function startClock() {
    clearInterval(clockTimer);
    const el = $('clock');
    if (!settings.clock) { el.className = 'clock hidden'; return; }
    el.className = 'clock';
    const tick = () => {
      const d = new Date(), h = d.getHours() % 12 || 12, m = d.getMinutes();
      el.textContent = h + ':' + (m < 10 ? '0' : '') + m;
    };
    tick();
    clockTimer = setInterval(tick, 10000);
  }

  // Keep the screen on where the browser supports it (newer iOS). Older iOS: set Auto-Lock to Never.
  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then((l) => { wakeLock = l; }, () => {});
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && show.className !== 'hidden') requestWakeLock();
  });

  function isButton(el) {
    while (el && el !== show) { if (el.tagName === 'BUTTON') return true; el = el.parentNode; }
    return false;
  }
  function bindButton(id, fn) {
    $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); if (id !== 'cExit') showControls(); });
  }
  bindButton('cPrev', prev);
  bindButton('cNext', next);
  bindButton('cPause', togglePause);
  bindButton('cExit', stopShow);

  // swipe left/right to change photo, tap to show controls
  let sx = 0, sy = 0, touching = false;
  show.addEventListener('touchstart', (e) => {
    if (isButton(e.target)) return;
    touching = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, false);
  show.addEventListener('touchmove', (e) => { if (!isButton(e.target)) e.preventDefault(); }, false);
  show.addEventListener('touchend', (e) => {
    if (!touching) return;
    touching = false;
    if (isButton(e.target)) return;
    e.preventDefault();
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) next(); else prev(); }
    else toggleControls();
  }, false);
  show.addEventListener('click', (e) => { if (!isButton(e.target)) toggleControls(); });
  document.addEventListener('keydown', (e) => {
    if (show.className === 'hidden') return;
    if (e.keyCode === 39) next();
    else if (e.keyCode === 37) prev();
    else if (e.keyCode === 32) { e.preventDefault(); togglePause(); }
    else if (e.keyCode === 27) stopShow();
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
  Promise.all([readAll('albums'), readAll('photos')]).then((res) => {
    albums = res[0].sort((a, b) => a.created - b.created);
    photos = res[1];
    settings.selected = settings.selected.filter((id) => albumById(id));
    renderHome();
    let resume = false;
    try { resume = sessionStorage.getItem(RESUME_KEY) === '1'; } catch (e) {}
    if ((resume || settings.autostart) && buildPlaylist().length) startShow();
  }).catch((err) => {
    $('albums').innerHTML = '<div class="empty">This browser couldn’t open the photo storage (' +
      String(err && err.message || err).replace(/</g, '&lt;') + '). If this is a Private Browsing tab, open it in a normal tab instead.</div>';
  });

  detectAutoRotate();
})();
