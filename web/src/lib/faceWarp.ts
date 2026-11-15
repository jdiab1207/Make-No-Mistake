import { auraColorRgb, cloudHeadBounds, type PersonMask, type AuraMode } from "./fireAura";

export type FacePreset = "original" | "mog" | "not-mog";
export type Point = { x: number; y: number };
export type Warp = { center: Point; radius: Point; move: Point; bulge: number };

/** Image-space inverse warps. Positive bulge magnifies; move displaces a feature. */
export function buildFaceWarps(points: Point[], preset: FacePreset): Warp[] {
  if (preset === "original" || points.length < 455) return [];
  const left = points[234], right = points[454];
  const top = points[10], chin = points[152];
  const width = Math.hypot(right.x - left.x, right.y - left.y);
  const height = Math.hypot(chin.x - top.x, chin.y - top.y);
  if (width < 0.01 || height < 0.01) return [];
  const horizontal = { x: right.x - left.x, y: right.y - left.y };
  const vertical = { x: chin.x - top.x, y: chin.y - top.y };
  const warp = (index: number, rx: number, ry: number, dx = 0, dy = 0, bulge = 0): Warp => ({
    center: points[index],
    radius: { x: width * rx, y: height * ry },
    move: { x: horizontal.x * dx + vertical.x * dy, y: horizontal.y * dx + vertical.y * dy },
    bulge,
  });
  // Outer corners move along the face's vertical axis, so tilt follows head roll.
  // Limit the influence to less than an eye width to leave inner corners anchored.
  const eyeTilt = preset === "mog" ? -0.028 : 0.032;
  const eyes = [[33, 133], [263, 362]].map(([outer, inner]) => {
    const eyeWidth = Math.hypot(points[outer].x - points[inner].x, points[outer].y - points[inner].y);
    return warp(outer, Math.max(eyeWidth * 0.9 / width, 0.035), 0.095, 0, eyeTilt);
  });

  if (preset === "mog") {
    // ponytail: 2D nose-to-bridge offset estimates turn; use 3D pose if extreme profiles need better accuracy.
    const side = { x: vertical.y / height, y: -vertical.x / height };
    const noseOffset = (points[1].x - points[168].x) * side.x
      + (points[1].y - points[168].y) * side.y;
    const turn = noseOffset / Math.max(width * 0.16, height * 0.09);
    const profileAmount = Math.max(0, Math.min(1, (Math.abs(turn) - 0.15) / 0.75));
    const projection = Math.sign(turn) * profileAmount * profileAmount * (3 - 2 * profileAmount) * height * 0.14;
    const projectedChin = warp(152, Math.max(0.34, height * 0.22 / width), 0.25, 0, 0.045);
    projectedChin.move.x += side.x * projection;
    projectedChin.move.y += side.y * projection;
    return [
      warp(123, 0.32, 0.22, -0.075, -0.035), // Lift and widen cheekbones.
      warp(352, 0.32, 0.22, 0.075, -0.035),
      warp(172, 0.38, 0.3, -0.135, 0.025), // Stronger, broader lower jaw.
      warp(397, 0.38, 0.3, 0.135, 0.025),
      projectedChin,
      warp(1, 0.2, 0.23, 0, 0, -0.1), // Subtle nose reduction.
      ...eyes,
    ];
  }
  const forehead = warp(10, 0.65, 0.4, 0, -0.035, 0.38);
  forehead.center = { x: (top.x + points[9].x) / 2, y: top.y + (points[9].y - top.y) * 0.25 };
  return [
    forehead,
    warp(1, 0.32, 0.3, 0, 0.02, 0.48), // Oversized nose.
    warp(172, 0.3, 0.25, 0.055, 0), // Taper the jaw for contrast.
    warp(397, 0.3, 0.25, -0.055, 0),
    warp(152, 0.28, 0.23, 0, -0.035),
    ...eyes,
  ];
}

