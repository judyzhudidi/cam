/**
 * photo-editor.js
 * Inline WebGL photo editor: None / Magnifier (mode 1) / Fisheye (mode 0)
 * Called from app.js when user picks a photo.
 */

(function (global) {
  'use strict';

  // ─── GLSL ─────────────────────────────────────────────────────────────────

  const VERT = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      v_uv.y = 1.0 - v_uv.y;
      gl_Position = vec4(a_pos, 0, 1);
    }
  `;

  // Only modes 0 (fisheye) and 1 (magnifier) — stripped-down shader
  const FRAG = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_tex;
    uniform vec2  u_center;
    uniform float u_radius;
    uniform float u_strength;
    uniform float u_mode;      // 0=fisheye  1=magnifier  -1=none
    uniform vec2  u_resolution;
    uniform vec2  u_texSize;
    uniform float u_frameColor; // 0=black 1=white

    vec2 barrelDistort(vec2 uv, vec2 center, float strength, float aspect) {
      vec2 d = uv - center;
      d.x *= aspect;
      float r = length(d);
      float rn = r * 2.0;
      float r2 = rn * rn;
      float r4 = r2 * r2;
      float k1 = strength * 1.082;
      float k2 = strength * strength * 0.406;
      float scale = 1.0 + k1 * r2 + k2 * r4;
      d /= scale;
      d.x /= aspect;
      return center + d;
    }

    vec2 bulgeDistort(vec2 uv, vec2 center, float radius, float strength, float aspect) {
      vec2 d = uv - center;
      d.x *= aspect;
      float dist = length(d);
      if (dist >= radius) return uv;
      float nd = dist / radius;
      float bulge = pow(1.0 - nd, 2.0) * strength;
      float newDist = dist * (1.0 - bulge);
      vec2 dir = dist > 0.001 ? normalize(d) : vec2(0.0);
      vec2 nd2 = dir * newDist;
      nd2.x /= aspect;
      return center + nd2;
    }

    vec4 renderFrame(vec2 uv, vec2 center, float radius, float aspect, float fc) {
      vec2 d = uv - center;
      d.x *= aspect;
      float r = length(d);
      vec3 surroundColor = mix(vec3(0.0), vec3(1.0), fc);
      float imgMask = 1.0 - smoothstep(radius - 0.012, radius + 0.003, r);
      return vec4(surroundColor, imgMask);
    }

    void main() {
      vec2 uv = v_uv;
      float screenAspect = u_resolution.x / u_resolution.y;
      float imgAspect    = u_texSize.x / u_texSize.y;

      // Cover crop
      vec2 texUV = uv;
      if (screenAspect > imgAspect) {
        float scale = imgAspect / screenAspect;
        texUV.y = uv.y * scale + (1.0 - scale) * 0.5;
      } else {
        float scale = screenAspect / imgAspect;
        texUV.x = uv.x * scale + (1.0 - scale) * 0.5;
      }

      // None
      if (u_mode < -0.5) {
        gl_FragColor = vec4(texture2D(u_tex, texUV).rgb, 1.0);
        return;
      }

      vec4 imgColor;

      if (u_mode < 0.5) {
        // Fisheye (mode 0)
        vec2 distorted = barrelDistort(texUV, u_center, u_strength, screenAspect);
        distorted = clamp(distorted, vec2(0.0), vec2(1.0));
        imgColor = texture2D(u_tex, distorted);

        // Chromatic aberration
        float effectDist = length((texUV - u_center) * vec2(screenAspect, 1.0));
        float effectRadius = u_radius;
        float normalizedDist = effectDist / max(effectRadius, 0.01);
        float caStrength = 0.004 * smoothstep(0.3, 1.0, normalizedDist);
        vec2 caDir = normalize(texUV - u_center + vec2(0.0001));
        imgColor.r = texture2D(u_tex, clamp(distorted + caDir * caStrength, vec2(0.0), vec2(1.0))).r;
        imgColor.b = texture2D(u_tex, clamp(distorted - caDir * caStrength, vec2(0.0), vec2(1.0))).b;
        imgColor.rgb *= mix(1.0, 1.0 - 0.25 * smoothstep(0.4, 1.0, normalizedDist), 0.5);

        // Lens flare
        vec2 fd = texUV - (u_center + vec2(0.25, 0.20));
        fd.x *= screenAspect;
        imgColor.rgb += vec3(1.0, 0.7, 0.3) * exp(-dot(fd, fd) * 12.0) * 0.15;

        float frameRadius = u_radius;
        vec4 frame = renderFrame(uv, u_center, frameRadius, screenAspect, u_frameColor);
        gl_FragColor = vec4(mix(frame.rgb, imgColor.rgb, frame.a), 1.0);

      } else {
        // Magnifier (mode 1)
        vec2 distorted = bulgeDistort(texUV, u_center, u_radius * 1.6, u_strength, screenAspect);
        distorted = clamp(distorted, vec2(0.0), vec2(1.0));
        imgColor = texture2D(u_tex, distorted);

        float effectDist = length((texUV - u_center) * vec2(screenAspect, 1.0));
        float effectRadius = u_radius + 0.08;
        float normalizedDist = effectDist / max(effectRadius, 0.01);
        float caStrength = 0.004 * smoothstep(0.3, 1.0, normalizedDist);
        vec2 caDir = normalize(texUV - u_center + vec2(0.0001));
        imgColor.r = texture2D(u_tex, clamp(distorted + caDir * caStrength, vec2(0.0), vec2(1.0))).r;
        imgColor.b = texture2D(u_tex, clamp(distorted - caDir * caStrength, vec2(0.0), vec2(1.0))).b;
        imgColor.rgb *= mix(1.0, 1.0 - 0.25 * smoothstep(0.4, 1.0, normalizedDist), 0.5);

        vec2 fd = texUV - (u_center + vec2(0.25, 0.20));
        fd.x *= screenAspect;
        imgColor.rgb += vec3(1.0, 0.7, 0.3) * exp(-dot(fd, fd) * 12.0) * 0.15;

        float frameRadius = u_radius + 0.08;
        vec4 frame = renderFrame(uv, u_center, frameRadius, screenAspect, u_frameColor);
        gl_FragColor = vec4(mix(frame.rgb, imgColor.rgb, frame.a), 1.0);
      }
    }
  `;

  // ─── State ────────────────────────────────────────────────────────────────

  const S = {
    mode: -1,       // -1=none  0=fisheye  1=magnifier
    strength: 0.6,
    radius: 0.42,
    cx: 0.5, cy: 0.5,
    dragging: false,
    pinching: false,
    pinchStartDist: 0,
    pinchStartRadius: 0,
    imgLoaded: false,
    frameColor: 0,
  };

  const modeDefaults = {
    '-1': { strength: 0.6, radius: 0.42, cx: 0.5, cy: 0.5 },
    '0':  { strength: 0.3, radius: 0.5,  cx: 0.5, cy: 0.5 },
    '1':  { strength: 0.8, radius: 0.42, cx: 0.5, cy: 0.5 },
  };

  // ─── WebGL internals ──────────────────────────────────────────────────────

  let gl, program, texture;
  let uCenter, uRadius, uStrength, uMode, uResolution, uTexSize, uFrameColor;
  let imgWidth = 1, imgHeight = 1;
  let rafId = null;
  let canvas = null;

  function compileShader(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  function initGL(canvasEl) {
    canvas = canvasEl;
    gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) return false;

    const vs = compileShader(gl.VERTEX_SHADER, VERT);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAG);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    uCenter     = gl.getUniformLocation(program, 'u_center');
    uRadius     = gl.getUniformLocation(program, 'u_radius');
    uStrength   = gl.getUniformLocation(program, 'u_strength');
    uMode       = gl.getUniformLocation(program, 'u_mode');
    uResolution = gl.getUniformLocation(program, 'u_resolution');
    uTexSize    = gl.getUniformLocation(program, 'u_texSize');
    uFrameColor = gl.getUniformLocation(program, 'u_frameColor');

    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return true;
  }

  function resizeCanvas() {
    if (!canvas || !gl) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function loadImageToGL(imgOrCanvas) {
    let src = imgOrCanvas;
    imgWidth = src.naturalWidth || src.width;
    imgHeight = src.naturalHeight || src.height;

    const maxDim = 4096;
    if (Math.max(imgWidth, imgHeight) > maxDim) {
      const scale = maxDim / Math.max(imgWidth, imgHeight);
      const oc = document.createElement('canvas');
      oc.width = Math.round(imgWidth * scale);
      oc.height = Math.round(imgHeight * scale);
      oc.getContext('2d').drawImage(src, 0, 0, oc.width, oc.height);
      src = oc;
      imgWidth = oc.width;
      imgHeight = oc.height;
    }

    const oc = document.createElement('canvas');
    oc.width = imgWidth;
    oc.height = imgHeight;
    oc.getContext('2d').drawImage(src, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, oc);
    S.imgLoaded = true;
    resizeCanvas();
  }

  function drawFrame() {
    if (!S.imgLoaded || !gl) return;
    gl.uniform2f(uCenter, S.cx, S.cy);
    gl.uniform1f(uRadius, S.radius);
    gl.uniform1f(uStrength, S.strength);
    gl.uniform1f(uMode, S.mode);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform2f(uTexSize, imgWidth, imgHeight);
    gl.uniform1f(uFrameColor, S.frameColor);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function startLoop() {
    if (rafId) return;
    function tick() {
      drawFrame();
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // ─── Touch / Mouse ────────────────────────────────────────────────────────

  function setupInteraction(el) {
    function norm(clientX, clientY) {
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (clientY - r.top)  / r.height)),
      };
    }

    function touchDist(t) {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx*dx + dy*dy);
    }

    el.addEventListener('touchstart', e => {
      if (S.mode === -1) return; // none: no interaction
      e.preventDefault();
      if (e.touches.length === 1) {
        const p = norm(e.touches[0].clientX, e.touches[0].clientY);
        S.dragging = true;
        S.cx = p.x; S.cy = p.y;
      }
      if (e.touches.length === 2) {
        S.pinching = true;
        S.pinchStartDist = touchDist(e.touches);
        S.pinchStartRadius = S.radius;
      }
    }, { passive: false });

    el.addEventListener('touchmove', e => {
      if (S.mode === -1) return;
      e.preventDefault();
      if (e.touches.length === 1 && S.dragging && !S.pinching) {
        const p = norm(e.touches[0].clientX, e.touches[0].clientY);
        S.cx = p.x; S.cy = p.y;
      }
      if (e.touches.length === 2 && S.pinching) {
        const d = touchDist(e.touches);
        S.radius = Math.max(0.08, Math.min(0.6, S.pinchStartRadius * (d / S.pinchStartDist)));
        // update slider
        const slider = document.getElementById('peRadiusSlider');
        if (slider) slider.value = Math.round(S.radius * 100);
        const val = document.getElementById('peRadiusVal');
        if (val) val.textContent = Math.round(S.radius * 100) + '%';
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const p = norm(mx, my);
        S.cx = p.x; S.cy = p.y;
      }
    }, { passive: false });

    el.addEventListener('touchend', e => {
      if (e.touches.length < 2) S.pinching = false;
      if (e.touches.length === 0) S.dragging = false;
    });

    // Mouse (desktop)
    el.addEventListener('mousedown', e => {
      if (S.mode === -1) return;
      const p = norm(e.clientX, e.clientY);
      S.dragging = true;
      S.cx = p.x; S.cy = p.y;
    });
    window.addEventListener('mousemove', e => {
      if (!S.dragging || S.mode === -1) return;
      const p = norm(e.clientX, e.clientY);
      S.cx = p.x; S.cy = p.y;
    });
    window.addEventListener('mouseup', () => { S.dragging = false; });

    // Scroll wheel → radius
    el.addEventListener('wheel', e => {
      if (S.mode === -1) return;
      e.preventDefault();
      S.radius = Math.max(0.08, Math.min(0.6, S.radius - e.deltaY * 0.0005));
      const slider = document.getElementById('peRadiusSlider');
      if (slider) slider.value = Math.round(S.radius * 100);
      const val = document.getElementById('peRadiusVal');
      if (val) val.textContent = Math.round(S.radius * 100) + '%';
    }, { passive: false });
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Open the editor inside `containerEl`.
   * `dataUrl`  — the source photo data URL
   * `onDone`   — callback(resultDataUrl | null)
   */
  function open(containerEl, dataUrl, onDone) {
    // Reset state
    Object.assign(S, modeDefaults['-1'], { mode: -1, imgLoaded: false, dragging: false, pinching: false });

    // Build editor HTML
    containerEl.innerHTML = `
      <div class="pe-wrap">
        <canvas class="pe-canvas" id="peCanvas"></canvas>
        <div class="pe-hint" id="peHint">Drag to move · Pinch to resize</div>
      </div>
      <div class="pe-effects">
        <button class="pe-effect-btn active" data-mode="-1">
          <span class="pe-effect-icon pe-icon-none"></span>
          <span>None</span>
        </button>
        <button class="pe-effect-btn" data-mode="1">
          <span class="pe-effect-icon pe-icon-magnifier"></span>
          <span>Magnifier</span>
        </button>
        <button class="pe-effect-btn" data-mode="0">
          <span class="pe-effect-icon pe-icon-fisheye"></span>
          <span>Fisheye</span>
        </button>
      </div>
      <div class="pe-sliders" id="peSliders" style="display:none;">
        <div class="pe-slider-row">
          <label>Strength</label>
          <input type="range" id="peStrengthSlider" min="0" max="150" value="60">
          <span id="peStrengthVal">60%</span>
        </div>
        <div class="pe-slider-row">
          <label>Radius</label>
          <input type="range" id="peRadiusSlider" min="8" max="60" value="42">
          <span id="peRadiusVal">42%</span>
        </div>
      </div>
      <div class="pe-actions">
        <button class="secondary-button" id="peCancelBtn">Cancel</button>
        <button class="primary-button" id="peDoneBtn">Done</button>
      </div>
    `;

    const canvasEl = containerEl.querySelector('#peCanvas');
    const hint = containerEl.querySelector('#peHint');

    // Init WebGL
    if (!initGL(canvasEl)) {
      console.warn('PhotoEditor: WebGL unavailable');
      onDone(dataUrl); // fallback: return original
      return;
    }

    // Load image
    const img = new Image();
    img.onload = () => {
      loadImageToGL(img);
      startLoop();
    };
    img.src = dataUrl;

    // Effect buttons
    containerEl.querySelectorAll('.pe-effect-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = parseInt(btn.dataset.mode, 10);
        containerEl.querySelectorAll('.pe-effect-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.mode = m;
        const d = modeDefaults[String(m)];
        S.strength = d.strength; S.radius = d.radius; S.cx = d.cx; S.cy = d.cy;
        const slidersEl = containerEl.querySelector('#peSliders');
        slidersEl.style.display = (m === -1) ? 'none' : 'flex';
        hint.style.opacity = (m === -1) ? '0' : '1';
        // Update slider display
        const ss = containerEl.querySelector('#peStrengthSlider');
        const rs = containerEl.querySelector('#peRadiusSlider');
        if (ss) { ss.value = Math.round(S.strength * 100); containerEl.querySelector('#peStrengthVal').textContent = Math.round(S.strength * 100) + '%'; }
        if (rs) { rs.value = Math.round(S.radius * 100);   containerEl.querySelector('#peRadiusVal').textContent   = Math.round(S.radius * 100)   + '%'; }
      });
    });

    // Sliders
    containerEl.querySelector('#peStrengthSlider').addEventListener('input', e => {
      S.strength = e.target.value / 100;
      containerEl.querySelector('#peStrengthVal').textContent = e.target.value + '%';
    });
    containerEl.querySelector('#peRadiusSlider').addEventListener('input', e => {
      S.radius = e.target.value / 100;
      containerEl.querySelector('#peRadiusVal').textContent = e.target.value + '%';
    });

    // Touch/mouse
    setupInteraction(canvasEl);

    // Cancel
    containerEl.querySelector('#peCancelBtn').addEventListener('click', () => {
      stopLoop();
      onDone(null);
    });

    // Done — export canvas
    containerEl.querySelector('#peDoneBtn').addEventListener('click', () => {
      stopLoop();
      if (S.mode === -1) {
        // None: return original dataUrl unchanged
        onDone(dataUrl);
      } else {
        drawFrame(); // ensure latest frame
        try {
          onDone(canvasEl.toDataURL('image/jpeg', 0.92));
        } catch (err) {
          console.warn('PhotoEditor export failed:', err);
          onDone(dataUrl);
        }
      }
    });
  }

  function destroy() {
    stopLoop();
    gl = null;
    program = null;
    texture = null;
    canvas = null;
    S.imgLoaded = false;
  }

  global.PhotoEditor = { open, destroy };
})(window);
