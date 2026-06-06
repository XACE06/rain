// Rain effect ported from "Heartfelt" by Martijn Steinrucken aka BigWings, 2017.
// License: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported.
// The surrounding editor UI, upload handling, and background channel wiring are adapted for this project.

const canvas = document.querySelector("#rain-canvas");
const gl =
  canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false }) ||
  canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
const isWebGL2 = gl instanceof WebGL2RenderingContext;

if (!gl) {
  document.body.innerHTML = "<p class='fallback'>这个页面需要 WebGL 支持。</p>";
  throw new Error("WebGL is not supported in this browser.");
}

const vertexShaderSource = isWebGL2
  ? `#version 300 es
in vec2 aPosition;
out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`
  : `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentShaderSource = isWebGL2
  ? `#version 300 es
precision highp float;
precision highp sampler2D;

uniform vec2 uResolution;
uniform vec2 uMediaResolution;
uniform float uTime;
uniform float uRain;
uniform float uFog;
uniform float uRefraction;
uniform float uLightning;
uniform vec2 uMouse;
uniform float uPointerStrength;
uniform float uMouseRadius;
uniform float uHasMedia;
uniform sampler2D uMedia;

in vec2 vUv;
out vec4 fragColor;

float S(float a, float b, float t) {
  float x = clamp((t - a) / (b - a), 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

vec3 N13(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}

float N(float t) {
  return fract(sin(t * 12345.564) * 7658.76);
}

float Saw(float b, float t) {
  return S(0.0, b, t) * S(1.0, b, t);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = N(dot(i, vec2(127.1, 311.7)));
  float b = N(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7)));
  float c = N(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7)));
  float d = N(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.62, -1.18, 1.18, 1.62) * p + 19.1;
    a *= 0.5;
  }
  return v;
}

vec3 fluidBackground(vec2 uv) {
  float t = uTime * 0.075;
  float n1 = fbm(uv * 2.2 + vec2(t, -t * 0.7));
  float n2 = fbm(uv * 3.6 - vec2(t * 1.4, t * 0.8) + n1);
  vec3 a = vec3(0.045, 0.08, 0.16);
  vec3 b = vec3(0.65, 0.2, 0.46);
  vec3 c = vec3(0.05, 0.38, 0.55);
  float wave = smoothstep(0.12, 0.92, n1 + 0.28 * sin((uv.x + uv.y + n2) * 6.283));
  vec3 col = mix(a, b, wave);
  col = mix(col, c, smoothstep(0.35, 0.85, n2) * 0.7);
  return col + 0.12 * pow(max(0.0, 1.0 - distance(uv, vec2(0.58, 0.46))), 2.0);
}

vec2 coverUv(vec2 uv) {
  vec2 media = max(uMediaResolution, vec2(1.0));
  float screenAspect = uResolution.x / uResolution.y;
  float mediaAspect = media.x / media.y;
  vec2 p = uv - 0.5;
  if (mediaAspect > screenAspect) {
    p.x *= screenAspect / mediaAspect;
  } else {
    p.y *= mediaAspect / screenAspect;
  }
  return p + 0.5;
}

vec3 sampleChannel0(vec2 uv, float lod) {
  vec2 safeUv = clamp(uv, 0.001, 0.999);
  vec3 generated = fluidBackground(safeUv);
  vec2 mediaUv = clamp(coverUv(safeUv), 0.001, 0.999);
  vec3 media = textureLod(uMedia, mediaUv, lod).rgb;
  return mix(generated, media, uHasMedia);
}

