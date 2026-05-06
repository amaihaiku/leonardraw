/* ═══════════════════════════════════════════
   PLOTTERCAM — app.js
   Image processing + UI logic
════════════════════════════════════════════ */

'use strict';

// ── STATE ────────────────────────────────────
const state = {
  originalImage: null,     // ImageData after load
  croppedImage: null,      // ImageData after crop/rotate
  processedImage: null,    // ImageData after tone adjustments
  renderedPaths: null,     // SVG path strings array
  rotation: 0,
  flipH: false,

  tone: { brightness: 0, contrast: 0, blackPoint: 0, whitePoint: 255, gamma: 1.0 },

  algo: 'squiggle-h',
  algoParams: {},

  lineColor: '#000000',
  bgColor: '#ffffff',

  paper: { w: 210, h: 297, margin: 10 },
  exportFormat: 'svg',

  panelH: null,
  panelDragging: false,
  panelDragStartY: 0,
  panelDragStartH: 0,
};

// ── ALGORITHM PARAM DEFINITIONS ─────────────
const ALGO_PARAMS = {
  'squiggle-h': [
    { id:'density',   label:'Sorok száma',  min:20,  max:200, step:1,   default:80  },
    { id:'amplitude', label:'Amplitúdó',    min:1,   max:20,  step:0.5, default:6   },
    { id:'frequency', label:'Frekvencia',   min:1,   max:10,  step:0.5, default:3   },
    { id:'smooth',    label:'Simítás',      min:0,   max:10,  step:1,   default:2   },
  ],
  'squiggle-v': [
    { id:'density',   label:'Oszlopok',     min:20,  max:200, step:1,   default:80  },
    { id:'amplitude', label:'Amplitúdó',    min:1,   max:20,  step:0.5, default:6   },
    { id:'frequency', label:'Frekvencia',   min:1,   max:10,  step:0.5, default:3   },
    { id:'smooth',    label:'Simítás',      min:0,   max:10,  step:1,   default:2   },
  ],
  'spiral': [
    { id:'turns',     label:'Spirálok',     min:20,  max:300, step:1,   default:120 },
    { id:'amplitude', label:'Amplitúdó',    min:1,   max:20,  step:0.5, default:5   },
    { id:'frequency', label:'Frekvencia',   min:1,   max:8,   step:0.5, default:4   },
  ],
  'hatch': [
    { id:'density',   label:'Vonalsűrűség', min:4,   max:60,  step:1,   default:20  },
    { id:'angle',     label:'Szög (fok)',   min:0,   max:180, step:5,   default:45  },
  ],
  'crosshatch': [
    { id:'density',   label:'Vonalsűrűség', min:4,   max:60,  step:1,   default:20  },
    { id:'angle',     label:'Szög (fok)',   min:0,   max:90,  step:5,   default:45  },
  ],
  'concentric': [
    { id:'rings',     label:'Gyűrűk',       min:20,  max:300, step:1,   default:100 },
    { id:'amplitude', label:'Amplitúdó',    min:1,   max:20,  step:0.5, default:5   },
    { id:'frequency', label:'Frekvencia',   min:1,   max:8,   step:0.5, default:4   },
  ],
  'flow': [
    { id:'density',   label:'Vonalak',      min:10,  max:100, step:1,   default:40  },
    { id:'length',    label:'Hossz',        min:10,  max:100, step:1,   default:40  },
    { id:'stepSize',  label:'Lépésköz',     min:1,   max:10,  step:0.5, default:3   },
  ],
  'stipple': [
    { id:'points',    label:'Pontok száma', min:200, max:5000,step:100, default:1500},
    { id:'minSize',   label:'Min méret',    min:0.5, max:5,   step:0.5, default:1   },
    { id:'maxSize',   label:'Max méret',    min:1,   max:10,  step:0.5, default:4   },
    { id:'iterations',label:'Iteráció',     min:1,   max:20,  step:1,   default:8   },
  ],
};

// ── DOM REFS ─────────────────────────────────
const $ = id => document.getElementById(id);
const landing      = $('landing');
const editor       = $('editor');
const previewCanvas= $('previewCanvas');
const previewSpinner=$('previewSpinner');
const cropOverlay  = $('cropOverlay');
const panel        = $('panel');
const fileInput    = $('fileInput');
const fileInputReload = $('fileInputReload');
const ctx          = previewCanvas.getContext('2d');

// ── INIT ─────────────────────────────────────
function init() {
  setupFileHandlers();
  setupTopbar();
  setupTabs();
  setupEditTab();
  setupAlgoTab();
  setupExportTab();
  setupPanelDrag();
  buildAlgoParamSliders(state.algo);
}

