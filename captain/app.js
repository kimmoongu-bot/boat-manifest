/* 선장용 승선명부 — 설정, 항차, 연속 스캔, 사진 불러오기, 수동 입력, 중복 처리, 신분증 확인·경고·확정, 내보내기, 지난 명부, 합치기, 자동 삭제 */
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
      if (!purgeChecked) return checkPurge().then(route);
      if (h === 'settings') return renderSettings(false);
      if (h === 'pin') return renderPin();
      if (h === 'history') return renderHistory();
      if (h === 'crew/new') return renderCrewForm(null);
      var m;
      if ((m = /^crew\/(\d+)$/.exec(h))) return renderCrewForm(Number(m[1]));
      if ((m = /^v\/([^/]+)\/scan$/.exec(h))) return withVoyage(m[1], editable(renderScan));
      if ((m = /^v\/([^/]+)\/manual$/.exec(h))) return withVoyage(m[1], editable(renderManual));
      if ((m = /^v\/([^/]+)\/sheet$/.exec(h))) return withVoyage(m[1], renderSheet);
      if ((m = /^v\/([^/]+)\/p\/(\d+)$/.exec(h))) { var pid = Number(m[2]); return withVoyage(m[1], function (v) { return renderPerson(v, pid); }); }
      if ((m = /^v\/([^/]+)$/.exec(h))) return withVoyage(m[1], renderVoyage);
      return renderHome();
    }).catch(showDbError);
  }

  // 확정한 명부에서는 스캔·입력 화면을 열지 않는다
  function editable(fn) {
    return function (v) {
      if (v.status === 'confirmed') { toast('확정한 명부입니다. 고치려면 먼저 확정을 푸세요'); go('#/v/' + encodeURIComponent(v.id)); return; }
      return fn(v);
    };
  }

  // ---------- 보관 기간 지난 명부 지우기 (앱을 열 때 한 번) ----------
  var purgeChecked = false;
  function cutoffDate(months) {
    var d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
  }
  function checkPurge() {
    purgeChecked = true;
    var months = vessel.retentionMonths || 3, cut = cutoffDate(months);
    return DB.all('voyage').then(function (all) {
      var old = all.filter(function (v) { return v.date < cut; });
      if (!old.length) return;
      return Promise.all(old.map(function (v) { return DB.passengers(v.id); })).then(function (lists) {
        var pax = lists.reduce(function (s, l) { return s + l.length; }, 0);
        var unsent = old.filter(function (v) { return v.status !== 'confirmed' || !v.sharedAt; }).length;
        return UI.confirm(
          '보관 기간(' + months + '개월)이 지난 명부 ' + old.length + '건을 지웁니다',
          cut.replace(/-/g, '.') + ' 이전 명부 ' + old.length + '건(승객 ' + pax + '명)을 이 폰에서 지웁니다. 컴퓨터로 보낸 파일은 그대로 남습니다.' +
            (unsent ? ' 그중 ' + unsent + '건은 아직 보내지 않았습니다. 먼저 보내려면 "나중에"를 누르고 지난 명부에서 보내세요.' : ''),
          old.length + '건 지우기', 'danger', '나중에'
        ).then(function (ok) {
          if (!ok) return;
          return Promise.all(old.map(function (v) { return DB.deleteVoyage(v.id); })).then(function () {
            toast('지난 명부 ' + old.length + '건을 지웠습니다');
          });
        });
      });
    });
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
            '<a class="btn btn-secondary" href="#/pin">' + (v.pinHash ? 'PIN 바꾸기·끄기' : 'PIN 켜기') + '</a>' +
            '<h2 class="section-title">배에 붙일 안내문</h2>' +
            '<p class="hint">선박명이 들어간 A4 안내문(손님용 QR + 사용법)을 인쇄합니다. 코팅해서 승선 입구에 붙이세요.</p>' +
            '<a class="btn btn-secondary" href="poster.html">안내문 인쇄</a>' +
            '<h2 class="section-title">명부 보관 기간</h2>' +
            '<p class="hint">이 기간이 지난 명부는 앱을 열 때 이 폰에서 지웁니다. 컴퓨터로 보낸 파일은 그대로 남습니다.</p>' +
            '<div class="seg seg-4" id="retention">' + [1, 3, 6, 12].map(function (m) {
              return '<label class="seg-item"><input type="radio" name="retention" value="' + m + '"' + ((v.retentionMonths || 3) === m ? ' checked' : '') + '><span>' + m + '개월</span></label>';
            }).join('') + '</div>') +
        '</section>'
      );
      app.querySelectorAll('input[name=retention]').forEach(function (r) {
        r.addEventListener('change', function () {
          vessel.retentionMonths = Number(r.value);
          DB.put('vessel', vessel).then(function () { toast('보관 기간을 ' + r.value + '개월로 바꿨습니다'); });
        });
      });
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
              '<div class="head-links"><a class="head-link" href="#/history">지난 명부</a><a class="head-link" href="#/settings">설정</a></div>' +
            '</header>' +
            '<h1>' + fmtDate(today) + '</h1>' +
            (crew.some(function (c) { return c.role === '선장'; }) ? '' :
              '<a class="notice notice-warn notice-link" href="#/crew/new"><b>선장 정보가 없습니다.</b> 명부에 들어갈 선장 정보를 먼저 추가해 주세요 ›</a>') +
            (voyages.length ? '<ul class="voyage-list">' + voyages.map(function (v, i) { return voyageCard(v, lists[i]); }).join('') + '</ul>'
              : '<p class="empty-big">오늘 열린 항차가 없습니다.<br>출항 전에 항차를 열고 손님 QR을 찍으세요.</p>') +
            '<a class="btn btn-secondary home-poster" href="poster.html">배에 붙일 안내문 인쇄</a>' +
            '<details class="howto"' + (voyages.length ? '' : ' open') + '><summary>처음 쓰는 순서</summary><ol>' +
              '<li><b>설정</b>에서 배 정보와 선장·선원을 넣습니다</li>' +
              '<li><b>안내문 인쇄</b>로 QR 안내문을 뽑아 코팅해 배에 붙입니다</li>' +
              '<li>출항 전 <b>항차 열기 → QR 스캔</b>으로 손님 QR을 찍습니다</li>' +
              '<li>신분증을 보며 한 명씩 <b>신분증 확인</b>을 누르고 <b>명부 확정</b></li>' +
              '<li><b>미리보기 · 보내기</b>에서 PDF·사진을 카톡·메일로 보내 보관합니다(엑셀은 <b>엑셀 저장</b>)</li>' +
            '</ol></details>' +
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

  function voyageCard(v, list, withDate) {
    var res = Rules.check(vessel, v, list);
    var state = v.status === 'confirmed'
      ? (v.sharedAt ? '<span class="badge badge-ok">확정·보냄</span>' : '<span class="badge badge-warn">확정·미전송</span>')
      : '<span class="badge">진행 중</span>';
    return '<li><a class="voyage-card' + (res.over ? ' over' : '') + '" href="#/v/' + encodeURIComponent(v.id) + '">' +
      '<span class="voyage-no">' + (withDate ? fmtDate(v.date).slice(5) + ' ' : '') + v.no + '항차 ' + state + '</span>' +
      '<span class="voyage-meta num">' + fmtTime(v.openedAt) + ' 열림' + (res.items.length ? ' · ⚠ 경고 ' + res.items.length + '건' : '') + '</span>' +
      '<span class="voyage-count num"><b>' + res.total + '</b> / ' + vessel.capacity + '명</span>' +
    '</a></li>';
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

  var SOURCE = { camera: 'QR', image: '사진', manual: '직접', merge: '합침' };
  function personRow(v, p, res) {
    var age = BMQR.age(p.birth, Rules.dateOf(v.date));
    var warns = (res.byPerson[p.id] || []).map(function (k) { return '<span class="warn-tag">⚠ ' + Rules.LABEL[k] + '</span>'; }).join('');
    var locked = v.status === 'confirmed';
    var check = p.excluded ? '<span class="idcheck idcheck-off">제외</span>'
      : '<button type="button" class="idcheck' + (p.idCheckedAt ? ' on' : '') + '" data-check="' + p.id + '"' + (locked ? ' disabled' : '') + ' aria-pressed="' + !!p.idCheckedAt + '">' +
        (p.idCheckedAt ? '✓<small class="num">' + fmtTime(p.idCheckedAt) + '</small>' : '신분증<br>확인') + '</button>';
    return '<li class="row row-pax' + (p.excluded ? ' excluded' : '') + '">' + check +
      '<a class="row-body" href="#/v/' + encodeURIComponent(v.id) + '/p/' + p.id + '">' +
        '<span class="row-main"><b>' + esc(p.name) + '</b>' +
          '<span class="row-age num">' + (age == null ? '' : '만 ' + age + '세') + ' · ' + esc(p.sex) + '</span>' +
          '<span class="tag">' + (p.excluded ? '승선 제외' : (SOURCE[p.source] || '')) + '</span></span>' +
        '<span class="row-sub num">' + fmtBirth(p.birth) + ' · ' + esc(p.phone) + '</span>' +
        (warns ? '<span class="warn-tags">' + warns + '</span>' : '') +
      '</a></li>';
  }

  function groupBlock(v, g, res) {
    var rep = g.members[0];
    var more = g.members.length - 1;
    var missing = g.cnt - g.members.length;
    return '<li class="group">' +
      '<p class="group-title">대표자 <b>' + esc(rep.name) + '</b>' + (more > 0 ? ' 외 ' + more + '명' : '') + '</p>' +
      (missing > 0 && v.status !== 'confirmed' ? '<p class="group-missing">⚠ 일행 ' + g.cnt + '명 중 ' + g.members.length + '명 등록 — ' + missing + '명 더 찍어 주세요</p>' : '') +
      '<ul class="rows">' + g.members.map(function (p) { return personRow(v, p, res); }).join('') + '</ul>' +
    '</li>';
  }

  function countBar(v, res, list) {
    var pax = list.filter(function (p) { return !p.excluded; }).length;
    return '<div class="count-bar' + (res.over ? ' over' : '') + '" id="count-bar">' +
      '<p class="count-main num"><b id="count-total">' + res.total + '</b> / ' + vessel.capacity + '명</p>' +
      '<p class="count-sub num">승객 ' + pax + '명 · 선장·선원 ' + (v.crew || []).length + '명' +
        (list.length > pax ? ' · 제외 ' + (list.length - pax) + '명' : '') + (res.over ? ' · <b>정원 초과</b>' : '') + '</p>' +
    '</div>';
  }

  function warnBox(res) {
    if (!res.items.length) return '';
    return '<div class="warn-box"><p class="warn-box-title">⚠ 확인할 것 ' + res.items.length + '건</p><ul>' +
      res.items.map(function (w) { return '<li>' + esc(w.text) + '</li>'; }).join('') + '</ul></div>';
  }

  function renderVoyage(v) {
    return DB.passengers(v.id).then(function (list) {
      var res = Rules.check(vessel, v, list);
      var rows = buildRows(list);
      var locked = v.status === 'confirmed';
      var allChecked = res.needCheck > 0 && res.checked === res.needCheck;
      var vid = encodeURIComponent(v.id);
      view(
        '<section class="screen">' +
          '<a class="back" href="#/">← 오늘 항차</a>' +
          '<h1>' + voyageTitle(v) + '</h1>' +
          (locked ? '<div class="confirmed-box"><p><b>✓ 명부 확정</b> <span class="num">' + Export.dateTime(v.confirmedAt) + '</span></p>' +
            '<p class="hint">' + (v.sharedAt ? '보낸 시각 ' + Export.dateTime(v.sharedAt) : '<b class="text-warn">아직 보내지 않았습니다(미전송)</b>') + '</p></div>' : '') +
          countBar(v, res, list) +
          warnBox(res) +
          '<a class="btn btn-secondary" href="#/v/' + vid + '/sheet">미리보기</a>' +
          (locked ? '' :
            '<div class="actions">' +
              '<button class="btn btn-primary btn-big" id="go-scan" type="button">QR 스캔</button>' +
              '<div class="actions-row">' +
                '<label class="btn btn-secondary file-btn">사진에서 QR<input type="file" accept="image/*" multiple id="file-in"></label>' +
                '<a class="btn btn-secondary" href="#/v/' + vid + '/manual">직접 입력</a>' +
              '</div>' +
            '</div>' +
            '<p class="file-result" id="file-result" hidden></p>') +
          '<h2 class="section-title">승객 <span class="num">' + res.needCheck + '</span>명 · 신분증 확인 <span class="num" id="check-count">' + res.checked + '/' + res.needCheck + '</span></h2>' +
          (locked ? '' : '<p class="hint">신분증 실물을 보고 왼쪽 버튼을 누르세요. 이름을 누르면 수정·승선 제외를 할 수 있습니다.</p>') +
          (list.length ? '<ul class="pax-list">' + rows.map(function (r) {
            return r.group ? groupBlock(v, r, res) : '<li class="single"><ul class="rows">' + personRow(v, r.person, res) + '</ul></li>';
          }).join('') + '</ul>' : '<p class="empty">아직 등록된 승객이 없습니다. QR 스캔을 눌러 손님 QR을 찍으세요.</p>') +
          '<h2 class="section-title">선장·선원 <span class="num">' + (v.crew || []).length + '</span>명</h2>' +
          '<p class="hint">명부 맨 위에 자동으로 들어갑니다.</p>' +
          ((v.crew || []).length ? '<ul class="rows">' + v.crew.map(function (c) {
            return '<li class="row"><span class="row-main"><b>' + esc(c.name) + '</b><span class="tag">' + esc(c.role) + '</span></span>' +
              '<span class="row-sub num">' + fmtBirth(c.birth) + ' · ' + esc(c.phone) + '</span></li>';
          }).join('') + '</ul>' : '<a class="notice notice-warn notice-link" href="#/crew/new">선장·선원이 없습니다. 설정에서 추가해 주세요 ›</a>') +
          (locked ? '<div class="danger-zone"><button class="btn btn-secondary" id="unlock" type="button">확정 풀기 (PIN)</button>' +
            '<p class="hint">고칠 것이 있을 때만 푸세요. 다시 확정하면 새로 보내야 합니다.</p></div>' : '') +
        '</section>' +
        '<div class="bottom-bar">' +
          (locked
            ? '<a class="btn btn-primary" href="#/v/' + vid + '/sheet">미리보기 · 보내기</a>'
            : '<button class="btn btn-primary" id="confirm-btn" type="button"' + (allChecked ? '' : ' disabled') + '>' +
                (allChecked ? '명부 확정' : res.needCheck ? '신분증 확인 ' + res.checked + '/' + res.needCheck + ' — 모두 확인하면 확정' : '승객을 먼저 등록하세요') + '</button>') +
        '</div>'
      );

      // 신분증 확인 켜고 끄기
      app.querySelectorAll('[data-check]').forEach(function (b) {
        b.addEventListener('click', function () {
          var p = list.filter(function (x) { return x.id === Number(b.getAttribute('data-check')); })[0];
          if (!p) return;
          p.idCheckedAt = p.idCheckedAt ? null : Date.now();
          DB.put('passenger', p).then(function () {
            if (p.idCheckedAt) Scanner.feedback('ok');
            var y = window.scrollY;
            renderVoyage(v).then(function () { window.scrollTo(0, y); });
          });
        });
      });

      var scanBtn = document.getElementById('go-scan');
      if (scanBtn) scanBtn.addEventListener('click', function () {
        Scanner.unlockSound();   // 소리는 버튼을 누를 때 켜 둬야 난다
        go('#/v/' + vid + '/scan');
      });
      var fileIn = document.getElementById('file-in');
      if (fileIn) bindFileInput(v, fileIn, document.getElementById('file-result'), function () { return renderVoyage(v); });

      var cb = document.getElementById('confirm-btn');
      if (cb) cb.addEventListener('click', function () {
        var body = res.items.length
          ? '경고 ' + res.items.length + '건이 있습니다: ' + res.items.map(function (w) { return w.text; }).join(' / ') + '. 그래도 확정하면 수정이 잠깁니다.'
          : '승객 ' + res.needCheck + '명, 선장·선원 ' + (v.crew || []).length + '명으로 명부를 확정합니다. 확정하면 수정이 잠깁니다.';
        UI.confirm(res.items.length ? '경고가 있습니다. 확정할까요?' : '명부를 확정할까요?', body, '확정', 'primary').then(function (ok) {
          if (!ok) return;
          v.status = 'confirmed'; v.confirmedAt = Date.now(); v.sharedAt = null;
          DB.put('voyage', v).then(function () { toast('명부를 확정했습니다'); renderVoyage(v); window.scrollTo(0, 0); });
        });
      });

      var ub = document.getElementById('unlock');
      if (ub) ub.addEventListener('click', function () {
        askPin('확정 풀기').then(function (ok) {
          if (!ok) return;
          v.status = 'open'; v.confirmedAt = null; v.sharedAt = null;
          DB.put('voyage', v).then(function () { toast('확정을 풀었습니다. 고친 뒤 다시 확정하세요'); renderVoyage(v); });
        });
      });

    });
  }

  // ---------- 명부 보기: 제출 양식과 같은 순서·항목을 화면에서 확인 ----------
  function renderSheet(v) {
    return DB.passengers(v.id).then(function (list) {
      var s = Export.summary(vessel, v, list), rows = Export.manifestRows(v, list);
      var excluded = list.filter(function (p) { return p.excluded; }).length;
      var vid = encodeURIComponent(v.id);
      var line = function (label, val, cls) {
        return '<div class="sheet-line"><dt>' + label + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(val || '-') + '</dd></div>';
      };
      view(
        '<section class="screen sheet-view">' +
          '<a class="back" href="#/v/' + vid + '">← ' + v.no + '항차 명단</a>' +
          '<h1>' + s.title + '</h1>' +
          '<div class="sheet-head">' + s.lines.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') + '</div>' +
          (v.status === 'confirmed'
            ? '<p class="hint">' + (v.sharedAt ? '보낸 시각 ' + Export.dateTime(v.sharedAt) : '<b class="text-warn">아직 보내지 않았습니다(미전송)</b>') + '</p>'
            : '<p class="notice notice-warn">아직 확정 전입니다. 신분증 확인을 마치고 명부를 확정하면 이 내용 그대로 PDF·사진·엑셀로 보낼 수 있습니다.</p>') +
          (excluded ? '<p class="hint">승선 제외한 ' + excluded + '명은 명부에서 빠집니다.</p>' : '') +
          (rows.length ? '<ol class="sheet-list">' + rows.map(function (r) {
            var crew = r.kind !== '승객';
            return '<li class="sheet-row' + (crew ? ' sheet-crew' : '') + '">' +
              '<p class="sheet-title"><span class="sheet-no num">' + r.no + '</span><b>' + esc(r.name) + '</b><span class="tag">' + esc(r.kind) + '</span></p>' +
              '<dl>' +
                line('생년월일', fmtBirth(r.birth) + ' · ' + r.sex) +
                line('주소', r.addr) +
                line('휴대전화', r.phone) +
                (crew ? '' : line('비상연락처', r.emer) + line('일행', r.group) +
                  line('신분증 확인', r.idcheck, r.idcheck === '확인 안 함' ? 'text-danger' : '')) +
              '</dl></li>';
          }).join('') + '</ol>' : '<p class="empty-big">아직 명부에 들어갈 사람이 없습니다.</p>') +
          '<p class="hint sheet-foot">' + esc(s.foot) + '</p>' +
        '</section>' +
        '<div class="bottom-bar">' + (v.status === 'confirmed'
          ? '<div class="send-row send-row-3">' +
              '<button class="btn btn-primary" id="send-pdf" type="button">PDF 보내기</button>' +
              '<button class="btn btn-primary" id="send-png" type="button">사진 보내기</button>' +
              '<button class="btn btn-secondary" id="save-xlsx" type="button">엑셀 저장</button></div>' +
            '<p class="send-state" id="send-state" hidden></p>'
          : '<a class="btn btn-primary" href="#/v/' + vid + '">명단으로 돌아가기</a>') + '</div>'
      );
      if (v.status === 'confirmed') bindSend(v, list);
    });
  }

  // 확정한 명부: 파일을 미리 만들어 둔다(공유는 버튼을 누른 직후에만 허락되므로)
  // PDF·사진은 공유 창으로(안 되면 다운로드), 엑셀은 폰 크롬이 공유를 막으므로 바로 다운로드 폴더에 저장
  function bindSend(v, list) {
    var ready = buildFiles(v, list);
    var st = document.getElementById('send-state');
    var LABEL = { pdf: 'PDF', png: '사진', xlsx: '엑셀' };
    ready.then(function (files) {
      st.hidden = false;
      st.textContent = files.map(function (f) { return LABEL[f.name.split('.').pop()] + ' ' + kb(f.data.length); }).join(' · ') + ' 준비됨';
    }, function () { st.hidden = false; st.textContent = '파일을 만들지 못했습니다. 다시 열어 주세요'; });
    var howToSend = function (f) {
      return '카톡 채팅방에서 ＋ → 파일 → 다운로드로 들어가 "' + f.name + '" 파일을 골라 보내세요. ' +
        '또는 내 파일 → 다운로드에서 파일을 길게 누르고 공유를 누르세요.';
    };
    var after = function () { return renderSheet(v); };
    var bind = function (id, idx) {
      var btn = document.getElementById(id);
      btn.addEventListener('click', function () {
        btn.disabled = true;
        ready.then(function (files) {
          var f = files[idx], label = LABEL[f.name.split('.').pop()];
          var how = f.name.slice(-5) === '.xlsx' ? Promise.resolve(Export.save(f)) : Export.deliver([f], voyageTitle(v) + ' 승선자명부');
          return how.then(function (how) {
            if (how === 'cancelled') { toast('보내기를 취소했습니다'); return; }
            v.sharedAt = Date.now();
            return DB.put('voyage', v).then(function () {
              if (how === 'shared') { toast(label + (label === 'PDF' ? '를' : '을') + ' 보냈습니다'); return after(); }
              return UI.confirm(label + ' 파일을 다운로드 폴더에 저장했습니다',
                (label === '엑셀' ? '' : '이 폰에서는 바로 보내기가 안 됩니다. ') + howToSend(f),
                '알겠습니다', 'primary', false).then(after);
            });
          });
        }).catch(function () { toast('파일을 만들지 못했습니다. 다시 눌러 주세요', true); }).then(function () { btn.disabled = false; });
      });
    };
    bind('send-pdf', 0); bind('send-png', 1); bind('save-xlsx', 2);
  }

  function kb(n) { return n < 1024 ? n + 'B' : (n / 1024).toFixed(n < 10240 ? 1 : 0) + 'KB'; }

  function buildFiles(v, list) {
    var base = Export.fileBase(vessel, v);
    return Promise.all([Export.pdf(vessel, v, list), Export.png(vessel, v, list)]).then(function (out) {
      return [
        { name: base + '.pdf', type: Export.PDF_MIME, data: out[0] },
        { name: base + '.png', type: 'image/png', data: out[1] },
        { name: base + '.xlsx', type: Xlsx.MIME, data: Export.xlsx(vessel, v, list) }
      ];
    });
  }

  // PIN 이 있으면 PIN 을 묻고, 없으면 확인만 받는다
  function askPin(title) {
    if (!vessel.pinHash) {
      return UI.confirm(title, 'PIN이 설정되어 있지 않아 바로 풉니다. 설정에서 PIN을 켜 두면 다른 사람이 풀 수 없습니다.', '풀기', 'primary');
    }
    var dlg = document.getElementById('pin-dialog'), input = document.getElementById('pin-dialog-input'), err = document.getElementById('pin-dialog-err');
    document.getElementById('pin-dialog-title').textContent = title;
    input.value = ''; err.textContent = '';
    return new Promise(function (resolve) {
      function done(v) { dlg.removeEventListener('click', onClick); if (dlg.open) dlg.close(); resolve(v); }
      function onClick(e) {
        var b = e.target.closest('button');
        if (!b) return;
        e.preventDefault();
        if (b.value !== 'ok') return done(false);
        hashPin(input.value, vessel.pinSalt).then(function (h) {
          if (h === vessel.pinHash) done(true);
          else { err.textContent = '⚠ PIN이 맞지 않습니다'; input.value = ''; input.focus(); }
        });
      }
      dlg.addEventListener('click', onClick);
      dlg.showModal();
      input.focus();
    });
  }

  // ---------- 승객 한 명: 수정 · 승선 제외 · 지우기 ----------
  function renderPerson(v, pid) {
    return DB.get('passenger', pid).then(function (p) {
      if (!p || p.voyageId !== v.id) { go('#/v/' + encodeURIComponent(v.id)); return; }
      return DB.passengers(v.id).then(function (list) {
        var res = Rules.check(vessel, v, list);
        var locked = v.status === 'confirmed';
        var back = '#/v/' + encodeURIComponent(v.id);
        var warns = res.items.filter(function (w) { return w.pid === p.id; });
        view(
          '<section class="screen">' +
            '<a class="back" href="' + back + '">← ' + v.no + '항차 명단</a>' +
            '<h1>' + esc(p.name) + (p.excluded ? ' <span class="tag">승선 제외</span>' : '') + '</h1>' +
            '<p class="hint">' + (SOURCE[p.source] || '') + '로 등록 · ' + fmtTime(p.addedAt) + (p.device ? ' · ' + esc(p.device) : '') +
              (p.made ? ' · QR 만든 날 ' + p.made.replace(/-/g, '.') : '') + (p.grp ? ' · 일행 ' + p.idx + '/' + p.cnt : '') + '</p>' +
            (warns.length ? '<div class="warn-box"><ul>' + warns.map(function (w) { return '<li>' + esc(w.text) + '</li>'; }).join('') + '</ul></div>' : '') +
            '<p class="notice">' + (p.idCheckedAt ? '✓ 신분증 확인 <b class="num">' + Export.dateTime(p.idCheckedAt) + '</b>' : '아직 신분증을 확인하지 않았습니다') + '</p>' +
            (locked ? '<p class="notice notice-warn">확정한 명부라 고칠 수 없습니다. 명단 화면 아래 "확정 풀기"를 먼저 하세요.</p>' : '') +
            '<form id="eform" class="form" novalidate>' +
              '<fieldset class="form-fields"' + (locked ? ' disabled' : '') + '>' +
                PersonForm.fieldsHtml(p, { auto: false, phoneHint: '휴대전화가 없으면 보호자 번호를 적어 주세요' }) +
              '</fieldset>' +
              (locked ? '' : '<div class="bottom-bar"><button class="btn btn-primary" type="submit">수정 저장</button></div>') +
            '</form>' +
            (locked ? '' :
              '<div class="danger-zone">' +
                '<button class="btn btn-secondary" id="exclude" type="button">' + (p.excluded ? '승선 제외 취소' : '승선 제외 (이번 배에 안 탐)') + '</button>' +
                '<p class="hint">제외하면 인원과 명부에서 빠지고, 화면에는 흐리게 남습니다.</p>' +
                '<button class="btn btn-danger" id="remove" type="button">명단에서 지우기 (잘못 찍음)</button>' +
              '</div>') +
          '</section>'
        );
        if (locked) return;
        var f = document.getElementById('eform');
        PersonForm.bind(f);
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var d = PersonForm.read(f);
          if (PersonForm.showErrors(f, PersonForm.validate(d, { mobileOnly: false }))) { toast('빠진 항목을 채워 주세요'); return; }
          DB.updatePassenger(Object.assign(p, d)).then(function (r) {
            if (r.dup) { PersonForm.setErr('name', '같은 성명·생년월일·전화번호의 승객이 이미 있습니다'); return; }
            toast('수정했습니다');
            go(back);
          });
        });
        document.getElementById('exclude').addEventListener('click', function () {
          p.excluded = !p.excluded;
          DB.put('passenger', p).then(function () { toast(p.excluded ? p.name + ' 님을 승선 제외했습니다' : '승선 제외를 취소했습니다'); go(back); });
        });
        document.getElementById('remove').addEventListener('click', function () {
          UI.confirm(p.name + ' 님을 명단에서 지울까요?', '잘못 찍은 사람을 지웁니다. 되돌릴 수 없습니다. 다시 넣으려면 QR을 다시 찍으세요.', '지우기').then(function (ok) {
            if (!ok) return;
            DB.del('passenger', p.id).then(function () { toast('지웠습니다'); go(back); });
          });
        });
      });
    });
  }

  // ---------- 지난 명부 ----------
  function monthOf(ymd) { return ymd.slice(0, 7); }
  function renderHistory() {
    return DB.all('voyage').then(function (all) {
      all.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.no - a.no; });
      return Promise.all(all.map(function (v) { return DB.passengers(v.id); })).then(function (lists) {
        var thisMonth = monthOf(BMQR.today());
        var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
        var lastMonth = d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1);
        var unsent = all.filter(function (v) { return v.status === 'confirmed' && !v.sharedAt; }).length;
        var html = '', curDate = '';
        all.forEach(function (v, i) {
          if (v.date !== curDate) { if (curDate) html += '</ul>'; curDate = v.date; html += '<h2 class="date-head">' + fmtDate(v.date) + '</h2><ul class="voyage-list">'; }
          html += voyageCard(v, lists[i]);
        });
        if (curDate) html += '</ul>';
        view(
          '<section class="screen">' +
            '<a class="back" href="#/">← 오늘 항차</a>' +
            '<h1>지난 명부</h1>' +
            '<p class="hint">보관 기간 ' + (vessel.retentionMonths || 3) + '개월. 지난 명부는 앱을 열 때 지웁니다.' + (unsent ? ' <b class="text-warn">미전송 ' + unsent + '건</b>' : '') + '</p>' +
            '<div class="actions-row">' +
              '<button class="btn btn-secondary" type="button" data-month="' + thisMonth + '">이번 달 전체 엑셀</button>' +
              '<button class="btn btn-secondary" type="button" data-month="' + lastMonth + '">지난달 전체 엑셀</button>' +
            '</div>' +
            (all.length ? html : '<p class="empty-big">아직 명부가 없습니다.</p>') +
          '</section>'
        );
        app.querySelectorAll('[data-month]').forEach(function (b) {
          b.addEventListener('click', function () {
            var m = b.getAttribute('data-month');
            var items = all.map(function (v, i) { return { voyage: v, passengers: lists[i] }; })
              .filter(function (it) { return monthOf(it.voyage.date) === m && it.voyage.status === 'confirmed'; })
              .sort(function (a, c) { return a.voyage.date < c.voyage.date ? -1 : a.voyage.date > c.voyage.date ? 1 : a.voyage.no - c.voyage.no; });
            if (!items.length) { toast(m.replace('-', '년 ') + '월에 확정한 명부가 없습니다'); return; }
            var name = (m + '_전체_' + vessel.name).replace(/[\\\/:*?"<>|\s]+/g, '_') + '.xlsx';
            Export.deliver([{ name: name, type: Xlsx.MIME, data: Export.monthXlsx(vessel, m, items) }], m + ' 승선자명부')
              .then(function (how) { if (how !== 'cancelled') toast(items.length + '개 항차를 엑셀 한 파일로 ' + (how === 'shared' ? '보냈습니다' : '저장했습니다')); });
          });
        });
      });
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
