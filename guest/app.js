/* 손님용 승선 QR — 정보는 이 폰 localStorage 에만 저장한다(전송 없음) */
(function () {
  'use strict';

  var KEY = 'bm_guest_v1';
  var app = document.getElementById('app');
  var state = load();

  // ---------- 저장소 ----------
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* 깨진 값은 새로 시작 */ }
    s = s && typeof s === 'object' ? s : {};
    s.me = s.me || null;
    s.companions = Array.isArray(s.companions) ? s.companions : [];
    var t = BMQR.today();
    // "다음에도 쓰기"를 안 고른 동행자는 그날만 남긴다
    s.companions = s.companions.filter(function (c) { return c.keep || c.day === t; });
    if (!s.today || s.today.date !== t) s.today = { date: t, ids: [], grp: '' };
    s.today.ids = s.today.ids.filter(function (id) { return findCompanion(id, s); });
    return s;
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      toast('저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.', true);
      return false;
    }
  }
  function findCompanion(id, s) {
    s = s || state;
    for (var i = 0; i < s.companions.length; i++) if (s.companions[i].id === id) return s.companions[i];
    return null;
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function newGroupId() {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    for (var i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }

  // ---------- 작은 도구 ----------
  var esc = PersonForm.esc, fmtDate = PersonForm.fmtDate, fmtBirth = PersonForm.fmtBirth;
  function daysSince(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!m) return 0;
    return Math.floor((Date.now() - new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()) / 86400000);
  }

  var toast = UI.toast, confirmDialog = UI.confirm;

  // ---------- QR 그리기 (SVG) ----------
  function qrSvg(text, label) {
    var q = qrcode(0, 'M');
    q.addData(text, BMQR.qrMode(text));
    q.make();
    var n = q.getModuleCount(), m = 4, path = '';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (q.isDark(r, c)) path += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
      }
    }
    var size = n + m * 2;
    return '<svg class="qr-svg" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + esc(label) +
      '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' + path + '" fill="#000"/></svg>';
  }

  // ---------- 화면 켜짐 유지 (QR 보여 주는 동안) ----------
  var wakeLock = null, wantWake = false;
  function keepAwake(on) {
    wantWake = on;
    if (!('wakeLock' in navigator)) return;
    if (on && !wakeLock) {
      navigator.wakeLock.request('screen').then(function (l) {
        wakeLock = l;
        l.addEventListener('release', function () { wakeLock = null; });
      }).catch(function () {});
    } else if (!on && wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && wantWake) keepAwake(true);
  });

  // ---------- 홈 화면에 추가 ----------
  var installEvent = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEvent = e;
    var b = document.getElementById('install-btn');
    if (b) b.hidden = false;
  });
  window.addEventListener('appinstalled', function () {
    installEvent = null;
    toast('홈 화면에 추가했습니다');
  });

  // ---------- 라우터 ----------
  function go(hash) { location.hash = hash; }
  function route() {
    keepAwake(false);
    var h = location.hash.replace(/^#\/?/, '');
    if (!state.me && h !== 'me/new') return renderWelcome();
    if (state.me && !state.pin) return renderSetPin();
    if (state.me && !unlocked) return renderLock();
    if (h === 'me/new' || h === 'me/edit') return renderPersonForm({ kind: 'me' });
    if (h === 'group') return renderGroup();
    if (h === 'group/qr') return renderGroupQR();
    if (h === 'companion/new') return renderPersonForm({ kind: 'companion' });
    var cm = /^companion\/(.+)$/.exec(h);
    if (cm && findCompanion(cm[1])) return renderPersonForm({ kind: 'companion', id: cm[1] });
    return renderMyQR();
  }
  window.addEventListener('hashchange', function () { route(); window.scrollTo(0, 0); });

  function view(html) {
    app.innerHTML = html;
    var h = app.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  // ---------- 1. 처음 화면 ----------
  function renderWelcome() {
    view(
      '<section class="screen welcome">' +
        '<div class="ticket" aria-hidden="true">' +
          '<div class="ticket-qr">' + qrSvg('BM1:sample', '') + '</div>' +
          '<div class="ticket-side"><span>승선</span><span>QR</span></div>' +
        '</div>' +
        '<h1>배 탈 때마다 명부 쓰지 말고<br>QR 하나 보여 주세요</h1>' +
        '<p class="lead">선장님 폰으로 이 QR을 찍으면 승선자명부에 내 정보가 바로 들어갑니다.</p>' +
        '<ol class="steps">' +
          '<li><b>내 정보 입력</b><span>처음 한 번만 적습니다</span></li>' +
          '<li><b>QR 저장</b><span>이 폰에 남아 있어 인터넷이 안 돼도 열립니다</span></li>' +
          '<li><b>배 탈 때 QR과 신분증 보여 주기</b><span>신분증 확인은 법으로 정해진 절차입니다</span></li>' +
        '</ol>' +
        '<p class="note-plain">내 정보는 이 폰에만 저장되고, 어디로도 보내지지 않습니다.</p>' +
      '</section>' +
      '<div class="bottom-bar"><a class="btn btn-primary" href="#/me/new">내 승선 QR 만들기</a></div>'
    );
  }

  // ---------- 2. 정보 입력 (나 / 동행자 공용) ----------
  function renderPersonForm(opt) {
    var isMe = opt.kind === 'me';
    var p = isMe ? (state.me || {}) : (opt.id ? findCompanion(opt.id) : {});
    var editing = isMe ? !!state.me : !!opt.id;
    var title = isMe ? (editing ? '내 정보' : '내 정보 입력') : (editing ? '동행자 정보' : '동행자 추가');
    var back = isMe ? (editing ? '#/' : '') : '#/group';

    view(
      '<section class="screen">' +
        (back ? '<a class="back" href="' + back + '">← 돌아가기</a>' : '') +
        '<h1>' + title + '</h1>' +
        '<p class="lead">' + (isMe
          ? '승선자명부에 들어가는 항목입니다. 모두 적어야 QR이 만들어집니다.'
          : '같이 타는 사람의 정보입니다. 이 사람 몫의 QR이 따로 한 장 만들어집니다.') + '</p>' +
        '<form id="pform" class="form" novalidate>' +
          PersonForm.fieldsHtml(p, { auto: isMe, phoneHint: isMe ? '' : '휴대전화가 없는 어린이는 보호자 번호를 적어 주세요' }) +
          (isMe ? pinBlock(editing) + consentBlock(editing) : companionChecks(p, editing)) +
          '<div class="bottom-bar bottom-bar-inline">' +
            '<p class="form-errors" id="form-errors" role="alert" hidden></p>' +
            '<button class="btn btn-primary" type="submit">' +
            (isMe ? (editing ? '저장하고 QR 다시 만들기' : '저장하고 QR 만들기') : (editing ? '저장' : '동행자 추가')) +
          '</button></div>' +
        '</form>' +
        (editing ? '<div class="danger-zone">' +
          '<button class="btn btn-danger" type="button" id="del-btn">' + (isMe ? '내 정보 모두 지우기' : '이 동행자 지우기') + '</button>' +
          (isMe ? '<p class="hint">이 폰에 저장된 내 정보와 동행자 정보가 모두 지워집니다.</p>' : '') +
        '</div>' : '') +
      '</section>'
    );

    var form = document.getElementById('pform');
    PersonForm.bind(form);

    var summary = document.getElementById('form-errors');
    if (isMe) form.addEventListener('input', function (e) {
      if (e.target.name === 'pin1' || e.target.name === 'pin2') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = PersonForm.read(form);
      var errs = PersonForm.validate(data, { mobileOnly: isMe });
      if (!isMe && !form.elements.consent.checked) errs.consent = '동행자에게 알리고 동의를 받았는지 체크해 주세요';
      if (isMe && !form.elements.consent.checked) errs.consent = '동의해야 QR을 만들 수 있습니다';
      var pin = isMe ? form.elements.pin1.value : '';
      if (isMe && (!editing || pin || form.elements.pin2.value)) {
        if (!/^\d{4}$/.test(pin)) errs.pin1 = '숫자 4자리로 넣어 주세요';
        else if (pin !== form.elements.pin2.value) errs.pin2 = '두 번 넣은 비밀번호가 다릅니다';
      }
      if (PersonForm.showErrors(form, errs)) {
        // 무엇 때문에 저장이 안 됐는지 저장 버튼 바로 위에 남겨 둔다(토스트는 금방 사라져서 못 보는 경우가 있음)
        summary.hidden = false;
        summary.textContent = '⚠ 저장되지 않았습니다. 빨간 칸을 확인해 주세요: ' +
          Object.keys(errs).map(function (k) { return FIELD_LABEL[k] || k; }).join(', ');
        toast('빠진 항목을 채워 주세요', true);
        return;
      }
      summary.hidden = true;
      data.made = BMQR.today();
      if (isMe) {
        (pin ? hashPin(pin) : Promise.resolve(null)).then(function (newPin) {
          state.me = data;
          if (newPin) state.pin = newPin;
          if (!save()) return;
          unlocked = true;
          toast(editing ? '저장했습니다. QR을 새로 만들었습니다' : 'QR을 만들었습니다');
          go('#/');
        }).catch(function () { toast('비밀번호를 저장하지 못했습니다. 다시 눌러 주세요', true); });
      } else {
        var keep = form.elements.keep.checked;
        if (opt.id) {
          var c = findCompanion(opt.id);
          Object.assign(c, data, { keep: keep, day: BMQR.today() });
        } else {
          var nc = Object.assign({ id: newId(), keep: keep, day: BMQR.today() }, data);
          state.companions.push(nc);
          state.today.ids.push(nc.id);
          state.today.grp = '';
        }
        if (!save()) return;
        toast(opt.id ? '저장했습니다' : data.name + ' 님을 추가했습니다');
        go('#/group');
      }
    });

    var del = document.getElementById('del-btn');
    if (del) del.addEventListener('click', function () {
      var t = isMe ? '내 정보를 모두 지울까요?' : (p.name + ' 님을 지울까요?');
      var b = isMe ? '이 폰에 저장된 내 정보와 동행자 정보가 모두 지워지고, 지금 QR도 쓸 수 없게 됩니다. 되돌릴 수 없습니다.'
                   : '이 동행자의 정보가 이 폰에서 지워집니다.';
      confirmDialog(t, b, '지우기').then(function (ok) {
        if (!ok) return;
        if (isMe) {
          localStorage.removeItem(KEY);
          state = load();
          toast('내 정보를 모두 지웠습니다');
          go('#/');
          route();
        } else {
          state.companions = state.companions.filter(function (c) { return c.id !== opt.id; });
          state.today.ids = state.today.ids.filter(function (id) { return id !== opt.id; });
          state.today.grp = '';
          save();
          toast('지웠습니다');
          go('#/group');
        }
      });
    });
  }

  var FIELD_LABEL = {
    name: '성명', birth: '생년월일', sex: '성별', addr: '주소', phone: '휴대전화', emerName: '비상연락처 이름',
    emerPhone: '비상연락처 번호', consent: '동의 체크', pin1: 'QR 비밀번호', pin2: '비밀번호 한 번 더'
  };

  function pinBlock(editing) {
    var pinInput = function (name) {
      return '<input id="f-' + name + '" name="' + name + '" type="text" inputmode="numeric" data-lpignore="true" spellcheck="false" autocapitalize="off" pattern="[0-9]*" maxlength="4" autocomplete="off" class="pin-input">';
    };
    return '<fieldset class="group-box"><legend>QR 비밀번호</legend>' +
      '<p class="hint">' + (editing ? '바꿀 때만 넣으세요. 비워 두면 지금 비밀번호 그대로입니다.'
        : 'QR을 열 때 넣는 숫자 4자리입니다. 폰을 다른 사람이 봐도 내 정보가 보이지 않게 합니다. 잊으면 정보를 지우고 다시 만들어야 합니다.') + '</p>' +
      PersonForm.field('pin1', editing ? '새 비밀번호 (숫자 4자리)' : '비밀번호 (숫자 4자리)', pinInput('pin1')) +
      PersonForm.field('pin2', '비밀번호 한 번 더', pinInput('pin2')) +
    '</fieldset>';
  }

  // ---------- QR 비밀번호 ----------
  var unlocked = false;   // 비밀번호를 넣었는지 (앱을 새로 열거나 1분 넘게 다른 앱에 있으면 다시 잠김)
  var hiddenAt = 0;
  function toHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
  }
  function hashPin(pin, salt) {
    if (!salt) { var a = new Uint8Array(16); crypto.getRandomValues(a); salt = toHex(a); }
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin)).then(function (h) {
      return { salt: salt, hash: toHex(h) };
    });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (state.pin && unlocked && hiddenAt && Date.now() - hiddenAt > 60000) { unlocked = false; route(); }
  });

  function renderLock() {
    view(
      '<section class="screen lock">' +
        '<h1>승선QR</h1>' +
        '<p class="lead">' + esc(state.me.name) + ' 님, QR 비밀번호 4자리를 넣어 주세요.</p>' +
        '<form id="lockf" class="form" novalidate>' +
          PersonForm.field('pin', '비밀번호', '<input id="f-pin" name="pin" type="text" inputmode="numeric" data-lpignore="true" spellcheck="false" autocapitalize="off" pattern="[0-9]*" maxlength="4" autocomplete="off" class="pin-input pin-big">') +
          '<button class="btn btn-primary" type="submit">QR 열기</button>' +
        '</form>' +
        '<button class="btn btn-ghost" type="button" id="forgot">비밀번호를 잊었어요</button>' +
      '</section>'
    );
    var f = document.getElementById('lockf'), input = document.getElementById('f-pin');
    input.focus();
    function check() {
      hashPin(input.value, state.pin.salt).then(function (h) {
        if (h.hash === state.pin.hash) { unlocked = true; route(); }
        else { PersonForm.setErr('pin', '비밀번호가 맞지 않습니다. 다시 넣어 주세요'); input.value = ''; input.focus(); }
      });
    }
    input.addEventListener('input', function () {
      input.value = input.value.replace(/\D/g, '').slice(0, 4);
      PersonForm.setErr('pin', '');
      if (input.value.length === 4) check();   // 4자리를 다 넣으면 바로 연다
    });
    f.addEventListener('submit', function (e) { e.preventDefault(); check(); });
    document.getElementById('forgot').addEventListener('click', function () {
      confirmDialog('비밀번호를 잊으셨나요?', '비밀번호는 되찾을 수 없습니다. 이 폰에 저장된 내 정보와 동행자 정보를 모두 지우고 처음부터 다시 만들어야 합니다.', '모두 지우고 다시 만들기').then(function (ok) {
        if (!ok) return;
        localStorage.removeItem(KEY);
        state = load();
        unlocked = false;
        toast('정보를 지웠습니다. 다시 만들어 주세요');
        go('#/me/new');
        route();
      });
    });
  }

  // 비밀번호 기능 전에 만든 정보: 한 번만 비밀번호를 정하게 한다
  function renderSetPin() {
    view(
      '<section class="screen lock">' +
        '<h1>QR 비밀번호 정하기</h1>' +
        '<p class="lead">이제 QR을 열 때 숫자 4자리 비밀번호를 넣습니다. 폰을 다른 사람이 봐도 내 정보가 보이지 않게 합니다.</p>' +
        '<form id="setf" class="form" novalidate>' + pinBlock(false).replace(/<p class="hint">[^<]*<\/p>/, '') +
          '<button class="btn btn-primary" type="submit">비밀번호 저장</button>' +
        '</form>' +
      '</section>'
    );
    var f = document.getElementById('setf');
    f.addEventListener('input', function (e) { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); PersonForm.setErr(e.target.name, ''); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var p1 = f.elements.pin1.value, errs = {};
      if (!/^\d{4}$/.test(p1)) errs.pin1 = '숫자 4자리로 넣어 주세요';
      else if (p1 !== f.elements.pin2.value) errs.pin2 = '두 번 넣은 비밀번호가 다릅니다';
      if (PersonForm.showErrors(f, errs)) return;
      hashPin(p1).then(function (h) {
        state.pin = h;
        if (!save()) return;
        unlocked = true;
        toast('비밀번호를 정했습니다');
        route();
      });
    });
  }

  function consentBlock(editing) {
    return '<div class="consent" id="wrap-consent">' +
      '<h2>개인정보 수집·이용 동의 (필수)</h2>' +
      '<dl>' +
        '<dt>수집 목적</dt><dd>낚시어선 승선자명부 작성, 출입항 신고기관 제출 (「낚시 관리 및 육성법」 제33조)</dd>' +
        '<dt>수집 항목</dt><dd>성명, 생년월일, 성별, 주소, 휴대전화, 비상연락처(이름·전화번호)</dd>' +
        '<dt>보관 기간</dt><dd>이 폰: 내가 지울 때까지<br>QR을 찍은 선장 기기: 최대 3개월 뒤 자동 삭제</dd>' +
      '</dl>' +
      '<p class="consent-note">주민등록번호와 신분증 사진은 받지 않습니다. 배에 탈 때 신분증 실물을 선장님께 보여 주세요.</p>' +
      '<p class="consent-note">동의하지 않을 수 있습니다. 이때는 승선할 때 선장님께 명부를 직접 작성해야 합니다.</p>' +
      '<p class="consent-note"><a href="../privacy.html" target="_blank" rel="noopener">개인정보 처리방침 전문 보기</a></p>' +
      '<label class="check"><input type="checkbox" name="consent"' + (editing ? ' checked' : '') + '><span>위 내용을 읽고 동의합니다</span></label>' +
      '<p class="err" id="err-consent"></p>' +
    '</div>';
  }

  function companionChecks(p, editing) {
    return '<div class="consent" id="wrap-consent">' +
      '<label class="check"><input type="checkbox" name="consent"' + (editing ? ' checked' : '') + '><span>동행자(어린이는 보호자)에게 승선자명부 작성 목적을 알리고 동의를 받았습니다</span></label>' +
      '<p class="err" id="err-consent"></p>' +
      '<label class="check"><input type="checkbox" name="keep"' + (p.keep ? ' checked' : '') + '><span>다음에도 쓰기<small>체크하지 않으면 오늘이 지나면 지워집니다</small></span></label>' +
    '</div>';
  }

  // ---------- 3. 내 승선 QR ----------
  function renderMyQR() {
    var me = state.me;
    var text = BMQR.encodeCompact(me);
    var old = daysSince(me.made) > 365;
    view(
      '<section class="screen qr-screen">' +
        '<h1>내 승선 QR</h1>' +
        '<div class="qr-card">' +
          '<p class="qr-name">' + esc(me.name) + ' <span>님</span></p>' +
          qrSvg(text, me.name + ' 님의 승선 QR') +
          '<p class="qr-made num">만든 날짜 ' + fmtDate(me.made) + '</p>' +
        '</div>' +
        (old ? '<p class="notice notice-warn"><b>⚠ 만든 지 1년이 넘었습니다.</b> 주소나 전화번호가 바뀌지 않았는지 확인하고 다시 저장해 주세요.</p>' : '') +
        '<p class="notice">☀ 찍기 전에 <b>화면 밝기를 가장 밝게</b> 올려 주세요.</p>' +
        '<p class="notice notice-warn"><b>이 QR을 사진으로 찍어 남에게 보내지 마세요.</b> 내 이름·주소·전화번호가 들어 있습니다.</p>' +
        '<p class="note-plain">이 QR 하나로 어느 배에서든 쓸 수 있습니다. 신분증도 같이 보여 주세요.</p>' +
        '<button class="btn btn-secondary install" id="install-btn" type="button"' + (installEvent ? '' : ' hidden') + '>홈 화면에 추가</button>' +
      '</section>' +
      '<div class="bottom-bar">' +
        '<a class="btn btn-primary" href="#/group">동행자와 같이 타요</a>' +
        '<a class="btn btn-secondary" href="#/me/edit">내 정보 보기·수정</a>' +
      '</div>'
    );
    keepAwake(true);
    var ib = document.getElementById('install-btn');
    ib.addEventListener('click', function () {
      if (!installEvent) return;
      installEvent.prompt();
      installEvent.userChoice.finally(function () { installEvent = null; ib.hidden = true; });
    });
  }

  // ---------- 4. 오늘 같이 타는 사람 ----------
  function renderGroup() {
    var me = state.me;
    var sel = state.today.ids;
    var rows = state.companions.map(function (c) {
      var on = sel.indexOf(c.id) >= 0;
      return '<li class="pick">' +
        '<label class="pick-main"><input type="checkbox" data-id="' + esc(c.id) + '"' + (on ? ' checked' : '') + '>' +
          '<span class="pick-text"><b>' + esc(c.name) + '</b><span class="num">' + fmtBirth(c.birth) + (c.keep ? '' : ' · 오늘만') + '</span></span></label>' +
        '<a class="pick-edit" href="#/companion/' + encodeURIComponent(c.id) + '" aria-label="' + esc(c.name) + ' 정보 수정">수정</a>' +
      '</li>';
    }).join('');
    var n = sel.length + 1;

    view(
      '<section class="screen">' +
        '<a class="back" href="#/">← 내 QR</a>' +
        '<h1>오늘 같이 타는 사람</h1>' +
        '<p class="lead">체크한 사람마다 QR이 한 장씩 만들어집니다. 선장님께 한 장씩 넘기며 보여 주세요.</p>' +
        '<ul class="pick-list">' +
          '<li class="pick pick-me"><span class="pick-main"><span class="pick-box" aria-hidden="true">✓</span>' +
            '<span class="pick-text"><b>' + esc(me.name) + ' (나)</b><span class="num">' + fmtBirth(me.birth) + ' · 대표</span></span></span></li>' +
          rows +
        '</ul>' +
        (state.companions.length ? '' : '<p class="empty">아직 저장된 동행자가 없습니다. 같이 타는 사람을 추가해 주세요.</p>') +
        '<a class="btn btn-secondary" href="#/companion/new">+ 동행자 추가</a>' +
      '</section>' +
      '<div class="bottom-bar">' +
        '<button class="btn btn-primary" id="make-group" type="button"' + (n < 2 ? ' disabled' : '') + '>' +
          (n < 2 ? '동행자를 1명 이상 골라 주세요' : '<span>일행 QR 만들기 (<span class="num">' + n + '</span>명)</span>') +
        '</button>' +
      '</div>'
    );

    app.querySelectorAll('.pick-main input[type=checkbox]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = cb.getAttribute('data-id');
        var ids = state.today.ids.filter(function (x) { return x !== id; });
        if (cb.checked) ids.push(id);
        state.today.ids = ids;
        state.today.grp = '';
        save();
        renderGroup();
      });
    });
    var mk = document.getElementById('make-group');
    mk.addEventListener('click', function () { go('#/group/qr'); });
  }

  // ---------- 5. 일행 QR 넘겨 보기 ----------
  function renderGroupQR() {
    var members = [state.me].concat(state.today.ids.map(function (id) { return findCompanion(id); }).filter(Boolean));
    if (members.length < 2) { go('#/group'); return; }
    // 같은 날 같은 일행이면 일행ID를 그대로 쓴다
    if (!state.today.grp) { state.today.grp = newGroupId(); save(); }
    var grp = state.today.grp, cnt = members.length;

    var slides = members.map(function (p, i) {
      var text = BMQR.encodeCompact(p, { grp: grp, idx: i + 1, cnt: cnt });
      return '<div class="slide" role="group" aria-label="' + (i + 1) + ' / ' + cnt + '">' +
        '<p class="slide-count num"><b>' + (i + 1) + '</b> / ' + cnt + '</p>' +
        '<div class="qr-card">' +
          '<p class="qr-name">' + esc(p.name) + ' <span>' + (i === 0 ? '대표' : '님') + '</span></p>' +
          qrSvg(text, p.name + ' 님의 승선 QR') +
        '</div>' +
      '</div>';
    }).join('');

    view(
      '<section class="screen qr-screen group-qr">' +
        '<a class="back" href="#/group">← 돌아가기</a>' +
        '<h1>일행 QR <span class="num">' + cnt + '</span>장</h1>' +
        '<p class="lead">옆으로 넘기면 다음 사람 QR이 나옵니다.</p>' +
        '<div class="slider" id="slider" tabindex="0" aria-label="일행 QR, 옆으로 넘기기">' + slides + '</div>' +
        '<div class="dots" aria-hidden="true">' + members.map(function (_, i) { return '<i' + (i === 0 ? ' class="on"' : '') + '></i>'; }).join('') + '</div>' +
        '<p class="notice">☀ 찍기 전에 <b>화면 밝기를 가장 밝게</b> 올려 주세요.</p>' +
      '</section>' +
      '<div class="bottom-bar bottom-bar-row">' +
        '<button class="btn btn-secondary" id="prev" type="button">◀ 이전</button>' +
        '<button class="btn btn-primary" id="next" type="button">다음 ▶</button>' +
      '</div>'
    );
    keepAwake(true);

    var slider = document.getElementById('slider');
    var dots = app.querySelectorAll('.dots i');
    var prev = document.getElementById('prev'), next = document.getElementById('next');
    function current() { return Math.round(slider.scrollLeft / slider.clientWidth); }
    function sync() {
      var i = current();
      dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
      prev.disabled = i === 0;
      next.disabled = i === cnt - 1;
    }
    function to(i) { slider.scrollTo({ left: i * slider.clientWidth, behavior: 'smooth' }); }
    slider.addEventListener('scroll', function () { window.requestAnimationFrame(sync); }, { passive: true });
    prev.addEventListener('click', function () { to(Math.max(0, current() - 1)); });
    next.addEventListener('click', function () { to(Math.min(cnt - 1, current() + 1)); });
    slider.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev.click(); }
    });
    sync();
  }

  // ---------- 시작 ----------
  route();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
