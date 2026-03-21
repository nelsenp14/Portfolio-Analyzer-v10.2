import { useState, useCallback, useRef, useMemo, useEffect } from "react";
// Portfolio Insights - AI-powered portfolio dashboard
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
var API="https://api.anthropic.com/v1/messages";
var YAHOO_PROXY="https://corsproxy.io/?url=";
var DH=[{id:1,ticker:"GOOGL",shares:"18.46",avgCost:"126.15"},{id:2,ticker:"NVDA",shares:"30.44",avgCost:"46.20"},{id:3,ticker:"TSLA",shares:"12",avgCost:"200.00"},{id:4,ticker:"SPY",shares:"20",avgCost:"380.00"},{id:5,ticker:"NVDA-2",shares:"5",avgCost:"400.00"},{id:6,ticker:"JNJ",shares:"10",avgCost:"155.00"},{id:7,ticker:"BRK.B",shares:"6",avgCost:"310.00"},{id:8,ticker:"VTI",shares:"18",avgCost:"200.00"},{id:9,ticker:"AMZN",shares:"7",avgCost:"130.00"},{id:10,ticker:"GLD",shares:"14",avgCost:"170.00"},{id:11,ticker:"BTC",shares:"0.5",avgCost:"35000.00"},{id:12,ticker:"ETH",shares:"2",avgCost:"2000.00"},{id:13,ticker:"SOL",shares:"10",avgCost:"80.00"},{id:14,ticker:"QQQ",shares:"5",avgCost:"350.00"},{id:15,ticker:"VYM",shares:"8",avgCost:"105.00"}];
function cT(t){return(function(x){var s=x.toUpperCase().trim(),d=s.lastIndexOf("-");if(d>0){var ok=true;for(var j=d+1;j<s.length;j++){var z=s.charCodeAt(j);if(z<48||z>57)ok=false;}if(ok&&d+1<s.length)s=s.slice(0,d);}return s;})(t||"");}
function hap(){try{if(navigator.vibrate)navigator.vibrate([6,30,6]);}catch(e){}}
function fmt(v){return"$"+v.toLocaleString("en-US");}
function useWidth(){var s=useState(typeof window!=="undefined"?window.innerWidth:1200);useEffect(function(){function h(){s[1](window.innerWidth);}window.addEventListener("resize",h);return function(){window.removeEventListener("resize",h);};},[]);return s[0];}
function toYF(tk){if(CRTK.indexOf(tk)>-1)return tk+"-USD";if(tk==="BRK.B")return"BRK-B";return tk;}
function fmtCap(v){if(!v)return"";if(v>=1e12)return(v/1e12).toFixed(1)+"T";if(v>=1e9)return(v/1e9).toFixed(1)+"B";return(v/1e6).toFixed(0)+"M";}
async function fetchYahooQuote(tk){
var sym=toYF(tk);
var url="https://query2.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(sym)+"?range=5d&interval=1d&includePrePost=false";
var attempts=[YAHOO_PROXY+encodeURIComponent(url),url];
for(var i=0;i<attempts.length;i++){
try{
var r=await fetch(attempts[i],{signal:AbortSignal.timeout(8000)});
if(!r.ok)continue;
var d=await r.json();
var res=d&&d.chart&&d.chart.result&&d.chart.result[0];
if(!res||!res.meta)continue;
var m=res.meta;
if(!m.regularMarketPrice||m.regularMarketPrice<=0)continue;
var isCr=CRTK.indexOf(tk)>-1;
return{currentPrice:m.regularMarketPrice,companyName:m.shortName||m.longName||sym,assetType:isCr?"Cryptocurrency":"Equity",sector:isCr?"Cryptocurrency":"",beta:0,dividendYield:0,annualDividendPerShare:0,pe:0,marketCap:""};
}catch(e){continue;}
}
return null;
}
async function fetchYahooBatch(tickers,onProgress){
var results={};var done=0;
var chunks=[];for(var i=0;i<tickers.length;i+=6){chunks.push(tickers.slice(i,i+6));}
for(var c=0;c<chunks.length;c++){
var ps=chunks[c].map(function(tk){return fetchYahooQuote(tk).then(function(d){if(d){results[tk]=d;done++;}}).catch(function(){});});
await Promise.all(ps);
if(onProgress)onProgress(done,tickers.length);
}
return Object.keys(results).length>0?results:null;
}
async function callAI(m,sys,mt){
var body={model:"claude-sonnet-4-20250514",max_tokens:mt||800,messages:m};
if(sys)body.system=sys;
var r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
var txt=await r.text();
if(!r.ok){var err="API "+r.status;try{var ed=JSON.parse(txt);if(ed.error)err=ed.error.message||err;}catch(e){}throw new Error(err);}
var d=JSON.parse(txt);
return(d.content||[]).filter(function(b){return b.type==="text";}).map(function(b){return b.text;}).join("")||"";
}
function parseJ(raw){var BT=String.fromCharCode(96);var c=raw;while(c.indexOf(BT)>-1)c=c.replace(BT,"");c=c.trim();var a2=c.indexOf("{"),b2=c.lastIndexOf("}"),a=c.indexOf("["),b=c.lastIndexOf("]");if(a>-1&&b>a)return JSON.parse(c.slice(a,b+1));if(a2>-1&&b2>a2)return JSON.parse(c.slice(a2,b2+1));throw new Error("No JSON");}
async function enrichWithAI(tickers){
try{
var raw=await callAI([{role:"user",content:"For these tickers give sector, beta, dividendYield (%), annualDividendPerShare, pe, marketCap. Tickers: "+tickers.join(",")+". JSON only: {\"TICK\":{sector:\"X\",beta:1.0,dividendYield:0,annualDividendPerShare:0,pe:0,marketCap:\"XB\"}}"}],"Return only valid JSON object. No markdown.",2048);
return parseJ(raw);
}catch(e){return{};}
}
async function fetchPricesAIBatch(tickers){
var results={};
for(var i=0;i<tickers.length;i+=4){
var chunk=tickers.slice(i,i+4);
var isCrs=chunk.map(function(tk){return CRTK.indexOf(tk)>-1;});
var prompt=chunk.map(function(tk,j){return'"'+tk+'":{currentPrice:0,dividendYield:0,annualDividendPerShare:0,sector:"",assetType:'+(isCrs[j]?'"Cryptocurrency"':'"Equity"')+',beta:0,companyName:"",marketCap:"",pe:0}';}).join(",");
try{
var raw=await callAI([{role:"user",content:"Real current market prices. Return JSON: {"+prompt+"}"}],"Valid JSON only. No markdown. Fill in real values.",1500);
var parsed=parseJ(raw);
Object.assign(results,parsed);
}catch(e){}
}
return Object.keys(results).length>0?results:null;
}


var AC={BUY:"#22c55e",ADD:"#22c55e",HOLD:"#64748b",TRIM:"#f59e0b",SELL:"#ef4444"};
var CRTK=["BTC","ETH","SOL","DOGE","ADA","XRP","DOT","AVAX","MATIC","LINK","UNI","SHIB","LTC","BNB"];
var CLR=["#3b82f6","#f59e0b","#22c55e","#ec4899","#06b6d4","#ef4444","#a78bfa","#f97316","#14b8a6","#fb7185","#8b5cf6","#34d399","#60a5fa","#fbbf24","#c084fc","#fb923c","#4ade80","#38bdf8","#f472b6","#a3e635"];
function renderLabel(p){if(parseFloat(p.pct)<4)return null;var R=Math.PI/180,r=p.outerRadius+24,x=p.cx+r*Math.cos(-p.midAngle*R),y=p.cy+r*Math.sin(-p.midAngle*R);return <text x={x} y={y} textAnchor={x>p.cx?"start":"end"} dominantBaseline="central" style={{fontSize:12,fill:"#e2e8f0",fontFamily:"Poppins,sans-serif",fontWeight:600}}>{p.name} {p.pct}%</text>;}
function ChartTip(p) {
  if (!p.active || !p.payload || !p.payload.length) return null;
  var port = 0;
  var cont = 0;
  p.payload.forEach(function(v) {
    if (v.dataKey === "portfolio") port = v.value;
    if (v.dataKey === "contributed") cont = v.value;
  });
  var gain = port - cont;
  var gPct = cont > 0 ? ((gain / cont) * 100).toFixed(1) : "0";
  var tipBox = {
    background: "rgba(10,14,26,0.95)",
    border: "1px solid #1e3a5f",
    borderRadius: 14,
    padding: "16px 20px",
    minWidth: 180
  };
  return (
    <div style={tipBox}>
      {p.label ? <div style={{color: "#64748b", fontSize: 10, fontWeight: 600, textTransform: "uppercase", marginBottom: 10}}>{p.label}</div> : null}
      <div style={{marginBottom: 6}}>
        <div style={{fontSize: 10, color: "#94a3b8"}}>Portfolio</div>
        <div style={{fontSize: 16, fontWeight: 700, color: "#22c55e"}}>{fmt(port)}</div>
      </div>
      <div style={{marginBottom: 8}}>
        <div style={{fontSize: 10, color: "#94a3b8"}}>Contributed</div>
        <div style={{fontSize: 14, fontWeight: 600, color: "#3b82f6"}}>{fmt(cont)}</div>
      </div>
      <div style={{borderTop: "1px solid #1e293b", paddingTop: 8}}>
        <div style={{fontSize: 10, color: "#94a3b8", marginBottom: 2}}>Gain</div>
        <div style={{fontSize: 14, fontWeight: 700, color: gain >= 0 ? "#22c55e" : "#ef4444"}}>{gain >= 0 ? "+" : ""}{fmt(Math.round(gain))} ({gPct}%)</div>
      </div>
    </div>
  );
}
async function sSave(k,d){try{localStorage.setItem(k,JSON.stringify(d));return true;}catch(e){return false;}}
async function sLoad(k){try{var r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch(e){return null;}}
async function sList(p){try{var keys=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf(p)===0)keys.push(k);}return keys;}catch(e){return[];}}
async function sDel(k){try{localStorage.removeItem(k);}catch(e){}}

