/* 카메라 연속 스캔 + 사진 파일에서 QR 읽기
 * 읽기는 jsQR(웹 워커). 안드로이드 크롬·아이폰 사파리 모두 같은 방식으로 동작한다.
 */
(function (root) {
  'use strict';

  var worker = null, seq = 0, waiting = {};
  function getWorker() {
    if (worker) return worker;
    worker = new Worker('scan-worker.js');
    worker.onmessage = function (e) {
      var cb = waiting[e.data.id];
      delete waiting[e.data.id];
      if (cb) cb(e.data.text);
    };
    return worker;
  }
  function decodeImageData(data, thorough) {
    return new Promise(function (resolve) {
      var id = ++seq;
      waiting[id] = resolve;
      getWorker().postMessage({ id: id, buffer: data.data.buffer, width: data.width, height: data.height, thorough: !!thorough }, [data.data.buffer]);
    });
  }

  // ---------- 카메라 ----------
  var stream = null, video = null, canvas = null, ctx = null, running = false, busy = false, timer = null, onText = null;
  var INTERVAL = 120;     // ms, 한 장 읽고 나서 다음 장까지
  var MAX_SIDE = 720;     // 가운데 정사각형을 이 크기로 줄여서 읽는다

  function start(videoEl, cb) {
    stop();
    video = videoEl;
    onText = cb;
    canvas = canvas || document.createElement('canvas');
    ctx = ctx || canvas.getContext('2d', { willReadFrequently: true });
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('NO_CAMERA_API'));
    }
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(function (s) {
      stream = s;
      video.srcObject = s;
      video.setAttribute('playsinline', '');   // 아이폰: 전체 화면으로 튀지 않게
      video.muted = true;
      return video.play();
    }).then(function () {
      running = true;
      tick();
    });
  }

  function tick() {
    if (!running) return;
    if (!busy && video.readyState >= 2 && video.videoWidth) {
      var vw = video.videoWidth, vh = video.videoHeight;
      var side = Math.min(vw, vh), sx = (vw - side) / 2, sy = (vh - side) / 2;
      var out = Math.min(side, MAX_SIDE);
      canvas.width = out; canvas.height = out;
      ctx.drawImage(video, sx, sy, side, side, 0, 0, out, out);
      busy = true;
      decodeImageData(ctx.getImageData(0, 0, out, out), false).then(function (text) {
        busy = false;
        if (running && text && onText) onText(text);
      });
    }
    timer = setTimeout(tick, INTERVAL);
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    if (video) video.srcObject = null;
  }

  // ---------- 사진 파일 ----------
  function loadImage(file) {
    if (root.createImageBitmap) return createImageBitmap(file);
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('IMAGE')); };
      img.src = url;
    });
  }

  // 큰 사진은 줄여서, 안 읽히면 다른 크기로 한 번 더
  function decodeFile(file) {
    return loadImage(file).then(function (img) {
      var w = img.width, h = img.height;
      var sizes = [1200, 800, 1800].filter(function (s, i) { return i === 0 || s < Math.max(w, h); });
      var c = document.createElement('canvas'), cx = c.getContext('2d', { willReadFrequently: true });
      function attempt(i) {
        if (i >= sizes.length) return Promise.resolve(null);
        var k = Math.min(1, sizes[i] / Math.max(w, h));
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
        cx.drawImage(img, 0, 0, c.width, c.height);
        return decodeImageData(cx.getImageData(0, 0, c.width, c.height), true).then(function (t) { return t || attempt(i + 1); });
      }
      return attempt(0);
    }).catch(function () { return null; });
  }

  // ---------- 알림: 진동 + 소리 (아이폰은 진동이 안 돼서 소리로) ----------
  var audio = null;
  function unlockSound() {
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!audio && AC) audio = new AC();
      if (audio && audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
  }
  function beep(freq, ms, times) {
    if (!audio) return;
    for (var i = 0; i < (times || 1); i++) {
      var t0 = audio.currentTime + i * (ms / 1000 + 0.06);
      var o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.25, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + ms / 1000);
      o.connect(g); g.connect(audio.destination);
      o.start(t0); o.stop(t0 + ms / 1000);
    }
  }
  function feedback(kind) {
    var v = navigator.vibrate ? navigator.vibrate.bind(navigator) : function () {};
    if (kind === 'ok') { v(150); beep(1320, 120, 1); }
    else if (kind === 'dup') { v([60, 60, 60]); beep(660, 90, 2); }
    else { v([200, 80, 200]); beep(330, 200, 1); }
  }

  root.Scanner = { start: start, stop: stop, decodeFile: decodeFile, unlockSound: unlockSound, feedback: feedback };
})(window);