vec2 DropLayer2(vec2 uv, float t) {
  vec2 UV = uv;

  uv.y += t * 0.75;
  vec2 a = vec2(6.0, 1.0);
  vec2 grid = a * 2.0;
  vec2 id = floor(uv * grid);

  float colShift = N(id.x);
  uv.y += colShift;

  id = floor(uv * grid);
  vec3 n = N13(id.x * 35.2 + id.y * 2376.1);
  vec2 st = fract(uv * grid) - vec2(0.5, 0.0);

  float x = n.x - 0.5;

  float y = UV.y * 20.0;
  float wiggle = sin(y + sin(y));
  x += wiggle * (0.5 - abs(x)) * (n.z - 0.5);
  x *= 0.7;
  float ti = fract(t + n.z);
  y = (Saw(0.85, ti) - 0.5) * 0.9 + 0.5;
  vec2 p = vec2(x, y);

  float d = length((st - p) * a.yx);
  float mainDrop = S(0.4, 0.0, d);

  float r = sqrt(S(1.0, y, st.y));
  float cd = abs(st.x - x);
  float trail = S(0.23 * r, 0.15 * r * r, cd);
  float trailFront = S(-0.02, 0.02, st.y - y);
  trail *= trailFront * r * r;

  y = UV.y;
  float trail2 = S(0.2 * r, 0.0, cd);
  float droplets = max(0.0, (sin(y * (1.0 - y) * 120.0) - st.y)) * trail2 * trailFront * n.z;
  y = fract(y * 10.0) + (st.y - 0.5);
  float dd = length(st - vec2(x, y));
  droplets = S(0.3, 0.0, dd);
  float m = mainDrop + droplets * r * trailFront;

  return vec2(m, trail);
}

float StaticDrops(vec2 uv, float t) {
  uv *= 40.0;

  vec2 id = floor(uv);
  uv = fract(uv) - 0.5;
  vec3 n = N13(id.x * 107.45 + id.y * 3543.654);
  vec2 p = (n.xy - 0.5) * 0.7;
  float d = length(uv - p);

  float fade = Saw(0.025, fract(t + n.z));
  float c = S(0.3, 0.0, d) * fract(n.z * 10.0) * fade;
  return c;
}

vec2 Drops(vec2 uv, float t, float l0, float l1, float l2) {
  float s = StaticDrops(uv, t) * l0;
  vec2 m1 = DropLayer2(uv, t) * l1;
  vec2 m2 = DropLayer2(uv * 1.85, t) * l2;

  float c = s + m1.x + m2.x;
  c = S(0.3, 1.0, c);

  return vec2(c, max(m1.y * l0, m2.y * l1));
}

