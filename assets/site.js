// Site-wide helpers: catalog filtering, API calls, credit display.
const api = async (path, body) => {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({ error: 'Bad response' }));
  if (typeof j.credits === 'number') { const c = document.getElementById('credits'); if (c) c.textContent = j.credits; }
  if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { data: j });
  return j;
};
window.sd = { api };

// Catalog: genre chips + search
(() => {
  const grid = document.querySelector('[data-catalog]'); if (!grid) return;
  const chips = document.querySelectorAll('[data-genre-chip]'); const q = document.querySelector('[data-filter]');
  let genre = '';
  const apply = () => {
    const term = (q?.value || '').toLowerCase().trim(); let shown = 0;
    grid.querySelectorAll('.card').forEach((c) => { const ok = (!genre || c.dataset.genre === genre) && (!term || c.dataset.search.includes(term)); c.hidden = !ok; shown += ok; });
    const e = document.querySelector('[data-none]'); if (e) e.hidden = shown > 0;
  };
  chips.forEach((ch) => ch.addEventListener('click', () => { genre = ch.dataset.genreChip; chips.forEach((x) => x.classList.toggle('on', x === ch)); apply(); }));
  q?.addEventListener('input', apply);
})();
