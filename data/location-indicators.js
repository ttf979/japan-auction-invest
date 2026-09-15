(function(root){
 const num=v=>typeof v==='number'&&Number.isFinite(v),nonneg=v=>num(v)&&v>=0;
 const names=['新幹線可達性','站前餐飲密度','星巴克／麥當勞','人口規模與趨勢','主要雇主通勤圈'];
 const keys=['shinkansen','dining','brands','population','employment'],maxima=[3,5,2,5,3];
 const isoDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const fiveYears=(a,b)=>isoDate(a)&&isoDate(b)&&Number(a.slice(0,4))-Number(b.slice(0,4))===5&&a.slice(4)===b.slice(4);
 const hasSources=x=>x?.status==='verified'&&Array.isArray(x.sources)&&x.sources.length>0&&x.sources.every(s=>/^https:\/\//.test(s.url||'')&&Number.isFinite(Date.parse(s.checkedAt||'')));
 function assess(evidence={}){
  const rows=keys.map((key,i)=>{const d=evidence[key]||{};let points=null,detail=d.note||'尚未取得可核對資料',tag=null;
   if(hasSources(d)){
    if(key==='population'&&nonneg(d.current)&&d.currentDate)detail=`${d.municipality||''} ${d.current.toLocaleString('zh-TW')} 人（${d.currentDate}）；${d.note||'五年可比基期待查'}`;
    if(key==='shinkansen'&&nonneg(d.minutes)&&d.includesTransferWait===true&&d.station&&d.destination&&Number.isFinite(Date.parse(d.departureAt||''))){const m=Math.ceil(d.minutes);points=m<=30?3:m<=60?2:0;detail=`${d.station} → ${d.destination}，${m} 分鐘（含轉乘等候）${d.departureAt?'；查詢出發 '+d.departureAt:''}`;tag=points?`新幹線 ${m} 分 · ${points===3?'A':'B'} 級`:null;}
    if(key==='dining'&&Number.isInteger(d.count)&&d.count>=0&&d.walkingMeters===300&&d.deduplicated===true&&d.coverageComplete===true){const n=d.count;points=n===0?0:n<=3?1:n<=7?2:n<=14?3:n<=24?4:5;detail=`車站各出口步行 300 公尺內，共 ${n} 家餐廳／居酒屋；已去重並排除歇業店家`;tag=n?`站前餐飲 ${n} 家`:null;}
    if(key==='brands'&&typeof d.starbucks==='boolean'&&typeof d.mcdonalds==='boolean'&&(d.starbucks&&d.mcdonalds||d.coverageComplete===true)){points=Number(d.starbucks)+Number(d.mcdonalds);detail=`${d.municipality||'所在市區町村'}：${d.starbucks?'有星巴克':'未設星巴克'}、${d.mcdonalds?'有麥當勞':'未設麥當勞'}`;tag=points===2?'星巴克＋麥當勞':points===1?(d.starbucks?'市內有星巴克':'市內有麥當勞'):null;}
    if(key==='population'&&nonneg(d.current)&&num(d.previous)&&d.previous>0&&d.comparable===true&&d.periodYears===5&&fiveYears(d.currentDate,d.previousDate)){const change=(d.current-d.previous)/d.previous*100;const size=d.current<30000?0:d.current<100000?1:2;const trend=change< -5?0:change< -2?1:change<2?2:3;points=size+trend;detail=`${d.municipality||''} ${d.current.toLocaleString('zh-TW')} 人（${d.currentDate}）；五年前 ${d.previous.toLocaleString('zh-TW')} 人（${d.previousDate}）；增減 ${change>=0?'+':''}${change.toFixed(2)}%。規模 ${size}/2、趨勢 ${trend}/3`;tag=change>=2?`人口五年 +${change.toFixed(1)}%`:d.current>=100000?'都市人口 10 萬以上':null;}
    if(key==='employment'&&d.mode==='driving'&&d.coverageComplete===true&&Array.isArray(d.sites)&&d.sites.every(s=>s.name&&s.siteId&&nonneg(s.minutes)&&s.majorEmployer===true&&['headquarters','office','factory'].includes(s.kind))){const sites=[...new Map(d.sites.filter(s=>s.minutes<=30).map(s=>[s.siteId,s])).values()];const n=sites.length;points=n===0?0:n===1?1:n<=3?2:3;detail=`物件出發開車 30 分鐘內 ${n} 處：${sites.map(s=>s.name+' '+s.minutes+' 分鐘').join('、')||'查核範圍內未發現符合條件據點'}`;tag=n?`30 分通勤圈 ${n} 處雇主`:null;}
   }
   return {key,name:names[i],max:maxima[i],points,detail,tag,sources:Array.isArray(d.sources)?d.sources:[],status:points===null?'pending':'verified'};
  });
  const checked=rows.filter(r=>r.points!==null).length,subtotal=rows.reduce((n,r)=>n+(r.points??0),0);
  return {rows,checked,subtotal,max:18,score:checked===5?Math.round(subtotal/18*100):null,tags:rows.filter(r=>r.tag).map(r=>r.tag).slice(0,3)};
 }
 root.LocationIndicators={assess};
})(globalThis);