void main() {
  vec2 fragCoord = vUv * uResolution;
  vec2 uv = (fragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
  vec2 rawUV = fragCoord.xy / uResolution.xy;
  vec2 UV = rawUV;
  float aspect = uResolution.x / uResolution.y;
  float T = uTime;
  float t = T * 0.2;

  float rainAmount = clamp(uRain, 0.0, 1.0);
  float maxBlur = mix(3.0, 6.0, rainAmount) * mix(0.55, 1.45, uFog);
  float minBlur = mix(0.65, 2.0, uFog);
  uv *= 0.88;
  UV = (UV - 0.5) * 0.96 + 0.5;

  float staticDrops = S(-0.5, 1.0, rainAmount) * 2.0;
  float layer1 = S(0.25, 0.75, rainAmount);
  float layer2 = S(0.0, 0.5, rainAmount);

  vec2 pointerDelta = (rawUV - uMouse) * vec2(aspect, 1.0);
  float pointerDist = length(pointerDelta);
  float radius = uMouseRadius / uResolution.y;
  vec2 radial = normalize(pointerDelta + 0.00001);
  float side = sign(pointerDelta.x + 0.0001);
  vec2 tangent = normalize(vec2(radial.y * side, -max(0.22, abs(radial.x))));
  float nearField = (1.0 - smoothstep(radius, radius * 2.05, pointerDist)) * uPointerStrength;
  float penetration = max(radius - pointerDist, 0.0);
  float boundary = (1.0 - smoothstep(radius * 0.08, radius * 0.55, abs(pointerDist - radius))) * uPointerStrength;
  vec2 avoidVelocity = radial * (penetration + nearField * radius * 0.42);
  avoidVelocity += tangent * boundary * radius * 0.96;
  avoidVelocity += vec2(0.0, -boundary * radius * 0.22);
  vec2 flow = avoidVelocity / vec2(aspect, 1.0);
  vec2 c = Drops(uv - flow, t, staticDrops, layer1, layer2);
  vec2 e = vec2(0.001, 0.0);
  float cx = Drops(uv - flow + e, t, staticDrops, layer1, layer2).x;
  float cy = Drops(uv - flow + e.yx, t, staticDrops, layer1, layer2).x;
  vec2 n = vec2(cx - c.x, cy - c.x) * mix(0.45, 1.45, uRefraction);
  n += (radial / vec2(aspect, 1.0)) * boundary * 0.004 * mix(0.65, 1.35, uRefraction);

  float focus = clamp(mix(maxBlur - c.y, minBlur, S(0.1, 0.2, c.x)), 0.0, 8.0);
  vec3 col = sampleChannel0(UV + n, focus);

  t = (T + 3.0) * 0.5;
  float colFade = sin(t * 0.2) * 0.5 + 0.5;
  col *= mix(vec3(1.0), vec3(0.8, 0.9, 1.3), colFade);
  col *= 1.0 + uLightning * 1.65;
  col += vec3(0.08, 0.12, 0.22) * uLightning;
  vec2 vignetteUv = UV - 0.5;
  col *= 1.0 - dot(vignetteUv, vignetteUv);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
  : `
precision highp float;

uniform vec2 uResolution;
uniform vec2 uMediaResolution;
uniform float uTime;
uniform float uRain;
uniform float uFog;
uniform float uRefraction;
uniform float uLightning;
uniform vec2 uMouse;
uniform float uPointerStrength;
uniform float uMouseRadius;
uniform float uHasMedia;
uniform sampler2D uMedia;

varying vec2 vUv;

float S(float a, float b, float t) {
  float x = clamp((t - a) / (b - a), 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

vec3 N13(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}

float N(float t) {
  return fract(sin(t * 12345.564) * 7658.76);
}

float Saw(float b, float t) {
  return S(0.0, b, t) * S(1.0, b, t);
}

vec2 coverUv(vec2 uv) {
  vec2 media = max(uMediaResolution, vec2(1.0));
  float screenAspect = uResolution.x / uResolution.y;
  float mediaAspect = media.x / media.y;
  vec2 p = uv - 0.5;
  if (mediaAspect > screenAspect) {
    p.x *= screenAspect / mediaAspect;
  } else {
    p.y *= mediaAspect / screenAspect;
  }
  return p + 0.5;
}

vec3 sampleChannel0(vec2 uv, float blur) {
  vec2 mediaUv = clamp(coverUv(clamp(uv, 0.001, 0.999)), 0.001, 0.999);
  vec2 px = blur / max(uResolution, vec2(1.0));
  vec3 col = texture2D(uMedia, mediaUv).rgb;
  col += texture2D(uMedia, mediaUv + px * vec2(1.0, 0.0)).rgb;
  col += texture2D(uMedia, mediaUv + px * vec2(-1.0, 0.0)).rgb;
  col += texture2D(uMedia, mediaUv + px * vec2(0.0, 1.0)).rgb;
  col += texture2D(uMedia, mediaUv + px * vec2(0.0, -1.0)).rgb;
  return col / 5.0;
}

vec2 DropLayer2(vec2 uv, float t) {
  vec2 UV = uv;
  uv.y += t * 0.75;
  vec2 a = vec2(6.0, 1.0);
  vec2 grid = a * 2.0;
  vec2 id = floor(uv * grid);
  float colShift = N(id.x);
  uv.y += colShift;
  id = floor(uv * grid);
  vec3 n = N13(id.x * 35.2 + id.y * 2376.1);
  vec2 st = fract(uv * grid) - vec2(0.5, 0.0);
  float x = n.x - 0.5;
  float y = UV.y * 20.0;
  float wiggle = sin(y + sin(y));
  x += wiggle * (0.5 - abs(x)) * (n.z - 0.5);
  x *= 0.7;
  float ti = fract(t + n.z);
  y = (Saw(0.85, ti) - 0.5) * 0.9 + 0.5;
  vec2 p = vec2(x, y);
  float d = length((st - p) * a.yx);
  float mainDrop = S(0.4, 0.0, d);
  float r = sqrt(S(1.0, y, st.y));
  float cd = abs(st.x - x);
  float trail = S(0.23 * r, 0.15 * r * r, cd);
  float trailFront = S(-0.02, 0.02, st.y - y);
  trail *= trailFront * r * r;
  y = UV.y;
  float trail2 = S(0.2 * r, 0.0, cd);
  float droplets = max(0.0, (sin(y * (1.0 - y) * 120.0) - st.y)) * trail2 * trailFront * n.z;
  y = fract(y * 10.0) + (st.y - 0.5);
  float dd = length(st - vec2(x, y));
  droplets = S(0.3, 0.0, dd);
  float m = mainDrop + droplets * r * trailFront;
  return vec2(m, trail);
}

float StaticDrops(vec2 uv, float t) {
  uv *= 40.0;
  vec2 id = floor(uv);
  uv = fract(uv) - 0.5;
  vec3 n = N13(id.x * 107.45 + id.y * 3543.654);
  vec2 p = (n.xy - 0.5) * 0.7;
  float d = length(uv - p);
  float fade = Saw(0.025, fract(t + n.z));
  return S(0.3, 0.0, d) * fract(n.z * 10.0) * fade;
}

vec2 Drops(vec2 uv, float t, float l0, float l1, float l2) {
  float s = StaticDrops(uv, t) * l0;
  vec2 m1 = DropLayer2(uv, t) * l1;
  vec2 m2 = DropLayer2(uv * 1.85, t) * l2;
  float c = S(0.3, 1.0, s + m1.x + m2.x);
  return vec2(c, max(m1.y * l0, m2.y * l1));
}

void main() {
  vec2 fragCoord = vUv * uResolution;
  vec2 uv = (fragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
  vec2 rawUV = fragCoord.xy / uResolution.xy;
  vec2 UV = rawUV;
  float aspect = uResolution.x / uResolution.y;
  float T = uTime;
  float t = T * 0.2;
  float rainAmount = clamp(uRain, 0.0, 1.0);
  float maxBlur = mix(3.0, 6.0, rainAmount) * mix(0.55, 1.45, uFog);
  float minBlur = mix(0.65, 2.0, uFog);
  uv *= 0.88;
  UV = (UV - 0.5) * 0.96 + 0.5;
  float staticDrops = S(-0.5, 1.0, rainAmount) * 2.0;
  float layer1 = S(0.25, 0.75, rainAmount);
  float layer2 = S(0.0, 0.5, rainAmount);
  vec2 pointerDelta = (rawUV - uMouse) * vec2(aspect, 1.0);
  float pointerDist = length(pointerDelta);
  float radius = uMouseRadius / uResolution.y;
  vec2 radial = normalize(pointerDelta + 0.00001);
  float side = sign(pointerDelta.x + 0.0001);
  vec2 tangent = normalize(vec2(radial.y * side, -max(0.22, abs(radial.x))));
  float nearField = (1.0 - smoothstep(radius, radius * 2.05, pointerDist)) * uPointerStrength;
  float penetration = max(radius - pointerDist, 0.0);
  float boundary = (1.0 - smoothstep(radius * 0.08, radius * 0.55, abs(pointerDist - radius))) * uPointerStrength;
  vec2 avoidVelocity = radial * (penetration + nearField * radius * 0.42);
  avoidVelocity += tangent * boundary * radius * 0.96;
  avoidVelocity += vec2(0.0, -boundary * radius * 0.22);
  vec2 flow = avoidVelocity / vec2(aspect, 1.0);
  vec2 c = Drops(uv - flow, t, staticDrops, layer1, layer2);
  vec2 e = vec2(0.001, 0.0);
  float cx = Drops(uv - flow + e, t, staticDrops, layer1, layer2).x;
  float cy = Drops(uv - flow + e.yx, t, staticDrops, layer1, layer2).x;
  vec2 n = vec2(cx - c.x, cy - c.x) * mix(0.45, 1.45, uRefraction);
  n += (radial / vec2(aspect, 1.0)) * boundary * 0.004 * mix(0.65, 1.35, uRefraction);
  float focus = clamp(mix(maxBlur - c.y, minBlur, S(0.1, 0.2, c.x)), 0.0, 8.0);
  vec3 col = sampleChannel0(UV + n, focus);
  t = (T + 3.0) * 0.5;
  float colFade = sin(t * 0.2) * 0.5 + 0.5;
  col *= mix(vec3(1.0), vec3(0.8, 0.9, 1.3), colFade);
  col *= 1.0 + uLightning * 1.65;
  col += vec3(0.08, 0.12, 0.22) * uLightning;
  vec2 vignetteUv = UV - 0.5;
  col *= 1.0 - dot(vignetteUv, vignetteUv);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const createShader = (type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
};

const createProgram = () => {
  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexShaderSource));
  gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
};

let program;
try {
  program = createProgram();
} catch (error) {
  const message = document.createElement("pre");
  message.className = "shader-error";
  message.textContent = `Shader 编译失败\n\n${error.message}`;
  document.body.appendChild(message);
  throw error;
}
gl.useProgram(program);

const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

const aPosition = gl.getAttribLocation(program, "aPosition");
gl.enableVertexAttribArray(aPosition);
gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

const uniforms = {
  resolution: gl.getUniformLocation(program, "uResolution"),
  mediaResolution: gl.getUniformLocation(program, "uMediaResolution"),
  time: gl.getUniformLocation(program, "uTime"),
  rain: gl.getUniformLocation(program, "uRain"),
  fog: gl.getUniformLocation(program, "uFog"),
  refraction: gl.getUniformLocation(program, "uRefraction"),
  lightning: gl.getUniformLocation(program, "uLightning"),
  mouse: gl.getUniformLocation(program, "uMouse"),
  pointerStrength: gl.getUniformLocation(program, "uPointerStrength"),
  mouseRadius: gl.getUniformLocation(program, "uMouseRadius"),
  hasMedia: gl.getUniformLocation(program, "uHasMedia"),
  media: gl.getUniformLocation(program, "uMedia"),
};

const texture = gl.createTexture();
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, isWebGL2 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([8, 13, 20, 255]));
if (isWebGL2) gl.generateMipmap(gl.TEXTURE_2D);
gl.uniform1i(uniforms.media, 0);

const state = {
  rain: 0.72,
  fog: 0.68,
  refraction: 0.68,
  volume: 0.42,
  rainVolume: 0.86,
  thunderVolume: 0.46,
  lightningIntensity: 0.55,
  lightningFrequency: 0.32,
  thunderDelay: 0.38,
  lightning: 0,
  nextLightningAt: 2.5,
  lightningStartedAt: -99,
  pendingThunderAt: null,
  mouseX: 0.5,
  mouseY: 0.5,
  pointerStrength: 0,
  mouseRadius: 72,
  hasMedia: 0,
  mediaWidth: 1,
  mediaHeight: 1,
  mediaElement: null,
  objectUrl: null,
};

const audioState = {
  rain: null,
  thunder: null,
  enabled: false,
};

const uiState = {
  language: "zh",
};

const translations = {
  zh: {
    panelTitle: "Rain Glass",
    uploadBackground: "上传背景",
    sectionVisual: "画面",
    sectionAudio: "声音",
    sectionLightning: "雷电",
    sectionInteraction: "交互",
    rainAmount: "雨势",
    fog: "雾气",
    refraction: "折射率",
    masterVolume: "总音量",
    rainVolume: "雨声音量",
    thunderVolume: "雷声音量",
    lightningIntensity: "雷光强度",
    lightningFrequency: "雷电频率",
    thunderDelay: "雷声延迟",
    mouseRadius: "鼠标避让半径",
    soundOn: "关闭雨声",
    soundOff: "开启雨声",
    languageToggle: "E",
  },
  en: {
    panelTitle: "RAIN GLASS",
    uploadBackground: "UPLOAD BACKGROUND",
    sectionVisual: "VISUAL",
    sectionAudio: "AUDIO",
    sectionLightning: "LIGHTNING",
    sectionInteraction: "INTERACTION",
    rainAmount: "RAIN AMOUNT",
    fog: "FOG",
    refraction: "REFRACTION",
    masterVolume: "MASTER VOLUME",
    rainVolume: "RAIN VOLUME",
    thunderVolume: "THUNDER VOLUME",
    lightningIntensity: "LIGHTNING INTENSITY",
    lightningFrequency: "LIGHTNING FREQUENCY",
    thunderDelay: "THUNDER DELAY",
    mouseRadius: "MOUSE AVOIDANCE RADIUS",
    soundOn: "DISABLE RAIN SOUND",
    soundOff: "ENABLE RAIN SOUND",
    languageToggle: "中文",
  },
};

const createRainAudio = () => {
  if (audioState.rain && audioState.thunder) return;

  const rain = new Audio("./assets/audio/heavy-rain-ambience.mp3");
  rain.loop = true;
  rain.autoplay = true;
  rain.preload = "auto";
  rain.volume = 0;

  const thunder = new Audio("./assets/audio/thunderstorm-rain.mp3");
  thunder.loop = false;
  thunder.preload = "auto";
  thunder.volume = 0;

  audioState.rain = rain;
  audioState.thunder = thunder;
};

const updateAudioMix = () => {
  if (!audioState.rain || !audioState.thunder) return;
  const master = audioState.enabled ? state.volume : 0;
  audioState.rain.volume = Math.min(1, master * state.rainVolume * (0.62 + state.rain * 0.38));
  audioState.thunder.volume = Math.min(1, master * state.thunderVolume * (0.72 + state.rain * 0.28));
};

const setAudioEnabled = async (enabled) => {
  createRainAudio();
  if (enabled) {
    await audioState.rain.play();
  } else {
    audioState.rain.pause();
    audioState.thunder.pause();
  }
  audioState.enabled = enabled;
  updateAudioMix();
};

const attemptAudioAutoplay = async () => {
  try {
    await setAudioEnabled(true);
    soundToggle.setAttribute("aria-pressed", "true");
    updateSoundToggleText();
  } catch (error) {
    audioState.enabled = false;
    soundToggle.setAttribute("aria-pressed", "false");
    updateSoundToggleText();
    console.info("Audio autoplay was blocked by the browser. Use the sound toggle to start playback.", error);
  }
};

const playThunderHit = () => {
  if (!audioState.enabled || !audioState.thunder) return;
  audioState.thunder.pause();
  audioState.thunder.currentTime = 0;
  updateAudioMix();
  audioState.thunder.play().catch(() => {});
};

const scheduleNextLightning = (now) => {
  if (state.lightningFrequency <= 0.01) {
    state.nextLightningAt = now + 999;
    return;
  }
  const baseInterval = 24 - state.lightningFrequency * 18;
  const jitter = 2 + Math.random() * (8 - state.lightningFrequency * 4);
  state.nextLightningAt = now + baseInterval + jitter;
};

const updateLightningSync = (now) => {
  if (now >= state.nextLightningAt) {
    state.lightningStartedAt = now;
    state.pendingThunderAt = now + state.thunderDelay;
    scheduleNextLightning(now);
  }

  if (state.pendingThunderAt !== null && now >= state.pendingThunderAt) {
    playThunderHit();
    state.pendingThunderAt = null;
  }

  const dt = now - state.lightningStartedAt;
  if (dt < 0 || dt > 1.4 || state.lightningIntensity <= 0) {
    state.lightning = 0;
    return;
  }

  const firstStrike = Math.exp(-dt * 7.5);
  const afterFlash = Math.exp(-Math.max(0, dt - 0.16) * 4.1) * smoothStep(0.04, 0.16, dt);
  const flicker = 0.78 + 0.22 * Math.sin(dt * 92) * Math.sin(dt * 37);
  state.lightning = Math.max(0, (firstStrike + afterFlash * 0.42) * flicker * state.lightningIntensity);
};

const smoothStep = (edge0, edge1, value) => {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
};

const resize = () => {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }
};

const updateTexture = () => {
  if (!state.mediaElement) return;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.mediaElement);
  if (isWebGL2) gl.generateMipmap(gl.TEXTURE_2D);
};

const createDefaultTexture = () => {
  const fallback = document.createElement("canvas");
  fallback.width = 1024;
  fallback.height = 576;
  const ctx = fallback.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, fallback.width, fallback.height);
  sky.addColorStop(0, "#172d62");
  sky.addColorStop(0.44, "#455f9c");
  sky.addColorStop(1, "#11182f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, fallback.width, fallback.height);

  const glow = ctx.createRadialGradient(760, 190, 20, 760, 190, 520);
  glow.addColorStop(0, "rgba(255, 190, 126, 0.32)");
  glow.addColorStop(0.38, "rgba(98, 136, 213, 0.18)");
  glow.addColorStop(1, "rgba(8, 14, 28, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, fallback.width, fallback.height);

  ctx.fillStyle = "rgba(9, 13, 27, 0.58)";
  ctx.beginPath();
  ctx.moveTo(0, 390);
  ctx.lineTo(190, 300);
  ctx.lineTo(360, 355);
  ctx.lineTo(560, 270);
  ctx.lineTo(760, 335);
  ctx.lineTo(1024, 250);
  ctx.lineTo(1024, 576);
  ctx.lineTo(0, 576);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 90; i++) {
    const x = Math.random() * fallback.width;
    const y = Math.random() * 260;
    ctx.fillStyle = `rgba(235, 244, 255, ${0.2 + Math.random() * 0.55})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  state.mediaWidth = fallback.width;
  state.mediaHeight = fallback.height;
  state.mediaElement = fallback;
  state.hasMedia = 1;
  updateTexture();
};

const render = (now) => {
  const seconds = now * 0.001;
  resize();
  if (state.mediaElement instanceof HTMLVideoElement && state.mediaElement.readyState >= 2) {
    updateTexture();
  }

  gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  gl.uniform2f(uniforms.mediaResolution, state.mediaWidth, state.mediaHeight);
  updateLightningSync(seconds);

  gl.uniform1f(uniforms.time, seconds);
  gl.uniform1f(uniforms.rain, state.rain);
  gl.uniform1f(uniforms.fog, state.fog);
  gl.uniform1f(uniforms.refraction, state.refraction);
  gl.uniform1f(uniforms.lightning, state.lightning);
  gl.uniform2f(uniforms.mouse, state.mouseX, state.mouseY);
  gl.uniform1f(uniforms.pointerStrength, state.pointerStrength);
  gl.uniform1f(uniforms.mouseRadius, state.mouseRadius);
  gl.uniform1f(uniforms.hasMedia, state.hasMedia);
  updateAudioMix();
  state.pointerStrength *= 0.94;
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(render);
};

const applyImageElement = (image) => {
  state.mediaWidth = image.naturalWidth || image.width || 1;
  state.mediaHeight = image.naturalHeight || image.height || 1;
  state.mediaElement = image;
  state.hasMedia = 1;
  updateTexture();
};

const setMedia = (file) => {
  if (!file) return;
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);

  if (file.type.startsWith("video/")) {
    const video = document.createElement("video");
    video.src = state.objectUrl;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("loadedmetadata", () => {
      state.mediaWidth = video.videoWidth || 1;
      state.mediaHeight = video.videoHeight || 1;
      state.mediaElement = video;
      state.hasMedia = 1;
      video.play().catch(() => {});
    });
    return;
  }

  const image = new Image();
  image.onload = () => applyImageElement(image);
  image.src = state.objectUrl;
};

