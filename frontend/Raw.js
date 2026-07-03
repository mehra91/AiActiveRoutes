let state = {
  topic: '',
  category: '',
  provider: ''
};

const topicInput = document.getElementById('topicInput');
const catCards   = document.querySelectorAll('.cat-card');
const provCards  = document.querySelectorAll('.prov-card');
const getBtn     = document.getElementById('getBtn');

// ── Step 1 ──────────────────────────────────────────────
function handleContinue() {
  const val = topicInput.value.trim();
  if (!val) { alert('Please enter a topic!'); topicInput.focus(); return; }
  state.topic = val;
  catCards.forEach(c => c.classList.add('unlocked'));
  document.getElementById('catHint').style.display = 'none';
}

// ── Step 2 ──────────────────────────────────────────────
function selectCategory(el) {
  catCards.forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.category = el.dataset.cat;
  provCards.forEach(p => p.classList.add('unlocked'));
  document.getElementById('provHint').style.display = 'none';
}

// ── Step 3 ──────────────────────────────────────────────
function selectProvider(el) {
  provCards.forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  // FIX: convert to lowercase so backend recognises it ("Grok" → "groq" etc.)
  state.provider = el.dataset.prov.toLowerCase();
  getBtn.classList.add('enabled');
}

// ── Generate results ─────────────────────────────────────
async function fetchContent() {
  if (!state.topic || !state.category || !state.provider) {
    alert('Please complete all steps!'); return;
  }

  hideResults();
  document.getElementById('errorBar').classList.remove('show');
  document.getElementById('loadingState').classList.add('show');
  document.getElementById('loadingLabel').textContent = `Querying ${state.provider}…`;
  getBtn.classList.remove('enabled');

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic:    state.topic,
        category: state.category,
        provider: state.provider
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Something went wrong');
    }

    document.getElementById('loadingState').classList.remove('show');
    renderResults(data.result);
    console.log("backend result",  data.result)
    getBtn.classList.add('enabled');

  } catch (err) {
    document.getElementById('loadingState').classList.remove('show');
    document.getElementById('errorBar').innerHTML = `⚠ ${err.message || 'Error generating content. Please try again.'}`;
    document.getElementById('errorBar').classList.add('show');
    getBtn.classList.add('enabled');
  }
}

// ── Render cards ─────────────────────────────────────────
function renderResults(items) {
  // FIX: attach provider + category to each item so openDetail can use them
  items = items.map(item => ({
    ...item,
    provider: state.provider,
    category: state.category
  }));

  window._currentResults = items;

  const grid = document.getElementById('resultsGrid');
  document.getElementById('resultsTitle').textContent = `Results for "${state.topic}"`;
  document.getElementById('resultsMeta').textContent =
    `${state.category} · ${state.provider} · ${items.length} items`;

  grid.innerHTML = '';
  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="rc-provider">${cap(item.provider)}</div>
      <div class="rc-title">${item.title}</div>
      <div class="rc-summary">${item.content.slice(0, 120)}…</div>
      <div class="rc-footer">
        <span class="rc-tag">${item.category}</span>
        <button class="btn-read" onclick="openDetail(${idx})">Read More →</button>
      </div>
    `;
    grid.appendChild(card);
  });

  document.getElementById('resultsSection').classList.add('show');
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ════════════════════════════════════════════
// DETAIL PAGE
// ════════════════════════════════════════════

async function openDetail(idx) {
  const items = window._currentResults;
  const item = items[parseInt(idx)]; 
  console.log("open details", item)
  
  // Set provider badge
  document.getElementById('detailProviderBadge').textContent = cap(item.provider);

  // Show overlay
  const overlay = document.getElementById('detailOverlay');
  overlay.style.display = 'block';
  overlay.scrollTop = 0;

  // Lock main page scroll
  document.body.style.overflow = 'hidden';

  // Show spinner, hide content
  document.getElementById('detailLoading').classList.add('show');
  document.getElementById('detailContent').classList.remove('show');
  document.getElementById('detailLoadingText').textContent = `Fetching from ${cap(item.provider)}…`;

  // Simulate loading delay
  setTimeout(() => {
    const detail = item;

    // Populate Title
    document.getElementById('detailTitle').textContent = detail.title;
    document.getElementById('detailMetaRow').innerHTML = `
      <span class="meta-chip cat">${cap(item.category)}</span>
      <span class="meta-chip">${cap(item.provider)}</span>
      <span class="meta-chip">${new Date().toLocaleDateString('en-US',
        { month: 'short', day: 'numeric', year: 'numeric' })}</span>
    `;

    // Populate Content — split on double newlines into paragraphs
    const bodyEl = document.getElementById('detailBody');
    bodyEl.innerHTML = detail.content
      .split('\n\n')
      .map(p => `<p>${p.trim()}</p>`)
      .join('');

    //  Populate Points To Note — bullet points
    console.log("Points data:", detail.pointsToNote); // Debug log
    
    
    // Populate Conclusion
    document.getElementById('detailConclusion').textContent = detail.conclusion;

    // Swap loading → content
    document.getElementById('detailLoading').classList.remove('show');
    document.getElementById('detailContent').classList.add('show');

    window._currentDetail = detail;
  }, 1000);
}


// ── Close detail overlay ─────────────────────────────────
function closeDetail() {
  const overlay = document.getElementById('detailOverlay');
  overlay.style.display = 'none';
  document.body.style.overflow = '';

  document.getElementById('detailLoading').classList.remove('show');
  document.getElementById('detailContent').classList.remove('show');
}

// ── Copy to clipboard ────────────────────────────────────
function copyContent() {
  if (!window._currentDetail) return;
  const d = window._currentDetail;
  
  // Include all sections in the copied text
  const pointsText = d.pointsToNote 
    ? `\n\nPoints To Note:\n${d.pointsToNote}` : '';
  
  const text = `${d.title}\n\n${d.content}${pointsText}\n\nConclusion:\n${d.conclusion}`;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.btn-copy');
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '📋 Copy Content';
      btn.classList.remove('copied');
    }, 2000);
  });
}


// ── Helpers ──────────────────────────────────────────────
function cap(str) { return str.charAt(0).toUpperCase() + str.slice(1); }
// ── Reset all ────────────────────────────────────────────
function resetAll() {
  state = { topic: '', category: '', provider: '' };
  topicInput.value = '';
  catCards.forEach(c => c.classList.remove('unlocked', 'selected'));
  provCards.forEach(p => p.classList.remove('unlocked', 'selected'));
  getBtn.classList.remove('enabled');
  document.getElementById('catHint').style.display = '';
  document.getElementById('provHint').style.display = '';
  document.getElementById('errorBar').classList.remove('show');
  hideResults();
  topicInput.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideResults() {
  document.getElementById('resultsSection').classList.remove('show');
}

// ── Landing Page Navigation ──────────────────
function goToApp() {
  document.getElementById('landingPage').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  topicInput.focus();
}