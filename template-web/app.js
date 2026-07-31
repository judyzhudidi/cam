const templates = [
  {
    id: 'fridge',
    name: 'Fridge Note',
    stepTitle: 'Open the fridge',
    hint: '[INTERACTION] DRAG DOOR TO REVEAL CONTENT',
    icon: 'fridge-icon',
    interaction: 'Drag to open',
  },
  {
    id: 'envelope',
    name: 'Classic Envelope',
    stepTitle: 'Open a letter',
    hint: '[INTERACTION] TAP ENVELOPE TO RELEASE CARD',
    icon: 'envelope-icon',
    interaction: 'Tap to open',
  },
  {
    id: 'pack',
    name: 'Sticker Pack',
    stepTitle: 'Tear the pack',
    hint: '[INTERACTION] TEAR PACK TO POP STICKERS',
    icon: 'pack-icon',
    interaction: 'Tear to open',
  },
];

const state = {
  step: 'select',
  templateId: 'fridge',
  title: 'DAWN AM-01',
  message: 'A small note to gently brighten the day ahead.',
  imageUrl: '',
  stickerUrl: '',
  activeUploadType: 'photo',
  opened: false,
  envelopePeel: 0,
  envelopeDragging: false,
  envelopeLocked: false,
  packTear: 0,
  packDragging: false,
  packLocked: false,
  fridgeFrame: 1,
  fridgeAnimating: false,
  fridgeFramesReady: false,
  fridgeStickerReady: false,
};

const fridgeFrameImages = Array.from({ length: 9 }, (_, index) => {
  const img = new Image();
  img.decoding = 'async';
  img.src = `../fridge${index + 1}.png`;
  return img;
});

const fridgeFramesReady = Promise.all(
  fridgeFrameImages.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    if (img.decode) return img.decode().catch(() => {});
    return new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    });
  })
).then(() => {
  state.fridgeFramesReady = true;
});

const els = {
  app: document.getElementById('app'),
  stage: document.getElementById('stage'),
  scene: document.getElementById('scene'),
  sceneHint: document.getElementById('sceneHint'),
  title: document.getElementById('pageTitle'),
  eyebrow: document.getElementById('stepEyebrow'),
  backBtn: document.getElementById('backBtn'),
  templateActions: document.getElementById('templateActions'),
  useTemplateBtn: document.getElementById('useTemplateBtn'),
  generateBtn: document.getElementById('generateBtn'),
  restartBtn: document.getElementById('restartBtn'),
  imageInput: document.getElementById('imageInput'),
  photoSlot: document.getElementById('photoSlot'),
  textSlot: document.getElementById('textSlot'),
  stickerSlot: document.getElementById('stickerSlot'),
  photoSlotText: document.getElementById('photoSlotText'),
  stickerSlotText: document.getElementById('stickerSlotText'),
  sheetBackdrop: document.getElementById('sheetBackdrop'),
  contentSheet: document.getElementById('contentSheet'),
  sheetContent: document.getElementById('sheetContent'),
};

const stickerForgeInstances = [];

function currentTemplate() {
  return templates.find(template => template.id === state.templateId) || templates[0];
}

function imageMarkup(className = 'photo-sticker') {
  if (!state.imageUrl) {
    return `<div class="${className}" aria-hidden="true"></div>`;
  }
  return `<div class="${className}"><img src="${state.imageUrl}" alt="Uploaded image" /></div>`;
}

function stickerMarkup(className = 'deco-sticker') {
  if (!state.stickerUrl) {
    return '';
  }
  return `<div class="${className}"><img src="${state.stickerUrl}" alt="Decorative sticker" /></div>`;
}

function textCardMarkup(className = 'text-card') {
  return `
    <div class="${className}">
      <strong>${escapeHTML(state.title)}</strong>
      <p>${escapeHTML(state.message)}</p>
    </div>
  `;
}

