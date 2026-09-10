// ui/bronselectie.js - V2 DEFINITIEF - werkt met index.html v606 (#filter-panel, #bron-count, #filter-all, #filter-toggle)
import { BRONNEN } from '../config/bronnen.js';

export function renderBronselectie({ state, allArticles, loadedSources, onSave, onFilter }) {
  const panel = document.getElementById('filter-panel');
  if (!panel) return;
  
  // Behoud hidden state, maar vul binnenkant
  const isHidden = panel.classList.contains('hidden');
  panel.innerHTML = '<div id="source-list"></div>';
  if (isHidden) panel.classList.add('hidden');
  
  const list = document.getElementById('source-list');
  list.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:12px;';

  BRONNEN.forEach(b => {
    const s = state[b.id] || { aan: true, vandaag: false, scope: 'gemeente' };
    const allForBron = allArticles.filter(a => a.id === b.id && !a.isFallback);
    const loadedCount = allForBron.length;
    const isLoaded = loadedSources.has(b.id);
    
    let ledClass = 'loading';
    if (isLoaded) ledClass = loadedCount > 0 ? 'ok' : 'empty';

    const row = document.createElement('div');
    row.className = 'source-row' + (s.aan ? '' : ' off');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:white;border-radius:8px;border:1px solid #eee;';
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
        <span class="source-led ${ledClass}" data-id="${b.id}" style="width:12px;height:12px;border-radius:999px;display:block;flex-shrink:0;background:${ledClass==='ok'?'#16a34a':ledClass==='empty'?'#f59e0b':'#ef4444'}"></span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${b.name}</div>
          <div style="font-size:11px;color:#666;">${b.sub} • ${loadedCount} artikelen</div>
        </div>
      </div>
      <label class="switch" style="position:relative;display:inline-block;width:44px;height:24px;">
        <input type="checkbox" ${s.aan?'checked':''} data-id="${b.id}" data-type="aan" style="opacity:0;width:0;height:0;">
        <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${s.aan?'#0b5bd3':'#ccc'};border-radius:24px;transition:.2s;"></span>
      </label>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('input[data-type="aan"]').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (!state[id]) state[id] = { aan: true, vandaag: false, scope: 'gemeente' };
      state[id].aan = e.target.checked;
      onSave();
      onFilter();
      // Re-render voor count update, zonder panel te sluiten
      renderBronselectie({ state, allArticles, loadedSources, onSave, onFilter });
    });
  });
}

export function setupBronselectieToggle({ state, onSave, onFilter }) {
  const toggle = document.getElementById('filter-toggle');
  const panel = document.getElementById('filter-panel');
  const allBtn = document.getElementById('filter-all');

  if (toggle && panel) {
    toggle.addEventListener('click', () => {
      panel.classList.toggle('hidden');
      toggle.textContent = panel.classList.contains('hidden') ? '▼' : '▲';
      try { localStorage.setItem('ommen_filter_panel_open', panel.classList.contains('hidden') ? '0' : '1'); } catch {}
    });
    // Restore open state
    try {
      if (localStorage.getItem('ommen_filter_panel_open') === '1') {
        panel.classList.remove('hidden');
        toggle.textContent = '▲';
      }
    } catch {}
  }

  if (allBtn) {
    allBtn.addEventListener('click', () => {
      const allOn = Object.values(state).every(s => s.aan);
      Object.keys(state).forEach(k => { state[k].aan = !allOn; });
      onSave();
      onFilter();
      document.dispatchEvent(new CustomEvent('refreshBronselectie'));
    });
  }
}

export function updateBronCount(state) {
  const BRONNEN_COUNT = Object.keys(state).length;
  const aan = Object.values(state).filter(s => s.aan).length;
  const el = document.getElementById('bron-count');
  if (el) el.textContent = `${aan} v/d ${BRONNEN_COUNT} bronnen`;
  const allBtn = document.getElementById('filter-all');
  if (allBtn) {
    if (aan === BRONNEN_COUNT) allBtn.textContent = 'Alles uit';
    else if (aan === 0) allBtn.textContent = 'Alles aan';
    else allBtn.textContent = 'Alles aan/uit';
  }
}
