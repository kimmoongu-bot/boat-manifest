// 앱 아이콘 만들기: node tools/make-icons.mjs
// 손님용(승선QR): 남색 바탕 + 흰 승선권(QR 눈 3개)
// 선장용(승선명부 선장): 주황 바탕 + 흰 명부판(체크 3줄) — 홈 화면에서 한눈에 구분되게 색과 그림을 다르게
// 마스크용 안전 영역(가운데 80%) 안에 그림을 둔다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAVY = [0x0b, 0x3a, 0x5b], WHITE = [255, 255, 255], ORANGE = [0xc2, 0x41, 0x0c];

function inRound(u, v, x0, y0, x1, y1, r) {
  if (u < x0 || u > x1 || v < y0 || v > y1) return false;
  const cx = u < x0 + r ? x0 + r : u > x1 - r ? x1 - r : u;
  const cy = v < y0 + r ? y0 + r : v > y1 - r ? y1 - r : v;
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}

// 0~1 좌표계 도형 — 손님용
function guestShape(u, v) {
  const c0 = 0.22, c1 = 0.78;
  if (!inRound(u, v, c0, c0, c1, c1, 0.06)) return NAVY;
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
  const dots = [[9, 2], [11, 4], [9, 6], [2, 9], [5, 11], [9, 9], [11, 11], [10, 13], [13, 9], [17, 10], [9, 17], [11, 19]];
  return dots.some(([x, y]) => gx >= x && gx <= x + 1 && gy >= y && gy <= y + 1) ? NAVY : WHITE;
}

// 선장용: 명부판(클립 + 체크 3줄)
function captainShape(u, v) {
  if (inRound(u, v, 0.40, 0.17, 0.60, 0.27, 0.03)) return NAVY;           // 클립
  if (!inRound(u, v, 0.25, 0.21, 0.75, 0.81, 0.05)) return ORANGE;        // 판
  for (let i = 0; i < 3; i++) {
    const y0 = 0.34 + i * 0.15, y1 = y0 + 0.09;
    // 체크 상자
    if (u >= 0.32 && u <= 0.41 && v >= y0 && v <= y1) {
      const inner = u > 0.335 && u < 0.395 && v > y0 + 0.015 && v < y1 - 0.015;
      if (!inner) return NAVY;
      // 체크 표시(ㄴ자 기울임)
      const t = (u - 0.335) / 0.06, s = (v - y0 - 0.015) / 0.06;
      const onA = t < 0.45 && Math.abs(s - (0.55 + t * 0.6)) < 0.13;
      const onB = t >= 0.35 && Math.abs(s - (0.85 - (t - 0.35) * 1.2)) < 0.13;
      return onA || onB ? ORANGE : WHITE;
    }
    // 줄
    if (u >= 0.46 && u <= 0.68 && v >= y0 + 0.03 && v <= y1 - 0.03) return NAVY;
  }
  return WHITE;
}

function render(shape, size, scale = 1) {
  // scale < 1 이면 그림을 키운다(일반 아이콘), 1 이면 마스크용
  return encodePng(size, size, (x, y) => {
    const u = ((x + 0.5) / size - 0.5) * scale + 0.5;
    const v = ((y + 0.5) / size - 0.5) * scale + 0.5;
    return shape(u, v);
  });
}

const SVG = {
  guest: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0B3A5B"/>` +
    `<rect x="12" y="12" width="40" height="40" rx="4" fill="#fff"/>` +
    `<path d="M16 16h12v12H16zM36 16h12v12H36zM16 36h12v12H16z" fill="#0B3A5B"/>` +
    `<path d="M19 19h6v6h-6zM39 19h6v6h-6zM19 39h6v6h-6z" fill="#fff"/>` +
    `<path d="M20.5 20.5h3v3h-3zM40.5 20.5h3v3h-3zM20.5 40.5h3v3h-3z" fill="#0B3A5B"/>` +
    `<circle cx="42" cy="42" r="5" fill="#C2410C"/></svg>`,
  captain: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#C2410C"/>` +
    `<rect x="14" y="12" width="36" height="44" rx="4" fill="#fff"/><rect x="25" y="8" width="14" height="8" rx="2" fill="#0B3A5B"/>` +
    `<g fill="none" stroke="#0B3A5B" stroke-width="2.5"><rect x="19" y="21" width="7" height="7"/><rect x="19" y="32" width="7" height="7"/><rect x="19" y="43" width="7" height="7"/></g>` +
    `<path d="M30 24.5h14M30 35.5h14M30 46.5h14" stroke="#0B3A5B" stroke-width="3"/></svg>`,
};

for (const [app, shape] of [['guest', guestShape], ['captain', captainShape]]) {
  const dir = path.join(root, app, 'icons');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'icon-192.png'), render(shape, 192, 0.8));
  fs.writeFileSync(path.join(dir, 'icon-512.png'), render(shape, 512, 0.8));
  fs.writeFileSync(path.join(dir, 'icon-maskable-512.png'), render(shape, 512, 1));
  fs.writeFileSync(path.join(dir, 'icon.svg'), SVG[app]);
}
console.log('아이콘을 만들었습니다');
