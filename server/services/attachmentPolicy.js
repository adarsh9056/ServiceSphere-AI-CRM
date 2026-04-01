const path = require('path');
const fs = require('fs');

/** Allowed stored MIME types after magic-byte validation. */
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const BLOCKED_EXTENSIONS = new Set([
  'html',
  'htm',
  'svg',
  'svgz',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'xml',
  'xhtml',
  'wasm',
  'exe',
  'bat',
  'cmd',
  'sh',
  'php',
  'jsp',
  'asp',
]);

const SIG = {
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  gif87: Buffer.from('GIF87a'),
  gif89: Buffer.from('GIF89a'),
  pdf: Buffer.from('%PDF'),
  zip: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
};

function extOf(filename) {
  return path.extname(String(filename || '')).toLowerCase().replace(/^\./, '');
}

function startsWith(buf, sig) {
  if (!buf || buf.length < sig.length) return false;
  return buf.subarray(0, sig.length).equals(sig);
}

function looksLikeHtml(text) {
  const t = text.trim().slice(0, 800).toLowerCase();
  return (
    t.startsWith('<!doctype html') ||
    t.startsWith('<html') ||
    /<script[\s>]/.test(t) ||
    t.startsWith('<?xml')
  );
}

function readHead(filePath, len) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(len);
    const n = fs.readSync(fd, buf, 0, len, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function sniffMime(head) {
  if (!head || head.length < 8) return null;
  if (startsWith(head, SIG.png)) return 'image/png';
  if (startsWith(head, SIG.gif87) || startsWith(head, SIG.gif89)) return 'image/gif';
  if (startsWith(head, SIG.pdf)) return 'application/pdf';
  if (head.length >= 12 && head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return 'image/jpeg';
  }
  const slice32 = head.subarray(0, Math.min(head.length, 256));
  const asText = slice32.toString('utf8');
  if (
    /^[\t\n\r\x20-\x7e\u00a0-\uffff]*$/.test(asText) &&
    !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(slice32.toString('binary'))
  ) {
    return 'text/plain';
  }
  return null;
}

function validateUploadedFile(file, maxBytes) {
  if (file.size > maxBytes) {
    return { ok: false, error: 'File too large' };
  }
  const ext = extOf(file.originalname);
  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return { ok: false, error: 'This file type is not allowed' };
  }

  const lowerName = String(file.originalname || '').toLowerCase();
  const head = readHead(file.path, 32);
  const claimed = (file.mimetype || '').split(';')[0].trim().toLowerCase();

  if (lowerName.endsWith('.docx')) {
    if (!startsWith(head, SIG.zip)) return { ok: false, error: 'Invalid Word document' };
    return {
      ok: true,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
  if (lowerName.endsWith('.xlsx')) {
    if (!startsWith(head, SIG.zip)) return { ok: false, error: 'Invalid Excel document' };
    return {
      ok: true,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  if (ext === 'csv' || claimed === 'text/csv') {
    const textHead = readHead(file.path, Math.min(file.size, 4096));
    const sniffed = sniffMime(textHead);
    if (sniffed !== 'text/plain') {
      return { ok: false, error: 'CSV must be plain text' };
    }
    const body = textHead.toString('utf8');
    if (looksLikeHtml(body)) {
      return { ok: false, error: 'File content is not allowed' };
    }
    return { ok: true, mimeType: 'text/csv' };
  }

  const sniffed = sniffMime(head);
  if (!sniffed) {
    return { ok: false, error: 'Unrecognized or disallowed file content' };
  }
  if (sniffed === 'text/plain') {
    const textHead = readHead(file.path, Math.min(file.size, 4096));
    const body = textHead.toString('utf8');
    if (looksLikeHtml(body)) {
      return { ok: false, error: 'HTML or markup in plain text uploads is not allowed' };
    }
  }

  if (!ALLOWED_MIMES.has(sniffed)) {
    return { ok: false, error: 'File type not allowed' };
  }
  if (claimed && claimed !== sniffed && !compatiblePair(claimed, sniffed)) {
    return { ok: false, error: 'File content does not match declared type' };
  }

  return { ok: true, mimeType: sniffed };
}

function compatiblePair(claimed, sniffed) {
  if (claimed === sniffed) return true;
  if (claimed === 'image/jpg' && sniffed === 'image/jpeg') return true;
  if (claimed === 'application/octet-stream' && sniffed.startsWith('image/')) return true;
  return false;
}

function contentDispositionMode(mimeType) {
  const m = (mimeType || '').toLowerCase();
  if (m === 'image/png' || m === 'image/jpeg' || m === 'image/gif' || m === 'image/webp') {
    return 'inline';
  }
  if (m === 'application/pdf') return 'inline';
  return 'attachment';
}

module.exports = {
  validateUploadedFile,
  contentDispositionMode,
  ALLOWED_MIMES,
  BLOCKED_EXTENSIONS,
};
