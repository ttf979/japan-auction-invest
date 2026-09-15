(function(root){
 const finite=v=>v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v));
 function category(x){const t=[x.type,x.propertyUse].filter(Boolean).join(' ');return /工場|事務所|店舗|倉庫|事業/.test(t)?'事業用／混合':/マンション|公寓/.test(t)?'公寓':/戸建|戶建|居宅/.test(t)?'戶建':/土地/.test(t)?'土地':t?'其他':'待確認';}
 function closed(x,now=new Date()){return x.availability==='ended'||!!(x.bidEnd&&/^\d{4}-\d{2}-\d{2}$/.test(x.bidEnd)&&now.getTime()>Date.parse(x.bidEnd+'T23:59:59+09:00'));}
 function screen(x,now=new Date()){
  const reasons=[],pending=['占用、欠費、瑕疵與修繕費待三點件逐項核對','市價、租金及成交可行性尚未查核'];let score=0;
  const official=!!(x.bitUrl&&/^https:\/\/(www\.)?bit\.courts\.go\.jp\//.test(x.bitUrl)&&x.caseNumber);
  if(official){score+=20;reasons.push('已連結法院三點件及事件編號');}else pending.unshift('尚缺法院文件回指，僅列待補資料');
  if(x.documentCount>0){score+=10;reasons.push('三點件已保存，可開始文件研究');}else pending.push('法院文件尚未保存或已下架');
  if(x.imageReady){score+=5;reasons.push('已有法院文件真實照片');}
  const complete=['price','area','age'].every(k=>finite(x[k]))&&x.address&&x.court&&x.bidEnd;
  if(complete){score+=15;reasons.push('價格、面積、屋齡、地址及期間欄位齊全');}else pending.push('部分基本欄位待補齊');
  const walk=String(x.station||'').match(/(?:徒歩|徒步)\s*(\d+)\s*分/);
  if(walk&&Number(walk[1])<=15){score+=25;reasons.push(`來源頁列步行 ${Number(walk[1])} 分鐘，交通較便利`);}
  else if(walk&&Number(walk[1])<=25){score+=10;reasons.push(`來源頁列步行 ${Number(walk[1])} 分鐘`);}else pending.push('步行時間未達優先條件或未確認');
  if(finite(x.age)&&Number(x.age)>=0&&Number(x.age)<=10){score+=25;reasons.push(`來源欄位屋齡 ${Number(x.age)} 年，較新`);}else if(finite(x.age)&&Number(x.age)>10&&Number(x.age)<=20){score+=15;reasons.push(`來源欄位屋齡 ${Number(x.age)} 年`);}else pending.push('屋齡較高或未確認，需查修繕狀況');
  pending.push('屋齡與交通為來源站欄位，仍需核對；屋齡不代表屋況');
  const knownEnd=!!(x.sourceVerifiedAt&&x.bidEnd&&/^\d{4}-\d{2}-\d{2}$/.test(x.bidEnd)&&Number.isFinite(Date.parse(x.bidEnd))&&new Date(x.bidEnd).toISOString().slice(0,10)===x.bidEnd);
  if(!knownEnd)pending.unshift('投標結束日期待核對，不列入自動推薦');
  return {score,reasons,pending,eligible:!closed(x,now)&&official&&knownEnd&&score>=60,label:closed(x,now)?'已結束':!official||!knownEnd?'待補資料':score>=60?'值得研究':'一般觀察'};
 }
 root.ResearchRules={finite,category,closed,screen};
})(globalThis);
