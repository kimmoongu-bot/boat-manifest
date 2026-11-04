/* 아주 작은 엑셀(.xlsx) 만들기 — 외부 라이브러리 없이 XML 몇 개를 zip(무압축)으로 묶는다
 * Xlsx.build([{ name, title, info:[줄…], columns:[{header, width}], rows:[[값…]] }]) → Uint8Array
 * 스타일: 제목 굵게, 머리글 회색 바탕, 칸마다 테두리·줄바꿈. 머리글 줄 고정, 가로로 인쇄
 */
(function (root) {
  'use strict';

  var enc = new TextEncoder();

  function xmlEsc(v) {
    return String(v == null ? '' : v)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function colName(i) {
    var s = '';
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
    return s;
  }
  function cell(ref, v, style) {
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '" s="' + style + '"><v>' + v + '</v></c>';
    return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>';
  }

  function sheetXml(s) {
    var ncol = s.columns.length, last = colName(ncol - 1);
    var rows = [], r = 0, merges = [];
    function row(cells, height) {
      r++;
      rows.push('<row r="' + r + '"' + (height ? ' ht="' + height + '" customHeight="1"' : '') + '>' + cells + '</row>');
    }
    if (s.title) { row(cell('A1', s.title, 3), 24); merges.push('A1:' + last + '1'); }
    (s.info || []).forEach(function (line) { row(cell('A' + (r + 1), line, 4)); merges.push('A' + r + ':' + last + r); });
    if (s.title || (s.info || []).length) row('');
    var headerRow = r + 1;
    row(s.columns.map(function (c, i) { return cell(colName(i) + headerRow, c.header, 1); }).join(''), 22);
    s.rows.forEach(function (vals) {
      var rr = r + 1;
      row(vals.map(function (v, i) { return cell(colName(i) + rr, v, 2); }).join(''));
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:' + last + Math.max(r, 1) + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + headerRow + '" topLeftCell="A' + (headerRow + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="16.5"/>' +
      '<cols>' + s.columns.map(function (c, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.width || 12) + '" customWidth="1"/>'; }).join('') + '</cols>' +
      '<sheetData>' + rows.join('') + '</sheetData>' +
      (merges.length ? '<mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '') +
      '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3">' +
      '<font><sz val="10"/><name val="맑은 고딕"/><family val="3"/><charset val="129"/></font>' +
      '<font><b/><sz val="10"/><name val="맑은 고딕"/><family val="3"/><charset val="129"/></font>' +
      '<font><b/><sz val="14"/><name val="맑은 고딕"/><family val="3"/><charset val="129"/></font>' +
    '</fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE8F1"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FF8FA3B3"/></left><right style="thin"><color rgb="FF8FA3B3"/></right>' +
      '<top style="thin"><color rgb="FF8FA3B3"/></top><bottom style="thin"><color rgb="FF8FA3B3"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function sheetName(n, used) {
    var s = String(n || 'Sheet').replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31) || 'Sheet', base = s, k = 2;
    while (used[s]) s = base.slice(0, 28) + ' ' + (k++);
    used[s] = true;
    return s;
  }

  function build(sheets) {
    var used = {};
    var names = sheets.map(function (s) { return sheetName(s.name, used); });
    var files = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
        '</Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map(function (n, i) { return '<sheet name="' + xmlEsc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
        '</sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', STYLES]
    ];
    sheets.forEach(function (s, i) { files.push(['xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s)]); });
    return zip(files.map(function (f) { return { name: f[0], data: enc.encode(f[1]) }; }));
  }

  // ---------- zip (무압축) ----------
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(d) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(entries) {
    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    var parts = [], central = [], offset = 0;
    entries.forEach(function (e) {
      var name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
      c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      parts.push(new Uint8Array(h.buffer), name, e.data);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + size;
    });
    var cdSize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]);
    var out = new Uint8Array(all.reduce(function (s, p) { return s + p.length; }, 0)), pos = 0;
    all.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  root.Xlsx = { build: build, MIME: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
})(window);
