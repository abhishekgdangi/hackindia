/**
 * HackIndia.jsx  — Complete React Frontend
 * Talks to Express backend at /api/*
 * HackBot uses Groq (free API) directly from the browser
 * Falls back to static seed data if the backend is unreachable
 */

import { useState, useEffect, useRef, useCallback } from "react";

/* ────────────────────────────────────────────────
   CONFIG
──────────────────────────────────────────────── */
const API_BASE   = process.env.REACT_APP_API_URL  || "http://localhost:5000/api";
// eslint-disable-next-line no-unused-vars
const GROQ_KEY   = process.env.REACT_APP_GROQ_KEY || "";
// eslint-disable-next-line no-unused-vars
const GROQ_MODEL = "llama-3.3-70b-versatile";

/* ────────────────────────────────────────────────
   API CLIENT
──────────────────────────────────────────────── */
async function apiFetch(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null && v !== "" && v !== "All")
      url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/* ────────────────────────────────────────────────
   HOOKS
──────────────────────────────────────────────── */
function useHackathons(filters={}, page=1) {
  const [data,    setData]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const lastKey = useRef("");
  const fetchId = useRef(0);

  useEffect(() => {
    const key = JSON.stringify(filters) + "|p" + page;
    if (key === lastKey.current) return;       // same query — skip
    lastKey.current = key;

    const id = ++fetchId.current;
    setLoading(true);

    apiFetch("/hackathons", { ...filters, limit:500 })  // page handled client-side
      .then(j => {
        if (fetchId.current !== id) return;
        setData(j.data || []);
        setTotal(j.total || 0);
        setOffline(false);
      })
      .catch(() => {
        if (fetchId.current !== id) return;
        setData([]); setTotal(0); setOffline(true);
      })
      .finally(() => { if (fetchId.current === id) setLoading(false); });
  // filters is a new object every render but JSON.stringify handles equality
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters), page]);

  return { data, total, loading, offline };
}

function useStats() {
  const [stats, setStats] = useState({ totalOpen: 0, byDomain:[], totalPrizePool:0, lastUpdated:null });
  useEffect(() => {
    apiFetch("/hackathons/stats").then(j => j.success && setStats(j.data)).catch(()=>{});
  }, []);
  return stats;
}

function useInternships({ds="", location="All", isRemote="All"}={}) {
  const [data,    setData]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  // Use refs to deduplicate — prevents React StrictMode double-invoke & debounce spurious renders
  const lastKey = useRef("");
  const fetchId = useRef(0);

  useEffect(() => {
    const key = ds + "|" + location + "|" + isRemote;
    if (key === lastKey.current) return;       // exact same params — skip
    lastKey.current = key;

    const id = ++fetchId.current;
    setLoading(true);

    const params = { limit:500 };
    if(ds) params.search = ds;
    if(isRemote==="Remote") params.isRemote = "true";
    if(location!=="All" && location!=="Remote/WFH") params.location = location;
    if(location==="Remote/WFH") params.isRemote = "true";

    apiFetch("/internships", params)
      .then(j => {
        if (fetchId.current !== id) return;   // stale response — discard
        setData(j.data || []);
        setTotal(j.total || 0);
      })
      .catch(() => { if (fetchId.current === id) setData([]); })
      .finally(() => { if (fetchId.current === id) setLoading(false); });
  }, [ds, location, isRemote]);

  return { data, total, loading };
}

/* ────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────── */
const getDays  = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);
const fmtDate  = (d) => new Date(d).toLocaleDateString("en-IN", {day:"numeric", month:"short", year:"numeric"});
const dcClass  = (d) => { const n=getDays(d); return n<=3?"urgent":n<=7?"soon":"ok"; };
const dcColor  = (d) => dcClass(d)==="urgent"?"var(--pink)":dcClass(d)==="soon"?"var(--yellow)":"var(--green)";
const DC = {"AI/ML":"#00d4ff","Web Dev":"#00ff88","Blockchain":"#7c4dff","Cybersecurity":"#ff3d8a","Data Science":"#ffd60a","Cloud":"#ff6b35","Mobile Apps":"#00d4ff","IoT":"#00ff88","Robotics":"#7c4dff","Web3":"#7c4dff","Open Source":"#00ff88","DeFi":"#ffd60a"};

/* ────────────────────────────────────────────────
   GLOBAL STYLES
──────────────────────────────────────────────── */
const GS = () => (<style>{`
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--nav-bg:rgba(6,12,26,.96);--bg:#060c1a;--bg2:#0d1529;--bg3:#111d35;--card:#0f1a30;--card2:#141f35;--border:rgba(0,212,255,0.12);--border2:rgba(0,212,255,0.22);--cyan:#00d4ff;--green:#00ff88;--purple:#7c4dff;--orange:#ff6b35;--pink:#ff3d8a;--yellow:#ffd60a;--text:#e8f0fe;--text2:#8899bb;--text3:#4a5980}
.light{--nav-bg:rgba(248,250,255,.97);--bg:#f0f4ff;--bg2:#e8edf8;--bg3:#dde4f5;--card:#fff;--card2:#f5f8ff;--border:rgba(0,100,200,0.12);--border2:rgba(0,100,200,0.22);--cyan:#0055cc;--green:#008844;--purple:#4422bb;--orange:#bb3300;--pink:#bb0044;--yellow:#aa6600;--text:#0a1a3a;--text2:#3a5080;--text3:#8899bb}
html{scroll-behavior:smooth}body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);overflow-x:hidden}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:var(--bg2)}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}
.syne{font-family:'Syne',sans-serif}.mono{font-family:'JetBrains Mono',monospace}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes pulse-glow{0%,100%{box-shadow:0 0 20px rgba(0,212,255,.2)}50%{box-shadow:0 0 40px rgba(0,212,255,.4)}}
@keyframes slide-in{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes fade-in{from{opacity:0}to{opacity:1}}
@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes shimmer{0%{background-position:-1000px 0}100%{background-position:1000px 0}}
@keyframes agent-pulse{0%,100%{opacity:.5}50%{opacity:1}}
.af{animation:float 3s ease-in-out infinite}.apg{animation:pulse-glow 2s ease-in-out infinite}
.btn-p{background:linear-gradient(135deg,var(--cyan),#0099cc);color:#fff;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600;border-radius:10px;transition:all .2s;display:inline-flex;align-items:center;gap:8px}
.btn-p:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(0,212,255,.35);filter:brightness(1.1)}
.btn-g{background:transparent;border:1px solid var(--border2);color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;border-radius:10px;transition:all .2s;display:inline-flex;align-items:center;gap:8px}
.btn-g:hover{background:var(--card2);border-color:var(--cyan);color:var(--cyan)}
.badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;font-family:'JetBrains Mono',monospace}
.b-open{background:rgba(0,255,136,.12);color:var(--green);border:1px solid rgba(0,255,136,.25)}
.b-online{background:rgba(0,212,255,.12);color:var(--cyan);border:1px solid rgba(0,212,255,.25)}
.b-offline{background:rgba(255,107,53,.12);color:var(--orange);border:1px solid rgba(255,107,53,.25)}
.input{background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:10px;font-family:'DM Sans',sans-serif;transition:all .2s;outline:none;width:100%}
.input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(0,212,255,.1)}
.input::placeholder{color:var(--text3)}
select.input{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238899bb' stroke-width='2' fill='none'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:36px;cursor:pointer}
.grid-bg{background-image:linear-gradient(rgba(0,212,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,.03) 1px,transparent 1px);background-size:40px 40px}
.ticker-wrap{overflow:hidden}.ticker-inner{display:flex;animation:ticker 55s linear infinite;white-space:nowrap}.ticker-inner:hover{animation-play-state:paused}
.fc{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif;transition:all .18s;margin:3px}
.fc:hover{border-color:var(--cyan);color:var(--cyan)}.fc.act{background:rgba(0,212,255,.12);border-color:var(--cyan);color:var(--cyan)}
.nav-link{color:var(--text2);font-weight:500;font-size:14px;padding:8px 14px;border-radius:8px;transition:all .18s;cursor:pointer;display:inline-flex;align-items:center;gap:6px;border:none;background:transparent}
.nav-link:hover{color:var(--text);background:var(--card2)}.nav-link.act{color:var(--cyan);background:rgba(0,212,255,.08)}
.hcard{background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden;transition:all .25s;cursor:pointer}
.hcard:hover{border-color:var(--border2);transform:translateY(-4px);box-shadow:0 20px 60px rgba(0,0,0,.3)}
.skel{background:linear-gradient(90deg,var(--card) 25%,var(--card2) 50%,var(--card) 75%);background-size:1000px 100%;animation:shimmer 1.5s infinite;border-radius:8px}
.modal-o{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;animation:fade-in .2s ease}
.modal-c{background:var(--bg2);border:1px solid var(--border2);border-radius:20px;max-width:800px;width:100%;max-height:90vh;overflow-y:auto;animation:slide-in .3s ease}
.sl{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:var(--cyan);letter-spacing:.15em;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.sl::before{content:'';display:block;width:24px;height:2px;background:var(--cyan)}
.gtext{background:linear-gradient(135deg,var(--cyan),var(--green));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.pb{height:4px;background:var(--bg3);border-radius:2px;overflow:hidden}.pf{height:100%;border-radius:2px;transition:width .8s ease}
.bt-typing span{display:inline-block;width:6px;height:6px;background:var(--cyan);border-radius:50%;animation:blink 1.2s infinite}
.bt-typing span:nth-child(2){animation-delay:.2s}.bt-typing span:nth-child(3){animation-delay:.4s}
@media(max-width:768px){.hm{display:none!important}}
`}</style>);

