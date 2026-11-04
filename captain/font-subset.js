/* PDF 한글 글꼴: HarfBuzz(hb-subset, wasm)로 명부에 쓴 글자만 남긴 작은 글꼴을 만든다
 * pdf-lib 의 subset 옵션(fontkit)은 한글 글자가 빠지는 문제가 있어 쓰지 않는다 → 여기서 줄인 글꼴을 통째로 심는다
 */
(function (root) {
  'use strict';

  var hbp = null;
  function hb(wasmBytes) {
    if (!hbp) hbp = WebAssembly.instantiate(wasmBytes).then(function (r) { return r.instance.exports; });
    return hbp;
  }

  // fontBytes: ArrayBuffer(TTF), text: 쓸 글자 전부 → Uint8Array(줄인 TTF)
  function subset(wasmBytes, fontBytes, text) {
    return hb(wasmBytes).then(function (x) {
      var font = new Uint8Array(fontBytes);
      var ptr = x.malloc(font.byteLength);
      new Uint8Array(x.memory.buffer).set(font, ptr);
      var blob = x.hb_blob_create(ptr, font.byteLength, 2 /* WRITABLE */, 0, 0);
      var face = x.hb_face_create(blob, 0);
      x.hb_blob_destroy(blob);
      var input = x.hb_subset_input_create_or_fail();
      // GSUB·GPOS 를 뺀다: 숫자 사이 '-' ':' 를 대체 글자로 바꾸는 규칙 때문에 pdf-lib 가 너비를 잘못 적어 간격이 벌어진다.
      // 한글은 완성형이라 이 규칙이 필요 없다
      var drop = x.hb_subset_input_set(input, 3 /* HB_SUBSET_SETS_DROP_TABLE_TAG */);
      ['GSUB', 'GPOS'].forEach(function (t) { x.hb_set_add(drop, (t.charCodeAt(0) << 24 | t.charCodeAt(1) << 16 | t.charCodeAt(2) << 8 | t.charCodeAt(3)) >>> 0); });
      var set = x.hb_subset_input_unicode_set(input);
      var seen = {};
      Array.from(String(text) + ' ').forEach(function (ch) {
        var cp = ch.codePointAt(0);
        if (!seen[cp]) { seen[cp] = true; x.hb_set_add(set, cp); }
      });
      var sub = x.hb_subset_or_fail(face, input);
      x.hb_subset_input_destroy(input);
      if (!sub) { x.hb_face_destroy(face); x.free(ptr); throw new Error('SUBSET'); }
      var res = x.hb_face_reference_blob(sub);
      var off = x.hb_blob_get_data(res, 0), len = x.hb_blob_get_length(res);
      var out = new Uint8Array(x.memory.buffer).slice(off, off + len);   // 메모리가 늘었을 수 있어 새로 읽는다
      x.hb_blob_destroy(res);
      x.hb_face_destroy(sub);
      x.hb_face_destroy(face);
      x.free(ptr);
      if (!len) throw new Error('SUBSET');
      return out;
    });
  }

  root.FontSubset = { subset: subset };
})(typeof window !== 'undefined' ? window : globalThis);
