/* 명부 경고: 정원 초과, 보호자 없는 14세 미만, QR 만든 지 1년 넘음
 * 나이와 QR 경과일은 항차 날짜 기준으로 센다. 승선 제외한 사람은 셈에서 뺀다.
 */
(function (root) {
  'use strict';

  var CHILD_AGE = 14;   // 이 나이 미만이면 보호자 확인
  var ADULT_AGE = 19;   // 같은 일행에 이 나이 이상이 있으면 보호자 동반으로 본다
  var OLD_QR_DAYS = 365;

  function dateOf(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  function daysBetween(a, b) {
    var da = dateOf(a), db = dateOf(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400000);
  }

  // 결과: { total, capacity, over, items:[{kind, text, pid}], byPerson:{pid:[kind…]}, checked, needCheck }
  function check(vessel, voyage, passengers) {
    var on = dateOf(voyage.date) || new Date();
    var active = passengers.filter(function (p) { return !p.excluded; });
    var crew = voyage.crew || [];
    var total = active.length + crew.length;
    var out = { total: total, capacity: vessel.capacity, over: total > vessel.capacity, items: [], byPerson: {},
      checked: active.filter(function (p) { return p.idCheckedAt; }).length, needCheck: active.length };

    function add(kind, text, p) {
      out.items.push({ kind: kind, text: text, pid: p ? p.id : null });
      if (p) (out.byPerson[p.id] = out.byPerson[p.id] || []).push(kind);
    }

    if (out.over) add('capacity', '정원 초과: ' + total + '명 / 정원 ' + vessel.capacity + '명 (' + (total - vessel.capacity) + '명 넘음)');

    var adultsByGrp = {};
    active.forEach(function (p) {
      var a = BMQR.age(p.birth, on);
      if (p.grp && a != null && a >= ADULT_AGE) adultsByGrp[p.grp] = true;
    });
    active.forEach(function (p) {
      var a = BMQR.age(p.birth, on);
      if (a != null && a < CHILD_AGE && !(p.grp && adultsByGrp[p.grp])) {
        add('minor', p.name + ' 님 만 ' + a + '세 — 같은 일행에 보호자(성인)가 없습니다', p);
      }
      if (p.source !== 'manual' && p.made && daysBetween(p.made, voyage.date) > OLD_QR_DAYS) {
        add('oldqr', p.name + ' 님 QR을 만든 지 1년이 넘었습니다(' + p.made.replace(/-/g, '.') + ') — 정보가 맞는지 확인하세요', p);
      }
    });
    return out;
  }

  var LABEL = { capacity: '정원 초과', minor: '보호자 없는 14세 미만', oldqr: 'QR 1년 넘음' };

  root.Rules = { check: check, LABEL: LABEL, CHILD_AGE: CHILD_AGE, ADULT_AGE: ADULT_AGE, dateOf: dateOf };
})(window);
