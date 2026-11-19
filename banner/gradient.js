// The hero's grainy gradient from dylanmendiboure.fr (src/components/gradient), ported to plain WebGL so the
// banner can be drawn at any time we choose: the pointer and the scroll are left out, the intro has played, and
// time is set by the capture script instead of the clock.

const MAX_SHAPES = 6;

const theme = {
  fg: "#131b17",
  accent: "#1d6b47",
  forest: "#0f3324",
  fern: "#2f8a5c",
  mint: "#6fd39c",
  lime: "#c9ec8f",
};

const cloth = { wind: -18, fold: 0.36, sway: 95, sheen: 0.8 };

const field = (options) => ({ rotate: 0, spin: 0, drift: 30, speed: 0.22, ...options });

function hero(width, height) {
  const m = Math.min(width, height);
  return [
    field({ x: 0.1, y: 0.92, size: [m * 1.05, m * 0.75], rotate: -14, spin: 1.2, from: ["accent"], to: ["fern", "mint", 0.35], opacity: 1, drift: m * 0.08 }),
    field({ x: 0.82, y: 0.1, size: [m * 0.95, m * 0.5], rotate: -26, spin: -1, from: ["mint"], to: ["lime"], opacity: 0.85, drift: m * 0.08, speed: 0.26 }),
    field({ x: 0.95, y: 0.88, size: [m * 0.8, m * 0.6], rotate: 24, from: ["fern"], to: ["mint"], opacity: 0.95, drift: m * 0.07, speed: 0.24 }),
    field({ x: 0.16, y: 0.16, size: [m * 0.8, m * 0.5], rotate: 32, spin: 1.5, from: ["fern", "mint", 0.4], to: ["lime"], opacity: 0.75, drift: m * 0.07, speed: 0.3 }),
    field({ x: 0.5, y: 1.0, size: [width * 0.6, m * 0.45], from: ["accent"], to: ["mint", "fern", 0.4], opacity: 0.9, drift: m * 0.07, speed: 0.18 }),
    // The veil under the name, so a fold of light never takes its contrast.
    field({ x: 0.5, y: 0.52, size: [width * 0.42, height * 0.42], from: ["fg"], to: ["forest", "fg", 0.5], opacity: 0.85, drift: 0 }),
  ];
}

const vertexShader = `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragmentShader = `
  precision highp float;
  #define MAX_SHAPES ${MAX_SHAPES}
  uniform float uTime;
  uniform float uScale;
  uniform vec2 uSize;
  uniform vec2 uWind;
  uniform float uFold;
  uniform float uSway;
  uniform float uSheen;
  uniform int uCount;
  uniform vec4 uPlace[MAX_SHAPES];
  uniform vec4 uForm[MAX_SHAPES];
  uniform vec4 uMotion[MAX_SHAPES];
  uniform vec3 uFrom[MAX_SHAPES];
  uniform vec3 uTo[MAX_SHAPES];

  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float cloth(vec2 p, float t) {
    vec2 across = vec2(-uWind.y, uWind.x);
    float u = dot(p, uWind) / uFold;
    float v = dot(p, across) / uFold;
    float bend = 1.4 * snoise(vec2(v * 0.55, t * 0.05)) + 0.7 * snoise(vec2(u * 0.4 + 3.1, v * 0.45 - t * 0.04));
    float billow = sin(u * 6.2831853 + bend) * sin(t * 0.55 + v * 1.3 + bend * 0.5);
    vec2 slant = vec2(uWind.x * 0.42 - uWind.y * 0.91, uWind.x * 0.91 + uWind.y * 0.42);
    float crossing = sin(dot(p, slant) / (uFold * 1.3) * 6.2831853 + t * 0.35 + bend * 0.6) * 0.55;
    float swell = 0.65 + 0.35 * snoise(vec2(v * 0.7 - t * 0.06, u * 0.25 + 7.0));
    float ripple = 0.2 * sin(u * 12.566 + v * 1.9 - t * 0.4 + bend);
    return (billow + crossing) * swell + ripple;
  }

  void main() {
    vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uScale;
    float t = uTime;

    float e = uFold * 0.02;
    float height = cloth(p, t);
    float slope = (cloth(p + uWind * e, t) - height) / e * uFold * 0.16;
    vec2 onCloth = p + vec2(-uWind.y, uWind.x) * height * uSway + uWind * slope * uSway * 0.3;

    vec4 colour = vec4(0.0);
    for (int n = 0; n < MAX_SHAPES; n++) {
      if (n >= uCount) break;
      float i = float(n);
      float phase = i * 2.399;
      vec4 place = uPlace[n];
      vec4 form = uForm[n];
      vec4 motion = uMotion[n];
      float drift = motion.y;
      float speed = motion.z;

      vec2 centre = place.xy + drift * vec2(sin(t * speed + phase), cos(t * speed * 0.83 + phase * 1.7));
      float turn = form.x + form.y * t;
      float breath = 1.0 + 0.08 * sin(t * speed * 1.3 + phase);
      vec2 radius = place.zw * breath;

      vec2 d = onCloth - centre;
      float c = cos(turn);
      float s = sin(turn);
      vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);

      float large = max(radius.x, radius.y);
      vec2 warp = vec2(
        snoise(q / (large * 1.2) + vec2(t * 0.08, phase)),
        snoise(q / (large * 1.2) + vec2(phase * 1.3, -t * 0.08))
      );
      q += warp * large * 0.35;

      float k = length(q / radius);
      float a = motion.x * exp(-k * k * 1.8);
      if (a <= 0.001) continue;
      float along = clamp(0.5 + q.x / (2.0 * max(radius.x, radius.y)) + 0.15 * sin(t * 0.3 + phase), 0.0, 1.0);
      vec3 tint = mix(uFrom[n], uTo[n], smoothstep(0.0, 1.0, along));
      colour = vec4(tint, 1.0) * a + colour * (1.0 - a);
    }

    float lean = clamp(slope, -1.2, 1.2);
    float sheen = pow(max(-lean, 0.0), 1.6);
    float light = clamp(1.0 - lean * uSheen * 0.3 + sheen * uSheen * 0.9, 0.78, 1.7);
    float brightest = max(max(colour.r, colour.g), max(colour.b, 0.0001));
    colour.rgb *= min(light, colour.a / brightest);
    gl_FragColor = colour;
  }