function renderFridge() {
  const frameSrc = fridgeFrameImages[state.fridgeFrame - 1]?.src || `../fridge${state.fridgeFrame}.png`;
  const showContent = state.step !== 'select';
  const doorSticker = showContent && state.stickerUrl && state.fridgeStickerReady && !state.opened
    ? `
        <div class="fridge-door-sticker forge-fallback"><img src="${state.stickerUrl}" alt="Decorative sticker" /></div>
        <div class="forge-sticker-host fridge-forge-sticker" aria-hidden="true"></div>
      `
    : '';
  return `
    <div class="scene-fridge ${state.opened ? 'is-open' : ''}">
      <div class="fridge-template">
        <img class="fridge-frame-asset" src="${frameSrc}" alt="Fridge animation frame" />
        ${showContent ? imageMarkup('fridge-photo-content') : ''}
        ${showContent ? textCardMarkup('fridge-text-card') : ''}
        ${doorSticker}
      </div>
    </div>
  `;
}

function renderEnvelope() {
  const peel = Math.round(state.envelopePeel * 1000) / 1000;
  const idleHint = (!state.envelopeLocked && state.envelopePeel === 0) ? 'idle-hint' : '';
  return `
    <div class="scene-envelope ${state.opened ? 'is-open' : ''}" style="--peel:${peel};">
      <div class="letter-svg-stage">
        <div class="letter-open-flap"></div>
        <div class="letter-back-panel"></div>
        <div class="letter-card-mask">
          <div class="letter-card-svg">
            ${imageMarkup('envelope-photo-content')}
            ${textCardMarkup('envelope-text-card')}
          </div>
        </div>
        <div class="letter-envelope-clip">
          <svg class="letter-front-sides" viewBox="0 0 3000 1700" preserveAspectRatio="none" aria-hidden="true">
            <path transform="matrix(0 1 -1 0 1500 -150)" d="M1000 0L1866 1500L134 1500Z" fill="#C4C4C4"/>
            <path transform="matrix(0 1 1 0 1500 -150)" d="M1000 0L1866 1500L134 1500Z" fill="#C4C4C4"/>
          </svg>
          <div class="letter-front-bottom" aria-hidden="true"></div>
        </div>
        <div class="letter-peel-cover">
          <span class="letter-pull-tab ${idleHint}" aria-hidden="true"></span>
          <span class="letter-curl"></span>
        </div>
        ${stickerMarkup('envelope-deco-sticker')}
      </div>
    </div>
  `;
}

function renderPack() {
  const showContent = state.step !== 'select';
  const photoSticker = state.imageUrl ? `<img src="${state.imageUrl}" alt="Uploaded photo" />` : '';
  const decoSticker = state.stickerUrl ? `<img src="${state.stickerUrl}" alt="Decorative sticker" />` : '';
  const textSticker = showContent ? `<span>${escapeHTML(state.title)}</span>` : '';
  const tear = Math.round(state.packTear * 1000) / 1000;
  return `
    <div class="scene-pack ${state.opened ? 'is-open' : ''}" style="--tear:${tear};">
      <div class="pack-template">
        ${showContent ? `
          <div class="pack-sticker-layer">
            ${photoSticker ? `<div class="pack-sticker one pack-photo-sticker">${photoSticker}</div>` : ''}
            ${decoSticker ? `<div class="pack-sticker two pack-deco-sticker">${decoSticker}</div>` : ''}
            <div class="pack-text-card three">${textSticker}</div>
          </div>
        ` : ''}
        <img class="pack-bag-asset" src="../image%2033.png" alt="Plastic sticker bag" />
        <img class="pack-rip-piece" src="../image%2034.png" alt="Torn plastic bag edge" />
        <div class="pack-tear-strip" aria-hidden="true"><span>TEAR ME</span></div>
      </div>
    </div>
  `;
}

function renderScene() {
  destroyStickerForgeInstances();
  const template = currentTemplate();
  if (template.id === 'fridge') els.scene.innerHTML = renderFridge();
  if (template.id === 'envelope') els.scene.innerHTML = renderEnvelope();
  if (template.id === 'pack') els.scene.innerHTML = renderPack();
  els.sceneHint.textContent = state.step === 'select' ? template.hint : '[PREVIEW] TAP THE CARD TO TEST MOTION';
  mountStickerForgeEffects();
}

