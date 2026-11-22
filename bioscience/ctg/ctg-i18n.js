/* Shared localization for the existing static report and its dynamic record desk. */
(() => {
  'use strict';
  const languages = ['ru', 'kk', 'en'];
  const storageKey = 'ctg.language.v1';
  const requested = new URLSearchParams(location.search).get('lang');
  let saved;
  try { saved = localStorage.getItem(storageKey); } catch {}
  let language = languages.includes(requested) ? requested : languages.includes(saved) ? saved : 'ru';
  const originals = new WeakMap();
  const attributeOriginals = new WeakMap();
  const dictionaries = [window.CTG_COPY || {}, window.CTG_STATIC_COPY || {}, window.CTG_EXTRA_COPY || {}];
  const phrases = new Map();
  for (const dictionary of dictionaries) for (const entry of Object.values(dictionary)) if (entry.en) phrases.set(entry.en.replace(/\s+/g, ' ').trim(), entry);
  const locale = () => ({ru:'ru-RU', kk:'kk-KZ', en:'en-GB'}[language]);
  function t(key, values = {}) {
    const entry = dictionaries.map(d => d[key]).find(Boolean);
    return (entry?.[language] || entry?.en || key).replace(/\{(\w+)\}/g, (all, key) => values[key] ?? all);
  }
  const templates = [];
  for (const dictionary of dictionaries) for (const entry of Object.values(dictionary)) {
    if (!entry.en?.includes('{')) continue;
    const keys = [];
    const source = entry.en.split(/(\{\w+\})/).map(part => {
      if (/^\{\w+\}$/.test(part)) { const key=part.slice(1,-1);keys.push(key); return key==='pct' ? '([0-9.,]+%)' : ['n','total','tp','fp','pos','neg','view','start','end','page','pages','id','row'].includes(key) ? '([+−0-9.,\\s-]+)' : '(.+?)'; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    templates.push({expression: new RegExp('^' + source + '$'), keys, entry});
  }
  templates.sort((a,b) => b.expression.source.length-a.expression.source.length);
  function phrase(value, depth = 0) {
    if (typeof value !== 'string' || language === 'en') return value;
    const normalized = value.replace(/\s+/g, ' ').trim();
    let translated = phrases.get(normalized)?.[language];
    if (!translated) for (const {expression, keys, entry} of templates) {
      const match = normalized.match(expression);
      if (match) {
        translated = entry[language].replace(/\{(\w+)\}/g, (_, key) => depth < 3 ? phrase(match[keys.indexOf(key) + 1], depth + 1) : match[keys.indexOf(key) + 1]);
        break;
      }
    }
    if (!translated && depth < 3) {
      if (normalized.includes(' · ')) translated = normalized.split(' · ').map(part => phrase(part, depth + 1)).join(' · ');
      else if (normalized.endsWith('.')) { const stem=normalized.slice(0,-1), result=phrase(stem,depth+1); if(result!==stem) translated=result+'.'; }
    }
    return translated ? value.match(/^\s*/)[0] + translated + value.match(/\s*$/)[0] : value;
  }
  function textNode(node) {
    if (!node.parentElement || node.parentElement.closest('script,style,code,[translate="no"],[data-i18n],[data-i18n-html]')) return;
    const previous = originals.get(node);
    const source = previous && node.nodeValue === previous.output ? previous.source : node.nodeValue;
    const output = phrase(source);
    originals.set(node, {source, output});
    if (node.nodeValue !== output) node.nodeValue = output;
  }
  const attributes = ['aria-label','aria-valuetext','title','alt','placeholder'];
  function element(el) {
    if (el.closest('script,style,[translate="no"]')) return;
    if (el.dataset.i18n) el.textContent = t(el.dataset.i18n);
    if (el.dataset.i18nHtml) el.innerHTML = t(el.dataset.i18nHtml);
    for (const attr of attributes) {
      if (!el.hasAttribute(attr)) continue;
      const entries = attributeOriginals.get(el) || {};
      const current = el.getAttribute(attr), previous = entries[attr];
      const source = previous && current === previous.output ? previous.source : current;
      const output = phrase(source);
      entries[attr] = {source, output};
      attributeOriginals.set(el, entries);
      if (current !== output) el.setAttribute(attr, output);
    }
  }
  let observer;
  function localize(root = document.body) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { textNode(root); return; }
    if (root.nodeType === Node.ELEMENT_NODE) element(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.nodeType === Node.ELEMENT_NODE && node.matches('script,style,[translate="no"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    let node;
    while ((node = walker.nextNode())) node.nodeType === Node.TEXT_NODE ? textNode(node) : element(node);
  }
  function setLanguage(next) {
    if (!languages.includes(next)) return;
    language = next;
    document.documentElement.lang = next;
    try { localStorage.setItem(storageKey, next); } catch {}
    const url = new URL(location.href); url.searchParams.set('lang', next);
    history.replaceState(history.state, '', url);
    observer?.disconnect();
    localize(document.body);
    document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === next)));
    document.title = phrase(document.title.replace(/ · (?:Результат|Нәтиже) №/g, ' · Result #'));
    window.dispatchEvent(new CustomEvent('ctg:languagechange', {detail: next}));
    localize(document.body);
    observe();
  }
  function observe() {
    if (typeof document === 'undefined' || !document.body) return;
    observer?.observe(document.body, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:attributes});
  }
  function header() {
    const host = document.querySelector('.mast-row, .result-header .result-wrap');
    if (!host) return;
    const controls = document.createElement('div'); controls.className='ctg-site-controls';
    const picker = document.createElement('div'); picker.className='ctg-languages'; picker.setAttribute('role','group'); picker.setAttribute('aria-label','Language');
    for (const [code,label,title] of [['ru','РУС','Русский'],['kk','ҚАЗ','Қазақша'],['en','ENG','English']]) {
      const button=document.createElement('button');button.type='button';button.dataset.language=code;button.lang=code;button.textContent=label;button.title=title;
      button.setAttribute('aria-pressed',String(code===language));button.addEventListener('click',()=>setLanguage(code));picker.append(button);
    }
    const menu=document.createElement('details');menu.className='ctg-menu';
    const summary=document.createElement('summary');summary.dataset.i18n='menu';summary.textContent=t('menu');
    const nav=document.createElement('nav');nav.setAttribute('aria-label','Site navigation');
    const links=[['overview','/bioscience/ctg/'],['results','/bioscience/ctg/#results'],['records','/bioscience/ctg/#experiments'],['methods','/bioscience/ctg/#methods'],['offline','/bioscience/ctg/#offline'],['sources','/bioscience/ctg/#sources'],['home','/']];
    for(const [key,path] of links){const a=document.createElement('a');a.href=path;a.dataset.i18n=key;a.textContent=t(key);a.addEventListener('click',()=>{menu.open=false;});nav.append(a);}
    menu.append(summary,nav);controls.append(picker,menu);host.append(controls);
    document.addEventListener('keydown', event=>{if(event.key==='Escape'&&menu.open){menu.open=false;summary.focus();}});
    document.addEventListener('click',event=>{if(menu.open&&!menu.contains(event.target))menu.open=false;});
    document.addEventListener('click',event=>{
      const link=event.target.closest('a[href]');if(!link||link.hasAttribute('download'))return;
      const url=new URL(link.href,location.href);
      if(url.origin===location.origin&&url.pathname.startsWith('/bioscience/ctg/')&&!/\.json$/.test(url.pathname)){
        if(url.pathname===location.pathname && url.search===location.search) return;
        url.searchParams.set('lang',language);link.href=url.href;
      }
    },true);
  }
  window.CTGI18n={t,phrase,localize,setLanguage,get language(){return language;},locale,number:(n,digits=0)=>Number(n).toLocaleString(locale(),{minimumFractionDigits:digits,maximumFractionDigits:digits})};
  document.documentElement.lang=language;
  document.addEventListener('DOMContentLoaded',()=>{
    header();localize(document.body);
    const titleSource=document.title;
    const titleUpdate=()=>{document.title=phrase(titleSource);};titleUpdate();
    window.addEventListener('ctg:languagechange',titleUpdate);
    observer=new MutationObserver(mutations=>{
      if(typeof document === "undefined" || !document.body) return;
      observer.disconnect();
      for(const mutation of mutations){
        if(mutation.type==='childList')for(const node of mutation.addedNodes)localize(node);
        else if(mutation.type==='characterData')textNode(mutation.target);
        else element(mutation.target);
      }
      observe();
    });observe();
    window.addEventListener("pagehide",()=>observer.disconnect());
    window.addEventListener("pageshow",observe);
  });
})();
