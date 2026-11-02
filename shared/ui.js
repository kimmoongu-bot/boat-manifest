/* 두 앱 공용: 토스트, 확인 창. 페이지에 #toast 와 #confirm(dialog) 가 있어야 한다 */
(function (root) {
  'use strict';

  var toastTimer;
  // isError: 빨간색으로 6초 (저장 실패 같은 것)
  function toast(msg, isError) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    t.classList.toggle('toast-error', !!isError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, isError ? 6000 : 1500);
  }

  // okKind: 'danger'(기본) | 'primary'
  function confirm(title, body, okLabel, okKind) {
    var dlg = document.getElementById('confirm');
    var ok = document.getElementById('confirm-ok');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').textContent = body;
    ok.textContent = okLabel;
    ok.className = 'btn ' + (okKind === 'primary' ? 'btn-primary' : 'btn-danger');
    return new Promise(function (resolve) {
      if (typeof dlg.showModal !== 'function') { resolve(root.confirm(title + '\n\n' + body)); return; }
      // 'close' 이벤트는 브라우저에 따라 늦게 오거나 안 와서 버튼 클릭으로 직접 받는다
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        dlg.removeEventListener('click', onClick);
        dlg.removeEventListener('cancel', onCancel);
        if (dlg.open) dlg.close();
        resolve(v);
      }
      function onClick(e) {
        var b = e.target.closest('button');
        if (!b) return;
        e.preventDefault();
        finish(b.value === 'ok');
      }
      function onCancel() { finish(false); }
      dlg.addEventListener('click', onClick);
      dlg.addEventListener('cancel', onCancel);
      dlg.showModal();
    });
  }

  root.UI = { toast: toast, confirm: confirm };
})(window);