function destroyStickerForgeInstances() {
  while (stickerForgeInstances.length) {
    const instance = stickerForgeInstances.pop();
    try {
      instance?.destroy?.();
    } catch (error) {
      console.warn('Failed to destroy Sticker Forge instance', error);
    }
  }
}

async function mountStickerForgeEffects() {
  if (state.templateId !== 'fridge') return;
  if (state.step === 'select' || state.opened || state.fridgeFrame !== 1 || !state.stickerUrl || !state.fridgeStickerReady) return;
  const api = window.StickerForge;
  if (!api?.createSticker) return;
  const host = els.scene.querySelector('.fridge-forge-sticker');
  if (!host) return;
  try {
    const instance = await api.createSticker(host, {
      source: { type: 'image', src: state.stickerUrl },
      outline: { width: 20, color: '#ffffff' },
      edge: { width: 3, strength: 0.7 },
      shadow: { opacity: 0.24, blur: 22, distance: 12, color: '#1c1c18' },
      material: {
        type: 'holographic',
        intensity: 0.32,
        scale: 1.2,
        holographicGrain: 0.18,
      },
      lighting: {
        intensity: 0.9,
        ambient: 0.48,
        softness: 0.72,
        direction: { x: -0.35, y: 0.45, z: 0.82 },
      },
      peel: { release: 'reset', grabWidth: 28, radius: 0.12 },
      sound: { enabled: false },
      quality: 'medium',
      tilt: -13,
    });
    if (!host.isConnected) {
      instance.destroy?.();
      return;
    }
    stickerForgeInstances.push(instance);
    host.closest('.scene-fridge')?.classList.add('forge-ready');
    instance.reappear?.();
  } catch (error) {
    console.warn('Sticker Forge mount failed, falling back to CSS sticker', error);
  }
}

function renderTemplateActions() {
  els.templateActions.innerHTML = templates.map(template => `
    <button class="template-button ${template.id === state.templateId ? 'active' : ''}" data-template="${template.id}">
      <span class="sticker-icon ${template.icon}"></span>
      <small>${template.name}</small>
    </button>
  `).join('');

  els.templateActions.querySelectorAll('[data-template]').forEach(button => {
    button.addEventListener('click', () => {
      state.templateId = button.dataset.template;
      state.opened = false;
      state.fridgeFrame = 1;
      state.fridgeStickerReady = false;
      resetEnvelopePeel();
      resetPackTear();
      render();
    });
  });
}

function setStep(step) {
  state.step = step;
  if (step === 'select') {
    state.opened = false;
    state.fridgeFrame = 1;
    state.fridgeStickerReady = false;
    resetEnvelopePeel();
    resetPackTear();
  }
  render();
}

function resetEnvelopePeel() {
  state.envelopePeel = 0;
  state.envelopeDragging = false;
  state.envelopeLocked = false;
}

function resetPackTear() {
  state.packTear = 0;
  state.packDragging = false;
  state.packLocked = false;
}

async function animateFridgeTo(open) {
  if (state.fridgeAnimating) return;
  state.fridgeAnimating = true;
  await fridgeFramesReady;
  const from = state.fridgeFrame;
  const to = open ? 9 : 1;
  const step = from <= to ? 1 : -1;
  let frame = from;
  state.opened = open;
  if (open) state.fridgeStickerReady = false;

  function tick() {
    state.fridgeFrame = frame;
    renderScene();
    if (frame === to) {
      if (!open && state.stickerUrl) {
        window.setTimeout(() => {
          if (state.templateId !== 'fridge' || state.opened || state.fridgeFrame !== 1 || !state.stickerUrl) return;
          state.fridgeStickerReady = true;
          renderScene();
        }, 420);
      }
      state.fridgeAnimating = false;
      return;
    }
    frame += step;
    window.setTimeout(tick, 54);
  }

  tick();
}

