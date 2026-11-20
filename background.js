// Animated "glass fold" background (WebGL), tinted to the app theme.
// Shader adapted from GlassFold in GradFlow (https://gradflow.meerbahadin.dev).
// Plain script, no dependencies. Exposes window.ChessBackground.setTension(0..1):
// tense moments speed the folds up and warm their lit edges from cyan to amber.
(function (root) {
  var THEME = {
    body: "#123a52", // glass panes: deep teal-navy, under the cyan edges
    bg: "#0e0f13", // page background (--bg)
    calm: "#5fb8e6", // lit edges when calm: a dimmer --white-voice
    tense: "#ffb347", // lit edges at full tension: --tension
    noise: 0.1,
    scale: 0.9,
    baseSpeed: 0.18,
    tensionSpeed: 0.55,
    resolution: 0.6, // render below CSS-pixel size; the glass is soft, and it keeps the GPU cool
  };

  var VERTEX = [
    "attribute vec2 position;",
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = position * 0.5 + 0.5;",
    "  gl_Position = vec4(position, 0.0, 1.0);",
    "}",
  ].join("\n");

  var FRAGMENT = [
    "precision highp float;",
    "uniform float u_time;",
    "uniform vec3 u_color1;",
    "uniform vec3 u_color2;",
    "uniform vec3 u_color3;",
    "uniform float u_scale;",
    "uniform float u_noise;",
    "uniform vec2 u_resolution;",
    "varying vec2 vUv;",
    "float grain(vec2 st) { return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453); }",
    "vec2 centered(vec2 uv) {",
    "  vec2 p = uv - 0.5;",
    "  p.x *= u_resolution.x / max(u_resolution.y, 1.0);",
    "  return p;",
    "}",
    "mat2 rot(float a) { float s = sin(a); float c = cos(a); return mat2(c, -s, s, c); }",
    // Panes of glass folded over each other; each has a lit crease that fades behind it,
    // and panes screen-blend so overlaps brighten.
    "vec3 shade(vec2 uv, float time) {",
    "  vec2 q = rot(0.6) * centered(uv) * 2.0 * u_scale;",
    "  float t = time * 0.6;",
    "  float pixel = 2.0 * u_scale / max(u_resolution.y, 1.0);",
    "  vec3 color = mix(u_color2, u_color2 * 0.45, clamp(length(centered(uv)) * 1.3, 0.0, 1.0));",
    "  for (int i = 0; i < 6; i++) {",
    "    float fi = float(i);",
    "    float bend = mod(fi, 2.0) * 2.0 - 1.0;",
    "    float crease = (fi - 2.5) * 0.4",
    "      + 0.26 * sin(q.x * (1.05 + 0.12 * fi) + fi * 1.9 + t * (0.25 + 0.05 * fi))",
    "      + 0.1 * bend * q.x * q.x;",
    "    float s = q.y - crease;",
    "    float pane = smoothstep(-pixel, pixel, s);",
    "    float back = max(s, 0.0);",
    "    float body = exp(-back * 1.7);",
    "    float fresnel = exp(-back * 8.0);",
    "    float rim = exp(-back * 80.0);",
    "    float inner = exp(-pow((back - 0.045) / 0.014, 2.0));",
    "    float bloom = exp(-abs(s) * 20.0);",
    "    vec3 tint = mix(u_color1, u_color3, clamp(fresnel * 0.6 + 0.08 + 0.14 * sin(fi * 2.1 + q.x * 0.8 + t * 0.2), 0.0, 1.0));",
    "    vec3 light = tint * pane * (body * 0.42 + fresnel * 0.4)",
    "      + u_color3 * (pane * (rim * 0.6 + inner * 0.12) + bloom * 0.1);",
    "    color += light * (1.0 - color);",
    "  }",
    "  return clamp(color, 0.0, 1.0);",
    "}",
    "void main() {",
    "  vec3 color = shade(vUv, u_time);",
    "  if (u_noise > 0.001) {",
    "    float g = grain(vUv * 200.0 + u_time * 0.1);",
    "    color *= 1.0 - u_noise * 0.4 + u_noise * g * 0.4;",
    "  }",
    "  gl_FragColor = vec4(color, 1.0);",
    "}",
  ].join("\n");

  function hexToVec3(hex) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  var api = { setTension: function () {} };
  root.ChessBackground = api;

  function start() {
    var canvas = document.getElementById("bg-glass");
    if (!canvas) return;
    var gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) { canvas.remove(); return; } // the CSS gradient behind it stays as the fallback

    function compile(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    }
    var program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { canvas.remove(); return; }
    gl.useProgram(program);

    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    var position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    var u = {};
    ["u_time", "u_color1", "u_color2", "u_color3", "u_scale", "u_noise", "u_resolution"].forEach(function (name) {
      u[name] = gl.getUniformLocation(program, name);
    });
    gl.uniform3fv(u.u_color1, hexToVec3(THEME.body));
    gl.uniform3fv(u.u_color2, hexToVec3(THEME.bg));
    gl.uniform1f(u.u_scale, THEME.scale);
    gl.uniform1f(u.u_noise, THEME.noise);
    var calm = hexToVec3(THEME.calm), tense = hexToVec3(THEME.tense);

    function resize() {
      var k = Math.min(window.devicePixelRatio || 1, 2) * THEME.resolution;
      var w = Math.max(1, Math.round(canvas.clientWidth * k));
      var h = Math.max(1, Math.round(canvas.clientHeight * k));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
    }

    var target = 0, tension = 0; // tension eases towards target so colour shifts glide
    var elapsed = 0, last = null, frame = 0;

    function draw(now) {
      var dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      tension += (target - tension) * Math.min(1, dt * 1.5);
      // accumulate speed over time, so a speed change never makes the pattern jump
      elapsed += dt * (THEME.baseSpeed + THEME.tensionSpeed * tension);
      resize();
      gl.uniform1f(u.u_time, elapsed);
      gl.uniform3fv(u.u_color3, mix(calm, tense, tension));
      gl.uniform2f(u.u_resolution, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function loop(now) {
      draw(now);
      if (!still) frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);

    // With motion off there's no loop: repaint the still frame on resize or a tension change.
    new ResizeObserver(function () { if (still) draw(performance.now()); }).observe(canvas);
    api.setTension = function (t) {
      target = Math.max(0, Math.min(1, +t || 0));
      if (still) { tension = target; draw(performance.now()); }
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(this);
