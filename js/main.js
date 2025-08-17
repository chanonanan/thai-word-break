import { Trie } from './thai-word-break.js';
import { processEpubFile } from './epub-processor.js';

/* ===== UI helpers ===== */
const $ = (sel) => document.querySelector(sel);
const logEl = $('#log');
function log(...args){ logEl.textContent += args.join(' ') + '\n'; logEl.scrollTop = logEl.scrollHeight; }
function setStatus(t){ $('#status').textContent = t || ''; }

/* ===== Config / cache ===== */
const LS_KEY = 'twb_dict';
const LS_TS  = 'twb_dict_ts';

function getOptions(){
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const skip = $('#skipTags').value.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  return {
    useWbr: mode === 'wbr',
    skipTags: new Set(skip),
    dictUrl: $('#dictUrl').value.trim(),
    cacheDays: Math.max(1, Number($('#cacheDays').value||30)),
    useLocalDict: $('#useLocalDict').checked
  };
}

function loadCacheInfo(){
  const ts = localStorage.getItem(LS_TS);
  if(!ts){ $('#cacheInfo').textContent = 'Cached: (none)'; return; }
  const d = new Date(Number(ts));
  $('#cacheInfo').textContent = 'Cached: ' + d.toLocaleString();
}

async function getDictionary({dictUrl, cacheDays, refresh=false, useLocalDict=false}){
  // Local dict overrides remote
  if (useLocalDict) {
    const f = $('#dictFile').files?.[0];
    if (!f) throw new Error('Local dictionary selected but no file chosen.');
    log('[dict] using local file:', f.name);
    return await f.text();
  }

  const now = Date.now();
  const cached = localStorage.getItem(LS_KEY);
  const ts = Number(localStorage.getItem(LS_TS) || 0);
  const fresh = (now - ts) / (1000*60*60*24) <= cacheDays;

  if (cached && !refresh && fresh){
    log('[dict] using cached dictionary');
    return cached;
  }
  log('[dict] fetching from', dictUrl);
  const res = await fetch(dictUrl, { mode: 'cors', cache: 'no-store' });
  if(!res.ok) throw new Error('Fetch dict failed: HTTP ' + res.status);
  const txt = await res.text();
  localStorage.setItem(LS_KEY, txt);
  localStorage.setItem(LS_TS, String(now));
  loadCacheInfo();
  log('[dict] fetched and cached');
  return txt;
}

/* ===== UI wire-up ===== */
let currentFile = null;
let processedResult = null;
let isPaused = false;
let isProcessing = false;
let resumeProcessing = null;

const drop = $('#drop');
const fileInput = $('#file');
const downloadBtn = $('#downloadBtn');
const previewSection = $('#previewSection');
const progressSection = $('#progressSection');
const progressBar = $('#progressBar');
const progressText = $('#progressText');
const fileSelect = $('#fileSelect');
const previewBtn = $('#previewBtn');
const previewContent = $('#previewContent');
const processBtn = $('#processBtn');
const devicePreview = $('#devicePreview');
const fontSizePreview = $('#fontSizePreview');
const justifyPreview = $('#justifyPreview');
const showOriginal = $('#showOriginal');

// Store original file contents for preview
let originalFiles = new Map();

function updateProgress(progress) {
  const percent = Math.round(progress * 100);
  progressBar.style.width = `${percent}%`;
  setStatus(`Processing: ${percent}%`);
  if (percent === 100) {
    setTimeout(() => {
      progressSection.style.display = 'none';
    }, 1000);
  }
}

['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); e.stopPropagation(); drop.classList.add('drag');
}));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); e.stopPropagation(); drop.classList.remove('drag');
}));
drop.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if(!f) return;
  if(!f.name.toLowerCase().endsWith('.epub')){ alert('Please drop an .epub file'); return; }
  currentFile = f;
  updateProcessBtnState();
  setStatus('Selected: ' + f.name);
});

fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  if(!f) return;
  if(!f.name.toLowerCase().endsWith('.epub')){ alert('Please choose an .epub'); fileInput.value=''; updateProcessBtnState(); return; }
  currentFile = f;
  updateProcessBtnState();
  setStatus('Selected: ' + f.name);
});

