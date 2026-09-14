const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const yen=n=>n==null?'未確認':'¥'+Math.round(Number(n)).toLocaleString('ja-JP');
let discoveries=[], analyzedCases=[], currentView='discover';
let selected=new Set(JSON.parse(localStorage.getItem('auction-shortlist')||'["294645"]'));

init();
async function init(){
  const [d,c]=await Promise.all([
    loadDiscoveries(),
    fetch('data/cases.json',{cache:'no-store'}).then(r=>r.json()).catch(()=>[])
  ]);
  discoveries=Array.isArray(d)?d:[];analyzedCases=Array.isArray(c)?c:[];
  hydrateFilters();bindUI();renderDiscover();renderShortlist();updateCounts();
}

async function loadDiscoveries(){
  try{
    const r=await fetch('/api/discoveries',{cache:'no-store'});
    if(r.ok){const data=await r.json();if(Array.isArray(data?.items)&&data.items.length)return data.items;}
  }catch{}
  return fetch('data/discoveries.json',{cache:'no-store'}).then(r=>r.json()).catch(()=>[]);
}
async function refreshDiscoveries(){
  const b=$('#refreshDiscoveries'); if(!b)return;
  const old=b.textContent;b.disabled=true;b.textContent='更新中…';
  try{
    const r=await fetch('/api/refresh-discoveries',{method:'POST'});
    const data=await r.json().catch(()=>({}));
    discoveries=await loadDiscoveries();
    hydrateFilters(true);renderDiscover();renderShortlist();updateCounts();
    b.textContent=data.added?`新增 ${data.added} 筆`:'已更新';
  }catch{b.textContent='更新失敗';}
  setTimeout(()=>{b.disabled=false;b.textContent=old},2200);
}

