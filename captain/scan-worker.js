/* QR 읽기 작업자: 화면이 버벅이지 않게 jsQR 을 따로 돌린다 */
importScripts('../vendor/jsQR.js');

self.onmessage = function (e) {
  var m = e.data;
  var img = new Uint8ClampedArray(m.buffer);
  var r = null;
  try {
    // 카메라는 빠르게(뒤집힌 색은 안 봄), 사진은 꼼꼼하게
    r = jsQR(img, m.width, m.height, { inversionAttempts: m.thorough ? 'attemptBoth' : 'dontInvert' });
  } catch (err) {
    r = null;
  }
  self.postMessage({ id: m.id, text: r ? r.data : null });
};