// ── FILE HANDLERS ────────────────────────────
function setupFileHandlers() {
  fileInput.addEventListener('change', e => loadFile(e.target.files[0]));
  fileInputReload.addEventListener('change', e => loadFile(e.target.files[0]));

  const dropZone = $('dropZone');
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadFile(file);
  });

  // Global paste
  document.addEventListener('paste', e => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (item) loadFile(item.getAsFile());
  });
}

function loadFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.rotation = 0;
    state.flipH = false;
    state.originalImage = imgToImageData(img);
    state.croppedImage = state.originalImage;
    applyToneAndRender();
    showEditor();
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function imgToImageData(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c.getContext('2d').getImageData(0, 0, c.width, c.height);
}

function showEditor() {
  landing.classList.add('hidden');
  editor.classList.remove('hidden');
}

// ── TOPBAR ───────────────────────────────────
function setupTopbar() {
  $('btnBack').addEventListener('click', () => {
    editor.classList.add('hidden');
    landing.classList.remove('hidden');
  });
  $('btnLoadNew').addEventListener('click', () => fileInputReload.click());
}

// ── TABS ─────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

// ── EDIT TAB ─────────────────────────────────
function setupEditTab() {
  // Rotate
  $('btnRotateCCW').addEventListener('click', () => rotate(-90));
  $('btnRotateCW').addEventListener('click',  () => rotate(90));
  $('btnFlipH').addEventListener('click',     flipHorizontal);
  $('btnCrop').addEventListener('click',      startCrop);

  // Tone sliders
  const toneSliders = [
    ['slBrightness', 'valBrightness', 'brightness', v => v],
    ['slContrast',   'valContrast',   'contrast',   v => v],
    ['slBlackPoint', 'valBlackPoint', 'blackPoint', v => v],
    ['slWhitePoint', 'valWhitePoint', 'whitePoint', v => v],
    ['slGamma',      'valGamma',      'gamma',      v => (v/100).toFixed(1)],
  ];
  toneSliders.forEach(([slId, valId, key, fmt]) => {
    const sl = $(slId), vl = $(valId);
    sl.addEventListener('input', () => {
      const raw = parseFloat(sl.value);
      state.tone[key] = key === 'gamma' ? raw / 100 : raw;
      vl.textContent = fmt(raw);
      debounce(applyToneAndRender, 80)();
    });
  });

  $('btnResetTone').addEventListener('click', () => {
    state.tone = { brightness:0, contrast:0, blackPoint:0, whitePoint:255, gamma:1.0 };
    $('slBrightness').value = 0; $('valBrightness').textContent = '0';
    $('slContrast').value   = 0; $('valContrast').textContent   = '0';
    $('slBlackPoint').value = 0; $('valBlackPoint').textContent = '0';
    $('slWhitePoint').value = 255; $('valWhitePoint').textContent = '255';
    $('slGamma').value = 100; $('valGamma').textContent = '1.0';
    applyToneAndRender();
  });
}

// ── ROTATE / FLIP ────────────────────────────
function rotate(deg) {
  if (!state.croppedImage) return;
  state.rotation = (state.rotation + deg + 360) % 360;
  state.croppedImage = rotateImageData(state.croppedImage, deg);
  applyToneAndRender();
}

function flipHorizontal() {
  if (!state.croppedImage) return;
  state.croppedImage = flipImageData(state.croppedImage);
  applyToneAndRender();
}

function rotateImageData(imgData, deg) {
  const { width: w, height: h, data } = imgData;
  const cw = deg === 90 || deg === -90 ? h : w;
  const ch = deg === 90 || deg === -90 ? w : h;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const cx = c.getContext('2d');
  cx.translate(cw/2, ch/2);
  cx.rotate(deg * Math.PI / 180);
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').putImageData(imgData, 0, 0);
  cx.drawImage(tmp, -w/2, -h/2);
  return cx.getImageData(0, 0, cw, ch);
}

function flipImageData(imgData) {
  const { width: w, height: h } = imgData;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d');
  cx.translate(w, 0);
  cx.scale(-1, 1);
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').putImageData(imgData, 0, 0);
  cx.drawImage(tmp, 0, 0);
  return cx.getImageData(0, 0, w, h);
}

// ── CROP ─────────────────────────────────────
let cropState = { startX:0, startY:0, x:0, y:0, w:0, h:0, dragging:false, handle:null, ratio:'free' };

