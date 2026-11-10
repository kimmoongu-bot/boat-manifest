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

  // 명부 한 장의 줄: 선장·선원이 맨 위, 그다음 승객(제외한 사람은 빼고, 일행끼리 붙여서)
  function manifestRows(voyage, passengers) {
    var rows = [], n = 0;
    (voyage.crew || []).forEach(function (c) {
      rows.push({ no: ++n, kind: c.role, name: c.name, birth: c.birth, sex: c.sex, addr: c.addr, phone: c.phone,
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
      foot: '「낚시 관리 및 육성법」 제33조 승선자명부 · 항목: 같은 법 시행규칙 별지 제16호서식 기준'
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

  // 칸 너비에 맞춰 줄을 나눈다(띄어쓰기 기준, 너무 긴 낱말은 글자 단위)
  function wrap(text, font, size, width) {
    var out = [], line = '';
    String(text == null ? '' : text).split(/\s+/).forEach(function (word) {
      var tryLine = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(tryLine, size) <= width) { line = tryLine; return; }
      if (line) out.push(line);
      line = '';
      var chunk = '';
      Array.from(word).forEach(function (ch) {
        if (font.widthOfTextAtSize(chunk + ch, size) > width && chunk) { out.push(chunk); chunk = ch; }
        else chunk += ch;
      });
      line = chunk;
    });
    if (line || !out.length) out.push(line);
    return out;
  }

  function pdf(vessel, voyage, passengers) {
    var L = root.PDFLib;
    return loadFonts().then(function (fb) {
      return L.PDFDocument.create().then(function (doc) {
        doc.registerFontkit(root.fontkit);
        doc.setTitle(fileBase(vessel, voyage));
        doc.setCreator('승선명부 앱');
        // 명부에 쓰는 글자를 모두 모아 그 글자만 남긴 글꼴을 만든 뒤 통째로 심는다
        var s = summary(vessel, voyage, passengers);
        var text = [s.title, s.foot, '(이어서) — / 0123456789.', dateDots(voyage.date)].concat(s.lines)
          .concat(COLUMNS.map(function (c) { return c.header; }))
          .concat(manifestRows(voyage, passengers).map(function (r) { return COLUMNS.map(function (c) { return r[c.key]; }).join(' '); }))
          .join(' ');
        return Promise.all([FontSubset.subset(fb[2], fb[0], text), FontSubset.subset(fb[2], fb[1], text)]).then(function (sub) {
          return Promise.all([doc.embedFont(sub[0], { subset: false }), doc.embedFont(sub[1], { subset: false })]);
        }).then(function (f) {
          drawPdf(L, doc, f[0], f[1], vessel, voyage, passengers);
          return doc.save();
        });
      });
    });
  }

  function drawPdf(L, doc, font, bold, vessel, voyage, passengers) {
    var W = 842, H = 595, M = 28, SIZE = 8.5, LH = 11, PAD = 4;
    var ink = L.rgb(0.05, 0.1, 0.14), line = L.rgb(0.55, 0.64, 0.7), head = L.rgb(0.86, 0.91, 0.95), muted = L.rgb(0.3, 0.36, 0.42);
    var s = summary(vessel, voyage, passengers), rows = manifestRows(voyage, passengers);
    var pages = [], page, y;

    function newPage() {
      page = doc.addPage([W, H]);
      pages.push(page);
      y = H - M;
      if (pages.length === 1) {
        page.drawText(s.title, { x: M, y: y - 16, size: 16, font: bold, color: ink });
        y -= 30;
        s.lines.forEach(function (t) { page.drawText(t, { x: M, y: y - 9, size: 9.5, font: font, color: ink }); y -= 15; });
        y -= 6;
      } else {
        page.drawText(s.title + ' — ' + dateDots(voyage.date) + ' ' + voyage.no + '항차 (이어서)', { x: M, y: y - 10, size: 10, font: bold, color: ink });
        y -= 20;
      }
      drawRow(COLUMNS.map(function (c) { return [c.header]; }), 20, true);
    }
    function drawRow(cellLines, h, isHead) {
      var x = M;
      COLUMNS.forEach(function (c, i) {
        page.drawRectangle({ x: x, y: y - h, width: c.pdf, height: h, borderColor: line, borderWidth: 0.6, color: isHead ? head : undefined });
        cellLines[i].forEach(function (t, k) {
          var f = isHead ? bold : font;
          var tx = isHead ? x + (c.pdf - f.widthOfTextAtSize(t, SIZE)) / 2 : x + PAD;
          page.drawText(t, { x: tx, y: y - PAD - 7.5 - k * LH, size: SIZE, font: f, color: ink });
        });
        x += c.pdf;
      });
      y -= h;
    }

    newPage();
    rows.forEach(function (r) {
      var cells = COLUMNS.map(function (c) {
        var v = r[c.key];
        if (c.key === 'birth') v = String(v || '').replace(/-/g, '.');
        return wrap(v, font, SIZE, c.pdf - PAD * 2);
      });
      var h = Math.max.apply(null, cells.map(function (c) { return c.length; })) * LH + PAD * 2 - 1;
      if (y - h < M + 18) newPage();
      drawRow(cells, h, false);
    });
    pages.forEach(function (p, i) {
      p.drawText(s.foot, { x: M, y: M - 4, size: 7.5, font: font, color: muted });
      var t = (i + 1) + ' / ' + pages.length;
      p.drawText(t, { x: W - M - font.widthOfTextAtSize(t, 8), y: M - 4, size: 8, font: font, color: muted });
    });
  }

  // ---------- 엑셀 ----------
  function sheetFor(vessel, voyage, passengers, name) {
    var s = summary(vessel, voyage, passengers);
    return {
      name: name || (voyage.date + ' ' + voyage.no + '항차'),
      title: s.title, info: s.lines,
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
  function png(vessel, voyage, passengers) {
    return loadImgFont().then(function () {
      var s = summary(vessel, voyage, passengers), rows = manifestRows(voyage, passengers);
      var IMGW = COLUMNS.reduce(function (a, c) { return a + c.img; }, 0);
      var K = 2;                       // 사진용 칸 너비(img)의 2배를 픽셀로
      var M = 32, W = IMGW * K + M * 2, FS = 20, LH = 28, PADX = 8, PADY = 10;
      var c = document.createElement('canvas'), g = c.getContext('2d');
      var F = function (bold, size) { return (bold ? '700 ' : '400 ') + (size || FS) + 'px BMPretendard, sans-serif'; };
      var lines = function (text, width, bold) {
        g.font = F(bold);
        var out = [], line = '';
        String(text == null || text === '' ? '-' : text).split(/\s+/).forEach(function (word) {
          var t = line ? line + ' ' + word : word;
          if (g.measureText(t).width <= width) { line = t; return; }
          if (line) out.push(line);
          line = '';
          while (g.measureText(word).width > width) {
            var i = word.length;
            while (i > 1 && g.measureText(word.slice(0, i)).width > width) i--;
            out.push(word.slice(0, i)); word = word.slice(i);
          }
          line = word;
        });
        if (line) out.push(line);
        return out;
      };
      var cell = function (r, col) {
        var v = r[col.key];
        if (col.key === 'birth') v = String(v || '').replace(/-/g, '.');
        return v;
      };
      // 줄 높이 먼저 계산
      var head = COLUMNS.map(function (col) { return lines(col.header, col.img * K - PADX * 2, true); });
      var headH = Math.max.apply(null, head.map(function (l) { return l.length; })) * LH + PADY * 2;
      var body = rows.map(function (r) {
        var cells = COLUMNS.map(function (col) { return lines(cell(r, col), col.img * K - PADX * 2, col.key === 'name'); });
        return { r: r, cells: cells, h: Math.max.apply(null, cells.map(function (l) { return l.length; })) * LH + PADY * 2 };
      });
      var top = M + 44 + s.lines.length * 30 + 20;
      var H = top + headH + body.reduce(function (a, b) { return a + b.h; }, 0) + 24 + 26 + M;
      c.width = W; c.height = H;
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#111'; g.textBaseline = 'top';
      g.font = F(true, 32); g.fillText(s.title, M, M);
      g.font = F(false, 20);
      s.lines.forEach(function (t, i) { g.fillText(t, M, M + 48 + i * 30); });
      var drawRow = function (y, h, cells, fill, bold) {
        var x = M;
        if (fill) { g.fillStyle = fill; g.fillRect(M, y, IMGW * K, h); }
        COLUMNS.forEach(function (col, ci) {
          var w = col.img * K;
          g.strokeStyle = '#555'; g.lineWidth = 1.5; g.strokeRect(x, y, w, h);
          g.fillStyle = cells[ci].join('') === '확인 안 함' ? '#B91C1C' : '#111';
          g.font = F(bold || col.key === 'name');
          cells[ci].forEach(function (t, li) { g.fillText(t, x + PADX, y + PADY + li * LH + 2); });
          x += w;
        });
      };
      var y = top;
      drawRow(y, headH, head, '#E8EEF3', true); y += headH;
      body.forEach(function (b) { drawRow(y, b.h, b.cells, b.r.kind === '승객' ? null : '#F4F7FA'); y += b.h; });
      if (!rows.length) { g.fillStyle = '#666'; g.font = F(false); g.fillText('명부에 들어갈 사람이 없습니다', M, y + 12); }
      g.fillStyle = '#666'; g.font = F(false, 16); g.fillText(s.foot, M, y + 24);
      return new Promise(function (resolve, reject) {
        c.toBlob(function (blob) {
          if (!blob) return reject(new Error('PNG'));
          blob.arrayBuffer().then(function (ab) { resolve(new Uint8Array(ab)); }, reject);
        }, 'image/png');
      });
    });
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
    COLUMNS: COLUMNS, manifestRows: manifestRows, summary: summary, fileBase: fileBase, pdf: pdf, png: png, xlsx: xlsx, monthXlsx: monthXlsx,
    deliver: deliver, save: save, dateTime: dateTime, hm: hm,
    PDF_MIME: 'application/pdf'
  };
})(window);
