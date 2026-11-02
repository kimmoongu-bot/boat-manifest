// 앱 아이콘 만들기: node tools/make-icons.mjs
// 남색 바탕 + 흰 승선권(가운데 QR 눈 3개). 마스크용 안전 영역(가운데 80%) 안에 그림을 둔다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAVY = [0x0b, 0x3a, 0x5b], WHITE = [255, 255, 255], ORANGE = [0xc2, 0x41, 0x0c];

// 0~1 좌표계 도형
function shape(u, v) {
  // 흰 카드: 0.22~0.78
  const c0 = 0.22, c1 = 0.78, r = 0.06;
  const inCard = u >= c0 && u <= c1 && v >= c0 && v <= c1 && !cornerOut(u, v, c0, c1, r);
  if (!inCard) return NAVY;
  // QR 눈 3개 (7칸 격자, 카드 안쪽 여백 0.05)
  const g0 = c0 + 0.05, cell = (c1 - c0 - 0.1) / 21;
  const gx = Math.floor((u - g0) / cell), gy = Math.floor((v - g0) / cell);
  if (gx < 0 || gy < 0 || gx > 20 || gy > 20) return WHITE;
  const eye = (ex, ey) => {
    const x = gx - ex, y = gy - ey;
    if (x < 0 || y < 0 || x > 6 || y > 6) return null;
    if (x === 0 || y === 0 || x === 6 || y === 6) return NAVY;
    if (x >= 2 && x <= 4 && y >= 2 && y <= 4) return NAVY;
    return WHITE;
  };
  const e = eye(0, 0) || eye(14, 0) || eye(0, 14);
  if (e) return e;
  // 오른쪽 아래: 주황 점 하나(부표)
  if (gx >= 14 && gy >= 14 && gx <= 20 && gy <= 20) {
    const dx = gx - 17, dy = gy - 17;
    return dx * dx + dy * dy <= 6 ? ORANGE : WHITE;
  }
  // 가운데 몇 칸
  const dots = [[9, 2], [11, 4], [9, 6], [2, 9], [5, 11], [9, 9], [11, 11], [10, 13], [13, 9], [17, 10], [9, 17], [11, 19]];
  return dots.some(([x, y]) => gx >= x && gx <= x + 1 && gy >= y && gy <= y + 1) ? NAVY : WHITE;
}
function cornerOut(u, v, a, b, r) {
  const cx = u < a + r ? a + r : u > b - r ? b - r : u;
  const cy = v < a + r ? a + r : v > b - r ? b - r : v;
  return (u - cx) ** 2 + (v - cy) ** 2 > r * r;
}

function render(size, scale = 1) {
  // scale < 1 이면 그림을 키운다(일반 아이콘), 1 이면 마스크용
  return encodePng(size, size, (x, y) => {
    const u = ((x + 0.5) / size - 0.5) * scale + 0.5;
    const v = ((y + 0.5) / size - 0.5) * scale + 0.5;
    return shape(u, v);
  });
}

for (const app of ['guest', 'captain']) {
  const dir = path.join(root, app, 'icons');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'icon-192.png'), render(192, 0.8));
  fs.writeFileSync(path.join(dir, 'icon-512.png'), render(512, 0.8));
  fs.writeFileSync(path.join(dir, 'icon-maskable-512.png'), render(512, 1));
  fs.writeFileSync(path.join(dir, 'icon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0B3A5B"/>` +
    `<rect x="12" y="12" width="40" height="40" rx="4" fill="#fff"/>` +
    `<path d="M16 16h12v12H16zM36 16h12v12H36zM16 36h12v12H16z" fill="#0B3A5B"/>` +
    `<path d="M19 19h6v6h-6zM39 19h6v6h-6zM19 39h6v6h-6z" fill="#fff"/>` +
    `<path d="M20.5 20.5h3v3h-3zM40.5 20.5h3v3h-3zM20.5 40.5h3v3h-3z" fill="#0B3A5B"/>` +
    `<circle cx="42" cy="42" r="5" fill="#C2410C"/></svg>`);
}
console.log('아이콘을 만들었습니다');