function startCrop() {
  if (!state.croppedImage) return;
  cropOverlay.classList.remove('hidden');

  const wrap = $('previewWrap');
  const canvas = $('cropCanvas');
  canvas.width = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  const cc = canvas.getContext('2d');

  // Draw current image onto crop canvas background
  const img = state.croppedImage;
  const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  const dx = (canvas.width - dw) / 2, dy = (canvas.height - dh) / 2;

  const tmp = document.createElement('canvas');
  tmp.width = img.width; tmp.height = img.height;
  tmp.getContext('2d').putImageData(img, 0, 0);
  cc.drawImage(tmp, dx, dy, dw, dh);

  // Init crop box to full image area
  const box = $('cropBox');
  cropState = { ix:dx, iy:dy, iw:dw, ih:dh, x:dx, y:dy, w:dw, h:dh, ratio:'free', imgW:img.width, imgH:img.height, scale };
  positionCropBox();

  // Ratio buttons
  document.querySelectorAll('.ratio-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.ratio-btn').forEach(rb => rb.classList.remove('active'));
      b.classList.add('active');
      cropState.ratio = b.dataset.ratio;
      if (cropState.ratio !== 'free') enforceRatio();
      positionCropBox();
    });
  });

  setupCropDrag();

  $('cropReset').onclick = () => {
    cropState.x = cropState.ix; cropState.y = cropState.iy;
    cropState.w = cropState.iw; cropState.h = cropState.ih;
    positionCropBox();
  };
  $('cropApply').onclick = applyCrop;
}

function positionCropBox() {
  const box = $('cropBox');
  box.style.left   = cropState.x + 'px';
  box.style.top    = cropState.y + 'px';
  box.style.width  = cropState.w + 'px';
  box.style.height = cropState.h + 'px';
}

function enforceRatio() {
  const r = parseFloat(cropState.ratio);
  cropState.h = cropState.w / r;
  if (cropState.y + cropState.h > cropState.iy + cropState.ih) {
    cropState.h = cropState.iy + cropState.ih - cropState.y;
    cropState.w = cropState.h * r;
  }
}

function setupCropDrag() {
  const box = $('cropBox');
  const handles = $('cropHandles');

  let drag = { active:false, type:null, sx:0, sy:0, bx:0, by:0, bw:0, bh:0 };

  function pointerDown(e, type) {
    e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;
    drag = { active:true, type, sx:pt.clientX, sy:pt.clientY,
             bx:cropState.x, by:cropState.y, bw:cropState.w, bh:cropState.h };
    document.addEventListener('mousemove', pointerMove);
    document.addEventListener('touchmove', pointerMove, {passive:false});
    document.addEventListener('mouseup',   pointerUp);
    document.addEventListener('touchend',  pointerUp);
  }

  box.addEventListener('mousedown',  e => pointerDown(e, 'move'));
  box.addEventListener('touchstart', e => pointerDown(e, 'move'), {passive:false});

  box.querySelectorAll('.crop-corner').forEach(corner => {
    const type = corner.classList[1]; // tl, tr, bl, br
    corner.addEventListener('mousedown',  e => { e.stopPropagation(); pointerDown(e, type); });
    corner.addEventListener('touchstart', e => { e.stopPropagation(); pointerDown(e, type); }, {passive:false});
  });

  function pointerMove(e) {
    if (!drag.active) return;
    e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - drag.sx, dy = pt.clientY - drag.sy;
    const { ix,iy,iw,ih } = cropState;
    const minSize = 30;

    if (drag.type === 'move') {
      cropState.x = Math.max(ix, Math.min(ix+iw-drag.bw, drag.bx + dx));
      cropState.y = Math.max(iy, Math.min(iy+ih-drag.bh, drag.by + dy));
    } else if (drag.type === 'br') {
      cropState.w = Math.max(minSize, Math.min(ix+iw-drag.bx, drag.bw + dx));
      cropState.h = Math.max(minSize, Math.min(iy+ih-drag.by, drag.bh + dy));
    } else if (drag.type === 'bl') {
      const nw = Math.max(minSize, drag.bw - dx);
      cropState.x = drag.bx + drag.bw - nw;
      cropState.w = nw;
      cropState.h = Math.max(minSize, Math.min(iy+ih-drag.by, drag.bh + dy));
    } else if (drag.type === 'tr') {
      cropState.w = Math.max(minSize, Math.min(ix+iw-drag.bx, drag.bw + dx));
      const nh = Math.max(minSize, drag.bh - dy);
      cropState.y = drag.by + drag.bh - nh;
      cropState.h = nh;
    } else if (drag.type === 'tl') {
      const nw = Math.max(minSize, drag.bw - dx);
      cropState.x = drag.bx + drag.bw - nw;
      cropState.w = nw;
      const nh = Math.max(minSize, drag.bh - dy);
      cropState.y = drag.by + drag.bh - nh;
      cropState.h = nh;
    }

    if (cropState.ratio !== 'free') enforceRatio();
    positionCropBox();
  }

  function pointerUp() {
    drag.active = false;
    document.removeEventListener('mousemove', pointerMove);
    document.removeEventListener('touchmove', pointerMove);
    document.removeEventListener('mouseup',   pointerUp);
    document.removeEventListener('touchend',  pointerUp);
  }
}

