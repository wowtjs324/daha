/**
 * Knowledge Vault — 확장 기능 모듈
 * 1. 자동 유사도 링크 (TF-IDF cosine similarity)
 * 2. 클러스터링 (k-means → 공간 배치 + 색상)
 * 3. 전문 검색 (/ 단축키)
 * 4. 시간 추적 (방문·메모 히스토리)
 * 5. 노드 인앱 편집
 */

// ═══════════════════════════════════════════════
// ① 자동 유사도 링크
// ═══════════════════════════════════════════════
export function buildAutoLinks(data, threshold = 0.18, maxPerNode = 5) {
  const tokenize = s =>
    (s || '').toLowerCase()
      .replace(/[^a-z0-9가-힣\s]/g, ' ')
      .split(/\s+/).filter(t => t.length > 1);

  const N = data.length;

  // DF 계산 (희소 표현용)
  const df = {};
  const noteToks = data.map(n => {
    const toks = tokenize(n.title + ' ' + (n.content || '').slice(0, 800));
    const uniq = new Set(toks);
    uniq.forEach(t => { df[t] = (df[t] || 0) + 1; });
    return toks;
  });

  // 희소 TF-IDF 벡터 { token → weight }
  const sparseVecs = noteToks.map(toks => {
    const tf = {};
    toks.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
    const len = toks.length || 1;
    const vec = {};
    let norm = 0;
    Object.entries(tf).forEach(([t, cnt]) => {
      const w = (cnt / len) * Math.log((N + 1) / ((df[t] || 0) + 1));
      if (w > 0) { vec[t] = w; norm += w * w; }
    });
    const sqrtNorm = Math.sqrt(norm) || 1;
    Object.keys(vec).forEach(t => { vec[t] /= sqrtNorm; });
    return vec;
  });

  // 희소 코사인 유사도 (공유 토큰만 계산 → O(k) not O(vocab))
  function sparseCosine(a, b) {
    let dot = 0;
    for (const t in a) { if (b[t]) dot += a[t] * b[t]; }
    return dot; // 이미 정규화돼 있음
  }

  data.forEach((note, i) => {
    const existing = new Set(
      (note.links || []).map(l => typeof l === 'string' ? l : l.target)
    );
    const scores = [];
    for (let j = 0; j < N; j++) {
      if (i === j || existing.has(data[j].title)) continue;
      const sim = sparseCosine(sparseVecs[i], sparseVecs[j]);
      if (sim >= threshold) scores.push({ target: data[j].title, similarity: sim });
    }
    scores.sort((a, b) => b.similarity - a.similarity);
    note.links = [
      ...(note.links || []),
      ...scores.slice(0, maxPerNode).map(s => ({
        target: s.target, similarity: +(s.similarity.toFixed(3)), auto: true,
      })),
    ];
  });

  return data;
}

