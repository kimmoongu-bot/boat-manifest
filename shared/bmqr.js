/* 승선 QR 형식 (손님·선장 공용)
 * BM1: "BM1:" + LZString.compressToEncodedURIComponent(JSON 객체)   ← 예전 형식. 선장 앱은 계속 읽는다
 * BM2: "BM2:" + base45(LZString.compressToUint8Array(JSON 순서 배열)) ← 손님 앱이 만드는 형식. 더 작은 QR(영숫자 모드)
 * 승객 1명 = QR 1장. 배 이름·날짜·항차는 넣지 않는다(선장 앱이 붙임).
 */
(function (root) {
  'use strict';

  var PREFIX = 'BM1:';
  var PREFIX2 = 'BM2:';
  var VERSION = 1;
  var FIELDS = ['name', 'birth', 'sex', 'addr', 'phone', 'emerName', 'emerPhone'];
  var B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

  function getLZ() {
    if (root.LZString) return root.LZString;
    if (typeof require === 'function') return require('../vendor/lz-string.min.js');
    throw new Error('LZString 이 없습니다');
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // 숫자만 받아 하이픈을 붙인다 (010-1234-5678, 02-123-4567)
  function fmtPhone(v) {
    var d = String(v || '').replace(/\D/g, '').slice(0, 11);
    var a = d.indexOf('02') === 0 ? 2 : 3;
    if (d.length <= a) return d;
    if (d.length <= a + 3) return d.slice(0, a) + '-' + d.slice(a);
    var rest = d.slice(a);
    if (rest.length < 7) return d.slice(0, a) + '-' + rest.slice(0, 3) + '-' + rest.slice(3);
    return d.slice(0, a) + '-' + rest.slice(0, rest.length - 4) + '-' + rest.slice(-4);
  }
  // 19650312 → 1965-03-12
  function fmtBirthInput(v) {
    var d = String(v || '').replace(/\D/g, '').slice(0, 8);
    if (d.length <= 4) return d;
    if (d.length <= 6) return d.slice(0, 4) + '-' + d.slice(4);
    return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
  }

  // person: {name, birth, sex, addr, phone, emerName, emerPhone, made?}
  // group : {grp, idx, cnt} — 혼자면 생략
  function toData(person, group) {
    group = group || {};
    var data = { v: VERSION };
    FIELDS.forEach(function (k) { data[k] = String(person[k] || '').trim(); });
    data.grp = group.grp || '';
    data.idx = group.idx || 1;
    data.cnt = group.cnt || 1;
    data.made = person.made || today();
    return data;
  }

  function encode(person, group) {
    return PREFIX + getLZ().compressToEncodedURIComponent(JSON.stringify(toData(person, group)));
  }

  // 작은 QR 형식: 키 이름을 빼고 순서로, 숫자는 하이픈 없이, 영숫자 모드(base45)
  function encodeCompact(person, group) {
    var d = toData(person, group);
    var arr = [d.name, d.birth.replace(/-/g, ''), d.sex === '여' ? 2 : 1, d.addr, d.phone.replace(/\D/g, ''),
      d.emerName, d.emerPhone.replace(/\D/g, ''), d.grp, d.idx, d.cnt, d.made.replace(/-/g, '').slice(2)];
    return PREFIX2 + b45enc(getLZ().compressToUint8Array(JSON.stringify(arr)));
  }

  function b45enc(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 2) {
      if (i + 1 < bytes.length) {
        var x = bytes[i] * 256 + bytes[i + 1];
        s += B45[x % 45] + B45[Math.floor(x / 45) % 45] + B45[Math.floor(x / 2025)];
      } else {
        s += B45[bytes[i] % 45] + B45[Math.floor(bytes[i] / 45)];
      }
    }
    return s;
  }
  function b45dec(s) {
    var out = [];
    for (var i = 0; i < s.length; i += 3) {
      var c = s.substr(i, 3), v = 0, m = 1;
      for (var k = 0; k < c.length; k++) {
        var n = B45.indexOf(c[k]);
        if (n < 0) throw new Error('base45');
        v += n * m; m *= 45;
      }
      if (c.length === 3) { if (v > 65535) throw new Error('base45'); out.push(v >> 8, v & 255); }
      else if (c.length === 2) { if (v > 255) throw new Error('base45'); out.push(v); }
      else throw new Error('base45');
    }
    return new Uint8Array(out);
  }

  // QR 그릴 때 쓸 모드: BM2 는 영숫자 모드(같은 글자 수에 칸이 훨씬 적다)
  function qrMode(text) {
    return /^[0-9A-Z $%*+\-./:]+$/.test(text) ? 'Alphanumeric' : 'Byte';
  }

  // 성공: 데이터 객체, 실패: null
  function decode(text) {
    if (typeof text !== 'string') return null;
    try {
      var data;
      if (text.indexOf(PREFIX) === 0) {
        var json = getLZ().decompressFromEncodedURIComponent(text.slice(PREFIX.length));
        if (!json) return null;
        data = JSON.parse(json);
      } else if (text.indexOf(PREFIX2) === 0) {
        var a = JSON.parse(getLZ().decompressFromUint8Array(b45dec(text.slice(PREFIX2.length))));
        if (!Array.isArray(a) || a.length < 11) return null;
        var b = String(a[1]), md = String(a[10]);
        data = { v: 2, name: a[0], birth: b.slice(0, 4) + '-' + b.slice(4, 6) + '-' + b.slice(6, 8), sex: a[2] === 2 ? '여' : '남',
          addr: a[3], phone: fmtPhone(a[4]), emerName: a[5], emerPhone: fmtPhone(a[6]), grp: a[7] || '', idx: a[8] || 1, cnt: a[9] || 1,
          made: '20' + md.slice(0, 2) + '-' + md.slice(2, 4) + '-' + md.slice(4, 6) };
      } else {
        return null;
      }
      if (!data || typeof data !== 'object' || !data.name || !/^\d{4}-\d{2}-\d{2}$/.test(data.birth)) return null;
      FIELDS.forEach(function (k) { data[k] = String(data[k] == null ? '' : data[k]); });
      data.grp = String(data.grp || '');
      data.idx = Number(data.idx) || 1;
      data.cnt = Number(data.cnt) || 1;
      return data;
    } catch (e) {
      return null;
    }
  }

  // 만 나이 (birth: YYYY-MM-DD, on: Date)
  function age(birth, on) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth || '');
    if (!m) return null;
    on = on || new Date();
    var a = on.getFullYear() - Number(m[1]);
    var md = (on.getMonth() + 1) * 100 + on.getDate();
    if (md < Number(m[2]) * 100 + Number(m[3])) a--;
    return a;
  }

  // 같은 사람 판단 키: 성명+생년월일+전화번호
  function personKey(p) {
    return [String(p.name || '').replace(/\s/g, ''), p.birth || '', String(p.phone || '').replace(/\D/g, '')].join('|');
  }

  var api = {
    PREFIX: PREFIX, PREFIX2: PREFIX2, VERSION: VERSION, FIELDS: FIELDS,
    encode: encode, encodeCompact: encodeCompact, decode: decode, qrMode: qrMode,
    age: age, personKey: personKey, today: today, fmtPhone: fmtPhone, fmtBirthInput: fmtBirthInput
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BMQR = api;
})(typeof window !== 'undefined' ? window : globalThis);