function applyCrop() {
  const { x, y, w, h, ix, iy, scale, imgW, imgH } = cropState;
  // Convert screen coords back to image coords
  const sx = Math.round((x - ix) / scale);
  const sy = Math.round((y - iy) / scale);
  const sw = Math.round(w / scale);
  const sh = Math.round(h / scale);

  const tmp = document.createElement('canvas');
  tmp.width = cropState.imgW; tmp.height = cropState.imgH;
  tmp.getContext('2d').putImageData(state.croppedImage, 0, 0);

  const out = document.createElement('canvas');
  out.width = sw; out.height = sh;
  out.getContext('2d').drawImage(tmp, sx, sy, sw, sh, 0, 0, sw, sh);

  state.croppedImage = out.getContext('2d').getImageData(0, 0, sw, sh);
  cropOverlay.classList.add('hidden');
  applyToneAndRender();
}

// ── TONE PROCESSING ──────────────────────────
function applyTone(imgData) {
  const { brightness, contrast, blackPoint, whitePoint, gamma } = state.tone;
  const src = new Uint8ClampedArray(imgData.data);
  const out = document.createElement('canvas');
  out.width = imgData.width; out.height = imgData.height;
  const octx = out.getContext('2d');
  const outData = octx.createImageData(imgData.width, imgData.height);
  const d = outData.data;

  // Build LUT (256 entries)
  const lut = new Uint8Array(256);
  const range = whitePoint - blackPoint;
  for (let i = 0; i < 256; i++) {
    let v = i;
    // Black/white point
    v = range > 0 ? ((v - blackPoint) / range) * 255 : 0;
    // Brightness
    v += brightness * 2.55;
    // Contrast
    const f = (259 * (contrast + 255)) / (255 * (259 - contrast));
    v = f * (v - 128) + 128;
    // Gamma
    if (gamma !== 1.0) v = Math.pow(Math.max(0, v) / 255, 1 / gamma) * 255;
    lut[i] = Math.max(0, Math.min(255, Math.round(v)));
  }

  for (let i = 0; i < src.length; i += 4) {
    d[i]   = lut[src[i]];
    d[i+1] = lut[src[i+1]];
    d[i+2] = lut[src[i+2]];
    d[i+3] = src[i+3];
  }
  return outData;
}

function applyToneAndRender() {
  if (!state.croppedImage) return;
  state.processedImage = applyTone(state.croppedImage);
  drawProcessedToCanvas();
}

function drawProcessedToCanvas() {
  const img = state.processedImage;
  if (!img) return;

  const wrap = $('previewWrap');
  const maxW = wrap.clientWidth  || 400;
  const maxH = wrap.clientHeight || 400;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);

  previewCanvas.width  = Math.round(img.width  * scale);
  previewCanvas.height = Math.round(img.height * scale);

  const tmp = document.createElement('canvas');
  tmp.width = img.width; tmp.height = img.height;
  tmp.getContext('2d').putImageData(img, 0, 0);

  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  ctx.drawImage(tmp, 0, 0, previewCanvas.width, previewCanvas.height);
}

// ── ALGO TAB ─────────────────────────────────
function setupAlgoTab() {
  $('algoGrid').querySelectorAll('.algo-card').forEach(card => {
    card.addEventListener('click', () => {
      $('algoGrid').querySelectorAll('.algo-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.algo = card.dataset.algo;
      buildAlgoParamSliders(state.algo);
    });
  });

  $('lineColor').addEventListener('input', e => { state.lineColor = e.target.value; });
  $('bgColor').addEventListener('input',   e => { state.bgColor   = e.target.value; });

  $('btnRender').addEventListener('click', runRender);
}

function buildAlgoParamSliders(algo) {
  const params = ALGO_PARAMS[algo] || [];
  state.algoParams = {};
  params.forEach(p => state.algoParams[p.id] = p.default);

  const container = $('paramSliders');
  container.innerHTML = '';
  params.forEach(p => {
    state.algoParams[p.id] = p.default;
    const row = document.createElement('div');
    row.className = 'param-slider-row';
    row.innerHTML = `
      <label>${p.label}</label>
      <input type="range" class="slider" id="param_${p.id}"
             min="${p.min}" max="${p.max}" step="${p.step}" value="${p.default}">
      <span class="slider-val" id="paramval_${p.id}">${p.default}</span>
    `;
    container.appendChild(row);

    const sl = row.querySelector('input');
    const vl = row.querySelector('.slider-val');
    sl.addEventListener('input', () => {
      state.algoParams[p.id] = parseFloat(sl.value);
      vl.textContent = sl.value;
    });
  });
}

// ── RENDER ENGINE ────────────────────────────
function runRender() {
  if (!state.processedImage) return;
  previewSpinner.classList.remove('hidden');

  setTimeout(() => {
    try {
      const paths = renderAlgo(state.processedImage, state.algo, state.algoParams);
      state.renderedPaths = paths;
      drawPathsToCanvas(paths, state.processedImage.width, state.processedImage.height);
    } catch(e) {
      console.error(e);
      showToast('Render hiba: ' + e.message);
    }
    previewSpinner.classList.add('hidden');
  }, 30);
}

// ── Convert ImageData to grayscale map ───────
function getGrayMap(imgData) {
  const { width: w, height: h, data } = imgData;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i*4], g = data[i*4+1], b = data[i*4+2];
    gray[i] = (0.299*r + 0.587*g + 0.114*b) / 255;
  }
  return { gray, w, h };
}