// ═══════════════════════════════════════════════
// ② 클러스터링 (k-means)
// ═══════════════════════════════════════════════
export function clusterNodes(data, k = 6, iterations = 8) {
  if (data.length < k) k = data.length;

  const tokenize = s =>
    (s || '').toLowerCase().replace(/[^a-z0-9가-힣\s]/g, ' ')
      .split(/\s+/).filter(t => t.length > 1);

  // 단어 빈도 벡터 (간단 BoW)
  const allWords = {};
  data.forEach(n => {
    tokenize(n.title + ' ' + (n.content || '').slice(0, 600)).forEach(t => { allWords[t] = 1; });
  });
  const words = Object.keys(allWords).slice(0, 300); // 상위 300 단어
  const wIdx  = {};
  words.forEach((w, i) => wIdx[w] = i);

  function bow(note) {
    const v = new Float32Array(words.length);
    tokenize(note.title + ' ' + (note.content || '').slice(0, 600)).forEach(t => {
      if (wIdx[t] !== undefined) v[wIdx[t]]++;
    });
    return v;
  }

  const vecs = data.map(bow);

  // 랜덤 초기 중심
  let centers = Array.from({ length: k }, (_, i) =>
    vecs[Math.floor((i / k) * data.length)].slice()
  );

  let assignments = new Array(data.length).fill(0);

  function dist(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return s;
  }

  for (let iter = 0; iter < iterations; iter++) {
    // 할당
    vecs.forEach((v, i) => {
      let best = 0, bestD = Infinity;
      centers.forEach((c, ci) => { const d = dist(v, c); if (d < bestD) { bestD = d; best = ci; } });
      assignments[i] = best;
    });
    // 중심 갱신
    const newC = Array.from({ length: k }, () => new Float32Array(words.length));
    const cnt  = new Array(k).fill(0);
    vecs.forEach((v, i) => {
      const ci = assignments[i];
      cnt[ci]++;
      for (let j = 0; j < v.length; j++) newC[ci][j] += v[j];
    });
    centers = newC.map((c, ci) => cnt[ci] ? c.map(x => x / cnt[ci]) : c);
  }

  // 클러스터 색상 팔레트
  const CLUSTER_COLORS = [
    '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
    '#c77dff', '#ff9f43', '#00d2d3', '#ee5a24',
  ];

  data.forEach((note, i) => {
    note.cluster      = assignments[i];
    note.clusterColor = CLUSTER_COLORS[assignments[i] % CLUSTER_COLORS.length];
  });

  return { data, k, clusterColors: CLUSTER_COLORS };
}

