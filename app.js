const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const yen=n=>n==null?'未確認':'¥'+Math.round(Number(n)).toLocaleString('ja-JP');
const auctionMoney=x=>`<div><span>起標價 · 買受可能価額</span><b>${yen(x.minimumBid)}</b></div><div><span>拍賣基準價 · 売却基準価額</span><b>${yen(x.saleBasePrice)}</b></div><div><span>投標保證金 · 買受申出保証額</span><b>${yen(x.bidDeposit)}</b></div>`;
const displayTime=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'尚未執行';
let discoveries=[], analyzedCases=[], currentView='auto',locationEvidence={municipalities:{},cases:{}};
let analysisRun=0, analysisController=null,autoLimit=30;
const pendingCover='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#e4ebed"/><text x="450" y="300" text-anchor="middle" font-family="sans-serif" font-size="36" fill="#375060">待主圖</text></svg>`);
let selected=new Set(JSON.parse(localStorage.getItem('auction-shortlist')||'[]'));

init();
async function init(){
  const [d,c,evidence]=await Promise.all([
    loadDiscoveries(),
    fetch('data/cases.json',{cache:'no-store'}).then(r=>r.json()).catch(()=>[]),
    fetch('data/location-evidence.json',{cache:'no-store'}).then(r=>r.json()).catch(()=>({municipalities:{},cases:{}}))
  ]);
  discoveries=Array.isArray(d)?d:[];analyzedCases=Array.isArray(c)?c:[];locationEvidence=evidence;
  const initialHash=location.hash;
  hydrateFilters();bindUI();renderDiscover();renderShortlist();updateCounts();renderResearch();showView('auto');
  routeHash(initialHash);window.addEventListener('hashchange',()=>routeHash(location.hash));
}

async function loadDiscoveries(){
  try{
    const r=await fetch('/api/discoveries',{cache:'no-store'});
    if(r.ok){const data=await r.json();if(Array.isArray(data?.items)&&data.items.length)return data.items;}
  }catch{}
  const prices=await fetch('data/auction-prices.json',{cache:'no-store'}).then(r=>r.json()).catch(()=>({}));
  return Promise.all(['data/discoveries.json','data/discoveries-extra.json'].map(p=>fetch(p,{cache:'no-store'}).then(r=>r.json()).catch(()=>[]))).then(parts=>parts.flat().map(x=>({...x,...prices[x.id]})));
}
async function refreshDiscoveries(){
  const b=$('#refreshDiscoveries'); if(!b)return;
  const old=b.textContent;b.disabled=true;b.textContent='更新中…';
  try{
    const r=await fetch('/api/refresh-discoveries',{method:'POST'});
    const data=await r.json().catch(()=>({}));
    discoveries=await loadDiscoveries();
    hydrateFilters(true);renderDiscover();renderShortlist();updateCounts();renderResearch();
    if(!r.ok)throw new Error('更新未啟動');b.textContent=data.queued?'已排入更新':data.added?`新增 ${data.added} 筆`:'已更新';
  }catch{b.textContent='更新失敗';}
  setTimeout(()=>{b.disabled=false;b.textContent=old},2200);
}

function bindUI(){
  $('#homeType').addEventListener('input',()=>{autoLimit=30;renderResearch();});
  ['#endedPref','#endedType'].forEach(s=>$(s).addEventListener('input',renderResearch));
  $$('[data-nav]').forEach(b=>b.addEventListener('click',()=>{history.pushState(null,'','#'+b.dataset.nav);showView(b.dataset.nav);}));
  ['#discoverSearch','#discoverPref','#discoverType','#discoverPrice','#discoverSort','#discoverStatus'].forEach(s=>$(s).addEventListener('input',renderDiscover));
  $('#analysisGo').addEventListener('click',()=>runAnalysis($('#analysisInput').value));
  $('#analysisInput').addEventListener('keydown',e=>{if(e.key==='Enter')runAnalysis(e.target.value)});
  $$('[data-analyze]').forEach(b=>b.addEventListener('click',()=>{showView('analyze');$('#analysisInput').value=b.dataset.analyze;runAnalysis(b.dataset.analyze)}));
  $('#refreshDiscoveries')?.addEventListener('click',refreshDiscoveries);
}

