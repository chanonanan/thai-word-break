import { Trie, insertBreaksByWords } from './thai-word-break.js';

function processXhtmlString(xhtml, trie, {useWbr, skipTags}, log){
  let doc;
  try{
    // Try XHTML first
    doc = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml');
    // If parsererror, fallback to HTML
    if (!doc || !doc.documentElement || doc.getElementsByTagName('parsererror').length){
      doc = new DOMParser().parseFromString(xhtml, 'text/html');
    }
  }catch(e){
    log('[parse] failed:', e.message||e); 
    return xhtml;
  }

  // Walk all text nodes except inside skipTags
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ALL, null);
  const toChange = [];
  while(walker.nextNode()){
    const node = walker.currentNode;
    if(node.nodeType === Node.TEXT_NODE){
      const parent = node.parentElement;
      if(!parent) continue;
      const tag = (parent.tagName||'').toLowerCase();
      if(skipTags.has(tag)) continue;
      toChange.push(node);
    }
  }
  for(const n of toChange){
    try{
      n.nodeValue = insertBreaksByWords(n.nodeValue || '', trie, useWbr);
    }catch(e){ log('[text] fail:', e.message||e); }
  }

  try{
    // Prefer XMLSerializer; fallback to outerHTML for HTML docs
    const isHtmlDoc = (doc.contentType || '').includes('html');
    if (isHtmlDoc && doc.documentElement && doc.documentElement.outerHTML) {
      return doc.documentElement.outerHTML;
    }
    return new XMLSerializer().serializeToString(doc);
  }catch(e){
    log('[serialize] failed:', e.message||e);
    return xhtml;
  }
}

async function processEpubFile(file, {useWbr, skipTags}, trie, log, onProgress, isPaused, setResume){
  const ab = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);
  const outZip = new JSZip();
  const processedFiles = new Map();

  const names = Object.keys(zip.files);
  const totalFiles = names.length;
  let processedCount = 0;

  // Pause/resume logic
  let resumePromise = null;
  function resume() {
    if (resumePromise) {
      resumePromise();
      resumePromise = null;
    }
  }
  if (setResume) setResume(resume);

  // Ensure 'mimetype' first & STORED (no compression)
  if (names.includes('mimetype')) {
    const data = await zip.file('mimetype').async('uint8array');
    outZip.file('mimetype', data, { compression: 'STORE' });
    processedCount++;
    if (onProgress) {
      onProgress(processedCount / totalFiles);
    }
  }

  for (const name of names) {
    if (name === 'mimetype') continue;
    const entry = zip.files[name];
    if (entry.dir) {
      processedCount++;
      if (onProgress) {
        onProgress(processedCount / totalFiles);
      }
      continue; // JSZip creates folders implicitly
    }

    // PAUSE HERE IF REQUESTED
    if (isPaused && isPaused()) {
      await new Promise(resolve => {
        resumePromise = resolve;
      });
    }

    const lower = name.toLowerCase();
    if (lower.endsWith('.xhtml') || lower.endsWith('.html') || lower.endsWith('.htm')) {
      try {
        const src = await entry.async('string');
        const processed = processXhtmlString(src, trie, {useWbr, skipTags}, log);
        outZip.file(name, processed, { compression: 'DEFLATE' });
        processedFiles.set(name, processed);
        log('processed:', name);
      } catch (e) {
        log('skip (parse error):', name, '-', e.message||e);
        outZip.file(name, await entry.async('uint8array'), { compression: 'DEFLATE' });
      }
    } else {
      outZip.file(name, await entry.async('uint8array'), { compression: 'DEFLATE' });
    }
    processedCount++;
    if (onProgress) {
      onProgress(processedCount / totalFiles);
    }
  }

  // Show 99% while generating the final blob
  if (onProgress) {
    onProgress(0.99);
  }
  const blob = await outZip.generateAsync({ type: 'blob' });
  if (onProgress) {
    onProgress(1);
  }
  return { blob, processedFiles };
}

export { processEpubFile };