function bindUI(){
  $$('[data-nav]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.nav)));
  ['#discoverSearch','#discoverPref','#discoverType','#discoverPrice','#discoverSort'].forEach(s=>$(s).addEventListener('input',renderDiscover));
  $('#analysisGo').addEventListener('click',()=>runAnalysis($('#analysisInput').value));
  $('#analysisInput').addEventListener('keydown',e=>{if(e.key==='Enter')runAnalysis(e.target.value)});
  $$('[data-analyze]').forEach(b=>b.addEventListener('click',()=>{showView('analyze');$('#analysisInput').value=b.dataset.analyze;runAnalysis(b.dataset.analyze)}));
  $('#refreshDiscoveries')?.addEventListener('click',refreshDiscoveries);
}

function showView(name){
  currentView=name;
  $$('.view').forEach(v=>v.classList.add('hidden'));
  $('#'+name+'View').classList.remove('hidden');
  $$('.nav-tab').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));
  if(name==='shortlist')renderShortlist();
  window.scrollTo({top:0,behavior:'smooth'});
}
function hydrateFilters(reset=false){
  if(reset){$('#discoverPref').innerHTML='<option value="">全部地區</option>';$('#discoverType').innerHTML='<option value="">全部類型</option>';}
  const prefs=[...new Set(discoveries.map(x=>x.prefecture).filter(Boolean))].sort();
  $('#discoverPref').insertAdjacentHTML('beforeend',prefs.map(x=>`<option>${x}</option>`).join(''));
  const types=[...new Set(discoveries.map(x=>x.type).filter(Boolean))].sort();
  $('#discoverType').insertAdjacentHTML('beforeend',types.map(x=>`<option>${x}</option>`).join(''));
}
function updateCounts(){
  $('#discoverCount').textContent=discoveries.length;
  $('#shortlistCount').textContent=selected.size;
  $('#heroNewCount').textContent=discoveries.length;
  $('#heroCheapCount').textContent=discoveries.filter(x=>Number.isFinite(Number(x.price))&&Number(x.price)<=5000000).length;
  $('#heroFreshCount').textContent=discoveries.filter(x=>Number.isFinite(Number(x.age))&&Number(x.age)<=10).length;
}
function renderDiscover(){
  const term=($('#discoverSearch').value||'').trim().toLowerCase();
  const pref=$('#discoverPref').value,type=$('#discoverType').value,max=Number($('#discoverPrice').value||0),sort=$('#discoverSort').value;
  let arr=discoveries.filter(x=>!term||[x.id,x.title,x.prefecture,x.city,x.address,x.court,x.station].join(' ').toLowerCase().includes(term));
  if(pref)arr=arr.filter(x=>x.prefecture===pref);if(type)arr=arr.filter(x=>x.type===type);if(max)arr=arr.filter(x=>x.price<=max);
  arr=[...arr].sort((a,b)=>sort==='cheap'?(Number(a.price)||9e15)-(Number(b.price)||9e15):sort==='area'?(Number(b.area)||0)-(Number(a.area)||0):sort==='age'?(Number(a.age)||999)-(Number(b.age)||999):String(b.published||'').localeCompare(String(a.published||'')));
  $('#resultText').textContent=` · ${arr.length} 件`;
  $('#discoverGrid').innerHTML=arr.map(discoveryCard).join('')||empty('沒有符合條件的物件');
  bindDiscoveryActions();
}
function propertyImageUrl(x){
  // V2.1.1: 由自己的 Netlify Function 讀來源案件頁並代理主圖，
  // 不再依賴 Microlink，也避免來源站防盜連造成瀏覽器直接載圖失敗。
  return `/api/property-image?id=${encodeURIComponent(x.id)}&url=${encodeURIComponent(x.sourceUrl)}&title=${encodeURIComponent(x.title)}`;
}
function photoFallback(el,label,sourceUrl){
  if(sourceUrl && el.dataset.fallbackStage!=='preview'){
    el.dataset.fallbackStage='preview';
    el.onerror=()=>photoFallback(el,label,null);
    // Thum.io expects the target URL as a raw path suffix, not percent-encoded.
    // This is only the last visual fallback; real cards prefer cached/source/three-doc photos.
    el.src=`https://image.thum.io/get/width/900/crop/600/noanimate/${sourceUrl}`;
    return;
  }
  const safe=String(label||'日本法拍物件').slice(0,18).replace(/[<>&"']/g,'');
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='900' height='600'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='#18344f'/><stop offset='1' stop-color='#b98b46'/></linearGradient></defs><rect width='900' height='600' fill='url(#g)'/><path d='M220 390V250l230-145 230 145v140M315 490V295h270v195M410 490V365h80v125' fill='none' stroke='rgba(255,255,255,.25)' stroke-width='18'/><text x='46' y='540' fill='white' font-size='30' font-family='sans-serif' font-weight='700'>${safe}</text><text x='46' y='575' fill='rgba(255,255,255,.7)' font-size='18' font-family='sans-serif'>圖片來源待確認</text></svg>`;
  el.onerror=null;el.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function discoveryCard(x){
  const chosen=selected.has(x.id);
  return `<article class="treasure-card photo-card">
    <div class="property-photo-wrap">
      <img class="property-photo" loading="lazy" decoding="async" src="${propertyImageUrl(x)}" alt="${escapeHtml(x.title)}" onerror="photoFallback(this,\`${escapeHtml(x.title)}\`,\`${x.sourceUrl}\`)" />
      <div class="photo-shade"></div>
      <div class="tag-stack">${(x.tags||[]).slice(0,3).map(t=>`<span>${t}</span>`).join('')}</div>
      <div class="photo-location">${x.prefecture||'地區待確認'}${x.city?' · '+x.city:''}</div>
      <a class="photo-source" href="${x.sourceUrl}" target="_blank" rel="noreferrer" title="查看原始案件">原始案件 ↗</a>
    </div>
    <div class="treasure-body">
      <div class="price-line"><b>${yen(x.price)}</b><span>${x.type||'類型待確認'}${x.area?' · '+x.area+'m²':''}</span></div>
      <h3 title="${escapeHtml(x.title)}">${x.title}</h3>
      <div class="address">${x.prefecture||''}${x.city||''}${x.address||''}</div>
      <div class="data-status-row"><span class="status-pill bit ${String(x.bitStatus||'').includes('已定位')?'ok':'pending'}">${escapeHtml(x.bitStatus||'待BIT定位')}</span><span class="status-pill image ${String(x.imageStatus||'').includes('已建立')?'ok':'pending'}">${escapeHtml(x.imageStatus||'待主圖')}</span></div>
      <dl class="mini-specs">
        <div><dt>法院</dt><dd>${x.court||'待確認'}</dd></div>
        <div><dt>入札</dt><dd>${x.bid||'待確認'}</dd></div>
        <div><dt>交通</dt><dd>${x.station||'待確認'}</dd></div>
        <div><dt>築年</dt><dd>${x.age!=null?x.age+' 年':'待確認'}</dd></div>
      </dl>
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
  updateCounts();renderDiscover();renderShortlist();
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
    <div class="short-top"><div><span class="case-id">#${x.id}</span><h3>${x.title}</h3><p>${x.prefecture} · ${x.city||''} · ${x.propertyType||x.type||''}</p></div>${detailed?`<div class="grade">${x.rating}</div>`:'<span class="pending-badge">待分析</span>'}</div>
    <div class="short-metrics">
      <div><span>起標價</span><b>${yen(x.startPrice??x.price)}</b></div>
      <div><span>${detailed?'毛投報':'公開日'}</span><b>${detailed?x.grossYield.toFixed(1)+'%':x.published}</b></div>
      <div><span>${detailed?'安全邊際':'入札'}</span><b>${detailed?x.safetyMarginAtRecommendedHigh.toFixed(1)+'%':x.bid}</b></div>
    </div>
    <div class="card-actions"><button data-short-analyze="${x.id}" class="primary small">進入分析</button>${detailed?`<button data-open-detail="${x.id}" class="soft small">看完整結果</button>`:''}<button data-remove="${x.id}" class="text-btn">移除</button></div>
  </article>`;
}
function openDetail(id){
  const c=analyzedCases.find(x=>x.id===id);if(!c)return;
  $('#caseDetailMount').innerHTML=`<div class="full-analysis"><div class="full-head"><div><span class="eyebrow">ANALYZED CASE</span><h2>${c.title}</h2><p>${c.court}｜${c.caseNo}</p></div><div class="grade large">${c.rating}</div></div>
  <div class="decision-kpis"><div><span>起標</span><b>${yen(c.startPrice)}</b></div><div><span>月租金</span><b>${yen(c.monthlyRent)}</b></div><div><span>毛投報</span><b>${c.grossYield}%</b></div><div><span>安全邊際</span><b>${c.safetyMarginAtRecommendedHigh}%</b></div><div><span>最高紅線</span><b>${yen(c.maxBid)}</b></div></div>
  <div class="analysis-two"><div><h4>值得研究</h4><ul>${c.positives.map(x=>`<li>${x}</li>`).join('')}</ul></div><div><h4>Gate／未確認</h4><ul>${c.gateReasons.map(x=>`<li>${x}</li>`).join('')}</ul></div></div></div>`;
  $('#caseDetailMount').scrollIntoView({behavior:'smooth'});
}
function parseAnalysisInput(raw){
  const text=(raw||'').trim();
  const m=text.match(/auction\/(\d+)\.html/)||text.match(/^\s*(\d{5,8})\s*$/);
  return m?m[1]:text;
}
async function runAnalysis(raw){
  const id=parseAnalysisInput(raw);if(!id){$('#analysisResult').innerHTML=empty('請貼入案件網址或案件編號');return;}
  const full=analyzedCases.find(x=>x.id===id);
  if(full){renderFullWorkbench(full);return;}
  const d=discoveries.find(x=>x.id===id);
  if(d){renderPendingWorkbench(d);await ingestCase(d.sourceUrl,d);return;}
  const text=(raw||'').trim();
  if(/^https?:\/\//i.test(text)){renderIngesting(id,text);await ingestCase(text,{id});return;}
  renderUnknownWorkbench(raw,id);
}
function renderIngesting(id,url){
  $('#analysisResult').innerHTML=`<div class="workbench-result"><div class="result-status"><span>案件 ${escapeHtml(id)}</span><b>正在下載三點件並建立 Drive 檔案…</b></div><div class="analysis-steps"><div class="done">✓ 收到案件網址</div><div class="active">↻ 尋找／下載三點件</div><div>○ 存入 Google Drive</div><div>○ 從三點件抽取主圖</div><div>○ 建立分析資料</div></div><p class="muted">${escapeHtml(url)}</p></div>`;
}
async function ingestCase(url,d={}){
  if(!url)return;
  renderIngesting(d.id||parseAnalysisInput(url),url);
  try{
    const r=await fetch('/api/ingest-case',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,caseId:d.id||parseAnalysisInput(url),title:d.title||'',prefecture:d.prefecture||'',city:d.city||'',court:d.court||'',price:d.price||'',type:d.type||'',area:d.area||'',bid:d.bid||''})});
    const data=await r.json().catch(()=>({ok:false,error:`HTTP ${r.status}`}));
    if(r.ok&&data.ok){
      const saved=(data.documents||[]).filter(x=>x.drive&&!x.error);
      const failed=(data.documents||[]).filter(x=>x.error);
      $('#analysisResult').innerHTML=`<div class="workbench-result ready"><div class="result-status"><span>法院三點件建檔完成</span><b>${saved.length} 份已存 Google Drive${data.mainImage?' · 主圖已建立':''}</b></div><div class="analysis-steps"><div class="done">✓ 基本資料</div><div class="done">✓ BIT 三點件下載／存 Drive</div><div class="${data.mainImage?'done':''}">${data.mainImage?'✓':'○'} 三點件主圖</div><div>○ 租金／市場行情</div><div>○ 投報／安全邊際／出價</div></div><div class="gate-box"><b>Drive：</b>${escapeHtml(data.docFolder?.name||'案件資料夾')}<br><b>主圖來源：</b>${escapeHtml(data.mainImage?.pdfType||'尚未取得')}${data.mainImage?.pdfPage?`（PDF 第 ${data.mainImage.pdfPage} 頁）`:''}${failed.length?`<br><b>未完成：</b>${failed.map(x=>escapeHtml(x.type+': '+x.error)).join('、')}`:''}</div><div class="workbench-actions"><button class="primary" onclick="location.reload()">更新首頁主圖</button><a href="${url}" target="_blank" rel="noreferrer" class="soft-link">查看原始案件 ↗</a></div></div>`;
      return;
    }
    if(data.error==='drive_not_configured'){
      $('#analysisResult').innerHTML=`<div class="workbench-result"><div class="result-status"><span>三點件已找到</span><b>Google Drive API 尚未配置</b></div><div class="analysis-steps"><div class="done">✓ 案件網址</div><div class="done">✓ 找到 ${data.discoveredDocs?.length||0} 份文件</div><div>○ 存入 Google Drive</div><div>○ 建立主圖</div></div><div class="gate-box"><b>尚缺 Netlify 環境變數：</b>${(data.missing||[]).map(escapeHtml).join('、')}<br>文件沒有消失；Drive 憑證接好後可重新執行。</div></div>`;
      return;
    }
    $('#analysisResult').innerHTML=`<div class="workbench-result"><div class="result-status"><span>建檔未完成</span><b>${escapeHtml(data.error||'unknown_error')}</b></div><div class="gate-box">這次失敗不會清除任何既有資料。可修正來源或權限後重新執行。</div></div>`;
  }catch(e){
    $('#analysisResult').innerHTML=`<div class="workbench-result"><div class="result-status"><span>建檔未完成</span><b>網路／Function 錯誤</b></div><div class="gate-box">${escapeHtml(e.message||String(e))}<br>既有成功資料不會被覆蓋。</div></div>`;
  }
}
function renderFullWorkbench(c){
  $('#analysisResult').innerHTML=`<div class="workbench-result ready"><div class="result-status"><span>已有分析資料</span><b>${c.rating}｜${c.ratingLabel}</b></div><div class="full-head"><div><h2>${c.title}</h2><p>${c.court}｜${c.caseNo}</p></div><div class="grade large">${c.rating}</div></div><div class="decision-kpis"><div><span>起標價</span><b>${yen(c.startPrice)}</b></div><div><span>年租金</span><b>${yen(c.annualRent)}</b></div><div><span>毛投報</span><b>${c.grossYield}%</b></div><div><span>建議競標上緣</span><b>${yen(c.recommendedBidHigh)}</b></div><div><span>最高紅線</span><b>${yen(c.maxBid)}</b></div></div><div class="gate-box"><b>目前 Gate：</b>${c.gateReasons.join('、')}</div></div>`;
}
function renderPendingWorkbench(d){
  const chosen=selected.has(d.id);
  $('#analysisResult').innerHTML=`<div class="workbench-result"><div class="result-status"><span>案件已辨識</span><b>基本資料完成 · 深度分析待執行</b></div><div class="full-head"><div><h2>${d.title}</h2><p>${d.prefecture}${d.city}${d.address}｜${d.court}</p></div><span class="pending-badge">待分析</span></div><div class="decision-kpis"><div><span>起標價</span><b>${yen(d.price)}</b></div><div><span>類型</span><b>${d.type}</b></div><div><span>面積</span><b>${d.area}m²</b></div><div><span>屋齡</span><b>${d.age}年</b></div><div><span>入札</span><b>${d.bid}</b></div></div><div class="analysis-steps"><div class="done">✓ 基本資料</div><div>○ 三點件／占用</div><div>○ 租金／市場行情</div><div>○ 投報／安全邊際／出價</div></div><div class="workbench-actions"><button id="pendingToggle" class="primary">${chosen?'✓ 已在我的篩選':'＋ 加入我的篩選'}</button><a href="${d.sourceUrl}" target="_blank" rel="noreferrer" class="soft-link">查看原始案件 ↗</a></div></div>`;
  $('#pendingToggle').onclick=()=>{toggleShortlist(d.id);renderPendingWorkbench(d)};
}
function renderUnknownWorkbench(raw,id){
  $('#analysisResult').innerHTML=`<div class="workbench-result"><div class="result-status"><span>新案件</span><b>來源尚未取得</b></div><h2>${id||'未辨識案件'}</h2><p>已收到：${escapeHtml(raw||'')}</p><div class="analysis-steps"><div>○ 基本資料</div><div>○ 三點件／占用</div><div>○ 租金／市場行情</div><div>○ 投報／安全邊際／出價</div></div><div class="gate-box">目前先建立分析入口。下一階段接上來源取得後，這裡會直接把網址轉成案件並開始分析；在資料尚未確認前不會自行猜測。</div></div>`;
}
function empty(t){return `<div class="empty-state"><div>⌕</div><b>${t}</b></div>`}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