function sampleGray(gray, w, h, x, y) {
  const xi = Math.max(0, Math.min(w-1, Math.round(x)));
  const yi = Math.max(0, Math.min(h-1, Math.round(y)));
  return gray[yi * w + xi];
}

function gaussianBlur(gray, w, h, radius) {
  if (radius < 1) return gray;
  // Simple box blur approximation
  const out = new Float32Array(gray.length);
  const r = Math.max(1, Math.round(radius));
  const size = 2*r+1;
  // horizontal
  const tmp = new Float32Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const xi = Math.max(0, Math.min(w-1, x+k));
        sum += gray[y*w+xi];
      }
      tmp[y*w+x] = sum / size;
    }
  }
  // vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const yi = Math.max(0, Math.min(h-1, y+k));
        sum += tmp[yi*w+x];
      }
      out[y*w+x] = sum / size;
    }
  }
  return out;
}

// ── ALGORITHM IMPLEMENTATIONS ────────────────

function renderAlgo(imgData, algo, params) {
  const { gray, w, h } = getGrayMap(imgData);
  switch(algo) {
    case 'squiggle-h':  return renderSquiggleH(gray, w, h, params);
    case 'squiggle-v':  return renderSquiggleV(gray, w, h, params);
    case 'spiral':      return renderSpiral(gray, w, h, params);
    case 'hatch':       return renderHatch(gray, w, h, params, false);
    case 'crosshatch':  return renderHatch(gray, w, h, params, true);
    case 'concentric':  return renderConcentric(gray, w, h, params);
    case 'flow':        return renderFlowField(gray, w, h, params);
    case 'stipple':     return renderStipple(gray, w, h, params);
    default:            return [];
  }
}

// 1. HORIZONTAL SQUIGGLE
function renderSquiggleH(gray, w, h, params) {
  const { density, amplitude, frequency, smooth } = params;
  const blurred = gaussianBlur(gray, w, h, smooth);
  const paths = [];
  const rowCount = Math.round(density);
  const rowH = h / rowCount;

  for (let row = 0; row < rowCount; row++) {
    const y0 = (row + 0.5) * rowH;
    let d = '';
    let prevX = -1, prevY = -1;
    const resolution = Math.max(1, Math.round(w / 300));

    for (let x = 0; x <= w; x += resolution) {
      const brightness = sampleGray(blurred, w, h, x, y0);
      const darkness = 1 - brightness;
      const amp = darkness * amplitude * rowH * 0.45;
      const freq = frequency;
      const phase = (x / w) * Math.PI * 2 * freq * (w / rowH);
      const yOff = Math.sin(phase) * amp;
      const px = x, py = y0 + yOff;

      if (prevX < 0) d = `M${px.toFixed(1)},${py.toFixed(1)}`;
      else d += ` L${px.toFixed(1)},${py.toFixed(1)}`;
      prevX = px; prevY = py;
    }
    if (d) paths.push(d);
  }
  return paths;
}

// 2. VERTICAL SQUIGGLE
function renderSquiggleV(gray, w, h, params) {
  const { density, amplitude, frequency, smooth } = params;
  const blurred = gaussianBlur(gray, w, h, smooth);
  const paths = [];
  const colCount = Math.round(density);
  const colW = w / colCount;

  for (let col = 0; col < colCount; col++) {
    const x0 = (col + 0.5) * colW;
    let d = '';
    const resolution = Math.max(1, Math.round(h / 300));

    for (let y = 0; y <= h; y += resolution) {
      const brightness = sampleGray(blurred, w, h, x0, y);
      const darkness = 1 - brightness;
      const amp = darkness * amplitude * colW * 0.45;
      const phase = (y / h) * Math.PI * 2 * frequency * (h / colW);
      const xOff = Math.sin(phase) * amp;
      const px = x0 + xOff, py = y;

      if (y === 0) d = `M${px.toFixed(1)},${py.toFixed(1)}`;
      else d += ` L${px.toFixed(1)},${py.toFixed(1)}`;
    }
    if (d) paths.push(d);
  }
  return paths;
}