/* ────────────────────────────────────────────────
   SKELETON
──────────────────────────────────────────────── */
const SkeletonCard = () => (
  <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
    <div style={{display:"flex",gap:12,marginBottom:14}}>
      <div className="skel" style={{width:44,height:44,borderRadius:12,flexShrink:0}}/>
      <div style={{flex:1}}><div className="skel" style={{height:16,marginBottom:8}}/><div className="skel" style={{height:12,width:"60%"}}/></div>
    </div>
    <div className="skel" style={{height:12,marginBottom:6}}/><div className="skel" style={{height:12,width:"80%",marginBottom:14}}/>
    <div style={{display:"flex",gap:6,marginBottom:14}}>{[1,2,3].map(i=><div key={i} className="skel" style={{height:22,width:60,borderRadius:20}}/>)}</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{[1,2,3].map(i=><div key={i} className="skel" style={{height:44,borderRadius:8}}/>)}</div>
  </div>
);

/* ────────────────────────────────────────────────
   HACKATHON CARD
──────────────────────────────────────────────── */
/* Logo helper — maps platform/organizer to a real emoji/logo */
const hackLogo = (h) => {
  const n = (h.name||"").toLowerCase();
  const o = (h.organizer||"").toLowerCase();
  const p = (h.sourcePlatform||"").toLowerCase();
  if (o.includes("google") || n.includes("google"))     return "🔵";
  if (o.includes("microsoft") || n.includes("microsoft")) return "💙";
  if (o.includes("amazon") || n.includes("amazon"))     return "🟠";
  if (o.includes("flipkart") || n.includes("flipkart")) return "🛒";
  if (o.includes("iit") || n.includes("iit"))           return "🎓";
  if (o.includes("mlh") || o.includes("major league"))  return "🎯";
  if (o.includes("github") || n.includes("github"))     return "🐙";
  if (o.includes("meta") || n.includes("meta"))         return "🔷";
  if (o.includes("aws") || n.includes("aws"))           return "☁️";
  if (o.includes("ibm") || n.includes("ibm"))           return "🔷";
  if (n.includes("ai") || n.includes("llm") || n.includes("machine")) return "🤖";
  if (n.includes("blockchain") || n.includes("web3"))   return "⛓️";
  if (n.includes("health") || n.includes("med"))        return "🏥";
  if (n.includes("finance") || n.includes("fintech"))   return "💰";
  if (n.includes("climate") || n.includes("green"))     return "🌱";
  if (n.includes("education") || n.includes("edu"))     return "📚";
  if (n.includes("social") || n.includes("community"))  return "🤝";
  if (p === "devfolio")    return "🚀";
  if (p === "devpost")     return "💻";
  if (p === "unstop")      return "⚡";
  if (p === "dorahacks")   return "🌐";
  if (p === "hackerearth") return "💡";
  if (p === "hackclub")    return "🏫";
  if (p === "mlh")         return "🎯";
  // Only use logo field if it's an emoji/short string, NOT a raw URL
  if (h.logo && !h.logo.startsWith("http") && h.logo !== "🖥️") return h.logo;
  // Colorful fallback based on name char code
  const fallbacks = ["🔴","🟡","🟢","🔵","🟣","🟠","⚫","🔶","🔹","🌟","💎","🏆","🎪","🎭","🎨"];
  return fallbacks[(h.name||"?").charCodeAt(0) % fallbacks.length];
};

const HackCard = ({ h, onClick }) => (
  <div className="hcard" onClick={()=>onClick(h)} style={{display:"flex",flexDirection:"column"}}>
    <div style={{padding:"20px 20px 16px",flex:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:44,height:44,borderRadius:12,background:"var(--bg3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0,border:"1px solid var(--border)"}}>{hackLogo(h)}</div>
          <div>
            <div className="syne" style={{fontWeight:700,fontSize:14,lineHeight:1.3,marginBottom:3}}>{h.name}</div>
            <div style={{fontSize:11,color:"var(--text2)",display:"flex",alignItems:"center",gap:6}}>
              {h.organizer}
              <span style={{fontSize:9,padding:"1px 6px",borderRadius:4,background:"var(--bg3)",color:"var(--text3)",fontFamily:"JetBrains Mono"}}>{h.sourcePlatform}</span>
            </div>
          </div>
        </div>
        <span className={`badge ${h.mode==="Online"?"b-online":"b-offline"}`} style={{fontSize:10,whiteSpace:"nowrap"}}>{h.mode==="Online"?"🌐":"📍"} {h.mode}</span>
      </div>
      <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.6,marginBottom:14,minHeight:42,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{h.description||"No description available."}</p>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14,minHeight:26}}>
        {(h.domains||[]).slice(0,3).map(d=>(
          <span key={d} style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontFamily:"JetBrains Mono",background:`${DC[d]||"#00d4ff"}15`,color:DC[d]||"var(--cyan)",border:`1px solid ${DC[d]||"#00d4ff"}28`}}>{d}</span>
        ))}
        {(h.domains||[]).length>3 && <span style={{padding:"3px 8px",borderRadius:6,fontSize:11,background:"var(--card2)",color:"var(--text2)",border:"1px solid var(--border)"}}>+{h.domains.length-3}</span>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        {[["🏆","Prize",h.prize||"TBA"],["👥","Team",h.teamSizeLabel||"Any"],["📍","City",(h.city||"").split("(")[0].trim()]].map(([ic,lb,vl])=>(
          <div key={lb} style={{background:"var(--bg3)",borderRadius:8,padding:"7px 9px"}}>
            <div style={{fontSize:10,color:"var(--text3)",marginBottom:2}}>{ic} {lb}</div>
            <div className="mono" style={{fontSize:11,fontWeight:600}}>{vl}</div>
          </div>
        ))}
      </div>
    </div>
    <div style={{borderTop:"1px solid var(--border)",padding:"11px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--bg3)",marginTop:"auto"}}>
      <div className="mono" style={{fontSize:11,color:dcColor(h.registrationDeadline)}}>⏳ {getDays(h.registrationDeadline)}d left · {fmtDate(h.registrationDeadline)}</div>
      <button className="btn-p" style={{padding:"6px 14px",fontSize:12}} onClick={e=>{e.stopPropagation();window.open(h.applyLink,"_blank")}}>Apply →</button>
    </div>
  </div>
);

