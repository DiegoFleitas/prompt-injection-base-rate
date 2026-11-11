(() => {
  const body = document.body; if (!body) return {err:'nobody'};
  const hiddenEls = new Set(); const out = []; const seenText = new Set();
  const unicode = {};
  const INVIS = /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u2800\u3164\uFEFF\uFFA0\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu;
  const rgb = s => { const m = (s||'').match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x)); return {r:p[0],g:p[1],b:p[2],a:(p.length>3?p[3]:1)}; };
  const bgOf = el => { let n = el; for (let i=0;i<12&&n;i++){ const c = rgb(getComputedStyle(n).backgroundColor); if (c && c.a>0.9) return c; n=n.parentElement; } return {r:255,g:255,b:255,a:1}; };
  const els = body.querySelectorAll('*');
  for (const el of els) {
    const tag = el.tagName;
    if (tag==='SCRIPT'||tag==='STYLE'||tag==='NOSCRIPT'||tag==='TEMPLATE'||tag==='TITLE'||tag==='META'||tag==='LINK') continue;
    let ancHidden = false;
    for (let p = el.parentElement, i=0; p && i<40; p = p.parentElement, i++) if (hiddenEls.has(p)) { ancHidden = true; break; }
    if (ancHidden) continue;
    const cs = getComputedStyle(el); const why = [];
    if (cs.display === 'none') why.push('display_none');
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') why.push('visibility_hidden');
    const fs = parseFloat(cs.fontSize); if (!isNaN(fs) && fs <= 1) why.push('tiny_font');
    const op = parseFloat(cs.opacity); if (op === 0) why.push('opacity0');
    const fg = rgb(cs.color);
    if (fg && fg.a < 0.05) why.push('transparent_color');
    else if (fg && fg.a > 0.5 && Math.abs(fg.r-fg.g)<3 && Math.abs(fg.g-fg.b)<3 && fg.r > 235) {
      const bg = bgOf(el);
      if (Math.abs(bg.r-fg.r)<12 && Math.abs(bg.g-fg.g)<12 && Math.abs(bg.b-fg.b)<12) why.push('color_eq_bg');
    }
    const w = parseFloat(cs.width), h = parseFloat(cs.height);
    if ((w<=1 && h<=1 && w>=0 && h>=0) || (cs.clip && /rect\(0px?,?\s*0px?,?\s*0px?,?\s*0px?\)/.test(cs.clip))) why.push('sr_box');
    if (cs.overflow==='hidden' && h===0 && w>2) why.push('zero_height');
    const r = el.getBoundingClientRect();
    if (cs.position!=='fixed' && (r.right < -1 || r.bottom < -1 || r.left > window.innerWidth + 2500)) why.push('offscreen');
    if (!why.length) continue;
    let own=''; for (const n of el.childNodes) if (n.nodeType===3) own += n.textContent;
    own = own.replace(/\s+/g,' ').trim();
    if (own.length < 3 || seenText.has(own)) continue;
    seenText.add(own); hiddenEls.add(el);
    const rng = document.createRange(); rng.selectNodeContents(el);
    const rect = rng.getBoundingClientRect();
    out.push({why, tag: tag.toLowerCase(), text: own.slice(0,300),
              w: Math.round(rect.width), h: Math.round(rect.height),
              in_main: !!el.closest('main,article,[role=main]')});
  }
  const it = body.innerText || '', tc = body.textContent || '';
  for (const m of tc.matchAll(INVIS)) { const k = m[0].codePointAt(0).toString(16); unicode[k] = (unicode[k]||0)+1; }
  let nattr=0; for (const el of body.querySelectorAll('[aria-label],[title],[alt]')) {
    for (const a of ['aria-label','title','alt']) { const v = el.getAttribute(a)||''; if (v.replace(/[^0-9A-Za-z]/g,'').length>=40) nattr++; }
  }
  return {url: location.href, title: document.title, inner: it.length, tc: tc.length,
          n_hidden: out.length, hidden: out.slice(0,30), unicode, n_attr: nattr,
          links: document.querySelectorAll('a').length};
})()
