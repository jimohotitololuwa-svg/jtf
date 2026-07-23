/* ============================================================
   TEENS MEET 3.0 — HIGHER GROUND — FLYER GENERATOR
   Vanilla JS. No frameworks. No emojis.
   ============================================================ */

(() => {
  'use strict';

  /* ---------------- Template geometry constants ----------------
     These describe where the square photo frame sits inside the
     flyer template (flyer-template.png), which has already had the
     placeholder square punched out to transparency. Coordinates are
     expressed in the template's native 1254x1254 pixel space.
  ----------------------------------------------------------------- */
  const TEMPLATE_SIZE = 1254;
  const FRAME = { x: 413, y: 484, w: 428, h: 431 };
  const FRAME_OVERSCAN = 10; // px in template space, prevents seam gaps
  const OUTPUT_SIZE = 2048;
  const MAX_FILE_MB = 10;
  const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  /* ---------------- Element references ---------------- */
  const el = (id) => document.getElementById(id);

  const dropzone = el('dropzone');
  const fileInput = el('fileInput');
  const browseBtn = el('browseBtn');
  const uploadError = el('uploadError');
  const uploadCard = el('uploadCard');

  const heroSection = el('hero');
  const editorSection = el('editorSection');
  const resultSection = el('resultSection');

  const editorStage = el('editorStage');
  const editorCanvas = el('editorCanvas');
  const previewCanvas = el('previewCanvas');
  const finalCanvas = el('finalCanvas');

  const zoomRange = el('zoomRange');
  const rotateRange = el('rotateRange');
  const manualCropBtn = el('manualCropBtn');
  const autoCropBtn = el('autoCropBtn');
  const resetBtn = el('resetBtn');
  const changePhotoBtn = el('changePhotoBtn');
  const generateBtn = el('generateBtn');

  const downloadBtn = el('downloadBtn');
  const shareBtn = el('shareBtn');
  const generateAnotherBtn = el('generateAnotherBtn');

  const loaderOverlay = el('loaderOverlay');
  const loaderMessage = el('loaderMessage');
  const loaderProgressBar = el('loaderProgressBar');
  const loaderParticles = el('loaderParticles');

  const shareModal = el('shareModal');
  const shareModalClose = el('shareModalClose');
  const shareToast = el('shareToast');

  const versePopup = el('versePopup');
  const versePopupHeader = el('versePopupHeader');
  const verseReference = el('verseReference');
  const verseText = el('verseText');
  const verseMinimizeBtn = el('verseMinimizeBtn');
  const verseCloseBtn = el('verseCloseBtn');
  const versePrevBtn = el('versePrevBtn');
  const verseNextBtn = el('verseNextBtn');
  const verseBubble = el('verseBubble');

  /* ---------------- Template image (preloaded) ---------------- */
  const templateImg = new Image();
  templateImg.src = FLYER_TEMPLATE_DATA_URI;
  let templateReady = false;
  templateImg.onload = () => { templateReady = true; drawPreview(); };
  templateImg.onerror = () => { console.error('Flyer template image failed to load.'); };

  /* ---------------- Photo editor state ---------------- */
  const photo = {
    img: null,
    naturalW: 0,
    naturalH: 0,
    zoom: 100,       // percent, 100 = cover-fit
    rotation: 0,     // degrees
    offsetXNorm: 0,  // normalized to frame size
    offsetYNorm: 0,
  };

  const EDITOR_RES = 640; // internal editor canvas resolution

  function resetPhotoTransform() {
    photo.zoom = 100;
    photo.rotation = 0;
    photo.offsetXNorm = 0;
    photo.offsetYNorm = 0;
    zoomRange.value = 100;
    rotateRange.value = 0;
  }

  /* ---------------- Core draw routine ----------------
     Draws the user's photo, transformed per current state, centered
     at (centerX, centerY) inside a square region of size S, onto ctx.
     Clipped to the given clip rect so it never spills outside the
     designated frame area.
  ----------------------------------------------------------------- */
  function drawPhotoInto(ctx, S, centerX, centerY, clipRect) {
    if (!photo.img) return;
    ctx.save();
    if (clipRect) {
      ctx.beginPath();
      ctx.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h);
      ctx.clip();
    }
    const baseScale = S / Math.min(photo.naturalW, photo.naturalH);
    const k = baseScale * (photo.zoom / 100);
    const dw = photo.naturalW * k;
    const dh = photo.naturalH * k;
    const offsetXpx = photo.offsetXNorm * S;
    const offsetYpx = photo.offsetYNorm * S;

    ctx.translate(centerX + offsetXpx, centerY + offsetYpx);
    ctx.rotate((photo.rotation * Math.PI) / 180);
    ctx.drawImage(photo.img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  /* ---------------- Editor canvas render ---------------- */
  function drawEditor() {
    editorCanvas.width = EDITOR_RES;
    editorCanvas.height = EDITOR_RES;
    const ctx = editorCanvas.getContext('2d');
    ctx.clearRect(0, 0, EDITOR_RES, EDITOR_RES);
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, EDITOR_RES, EDITOR_RES);
    drawPhotoInto(ctx, EDITOR_RES, EDITOR_RES / 2, EDITOR_RES / 2, null);
  }

  /* ---------------- Flyer composite render ----------------
     Used for both the live preview and the final high-res export.
  ----------------------------------------------------------------- */
  function renderFlyer(ctx, size) {
    const scale = size / TEMPLATE_SIZE;
    ctx.clearRect(0, 0, size, size);

    // Background fallback while template loads
    ctx.fillStyle = '#0B0B0B';
    ctx.fillRect(0, 0, size, size);

    const fx = (FRAME.x - FRAME_OVERSCAN) * scale;
    const fy = (FRAME.y - FRAME_OVERSCAN) * scale;
    const fw = (FRAME.w + FRAME_OVERSCAN * 2) * scale;
    const fh = (FRAME.h + FRAME_OVERSCAN * 2) * scale;
    const centerX = (FRAME.x + FRAME.w / 2) * scale;
    const centerY = (FRAME.y + FRAME.h / 2) * scale;
    const frameSize = Math.min(FRAME.w, FRAME.h) * scale;

    if (photo.img) {
      drawPhotoInto(ctx, frameSize, centerX, centerY, { x: fx, y: fy, w: fw, h: fh });
    }

    if (templateReady) {
      ctx.drawImage(templateImg, 0, 0, size, size);
    }
  }

  function drawPreview() {
    const size = 630;
    previewCanvas.width = size;
    previewCanvas.height = size;
    renderFlyer(previewCanvas.getContext('2d'), size);
  }

  function scheduleRedraw() {
    drawEditor();
    drawPreview();
  }

  /* ================================================================
     UPLOAD HANDLING
     ================================================================ */

  function showUploadError(msg) {
    uploadError.textContent = msg;
    uploadError.hidden = false;
  }
  function clearUploadError() {
    uploadError.hidden = true;
    uploadError.textContent = '';
  }

  function validateFile(file) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Please upload a PNG, JPG, JPEG or WEBP image.';
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      return `Your file is too large. Maximum size is ${MAX_FILE_MB}MB.`;
    }
    return null;
  }

  function handleFile(file) {
    clearUploadError();
    const err = validateFile(file);
    if (err) {
      showUploadError(err);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        photo.img = img;
        photo.naturalW = img.naturalWidth;
        photo.naturalH = img.naturalHeight;
        resetPhotoTransform();
        goToEditor();
        scheduleRedraw();
      };
      img.onerror = () => showUploadError('That image could not be read. Please try another file.');
      img.src = e.target.result;
    };
    reader.onerror = () => showUploadError('That file could not be read. Please try again.');
    reader.readAsDataURL(file);
  }

  browseBtn.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  /* ================================================================
     SECTION NAVIGATION
     ================================================================ */

  function goToEditor() {
    heroSection.hidden = true;
    resultSection.hidden = true;
    editorSection.hidden = false;
    editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function goToHero() {
    editorSection.hidden = true;
    resultSection.hidden = true;
    heroSection.hidden = false;
    fileInput.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function goToResult() {
    editorSection.hidden = true;
    heroSection.hidden = true;
    resultSection.hidden = false;
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  changePhotoBtn.addEventListener('click', goToHero);
  generateAnotherBtn.addEventListener('click', goToHero);

  /* ================================================================
     EDITOR CONTROLS: zoom, rotate, drag, reset, auto/manual crop
     ================================================================ */

  zoomRange.addEventListener('input', () => {
    photo.zoom = Number(zoomRange.value);
    scheduleRedraw();
  });
  rotateRange.addEventListener('input', () => {
    photo.rotation = Number(rotateRange.value);
    scheduleRedraw();
  });

  resetBtn.addEventListener('click', () => {
    resetPhotoTransform();
    scheduleRedraw();
  });
  autoCropBtn.addEventListener('click', () => {
    // No face-detection library is available in this offline build, so
    // Auto Crop intelligently falls back to a centered, cover-fit crop.
    resetPhotoTransform();
    scheduleRedraw();
    pulseStage();
  });
  manualCropBtn.addEventListener('click', () => {
    editorStage.focus();
    pulseStage();
  });

  function pulseStage() {
    editorStage.style.boxShadow = '0 0 0 3px rgba(245,166,35,0.6)';
    setTimeout(() => { editorStage.style.boxShadow = ''; }, 350);
  }

  // Drag to reposition (pointer events unify mouse + touch)
  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let offsetStart = { x: 0, y: 0 };

  editorStage.addEventListener('pointerdown', (e) => {
    if (!photo.img) return;
    dragging = true;
    editorStage.setPointerCapture(e.pointerId);
    const rect = editorStage.getBoundingClientRect();
    dragStart.x = e.clientX;
    dragStart.y = e.clientY;
    offsetStart.x = photo.offsetXNorm;
    offsetStart.y = photo.offsetYNorm;
    editorStage._rectW = rect.width;
  });
  editorStage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dxCss = e.clientX - dragStart.x;
    const dyCss = e.clientY - dragStart.y;
    const stageW = editorStage._rectW || editorStage.getBoundingClientRect().width;
    photo.offsetXNorm = offsetStart.x + dxCss / stageW;
    photo.offsetYNorm = offsetStart.y + dyCss / stageW;
    scheduleRedraw();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((evt) => {
    editorStage.addEventListener(evt, () => { dragging = false; });
  });

  // Mouse wheel to zoom, for desktop convenience
  editorStage.addEventListener('wheel', (e) => {
    if (!photo.img) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -5 : 5;
    let z = Number(zoomRange.value) + delta;
    z = Math.max(100, Math.min(300, z));
    zoomRange.value = z;
    photo.zoom = z;
    scheduleRedraw();
  }, { passive: false });

  /* ================================================================
     JTF LOADER
     ================================================================ */

  const LOADER_MESSAGES = [
    'Preparing Image...',
    'Optimizing Photo...',
    'Fitting into Frame...',
    'Rendering Flyer...',
    'Applying Final Touches...',
    'Almost Ready...',
  ];
  const LOADER_DURATION_MS = 3000;

  function spawnParticles() {
    loaderParticles.innerHTML = '';
    const count = 16;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'loader__particle';
      const angle = Math.random() * 360;
      const dist = 40 + Math.random() * 60;
      const x = 110 + Math.cos((angle * Math.PI) / 180) * dist;
      const y = 110 + Math.sin((angle * Math.PI) / 180) * dist;
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
      p.style.animationDelay = `${Math.random() * 1.2}s`;
      loaderParticles.appendChild(p);
    }
  }

  function runLoader() {
    return new Promise((resolve) => {
      loaderOverlay.hidden = false;
      loaderOverlay.classList.remove('is-hiding');
      spawnParticles();
      loaderProgressBar.style.transition = 'none';
      loaderProgressBar.style.width = '0%';
      // force reflow so the transition below re-triggers
      void loaderProgressBar.offsetWidth;
      loaderProgressBar.style.transition = `width ${LOADER_DURATION_MS}ms linear`;
      loaderProgressBar.style.width = '100%';

      let msgIndex = 0;
      loaderMessage.textContent = LOADER_MESSAGES[0];
      const msgInterval = setInterval(() => {
        msgIndex = Math.min(msgIndex + 1, LOADER_MESSAGES.length - 1);
        loaderMessage.style.animation = 'none';
        void loaderMessage.offsetWidth;
        loaderMessage.style.animation = '';
        loaderMessage.textContent = LOADER_MESSAGES[msgIndex];
      }, LOADER_DURATION_MS / LOADER_MESSAGES.length);

      setTimeout(() => {
        clearInterval(msgInterval);
        loaderOverlay.classList.add('is-hiding');
        setTimeout(() => {
          loaderOverlay.hidden = true;
          resolve();
        }, 500);
      }, LOADER_DURATION_MS);
    });
  }

  /* ================================================================
     GENERATE FLYER
     ================================================================ */

  generateBtn.addEventListener('click', async () => {
    if (!photo.img) return;
    generateBtn.disabled = true;
    await runLoader();
    finalCanvas.width = OUTPUT_SIZE;
    finalCanvas.height = OUTPUT_SIZE;
    renderFlyer(finalCanvas.getContext('2d'), OUTPUT_SIZE);
    goToResult();
    generateBtn.disabled = false;
  });

  /* ================================================================
     DOWNLOAD
     ================================================================ */

  downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'i-will-be-there-teens-meet-3.0.png';
    link.href = finalCanvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  /* ================================================================
     SHARE
     ================================================================ */

  function finalCanvasToBlob() {
    return new Promise((resolve) => finalCanvas.toBlob(resolve, 'image/png'));
  }

  shareBtn.addEventListener('click', async () => {
    const blob = await finalCanvasToBlob();
    const shareData = {
      title: 'I Will Be There — Teens Meet 3.0',
      text: 'I will be there at Teens Meet 3.0 — Higher Ground! Join me.',
    };

    if (navigator.canShare && blob) {
      const file = new File([blob], 'i-will-be-there.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ ...shareData, files: [file] });
          return;
        } catch (err) {
          // fall through to modal if the user cancels or share fails
          if (err && err.name === 'AbortError') return;
        }
      }
    }
    openShareModal();
  });

  function openShareModal() { shareModal.hidden = false; shareToast.hidden = true; }
  function closeShareModal() { shareModal.hidden = true; }
  shareModalClose.addEventListener('click', closeShareModal);
  shareModal.addEventListener('click', (e) => { if (e.target === shareModal) closeShareModal(); });

  function flashToast(msg) {
    shareToast.textContent = msg;
    shareToast.hidden = false;
  }

  document.querySelectorAll('.share-option').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const kind = btn.dataset.share;
      const shareText = encodeURIComponent('I will be there at Teens Meet 3.0 — Higher Ground! Join me.');
      const pageUrl = encodeURIComponent(window.location.href);

      switch (kind) {
        case 'whatsapp':
          window.open(`https://wa.me/?text=${shareText}%20${pageUrl}`, '_blank');
          break;
        case 'facebook':
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${pageUrl}`, '_blank');
          break;
        case 'instagram':
          flashToast('Download your flyer, then share it to Instagram from the app.');
          break;
        case 'x':
          window.open(`https://twitter.com/intent/tweet?text=${shareText}&url=${pageUrl}`, '_blank');
          break;
        case 'telegram':
          window.open(`https://t.me/share/url?url=${pageUrl}&text=${shareText}`, '_blank');
          break;
        case 'email':
          window.location.href = `mailto:?subject=${encodeURIComponent('I Will Be There — Teens Meet 3.0')}&body=${shareText}%20${pageUrl}`;
          break;
        case 'copy-image': {
          try {
            const blob = await finalCanvasToBlob();
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            flashToast('Image copied to clipboard.');
          } catch (err) {
            flashToast('Copying the image is not supported on this browser.');
          }
          break;
        }
        case 'copy-link': {
          try {
            await navigator.clipboard.writeText(window.location.href);
            flashToast('Link copied to clipboard.');
          } catch (err) {
            flashToast('Could not copy the link.');
          }
          break;
        }
      }
    });
  });

  /* ================================================================
     MEMORY VERSE POPUP
     ================================================================ */

  const VERSES = [
    { ref: 'Habakkuk 3:19', text: '"The Sovereign Lord is my strength; he makes my feet like the feet of a deer; he enables me to tread on the heights."' },
    { ref: 'Psalm 61:2', text: '"From the ends of the earth I call to you, I call as my heart grows faint; lead me to the rock that is higher than I."' },
    { ref: 'Psalm 18:33', text: '"He makes my feet like the feet of a deer; he causes me to stand on the heights."' },
    { ref: 'Isaiah 40:31', text: '"But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint."' },
    { ref: 'Psalm 40:2', text: '"He lifted me out of the slimy pit, out of the mud and mire; he set my feet on a rock and gave me a firm place to stand."' },
    { ref: 'Deuteronomy 32:13', text: '"He made him ride on the high places of the earth, that he might eat the increase of the fields; and he made him suck honey out of the rock."' },
    { ref: 'Colossians 3:1-2', text: '"Since, then, you have been raised with Christ, set your hearts on things above, where Christ is, seated at the right hand of God. Set your minds on things above, not on earthly things."' },
  ];

  let verseIndex = 0;
  let verseUserClosed = false;

  function showVerse(index) {
    verseIndex = ((index % VERSES.length) + VERSES.length) % VERSES.length;
    const v = VERSES[verseIndex];
    verseReference.textContent = v.ref;
    verseText.textContent = v.text;
  }

  function popVerse() {
    if (verseUserClosed) return;
    verseIndex = Math.floor(Math.random() * VERSES.length);
    showVerse(verseIndex);
    versePopup.hidden = false;
    versePopup.classList.remove('is-fading');
    versePopup.classList.remove('is-minimized');
    verseBubble.hidden = true;
  }

  versePrevBtn.addEventListener('click', () => showVerse(verseIndex - 1));
  verseNextBtn.addEventListener('click', () => showVerse(verseIndex + 1));

  verseMinimizeBtn.addEventListener('click', () => {
    versePopup.classList.toggle('is-minimized');
  });

  verseCloseBtn.addEventListener('click', () => {
    versePopup.classList.add('is-fading');
    setTimeout(() => {
      versePopup.hidden = true;
      verseBubble.hidden = false;
    }, 480);
  });

  verseBubble.addEventListener('click', () => {
    versePopup.hidden = false;
    versePopup.classList.remove('is-fading', 'is-minimized');
    verseBubble.hidden = true;
  });

  // Timing: first appearance after 10s, then every 45s. Never interrupts
  // an in-progress user action (drag / share modal / loader).
  function isUserBusy() {
    return dragging || !loaderOverlay.hidden || !shareModal.hidden;
  }

  setTimeout(function firstPop() {
    if (isUserBusy()) { setTimeout(firstPop, 1500); return; }
    popVerse();
  }, 10000);

  setInterval(() => {
    if (versePopup.hidden === false) return; // already visible, let user read it
    if (isUserBusy()) return;
    popVerse();
  }, 45000);

  // Draggable popup
  let verseDrag = null;
  versePopupHeader.addEventListener('pointerdown', (e) => {
    const rect = versePopup.getBoundingClientRect();
    verseDrag = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    versePopup.style.right = 'auto';
    versePopup.style.bottom = 'auto';
    versePopup.style.left = `${rect.left}px`;
    versePopup.style.top = `${rect.top}px`;
    versePopupHeader.setPointerCapture(e.pointerId);
  });
  versePopupHeader.addEventListener('pointermove', (e) => {
    if (!verseDrag) return;
    const x = e.clientX - verseDrag.offsetX;
    const y = e.clientY - verseDrag.offsetY;
    versePopup.style.left = `${Math.max(8, Math.min(window.innerWidth - versePopup.offsetWidth - 8, x))}px`;
    versePopup.style.top = `${Math.max(8, Math.min(window.innerHeight - 60, y))}px`;
  });
  ['pointerup', 'pointercancel'].forEach((evt) => {
    versePopupHeader.addEventListener(evt, () => { verseDrag = null; });
  });

  /* ================================================================
     INIT
     ================================================================ */
  scheduleRedraw();
})();
