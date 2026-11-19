/* Atrium verde — petit moteur d'affichage des pages (sans dépendance). */
(function () {
  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch);
    if (this.__update) this.__update();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__update) this.__update(); };
  window.DCLogic = DCLogic;

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;

  function lookup(path, scope, vals) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.');
    var head = parts[0], cur, s = scope, found = false;
    while (s) { if (Object.prototype.hasOwnProperty.call(s.vars, head)) { cur = s.vars[head]; found = true; break; } s = s.parent; }
    if (!found) cur = vals[head];
    for (var i = 1; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function whole(str) { var m = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/.exec(str); return m ? m[1] : null; }
  function interp(str, scope, vals) {
    return str.replace(HOLE, function (_, p) { var v = lookup(p, scope, vals); return v == null ? '' : String(v); });
  }

  window.mountPage = function (Component, tplId, rootId) {
    var comp = new Component({});
    var vals = comp.renderVals();
    var root = document.getElementById(rootId);
    var tpl = document.getElementById(tplId).content;
    var bindings = [];

    function build(node, scope, out, live) {
      if (node.nodeType === 3) {
        var t = node.nodeValue;
        var tn = document.createTextNode('');
        if (t.indexOf('{{') >= 0) {
          var up = function () { tn.nodeValue = interp(t, scope, vals); };
          up(); if (live) bindings.push(up);
        } else tn.nodeValue = t;
        out.appendChild(tn); return;
      }
      if (node.nodeType !== 1) return;
      var tag = node.tagName.toLowerCase();
      if (tag === 'sc-for') {
        var listPath = whole(node.getAttribute('list')), as = node.getAttribute('as') || 'item';
        var start = document.createComment('for'), end = document.createComment('/for');
        out.appendChild(start); out.appendChild(end);
        var render = function () {
          while (start.nextSibling && start.nextSibling !== end) start.parentNode.removeChild(start.nextSibling);
          var list = lookup(listPath, scope, vals) || [];
          var frag = document.createDocumentFragment();
          list.forEach(function (item, i) {
            var vars = {}; vars[as] = item; vars.$index = i;
            var sc = { vars: vars, parent: scope };
            for (var c = node.firstChild; c; c = c.nextSibling) build(c, sc, frag, false);
          });
          end.parentNode.insertBefore(frag, end);
        };
        render(); if (live) bindings.push(render);
        return;
      }
      var el = node.namespaceURI === 'http://www.w3.org/1999/xhtml' ? document.createElement(node.localName) : document.createElementNS(node.namespaceURI, node.localName);
      Array.prototype.forEach.call(node.attributes, function (a) {
        var name = a.name, v = a.value;
        if (/^on/i.test(name)) {
          var path = whole(v);
          if (!path) return;
          var ev = name.slice(2).toLowerCase();
          var handler = live ? null : lookup(path, scope, vals);
          el.addEventListener(ev, function (e) {
            var fn = handler || lookup(path, scope, vals);
            if (typeof fn === 'function') fn(e);
          });
          return;
        }
        if (v.indexOf('{{') < 0) { el.setAttribute(name, v); return; }
        var up = function () {
          var w = whole(v), val = w ? lookup(w, scope, vals) : interp(v, scope, vals);
          if (name === 'value' && 'value' in el) { if (String(el.value) !== String(val)) el.value = val; }
          else if (val == null || val === false) el.removeAttribute(name);
          else el.setAttribute(name, String(val));
        };
        up(); if (live) bindings.push(up);
      });
      var kids = node.content ? node.content : node;
      for (var c = kids.firstChild; c; c = c.nextSibling) build(c, scope, el, live);
      out.appendChild(el);
    }

    var frag = document.createDocumentFragment();
    for (var c = tpl.firstChild; c; c = c.nextSibling) build(c, null, frag, true);
    root.innerHTML = '';
    root.appendChild(frag);

    comp.__update = function () {
      vals = comp.renderVals();
      bindings.forEach(function (b) { b(); });
    };
    if (typeof comp.componentDidMount === 'function') comp.componentDidMount();
  };
})();
