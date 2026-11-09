/*
 * LazyDM website behaviour: theme switch, sample tabs, the tracker sample, the code map.
 * No dependencies. Every part degrades to the static page when scripting is off.
 */
(function () {
  'use strict';

  var html = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- theme switch ---------- */

  var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-theme-choice]'));
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function currentChoice() {
    var c = html.getAttribute('data-theme');
    return c === 'light' || c === 'dark' ? c : 'system';
  }

  function paint(choice) {
    var dark = choice === 'dark' || (choice === 'system' && !!(media && media.matches));
    html.classList.toggle('dark', dark);
    html.setAttribute('data-theme', choice);
    buttons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-choice') === choice));
    });
  }

  function choose(choice) {
    if (!reduceMotion) {
      html.classList.add('theme-transition');
      window.setTimeout(function () {
        html.classList.remove('theme-transition');
      }, 320);
    }
    try {
      if (choice === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', choice);
    } catch (_) {}
    paint(choice);
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      choose(b.getAttribute('data-theme-choice'));
    });
  });
  if (media && media.addEventListener) {
    media.addEventListener('change', function () {
      if (currentChoice() === 'system') paint('system');
    });
  }
  paint(currentChoice());

  /* ---------- sample tabs (Source / Reading) ---------- */

  Array.prototype.forEach.call(document.querySelectorAll('[role="tablist"]'), function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));

    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        var pane = document.getElementById(t.getAttribute('aria-controls'));
        if (pane) pane.hidden = !on;
      });
      if (focus) tab.focus();
      mapSoon();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        select(tab, false);
      });
      tab.addEventListener('keydown', function (e) {
        var to = null;
        if (e.key === 'ArrowRight') to = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') to = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') to = tabs[0];
        else if (e.key === 'End') to = tabs[tabs.length - 1];
        if (to) {
          e.preventDefault();
          select(to, true);
        }
      });
    });
  });

  /* ---------- tracker sample ---------- */

  var order = document.getElementById('order');
  if (order) {
    var rows = Array.prototype.slice.call(order.children);
    var roundEl = document.getElementById('round');
    var turnEl = document.getElementById('turn-name');
    var nextBtn = document.getElementById('next-turn');
    var hitBtn = document.getElementById('hit');
    var live = document.getElementById('tracker-live');
    var round = 1;
    var turn = 0;

    var state = rows.map(function (row) {
      return {
        row: row,
        name: row.getAttribute('data-name'),
        max: Number(row.getAttribute('data-max')),
        hp: Number(row.getAttribute('data-hp')),
        bar: row.querySelector('.hp-track i'),
        hpText: row.querySelector('.hp-top b'),
        chip: row.querySelector('.chip.turn')
      };
    });

    function render(announce) {
      state.forEach(function (c, i) {
        var on = i === turn;
        c.row.classList.toggle('is-turn', on);
        c.row.classList.toggle('is-out', c.hp <= 0);
        c.chip.hidden = !on;
        var pct = Math.max(0, Math.round((c.hp / c.max) * 100));
        c.bar.style.width = pct + '%';
        c.bar.classList.toggle('low', pct <= 25);
        c.hpText.textContent = c.hp + ' / ' + c.max;
      });
      roundEl.firstChild.nodeValue = (round < 10 ? '0' : '') + round;
      turnEl.textContent = state[turn].name;
      hitBtn.disabled = state[turn].hp <= 0;
      if (announce) live.textContent = 'Round ' + round + '. ' + state[turn].name + ' has the turn.';
    }

    nextBtn.addEventListener('click', function () {
      var guard = 0;
      do {
        turn += 1;
        if (turn >= state.length) {
          turn = 0;
          round += 1;
        }
        guard += 1;
      } while (state[turn].hp <= 0 && guard <= state.length);
      render(true);
    });

    hitBtn.addEventListener('click', function () {
      var c = state[turn];
      c.hp = Math.max(0, c.hp - 6);
      render(false);
      live.textContent = c.name + ' takes 6 damage: ' + c.hp + ' of ' + c.max + ' hit points left.';
    });

    render(false);
  }

  /* ---------- code map ---------- */

  var map = document.getElementById('codemap');
  var note = document.querySelector('main.note');
  var queued = false;
  var thumb = null;
  var scale = 1;

  function kindOf(el) {
    if (/^H[12]$/.test(el.tagName)) return 't-h';
    if (el.matches('pre, .frame')) return 't-code';
    if (el.matches('.infobox, .props, .defs, .checks')) return 't-box';
    return '';
  }

  function buildMap() {
    queued = false;
    if (!map || !note || map.getClientRects().length === 0) return;
    var total = document.documentElement.scrollHeight;
    var h = map.clientHeight;
    scale = h / total;
    map.textContent = '';
    var top = window.scrollY || 0;
    var blocks = note.querySelectorAll('h1, h2, p, pre, .frame, .infobox, .defs, .checks, .actions');
    Array.prototype.forEach.call(blocks, function (el) {
      var r = el.getBoundingClientRect();
      if (r.height === 0) return;
      var i = document.createElement('i');
      var k = kindOf(el);
      if (k) i.className = k;
      i.style.top = Math.max(0, (r.top + top) * scale) + 'px';
      i.style.height = Math.max(2, r.height * scale - (k === 't-h' ? 0 : 2)) + 'px';
      i.style.width = (k === 't-h' ? 100 : el.tagName === 'P' ? 70 : 90) + '%';
      map.appendChild(i);
    });
    thumb = document.createElement('div');
    thumb.className = 'view';
    map.appendChild(thumb);
    moveThumb();
  }

  function moveThumb() {
    if (!thumb) return;
    thumb.style.top = (window.scrollY || 0) * scale + 'px';
    thumb.style.height = Math.max(12, window.innerHeight * scale) + 'px';
  }

  function mapSoon() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(buildMap);
  }

  if (map) {
    var dragging = false;
    var jump = function (e) {
      var rect = map.getBoundingClientRect();
      var y = (e.clientY - rect.top) / scale - window.innerHeight / 2;
      window.scrollTo({ top: y, behavior: 'auto' });
    };
    map.addEventListener('pointerdown', function (e) {
      dragging = true;
      map.setPointerCapture(e.pointerId);
      jump(e);
    });
    map.addEventListener('pointermove', function (e) {
      if (dragging) jump(e);
    });
    map.addEventListener('pointerup', function () {
      dragging = false;
    });
    window.addEventListener('scroll', moveThumb, { passive: true });
    window.addEventListener('resize', mapSoon);
    window.addEventListener('load', mapSoon);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(mapSoon);
    mapSoon();
  }
})();
