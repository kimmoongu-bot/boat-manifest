/* 선장 앱 저장소 (IndexedDB) — 테이블: vessel, crew, voyage, passenger
 * vessel   : { id:'main', name, number, capacity, deviceName, pinSalt, pinHash }
 * crew     : { id(자동), role:'선장'|'선원', name, birth, sex, addr, phone, order }
 * voyage   : { id:'YYYY-MM-DD_N', date, no, openedAt, status:'open'|'confirmed', confirmedAt, sharedAt, deviceName, crew:[선장·선원 사본] }
 * passenger: { id(자동), voyageId, key(성명|생년월일|전화), name, birth, sex, addr, phone, emerName, emerPhone,
 *              grp, idx, cnt, made, source:'camera'|'image'|'manual'|'merge', addedAt, device,
 *              idCheckedAt(신분증 확인 시각, 없으면 null), excluded(승선 제외) }
 */
(function (root) {
  'use strict';

  var NAME = 'boat-manifest', VER = 1;
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      var req = indexedDB.open(NAME, VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('vessel')) db.createObjectStore('vessel', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('crew')) db.createObjectStore('crew', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('voyage')) {
          db.createObjectStore('voyage', { keyPath: 'id' }).createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('passenger')) {
          var ps = db.createObjectStore('passenger', { keyPath: 'id', autoIncrement: true });
          ps.createIndex('voyageId', 'voyageId');
          ps.createIndex('voyageKey', ['voyageId', 'key'], { unique: true });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }

  function wrap(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(stores, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(stores, mode), out;
        Promise.resolve(fn(t)).then(function (v) { out = v; }, reject);
        t.oncomplete = function () { resolve(out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function get(store, key) { return tx(store, 'readonly', function (t) { return wrap(t.objectStore(store).get(key)); }); }
  function put(store, val) { return tx(store, 'readwrite', function (t) { return wrap(t.objectStore(store).put(val)); }); }
  function del(store, key) { return tx(store, 'readwrite', function (t) { return wrap(t.objectStore(store).delete(key)); }); }
  function all(store) { return tx(store, 'readonly', function (t) { return wrap(t.objectStore(store).getAll()); }); }
  function byIndex(store, index, value) {
    return tx(store, 'readonly', function (t) { return wrap(t.objectStore(store).index(index).getAll(value)); });
  }

  // 같은 항차에 같은 사람(성명+생년월일+전화)이 있으면 넣지 않고 그 사람을 돌려준다
  function addPassenger(p) {
    p.key = BMQR.personKey(p);
    return tx('passenger', 'readwrite', function (t) {
      var s = t.objectStore('passenger');
      return wrap(s.index('voyageKey').get([p.voyageId, p.key])).then(function (found) {
        if (found) return { dup: found };
        return wrap(s.add(p)).then(function (id) { p.id = id; return { added: p }; });
      });
    });
  }

  function passengers(voyageId) {
    return byIndex('passenger', 'voyageId', voyageId).then(function (list) {
      return list.sort(function (a, b) { return a.addedAt - b.addedAt; });
    });
  }

  function crewList() {
    return all('crew').then(function (list) {
      return list.sort(function (a, b) {
        if (a.role !== b.role) return a.role === '선장' ? -1 : 1;
        return (a.order || 0) - (b.order || 0) || a.id - b.id;
      });
    });
  }

  // 오늘 열린(확정 전) 항차의 선장·선원 사본을 새 명단으로 바꾼다
  function refreshOpenVoyageCrew(date) {
    return Promise.all([crewList(), byIndex('voyage', 'date', date)]).then(function (r) {
      var crew = r[0];
      return Promise.all(r[1].filter(function (v) { return v.status === 'open'; }).map(function (v) {
        v.crew = crew;
        return put('voyage', v);
      }));
    });
  }

  // 오늘 다음 항차 번호로 새 항차를 연다
  function openVoyage(date, deviceName) {
    return Promise.all([crewList(), byIndex('voyage', 'date', date)]).then(function (r) {
      var no = r[1].reduce(function (m, v) { return Math.max(m, v.no); }, 0) + 1;
      var v = { id: date + '_' + no, date: date, no: no, openedAt: Date.now(), status: 'open', deviceName: deviceName || '', crew: r[0] };
      return put('voyage', v).then(function () { return v; });
    });
  }

  // 정보를 고치면 같은 사람 판단 키도 다시 만든다. 다른 승객과 겹치면 {dup:true}
  function updatePassenger(p) {
    p.key = BMQR.personKey(p);
    return tx('passenger', 'readwrite', function (t) {
      var s = t.objectStore('passenger');
      return wrap(s.index('voyageKey').get([p.voyageId, p.key])).then(function (found) {
        if (found && found.id !== p.id) return { dup: found };
        return wrap(s.put(p)).then(function () { return { saved: p }; });
      });
    });
  }

  // 항차와 그 승객을 함께 지운다
  function deleteVoyage(id) {
    return tx(['voyage', 'passenger'], 'readwrite', function (t) {
      var ps = t.objectStore('passenger');
      t.objectStore('voyage').delete(id);
      return wrap(ps.index('voyageId').getAllKeys(id)).then(function (keys) {
        keys.forEach(function (k) { ps.delete(k); });
        return keys.length;
      });
    });
  }

  root.DB = {
    open: open, get: get, put: put, del: del, all: all, byIndex: byIndex,
    addPassenger: addPassenger, updatePassenger: updatePassenger, passengers: passengers, crewList: crewList,
    openVoyage: openVoyage, refreshOpenVoyageCrew: refreshOpenVoyageCrew, deleteVoyage: deleteVoyage
  };
})(window);