// 3. ARCHIMEDEAN SPIRAL
function renderSpiral(gray, w, h, params) {
  const { turns, amplitude, frequency } = params;
  const cx = w / 2, cy = h / 2;
  const maxR = Math.min(w, h) / 2;
  const totalAngle = turns * Math.PI * 2;
  const stepsPerTurn = 120;
  const totalSteps = Math.round(turns * stepsPerTurn);

  let d = '';
  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps;
    const angle = t * totalAngle;
    const r = t * maxR;
    const brightness = sampleGray(gray, w, h, cx + Math.cos(angle)*r*0.9, cy + Math.sin(angle)*r*0.9);
    const darkness = 1 - brightness;
    const ripple = Math.sin(angle * frequency) * darkness * amplitude * (maxR / turns) * 0.5;
    const pr = r + ripple;
    const px = cx + Math.cos(angle) * pr;
    const py = cy + Math.sin(angle) * pr;
    if (i === 0) d = `M${px.toFixed(1)},${py.toFixed(1)}`;
    else d += ` L${px.toFixed(1)},${py.toFixed(1)}`;
  }
  return d ? [d] : [];
}

// 4 & 5. HATCH (with optional cross)
function renderHatch(gray, w, h, params, cross) {
  const { density, angle } = params;
  const paths = [];
  const spacing = Math.max(2, Math.round(Math.min(w,h) / density));
  const rad = angle * Math.PI / 180;

  function makeHatchLines(angleRad) {
    const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
    const diag = Math.sqrt(w*w + h*h);
    const cx = w/2, cy = h/2;

    for (let offset = -diag; offset <= diag; offset += spacing) {
      const x1 = cx + cos * (-diag) - sin * offset;
      const y1 = cy + sin * (-diag) + cos * offset;
      const x2 = cx + cos * diag    - sin * offset;
      const y2 = cy + sin * diag    + cos * offset;

      // Sample brightness along line
      const steps = Math.round(Math.sqrt((x2-x1)**2 + (y2-y1)**2) / spacing);
      let segStart = null, lastDark = false;
      let d = '';

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = x1 + (x2-x1)*t, py = y1 + (y2-y1)*t;
        if (px < 0 || px > w || py < 0 || py > h) continue;
        const brightness = sampleGray(gray, w, h, px, py);
        const isDark = brightness < 0.9;

        if (isDark && !lastDark) {
          d += `M${px.toFixed(1)},${py.toFixed(1)}`;
        } else if (isDark) {
          d += ` L${px.toFixed(1)},${py.toFixed(1)}`;
        } else if (lastDark) {
          // end segment
        }
        lastDark = isDark;
      }
      if (d) paths.push(d);
    }
  }

  makeHatchLines(rad);
  if (cross) makeHatchLines(rad + Math.PI/2);
  return paths;
}

// 6. CONCENTRIC CIRCLES
function renderConcentric(gray, w, h, params) {
  const { rings, amplitude, frequency } = params;
  const cx = w/2, cy = h/2;
  const maxR = Math.min(w,h)/2;
  const paths = [];

  for (let ri = 1; ri <= rings; ri++) {
    const baseR = (ri / rings) * maxR;
    const stepsPerRing = Math.round(Math.PI * 2 * baseR / 2);
    let d = '';

    for (let s = 0; s <= stepsPerRing; s++) {
      const angle = (s / stepsPerRing) * Math.PI * 2;
      const px0 = cx + Math.cos(angle) * baseR;
      const py0 = cy + Math.sin(angle) * baseR;
      const brightness = sampleGray(gray, w, h, px0, py0);
      const darkness = 1 - brightness;
      const ripple = Math.sin(angle * frequency) * darkness * amplitude * (maxR/rings) * 0.5;
      const r = baseR + ripple;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (s === 0) d = `M${px.toFixed(1)},${py.toFixed(1)}`;
      else d += ` L${px.toFixed(1)},${py.toFixed(1)}`;
    }
    if (d) paths.push(d + ' Z');
  }
  return paths;
}

// 7. FLOW FIELD
function renderFlowField(gray, w, h, params) {
  const { density, length, stepSize } = params;
  // Compute gradient direction field from gray map
  const gradX = new Float32Array(w * h);
  const gradY = new Float32Array(w * h);
  for (let y = 1; y < h-1; y++) {
    for (let x = 1; x < w-1; x++) {
      gradX[y*w+x] = sampleGray(gray,w,h,x+1,y) - sampleGray(gray,w,h,x-1,y);
      gradY[y*w+x] = sampleGray(gray,w,h,x,y+1) - sampleGray(gray,w,h,x,y-1);
    }
  }

  const paths = [];
  const spacing = Math.round(Math.min(w,h) / density);
  const maxLen = Math.round(length);

  for (let y = spacing/2; y < h; y += spacing) {
    for (let x = spacing/2; x < w; x += spacing) {
      const brightness = sampleGray(gray, w, h, x, y);
      if (brightness > 0.95) continue;

      let cx = x, cy = y;
      let d = `M${cx.toFixed(1)},${cy.toFixed(1)}`;
      for (let step = 0; step < maxLen; step++) {
        const xi = Math.max(0, Math.min(w-1, Math.round(cx)));
        const yi = Math.max(0, Math.min(h-1, Math.round(cy)));
        const gx = gradX[yi*w+xi], gy = gradY[yi*w+xi];
        const mag = Math.sqrt(gx*gx + gy*gy) || 0.001;
        // Perpendicular to gradient = flow along iso-brightness lines
        const nx = -gy/mag, ny = gx/mag;
        cx += nx * stepSize; cy += ny * stepSize;
        if (cx < 0 || cx > w || cy < 0 || cy > h) break;
        d += ` L${cx.toFixed(1)},${cy.toFixed(1)}`;
      }
      paths.push(d);
    }
  }
  return paths;
}