export default function App(){
var W=useWidth(),mob=W<768,sm=W<480,pieH=sm?340:mob?400:460,pieIn=sm?50:mob?65:85,pieOut=sm?105:mob?130:165;
var cd={background:"#0f172a",border:"1px solid #1e293b",borderRadius:10,padding:mob?12:16};
var tgF=function(bg,co){return{display:"inline-block",padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:500,background:bg,color:co};};
var inp={background:"#0f172a",border:"1px solid #1e3a5f",color:"#e2e8f0",padding:"8px 10px",borderRadius:5,fontSize:14,outline:"none",width:"100%",textAlign:"center"};
var bS=function(on){return{border:"none",borderRadius:7,padding:mob?"10px 14px":"9px 18px",fontSize:mob?12:11,fontWeight:600,cursor:on?"pointer":"not-allowed",background:on?"#1d4ed8":"#1e3a5f",color:on?"#fff":"#475569",touchAction:"manipulation"};};
var gS=function(on){return{border:"1px solid #1e3a5f",borderRadius:7,padding:mob?"10px 14px":"9px 18px",fontSize:mob?12:11,fontWeight:600,cursor:on?"pointer":"not-allowed",background:"#0f172a",color:on?"#94a3b8":"#475569",touchAction:"manipulation"};};
var thd={textAlign:"center",fontSize:10,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",color:"#fff",padding:"10px 8px",borderBottom:"2px solid rgba(255,255,255,0.25)",whiteSpace:"nowrap"};
var tdd={padding:"8px",borderBottom:"1px solid rgba(255,255,255,0.06)",fontSize:12,whiteSpace:"nowrap",textAlign:"center"};
var ttl={fontSize:mob?18:20,fontWeight:600,color:"#fff"};
var lbl={fontSize:11,color:"#fff",letterSpacing:".08em",textTransform:"uppercase",marginBottom:4,fontWeight:600};
var vlS=function(c){return{fontSize:mob?16:20,fontWeight:600,color:c};};
var sel={background:"#0f172a",border:"1px solid #1e3a5f",color:"#e2e8f0",padding:"8px 10px",borderRadius:5,fontSize:14,outline:"none",cursor:"pointer"};
var fld={fontSize:10,color:"#fff",marginBottom:3,fontWeight:600};
var cpB={border:"1px solid #22c55e",borderRadius:7,padding:mob?"10px 14px":"9px 18px",fontSize:mob?12:11,fontWeight:600,cursor:"pointer",background:"rgba(34,197,94,0.1)",color:"#22c55e",touchAction:"manipulation"};
var sCard=Object.assign({},cd,{display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:mob?70:80});
var S=useState;
var h0=S(DH),holdings=h0[0],setHoldings=h0[1],en0=S({}),enriched=en0[0],setEnriched=en0[1],rc0=S(null),recs=rc0[0],setRecs=rc0[1],rb0=S(null),rebal=rb0[0],setRebal=rb0[1],ld0=S({}),loading=ld0[0],setLoading=ld0[1],tb0=S("portfolio"),tab=tb0[0],setTab=tb0[1],ca0=S("0"),cash=ca0[0],setCash=ca0[1],st0=S(""),status=st0[0],setStatus=st0[1],er0=S(""),err=er0[0],setErr=er0[1],ft0=S({}),fetching=ft0[0],setFetching=ft0[1];
var cm0=S("500"),calcMonthly=cm0[0],setCalcMonthly=cm0[1],cy0=S("10"),calcYears=cy0[0],setCalcYears=cy0[1],cr0=S("10"),calcReturn=cr0[0],setCalcReturn=cr0[1],cf0=S("monthly"),calcFreq=cf0[0],setCalcFreq=cf0[1],co0=S(""),calcStartOv=co0[0],setCalcStartOv=co0[1];
var ch0=S([]),chatMsgs=ch0[0],setChatMsgs=ch0[1],ci0=S(""),chatInput=ci0[0],setChatInput=ci0[1],cl0=S(false),chatLoading=cl0[0],setChatLoading=cl0[1];
var sl0=S([]),savedList=sl0[0],setSavedList=sl0[1],sn0=S(""),saveName=sn0[0],setSaveName=sn0[1],sp0=S(false),showSavePanel=sp0[0],setShowSavePanel=sp0[1];
var sd0=S(false),showDisclaimer=sd0[0],setShowDisclaimer=sd0[1],sc1=S(false),showContact=sc1[0],setShowContact=sc1[1];
var at0=S(null),activeT=at0[0],setActiveT=at0[1],as0=S(null),activeS=as0[0],setActiveS=as0[1];
var fT0=S(null),filterTicker=fT0[0],setFilterTicker=fT0[1],fS0=S(null),filterSector=fS0[0],setFilterSector=fS0[1];
var so0=S(null),sortCol=so0[0],setSortCol=so0[1],sD0=S("desc"),sortDir=sD0[0],setSortDir=sD0[1];
var cO0=S(true),chartsOpen=cO0[0],setChartsOpen=cO0[1],gm0=S("pct"),glMode=gm0[0],setGlMode=gm0[1],dm0=S("pct"),divMode=dm0[0],setDivMode=dm0[1];
var chatEndRef=useRef(null),nid=useRef(16),loaded=useRef(false),timerRef=useRef(null);
useEffect(function(){if(loaded.current)return;loaded.current=true;sList("pf:").then(function(keys){if(!keys||!keys.length)return;Promise.all(keys.map(function(k){return sLoad(k).then(function(d){return d?Object.assign({},d,{key:k}):null;});})).then(function(r){setSavedList(r.filter(Boolean).sort(function(a,b){return(b.savedAt||0)-(a.savedAt||0);}));});});sLoad("pf-active").then(function(data){if(data&&data.holdings&&data.holdings.length>0){setHoldings(data.holdings);nid.current=Math.max.apply(null,data.holdings.map(function(x){return x.id;}))+1;}});},[]);
useEffect(function(){if(chatEndRef.current)chatEndRef.current.scrollIntoView({behavior:"smooth"});},[chatMsgs]);
useEffect(function(){if(loaded.current)sSave("pf-active",{holdings:holdings});},[holdings]);
var validH=holdings.filter(function(x){return x.ticker.trim()&&parseFloat(x.shares)>0&&parseFloat(x.avgCost)>0;});
var computed=useMemo(function(){var tvv=0,tcc=0,dii=0;var wins=0,total=0;var poss=validH.map(function(x){var tk=cT(x.ticker),e=enriched[tk]||{};var price=e.currentPrice||parseFloat(x.avgCost),shares=parseFloat(x.shares),ac=parseFloat(x.avgCost);var v=price*shares,cost=ac*shares,div=(e.annualDividendPerShare||0)*shares;tvv+=v;tcc+=cost;dii+=div;if(e.currentPrice>0){total++;if(price>=ac)wins++;}return Object.assign({},x,e,{ticker:tk,price:price,shares:shares,avgCost:ac,value:v,cost:cost});});var peN=0,peD=0;poss.forEach(function(p){if(p.pe>0&&p.pe<500){peN+=p.pe*p.value;peD+=p.value;}});var wr=total>0?Math.round((wins/total)*100):0;return{pos:poss,tv:tvv,tc:tcc,di:dii,dy:tvv>0?(dii/tvv)*100:0,wpe:peD>0?peN/peD:0,winRate:wr,winCount:wins,totalCount:total};},[validH,enriched]);
var pos=computed.pos,tv=computed.tv,tc=computed.tc,dy=computed.dy,wpe=computed.wpe;
var sc=useMemo(function(){if(!tv||!pos.length)return null;var w=pos.map(function(p){return p.value/tv;});var wb=w.reduce(function(s,wi,i){return s+wi*(pos[i].beta||1);},0);var t3=w.slice().sort(function(a,b){return b-a;}).slice(0,3).reduce(function(s,x){return s+x;},0);var crp=pos.filter(function(p){return p.assetType==="Crypto"||p.assetType==="Cryptocurrency"||p.sector==="Cryptocurrency"||CRTK.indexOf(p.ticker)>-1;}).reduce(function(s,p){return s+p.value/tv;},0);
var techPct=pos.filter(function(p){var s=p.sector||"";return s==="Technology"||s==="Communication Services"||s==="Cryptocurrency"||CRTK.indexOf(p.ticker)>-1;}).reduce(function(s,p){return s+p.value/tv;},0);
var cl2=function(v,mx){return Math.min(15,Math.max(0,v*15/mx));};
var s1=cl2(wb,2.0);
var s2=Math.min(15,Math.max(0,(t3-0.15)/0.5*15));
var s3=Math.min(20,Math.max(0,crp>0.03?5+crp*60:0));
var s4=Math.min(15,Math.max(0,(25-pos.length)/24*15));
var s5=cl2((wb*0.165)/Math.sqrt(252)*2.326,0.04);
var s6=Math.min(20,Math.max(0,techPct>0.3?(techPct-0.3)/0.4*20+5:techPct>0.2?(techPct-0.2)/0.3*8:0));
var total=s1+s2+s3+s4+s5+s6;
return{total:Math.min(100,total),s1:s1,s2:s2,s3:s3,s4:s4,s5:s5,s6:s6,wb:wb,top3:t3,crypto:crp,techPct:techPct,n:pos.length};},[pos,tv]);
var scColor=sc?(sc.total<30?"#22c55e":sc.total<50?"#f59e0b":sc.total<70?"#f97316":"#ef4444"):"#fff";
var scLabel=sc?(sc.total<20?"CONSERVATIVE":sc.total<35?"MOD-CONSERVATIVE":sc.total<50?"MODERATE":sc.total<65?"AGGRESSIVE":"SPECULATIVE"):"";
var hasData=Object.keys(enriched).length>0,isBusy=loading.fetch;
var pieDataT=pos.map(function(p,i){return{name:p.ticker,value:Math.round(p.value),pct:tv?((p.value/tv)*100).toFixed(1):"0",color:CLR[i%CLR.length]};}).sort(function(a,b){return b.value-a.value;});
var pieDataS=useMemo(function(){var m={};pos.forEach(function(p){var s=p.sector||"Other";m[s]=(m[s]||0)+p.value;});return Object.entries(m).map(function(e,i){return{name:e[0],value:Math.round(e[1]),pct:tv?((e[1]/tv)*100).toFixed(1):"0",color:CLR[i%CLR.length]};}).sort(function(a,b){return b.value-a.value;});},[pos,tv]);
var filtH=holdings.filter(function(x){if(!filterTicker&&!filterSector)return true;var tk=cT(x.ticker),e=enriched[tk]||{};return filterTicker?tk===filterTicker:filterSector?(e.sector||"Other")===filterSector:true;});
var sortH=useMemo(function(){if(!sortCol)return filtH;return filtH.slice().sort(function(a,b){var tkA=cT(a.ticker),tkB=cT(b.ticker),eA=enriched[tkA]||{},eB=enriched[tkB]||{},pA=eA.currentPrice||0,pB=eB.currentPrice||0,vA=pA*parseFloat(a.shares||0),vB=pB*parseFloat(b.shares||0);var va=0,vb=0;if(sortCol==="Ticker"){va=tkA;vb=tkB;}else if(sortCol==="Value"){va=vA;vb=vB;}else if(sortCol==="G/L%"){va=a.avgCost&&pA?((pA-parseFloat(a.avgCost))/parseFloat(a.avgCost))*100:0;vb=b.avgCost&&pB?((pB-parseFloat(b.avgCost))/parseFloat(b.avgCost))*100:0;}else if(sortCol==="Price"){va=pA;vb=pB;}else if(sortCol==="Shares"){va=parseFloat(a.shares)||0;vb=parseFloat(b.shares)||0;}else if(sortCol==="Beta"){va=eA.beta||0;vb=eB.beta||0;}else if(sortCol==="Div"){va=eA.dividendYield||0;vb=eB.dividendYield||0;}else return 0;if(typeof va==="string")return sortDir==="asc"?va.localeCompare(vb):-va.localeCompare(vb);return sortDir==="asc"?va-vb:vb-va;});},[filtH,sortCol,sortDir,enriched,tv]);
var toggleSort=function(c){if(!c)return;if(sortCol===c)setSortDir(sortDir==="asc"?"desc":"asc");else{setSortCol(c);setSortDir("desc");}};
var holdingsVal=tv>0?tv:validH.reduce(function(s,x){return s+(parseFloat(x.shares)||0)*(parseFloat(x.avgCost)||0);},0);
var startVal=calcStartOv!==""?(parseFloat(calcStartOv.replace(/[,$]/g,""))||0):holdingsVal;
var cAv=parseFloat(calcReturn)||0,cMv=parseFloat(calcMonthly.replace(/[,$]/g,""))||0,cYv=parseInt(calcYears)||5,freqPY=calcFreq==="weekly"?52:calcFreq==="yearly"?1:12;
var proj=useMemo(function(){if(startVal<=0)return null;var rpp=Math.pow(1+cAv/100,1/freqPY)-1,months=cYv*12,showM=cYv<4;var data=[{month:0,label:"Now",portfolio:Math.round(startVal),contributed:Math.round(startVal),gains:0}];var pv=startVal,cum=startVal;for(var m=1;m<=months;m++){var ppm=freqPY/12;for(var pp=0;pp<ppm;pp++){pv=pv*(1+rpp)+cMv;cum+=cMv;}var yr=Math.floor(m/12),mo=m%12;data.push({month:m,label:showM?(mo===0?"Yr "+yr:(m%3===0?yr+"y"+mo+"m":"")):(mo===0?"Yr "+yr:""),portfolio:Math.round(pv),contributed:Math.round(cum),gains:Math.round(pv-cum)});}return{data:data,final:data[data.length-1]};},[startVal,cAv,cMv,cYv,freqPY]);
var riskIns=useMemo(function(){
if(!sc||!pos.length)return[];
var ins=[];
var sectors={};
pos.forEach(function(p){var s=p.sector||"Other";if(p.assetType==="Crypto"||p.assetType==="Cryptocurrency"||CRTK.indexOf(p.ticker)>-1)s="Cryptocurrency";if(!sectors[s])sectors[s]={value:0,tickers:[],beta:0,count:0};sectors[s].value+=p.value;sectors[s].tickers.push(p.ticker);sectors[s].beta+=(p.beta||1)*p.value;sectors[s].count++;});
Object.keys(sectors).forEach(function(s){sectors[s].pct=sectors[s].value/tv*100;sectors[s].avgBeta=sectors[s].beta/sectors[s].value;});
var sortedSec=Object.entries(sectors).sort(function(a,b){return b[1].value-a[1].value;});
// SECTOR-SPECIFIC RISK + MACRO
sortedSec.forEach(function(entry){
var name=entry[0],sec=entry[1];
if(sec.pct<3)return;
var risk="neutral",title="",text="",suggestion="";
if(name==="Technology"){
risk=sec.pct>35?"danger":sec.pct>20?"warning":"good";
title="Technology ("+sec.pct.toFixed(1)+"%)";
text=sec.tickers.join(", ")+". Tech faces multiple macro headwinds: Fed rate policy directly compresses P/E multiples on growth stocks, AI regulation from EU and US could limit revenue growth, and antitrust actions against mega-caps create headline risk. Tech earnings are also cyclically sensitive to enterprise spending slowdowns.";
suggestion=sec.pct>30?"REDUCE: Trim to under 30%. Rotate into Healthcare (defensive) or Industrials (infrastructure spending cycle). Consider equal-weighting tech positions rather than market-cap weighting.":"MONITOR: Current allocation is reasonable but watch for rate-driven multiple compression.";}
else if(name==="Cryptocurrency"){
risk=sec.pct>15?"danger":sec.pct>8?"warning":"neutral";
title="Cryptocurrency ("+sec.pct.toFixed(1)+"%)";
text=sec.tickers.join(", ")+". Crypto carries unique risks: no circuit breakers, 24/7 trading with overnight gaps, exchange counterparty risk (FTX precedent), regulatory crackdowns (SEC enforcement actions), stablecoin depegging events, and extreme correlation during liquidation cascades. Bitcoin halving cycles create 4-year boom/bust patterns.";
suggestion=sec.pct>15?"REDUCE: Trim to 10-15% max. Take profits on positions up >50%. Keep BTC/ETH as core, trim altcoins first. Consider a crypto ETF for regulated exposure.":"HOLD: Position size is manageable but set stop-losses. Never add on drawdowns above 5% portfolio weight.";}
else if(name==="Healthcare"){
risk="good";
title="Healthcare ("+sec.pct.toFixed(1)+"%)";
text=sec.tickers.join(", ")+". Healthcare is a defensive sector with inelastic demand. Aging demographics globally support long-term growth. Risks include drug pricing legislation, Medicare/Medicaid policy changes, patent cliffs on blockbuster drugs, and FDA approval uncertainty for biotech.";
suggestion=sec.pct<10?"INCREASE: Healthcare provides recession protection and demographic tailwinds. Consider adding JNJ, UNH, or XLV ETF.":"MAINTAIN: Good defensive allocation.";}
else if(name==="Financials"){
risk=sec.pct>25?"warning":"neutral";
title="Financials ("+sec.pct.toFixed(1)+"%)";
text=sec.tickers.join(", ")+". Financials are sensitive to the yield curve (inverted = compressed margins), credit cycle deterioration, commercial real estate exposure, and regulatory capital requirements. Regional bank risk remains elevated. Rising rates help net interest margins but increase loan default risk.";
suggestion=sec.pct<5?"ADD: Financials benefit from higher-for-longer rates. Consider JPM, BRK.B, or XLF for diversified exposure.":"MONITOR: Watch credit spreads and CRE delinquency rates as leading indicators.";}
else if(name==="Consumer Discretionary"){
risk=sec.pct>20?"warning":"neutral";
title="Consumer Discretionary ("+sec.pct.toFixed(1)+"%)";
text=sec.tickers.join(", ")+". Consumer spending is the primary macro risk here. Student loan repayments, credit card delinquency rates at decade highs, and savings rate depletion all pressure discretionary spending. TSLA specifically carries EV competition risk from Chinese manufacturers and margin pressure.";
suggestion="WATCH: Monitor consumer confidence index and retail sales data. If recession signals increase, rotate to Consumer Staples.";}
else if(name==="Energy"){
risk="neutral";
title="Energy ("+sec.pct.toFixed(1)+"%)";
text=sec.tickers.join(", ")+". Energy acts as an inflation hedge but faces geopolitical risk (OPEC+ decisions, sanctions), energy transition regulatory pressure, and commodity price volatility. Demand destruction risk in recession scenarios.";
suggestion=sec.pct<5?"ADD: Energy provides inflation protection your portfolio may lack. Consider XLE ETF or major integrated names like XOM.":"MAINTAIN: Good inflation hedge position.";}
else if(name==="Industrials"){
risk="neutral";
title="Industrials ("+sec.pct.toFixed(1)+"%)";
text=sec.tickers.join(", ")+". Industrials benefit from infrastructure spending bills and reshoring trends. Risks include PMI contraction, supply chain disruptions, and labor cost inflation. Cyclically sensitive to GDP growth.";
suggestion=sec.pct<5?"ADD: Infrastructure spending cycle supports multi-year growth. Consider CAT, HON, or XLI.":"MAINTAIN: Well positioned for infrastructure cycle.";}
else if(name==="Communication Services"){
risk=sec.pct>20?"warning":"neutral";
title="Communication Services ("+sec.pct.toFixed(1)+"%)";
text=sec.tickers.join(", ")+". Comms overlaps heavily with tech risk (GOOGL, META). Ad revenue is cyclically sensitive to economic slowdowns. Regulatory risk from content moderation laws and AI-generated content liability. Section 230 reform is a persistent overhang.";
suggestion="MONITOR: Treat as part of your tech allocation for concentration purposes.";}
else if(name==="Broad Market"||name==="Dividend Equity"){
risk="good";
title=name+" ("+sec.pct.toFixed(1)+"%)";
text=sec.tickers.join(", ")+". Index ETFs and dividend funds provide broad diversification and reduce single-stock risk. Low-cost, tax-efficient, and historically reliable. These positions anchor your portfolio.";
suggestion="MAINTAIN: Core holdings. Consider adding during market dips.";}
else if(name==="Commodities"){
risk="good";
title="Commodities ("+sec.pct.toFixed(1)+"%)";
text=sec.tickers.join(", ")+". Gold and commodities hedge against inflation, currency debasement, and geopolitical instability. Gold has zero counterparty risk. Commodities tend to outperform when stocks and bonds underperform.";
suggestion=sec.pct<5?"ADD: Increase to 5-10% for meaningful inflation protection.":"MAINTAIN: Good hedge position.";}
else{
title=name+" ("+sec.pct.toFixed(1)+"%)";
text=sec.tickers.join(", ")+".";
suggestion="REVIEW allocation.";}
ins.push({type:risk,title:title,text:text,suggestion:suggestion});
});
// MACRO OVERLAY
ins.push({type:"neutral",title:"Macro: Interest Rate Environment",text:"The Fed funds rate impacts every sector differently. Higher rates compress growth/tech multiples, benefit bank margins, hurt REITs and utilities, and strengthen the dollar (hurting international earnings). Your portfolio beta of "+sc.wb.toFixed(2)+" suggests "+(sc.wb>1.2?"above-average":"moderate")+" sensitivity to rate decisions.",suggestion:"If rates stay higher-for-longer: favor Financials, Energy, value over growth. If rate cuts come: growth/tech and REITs benefit most."});
ins.push({type:"neutral",title:"Macro: Recession Probability",text:"Leading indicators to watch: inverted yield curve duration, ISM PMI below 50, rising initial jobless claims, tightening lending standards. Your portfolio has "+(sc.n<15?"limited":"adequate")+" diversification with "+(sc.crypto>0.1?"significant":"modest")+" crypto exposure which has no recession playbook.",suggestion:"Build cash reserves (5-10%) to deploy during selloffs. Ensure at least 20% in defensive sectors (Healthcare, Staples, Utilities). Reduce leverage and speculative positions."});
ins.push({type:"neutral",title:"Macro: Geopolitical Risk",text:"Key risks: US-China trade tensions (chip export controls, Taiwan), Middle East energy supply disruption, Russia-Ukraine impact on European energy/food, and emerging market debt crises. These events cause sudden correlation spikes where all risk assets sell off simultaneously.",suggestion:"Gold and commodities hedge geopolitical shocks. Reduce single-country concentration. Consider some international diversification via VXUS or EFA."});
return ins;
},[sc,pos,tv,dy]);
var wheelT=useCallback(function(e){e.preventDefault();var len=pieDataT.length;if(!len)return;hap();setActiveT(function(prev){return prev===null?0:e.deltaY>0?(prev+1)%len:(prev-1+len)%len;});},[pieDataT.length]);
var wheelS=useCallback(function(e){e.preventDefault();var len=pieDataS.length;if(!len)return;hap();setActiveS(function(prev){return prev===null?0:e.deltaY>0?(prev+1)%len:(prev-1+len)%len;});},[pieDataS.length]);
var startTimer=function(){var start=Date.now();clearInterval(timerRef.current);timerRef.current=setInterval(function(){var s=((Date.now()-start)/1000).toFixed(1);setStatus(function(prev){if(!prev){clearInterval(timerRef.current);return"";}var pi=prev.indexOf(String.fromCharCode(32,40));return pi>-1?prev.slice(0,pi):prev+" ("+s+"s)";});},100);};
var liveOne=useCallback(async function(tk){setFetching(function(f){var n=Object.assign({},f);n[tk]=true;return n;});try{var yData=await fetchYahooQuote(tk);if(yData){var aiData=await enrichWithAI([tk]);var merged=Object.assign({},aiData[tk]||{},yData);var obj={};obj[tk]=merged;setEnriched(function(prev){return Object.assign({},prev,obj);});}else{var aiAll=await fetchPricesAIBatch([tk]);if(aiAll)setEnriched(function(prev){return Object.assign({},prev,aiAll);});}}catch(e){}setFetching(function(f){var n=Object.assign({},f);delete n[tk];return n;});},[]);
var loadAll=useCallback(async function(){
if(!validH.length)return;
setLoading({fetch:true});setErr("");
var tickers=Array.from(new Set(validH.map(function(x){return cT(x.ticker);})));
setStatus("Fetching prices from Yahoo Finance...");
try{
var yData=await fetchYahooBatch(tickers,function(done,total){setStatus("Yahoo Finance: "+done+"/"+total+" loaded...");});
if(yData){
var yCount=Object.keys(yData).length;
setStatus("Got "+yCount+" prices. Enriching with AI...");
var aiData=await enrichWithAI(tickers);
var merged={};
tickers.forEach(function(tk){
var y=yData[tk]||{};var a=aiData[tk]||{};
merged[tk]=Object.assign({},a,y);
if(a.sector&&!y.sector)merged[tk].sector=a.sector;
if(a.beta)merged[tk].beta=a.beta;
if(a.dividendYield)merged[tk].dividendYield=a.dividendYield;
if(a.annualDividendPerShare)merged[tk].annualDividendPerShare=a.annualDividendPerShare;
if(a.pe)merged[tk].pe=a.pe;
if(a.marketCap)merged[tk].marketCap=a.marketCap;
});
setEnriched(function(prev){return Object.assign({},prev,merged);});
var missing=tickers.filter(function(tk){return!yData[tk];});
if(missing.length>0){
setStatus("AI fallback for "+missing.length+" tickers...");
var fallback=await fetchPricesAIBatch(missing);
if(fallback)setEnriched(function(prev){return Object.assign({},prev,fallback);});
}
setStatus("Done: "+tickers.length+" tickers loaded");
}else{
setStatus("Yahoo unavailable. Using AI fallback...");
var aiAll=await fetchPricesAIBatch(tickers);
if(aiAll){
var aiEnrich=await enrichWithAI(tickers);
var merged2={};tickers.forEach(function(tk){merged2[tk]=Object.assign({},aiEnrich[tk]||{},aiAll[tk]||{});});
setEnriched(function(prev){return Object.assign({},prev,merged2);});
setStatus("Done: "+Object.keys(aiAll).length+" loaded via AI");
}else{setErr("Failed to load prices from Yahoo or AI");}
}
}catch(e){setErr(e.message);}
setTimeout(function(){setStatus("");},4000);
setLoading({});
},[validH]);
var doSave=useCallback(async function(){var name=saveName.trim()||("Portfolio "+new Date().toLocaleDateString());var key="pf:"+Date.now();await sSave(key,{name:name,holdings:holdings,savedAt:Date.now()});setSavedList(function(prev){return[{name:name,holdings:holdings,savedAt:Date.now(),key:key}].concat(prev);});setSaveName("");setShowSavePanel(false);},[saveName,holdings]);
var loadSaved=useCallback(function(item){setHoldings(item.holdings);nid.current=Math.max.apply(null,item.holdings.map(function(x){return x.id;}))+1;setEnriched({});setShowSavePanel(false);},[]);
var deleteSaved=useCallback(async function(item){await sDel(item.key);setSavedList(function(prev){return prev.filter(function(x){return x.key!==item.key;});});},[]);
var genRecs=useCallback(async function(){if(!pos.length||!tv)return;setLoading({recs:true});setErr("");try{var raw=await callAI([{role:"user",content:"Portfolio $"+tv.toFixed(0)+": "+JSON.stringify(pos.map(function(p){return{t:p.ticker,w:((p.value/tv)*100).toFixed(1)+"%",s:p.sector};}))+' JSON:[{"ticker":"X","action":"BUY|HOLD|TRIM|SELL","headline":"short","reasoning":"1 sent"}] Include PORTFOLIO-level entries.'}],"Terse JSON only. No markdown.");setRecs(parseJ(raw));}catch(e){setErr(e.message);}setLoading({});},[pos,tv]);
var rebalPool=tv+(parseFloat(cash)||0);
var genRebal=useCallback(async function(){if(!pos.length||!tv)return;setLoading({rebal:true});setErr("");try{var raw=await callAI([{role:"user",content:"Rebalance $"+rebalPool.toFixed(0)+": "+JSON.stringify(pos.map(function(p){return{t:p.ticker,w:((p.value/tv)*100).toFixed(1)+"%",s:p.sector};}))+' JSON:[{"ticker":"X","currentWeight":12,"targetWeight":10,"action":"TRIM","rationale":"short"}]'}],"Terse JSON only. No markdown.");var parsed=parseJ(raw);parsed=parsed.map(function(p){var found=pos.find(function(x){return x.ticker===p.ticker;});var cv=found?found.value:0;var tv2=(p.targetWeight/100)*rebalPool;return Object.assign({},p,{targetValue:tv2,dollarChange:tv2-cv,curVal:cv});});setRebal(parsed);}catch(e){setErr(e.message);}setLoading({});},[pos,tv,cash,rebalPool]);
var copyRebal=useCallback(function(){if(!rebal)return;setHoldings(rebal.map(function(r){var found=pos.find(function(x){return x.ticker===r.ticker;});var price=found?found.price:0;return{id:nid.current++,ticker:r.ticker,shares:price>0?((r.targetValue||0)/price).toFixed(4):"0",avgCost:price>0?price.toFixed(2):"0"};}));setTab("portfolio");},[rebal,pos]);
var chatCtx=useMemo(function(){if(!pos.length)return"";return fmt(Math.round(tv))+", Risk:"+(sc?sc.total.toFixed(0):"?")+". "+pos.map(function(p){return p.ticker+":$"+p.price.toFixed(0)+"("+((p.value/tv)*100).toFixed(0)+"%)";}).join(" ");},[pos,tv,sc]);
var sendChat=useCallback(async function(){if(!chatInput.trim()||chatLoading)return;var msg=chatInput.trim();setChatInput("");var next=chatMsgs.concat([{role:"user",content:msg}]);setChatMsgs(next);setChatLoading(true);try{var raw=await callAI(next.map(function(m){return{role:m.role,content:m.content};}),"Portfolio analyst. "+chatCtx+"\nBe concise.");setChatMsgs(function(prev){return prev.concat([{role:"assistant",content:raw}]);});}catch(e){setChatMsgs(function(prev){return prev.concat([{role:"assistant",content:"Error: "+e.message}]);});}setChatLoading(false);},[chatInput,chatMsgs,chatLoading,chatCtx]);
var copyBuild=useCallback(async function(){if(!chatMsgs.length||chatLoading)return;setChatLoading(true);try{var last="";for(var i=chatMsgs.length-1;i>=0;i--){if(chatMsgs[i].role==="assistant"){last=chatMsgs[i].content;break;}}var raw=await callAI([{role:"user",content:"Extract tickers: "+last+' JSON:[{"ticker":"AAPL","weight":25,"price":150}]'}],"JSON only.");var parsed=parseJ(raw);var total=tv>0?tv:10000;setHoldings(parsed.map(function(p){var val=(p.weight/100)*total;return{id:nid.current++,ticker:p.ticker.toUpperCase(),shares:p.price>0?(val/p.price).toFixed(4):"0",avgCost:p.price>0?p.price.toFixed(2):"0"};}));setTab("portfolio");}catch(e){setErr(e.message);}setChatLoading(false);},[chatMsgs,chatLoading,tv]);
var TI={portfolio:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,risk:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,recommendations:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17H9v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/></svg>,rebalancing:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="4 7 12 3 20 7"/></svg>,build:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,calculator:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/></svg>};
var TABS=[["portfolio","Holdings"],["risk","Risk"],["recommendations","AI Advice"],["build","AI Chat"],["rebalancing","Rebalance"],["calculator","Calculator"]];
var gCols=sm?"repeat(2,1fr)":mob?"repeat(3,1fr)":"repeat(5,1fr)",gCols6=sm?"repeat(2,1fr)":mob?"repeat(3,1fr)":"repeat(6,1fr)";
var winRate=computed.winRate,winCount=computed.winCount,totalCount=computed.totalCount;

return (<div style={{fontFamily:"Poppins,sans-serif",background:"#0a0e1a",minHeight:"100vh",color:"#e2e8f0"}}>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>{"@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}*{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:#1e3a5f transparent}input,button,select{font-family:inherit}button{transition:transform .15s ease;-webkit-tap-highlight-color:transparent}@media(hover:hover){button:hover{transform:scale(1.04)}}button:active{transform:scale(.97)}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:3px}.recharts-pie-sector{transition:opacity .3s ease}.recharts-sector{transition:all .3s cubic-bezier(.34,1.56,.64,1)} .refBtn:hover{color:#22c55e !important;border-color:#22c55e !important} .xBtn:hover{color:#ef4444 !important;border-color:#ef4444 !important}"}</style>
{/* HEADER */}
<div style={{borderBottom:"1px solid #1e293b",padding:mob?"0 12px":"0 24px"}}><div style={{maxWidth:1300,margin:"0 auto"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",height:mob?58:72}}>
<div style={{display:"flex",alignItems:"center",gap:mob?8:10}}>
<div style={{width:mob?30:42,height:mob?30:42,background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",borderRadius:mob?8:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width={mob?15:22} height={mob?15:22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg></div>
{sm?<div style={{fontSize:14,fontWeight:700,color:"#fff"}}>Portfolio</div>:<div style={{fontSize:mob?15:22,fontWeight:700,color:"#fff"}}>Portfolio Insights</div>}
{!mob&&<button onClick={function(){setShowDisclaimer(true);}} style={{background:"none",border:"1px solid #1e3a5f",borderRadius:5,padding:"3px 8px",cursor:"pointer",color:"#64748b",fontSize:9}}>Disclaimers</button>}
{!mob&&<button onClick={function(){setShowContact(true);}} style={{background:"none",border:"1px solid #1e3a5f",borderRadius:5,padding:"3px 8px",cursor:"pointer",color:"#64748b",fontSize:9}}>Contact</button>}
</div>
<div style={{display:"flex",alignItems:"center",gap:mob?10:16}}>
{mob&&<div style={{display:"flex",gap:6}}><button onClick={function(){setShowDisclaimer(true);}} style={{background:"none",border:"1px solid #1e3a5f",borderRadius:5,padding:"4px 6px",cursor:"pointer",color:"#64748b",fontSize:8}}>Terms</button><button onClick={function(){setShowContact(true);}} style={{background:"none",border:"1px solid #1e3a5f",borderRadius:5,padding:"4px 6px",cursor:"pointer",color:"#64748b",fontSize:8}}>Contact</button></div>}
<div style={{display:"flex",flexDirection:"column",alignItems:"center",marginTop:mob?10:18}}><div style={{fontSize:mob?20:28,fontWeight:700,color:sc?scColor:"#fff",lineHeight:1}}>{sc?sc.total.toFixed(1):"0"}</div><div style={{fontSize:mob?8:11,color:"#fff",fontWeight:600,marginTop:2}}>Risk Appetite</div>{sc&&<div style={{fontSize:mob?7:9,fontWeight:600,color:scColor,marginTop:1,textTransform:"uppercase"}}>{scLabel}</div>}</div>
</div></div></div>
<div style={{maxWidth:1300,margin:"0 auto",display:"flex",gap:0,overflowX:"auto",scrollbarWidth:"none"}}>{TABS.map(function(t){return <button key={t[0]} onClick={function(){setTab(t[0]);}} style={{background:"none",border:"none",color:tab===t[0]?"#3b82f6":"#94a3b8",fontSize:mob?11:13,fontWeight:tab===t[0]?600:500,padding:mob?"8px 12px":"10px 18px",cursor:"pointer",borderBottom:tab===t[0]?"2px solid #3b82f6":"2px solid transparent",whiteSpace:"nowrap",flexShrink:0,display:"flex",alignItems:"center",gap:5}}>{TI[t[0]]}{t[1]}</button>;})}</div></div>
<div style={{maxWidth:1300,margin:"0 auto",padding:mob?"12px":"20px 24px"}}>
{status&&<div style={{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 12px",marginBottom:12}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:7,height:7,borderRadius:"50%",background:"#3b82f6",animation:"pulse 1s infinite"}}/><span style={{fontSize:12,color:"#94a3b8"}}>{status}</span></div></div>}
{err&&<div style={{background:"#1c0f0f",border:"1px solid #7f1d1d",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#fca5a5"}}>{err}<button onClick={function(){setErr("");}} style={{background:"none",border:"none",color:"#fca5a5",cursor:"pointer",marginLeft:8}}>x</button></div>}
{/* HOLDINGS TAB */}
{tab==="portfolio"&&<div>
{hasData&&tv>0&&<div style={Object.assign({},cd,{marginBottom:14,position:"relative",overflow:"hidden"})}><div style={{position:"absolute",top:0,left:0,width:"50%",height:"100%",background:"radial-gradient(ellipse at top left, rgba(59,130,246,0.06) 0%, transparent 70%)",pointerEvents:"none"}}/><div style={{position:"absolute",bottom:0,right:0,width:"50%",height:"100%",background:"radial-gradient(ellipse at bottom right, rgba(139,92,246,0.05) 0%, transparent 70%)",pointerEvents:"none"}}/><div onClick={function(){setChartsOpen(!chartsOpen);}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",position:"relative"}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={ttl}>Allocation</div>{!chartsOpen&&<div style={{display:"flex",gap:6}}>{pieDataT.slice(0,5).map(function(d,i){return <div key={i} style={{width:8,height:8,borderRadius:"50%",background:d.color,boxShadow:"0 0 6px "+d.color+"66"}}/>;})}</div>}</div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" style={{transform:chartsOpen?"rotate(180deg)":"rotate(0deg)",transition:"transform .25s ease"}}><polyline points="6 9 12 15 18 9"/></svg></div>
{chartsOpen&&<div>
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:14,marginTop:14}}>
<div style={{position:"relative",overflow:"hidden",borderRadius:12,background:"rgba(15,23,42,0.6)",border:"1px solid rgba(30,58,95,0.5)",backdropFilter:"blur(12px)",padding:mob?10:16}}>
<div style={{position:"absolute",top:-20,left:-20,width:120,height:120,background:"radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)",pointerEvents:"none"}}/>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,position:"relative"}}><div style={{fontSize:14,fontWeight:600,color:"#fff"}}>By Ticker</div><div style={{fontSize:11,color:"#64748b"}}>{pos.length} positions</div></div>
<div onMouseLeave={function(){setActiveT(null);}} onWheel={wheelT} style={{position:"relative"}}><div style={{height:pieH}}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieDataT} dataKey="value" cx="50%" cy="50%" innerRadius={pieIn} outerRadius={pieOut} paddingAngle={2.5} stroke="none" onMouseEnter={function(_,i){if(activeT!==i)hap();setActiveT(i);}} onMouseLeave={function(){setActiveT(null);}} onClick={function(d){setFilterSector(null);setFilterTicker(filterTicker===d.name?null:d.name);}} label={renderLabel} labelLine={false} style={{cursor:"pointer",outline:"none"}} animationDuration={600}>{pieDataT.map(function(d,i){var act=activeT===i,dim=activeT!==null&&!act;return <Cell key={i} fill={d.color} opacity={filterTicker&&filterTicker!==d.name?0.15:dim?0.45:act?1:0.9}/>;})}</Pie>{activeT!=null&&pieDataT[activeT]?<g><text x="50%" y="44%" textAnchor="middle" style={{fontSize:17,fill:"#fff",fontWeight:700,fontFamily:"Poppins,sans-serif"}}>{pieDataT[activeT].name}</text><text x="50%" y="55%" textAnchor="middle" style={{fontSize:14,fill:pieDataT[activeT].color,fontWeight:700,fontFamily:"Poppins,sans-serif"}}>{pieDataT[activeT].pct}%</text><text x="50%" y="64%" textAnchor="middle" style={{fontSize:11,fill:"#64748b",fontFamily:"Poppins,sans-serif"}}>{fmt(pieDataT[activeT].value)}</text></g>:<g><text x="50%" y="47%" textAnchor="middle" style={{fontSize:16,fill:"#fff",fontWeight:700,fontFamily:"Poppins,sans-serif"}}>{fmt(Math.round(tv))}</text><text x="50%" y="56%" textAnchor="middle" style={{fontSize:12,fill:"#64748b",fontFamily:"Poppins,sans-serif"}}>{pos.length} tickers</text></g>}</PieChart></ResponsiveContainer></div></div>
<div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10,position:"relative"}}>{pieDataT.slice(0,6).map(function(d,i){return <div key={i} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:"6px 10px",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,borderRadius:"50%",background:d.color,boxShadow:"0 0 8px "+d.color+"88",flexShrink:0}}/><span style={{fontSize:11,color:"#e2e8f0",fontWeight:600}}>{d.name}</span><span style={{fontSize:10,color:"#64748b"}}>{d.pct}%</span></div>;})}{pieDataT.length>6&&<div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:"6px 10px",fontSize:10,color:"#64748b"}}>+{pieDataT.length-6} more</div>}</div>
</div>
<div style={{position:"relative",overflow:"hidden",borderRadius:12,background:"rgba(15,23,42,0.6)",border:"1px solid rgba(30,58,95,0.5)",backdropFilter:"blur(12px)",padding:mob?10:16}}>
<div style={{position:"absolute",bottom:-20,right:-20,width:120,height:120,background:"radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)",pointerEvents:"none"}}/>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,position:"relative"}}><div style={{fontSize:14,fontWeight:600,color:"#fff"}}>By Sector</div><div style={{fontSize:11,color:"#64748b"}}>{pieDataS.length} sectors</div></div>
<div onMouseLeave={function(){setActiveS(null);}} onWheel={wheelS} style={{position:"relative"}}><div style={{height:pieH}}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieDataS} dataKey="value" cx="50%" cy="50%" innerRadius={pieIn} outerRadius={pieOut} paddingAngle={2.5} stroke="none" onMouseEnter={function(_,i){if(activeS!==i)hap();setActiveS(i);}} onMouseLeave={function(){setActiveS(null);}} onClick={function(d){setFilterTicker(null);setFilterSector(filterSector===d.name?null:d.name);}} label={renderLabel} labelLine={false} style={{cursor:"pointer",outline:"none"}} animationBegin={200} animationDuration={600}>{pieDataS.map(function(d,i){var act=activeS===i,dim=activeS!==null&&!act;return <Cell key={i} fill={d.color} opacity={filterSector&&filterSector!==d.name?0.15:dim?0.45:act?1:0.9}/>;})}</Pie>{activeS!=null&&pieDataS[activeS]?<g><text x="50%" y="44%" textAnchor="middle" style={{fontSize:15,fill:"#fff",fontWeight:700,fontFamily:"Poppins,sans-serif"}}>{pieDataS[activeS].name}</text><text x="50%" y="55%" textAnchor="middle" style={{fontSize:14,fill:pieDataS[activeS].color,fontWeight:700,fontFamily:"Poppins,sans-serif"}}>{pieDataS[activeS].pct}%</text><text x="50%" y="64%" textAnchor="middle" style={{fontSize:11,fill:"#64748b",fontFamily:"Poppins,sans-serif"}}>{fmt(pieDataS[activeS].value)}</text></g>:<g><text x="50%" y="47%" textAnchor="middle" style={{fontSize:16,fill:"#fff",fontWeight:700,fontFamily:"Poppins,sans-serif"}}>{pieDataS.length}</text><text x="50%" y="56%" textAnchor="middle" style={{fontSize:12,fill:"#64748b",fontFamily:"Poppins,sans-serif"}}>sectors</text></g>}</PieChart></ResponsiveContainer></div></div>
<div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10,position:"relative"}}>{pieDataS.map(function(d,i){return <div key={i} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,padding:"6px 10px",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,borderRadius:"50%",background:d.color,boxShadow:"0 0 8px "+d.color+"88",flexShrink:0}}/><span style={{fontSize:11,color:"#e2e8f0",fontWeight:600}}>{d.name}</span><span style={{fontSize:10,color:"#64748b"}}>{d.pct}%</span></div>;})}</div>
</div>
</div>
{sc&&<div style={{display:"grid",gridTemplateColumns:sm?"1fr 1fr":mob?"repeat(3,1fr)":"repeat(5,1fr)",gap:8,marginTop:12}}>{[{l:"Portfolio Beta",v:sc.wb.toFixed(2),c:sc.wb>1.3?"#f59e0b":"#22c55e",icon:"B"},{l:"Top 3 Weight",v:(sc.top3*100).toFixed(1)+"%",c:sc.top3>0.5?"#f59e0b":"#22c55e",icon:"3"},{l:"Crypto Exp.",v:(sc.crypto*100).toFixed(1)+"%",c:sc.crypto>0.15?"#ef4444":"#22c55e",icon:"C"},{l:"Tech+Growth",v:(sc.techPct*100).toFixed(0)+"%",c:sc.techPct>0.35?"#f59e0b":"#22c55e",icon:"T"},{l:"Positions",v:String(sc.n),c:sc.n<8?"#f59e0b":"#22c55e",icon:"#"}].map(function(m){return <div key={m.l} style={{position:"relative",overflow:"hidden",borderRadius:10,background:"rgba(15,23,42,0.6)",border:"1px solid rgba(30,58,95,0.4)",backdropFilter:"blur(8px)",padding:"12px 14px"}}><div style={{position:"absolute",top:-10,right:-10,width:50,height:50,background:"radial-gradient(circle, "+m.c+"0D 0%, transparent 70%)",pointerEvents:"none"}}/><div style={{fontSize:9,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".08em",fontWeight:600,marginBottom:6}}>{m.l}</div><div style={{fontSize:mob?16:20,fontWeight:700,color:m.c}}>{m.v}</div></div>;})}</div>}
</div>}</div>}
{/* 6 STAT TILES */}
{tv>0&&<div style={{display:"grid",gridTemplateColumns:gCols6,gap:10,marginBottom:14}}>
<div style={sCard}><div style={lbl}>Total Value</div><div style={vlS("#fff")}>{fmt(Math.round(tv))}</div></div>
<div style={sCard}><div style={lbl}>Total Cost</div><div style={vlS("#94a3b8")}>{fmt(Math.round(tc))}</div></div>
<div style={Object.assign({},sCard,{cursor:"pointer"})} onClick={function(){setGlMode(glMode==="pct"?"dollar":"pct");}}><div style={Object.assign({},lbl,{display:"flex",justifyContent:"space-between",alignItems:"center"})}>Gain/Loss <div style={{display:"flex",borderRadius:5,overflow:"hidden",border:"1px solid #1e3a5f"}}><div style={{padding:"3px 10px",fontSize:11,fontWeight:600,background:glMode==="pct"?"#1d4ed8":"transparent",color:"#fff"}}>%</div><div style={{padding:"3px 10px",fontSize:11,fontWeight:600,background:glMode==="dollar"?"#1d4ed8":"transparent",color:"#fff"}}>$</div></div></div><div style={vlS(tv>=tc?"#22c55e":"#ef4444")}>{glMode==="pct"?((tv-tc>=0?"+":"")+((tv-tc)/tc*100).toFixed(1)+"%"):((tv-tc>=0?"+":"")+fmt(Math.round(Math.abs(tv-tc))))}</div></div>
<div style={Object.assign({},sCard,{cursor:"pointer"})} onClick={function(){setDivMode(divMode==="pct"?"dollar":"pct");}}><div style={Object.assign({},lbl,{display:"flex",justifyContent:"space-between",alignItems:"center"})}>Dividend <div style={{display:"flex",borderRadius:5,overflow:"hidden",border:"1px solid #1e3a5f"}}><div style={{padding:"3px 10px",fontSize:11,fontWeight:600,background:divMode==="pct"?"#1d4ed8":"transparent",color:"#fff"}}>%</div><div style={{padding:"3px 10px",fontSize:11,fontWeight:600,background:divMode==="dollar"?"#1d4ed8":"transparent",color:"#fff"}}>$</div></div></div><div style={vlS("#a78bfa")}>{divMode==="pct"?dy.toFixed(2)+"%":fmt(Math.round(tv*dy/100))+"/yr"}</div></div>
<div style={sCard}><div style={lbl}>P/E Ratio</div><div style={vlS(wpe<=0?"#fff":wpe<15?"#22c55e":wpe<25?"#f59e0b":wpe<35?"#f97316":"#ef4444")}>{wpe>0?wpe.toFixed(1):"--"}</div></div>
<div style={sCard}><div style={lbl}>Win Rate</div><div style={vlS(winRate<=0?"#fff":winRate>=75?"#22c55e":winRate>=50?"#f59e0b":"#ef4444")}>{totalCount>0?winRate+"%":"--"}</div></div>
</div>}
{/* HOLDINGS TABLE */}
<div style={cd}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
<div style={{display:"flex",alignItems:"center",gap:10}}><div style={ttl}>Holdings <span style={{fontSize:mob?14:16,fontWeight:400,color:"#94a3b8"}}>({holdings.length})</span></div>{(filterTicker||filterSector)&&<button onClick={function(){setFilterTicker(null);setFilterSector(null);}} style={{background:"rgba(59,130,246,.15)",color:"#3b82f6",border:"none",borderRadius:4,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>Showing: {filterTicker||filterSector} x</button>}</div>
<div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button style={gS(true)} onClick={function(){setHoldings(function(h){return h.concat([{id:nid.current++,ticker:"",shares:"",avgCost:""}]);});}}>+ Add</button><button style={gS(true)} onClick={function(){setShowSavePanel(!showSavePanel);}}>{showSavePanel?"Close":"Save/Load"}</button><button style={bS(!isBusy&&validH.length>0)} disabled={isBusy||!validH.length} onClick={loadAll} onTouchEnd={function(e){e.preventDefault();if(!isBusy&&validH.length>0)loadAll();}}>{loading.fetch?<span style={{display:"flex",alignItems:"center",gap:5}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{animation:"spin 1s linear infinite"}}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Loading...</span>:"Load Prices"}</button></div></div>
{showSavePanel&&<div style={{background:"#0a0e1a",border:"1px solid #1e3a5f",borderRadius:8,padding:14,marginBottom:14}}><div style={{display:"flex",gap:8,marginBottom:12}}><input value={saveName} onChange={function(e){setSaveName(e.target.value);}} placeholder="Name..." style={Object.assign({},inp,{flex:1,textAlign:"left"})}/><button style={bS(true)} onClick={doSave}>Save</button></div>{savedList.map(function(item,i){return <div key={item.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderTop:i>0?"1px solid #1e293b":"none"}}><div style={{fontSize:12,color:"#e2e8f0"}}>{item.name}</div><div style={{display:"flex",gap:6}}><button onClick={function(){loadSaved(item);}} style={Object.assign({},gS(true),{padding:"6px 12px",fontSize:11})}>Load</button><button onClick={function(){deleteSaved(item);}} style={{background:"#0f172a",border:"1px solid #1e3a5f",borderRadius:5,padding:"6px 10px",color:"#3b82f6",fontSize:11,cursor:"pointer"}}>x</button></div></div>;})}</div>}
<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}><thead><tr>{["Ticker","Name","Shares","Cost","Price","Value","G/L%","Wt%","Type","Sector","Beta","Div",""].map(function(hh){return <th key={hh} onClick={function(){toggleSort(hh);}} style={Object.assign({},thd,hh?{cursor:"pointer",userSelect:"none"}:{})}>{hh}{sortCol===hh?<span style={{marginLeft:4,fontSize:8,opacity:0.7}}>{sortDir==="asc"?" ^":" v"}</span>:""}</th>;})}</tr></thead>
<tbody>{sortH.map(function(hh){var tk=cT(hh.ticker),e=enriched[tk]||{},price=e.currentPrice||0,v2=price*parseFloat(hh.shares||0),gl2=hh.avgCost&&price?((price-parseFloat(hh.avgCost))/parseFloat(hh.avgCost))*100:0,wt=tv?(v2/tv)*100:0,isCr=e.assetType==="Crypto"||e.assetType==="Cryptocurrency"||e.sector==="Cryptocurrency"||CRTK.indexOf(tk)>-1,isF=!!fetching[tk];return <tr key={hh.id}><td style={tdd}><input value={hh.ticker} onChange={function(ev){setHoldings(function(hs){return hs.map(function(x){return x.id===hh.id?Object.assign({},x,{ticker:ev.target.value.toUpperCase()}):x;});});}} placeholder="AAPL" style={Object.assign({},inp,{width:68,fontWeight:600,color:"#60a5fa"})}/></td><td style={Object.assign({},tdd,{color:"#94a3b8",fontSize:11})}>{isF?"...":e.companyName||"--"}</td><td style={tdd}><input value={hh.shares} onChange={function(ev){setHoldings(function(hs){return hs.map(function(x){return x.id===hh.id?Object.assign({},x,{shares:ev.target.value}):x;});});}} style={Object.assign({},inp,{width:60})}/></td><td style={tdd}><input value={hh.avgCost} onChange={function(ev){setHoldings(function(hs){return hs.map(function(x){return x.id===hh.id?Object.assign({},x,{avgCost:ev.target.value}):x;});});}} style={Object.assign({},inp,{width:74})}/></td><td style={Object.assign({},tdd,{color:"#fff",fontWeight:500})}>{price?"$"+price.toFixed(2):"--"}</td><td style={Object.assign({},tdd,{fontWeight:600})}>{v2?fmt(Math.round(v2)):"--"}</td><td style={Object.assign({},tdd,{color:gl2>=0?"#22c55e":"#ef4444",fontWeight:500})}>{price&&hh.avgCost?(gl2>=0?"+":"")+gl2.toFixed(1)+"%":"--"}</td><td style={Object.assign({},tdd,{color:"#cbd5e1"})}>{wt?wt.toFixed(1)+"%":"--"}</td><td style={tdd}>{e.assetType?<span style={tgF(isCr?"rgba(124,58,237,.2)":"rgba(59,130,246,.12)",isCr?"#a78bfa":"#60a5fa")}>{e.assetType}</span>:"--"}</td><td style={Object.assign({},tdd,{color:"#94a3b8",fontSize:11})}>{e.sector||"--"}</td><td style={tdd}>{e.beta!=null?e.beta.toFixed(2):"--"}</td><td style={Object.assign({},tdd,{color:"#a78bfa"})}>{e.dividendYield!=null?e.dividendYield.toFixed(2)+"%":"--"}</td><td style={tdd}><button onClick={function(){if(tk&&!isF)liveOne(tk);}} className="refBtn" style={{background:"#0f172a",color:"#3b82f6",border:"1px solid #1e3a5f",borderRadius:5,padding:"6px 10px",cursor:"pointer",fontSize:12}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button><button onClick={function(){setHoldings(function(hs){return hs.filter(function(x){return x.id!==hh.id;});});}} className="xBtn" style={{background:"#0f172a",color:"#3b82f6",border:"1px solid #1e3a5f",borderRadius:5,padding:"6px 10px",cursor:"pointer",fontSize:12,marginLeft:4}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td></tr>;})}</tbody></table></div></div></div>}
{/* RISK TAB */}
{tab==="risk"&&<div>{!sc?<div style={Object.assign({},cd,{textAlign:"center",padding:48,color:"#64748b"})}>Load data first.</div>:<div>
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 2fr",gap:14,marginBottom:14}}><div style={Object.assign({},cd,{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,padding:24})}><div style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>Risk Appetite</div><div style={{fontSize:mob?48:60,fontWeight:700,color:scColor,lineHeight:1}}>{sc.total.toFixed(1)}</div><div style={{fontSize:11,color:"#64748b"}}>/100 higher = riskier</div><span style={tgF(scColor+"22",scColor)}>{scLabel}</span></div>
<div style={cd}><div style={ttl}>Score Breakdown</div><div style={{marginTop:14}}>{[{l:"Beta",s:sc.s1,d:"="+sc.wb.toFixed(2)},{l:"Concentration",s:sc.s2,d:"Top3="+(sc.top3*100).toFixed(1)+"%"},{l:"Crypto",s:sc.s3,d:(sc.crypto*100).toFixed(1)+"%"},{l:"Diversification",s:sc.s4,d:sc.n+" pos"},{l:"VaR",s:sc.s5,d:"99%"},{l:"Tech/Growth",s:sc.s6,d:(sc.techPct*100).toFixed(1)+"%"}].map(function(f){return <div key={f.l} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:11,color:"#cbd5e1"}}>{f.l}</span><span style={{fontSize:11,color:"#fff",fontWeight:600}}>{f.s.toFixed(1)}/{f.mx||20} <span style={{color:"#64748b"}}>{f.d}</span></span></div><div style={{height:6,background:"#1e293b",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:(f.s/20*100)+"%",background:f.s<7?"#22c55e":f.s<14?"#f59e0b":"#ef4444",borderRadius:3}}/></div></div>;})}</div></div></div>
<div style={{display:"grid",gridTemplateColumns:gCols,gap:10,marginBottom:14}}>{[{l:"Beta",v:sc.wb.toFixed(2),c:sc.wb>1.3?"#f59e0b":"#22c55e"},{l:"Top 3",v:(sc.top3*100).toFixed(1)+"%",c:sc.top3>0.5?"#f59e0b":"#22c55e"},{l:"Crypto",v:(sc.crypto*100).toFixed(1)+"%",c:sc.crypto>0.2?"#ef4444":"#22c55e"},{l:"Positions",v:sc.n,c:sc.n<10?"#f59e0b":"#22c55e"},{l:"Div Income",v:fmt(Math.round(tv*dy/100))+"/yr",c:"#a78bfa"}].map(function(m){return <div key={m.l} style={sCard}><div style={lbl}>{m.l}</div><div style={vlS(m.c)}>{m.v}</div></div>;})}</div>
{riskIns.length>0&&<div>
<div style={Object.assign({},cd,{marginBottom:14})}><div style={ttl}>Sector Risk Analysis</div><div style={{fontSize:11,color:"#64748b",marginTop:2,marginBottom:14}}>Risk assessment by sector with macro context and actionable suggestions</div>
{riskIns.filter(function(ins){return ins.title.indexOf("Macro")===-1;}).map(function(ins,i){var ac2=ins.type==="danger"?"#ef4444":ins.type==="warning"?"#f59e0b":ins.type==="neutral"?"#3b82f6":"#22c55e";return <div key={i} style={{padding:"16px 18px",borderRadius:10,marginBottom:12,background:"#0a0e1a",border:"1px solid #1e293b",borderLeft:"4px solid "+ac2}}>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:8,height:8,borderRadius:"50%",background:ac2,boxShadow:"0 0 8px "+ac2+"66",flexShrink:0}}/><div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{ins.title}</div></div><span style={{fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:4,background:ac2+"22",color:ac2,textTransform:"uppercase"}}>{ins.type==="danger"?"HIGH RISK":ins.type==="warning"?"MODERATE RISK":ins.type==="neutral"?"MONITOR":"LOW RISK"}</span></div>
<div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.8,marginBottom:10}}>{ins.text}</div>
{ins.suggestion&&<div style={{fontSize:12,color:"#94a3b8",lineHeight:1.7,padding:"10px 14px",background:"rgba(59,130,246,0.06)",borderRadius:8,border:"1px solid rgba(59,130,246,0.15)"}}><span style={{color:"#60a5fa",fontWeight:700,marginRight:6}}>ACTION:</span>{ins.suggestion}</div>}
</div>;})}
</div>
<div style={Object.assign({},cd,{marginBottom:14})}><div style={ttl}>Macroeconomic Risk Factors</div><div style={{fontSize:11,color:"#64748b",marginTop:2,marginBottom:14}}>External forces that could impact your portfolio</div>
{riskIns.filter(function(ins){return ins.title.indexOf("Macro")>-1;}).map(function(ins,i){return <div key={i} style={{padding:"16px 18px",borderRadius:10,marginBottom:12,background:"#0a0e1a",border:"1px solid #1e293b",borderLeft:"4px solid #3b82f6"}}>
<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{ins.title.replace("Macro: ","")}</div></div>
<div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.8,marginBottom:10}}>{ins.text}</div>
{ins.suggestion&&<div style={{fontSize:12,color:"#94a3b8",lineHeight:1.7,padding:"10px 14px",background:"rgba(59,130,246,0.06)",borderRadius:8,border:"1px solid rgba(59,130,246,0.15)"}}><span style={{color:"#60a5fa",fontWeight:700,marginRight:6}}>STRATEGY:</span>{ins.suggestion}</div>}
</div>;})}
</div>
</div>}
</div>}
<div style={Object.assign({},cd,{marginBottom:14})}><div style={ttl}>Scenario Analysis</div><div style={{fontSize:11,color:"#64748b",marginTop:2,marginBottom:14}}>What happens to your portfolio under these macro scenarios</div>
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(2,1fr)",gap:12}}>
{[
{name:"Recession 2025-26",icon:"#ef4444",impact:-(sc.wb*22+sc.techPct*12),desc:"GDP contracts, unemployment rises above 5%, consumer spending falls 8-12%. Fed cuts aggressively but damage is done.",effects:"Tech earnings fall 15-25% as enterprise budgets freeze. Consumer Discretionary hit hardest. Crypto drops 40-60% as risk assets deleverage. Healthcare and Staples outperform. Your "+(sc.crypto>0.05?"crypto exposure amplifies losses.":"portfolio is somewhat insulated.")},
{name:"No Fed Rate Cuts",icon:"#f59e0b",impact:-(sc.wb*10+sc.techPct*18),desc:"Inflation stays sticky above 3%, Fed holds rates at 5%+ through 2026. Higher-for-longer becomes the new normal.",effects:"Growth stock P/E multiples compress 15-20%. Mortgage rates stay elevated crushing housing. Banks benefit from net interest margins. Your tech/growth at "+(sc.techPct*100).toFixed(0)+"% takes the biggest hit. Rotate toward value, dividends, and short-duration."},
{name:"Crypto Winter",icon:"#a78bfa",impact:-(sc.crypto*65),desc:"Major exchange failure or SEC crackdown triggers 60-80% crypto drawdown. Altcoins lose 80-95%. Contagion spreads to crypto-adjacent stocks.",effects:"BTC falls to $15-20k, ETH below $800, altcoins near zero. Your "+(sc.crypto*100).toFixed(1)+"% crypto allocation loses "+fmt(Math.round(tv*sc.crypto*0.65))+". "+(sc.crypto>0.15?"This significantly damages total portfolio. Consider trimming to 10% max.":"Impact is contained at current allocation.")},
{name:"Tech Antitrust Breakup",icon:"#f97316",impact:-(sc.techPct*25),desc:"DOJ/FTC forces structural remedies on mega-cap tech. Cloud, advertising, and hardware businesses separated.",effects:"GOOGL, AMZN, AAPL, META face 20-30% repricing on uncertainty. Sum-of-parts may eventually be worth more, but 12-18 months of volatility. Your tech exposure of "+(sc.techPct*100).toFixed(0)+"% means a "+(sc.techPct*25).toFixed(1)+"% portfolio hit."},
{name:"Global Energy Crisis",icon:"#ef4444",impact:-(sc.wb*15),desc:"Middle East conflict disrupts oil supply. Oil spikes to $150+. European energy crisis 2.0.",effects:"Energy stocks surge 40-60%. Everything else sells off on recession fears. Inflation spikes, Fed forced to hike. "+(pos.some(function(p){return p.sector==="Energy"||p.sector==="Commodities";})?"Your energy/commodity positions provide some hedge.":"You have NO energy hedge. Add XLE or commodity exposure urgently.")},
{name:"Soft Landing Bull Case",icon:"#22c55e",impact:sc.wb*15+sc.techPct*8,desc:"Inflation normalizes to 2%, Fed cuts 100-150bps, GDP grows 2-3%, unemployment stays below 4.5%.",effects:"All risk assets rally. Tech and growth lead with 20-30% upside. Crypto could double. Your portfolio with beta "+(sc.wb).toFixed(2)+" would gain ~"+(sc.wb*15+sc.techPct*8).toFixed(0)+"%. Current positioning benefits significantly from this outcome."}
].map(function(s){var loss=Math.round(tv*Math.abs(s.impact)/100);var isGain=s.impact>0;return <div key={s.name} style={{background:"#0a0e1a",border:"1px solid #1e293b",borderRadius:10,padding:"18px 20px",borderTop:"3px solid "+s.icon}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
<div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{s.name}</div>
<div style={{textAlign:"right"}}><div style={{fontSize:20,fontWeight:700,color:isGain?"#22c55e":s.icon}}>{isGain?"+":""}{s.impact.toFixed(1)}%</div><div style={{fontSize:11,color:"#94a3b8"}}>{isGain?"+":"-"}{fmt(loss)}</div></div>
</div>
<div style={{fontSize:11,color:"#64748b",marginBottom:8,lineHeight:1.6}}>{s.desc}</div>
<div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.8}}>{s.effects}</div>
</div>;})}
</div></div></div>}
{/* AI ADVICE TAB */}
{tab==="recommendations"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={ttl}>AI Recommendations</div><button style={bS(!loading.recs&&hasData)} disabled={loading.recs||!hasData} onClick={genRecs}>{loading.recs?"Analyzing...":"Generate"}</button></div>
{!recs?<div style={Object.assign({},cd,{textAlign:"center",padding:48,color:"#64748b"})}>{hasData?"Click Generate":"Load first"}</div>:<div style={{display:"grid",gap:10}}>{recs.filter(function(r){return r.ticker==="PORTFOLIO";}).map(function(r,i){return <div key={i} style={Object.assign({},cd,{borderLeft:"3px solid "+(AC[r.action]||"#64748b")})}><div style={{display:"flex",gap:6,marginBottom:8}}><span style={tgF("#1e3a5f","#60a5fa")}>PORTFOLIO</span><span style={tgF((AC[r.action]||"#64748b")+"22",AC[r.action]||"#64748b")}>{r.action}</span></div><div style={{fontSize:13,fontWeight:600,color:"#fff",marginBottom:6}}>{r.headline}</div><div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.6}}>{r.reasoning}</div></div>;})}<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:10}}>{recs.filter(function(r){return r.ticker!=="PORTFOLIO";}).map(function(r,i){return <div key={i} style={Object.assign({},cd,{borderLeft:"3px solid "+(AC[r.action]||"#64748b")})}><div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontSize:15,fontWeight:700,color:"#60a5fa"}}>{r.ticker}</span><span style={tgF((AC[r.action]||"#64748b")+"22",AC[r.action]||"#64748b")}>{r.action}</span></div><div style={{fontSize:12,fontWeight:600,color:"#fff",marginBottom:4}}>{r.headline}</div><div style={{fontSize:11,color:"#94a3b8",lineHeight:1.6}}>{r.reasoning}</div></div>;})}</div></div>}</div>}
{/* AI CHAT TAB */}
{tab==="build"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}><div><div style={ttl}>AI Portfolio Assistant</div><div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>Ask about holdings, risk, or build portfolios</div></div>{chatMsgs.length>0&&<button style={cpB} onClick={copyBuild} disabled={chatLoading}>Copy to Holdings</button>}</div>
<div style={Object.assign({},cd,{display:"flex",flexDirection:"column",height:mob?"calc(100vh - 200px)":"calc(100vh - 240px)",minHeight:300})}><div style={{flex:1,overflowY:"auto",marginBottom:10}}>
{chatMsgs.length===0&&<div style={{textAlign:"center",padding:"30px 16px",color:"#475569"}}><div style={{fontSize:15,fontWeight:600,color:"#64748b",marginBottom:12}}>What can I help with?</div><div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",maxWidth:500,margin:"0 auto"}}>{["Why is my risk score high?","Which positions to trim?","Too concentrated in tech?","Build $50k growth portfolio","Dividend income this year?","20% market drop impact?"].map(function(q){return <button key={q} onClick={function(){setChatInput(q);}} style={{background:"#0a0e1a",border:"1px solid #1e293b",borderRadius:8,padding:"8px 12px",color:"#94a3b8",fontSize:11,cursor:"pointer",textAlign:"left"}}>{q}</button>;})}</div></div>}
{chatMsgs.map(function(m,i){return <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:8}}><div style={{maxWidth:"80%",padding:"10px 14px",borderRadius:12,background:m.role==="user"?"#1d4ed8":"#1e293b",color:"#fff",fontSize:13,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{m.content}</div></div>;})}
{chatLoading&&<div style={{display:"flex",marginBottom:8}}><div style={{background:"#1e293b",padding:"10px 14px",borderRadius:12,display:"flex",gap:4}}>{[0,1,2].map(function(i){return <div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#3b82f6",animation:"pulse 1.4s "+(i*.2)+"s infinite"}}/>;})}</div></div>}
<div ref={chatEndRef}/></div>
<div style={{display:"flex",gap:8}}><input value={chatInput} onChange={function(e){setChatInput(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter"){e.preventDefault();sendChat();}}} placeholder="Ask about your portfolio..." style={Object.assign({},inp,{flex:1,padding:"12px",borderRadius:10,textAlign:"left"})}/><button onClick={sendChat} disabled={chatLoading||!chatInput.trim()} style={Object.assign({},bS(!chatLoading&&chatInput.trim()),{borderRadius:10,padding:"12px 20px"})}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button></div></div></div>}
{/* REBALANCE TAB */}
{tab==="rebalancing"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}><div style={ttl}>AI Rebalancing</div><div style={{display:"flex",gap:8,alignItems:"center"}}><div><div style={fld}>Cash ($)</div><input value={cash} onChange={function(e){setCash(e.target.value);}} style={Object.assign({},inp,{width:100})}/></div><button style={Object.assign({},bS(!loading.rebal&&hasData),{marginTop:18})} disabled={loading.rebal||!hasData} onClick={genRebal}>{loading.rebal?"...":"Plan"}</button></div></div>
{!rebal?<div style={Object.assign({},cd,{textAlign:"center",padding:48,color:"#64748b"})}>{hasData?"Click Plan":"Load first"}</div>:<div><div style={{marginBottom:12}}><button style={cpB} onClick={copyRebal}>Copy to Holdings</button></div><div style={cd}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}><thead><tr>{["Ticker","Current $","Cur%","Target%","Target $","Change","Action","Why"].map(function(hh){return <th key={hh} style={thd}>{hh}</th>;})}</tr></thead><tbody>{rebal.map(function(r,i){return <tr key={i}><td style={Object.assign({},tdd,{color:"#60a5fa",fontWeight:600})}>{r.ticker}</td><td style={tdd}>{fmt(Math.round(r.curVal||0))}</td><td style={Object.assign({},tdd,{color:"#94a3b8"})}>{(r.currentWeight||0).toFixed(1)}%</td><td style={Object.assign({},tdd,{color:"#fff",fontWeight:600})}>{(r.targetWeight||0).toFixed(1)}%</td><td style={Object.assign({},tdd,{fontWeight:600})}>{fmt(Math.round(r.targetValue||0))}</td><td style={Object.assign({},tdd,{color:r.dollarChange>=0?"#22c55e":"#ef4444",fontWeight:600})}>{(r.dollarChange>=0?"+":"")+fmt(Math.round(r.dollarChange||0))}</td><td style={tdd}><span style={tgF((AC[r.action]||"#64748b")+"22",AC[r.action]||"#64748b")}>{r.action}</span></td><td style={Object.assign({},tdd,{color:"#94a3b8",fontSize:11,whiteSpace:"normal",minWidth:100})}>{r.rationale}</td></tr>;})}</tbody></table></div></div></div>}</div>}
{/* CALCULATOR TAB */}
{tab==="calculator"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={ttl}>Growth Calculator</div><button onClick={function(){setCalcMonthly("500");setCalcYears("10");setCalcReturn("10");setCalcFreq("monthly");setCalcStartOv("");}} style={Object.assign({},gS(true),{padding:"6px 14px",fontSize:11})}>Reset</button></div>
<div style={Object.assign({},cd,{marginTop:14,marginBottom:14,display:"flex",gap:mob?12:20,alignItems:"flex-end",flexWrap:"wrap"})}>
<div><div style={fld}>Starting ($)</div><input value={calcStartOv!==""?calcStartOv:fmt(Math.round(holdingsVal))} onChange={function(e){setCalcStartOv(e.target.value.replace(/[^0-9.]/g,""));}} onFocus={function(){if(calcStartOv==="")setCalcStartOv(String(Math.round(holdingsVal)));}} style={Object.assign({},inp,{width:140})}/></div>
<div><div style={fld}>Contribution ($)</div><input value={calcMonthly} onChange={function(e){setCalcMonthly(e.target.value.replace(/[^0-9.]/g,""));}} style={Object.assign({},inp,{width:120})}/></div>
<div><div style={fld}>Frequency</div><select value={calcFreq} onChange={function(e){setCalcFreq(e.target.value);}} style={sel}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></div>
<div><div style={fld}>Return (%/yr)</div><input value={calcReturn} onChange={function(e){setCalcReturn(e.target.value);}} style={Object.assign({},inp,{width:80})}/></div>
<div><div style={fld}>Years</div><select value={calcYears} onChange={function(e){setCalcYears(e.target.value);}} style={sel}>{[1,2,3,5,7,10,15,20,25,30].map(function(y){return <option key={y} value={y}>{y}</option>;})}</select></div></div>
{proj&&<div><div style={{display:"grid",gridTemplateColumns:gCols,gap:10,marginBottom:14}}>{[{l:"Starting",v:fmt(Math.round(startVal)),c:"#fff"},{l:cYv+"yr Value",v:fmt(proj.final.portfolio),c:"#22c55e"},{l:"Contributed",v:fmt(proj.final.contributed),c:"#3b82f6"},{l:"Gains",v:fmt(proj.final.gains),c:"#a78bfa"},{l:"Growth",v:"+"+((proj.final.portfolio/startVal-1)*100).toFixed(0)+"%",c:"#f59e0b"}].map(function(m){return <div key={m.l} style={sCard}><div style={lbl}>{m.l}</div><div style={vlS(m.c)}>{m.v}</div></div>;})}</div>
<div style={Object.assign({},cd,{marginBottom:14,position:"relative",overflow:"hidden"})}><div style={{position:"absolute",top:0,right:0,width:"40%",height:"100%",background:"radial-gradient(ellipse at top right, rgba(34,197,94,0.04) 0%, transparent 70%)",pointerEvents:"none"}}/><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={ttl}>Projected Growth</div><div style={{display:"flex",gap:20}}>{[{c:"#22c55e",l:"Portfolio"},{c:"#3b82f6",l:"Contributed"}].map(function(x){return <div key={x.l} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#94a3b8",fontWeight:500}}><div style={{width:20,height:3,borderRadius:2,background:x.c,boxShadow:"0 0 6px "+x.c+"66"}}/>{x.l}</div>;})}</div></div><div style={{height:mob?300:400,marginTop:20}}><ResponsiveContainer width="100%" height="100%"><AreaChart data={proj.data.filter(function(d,i){return i===0||i===proj.data.length-1||d.month%12===0;})} margin={{top:16,right:16,left:0,bottom:0}}><defs><linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity={0.45}/><stop offset="25%" stopColor="#22c55e" stopOpacity={0.2}/><stop offset="60%" stopColor="#22c55e" stopOpacity={0.05}/><stop offset="100%" stopColor="#22c55e" stopOpacity={0}/></linearGradient><linearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="25%" stopColor="#3b82f6" stopOpacity={0.1}/><stop offset="60%" stopColor="#3b82f6" stopOpacity={0.03}/><stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient><linearGradient id="strokeP" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#22c55e" stopOpacity={0.4}/><stop offset="50%" stopColor="#22c55e" stopOpacity={1}/><stop offset="100%" stopColor="#4ade80" stopOpacity={1}/></linearGradient><linearGradient id="strokeC" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4}/><stop offset="50%" stopColor="#3b82f6" stopOpacity={1}/><stop offset="100%" stopColor="#60a5fa" stopOpacity={1}/></linearGradient></defs><CartesianGrid stroke="rgba(30,58,95,0.3)" horizontal={true} vertical={false} strokeDasharray="6 6"/><XAxis dataKey="label" tick={{fill:"#fff",fontSize:11,fontFamily:"Poppins,sans-serif",fontWeight:600}} axisLine={false} tickLine={false} interval="preserveStartEnd" dy={10}/><YAxis tick={{fill:"#fff",fontSize:11,fontFamily:"Poppins,sans-serif",fontWeight:600}} axisLine={false} tickLine={false} dx={-6} tickFormatter={function(v){return v>=1e6?"$"+(v/1e6).toFixed(1)+"M":"$"+(v/1e3).toFixed(0)+"k";}}/><Tooltip content={<ChartTip/>} cursor={{stroke:"rgba(255,255,255,0.08)",strokeWidth:40}}/><Area type="natural" dataKey="contributed" stroke="url(#strokeC)" fill="url(#gC)" strokeWidth={2.5} dot={false} activeDot={{r:6,fill:"#3b82f6",stroke:"#0f172a",strokeWidth:3,style:{filter:"drop-shadow(0 0 10px rgba(59,130,246,0.8))"}}}/><Area type="natural" dataKey="portfolio" stroke="url(#strokeP)" fill="url(#gP)" strokeWidth={3} dot={false} activeDot={{r:7,fill:"#22c55e",stroke:"#0f172a",strokeWidth:3,style:{filter:"drop-shadow(0 0 12px rgba(34,197,94,0.8))"}}}/></AreaChart></ResponsiveContainer></div></div></div>}</div>}
</div>
{/* DISCLAIMER MODAL */}
{showDisclaimer&&<div onClick={function(){setShowDisclaimer(false);}} style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16}}><div onClick={function(e){e.stopPropagation();}} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,maxWidth:640,width:"100%",maxHeight:"85vh",overflow:"auto",padding:mob?20:32}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}><div style={{fontSize:18,fontWeight:700,color:"#fff"}}>Disclaimers</div><button onClick={function(){setShowDisclaimer(false);}} style={{background:"none",border:"1px solid #1e3a5f",borderRadius:6,padding:"6px 12px",color:"#94a3b8",cursor:"pointer"}}>Close</button></div><div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.8}}>
<p style={{fontWeight:700,color:"#ef4444",fontSize:16,marginBottom:16,textTransform:"uppercase",letterSpacing:".05em"}}>Important Legal Disclaimers</p>
<p style={{fontWeight:600,color:"#f59e0b",fontSize:13,marginBottom:6}}>Not Financial Advice</p>
<p style={{marginBottom:14}}>Portfolio Insights is provided for informational and educational purposes only. Nothing in this application constitutes financial advice, investment advice, trading advice, or any other form of professional advice. All content, including AI-generated recommendations, risk scores, rebalancing suggestions, portfolio building outputs, and growth projections, represents theoretical analysis and hypothetical scenarios only.</p>
<p style={{fontWeight:600,color:"#f59e0b",fontSize:13,marginBottom:6}}>No Fiduciary Relationship</p>
<p style={{marginBottom:14}}>Use of this application does not create a fiduciary relationship, advisory relationship, or any professional-client relationship between you and Portfolio Insights, its creators, operators, or affiliates. We are not registered investment advisors, broker-dealers, financial planners, tax advisors, or licensed professionals of any kind.</p>
<p style={{fontWeight:600,color:"#f59e0b",fontSize:13,marginBottom:6}}>Investment Risks</p>
<p style={{marginBottom:14}}>All investments involve risk, including the possible loss of all principal invested. Past performance does not guarantee future results. The value of your investments can go down as well as up. Cryptocurrency investments are particularly volatile, largely unregulated, and may result in total loss. Options, leveraged products, and concentrated positions carry elevated risk.</p>
<p style={{fontWeight:600,color:"#f59e0b",fontSize:13,marginBottom:6}}>AI Limitations</p>
<p style={{marginBottom:14}}>AI-generated content may contain errors, hallucinations, outdated information, or inappropriate recommendations. Risk scores are algorithmic estimates based on limited factors and do not capture all possible risks. Market data may be delayed, inaccurate, or unavailable. Do not rely on any output from this application to make real investment decisions.</p>
<p style={{fontWeight:600,color:"#f59e0b",fontSize:13,marginBottom:6}}>Hypothetical Projections</p>
<p style={{marginBottom:14}}>Growth calculator projections are purely hypothetical and assume constant returns, which do not occur in reality. Actual returns will vary significantly. Projections do not account for taxes, fees, inflation, transaction costs, market impact, or changes in personal circumstances.</p>
<p style={{fontWeight:600,color:"#f59e0b",fontSize:13,marginBottom:6}}>Limitation of Liability</p>
<p style={{marginBottom:14}}>Portfolio Insights, its creators, and affiliates shall not be liable for any financial losses, damages, or harm arising from the use of this application. This includes but is not limited to: losses from trades or investments influenced by app content, losses from data inaccuracies, losses from system errors or downtime, and any consequential, incidental, or punitive damages.</p>
<p style={{fontWeight:600,color:"#f59e0b",fontSize:13,marginBottom:6}}>Data Privacy</p>
<p style={{marginBottom:14}}>Portfolio data entered into this application may be transmitted to third-party AI services for analysis. Do not enter sensitive account numbers, passwords, or personally identifiable information. We do not guarantee the security or confidentiality of data entered into this application.</p>
<p style={{fontWeight:600,color:"#f59e0b",fontSize:13,marginBottom:6}}>Consult a Professional</p>
<p style={{marginBottom:14}}>Before making any investment decision, consult with a qualified, licensed financial advisor, tax professional, or attorney who understands your complete financial situation, goals, risk tolerance, and applicable laws and regulations.</p>
<p style={{fontWeight:600,color:"#fff",fontSize:12,marginTop:16,padding:"12px 16px",background:"rgba(239,68,68,0.1)",borderRadius:8,border:"1px solid rgba(239,68,68,0.2)"}}>By using this application, you acknowledge that you have read, understood, and agree to all of the above terms and conditions. Use at your own risk.</p>
</div></div></div>}
{/* CONTACT MODAL */}
{showContact&&<div onClick={function(){setShowContact(false);}} style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16}}><div onClick={function(e){e.stopPropagation();}} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,maxWidth:520,width:"100%",maxHeight:"85vh",overflow:"auto",padding:mob?20:32}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:24}}><div style={{fontSize:18,fontWeight:700,color:"#fff"}}>Contact</div><button onClick={function(){setShowContact(false);}} style={{background:"none",border:"1px solid #1e3a5f",borderRadius:6,padding:"6px 12px",color:"#94a3b8",cursor:"pointer"}}>Close</button></div><div style={{display:"flex",flexDirection:"column",gap:14}}>{[{t:"Email",d:"support@portfolioinsights.com"},{t:"Feedback",d:"Feature requests and bug reports"},{t:"Support",d:"Include browser and device info"},{t:"Business",d:"business@portfolioinsights.com"}].map(function(item){return <div key={item.t} style={{background:"#0a0e1a",border:"1px solid #1e293b",borderRadius:8,padding:16}}><div style={{fontSize:13,fontWeight:600,color:"#fff",marginBottom:4}}>{item.t}</div><div style={{color:item.t==="Email"||item.t==="Business"?"#3b82f6":"#94a3b8",fontSize:12}}>{item.d}</div></div>;})}</div></div></div>}
</div>);
}