/* ────────────────────────────────────────────────
   MODAL
──────────────────────────────────────────────── */
const Modal = ({ h, onClose }) => {
  if (!h) return null;
  const dc = dcClass(h.registrationDeadline);
  const bc = dc==="urgent"?"rgba(255,61,138,.1)":dc==="soon"?"rgba(255,214,10,.1)":"rgba(0,255,136,.1)";
  const bb = dc==="urgent"?"rgba(255,61,138,.3)":dc==="soon"?"rgba(255,214,10,.3)":"rgba(0,255,136,.3)";
  return (
    <div className="modal-o" onClick={onClose}>
      <div className="modal-c" onClick={e=>e.stopPropagation()}>
        <div style={{padding:32}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
            <div style={{display:"flex",gap:16,alignItems:"center"}}>
              <div style={{width:60,height:60,borderRadius:14,background:"linear-gradient(135deg,var(--card2),var(--bg3))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,border:"1px solid var(--border2)"}}>{hackLogo(h)}</div>
              <div>
                <div className="syne" style={{fontSize:20,fontWeight:800,marginBottom:5}}>{h.name}</div>
                <div style={{color:"var(--text2)",fontSize:13,marginBottom:8}}>{h.organizer}</div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                  <span className="badge b-open">🟢 OPEN</span>
                  <span className={`badge ${h.mode==="Online"?"b-online":"b-offline"}`}>{h.mode}</span>
                  <span className="badge" style={{background:"var(--card2)",color:"var(--text2)",border:"1px solid var(--border)"}}>📡 {h.sourcePlatform}</span>
                  {h.level && <span className="badge" style={{background:"var(--card2)",color:"var(--text2)",border:"1px solid var(--border)"}}>{h.level}</span>}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{width:34,height:34,borderRadius:8,border:"1px solid var(--border)",background:"var(--card2)",cursor:"pointer",color:"var(--text2)",fontSize:17}}>✕</button>
          </div>

          <div style={{background:bc,border:`1px solid ${bb}`,borderRadius:12,padding:"11px 16px",marginBottom:22,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div className="mono" style={{fontSize:13,color:dcColor(h.registrationDeadline)}}>⏰ Closes in <strong>{getDays(h.registrationDeadline)} days</strong> · {fmtDate(h.registrationDeadline)}</div>
            {h.registrationCount>0 && <div style={{fontSize:12,color:"var(--text2)"}}>{h.registrationCount.toLocaleString()} registered</div>}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:22}}>
            {[["🏆","Prize",h.prize||"TBA"],["👥","Team",h.teamSizeLabel||"Any"],["📍","City",h.city],["🌐","Level",h.level||"—"]].map(([ic,lb,vl])=>(
              <div key={lb} style={{background:"var(--card2)",borderRadius:11,padding:"12px 14px",border:"1px solid var(--border)",textAlign:"center"}}>
                <div style={{fontSize:18,marginBottom:5}}>{ic}</div>
                <div style={{fontSize:10,color:"var(--text3)",marginBottom:3}}>{lb}</div>
                <div className="mono" style={{fontSize:12,fontWeight:700}}>{vl}</div>
              </div>
            ))}
          </div>

          {h.description && <div style={{marginBottom:18}}><div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>ABOUT</div><p style={{color:"var(--text2)",lineHeight:1.75,fontSize:14}}>{h.description}</p></div>}

          {h.domains?.length>0 && <div style={{marginBottom:18}}><div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10}}>TRACKS</div><div style={{display:"flex",flexWrap:"wrap",gap:7}}>{h.domains.map(d=><span key={d} style={{padding:"5px 13px",borderRadius:20,fontSize:12,fontFamily:"JetBrains Mono",background:`${DC[d]||"#00d4ff"}15`,color:DC[d]||"var(--cyan)",border:`1px solid ${DC[d]||"#00d4ff"}28`}}>{d}</span>)}</div></div>}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:22}}>
            {[["📝","Reg. Closes",h.registrationDeadline],["🚀","Hack Starts",h.startDate],["🏁","Hack Ends",h.endDate]].filter(([,,d])=>d).map(([ic,lb,dt])=>(
              <div key={lb} style={{background:"var(--card2)",borderRadius:10,padding:"11px 13px",border:"1px solid var(--border)",textAlign:"center"}}>
                <div style={{fontSize:17,marginBottom:5}}>{ic}</div>
                <div style={{fontSize:10,color:"var(--text3)",marginBottom:3}}>{lb}</div>
                <div className="mono" style={{fontSize:11,fontWeight:600,color:"var(--cyan)"}}>{fmtDate(dt)}</div>
              </div>
            ))}
          </div>

          {h.eligibility && <div style={{marginBottom:22,background:"var(--card2)",borderRadius:11,padding:"12px 15px",border:"1px solid var(--border)"}}><div style={{fontSize:11,color:"var(--text3)",marginBottom:5}}>✅ ELIGIBILITY</div><div style={{fontSize:14}}>{h.eligibility}</div></div>}

          <div style={{display:"flex",gap:11}}>
            <button className="btn-p" style={{flex:1,padding:"13px 24px",fontSize:15,justifyContent:"center"}} onClick={()=>window.open(h.applyLink,"_blank")}>🚀 Apply Now — {h.sourcePlatform}</button>
            <button className="btn-g" style={{padding:"13px 17px"}} onClick={onClose}>← Back</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────
   HACKBOT — powered by Groq (free)
──────────────────────────────────────────────── */
const HackBot = ({ hackathons }) => {
  const [open,    setOpen]    = useState(false);
  const [msgs,    setMsgs]    = useState([{ role:"assistant", text:"Hey! 👋 I'm HackBot — your AI assistant. Tell me your domain (AI, Web, Blockchain…), team size, and location — I'll find the best live hackathons for you!" }]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef(null);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs]);

  const send = useCallback(async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");
    setMsgs(m=>[...m, {role:"user",text:msg}]);
    setLoading(true);

    const hackList = hackathons.slice(0,12).map(h =>
      `• ${h.name} (${h.mode}, ${h.city}) — ${(h.domains||[]).join(", ")} — Prize: ${h.prize||"TBA"} — Deadline: ${fmtDate(h.registrationDeadline)} — Apply: ${h.applyLink}`
    ).join("\n");

    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || "http://localhost:5000/api"}/chat`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          messages: [
            { role:"system", content:`You are HackBot on HackIndia — India's top hackathon discovery platform. Help students find the right hackathons. Be friendly, enthusiastic, concise (max 3 short paragraphs). Always recommend 2-3 specific hackathons from the list with a reason. End with encouragement.\n\nCurrent live hackathons:\n${hackList}` },
            ...msgs.map(m=>({role:m.role,content:m.text})),
            { role:"user", content:msg },
          ],
        }),
      });
      const data  = await res.json();
      const reply = data.reply || data.choices?.[0]?.message?.content || "I had trouble fetching a response. Please try again!";
      setMsgs(m=>[...m, {role:"assistant",text:reply}]);
    } catch {
      setMsgs(m=>[...m, {role:"assistant",text:"Connection issue. Make sure the backend is running, then try again!"}]);
    }
    setLoading(false);
  }, [input,loading,msgs,hackathons]);

  return (
    <>
      <button onClick={()=>setOpen(!open)} className="apg" style={{position:"fixed",bottom:28,right:28,zIndex:200,width:58,height:58,borderRadius:"50%",background:"linear-gradient(135deg,var(--cyan),var(--green))",border:"none",cursor:"pointer",fontSize:24,boxShadow:"0 8px 30px rgba(0,212,255,.4)",display:"flex",alignItems:"center",justifyContent:"center"}}>🤖</button>
      {open && (
        <div style={{position:"fixed",bottom:98,right:28,zIndex:200,width:370,height:500,background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:20,display:"flex",flexDirection:"column",boxShadow:"0 20px 80px rgba(0,0,0,.5)",animation:"slide-in .3s ease"}}>
          <div style={{padding:"13px 17px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between",background:"linear-gradient(135deg,rgba(0,212,255,.08),rgba(0,255,136,.04))",borderRadius:"20px 20px 0 0"}}>
            <div style={{display:"flex",alignItems:"center",gap:9}}>
              <span style={{fontSize:22}}>🤖</span>
              <div>
                <div className="syne" style={{fontWeight:700,fontSize:14}}>HackBot AI</div>
                <div style={{fontSize:9,color:"var(--green)",display:"flex",alignItems:"center",gap:4}}><div style={{width:5,height:5,borderRadius:"50%",background:"var(--green)"}}/> AI Assistant · Free</div>
              </div>
            </div>
            <button onClick={()=>setOpen(false)} style={{background:"none",border:"none",color:"var(--text2)",cursor:"pointer",fontSize:17}}>✕</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"13px 13px 7px"}}>
            {msgs.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:9}}>
                <div style={{maxWidth:"88%",padding:"8px 12px",borderRadius:m.role==="user"?"16px 16px 4px 16px":"4px 16px 16px 16px",background:m.role==="user"?"linear-gradient(135deg,var(--cyan),#0099cc)":"var(--card2)",color:m.role==="user"?"#fff":"var(--text)",fontSize:13,lineHeight:1.6,border:m.role==="assistant"?"1px solid var(--border)":"none"}}>{m.text}</div>
              </div>
            ))}
            {loading && <div style={{display:"flex",marginBottom:9}}><div style={{padding:"9px 13px",background:"var(--card2)",borderRadius:"4px 16px 16px 16px",border:"1px solid var(--border)"}}><div className="bt-typing"><span/><span/><span/></div></div></div>}
            <div ref={bottomRef}/>
          </div>
          <div style={{padding:"9px 13px 13px",borderTop:"1px solid var(--border)",display:"flex",gap:7}}>
            <input className="input" placeholder="Ask about hackathons…" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} style={{padding:"9px 12px",fontSize:13,flex:1}}/>
            <button className="btn-p" style={{padding:"9px 14px"}} onClick={send} disabled={loading}>→</button>
          </div>
        </div>
      )}
    </>
  );
};