const loadDefaultBackground = () => {
  const image = new Image();
  image.onload = () => applyImageElement(image);
  image.onerror = () => {
    state.hasMedia = 1;
  };
  image.src = "./%E5%A3%81%E7%BA%B8.png";
};

document.querySelector("#media-input").addEventListener("change", (event) => {
  setMedia(event.target.files[0]);
});

const bindRange = (selector, key) => {
  const input = document.querySelector(selector);
  input.value = String(state[key]);
  input.addEventListener("input", () => {
    state[key] = Number(input.value);
    if (key === "lightningFrequency" && state[key] > 0.01) {
      const now = performance.now() * 0.001;
      state.nextLightningAt = Math.min(state.nextLightningAt, now + 1.4);
    }
  });
};

bindRange("#rain-control", "rain");
bindRange("#fog-control", "fog");
bindRange("#refraction-control", "refraction");
bindRange("#volume-control", "volume");
bindRange("#rain-volume-control", "rainVolume");
bindRange("#thunder-volume-control", "thunderVolume");
bindRange("#lightning-intensity-control", "lightningIntensity");
bindRange("#lightning-frequency-control", "lightningFrequency");
bindRange("#thunder-delay-control", "thunderDelay");
bindRange("#mouse-radius-control", "mouseRadius");