function renderStepPanels() {
  document.querySelectorAll('[data-step-panel]').forEach(panel => {
    panel.classList.toggle('hidden', panel.dataset.stepPanel !== state.step);
  });

  const template = currentTemplate();
  if (state.step === 'select') {
    els.eyebrow.textContent = 'Step 1';
    els.title.textContent = 'Choose an opening';
  }
  if (state.step === 'edit') {
    els.eyebrow.textContent = 'Step 2';
    els.title.textContent = template.name;
  }
  if (state.step === 'share') {
    els.eyebrow.textContent = 'Step 3';
    els.title.textContent = 'Send it out';
    state.opened = true;
  }
}

function renderEditState() {
  els.photoSlotText.textContent = state.imageUrl ? 'Photo added' : 'Upload / Camera';
  els.stickerSlotText.textContent = state.stickerUrl ? 'Sticker added' : 'Decorations';
}

function render() {
  renderTemplateActions();
  renderStepPanels();
  renderEditState();
  renderScene();
  bindEnvelopePeel();
  bindPackTear();
}

function bindEnvelopePeel() {
  const scene = els.scene.querySelector('.scene-envelope');
  if (!scene) return;
  const cover = scene.querySelector('.letter-peel-cover');
  if (!cover) return;
  let startX = 0;
  let startY = 0;
  let startPeel = 0;
  let peelAnimFrame = 0;

  function updateEnvelopePeelView(animate) {
    const value = Math.round(state.envelopePeel * 1000) / 1000;
    scene.classList.toggle('peel-transitioning', !!animate);
    scene.style.setProperty('--peel', value);
    const coverFade = Math.max(0, Math.min(1, (value - 0.18) / 0.34));
    scene.style.setProperty('--cover-fade', Math.round(coverFade * 1000) / 1000);
    scene.classList.toggle('is-open', state.envelopePeel > 0.72 || state.opened);
    const shadowY = 14 + value * 18;
    const shadowBlur = 26 + value * 30;
    const shadowAlpha = 0.10 + value * 0.12;
    cover.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,.7), 0 ${shadowY}px ${shadowBlur}px rgba(42,42,38,${shadowAlpha.toFixed(2)})`;
  }

  // Animate peel value smoothly from current to target
  function animatePeelTo(target, onDone) {
    cancelAnimationFrame(peelAnimFrame);
    scene.classList.add('peel-transitioning');
    const from = state.envelopePeel;
    const duration = 420; // ms
    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3) + (t < 0.7 ? Math.sin(t * Math.PI) * 0.06 : 0);
      state.envelopePeel = from + (target - from) * Math.min(ease, 1);
      updateEnvelopePeelView(true);
      if (t < 1) {
        peelAnimFrame = requestAnimationFrame(tick);
      } else {
        state.envelopePeel = target;
        updateEnvelopePeelView(false);
        scene.classList.remove('peel-transitioning');
        if (onDone) onDone();
      }
    }
    peelAnimFrame = requestAnimationFrame(tick);
  }

  cover.addEventListener('pointerdown', event => {
    if (state.envelopeLocked) return;
    event.preventDefault();
    event.stopPropagation();
    cancelAnimationFrame(peelAnimFrame);
    state.envelopeDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startPeel = state.envelopePeel;
    cover.setPointerCapture(event.pointerId);
    cover.style.cursor = 'grabbing';
    scene.classList.remove('peel-transitioning');
    scene.style.setProperty('--cover-fade', 0);
    const tab = cover.querySelector('.letter-pull-tab');
    if (tab) tab.classList.remove('idle-hint');
  });

  cover.addEventListener('pointermove', event => {
    if (!state.envelopeDragging) return;
    event.preventDefault();
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const pull = Math.max(-dy * 0.95 + Math.abs(dx) * 0.18, 0);
    state.envelopePeel = Math.max(0, Math.min(1, startPeel + pull / 118));
    state.opened = state.envelopePeel > 0.72;
    updateEnvelopePeelView(false);
  });

  function handleRelease() {
    if (!state.envelopeDragging) return;
    state.envelopeDragging = false;
    cover.style.cursor = '';
    const clickOpen = state.envelopePeel < 0.08 && Math.abs(state.envelopePeel - startPeel) < 0.08;
    if (state.envelopePeel > 0.34 || clickOpen) {
      animatePeelTo(1, () => {
        state.opened = true;
        state.envelopeLocked = true;
        updateEnvelopePeelView(false);
      });
      state.opened = true;
    } else {
      animatePeelTo(0, () => {
        state.opened = false;
        updateEnvelopePeelView(false);
      });
    }
  }

  cover.addEventListener('pointerup', event => {
    event.preventDefault();
    handleRelease();
  });

  cover.addEventListener('pointercancel', handleRelease);
}

function bindPackTear() {
  const scene = els.scene.querySelector('.scene-pack');
  if (!scene) return;
  const pack = scene.querySelector('.pack-template');
  if (!pack) return;
  let startX = 0;
  let startY = 0;
  let startTear = 0;
  let tearAnimFrame = 0;

  function updatePackTearView() {
    const value = Math.round(state.packTear * 1000) / 1000;
    scene.style.setProperty('--tear', value);
    scene.classList.toggle('is-open', state.packTear > 0.72 || state.opened);
  }

  function animateTearTo(target, onDone) {
    cancelAnimationFrame(tearAnimFrame);
    const from = state.packTear;
    const duration = 380;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3) + (t < 0.68 ? Math.sin(t * Math.PI) * 0.05 : 0);
      state.packTear = from + (target - from) * Math.min(ease, 1);
      updatePackTearView();
      if (t < 1) {
        tearAnimFrame = requestAnimationFrame(tick);
      } else {
        state.packTear = target;
        updatePackTearView();
        if (onDone) onDone();
      }
    }
    tearAnimFrame = requestAnimationFrame(tick);
  }

  pack.addEventListener('pointerdown', event => {
    if (state.packLocked) return;
    event.preventDefault();
    event.stopPropagation();
    cancelAnimationFrame(tearAnimFrame);
    state.packDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startTear = state.packTear;
    pack.setPointerCapture(event.pointerId);
    pack.style.cursor = 'grabbing';
  });

  pack.addEventListener('pointermove', event => {
    if (!state.packDragging) return;
    event.preventDefault();
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const pull = Math.max(dx * 0.85 - Math.abs(dy) * 0.18, 0);
    state.packTear = Math.max(0, Math.min(1, startTear + pull / 126));
    state.opened = state.packTear > 0.72;
    updatePackTearView();
  });

  function handleRelease() {
    if (!state.packDragging) return;
    state.packDragging = false;
    pack.style.cursor = '';
    if (state.packTear > 0.42) {
      state.opened = true;
      animateTearTo(1, () => {
        state.opened = true;
        state.packLocked = true;
        updatePackTearView();
      });
    } else {
      animateTearTo(0, () => {
        state.opened = false;
        updatePackTearView();
      });
    }
  }

  pack.addEventListener('pointerup', event => {
    event.preventDefault();
    handleRelease();
  });

  pack.addEventListener('pointercancel', handleRelease);
}

function openImagePicker(type = 'photo', source = 'library') {
  state.activeUploadType = type;
  if (source === 'camera') {
    els.imageInput.setAttribute('capture', 'environment');
  } else {
    els.imageInput.removeAttribute('capture');
  }
  els.imageInput.click();
}

function openPhotoEditor(dataUrl) {
  // Repurpose the bottom sheet as the photo editor canvas
  els.stage.classList.add('blurred');
  els.sheetBackdrop.classList.remove('hidden');
  els.contentSheet.classList.remove('hidden');
  els.contentSheet.classList.add('pe-sheet');

  PhotoEditor.open(els.sheetContent, dataUrl, result => {
    els.contentSheet.classList.remove('pe-sheet');
    if (result !== null) {
      state.imageUrl = result;
      render();
    }
    closeSheet();
  });
}

function openSheet(type) {
  els.stage.classList.add('blurred');
  els.sheetBackdrop.classList.remove('hidden');
  els.contentSheet.classList.remove('hidden');

  if (type === 'photo') {
    els.sheetContent.innerHTML = `
      <h2>Add photo</h2>
      <button class="primary-button" id="uploadNow">Choose from library</button>
      <button class="secondary-button" id="cameraNow">Take photo</button>
      <p style="margin:12px 4px 0;color:rgba(0,0,0,.5);font-size:13px;font-weight:700;line-height:1.45;">The photo will be placed inside the selected opening template.</p>
    `;
    document.getElementById('uploadNow').addEventListener('click', () => openImagePicker('photo', 'library'));
    document.getElementById('cameraNow').addEventListener('click', () => openImagePicker('photo', 'camera'));
  }

  if (type === 'text') {
    els.sheetContent.innerHTML = `
      <h2>Write text</h2>
      <div class="field">
        <label>Title</label>
        <input id="titleInput" maxlength="16" value="${escapeAttribute(state.title)}" />
      </div>
      <div class="field">
        <label>Message</label>
        <textarea id="messageInput" maxlength="90">${escapeHTML(state.message)}</textarea>
      </div>
      <button class="primary-button" id="saveText">Save text</button>
    `;
    document.getElementById('saveText').addEventListener('click', () => {
      state.title = document.getElementById('titleInput').value.trim() || 'DAWN AM-01';
      state.message = document.getElementById('messageInput').value.trim() || 'A small note to gently brighten the day ahead.';
      closeSheet();
      render();
    });
  }

  if (type === 'sticker') {
    els.sheetContent.innerHTML = `
      <h2>Decorative stickers</h2>
      <button class="primary-button" id="uploadStickerNow">Choose from library</button>
      <button class="secondary-button" id="cameraStickerNow">Take photo</button>
      <p style="margin:12px 4px 0;color:rgba(0,0,0,.5);font-size:13px;font-weight:700;line-height:1.45;">Add a decorative sticker that can appear in the opening animation.</p>
    `;
    document.getElementById('uploadStickerNow').addEventListener('click', () => openImagePicker('sticker', 'library'));
    document.getElementById('cameraStickerNow').addEventListener('click', () => openImagePicker('sticker', 'camera'));
  }
}

function closeSheet() {
  els.stage.classList.remove('blurred');
  els.sheetBackdrop.classList.add('hidden');
  els.contentSheet.classList.add('hidden');
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHTML(value).replaceAll('`', '&#096;');
}

