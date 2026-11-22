// Run: NODE_PATH=/tmp/ctg-dom-check/node_modules node scripts/test-ctg.cjs
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
class LocalResources extends ResourceLoader {
  fetch(url){const parsed=new URL(url);if(parsed.origin!=='https://agentslop.si')return null;const file=path.join(root,decodeURIComponent(parsed.pathname));return fs.existsSync(file)?Promise.resolve(fs.readFileSync(file)):null;}
}
const errors=[];
async function open(route,stored){
 const file=path.join(root,route.split('?')[0], 'index.html');
 const vc=new VirtualConsole();vc.on('jsdomError',err=>{if(!err.message.includes('Could not parse CSS stylesheet'))errors.push(err.message);});
 const dom=new JSDOM(fs.readFileSync(file,'utf8'),{url:'https://agentslop.si/'+route,resources:new LocalResources(),runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.Element.prototype.scrollIntoView=function(){};
  w.fetch=async relative=>{const u=new URL(relative,w.location.href);const f=path.join(root,u.pathname);return {ok:fs.existsSync(f),json:async()=>JSON.parse(fs.readFileSync(f))};};
  w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
  if(stored)w.localStorage.setItem('ctg.language.v1',stored);
 }});
 await new Promise(resolve=>dom.window.addEventListener('load',()=>setImmediate(resolve)));
 return dom;
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function englishRemainder(w){
 const out=new Set();const walker=w.document.createTreeWalker(w.document.body,w.NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode,p=node.parentElement;
  if(p.closest('script,style,[translate=no],noscript,option')||!/[A-Za-z]{4}/.test(node.textContent))continue;
  const str=node.textContent.replace(/\s+/g,' ').trim();if(str)out.add(str);
 }
 return [...out];
}
(async()=>{
 const dom=await open('bioscience/ctg/');const w=dom.window,doc=w.document;
 assert.equal(doc.documentElement.lang,'ru');
 assert.match(doc.querySelector('#ia-title').textContent,/КТГ/);
 assert.equal(doc.querySelector('.ctg-menu summary').textContent,'Меню');
 assert.equal(doc.querySelectorAll('#list tbody tr').length,16);
 assert.match(doc.querySelector('#counts').textContent,/1,221|1 221|1 221/);
 const raw=JSON.parse(doc.querySelector('#data').textContent);
 assert.equal(raw.entries.flatMap(e=>e.rows).length+raw.other.length,1221);
 for(const lang of ['kk','en','ru']){
  doc.querySelector(`[data-language=${lang}]`).click();await tick();
  assert.equal(doc.documentElement.lang,lang);assert.equal(w.localStorage.getItem('ctg.language.v1'),lang);
  assert.equal(doc.querySelectorAll('#list tbody tr').length,16);
  assert.equal(doc.querySelector('.ctg-menu summary').textContent,{kk:'Мәзір',en:'Menu',ru:'Меню'}[lang]);
 }
 for(const [budget,tp,fp] of [['20',33,76],['25',34,92],['25i',35,99]]){
  doc.querySelector(`[data-budget="${budget}"]`).click();await tick();
  assert.equal(doc.querySelector('#obs-selection .obs-leader').textContent,tp+' / 45');
  assert.match(doc.querySelector('#next-cap-status').textContent,new RegExp(String(fp)));
 }
 const query=doc.getElementById('q');query.value='строка 470';query.dispatchEvent(new w.Event('input'));await tick();
 assert.equal(doc.querySelectorAll('#list tbody tr').length,1);
 assert.equal(doc.querySelector('#list tbody tr').dataset.row,'470');
 doc.querySelector('[data-language=kk]').click();await tick();
 assert.equal(query.value,'строка 470');assert.equal(doc.querySelectorAll('#list tbody tr').length,1);
 doc.querySelector('#reset-filters').click();await tick();
 const size=doc.querySelector('#ctg-page-size');size.value='50';size.dispatchEvent(new w.Event('change'));await tick();
 assert.equal(doc.querySelectorAll('#list tbody tr').length,50);
 doc.querySelector('#sort-all-results-auroc').click();await tick();
 const scores=[...doc.querySelectorAll('#list tbody tr')].map(tr=>raw.entries.flatMap(e=>e.rows).concat(raw.other).find(r=>r.row===Number(tr.dataset.row)).auroc);
 assert(scores.every((v,i)=>!i||v<=scores[i-1]));
 const menu=doc.querySelector('.ctg-menu');menu.open=true;
 doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(menu.open,false);
 assert.equal(doc.activeElement,menu.querySelector('summary'));
 const range=doc.querySelector('#window-start');range.value=15;range.dispatchEvent(new w.Event('input'));await tick();
 assert.match(doc.querySelector('#window-view-text').textContent,/15–30/);
 for(const lang of ['ru','kk']){w.CTGI18n.setLanguage(lang);await tick();fs.writeFileSync('/tmp/ctg-untranslated-'+lang+'.json',JSON.stringify(englishRemainder(w),null,2));}
 dom.window.close();
 for(const row of [470,534,1250,1219]){
  const result=await open('bioscience/ctg/result/?row='+row);const rw=result.window,rd=rw.document;
  assert.equal(rd.documentElement.lang,'ru');assert.equal(rd.getElementById('result-page').hidden,false);
  assert.equal(rd.querySelectorAll('#result-primary>div').length,4);
  for(const lang of ['kk','en','ru']){rw.CTGI18n.setLanguage(lang);await tick();assert.equal(rd.querySelectorAll('#result-primary>div').length,4);assert.equal(rd.querySelectorAll('#result-confusion>div').length,4);}
  fs.writeFileSync('/tmp/ctg-result-'+row+'-untranslated.json',JSON.stringify(englishRemainder(rw),null,2));
  result.window.close();
 }
 const saved=await open('bioscience/ctg/result/?row=470','kk');assert.equal(saved.window.document.documentElement.lang,'kk');saved.window.close();
 const override=await open('bioscience/ctg/result/?row=470&lang=en','kk');assert.equal(override.window.document.documentElement.lang,'en');override.window.close();
 const invalid=await open('bioscience/ctg/result/?row=no');assert.match(invalid.window.document.querySelector('#result-status').textContent,/Выберите/);invalid.window.close();
 assert.deepEqual(errors,[]);
 console.log('PASS: default/persisted/URL language, three-language switching, 1221 rows, filtering, sorting, pagination, budget counts, window control, menu Escape, four result variants and invalid result.');
})().catch(e=>{console.error(e);process.exitCode=1;});