const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
  uv = vec2((position.x + 1.0) * 0.5, (1.0 - position.y) * 0.5);
}`;

const fragmentSource = `
precision mediump float;
varying vec2 uv;
uniform sampler2D frame;
uniform vec4 regions[8];
uniform vec3 changes[8];
uniform int count;
uniform float strength;
uniform sampler2D personMask;
uniform int auraEnabled;
uniform vec4 cloudHead;
uniform int cloudHeadAvailable;
uniform vec3 auraColor;
uniform float time;
uniform float aspect;
uniform float auraSize;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float personAt(vec2 p) {
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return 0.0;
  return smoothstep(0.35, 0.75, texture2D(personMask, p).r);
}

void main() {
  vec2 sampleUV = uv;
  for (int i = 0; i < 8; i++) {
    if (i < count) {
      vec2 center = regions[i].xy;
      vec2 movement = changes[i].xy * strength;
      vec2 relative = uv - center - movement;
      float distanceFromCenter = length(relative / regions[i].zw);
      float weight = 1.0 - smoothstep(0.0, 1.0, distanceFromCenter);
      sampleUV -= movement * weight;
      sampleUV -= (uv - center) * changes[i].z * strength * weight;
    }
  }
  vec3 image = texture2D(frame, clamp(sampleUV, 0.001, 0.999)).rgb;
  if (auraEnabled == 1) {
    float outside = 1.0 - personAt(sampleUV);
    // The silhouette includes hair, shoulders and clothing; protect its entire interior.
    if (outside > 0.01) {
      vec2 fireUV = vec2(sampleUV.x * 24.0 * aspect, sampleUV.y * 13.0 + time * 2.8);
      float turbulence = noise(fireUV) * 0.65 + noise(fireUV * 2.3 + time * 0.7) * 0.35;
      float reach = (0.035 + 0.09 * pow(turbulence, 1.6)) * auraSize;
      float field = 0.0;
      // Dilate the person mask with rising, turbulent offsets to create broad flame tongues.
      for (int direction = 0; direction < 8; direction++) {
        float angle = float(direction) * 0.785398;
        vec2 offset = vec2(cos(angle) * reach / aspect, (sin(angle) + 0.65) * reach);
        for (int ring = 1; ring <= 6; ring++) {
          float radius = float(ring) / 6.0;
          field = max(field, personAt(sampleUV + offset * radius) * (1.0 - radius * 0.8));
        }
      }
      float heat = smoothstep(0.12, 0.85, field) * outside;
      float glow = field * outside * 0.3;
      vec3 flame = mix(auraColor * 0.5, auraColor * 1.7, heat);
      flame = mix(flame, vec3(1.0, 0.96, 0.82), pow(heat, 5.0) * 0.85);
      image = mix(image, clamp(flame, 0.0, 1.0), heat * 0.9);
      image += auraColor * glow;
    }
  }
  if (auraEnabled == 2 && cloudHeadAvailable == 1) {
    vec2 p = (sampleUV - cloudHead.xy) * vec2(aspect, 1.0);
    vec2 orbit = cloudHead.zw * vec2(aspect, 1.0);
    float clouds = 0.0;
    float detail = noise(p * 28.0 + vec2(time * 0.18, -time * 0.22));
    for (int i = 0; i < 12; i++) {
      float id = float(i);
      float phase = time * 0.3 + id * 2.17;
      float angle = id * 0.523599 + sin(phase) * 0.12;
      vec2 center = orbit * vec2(cos(angle), sin(angle));
      center += orbit * 0.08 * vec2(sin(phase * 1.3), cos(phase));
      float radius = cloudHead.w * 0.29 * auraSize * (0.85 + 0.15 * sin(phase));
      vec2 q = (p - center) / max(radius, 0.001);
      // Overlapping round lobes make puffy clouds, distinct from the sharp fire tongues.
      float d = min(length(q), min(length(q - vec2(0.55, -0.1)), length(q + vec2(0.4, 0.2))));
      float puff = (1.0 - smoothstep(0.6, 1.15, d + detail * 0.17)) * (0.75 + 0.25 * sin(phase));
      clouds = max(clouds, puff);
    }
    float outside = 1.0 - personAt(sampleUV);
    vec3 cloudColor = mix(auraColor * 0.28, mix(auraColor, vec3(0.8, 0.82, 0.66), 0.35), detail);
    image = mix(image, cloudColor, clouds * outside * 0.83);
  }
  gl_FragColor = vec4(image, 1.0);
}`;

export function createFaceWarpRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
  if (!gl) throw new Error("WebGL is unavailable");
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram()!;
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  const maskTexture = gl.createTexture();
  function dispose() {
    gl!.deleteTexture(texture);
    gl!.deleteTexture(maskTexture);
    gl!.deleteBuffer(buffer);
    gl!.deleteProgram(program);
    shaders.forEach((shader) => gl!.deleteShader(shader));
  }
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
      const shader = gl.createShader(type)!;
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Could not compile face filter");
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Could not link face filter");
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, "frame"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([0]));
    gl.uniform1i(gl.getUniformLocation(program, "personMask"), 1);
  } catch (error) {
    dispose();
    throw error;
  }
  const regions = new Float32Array(32);
  const changes = new Float32Array(24);
  const regionLocation = gl.getUniformLocation(program, "regions[0]");
  const changeLocation = gl.getUniformLocation(program, "changes[0]");
  const countLocation = gl.getUniformLocation(program, "count");
  const strengthLocation = gl.getUniformLocation(program, "strength");
  const auraEnabledLocation = gl.getUniformLocation(program, "auraEnabled");
  const cloudHeadLocation = gl.getUniformLocation(program, "cloudHead");
  const cloudHeadAvailableLocation = gl.getUniformLocation(program, "cloudHeadAvailable");
  const auraColorLocation = gl.getUniformLocation(program, "auraColor");
  const timeLocation = gl.getUniformLocation(program, "time");
  const aspectLocation = gl.getUniformLocation(program, "aspect");
  const auraSizeLocation = gl.getUniformLocation(program, "auraSize");
  let previousMask: PersonMask | undefined;
  return {
    draw(video: HTMLVideoElement, warps: Warp[], strength: number, aura?: { mode: AuraMode; points: Point[]; mask: PersonMask; color: string; time: number; size: number }) {
      if (gl.isContextLost()) throw new Error("Face renderer lost its context");
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      warps.slice(0, 8).forEach((warp, i) => {
        regions.set([warp.center.x, warp.center.y, warp.radius.x, warp.radius.y], i * 4);
        changes.set([warp.move.x, warp.move.y, warp.bulge], i * 3);
      });
      gl.uniform4fv(regionLocation, regions);
      gl.uniform3fv(changeLocation, changes);
      gl.uniform1i(countLocation, Math.min(warps.length, 8));
      gl.uniform1f(strengthLocation, Math.max(0, Math.min(1, strength)));
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, maskTexture);
      if (aura && aura.mask !== previousMask) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, aura.mask.width, aura.mask.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, aura.mask.data);
        previousMask = aura.mask;
      }
      gl.uniform1i(auraEnabledLocation, aura?.mode === "fire" ? 1 : aura?.mode === "clouds" ? 2 : 0);
      const head = aura?.mode === "clouds" ? cloudHeadBounds(aura.points) : undefined;
      gl.uniform4fv(cloudHeadLocation, head ?? [0, 0, 0, 0]);
      gl.uniform1i(cloudHeadAvailableLocation, head ? 1 : 0);
      gl.uniform3fv(auraColorLocation, auraColorRgb(aura?.color ?? "#ff6500"));
      gl.uniform1f(timeLocation, (aura?.time ?? 0) / 1000);
      gl.uniform1f(aspectLocation, canvas.width / canvas.height);
      gl.uniform1f(auraSizeLocation, aura?.size ?? 1.6);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose,
  };
}
