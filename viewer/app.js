const PROXY_BASE = 'http://localhost:3001';

const addressBar   = document.getElementById('address-bar');
const btnGo        = document.getElementById('btn-go');
const btnBack      = document.getElementById('btn-back');
const btnForward   = document.getElementById('btn-forward');
const btnRefresh   = document.getElementById('btn-refresh');
const btnStar      = document.getElementById('btn-star');
const starIcon     = document.getElementById('star-icon');
const tabFavicon   = document.getElementById('tab-favicon');
const tabTitle     = document.getElementById('tab-title');
const addrFavicon  = document.getElementById('address-favicon');
const spinner      = document.getElementById('loading-spinner');
const frame        = document.getElementById('viewer-frame');
const startScreen  = document.getElementById('start-screen');
const errorScreen  = document.getElementById('error-screen');
const errorMsg     = document.getElementById('error-message');
const btnRetry     = document.getElementById('btn-retry');
const bookmarksBar = document.getElementById('bookmarks-bar');
const quickLinks   = document.getElementById('quick-links');

let history = [], cursor = -1, current = null;

const DEFAULT_BOOKMARKS = [
  { url: 'https://www.google.com',       title: 'Google',       favicon: 'https://www.google.com/favicon.ico' },
  { url: 'https://github.com',           title: 'GitHub',       favicon: 'https://github.com/favicon.ico' },
  { url: 'https://en.wikipedia.org',     title: 'Wikipedia',    favicon: 'https://en.wikipedia.org/favicon.ico' },
  { url: 'https://www.youtube.com',      title: 'YouTube',      favicon: 'https://www.youtube.com/favicon.ico' },
  { url: 'https://news.ycombinator.com', title: 'Hacker News',  favicon: 'https://news.ycombinator.com/favicon.ico' },
];

function loadBookmarks() {
  try { const s = localStorage.getItem('web-viewer-bookmarks'); return s ? JSON.parse(s) : [...DEFAULT_BOOKMARKS]; }
  catch { return [...DEFAULT_BOOKMARKS]; }
}
function saveBookmarks(b) { localStorage.setItem('web-viewer-bookmarks', JSON.stringify(b)); }
let bookmarks = loadBookmarks();

