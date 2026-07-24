import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors()); app.use(express.json());

const NAVIGATION_INTERCEPT = `<script>(function(){
  document.addEventListener('click',function(e){var el=e.target.closest('a');if(el&&el.href&&el.href.startsWith('http')){e.preventDefault();window.parent.postMessage({type:'NAVIGATE',url:el.href},'*');}});
  document.addEventListener('submit',function(e){var f=e.target;if(f&&f.action&&f.action.startsWith('http')){e.preventDefault();window.parent.postMessage({type:'NAVIGATE',url:f.action},'*');}});
  window.parent.postMessage({type:'URL_CHANGE',url:window.location.href},'*');
})();<\/script>`;

function rewriteUrls(html, baseUrl) {
  try {
    const base=new URL(baseUrl), origin=base.origin, baseHref=baseUrl.substring(0,baseUrl.lastIndexOf('/')+1);
    return html
      .replace(/(src|href|action)="(\/\/[^"]*?)"/gi,(_,a,u)=>`${a}="${base.protocol}${u}"`)
      .replace(/(src|href|action)="(\/[^"]*?)"/gi,(_,a,u)=>`${a}="${origin}${u}"`)
      .replace(/(src|href|action)="(?!https?:\/\/|\/\/|#|mailto:|javascript:)([^"]*?)"/gi,(_,a,u)=>u?`${a}="${baseHref}${u}"`:_);
  } catch { return html; }
}

app.get('/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: "Missing 'url' query parameter" });
  let targetUrl;
  try { const u=new URL(url); if(!['http:','https:'].includes(u.protocol)) return res.status(400).json({error:'Only http/https supported'}); targetUrl=u.toString(); }
  catch { return res.status(400).json({ error: 'Invalid URL' }); }
  try {
    const ctrl=new AbortController(), t=setTimeout(()=>ctrl.abort(),15000);
    const upstream = await fetch(targetUrl, {
      headers: { 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36', 'Accept':'text/html,*/*;q=0.8', 'Accept-Language':'en-US,en;q=0.9', 'Accept-Encoding':'identity', 'Cache-Control':'no-cache' },
      redirect: 'follow', signal: ctrl.signal
    });
    clearTimeout(t);
    const contentType=upstream.headers.get('content-type')?? 'text/html', finalUrl=upstream.url??targetUrl, status=upstream.status;
    let content = await upstream.text();
    if (contentType.includes('text/html')) {
      content = rewriteUrls(content, finalUrl);
      content = content.includes('</body>') ? content.replace('</body>', NAVIGATION_INTERCEPT+'</body>') : content+NAVIGATION_INTERCEPT;
    }
    res.json({ url: finalUrl, content, contentType, status });
  } catch(err) { res.status(502).json({ error: err?.name==='AbortError'?'Timed out after 15s':err?.message||'Failed to fetch' }); }
});

app.get('/proxy/metadata', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: "Missing 'url' query parameter" });
  let targetUrl;
  try { const u=new URL(url); if(!['http:','https:'].includes(u.protocol)) return res.status(400).json({error:'Only http/https supported'}); targetUrl=u.toString(); }
  catch { return res.status(400).json({ error: 'Invalid URL' }); }
  try {
    const ctrl=new AbortController(), t=setTimeout(()=>ctrl.abort(),10000);
    const upstream = await fetch(targetUrl, { headers: {'User-Agent':'Mozilla/5.0','Accept':'text/html,*/*;q=0.8','Accept-Encoding':'identity'}, redirect:'follow', signal:ctrl.signal });
    clearTimeout(t);
    const finalUrl=upstream.url??targetUrl, html=await upstream.text();
    const title       = (html.match(/<title[^>]*>([^<]*)<\/title>/i)||[])[1]?.trim()||null;
    const description = (html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)||[])[1]?.trim()||null;
    let favicon=null;
    const fm = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*)["']/i);
    if (fm) try { favicon=new URL(fm[1],finalUrl).toString(); } catch {}
    if (!favicon) try { favicon=new URL('/favicon.ico',finalUrl).toString(); } catch {}
    res.json({ url: finalUrl, title, description, favicon });
  } catch(err) { res.status(502).json({ error: err?.name==='AbortError'?'Timed out':err?.message||'Failed' }); }
});

app.listen(PORT, () => console.log(`Proxy running at http://localhost:${PORT}\nOpen index.html with VSCode Live Server`));