function showView(name){
  currentView=name;
  if(name!=='analyze'){analysisController?.abort();analysisRun++;if(location.hash.startsWith('#analyze/'))history.replaceState(null,'',location.pathname+location.search);}
  $$('.view').forEach(v=>v.classList.add('hidden'));
  $('#'+name+'View').classList.remove('hidden');
  $$('.nav-tab').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));
  if(name==='shortlist')renderShortlist();
  if(name==='discover'){updateCounts();renderDiscover();}
  if(name==='auto'||name==='ended')renderResearch();
  window.scrollTo({top:0,behavior:'smooth'});
}
function hydrateFilters(reset=false){
  if(reset){$('#discoverPref').innerHTML='<option value="">全部地區</option>';$('#discoverType').innerHTML='<option value="">全部類型</option>';}
  const prefs=[...new Set(discoveries.map(x=>x.prefecture).filter(Boolean))].sort();
  $('#discoverPref').insertAdjacentHTML('beforeend',prefs.map(x=>`<option>${x}</option>`).join(''));
  const types=['公寓','戶建','土地'];
  $('#discoverType').insertAdjacentHTML('beforeend',types.map(x=>`<option>${x}</option>`).join(''));
}
function updateCounts(){
  $('#discoverCount').textContent=discoveries.filter(x=>ResearchRules.isToday(x)&&!ResearchRules.closed(x)).length;
  $('#shortlistCount').textContent=selected.size;
  $('#heroNewCount').textContent=discoveries.filter(x=>ResearchRules.isToday(x)&&!ResearchRules.closed(x)).length;
  $('#heroCheapCount').textContent=discoveries.filter(x=>ResearchRules.isToday(x)&&!ResearchRules.closed(x)&&x.imageReady).length;
  $('#heroFreshCount').textContent=discoveries.filter(x=>ResearchRules.isToday(x)&&ResearchRules.closed(x)).length;
}
function renderDiscover(){
  const term=($('#discoverSearch').value||'').trim().toLowerCase();
  const pref=$('#discoverPref').value,type=$('#discoverType').value,max=Number($('#discoverPrice').value||0),sort=$('#discoverSort').value;
  let arr=discoveries.filter(x=>ResearchRules.isToday(x)&&!ResearchRules.closed(x)).filter(x=>!term||[x.id,x.title,x.prefecture,x.city,x.address,x.court,x.station].join(' ').toLowerCase().includes(term));
  const status=$('#discoverStatus').value;
  if(status==='active')arr=arr.filter(x=>x.availability!=='ended');
  if(status==='photo')arr=arr.filter(x=>x.imageReady);
  if(status==='pending')arr=arr.filter(x=>!x.imageReady&&x.availability!=='ended');
  if(status==='ended')arr=arr.filter(x=>x.availability==='ended');
  if(pref)arr=arr.filter(x=>x.prefecture===pref);if(type)arr=arr.filter(x=>ResearchRules.category(x)===type);if(max)arr=arr.filter(x=>ResearchRules.finite(x.minimumBid)&&Number(x.minimumBid)<=max);
  arr=[...arr].sort((a,b)=>sort==='cheap'?(Number(a.minimumBid)||9e15)-(Number(b.minimumBid)||9e15):sort==='area'?(Number(b.area)||0)-(Number(a.area)||0):sort==='age'?(Number(a.age)||999)-(Number(b.age)||999):String(b.published||'').localeCompare(String(a.published||'')));
  $('#resultText').textContent=` · ${arr.length} 件`;
  $('#discoverGrid').innerHTML=arr.map(discoveryCard).join('')||empty(`本日（${ResearchRules.today()}）沒有符合條件的新增物件。可至首頁查看其他日期的推薦。`);
  bindDiscoveryActions();
}
function propertyImageUrl(x){
  // V2.1.1: 由自己的 Netlify Function 讀來源案件頁並代理主圖，
  // 不再依賴 Microlink，也避免來源站防盜連造成瀏覽器直接載圖失敗。
  return `/api/property-image?id=${encodeURIComponent(x.id)}&url=${encodeURIComponent(x.sourceUrl||'')}&title=${encodeURIComponent(x.title)}&v=271`;
}
function photoFallback(el,label,sourceUrl){
  const safe=String(label||'日本法拍物件').slice(0,18).replace(/[<>&"']/g,'');
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='900' height='600'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='#18344f'/><stop offset='1' stop-color='#b98b46'/></linearGradient></defs><rect width='900' height='600' fill='url(#g)'/><path d='M220 390V250l230-145 230 145v140M315 490V295h270v195M410 490V365h80v125' fill='none' stroke='rgba(255,255,255,.25)' stroke-width='18'/><text x='46' y='540' fill='white' font-size='30' font-family='sans-serif' font-weight='700'>${safe}</text><text x='46' y='575' fill='rgba(255,255,255,.7)' font-size='18' font-family='sans-serif'>待主圖｜BIT／三點件照片尚未取得</text></svg>`;
  el.onerror=null;el.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function discoveryCard(x){
  const chosen=selected.has(x.id);
  return `<article class="treasure-card photo-card">
    <div class="property-photo-wrap">
      <img class="property-photo" loading="lazy" decoding="async" src="${x.imageReady?propertyImageUrl(x):pendingCover}" alt="${escapeHtml(x.title)}" onerror="photoFallback(this,this.alt)" />
      <div class="photo-shade"></div>
      <div class="tag-stack">${(x.tags||[]).slice(0,3).map(t=>`<span>${t}</span>`).join('')}</div>
      <div class="photo-location">${x.prefecture||'地區待確認'}${x.city?' · '+x.city:''}</div>
      <a class="photo-source" href="${x.sourceUrl}" target="_blank" rel="noreferrer" title="查看原始案件">原始案件 ↗</a>
    </div>
    <div class="treasure-body">
      <div class="address">起標價 · 買受可能価額</div><div class="price-line"><b>${yen(x.minimumBid)}</b><span>${ResearchRules.category(x)||'分類待核對'}${x.area?' · '+x.area+'m²':''}</span></div>
      <h3 title="${escapeHtml(x.title)}">${x.title}</h3>
      <div class="address">拍賣基準價 · 売却基準価額：${yen(x.saleBasePrice)}<br>投標保證金 · 買受申出保証額：${yen(x.bidDeposit)}</div><div class="address">金額來源：案件來源頁，待法院公告核對</div>
      <div class="address">原始用途：${escapeHtml(x.propertyUse||x.type||'待確認')}</div>
      <div class="address">${escapeHtml(x.address||[x.prefecture,x.city].filter(Boolean).join(''))}</div>
      <div class="data-status-row"><span class="status-pill bit ${String(x.bitStatus||'').includes('已定位')?'ok':'pending'}">${escapeHtml(x.bitStatus||'待BIT定位')}</span><span class="status-pill image ${String(x.imageStatus||'').includes('已建立')?'ok':'pending'}">${escapeHtml(x.imageStatus||'待主圖')}</span></div>
      <dl class="mini-specs">
        <div><dt>法院</dt><dd>${x.court||'待確認'}</dd></div>
        <div><dt>入札</dt><dd>${x.bid||'待確認'}</dd></div>
        <div><dt>交通</dt><dd>${x.station||'待確認'}</dd></div>
        <div><dt>築年</dt><dd>${x.age!=null?x.age+' 年':'待確認'}</dd></div>
      </dl>
      <div class="document-links">${x.bitUrl?`<a href="${x.bitUrl}" target="_blank" rel="noreferrer">法院三點件 ↗</a>`:''}${x.imageReady?`<a href="/api/property-image?id=${encodeURIComponent(x.id)}" target="_blank" rel="noreferrer">查看主圖 ↗</a>`:''}</div>
      <div class="card-actions">
        <button class="shortlist-btn ${chosen?'selected':''}" data-shortlist="${x.id}">${chosen?'✓ 已加入篩選':'＋ 加入篩選'}</button>
        <button class="analyze-btn" data-analyze-card="${x.id}">分析</button>
      </div>
    </div>
  </article>`;
}
function bindDiscoveryActions(){
  $$('[data-shortlist]').forEach(b=>b.onclick=e=>{e.stopPropagation();toggleShortlist(b.dataset.shortlist);});
  $$('[data-analyze-card]').forEach(b=>b.onclick=()=>{showView('analyze');$('#analysisInput').value=b.dataset.analyzeCard;runAnalysis(b.dataset.analyzeCard)});
}
function toggleShortlist(id){
  selected.has(id)?selected.delete(id):selected.add(id);
  localStorage.setItem('auction-shortlist',JSON.stringify([...selected]));
  updateCounts();renderDiscover();renderShortlist();renderResearch();
}
function renderShortlist(){
  const items=[...selected].map(id=>analyzedCases.find(x=>x.id===id)||discoveries.find(x=>x.id===id)).filter(Boolean);
  $('#shortlistGrid').innerHTML=items.length?items.map(shortlistCard).join(''):empty('目前還沒有物件。回首頁尋寶後按「加入篩選」。');
  $$('[data-remove]').forEach(b=>b.onclick=()=>toggleShortlist(b.dataset.remove));
  $$('[data-short-analyze]').forEach(b=>b.onclick=()=>{showView('analyze');$('#analysisInput').value=b.dataset.shortAnalyze;runAnalysis(b.dataset.shortAnalyze)});
  $$('[data-open-detail]').forEach(b=>b.onclick=()=>openDetail(b.dataset.openDetail));
}
function shortlistCard(x){
  const detailed='grossYield' in x;
  return `<article class="short-card ${detailed?'detailed':''}">
    <div class="short-top"><div><span class="case-id">#${x.id}</span><h3>${x.title}</h3><p>${x.prefecture} · ${x.city||''} · ${ResearchRules.category(x)||'分類待核對'}</p></div>${detailed?`<div class="grade">${x.rating}</div>`:'<span class="pending-badge">待分析</span>'}</div>
    <div class="short-metrics">
      ${auctionMoney(x)}
      <div><span>${detailed?'毛投報':'公開日'}</span><b>${detailed?x.grossYield.toFixed(1)+'%':x.published}</b></div>
      <div><span>${detailed?'安全邊際':'入札'}</span><b>${detailed?x.safetyMarginAtRecommendedHigh.toFixed(1)+'%':x.bid}</b></div>
    </div>
    <div class="card-actions"><button data-short-analyze="${x.id}" class="primary small">進入分析</button>${detailed?`<button data-open-detail="${x.id}" class="soft small">看完整結果</button>`:''}<button data-remove="${x.id}" class="text-btn">移除</button></div>
  </article>`;
}
function openDetail(id){
  const c=analyzedCases.find(x=>x.id===id);if(!c)return;
  $('#caseDetailMount').innerHTML=`<div class="full-analysis"><div class="full-head"><div><span class="eyebrow">ANALYZED CASE</span><h2>${c.title}</h2><p>${c.court}｜${c.caseNo}</p></div><div class="grade large">${c.rating}</div></div>
  <div class="decision-kpis">${auctionMoney(c)}<div><span>月租金</span><b>${yen(c.monthlyRent)}</b></div><div><span>毛投報</span><b>${c.grossYield}%</b></div><div><span>安全邊際</span><b>${c.safetyMarginAtRecommendedHigh}%</b></div><div><span>最高紅線</span><b>${yen(c.maxBid)}</b></div></div>
  <div class="analysis-two"><div><h4>值得研究</h4><ul>${c.positives.map(x=>`<li>${x}</li>`).join('')}</ul></div><div><h4>Gate／未確認</h4><ul>${c.gateReasons.map(x=>`<li>${x}</li>`).join('')}</ul></div></div></div>`;
  $('#caseDetailMount').scrollIntoView({behavior:'smooth'});
}
function parseAnalysisInput(raw){
  const text=(raw||'').trim();
  const m=text.match(/auction\/(\d+)\.html/)||text.match(/^\s*(\d{5,8})\s*$/);
  return m?m[1]:text;
}
function revealAnalysis(){
  const target=$('#analysisResult');
  $('#analyzeView').classList.add('has-case');
  target.focus({preventScroll:true});
  target.scrollIntoView({behavior:'instant',block:'start'});
}
async function analysisFetch(url,options,signal,timeout){
  const response=await fetch(url,{...options,signal:AbortSignal.any([signal,AbortSignal.timeout(timeout)])});
  const data=await response.json();
  return {response,data};
}
async function runAnalysis(raw,{force=false}={}){
  analysisController?.abort();
  const run=++analysisRun;analysisController=new AbortController();const signal=analysisController.signal;
  showView('analyze');
  const id=parseAnalysisInput(raw);$('#analysisInput').value=id;
  if(!id){$('#analysisResult').innerHTML=empty('請貼入案件網址或案件編號');revealAnalysis();return;}
  history.replaceState(null,'','#analyze/'+encodeURIComponent(id));
  const full=analyzedCases.find(x=>String(x.id)===id);
  if(full){renderFullWorkbench(full);revealAnalysis();return;}
  const d=discoveries.find(x=>String(x.id)===id)||{id,sourceUrl:/^https?:\/\//i.test(raw)?raw:null};
  if(!d.sourceUrl){renderUnknownWorkbench(raw,id);revealAnalysis();return;}
  renderCaseWorkbench(d,null,{loading:force?'正在更新法院文件…':'正在讀取已保存的案件資料…'});revealAnalysis();
  if(!force){
    try{
      const {response,data}=await analysisFetch('/api/case-record?id='+encodeURIComponent(id),{cache:'no-store'},signal,12000);
      if(run!==analysisRun)return;
      if(response.ok&&data.record){renderCaseWorkbench(d,data.record);return;}
    }catch(error){if(run!==analysisRun||signal.aborted)return;}
  }
  await ingestCase(d.sourceUrl,d,run,signal);
}
async function ingestCase(url,d,run,signal){
  if(run!==analysisRun)return;
  renderCaseWorkbench(d,null,{loading:'正在取得法院文件，最多約 45 秒…'});
  try{
    const {response,data}=await analysisFetch('/api/ingest-case',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,caseId:d.id,title:d.title||'',prefecture:d.prefecture||'',city:d.city||'',court:d.court||'',price:d.price??null,type:d.type||'',area:d.area??null,bid:d.bid||''})},signal,45000);
    if(run!==analysisRun)return;
    if(response.ok&&(data.ok||(data.documents||[]).some(x=>x.saved))){
      renderCaseWorkbench(d,data);return;
    }
    renderCaseWorkbench(d,null,{error:'暫時無法取得法院文件。你仍可查看基本資料與來源，或按下重試。'});
  }catch(error){
    if(run!==analysisRun||signal.aborted)return;
    renderCaseWorkbench(d,null,{error:error.name==='TimeoutError'?'讀取逾時，請按「重試讀取」。':'連線失敗，請按「重試讀取」。'});
  }
}
function renderCaseWorkbench(d,record,{loading='',error=''}={}){
  const hints=record?.hints||{},item={...hints,...d};
  const saved=(record?.documents||[]).filter(x=>x.saved&&x.contentType==='application/pdf');
  const ready=!!record?.mainImage||!!d.imageReady;
  const source=item.sourceUrl||record?.sourceUrl||'';
  const title=item.title||'案件 '+item.id;
  $('#analysisResult').innerHTML=`<div class="workbench-result ${record?'ready':''}" data-analysis-case="${escapeHtml(item.id)}">
    <div class="result-status" role="status"><span>案件 #${escapeHtml(item.id)}</span><b>${escapeHtml(loading||error||(saved.length?'案件資料已載入':'基本資料已載入'))}</b></div>
    <div class="analysis-case-head">${ready?`<img src="${propertyImageUrl(item)}" alt="${escapeHtml(title)}" onerror="photoFallback(this,this.alt)">`:''}<div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(item.address||[item.prefecture,item.city].filter(Boolean).join(''))}</p><p>${escapeHtml(item.court||'法院待確認')}｜${escapeHtml(item.caseNumber||'事件編號待確認')}</p></div></div>
    <div class="decision-kpis">${auctionMoney(item)}<div><span>類型</span><b>${escapeHtml(ResearchRules.category(item)||'分類待核對')}</b></div><div><span>面積</span><b>${item.area!=null?escapeHtml(item.area)+' m²':'待確認'}</b></div><div><span>屋齡</span><b>${item.age!=null?escapeHtml(item.age)+' 年':'待確認'}</b></div></div>
    <p class="analysis-bid">入札：${escapeHtml(item.bid||'待確認')}</p>
    <div class="doc-downloads"><b>法院文件 ${saved.length?`· 已保存 ${saved.length} 份`:''}</b>${saved.map(x=>`<a href="${escapeHtml(x.downloadUrl)}" target="_blank" rel="noreferrer">開啟 ${escapeHtml(x.type||'三點件')} ↗</a>`).join('')}${!saved.length&&item.bitUrl?`<a href="${escapeHtml(item.bitUrl)}" target="_blank" rel="noreferrer">開啟法院三點件 ↗</a>`:''}</div>
    <div class="gate-box"><b>深度分析待完成</b><p>法院文件與照片已取得的狀態，不代表投資分析已完成。占用、租約、欠費、瑕疵，以及租金與市場比較仍待查核；目前不提供未經確認的投報率或出價建議。</p></div>
    <div class="workbench-actions"><button id="analysisRetry" class="primary" ${loading?'disabled':''}>${loading?'資料讀取中…':error?'重試讀取':'重新取得法院文件'}</button>${source?`<a href="${escapeHtml(source)}" target="_blank" rel="noreferrer" class="soft-link">原始案件 ↗</a>`:''}</div>
  </div>`;
  $('#analysisRetry').onclick=()=>runAnalysis(item.id,{force:true});
}
function renderFullWorkbench(c){
  $('#analysisResult').innerHTML=`<div class="workbench-result ready"><div class="result-status"><span>已有分析資料</span><b>${c.rating}｜${c.ratingLabel}</b></div><div class="full-head"><div><h2>${c.title}</h2><p>${c.court}｜${c.caseNo}</p></div><div class="grade large">${c.rating}</div></div><div class="decision-kpis">${auctionMoney(c)}<div><span>年租金</span><b>${yen(c.annualRent)}</b></div><div><span>毛投報</span><b>${c.grossYield}%</b></div><div><span>模型估算投標上緣</span><b>${yen(c.recommendedBidHigh)}</b></div><div><span>最高紅線</span><b>${yen(c.maxBid)}</b></div></div><div class="gate-box"><b>目前 Gate：</b>${c.gateReasons.join('、')}</div></div>`;
}
function renderPendingWorkbench(d){
  const chosen=selected.has(d.id);
  $('#analysisResult').innerHTML=`<div class="workbench-result"><div class="result-status"><span>案件已辨識</span><b>基本資料完成 · 深度分析待執行</b></div><div class="full-head"><div><h2>${d.title}</h2><p>${d.prefecture}${d.city}${d.address}｜${d.court}</p></div><span class="pending-badge">待分析</span></div><div class="decision-kpis">${auctionMoney(d)}<div><span>類型</span><b>${ResearchRules.category(d)||'分類待核對'}</b></div><div><span>面積</span><b>${d.area!=null?d.area+'m²':'待確認'}</b></div><div><span>屋齡</span><b>${d.age!=null?d.age+'年':'待確認'}</b></div><div><span>入札</span><b>${d.bid||'待確認'}</b></div></div><div class="analysis-steps"><div class="done">✓ 基本資料</div><div>○ 三點件／占用</div><div>○ 租金／市場行情</div><div>○ 投報／安全邊際／出價</div></div><div class="workbench-actions"><button id="pendingToggle" class="primary">${chosen?'✓ 已在我的篩選':'＋ 加入我的篩選'}</button><a href="${d.sourceUrl}" target="_blank" rel="noreferrer" class="soft-link">查看原始案件 ↗</a></div></div>`;
  $('#pendingToggle').onclick=()=>{toggleShortlist(d.id);renderPendingWorkbench(d)};
}
function renderUnknownWorkbench(raw,id){
  $('#analysisResult').innerHTML=`<div class="workbench-result"><div class="result-status"><span>新案件</span><b>來源尚未取得</b></div><h2>${escapeHtml(id||'未辨識案件')}</h2><p>已收到：${escapeHtml(raw||'')}</p><div class="analysis-steps"><div>○ 基本資料</div><div>○ 三點件／占用</div><div>○ 租金／市場行情</div><div>○ 投報／安全邊際／出價</div></div><div class="gate-box">目前先建立分析入口。下一階段接上來源取得後，這裡會直接把網址轉成案件並開始分析；在資料尚未確認前不會自行猜測。</div></div>`;
}
function empty(t){return `<div class="empty-state"><div>⌕</div><b>${t}</b></div>`}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function renderResearch(){
 const live=discoveries.filter(x=>!ResearchRules.closed(x)).map(x=>({...x,research:ResearchRules.screen(x)})).sort((a,b)=>b.research.score-a.research.score||a.id.localeCompare(b.id));
 const homeType=$('#homeType').value;
 const eligible=live.filter(x=>x.research.eligible&&(!homeType||ResearchRules.category(x)===homeType));
 $('#autoSummary').textContent=`${eligible.length} 件初篩物件 · 全日本 · 不限預算`;
 $('#autoGrid').innerHTML=eligible.slice(0,autoLimit).map(compactPropertyCard).join('')||empty('此分類目前沒有符合初篩條件的物件');
 $('#observationList').innerHTML='<div class="treasure-grid">'+live.filter(x=>!x.research.eligible&&(!homeType||ResearchRules.category(x)===homeType)).map(compactPropertyCard).join('')+'</div>';
 $('#autoMore').hidden=autoLimit>=eligible.length;$('#autoMore').textContent=`顯示更多（已顯示 ${Math.min(autoLimit,eligible.length)}／${eligible.length}）`;$('#autoMore').onclick=()=>{autoLimit+=30;renderResearch();};
 const ended=discoveries.filter(x=>ResearchRules.closed(x));
 const pref=$('#endedPref').value,type=$('#endedType').value;
 const prefs=[...new Set(ended.map(x=>x.prefecture).filter(Boolean))].sort();
 $('#endedPref').innerHTML='<option value="">全部地區</option>'+prefs.map(p=>`<option ${p===pref?'selected':''}>${escapeHtml(p)}</option>`).join('');
 const groups={};for(const x of ended){const k=(x.prefecture||'地區待確認')+' · '+(ResearchRules.category(x)||'分類待核對');groups[k]=(groups[k]||0)+1;}
 $('#endedSummary').textContent=Object.entries(groups).map(([k,n])=>`${k} ${n} 件`).join(' ｜ ');
 $('#endedGrid').innerHTML=ended.filter(x=>(!pref||x.prefecture===pref)&&(!type||ResearchRules.category(x)===type)).map(x=>{
 const o=x.outcome||{},labels={sold:'已公布成交',unsold:'不売（未售出）',withdrawn:'取下／取消',unpublished:'未取得結果'};
 return `<article class="short-card"><span class="case-id">#${escapeHtml(x.id)} · ${ResearchRules.category(x)||'分類待核對'}</span><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.prefecture||'')} · ${escapeHtml(x.city||'')}</p><h2>${o.status==='sold'&&ResearchRules.finite(o.salePrice)?yen(o.salePrice):labels[o.status]||'待追蹤'}</h2><p>${o.sourceLevel==='secondary'?'來源站結果 · 待法院核對':'尚無可核對結果'}</p><p>起標價 · 買受可能価額 ${yen(x.minimumBid)}<br>拍賣基準價 · 売却基準価額 ${yen(x.saleBasePrice)}<br>投標保證金 · 買受申出保証額 ${yen(x.bidDeposit)}<br>開標日 ${escapeHtml(x.openingDate||'待確認')}</p><p>最近查詢 ${escapeHtml(displayTime(o.lastAttemptAt||o.checkedAt))}<br>下次追蹤 ${escapeHtml(o.nextCheckAt?displayTime(o.nextCheckAt):'排入每日檢查')}</p>${o.lastAttemptStatus==='fetch_failed'?'<p class="error">最近抓取失敗，保留先前資料並排程重試</p>':''}<a href="${escapeHtml(externalUrl(x.sourceUrl))}" target="_blank" rel="noreferrer">結果來源 ↗</a><p>原文：${escapeHtml(o.rawLabel||'')} ${escapeHtml(o.rawStatus||'')}</p><button class="soft" data-analyze-card="${escapeHtml(x.id)}">查看案件</button></article>`;
 }).join('')||empty('此分類沒有結束物件');
 bindDiscoveryActions();
}
function indicatorResult(x){return LocationIndicators.assess({...locationEvidence.municipalities?.[[x.prefecture,x.city].join('|')],...locationEvidence.cases?.[x.id]});}
function propertyTitle(x){return String(x.title||'案件 '+x.id).replace(/^\(値下げ\)\s*/,'').replace(/\s+[\d,.]+万円.*$/,'');}
function propertyAdvantages(x,r){
 const tags=[...r.tags];const walk=String(x.station||'').match(/(?:徒歩|徒步)\s*(\d+)\s*分/);
 if(walk&&Number(walk[1])<=15)tags.push(`來源列步行 ${walk[1]} 分`);
 if(ResearchRules.finite(x.age)&&x.age>=0&&x.age<=20)tags.push(`來源列屋齡 ${x.age} 年`);
 if(x.imageReady)tags.push('法院真實照片');
 return [...new Set(tags)].slice(0,3);
}
function compactPropertyCard(x){
 const r=indicatorResult(x),tags=propertyAdvantages(x,r);
 return `<a class="compact-property" href="#property/${encodeURIComponent(x.id)}" aria-label="查看 ${escapeHtml(propertyTitle(x))} 詳情"><div class="compact-photo"><img loading="lazy" decoding="async" src="${x.imageReady?propertyImageUrl(x):pendingCover}" alt="${escapeHtml(propertyTitle(x))}" onerror="photoFallback(this,this.alt)"><span class="compact-score ${r.score===null?'pending':''}">${r.score===null?'待評分':r.score+'<small>/100</small>'}</span></div><div class="compact-body"><p class="compact-location">${escapeHtml([x.prefecture,x.city,ResearchRules.category(x)].filter(Boolean).join(' · '))}</p><h2>${escapeHtml(propertyTitle(x))}</h2><div class="compact-price"><span>起標價</span><b>${yen(x.minimumBid)}</b></div><div class="advantage-tags">${tags.map(t=>`<span>${escapeHtml(t)}</span>`).join('')}</div><div class="compact-footer"><span>${r.checked===5?'五項指標已查核':`五項已查 ${r.checked}/5`}</span><b>查看詳情 ↗</b></div></div></a>`;
}
function routeHash(hash){
 const property=hash.match(/^#property\/(\d{5,8})$/),analysis=hash.match(/^#analyze\/([^/]+)$/);
 try{if(property){openProperty(decodeURIComponent(property[1]));return;}if(analysis){runAnalysis(decodeURIComponent(analysis[1]));return;}}catch{}
 const name=hash.replace('#','');if(['auto','discover','ended','shortlist','analyze'].includes(name))showView(name);else showView('auto');
}
function externalUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'#';}catch{return '#';}}
function sourceLinks(sources){return sources.filter(s=>/^https:\/\//.test(s.url||'')).map(s=>`<a href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer">${escapeHtml(s.label||'查核來源')} ↗</a><small>查核 ${escapeHtml(String(s.checkedAt||'').slice(0,10))}</small>`).join(' ');}
function openProperty(id){
 const x=discoveries.find(v=>String(v.id)===id);showView('property');
 if(!x){$('#propertyDetail').innerHTML='<a href="#auto">← 回首頁</a>'+empty('找不到此案件，請回首頁重新選取');return;}
 const r=indicatorResult(x),old=ResearchRules.screen(x),tags=propertyAdvantages(x,r);
 $('#propertyDetail').innerHTML=`<a class="detail-back" href="#auto">← 回首頁</a><div class="property-detail-hero"><a href="${propertyImageUrl(x)}" target="_blank" rel="noreferrer" aria-label="開啟完整主圖"><img src="${x.imageReady?propertyImageUrl(x):pendingCover}" alt="${escapeHtml(propertyTitle(x))}" onerror="photoFallback(this,this.alt)"></a><div><p class="eyebrow">物件詳情 · #${escapeHtml(id)}</p><h1>${escapeHtml(propertyTitle(x))}</h1><p>${escapeHtml(x.address||[x.prefecture,x.city].join(''))}</p><div class="advantage-tags">${tags.map(t=>`<span>${escapeHtml(t)}</span>`).join('')}</div><div class="detail-score"><b>${r.score===null?'綜合分數待查':r.score+' / 100'}</b><span>五項已查 ${r.checked}/5${r.checked<5?' · 資料不足不當作零分':''}</span></div><button id="detailSave" class="soft">${selected.has(id)?'✓ 已加入我的篩選':'＋ 加入我的篩選'}</button></div></div>
 <section class="detail-section"><h2>五項區域指標</h2><p>依目前可核對資料評分；分數代表研究優先度，不代表投資報酬。</p><div class="indicator-grid">${r.rows.map(v=>`<article class="indicator-panel ${v.status}"><header><h3>${v.name}</h3><b>${v.points===null?'待查':v.points+' / '+v.max+' 分'}</b></header><p>${escapeHtml(v.detail)}</p><div class="indicator-sources">${sourceLinks(v.sources)}</div></article>`).join('')}</div><details class="scoring-rules"><summary>評分方式與查核範圍</summary><ul><li>新幹線：最近車站出發，含轉乘等候；0–30 分鐘 A 級 3 分，31–60 分鐘 B 級 2 分，超過 60 分鐘 0 分。物件步行到站另列。</li><li>餐飲：車站出口步行 300 公尺內，排除歇業並去重。0／1–3／4–7／8–14／15–24／25 家以上，依序 0–5 分；未完整查核不判定零家。</li><li>品牌：所在市區町村有星巴克或麥當勞 1 分，兩者都有 2 分。</li><li>人口：未滿 3 萬／3 萬至未滿 10 萬／10 萬以上為 0／1／2 分；五年增減低於 −5%／−5% 至未滿 −2%／−2% 至未滿 +2%／+2% 以上，為 0／1／2／3 分。須使用同一行政範圍及統計口徑。</li><li>主要雇主：物件開車 30 分鐘內、營運中的大型企業總部、事業所或工廠；一般零售門市不計。同一廠區去重後 0／1／2–3／4 處以上為 0／1／2／3 分，企業規模須有依據。</li><li>原始滿分 18 分，五項都查齊才以「合計 ÷ 18 × 100」換算綜合分數；資料待查時不推算總分。這是初版規則。</li></ul></details></section>
 <section class="detail-section"><h2>案件資料</h2><div class="decision-kpis">${auctionMoney(x)}</div><p class="detail-muted">金額來源為案件來源頁，仍需核對法院公告；売却基準価額是拍賣基準價。</p><dl class="detail-facts"><div><dt>類型／原始用途</dt><dd>${escapeHtml(ResearchRules.category(x)||'待確認')}／${escapeHtml(x.propertyUse||x.type||'待確認')}</dd></div><div><dt>面積／屋齡</dt><dd>${escapeHtml(x.area??'待查')} m²／${escapeHtml(x.age??'待查')} 年</dd></div><div><dt>車站交通（來源頁）</dt><dd>${escapeHtml(x.station||'待查')}</dd></div><div><dt>法院／事件編號</dt><dd>${escapeHtml(x.court||'待查')}／${escapeHtml(x.caseNumber||'待查')}</dd></div><div><dt>入札期間</dt><dd>${escapeHtml(x.bid||'待查')}</dd></div></dl><div class="document-links">${x.bitUrl?`<a href="${escapeHtml(externalUrl(x.bitUrl))}" target="_blank" rel="noreferrer">法院三點件 ↗</a>`:''}<a href="${escapeHtml(externalUrl(x.sourceUrl))}" target="_blank" rel="noreferrer">原始案件 ↗</a></div><button id="detailAnalyze" class="primary">開啟法院文件與分析</button></section>
 <section class="detail-section"><h2>初篩依據與待查風險</h2><p>舊版初篩 ${old.score}/100，僅用於現有候選清單；與上方五項區域分數分開。</p><ul>${old.reasons.map(v=>`<li>${escapeHtml(v)}</li>`).join('')}</ul><ul>${old.pending.map(v=>`<li>${escapeHtml(v)}</li>`).join('')}</ul></section>`;
 $('#detailSave').onclick=()=>{toggleShortlist(id);openProperty(id);};$('#detailAnalyze').onclick=()=>{location.hash='analyze/'+encodeURIComponent(id);};$('#propertyDetail').focus({preventScroll:true});
}