function normalise(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
  try {
    const u = new URL(url);
    const isYT    = u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com';
    const isShort = u.hostname === 'youtu.be';
    if (isYT && u.pathname === '/watch') {
      const v = u.searchParams.get('v');
      if (v) url = `https://www.youtube.com/embed/${v}`;
    } else if (isShort) {
      const v = u.pathname.replace(/^\//, '').split('?')[0];
      if (v) url = `https://www.youtube.com/embed/${v}`;
    }
  } catch {}
  return url;
}

function isYouTubeEmbed(url) {
  try { const u = new URL(url); return (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') && u.pathname.startsWith('/embed/'); }
  catch { return false; }
}

function setLoading(on) { spinner.classList.toggle('active', on); btnGo.disabled = on; btnRefresh.disabled = on; }
function showStart()     { startScreen.style.display='flex'; errorScreen.style.display='none'; frame.style.display='none'; }
function showError(msg)  { startScreen.style.display='none'; errorScreen.style.display='flex'; frame.style.display='none'; errorMsg.textContent=msg; }
function showFrame()     { startScreen.style.display='none'; errorScreen.style.display='none'; frame.style.display='block'; }
function updateNav()     { btnBack.disabled=cursor<=0; btnForward.disabled=cursor>=history.length-1; }

function setFavicon(f) {
  if (f) { addrFavicon.src=f; addrFavicon.style.display='block'; tabFavicon.src=f; tabFavicon.style.display='block'; }
  else   { addrFavicon.style.display='none'; tabFavicon.style.display='none'; }
}
function setTitle(t) {
  const title = t || new URL(current||'about:blank').hostname || 'Untitled';
  tabTitle.textContent = title; document.title = title + ' — Web Viewer';
}
function updateStarBtn() {
  const starred = current && bookmarks.some(b => b.url === current);
  btnStar.classList.toggle('starred', !!starred);
  starIcon.setAttribute('fill', starred ? '#f5c842' : 'none');
  starIcon.setAttribute('stroke', starred ? '#f5c842' : 'currentColor');
}

function renderBookmarks() {
  bookmarksBar.innerHTML = ''; quickLinks.innerHTML = '';
  bookmarks.forEach((bm, idx) => {
    const item = document.createElement('div'); item.className = 'bookmark-item';
    const btn = document.createElement('button'); btn.className = 'bookmark-btn'; btn.title = bm.url;
    btn.onclick = () => navigate(bm.url);
    if (bm.favicon) { const img = document.createElement('img'); img.src=bm.favicon; img.className='bookmark-favicon'; img.onerror=()=>img.remove(); btn.appendChild(img); }
    const label = document.createElement('span'); label.textContent = bm.title; btn.appendChild(label);
    const rm = document.createElement('button'); rm.className = 'bookmark-remove'; rm.title = 'Remove';
    rm.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    rm.onclick = e => { e.stopPropagation(); bookmarks.splice(idx,1); saveBookmarks(bookmarks); renderBookmarks(); updateStarBtn(); };
    item.appendChild(btn); item.appendChild(rm); bookmarksBar.appendChild(item);

    const ql = document.createElement('button'); ql.className = 'quick-link-btn'; ql.onclick = () => navigate(bm.url);
    if (bm.favicon) { const img2=document.createElement('img'); img2.src=bm.favicon; img2.className='quick-link-favicon'; img2.onerror=()=>img2.remove(); ql.appendChild(img2); }
    const lbl = document.createElement('span'); lbl.textContent = bm.title; ql.appendChild(lbl);
    quickLinks.appendChild(ql);
  });
}

async function fetchAndDisplay(url) {
  setLoading(true);
  try {
    if (isYouTubeEmbed(url)) {
      frame.removeAttribute('srcdoc');
      frame.src = url;
      frame.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
      frame.removeAttribute('sandbox');
      current = url; addressBar.value = url; updateStarBtn(); showFrame();
      setTitle('YouTube'); setFavicon('https://www.youtube.com/favicon.ico');
      return;
    }
    const res = await fetch(`${PROXY_BASE}/proxy?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Server error: ${res.status}`);
    current = data.url; addressBar.value = current; updateStarBtn();
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    frame.removeAttribute('allow');
    frame.srcdoc = data.content;
    showFrame();
    fetchMetadata(current);
  } catch(err) {
    showError(err.message || 'Could not load the page. Check the URL and try again.');
  } finally { setLoading(false); }
}

async function fetchMetadata(url) {
  try {
    const res = await fetch(`${PROXY_BASE}/proxy/metadata?url=${encodeURIComponent(url)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.title) setTitle(data.title);
    if (data.favicon) setFavicon(data.favicon);
  } catch {}
}

function navigate(rawUrl) {
  const url = normalise(rawUrl); if (!url) return;
  history = history.slice(0, cursor + 1); history.push(url); cursor = history.length - 1;
  updateNav(); addressBar.value = url; tabTitle.textContent = 'Loading...';
  fetchAndDisplay(url);
}
function goBack()    { if (cursor>0) { cursor--; updateNav(); addressBar.value=history[cursor]; fetchAndDisplay(history[cursor]); } }
function goForward() { if (cursor<history.length-1) { cursor++; updateNav(); addressBar.value=history[cursor]; fetchAndDisplay(history[cursor]); } }
function refresh()   { if (current) fetchAndDisplay(current); }

btnGo.addEventListener('click', () => navigate(addressBar.value));
addressBar.addEventListener('keydown', e => { if (e.key==='Enter') navigate(addressBar.value); });
addressBar.addEventListener('focus', e => e.target.select());
btnBack.addEventListener('click', goBack);
btnForward.addEventListener('click', goForward);
btnRefresh.addEventListener('click', refresh);
btnRetry.addEventListener('click', () => { if (current) navigate(current); });
btnStar.addEventListener('click', () => {
  if (!current) return;
  const idx = bookmarks.findIndex(b => b.url===current);
  if (idx>=0) { bookmarks.splice(idx,1); }
  else { bookmarks.push({ url: current, title: tabTitle.textContent||current, favicon: addrFavicon.style.display!=='none'?addrFavicon.src:null }); }
  saveBookmarks(bookmarks); renderBookmarks(); updateStarBtn();
});
window.addEventListener('message', e => {
  if (!e.data||typeof e.data!=='object') return;
  if (e.data.type==='NAVIGATE'&&e.data.url) navigate(e.data.url);
  if (e.data.type==='URL_CHANGE'&&e.data.url) { addressBar.value=e.data.url; current=e.data.url; updateStarBtn(); }
});
document.addEventListener('keydown', e => {
  if ((e.metaKey||e.ctrlKey)&&e.key==='l') { e.preventDefault(); addressBar.focus(); addressBar.select(); }
  if ((e.metaKey||e.ctrlKey)&&e.key==='r') { e.preventDefault(); refresh(); }
  if ((e.metaKey||e.ctrlKey)&&e.key==='[') { e.preventDefault(); goBack(); }
  if ((e.metaKey||e.ctrlKey)&&e.key===']') { e.preventDefault(); goForward(); }
});

renderBookmarks(); showStart(); updateNav(); updateStarBtn();