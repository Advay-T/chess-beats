// Sling buttons: a vanilla port of React Bits' <SlingButton />.
// Tap a button as normal, or pull it away from its seat and let go: the band stretches, the arc
// fills, and a loaded release fires the button's click once with a spring and a particle burst.
// Buttons opt in with data-sling="primary" | "secondary"; their existing click listeners keep working.
(function () {
  var SVG = "http://www.w3.org/2000/svg";
  var GAP = 4;
  var SLOP = { fine: 4, coarse: 8 };
  var FINGER_MAX = 3000;
  var HAND_MAX = 6000;
  var CANCEL = 0.5;
  var POWER_CAP = 1.5;
  var DOT_MS = 300;
  var EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function rubberband(o, dim, c) {
    c = c == null ? 0.55 : c;
    return (o * dim * c) / (dim + c * Math.abs(o));
  }
  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG, name);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function span(cls) {
    var el = document.createElement("span");
    el.className = cls;
    return el;
  }

  var reduceQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reduced() { return !!(reduceQuery && reduceQuery.matches); }

  var DEFAULTS = {
    padColor: "var(--surface-2)",
    iconColor: "var(--text)",
    accentColor: "var(--white-voice)",
    wellColor: "var(--surface)",
    bandColor: "var(--line-strong)",
    size: 56,
    strokeWidth: 3,
    armAt: 48,
    maxPull: 160,
    launchSpeed: 2600,
    recoil: 0.2,
    flight: 120,
    particles: 14,
    spread: 60,
    axis: "any",
  };

  var PRESETS = {
    secondary: {
      size: 44, strokeWidth: 2.5, armAt: 36, maxPull: 120, flight: 80, particles: 10, axis: "horizontal",
    },
    primary: {
      size: 60, strokeWidth: 3, armAt: 44, maxPull: 150, flight: 120, particles: 14, axis: "horizontal",
      padColor: "var(--white-voice)", iconColor: "#0b1720", wellColor: "var(--surface-2)",
    },
  };

  // Damped spring back to 0 for one axis pair, standing in for motion's animate(..., { type: "spring" }).
  function springTo(get, set, v0, duration, bounce, done) {
    var zeta = clamp(1 - bounce, 0.05, 1);
    var omega = (2 * Math.PI) / duration; // natural frequency so it settles in about `duration`
    var pos = get(), vel = { x: v0.x, y: v0.y };
    var last = performance.now(), raf = 0, stopped = false;
    function step(now) {
      if (stopped) return;
      var dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      var sub = 4, h = dt / sub;
      for (var i = 0; i < sub; i++) {
        var ax = -omega * omega * pos.x - 2 * zeta * omega * vel.x;
        var ay = -omega * omega * pos.y - 2 * zeta * omega * vel.y;
        vel.x += ax * h; vel.y += ay * h;
        pos.x += vel.x * h; pos.y += vel.y * h;
      }
      if (Math.hypot(pos.x, pos.y) < 0.05 && Math.hypot(vel.x, vel.y) < 2) {
        set(0, 0);
        stopped = true;
        if (done) done();
        return;
      }
      set(pos.x, pos.y);
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return { stop: function () { stopped = true; cancelAnimationFrame(raf); } };
  }

  var hintCount = 0;

  function enhance(pad, options) {
    if (!pad || pad.dataset.slingReady) return null;
    pad.dataset.slingReady = "1";
    var o = Object.assign({}, DEFAULTS, options || {});

    var R = o.maxPull;
    var ARM = Math.min(o.armAt, 0.8 * R);
    var wellR = o.size / 2 + GAP + o.strokeWidth;
    var padR = o.size / 2 - o.strokeWidth / 2;
    var H = wellR + o.strokeWidth + 2;
    var DOT = Math.max(5, Math.round(o.size / 7));
    var count = Math.max(0, Math.round(o.particles));

    // ---------- DOM, mirroring the React component ----------
    var root = span("sling-button" + (o.className ? " " + o.className : ""));
    var vars = {
      "--sl-size": o.size + "px", "--sl-svg": 2 * H + "px", "--sl-pad": o.padColor, "--sl-icon": o.iconColor,
      "--sl-accent": o.accentColor, "--sl-well": o.wellColor, "--sl-band": o.bandColor,
      "--sl-stroke": o.strokeWidth + "px", "--sl-dot": DOT + "px",
    };
    for (var v in vars) root.style.setProperty(v, vars[v]);

    var fxSvg = svgEl("svg", { class: "sling-button__fx", viewBox: -H + " " + -H + " " + 2 * H + " " + 2 * H, "aria-hidden": "true" });
    var fx = svgEl("g", { class: "sling-button__tension" });
    fx.style.opacity = "0";
    var band = svgEl("path", { class: "sling-button__band" });
    var hot = svgEl("path", { class: "sling-button__band sling-button__band--hot" });
    fx.appendChild(band); fx.appendChild(hot);
    var well = svgEl("circle", { class: "sling-button__well", r: wellR });
    var arc = svgEl("circle", { class: "sling-button__arc", r: wellR, pathLength: "1", "stroke-dasharray": "0 1" });
    arc.style.opacity = "0";
    fxSvg.appendChild(fx); fxSvg.appendChild(well); fxSvg.appendChild(arc);

    var dots = [];
    for (var i = 0; i < count; i++) {
      var dot = span("sling-button__dot");
      dot.setAttribute("aria-hidden", "true");
      dots.push(dot);
    }

    var move = span("sling-button__move");
    var face = span("sling-button__face");
    var icon = span("sling-button__icon");
    while (pad.firstChild) icon.appendChild(pad.firstChild);
    face.appendChild(icon);

    var hint = span("sling-button__sr");
    hint.id = "sling-hint-" + ++hintCount;
    hint.textContent = "Press Enter, or pull sideways and release.";

    pad.parentNode.insertBefore(root, pad);
    pad.classList.add("sling-button__pad");
    pad.type = "button";
    pad.setAttribute("aria-describedby", hint.id);
    pad.appendChild(face);
    move.appendChild(pad);
    root.appendChild(fxSvg);
    dots.forEach(function (d) { root.appendChild(d); });
    root.appendChild(move);
    root.appendChild(hint);

    // ---------- state ----------
    var px = 0, py = 0;
    var grip = null;
    var dir = { ux: 0, uy: -1 };
    var anim = null;
    var armed = false;
    var power = 0;
    var dotPending = false, dotTimer = 0;
    var paintQueued = false;
    var skipUntil = 0; // swallow the native click that follows a drag release
    var firing = false;

    function setPos(x, y) {
      px = x; py = y;
      move.style.transform = "translate(" + x + "px, " + y + "px)";
      schedulePaint();
    }
    function setArmed(on) {
      armed = on;
      if (on) { root.setAttribute("data-armed", ""); pad.setAttribute("data-armed", ""); }
      else { root.removeAttribute("data-armed"); pad.removeAttribute("data-armed"); }
    }
    function setHeld(on) {
      if (on) pad.setAttribute("data-held", ""); else pad.removeAttribute("data-held");
    }

    function aimIcon(ux, uy, dist) {
      var angle = (Math.atan2(-uy, -ux) * 180) / Math.PI + 90;
      icon.style.transition = "none";
      icon.style.transform = "rotate(" + angle * clamp(dist / 12, 0, 1) + "deg)";
    }
    function relaxIcon() {
      icon.style.transition = reduced() ? "none" : "transform 360ms " + EASE_OUT;
      icon.style.transform = "rotate(0deg)";
    }

    function launchDot() {
      dotPending = false;
      clearTimeout(dotTimer);
      relaxIcon();
      if (!dots.length || !dots[0].animate) return;
      var base = Math.atan2(-dir.uy, -dir.ux);
      var cone = (o.spread * Math.PI) / 180;
      var push = 0.85 + 0.35 * power;
      dots.forEach(function (dot, i) {
        var lead = i === 0;
        var angle = base + (lead ? 0 : (Math.random() + Math.random() - 1) * (cone / 2));
        var cx = Math.cos(angle), cy = Math.sin(angle);
        var reach = (lead ? o.flight : o.flight * (0.3 + Math.random())) * push;
        var drift = lead ? 0 : (Math.random() - 0.5) * o.flight * 0.4;
        var scale = lead ? 1 : 0.3 + Math.random() * 0.6;
        var shrink = lead ? 0.6 : scale * (0.2 + Math.random() * 0.4);
        var duration = lead ? DOT_MS : DOT_MS * (0.7 + Math.random());
        var delay = lead ? 0 : Math.random() * 70;
        var to = wellR + reach;
        dot.animate(
          [
            { transform: "translate(" + cx * wellR + "px, " + cy * wellR + "px) scale(" + scale + ")" },
            { transform: "translate(" + (cx * to - cy * drift) + "px, " + (cy * to + cx * drift) + "px) scale(" + shrink + ")" },
          ],
          { duration: duration, delay: delay, easing: EASE_OUT, fill: "none" }
        );
        dot.animate(
          [{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.55 }, { opacity: 0, offset: 1 }],
          { duration: duration, delay: delay, easing: "linear", fill: "none" }
        );
      });
    }

    function paint() {
      paintQueued = false;
      var ux = dir.ux, uy = dir.uy;
      var proj = px * ux + py * uy;
      var p = clamp(proj / ARM, 0, 1);
      var dist = Math.hypot(px, py);
      var d = "";
      if (dist > 0.5) {
        var a = Math.atan2(py, px);
        var b = Math.acos(clamp((wellR - padR) / dist, -1, 1));
        d = [a + b, a - b].map(function (t) {
          var cx = Math.cos(t), cy = Math.sin(t);
          return "M" + (wellR * cx).toFixed(2) + "," + (wellR * cy).toFixed(2) +
            "L" + (px + padR * cx).toFixed(2) + "," + (py + padR * cy).toFixed(2);
        }).join("");
      }
      band.setAttribute("d", d);
      hot.setAttribute("d", d);
      hot.style.opacity = String(p);
      fx.style.opacity = String(clamp(proj / 6, 0, 1));
      arc.setAttribute("stroke-dasharray", p + " " + (1 - p));
      arc.setAttribute("stroke-dashoffset", String(p / 2));
      arc.style.opacity = p > 0.01 ? "1" : "0";
      arc.setAttribute("transform", "rotate(" + (Math.atan2(-uy, -ux) * 180) / Math.PI + ")");
      // Transport icons already point their way, so only a free-axis pad turns its icon to aim.
      if (grip && o.axis === "any") aimIcon(ux, uy, dist);
      if (dotPending && proj <= o.size / 4) launchDot();
    }
    function schedulePaint() {
      if (paintQueued) return;
      paintQueued = true;
      requestAnimationFrame(paint);
    }

    function settle(v0) {
      if (reduced()) {
        fx.style.transition = "opacity 200ms ease";
        fx.style.opacity = "0";
        setTimeout(function () { setPos(0, 0); fx.style.transition = ""; }, 200);
        return;
      }
      anim = springTo(function () { return { x: px, y: py }; }, setPos, v0, 0.4, o.recoil);
    }

    function fire() {
      firing = true;
      try { pad.click(); } finally { firing = false; }
    }

    function release(pointerId, cancelled) {
      var g = grip;
      if (!g || g.id !== pointerId) return;
      grip = null;
      try { pad.releasePointerCapture(pointerId); } catch (e) {}
      var dist = Math.hypot(px, py);
      var p = dist / ARM;
      var ux = dir.ux, uy = dir.uy;
      var vx = 0, vy = 0;
      if (!cancelled && g.hist.length > 1) {
        var a = g.hist[0], b = g.hist[g.hist.length - 1];
        var dt = b.t - a.t;
        if (dt > 0 && performance.now() - b.t < 50) {
          vx = ((b.x - a.x) / dt) * 1000;
          vy = ((b.y - a.y) / dt) * 1000;
        }
      }
      var fm = Math.hypot(vx, vy);
      if (fm > FINGER_MAX) { vx *= FINGER_MAX / fm; vy *= FINGER_MAX / fm; }

      if (!g.moved) {
        relaxIcon();
        if (cancelled) skipUntil = performance.now() + 400;
        // An uncancelled tap: the browser's own click follows and runs the listeners.
      } else {
        skipUntil = performance.now() + 400;
        var loaded = armed && !cancelled;
        var launch = loaded ? o.launchSpeed * Math.min(p, POWER_CAP) : CANCEL * o.launchSpeed * Math.min(p, 1);
        var v0x = vx - ux * launch, v0y = vy - uy * launch;
        var m = Math.hypot(v0x, v0y);
        if (m > HAND_MAX) { v0x *= HAND_MAX / m; v0y *= HAND_MAX / m; }
        if (!loaded) relaxIcon();
        if (loaded) {
          fire();
          if (reduced()) {
            root.setAttribute("data-sent", "");
            setTimeout(function () { root.removeAttribute("data-sent"); }, 200);
          } else {
            power = clamp((Math.min(p, POWER_CAP) - 1) / (POWER_CAP - 1), 0, 1);
            dotPending = true;
            dotTimer = setTimeout(launchDot, 150);
          }
        }
        settle({ x: v0x, y: v0y });
      }
      setArmed(false);
      setHeld(false);
    }

    // ---------- events ----------
    pad.addEventListener("pointerdown", function (e) {
      if (pad.disabled || grip || e.button !== 0) return;
      var rect = root.getBoundingClientRect();
      var scale = rect.width / (root.offsetWidth || rect.width) || 1;
      if (anim) anim.stop();
      var dNow = Math.hypot(px, py);
      var dClamped = Math.min(dNow, 0.95 * R);
      var rawNow = dNow > 0.5 ? (R * dClamped) / (R - dClamped) : 0;
      grip = {
        id: e.pointerId, startX: e.clientX, startY: e.clientY, scale: scale, moved: false, hist: [],
        rawOrigin: dNow > 0.5 ? { x: (rawNow * px) / dNow, y: (rawNow * py) / dNow } : { x: 0, y: 0 },
        slop: e.pointerType === "touch" ? SLOP.coarse : SLOP.fine,
      };
      try { pad.setPointerCapture(e.pointerId); } catch (err) {}
      setHeld(true);
    });
    pad.addEventListener("pointermove", function (e) {
      var g = grip;
      if (!g || g.id !== e.pointerId) return;
      var dx = (e.clientX - g.startX) / g.scale;
      var dy = (e.clientY - g.startY) / g.scale;
      var rx = g.rawOrigin.x + dx;
      var ry = g.rawOrigin.y + dy;
      if (o.axis === "horizontal") ry = rubberband(ry, o.size / 4);
      else if (o.axis === "vertical") rx = rubberband(rx, o.size / 4);
      if (!g.moved && Math.hypot(dx, dy) > g.slop) g.moved = true;
      var raw = Math.hypot(rx, ry);
      if (raw < 0.01) return;
      var d = (R * raw) / (R + raw);
      var ux = rx / raw, uy = ry / raw;
      dir = { ux: ux, uy: uy };
      setPos(d * ux, d * uy);
      var t = performance.now();
      g.hist.push({ x: d * ux, y: d * uy, t: t });
      while (g.hist.length > 4 || t - g.hist[0].t > 80) g.hist.shift();
      var isArmed = d >= ARM;
      if (isArmed !== armed) setArmed(isArmed);
    });
    pad.addEventListener("pointerup", function (e) { release(e.pointerId, false); });
    pad.addEventListener("pointercancel", function (e) { release(e.pointerId, true); });
    pad.addEventListener("lostpointercapture", function (e) { release(e.pointerId, true); });
    pad.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && grip) release(grip.id, true);
    });
    // Runs before the app's own listeners: drop the click a drag release leaves behind.
    pad.addEventListener("click", function (e) {
      if (firing) return;
      if (performance.now() < skipUntil) {
        skipUntil = 0;
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);

    paint();
    return root;
  }

  function enhanceAll(scope) {
    var list = (scope || document).querySelectorAll("[data-sling]");
    Array.prototype.forEach.call(list, function (btn) {
      enhance(btn, PRESETS[btn.getAttribute("data-sling")] || {});
    });
  }

  window.Sling = { enhance: enhance, enhanceAll: enhanceAll, presets: PRESETS };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { enhanceAll(); });
  else enhanceAll();
})();