// 8. STIPPLE (weighted random + Lloyd relaxation approx)
function renderStipple(gray, w, h, params) {
  const { points: nPoints, minSize, maxSize, iterations } = params;

  // Initialize points with weighted random distribution
  let pts = [];
  const attempts = nPoints * 10;
  for (let i = 0; i < attempts && pts.length < nPoints; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const brightness = sampleGray(gray, w, h, x, y);
    const darkness = 1 - brightness;
    if (Math.random() < darkness * 0.9 + 0.05) pts.push({x, y});
  }

  // Lloyd relaxation (simplified: just jitter toward dark areas)
  for (let iter = 0; iter < iterations; iter++) {
    pts = pts.map(p => {
      let bx = p.x, by = p.y, best = sampleGray(gray,w,h,p.x,p.y);
      const r = 8;
      for (let t = 0; t < 6; t++) {
        const nx = p.x + (Math.random()-0.5)*r*2;
        const ny = p.y + (Math.random()-0.5)*r*2;
        if (nx<0||nx>w||ny<0||ny>h) continue;
        const g = 1 - sampleGray(gray,w,h,nx,ny);
        if (g > best) { best = g; bx = nx; by = ny; }
      }
      return { x:bx, y:by, size:(best*(maxSize-minSize)+minSize) };
    });
  }

  // Return as small circle paths
  return pts.map(p => {
    const r = (p.size || minSize) * 0.5;
    return `M${(p.x+r).toFixed(1)},${p.y.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 1 0 ${(p.x-r).toFixed(1)},${p.y.toFixed(1)} Z`;
  });
}

// ── DRAW PATHS TO CANVAS ─────────────────────
function drawPathsToCanvas(paths, imgW, imgH) {
  const wrap = $('previewWrap');
  const maxW = wrap.clientWidth  || 600;
  const maxH = wrap.clientHeight || 600;
  const scale = Math.min(maxW / imgW, maxH / imgH, 1);

  previewCanvas.width  = Math.round(imgW * scale);
  previewCanvas.height = Math.round(imgH * scale);

  ctx.fillStyle = state.bgColor;
  ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
  ctx.strokeStyle = state.lineColor;
  ctx.fillStyle   = state.lineColor;
  ctx.lineWidth   = Math.max(0.5, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.save();
  ctx.scale(scale, scale);
  paths.forEach(d => {
    const p = new Path2D(d);
    if (d.endsWith('Z')) ctx.fill(p);
    else ctx.stroke(p);
  });
  ctx.restore();
}

// ── EXPORT TAB ───────────────────────────────
function setupExportTab() {
  document.querySelectorAll('.paper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.paper-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const w = parseInt(btn.dataset.w), h = parseInt(btn.dataset.h);
      if (w === 0) {
        $('paperCustom').style.display = '';
      } else {
        $('paperCustom').style.display = 'none';
        state.paper.w = w;
        state.paper.h = h;
      }
    });
  });

  $('slMargin').addEventListener('input', e => {
    state.paper.margin = parseInt(e.target.value);
    $('valMargin').textContent = e.target.value;
  });

  $('btnExport').addEventListener('click', doExport);
}

function doExport() {
  if (!state.renderedPaths && !state.processedImage) {
    showToast('Először renderelje a képet az Algoritmus fülön!');
    return;
  }

  const fmt = document.querySelector('input[name="format"]:checked').value;

  if (fmt === 'svg') exportSVG();
  else exportRaster(fmt);
}