$('#refreshBtn').addEventListener('click', async () => {
  try{
    const { dictUrl, cacheDays, useLocalDict } = getOptions();
    if (useLocalDict) { alert('Local dict is selected; no remote cache to refresh.'); return; }
    await getDictionary({ dictUrl, cacheDays, refresh:true });
    log('[dict] cache refreshed');
  }catch(e){ alert('Refresh failed: ' + (e.message||e)); }
});

processBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  if (isProcessing && !isPaused) {
    // Pause
    isPaused = true;
    processBtn.textContent = 'Continue';
    setStatus('Paused');
    if (resumeProcessing) resumeProcessing();
    return;
  }
  if (isProcessing && isPaused) {
    // Continue
    isPaused = false;
    processBtn.textContent = 'Pause';
    setStatus('Processing…');
    if (resumeProcessing) resumeProcessing();
    return;
  }

  // Start processing
  isProcessing = true;
  isPaused = false;
  processBtn.textContent = 'Pause';
  logEl.textContent = '';
  setStatus('Processing…');
  const { useWbr, skipTags, dictUrl, cacheDays, useLocalDict } = getOptions();
  try{
    // Build trie
    const dictText = await getDictionary({ dictUrl, cacheDays, useLocalDict });
    const trie = new Trie();
    for(const line of dictText.split(/\r?\n/)){ const w=line.trim(); if(w) trie.add(w); }

    // Show progress section and reset progress
    progressSection.style.display = 'block';
    progressBar.style.width = '0%';

    // When processing EPUB, store originals
    async function storeOriginalFiles(epubFile) {
      const ab = await epubFile.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const names = Object.keys(zip.files);
      for (const name of names) {
        if (name.toLowerCase().match(/\.(xhtml|html|htm)$/)) {
          const entry = zip.files[name];
          if (!entry.dir) {
            const src = await entry.async('string');
            originalFiles.set(name, src);
          }
        }
      }
    }

    await storeOriginalFiles(currentFile);
    processedResult = await processEpubFile(
      currentFile,
      { useWbr, skipTags },
      trie,
      log,
      updateProgress,
      () => isPaused,
      (resume) => { resumeProcessing = resume; }
    );

    isProcessing = false;
    isPaused = false;
    processBtn.textContent = 'Process EPUB';
    // Enable download button
    downloadBtn.disabled = false;
    // Update preview section
    fileSelect.innerHTML = '';
    for (const [name, _] of processedResult.processedFiles) {
      if (name.toLowerCase().match(/\.(xhtml|html|htm)$/)) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        fileSelect.appendChild(option);
      }
    }
    if (fileSelect.options.length > 0) {
      previewSection.style.display = 'block';
    }
    setStatus('Processing complete. Ready for preview and download.');
  }catch(e){
    isProcessing = false;
    isPaused = false;
    processBtn.textContent = 'Process EPUB';
    console.error(e);
    setStatus('Failed'); log('[error]', e && e.message || e);
  }
});

// Download button handler
downloadBtn.addEventListener('click', () => {
  if (processedResult && processedResult.blob) {
    const outName = currentFile.name.replace(/\.epub$/i,'') + '.thaiwb.epub';
    saveAs(processedResult.blob, outName);
    setStatus('Downloaded → ' + outName);
  }
});
let previewOpen = false;

function applyPreviewSettings() {
  // Remove all device classes
  previewContent.classList.remove('device-kindle', 'device-kobo', 'device-ipad', 'device-paperwhite');
  // Remove all justify classes
  previewContent.classList.remove('justify-left', 'justify-center', 'justify-right', 'justify-justify');
  // Device
  const device = devicePreview.value;
  if (device !== 'default') previewContent.classList.add('device-' + device);
  // Font size
  previewContent.style.fontSize = fontSizePreview.value + 'px';
  // Justify
  previewContent.classList.add('justify-' + justifyPreview.value);
}

