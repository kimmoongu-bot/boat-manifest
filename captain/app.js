/* 선장용 승선명부 — 설정, 항차, 연속 스캔, 사진 불러오기, 수동 입력, 중복 처리 */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var esc = PersonForm.esc, fmtDate = PersonForm.fmtDate, fmtBirth = PersonForm.fmtBirth, fmtTime = PersonForm.fmtTime;
  var toast = UI.toast;
  var vessel = null;        // 배 정보 (설정 전이면 null)
  var unlocked = false;     // PIN 잠금 풀었는지 (앱을 새로 열면 다시 잠김)

  // ---------- 라우터 ----------
  function go(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }
  function route() {
    Scanner.stop();
    var h = location.hash.replace(/^#\/?/, '');
    DB.get('vessel', 'main').then(function (v) {
      vessel = v || null;
      if (vessel && vessel.pinHash && !unlocked) return renderLock();
      if (!vessel) return renderSettings(true);
      if (h === 'settings') return renderSettings(false);
      if (h === 'pin') return renderPin();
      if (h === 'crew/new') return renderCrewForm(null);
      var m;
      if ((m = /^crew\/(\d+)$/.exec(h))) return renderCrewForm(Number(m[1]));
      if ((m = /^v\/([^/]+)\/scan$/.exec(h))) return withVoyage(m[1], renderScan);
      if ((m = /^v\/([^/]+)\/manual$/.exec(h))) return withVoyage(m[1], renderManual);
      if ((m = /^v\/([^/]+)$/.exec(h))) return withVoyage(m[1], renderVoyage);
      return renderHome();
    }).catch(showDbError);
  }
  window.addEventListener('hashchange', function () { route(); window.scrollTo(0, 0); });

  function withVoyage(id, fn) {
    return DB.get('voyage', decodeURIComponent(id)).then(function (v) {
      if (!v) { go('#/'); return; }
      return fn(v);
    });
  }

  function view(html) {
    app.innerHTML = html;
    var h = app.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  function showDbError(err) {
    console.error(err);
    view('<section class="screen"><h1>저장소를 열 수 없습니다</h1>' +
      '<p class="lead">이 브라우저에서 저장 공간을 쓸 수 없습니다. 시크릿 모드라면 일반 창에서 열어 주세요.</p></section>');
  }

  function voyageTitle(v) { return fmtDate(v.date) + ' ' + v.no + '항차'; }

  // ---------- 잠금 ----------
  function hashPin(pin, salt) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    });
  }
  function newSalt() {
    var a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
  }

  function renderLock() {
    view(
      '<section class="screen lock">' +
        '<h1>' + esc(vessel.name) + '</h1>' +
        '<p class="lead">PIN을 넣어야 승선명부를 볼 수 있습니다.</p>' +
        '<form id="lockf" class="form" novalidate>' +
          PersonForm.field('pin', 'PIN', '<input id="f-pin" name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" class="pin-input">') +
          '<button class="btn btn-primary" type="submit">열기</button>' +
        '</form>' +
      '</section>'
    );
    var f = document.getElementById('lockf');
    document.getElementById('f-pin').focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      hashPin(f.elements.pin.value, vessel.pinSalt).then(function (h) {
        if (h === vessel.pinHash) { unlocked = true; route(); }
        else { PersonForm.setErr('pin', 'PIN이 맞지 않습니다. 다시 넣어 주세요'); f.elements.pin.value = ''; f.elements.pin.focus(); }
      });
    });
  }

  // ---------- 설정 ----------
  function renderSettings(first) {
    var v = vessel || {};
    DB.crewList().then(function (crew) {
      view(
        '<section class="screen">' +
          (first ? '' : '<a class="back" href="#/">← 처음 화면</a>') +
          '<h1>' + (first ? '배 정보 설정' : '설정') + '</h1>' +
          (first ? '<p class="lead">처음 한 번만 적습니다. 명부를 만들 때마다 자동으로 들어갑니다.</p>' : '') +
          '<form id="vform" class="form" novalidate>' +
            PersonForm.field('vname', '선박명', '<input id="f-vname" name="vname" type="text" maxlength="30" autocomplete="off" value="' + esc(v.name) + '">') +
            PersonForm.field('vnumber', '선박번호', '<input id="f-vnumber" name="vnumber" type="text" maxlength="30" autocomplete="off" placeholder="예) 경남통영 1234" value="' + esc(v.number) + '">') +
            PersonForm.field('capacity', '정원 (선원 포함)', '<input id="f-capacity" name="capacity" type="text" inputmode="numeric" maxlength="3" autocomplete="off" value="' + esc(v.capacity) + '">') +
            PersonForm.field('device', '이 기기 이름', '<input id="f-device" name="device" type="text" maxlength="20" autocomplete="off" value="' + esc(v.deviceName || '') + '">' +
              '<div class="chips"><button type="button" class="chip" data-fill="선장폰">선장폰</button><button type="button" class="chip" data-fill="사무실폰">사무실폰</button></div>',
              '여러 기기로 나눠 찍을 때 어느 기기에서 찍었는지 구분합니다') +
            '<button class="btn btn-primary" type="submit">' + (first ? '저장하고 다음' : '배 정보 저장') + '</button>' +
          '</form>' +
          (first ? '' :
            '<h2 class="section-title">선장·선원</h2>' +
            '<p class="hint">명부를 만들 때마다 자동으로 들어갑니다.</p>' +
            crewListHtml(crew) +
            '<a class="btn btn-secondary" href="#/crew/new">+ 선장·선원 추가</a>' +
            '<h2 class="section-title">앱 잠금 PIN</h2>' +
            '<p class="hint">' + (v.pinHash ? 'PIN이 켜져 있습니다. 앱을 열 때마다 PIN을 넣어야 합니다.' : '꺼져 있습니다. 폰을 다른 사람이 만질 수 있다면 켜 두세요.') + '</p>' +
            '<a class="btn btn-secondary" href="#/pin">' + (v.pinHash ? 'PIN 바꾸기·끄기' : 'PIN 켜기') + '</a>') +
        '</section>'
      );
      var f = document.getElementById('vform');
      PersonForm.bind(f);
      f.elements.capacity.addEventListener('input', function () { f.elements.capacity.value = f.elements.capacity.value.replace(/\D/g, ''); });
      app.querySelectorAll('[data-fill]').forEach(function (b) {
        b.addEventListener('click', function () { f.elements.device.value = b.getAttribute('data-fill'); PersonForm.setErr('device', ''); });
      });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var d = {
          name: f.elements.vname.value.trim(), number: f.elements.vnumber.value.trim(),
          capacity: Number(f.elements.capacity.value), deviceName: f.elements.device.value.trim()
        };
        var errs = {};
        if (!d.name) errs.vname = '선박명을 적어 주세요';
        if (!d.number) errs.vnumber = '선박번호를 적어 주세요';
        if (!(d.capacity >= 1 && d.capacity <= 999)) errs.capacity = '정원을 숫자로 적어 주세요';
        if (!d.deviceName) errs.device = '기기 이름을 적거나 아래에서 골라 주세요';
        if (PersonForm.showErrors(f, errs)) return;
        var rec = Object.assign({ id: 'main', retentionMonths: 3 }, vessel || {}, d);
        DB.put('vessel', rec).then(function () {
          vessel = rec;
          toast('배 정보를 저장했습니다');
          if (first) go('#/crew/new'); else route();
        }).catch(function () { toast('저장하지 못했습니다. 다시 눌러 주세요', true); });
      });
    });
  }

  function crewListHtml(crew) {
    if (!crew.length) return '<p class="notice notice-warn">아직 선장·선원이 없습니다. 선장 정보부터 추가해 주세요.</p>';
    return '<ul class="rows">' + crew.map(function (c) {
      return '<li><a class="row row-link" href="#/crew/' + c.id + '">' +
        '<span class="row-main"><b>' + esc(c.name) + '</b><span class="tag">' + esc(c.role) + '</span></span>' +
        '<span class="row-sub num">' + fmtBirth(c.birth) + ' · ' + esc(c.phone) + '</span></a></li>';
    }).join('') + '</ul>';
  }

  function renderCrewForm(id) {
    (id ? DB.get('crew', id) : Promise.resolve(null)).then(function (c) {
      if (id && !c) { go('#/settings'); return; }
      return DB.crewList().then(function (crew) {
        var p = c || { role: crew.some(function (x) { return x.role === '선장'; }) ? '선원' : '선장' };
        view(
          '<section class="screen">' +
            '<a class="back" href="#/settings">← 설정</a>' +
            '<h1>' + (c ? '선장·선원 정보' : '선장·선원 추가') + '</h1>' +
            '<form id="cform" class="form" novalidate>' +
              '<fieldset class="field" id="wrap-role"><legend>구분</legend><div class="seg">' +
                ['선장', '선원'].map(function (r) {
                  return '<label class="seg-item"><input type="radio" name="role" value="' + r + '"' + (p.role === r ? ' checked' : '') + '><span>' + r + '</span></label>';
                }).join('') +
              '</div><p class="err" id="err-role"></p></fieldset>' +
              PersonForm.fieldsHtml(p, { emergency: false }) +
              '<div class="bottom-bar"><button class="btn btn-primary" type="submit">저장</button></div>' +
            '</form>' +
            (c ? '<div class="danger-zone"><button class="btn btn-danger" type="button" id="del-btn">명단에서 지우기</button></div>' : '') +
          '</section>'
        );
        var f = document.getElementById('cform');
        PersonForm.bind(f);
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var d = PersonForm.read(f, ['name', 'birth', 'sex', 'addr', 'phone']);
          d.role = f.elements.role.value;
          var errs = PersonForm.validate(Object.assign({ emerName: '', emerPhone: '' }, d), { emergency: false });
          if (d.role !== '선장' && d.role !== '선원') errs.role = '구분을 골라 주세요';
          if (PersonForm.showErrors(f, errs)) return;
          var rec = Object.assign(c || { order: Date.now() }, d);
          DB.put('crew', rec).then(function () {
            return DB.refreshOpenVoyageCrew(BMQR.today());
          }).then(function () {
            toast('저장했습니다');
            go('#/settings');
          }).catch(function () { toast('저장하지 못했습니다. 다시 눌러 주세요', true); });
        });
        var del = document.getElementById('del-btn');
        if (del) del.addEventListener('click', function () {
          UI.confirm(c.name + ' 님을 지울까요?', '선장·선원 명단에서 지웁니다. 이미 확정한 명부에는 남아 있습니다.', '지우기').then(function (ok) {
            if (!ok) return;
            DB.del('crew', c.id).then(function () { return DB.refreshOpenVoyageCrew(BMQR.today()); }).then(function () {
              toast('지웠습니다');
              go('#/settings');
            });
          });
        });
      });
    });
  }

  function renderPin() {
    var has = !!vessel.pinHash;
    view(
      '<section class="screen">' +
        '<a class="back" href="#/settings">← 설정</a>' +
        '<h1>' + (has ? 'PIN 바꾸기' : 'PIN 켜기') + '</h1>' +
        '<p class="lead">숫자 4~6자리. 잊어버리면 앱 저장 공간을 지워야 하니 꼭 기억해 두세요.</p>' +
        '<form id="pinf" class="form" novalidate>' +
          (has ? PersonForm.field('old', '지금 PIN', '<input id="f-old" name="old" type="password" inputmode="numeric" maxlength="6" autocomplete="off" class="pin-input">') : '') +
          PersonForm.field('pin1', '새 PIN', '<input id="f-pin1" name="pin1" type="password" inputmode="numeric" maxlength="6" autocomplete="off" class="pin-input">') +
          PersonForm.field('pin2', '새 PIN 한 번 더', '<input id="f-pin2" name="pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="off" class="pin-input">') +
          '<button class="btn btn-primary" type="submit">PIN 저장</button>' +
        '</form>' +
        (has ? '<div class="danger-zone"><button class="btn btn-danger" type="button" id="pin-off">PIN 끄기</button>' +
          '<p class="hint">끄려면 위 "지금 PIN" 칸에 PIN을 넣고 누르세요.</p></div>' : '') +
      '</section>'
    );
    var f = document.getElementById('pinf');
    f.addEventListener('input', function (e) { e.target.value = e.target.value.replace(/\D/g, ''); PersonForm.setErr(e.target.name, ''); });
    function checkOld() {
      if (!has) return Promise.resolve(true);
      return hashPin(f.elements.old.value, vessel.pinSalt).then(function (h) {
        if (h === vessel.pinHash) return true;
        PersonForm.setErr('old', '지금 PIN이 맞지 않습니다');
        return false;
      });
    }
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var p1 = f.elements.pin1.value, p2 = f.elements.pin2.value;
      checkOld().then(function (ok) {
        if (!ok) return;
        var errs = {};
        if (!/^\d{4,6}$/.test(p1)) errs.pin1 = '숫자 4~6자리로 넣어 주세요';
        else if (p1 !== p2) errs.pin2 = '두 번 넣은 PIN이 다릅니다';
        if (PersonForm.showErrors(f, errs)) return;
        var salt = newSalt();
        return hashPin(p1, salt).then(function (h) {
          vessel.pinSalt = salt; vessel.pinHash = h;
          return DB.put('vessel', vessel);
        }).then(function () { unlocked = true; toast('PIN을 저장했습니다'); go('#/settings'); });
      });
    });
    var off = document.getElementById('pin-off');
    if (off) off.addEventListener('click', function () {
      checkOld().then(function (ok) {
        if (!ok) { f.elements.old.focus(); return; }
        delete vessel.pinSalt; delete vessel.pinHash;
        DB.put('vessel', vessel).then(function () { toast('PIN을 껐습니다'); go('#/settings'); });
      });
    });
  }

  // ---------- 처음 화면: 오늘 항차 ----------
  function renderHome() {
    var today = BMQR.today();
    Promise.all([DB.byIndex('voyage', 'date', today), DB.crewList()]).then(function (r) {
      var voyages = r[0].sort(function (a, b) { return a.no - b.no; }), crew = r[1];
      return Promise.all(voyages.map(function (v) { return DB.passengers(v.id); })).then(function (lists) {
        var next = voyages.length + 1;
        view(
          '<section class="screen">' +
            '<header class="home-head">' +
              '<div><p class="vessel-name">' + esc(vessel.name) + '</p>' +
              '<p class="hint">' + esc(vessel.number) + ' · 정원 ' + vessel.capacity + '명 · ' + esc(vessel.deviceName) + '</p></div>' +
              '<a class="head-link" href="#/settings">설정</a>' +
            '</header>' +
            '<h1>' + fmtDate(today) + '</h1>' +
            (crew.some(function (c) { return c.role === '선장'; }) ? '' :
              '<a class="notice notice-warn notice-link" href="#/crew/new"><b>선장 정보가 없습니다.</b> 명부에 들어갈 선장 정보를 먼저 추가해 주세요 ›</a>') +
            (voyages.length ? '<ul class="voyage-list">' + voyages.map(function (v, i) {
              var total = lists[i].length + (v.crew || []).length;
              var over = total > vessel.capacity;
              return '<li><a class="voyage-card' + (over ? ' over' : '') + '" href="#/v/' + encodeURIComponent(v.id) + '">' +
                '<span class="voyage-no">' + v.no + '항차</span>' +
                '<span class="voyage-meta num">' + fmtTime(v.openedAt) + ' 열림</span>' +
                '<span class="voyage-count num"><b>' + total + '</b> / ' + vessel.capacity + '명' + (over ? ' · 정원 초과' : '') + '</span>' +
              '</a></li>';
            }).join('') + '</ul>'
              : '<p class="empty-big">오늘 열린 항차가 없습니다.<br>출항 전에 항차를 열고 손님 QR을 찍으세요.</p>') +
          '</section>' +
          '<div class="bottom-bar"><button class="btn btn-primary" id="open-voyage" type="button">' + next + '항차 열기</button></div>'
        );
        document.getElementById('open-voyage').addEventListener('click', function () {
          UI.confirm('오늘 ' + next + '항차를 열까요?', fmtDate(today) + ' ' + next + '항차 명부를 새로 만듭니다.', next + '항차 열기', 'primary').then(function (ok) {
            if (!ok) return;
            DB.openVoyage(today, vessel.deviceName).then(function (v) {
              toast(v.no + '항차를 열었습니다');
              go('#/v/' + encodeURIComponent(v.id));
            }).catch(function () { toast('항차를 열지 못했습니다. 다시 눌러 주세요', true); });
          });
        });
      });
    });
  }

  // ---------- 항차 명단 ----------
  // 일행ID 로 묶는다: [{group:true, grp, members, cnt} | {person}]
  function buildRows(list) {
    var rows = [], byGrp = {};
    list.forEach(function (p) {
      if (p.grp) {
        if (!byGrp[p.grp]) { byGrp[p.grp] = { group: true, grp: p.grp, members: [], cnt: 0 }; rows.push(byGrp[p.grp]); }
        byGrp[p.grp].members.push(p);
        byGrp[p.grp].cnt = Math.max(byGrp[p.grp].cnt, p.cnt || 0);
      } else {
        rows.push({ person: p });
      }
    });
    rows.forEach(function (r) { if (r.group) r.members.sort(function (a, b) { return (a.idx || 0) - (b.idx || 0) || a.addedAt - b.addedAt; }); });
    return rows;
  }

  var SOURCE = { camera: 'QR', image: '사진', manual: '직접' };
  function personRow(p) {
    var age = BMQR.age(p.birth);
    return '<li class="row">' +
      '<span class="row-main"><b>' + esc(p.name) + '</b>' +
        '<span class="row-age num">' + (age == null ? '' : '만 ' + age + '세') + ' · ' + esc(p.sex) + '</span>' +
        '<span class="tag">' + (SOURCE[p.source] || '') + '</span></span>' +
      '<span class="row-sub num">' + fmtBirth(p.birth) + ' · ' + esc(p.phone) + '</span>' +
    '</li>';
  }

  function groupBlock(g) {
    var rep = g.members[0];
    var more = g.members.length - 1;
    var missing = g.cnt - g.members.length;
    return '<li class="group">' +
      '<p class="group-title">대표자 <b>' + esc(rep.name) + '</b>' + (more > 0 ? ' 외 ' + more + '명' : '') + '</p>' +
      (missing > 0 ? '<p class="group-missing">⚠ 일행 ' + g.cnt + '명 중 ' + g.members.length + '명 등록 — ' + missing + '명 더 찍어 주세요</p>' : '') +
      '<ul class="rows">' + g.members.map(personRow).join('') + '</ul>' +
    '</li>';
  }

  function countBar(v, n) {
    var total = n + (v.crew || []).length;
    var over = total > vessel.capacity;
    return '<div class="count-bar' + (over ? ' over' : '') + '" id="count-bar">' +
      '<p class="count-main num"><b id="count-total">' + total + '</b> / ' + vessel.capacity + '명</p>' +
      '<p class="count-sub num">승객 <span id="count-pax">' + n + '</span>명 · 선장·선원 ' + (v.crew || []).length + '명' + (over ? ' · <b>정원 초과</b>' : '') + '</p>' +
    '</div>';
  }

  function renderVoyage(v) {
    return DB.passengers(v.id).then(function (list) {
      var rows = buildRows(list);
      view(
        '<section class="screen">' +
          '<a class="back" href="#/">← 오늘 항차</a>' +
          '<h1>' + voyageTitle(v) + '</h1>' +
          countBar(v, list.length) +
          '<div class="actions">' +
            '<button class="btn btn-primary btn-big" id="go-scan" type="button">QR 스캔</button>' +
            '<div class="actions-row">' +
              '<label class="btn btn-secondary file-btn">사진에서 QR<input type="file" accept="image/*" multiple id="file-in"></label>' +
              '<a class="btn btn-secondary" href="#/v/' + encodeURIComponent(v.id) + '/manual">직접 입력</a>' +
            '</div>' +
          '</div>' +
          '<p class="file-result" id="file-result" hidden></p>' +
          '<h2 class="section-title">승객 <span class="num">' + list.length + '</span>명</h2>' +
          (list.length ? '<ul class="pax-list">' + rows.map(function (r) {
            return r.group ? groupBlock(r) : '<li class="single"><ul class="rows">' + personRow(r.person) + '</ul></li>';
          }).join('') + '</ul>' : '<p class="empty">아직 등록된 승객이 없습니다. QR 스캔을 눌러 손님 QR을 찍으세요.</p>') +
          '<h2 class="section-title">선장·선원 <span class="num">' + (v.crew || []).length + '</span>명</h2>' +
          '<p class="hint">설정의 명단이 자동으로 들어갑니다.</p>' +
          ((v.crew || []).length ? '<ul class="rows">' + v.crew.map(function (c) {
            return '<li class="row"><span class="row-main"><b>' + esc(c.name) + '</b><span class="tag">' + esc(c.role) + '</span></span>' +
              '<span class="row-sub num">' + fmtBirth(c.birth) + ' · ' + esc(c.phone) + '</span></li>';
          }).join('') + '</ul>' : '<a class="notice notice-warn notice-link" href="#/crew/new">선장·선원이 없습니다. 설정에서 추가해 주세요 ›</a>') +
        '</section>'
      );
      document.getElementById('go-scan').addEventListener('click', function () {
        Scanner.unlockSound();   // 소리는 버튼을 누를 때 켜 둬야 난다
        go('#/v/' + encodeURIComponent(v.id) + '/scan');
      });
      bindFileInput(v, document.getElementById('file-in'), document.getElementById('file-result'), function () { return renderVoyage(v); });
    });
  }

  // ---------- 등록 (스캔·사진 공용) ----------
  // 결과: {status:'added'|'dup'|'bad', name}
  function register(v, text, source) {
    var d = BMQR.decode(text);
    if (!d) return Promise.resolve({ status: 'bad' });
    var p = {
      voyageId: v.id, name: d.name, birth: d.birth, sex: d.sex, addr: d.addr, phone: d.phone,
      emerName: d.emerName, emerPhone: d.emerPhone, grp: d.grp || '', idx: d.idx || 1, cnt: d.cnt || 1,
      made: d.made || '', source: source, addedAt: Date.now(), device: vessel.deviceName
    };
    return DB.addPassenger(p).then(function (r) {
      return r.dup ? { status: 'dup', name: r.dup.name } : { status: 'added', name: p.name };
    });
  }

  function bindFileInput(v, input, out, after) {
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if (!files.length) return;
      Scanner.unlockSound();
      out.hidden = false;
      out.textContent = files.length + '장 읽는 중…';
      var added = [], dup = [], bad = 0;
      files.reduce(function (pr, f) {
        return pr.then(function () {
          return Scanner.decodeFile(f).then(function (text) {
            if (!text) { bad++; return; }
            return register(v, text, 'image').then(function (r) {
              if (r.status === 'added') added.push(r.name);
              else if (r.status === 'dup') dup.push(r.name);
              else bad++;
            });
          });
        });
      }, Promise.resolve()).then(function () {
        var msg = [];
        if (added.length) msg.push('✓ ' + added.length + '명 등록: ' + added.join(', '));
        if (dup.length) msg.push('이미 등록됨 ' + dup.length + '명: ' + dup.join(', '));
        if (bad) msg.push('⚠ ' + bad + '장은 승선 QR을 찾지 못했습니다. QR이 크게 나온 사진으로 다시 골라 주세요');
        Scanner.feedback(added.length ? 'ok' : dup.length ? 'dup' : 'bad');
        // 명단을 다시 그린 뒤 그 화면에 결과를 남긴다
        return Promise.resolve(after && after()).then(function () {
          var o = document.getElementById('file-result') || out;
          o.hidden = false;
          o.innerHTML = msg.map(esc).join('<br>');
        });
      });
    });
  }

  // ---------- 연속 스캔 ----------
  function renderScan(v) {
    return DB.passengers(v.id).then(function (list) {
      var n = list.length;
      view(
        '<section class="scan">' +
          '<div class="scan-head">' +
            '<h1>' + v.no + '항차 스캔</h1>' +
            '<p class="scan-count num"><b id="scan-total">' + (n + (v.crew || []).length) + '</b> / ' + vessel.capacity + '명</p>' +
          '</div>' +
          '<div class="cam">' +
            '<video id="cam" playsinline muted autoplay></video>' +
            '<div class="cam-frame" aria-hidden="true"></div>' +
            '<p class="cam-msg" id="cam-msg">카메라를 켜는 중…</p>' +
            '<div class="scan-toast" id="scan-toast" hidden></div>' +
          '</div>' +
          '<p class="scan-help">손님 QR을 네모 안에 비추세요. 찍힐 때마다 진동과 소리가 납니다.</p>' +
          '<ol class="recent" id="recent"></ol>' +
        '</section>' +
        '<div class="bottom-bar bottom-bar-row">' +
          '<label class="btn btn-secondary file-btn">사진에서 QR<input type="file" accept="image/*" multiple id="file-in"></label>' +
          '<a class="btn btn-primary" href="#/v/' + encodeURIComponent(v.id) + '" id="scan-done">다 찍었어요</a>' +
        '</div>' +
        '<p class="file-result scan-file-result" id="file-result" hidden></p>'
      );

      var video = document.getElementById('cam');
      var msg = document.getElementById('cam-msg');
      var recent = document.getElementById('recent');
      var total = n + (v.crew || []).length;
      var seen = {};             // QR 내용 → 마지막으로 본 시각
      var COOLDOWN = 3000;       // 같은 QR이 이 시간 안에 또 보이면 무시 (계속 비추고 있어도 한 번만)
      var toastTimer;

      function showResult(r, src) {
        var t = document.getElementById('scan-toast');
        if (!t) return;
        var text = r.status === 'added' ? '✓ ' + r.name + ' 님'
          : r.status === 'dup' ? '이미 등록됨 · ' + r.name
          : '승선 QR이 아닙니다';
        t.className = 'scan-toast ' + r.status;
        t.textContent = text;
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.hidden = true; }, 1500);
        Scanner.feedback(r.status === 'added' ? 'ok' : r.status === 'dup' ? 'dup' : 'bad');
        if (r.status === 'added') {
          total++;
          document.getElementById('scan-total').textContent = total;
        }
        var li = document.createElement('li');
        li.className = r.status;
        li.innerHTML = '<span class="num">' + fmtTime(Date.now()) + '</span> ' + esc(text) + (src === 'image' ? ' <small>(사진)</small>' : '');
        recent.insertBefore(li, recent.firstChild);
        while (recent.children.length > 5) recent.removeChild(recent.lastChild);
      }

      var queue = Promise.resolve();
      function onText(text) {
        var now = Date.now(), last = seen[text];
        seen[text] = now;
        if (last && now - last < COOLDOWN) return;
        queue = queue.then(function () {
          return register(v, text, 'camera').then(function (r) { showResult(r, 'camera'); });
        });
      }

      Scanner.start(video, onText).then(function () {
        msg.hidden = true;
      }).catch(function (err) {
        var name = err && err.name;
        msg.hidden = false;
        msg.textContent = name === 'NotAllowedError'
          ? '카메라 사용이 막혀 있습니다. 주소창 옆 자물쇠를 눌러 카메라를 허용한 뒤 다시 들어오세요. 아래 "사진에서 QR"로도 등록할 수 있습니다.'
          : '카메라를 켜지 못했습니다. 아래 "사진에서 QR"로 등록해 주세요.';
      });

      var input = document.getElementById('file-in');
      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files || []);
        input.value = '';
        files.reduce(function (pr, f) {
          return pr.then(function () {
            return Scanner.decodeFile(f).then(function (text) {
              if (!text) { showResult({ status: 'bad' }, 'image'); return; }
              return register(v, text, 'image').then(function (r) { showResult(r, 'image'); });
            });
          });
        }, Promise.resolve());
      });
    });
  }

  // ---------- 수동 입력 ----------
  function renderManual(v) {
    view(
      '<section class="screen">' +
        '<a class="back" href="#/v/' + encodeURIComponent(v.id) + '">← ' + v.no + '항차 명단</a>' +
        '<h1>승객 직접 입력</h1>' +
        '<p class="lead">폰이 없는 손님의 정보를 신분증을 보며 적어 주세요.</p>' +
        '<form id="mform" class="form" novalidate>' +
          PersonForm.fieldsHtml({}, { auto: false, phoneHint: '휴대전화가 없으면 보호자 번호를 적어 주세요' }) +
          '<div class="bottom-bar bottom-bar-row">' +
            '<button class="btn btn-secondary" type="submit" value="more">저장하고 한 명 더</button>' +
            '<button class="btn btn-primary" type="submit" value="done">저장</button>' +
          '</div>' +
        '</form>' +
      '</section>'
    );
    var f = document.getElementById('mform');
    PersonForm.bind(f);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var more = e.submitter && e.submitter.value === 'more';
      var d = PersonForm.read(f);
      if (PersonForm.showErrors(f, PersonForm.validate(d, { mobileOnly: false }))) {
        toast('빠진 항목을 채워 주세요');
        return;
      }
      var p = Object.assign({ voyageId: v.id, grp: '', idx: 1, cnt: 1, made: BMQR.today(), source: 'manual', addedAt: Date.now(), device: vessel.deviceName }, d);
      DB.addPassenger(p).then(function (r) {
        if (r.dup) {
          PersonForm.setErr('name', '이미 등록된 승객입니다 (같은 성명·생년월일·전화번호)');
          toast('이미 등록됨 · ' + r.dup.name, true);
          return;
        }
        toast('✓ ' + p.name + ' 님 등록');
        if (more) { renderManual(v); window.scrollTo(0, 0); }
        else go('#/v/' + encodeURIComponent(v.id));
      }).catch(function () { toast('저장하지 못했습니다. 다시 눌러 주세요', true); });
    });
  }

  // ---------- 시작 ----------
  route();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