// ═══════════════════════════════════════════════
// ③ 전문 검색 UI
// ═══════════════════════════════════════════════
export function initSearch(noteNodes, showSidePanel, allSpheres) {
  // 검색 오버레이 생성
  const overlay = document.createElement('div');
  overlay.id = 'vault-search';
  overlay.style.cssText = `
    position:fixed; top:0; left:0; width:100%; height:100%;
    background:rgba(0,0,0,0.7); backdrop-filter:blur(8px);
    z-index:9000; display:none; align-items:flex-start;
    justify-content:center; padding-top:120px; box-sizing:border-box;
  `;
  overlay.innerHTML = `
    <div style="width:min(640px,90vw);background:#0d1528;border:1px solid rgba(80,130,255,0.3);
                border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
      <div style="display:flex;align-items:center;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.07);">
        <span style="color:rgba(255,255,255,0.3);font-size:16px;margin-right:12px;">🔍</span>
        <input id="vault-search-input" placeholder="노드 검색... (제목, 내용, 카테고리)"
          style="flex:1;background:none;border:none;outline:none;color:#fff;font-size:16px;
                 font-family:inherit;caret-color:#4d96ff;">
        <span style="font-size:10px;color:rgba(255,255,255,0.2);letter-spacing:1px;">ESC 닫기</span>
      </div>
      <div id="vault-search-results" style="max-height:420px;overflow-y:auto;padding:8px;"></div>
      <div id="vault-search-stats" style="padding:8px 18px;font-size:10px;color:rgba(255,255,255,0.2);
                border-top:1px solid rgba(255,255,255,0.05);letter-spacing:1px;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input   = overlay.querySelector('#vault-search-input');
  const results = overlay.querySelector('#vault-search-results');
  const stats   = overlay.querySelector('#vault-search-stats');

  function open() {
    overlay.style.display = 'flex';
    setTimeout(() => input.focus(), 50);
    trackEvent('search_open');
  }
  function close() {
    overlay.style.display = 'none';
    input.value = '';
    results.innerHTML = '';
    stats.textContent = '';
    // 하이라이트 해제
    allSpheres.forEach(s => {
      s.material.emissiveIntensity = s.userData._origEmissive ?? s.material.emissiveIntensity;
      delete s.userData._searchMatch;
    });
  }

  // / 키로 열기
  window.addEventListener('keydown', e => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey &&
        !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault(); open();
    }
    if (e.key === 'Escape') close();
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // 검색 실행
  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 120);
  });

  function highlight(text, query) {
    if (!query) return text;
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(re, '<mark style="background:#4d96ff33;color:#7ab8ff;border-radius:2px;">$1</mark>');
  }

  function doSearch() {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.innerHTML = ''; stats.textContent = ''; return; }

    const all    = Object.values(noteNodes);
    const scored = [];

    all.forEach(sphere => {
      const ud    = sphere.userData;
      const title = (ud.title || '').toLowerCase();
      const cont  = (ud.content || '').toLowerCase();
      const cat   = (ud.category || '').toLowerCase();

      let score = 0;
      if (title === q)              score += 100;
      if (title.startsWith(q))      score += 60;
      if (title.includes(q))        score += 40;
      if (cont.includes(q))         score += 15;
      if (cat.includes(q))          score += 10;
      // 단어 일치 수
      q.split(/\s+/).forEach(w => {
        if (title.includes(w)) score += 8;
        if (cont.includes(w))  score += 3;
      });

      if (score > 0) scored.push({ sphere, score });
    });

    scored.sort((a, b) => b.score - a.score);

    // 3D 하이라이트
    all.forEach(s => {
      s.material.emissiveIntensity = s.userData._origEmissive ?? (s.material.emissiveIntensity * 0.2);
      s.userData._searchMatch = false;
    });
    scored.slice(0, 20).forEach(({ sphere }) => {
      if (!sphere.userData._origEmissive)
        sphere.userData._origEmissive = sphere.material.emissiveIntensity;
      sphere.material.emissiveIntensity = sphere.userData._origEmissive * 3;
      sphere.userData._searchMatch = true;
    });

    // 결과 목록
    const top = scored.slice(0, 30);
    results.innerHTML = top.map(({ sphere, score }) => {
      const ud      = sphere.userData;
      const titleHL = highlight(ud.title || '', input.value.trim());
      const contHL  = highlight((ud.content || '').slice(0, 100), input.value.trim());
      const catColor = { IMAGE:'#6688cc',CAD:'#44aacc',DOCUMENT:'#2255cc',
                         DESIGN:'#ff6688',MEDIA:'#dd3366',OTHER:'#556677' }[ud.category] || '#aaa';
      return `<div class="sr-item" data-title="${ud.title}"
        style="padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:3px;
               border:1px solid transparent;transition:all 0.12s;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
          <span style="font-size:8px;letter-spacing:1px;color:${catColor};
                       background:${catColor}15;padding:1px 6px;border-radius:3px;">
            ${ud.category||'?'}
          </span>
          <span style="font-size:12px;font-weight:600;color:#fff;">${titleHL}</span>
          <span style="margin-left:auto;font-size:9px;color:rgba(255,255,255,0.2);">★ ${ud.importance||0}</span>
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,0.38);line-height:1.5;">${contHL}…</div>
      </div>`;
    }).join('');

    results.querySelectorAll('.sr-item').forEach(el => {
      el.addEventListener('mouseenter', () => {
        el.style.background = 'rgba(77,150,255,0.08)';
        el.style.borderColor = 'rgba(77,150,255,0.2)';
      });
      el.addEventListener('mouseleave', () => {
        el.style.background = '';
        el.style.borderColor = 'transparent';
      });
      el.addEventListener('click', () => {
        const title  = el.dataset.title;
        const sphere = noteNodes[title];
        if (sphere) showSidePanel(sphere.userData);
        close();
      });
    });

    stats.textContent = `${scored.length}개 결과 · "${input.value.trim()}"`;
    trackEvent('search_query', { q: input.value.trim(), hits: scored.length });
  }

  // 검색 버튼 (네비 패널용 - 나중에 연결)
  window._vaultSearchOpen = open;

  return { open, close };
}

// ═══════════════════════════════════════════════
// ④ 시간 추적
// ═══════════════════════════════════════════════
const HISTORY_KEY = '_vaultHistory';

export function trackEvent(type, data = {}) {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  history.push({ type, ts: Date.now(), ...data });
  // 최근 2000개만 유지
  if (history.length > 2000) history.splice(0, history.length - 2000);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function getHistory() {
  return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
}

export function buildActivityMap(noteNodes) {
  const history  = getHistory();
  const visitMap = {};
  history.filter(e => e.type === 'visit' && e.title).forEach(e => {
    visitMap[e.title] = (visitMap[e.title] || 0) + 1;
  });

  // 방문 빈도에 따라 구체 크기/밝기 보너스
  Object.entries(visitMap).forEach(([title, cnt]) => {
    const sphere = noteNodes[title];
    if (!sphere) return;
    const bonus = Math.min(cnt * 0.1, 0.8);
    sphere.userData.visitCount = cnt;
    sphere.material.emissiveIntensity =
      (sphere.userData._baseEmissive || sphere.material.emissiveIntensity) + bonus;
  });

  return visitMap;
}

export function showTimelinePanel(container) {
  const history = getHistory();
  if (!history.length) return;

  // 날짜별 그룹핑
  const byDay = {};
  history.forEach(e => {
    const d = new Date(e.ts).toLocaleDateString('ko-KR');
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(e);
  });

  const days = Object.entries(byDay).reverse().slice(0, 14);

  const maxCount = Math.max(...days.map(([, evs]) => evs.length));

  const html = `
    <div style="padding:16px 14px;border-bottom:1px solid rgba(255,255,255,0.08);">
      <div style="font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.3);">ACTIVITY</div>
      <div style="font-size:14px;font-weight:700;margin-top:2px;">최근 기록</div>
    </div>
    <div style="padding:12px 14px;overflow-y:auto;max-height:calc(100vh - 160px);">
      ${days.map(([day, evs]) => {
        const bar   = Math.round((evs.length / maxCount) * 80);
        const visits = evs.filter(e => e.type === 'visit').length;
        const memos  = evs.filter(e => e.type === 'memo_save').length;
        const searches = evs.filter(e => e.type === 'search_query').length;
        return `
          <div style="margin-bottom:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;
                        margin-bottom:5px;">
              <span style="font-size:10px;color:rgba(255,255,255,0.5);">${day}</span>
              <span style="font-size:9px;color:rgba(255,255,255,0.25);">${evs.length}개 활동</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${bar}%;background:linear-gradient(90deg,#4d96ff,#7ab8ff);
                           border-radius:3px;transition:width 0.4s;"></div>
            </div>
            <div style="display:flex;gap:10px;margin-top:5px;">
              ${visits  ? `<span style="font-size:9px;color:rgba(100,180,255,0.6);">👁 노드 ${visits}</span>` : ''}
              ${memos   ? `<span style="font-size:9px;color:rgba(100,220,140,0.6);">✍ 메모 ${memos}</span>` : ''}
              ${searches? `<span style="font-size:9px;color:rgba(255,200,80,0.6);">🔍 검색 ${searches}</span>` : ''}
            </div>
          </div>`;
      }).join('')}

      <div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.25);margin-bottom:8px;">
          자주 본 노드
        </div>
        ${(() => {
          const visits = {};
          history.filter(e=>e.type==='visit'&&e.title).forEach(e=>{visits[e.title]=(visits[e.title]||0)+1;});
          return Object.entries(visits).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([title,cnt])=>`
            <div style="display:flex;justify-content:space-between;padding:5px 0;
                        border-bottom:1px solid rgba(255,255,255,0.04);">
              <span style="font-size:10px;color:rgba(255,255,255,0.5);word-break:break-all;">${title}</span>
              <span style="font-size:9px;color:#4d96ff;flex-shrink:0;margin-left:8px;">${cnt}회</span>
            </div>`).join('');
        })()}
      </div>
    </div>
  `;
  container.innerHTML = html;
}

// ═══════════════════════════════════════════════
// ⑤ 노드 인앱 편집
// ═══════════════════════════════════════════════
export function makeEditPanel(note, noteNodes, onSave) {
  const links = (note.links || []).map(l => typeof l === 'string' ? l : l.target);
  const allTitles = Object.keys(noteNodes);

  const panel = document.createElement('div');
  panel.style.cssText = `
    position:fixed;top:0;right:0;width:340px;height:100vh;
    background:#0b1225;border-left:1px solid rgba(80,130,255,0.2);
    z-index:8000;display:flex;flex-direction:column;
    font-family:'Helvetica Neue',sans-serif;
    transform:translateX(100%);transition:transform 0.3s ease;
  `;

  panel.innerHTML = `
    <div style="padding:18px 18px 12px;border-bottom:1px solid rgba(255,255,255,0.07);
                display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <div style="font-size:9px;letter-spacing:2px;color:#4d96ff;margin-bottom:3px;">EDIT NODE</div>
        <div style="font-size:13px;font-weight:700;color:#fff;">${note.title}</div>
      </div>
      <button id="ep-close" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
              color:rgba(255,255,255,0.5);border-radius:6px;padding:4px 10px;cursor:pointer;">✕</button>
    </div>

    <div style="flex:1;overflow-y:auto;padding:18px;">
      <!-- 제목 -->
      <div style="margin-bottom:16px;">
        <label style="font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.35);display:block;margin-bottom:5px;">제목 (영문·밑줄)</label>
        <input id="ep-title" value="${note.title}"
          style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
                 border-radius:6px;padding:8px 10px;color:#fff;font-size:13px;box-sizing:border-box;
                 outline:none;font-family:monospace;">
      </div>

      <!-- 중요도 -->
      <div style="margin-bottom:16px;">
        <label style="font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.35);display:block;margin-bottom:5px;">
          중요도 <span id="ep-imp-val" style="color:#ffcc33;">${note.importance}</span>
        </label>
        <input type="range" id="ep-importance" min="1" max="30" value="${note.importance}"
          style="width:100%;accent-color:#ffcc33;">
      </div>

      <!-- 카테고리 -->
      <div style="margin-bottom:16px;">
        <label style="font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.35);display:block;margin-bottom:5px;">카테고리</label>
        <select id="ep-category"
          style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
                 border-radius:6px;padding:8px 10px;color:#fff;font-size:12px;box-sizing:border-box;
                 outline:none;">
          ${['IMAGE','CAD','DOCUMENT','DESIGN','MEDIA','OTHER'].map(c =>
            `<option value="${c}" ${c === note.category ? 'selected' : ''} style="background:#0d1528;">${c}</option>`
          ).join('')}
        </select>
      </div>

      <!-- 내용 -->
      <div style="margin-bottom:16px;">
        <label style="font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.35);display:block;margin-bottom:5px;">내용</label>
        <textarea id="ep-content" rows="5"
          style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
                 border-radius:6px;padding:8px 10px;color:#fff;font-size:12px;line-height:1.6;
                 box-sizing:border-box;outline:none;resize:vertical;font-family:inherit;"
        >${note.content || ''}</textarea>
      </div>

      <!-- 링크 -->
      <div style="margin-bottom:20px;">
        <label style="font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.35);display:block;margin-bottom:5px;">
          연결 노드 <span style="color:rgba(255,255,255,0.2);">(클릭으로 추가/제거)</span>
        </label>
        <div id="ep-links-current" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;min-height:24px;"></div>
        <input id="ep-link-search" placeholder="노드 검색..."
          style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);
                 border-radius:6px;padding:6px 10px;color:#fff;font-size:11px;box-sizing:border-box;
                 outline:none;margin-bottom:6px;">
        <div id="ep-link-suggest" style="max-height:120px;overflow-y:auto;"></div>
      </div>
    </div>

    <!-- 저장 버튼 -->
    <div style="padding:14px 18px;border-top:1px solid rgba(255,255,255,0.07);flex-shrink:0;
                display:flex;gap:8px;">
      <button id="ep-save"
        style="flex:1;background:rgba(77,150,255,0.2);border:1px solid rgba(77,150,255,0.4);
               color:#7ab8ff;border-radius:8px;padding:10px;cursor:pointer;font-size:13px;
               font-weight:600;letter-spacing:1px;transition:all 0.15s;">
        저장
      </button>
      <button id="ep-close2"
        style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);
               color:rgba(255,255,255,0.4);border-radius:8px;padding:10px 14px;cursor:pointer;
               font-size:12px;">
        취소
      </button>
    </div>
  `;
  document.body.appendChild(panel);

  // 열기 애니메이션
  requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; });

  // 현재 링크 태그
  let currentLinks = [...links];
  function renderLinks() {
    const cont = panel.querySelector('#ep-links-current');
    cont.innerHTML = currentLinks.map(l =>
      `<span data-l="${l}" style="font-size:9px;padding:3px 8px;background:rgba(77,150,255,0.15);
             border:1px solid rgba(77,150,255,0.3);border-radius:4px;color:#7ab8ff;cursor:pointer;
             letter-spacing:0.5px;">${l} ✕</span>`
    ).join('');
    cont.querySelectorAll('span').forEach(el => {
      el.addEventListener('click', () => {
        currentLinks = currentLinks.filter(l => l !== el.dataset.l);
        renderLinks();
      });
    });
  }
  renderLinks();

  // 중요도 슬라이더
  const impRange = panel.querySelector('#ep-importance');
  const impVal   = panel.querySelector('#ep-imp-val');
  impRange.addEventListener('input', () => { impVal.textContent = impRange.value; });

  // 링크 검색
  const linkSearch = panel.querySelector('#ep-link-search');
  const linkSuggest = panel.querySelector('#ep-link-suggest');
  linkSearch.addEventListener('input', () => {
    const q = linkSearch.value.toLowerCase();
    const matches = allTitles
      .filter(t => t !== note.title && !currentLinks.includes(t) && t.toLowerCase().includes(q))
      .slice(0, 12);
    linkSuggest.innerHTML = matches.map(t =>
      `<div data-t="${t}" style="padding:5px 8px;font-size:10px;color:rgba(255,255,255,0.5);
             cursor:pointer;border-radius:4px;transition:background 0.1s;">${t}</div>`
    ).join('');
    linkSuggest.querySelectorAll('div').forEach(el => {
      el.addEventListener('mouseenter', () => { el.style.background = 'rgba(77,150,255,0.1)'; });
      el.addEventListener('mouseleave', () => { el.style.background = ''; });
      el.addEventListener('click', () => {
        if (!currentLinks.includes(el.dataset.t)) {
          currentLinks.push(el.dataset.t);
          renderLinks();
          linkSearch.value = '';
          linkSuggest.innerHTML = '';
        }
      });
    });
  });

  function close() {
    panel.style.transform = 'translateX(100%)';
    setTimeout(() => panel.remove(), 350);
  }

  panel.querySelector('#ep-close').addEventListener('click', close);
  panel.querySelector('#ep-close2').addEventListener('click', close);

  panel.querySelector('#ep-save').addEventListener('click', () => {
    const updated = {
      ...note,
      title:      panel.querySelector('#ep-title').value.trim().toUpperCase().replace(/\s+/g,'_'),
      importance: parseInt(impRange.value),
      category:   panel.querySelector('#ep-category').value,
      content:    panel.querySelector('#ep-content').value.trim(),
      links:      currentLinks.map(t => ({ target: t, similarity: 1 })),
    };
    onSave(note.title, updated);
    close();
  });

  return { close };
}

// ═══════════════════════════════════════════════
// ⑥ 새 노드 생성
// ═══════════════════════════════════════════════
export function makeNewNodePanel(noteNodes, onSave) {
  const emptyNote = {
    title: '', importance: 10, category: 'OTHER', content: '', links: [], thumbnail: null,
  };
  return makeEditPanel(emptyNote, noteNodes, (_, updated) => {
    if (!updated.title) return;
    onSave(updated);
  });
}
