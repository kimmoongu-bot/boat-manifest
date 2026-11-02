// 크롬 가짜 카메라용 영상(.y4m) 만들기: node tools/make-fake-camera.mjs <저장할 파일.y4m>
// 테스트 손님 QR 5장을 한 장씩 4초 동안 비추고 사이에 1.5초 빈 화면. 크롬이 끝나면 처음부터 반복한다.
// 크롬 실행: chrome --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=<파일>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { people } from './test-people.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BMQR = require(path.join(root, 'shared/bmqr.js'));
const qrcode = require(path.join(root, 'vendor/qrcode.js'));

const out = process.argv[2];
if (!out) { console.error('저장할 파일 경로를 주세요'); process.exit(1); }

const W = 640, H = 480, FPS = 5, CELL = 5;
const SHOW = 4, GAP = 1.5, LEAD = 2;
const Y_BLACK = 16, Y_WHITE = 235, Y_BG = 110;

function frame(mods) {
  const y = Buffer.alloc(W * H, Y_BG);
  if (mods) {
    const n = mods.length, size = (n + 8) * CELL;
    const ox = Math.floor((W - size) / 2), oy = Math.floor((H - size) / 2);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const c = Math.floor(px / CELL) - 4, r = Math.floor(py / CELL) - 4;
        const dark = c >= 0 && r >= 0 && c < n && r < n && mods[r][c];
        y[(oy + py) * W + ox + px] = dark ? Y_BLACK : Y_WHITE;
      }
    }
  }
  const uv = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  return Buffer.concat([Buffer.from('FRAME\n'), y, uv]);
}

const blank = frame(null);
const fd = fs.openSync(out, 'w');
fs.writeSync(fd, `YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`);
let frames = 0;
const put = (buf, sec) => { for (let i = 0; i < Math.round(sec * FPS); i++) { fs.writeSync(fd, buf); frames++; } };

put(blank, LEAD);
for (const { p, grp, name } of people) {
  const q = qrcode(0, 'M');
  const text = BMQR.encodeCompact(p, grp);
  q.addData(text, BMQR.qrMode(text));
  q.make();
  const n = q.getModuleCount();
  if ((n + 8) * CELL > H) throw new Error('QR이 화면보다 큽니다: ' + p.name);
  const mods = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
  put(frame(mods), SHOW);
  put(blank, GAP);
}
fs.closeSync(fd);
console.log(`${out}: ${frames}프레임, ${(frames / FPS).toFixed(1)}초, ${(fs.statSync(out).size / 1e6).toFixed(1)}MB`);