devicePreview.addEventListener('change', () => {
  if (previewOpen) applyPreviewSettings();
  savePreviewSettings();
});
fontSizePreview.addEventListener('change', () => {
  if (previewOpen) applyPreviewSettings();
  savePreviewSettings();
});
justifyPreview.addEventListener('change', () => {
  if (previewOpen) applyPreviewSettings();
  savePreviewSettings();
});
showMarkers.addEventListener('change', () => {
  if (previewOpen) renderPreview();
  savePreviewSettings();
});
showOriginal.addEventListener('change', () => {
  if (previewOpen) renderPreview();
  savePreviewSettings();
});

// Keys for localStorage
const LS_PREVIEW_DEVICE = 'twb_preview_device';
const LS_PREVIEW_FONT = 'twb_preview_font';
const LS_PREVIEW_JUSTIFY = 'twb_preview_justify';
const LS_PREVIEW_MARKERS = 'twb_preview_markers';
const LS_PREVIEW_ORIGINAL = 'twb_preview_original';

// Restore settings from localStorage
function restorePreviewSettings() {
  if (localStorage.getItem(LS_PREVIEW_DEVICE)) devicePreview.value = localStorage.getItem(LS_PREVIEW_DEVICE);
  if (localStorage.getItem(LS_PREVIEW_FONT)) fontSizePreview.value = localStorage.getItem(LS_PREVIEW_FONT);
  if (localStorage.getItem(LS_PREVIEW_JUSTIFY)) justifyPreview.value = localStorage.getItem(LS_PREVIEW_JUSTIFY);
  if (localStorage.getItem(LS_PREVIEW_MARKERS)) showMarkers.checked = localStorage.getItem(LS_PREVIEW_MARKERS) === 'true';
  if (localStorage.getItem(LS_PREVIEW_ORIGINAL)) showOriginal.checked = localStorage.getItem(LS_PREVIEW_ORIGINAL) === 'true';
}
restorePreviewSettings();

// Save settings to localStorage
function savePreviewSettings() {
  localStorage.setItem(LS_PREVIEW_DEVICE, devicePreview.value);
  localStorage.setItem(LS_PREVIEW_FONT, fontSizePreview.value);
  localStorage.setItem(LS_PREVIEW_JUSTIFY, justifyPreview.value);
  localStorage.setItem(LS_PREVIEW_MARKERS, showMarkers.checked ? 'true' : 'false');
  localStorage.setItem(LS_PREVIEW_ORIGINAL, showOriginal.checked ? 'true' : 'false');
}

function renderPreview() {
  const selectedFile = fileSelect.value;
  let content = '';
  if (showOriginal.checked) {
    content = originalFiles.get(selectedFile) || '';
  } else if (selectedFile && processedResult?.processedFiles?.has(selectedFile)) {
    content = processedResult.processedFiles.get(selectedFile);
    if (showMarkers.checked) {
      // Replace ZWSP with a visible marker (hyphen)
      content = content.replace(/\u200B/g, '<span class="zwsp-marker">-</span>');
    }
  }
  previewContent.innerHTML = content;
  previewContent.style.display = '';
  applyPreviewSettings();
}

function updatePreview() {
  if (!previewOpen) {
    renderPreview();
    previewBtn.textContent = 'Close Preview';
    previewOpen = true;
  } else {
    previewContent.innerHTML = '';
    previewContent.style.display = 'none';
    previewBtn.textContent = 'Preview';
    previewOpen = false;
  }
}

// Preview button handler
previewBtn.addEventListener('click', updatePreview);

// Marker toggle handler
showMarkers.addEventListener('change', () => {
  if (previewOpen) renderPreview();
});

// Dropdown change handler
fileSelect.addEventListener('change', () => {
  if (previewOpen) renderPreview();
});

showOriginal.addEventListener('change', () => {
  if (previewOpen) renderPreview();
});

function updateProcessBtnState() {
  processBtn.disabled = !currentFile;
}

// On page load, ensure button is disabled
updateProcessBtnState();
document.addEventListener('DOMContentLoaded', () => {
  processBtn.disabled = true;
});

loadCacheInfo();
