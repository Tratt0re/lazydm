/*
 * LazyDM website behaviour: the theme switch and the code map (a port of the app's code-map.ts).
 * No dependencies. Nothing is saved or sent anywhere.
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


  /* ---------- theme menu: one button showing the current choice, a menu with Light, Dark and System ---------- */

  var wrap = document.querySelector('.theme');
  var btn = document.getElementById('theme-btn');
  var menu = document.getElementById('theme-menu');
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-theme-choice]'));
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var LABEL = { light: 'Light', dark: 'Dark', system: 'System' };
  var ICON = { light: '#i-sun', dark: '#i-moon', system: '#i-monitor' };

  function currentChoice() {
    var c = html.getAttribute('data-theme');
    return c === 'light' || c === 'dark' ? c : 'system';
  }

  function paint(choice) {
    var dark = choice === 'dark' || (choice === 'system' && !!(media && media.matches));
    html.classList.toggle('dark', dark);
    html.setAttribute('data-theme', choice);
    items.forEach(function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-theme-choice') === choice));
    });
    btn.querySelector('use').setAttribute('href', ICON[choice]);
    btn.setAttribute('aria-label', 'Theme: ' + LABEL[choice]);
    btn.setAttribute('title', 'Theme: ' + LABEL[choice]);
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

  function setOpen(open) {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      var current = items.filter(function (b) { return b.getAttribute('aria-checked') === 'true'; })[0] || items[0];
      current.focus();
    }
  }

  btn.addEventListener('click', function () {
    setOpen(menu.hidden);
  });
  btn.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
    }
  });
  items.forEach(function (b, i) {
    b.addEventListener('click', function () {
      choose(b.getAttribute('data-theme-choice'));
      setOpen(false);
      btn.focus();
    });
    b.addEventListener('keydown', function (e) {
      var to = null;
      if (e.key === 'ArrowDown') to = items[(i + 1) % items.length];
      else if (e.key === 'ArrowUp') to = items[(i - 1 + items.length) % items.length];
      else if (e.key === 'Home') to = items[0];
      else if (e.key === 'End') to = items[items.length - 1];
      else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        btn.focus();
        return;
      } else if (e.key === 'Tab') {
        setOpen(false);
        return;
      }
      if (to) {
        e.preventDefault();
        to.focus();
      }
    });
  });
  document.addEventListener('click', function (e) {
    if (!menu.hidden && !wrap.contains(e.target)) setOpen(false);
  });
  if (media && media.addEventListener) {
    media.addEventListener('change', function () {
      if (currentChoice() === 'system') paint('system');
    });
  }
  paint(currentChoice());

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
      var nodes = note.querySelectorAll('.props, h1, h2, p, .actions, .infobox, .arc-engraved-divider, .defs > div, .checks li, .shot');
      Array.prototype.forEach.call(nodes, function (el) {
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
        else if (el.matches('.shot')) { kind = 'code'; chars = Math.round(r.height / lineHeight) * 55; }
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