/* ────────────────────────────────────────────────
   AGENT STATUS BADGE
──────────────────────────────────────────────── */
// eslint-disable-next-line no-unused-vars
const AgentStatus = () => {
  const [log, setLog] = useState(null);
  useEffect(()=>{
    apiFetch("/agent-status").then(j=>setLog(j.data?.[0])).catch(()=>{});
  },[]);
  if (!log) return null;
  return (
    <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:20,background:"var(--card2)",border:"1px solid var(--border)",fontSize:10}}>
      <div style={{width:5,height:5,borderRadius:"50%",background:log.status==="success"?"var(--green)":"var(--yellow)",animation:"agent-pulse 2s infinite"}}/>
      <span className="mono" style={{color:"var(--text3)"}}>Agents {log.status} · {log.itemsAdded||0} added</span>
    </div>
  );
};

/* ────────────────────────────────────────────────
   NAVBAR
──────────────────────────────────────────────── */
const Navbar = ({page,setPage,dark,setDark}) => (
  <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:100,background:"var(--nav-bg)",backdropFilter:"blur(20px)",borderBottom:"1px solid var(--border)",padding:"0 24px",height:64,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
    <div style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}} onClick={()=>setPage("home")}>
      <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,var(--cyan),var(--green))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>⚡</div>
      <span className="syne" style={{fontSize:18,fontWeight:800}}>Hack<span style={{color:"var(--cyan)"}}>India</span></span>
      <span className="badge b-open" style={{fontSize:9}}>LIVE</span>
    </div>
    <div className="hm" style={{display:"flex",gap:4}}>
      {[["home","◈ Home"],["hackathons","⚡ Hackathons"],["internships","💼 Internships"],["resources","📚 Resources"]].map(([id,lbl])=>(
        <button key={id} className={`nav-link ${page===id?"act":""}`} onClick={()=>setPage(id)}>{lbl}</button>
      ))}
    </div>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <button onClick={()=>setDark(!dark)} style={{width:34,height:34,borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>{dark?"☀️":"🌙"}</button>
      
    </div>
  </nav>
);

/* ────────────────────────────────────────────────
   HOME PAGE
──────────────────────────────────────────────── */
const HomePage = ({setPage}) => {
  const {data:featured,loading} = useHackathons({sort:"newest"});
  const {data:featuredInterns,loading:iLoading} = useInternships({});
  const stats = useStats();
  const ticker = featured.length ? [...featured,...featured].map(h=>`${hackLogo(h)||"⚡"} ${h.name} — ${h.prize||"TBA"} — Closes ${fmtDate(h.registrationDeadline)}`) : ["⚡ Hackathons loading... Check back soon!","🚀 New hackathons scraped every 6 hours","🤖 AI-powered discovery platform"];

  return (
    <div style={{paddingTop:64}}>
      {/* Live ticker */}
      <div style={{background:"linear-gradient(90deg,var(--card),var(--card2))",borderBottom:"1px solid var(--border)",padding:"9px 0"}}>
        <div className="ticker-wrap"><div className="ticker-inner">{ticker.map((t,i)=><span key={i} className="mono" style={{fontSize:12,color:"var(--text2)",marginRight:60}}>🔴 LIVE &nbsp;{t} &nbsp;•</span>)}</div></div>
      </div>

      {/* Hero */}
      <div className="grid-bg" style={{position:"relative",overflow:"hidden",padding:"80px 24px 90px"}}>
        <div style={{position:"absolute",width:600,height:600,borderRadius:"50%",background:"rgba(0,212,255,.05)",filter:"blur(80px)",top:-200,right:-100,pointerEvents:"none"}}/>
        <div style={{maxWidth:800,margin:"0 auto",position:"relative",zIndex:1,textAlign:"center"}}>
          <div style={{animation:"slide-in .6s ease"}}>
            <div className="sl" style={{justifyContent:"center"}}>India's #1 Hackathon Discovery Platform</div>
            <h1 className="syne" style={{fontSize:"clamp(38px,5vw,68px)",fontWeight:800,lineHeight:1.1,marginBottom:22}}>Find Your Next<br/><span className="gtext">Hackathon</span><br/>& Win Big</h1>
            <p style={{fontSize:17,color:"var(--text2)",lineHeight:1.75,marginBottom:36,maxWidth:520,margin:"0 auto 36px"}}>Discover <strong style={{color:"var(--cyan)"}}>{stats.totalOpen}+ live hackathons</strong> scraped by AI agents from 7+ platforms — daily. Only open registrations shown.</p>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:44,justifyContent:"center"}}>
              <button className="btn-p" style={{padding:"14px 32px",fontSize:16}} onClick={()=>setPage("hackathons")}>🔍 Browse Hackathons</button>
              <button className="btn-g" style={{padding:"14px 28px",fontSize:16}} onClick={()=>setPage("internships")}>💼 Find Internships</button>
            </div>
            <div style={{display:"flex",gap:40,flexWrap:"wrap",justifyContent:"center"}}>
              {[["Every 6h","Auto-scrape"],["100%","Open only"],["Free","No sign-up"],["AI","Classification"]].map(([v,l])=>(
                <div key={l}><div className="syne" style={{fontSize:22,fontWeight:800,color:"var(--cyan)"}}>{v}</div><div style={{fontSize:12,color:"var(--text3)"}}>{l}</div></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{background:"var(--bg2)",borderTop:"1px solid var(--border)",borderBottom:"1px solid var(--border)",padding:"36px 24px"}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16}}>
          {[[`${stats.totalOpen}+`,"Live Hackathons","⚡","var(--cyan)"],[`₹${featured.length ? Math.round(featured.reduce((s,h)=>s+(h.prizeNumeric||0),0)/100000)||"50" : "50"}L+`,"Total Prize Pool","🏆","var(--yellow)"],["AI","Powered","🤖","var(--purple)"],["Daily","Auto-refresh","🔄","var(--green)"]].map(([v,l,ic,c])=>(
            <div key={l} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:22,textAlign:"center"}}>
              <div style={{fontSize:26,marginBottom:6}}>{ic}</div>
              <div className="syne" style={{fontSize:26,fontWeight:800,color:c}}>{v}</div>
              <div style={{fontSize:12,color:"var(--text2)",marginTop:4}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Featured */}
      <div style={{padding:"56px 24px",maxWidth:1200,margin:"0 auto"}}>
        <div className="sl">Latest This Week</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <h2 className="syne" style={{fontSize:30,fontWeight:800}}>🔥 Latest Hackathons</h2>
          <button className="btn-g" style={{padding:"7px 16px",fontSize:13}} onClick={()=>setPage("hackathons")}>View All →</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:18}}>
          {loading ? [1,2,3].map(i=><SkeletonCard key={i}/>) : featured.length ? [
            ...featured.slice(0,9).map(h=><HackCard key={h._id} h={h} onClick={()=>setPage("hackathons")}/>),
            <div key="browse-all" onClick={()=>setPage("hackathons")} style={{gridColumn:"1/-1",background:"linear-gradient(135deg,var(--card2),var(--bg3))",border:"2px dashed var(--border2)",borderRadius:14,display:"flex",flexDirection:"row",alignItems:"center",justifyContent:"space-between",cursor:"pointer",padding:"22px 32px",gap:24,transition:"all .25s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--cyan)";e.currentTarget.style.background="linear-gradient(135deg,rgba(0,212,255,.06),var(--bg3))";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border2)";e.currentTarget.style.background="linear-gradient(135deg,var(--card2),var(--bg3))";}}>
              <div style={{display:"flex",alignItems:"center",gap:18}}>
                <div style={{fontSize:36}}>⚡</div>
                <div>
                  <div className="syne" style={{fontSize:18,fontWeight:800,color:"var(--cyan)"}}>Browse All Hackathons</div>
                  <div style={{fontSize:13,color:"var(--text2)",marginTop:3}}>Filter by domain, city, mode and more · New hackathons added every 6 hours</div>
                </div>
              </div>
              <div style={{padding:"10px 26px",background:"var(--cyan)",color:"#000",borderRadius:10,fontWeight:700,fontSize:14,flexShrink:0}}>View All →</div>
            </div>
          ] : <div style={{gridColumn:"1/-1",textAlign:"center",padding:"40px 0",color:"var(--text2)"}}>🔄 Loading hackathons... Make sure the backend server is running.</div>}
        </div>
      </div>

      {/* Domains */}
      <div style={{background:"var(--bg2)",padding:"56px 24px",borderTop:"1px solid var(--border)"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div className="sl">Trending Now</div>
          <h2 className="syne" style={{fontSize:30,fontWeight:800,marginBottom:32}}>🎯 Top Domains</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:14}}>
            {[["AI/ML","🤖"],["Web Dev","🌐"],["Blockchain","⛓️"],["Data Science","📊"],["Cybersecurity","🔒"],["Cloud","☁️"]].map(([d,ic])=>{
              const cnt = stats.byDomain?.find(b=>b._id===d)?.count || 0;
              return (
                <div key={d} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:13,padding:18,cursor:"pointer",textAlign:"center",transition:"all .2s"}} onClick={()=>setPage("hackathons")}>
                  <div style={{fontSize:30,marginBottom:8}}>{ic}</div>
                  <div className="syne" style={{fontWeight:700,fontSize:13,marginBottom:4}}>{d}</div>
                  <div style={{fontSize:12,color:"var(--cyan)"}}>{cnt} hackathons</div>
                  <div className="pb" style={{marginTop:10}}><div className="pf" style={{width:`${Math.min((cnt/10)*100,100)}%`,background:DC[d]||"var(--cyan)"}}/></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Featured Internships */}
      <div style={{padding:"56px 24px",maxWidth:1200,margin:"0 auto"}}>
        <div className="sl">Top Opportunities</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <h2 className="syne" style={{fontSize:30,fontWeight:800}}>💼 Latest Internships</h2>
          <button className="btn-g" style={{padding:"7px 16px",fontSize:13}} onClick={()=>setPage("internships")}>View All →</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:16}}>
          {iLoading ? [1,2,3].map(i=>(
            <div key={i} className="skel" style={{height:180,borderRadius:16}}/>
          )) : featuredInterns.slice(0,6).map(i=>(
            <div key={i._id} className="hcard" style={{padding:20,cursor:"default"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div style={{display:"flex",gap:12,alignItems:"center"}}>
                  <div style={{width:44,height:44,borderRadius:12,background:"var(--bg3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,border:"1px solid var(--border)",flexShrink:0}}>
                    {["Google","Microsoft","Amazon","Meta","Apple"].some(b=>i.company?.includes(b)) ? "🏢" : "💼"}
                  </div>
                  <div>
                    <div className="syne" style={{fontWeight:700,fontSize:13,lineHeight:1.3}}>{i.company}</div>
                    <div style={{color:"var(--text2)",fontSize:11,marginTop:2}}>{i.role}</div>
                  </div>
                </div>
                <span className="badge b-open" style={{flexShrink:0,fontSize:10}}>OPEN</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
                {[["💰","Stipend",i.stipend],["📍","Location",i.location],["📅","Duration",i.duration]].map(([ic,lb,vl])=>(
                  <div key={lb} style={{background:"var(--bg3)",borderRadius:7,padding:"5px 8px"}}>
                    <div style={{fontSize:9,color:"var(--text3)",marginBottom:1}}>{ic} {lb}</div>
                    <div className="mono" style={{fontSize:10,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{vl||"—"}</div>
                  </div>
                ))}
                <div style={{background:"var(--bg3)",borderRadius:7,padding:"5px 8px"}}>
                  <div style={{fontSize:9,color:"var(--text3)",marginBottom:1}}>🏷️ Skills</div>
                  <div className="mono" style={{fontSize:10,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{(i.skills||[]).slice(0,2).join(", ")||"—"}</div>
                </div>
              </div>
              <button className="btn-p" style={{width:"100%",justifyContent:"center",padding:"7px",fontSize:12}} onClick={()=>window.open(i.applyLink,"_blank")}>Apply Now → {i.company}</button>
            </div>
          ))}
          {/* Browse all internships card */}
          {!iLoading && featuredInterns.length > 0 && (
            <div onClick={()=>setPage("internships")} style={{gridColumn:"1/-1",background:"linear-gradient(135deg,var(--card2),var(--bg3))",border:"2px dashed var(--border2)",borderRadius:14,display:"flex",flexDirection:"row",alignItems:"center",justifyContent:"space-between",cursor:"pointer",padding:"22px 32px",gap:24,transition:"all .25s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--green)";e.currentTarget.style.background="linear-gradient(135deg,rgba(0,255,136,.06),var(--bg3))";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border2)";e.currentTarget.style.background="linear-gradient(135deg,var(--card2),var(--bg3))"}}>
              <div style={{display:"flex",alignItems:"center",gap:18}}>
                <div style={{fontSize:36}}>💼</div>
                <div>
                  <div className="syne" style={{fontSize:18,fontWeight:800,color:"var(--green)"}}>Browse All Internships</div>
                  <div style={{fontSize:13,color:"var(--text2)",marginTop:3}}>500+ live internships from Internshala · Filter by skill, city, and remote</div>
                </div>
              </div>
              <div style={{padding:"10px 26px",background:"var(--green)",color:"#000",borderRadius:10,fontWeight:700,fontSize:14,flexShrink:0}}>View All →</div>
            </div>
          )}
        </div>
      </div>

      {/* Source platforms */}
      <div style={{padding:"56px 24px",maxWidth:1200,margin:"0 auto"}}>
        <div className="sl">Data Sources</div>
        <h2 className="syne" style={{fontSize:28,fontWeight:800,marginBottom:8}}>🔗 Scraped From</h2>
        <p style={{color:"var(--text2)",marginBottom:28,fontSize:14}}>AI agents auto-scrape 7+ platforms every 6 hours and keep only open registrations.</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
          {["Devpost","HackClub","Hackathon.com","DevEvents","MLH","TAIKAI","Internshala","Remotive"].map(s=>(
            <div key={s} style={{padding:"9px 17px",borderRadius:10,background:"var(--card)",border:"1px solid var(--border)",fontSize:13,color:"var(--text2)",display:"flex",alignItems:"center",gap:6}}>
              <span style={{color:"var(--cyan)"}}>◈</span> {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────
   HACKATHONS PAGE
──────────────────────────────────────────────── */
const DOMAIN_OPT = ["All","AI/ML","Web Dev","Blockchain","Cybersecurity","Data Science","Cloud","Mobile Apps","IoT"];
const CITY_OPT   = ["All","Online","Bangalore","Delhi","Mumbai","Hyderabad","Trichy","Kharagpur","Pune","Chennai"];
const MODE_OPT   = ["All","Online","Offline","Online + Offline"];
const TEAM_OPT   = ["All","Solo","2–4","5+"];

const HackathonsPage = () => {
  const [search,setSearch]=useState(""); const [domain,setDomain]=useState("All");
  const [mode,setMode]=useState("All");   const [city,setCity]=useState("All");
  const [team,setTeam]=useState("All");   const [sort,setSort]=useState("deadline");
  const [page,setPage]=useState(1);       const [modal,setModal]=useState(null);
  const [ds,setDs]=useState("");
  useEffect(()=>{const t=setTimeout(()=>setDs(search),350);return()=>clearTimeout(t);},[search]);
  const {data,total,loading,offline} = useHackathons({domain,mode,city,teamSize:team,sort,search:ds},page);
  const HACK_PER_PAGE = 20;
  const pages = Math.ceil(data.length / HACK_PER_PAGE);
  const paginated = data.slice((page-1)*HACK_PER_PAGE, page*HACK_PER_PAGE);
  // Reset page when filters change
  useEffect(()=>{ setPage(1); },[domain,mode,city,team,sort,ds]);

  return (
    <div style={{paddingTop:64}}>
      {modal && <Modal h={modal} onClose={()=>setModal(null)}/>}
      <div style={{background:"linear-gradient(180deg,var(--bg2) 0%,var(--bg) 100%)",borderBottom:"1px solid var(--border)",padding:"36px 24px 28px"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div className="sl">All Hackathons</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:12}}>
            <div>
              <h1 className="syne" style={{fontSize:34,fontWeight:800}}>⚡ Live Hackathons</h1>
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:5}}>
                <span className="badge b-open">{total} OPEN</span>
                <span style={{fontSize:12,color:"var(--text2)"}}>All registrations currently open</span>
                {offline && <span className="mono" style={{fontSize:9,color:"#ff4b4b",background:"rgba(255,75,75,.1)",padding:"2px 7px",borderRadius:5}}>⚠ Backend offline — start npm start in backend</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:13,color:"var(--text2)"}}>Sort:</span>
              <select className="input" value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}} style={{padding:"7px 36px 7px 11px",fontSize:13,width:"auto"}}>
                <option value="deadline">Deadline (Soonest)</option>
                <option value="prize">Prize (Highest)</option>
                <option value="popular">Most Popular</option>
                <option value="newest">Newest Added</option>
                <option value="quality">AI Quality Score</option>
              </select>
            </div>
          </div>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:"var(--text3)"}}>🔍</span>
            <input className="input" placeholder="Search hackathons, organizers, technologies…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} style={{padding:"12px 16px 12px 42px",fontSize:14}}/>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"26px 24px",display:"grid",gridTemplateColumns:"245px 1fr",gap:24}}>
        {/* Sidebar */}
        <div className="hm" style={{position:"sticky",top:80,height:"fit-content"}}>
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:18}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
              🎛️ Filters
              {(domain!=="All"||mode!=="All"||city!=="All"||team!=="All")&&<button onClick={()=>{setDomain("All");setMode("All");setCity("All");setTeam("All");setPage(1);}} style={{marginLeft:"auto",fontSize:10,color:"var(--cyan)",background:"none",border:"none",cursor:"pointer"}}>Reset</button>}
            </div>
            {[["Mode",MODE_OPT,mode,v=>{setMode(v);setPage(1);}],["Domain",DOMAIN_OPT,domain,v=>{setDomain(v);setPage(1);}],["City",CITY_OPT,city,v=>{setCity(v);setPage(1);}],["Team Size",TEAM_OPT,team,v=>{setTeam(v);setPage(1);}]].map(([lbl,opts,val,set])=>(
              <div key={lbl} style={{marginBottom:16}}>
                <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",letterSpacing:".1em",textTransform:"uppercase",marginBottom:8}}>{lbl}</div>
                <div style={{display:"flex",flexWrap:"wrap"}}>{opts.map(o=><button key={o} className={`fc ${val===o?"act":""}`} onClick={()=>set(o)}>{o}</button>)}</div>
              </div>
            ))}
            <div style={{background:"var(--bg3)",borderRadius:10,padding:12}}>
              <div style={{fontSize:9,color:"var(--text3)",marginBottom:5}}>RESULTS</div>
              <div className="syne" style={{fontSize:22,fontWeight:800,color:"var(--cyan)"}}>{total}</div>
              <div style={{fontSize:11,color:"var(--text2)"}}>hackathons</div>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div>
          {loading ? (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))",gap:15}}>{[1,2,3,4,5,6].map(i=><SkeletonCard key={i}/>)}</div>
          ) : offline ? (
            <div style={{textAlign:"center",padding:"80px 20px",border:"1px dashed rgba(255,75,75,.3)",borderRadius:16,background:"rgba(255,75,75,.04)"}}>
              <div style={{fontSize:52,marginBottom:14}}>🔌</div>
              <div className="syne" style={{fontSize:22,fontWeight:800,marginBottom:10,color:"#ff4b4b"}}>Backend server is offline</div>
              <div style={{color:"var(--text2)",fontSize:14,lineHeight:1.8,marginBottom:20}}>
                No hackathons can be shown right now.<br/>
                Start the backend server to see live data.
              </div>
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 20px",display:"inline-block",textAlign:"left"}}>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:6}}>Run this in VS Code terminal:</div>
                <code style={{fontSize:13,color:"var(--cyan)"}}>cd D:\hackindia_final\backend && npm start</code>
              </div>
            </div>
          ) : data.length===0 ? (
            <div style={{textAlign:"center",padding:"80px 20px",border:"1px dashed var(--border)",borderRadius:16}}>
              <div style={{fontSize:52,marginBottom:14}}>🏁</div>
              <div className="syne" style={{fontSize:22,fontWeight:800,marginBottom:10}}>No hackathons available right now</div>
              <div style={{color:"var(--text2)",fontSize:14,lineHeight:1.8}}>
                {domain!=="All"||mode!=="All"||city!=="All"||team!=="All"||search
                  ? "No results match your filters. Try resetting filters or a different search."
                  : "All hackathons have closed or none have been scraped yet. Check back in a few hours — scrapers run every 6 hours automatically."}
              </div>
            </div>
          ) : (
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))",gap:15}}>
                {paginated.map(h=><HackCard key={h._id} h={h} onClick={setModal}/>)}
              </div>
              {/* Pagination */}
              {pages>1 && (
                <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:7,marginTop:28,flexWrap:"wrap"}}>
                  <button onClick={()=>{setPage(p=>Math.max(1,p-1));window.scrollTo(0,200);}} disabled={page===1} style={{padding:"7px 14px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:page===1?"var(--text3)":"var(--text2)",cursor:page===1?"not-allowed":"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>← Prev</button>
                  {Array.from({length:Math.min(pages,7)},(_,i)=>{
                    let p;
                    if(pages<=7) p=i+1;
                    else if(page<=4) p=i+1;
                    else if(page>=pages-3) p=pages-6+i;
                    else p=page-3+i;
                    return(
                      <button key={p} onClick={()=>{setPage(p);window.scrollTo(0,200);}} style={{width:36,height:36,borderRadius:8,border:"1px solid var(--border)",background:p===page?"var(--cyan)":"var(--card)",color:p===page?"#000":"var(--text2)",cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>{p}</button>
                    );
                  })}
                  <button onClick={()=>{setPage(p=>Math.min(pages,p+1));window.scrollTo(0,200);}} disabled={page===pages} style={{padding:"7px 14px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:page===pages?"var(--text3)":"var(--text2)",cursor:page===pages?"not-allowed":"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>Next →</button>
                </div>
              )}
              {data.length>0 && (
                <div style={{textAlign:"center",marginTop:12,fontSize:12,color:"var(--text3)"}}>
                  Showing {(page-1)*HACK_PER_PAGE+1}–{Math.min(page*HACK_PER_PAGE,data.length)} of {data.length} hackathons
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────
   INTERNSHIPS PAGE
──────────────────────────────────────────────── */
const ITEMS_PER_PAGE = 20;
const InternshipsPage = () => {
  const [search,setSearch]=useState(""); const [ds,setDs]=useState("");
  const [location,setLocation]=useState("All");
  const [isRemote,setIsRemote]=useState("All");
  const [skill,setSkill]=useState("All");
  const [iPage,setIPage]=useState(1);
  useEffect(()=>{const t=setTimeout(()=>setDs(search),350);return()=>clearTimeout(t);},[search]);
  // Reset to page 1 whenever any filter changes
  useEffect(()=>{ setIPage(1); },[ds,location,isRemote,skill]);
  const {data,loading,total} = useInternships({ds,location,isRemote});
  const filtered = skill==="All" ? data : data.filter(i=>(i.skills||[]).some(s=>s.toLowerCase().includes(skill.toLowerCase())));
  const iPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((iPage-1)*ITEMS_PER_PAGE, iPage*ITEMS_PER_PAGE);
  const LOCATIONS=["All","Bangalore","Mumbai","Delhi","Hyderabad","Pune","Chennai","Remote/WFH"];
  const SKILLS=["All","Python","React","JavaScript","Java","Data Science","ML/AI","Android","Node.js","Cloud/AWS"];
  const hasFilter = location!=="All"||skill!=="All"||isRemote!=="All"||search;
  const internLogo = (company="") => {
    const n=company.toLowerCase();
    if(n.includes("google"))return"🔵"; if(n.includes("microsoft"))return"💙";
    if(n.includes("amazon"))return"🟠"; if(n.includes("flipkart"))return"🛒";
    if(n.includes("zomato"))return"🔴"; if(n.includes("swiggy"))return"🟠";
    if(n.includes("razorpay"))return"🟢"; if(n.includes("cred"))return"⚫";
    if(n.includes("meesho"))return"🟣"; if(n.includes("dream11"))return"🏏";
    if(n.includes("ibm"))return"🔷"; if(n.includes("infosys"))return"🟦";
    if(n.includes("wipro"))return"⬛"; if(n.includes("tcs"))return"🔵";
    if(n.includes("paytm"))return"💳";
    const fb=["🔴","🟡","🟢","🔵","🟣","🟠","🔶","🔹","🌟","💎"];
    return fb[(company||"?").charCodeAt(0)%fb.length];
  };
  return (
    <div style={{paddingTop:64}}>
      {/* Header */}
      <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"32px 24px 24px"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div className="sl">Opportunities</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:16}}>
            <div>
              <h1 className="syne" style={{fontSize:34,fontWeight:800,marginBottom:4}}>💼 Tech Internships</h1>
              <p style={{color:"var(--text2)",fontSize:14}}>Top engineering internships — direct apply links only.</p>
            </div>
            <div style={{textAlign:"right"}}>
              <div className="syne" style={{fontSize:32,fontWeight:800,color:"var(--cyan)"}}>{filtered.length||total}</div>
              <div style={{fontSize:12,color:"var(--text2)"}}>open internships</div>
            </div>
          </div>
          <div style={{position:"relative",maxWidth:540}}>
            <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:"var(--text3)"}}>🔍</span>
            <input className="input" placeholder="Search companies, roles, skills…" value={search} onChange={e=>setSearch(e.target.value)} style={{padding:"12px 16px 12px 42px",fontSize:14}}/>
          </div>
        </div>
      </div>

      {/* Body — sidebar + cards */}
      <div style={{maxWidth:1200,margin:"0 auto",padding:"24px",display:"flex",gap:20,alignItems:"flex-start"}}>

        {/* LEFT SIDEBAR FILTERS */}
        <div style={{width:220,flexShrink:0,background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:18,position:"sticky",top:80}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <span style={{fontWeight:700,fontSize:14}}>⚙️ Filters</span>
            {hasFilter && <button onClick={()=>{setLocation("All");setSkill("All");setIsRemote("All");setSearch("");}} style={{fontSize:11,color:"var(--pink)",background:"transparent",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>✕ Reset</button>}
          </div>

          {/* CITY */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>📍 City</div>
            {LOCATIONS.map(l=>(
              <button key={l} onClick={()=>setLocation(l)} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",borderRadius:8,border:"none",background:location===l?"var(--cyan)":"transparent",color:location===l?"#000":"var(--text2)",cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif",fontWeight:location===l?700:400,marginBottom:2,transition:"all .15s"}}>
                {l}
              </button>
            ))}
          </div>

          <div style={{height:1,background:"var(--border)",margin:"8px 0 16px"}}/>

          {/* SKILL */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>⚡ Skill</div>
            {SKILLS.map(s=>(
              <button key={s} onClick={()=>setSkill(s)} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",borderRadius:8,border:"none",background:skill===s?"var(--cyan)":"transparent",color:skill===s?"#000":"var(--text2)",cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif",fontWeight:skill===s?700:400,marginBottom:2,transition:"all .15s"}}>
                {s}
              </button>
            ))}
          </div>

          <div style={{height:1,background:"var(--border)",margin:"8px 0 16px"}}/>

          {/* REMOTE toggle */}
          <button onClick={()=>setIsRemote(isRemote==="Remote"?"All":"Remote")} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 10px",borderRadius:8,border:`1px solid ${isRemote==="Remote"?"var(--green)":"var(--border)"}`,background:isRemote==="Remote"?"rgba(0,255,136,.1)":"transparent",color:isRemote==="Remote"?"var(--green)":"var(--text2)",cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif",fontWeight:isRemote==="Remote"?700:400,transition:"all .15s"}}>
            🏠 Remote / WFH Only
          </button>
        </div>

        {/* RIGHT CARDS */}
        <div style={{flex:1,minWidth:0}}>
          {loading ? (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:15}}>
              {[1,2,3,4,5,6].map(i=><div key={i} className="skel" style={{height:220,borderRadius:16}}/>)}
            </div>
          ) : filtered.length===0 ? (
            <div style={{textAlign:"center",padding:"80px 20px",border:"1px dashed var(--border)",borderRadius:16}}>
              <div style={{fontSize:52,marginBottom:14}}>💼</div>
              <div className="syne" style={{fontSize:22,fontWeight:800,marginBottom:10}}>No internships available right now</div>
              <div style={{color:"var(--text2)",fontSize:14,lineHeight:1.8}}>
                {hasFilter ? "No internships match your filters. Try resetting." : "Listings refresh automatically every 12 hours."}
              </div>
            </div>
          ) : (
            <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:15}}>
              {paginated.map(i=>(
                <div key={i._id} className="hcard" style={{padding:20}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                    <div style={{display:"flex",gap:12,alignItems:"center"}}>
                      <div style={{width:46,height:46,borderRadius:12,background:"var(--bg3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,border:"1px solid var(--border)",flexShrink:0}}>
                        {internLogo(i.company)}
                      </div>
                      <div>
                        <div className="syne" style={{fontWeight:700,fontSize:14,lineHeight:1.3}}>{i.company}</div>
                        <div style={{color:"var(--text2)",fontSize:12,marginTop:2}}>{i.role}</div>
                      </div>
                    </div>
                    <span className="badge b-open" style={{flexShrink:0}}>OPEN</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:12}}>
                    {[["💰","Stipend",i.stipend],["📅","Duration",i.duration],["📍","Location",i.location],["⏰","Deadline",i.deadline?fmtDate(i.deadline):"—"]].map(([ic,lb,vl])=>(
                      <div key={lb} style={{background:"var(--bg3)",borderRadius:8,padding:"6px 9px"}}>
                        <div style={{fontSize:10,color:"var(--text3)",marginBottom:2}}>{ic} {lb}</div>
                        <div className="mono" style={{fontSize:11,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{vl||"—"}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:13}}>
                    {(i.skills||[]).slice(0,4).map(s=><span key={s} style={{padding:"3px 8px",borderRadius:6,fontSize:11,background:"rgba(0,212,255,.08)",color:"var(--cyan)",border:"1px solid rgba(0,212,255,.2)"}}>{s}</span>)}
                  </div>
                  <button className="btn-p" style={{width:"100%",justifyContent:"center",padding:9,fontSize:13}} onClick={()=>window.open(i.applyLink,"_blank")}>Apply Now → {i.company}</button>
                </div>
              ))}
            </div>
            {/* Pagination */}
            {iPages > 1 && (
              <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:7,marginTop:28,flexWrap:"wrap"}}>
                <button onClick={()=>{setIPage(p=>Math.max(1,p-1));window.scrollTo(0,200);}} disabled={iPage===1} style={{padding:"7px 14px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:iPage===1?"var(--text3)":"var(--text2)",cursor:iPage===1?"not-allowed":"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>← Prev</button>
                {Array.from({length:Math.min(iPages,7)},(_,i)=>{
                  let p;
                  if(iPages<=7) p=i+1;
                  else if(iPage<=4) p=i+1;
                  else if(iPage>=iPages-3) p=iPages-6+i;
                  else p=iPage-3+i;
                  return(
                    <button key={p} onClick={()=>{setIPage(p);window.scrollTo(0,200);}} style={{width:36,height:36,borderRadius:8,border:"1px solid var(--border)",background:p===iPage?"var(--cyan)":"var(--card)",color:p===iPage?"#000":"var(--text2)",cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>{p}</button>
                  );
                })}
                <button onClick={()=>{setIPage(p=>Math.min(iPages,p+1));window.scrollTo(0,200);}} disabled={iPage===iPages} style={{padding:"7px 14px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:iPage===iPages?"var(--text3)":"var(--text2)",cursor:iPage===iPages?"not-allowed":"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>Next →</button>
              </div>
            )}
            {filtered.length>0 && (
              <div style={{textAlign:"center",marginTop:12,fontSize:12,color:"var(--text3)"}}>
                Showing {(iPage-1)*ITEMS_PER_PAGE+1}–{Math.min(iPage*ITEMS_PER_PAGE,filtered.length)} of {filtered.length} internships
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────
   RESOURCES PAGE
──────────────────────────────────────────────── */
const RESOURCES=[
  {icon:"🏆",title:"How to Win Hackathons — MLH Guide",desc:"Official MLH guide covering ideation, execution, pitching and what judges look for.",tag:"Strategy",color:"var(--cyan)",time:"10 min",url:"https://guide.mlh.io"},
  {icon:"💡",title:"Devpost Hackathon Listings",desc:"Browse 1000s of active hackathons globally. Filter by prize, theme, and eligibility.",tag:"Find Hacks",color:"var(--yellow)",time:"Browse",url:"https://devpost.com/hackathons"},
  {icon:"🛠️",title:"Top GitHub Student Developer Pack",desc:"Free tools for students — AWS, GitHub Copilot, Notion, Figma, MongoDB Atlas and 100+ more.",tag:"Tools",color:"var(--green)",time:"Free",url:"https://education.github.com/pack"},
  {icon:"🤝",title:"Find Teammates — Devpost Forum",desc:"Post your hackathon and find co-hackers with the right skills for your team.",tag:"Team",color:"var(--purple)",time:"Browse",url:"https://devpost.com/hackathons"},
  {icon:"🎤",title:"How to Demo at a Hackathon — Y Combinator",desc:"YC's advice on how to present your project clearly and impress judges in under 3 minutes.",tag:"Pitch",color:"var(--orange)",time:"5 min",url:"https://www.ycombinator.com/library/6p-how-to-pitch-your-startup"},
  {icon:"📋",title:"Unstop — India Hackathons & Competitions",desc:"India's biggest platform for hackathons, competitions, and internships. Register and compete.",tag:"India",color:"var(--pink)",time:"Browse",url:"https://unstop.com/hackathons"},
  {icon:"🧠",title:"LeetCode — Practice DSA",desc:"Sharpen your coding skills before hackathons. Practice data structures and algorithms.",tag:"Coding",color:"var(--cyan)",time:"Practice",url:"https://leetcode.com"},
  {icon:"🚀",title:"Devfolio — Indian Hackathons",desc:"India's leading hackathon platform. Find, register and submit to top Indian hackathons.",tag:"India",color:"var(--yellow)",time:"Browse",url:"https://devfolio.co/hackathons"},
  {icon:"📖",title:"HackerEarth Challenges",desc:"Coding challenges, hackathons and hiring challenges from top tech companies.",tag:"Coding",color:"var(--green)",time:"Browse",url:"https://www.hackerearth.com/challenges/"},
];
const ResourcesPage = () => (
  <div style={{paddingTop:64}}>
    <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"56px 24px 48px"}}>
      <div style={{maxWidth:900,margin:"0 auto",textAlign:"center"}}>
        <div className="sl" style={{justifyContent:"center"}}>Knowledge Hub</div>
        <h1 className="syne" style={{fontSize:40,fontWeight:800,marginBottom:14}}>📚 Hackathon <span className="gtext">Resources</span></h1>
        <p style={{color:"var(--text2)",fontSize:15,lineHeight:1.75,maxWidth:540,margin:"0 auto"}}>Everything you need to go from first-timer to champion.</p>
      </div>
    </div>
    <div style={{maxWidth:1200,margin:"0 auto",padding:"48px 24px"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:18,marginBottom:50}}>
        {RESOURCES.map((r,i)=>(
          <div key={i} className="hcard" style={{padding:28}}>
            <div style={{width:50,height:50,borderRadius:13,marginBottom:16,background:`${r.color}18`,border:`1px solid ${r.color}28`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:25}}>{r.icon}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <h3 className="syne" style={{fontWeight:700,fontSize:15,flex:1}}>{r.title}</h3>
              <span style={{padding:"3px 7px",borderRadius:5,fontSize:10,background:`${r.color}15`,color:r.color,border:`1px solid ${r.color}25`,marginLeft:7,whiteSpace:"nowrap"}}>{r.tag}</span>
            </div>
            <p style={{color:"var(--text2)",fontSize:13,lineHeight:1.65,marginBottom:16}}>{r.desc}</p>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span className="mono" style={{fontSize:10,color:"var(--text3)"}}>⏱ {r.time} read</span>
              <button className="btn-g" style={{padding:"5px 13px",fontSize:12}} onClick={()=>window.open(r.url,"_blank")}>Visit →</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:34}}>
        <h2 className="syne" style={{fontSize:24,fontWeight:800,marginBottom:24}}>⚡ Quick Tips</h2>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
          {[{n:"01",t:"Pick a problem you're genuinely excited about — passion drives productivity at 3 AM.",c:"var(--cyan)"},{n:"02",t:"Use boilerplates. Never build auth from scratch during a 24-hour event.",c:"var(--green)"},{n:"03",t:"Your MVP must work end-to-end. A working demo beats perfect design every time.",c:"var(--purple)"},{n:"04",t:"Practise your 3-minute pitch. Most teams demo too much and explain too little.",c:"var(--orange)"},{n:"05",t:"Rest for at least 4 hours. A tired brain makes bad architecture decisions.",c:"var(--pink)"},{n:"06",t:"Network with other teams. Your next co-founder is at a hackathon.",c:"var(--yellow)"}].map(t=>(
            <div key={t.n} style={{background:"var(--bg3)",borderRadius:11,padding:"14px 16px",borderLeft:`3px solid ${t.c}`,border:`1px solid ${t.c}18`}}>
              <div className="mono" style={{color:t.c,fontSize:17,fontWeight:700,marginBottom:7}}>{t.n}</div>
              <div style={{fontSize:13,color:"var(--text2)",lineHeight:1.65}}>{t.t}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

/* ────────────────────────────────────────────────
   FOOTER
──────────────────────────────────────────────── */
const Footer = ({setPage}) => (
  <footer style={{background:"var(--bg2)",borderTop:"1px solid var(--border)",padding:"44px 24px 28px"}}>
    <div style={{maxWidth:1200,margin:"0 auto"}}>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:34,marginBottom:38}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,var(--cyan),var(--green))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>⚡</div>
            <span className="syne" style={{fontSize:18,fontWeight:800}}>Hack<span style={{color:"var(--cyan)"}}>India</span></span>
          </div>
          <p style={{color:"var(--text2)",fontSize:13,lineHeight:1.7,maxWidth:270}}>India's #1 hackathon discovery platform. AI agents scrape 7+ platforms every 6 hours — only live, open hackathons shown.</p>
          <div style={{display:"flex",gap:8,marginTop:16}}>
            {["Twitter","GitHub","LinkedIn","Discord"].map(s=><div key={s} style={{padding:"4px 10px",borderRadius:7,background:"var(--card)",border:"1px solid var(--border)",fontSize:11,color:"var(--text2)",cursor:"pointer"}}>{s}</div>)}
          </div>
        </div>
        {[["Platform",["Home","Hackathons","Internships","Resources"]],["Scrapers",["Devpost","Devfolio","Hack2Skill","Internshala","Lablab.ai","Remotive"]],["About",["How it works","AI Agents","Data Policy","Contact"]]].map(([title,links])=>(
          <div key={title}>
            <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",letterSpacing:".1em",textTransform:"uppercase",marginBottom:12}}>{title}</div>
            {links.map(l=><div key={l} style={{color:"var(--text2)",fontSize:13,marginBottom:8,cursor:"pointer"}} onClick={()=>["Home","Hackathons","Internships","Resources"].includes(l)&&setPage(l.toLowerCase())}>{l}</div>)}
          </div>
        ))}
      </div>
      <div style={{borderTop:"1px solid var(--border)",paddingTop:20,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:12,color:"var(--text3)"}}>© 2025 HackIndia · Built for Indian engineering students 🇮🇳</div>
        <div className="mono badge b-open" style={{fontSize:9}}>🤖 AI Agents · Updates every 6h</div>
      </div>
    </div>
  </footer>
);

/* ────────────────────────────────────────────────
   APP ROOT
──────────────────────────────────────────────── */
export default function App() {
  const [page,setPage] = useState("home");
  const [dark,setDark] = useState(false);
  const {data:allHacks} = useHackathons({},1);

  useEffect(()=>{
    document.body.className = dark?"":"light";
    document.body.style.background="var(--bg)";
    document.body.style.color="var(--text)";
  },[dark]);

  return (
    <>
      <GS/>
      <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
        <Navbar page={page} setPage={setPage} dark={dark} setDark={setDark}/>
        <main style={{animation:"fade-in .3s ease"}}>
          {page==="home"        && <HomePage       setPage={setPage}/>}
          {page==="hackathons"  && <HackathonsPage/>}
          {page==="internships" && <InternshipsPage/>}
          {page==="resources"   && <ResourcesPage/>}
        </main>
        <Footer setPage={setPage}/>
        <HackBot hackathons={allHacks}/>
      </div>
    </>
  );
}