`;

const rgb = (name) => [1, 3, 5].map((index) => parseInt(theme[name].slice(index, index + 2), 16) / 255);
const tone = ([name, other, amount = 0]) => {
  const a = rgb(name);
  if (!other) return a;
  const b = rgb(other);
  return a.map((value, index) => value + (b[index] - value) * amount);
};

function surface(canvas, width, height, scale) {
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader));
  gl.linkProgram(program);
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const at = (name) => gl.getUniformLocation(program, name);
  const angle = (cloth.wind * Math.PI) / 180;
  gl.uniform1f(at("uScale"), scale);
  gl.uniform2f(at("uSize"), canvas.width, canvas.height);
  gl.uniform2f(at("uWind"), Math.cos(angle), Math.sin(angle));
  gl.uniform1f(at("uFold"), Math.max(width, height) * cloth.fold);
  gl.uniform1f(at("uSway"), cloth.sway);
  gl.uniform1f(at("uSheen"), cloth.sheen);

  const shapes = hero(width, height);
  const radians = Math.PI / 180;
  gl.uniform1i(at("uCount"), shapes.length);
  gl.uniform4fv(at("uPlace"), shapes.flatMap((s) => [s.x * width, s.y * height, s.size[0], s.size[1]]));
  gl.uniform4fv(at("uForm"), shapes.flatMap((s) => [s.rotate * radians, s.spin * radians, 0, 0]));
  gl.uniform4fv(at("uMotion"), shapes.flatMap((s) => [s.opacity, s.drift, s.speed, 0]));
  gl.uniform3fv(at("uFrom"), shapes.flatMap((s) => tone(s.from)));
  gl.uniform3fv(at("uTo"), shapes.flatMap((s) => tone(s.to)));

  const time = at("uTime");
  return (t) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(time, t);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.finish();
  };
}

let draw;

// Sizes the banner, in CSS pixels; the gradient draws at a fraction of them, as on the site, since it is soft.
window.setup = (width, height, { scale = 0.5, fontSize } = {}) => {
  const stage = document.getElementById("stage");
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  document.querySelector("h1").style.fontSize = `${fontSize}px`;
  draw = surface(document.getElementById("gradient"), width, height, scale);
  return document.fonts.ready.then(() => true);
};

// Draws the gradient at time t, in seconds.
window.frame = (t) => draw(t);