function exportSVG() {
  if (!state.renderedPaths) {
    showToast('Először kattints a Renderelés gombra!');
    return;
  }

  const { w: pw, h: ph, margin: pm } = state.paper;
  const imgW = state.processedImage.width;
  const imgH = state.processedImage.height;

  // Scale to fit paper with margin
  const availW = pw - pm*2, availH = ph - pm*2;
  const scale = Math.min(availW/imgW, availH/imgH);
  const dw = imgW * scale, dh = imgH * scale;
  const ox = pm + (availW - dw) / 2;
  const oy = pm + (availH - dh) / 2;

  const pathsStr = state.renderedPaths.map(d => {
    const scaled = scalePathData(d, scale, ox, oy);
    return `  <path d="${scaled}" fill="${d.endsWith('Z') ? state.lineColor : 'none'}" stroke="${state.lineColor}" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pw}mm" height="${ph}mm" viewBox="0 0 ${pw} ${ph}">
  <rect width="${pw}" height="${ph}" fill="${state.bgColor}"/>
${pathsStr}
</svg>`;

  downloadBlob(new Blob([svg], {type:'image/svg+xml'}), 'plottercam.svg');
}

function scalePathData(d, s, ox, oy) {
  return d.replace(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g, (_, x, y) => {
    return `${(parseFloat(x)*s + ox).toFixed(2)},${(parseFloat(y)*s + oy).toFixed(2)}`;
  });
}

function exportRaster(fmt) {
  const { w: pw, h: ph, margin: pm } = state.paper;
  const dpi = 150;
  const mmPerIn = 25.4;
  const canvasW = Math.round(pw / mmPerIn * dpi);
  const canvasH = Math.round(ph / mmPerIn * dpi);

  const c = document.createElement('canvas');
  c.width = canvasW; c.height = canvasH;
  const cc = c.getContext('2d');
  cc.fillStyle = state.bgColor;
  cc.fillRect(0, 0, canvasW, canvasH);

  if (state.renderedPaths) {
    const imgW = state.processedImage.width;
    const imgH = state.processedImage.height;
    const availW = canvasW - pm/mmPerIn*dpi*2;
    const availH = canvasH - pm/mmPerIn*dpi*2;
    const scale = Math.min(availW/imgW, availH/imgH);
    const ox = pm/mmPerIn*dpi + (availW - imgW*scale)/2;
    const oy = pm/mmPerIn*dpi + (availH - imgH*scale)/2;

    cc.strokeStyle = state.lineColor;
    cc.fillStyle   = state.lineColor;
    cc.lineWidth   = Math.max(0.5, scale * 0.5);
    cc.lineCap = 'round'; cc.lineJoin = 'round';
    cc.save();
    cc.translate(ox, oy);
    cc.scale(scale, scale);
    state.renderedPaths.forEach(d => {
      const p = new Path2D(d);
      if (d.endsWith('Z')) cc.fill(p);
      else cc.stroke(p);
    });
    cc.restore();
  } else {
    // Just export the processed image
    const img = state.processedImage;
    const tmp = document.createElement('canvas');
    tmp.width = img.width; tmp.height = img.height;
    tmp.getContext('2d').putImageData(img, 0, 0);
    const scale = Math.min(canvasW/img.width, canvasH/img.height);
    cc.drawImage(tmp, (canvasW-img.width*scale)/2, (canvasH-img.height*scale)/2, img.width*scale, img.height*scale);
  }

  const mime = fmt === 'jpg' ? 'image/jpeg' : 'image/png';
  const quality = fmt === 'jpg' ? 0.92 : undefined;
  c.toBlob(blob => downloadBlob(blob, `plottercam.${fmt}`), mime, quality);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`✓ ${filename} letöltve`);
}

// ── PANEL DRAG (mobile) ──────────────────────
function setupPanelDrag() {
  const handle = $('panelDragHandle');
  if (!handle) return;
  let startY = 0, startH = 0, dragging = false;

  function onDown(e) {
    if (window.innerWidth >= 768) return;
    const pt = e.touches ? e.touches[0] : e;
    startY = pt.clientY;
    startH = panel.clientHeight;
    dragging = true;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, {passive:false});
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
  }

  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;
    const dy = startY - pt.clientY;
    const newH = Math.max(52, Math.min(window.innerHeight * 0.85, startH + dy));
    panel.style.height = newH + 'px';
  }

  function onUp() {
    dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchend', onUp);
    // Snap
    const h = panel.clientHeight;
    const total = window.innerHeight;
    if (h < total * 0.25) panel.style.height = '52px';
    else if (h > total * 0.6) panel.style.height = '80vh';
    else panel.style.height = '52vh';
  }

  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, {passive:false});
}

// ── TOAST ────────────────────────────────────
let toastTimer;
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── DEBOUNCE ─────────────────────────────────
const debounceTimers = {};
function debounce(fn, delay) {
  return function(...args) {
    const key = fn.toString().slice(0,20);
    clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ── RESIZE ───────────────────────────────────
window.addEventListener('resize', debounce(() => {
  if (state.processedImage) {
    if (state.renderedPaths) drawPathsToCanvas(state.renderedPaths, state.processedImage.width, state.processedImage.height);
    else drawProcessedToCanvas();
  }
}, 200));

// ── START ────────────────────────────────────
init();
