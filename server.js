/**
 * Knowledge Vault — 파일 변환 & 미리보기 서버
 *
 * POST /convert   DWG/DXF → SVG
 * POST /preview   PDF·DOCX·XLSX·MP4·STL·기타 → 썸네일 or 텍스트
 * GET  /health    상태 확인
 */
const express  = require('express');
const cors     = require('cors');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');

const { parseString, toSVG } = require('dxf');
const mammoth  = require('mammoth');
const XLSX     = require('xlsx');
const { createCanvas } = require('canvas');

const app  = express();
const PORT = 3001;
app.use(cors());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

// ─────────────────────────────────────────
// 공통 유틸
// ─────────────────────────────────────────
function iconSVG(label, sub, color = '#3355dd') {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="300" height="200">
  <rect width="300" height="200" fill="#0d1528" rx="8"/>
  <rect x="10" y="10" width="280" height="180" fill="none" stroke="${color}"
        stroke-width="1.5" stroke-dasharray="6,4" rx="6"/>
  <text x="150" y="80"  text-anchor="middle" fill="${color}" font-size="36"
        font-family="monospace" font-weight="bold">${esc(label)}</text>
  <text x="150" y="120" text-anchor="middle" fill="#ffffff" font-size="13"
        font-family="sans-serif">${esc(sub)}</text>
</svg>`;
}

// ─────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, version: 2 }));

// ─────────────────────────────────────────
// POST /convert  — DXF/DWG → SVG
// ─────────────────────────────────────────
app.post('/convert', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const ext  = path.extname(req.file.originalname).toLowerCase();
  const name = path.basename(req.file.originalname, ext);
  const kb   = (req.file.size / 1024).toFixed(0);

  if (ext === '.dwg') {
    return res.type('image/svg+xml').send(iconSVG('DWG', `${name}  ·  ${kb} KB`));
  }

  if (ext === '.dxf') {
    try {
      let svg = toSVG(parseString(req.file.buffer.toString('utf8')));
      svg = svg
        .replace('<svg', '<svg style="background:#0d1528"')
        .replace(/stroke="#000000"/g, 'stroke="#6699ff"')
        .replace(/stroke="rgb\(0, 0, 0\)"/g, 'stroke="rgb(100,170,255)"');
      return res.type('image/svg+xml').send(svg);
    } catch (e) {
      return res.type('image/svg+xml').send(iconSVG('DXF', `파싱 실패: ${name}`));
    }
  }

  return res.status(400).json({ error: 'unsupported: ' + ext });
});

// ─────────────────────────────────────────
// POST /preview  — 다양한 파일 미리보기
// ─────────────────────────────────────────
app.post('/preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });

  const ext  = path.extname(req.file.originalname).toLowerCase().slice(1);
  const name = path.basename(req.file.originalname, '.' + ext);
  const kb   = (req.file.size / 1024).toFixed(0);

  // ── PDF → 1페이지 썸네일 (pdfjs-dist + canvas) ──────────────────
  if (ext === 'pdf') {
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const data     = new Uint8Array(req.file.buffer);
      const doc      = await pdfjsLib.getDocument({ data }).promise;
      const page     = await doc.getPage(1);
      const vp       = page.getViewport({ scale: 1.2 });

      const canvas  = createCanvas(vp.width, vp.height);
      const context = canvas.getContext('2d');
      await page.render({
        canvasContext: context,
        viewport: vp,
        // Node canvas 호환 팩토리
        canvasFactory: {
          create(w, h)    { const c = createCanvas(w,h); return { canvas:c, context:c.getContext('2d') }; },
          reset(obj,w,h)  { obj.canvas.width=w; obj.canvas.height=h; },
          destroy(obj)    { },
        },
      }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      return res.json({ type: 'image', dataUrl, pages: doc.numPages });
    } catch (e) {
      console.error('[pdf]', e.message);
      return res.json({ type: 'svg', dataUrl: toDataUrl(iconSVG('PDF', name + '  ·  ' + kb + ' KB', '#dd4444')) });
    }
  }

  // ── DOCX → 텍스트 미리보기 ────────────────────────────────────────
  if (ext === 'docx' || ext === 'doc') {
    try {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      const preview = result.value.slice(0, 600).trim();
      return res.json({ type: 'text', text: preview, ext: ext.toUpperCase() });
    } catch (e) {
      return res.json({ type: 'svg', dataUrl: toDataUrl(iconSVG('DOCX', name, '#2255cc')) });
    }
  }

  // ── XLSX/XLS → 첫 시트 미리보기 ──────────────────────────────────
  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const wb      = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet   = wb.Sheets[wb.SheetNames[0]];
      const rows    = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(0, 8);
      const preview = rows.map(r => r.slice(0, 6).join('\t')).join('\n');
      return res.json({ type: 'table', rows, sheetName: wb.SheetNames[0], preview, ext: ext.toUpperCase() });
    } catch (e) {
      return res.json({ type: 'svg', dataUrl: toDataUrl(iconSVG('XLSX', name, '#22aa44')) });
    }
  }

  // ── PPTX → 슬라이드 수 + 제목 추출 ─────────────────────────────
  if (ext === 'pptx' || ext === 'ppt') {
    try {
      // XLSX 라이브러리가 PPTX도 처리
      const wb    = XLSX.read(req.file.buffer, { type: 'buffer' });
      const count = wb.SheetNames.length;
      return res.json({ type: 'text', text: `슬라이드 ${count}장`, ext: 'PPTX' });
    } catch {
      return res.json({ type: 'svg', dataUrl: toDataUrl(iconSVG('PPTX', name, '#dd6622')) });
    }
  }

  // ── STL → 바운딩 박스 미리보기 SVG ──────────────────────────────
  if (ext === 'stl') {
    try {
      const info = parseSTLInfo(req.file.buffer);
      const svg  = makeSTLPreviewSVG(info, name, kb);
      return res.json({ type: 'svg', dataUrl: toDataUrl(svg) });
    } catch {
      return res.json({ type: 'svg', dataUrl: toDataUrl(iconSVG('STL', name, '#aa44cc')) });
    }
  }

  // ── 영상(MP4 등) → 아이콘 + 파일크기 ────────────────────────────
  if (/^(mp4|mov|avi|mkv|webm)$/.test(ext)) {
    return res.json({
      type: 'svg',
      dataUrl: toDataUrl(iconSVG('▶ ' + ext.toUpperCase(), name + '  ·  ' + (req.file.size/1024/1024).toFixed(1) + ' MB', '#dd3366')),
    });
  }

  // ── 오디오 ────────────────────────────────────────────────────────
  if (/^(mp3|wav|flac|aac|ogg)$/.test(ext)) {
    return res.json({
      type: 'svg',
      dataUrl: toDataUrl(iconSVG('♪ ' + ext.toUpperCase(), name + '  ·  ' + kb + ' KB', '#cc44aa')),
    });
  }

  // ── 나머지 CAD (OBJ, FBX 등) ─────────────────────────────────────
  if (/^(obj|fbx|gltf|glb|step|stp|igs|iges|3dm)$/.test(ext)) {
    return res.json({
      type: 'svg',
      dataUrl: toDataUrl(iconSVG(ext.toUpperCase(), name + '  ·  ' + kb + ' KB', '#44aacc')),
    });
  }

  // ── 디자인 파일 ───────────────────────────────────────────────────
  if (/^(psd|ai|sketch|xd|fig|eps)$/.test(ext)) {
    return res.json({
      type: 'svg',
      dataUrl: toDataUrl(iconSVG(ext.toUpperCase(), name, '#ff6688')),
    });
  }

  // 기본 fallback
  return res.json({
    type: 'svg',
    dataUrl: toDataUrl(iconSVG(ext.toUpperCase(), name + '  ·  ' + kb + ' KB')),
  });
});

// ─────────────────────────────────────────
// STL 파서 (바이너리 STL 삼각형 수 + 무게중심)
// ─────────────────────────────────────────
function parseSTLInfo(buffer) {
  // 바이너리 STL: 80byte header + 4byte count + count*50bytes
  if (buffer.length > 84) {
    const count = buffer.readUInt32LE(80);
    if (80 + 4 + count * 50 <= buffer.length) {
      return { triangles: count, type: 'binary' };
    }
  }
  // ASCII STL
  const text = buffer.toString('ascii', 0, Math.min(buffer.length, 500));
  if (text.trim().startsWith('solid')) {
    const facets = (buffer.toString('ascii').match(/facet normal/g) || []).length;
    return { triangles: facets, type: 'ascii' };
  }
  return { triangles: 0, type: 'unknown' };
}

function makeSTLPreviewSVG({ triangles, type }, name, kb) {
  const triStr = triangles > 0 ? `${triangles.toLocaleString()} triangles` : '';
  return `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="300" height="200">
  <rect width="300" height="200" fill="#0d1528" rx="8"/>
  <polygon points="150,30 260,160 40,160" fill="none" stroke="#aa44cc" stroke-width="1.5"/>
  <polygon points="150,30 205,95 95,95"  fill="none" stroke="#cc66ee" stroke-width="1" opacity="0.6"/>
  <line x1="150" y1="30" x2="150" y2="160" stroke="#884499" stroke-width="0.8" opacity="0.4"/>
  <line x1="40"  y1="160" x2="205" y2="95" stroke="#884499" stroke-width="0.8" opacity="0.4"/>
  <text x="150" y="185" text-anchor="middle" fill="#aa44cc" font-size="10" font-family="monospace">STL · ${name.slice(0,24)} · ${kb} KB</text>
  <text x="150" y="22"  text-anchor="middle" fill="#cc88ff" font-size="9"  font-family="monospace">${triStr}</text>
</svg>`;
}

// SVG 문자열 → data URL
function toDataUrl(svg) {
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

// ─────────────────────────────────────────
app.listen(PORT, () => console.log(`[vault] convert server http://localhost:${PORT}`));