const panel = document.querySelector("#control-panel");
const panelToggle = document.querySelector("#panel-toggle");
panelToggle.addEventListener("click", () => {
  const isOpen = panel.classList.toggle("is-open");
  panelToggle.classList.toggle("is-open", isOpen);
  panelToggle.setAttribute("aria-expanded", String(isOpen));
});

const soundToggle = document.querySelector("#sound-toggle");
const languageToggle = document.querySelector("#language-toggle");

const updateSoundToggleText = () => {
  const copy = translations[uiState.language];
  soundToggle.textContent = audioState.enabled ? copy.soundOn : copy.soundOff;
};

const applyLanguage = () => {
  const copy = translations[uiState.language];
  document.documentElement.lang = uiState.language === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = copy[element.dataset.i18n];
  });
  languageToggle.textContent = copy.languageToggle;
  updateSoundToggleText();
};

languageToggle.addEventListener("click", () => {
  uiState.language = uiState.language === "zh" ? "en" : "zh";
  applyLanguage();
});

const updatePointer = (clientX, clientY) => {
  const rect = canvas.getBoundingClientRect();
  state.mouseX = (clientX - rect.left) / Math.max(1, rect.width);
  state.mouseY = 1 - (clientY - rect.top) / Math.max(1, rect.height);
  state.pointerStrength = 1;
};

window.addEventListener("pointermove", (event) => {
  updatePointer(event.clientX, event.clientY);
});

window.addEventListener("pointerleave", () => {
  state.pointerStrength = 0;
});

soundToggle.addEventListener("click", async () => {
  try {
    await setAudioEnabled(!audioState.enabled);
    soundToggle.setAttribute("aria-pressed", String(audioState.enabled));
    updateSoundToggleText();
  } catch (error) {
    audioState.enabled = false;
    soundToggle.setAttribute("aria-pressed", "false");
    updateSoundToggleText();
    console.warn("Audio playback was blocked by the browser.", error);
  }
});

window.addEventListener("resize", resize);
applyLanguage();
createDefaultTexture();
loadDefaultBackground();
requestAnimationFrame(render);
attemptAudioAutoplay();
