// The Chess Beats knight as live 3D: one source for the logo renderer (tools/logo/knight.html) and the
// landing page's grabbable knight (landing-knight.js), so the two can never drift apart.
//
// The knight is a signed-distance sculpture: a hand-drawn profile inflated into a rounded volume,
// a turned Staunton base, and nine sound-wave ridges for a mane, all joined with smooth unions so
// every seam is filleted like carved stone. Marching cubes turns it into a mesh; every vertex is then
// snapped onto the true surface and shaded with the field's own normals.
//
// A classic script (window.KnightSculpt) that takes THREE as an argument: pages import three.js as an
// ES module from the CDN and hand it over, which keeps everything loadable from file://.
(function (root) {
  var BLUE = 0x7fd3ff, CORAL = 0xff9470;
  var HOME_YAW = 0.34; // three-quarter: the face turned toward the viewer's left

  // ---------- sdf helpers ----------
  // Distances use Math.hypot for the logo stills (exact, as they were rendered) and a plain square root
  // live, where Math.hypot's overflow care is ~20x slower and invisible in the result. Set per build.
  var hyp2 = Math.hypot, hyp3 = Math.hypot;
  function fast2(a, b) { return Math.sqrt(a * a + b * b); }
  function fast3(a, b, c) { return Math.sqrt(a * a + b * b + c * c); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function sstep(v, a, b) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function smin(a, b, k) { var h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h); }
  function ssub(a, b, k) { var h = clamp(0.5 - 0.5 * (a + b) / k, 0, 1); return a * (1 - h) + -b * h + k * h * (1 - h); } // carve b out of a
  function roundCyl(r, y, ra, hh, rb) { // rounded cylinder on the y axis, centred at y = 0
    var dx = r - (ra - rb), dy = Math.abs(y) - (hh - rb);
    return hyp2(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - rb;
  }
  function torus(r, y, R, t) { return hyp2(r - R, y) - t; }
  function ellipsoid(px, py, pz, rx, ry, rz) {
    var k0 = hyp3(px / rx, py / ry, pz / rz), k1 = hyp3(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
    return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  }

  // Yield to the page without setTimeout's 4ms minimum: a MessageChannel message runs as soon as the
  // browser has handled input and painted.
  var yieldNow = (function () {
    if (typeof MessageChannel === "undefined") return function (fn) { setTimeout(fn, 0); };
    var ch = new MessageChannel(), queue = [];
    ch.port1.onmessage = function () { var fn = queue.shift(); if (fn) fn(); };
    return function (fn) { queue.push(fn); ch.port2.postMessage(0); };
  })();
  // Cooperative yielding: long loops call tick() and await it when it returns a promise.
  function slicer(budgetMs) {
    var start = performance.now();
    return function () {
      if (!budgetMs || performance.now() - start < budgetMs) return null;
      return new Promise(function (r) { yieldNow(function () { start = performance.now(); r(); }); });
    };
  }

  /**
   * Build the knight's geometry.
   * @param opts.res      marching-cubes grid (230 for the logo stills, ~130 live)
   * @param opts.cell     2D profile bake cell size (0.006 for stills; coarser is fine live, the field is blurred)
   * @param opts.yieldMs  yield to the page every this many ms (0 = run straight through)
   * @param opts.fast     sample the field in a narrow band around the surface (live use; the stills stay exact)
   * @param opts.profilePts  points per profile curve (80 for stills)
   * @param opts.newton   Newton steps snapping vertices onto the surface (2 for stills)
   * @param opts.onProgress(0..1)
   * @returns Promise<{ geometry: THREE.BufferGeometry, positions: Float32Array, count: number }>
   */
  async function build(THREE, MarchingCubes, opts) {
    opts = opts || {};
    var RES = opts.res || 230, CELL = opts.cell || 0.006, progress = opts.onProgress || function () {};
    var NEWTON = opts.newton || 2;
    hyp2 = opts.fast ? fast2 : Math.hypot; hyp3 = opts.fast ? fast3 : Math.hypot;
    var tick = slicer(opts.yieldMs || 0), wait, T = { start: performance.now() };

    // ---------- the profile: a knight facing left, standing on the base (y = 0.64) ----------
    var Y0 = 0.64;
    var shape = new THREE.Shape();
    shape.moveTo(-0.6, -0.34);
    shape.bezierCurveTo(-0.82, 0.2, -0.62, 0.66, -0.66, 0.9);        // chest
    shape.bezierCurveTo(-0.74, 1.04, -1.02, 1.02, -1.22, 1.1);       // throat to jaw
    shape.bezierCurveTo(-1.44, 1.18, -1.5, 1.48, -1.4, 1.66);        // chin and muzzle
    shape.bezierCurveTo(-1.3, 1.82, -1.08, 1.86, -0.88, 1.96);       // bridge of the nose
    shape.bezierCurveTo(-0.66, 2.08, -0.46, 2.2, -0.34, 2.4);        // brow
    shape.bezierCurveTo(-0.28, 2.52, -0.22, 2.68, -0.13, 2.76);      // front of the ear
    shape.bezierCurveTo(-0.05, 2.66, 0.0, 2.55, 0.08, 2.46);         // back of the ear
    shape.bezierCurveTo(0.42, 2.3, 0.62, 1.98, 0.66, 1.56);          // poll and crest
    shape.bezierCurveTo(0.7, 1.1, 0.84, 0.5, 0.66, -0.34);           // back of the neck
    shape.lineTo(-0.6, -0.34);
    var poly = shape.getPoints(opts.profilePts || 80).map(function (p) { return [p.x, p.y + Y0]; });
    var n = poly.length;

    // 2D signed distance to the profile, baked on a grid (negative inside).
    var G = { x0: -1.9, y0: 0.05, cell: CELL };
    G.w = Math.ceil((1.3 - G.x0) / G.cell); G.h = Math.ceil((3.8 - G.y0) / G.cell);
    var sdf2 = new Float32Array(G.w * G.h);
    for (var j = 0; j < G.h; j++) {
      var y = G.y0 + j * G.cell;
      var xs = []; // crossings of this row with the outline, for the inside test
      for (var k = 0; k < n; k++) {
        var A = poly[k], B = poly[(k + 1) % n];
        if ((A[1] > y) !== (B[1] > y)) xs.push(A[0] + ((y - A[1]) / (B[1] - A[1])) * (B[0] - A[0]));
      }
      for (var i = 0; i < G.w; i++) {
        var x = G.x0 + i * G.cell, d = Infinity;
        for (k = 0; k < n; k++) {
          var a = poly[k], b = poly[(k + 1) % n];
          var ex = b[0] - a[0], ey = b[1] - a[1], wx = x - a[0], wy = y - a[1];
          var t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1);
          var dx = wx - ex * t, dy = wy - ey * t, dd = dx * dx + dy * dy;
          if (dd < d) d = dd;
        }
        var inside = false;
        for (var c = 0; c < xs.length; c++) if (xs[c] < x) inside = !inside;
        sdf2[j * G.w + i] = inside ? -Math.sqrt(d) : Math.sqrt(d);
      }
      if ((wait = tick())) await wait;
    }
    progress(0.15); T.bake = performance.now();

    // A light blur of the field softens corners (the ear tip, the medial-axis creases) like a sculptor's rasp.
    // The radius is in world units (0.03), so a coarser bake blurs the same amount.
    (function blur(radius, passes) {
      var tmp = new Float32Array(sdf2.length), p, i, j, acc, row;
      for (p = 0; p < passes; p++) {
        for (j = 0; j < G.h; j++) { // rows
          acc = 0; row = j * G.w;
          for (i = -radius; i <= radius; i++) acc += sdf2[row + clamp(i, 0, G.w - 1)];
          for (i = 0; i < G.w; i++) {
            tmp[row + i] = acc / (2 * radius + 1);
            acc += sdf2[row + clamp(i + radius + 1, 0, G.w - 1)] - sdf2[row + clamp(i - radius, 0, G.w - 1)];
          }
        }
        for (i = 0; i < G.w; i++) { // columns
          acc = 0;
          for (j = -radius; j <= radius; j++) acc += tmp[clamp(j, 0, G.h - 1) * G.w + i];
          for (j = 0; j < G.h; j++) {
            sdf2[j * G.w + i] = acc / (2 * radius + 1);
            acc += tmp[clamp(j + radius + 1, 0, G.h - 1) * G.w + i] - tmp[clamp(j - radius, 0, G.h - 1) * G.w + i];
          }
        }
      }
    })(Math.max(1, Math.round(0.03 / CELL)), 3);

    // Catmull-Rom bicubic sampling: smooth slopes, so the shading shows no grid.
    function cr(p0, p1, p2, p3, t) { return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0))); }
    function at(i, j) { return sdf2[clamp(j, 0, G.h - 1) * G.w + clamp(i, 0, G.w - 1)]; }
    function row(i, jj, tx) { return cr(at(i - 1, jj), at(i, jj), at(i + 1, jj), at(i + 2, jj), tx); }
    function prof(x, y) { // hot path: no allocations
      var fx = (x - G.x0) / G.cell, fy = (y - G.y0) / G.cell;
      var i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
      var v = cr(row(i, j - 1, tx), row(i, j, tx), row(i, j + 1, tx), row(i, j + 2, tx), ty);
      var ox = Math.max(G.x0 - x, x - (G.x0 + G.w * G.cell), 0), oy = Math.max(G.y0 - y, y - (G.y0 + G.h * G.cell), 0);
      return v + hyp2(ox, oy);
    }

    // Half-thickness of the head across the board: slim muzzle, full chest and cheek, thin ears.
    function halfWidth(x, y) {
      var h = 0.4;
      h *= 1 - 0.36 * sstep(-x, 0.5, 1.35);
      h *= 1 + 0.26 * (1 - sstep(y, 1.2, 2.0));
      h *= 1 - 0.55 * sstep(y, 3.0, 3.45);
      h += 0.07 * Math.exp(-((x + 0.45) * (x + 0.45) + (y - 2.45) * (y - 2.45)) / 0.09); // cheek
      return h;
    }
    var EDGE = 0.26; // how far in from the outline the side reaches full thickness
    var domeD = 0, domeH = 0; // headDome's results (hot path: no allocations)
    function headDome(x, y) { // the profile distance and the inflated half-thickness at (x, y), 0 outside
      var d = prof(x, y);
      domeD = d;
      if (d >= 0) { domeH = 0; return 0; }
      var t = Math.min(-d / EDGE, 1);
      var crown = 0.8 + 0.2 * sstep(-d, 0.08, 0.6); // the side keeps curving toward its middle
      domeH = halfWidth(x, y) * crown * Math.sqrt(1 - (1 - t) * (1 - t));
      return domeH;
    }
    function head(x, y, z) {
      headDome(x, y);
      if (domeD >= 0) return hyp2(domeD, z);
      return Math.max(Math.abs(z) - domeH, domeD * 0.6);
    }

    // ---------- the sound-wave mane: equalizer bars out of the back of the neck ----------
    // Horizontal bars stacked down the crest, their lengths tracing an audio waveform.
    function backEdgeX(y) { // the profile's rear outline at height y
      var best = -Infinity;
      for (var k = 0; k < n; k++) {
        var a = poly[k], b = poly[(k + 1) % n];
        if ((a[1] > y) !== (b[1] > y)) best = Math.max(best, a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      return best;
    }
    var WAVE = [0.4, 0.68, 1.0, 0.76, 0.92, 0.58, 0.74, 0.44, 0.26];
    var RIDGE_R = 0.064, RIDGE_FLAT = 1.9; // radius in the profile; wider across the neck
    var BAR_TOP = 2.98, BAR_STEP = 0.166;
    var ridges = WAVE.map(function (amp, i) {
      var y = BAR_TOP - i * BAR_STEP, xb = backEdgeX(y);
      return { ax: xb - 0.22, ay: y, bx: xb + 0.1 + 0.5 * amp, by: y };
    });
    function ridgeD(x, y, z, r) { // distance to a flattened capsule (hot path: no allocations)
      var ex = r.bx - r.ax, ey = r.by - r.ay, wx = x - r.ax, wy = y - r.ay;
      var t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
      return hyp3(wx - ex * t, wy - ey * t, z / RIDGE_FLAT) - RIDGE_R;
    }
    function ridgeAt(x, y, z, r) { // distance to a flattened capsule, and how far along it (0 root, 1 tip)
      var ex = r.bx - r.ax, ey = r.by - r.ay, wx = x - r.ax, wy = y - r.ay;
      var t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
      return { d: hyp3(wx - ex * t, wy - ey * t, z / RIDGE_FLAT) - RIDGE_R, t: t };
    }

    // ---------- the base: a turned Staunton foot ----------
    function base(x, y, z) {
      var r = hyp2(x, z);
      var d = roundCyl(r, y - 0.13, 1.24, 0.13, 0.09);               // foot
      d = smin(d, roundCyl(r, y - 0.33, 1.06, 0.08, 0.05), 0.05);   // step
      d = smin(d, torus(r, y - 0.43, 0.93, 0.045), 0.03);           // bead
      d = smin(d, roundCyl(r, y - 0.53, 0.84, 0.08, 0.05), 0.04);   // waist
      d = smin(d, torus(r, y - 0.635, 0.82, 0.055), 0.03);          // collar
      return d;
    }

    // Eye, nostril and mouth carved into the surface on both sides.
    var EYE = [-0.5, 2.74], NOSE = [-1.28, 2.2], MOUTH = [[-1.44, 1.96], [-1.08, 1.86]];
    var eyeZ = headDome(EYE[0], EYE[1]), noseZ = headDome(NOSE[0], NOSE[1]);

    function knight(x, y, z) {
      var d = head(x, y, z);
      for (var i = 0; i < ridges.length; i++) d = smin(d, ridgeD(x, y, z, ridges[i]), 0.06);
      var az = Math.abs(z);
      d = ssub(d, ellipsoid(x - EYE[0], y - EYE[1], az - eyeZ, 0.14, 0.085, 0.09), 0.03);                 // socket
      d = smin(d, ellipsoid(x - EYE[0] + 0.01, y - EYE[1], az - eyeZ + 0.035, 0.075, 0.05, 0.05), 0.02);  // eyeball
      d = ssub(d, ellipsoid(x - NOSE[0], y - NOSE[1], az - noseZ, 0.06, 0.045, 0.05), 0.02);
      // mouth: a soft groove along the jaw line
      var ax = MOUTH[0][0], ay = MOUTH[0][1], ex = MOUTH[1][0] - ax, ey = MOUTH[1][1] - ay;
      var t = clamp(((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey), 0, 1);
      var mxy = hyp2(x - ax - ex * t, y - ay - ey * t);
      // The groove is at least mxy - 0.03 away, so where mxy + d > 0.06 the carve changes nothing (ssub's h is 0):
      // skip it there and save a profile lookup. Exact, not an approximation.
      if (mxy + d <= 0.06) {
        var mz = headDome(ax + ex * t, ay + ey * t);
        d = ssub(d, hyp3(x - ax - ex * t, y - ay - ey * t, (az - mz) * 0.7) - 0.03, 0.03);
      }
      return smin(d, base(x, y, z), 0.16);
    }

    // ---------- sculpt: sample into marching cubes ----------
    var C = { x: -0.22, y: 1.82, z: 0 }, HS = 1.98; // the sculpt box: centre and half-size
    var mc = new MarchingCubes(RES, new THREE.MeshBasicMaterial(), false, false, Math.round(1400000 * Math.pow(RES / 230, 2)));
    mc.isolation = 0;
    var field = mc.field, half = RES / 2, R2 = RES * RES;
    function gridX(i) { return C.x + HS * (i - half) / half; }
    function gridY(j) { return C.y + HS * (j - half) / half; }
    function gridZ(k) { return C.z + HS * (k - half) / half; }
    if (!opts.fast) {
      // Exact: every voxel (the logo stills).
      for (var kz = 0; kz < RES; kz++) {
        var z = gridZ(kz);
        for (var jy = 0; jy < RES; jy++) {
          var yy = gridY(jy), base0 = jy * RES + kz * R2;
          for (var ix = 0; ix < RES; ix++) field[ix + base0] = -knight(gridX(ix), yy, z) * 100; // positive inside
        }
        if ((wait = tick())) { progress(0.15 + 0.55 * kz / RES); await wait; }
      }
    } else {
      // Narrow band (live): sample a coarse lattice, then evaluate exactly only the blocks that might hold
      // surface. Far from the surface only the sign matters, so those blocks take the coarse values.
      var Bk = 4, NC = Math.ceil((RES - 1) / Bk) + 1, coarse = new Float32Array(NC * NC * NC);
      var fi = function (c) { return Math.min(c * Bk, RES - 1); };
      for (var cz = 0; cz < NC; cz++) {
        for (var cy = 0; cy < NC; cy++) for (var cx = 0; cx < NC; cx++) {
          coarse[cx + cy * NC + cz * NC * NC] = knight(gridX(fi(cx)), gridY(fi(cy)), gridZ(fi(cz)));
        }
        if ((wait = tick())) await wait;
      }
      var cellW = (2 * HS) / RES, band = 1.5 * Bk * cellW * Math.sqrt(3); // a block's diagonal, with room to spare
      var corners = new Float64Array(8);
      for (cz = 0; cz < NC - 1; cz++) {
        for (cy = 0; cy < NC - 1; cy++) for (cx = 0; cx < NC - 1; cx++) {
          var c0 = cx + cy * NC + cz * NC * NC, NN = NC * NC;
          corners[0] = coarse[c0]; corners[1] = coarse[c0 + 1]; corners[2] = coarse[c0 + NC]; corners[3] = coarse[c0 + NC + 1];
          corners[4] = coarse[c0 + NN]; corners[5] = coarse[c0 + NN + 1]; corners[6] = coarse[c0 + NN + NC]; corners[7] = coarse[c0 + NN + NC + 1];
          var lo = Infinity, hi = -Infinity;
          for (var ci = 0; ci < 8; ci++) { if (corners[ci] < lo) lo = corners[ci]; if (corners[ci] > hi) hi = corners[ci]; }
          var exact = !(lo > band || hi < -band); // far outside, or far inside: no surface in this block
          var i0 = fi(cx), i1 = fi(cx + 1), j0 = fi(cy), j1 = fi(cy + 1), k0 = fi(cz), k1 = fi(cz + 1);
          for (var kk = k0; kk <= k1; kk++) for (var jj = j0; jj <= j1; jj++) for (var ii = i0; ii <= i1; ii++) {
            var val;
            if (exact) val = knight(gridX(ii), gridY(jj), gridZ(kk));
            else {
              var u = (ii - i0) / (i1 - i0 || 1), vv = (jj - j0) / (j1 - j0 || 1), w = (kk - k0) / (k1 - k0 || 1);
              val = ((corners[0] * (1 - u) + corners[1] * u) * (1 - vv) + (corners[2] * (1 - u) + corners[3] * u) * vv) * (1 - w) +
                    ((corners[4] * (1 - u) + corners[5] * u) * (1 - vv) + (corners[6] * (1 - u) + corners[7] * u) * vv) * w;
            }
            field[ii + jj * RES + kk * R2] = -val * 100;
          }
        }
        if ((wait = tick())) { progress(0.15 + 0.55 * cz / NC); await wait; }
      }
    }
    T.field = performance.now();
    mc.update();
    progress(0.75); T.mc = performance.now();

    // Marching cubes writes every triangle's corners separately, so each surface point appears about six
    // times. Merge them first (exact: shared edges produce identical coordinates), refine each once, and
    // hand the GPU an indexed mesh.
    var raw = mc.positionArray, triVerts = mc.count, keyOf = new Map(), index = new Uint32Array(triVerts), uniq = [];
    for (var q = 0; q < triVerts; q++) {
      var key = raw[q * 3] + "," + raw[q * 3 + 1] + "," + raw[q * 3 + 2], id = keyOf.get(key);
      if (id === undefined) { id = uniq.length / 3; keyOf.set(key, id); uniq.push(raw[q * 3], raw[q * 3 + 1], raw[q * 3 + 2]); }
      index[q] = id;
    }
    keyOf = null;
    var count = uniq.length / 3;

    // Refine each unique vertex, in world units, with a glow weight on the mane's tips.
    var posW = new Float32Array(count * 3), nrmW = new Float32Array(count * 3), glow = new Float32Array(count * 3);
    var E = 0.0035, g3 = [0, 0, 0];
    function grad(x, y, z) {
      g3[0] = knight(x + E, y, z) - knight(x - E, y, z);
      g3[1] = knight(x, y + E, z) - knight(x, y - E, z);
      g3[2] = knight(x, y, z + E) - knight(x, y, z - E);
      return g3;
    }
    for (var v = 0; v < count; v++) {
      var px = C.x + uniq[v * 3] * HS, py = C.y + uniq[v * 3 + 1] * HS, pz = C.z + uniq[v * 3 + 2] * HS;
      // Two Newton steps onto the zero surface take out the marching-cubes stair-steps.
      for (var it = 0; it < NEWTON; it++) {
        var f = knight(px, py, pz);
        grad(px, py, pz);
        var gg = g3[0] * g3[0] + g3[1] * g3[1] + g3[2] * g3[2];
        if (gg < 1e-12) break;
        var s2 = (f * 2 * E) / gg;
        px -= g3[0] * s2; py -= g3[1] * s2; pz -= g3[2] * s2;
      }
      grad(px, py, pz);
      var gl = Math.hypot(g3[0], g3[1], g3[2]) || 1;
      nrmW[v * 3] = g3[0] / gl; nrmW[v * 3 + 1] = g3[1] / gl; nrmW[v * 3 + 2] = g3[2] / gl;
      posW[v * 3] = px; posW[v * 3 + 1] = py; posW[v * 3 + 2] = pz;
      var gw = 0;
      for (var r = 0; r < ridges.length; r++) {
        var ra = ridgeAt(px, py, pz, ridges[r]);
        if (ra.d < 0.02) gw = Math.max(gw, sstep(ra.t, 0.42, 1.02));
      }
      glow[v * 3] = gw; glow[v * 3 + 1] = gw; glow[v * 3 + 2] = gw;
      if ((v & 1023) === 0 && (wait = tick())) { progress(0.75 + 0.25 * v / count); await wait; }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posW, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nrmW, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(glow, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    // Per-triangle corner positions, in the order marching cubes emitted them: the logo tool's framing
    // samples these, so its stills stay exactly as before.
    var cornerPos = new Float32Array(triVerts * 3);
    for (q = 0; q < triVerts; q++) {
      var src = index[q] * 3;
      cornerPos[q * 3] = posW[src]; cornerPos[q * 3 + 1] = posW[src + 1]; cornerPos[q * 3 + 2] = posW[src + 2];
    }
    geo.computeBoundingSphere();
    progress(1); T.refine = performance.now();
    var timings = { bake: T.bake - T.start, field: T.field - T.bake, mc: T.mc - T.field, refine: T.refine - T.mc, verts: count, corners: triVerts };
    return { geometry: geo, positions: cornerPos, count: triVerts, timings: timings };
  }

  /**
   * The look: polished obsidian with a voice-blue glow at the mane's tips, studio light with the
   * two voice colours as rim lights. Sets up the renderer's tone mapping and the scene's lights.
   * @returns the material
   */
  function look(THREE, RoomEnvironment, renderer, scene) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
    scene.environmentIntensity = 0.42;
    function light(c, i, x, y, z) { var l = new THREE.DirectionalLight(c, i); l.position.set(x, y, z); scene.add(l); }
    light(0xe6eeff, 1.6, -3, 5, 6);   // key softbox, front-left
    light(0xffffff, 0.25, 5, 1, 5);   // fill
    light(BLUE, 9.5, -6, 3, -2.5);    // rim, back-left: the white voice
    light(CORAL, 6.5, 6, 2, -3.5);    // kicker, back-right: the black voice
    light(0xffffff, 0.7, 0, 9, 0);    // top

    var obsidian = new THREE.MeshPhysicalMaterial({
      color: 0x07080b, roughness: 0.2, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.06, specularIntensity: 1, ior: 1.55, vertexColors: true,
    });
    obsidian.onBeforeCompile = function (sh) {
      sh.uniforms.glowColor = { value: new THREE.Color(BLUE) };
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 glowColor;")
        .replace("#include <color_fragment>", "") // the colour attribute drives the glow, not the albedo
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += glowColor * pow(vColor.r, 1.6) * 1.9;");
    };
    return obsidian;
  }

  root.KnightSculpt = { build: build, look: look, HOME_YAW: HOME_YAW };
})(this);
