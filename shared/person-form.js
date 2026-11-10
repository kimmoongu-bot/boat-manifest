/* 사람 정보 입력칸 (손님 앱 · 선장 앱 수동 입력 공용)
 * 같은 항목, 같은 자동 입력 규칙(생년월일 8자리 → YYYY-MM-DD, 전화번호 자동 하이픈), 같은 검사
 */
(function (root) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  function fmtDate(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!m) return '';
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return m[1] + '.' + m[2] + '.' + m[3] + ' (' + WEEK[d.getDay()] + ')';
  }
  function fmtBirth(ymd) { return (ymd || '').replace(/-/g, '.'); }
  function fmtTime(ts) {
    var d = new Date(ts);
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  function field(name, label, control, hint) {
    return '<div class="field" id="wrap-' + name + '">' +
      '<label for="f-' + name + '">' + label + '</label>' + control +
      (hint ? '<p class="hint">' + hint + '</p>' : '') +
      '<p class="err" id="err-' + name + '"></p></div>';
  }

  // opts: { auto: 브라우저 자동완성 쓰기(본인 정보일 때), phoneHint, emergency: 비상연락처 칸 넣기(기본 true) }
  function fieldsHtml(p, opts) {
    p = p || {}; opts = opts || {};
    var ac = function (v) { return opts.auto ? v : 'off'; };
    var html =
      field('name', '성명', '<input id="f-name" name="name" type="text" autocomplete="' + ac('name') + '" maxlength="30" value="' + esc(p.name) + '">') +
      field('birth', '생년월일', '<input id="f-birth" name="birth" type="text" inputmode="numeric" autocomplete="' + ac('bday') + '" placeholder="예) 19650312" maxlength="10" value="' + esc(p.birth) + '">',
        '숫자 8자리로 적으면 자동으로 나뉩니다') +
      '<fieldset class="field" id="wrap-sex"><legend>성별</legend><div class="seg">' +
        ['남', '여'].map(function (s) {
          return '<label class="seg-item"><input type="radio" name="sex" value="' + s + '"' + (p.sex === s ? ' checked' : '') + '><span>' + s + '</span></label>';
        }).join('') +
      '</div><p class="err" id="err-sex"></p></fieldset>' +
      field('addr', '주소', '<textarea id="f-addr" name="addr" rows="2" autocomplete="' + ac('street-address') + '" maxlength="120">' + esc(p.addr) + '</textarea>',
        '시·군·구와 동·읍·면까지는 꼭 적어 주세요') +
      field('phone', '휴대전화', '<input id="f-phone" name="phone" type="tel" inputmode="numeric" autocomplete="' + ac('tel') + '" placeholder="010-0000-0000" maxlength="13" value="' + esc(p.phone) + '">',
        opts.phoneHint || '');
    if (opts.emergency !== false) {
      html += '<fieldset class="group-box"><legend>비상연락처</legend>' +
        '<p class="hint">직계가족 등 휴대전화 (배에 같이 타지 않는 분)</p>' +
        field('emerName', '이름', '<input id="f-emerName" name="emerName" type="text" autocomplete="off" maxlength="30" value="' + esc(p.emerName) + '">') +
        field('emerPhone', '전화번호', '<input id="f-emerPhone" name="emerPhone" type="tel" inputmode="numeric" autocomplete="off" placeholder="010-0000-0000" maxlength="13" value="' + esc(p.emerPhone) + '">') +
      '</fieldset>';
    }
    return html;
  }

  // 자동 입력 규칙 연결 + 고치면 오류 문구 지우기
  function bind(form) {
    var birth = form.querySelector('#f-birth');
    if (birth) birth.addEventListener('input', function () { birth.value = BMQR.fmtBirthInput(birth.value); });
    ['#f-phone', '#f-emerPhone'].forEach(function (sel) {
      var el = form.querySelector(sel);
      if (el) el.addEventListener('input', function () { el.value = BMQR.fmtPhone(el.value); });
    });
    form.addEventListener('input', function (e) { if (e.target.name) setErr(e.target.name, ''); });
    form.addEventListener('change', function (e) { if (e.target.name) setErr(e.target.name, ''); });
  }

  function read(form, fields) {
    var d = {};
    (fields || BMQR.FIELDS).forEach(function (k) {
      var el = form.elements[k];
      d[k] = el ? String(el.value || '').trim().replace(/\s+/g, ' ') : '';
    });
    return d;
  }

  // opts: { mobileOnly: 본인 휴대전화만 허용, emergency: 비상연락처 검사(기본 true) }
  function validate(d, opts) {
    opts = opts || {};
    var e = {};
    if (d.name.length < 2) e.name = '성명을 적어 주세요';
    var bm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.birth);
    if (!bm) e.birth = '생년월일 8자리를 적어 주세요 (예: 19650312)';
    else {
      var y = +bm[1], mo = +bm[2], da = +bm[3], dt = new Date(y, mo - 1, da);
      if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== da) e.birth = '없는 날짜입니다. 다시 확인해 주세요';
      else if (y < 1900 || dt > new Date()) e.birth = '생년월일을 다시 확인해 주세요';
    }
    if (d.sex !== '남' && d.sex !== '여') e.sex = '성별을 골라 주세요';
    if (d.addr.length < 5) e.addr = '주소를 적어 주세요';
    var ph = d.phone.replace(/\D/g, '');
    if (!ph) e.phone = '휴대전화 번호를 적어 주세요';
    else if (opts.mobileOnly ? !/^01[016789]\d{7,8}$/.test(ph) : !/^0\d{8,10}$/.test(ph)) e.phone = '번호를 다시 확인해 주세요';
    if (opts.emergency !== false) {
      if (d.emerName.length < 2) e.emerName = '비상연락처 이름을 적어 주세요';
      var ep = d.emerPhone.replace(/\D/g, '');
      if (!ep) e.emerPhone = '비상연락처 번호를 적어 주세요';
      else if (!/^0\d{8,10}$/.test(ep)) e.emerPhone = '번호를 다시 확인해 주세요';
      else if (ep === ph) e.emerPhone = '본인 번호와 다른 번호를 적어 주세요';
    }
    return e;
  }

  function setErr(name, msg) {
    var el = document.getElementById('err-' + name);
    var wrap = document.getElementById('wrap-' + name);
    if (el) el.textContent = msg ? '⚠ ' + msg : '';
    if (wrap) wrap.classList.toggle('has-err', !!msg);
  }

  // 오류를 모두 표시하고 첫 칸으로 이동. 오류가 있으면 true
  function showErrors(form, errs) {
    var first = null;
    Object.keys(errs).forEach(function (k) { setErr(k, errs[k]); if (!first) first = k; });
    if (!first) return false;
    var target = form.querySelector('[name="' + first + '"]');
    if (target) { target.focus(); target.scrollIntoView({ block: 'center' }); }
    return true;
  }

  root.PersonForm = {
    esc: esc, fmtDate: fmtDate, fmtBirth: fmtBirth, fmtTime: fmtTime, field: field,
    fieldsHtml: fieldsHtml, bind: bind, read: read, validate: validate, setErr: setErr, showErrors: showErrors
  };
})(window);
