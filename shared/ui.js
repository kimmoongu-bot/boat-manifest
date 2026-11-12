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

  // okKind: 'danger'(기본) | 'primary', cancelLabel: 기본 '취소', false 면 취소 버튼 없이 안내만
  function confirm(title, body, okLabel, okKind, cancelLabel) {
    var dlg = document.getElementById('confirm');
    var ok = document.getElementById('confirm-ok');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').textContent = body;
    ok.textContent = okLabel;
    var cancelBtn = dlg.querySelector('button[value=cancel]');
    cancelBtn.textContent = cancelLabel || '취소';
    cancelBtn.hidden = cancelLabel === false;
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

  // 비밀번호 네모칸: 진짜 입력칸은 투명하게 위에 깔고, 아래 네모 max 칸에 넣은 자리만큼 ● 를 그린다
  // (숫자 키패드·입력값 가림 그대로, type=text 라 크롬 "비밀번호 저장" 창이 안 뜸)
  function pinInput(id, name, max, big) {
    var cells = '';
    for (var i = 0; i < max; i++) cells += '<i></i>';
    return '<div class="pin-boxes' + (big ? ' pin-boxes-big' : '') + '" style="--pin-n:' + max + '">' +
      '<input id="' + id + '"' + (name ? ' name="' + name + '"' : '') + ' type="text" inputmode="numeric" pattern="[0-9]*" maxlength="' + max + '"' +
      ' autocomplete="off" data-lpignore="true" spellcheck="false" autocapitalize="off" class="pin-input">' +
      '<span class="pin-cells" aria-hidden="true">' + cells + '</span></div>';
  }
  // 값을 코드로 바꾼 뒤(틀려서 지울 때 등) 네모칸을 다시 그린다
  function pinSync(input) {
    var box = input && input.closest && input.closest('.pin-boxes');
    if (!box) return;
    var cells = box.querySelectorAll('.pin-cells i');
    var n = input.value.length, focused = document.activeElement === input;
    cells.forEach(function (c, i) {
      c.classList.toggle('on', i < n);
      c.classList.toggle('cur', focused && i === Math.min(n, cells.length - 1));
    });
  }
  ['input', 'focusin', 'focusout'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var t = e.target;
      if (!t.classList || !t.classList.contains('pin-input')) return;
      if (ev === 'focusout') setTimeout(function () { pinSync(t); }); else pinSync(t);
    });   // 버블 단계: 화면 코드가 숫자만 남긴 뒤에 그린다
  });

  // 하단 고정 버튼 높이를 --bar-h 로 → 화면 아래 여백이 딱 그만큼만 (짧은 화면에 쓸데없는 스크롤 없음)
  var barQueued = false;
  function syncBar() {
    barQueued = false;
    var h = 0;
    document.querySelectorAll('.bottom-bar').forEach(function (b) {
      if (b.getClientRects().length && getComputedStyle(b).position === 'fixed') h = Math.max(h, b.offsetHeight);
    });
    document.documentElement.style.setProperty('--bar-h', h + 'px');
  }
  function queueBar() { if (!barQueued) { barQueued = true; requestAnimationFrame(syncBar); } }
  if (typeof MutationObserver === 'function') {
    new MutationObserver(queueBar).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }
  root.addEventListener('resize', queueBar);
  queueBar();

  root.UI = { toast: toast, confirm: confirm, pinInput: pinInput, pinSync: pinSync };
})(window);
