// The landing page's knight, live: grab it to spin it on its base (a turntable), drag up or down to
// tilt it, flick it to send it spinning. It slows with friction, then a spring brings it home to the
// hero pose. The WebP render stays as the first paint and the fallback; this fades in over it once the
// model has been built (knight3d.js, in time slices so the page stays responsive).
// A classic script: index.html's inline module imports three.js and calls LandingKnight.start().
(function (root) {
  var reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  function reduced() { return reduceQuery.matches; }

  // ---------- physics constants ----------
  var DRAG_K = 0.011;          // rad of spin per px dragged
  var TILT_K = 0.006;          // rad of tilt per px dragged (mouse only)
  var TILT_MAX = 0.44;         // about 25°, approached with a rubber band
  var MAX_SPIN = 20;           // rad/s, cap on a flick
  var FRICTION = 1.6;          // 1/s: spin decays as e^(−1.6 t)
  var HANDOFF = 0.9;           // rad/s: below this, the home spring takes over
  var HOME_K = 38, HOME_ZETA = 0.7;   // home spring: one gentle overshoot
  var TILT_SPRING_K = 90, TILT_ZETA = 0.55;
  var EXPAND = 1.3;            // the canvas overhangs the stage so a swinging mane isn't clipped
  var TAU = Math.PI * 2;

  function start(lib) {
    var THREE = lib.THREE;
    var stage = document.querySelector(".hero-stage");
    var live = stage && stage.querySelector(".knight-live");
    if (!live || !window.KnightSculpt) return;
    var canvas = live.querySelector("canvas");

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (e) { return; } // no WebGL: the image stays
    renderer.setClearColor(0x000000, 0);
    var scene = new THREE.Scene();
    var material = KnightSculpt.look(THREE, lib.RoomEnvironment, renderer, scene);

    // Tilt pivots at the floor under the base (outer group); spin turns the piece on its own axis (inner).
    var tiltGroup = new THREE.Group(), spinGroup = new THREE.Group();
    tiltGroup.add(spinGroup);
    scene.add(tiltGroup);

    var camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
    camera.position.set(0.3, 2.6, 11.5);
    camera.lookAt(-0.2, 1.8, 0);
    camera.updateMatrixWorld(true);

    // ---------- state ----------
    var S = { yaw: 0, vel: 0, tilt: 0, tiltVel: 0, mode: "rest", target: 0, live: false, buildMs: 0 };
    var raf = 0, last = 0, visible = true, interacted = false;
    root.__knight = S; // for checks in the console

    // ---------- build (in slices), then frame it exactly like the hero image ----------
    function idle(fn) { (window.requestIdleCallback || function (f) { setTimeout(f, 200); })(fn, { timeout: 2000 }); }
    setTimeout(function () {
      idle(function () {
        var t0 = performance.now();
        var small = stage.getBoundingClientRect().width < 400;
        KnightSculpt.build(THREE, lib.MarchingCubes, { res: small ? 110 : 130, cell: 0.016, profilePts: 40, newton: 1, yieldMs: 10, fast: true })
          .then(function (out) {
            S.buildMs = Math.round(performance.now() - t0);
            var mesh = new THREE.Mesh(out.geometry, material);
            mesh.rotation.y = KnightSculpt.HOME_YAW;
            spinGroup.add(mesh);
            frame(out);
            resize();
            renderer.render(scene, camera);
            stage.setAttribute("data-live", "");
            S.live = true;
            new ResizeObserver(function () { resize(); draw(); }).observe(stage);
            observeVisibility();
            if (!reduced()) setTimeout(invite, 2500);
          })
          .catch(function (e) { console.warn("Live knight unavailable, keeping the image:", e); });
      });
    }, 1400); // after the hero's entrance

    // Same framing as tools/logo: centre the square on the shape's visual mass (the mane makes the
    // bounding box lopsided), then widen it by EXPAND because the canvas overhangs the stage.
    var V = 1000; // a virtual full-frame size for setViewOffset
    function frame(out) {
      spinGroup.updateMatrixWorld(true);
      var v = new THREE.Vector3(), minX = 1, maxX = -1, minY = 1, maxY = -1, m = spinGroup.children[0].matrixWorld;
      for (var i = 0; i < out.count; i += 3) {
        v.fromArray(out.positions, i * 3).applyMatrix4(m).project(camera);
        if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x; if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
      }
      var zoom = 0.7 / (Math.max(maxX - minX, maxY - minY) / 2);
      var ox = ((minX + maxX) / 2) * zoom * V / 2, oy = (-(minY + maxY) / 2) * zoom * V / 2;
      camera.zoom = zoom;
      camera.setViewOffset(V, V, ox, oy, V, V);
      camera.updateProjectionMatrix();

      // Measure the rendered silhouette off-screen.
      var A = 256, rt = new THREE.WebGLRenderTarget(A, A);
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      var px = new Uint8Array(A * A * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, A, A, px);
      renderer.setRenderTarget(null);
      rt.dispose();
      var sum = 0, mx = 0, my = 0, x0 = A, x1 = 0, y0 = A, y1 = 0;
      for (var y = 0; y < A; y++) for (var x = 0; x < A; x++) {
        var a = px[((A - 1 - y) * A + x) * 4 + 3] / 255; // render targets read bottom-up
        if (a < 0.04) continue;
        sum += a; mx += a * x; my += a * y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      mx /= sum; my /= sum;
      var cxA = mx, cyA = ((y0 + y1) / 2 + my) / 2, MARGIN = 0.06;
      var halfA = Math.max(cxA - x0, x1 + 1 - cxA, cyA - y0, y1 + 1 - cyA) / (1 - MARGIN);
      var k = V / A, s = 2 * halfA * k * EXPAND;
      camera.setViewOffset(V, V, ox + cxA * k - s / 2, oy + cyA * k - s / 2, s, s);
      camera.updateProjectionMatrix();
    }

    function resize() {
      var r = live.getBoundingClientRect(), css = Math.round(r.width * EXPAND);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(css, css, false);
    }

    // ---------- the loop: runs only while something moves ----------
    function draw() {
      if (!S.live) return;
      tiltGroup.rotation.x = S.tilt;
      spinGroup.rotation.y = S.yaw;
      renderer.render(scene, camera);
    }
    function wake() {
      if (raf || !visible) return;
      last = performance.now();
      raf = requestAnimationFrame(step);
    }
    function step(now) {
      raf = 0;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      var moving = integrate(dt);
      draw();
      if (moving) raf = requestAnimationFrame(step);
    }
    function spring(x, v, target, k, zeta, dt) { // semi-implicit Euler, substepped for stiffness
      var c = 2 * zeta * Math.sqrt(k), n = 4, h = dt / n;
      for (var i = 0; i < n; i++) { v += (-k * (x - target) - c * v) * h; x += v * h; }
      return [x, v];
    }
    function integrate(dt) {
      if (S.mode === "drag") return true;
      var rm = reduced();
      // Tilt always springs back to upright.
      var t = spring(S.tilt, S.tiltVel, 0, TILT_SPRING_K, rm ? 1 : TILT_ZETA, dt);
      S.tilt = t[0]; S.tiltVel = t[1];
      if (S.mode === "coast") {
        S.vel *= Math.exp(-FRICTION * dt);
        S.yaw += S.vel * dt;
        if (Math.abs(S.vel) < HANDOFF) toHome();
      }
      if (S.mode === "home") {
        var y = spring(S.yaw, S.vel, S.target, HOME_K, rm ? 1 : HOME_ZETA, dt);
        S.yaw = y[0]; S.vel = y[1];
        var still = Math.abs(S.yaw - S.target) < 0.002 && Math.abs(S.vel) < 0.01 && Math.abs(S.tilt) < 0.002 && Math.abs(S.tiltVel) < 0.01;
        if (still) {
          S.yaw = 0; S.vel = 0; S.tilt = 0; S.tiltVel = 0; S.target = 0; // fold whole turns away
          S.mode = "rest";
          return false;
        }
      }
      return S.mode !== "rest" || Math.abs(S.tilt) > 0.002;
    }
    // Head for the nearest home pose in the direction it's already going, so it never unwinds a turn.
    function toHome() {
      S.target = Math.round((S.yaw + S.vel * 0.35) / TAU) * TAU;
      S.mode = "home";
    }

    // ---------- input ----------
    var grip = null;
    live.addEventListener("pointerdown", function (e) {
      if (!S.live || (e.pointerType === "mouse" && e.button !== 0)) return;
      interacted = true;
      grip = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw0: S.yaw, mouse: e.pointerType === "mouse", hist: [] };
      S.mode = "drag"; S.vel = 0; S.tiltVel = 0;
      try { live.setPointerCapture(e.pointerId); } catch (err) {}
      live.setAttribute("data-grabbing", "");
      wake();
    });
    live.addEventListener("pointermove", function (e) {
      if (!grip || e.pointerId !== grip.id) return;
      var dx = e.clientX - grip.x, dy = e.clientY - grip.y;
      S.yaw = grip.yaw0 + dx * DRAG_K;
      if (grip.mouse) S.tilt = TILT_MAX * Math.tanh((dy * TILT_K) / TILT_MAX); // rubber band toward ±25°
      var now = performance.now();
      grip.hist.push({ yaw: S.yaw, t: now });
      while (grip.hist.length > 2 && now - grip.hist[0].t > 80) grip.hist.shift();
      draw();
    });
    function release(e, cancelled) {
      if (!grip || e.pointerId !== grip.id) return;
      var h = grip.hist, vel = 0;
      if (!cancelled && h.length > 1) {
        var a = h[0], b = h[h.length - 1];
        if (b.t > a.t && performance.now() - b.t < 60) vel = ((b.yaw - a.yaw) / (b.t - a.t)) * 1000;
      }
      grip = null;
      live.removeAttribute("data-grabbing");
      S.vel = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, vel));
      if (reduced()) S.vel = 0; // no inertia: ease straight home
      if (Math.abs(S.vel) > HANDOFF) S.mode = "coast"; else toHome();
      wake();
    }
    live.addEventListener("pointerup", function (e) { release(e, false); });
    live.addEventListener("pointercancel", function (e) { release(e, true); }); // e.g. the page started scrolling
    live.addEventListener("lostpointercapture", function (e) { release(e, true); });

    live.addEventListener("keydown", function (e) {
      if (!S.live) return;
      var k = e.key;
      if (k === "ArrowLeft" || k === "ArrowRight") {
        e.preventDefault();
        interacted = true;
        S.vel += (k === "ArrowLeft" ? -1 : 1) * (reduced() ? 0 : 5);
        if (reduced()) { S.yaw += k === "ArrowLeft" ? -0.6 : 0.6; toHome(); }
        else S.mode = "coast";
        wake();
      } else if (k === "ArrowUp" || k === "ArrowDown") {
        e.preventDefault();
        S.tiltVel += k === "ArrowUp" ? -2.4 : 2.4;
        if (S.mode === "rest") toHome();
        wake();
      }
    });

    // One small wiggle, once, to show it can be turned.
    function invite() {
      if (interacted || reduced() || !visible) return;
      S.vel = 1.1; // about ±10° through the home spring
      toHome();
      S.target = 0;
      wake();
    }

    // Pause when the hero is off-screen or the tab is hidden.
    function observeVisibility() {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting && !document.hidden;
        if (visible && S.mode !== "rest") wake();
      }).observe(stage);
      document.addEventListener("visibilitychange", function () {
        visible = !document.hidden;
        if (visible && S.mode !== "rest") wake();
      });
    }
  }

  root.LandingKnight = { start: start };
})(this);