els.useTemplateBtn.addEventListener('click', () => setStep('edit'));
els.generateBtn.addEventListener('click', () => setStep('share'));
els.restartBtn.addEventListener('click', () => setStep('select'));

els.backBtn.addEventListener('click', () => {
  if (state.step === 'share') return setStep('edit');
  if (state.step === 'edit') return setStep('select');
});

els.photoSlot.addEventListener('click', () => openSheet('photo'));
els.textSlot.addEventListener('click', () => openSheet('text'));
els.stickerSlot.addEventListener('click', () => openSheet('sticker'));
els.sheetBackdrop.addEventListener('click', closeSheet);

els.stage.addEventListener('click', () => {
  if (state.templateId === 'envelope' || state.templateId === 'pack') return;
  if (state.templateId === 'fridge') {
    animateFridgeTo(!state.opened);
    return;
  }
  state.opened = !state.opened;
  renderScene();
});

els.imageInput.addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || '');
    if (state.activeUploadType === 'sticker') {
      state.stickerUrl = dataUrl;
      state.fridgeStickerReady = false;
      closeSheet();
      render();
    } else {
      // Photo: close the picker sheet, then open photo editor
      closeSheet();
      openPhotoEditor(dataUrl);
    }
  };
  reader.readAsDataURL(file);
  event.target.value = '';
});

render();
