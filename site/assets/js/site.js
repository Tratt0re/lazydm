/*
 * LazyDM website behaviour: theme switch, sample tabs, the sample encounter tracker, the sample map and the code map.
 * No dependencies. The tracker, map and code map are small ports of the app's own (encounter page, map page, code-map.ts),
 * running on made-up data. Nothing is saved or sent anywhere.
 */
(function () {
  'use strict';

  var html = document.documentElement;
  var NS = 'http://www.w3.org/2000/svg';
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- tiny DOM helpers ---------- */

  function append(el, children) {
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) append(el, c);
      else if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(String(c)));
      else el.appendChild(c);
    }
  }

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    append(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }

  function icon(name, cls) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'i' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS(NS, 'use');
    u.setAttribute('href', '#i-' + name);
    s.appendChild(u);
    return s;
  }

  function dot() {
    return h('span', { class: 'dot', 'aria-hidden': 'true', text: '.' });
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

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

  /* ---------- modal (the app's dialog: 2px frame, engraved divider under the title) ---------- */

  function openDialog(o) {
    var opener = document.activeElement;
    var d = h('dialog', { class: 'sheet', 'aria-labelledby': 'dlg-title' });
    var form = h('form', { novalidate: true });
    var err = h('p', { class: 'dlg-err', role: 'alert' });
    var inputs = {};

    function fieldEl(f, first) {
      var control;
      if (f.type === 'select') {
        control = h('select', { id: 'dlg-' + f.id, autofocus: first });
        f.options.forEach(function (op) {
          control.appendChild(h('option', { value: op[0], text: op[1] }));
        });
        control.value = f.value;
      } else {
        control = h('input', {
          id: 'dlg-' + f.id,
          type: f.type || 'text',
          value: f.value === null || f.value === undefined ? '' : f.value,
          placeholder: f.placeholder,
          min: f.min,
          max: f.max,
          inputmode: f.type === 'number' ? 'numeric' : null,
          autocomplete: 'off',
          autofocus: first
        });
      }
      inputs[f.id] = control;
      return h('label', { for: 'dlg-' + f.id }, f.label, control, f.hint ? h('span', { class: 'dlg-hint', text: f.hint }) : null);
    }

    var fields = h('div', { class: 'dlg-fields' });
    var firstDone = false;
    (o.fields || []).forEach(function (row) {
      if (Array.isArray(row)) {
        var grid = h('div', { class: 'dlg-grid' });
        row.forEach(function (f) {
          grid.appendChild(fieldEl(f, !firstDone));
          firstDone = true;
        });
        fields.appendChild(grid);
      } else {
        fields.appendChild(fieldEl(row, !firstDone));
        firstDone = true;
      }
    });

    function values() {
      var v = {};
      Object.keys(inputs).forEach(function (k) {
        v[k] = inputs[k].value;
      });
      return v;
    }

    var submit = h('button', { type: 'submit', class: 'btn' + (o.danger ? ' destructive' : ''), text: o.submit });
    var cancel = h('button', { type: 'button', class: 'btn outline', text: 'Cancel', onclick: function () { d.close(); } });

    append(form, [
      h('h2', { class: 'dlg-title', id: 'dlg-title' }, o.title, dot()),
      h('div', { class: 'arc-engraved-divider dlg-div', 'aria-hidden': 'true' }, h('span')),
      o.text ? h('p', { class: 'dlg-text', text: o.text }) : null,
      fields,
      err,
      h('div', { class: 'dlg-act' }, cancel, submit)
    ]);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var problem = o.onSubmit ? o.onSubmit(values()) : null;
      if (problem) {
        err.textContent = problem;
        return;
      }
      d.close();
    });
    form.addEventListener('input', function () {
      err.textContent = '';
      if (o.onChange) o.onChange(values(), submit);
    });

    d.appendChild(form);
    d.addEventListener('close', function () {
      d.remove();
      if (opener && document.contains(opener) && opener.focus) opener.focus();
      else if (o.fallbackFocus) o.fallbackFocus();
    });
    document.body.appendChild(d);
    d.showModal();
  }

  /* ---------- sample encounter tracker (the app's encounter page, Default tracker layout) ---------- */

  (function tracker() {
    var root = document.getElementById('tracker');
    if (!root) return;

    var live = document.getElementById('tracker-live');
    var resetBtn = document.getElementById('tk-reset');
    var PARTY = [
      { name: 'Brenna', mod: 3, max: 31, ac: 16 },
      { name: 'Tobin Reed', mod: 1, max: 24, ac: 14 },
      { name: 'Wren', mod: 4, max: 19, ac: 13 }
    ];
    var STATUS_HINT =
      'Type a name and press Enter. Add a number for rounds: “stunned 3” wears off after 3 of its turns. Without a number it stays until you remove it.';

    var seq = 0;
    var S;
    var rows = {};
    var dragId = null;
    var drop = null;

    function say(msg) {
      live.textContent = '';
      window.setTimeout(function () {
        live.textContent = msg;
      }, 30);
    }

    function ent(name, o) {
      seq += 1;
      return {
        id: 'c' + seq,
        name: name,
        ini: o.ini === undefined ? null : o.ini,
        hp: o.max === undefined ? null : o.max,
        max: o.max === undefined ? null : o.max,
        temp: 0,
        ac: o.ac === undefined ? null : o.ac,
        mod: o.mod || 0,
        st: (o.st || []).map(function (s) {
          return { name: s.name, rounds: s.rounds };
        })
      };
    }

    function fresh() {
      seq = 0;
      var list = [
        ent('Brenna', { ini: 19, max: 31, ac: 16, mod: 3 }),
        ent('Goblin 1', { ini: 15, max: 7, ac: 15, mod: 2, st: [{ name: 'hidden', rounds: 2 }] }),
        ent('Goblin 2', { ini: 12, max: 7, ac: 15, mod: 2 }),
        ent('Ogre', { ini: 8, max: 59, ac: 11, mod: -1, st: [{ name: 'stunned', rounds: 1 }] })
      ];
      return { list: list, dead: [], running: true, round: 1, turn: list[0].id, sel: {} };
    }

    function byId(id) {
      for (var i = 0; i < S.list.length; i++) if (S.list[i].id === id) return S.list[i];
      return null;
    }
    function indexOf(id) {
      for (var i = 0; i < S.list.length; i++) if (S.list[i].id === id) return i;
      return -1;
    }
    function nameOf(e) {
      return e.name || 'Unnamed';
    }

    /* --- header --- */

    function btn(label, ico, variant, onclick, key, disabled) {
      var b = h('button', { type: 'button', class: 'btn' + (variant ? ' ' + variant : ''), 'data-k': key, onclick: onclick, disabled: disabled });
      if (ico) b.appendChild(icon(ico));
      b.appendChild(document.createTextNode(label));
      return b;
    }
    function ibtn(label, ico, onclick, key, disabled) {
      var b = h('button', {
        type: 'button',
        class: 'btn outline icon s36',
        'aria-label': label,
        title: label,
        'data-k': key,
        onclick: onclick,
        disabled: disabled
      });
      b.appendChild(icon(ico));
      return b;
    }

    var headEl = h('header', { class: 'tk-head', 'aria-label': 'Encounter actions' });
    var hintEl = h(
      'p',
      { class: 'tk-hint' },
      icon('info'),
      h('span', null, h('strong', { text: 'Status: ' }), STATUS_HINT)
    );
    var listEl = h('ul', { class: 'tk-list' });
    var emptyEl = h('div', { class: 'tk-empty' });
    var cemEl = h('div', { class: 'tk-cem', hidden: true });
    root.append(headEl, hintEl, listEl, emptyEl, cemEl);

    function renderHead() {
      var running = S.running;
      var turnEnt = running ? byId(S.turn) : null;
      var selCount = Object.keys(S.sel).length;

      var ctl = h('div', { class: 'tk-ctl' });
      if (running) {
        ctl.append(
          btn('Stop battle', 'square', 'outline', askStop, 'toggle'),
          btn('Next turn', 'chevrons-right', '', nextTurn, 'next', S.list.length === 0)
        );
      } else {
        ctl.append(btn('Start battle', 'play', '', startBattle, 'toggle', S.list.length === 0));
      }

      var sub = h('span', { class: 'tk-sub' });
      if (running && turnEnt) sub.append('Turn of ', h('strong', { text: nameOf(turnEnt) }));
      else sub.append(S.list.length + ' in the order');
      var state = h(
        'div',
        { class: 'tk-state' },
        running
          ? h('span', { class: 'tk-round' }, h('span', { class: 'n', text: pad(S.round) }), ' / Round')
          : h('span', { class: 'tk-round idle' }, 'Ready', dot()),
        sub
      );

      var tools = h('div', { class: 'tk-tools' });
      if (!running) {
        var roll = btn('Roll initiative', 'dices', 'outline', rollSelected, 'roll', selCount === 0);
        roll.title = 'Rolls for the selected combatants. One that can’t roll (a missing value) loses its initiative.';
        if (selCount > 0) roll.appendChild(h('span', { class: 'mono-n', text: '(' + selCount + ')' }));
        var all = selCount === S.list.length && S.list.length > 0;
        tools.append(
          roll,
          btn(all ? 'Clear' : 'Select all', null, 'ghost sm', function () {
            S.sel = {};
            if (!all) S.list.forEach(function (e) { S.sel[e.id] = true; });
            render();
          }, 'sel', S.list.length === 0)
        );
      }
      tools.append(ibtn('Add party', 'users', addParty, 'party'), ibtn('Add combatant', 'plus', function () { openForm(null); }, 'add'));

      headEl.replaceChildren(ctl, state, tools);
    }

    /* --- rows --- */

    function hpView(e, parts) {
      var has = e.max !== null && e.hp !== null;
      parts.hbWrap.hidden = !has;
      parts.heart.hidden = !has;
      if (!has) return;
      var scale = Math.max(e.max, e.hp + e.temp);
      var cur = Math.max(0, e.hp);
      var ratio = cur / (e.max || 1);
      parts.top.replaceChildren(
        h('span', { class: 'hb-l', text: 'HP' }),
        h(
          'strong',
          null,
          e.temp > 0 ? h('span', { class: 't', text: '+' + e.temp }) : null,
          cur + ' / ' + e.max
        )
      );
      parts.cur.className = ratio > 0.5 ? 'ok' : ratio > 0.25 ? 'warn' : 'bad';
      parts.cur.style.width = (scale > 0 ? (cur / scale) * 100 : 0) + '%';
      parts.tmp.style.width = (scale > 0 ? (Math.max(e.temp, 0) / scale) * 100 : 0) + '%';
      parts.meter.setAttribute('aria-valuemax', String(scale));
      parts.meter.setAttribute('aria-valuenow', String(cur));
      parts.meter.setAttribute('aria-valuetext', cur + ' / ' + e.max + (e.temp > 0 ? ' +' + e.temp : ''));
    }

    function makeRow(e) {
      var id = e.id;
      var li = h('li', { class: 'tk-row', 'data-id': id });

      var grip = h('button', { type: 'button', class: 'tk-grip', title: 'Drag to reorder' }, icon('grip-vertical'));
      var check = h('input', { type: 'checkbox', class: 'tk-check' });
      check.addEventListener('change', function () {
        if (check.checked) S.sel[id] = true;
        else delete S.sel[id];
        renderHead();
      });
      grip.addEventListener('pointerdown', function () { li.draggable = true; });
      grip.addEventListener('keydown', function (ev) {
        var i = indexOf(id);
        var to = ev.key === 'ArrowUp' ? i - 1 : ev.key === 'ArrowDown' ? i + 1 : -1;
        if (to < 0 || to >= S.list.length) return;
        ev.preventDefault();
        var item = S.list.splice(i, 1)[0];
        S.list.splice(to, 0, item);
        render();
        grip.focus();
        say(nameOf(item) + ' moved to position ' + (to + 1) + '.');
      });
      li.addEventListener('dragstart', function (ev) {
        dragId = id;
        li.classList.add('is-drag');
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', id);
      });
      li.addEventListener('dragend', function () {
        li.draggable = false;
        li.classList.remove('is-drag');
        clearDrop();
        dragId = null;
      });

      var ini = h('span', { class: 'tk-ini', title: 'Initiative' });
      var name = h('span', { class: 'tk-name' });
      var turnBadge = h('span', { class: 'bdg', text: 'Turn' });

      var hbTop = h('div', { class: 'hb-top' });
      var curBar = h('i');
      var tmpBar = h('i', { class: 'tmp' });
      var meter = h('div', { class: 'hb-m', role: 'meter', 'aria-label': 'HP', 'aria-valuemin': '0' }, curBar, tmpBar);
      var hbWrap = h('div', { class: 'hb' }, hbTop, meter);
      var heart = h('button', { type: 'button', class: 'btn outline s32', title: 'Manage HP', onclick: function () { openHp(byId(id)); } }, icon('heart'));
      heart.setAttribute('aria-label', 'Manage HP');
      var hpParts = { hbWrap: hbWrap, heart: heart, top: hbTop, cur: curBar, tmp: tmpBar, meter: meter };

      var acTile = h('span', { class: 'tk-tile' }, h('span', { class: 'v' }), h('span', { class: 'l', text: 'AC' }));

      var stInput = h('input', {
        type: 'text',
        id: 'st-' + id,
        placeholder: 'Add a status…',
        autocomplete: 'off',
        'aria-label': 'Status'
      });
      var stBox = h('div', { class: 'tk-st' }, stInput);
      function commitStatus() {
        var e2 = byId(id);
        var v = stInput.value.trim();
        if (!e2 || !v) return;
        var m = /^(.*?)\s+(\d+)$/.exec(v);
        var s = m ? { name: m[1], rounds: parseInt(m[2], 10) } : { name: v };
        e2.st.push(s);
        stInput.value = '';
        row.update();
        say('Status ' + s.name + ' added to ' + nameOf(e2) + '.');
      }
      stInput.addEventListener('keydown', function (ev) {
        var v = stInput.value;
        if (ev.key === 'Enter') {
          ev.preventDefault();
          commitStatus();
        } else if (ev.key === ' ' && (/^\S+\s+\d+$/.test(v) || /^\S+ $/.test(v))) {
          ev.preventDefault();
          stInput.value = v.trim();
          commitStatus();
        } else if (ev.key === 'Backspace' && v === '') {
          var e2 = byId(id);
          if (e2 && e2.st.length) {
            e2.st.pop();
            row.update();
          }
        }
      });
      stInput.addEventListener('blur', commitStatus);

      var menuBtn = h('button', {
        type: 'button',
        class: 'btn ghost s28',
        'aria-label': 'More actions',
        'aria-haspopup': 'menu',
        'aria-expanded': 'false'
      }, icon('ellipsis'));
      function mi(label, ico, fn, danger) {
        var b = h('button', { type: 'button', class: 'mi' + (danger ? ' danger' : ''), role: 'menuitem', tabindex: '-1' }, icon(ico), label);
        b.addEventListener('click', function () {
          closeMenus();
          fn(byId(id));
        });
        return b;
      }
      var menu = h(
        'div',
        { class: 'tk-menu', role: 'menu', hidden: true },
        mi('Edit', 'pencil', function (x) { openForm(x); }),
        mi('Duplicate', 'copy-plus', duplicate),
        mi('Send to the cemetery', 'skull', bury),
        h('div', { class: 'mi-sep', role: 'separator' }),
        mi('Delete forever', 'trash', askDelete, true)
      );
      menuBtn.addEventListener('click', function () {
        var wasOpen = !menu.hidden;
        closeMenus();
        if (!wasOpen) {
          menu.hidden = false;
          menuBtn.setAttribute('aria-expanded', 'true');
          menu.querySelector('.mi').focus();
        }
      });
      menu.addEventListener('keydown', function (ev) {
        var items = Array.prototype.slice.call(menu.querySelectorAll('.mi'));
        var i = items.indexOf(document.activeElement);
        if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length].focus(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); closeMenus(); menuBtn.focus(); }
        else if (ev.key === 'Tab') closeMenus();
      });
      menu._btn = menuBtn;

      var row = li;
      append(li, [
        h('div', { class: 'tk-rail' }, grip, check),
        h(
          'div',
          { class: 'tk-main' },
          h(
            'div',
            { class: 'tk-cells' },
            h('div', { class: 'tk-cell c-ini' }, ini),
            h('div', { class: 'tk-cell c-name grow' }, name, turnBadge),
            h('div', { class: 'tk-cell c-hp grow' }, hbWrap, heart),
            h('div', { class: 'tk-cell c-ac' }, acTile),
            h('div', { class: 'tk-cell c-st grow' }, stBox)
          )
        ),
        h('div', { class: 'tk-act' }, menuBtn, menu)
      ]);

      li.update = function () {
        var x = byId(id);
        if (!x) return;
        var isTurn = S.running && S.turn === id;
        li.classList.toggle('is-turn', isTurn);
        if (isTurn) li.setAttribute('aria-current', 'step');
        else li.removeAttribute('aria-current');
        grip.setAttribute('aria-label', 'Drag to reorder ' + nameOf(x) + '. Or focus here and press the up or down arrow.');
        check.hidden = S.running;
        check.checked = !!S.sel[id];
        check.setAttribute('aria-label', 'Select ' + nameOf(x) + ' for the roll');
        ini.textContent = x.ini === null ? '–' : String(x.ini);
        ini.classList.toggle('none', x.ini === null);
        name.textContent = nameOf(x);
        name.classList.toggle('none', !x.name);
        turnBadge.hidden = !isTurn;
        hpView(x, hpParts);
        acTile.hidden = x.ac === null;
        acTile.querySelector('.v').textContent = x.ac === null ? '' : String(x.ac);
        // statuses: tags before the input
        Array.prototype.slice.call(stBox.querySelectorAll('.bdg')).forEach(function (t) { t.remove(); });
        x.st.forEach(function (s, i) {
          var rm = h('button', { type: 'button', class: 'st-x', 'aria-label': 'Remove ' + s.name }, icon('x'));
          rm.addEventListener('click', function () {
            x.st.splice(i, 1);
            li.update();
          });
          stBox.insertBefore(
            h('span', { class: 'bdg st' }, s.name + (s.rounds !== undefined ? ' · ' + s.rounds : ''), rm),
            stInput
          );
        });
        heart.disabled = false;
      };
      return li;
    }

    function renderList() {
      var present = {};
      S.list.forEach(function (e) { present[e.id] = true; });
      Object.keys(rows).forEach(function (id) {
        if (!present[id]) {
          rows[id].remove();
          delete rows[id];
        }
      });
      S.list.forEach(function (e, i) {
        var li = rows[e.id] || (rows[e.id] = makeRow(e));
        li.update();
        if (listEl.children[i] !== li) listEl.insertBefore(li, listEl.children[i] || null);
      });
      listEl.hidden = S.list.length === 0;
      hintEl.hidden = S.list.length === 0;
      emptyEl.hidden = S.list.length !== 0;
      if (S.list.length === 0) {
        emptyEl.replaceChildren(
          icon('swords', 'big'),
          h('h3', { text: 'No one in this encounter yet' }),
          h('p', { text: 'Combatants you add appear here in initiative order.' }),
          h('div', { class: 'tk-empty-act' },
            btn('Add combatant', 'plus', '', function () { openForm(null); }, 'e-add'),
            btn('Add party', 'users', 'outline', addParty, 'e-party'))
        );
      }
    }

    function renderCem() {
      cemEl.hidden = S.dead.length === 0;
      if (!S.dead.length) return;
      cemEl.replaceChildren(
        h('span', { class: 'tk-cem-l', text: 'Cemetery' }),
        S.dead.map(function (e) {
          return h(
            'span',
            { class: 'cem-i' },
            nameOf(e),
            btn('Recover', 'rotate-ccw', 'ghost xs', function () { recover(e); }, 'rec:' + e.id),
            btn('Delete forever', 'trash', 'ghost xs', function () { askDelete(e); }, 'del:' + e.id)
          );
        })
      );
    }

    function render() {
      var a = document.activeElement;
      var key = a && root.contains(a) ? a.getAttribute('data-k') : null;
      renderHead();
      renderList();
      renderCem();
      if (key) {
        var again = root.querySelector('[data-k="' + key.replace(/"/g, '') + '"]');
        if (again && !again.disabled) again.focus();
      }
    }

    function closeMenus() {
      Array.prototype.forEach.call(root.querySelectorAll('.tk-menu'), function (m) {
        if (!m.hidden) {
          m.hidden = true;
          if (m._btn) m._btn.setAttribute('aria-expanded', 'false');
        }
      });
    }
    document.addEventListener('click', function (ev) {
      if (!ev.target.closest || !ev.target.closest('.tk-act')) closeMenus();
    });

    /* --- actions --- */

    function sortByInitiative() {
      S.list.sort(function (a, b) {
        if ((a.ini === null) !== (b.ini === null)) return a.ini === null ? 1 : -1;
        return (b.ini || 0) - (a.ini || 0);
      });
    }

    function startBattle() {
      sortByInitiative();
      S.running = true;
      S.round = 1;
      S.turn = S.list[0].id;
      S.sel = {};
      render();
      say('Battle started. Round 1. ' + nameOf(S.list[0]) + ' has the turn.');
    }

    function askStop() {
      openDialog({
        title: 'Stop the battle?',
        text: 'Initiatives and statuses are cleared and hit points go back to their maximum where there is one. Names and other values stay.',
        submit: 'Stop battle',
        fallbackFocus: function () { var b = root.querySelector('[data-k="toggle"]'); if (b) b.focus(); },
        onSubmit: function () {
          S.running = false;
          S.turn = null;
          S.round = 1;
          S.list.concat(S.dead).forEach(function (e) {
            e.ini = null;
            e.st = [];
            e.temp = 0;
            if (e.max !== null) e.hp = e.max;
          });
          render();
          say('Battle stopped.');
        }
      });
    }

    function nextTurn() {
      var cur = byId(S.turn);
      var gone = [];
      if (cur) {
        cur.st = cur.st.filter(function (s) {
          if (s.rounds === undefined) return true;
          s.rounds -= 1;
          if (s.rounds <= 0) { gone.push(s.name); return false; }
          return true;
        });
      }
      var i = indexOf(S.turn) + 1;
      if (i >= S.list.length) {
        i = 0;
        S.round += 1;
      }
      S.turn = S.list[i].id;
      render();
      say(
        (gone.length ? gone.join(', ') + ' wore off. ' : '') +
          'Round ' + S.round + '. ' + nameOf(S.list[i]) + ' has the turn.'
      );
    }

    function rollSelected() {
      var n = 0;
      S.list.forEach(function (e) {
        if (!S.sel[e.id]) return;
        e.ini = 1 + Math.floor(Math.random() * 20) + e.mod;
        n += 1;
      });
      if (!n) return;
      sortByInitiative();
      render();
      say('Rolled for ' + n + '.');
    }

    function insertByInitiative(e) {
      if (e.ini === null) { S.list.push(e); return; }
      var at = S.list.length;
      for (var i = 0; i < S.list.length; i++) {
        if (S.list[i].ini === null || S.list[i].ini < e.ini) { at = i; break; }
      }
      S.list.splice(at, 0, e);
    }

    function addParty() {
      var have = {};
      S.list.concat(S.dead).forEach(function (e) { have[e.name] = true; });
      var added = 0;
      PARTY.forEach(function (p) {
        if (have[p.name]) return;
        var e = ent(p.name, { max: p.max, ac: p.ac, mod: p.mod });
        if (S.running) S.list.push(e);
        else insertByInitiative(e);
        added += 1;
      });
      render();
      say(added ? 'Added ' + added + ' from the party.' : 'The whole party is already here.');
    }

    function num(v) {
      if (v === '' || v === null || v === undefined) return null;
      var n = Number(v);
      return isFinite(n) ? Math.round(n) : null;
    }

    function openForm(e) {
      var editing = !!e;
      var fields = [
        { id: 'name', label: 'Name', value: editing ? e.name : '', placeholder: 'Goblin 1' },
        [
          { id: 'ini', label: 'Initiative', type: 'number', value: editing ? e.ini : '' },
          { id: 'max', label: 'Max HP', type: 'number', min: 1, value: editing ? e.max : '' },
          { id: 'ac', label: 'AC', type: 'number', min: 0, value: editing ? e.ac : '' }
        ]
      ];
      if (!editing) {
        fields.push({
          id: 'qty', label: 'Quantity', type: 'number', min: 1, max: 15, value: 1,
          hint: 'How many to insert: 1 to 15. Above 1 they are numbered.'
        });
      }
      openDialog({
        title: editing ? 'Edit' : 'Add combatant',
        submit: editing ? 'Save' : 'Add combatant',
        fields: fields,
        fallbackFocus: function () { var b = root.querySelector('[data-k="add"]'); if (b) b.focus(); },
        onChange: editing ? null : function (v, submit) {
          var q = num(v.qty);
          submit.textContent = q && q > 1 && q <= 15 ? 'Insert ' + q : 'Add combatant';
        },
        onSubmit: function (v) {
          if (editing) {
            e.name = v.name.trim();
            e.ini = num(v.ini);
            var max = num(v.max);
            e.max = max;
            if (max === null) e.hp = null;
            else e.hp = e.hp === null ? max : Math.min(e.hp, max);
            e.ac = num(v.ac);
            render();
            say('Saved ' + nameOf(e) + '.');
            return null;
          }
          var q = num(v.qty === '' ? 1 : v.qty);
          if (q === null || q < 1 || q > 15) return 'Enter a quantity from 1 to 15.';
          var base = v.name.trim();
          for (var i = 1; i <= q; i++) {
            var made = ent(q > 1 ? (base || 'Unnamed') + ' ' + i : base, { ini: num(v.ini) === null ? undefined : num(v.ini), max: num(v.max) === null ? undefined : num(v.max), ac: num(v.ac) === null ? undefined : num(v.ac) });
            if (S.running) insertByInitiative(made);
            else S.list.push(made);
          }
          render();
          say(q + (q > 1 ? ' combatants' : ' combatant') + ' added.');
          return null;
        }
      });
    }

    function openHp(e) {
      openDialog({
        title: 'Manage HP · ' + nameOf(e),
        submit: 'Apply',
        fields: [
          {
            id: 'mode', label: 'Change', type: 'select', value: 'damage',
            options: [['damage', 'Damage'], ['heal', 'Heal'], ['temp', 'Set temporary HP']]
          },
          { id: 'amt', label: 'Amount', type: 'number', min: 0, value: '' }
        ],
        onSubmit: function (v) {
          var n = num(v.amt);
          if (n === null || n < 0) return 'Enter an amount of 0 or more.';
          if (v.mode === 'damage') {
            var left = n;
            var soak = Math.min(e.temp, left);
            e.temp -= soak;
            left -= soak;
            e.hp = Math.max(0, e.hp - left);
          } else if (v.mode === 'heal') e.hp = Math.min(e.max, e.hp + n);
          else e.temp = n;
          render();
          say(nameOf(e) + ': ' + e.hp + ' of ' + e.max + ' hit points' + (e.temp ? ', ' + e.temp + ' temporary' : '') + '.');
          return null;
        }
      });
    }

    function duplicate(e) {
      var base = nameOf(e).replace(/\s+\d+$/, '');
      var top = 1;
      S.list.concat(S.dead).forEach(function (x) {
        if (x.name === base) top = Math.max(top, 1);
        var m = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' (\\d+)$').exec(x.name);
        if (m) top = Math.max(top, parseInt(m[1], 10));
      });
      var copy = ent(base + ' ' + (top + 1), { ini: e.ini === null ? undefined : e.ini, max: e.max === null ? undefined : e.max, ac: e.ac === null ? undefined : e.ac, mod: e.mod });
      S.list.splice(indexOf(e.id) + 1, 0, copy);
      render();
      say(nameOf(copy) + ' added.');
    }

    function bury(e) {
      var i = indexOf(e.id);
      var hadTurn = S.running && S.turn === e.id;
      S.list.splice(i, 1);
      S.dead.push(e);
      delete S.sel[e.id];
      if (hadTurn) {
        if (!S.list.length) {
          S.running = false;
          S.turn = null;
        } else {
          if (i >= S.list.length) { i = 0; S.round += 1; }
          S.turn = S.list[i].id;
        }
      }
      render();
      say(nameOf(e) + ' sent to the cemetery.');
    }

    function recover(e) {
      S.dead.splice(S.dead.indexOf(e), 1);
      insertByInitiative(e);
      render();
      say(nameOf(e) + ' recovered.');
    }

    function askDelete(e) {
      openDialog({
        title: 'Delete forever?',
        text: nameOf(e) + ' is removed from the encounter for good. This cannot be undone.',
        submit: 'Delete forever',
        danger: true,
        fallbackFocus: function () { var b = root.querySelector('[data-k="add"]'); if (b) b.focus(); },
        onSubmit: function () {
          var i = indexOf(e.id);
          var hadTurn = S.running && S.turn === e.id;
          if (i >= 0) {
            S.list.splice(i, 1);
            if (hadTurn) {
              if (!S.list.length) { S.running = false; S.turn = null; }
              else { if (i >= S.list.length) { i = 0; S.round += 1; } S.turn = S.list[i].id; }
            }
          } else {
            var d = S.dead.indexOf(e);
            if (d >= 0) S.dead.splice(d, 1);
          }
          delete S.sel[e.id];
          render();
          say(nameOf(e) + ' deleted.');
          return null;
        }
      });
    }

    /* --- drag to reorder --- */

    function clearDrop() {
      drop = null;
      Array.prototype.forEach.call(listEl.querySelectorAll('.drop-above, .drop-below'), function (x) {
        x.classList.remove('drop-above', 'drop-below');
      });
    }
    listEl.addEventListener('dragover', function (ev) {
      if (!dragId) return;
      ev.preventDefault();
      var li = ev.target.closest('.tk-row');
      clearDrop();
      if (!li || li.getAttribute('data-id') === dragId) return;
      var r = li.getBoundingClientRect();
      var above = ev.clientY < r.top + r.height / 2;
      li.classList.add(above ? 'drop-above' : 'drop-below');
      drop = { id: li.getAttribute('data-id'), above: above };
    });
    listEl.addEventListener('drop', function (ev) {
      ev.preventDefault();
      if (!dragId || !drop) return;
      var from = indexOf(dragId);
      var item = S.list.splice(from, 1)[0];
      var to = indexOf(drop.id) + (drop.above ? 0 : 1);
      S.list.splice(to, 0, item);
      clearDrop();
      dragId = null;
      render();
      say(nameOf(item) + ' moved.');
    });

    function reset() {
      Object.keys(rows).forEach(function (id) { rows[id].remove(); });
      rows = {};
      S = fresh();
      render();
      say('Sample reset.');
    }
    if (resetBtn) resetBtn.addEventListener('click', reset);

    S = fresh();
    render();
  })();

  /* ---------- sample map (the app's map page: pins, a path, a note; pan, zoom, tools, side panel) ---------- */

  (function sampleMap() {
    var view = document.getElementById('mp-view');
    if (!view) return;

    var layer = document.getElementById('mp-layer');
    var vec = document.getElementById('mp-vec');
    var listEl = document.getElementById('mp-list');
    var detailEl = document.getElementById('mp-detail');
    var hintEl = document.getElementById('mp-hint');
    var resetBtn = document.getElementById('mp-reset');
    var W = 2000;
    var H = 1757;
    var MAX = 2;
    var COLORS = { red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', teal: 'Teal', blue: 'Blue', purple: 'Purple', pink: 'Pink', gray: 'Gray' };
    var CYCLE = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

    function ellipse(cx, cy, rx, ry, n) {
      var pts = [];
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2;
        pts.push({ x: +(cx + rx * Math.cos(a)).toFixed(4), y: +(cy + ry * Math.sin(a)).toFixed(4) });
      }
      return pts;
    }

    function seed() {
      return [
        { id: 'area', kind: 'path', label: 'Flooded cavern', color: 'blue', closed: true, pts: ellipse(0.792, 0.763, 0.118, 0.122, 12) },
        { id: 'route', kind: 'path', label: 'The party’s route', color: 'teal', closed: false, pts: [{ x: 0.435, y: 0.108 }, { x: 0.435, y: 0.29 }, { x: 0.7, y: 0.29 }, { x: 0.77, y: 0.29 }] },
        { id: 'entrance', kind: 'pin', x: 0.435, y: 0.108, label: 'Entrance', color: 'green', icon: 'door-open', link: null },
        { id: 'guard', kind: 'pin', x: 0.268, y: 0.225, label: 'Guard post', color: 'red', icon: 'swords', link: 'guard-post.md' },
        { id: 'hall', kind: 'pin', x: 0.79, y: 0.29, label: 'Great hall', color: 'purple', icon: 'crown', link: 'great-hall.md' },
        { id: 'crypt', kind: 'pin', x: 0.17, y: 0.52, label: 'Crypt', color: 'gray', icon: 'skull', link: 'crypt.md' },
        { id: 'vault', kind: 'pin', x: 0.555, y: 0.49, label: 'Vault', color: 'yellow', icon: 'key', link: null },
        { id: 'cavern', kind: 'pin', x: 0.8, y: 0.71, label: 'Flooded cavern', color: 'blue', icon: 'droplets', link: null },
        { id: 'slick', kind: 'note', x: 0.585, y: 0.6, text: 'Slick floor. DC 12 Athletics or fall prone.', color: 'orange' }
      ];
    }

    var items = seed();
    var sel = null;
    var tool = 'interact';
    var added = 0;
    var els = {};
    var rowEls = {};
    var vw = 0, vh = 0, fit = 1, s = 1, tx = 0, ty = 0, moved = false;
    var hintTimer = 0;

    function find(id) {
      for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
      return null;
    }
    function labelOf(it) {
      return it.kind === 'note' ? it.text : it.label;
    }
    function kindName(it) {
      return it.kind === 'pin' ? 'Pin' : it.kind === 'path' ? 'Path' : 'Note';
    }
    function kindIcon(it) {
      return it.kind === 'pin' ? it.icon : it.kind === 'path' ? 'route' : 'sticky-note';
    }

    /* --- viewport --- */

    function measure() {
      var r = view.getBoundingClientRect();
      vw = r.width;
      vh = r.height;
      fit = Math.min(vw / W, vh / H) || 1;
    }
    function clamp() {
      var iw = W * s, ih = H * s;
      tx = iw <= vw ? (vw - iw) / 2 : Math.min(0, Math.max(vw - iw, tx));
      ty = ih <= vh ? (vh - ih) / 2 : Math.min(0, Math.max(vh - ih, ty));
    }
    function apply(animate) {
      clamp();
      layer.classList.toggle('anim', !!animate && !reduceMotion);
      layer.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
      layer.style.setProperty('--inv', String(1 / s));
      view.classList.toggle('is-zoomed', s > fit * 1.02);
    }
    function zoomAt(f, cx, cy, animate) {
      var ns = Math.min(MAX, Math.max(fit, s * f));
      tx = cx - (cx - tx) * (ns / s);
      ty = cy - (cy - ty) * (ns / s);
      s = ns;
      moved = true;
      apply(animate);
    }
    function fitView(animate) {
      measure();
      s = fit;
      tx = 0;
      ty = 0;
      moved = false;
      apply(animate);
    }
    function focusOn(it) {
      var fx, fy;
      if (it.kind === 'path') {
        var xs = it.pts.map(function (p) { return p.x; }), ys = it.pts.map(function (p) { return p.y; });
        fx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
        fy = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
      } else {
        fx = it.x;
        fy = it.y;
      }
      var ns = Math.min(MAX, Math.max(s, fit * (it.kind === 'path' ? 1.5 : 2.2)));
      s = ns;
      tx = vw / 2 - fx * W * ns;
      ty = vh / 2 - fy * H * ns;
      moved = true;
      apply(true);
    }

    function showHint(text, ms) {
      window.clearTimeout(hintTimer);
      hintEl.textContent = text;
      hintEl.hidden = false;
      hintTimer = window.setTimeout(function () { hintEl.hidden = true; }, ms || 4500);
    }

    /* --- items --- */

    function mountVectors() {
      vec.replaceChildren();
      items.forEach(function (it) {
        if (it.kind !== 'path') return;
        var pts = it.pts.map(function (p) { return p.x * W + ',' + p.y * H; }).join(' ');
        var g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'mc-' + it.color);
        if (sel === it.id) {
          var halo = document.createElementNS(NS, it.closed ? 'polygon' : 'polyline');
          halo.setAttribute('class', 'mp-halo');
          halo.setAttribute('points', pts);
          g.appendChild(halo);
        }
        var shape = document.createElementNS(NS, it.closed ? 'polygon' : 'polyline');
        shape.setAttribute('class', 'mp-path' + (it.closed ? ' mp-poly' : ''));
        shape.setAttribute('points', pts);
        g.appendChild(shape);
        vec.appendChild(g);
      });
    }

    function mountItems() {
      Array.prototype.forEach.call(layer.querySelectorAll('.mp-item'), function (n) { n.remove(); });
      els = {};
      items.forEach(function (it) {
        if (it.kind === 'path') return;
        var wrap = h('div', { class: 'mp-item mc-' + it.color + (it.kind === 'note' ? ' note' : ''), 'data-id': it.id });
        wrap.style.left = it.x * W + 'px';
        wrap.style.top = it.y * H + 'px';
        var b;
        if (it.kind === 'pin') {
          b = h('button', { type: 'button', class: 'mp-pin', 'aria-label': 'Pin: ' + it.label, 'aria-pressed': 'false' },
            h('span', { class: 'mp-dot' }, icon(it.icon)),
            h('span', { class: 'mp-lab', text: it.label }));
        } else {
          b = h('button', { type: 'button', class: 'mp-note', 'aria-label': 'Note: ' + it.text, 'aria-pressed': 'false', text: it.text });
        }
        b.addEventListener('click', function () { select(it.id, false); });
        wrap.appendChild(b);
        layer.appendChild(wrap);
        els[it.id] = wrap;
      });
    }

    function mountList() {
      listEl.replaceChildren();
      rowEls = {};
      items.forEach(function (it) {
        var b = h('button', { type: 'button', class: 'mp-row mc-' + it.color, 'aria-pressed': 'false' },
          h('span', { class: 'mp-ico' }, icon(kindIcon(it))),
          h('span', { text: labelOf(it) }));
        b.addEventListener('click', function () { select(it.id, true); });
        rowEls[it.id] = b;
        listEl.appendChild(h('li', null, b));
      });
    }

    function renderDetail() {
      var it = sel ? find(sel) : null;
      detailEl.replaceChildren();
      if (!it) {
        detailEl.append(h('p', { text: 'Nothing selected. Select a pin, path or note to see its details.' }));
        return;
      }
      var rows = [['Kind', kindName(it)], [it.kind === 'note' ? 'Text' : 'Label', labelOf(it)], ['Colour', COLORS[it.color]]];
      if (it.kind === 'pin') rows.push(['Linked file', it.link ? h('code', { text: it.link }) : 'No linked file']);
      if (it.kind === 'path') rows.push(['Shape', it.closed ? 'Closed (an area)' : 'Open, ' + it.pts.length + ' points']);
      var dl = h('dl');
      rows.forEach(function (r) { dl.append(h('dt', { text: r[0] }), h('dd', null, r[1])); });
      detailEl.append(dl);
    }

    function paintSelection() {
      Object.keys(els).forEach(function (id) {
        var on = id === sel;
        els[id].classList.toggle('is-sel', on);
        els[id].querySelector('button').setAttribute('aria-pressed', String(on));
      });
      Object.keys(rowEls).forEach(function (id) { rowEls[id].setAttribute('aria-pressed', String(id === sel)); });
      mountVectors();
      renderDetail();
    }

    function select(id, fly) {
      sel = id;
      paintSelection();
      if (id && fly) focusOn(find(id));
    }

    function mountAll() {
      mountVectors();
      mountItems();
      mountList();
      paintSelection();
    }

    function addAt(fx, fy) {
      if (added >= 20) { showHint('That is enough for a sample. Use Reset to start over.'); return; }
      added += 1;
      var color = CYCLE[(added - 1) % CYCLE.length];
      var it = tool === 'pin'
        ? { id: 'new-' + added, kind: 'pin', x: fx, y: fy, label: 'New pin ' + added, color: color, icon: 'map-pin', link: null }
        : { id: 'new-' + added, kind: 'note', x: fx, y: fy, text: 'New note ' + added, color: color };
      items.push(it);
      sel = it.id;
      mountAll();
      var b = els[it.id].querySelector('button');
      if (b) b.focus({ preventScroll: true });
    }

    /* --- tools and zoom buttons --- */

    var TOOL_HINT = {
      interact: 'Drag to pan. Hold Ctrl or ⌘ and scroll to zoom.',
      pin: 'Click on the map to place a pin.',
      note: 'Click on the map to place a note.'
    };
    function setTool(t) {
      tool = t;
      Array.prototype.forEach.call(document.querySelectorAll('[data-tool]'), function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-tool') === t));
      });
      view.classList.toggle('tool-pin', t === 'pin');
      view.classList.toggle('tool-note', t === 'note');
      showHint(TOOL_HINT[t]);
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-tool]'), function (b) {
      b.addEventListener('click', function () { setTool(b.getAttribute('data-tool')); });
    });
    document.getElementById('mp-zin').addEventListener('click', function () { zoomAt(1.5, vw / 2, vh / 2, true); });
    document.getElementById('mp-zout').addEventListener('click', function () { zoomAt(1 / 1.5, vw / 2, vh / 2, true); });
    document.getElementById('mp-fit').addEventListener('click', function () { fitView(true); });
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        items = seed();
        sel = null;
        added = 0;
        setTool('interact');
        mountAll();
        fitView(true);
      });
    }

    /* --- pointer: pan, click to place or deselect, ctrl/cmd + wheel to zoom --- */

    var drag = null;
    view.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 || ev.target.closest('.mp-item, .mp-tools, .mp-zoom')) return;
      drag = { x: ev.clientX, y: ev.clientY, tx: tx, ty: ty, moved: false };
      try { view.setPointerCapture(ev.pointerId); } catch (_) {}
    });
    view.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 4) {
        drag.moved = true;
        view.classList.add('is-panning');
      }
      if (drag.moved) {
        tx = drag.tx + dx;
        ty = drag.ty + dy;
        moved = true;
        apply(false);
      }
    });
    function endDrag(ev, cancelled) {
      if (!drag) return;
      var wasClick = !drag.moved && !cancelled;
      drag = null;
      view.classList.remove('is-panning');
      if (!wasClick) return;
      var r = view.getBoundingClientRect();
      var fx = (ev.clientX - r.left - tx) / (s * W);
      var fy = (ev.clientY - r.top - ty) / (s * H);
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
      if (tool === 'interact') select(null, false);
      else addAt(+fx.toFixed(4), +fy.toFixed(4));
    }
    view.addEventListener('pointerup', function (ev) { endDrag(ev, false); });
    view.addEventListener('pointercancel', function (ev) { endDrag(ev, true); });
    view.addEventListener('wheel', function (ev) {
      if (ev.ctrlKey || ev.metaKey) {
        ev.preventDefault();
        var r = view.getBoundingClientRect();
        zoomAt(Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0025)), ev.clientX - r.left, ev.clientY - r.top, false);
      } else if (!hintTimer || hintEl.hidden) {
        showHint('Hold Ctrl or ⌘ and scroll to zoom the map.', 2500);
      }
    }, { passive: false });
    view.addEventListener('keydown', function (ev) {
      if (ev.target !== view) return;
      var step = 60;
      var handled = true;
      if (ev.key === 'ArrowLeft') tx += step;
      else if (ev.key === 'ArrowRight') tx -= step;
      else if (ev.key === 'ArrowUp') ty += step;
      else if (ev.key === 'ArrowDown') ty -= step;
      else if (ev.key === '+' || ev.key === '=') { zoomAt(1.4, vw / 2, vh / 2, true); handled = false; }
      else if (ev.key === '-') { zoomAt(1 / 1.4, vw / 2, vh / 2, true); handled = false; }
      else if (ev.key === '0') { fitView(true); handled = false; }
      else return;
      ev.preventDefault();
      if (handled) { moved = true; apply(false); }
    });

    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        measure();
        if (moved) apply(false);
        else fitView(false);
      }).observe(view);
    }

    mountAll();
    fitView(false);
    window.addEventListener('load', function () { fitView(false); });
  })();

  /* ---------- code map (the app's code-map.ts: the whole note at a small scale, headings as labels) ---------- */

  (function codeMap() {
    var note = document.querySelector('main.note');
    if (!note) return;

    var WIDTH = 116;
    var MAX_SCALE = 0.2;
    var FULL_LINE = 90;
    var LABEL_H = { 1: 14, 2: 13, 3: 12 };
    var COLORS = {
      heading: '--chart-1', text: '--muted-foreground', list: '--chart-3', code: '--chart-4', quote: '--chart-5',
      table: '--chart-6', embed: '--chart-2', frontmatter: '--chart-8', rule: '--border'
    };
    var TINTED = { code: 1, quote: 1, table: 1, embed: 1 };

    var dom = h('div', { class: 'app-codemap', 'aria-hidden': 'true' });
    var canvas = h('canvas');
    var frame = h('div', { class: 'app-codemap-frame' });
    var labels = h('div', { class: 'app-codemap-labels' });
    dom.append(canvas, frame, labels);
    document.body.appendChild(dom);

    var content = null;
    var scale = 0;
    var labelKey = '';
    var queued = false;
    var frameReq = 0;

    function measure() {
      var top = window.scrollY || 0;
      var blocks = [];
      var headings = [];
      var lineHeight = 28;
      var nodes = note.querySelectorAll('.props, h1, h2, p, .actions, .infobox, .arc-engraved-divider, .defs > div, .checks li, .frame');
      Array.prototype.forEach.call(nodes, function (el) {
        if (!el.matches('.frame') && el.closest('.frame')) return;
        if (el.classList.contains('sr-only')) return;
        var r = el.getBoundingClientRect();
        if (r.height === 0) return;
        var t = r.top + top;
        var kind = 'text';
        var chars = (el.textContent || '').trim().length;
        var indent = 0;
        if (el.matches('.props')) kind = 'frontmatter';
        else if (el.matches('h1, h2')) kind = 'heading';
        else if (el.matches('.infobox')) kind = 'quote';
        else if (el.matches('.arc-engraved-divider')) kind = 'rule';
        else if (el.matches('.defs > div, .checks li')) { kind = 'list'; indent = 2; }
        else if (el.matches('.frame')) { kind = 'code'; chars = Math.round(r.height / lineHeight) * 55; }
        else if (el.matches('.actions')) kind = 'embed';
        blocks.push({ top: t, height: r.height, kind: kind, chars: chars, indent: indent });
        if (kind === 'heading') {
          var level = el.matches('h1') ? 1 : 2;
          var text = (el.textContent || '').trim().replace(/\.$/, '');
          headings.push({ level: level, text: text, top: t, el: el });
        }
      });
      return { contentHeight: document.documentElement.scrollHeight, lineHeight: lineHeight, blocks: blocks, headings: headings };
    }

    function paintBlock(ctx, b, color, width) {
      var top = b.top * scale;
      var height = Math.max(1, b.height * scale);
      var usable = width - 12;
      ctx.fillStyle = color;
      if (b.kind === 'rule') {
        ctx.globalAlpha = 0.9;
        ctx.fillRect(6, top + height / 2, usable, 1);
        return;
      }
      if (TINTED[b.kind]) {
        ctx.globalAlpha = 0.14;
        ctx.fillRect(4, top, width - 8, height);
        if (b.kind === 'quote') {
          ctx.globalAlpha = 0.8;
          ctx.fillRect(4, top, 2, height);
        }
        if (b.kind === 'embed') return;
      }
      var x = 6 + (Math.min(b.indent, 16) / FULL_LINE) * usable + (b.kind === 'quote' ? 4 : 0);
      var rows = Math.max(1, Math.round(b.height / Math.max(content.lineHeight, 1)));
      var rowH = height / rows;
      var perRow = Math.max(1, Math.ceil(b.chars / rows));
      ctx.globalAlpha = b.kind === 'text' ? 0.45 : 0.75;
      for (var r = 0; r < rows; r++) {
        var chars = r === rows - 1 ? b.chars - perRow * (rows - 1) : perRow;
        if (chars <= 0) continue;
        var bw = Math.max(2, Math.min(1, chars / FULL_LINE) * (usable - (x - 6)));
        ctx.fillRect(x, top + r * rowH, bw, Math.max(1, rowH * 0.55));
      }
    }

    function placeLabels(headings, height) {
      var placed = [];
      var shown = [];
      [1, 2, 3].forEach(function (level) {
        headings.forEach(function (hd) {
          if (hd.level !== level) return;
          var top = Math.max(0, Math.min(hd.top * scale, height - LABEL_H[level]));
          var bottom = top + LABEL_H[level];
          if (placed.some(function (bx) { return top < bx.bottom && bottom > bx.top; })) return;
          placed.push({ top: top, bottom: bottom });
          shown.push({ level: hd.level, text: hd.text, el: hd.el, y: top });
        });
      });
      var key = shown.map(function (l) { return l.level + ':' + l.y + ':' + l.text; }).join('|');
      if (key === labelKey) return;
      labelKey = key;
      labels.replaceChildren();
      shown.forEach(function (l) {
        var d = h('div', { class: 'app-codemap-label', 'data-level': l.level, title: l.text, text: l.text });
        d.style.top = l.y + 'px';
        d._target = l.el;
        labels.appendChild(d);
      });
    }

    function placeFrame() {
      var top = (window.scrollY || 0) * scale;
      frame.style.top = Math.max(0, top) + 'px';
      frame.style.height = Math.max(8, window.innerHeight * scale) + 'px';
    }

    function paint() {
      queued = false;
      var width = dom.clientWidth;
      var height = dom.clientHeight;
      if (!width || !height) return;
      content = measure();
      scale = Math.min(MAX_SCALE, height / Math.max(content.contentHeight, 1));
      var ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      var ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        var styles = getComputedStyle(html);
        var cache = {};
        content.blocks.forEach(function (b) {
          if (!cache[b.kind]) cache[b.kind] = styles.getPropertyValue(COLORS[b.kind]).trim() || 'gray';
          paintBlock(ctx, b, cache[b.kind], width);
        });
      }
      placeLabels(content.headings, height);
      placeFrame();
    }

    function soon() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(paint);
    }

    function scrollToMapY(clientY) {
      var mapY = clientY - dom.getBoundingClientRect().top;
      window.scrollTo({ top: mapY / scale - window.innerHeight / 2, behavior: 'auto' });
    }

    dom.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 || scale <= 0) return;
      ev.preventDefault();
      var label = ev.target.closest('.app-codemap-label');
      if (label && label._target) {
        label._target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        return;
      }
      scrollToMapY(ev.clientY);
      dom.setPointerCapture(ev.pointerId);
      var move = function (e2) { scrollToMapY(e2.clientY); };
      var up = function () {
        dom.removeEventListener('pointermove', move);
        dom.removeEventListener('pointerup', up);
        dom.removeEventListener('pointercancel', up);
      };
      dom.addEventListener('pointermove', move);
      dom.addEventListener('pointerup', up);
      dom.addEventListener('pointercancel', up);
    });
    dom.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var unit = ev.deltaMode === 1 ? 16 : 1;
      window.scrollBy({ top: ev.deltaY * unit, left: ev.deltaX * unit, behavior: 'auto' });
    }, { passive: false });

    window.addEventListener('scroll', function () {
      window.cancelAnimationFrame(frameReq);
      frameReq = window.requestAnimationFrame(placeFrame);
    }, { passive: true });
    window.addEventListener('resize', soon);
    window.addEventListener('load', soon);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(soon);
    if (window.ResizeObserver) new ResizeObserver(soon).observe(note);
    // Colours come from the theme tokens: repaint when the theme changes.
    new MutationObserver(soon).observe(html, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    note.addEventListener('toggle', soon, true);
    note.addEventListener('click', soon, true);
    soon();
  })();
})();
