/* 명부 내보내기: PDF(제출용) · 사진 PNG(카톡용) · 엑셀(보관용) · 공유/다운로드 (명부 보기 화면도 manifestRows·summary 를 같이 쓴다)
 * PDF 한글: HarfBuzz(hb-subset)로 Pretendard TTF 에서 명부에 쓴 글자만 남긴 글꼴을 만들어 pdf-lib 로 통째로 심는다
 *   (pdf-lib 자체 subset 은 한글이 빠지는 문제가 있어 쓰지 않음). 글꼴·wasm 은 vendor 에 두고 오프라인 캐시
 */
(function (root) {
  'use strict';

  var COLUMNS = [
    { key: 'no', header: '번호', pdf: 24, xl: 6, img: 30 },
    { key: 'kind', header: '구분', pdf: 32, xl: 7, img: 32 },
    { key: 'name', header: '성명', pdf: 50, xl: 10, img: 50 },
    { key: 'birth', header: '생년월일', pdf: 54, xl: 12, img: 64 },
    { key: 'sex', header: '성별', pdf: 26, xl: 6, img: 26 },
    { key: 'addr', header: '주소', pdf: 268, xl: 40, img: 238 },
    { key: 'phone', header: '휴대전화', pdf: 76, xl: 15, img: 84 },
    { key: 'emer', header: '비상연락처', pdf: 100, xl: 24, img: 100 },
    { key: 'group', header: '일행', pdf: 80, xl: 18, img: 80 },
    { key: 'idcheck', header: '신분증 확인', pdf: 76, xl: 18, img: 76 }
  ];

  var WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateDots(ymd) {
    var d = Rules.dateOf(ymd);
    return d ? ymd.replace(/-/g, '.') + ' (' + WEEK[d.getDay()] + ')' : '';
  }
  function dateTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function hm(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  // 명부 한 장의 줄: 선장(1번) → 사무장(있으면 2번) → 선원 → 승객(제외한 사람은 빼고, 일행끼리 붙여서)
  function roleRank(r) { return r === '선장' ? 0 : r === '사무장' ? 1 : 2; }
  function manifestRows(voyage, passengers) {
    var rows = [], n = 0;
    (voyage.crew || []).map(function (c, i) { return { c: c, i: i }; })
      .sort(function (a, b) { return roleRank(a.c.role) - roleRank(b.c.role) || a.i - b.i; })
      .forEach(function (x) { var c = x.c;
      rows.push({ no: ++n, kind: c.role, name: c.name, birth: c.birth, sex: c.sex, addr: c.addr, phone: c.phone, license: c.license || '',
        emer: '-', group: '-', idcheck: '-' });
    });
    var active = passengers.filter(function (p) { return !p.excluded; });
    var reps = {};
    active.forEach(function (p) {
      if (!p.grp) return;
      var r = reps[p.grp];
      if (!r || (p.idx || 99) < (r.idx || 99)) reps[p.grp] = p;
    });
    var order = [], seen = {};
    active.forEach(function (p) {
      if (!p.grp) { order.push(p); return; }
      if (seen[p.grp]) return;
      seen[p.grp] = true;
      active.filter(function (q) { return q.grp === p.grp; })
        .sort(function (a, b) { return (a.idx || 0) - (b.idx || 0) || a.addedAt - b.addedAt; })
        .forEach(function (q) { order.push(q); });
    });
    order.forEach(function (p) {
      var size = p.grp ? active.filter(function (q) { return q.grp === p.grp; }).length : 0;
      rows.push({ no: ++n, kind: '승객', name: p.name, birth: p.birth, sex: p.sex, addr: p.addr, phone: p.phone,
        emer: (p.emerName + ' ' + p.emerPhone).trim(),
        group: p.grp ? reps[p.grp].name + ' 일행 (' + size + '명)' : '-',
        idcheck: p.idCheckedAt ? dateTime(p.idCheckedAt) : '확인 안 함' });
    });
    return rows;
  }

  var FOOT = '「낚시 관리 및 육성법」 제33조 승선자명부 · 같은 법 시행규칙 별지 제16호서식';
  function summary(vessel, voyage, passengers) {
    var active = passengers.filter(function (p) { return !p.excluded; });
    var crew = (voyage.crew || []).length;
    return {
      title: '낚시어선 승선자명부',
      lines: [
        '선박명 ' + vessel.name + '   선박번호 ' + vessel.number + '   출항일 ' + dateDots(voyage.date) + '   ' + voyage.no + '항차',
        '승선 인원 ' + (active.length + crew) + '명 (선장·선원 ' + crew + '명, 승객 ' + active.length + '명) / 정원 ' + vessel.capacity + '명' +
          (voyage.confirmedAt ? '   명부 확정 ' + dateTime(voyage.confirmedAt) : '   (확정 전)') +
          (voyage.deviceName ? '   작성 기기 ' + voyage.deviceName : '')
      ],
      foot: FOOT
    };
  }

  function fileBase(vessel, voyage) {
    return (voyage.date + '_' + voyage.no + '항차_' + vessel.name).replace(/[\\\/:*?"<>|\s]+/g, '_');
  }

  // ---------- PDF ----------
  var fontBytes = null;
  function loadFonts() {
    if (!fontBytes) {
      fontBytes = Promise.all(['../vendor/fonts/Pretendard-Regular.ttf', '../vendor/fonts/Pretendard-Bold.ttf', '../vendor/hb-subset.wasm'].map(function (u) {
        return fetch(u).then(function (r) { if (!r.ok) throw new Error('FONT'); return r.arrayBuffer(); });
      })).catch(function (e) { fontBytes = null; throw e; });
    }
    return fontBytes;
  }

  // 칸 너비에 맞춰 줄을 나눈다(띄어쓰기 기준, 너무 긴 낱말은 글자 단위). measure(글자, 크기, 굵게) → 너비
  function wrap(text, size, bold, width, measure) {
    var out = [];
    String(text == null ? '' : text).split(/\n/).forEach(function (para) {
      var line = '';
      para.split(/\s+/).forEach(function (word) {
        if (!word) return;
        var tryLine = line ? line + ' ' + word : word;
        if (measure(tryLine, size, bold) <= width) { line = tryLine; return; }
        if (line) out.push(line);
        var chunk = '';
        Array.from(word).forEach(function (ch) {
          if (measure(chunk + ch, size, bold) > width && chunk) { out.push(chunk); chunk = ch; }
          else chunk += ch;
        });
        line = chunk;
      });
      out.push(line);
    });
    return out.length ? out : [''];
  }

  // 법정 서식(낚시 관리 및 육성법 시행규칙 별지 제16호서식) 칸 순서 — PDF 전용. 일행·신분증 확인 같은 앱 정보는 엑셀에만
  var FORM_COLUMNS = [
    { header: '번호', w: 24, get: function (r) { return String(r.no); }, center: true },
    { header: '성명', w: 50, get: function (r) { return r.name; } },
    { header: '생년월일', w: 54, get: function (r) { return String(r.birth || '').replace(/-/g, '.'); } },
    { header: '성별', w: 26, get: function (r) { return r.sex; } },
    { header: '주소', w: 140, get: function (r) { return r.addr; } },
    { header: '전화번호 (휴대전화)', w: 78, get: function (r) { return r.phone; } },
    { header: '비상연락처 (직계가족 등 휴대전화)', w: 87, get: function (r) { return r.kind === '승객' ? r.emer : ''; } },
    { header: '비고 (선원 또는 승객)', w: 80, get: function (r) { return r.kind === '승객' ? '승객' : (r.kind === '선원' ? '선원' : '선원(' + r.kind + ')') + (r.license ? ' / ' + r.license : ''); } }
  ];
  function formDate(ymd) {
    var p = String(ymd || '').split('-');
    return p.length === 3 ? p[0] + '년 ' + p[1] + '월 ' + p[2] + '일' : '';
  }
  // 서식 위쪽: 배 이름·번호, 승선일, 승선인원(정원은 선장이 처음 넣은 배 정보)
  function formHead(vessel, voyage, passengers) {
    var pax = passengers.filter(function (p) { return !p.excluded; }).length, crew = (voyage.crew || []).length;
    return [
      ['선박명: ' + vessel.name, '선박번호: ' + vessel.number],
      ['승선일: ' + formDate(voyage.date) + ' (' + voyage.no + '항차)', '승선인원: ' + (pax + crew) + '명 (선원 ' + crew + '명, 승객 ' + pax + '명) / 정원 ' + vessel.capacity + '명']
    ];
  }
  function formInfo(vessel, voyage) {
    return voyage.confirmedAt ? '명부 확정 ' + dateTime(voyage.confirmedAt) : '확정 전';
  }

  // ---------- 서식 배치: PDF 와 사진(미리보기)이 같은 배치를 그린다 ----------
  // 좌표는 위쪽 기준 pt(A4 595×842). 결과: 쪽마다 그리기 명령 목록
  //   { t:'text', s, x, y(글자 바닥선), size, bold, muted } / { t:'rect', x, y, w, h, fill }
  var PAGE_W = 595, PAGE_H = 842;
  function layoutForm(vessel, voyage, passengers, measure) {
    var M = 28, SIZE = 8.5, LH = 11, PAD = 4, ROW_MIN = 22, BOTTOM = PAGE_H - M - 34;
    var rows = manifestRows(voyage, passengers);
    var cap = Number(vessel.capacity) || 0;
    for (var n = rows.length + 1; n <= cap; n++) rows.push({ no: n, blank: true });   // 정원까지 빈 줄
    var TW = FORM_COLUMNS.reduce(function (a, c) { return a + c.w; }, 0), X0 = (PAGE_W - TW) / 2;
    var title = '승선자 명부', headLines = formHead(vessel, voyage, passengers);
    var pages = [], ops, y;
    var headCells = FORM_COLUMNS.map(function (c) { return wrap(c.header, SIZE, true, c.w - PAD * 2, measure); });
    var headH = Math.max.apply(null, headCells.map(function (c) { return c.length; })) * LH + PAD * 2 + 2;
    function text(str, x, yy, size, bold, muted) { ops.push({ t: 'text', s: str, x: x, y: yy, size: size, bold: !!bold, muted: !!muted }); }
    function newPage(withHead) {
      ops = []; pages.push(ops); y = M + 8;
      if (pages.length === 1) {
        text(title, (PAGE_W - measure(title, 18, true)) / 2, y + 18, 18, true);
        y += 40;
        headLines.forEach(function (pair) { text(pair[0], X0, y + 10, 10.5); text(pair[1], X0 + 230, y + 10, 10.5); y += 17; });
        y += 6;
      } else {
        text(title + ' (이어서) — ' + headLines[0][0] + '   ' + headLines[1][0], X0, y + 10, 10, true);
        y += 22;
      }
      if (withHead !== false) drawRow(headCells, headH, true);
    }
    function drawRow(cellLines, h, isHead) {
      var x = X0;
      FORM_COLUMNS.forEach(function (c, i) {
        ops.push({ t: 'rect', x: x, y: y, w: c.w, h: h, fill: isHead });
        var cnt = cellLines[i].length;
        cellLines[i].forEach(function (t, k) {
          var tx = isHead || c.center ? x + (c.w - measure(t, SIZE, isHead)) / 2 : x + PAD;
          var ty = isHead ? y + (h - cnt * LH) / 2 + 8 + k * LH : y + PAD + 7.5 + k * LH;
          text(t, tx, ty, SIZE, isHead);
        });
        x += c.w;
      });
      y += h;
    }
    newPage();
    rows.forEach(function (r) {
      var cells = FORM_COLUMNS.map(function (c, i) {
        return r.blank ? [i === 0 ? String(r.no) : ''] : wrap(c.get(r), SIZE, false, c.w - PAD * 2, measure);
      });
      var h = Math.max(ROW_MIN, Math.max.apply(null, cells.map(function (c) { return c.length; })) * LH + PAD * 2 - 1);
      if (y + h > BOTTOM) newPage();
      drawRow(cells, h, false);
    });
    // 메모란
    var memo = wrap(voyage.memo || '', 9, false, TW - PAD * 2 - 4, measure);
    var mh = Math.max(64, (memo.length + 1) * 12.5 + PAD * 2 + 6);
    if (y + 10 + mh > BOTTOM) newPage(false);
    y += 10;
    ops.push({ t: 'rect', x: X0, y: y, w: TW, h: mh });
    text('메모', X0 + PAD + 2, y + PAD + 9, 9, true);
    memo.forEach(function (t, k) { text(t, X0 + PAD + 2, y + PAD + 9 + (k + 1) * 12.5, 9); });
    // 아래쪽: 확정 시각 · 근거 · 쪽수
    var info = formInfo(vessel, voyage);
    pages.forEach(function (p, i) {
      ops = p;
      text(info, X0, PAGE_H - M - 8, 7.5, false, true);
      text(FOOT, X0, PAGE_H - M + 3, 7, false, true);
      var t = (i + 1) + ' / ' + pages.length;
      text(t, X0 + TW - measure(t, 8, false), PAGE_H - M - 8, 8, false, true);
    });
    return pages;
  }
  // PDF 글꼴을 줄이기 위해 서식에 쓰는 글자를 모두 모은다
  function formText(vessel, voyage, passengers) {
    return ['승선자 명부 메모', formInfo(vessel, voyage), FOOT, '(이어서) — / 0123456789.:', voyage.memo || '']
      .concat([].concat.apply([], formHead(vessel, voyage, passengers)))
      .concat(FORM_COLUMNS.map(function (c) { return c.header; }))
      .concat(manifestRows(voyage, passengers).map(function (r) { return FORM_COLUMNS.map(function (c) { return c.get(r); }).join(' '); }))
      .join(' ');
  }

  function pdf(vessel, voyage, passengers) {
    var L = root.PDFLib;
    return loadFonts().then(function (fb) {
      return L.PDFDocument.create().then(function (doc) {
        doc.registerFontkit(root.fontkit);
        doc.setTitle(fileBase(vessel, voyage));
        doc.setCreator('승선명부 앱');
        // 서식에 쓰는 글자만 남긴 글꼴을 만들어 통째로 심는다
        var text = formText(vessel, voyage, passengers);
        return Promise.all([FontSubset.subset(fb[2], fb[0], text), FontSubset.subset(fb[2], fb[1], text)]).then(function (sub) {
          return Promise.all([doc.embedFont(sub[0], { subset: false }), doc.embedFont(sub[1], { subset: false })]);
        }).then(function (f) {
          var font = f[0], bold = f[1];
          var ink = L.rgb(0, 0, 0), line = L.rgb(0.25, 0.25, 0.25), head = L.rgb(0.92, 0.92, 0.92), muted = L.rgb(0.35, 0.35, 0.35);
          var measure = function (t, size, b) { return (b ? bold : font).widthOfTextAtSize(t, size); };
          layoutForm(vessel, voyage, passengers, measure).forEach(function (ops) {
            var page = doc.addPage([PAGE_W, PAGE_H]);
            ops.forEach(function (o) {
              if (o.t === 'rect') page.drawRectangle({ x: o.x, y: PAGE_H - o.y - o.h, width: o.w, height: o.h, borderColor: line, borderWidth: 0.7, color: o.fill ? head : undefined });
              else page.drawText(o.s, { x: o.x, y: PAGE_H - o.y, size: o.size, font: o.bold ? bold : font, color: o.muted ? muted : ink });
            });
          });
          return doc.save();
        });
      });
    });
  }

  // ---------- 엑셀 ----------
  function sheetFor(vessel, voyage, passengers, name) {
    var s = summary(vessel, voyage, passengers);
    return {
      name: name || (voyage.date + ' ' + voyage.no + '항차'),
      title: s.title, info: voyage.memo ? s.lines.concat(['메모: ' + voyage.memo.replace(/\s*\n\s*/g, ' / ')]) : s.lines,
      columns: COLUMNS.map(function (c) { return { header: c.header, width: c.xl }; }),
      rows: manifestRows(voyage, passengers).map(function (r) { return COLUMNS.map(function (c) { return r[c.key]; }); })
    };
  }
  function xlsx(vessel, voyage, passengers) {
    return Xlsx.build([sheetFor(vessel, voyage, passengers)]);
  }
  // 한 달 전체: 맨 앞 "전체" 시트(날짜·항차 칸 추가) + 항차마다 시트 한 장
  function monthXlsx(vessel, month, list) {
    var all = [];
    list.forEach(function (it) {
      manifestRows(it.voyage, it.passengers).forEach(function (r) {
        all.push([it.voyage.date, it.voyage.no + '항차'].concat(COLUMNS.map(function (c) { return r[c.key]; })));
      });
    });
    var first = {
      name: '전체', title: '낚시어선 승선자명부 — ' + month.replace('-', '년 ') + '월 전체',
      info: ['선박명 ' + vessel.name + '   선박번호 ' + vessel.number + '   확정한 항차 ' + list.length + '건, ' + all.length + '줄'],
      columns: [{ header: '출항일', width: 12 }, { header: '항차', width: 7 }].concat(COLUMNS.map(function (c) { return { header: c.header, width: c.xl }; })),
      rows: all
    };
    return Xlsx.build([first].concat(list.map(function (it) { return sheetFor(vessel, it.voyage, it.passengers); })));
  }

  // ---------- 사진(PNG): 카톡에서 바로 보이게 명부 한 장을 그림으로 ----------
  var imgFont = null;
  function loadImgFont() {
    if (!imgFont) {
      imgFont = loadFonts().then(function (b) {
        var faces = [new FontFace('BMPretendard', b[0].slice(0), { weight: '400' }), new FontFace('BMPretendard', b[1].slice(0), { weight: '700' })];
        return Promise.all(faces.map(function (f) { return f.load(); })).then(function (fs) { fs.forEach(function (f) { document.fonts.add(f); }); });
      }).catch(function (e) { imgFont = null; throw e; });
    }
    return imgFont;
  }
  // 서식 쪽마다 캔버스 한 장(미리보기 화면에 그대로 보여 주고, 사진 보내기에도 씀)
  var K = 2;   // 1pt = 2px (A4 한 쪽 1190×1684)
  function canvases(vessel, voyage, passengers) {
    return loadImgFont().then(function () {
      var mc = document.createElement('canvas').getContext('2d');
      var F = function (size, b) { return (b ? '700 ' : '400 ') + (size * K) + 'px BMPretendard, sans-serif'; };
      var measure = function (t, size, b) { mc.font = F(size, b); return mc.measureText(t).width / K; };
      return layoutForm(vessel, voyage, passengers, measure).map(function (ops) {
        var c = document.createElement('canvas');
        c.width = PAGE_W * K; c.height = PAGE_H * K;
        var g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.textBaseline = 'alphabetic';
        ops.forEach(function (o) {
          if (o.t === 'rect') {
            if (o.fill) { g.fillStyle = '#EBEBEB'; g.fillRect(o.x * K, o.y * K, o.w * K, o.h * K); }
            g.strokeStyle = '#404040'; g.lineWidth = 0.7 * K; g.strokeRect(o.x * K, o.y * K, o.w * K, o.h * K);
          } else {
            g.font = F(o.size, o.bold); g.fillStyle = o.muted ? '#595959' : '#000';
            g.fillText(o.s, o.x * K, o.y * K);
          }
        });
        return c;
      });
    });
  }
  function toPng(c) {
    return new Promise(function (resolve, reject) {
      c.toBlob(function (blob) {
        if (!blob) return reject(new Error('PNG'));
        blob.arrayBuffer().then(function (ab) { resolve(new Uint8Array(ab)); }, reject);
      }, 'image/png');
    });
  }
  // 쪽마다 PNG 한 장 → [Uint8Array]
  function png(vessel, voyage, passengers) {
    return canvases(vessel, voyage, passengers).then(function (cs) { return Promise.all(cs.map(toPng)); });
  }

  // ---------- 공유 / 다운로드 ----------
  // files: [{name, type, data}] → 'shared' | 'downloaded' | 'mixed' | 'cancelled'
  function deliver(files, title) {
    var objs = files.map(function (f) { return new File([f.data], f.name, { type: f.type }); });
    var can = function (list) {
      try { return !!(navigator.canShare && list.length && navigator.canShare({ files: list })); } catch (e) { return false; }
    };
    var shareable = objs.filter(function (f) { return can([f]); });
    var rest = objs.filter(function (f) { return shareable.indexOf(f) < 0; });
    if (!shareable.length || !can(shareable)) { objs.forEach(download); return Promise.resolve('downloaded'); }
    return navigator.share({ files: shareable, title: title }).then(function () {
      rest.forEach(download);
      return rest.length ? 'mixed' : 'shared';
    }, function (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      objs.forEach(download);
      return 'downloaded';
    });
  }
  // 공유를 시도하지 않고 바로 다운로드 폴더에 저장
  function save(f) { download(new File([f.data], f.name, { type: f.type })); return 'downloaded'; }
  function download(file) {
    var url = URL.createObjectURL(file), a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  root.Export = {
    COLUMNS: COLUMNS, manifestRows: manifestRows, summary: summary, fileBase: fileBase, pdf: pdf, png: png, canvases: canvases, xlsx: xlsx, monthXlsx: monthXlsx,
    deliver: deliver, save: save, dateTime: dateTime, hm: hm,
    PDF_MIME: 'application/pdf'
  };
})(window);
