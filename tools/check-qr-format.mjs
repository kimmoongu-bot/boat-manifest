// QR 형식 점검: node tools/check-qr-format.mjs
// 1) BM2 로 만들고 다시 읽었을 때 항목이 하나도 빠지거나 바뀌지 않는지 (전화번호는 하이픈 표기만 맞춤)
// 2) 같은 사람을 BM1·BM2 로 만들었을 때 QR 버전 비교
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BMQR = require(path.join(root, 'shared/bmqr.js'));
const qrcode = require(path.join(root, 'vendor/qrcode.js'));

const KEYS = ['name', 'birth', 'sex', 'addr', 'phone', 'emerName', 'emerPhone', 'grp', 'idx', 'cnt', 'made'];

function expected(p, g) {
  return {
    name: p.name, birth: p.birth, sex: p.sex, addr: p.addr,
    phone: BMQR.fmtPhone(p.phone), emerName: p.emerName, emerPhone: BMQR.fmtPhone(p.emerPhone),
    grp: g ? g.grp : '', idx: g ? g.idx : 1, cnt: g ? g.cnt : 1, made: p.made,
  };
}

// --- 1) 빠짐 검사 ---
const cases = [
  [{ name: '김바다', birth: '1965-03-12', sex: '남', addr: '경상남도 통영시 도남로 123', phone: '010-2345-6789', emerName: '이미영', emerPhone: '061-987-6543', made: '2026-11-02' }],
  [{ name: '남궁 바다', birth: '2015-04-02', sex: '여', addr: '서울특별시 강남구 테헤란로 1, 2층 (역삼동) "A동" #201', phone: '02-123-4567', emerName: "O'Neil 김", emerPhone: '010-9999-0000', made: '2025-01-31' }, { grp: 'K7Q2XA', idx: 3, cnt: 12 }],
  [{ name: '이', birth: '1900-01-01', sex: '여', addr: '경상남도 남해군 삼동면 물건리 123-45 바다빌라 101동 1001호 '.repeat(2).trim(), phone: '016-123-4567', emerName: '박', emerPhone: '031-1234-5678', made: '2099-12-31' }, { grp: 'ZZZZZZ', idx: 1, cnt: 2 }],
];
let fail = 0;
for (const [p, g] of cases) {
  const got = BMQR.decode(BMQR.encodeCompact(p, g));
  const want = expected(p, g);
  for (const k of KEYS) {
    if (!got || got[k] !== want[k]) { fail++; console.log('✗', p.name, k, JSON.stringify(got && got[k]), '≠', JSON.stringify(want[k])); }
  }
}
// 무작위 300명
for (let i = 0; i < 300; i++) {
  const p = { name: '홍' + '길동'.repeat(i % 3) + i, birth: `19${10 + (i % 89)}-0${1 + (i % 9)}-1${i % 9}`, sex: i % 2 ? '여' : '남',
    addr: '부산광역시 사하구 다대로 ' + i + ' ' + '가나다라마바사아자차카타파하'.slice(0, i % 14) + ' ' + i * 7 + '호',
    phone: '010-' + String(1000 + i).padStart(4, '0') + '-' + String(9999 - i).padStart(4, '0'), emerName: '비상' + i, emerPhone: '010-5' + String(i).padStart(3, '0') + '-0000', made: '2026-0' + (1 + (i % 9)) + '-2' + (i % 9) };
  const g = i % 4 ? { grp: 'G' + String(i).padStart(5, '0'), idx: 1 + (i % 7), cnt: 8 } : undefined;
  const got = BMQR.decode(BMQR.encodeCompact(p, g)), want = expected(p, g);
  for (const k of KEYS) if (!got || got[k] !== want[k]) { fail++; if (fail < 10) console.log('✗ 무작위', i, k); }
}
console.log(fail ? `항목 검사: 실패 ${fail}건` : `항목 검사: ${cases.length + 300}명 모두 11개 항목이 그대로 돌아옴 (성명·생년월일·성별·주소·휴대전화·비상연락처 이름/번호·일행ID/순번/인원·만든 날짜)`);
console.log('BM1 도 계속 읽힘:', BMQR.decode(BMQR.encode(cases[0][0]))?.name === '김바다' ? '예' : '아니오');

// --- 2) 버전 비교 ---
function version(text, ecc) {
  const q = qrcode(0, ecc); q.addData(text, BMQR.qrMode(text)); q.make();
  const n = q.getModuleCount();
  return { v: (n - 17) / 4, n };
}
const long = { name: '김바다', birth: '1965-03-12', sex: '남', addr: '경상남도 남해군 삼동면 물건리 123-45 바다빌라 101동 1001호', phone: '010-1234-5678', emerName: '이미영', emerPhone: '010-9876-5432', made: '2026-11-02' };
const rows = [
  ['긴 주소 · 혼자', long, undefined],
  ['긴 주소 · 일행', long, { grp: 'K7Q2XA', idx: 2, cnt: 4 }],
  ['보통 주소 · 혼자', { ...long, addr: '경상남도 통영시 도남로 123' }, undefined],
];
console.log('\n형식별 QR 버전 (오류 복원 M, 괄호는 한 변 칸 수)');
console.log('사례'.padEnd(14) + 'BM1 글자수  BM1 버전     BM2 글자수  BM2 버전     한 칸 크기');
for (const [label, p, g] of rows) {
  const a = BMQR.encode(p, g), b = BMQR.encodeCompact(p, g);
  const va = version(a, 'M'), vb = version(b, 'M');
  const ratio = ((va.n + 8) / (vb.n + 8) * 100 - 100).toFixed(0);
  console.log(label.padEnd(14) + String(a.length).padEnd(11) + `v${va.v} (${va.n})`.padEnd(13) + String(b.length).padEnd(11) + `v${vb.v} (${vb.n})`.padEnd(13) + `BM2가 ${ratio}% 큼`);
}
process.exit(fail ? 1 : 0);
