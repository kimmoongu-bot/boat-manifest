// 테스트용 손님 QR 5장 만들기: node tools/make-test-qr.mjs
// 혼자 3명 + 일행 2명. 선장 앱의 "QR 이미지 불러오기"로 시험한다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';
import { people } from './test-people.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BMQR = require(path.join(root, 'shared/bmqr.js'));
const qrcode = require(path.join(root, 'vendor/qrcode.js'));


const dir = path.join(root, 'test-qr');
fs.mkdirSync(dir, { recursive: true });
const SCALE = 8, MARGIN = 4;
const rows = [];
for (const { file, note, p, grp } of people) {
  const text = BMQR.encodeCompact(p, grp);
  if (!BMQR.decode(text)) throw new Error('다시 읽기 실패: ' + file);
  const q = qrcode(0, 'M');
  q.addData(text, BMQR.qrMode(text));
  q.make();
  const n = q.getModuleCount(), size = (n + MARGIN * 2) * SCALE;
  const png = encodePng(size, size, (x, y) => {
    const c = Math.floor(x / SCALE) - MARGIN, r = Math.floor(y / SCALE) - MARGIN;
    const dark = c >= 0 && r >= 0 && c < n && r < n && q.isDark(r, c);
    return dark ? [0, 0, 0] : [255, 255, 255];
  });
  fs.writeFileSync(path.join(dir, file + '.png'), png);
  rows.push({ file, note, name: p.name });
}

// PC 화면에 띄워 놓고 에뮬레이터 카메라로 찍어 볼 수 있게 목록 페이지도 만든다
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>테스트 승선 QR</title>
<style>body{margin:0;padding:16px;font-family:"Malgun Gothic",sans-serif;background:#EEF2F5;color:#0E1A24}
h1{font-size:24px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
figure{margin:0;padding:16px;background:#fff;border-radius:12px}img{width:100%;image-rendering:pixelated}
figcaption b{font-size:20px;display:block}</style></head><body>
<h1>테스트 승선 QR ${rows.length}장</h1><p>가짜 인물입니다. 선장 앱의 "QR 이미지 불러오기"로 PNG를 고르거나, 이 화면을 카메라로 찍어 시험하세요.</p>
<div class="grid">${rows.map(r => `<figure><img src="${r.file}.png" alt="${r.name} 테스트 QR"><figcaption><b>${r.name}</b>${r.note}<br>${r.file}.png</figcaption></figure>`).join('')}</div>
</body></html>
`);
console.log('테스트 QR ' + rows.length + '장을 만들었습니다');
