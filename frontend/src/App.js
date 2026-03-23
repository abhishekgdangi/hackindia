/**
 * HackIndia.jsx  — Complete React Frontend
 * Talks to Express backend at /api/*
 * HackBot uses Groq (free API) directly from the browser
 * Falls back to static seed data if the backend is unreachable
 */

import React, { useState, useEffect, useRef, useCallback } from "react";

/* ────────────────────────────────────────────────
   CONFIG
──────────────────────────────────────────────── */
const API_BASE   = "https://hackindia-0pum.onrender.com/api";
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
// Fisher-Yates shuffle — mix results so same platform doesn't cluster
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Shuffle within date groups so same platform doesn't cluster, but soonest still first
function shuffleGroups(arr) {
  if (!arr.length) return arr;
  const groups = {};
  arr.forEach(e => {
    const key = e.date || "TBD";
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });
  const result = [];
  Object.keys(groups).forEach(k => {
    const g = groups[k];
    for (let i = g.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [g[i], g[j]] = [g[j], g[i]];
    }
    result.push(...g);
  });
  return result;
}


// Sort by date ascending (soonest first), TBD goes last
function sortByDate(arr) {
  return [...arr].sort((a, b) => {
    const da = a.deadline || a.date || a.startDate || "";
    const db = b.deadline || b.date || b.startDate || "";
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    const ta = new Date(da).getTime();
    const tb = new Date(db).getTime();
    if (isNaN(ta) && isNaN(tb)) return 0;
    if (isNaN(ta)) return 1;
    if (isNaN(tb)) return -1;
    return ta - tb;
  });
}

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

    apiFetch("/hackathons", { ...filters, limit:1000 })  // page handled client-side
      .then(j => {
        if (fetchId.current !== id) return;
        setData(shuffleGroups(sortByDate(j.data || [])));
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

    const params = { limit:1000 };
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
function useEvents({type="", city="All", price="All", domain="All", search=""}={}) {
  const [data,    setData]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const lastKey = useRef("");
  const fetchId = useRef(0);

  useEffect(() => {
    const key = [type,city,price,domain,search].join("|");
    if (key === lastKey.current) return;
    lastKey.current = key;
    const id = ++fetchId.current;
    setLoading(true);
    const params = { limit:1000 };
    if(type   && type   !=="All") params.type   = type;
    if(city   && city   !=="All") params.location = city;
    if(price  && price  !=="All") params.price  = price;
    if(search) params.search = search;
    apiFetch("/events", params)
      .then(j => {
        if(fetchId.current!==id) return;
        let arr = j.data||[];
        // Client-side domain filter (eventType contains domain keyword)
        if(domain && domain!=="All") {
          const dl = domain.toLowerCase();
          arr = arr.filter(e=>(e.eventType||"").toLowerCase().includes(dl)||(e.title||"").toLowerCase().includes(dl)||(e.description||"").toLowerCase().includes(dl));
        }
        // Filter out hackathon/internship types (belong to other pages)
        arr = arr.filter(e => e.eventType!=="Hackathon" && e.eventType!=="Internship Event");
        // Sort by date ascending (soonest first, TBD last)
        arr.sort((a,b)=>{
          const da = a.date ? new Date(a.date) : null;
          const db = b.date ? new Date(b.date) : null;
          if(!da && !db) return 0;
          if(!da) return 1;
          if(!db) return -1;
          return da - db;
        });
        // Shuffle within same-date groups to mix platforms
        arr = shuffleGroups(arr);
        setData(shuffle(arr)); setTotal(j.total||0);
      })
      .catch(() => { if(fetchId.current===id) { setData([]); setTotal(0); } })
      .finally(() => { if(fetchId.current===id) setLoading(false); });
  }, [type, city, price, domain, search]);

  return { data, total, loading };
}

const getDays  = (d) => {
  if (!d) return 999;
  const diff = Math.ceil((new Date(d) - new Date()) / 86400000);
  return isNaN(diff) ? 999 : diff;
};
const fmtDate  = (d) => {
  if (!d) return "TBD";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d).slice(0,10) || "TBD";
  return dt.toLocaleDateString("en-IN", {day:"numeric", month:"short", year:"numeric"});
};
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
@media print{nav,footer,.btn-p,.btn-g,button{display:none!important}.no-print{display:none!important}body{background:#fff!important;color:#000!important}*{box-shadow:none!important}}
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
/* ── Logo helpers ───────────────────────────────────────────── */
// Returns a real logo URL or null
const getLogoUrl = (name="", organizer="", platform="", applyLink="") => {
  const n = name.toLowerCase();
  const o = organizer.toLowerCase();
  // Known domain map
  const domainMap = {
    google:"google.com", microsoft:"microsoft.com", amazon:"amazon.com",
    meta:"meta.com", apple:"apple.com", github:"github.com",
    aws:"aws.amazon.com", ibm:"ibm.com", flipkart:"flipkart.com",
    zomato:"zomato.com", swiggy:"swiggy.in", razorpay:"razorpay.com",
    infosys:"infosys.com", wipro:"wipro.com", tcs:"tcs.com",
    paytm:"paytm.com", meesho:"meesho.com", cred:"cred.club",
    devpost:"devpost.com", devfolio:"devfolio.co",
    unstop:"unstop.com", dorahacks:"dorahacks.io",
    hackerearth:"hackerearth.com", hackclub:"hackclub.com",
    mlh:"mlh.io", "hack club":"hackclub.com",
  };
  for (const [key, domain] of Object.entries(domainMap)) {
    if (n.includes(key) || o.includes(key)) {
      return `https://logo.clearbit.com/${domain}`;
    }
  }
  // Try to extract domain from applyLink
  try {
    if (applyLink && applyLink.startsWith("http")) {
      const host = new URL(applyLink).hostname.replace("www.","");
      return `https://logo.clearbit.com/${host}`;
    }
  } catch(_) {}
  return null;
};

// Emoji fallback
const hackLogoEmoji = (h) => {
  const n = (h.name||"").toLowerCase();
  const p = (h.sourcePlatform||"").toLowerCase();
  if (n.includes("ai")||n.includes("llm")||n.includes("machine")) return "🤖";
  if (n.includes("blockchain")||n.includes("web3"))  return "⛓️";
  if (n.includes("health")||n.includes("med"))       return "🏥";
  if (n.includes("finance")||n.includes("fintech"))  return "💰";
  if (n.includes("climate")||n.includes("green"))    return "🌱";
  if (n.includes("edu"))                             return "📚";
  if (p==="devfolio")    return "🚀"; if (p==="devpost")    return "💻";
  if (p==="unstop")      return "⚡"; if (p==="dorahacks")  return "🌐";
  if (p==="hackerearth") return "💡"; if (p==="hackclub")   return "🏫";
  const fb=["🔴","🟡","🟢","🔵","🟣","🟠","🔶","🔹","🌟","💎","🏆","🎪","🎭","🎨"];
  return fb[(h.name||"?").charCodeAt(0)%fb.length];
};

// Logo image component — shows real logo or emoji fallback
const LogoBox = ({name="",organizer="",platform="",applyLink="",size=44,radius=12,emoji=null}) => {
  const [imgOk, setImgOk] = useState(true);
  const url = getLogoUrl(name, organizer, platform, applyLink);
  const fb  = emoji || hackLogoEmoji({name,organizer,sourcePlatform:platform});
  return (
    <div style={{width:size,height:size,borderRadius:radius,background:"var(--bg3)",
      display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:size*0.5,flexShrink:0,border:"1px solid var(--border)",overflow:"hidden"}}>
      {url && imgOk
        ? <img src={url} alt={name} onError={()=>setImgOk(false)}
            style={{width:"75%",height:"75%",objectFit:"contain",borderRadius:4}}/>
        : fb}
    </div>
  );
};

// Legacy helper kept for ticker
const hackLogo = (h) => hackLogoEmoji(h);

const HackCard = ({ h, onClick }) => (
  <div className="hcard" onClick={()=>onClick(h)} style={{display:"flex",flexDirection:"column"}}>
    <div style={{padding:"20px 20px 16px",flex:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <LogoBox name={h.name} organizer={h.organizer} platform={h.sourcePlatform} applyLink={h.applyLink} size={44} radius={12}/>
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
      <div className="mono" style={{fontSize:11,color:getDays(h.registrationDeadline)<0?"var(--text3)":dcColor(h.registrationDeadline)}}>
        {!h.registrationDeadline ? "📅 Deadline TBD" :
         getDays(h.registrationDeadline) < 0 ? "⛔ Registration Closed" :
         getDays(h.registrationDeadline) === 0 ? "🔥 Closes Today" :
         `⏳ ${getDays(h.registrationDeadline)}d left · ${fmtDate(h.registrationDeadline)}`}
      </div>
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
              <LogoBox name={h.name} organizer={h.organizer} platform={h.sourcePlatform} applyLink={h.applyLink} size={60} radius={14}/>
              <div>
                <div className="syne" style={{fontSize:20,fontWeight:800,marginBottom:5}}>{h.name}</div>
                <div style={{color:"var(--text2)",fontSize:13,marginBottom:8}}>{h.organizer}</div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                  {getDays(h.registrationDeadline) >= 0
                    ? <span className="badge b-open">🟢 OPEN</span>
                    : <span className="badge" style={{background:"rgba(255,61,138,.15)",color:"var(--pink)",border:"1px solid rgba(255,61,138,.3)"}}>⛔ CLOSED</span>}
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
            {[["🏆","Prize",h.prize||"TBA"],["👥","Team",h.teamSizeLabel||"Any"],["📍","City",h.city],["🌐","Mode",h.mode||"—"]].map(([ic,lb,vl])=>(
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
      const res = await fetch(`${"https://hackindia-0pum.onrender.com/api"}/chat`, {
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
const TOOLS_MENU = [
  { id:"dsa",    icon:"🧠", label:"DSA Explorer",      desc:"22 patterns · Top 150 · Mock test" },
  { id:"cp",     icon:"🏆", label:"CP Contest Tracker", desc:"Live contests · Calendar view" },
  { id:"resume", icon:"📄", label:"Resume Analyzer",   desc:"ATS · JD match · 3-stage AI" },
];

const Navbar = ({page,setPage,dark,setDark}) => {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef(null);
  useEffect(()=>{
    const handler = e => { if(toolsRef.current && !toolsRef.current.contains(e.target)) setToolsOpen(false); };
    document.addEventListener("mousedown", handler);
    return ()=>document.removeEventListener("mousedown", handler);
  },[]);
  const isToolsActive = TOOLS_MENU.some(t=>t.id===page);
  return (
  <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:100,background:"var(--nav-bg)",backdropFilter:"blur(20px)",borderBottom:"1px solid var(--border)",padding:"0 24px",height:64,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
    <div style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}} onClick={()=>setPage("home")}>
      <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,var(--cyan),var(--green))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>⚡</div>
      <span className="syne" style={{fontSize:18,fontWeight:800}}>Hack<span style={{color:"var(--cyan)"}}>India</span></span>
      <span className="badge b-open" style={{fontSize:9}}>LIVE</span>
    </div>
    <div className="hm" style={{display:"flex",gap:4,alignItems:"center"}}>
      {[["home","◈ Home"],["hackathons","⚡ Hackathons"],["internships","💼 Internships"],["events","🗓️ Events"]].map(([id,lbl])=>(
        <button key={id} className={`nav-link ${page===id?"act":""}`} onClick={()=>setPage(id)}>{lbl}</button>
      ))}
      {/* Student Tools dropdown */}
      <div ref={toolsRef} style={{position:"relative"}}>
        <div className={`nav-link ${isToolsActive?"act":""}`}
          style={{display:"inline-flex",alignItems:"center",gap:0,padding:0,cursor:"default"}}>
          <span onClick={()=>{ setPage("tools"); setToolsOpen(false); }} style={{padding:"6px 4px 6px 12px",cursor:"pointer"}}>🛠️ Tools</span>
          <span onClick={()=>setToolsOpen(o=>!o)} style={{fontSize:9,opacity:.7,padding:"6px 10px 6px 4px",cursor:"pointer",transform:toolsOpen?"rotate(180deg)":"rotate(0deg)",transition:"transform .2s",display:"inline-block"}}>▼</span>
        </div>
        {toolsOpen && (
          <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,background:"var(--card)",border:"1px solid var(--border2)",borderRadius:14,padding:8,minWidth:220,boxShadow:"0 12px 40px rgba(0,0,0,.4)",zIndex:200,animation:"fade-in .15s ease"}}>
            <div style={{fontSize:9,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",padding:"4px 10px 8px"}}>Student Tools</div>
            {TOOLS_MENU.map(t=>(
              <button key={t.id} onClick={()=>{setPage(t.id);setToolsOpen(false);}}
                style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",borderRadius:9,border:"none",background:page===t.id?"rgba(124,77,255,.15)":"transparent",cursor:"pointer",textAlign:"left",transition:"background .15s"}}>
                <span style={{fontSize:18,flexShrink:0}}>{t.icon}</span>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:page===t.id?"var(--purple)":"var(--text)"}}>{t.label}</div>
                  <div style={{fontSize:11,color:"var(--text3)"}}>{t.desc}</div>
                </div>
              </button>
            ))}
            <div style={{margin:"6px 0",height:1,background:"var(--border)"}}/>
            <div style={{padding:"6px 10px",fontSize:10,color:"var(--text3)"}}>More tools coming soon…</div>
          </div>
        )}
      </div>
      <button className={`nav-link ${page==="resources"?"act":""}`} onClick={()=>setPage("resources")}>📚 Resources</button>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <button onClick={()=>setDark(!dark)} style={{width:34,height:34,borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>{dark?"☀️":"🌙"}</button>
    </div>
  </nav>
  );
};

/* ────────────────────────────────────────────────
   HOME PAGE
──────────────────────────────────────────────── */
const HomePage = ({setPage}) => {
  const {data:featured,loading} = useHackathons({sort:"newest"});
  const {data:featuredInterns,loading:iLoading} = useInternships({});
  const {data:featuredEvents,loading:evLoading} = useEvents({});
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
            ...featured.slice(0,6).map(h=><HackCard key={h._id} h={h} onClick={()=>setPage("hackathons")}/>),
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
            <div key={i._id} className="hcard" style={{padding:20,cursor:"default",display:"flex",flexDirection:"column"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div style={{display:"flex",gap:12,alignItems:"center"}}>
                  <div style={{width:44,height:44,borderRadius:12,background:"var(--bg3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,border:"1px solid var(--border)",flexShrink:0}}>
                    {["Google","Microsoft","Amazon","Meta","Apple"].some(b=>i.company?.includes(b)) ? <LogoBox name={i.company} organizer={i.company} platform="internshala" applyLink={i.applyLink} size={28} radius={7}/> : "💼"}
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
              <button className="btn-p" style={{width:"100%",justifyContent:"center",padding:"7px",fontSize:12,marginTop:"auto"}} onClick={()=>window.open(i.applyLink,"_blank")}>Apply Now →</button>
            </div>
          ))}
          {/* Browse all internships card */}
          {!iLoading && featuredInterns.length > 0 && (
            <div onClick={()=>setPage("internships")} style={{gridColumn:"1/-1",background:"linear-gradient(135deg,var(--card2),var(--bg3))",border:"2px dashed var(--border2)",borderRadius:14,display:"flex",flexDirection:"row",alignItems:"center",justifyContent:"space-between",cursor:"pointer",padding:"22px 32px",gap:24,transition:"all .25s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--green)";e.currentTarget.style.background="linear-gradient(135deg,rgba(0,255,136,.06),var(--bg3))";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border2)";e.currentTarget.style.background="linear-gradient(135deg,var(--card2),var(--bg3))"}}>
              <div style={{display:"flex",alignItems:"center",gap:18}}>
                <div style={{fontSize:36}}>💼</div>
                <div>
                  <div className="syne" style={{fontSize:18,fontWeight:800,color:"var(--green)"}}>Browse All Internships</div>
                  <div style={{fontSize:13,color:"var(--text2)",marginTop:3}}>1000+ live internships from Internshala · Filter by skill, city, and remote</div>
                </div>
              </div>
              <div style={{padding:"10px 26px",background:"var(--green)",color:"#000",borderRadius:10,fontWeight:700,fontSize:14,flexShrink:0}}>View All →</div>
            </div>
          )}
        </div>
      </div>

      {/* Featured Events */}
      <div style={{background:"var(--bg2)",padding:"56px 24px",borderTop:"1px solid var(--border)"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div className="sl">Tech Community</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
            <h2 className="syne" style={{fontSize:30,fontWeight:800}}>🗓️ Upcoming Events</h2>
            <button className="btn-g" style={{padding:"7px 16px",fontSize:13}} onClick={()=>setPage("events")}>View All →</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))",gap:16}}>
            {evLoading ? [1,2,3].map(i=><div key={i} className="skel" style={{height:180,borderRadius:16}}/>) :
             featuredEvents.slice(0,6).map(e=><EventCard key={e._id} e={e} compact/>)}
            {!evLoading && featuredEvents.length > 0 && (
              <div onClick={()=>setPage("events")} style={{gridColumn:"1/-1",background:"linear-gradient(135deg,var(--card2),var(--bg3))",border:"2px dashed var(--border2)",borderRadius:14,display:"flex",flexDirection:"row",alignItems:"center",justifyContent:"space-between",cursor:"pointer",padding:"22px 32px",gap:24,transition:"all .25s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--purple)";e.currentTarget.style.background="linear-gradient(135deg,rgba(124,77,255,.06),var(--bg3))";}} onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border2)";e.currentTarget.style.background="linear-gradient(135deg,var(--card2),var(--bg3))"}}>
                <div style={{display:"flex",alignItems:"center",gap:18}}>
                  <div style={{fontSize:36}}>🗓️</div>
                  <div>
                    <div className="syne" style={{fontSize:18,fontWeight:800,color:"var(--purple)"}}>Browse All Tech Events</div>
                    <div style={{fontSize:13,color:"var(--text2)",marginTop:3}}>Conferences, meetups, workshops, AI events & more · Scraped from 9 platforms</div>
                  </div>
                </div>
                <div style={{padding:"10px 26px",background:"var(--purple)",color:"#fff",borderRadius:10,fontWeight:700,fontSize:14,flexShrink:0}}>View All →</div>
              </div>
            )}
          </div>
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
const CITY_OPT   = ["All","Online","Bengaluru","Delhi","Mumbai","Hyderabad","Pune","Chennai","Kolkata","Noida","Gurugram","Jaipur"];
const MODE_OPT   = ["All","Online","Offline","Online + Offline"];
const TEAM_OPT   = ["All","Solo","2–4","5+"];

const HackathonsPage = () => {
  const [search,setSearch]=useState(""); const [domain,setDomain]=useState("All");
  const [mode,setMode]=useState("All");   const [city,setCity]=useState("All");
  const [team,setTeam]=useState("All");   const [sort,setSort]=useState("deadline");
  const [page,setPage]=useState(1);       const [modal,setModal]=useState(null);
  const [ds,setDs]=useState(""); const [hackView,setHackView]=useState("list");
  const [hackCalMonth,setHackCalMonth]=useState(new Date()); const [hackSelDate,setHackSelDate]=useState(null);
  useEffect(()=>{const t=setTimeout(()=>setDs(search),350);return()=>clearTimeout(t);},[search]);
  const {data:rawHacks,total,loading,offline} = useHackathons({domain,mode,city,teamSize:team,sort,search:ds},page);
  // Filter: keep online hackathons from anywhere, but offline only if India location
  const INDIA_RE = /india|bangalore|bengaluru|mumbai|delhi|hyderabad|pune|chennai|kolkata|noida|gurugram|kochi|ahmedabad|jaipur/i;
  const data = rawHacks.filter(h => {
    const isOnline = (h.mode||"").toLowerCase()==="online" || (h.city||"").toLowerCase()==="online";
    if (isOnline) return true;
    // Offline: only show if India location or no location info
    const loc = (h.city||h.location||h.name||"").toLowerCase();
    return !loc || INDIA_RE.test(loc) || loc.includes("india");
  });
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
                {offline && <span className="mono" style={{fontSize:9,color:"#ff4b4b",background:"rgba(255,75,75,.1)",padding:"2px 7px",borderRadius:5}}>⚠ Backend offline — please wait, server is waking up...</span>}
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
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{position:"relative",flex:1,minWidth:240}}>
              <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:"var(--text3)"}}>🔍</span>
              <input className="input" placeholder="Search hackathons, organizers, technologies…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} style={{padding:"12px 16px 12px 42px",fontSize:14}}/>
            </div>
            <button onClick={()=>setHackView(v=>v==="list"?"calendar":"list")}
              style={{padding:"10px 18px",borderRadius:10,border:`1px solid ${hackView==="calendar"?"var(--purple)":"var(--border)"}`,background:hackView==="calendar"?"rgba(124,77,255,.15)":"var(--card)",color:hackView==="calendar"?"var(--purple)":"var(--text2)",cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif",fontWeight:hackView==="calendar"?700:400,whiteSpace:"nowrap"}}>
              {hackView==="calendar"?"☰ List View":"📅 Calendar View"}
            </button>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"26px 24px",display:"grid",gridTemplateColumns:"245px 1fr",gap:24}}>
        {/* Calendar View */}
        {hackView==="calendar" && (() => {
          const calYear=hackCalMonth.getFullYear(); const calMon=hackCalMonth.getMonth();
          const firstDay=new Date(calYear,calMon,1).getDay();
          const daysInMonth=new Date(calYear,calMon+1,0).getDate();
          const calDays=Array.from({length:firstDay+daysInMonth},(_,i)=>i<firstDay?null:i-firstDay+1);
          const todayStr=new Date().toLocaleDateString("en-CA");
          const grouped={};
          data.forEach(h=>{
            if(!h.registrationDeadline) return;
            const key=new Date(h.registrationDeadline).toLocaleDateString("en-CA");
            if(!grouped[key]) grouped[key]=[];
            grouped[key].push(h);
          });
          const dayContests=day=>{
            if(!day) return [];
            const key=`${calYear}-${String(calMon+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            return grouped[key]||[];
          };
          return (
            <div style={{gridColumn:"1/-1"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:20}}>
                <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                    <button onClick={()=>setHackCalMonth(new Date(calYear,calMon-1,1))} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"6px 14px",cursor:"pointer",color:"var(--text2)"}}>‹</button>
                    <div className="syne" style={{fontSize:18,fontWeight:800}}>{hackCalMonth.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</div>
                    <button onClick={()=>setHackCalMonth(new Date(calYear,calMon+1,1))} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"6px 14px",cursor:"pointer",color:"var(--text2)"}}>›</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:8}}>
                    {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:"var(--text3)",padding:"4px 0"}}>{d}</div>)}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
                    {calDays.map((day,i)=>{
                      if(!day) return <div key={`e${i}`} style={{minHeight:72}}/>;
                      const key=`${calYear}-${String(calMon+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                      const items=dayContests(day); const isToday=key===todayStr; const isSel=hackSelDate===key;
                      return (
                        <div key={day} onClick={()=>items.length&&setHackSelDate(isSel?null:key)}
                          style={{minHeight:72,border:`1px solid ${isSel?"var(--cyan)":isToday?"var(--purple)":"var(--border)"}`,borderRadius:9,padding:"5px 5px",cursor:items.length?"pointer":"default",background:isSel?"rgba(0,212,255,.08)":isToday?"rgba(124,77,255,.05)":"var(--bg)",transition:"all .15s"}}
                          onMouseEnter={e=>{if(items.length)e.currentTarget.style.borderColor="var(--cyan)";}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor=isSel?"var(--cyan)":isToday?"var(--purple)":"var(--border)";}}>
                          <div style={{fontSize:12,fontWeight:isToday?800:400,color:isToday?"var(--purple)":"var(--text)",textAlign:"right",marginBottom:3}}>{day}</div>
                          {items.slice(0,2).map((h,hi)=>(
                            <div key={hi} style={{fontSize:9,padding:"1px 4px",borderRadius:3,background:"rgba(0,212,255,.12)",color:"var(--cyan)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:1}}>⚡ {h.name.slice(0,12)}</div>
                          ))}
                          {items.length>2&&<div style={{fontSize:9,color:"var(--text3)"}}>+{items.length-2}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20,overflowY:"auto",maxHeight:600}}>
                  <div className="syne" style={{fontSize:15,fontWeight:800,marginBottom:14,color:"var(--text2)"}}>
                    {hackSelDate ? new Date(hackSelDate+"T00:00:00").toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"}) : "Click a date to see hackathons"}
                  </div>
                  {hackSelDate && (grouped[hackSelDate]||[]).map(h=>(
                    <div key={h._id} onClick={()=>setModal(h)} className="hcard" style={{padding:"12px 14px",marginBottom:8,cursor:"pointer"}}>
                      <div className="syne" style={{fontSize:13,fontWeight:700,marginBottom:4}}>{h.name}</div>
                      <div style={{fontSize:11,color:"var(--text2)",marginBottom:4}}>{h.organizer} · {h.mode}</div>
                      <div style={{fontSize:11,color:dcColor(h.registrationDeadline)}}>⏳ Deadline: {fmtDate(h.registrationDeadline)}</div>
                    </div>
                  ))}
                  {hackSelDate && !grouped[hackSelDate]?.length && <div style={{color:"var(--text3)",fontSize:13}}>No hackathons on this date.</div>}
                </div>
              </div>
            </div>
          );
        })()}
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
                Server is waking up, please refresh in 30 seconds.
              </div>
              <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"12px 20px",display:"inline-block",textAlign:"left"}}>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:6}}>Backend URL:</div>
                <code style={{fontSize:13,color:"var(--cyan)"}}>https://hackindia-0pum.onrender.com</code>
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
  // eslint-disable-next-line no-unused-vars
  const [intView,setIntView]=useState("list"); // eslint-disable-next-line no-unused-vars
  const [intCalMonth,setIntCalMonth]=useState(new Date()); // eslint-disable-next-line no-unused-vars
  const [intSelDate,setIntSelDate]=useState(null);
  useEffect(()=>{const t=setTimeout(()=>setDs(search),350);return()=>clearTimeout(t);},[search]);
  // Reset to page 1 whenever any filter changes
  useEffect(()=>{ setIPage(1); },[ds,location,isRemote,skill]);
  const {data,loading,total} = useInternships({ds,location,isRemote});
  const filtered = skill==="All" ? data : data.filter(i=>(i.skills||[]).some(s=>s.toLowerCase().includes(skill.toLowerCase())));
  const iPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((iPage-1)*ITEMS_PER_PAGE, iPage*ITEMS_PER_PAGE);
  const LOCATIONS=["All","Bengaluru","Mumbai","Delhi","Hyderabad","Pune","Chennai","Remote/WFH"];
  const SKILLS=["All","Python","React","JavaScript","Java","Data Science","ML/AI","Android","Node.js","Cloud/AWS"];
  const hasFilter = location!=="All"||skill!=="All"||isRemote!=="All"||search;
  // internLogo replaced by LogoBox component
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
                <div key={i._id} className="hcard" style={{padding:20,display:"flex",flexDirection:"column"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                    <div style={{display:"flex",gap:12,alignItems:"center"}}>
                      <LogoBox name={i.company} organizer={i.company} platform="internshala" applyLink={i.applyLink} size={46} radius={12}/>
                      <div>
                        <div className="syne" style={{fontWeight:700,fontSize:14,lineHeight:1.3}}>{i.company}</div>
                        <div style={{color:"var(--text2)",fontSize:12,marginTop:2}}>{i.role}</div>
                      </div>
                    </div>
                    <span className="badge" style={{flexShrink:0,background:!i.deadline||getDays(i.deadline)>=0?"rgba(0,255,136,.15)":"rgba(255,61,138,.15)",color:!i.deadline||getDays(i.deadline)>=0?"var(--green)":"var(--pink)",border:`1px solid ${!i.deadline||getDays(i.deadline)>=0?"rgba(0,255,136,.3)":"rgba(255,61,138,.3)"}`}}>
                      {!i.deadline||getDays(i.deadline)>=0?"✅ OPEN":"⛔ CLOSED"}
                    </span>
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
                  <button className="btn-p" style={{width:"100%",justifyContent:"center",padding:9,fontSize:13,marginTop:"auto"}} onClick={()=>window.open(i.applyLink,"_blank")}>Apply Now →</button>
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
   EVENT TYPE COLORS & HELPERS
──────────────────────────────────────────────── */
const EVENT_COLORS = {
  "Conference":       {bg:"rgba(0,212,255,.12)",   color:"var(--cyan)",    border:"rgba(0,212,255,.25)"},
  "Workshop":         {bg:"rgba(124,77,255,.12)",  color:"var(--purple)",  border:"rgba(124,77,255,.25)"},
  "Meetup":           {bg:"rgba(0,212,210,.12)",   color:"#00d4d2",        border:"rgba(0,212,210,.25)"},
  "Webinar":          {bg:"rgba(255,107,53,.12)",  color:"var(--orange)",  border:"rgba(255,107,53,.25)"},
  "Bootcamp":         {bg:"rgba(255,61,138,.12)",  color:"var(--pink)",    border:"rgba(255,61,138,.25)"},
  "AI/ML Event":      {bg:"rgba(124,77,255,.18)",  color:"#b490ff",        border:"rgba(124,77,255,.35)"},
  "Hackathon":        {bg:"rgba(0,255,136,.12)",   color:"var(--green)",   border:"rgba(0,255,136,.25)"},
  "Startup Event":    {bg:"rgba(255,214,10,.12)",  color:"var(--yellow)",  border:"rgba(255,214,10,.25)"},
  "Coding Competition":{bg:"rgba(0,212,255,.08)", color:"var(--cyan)",    border:"rgba(0,212,255,.2)"},
  "Internship Event": {bg:"rgba(0,255,136,.08)",   color:"var(--green)",   border:"rgba(0,255,136,.2)"},
  "Other":            {bg:"rgba(136,153,187,.12)", color:"var(--text2)",   border:"rgba(136,153,187,.25)"},
};

const EVENT_TYPE_OPTS = ["All","Conference","Workshop","Meetup","Webinar","Bootcamp","AI/ML Event","Startup Event","Coding Competition"];

/* ────────────────────────────────────────────────
   EVENT CARD
──────────────────────────────────────────────── */
const EVENT_PLATFORM_LOGO = (platform="", link="") => {
  const p = platform.toLowerCase();
  if(p.includes("eventbrite")) return "🎫";
  if(p.includes("google") || p.includes("gdg")) return "🔵";
  if(p.includes("luma")) return "🌙";
  if(p.includes("unstop")) return "🏆";
  if(p.includes("konfhub")) return "🎪";
  if(p.includes("hasgeek")) return "🛠";
  if(p.includes("dev.events")) return "📡";
  return "📅";
};

const fmtEventDate = (d) => {
  if(!d) return "TBD";
  const dt = new Date(d);
  if(isNaN(dt)) {
    // Try to parse "Mar 15, 2026" style strings
    const parsed = new Date(String(d));
    if(!isNaN(parsed)) return parsed.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
    return String(d);
  }
  return dt.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
};

const EventCard = ({e, compact=false}) => {
  // Robust online/offline detection — check location, mode, and description
  const locStr = (e.location||"").toLowerCase();
  const modeStr = (e.mode||"").toLowerCase();
  const isOnline = locStr==="online" || locStr==="virtual" || locStr==="remote"
    || modeStr.includes("online") || modeStr.includes("virtual")
    || (locStr==="" && !e.city);

  // City: show actual city name if offline, "Online" if online, "India" as last fallback
  const city = isOnline ? "Online"
    : (e.location && e.location!=="India" && e.location!=="Online" ? e.location : "India");

  // Clean short description
  const desc = (e.description||"").replace(/Tech event in.*Source:.*$/i,"").trim()
    || `${e.eventType||"Event"} · ${city}`;

  const dateStr = fmtEventDate(e.date);
  const hasLink = !!(e.registrationLink && e.registrationLink!=="#" && e.registrationLink!=="");

  // Skip hackathon/internship types in events page (they belong to other pages)
  const evType = (e.eventType==="Hackathon"||e.eventType==="Internship Event") ? "Event" : (e.eventType||"Event");
  const typeStyleFinal = EVENT_COLORS[evType] || EVENT_COLORS["Other"];

  return (
    <div className="hcard" style={{padding:20,display:"flex",flexDirection:"column",gap:10,cursor:"default",minHeight:280}}>

      {/* Row 1: Logo + Title + Type badge */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
        <div style={{display:"flex",gap:10,alignItems:"flex-start",flex:1,minWidth:0}}>
          <div style={{width:40,height:40,borderRadius:10,background:"var(--bg3)",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
            {EVENT_PLATFORM_LOGO(e.platform||"")}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div className="syne" style={{fontWeight:700,fontSize:13,lineHeight:1.4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{e.title}</div>
            <div style={{fontSize:10,color:"var(--text3)",marginTop:2,fontFamily:"'JetBrains Mono',monospace"}}>via {e.platform||"Unknown"}</div>
          </div>
        </div>
        <span style={{...typeStyleFinal,padding:"3px 9px",borderRadius:20,fontSize:10,fontWeight:700,
          fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap",flexShrink:0,
          border:`1px solid ${typeStyleFinal.border}`}}>{evType}</span>
      </div>

      {/* Row 2: Description */}
      {!compact && (
        <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.6,overflow:"hidden",display:"-webkit-box",
          WebkitLineClamp:2,WebkitBoxOrient:"vertical",minHeight:36}}>{desc}</div>
      )}

      {/* Row 3: Date + Location boxes */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        <div style={{background:"var(--bg3)",borderRadius:8,padding:"7px 10px"}}>
          <div style={{fontSize:9,color:"var(--text3)",marginBottom:2,textTransform:"uppercase",letterSpacing:".05em"}}>📅 Date</div>
          <div className="mono" style={{fontSize:11,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{dateStr}</div>
        </div>
        <div style={{background:"var(--bg3)",borderRadius:8,padding:"7px 10px"}}>
          <div style={{fontSize:9,color:"var(--text3)",marginBottom:2,textTransform:"uppercase",letterSpacing:".05em"}}>📍 City</div>
          <div className="mono" style={{fontSize:11,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{city}</div>
        </div>
      </div>

      {/* Row 4: Online/Offline + Price badges */}
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginTop:"auto"}}>
        <span style={{fontSize:11,padding:"3px 9px",borderRadius:6,fontWeight:700,
          background:isOnline?"rgba(0,212,255,.12)":"rgba(0,255,136,.12)",
          color:isOnline?"var(--cyan)":"var(--green)",
          border:`1px solid ${isOnline?"rgba(0,212,255,.3)":"rgba(0,255,136,.3)"}`
        }}>{isOnline?"🌐 Online":"📌 Offline"}</span>
        {e.price==="Free" ? (
          <span style={{fontSize:11,padding:"3px 9px",borderRadius:6,fontWeight:700,
            background:"rgba(0,255,136,.1)",color:"var(--green)",border:"1px solid rgba(0,255,136,.25)"}}>Free</span>
        ) : e.price==="Paid" ? (
          <span style={{fontSize:11,padding:"3px 9px",borderRadius:6,fontWeight:700,
            background:"rgba(255,107,53,.1)",color:"var(--orange)",border:"1px solid rgba(255,107,53,.25)"}}>Paid</span>
        ) : (
          <span style={{fontSize:11,padding:"3px 9px",borderRadius:6,fontWeight:600,
            background:"rgba(136,153,187,.08)",color:"var(--text3)",border:"1px solid rgba(136,153,187,.15)"}}>Check site</span>
        )}
      </div>

      {/* Row 5: Register button */}
      <button className="btn-p" style={{width:"100%",justifyContent:"center",padding:"9px",fontSize:13,
        opacity:hasLink?1:0.4,cursor:hasLink?"pointer":"not-allowed"}}
        onClick={()=>{
          if(!hasLink) return;
          const url=e.registrationLink.startsWith("http")?e.registrationLink:"https://"+e.registrationLink;
          window.open(url,"_blank","noopener,noreferrer");
        }}>
        {hasLink?"Register Now →":"Link Unavailable"}
      </button>
    </div>
  );
};

/* ────────────────────────────────────────────────
   EVENTS PAGE
──────────────────────────────────────────────── */
const EVENTS_PER_PAGE = 20;

const INDIA_CITY_OPTS = ["All","Online","Bengaluru","Mumbai","Delhi","Hyderabad","Pune","Chennai","Kolkata","Noida","Gurugram","Kochi","Ahmedabad","Jaipur","Indore","Surat","Chandigarh","Lucknow"];
const EVENT_DOMAIN_OPTS = ["All","AI/ML","Web Dev","Cloud","DevOps","Blockchain","Data Science","Mobile","Open Source","Security"];

const EventsPage = () => {
  const [search,setSearch]=useState(""); const [ds,setDs]=useState("");
  const [evType,setEvType]=useState("All");
  const [city,setCity]=useState("All");
  const [price,setPrice]=useState("All");
  const [domain,setDomain]=useState("All");
  const [ePage,setEPage]=useState(1);
  const [evView,setEvView]=useState("list"); const [evCalMonth,setEvCalMonth]=useState(new Date()); const [evSelDate,setEvSelDate]=useState(null);
  useEffect(()=>{const t=setTimeout(()=>setDs(search),350);return()=>clearTimeout(t);},[search]);
  useEffect(()=>{setEPage(1);},[evType,city,price,domain,ds]);
  const {data,total,loading} = useEvents({type:evType,city,price,domain,search:ds});
  const ePages    = Math.ceil(data.length / EVENTS_PER_PAGE);
  const paginated = data.slice((ePage-1)*EVENTS_PER_PAGE, ePage*EVENTS_PER_PAGE);
  const hasFilter = evType!=="All"||city!=="All"||price!=="All"||domain!=="All"||search;
  const onlineCount  = data.filter(e=>(e.mode||e.location||"").toLowerCase().includes("online")||e.location==="Online").length;
  const offlineCount = data.length - onlineCount;

  return (
    <div style={{paddingTop:64}}>
      {/* Header */}
      <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"32px 24px 24px"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div className="sl">Tech Community</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:16}}>
            <div>
              <h1 className="syne" style={{fontSize:34,fontWeight:800,marginBottom:4}}>🗓️ Tech Events</h1>
              <p style={{color:"var(--text2)",fontSize:14}}>Conferences, workshops, meetups & AI events — scraped from 9 platforms.</p>
            </div>
            <div style={{display:"flex",gap:16,textAlign:"center"}}>
              <div><div className="syne" style={{fontSize:26,fontWeight:800,color:"var(--purple)"}}>{data.length||total}</div><div style={{fontSize:11,color:"var(--text2)"}}>events found</div></div>
              <div><div className="syne" style={{fontSize:26,fontWeight:800,color:"var(--cyan)"}}>{onlineCount}</div><div style={{fontSize:11,color:"var(--text2)"}}>online</div></div>
              <div><div className="syne" style={{fontSize:26,fontWeight:800,color:"var(--green)"}}>{offlineCount}</div><div style={{fontSize:11,color:"var(--text2)"}}>offline</div></div>
            </div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{position:"relative",flex:1,minWidth:240}}>
              <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:"var(--text3)"}}>🔍</span>
              <input className="input" placeholder="Search events, conferences, workshops…" value={search} onChange={e=>setSearch(e.target.value)} style={{padding:"12px 16px 12px 42px",fontSize:14}}/>
            </div>
            <button onClick={()=>setEvView(v=>v==="list"?"calendar":"list")}
              style={{padding:"10px 18px",borderRadius:10,border:`1px solid ${evView==="calendar"?"var(--purple)":"var(--border)"}`,background:evView==="calendar"?"rgba(124,77,255,.15)":"var(--card)",color:evView==="calendar"?"var(--purple)":"var(--text2)",cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif",fontWeight:evView==="calendar"?700:400,whiteSpace:"nowrap"}}>
              {evView==="calendar"?"☰ List View":"📅 Calendar View"}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{maxWidth:1200,margin:"0 auto",padding:"24px",display:"flex",gap:20,alignItems:"flex-start"}}>

        {/* Calendar View */}
        {evView==="calendar" && (() => {
          const calYear=evCalMonth.getFullYear(); const calMon=evCalMonth.getMonth();
          const firstDay=new Date(calYear,calMon,1).getDay();
          const daysInMonth=new Date(calYear,calMon+1,0).getDate();
          const calDays=Array.from({length:firstDay+daysInMonth},(_,i)=>i<firstDay?null:i-firstDay+1);
          const todayStr=new Date().toLocaleDateString("en-CA");
          const grouped={};
          data.forEach(ev=>{
            const raw=ev.dateISO||ev.date;
            if(!raw||raw==="TBD"||raw==="On Demand") return;
            try{const key=new Date(raw).toLocaleDateString("en-CA"); if(key==="Invalid Date") return; if(!grouped[key]) grouped[key]=[]; grouped[key].push(ev);}catch(e){}
          });
          return (
            <div style={{width:"100%"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 360px",gap:20}}>
                <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                    <button onClick={()=>setEvCalMonth(new Date(calYear,calMon-1,1))} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"6px 14px",cursor:"pointer",color:"var(--text2)"}}>‹</button>
                    <div className="syne" style={{fontSize:18,fontWeight:800}}>{evCalMonth.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</div>
                    <button onClick={()=>setEvCalMonth(new Date(calYear,calMon+1,1))} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"6px 14px",cursor:"pointer",color:"var(--text2)"}}>›</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:8}}>
                    {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:"var(--text3)",padding:"4px 0"}}>{d}</div>)}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
                    {calDays.map((day,i)=>{
                      if(!day) return <div key={`e${i}`} style={{minHeight:72}}/>;
                      const key=`${calYear}-${String(calMon+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                      const items=grouped[key]||[]; const isToday=key===todayStr; const isSel=evSelDate===key;
                      const evColors={"Conference":"var(--cyan)","Workshop":"var(--purple)","Meetup":"#00d4d2","Webinar":"var(--orange)","AI/ML Event":"#b490ff"};
                      return (
                        <div key={day} onClick={()=>items.length&&setEvSelDate(isSel?null:key)}
                          style={{minHeight:72,border:`1px solid ${isSel?"var(--purple)":isToday?"var(--cyan)":"var(--border)"}`,borderRadius:9,padding:"5px 5px",cursor:items.length?"pointer":"default",background:isSel?"rgba(124,77,255,.08)":isToday?"rgba(0,212,255,.05)":"var(--bg)",transition:"all .15s"}}
                          onMouseEnter={e=>{if(items.length)e.currentTarget.style.borderColor="var(--purple)";}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor=isSel?"var(--purple)":isToday?"var(--cyan)":"var(--border)";}}>
                          <div style={{fontSize:12,fontWeight:isToday?800:400,color:isToday?"var(--cyan)":"var(--text)",textAlign:"right",marginBottom:3}}>{day}</div>
                          {items.slice(0,2).map((ev,ei)=>{
                            const c=evColors[ev.eventType]||"var(--purple)";
                            return <div key={ei} style={{fontSize:9,padding:"1px 4px",borderRadius:3,background:`${c}15`,color:c,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:1}}>📅 {ev.title.slice(0,12)}</div>;
                          })}
                          {items.length>2&&<div style={{fontSize:9,color:"var(--text3)"}}>+{items.length-2}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20,overflowY:"auto",maxHeight:600}}>
                  <div className="syne" style={{fontSize:15,fontWeight:800,marginBottom:14,color:"var(--text2)"}}>
                    {evSelDate?new Date(evSelDate+"T00:00:00").toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"}):"Click a date to see events"}
                  </div>
                  {evSelDate && (grouped[evSelDate]||[]).map((ev,i)=>(
                    <div key={i} style={{padding:"12px 14px",marginBottom:8,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:12}}>
                      <div className="syne" style={{fontSize:13,fontWeight:700,marginBottom:4}}>{ev.title}</div>
                      <div style={{fontSize:11,color:"var(--text2)",marginBottom:4}}>{ev.platform} · {ev.eventType}</div>
                      <div style={{display:"flex",gap:8}}>
                        <span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:ev.price==="Free"?"rgba(0,255,136,.12)":"rgba(255,107,53,.12)",color:ev.price==="Free"?"var(--green)":"var(--orange)"}}>{ev.price||"Free"}</span>
                        {ev.applyLink&&<a href={ev.applyLink} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"var(--cyan)",textDecoration:"none"}}>Register →</a>}
                      </div>
                    </div>
                  ))}
                  {evSelDate&&!grouped[evSelDate]?.length&&<div style={{color:"var(--text3)",fontSize:13}}>No events on this date.</div>}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Sidebar */}
        <div style={{width:220,flexShrink:0,background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:18,position:"sticky",top:80,display:evView==="calendar"?"none":"block"}} className="hm">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <span style={{fontWeight:700,fontSize:14}}>⚙️ Filters</span>
            {hasFilter && <button onClick={()=>{setEvType("All");setCity("All");setPrice("All");setDomain("All");setSearch("");}} style={{fontSize:11,color:"var(--pink)",background:"transparent",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>✕ Reset</button>}
          </div>

          {/* Event Type */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>🎯 Event Type</div>
            {EVENT_TYPE_OPTS.map(t=>(
              <button key={t} onClick={()=>setEvType(t)} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",borderRadius:8,border:"none",background:evType===t?"var(--purple)":"transparent",color:evType===t?"#fff":"var(--text2)",cursor:"pointer",fontSize:12,fontFamily:"'DM Sans',sans-serif",fontWeight:evType===t?700:400,marginBottom:2,transition:"all .15s"}}>{t}</button>
            ))}
          </div>

          <div style={{height:1,background:"var(--border)",margin:"8px 0 16px"}}/>

          {/* Domain */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>💡 Domain</div>
            {EVENT_DOMAIN_OPTS.map(d=>(
              <button key={d} onClick={()=>setDomain(d)} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",borderRadius:8,border:"none",background:domain===d?"var(--yellow)":"transparent",color:domain===d?"#000":"var(--text2)",cursor:"pointer",fontSize:12,fontFamily:"'DM Sans',sans-serif",fontWeight:domain===d?700:400,marginBottom:2,transition:"all .15s"}}>{d}</button>
            ))}
          </div>

          <div style={{height:1,background:"var(--border)",margin:"8px 0 16px"}}/>

          {/* City */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>📍 City</div>
            {INDIA_CITY_OPTS.map(c=>(
              <button key={c} onClick={()=>setCity(c)} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",borderRadius:8,border:"none",background:city===c?"var(--cyan)":"transparent",color:city===c?"#000":"var(--text2)",cursor:"pointer",fontSize:12,fontFamily:"'DM Sans',sans-serif",fontWeight:city===c?700:400,marginBottom:2,transition:"all .15s"}}>{c}</button>
            ))}
          </div>

          <div style={{height:1,background:"var(--border)",margin:"8px 0 16px"}}/>

          {/* Price */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>💰 Price</div>
            {["All","Free","Paid"].map(p=>(
              <button key={p} onClick={()=>setPrice(p)} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",borderRadius:8,border:"none",background:price===p?(p==="Free"?"var(--green)":p==="Paid"?"var(--orange)":"var(--cyan)"):"transparent",color:price===p?"#000":"var(--text2)",cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif",fontWeight:price===p?700:400,marginBottom:2,transition:"all .15s"}}>{p}</button>
            ))}
          </div>

          <div style={{background:"var(--bg3)",borderRadius:10,padding:12,marginTop:8}}>
            <div style={{fontSize:9,color:"var(--text3)",marginBottom:5}}>RESULTS</div>
            <div className="syne" style={{fontSize:22,fontWeight:800,color:"var(--purple)"}}>{data.length||total}</div>
            <div style={{fontSize:11,color:"var(--text2)"}}>events</div>
          </div>
        </div>

        {/* Cards grid */}
        {evView!=="calendar" && <div style={{flex:1,minWidth:0}}>
          {loading ? (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))",gap:15}}>{[1,2,3,4,5,6].map(i=><div key={i} className="skel" style={{height:260,borderRadius:16}}/>)}</div>
          ) : data.length===0 ? (
            <div style={{textAlign:"center",padding:"80px 20px",border:"1px dashed var(--border)",borderRadius:16}}>
              <div style={{fontSize:52,marginBottom:14}}>🗓️</div>
              <div className="syne" style={{fontSize:22,fontWeight:800,marginBottom:10}}>No events found</div>
              <div style={{color:"var(--text2)",fontSize:14,lineHeight:1.8}}>
                {hasFilter?"Try resetting filters.":"Events are scraped every 6 hours. Check back soon!"}
              </div>
            </div>
          ) : (
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))",gap:15}}>
                {paginated.map(e=><EventCard key={e._id||e.uniqueId} e={e}/>)}
              </div>
              {ePages>1 && (
                <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:7,marginTop:28,flexWrap:"wrap"}}>
                  <button onClick={()=>{setEPage(p=>Math.max(1,p-1));window.scrollTo(0,200);}} disabled={ePage===1} style={{padding:"7px 14px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:ePage===1?"var(--text3)":"var(--text2)",cursor:ePage===1?"not-allowed":"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>← Prev</button>
                  {Array.from({length:Math.min(ePages,7)},(_,i)=>{
                    let p;
                    if(ePages<=7) p=i+1;
                    else if(ePage<=4) p=i+1;
                    else if(ePage>=ePages-3) p=ePages-6+i;
                    else p=ePage-3+i;
                    return(<button key={p} onClick={()=>{setEPage(p);window.scrollTo(0,200);}} style={{width:36,height:36,borderRadius:8,border:"1px solid var(--border)",background:p===ePage?"var(--purple)":"var(--card)",color:p===ePage?"#fff":"var(--text2)",cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>{p}</button>);
                  })}
                  <button onClick={()=>{setEPage(p=>Math.min(ePages,p+1));window.scrollTo(0,200);}} disabled={ePage===ePages} style={{padding:"7px 14px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:ePage===ePages?"var(--text3)":"var(--text2)",cursor:ePage===ePages?"not-allowed":"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>Next →</button>
                </div>
              )}
              {data.length>0 && (
                <div style={{textAlign:"center",marginTop:12,fontSize:12,color:"var(--text3)"}}>
                  Showing {(ePage-1)*EVENTS_PER_PAGE+1}–{Math.min(ePage*EVENTS_PER_PAGE,data.length)} of {data.length} events
                </div>
              )}
            </>
          )}
        </div>}
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
        {[["Platform",["Home","Hackathons","Internships","Events","Resources"]],["Scrapers",["Devpost","Devfolio","Hack2Skill","Internshala","Lablab.ai","Remotive"]],["About",["How it works","AI Agents","Data Policy","Contact"]]].map(([title,links])=>(
          <div key={title}>
            <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",letterSpacing:".1em",textTransform:"uppercase",marginBottom:12}}>{title}</div>
            {links.map(l=><div key={l} style={{color:"var(--text2)",fontSize:13,marginBottom:8,cursor:"pointer"}} onClick={()=>["Home","Hackathons","Internships","Events","Resources"].includes(l)&&setPage(l.toLowerCase())}>{l}</div>)}
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

// ── DSA TOPIC EXPLORER PAGE ─────────────────────────────────────────────────
// Self-contained — no backend needed, all data hardcoded

const DSA_DATA = [
  {
    slug:"arrays", topic:"Arrays", category:"Foundations", difficulty:"Easy",
    tuf:25, icon:"▦",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/array/",logo:"https://leetcode.com/favicon.ico",count:1500,easy:450,med:750,hard:300,tags:["Interview Prep","FAANG"],note:"Largest array problem set — essential for interviews"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Arrays",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:400,easy:200,med:150,hard:50,tags:["Beginner Friendly","Articles"],note:"Best articles + problems for learning concepts"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:50,easy:15,med:25,hard:10,tags:["Video Solutions","Blind 75"],note:"Curated 150 problems with video explanations"},
      {name:"Code360",url:"https://www.naukri.com/code360/problems?search=array",logo:"https://www.naukri.com/favicon.ico",count:200,easy:80,med:90,hard:30,tags:["Indian Platform","Ninja Courses"],note:"Coding Ninjas platform — popular for Indian placements"},
      {name:"InterviewBit",url:"https://www.interviewbit.com/courses/programming/arrays/",logo:"https://www.interviewbit.com/favicon.ico",count:80,easy:20,med:45,hard:15,tags:["Interview Prep","Company Tags"],note:"Company-wise interview problems"},
      {name:"HackerRank",url:"https://www.hackerrank.com/domains/data-structures",logo:"https://hrcdn.net/fcore/assets/brand/favicon-ddc852f75a.png",count:120,easy:50,med:50,hard:20,tags:["Beginner Friendly","Certificates"],note:"Great for beginners & earning certificates"},
    ]
  },
  {
    slug:"binary-search", topic:"Binary Search", category:"Searching", difficulty:"Medium",
    tuf:32, icon:"⟨⟩",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/binary-search/",logo:"https://leetcode.com/favicon.ico",count:230,easy:55,med:130,hard:45,tags:["Interview Prep","FAANG"],note:"Excellent tag with classic + advanced BS problems"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Binary+Search",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:120,easy:60,med:45,hard:15,tags:["Beginner Friendly"],note:"Good conceptual articles with problems"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:18,easy:5,med:10,hard:3,tags:["Video Solutions","Blind 75"],note:"All key binary search patterns covered"},
      {name:"Code360",url:"https://www.naukri.com/code360/problems?search=binary+search",logo:"https://www.naukri.com/favicon.ico",count:80,easy:30,med:40,hard:10,tags:["Indian Platform"],note:"Coding Ninjas — curated binary search problems"},
      {name:"HackerRank",url:"https://www.hackerrank.com/domains/algorithms/search",logo:"https://hrcdn.net/fcore/assets/brand/favicon-ddc852f75a.png",count:40,easy:15,med:20,hard:5,tags:["Beginner Friendly"],note:"Binary search & algorithm challenges"},
    ]
  },
  {
    slug:"two-pointers", topic:"Two Pointers", category:"Searching", difficulty:"Medium",
    tuf:14, icon:"⇔",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/two-pointers/",logo:"https://leetcode.com/favicon.ico",count:230,easy:55,med:130,hard:45,tags:["Interview Prep","FAANG"],note:"Most commonly asked pattern in FAANG interviews"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=two-pointer-technique",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:80,easy:30,med:40,hard:10,tags:["Beginner Friendly"],note:"Great technique articles and practice"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:12,easy:3,med:7,hard:2,tags:["Video Solutions","Blind 75"],note:"All Blind 75 two-pointer problems covered"},
      {name:"InterviewBit",url:"https://www.interviewbit.com/courses/programming/two-pointers/",logo:"https://www.interviewbit.com/favicon.ico",count:25,easy:8,med:13,hard:4,tags:["Interview Prep"],note:"Interview-focused two pointer problems"},
    ]
  },
  {
    slug:"sliding-window", topic:"Sliding Window", category:"Searching", difficulty:"Medium",
    tuf:12, icon:"⊡",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/sliding-window/",logo:"https://leetcode.com/favicon.ico",count:120,easy:20,med:75,hard:25,tags:["Interview Prep","FAANG"],note:"Critical pattern for string + subarray problems"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=sliding-window",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:55,easy:25,med:25,hard:5,tags:["Beginner Friendly"],note:"Good explanations for fixed + variable window"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:11,easy:2,med:8,hard:1,tags:["Video Solutions","Blind 75"],note:"All classic sliding window patterns"},
    ]
  },
  {
    slug:"linked-list", topic:"Linked List", category:"Data Structures", difficulty:"Medium",
    tuf:31, icon:"⬡",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/linked-list/",logo:"https://leetcode.com/favicon.ico",count:180,easy:60,med:90,hard:30,tags:["Interview Prep","FAANG"],note:"All major linked list patterns covered"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Linked+List",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:150,easy:70,med:60,hard:20,tags:["Beginner Friendly"],note:"Best resource for learning LL from scratch"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:15,easy:5,med:8,hard:2,tags:["Video Solutions","Blind 75"],note:"Clean visual explanations for pointer tricks"},
      {name:"InterviewBit",url:"https://www.interviewbit.com/courses/programming/linked-lists/",logo:"https://www.interviewbit.com/favicon.ico",count:35,easy:12,med:18,hard:5,tags:["Interview Prep"],note:"Company-tagged LL problems"},
    ]
  },
  {
    slug:"stack-queue", topic:"Stack & Queue", category:"Data Structures", difficulty:"Medium",
    tuf:23, icon:"⊞",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/stack/",logo:"https://leetcode.com/favicon.ico",count:200,easy:50,med:110,hard:40,tags:["Interview Prep","FAANG"],note:"Stack is everywhere — monotonic, calculator, etc."},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Stack",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:100,easy:45,med:45,hard:10,tags:["Beginner Friendly"],note:"Best articles on stack applications"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:13,easy:3,med:8,hard:2,tags:["Video Solutions"],note:"Monotonic stack patterns covered well"},
      {name:"HackerRank",url:"https://www.hackerrank.com/domains/data-structures/stacks",logo:"https://hrcdn.net/fcore/assets/brand/favicon-ddc852f75a.png",count:25,easy:10,med:12,hard:3,tags:["Beginner Friendly"],note:"Stack & queue challenges with guided tracks"},
    ]
  },
  {
    slug:"binary-trees", topic:"Binary Trees", category:"Trees", difficulty:"Medium",
    tuf:39, icon:"⌥",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/binary-tree/",logo:"https://leetcode.com/favicon.ico",count:290,easy:90,med:155,hard:45,tags:["Interview Prep","FAANG"],note:"Most diverse tree problem collection"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Tree",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:200,easy:80,med:90,hard:30,tags:["Beginner Friendly"],note:"Excellent tree traversal tutorials"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:20,easy:6,med:11,hard:3,tags:["Video Solutions","Blind 75"],note:"All Blind 75 tree problems with visuals"},
      {name:"InterviewBit",url:"https://www.interviewbit.com/courses/programming/trees/",logo:"https://www.interviewbit.com/favicon.ico",count:45,easy:15,med:22,hard:8,tags:["Interview Prep"],note:"Interview-focused tree problems"},
      {name:"HackerRank",url:"https://www.hackerrank.com/domains/data-structures/trees",logo:"https://hrcdn.net/fcore/assets/brand/favicon-ddc852f75a.png",count:30,easy:10,med:15,hard:5,tags:["Beginner Friendly"],note:"Tree problems with beginner-friendly tracks"},
    ]
  },
  {
    slug:"graphs", topic:"Graphs", category:"Graphs", difficulty:"Hard",
    tuf:54, icon:"◎",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/graph/",logo:"https://leetcode.com/favicon.ico",count:320,easy:50,med:190,hard:80,tags:["Interview Prep","FAANG"],note:"Complete graph algorithms — BFS, DFS, Dijkstra, Union Find"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Graph",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:300,easy:100,med:150,hard:50,tags:["Beginner Friendly"],note:"Best resource for learning graph algorithms"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:20,easy:3,med:13,hard:4,tags:["Video Solutions","Blind 75"],note:"All graph patterns with clean video explanations"},
      {name:"Code360",url:"https://www.naukri.com/code360/problems?search=graph",logo:"https://www.naukri.com/favicon.ico",count:150,easy:50,med:70,hard:30,tags:["Indian Platform"],note:"Graph problems curated for placements"},
      {name:"HackerRank",url:"https://www.hackerrank.com/domains/algorithms/graph-theory",logo:"https://hrcdn.net/fcore/assets/brand/favicon-ddc852f75a.png",count:45,easy:15,med:22,hard:8,tags:["Beginner Friendly"],note:"Graph theory challenges with visual problem sets"},
    ]
  },
  {
    slug:"dynamic-programming", topic:"Dynamic Programming", category:"DP", difficulty:"Hard",
    tuf:56, icon:"◈",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/dynamic-programming/",logo:"https://leetcode.com/favicon.ico",count:600,easy:90,med:370,hard:140,tags:["Interview Prep","FAANG"],note:"Most comprehensive DP collection — all patterns"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Dynamic+Programming",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:350,easy:100,med:200,hard:50,tags:["Beginner Friendly"],note:"Best articles for understanding DP patterns"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:28,easy:4,med:18,hard:6,tags:["Video Solutions","Blind 75"],note:"Pattern-based DP with visual state transitions"},
      {name:"Code360",url:"https://www.naukri.com/code360/problems?search=dynamic+programming",logo:"https://www.naukri.com/favicon.ico",count:180,easy:60,med:90,hard:30,tags:["Indian Platform"],note:"DP problems with detailed editorial solutions"},
      {name:"HackerRank",url:"https://www.hackerrank.com/domains/algorithms/dynamic-programming",logo:"https://hrcdn.net/fcore/assets/brand/favicon-ddc852f75a.png",count:50,easy:18,med:25,hard:7,tags:["Beginner Friendly"],note:"DP challenges from easy to hard with hints"},
      {name:"InterviewBit",url:"https://www.interviewbit.com/courses/programming/dynamic-programming/",logo:"https://www.interviewbit.com/favicon.ico",count:60,easy:15,med:35,hard:10,tags:["Interview Prep"],note:"Interview DP with company tags"},
    ]
  },
  {
    slug:"greedy", topic:"Greedy", category:"Algorithms", difficulty:"Medium",
    tuf:16, icon:"⚡",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/greedy/",logo:"https://leetcode.com/favicon.ico",count:280,easy:70,med:160,hard:50,tags:["Interview Prep","FAANG"],note:"Greedy is frequently asked in product companies"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Greedy",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:120,easy:50,med:55,hard:15,tags:["Beginner Friendly"],note:"Good greedy proof techniques explained"},
      {name:"Code360",url:"https://www.naukri.com/code360/problems?search=greedy",logo:"https://www.naukri.com/favicon.ico",count:100,easy:35,med:50,hard:15,tags:["Indian Platform"],note:"Greedy problems for placement prep"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:8,easy:2,med:5,hard:1,tags:["Video Solutions"],note:"Key greedy patterns covered"},
    ]
  },
  {
    slug:"recursion", topic:"Recursion", category:"Foundations", difficulty:"Easy",
    tuf:24, icon:"↺",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/recursion/",logo:"https://leetcode.com/favicon.ico",count:90,easy:30,med:45,hard:15,tags:["Interview Prep"],note:"Recursion + backtracking fundamentals"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Recursion",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:80,easy:40,med:30,hard:10,tags:["Beginner Friendly"],note:"Best place to learn recursion from scratch"},
      {name:"InterviewBit",url:"https://www.interviewbit.com/courses/programming/backtracking/",logo:"https://www.interviewbit.com/favicon.ico",count:20,easy:5,med:12,hard:3,tags:["Interview Prep"],note:"Backtracking interview problems"},
    ]
  },
  {
    slug:"heaps", topic:"Heaps", category:"Data Structures", difficulty:"Hard",
    tuf:18, icon:"△",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/heap-priority-queue/",logo:"https://leetcode.com/favicon.ico",count:220,easy:25,med:135,hard:60,tags:["Interview Prep","FAANG"],note:"Priority queues appear in almost every FAANG round"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Heap",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:80,easy:30,med:40,hard:10,tags:["Beginner Friendly"],note:"Heap construction and heap sort explained"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:12,easy:2,med:8,hard:2,tags:["Video Solutions","Blind 75"],note:"Top K pattern problems well covered"},
    ]
  },
  {
    slug:"bst", topic:"BST", category:"Trees", difficulty:"Medium",
    tuf:26, icon:"⌂",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/binary-search-tree/",logo:"https://leetcode.com/favicon.ico",count:130,easy:40,med:75,hard:15,tags:["Interview Prep","FAANG"],note:"BST insertion, deletion, validation patterns"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Binary+Search+Tree",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:90,easy:40,med:40,hard:10,tags:["Beginner Friendly"],note:"Excellent BST theory + practice"},
      {name:"InterviewBit",url:"https://www.interviewbit.com/courses/programming/tree-data-structure/",logo:"https://www.interviewbit.com/favicon.ico",count:30,easy:10,med:16,hard:4,tags:["Interview Prep"],note:"Company-tagged BST problems"},
    ]
  },
  {
    slug:"tries", topic:"Tries", category:"Advanced DS", difficulty:"Hard",
    tuf:10, icon:"⊳",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/trie/",logo:"https://leetcode.com/favicon.ico",count:55,easy:8,med:32,hard:15,tags:["Interview Prep","FAANG"],note:"Trie problems appear in Google/Amazon interviews"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Trie",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:30,easy:10,med:15,hard:5,tags:["Beginner Friendly"],note:"Build trie from scratch articles"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:5,easy:1,med:3,hard:1,tags:["Video Solutions","Blind 75"],note:"All Blind 75 trie problems"},
    ]
  },
  {
    slug:"bit-manipulation", topic:"Bit Manipulation", category:"Algorithms", difficulty:"Medium",
    tuf:20, icon:"⊕",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/bit-manipulation/",logo:"https://leetcode.com/favicon.ico",count:175,easy:65,med:85,hard:25,tags:["Interview Prep","FAANG"],note:"Bit tricks asked in product company interviews"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Bit+Magic",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:80,easy:35,med:35,hard:10,tags:["Beginner Friendly"],note:"All bit manipulation tricks explained"},
      {name:"Code360",url:"https://www.naukri.com/code360/problems?search=bit+manipulation",logo:"https://www.naukri.com/favicon.ico",count:60,easy:25,med:25,hard:10,tags:["Indian Platform"],note:"Bit manipulation problems with hints"},
    ]
  },
  {
    slug:"string-algorithms", topic:"String Algorithms", category:"Algorithms", difficulty:"Hard",
    tuf:22, icon:"Aa",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/string/",logo:"https://leetcode.com/favicon.ico",count:550,easy:175,med:285,hard:90,tags:["Interview Prep","FAANG"],note:"Strings are most common in OA rounds"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Strings",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:200,easy:80,med:90,hard:30,tags:["Beginner Friendly"],note:"KMP, Z-algorithm, Rabin-Karp explained"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:16,easy:5,med:9,hard:2,tags:["Video Solutions","Blind 75"],note:"String manipulation patterns"},
      {name:"HackerRank",url:"https://www.hackerrank.com/domains/algorithms/strings",logo:"https://hrcdn.net/fcore/assets/brand/favicon-ddc852f75a.png",count:40,easy:15,med:18,hard:7,tags:["Beginner Friendly"],note:"String algorithm challenges with guided tracks"},
    ]
  },
];

const DSA_CATEGORIES = ["All", ...new Set(DSA_DATA.map(t => t.category))];

// eslint-disable-next-line no-unused-vars
const DIFF_COLOR = { Easy:"#00ff88", Medium:"#ffd60a", Hard:"#ff3d8a" };

// ── COMPREHENSIVE PROBLEM LINKS ──────────────────────────────────────────────
// lc=LeetCode slug, gfg=GFG slug, nc=NeetCode slug, ib=InterviewBit slug
// null = no direct link (falls back to search on that platform)
const PROBLEM_LINKS = {
  // ── ARRAYS ────────────────────────────────────────────────────────────────
  "Majority Element I":                     { lc:"majority-element",                     gfg:"majority-element/1",                            nc:"majority-element",                    ib:"majority-element", cn:"majority-element"  },
  "Leaders in an Array":                    { lc:null,                                   gfg:"leaders-in-an-array/1",                         nc:null,                                  ib:"leaders-in-an-array", cn:"leaders-in-an-array"  },
  "Rearrange Array Elements by Sign":       { lc:"rearrange-array-elements-by-sign",     gfg:"rearrange-array-elements-by-sign/1",            nc:"rearrange-array-elements-by-sign",    ib:null, cn:"rearrange-array-elements-by-sign"  },
  "Spiral Matrix":                          { lc:"spiral-matrix",                        gfg:"spirally-traversing-a-matrix-1587115621/1",     nc:"spiral-matrix",                       ib:"spiral-order-matrix-i", cn:"spiral-matrix"  },
  "Pascal's Triangle I":                    { lc:"pascals-triangle",                     gfg:"pascal-triangle0652/1",                         nc:"pascals-triangle",                    ib:"pascal-triangle", cn:"print-pascal-triangle"  },
  "Pascal's Triangle II":                   { lc:"pascals-triangle-ii",                  gfg:"pascal-triangle0652/1",                         nc:"pascals-triangle-ii",                 ib:null, cn:"print-pascal-triangle"  },
  "Pascal's Triangle III":                  { lc:null,                                   gfg:"pascal-triangle0652/1",                         nc:null,                                  ib:null, cn:null  },
  "Rotate Matrix by 90°":                   { lc:"rotate-image",                         gfg:"rotate-by-90-degree/1",                         nc:"rotate-matrix",                       ib:"rotate-matrix", cn:"rotate-matrix"  },
  "Two Sum":                                { lc:"two-sum",                              gfg:"key-pair5616/1",                                nc:"two-sum",                             ib:"2-sum", cn:"two-sum"  },
  "3 Sum":                                  { lc:"3sum",                                 gfg:"triplet-sum-in-array/1",                        nc:"three-sum",                           ib:"3-sum", cn:"3-sum"  },
  "4 Sum":                                  { lc:"4sum",                                 gfg:"find-all-four-sum-numbers/1",                   nc:"four-sum",                            ib:"4-sum", cn:"4-sum"  },
  "Sort Array of 0s, 1s, 2s":              { lc:"sort-colors",                          gfg:"sort-an-array-of-0s-1s-and-2s/1",              nc:"sort-colors",                         ib:"sort-array-with-0s-1s-2s", cn:"sort-an-array-of-0s-1s-and-2s"  },
  "Kadane's Algorithm":                     { lc:"maximum-subarray",                     gfg:"kadanes-algorithm-1587115620/1",                nc:"maximum-subarray",                    ib:"max-sum-contiguous-subarray", cn:"maximum-subarray-sum"  },
  "Next Permutation":                       { lc:"next-permutation",                     gfg:"next-permutation5226/1",                        nc:"next-permutation",                    ib:"next-permutation", cn:"next-permutation"  },
  "Longest Consecutive Sequence":           { lc:"longest-consecutive-sequence",         gfg:"consecutive-elements/1",                        nc:"longest-consecutive-sequence",        ib:"longest-consecutive-sequence", cn:"longest-consecutive-sequence"  },
  "Longest Subarray with Sum K":            { lc:null,                                   gfg:"longest-sub-array-with-sum-k/1",                nc:null,                                  ib:null, cn:"longest-subarray-with-sum-k"  },
  "Count Subarrays with Given Sum":         { lc:"subarray-sum-equals-k",               gfg:"subarray-with-given-sum/1",                     nc:"subarray-sum-equals-k",               ib:"subarray-sum-equals-k", cn:"subarray-sum-equals-k"  },
  "Count Subarrays with XOR = K":          { lc:null,                                   gfg:"count-subarray-with-given-xor/1",               nc:null,                                  ib:null, cn:"count-xor-subarrays"  },
  "Majority Element II":                    { lc:"majority-element-ii",                  gfg:"majority-vote/1",                               nc:"majority-element-ii",                 ib:null, cn:"majority-element-ii"  },
  "Find Repeating and Missing Number":      { lc:null,                                   gfg:"find-missing-and-repeating/1",                  nc:null,                                  ib:"find-duplicate-in-array", cn:"missing-and-repeating-numbers"  },
  "Count Inversions":                       { lc:null,                                   gfg:"inversion-of-array-1587115620/1",               nc:null,                                  ib:null, cn:"count-inversions"  },
  "Reverse Pairs":                          { lc:"reverse-pairs",                        gfg:"count-inversions/1",                            nc:"reverse-pairs",                       ib:null, cn:"reverse-pairs"  },
  "Maximum Product Subarray":               { lc:"maximum-product-subarray",             gfg:"maximum-product-subarray3604/1",                nc:"maximum-product-subarray",            ib:"maximum-product-subarray", cn:"maximum-product-subarray"  },
  "Merge Two Sorted Arrays Without Extra Space": { lc:"merge-sorted-array",             gfg:"merge-two-sorted-arrays-in-o1-extra-space/1",   nc:"merge-sorted-array",                  ib:"merge-two-sorted-arrays-ii", cn:"merge-two-sorted-arrays-without-extra-space"  },
  // ── BINARY SEARCH ─────────────────────────────────────────────────────────
  "Search X in Sorted Array":              { lc:"binary-search",                         gfg:"who-will-win-1587115621/1",                     nc:"binary-search",                       ib:"search-in-sorted-array", cn:"binary-search"  },
  "Lower Bound":                            { lc:"search-insert-position",               gfg:"floor-in-a-sorted-array/1",                     nc:null,                                  ib:null, cn:null  },
  "Upper Bound":                            { lc:"search-insert-position",               gfg:"ceil-the-floor/1",                              nc:null,                                  ib:null, cn:null  },
  "Search Insert Position":                 { lc:"search-insert-position",               gfg:"search-insert-position-of-k-in-a-sorted-array/1", nc:"search-insert-position",           ib:"search-insert-position", cn:"search-insert-position"  },
  "Floor and Ceil in Sorted Array":         { lc:null,                                   gfg:"ceil-the-floor/1",                              nc:null,                                  ib:null, cn:null  },
  "First and Last Occurrence":              { lc:"find-first-and-last-position-of-element-in-sorted-array", gfg:"first-and-last-occurrences-of-x/1", nc:"find-minimum-in-rotated-sorted-array", ib:"first-and-last-positions-of-an-element-in-a-sorted-array", cn:"first-and-last-position-of-an-element-in-sorted-array"  },
  "Search in Rotated Sorted Array I":       { lc:"search-in-rotated-sorted-array",       gfg:"search-in-a-rotated-array/1",                   nc:"search-in-rotated-sorted-array",      ib:"search-in-rotated-sorted-array", cn:"search-in-rotated-sorted-array-i"  },
  "Search in Rotated Sorted Array II":      { lc:"search-in-rotated-sorted-array-ii",    gfg:"search-in-a-rotated-array/1",                   nc:"find-minimum-in-rotated-sorted-array", ib:null, cn:"search-in-rotated-sorted-array-ii"  },
  "Find Minimum in Rotated Sorted Array":   { lc:"find-minimum-in-rotated-sorted-array", gfg:"minimum-element-in-a-sorted-and-rotated-array/1", nc:"find-minimum-in-rotated-sorted-array", ib:"find-minimum-element-in-a-sorted-and-rotated-array", cn:"minimum-element-in-rotated-sorted-array"  },
  "Find How Many Times Array is Rotated":   { lc:null,                                   gfg:"rotation4723/1",                                nc:null,                                  ib:null, cn:null  },
  "Single Element in Sorted Array":         { lc:"single-element-in-a-sorted-array",     gfg:"find-the-element-that-appears-once-in-sorted-array/1", nc:"single-element-in-a-sorted-array", ib:null, cn:"single-element-in-a-sorted-array"  },
  "Find Square Root of a Number":           { lc:"sqrtx",                                gfg:"square-root/1",                                 nc:"sqrtx",                               ib:"square-root-of-integer", cn:"square-root-integral"  },
  "Find Nth Root of a Number":              { lc:null,                                   gfg:"nth-root-of-m/1",                               nc:null,                                  ib:null, cn:null  },
  "Find the Smallest Divisor":              { lc:"find-the-smallest-divisor-given-a-threshold", gfg:null,                                     nc:null,                                  ib:null, cn:null  },
  "Koko Eating Bananas":                    { lc:"koko-eating-bananas",                  gfg:"koko-eating-bananas/1",                         nc:"koko-eating-bananas",                 ib:null, cn:"koko-eating-bananas"  },
  "Minimum Days to Make M Bouquets":        { lc:"minimum-number-of-days-to-make-m-bouquets", gfg:null,                                       nc:null,                                  ib:null, cn:null  },
  "Aggressive Cows":                        { lc:null,                                   gfg:"aggressive-cows/1",                             nc:null,                                  ib:null, cn:"aggressive-cows"  },
  "Book Allocation Problem":                { lc:null,                                   gfg:"allocate-minimum-number-of-pages/1",             nc:null,                                  ib:"allocate-books", cn:"allocate-books"  },
  "Find Peak Element":                      { lc:"find-peak-element",                    gfg:"peak-element/1",                                nc:"find-peak-element",                   ib:"find-a-peak-element", cn:"find-the-peak-element"  },
  "Median of 2 Sorted Arrays":              { lc:"median-of-two-sorted-arrays",          gfg:"median-of-two-sorted-arrays/1",                 nc:"median-of-two-sorted-arrays",         ib:"median-of-array", cn:"median-of-two-sorted-arrays"  },
  "Kth Element of 2 Sorted Arrays":         { lc:null,                                   gfg:"kth-element-of-two-sorted-array/1",             nc:null,                                  ib:"kth-smallest-element-in-x-sorted-arrays", cn:"kth-element-of-2-sorted-arrays"  },
  "Minimize Max Distance to Gas Station":   { lc:"minimize-max-distance-to-gas-station", gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Split Array - Largest Sum":              { lc:"split-array-largest-sum",              gfg:"allocate-minimum-number-of-pages/1",             nc:"split-array-largest-sum",             ib:"allocate-books", cn:"painter-s-partition"  },
  "Find Row with Maximum 1s":               { lc:null,                                   gfg:"row-with-max-1s0023/1",                         nc:null,                                  ib:null, cn:null  },
  "Search in a 2D Matrix":                  { lc:"search-a-2d-matrix",                   gfg:"search-in-a-matrix/1",                          nc:"search-2d-matrix",                    ib:"search-in-a-matrix", cn:"search-in-a-matrix"  },
  "Search in 2D Matrix II":                 { lc:"search-a-2d-matrix-ii",                gfg:"search-in-a-matrix/1",                          nc:"search-2d-matrix-ii",                 ib:null, cn:"search-in-a-row-and-column-wise-sorted-matrix"  },
  "Find Peak Element II":                   { lc:"find-a-peak-element-ii",               gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Matrix Median":                          { lc:null,                                   gfg:"median-in-a-row-wise-sorted-matrix/1",           nc:null,                                  ib:null, cn:null  },
  // ── RECURSION & BACKTRACKING ──────────────────────────────────────────────
  "Pow(x,n)":                               { lc:"powx-n",                               gfg:"power-of-numbers/1",                            nc:"pow-x-n",                             ib:"implement-power-function", cn:"implement-pow"  },
  "Generate Parentheses":                   { lc:"generate-parentheses",                 gfg:"generate-all-possible-parentheses/1",           nc:"generate-parentheses",                ib:"generate-all-parentheses", cn:"generate-parentheses"  },
  "Power Set":                              { lc:"subsets",                              gfg:"power-set4302/1",                               nc:"subsets",                             ib:"power-set", cn:null  },
  "Check if Subsequence with Sum K Exists": { lc:null,                                   gfg:"subset-sum-problem-1611555638/1",               nc:null,                                  ib:null, cn:null  },
  "Count All Subsequences with Sum K":      { lc:"subarray-sum-equals-k",               gfg:"perfect-sum-problem/1",                         nc:null,                                  ib:null, cn:null  },
  "Combination Sum":                        { lc:"combination-sum",                      gfg:"combination-sum/1",                             nc:"combination-sum",                     ib:"combination-sum", cn:"combination-sum-1"  },
  "Combination Sum II":                     { lc:"combination-sum-ii",                   gfg:"combination-sum-part-2/1",                      nc:"combination-sum-ii",                  ib:null, cn:"combination-sum-ii"  },
  "Subsets I":                              { lc:"subsets",                              gfg:"find-subsets/1",                                nc:"subsets",                             ib:"subset", cn:"power-set"  },
  "Subsets II":                             { lc:"subsets-ii",                           gfg:"subsets-ii/1",                                  nc:"subsets-ii",                          ib:null, cn:null  },
  "Combination Sum III":                    { lc:"combination-sum-iii",                  gfg:null,                                            nc:"combination-sum-iii",                 ib:null, cn:null  },
  "Letter Combinations of a Phone Number":  { lc:"letter-combinations-of-a-phone-number", gfg:"possible-words-from-phone-digits-1587115620/1", nc:"letter-combinations-of-a-phone-number", ib:"letter-phone", cn:"letter-combinations-of-a-phone-number"  },
  "Palindrome Partitioning":                { lc:"palindrome-partitioning",              gfg:"palindromic-patitioning4845/1",                 nc:"palindrome-partitioning",             ib:null, cn:"palindrome-partitioning"  },
  "Word Search":                            { lc:"word-search",                          gfg:"word-search/1",                                 nc:"word-search",                         ib:"word-search-board", cn:"word-search"  },
  "N-Queens":                               { lc:"n-queens",                             gfg:"n-queen-problem0315/1",                         nc:"n-queens",                            ib:"n-queens", cn:"n-queens"  },
  "Rat in a Maze":                          { lc:null,                                   gfg:"rat-in-a-maze-problem/1",                       nc:null,                                  ib:"path-in-a-matrix", cn:"rat-in-a-maze"  },
  "M Coloring Problem":                     { lc:null,                                   gfg:"m-coloring-problem/1",                          nc:null,                                  ib:null, cn:null  },
  "Sudoku Solver":                          { lc:"sudoku-solver",                        gfg:"solve-the-sudoku/1",                            nc:"sudoku-solver",                       ib:"sudoku", cn:"sudoku-solver"  },
  // ── LINKED LIST ───────────────────────────────────────────────────────────
  "Introduction & Traversal":               { lc:null,                                   gfg:"introduction-to-linked-list/1",                 nc:null,                                  ib:null, cn:null  },
  "Deletion in LL":                         { lc:"delete-node-in-a-linked-list",         gfg:"delete-node-in-doubly-linked-list/1",            nc:null,                                  ib:null, cn:null  },
  "Insertion in LL":                        { lc:null,                                   gfg:"linked-list-insertion-1587115620/1",             nc:null,                                  ib:null, cn:null  },
  "Delete Head / Tail / Kth Node":          { lc:"remove-nth-node-from-end-of-list",     gfg:"delete-without-head-pointer/1",                 nc:"remove-nth-node-from-end-of-list",    ib:null, cn:null  },
  "Delete Node with Value X":               { lc:"remove-linked-list-elements",          gfg:"delete-without-head-pointer/1",                 nc:null,                                  ib:null, cn:null  },
  "Insert at Head / Tail / Kth Position":   { lc:null,                                   gfg:"linked-list-insertion-1587115620/1",             nc:null,                                  ib:null, cn:null  },
  "Doubly LL – Insertion & Deletion":       { lc:null,                                   gfg:"delete-node-in-doubly-linked-list/1",            nc:null,                                  ib:null, cn:null  },
  "Add Two Numbers in LL":                  { lc:"add-two-numbers",                      gfg:"add-two-numbers-represented-by-linked-lists/1",  nc:"add-two-numbers",                     ib:"add-two-numbers-as-lists", cn:"add-two-numbers-as-linked-lists"  },
  "Segregate Odd and Even Nodes":           { lc:"odd-even-linked-list",                 gfg:"segregate-even-and-odd-nodes-in-a-linked-list/1", nc:null,                                ib:"odd-even-linked-list", cn:null  },
  "Sort LL of 0s, 1s, and 2s":             { lc:null,                                   gfg:"given-a-linked-list-of-0s-1s-and-2s-sort-it/1", nc:null,                                  ib:null, cn:null  },
  "Remove Nth Node from Back":              { lc:"remove-nth-node-from-end-of-list",     gfg:"nth-node-from-end-of-linked-list/1",             nc:"remove-nth-node-from-end-of-list",    ib:"remove-nth-node-from-list-end", cn:"delete-kth-node-from-end"  },
  "Reverse a Linked List":                  { lc:"reverse-linked-list",                  gfg:"reverse-a-linked-list/1",                       nc:"reverse-linked-list",                 ib:"reverse-the-linked-list", cn:"reverse-linked-list"  },
  "Add One to Number in LL":                { lc:null,                                   gfg:"add-1-to-a-number-represented-as-linked-list/1", nc:null,                                  ib:"add-one-to-number", cn:"add-one-to-a-linked-list"  },
  "Find Middle of LL":                      { lc:"middle-of-the-linked-list",            gfg:"finding-middle-element-in-a-linked-list/1",     nc:"middle-of-linked-list",               ib:"find-middle-element", cn:"middle-of-linked-list"  },
  "Delete Middle Node":                     { lc:"delete-the-middle-node-of-a-linked-list", gfg:"delete-middle-of-linked-list/1",             nc:null,                                  ib:null, cn:"delete-middle-node"  },
  "Check if LL is Palindrome":              { lc:"palindrome-linked-list",               gfg:"check-if-linked-list-is-pallindrome/1",         nc:"palindrome-linked-list",              ib:"palindrome-list", cn:"check-palindrome-linked-list"  },
  "Intersection Point of Y LL":             { lc:"intersection-of-two-linked-lists",     gfg:"intersection-point-in-y-shapped-linked-lists/1", nc:"find-the-duplicate-number",          ib:"intersection-of-linked-lists", cn:"intersection-of-two-linked-lists"  },
  "Detect Loop in LL":                      { lc:"linked-list-cycle",                    gfg:"detect-loop-in-linked-list/1",                  nc:"linked-list-cycle",                   ib:"detect-cycle-in-a-linked-list", cn:"detect-a-cycle-in-a-linked-list"  },
  "Find Starting Point of Loop":            { lc:"linked-list-cycle-ii",                 gfg:"find-the-first-node-of-loop-in-linked-list/1",  nc:"find-the-duplicate-number",           ib:"list-cycle", cn:"detect-and-remove-loop"  },
  "Length of Loop":                         { lc:null,                                   gfg:"find-length-of-loop/1",                         nc:null,                                  ib:null, cn:null  },
  "Reverse LL in Groups of K":              { lc:"reverse-nodes-in-k-group",             gfg:"reverse-a-linked-list-in-groups-of-given-size/1", nc:"reverse-nodes-in-k-group",          ib:"k-reverse-linked-list", cn:"reverse-list-in-k-groups"  },
  "Rotate a Linked List":                   { lc:"rotate-list",                          gfg:"rotate-a-linked-list/1",                        nc:"rotate-list",                         ib:"rotate-list", cn:"rotate-linked-list"  },
  "Merge Two Sorted Lists":                 { lc:"merge-two-sorted-lists",               gfg:"merge-two-sorted-linked-lists/1",               nc:"merge-two-sorted-lists",              ib:"merge-two-sorted-linked-lists", cn:"merge-two-sorted-linked-lists"  },
  "Flatten a Linked List":                  { lc:null,                                   gfg:"flattening-a-linked-list/1",                    nc:null,                                  ib:null, cn:"flatten-a-linked-list"  },
  "Sort LL":                                { lc:"sort-list",                             gfg:"sort-a-linked-list/1",                          nc:"sort-list",                           ib:"sort-list", cn:"sort-linked-list"  },
  "Clone LL with Random & Next Pointer":    { lc:"copy-list-with-random-pointer",        gfg:"clone-a-linked-list-with-next-and-random-pointer/1", nc:"copy-list-with-random-pointer",  ib:"clone-list-with-next-and-random-pointer", cn:"clone-linked-list-with-next-and-random-pointer"  },
  "Delete All Occurrences of Key in DLL":   { lc:null,                                   gfg:"delete-all-occurrences-of-a-given-key-in-a-doubly-linked-list/1", nc:null,             ib:null, cn:null  },
  "Remove Duplicates from Sorted DLL":      { lc:"remove-duplicates-from-sorted-list",   gfg:"remove-duplicate-element-from-sorted-linked-list/1", nc:"remove-duplicates-from-sorted-list", ib:null, cn:null  },
  // ── BIT MANIPULATION ──────────────────────────────────────────────────────
  "Intro to Bits & Tricks":                 { lc:null,                                   gfg:"bit-manipulation-1666686020/1",                 nc:null,                                  ib:null, cn:null  },
  "Minimum Bit Flips to Convert Number":    { lc:"minimum-bit-flips-to-convert-number",  gfg:"bit-difference/1",                              nc:null,                                  ib:null, cn:null  },
  "Single Number I":                        { lc:"single-number",                        gfg:"single-number/1",                               nc:"single-number",                       ib:"single-number", cn:"single-number"  },
  "Single Number II":                       { lc:"single-number-ii",                     gfg:"find-the-element-that-appears-once-in-sorted-array/1", nc:"single-number-ii",           ib:null, cn:"single-number-ii"  },
  "Single Number III":                      { lc:"single-number-iii",                    gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Divide Without Multiplication/Division": { lc:"divide-two-integers",                  gfg:null,                                            nc:null,                                  ib:"divide-integers", cn:"divide-two-integers"  },
  "Power Set using Bits":                   { lc:"subsets",                              gfg:"power-set4302/1",                               nc:"subsets",                             ib:"subset", cn:"power-set"  },
  "XOR of Numbers in a Given Range":        { lc:null,                                   gfg:"find-xor-of-numbers-from-l-to-r/1",             nc:null,                                  ib:null, cn:null  },
  // ── GREEDY ────────────────────────────────────────────────────────────────
  "Assign Cookies":                         { lc:"assign-cookies",                       gfg:"assign-cookies/1",                              nc:null,                                  ib:null, cn:"assign-cookies"  },
  "Lemonade Change":                        { lc:"lemonade-change",                      gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Jump Game I":                            { lc:"jump-game",                            gfg:"jump-game/1",                                   nc:"jump-game",                           ib:"jump-game-array", cn:"jump-game"  },
  "Shortest Job First":                     { lc:null,                                   gfg:"shortest-job-first-or-sjf-cpu-scheduling/1",    nc:null,                                  ib:null, cn:null  },
  "Job Sequencing Problem":                 { lc:null,                                   gfg:"job-sequencing-problem-1587115620/1",            nc:null,                                  ib:null, cn:null  },
  "N Meetings in One Room":                 { lc:null,                                   gfg:"n-meetings-in-one-room/1",                      nc:null,                                  ib:null, cn:"n-meetings-in-one-room"  },
  "Non-overlapping Intervals":              { lc:"non-overlapping-intervals",            gfg:"non-overlapping-intervals/1",                   nc:"non-overlapping-intervals",           ib:null, cn:"non-overlapping-intervals"  },
  "Insert Interval":                        { lc:"insert-interval",                      gfg:"insert-interval-1666733669/1",                  nc:"insert-interval",                     ib:null, cn:"insert-interval"  },
  "Minimum Platforms for Railway":          { lc:null,                                   gfg:"minimum-platforms/1",                           nc:null,                                  ib:"minimum-platforms", cn:"minimum-number-of-platforms"  },
  "Valid Parenthesis Checker":              { lc:"valid-parentheses",                    gfg:"parenthesis-checker2744/1",                     nc:"valid-parentheses",                   ib:"valid-parentheses", cn:null  },
  "Candy":                                  { lc:"candy",                                gfg:"candy/1",                                       nc:null,                                  ib:null, cn:"candy"  },
  "Maximum Points from Cards":              { lc:"maximum-points-you-can-obtain-from-cards", gfg:null,                                        nc:null,                                  ib:null, cn:null  },
  // ── SLIDING WINDOW ────────────────────────────────────────────────────────
  "Longest Substring Without Repeating Characters": { lc:"longest-substring-without-repeating-characters", gfg:"length-of-the-longest-substring/1", nc:"longest-substring-without-repeating-characters", ib:"longest-substring-without-repeat", cn:"longest-substring-without-repeating-characters"  },
  "Max Consecutive Ones III":               { lc:"max-consecutive-ones-iii",             gfg:"max-consecutive-ones/1",                        nc:"max-consecutive-ones-iii",            ib:null, cn:"max-consecutive-ones"  },
  "Fruits Into Baskets":                    { lc:"fruit-into-baskets",                   gfg:"fruit-into-baskets/1",                          nc:"fruit-into-baskets",                  ib:null, cn:"fruit-into-baskets"  },
  "Longest Substring With At Most K Distinct Characters": { lc:"longest-substring-with-at-most-k-distinct-characters", gfg:"longest-k-unique-characters-substring/1", nc:null,    ib:null, cn:null  },
  "Longest Repeating Character Replacement":{ lc:"longest-repeating-character-replacement", gfg:"longest-repeating-character-replacement/1", nc:"longest-repeating-character-replacement", ib:null, cn:"longest-repeating-character-replacement"  },
  "Minimum Window Substring":               { lc:"minimum-window-substring",             gfg:"smallest-window-in-a-string-containing-all-the-characters-of-another-string/1", nc:"minimum-window-substring", ib:"smallest-window-containing-all-characters-of-another-string", cn:"minimum-window-substring"  },
  "Number of Substrings Containing All 3 Characters": { lc:"number-of-substrings-containing-all-three-characters", gfg:null,                nc:null,                                  ib:null, cn:null  },
  "Binary Subarrays with Sum":              { lc:"binary-subarrays-with-sum",            gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Count Number of Nice Subarrays":         { lc:"count-number-of-nice-subarrays",       gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  // ── STACK & QUEUE ─────────────────────────────────────────────────────────
  "Implement Stack using Arrays":           { lc:null,                                   gfg:"implement-stack-using-array/1",                 nc:null,                                  ib:"implement-stack-using-array", cn:null  },
  "Implement Queue using Arrays":           { lc:null,                                   gfg:"queue-using-array/1",                           nc:null,                                  ib:null, cn:null  },
  "Implement Stack using Queue":            { lc:"implement-stack-using-queues",         gfg:"stack-using-two-queues/1",                      nc:null,                                  ib:"implement-stack-using-queues", cn:"implement-stack-using-queues"  },
  "Implement Queue using Stack":            { lc:"implement-queue-using-stacks",         gfg:"queue-using-two-stacks/1",                      nc:null,                                  ib:"implement-queue-using-array-and-linkedlist", cn:"implement-queue-using-stacks"  },
  "Stack using Linked List":                { lc:null,                                   gfg:"implement-stack-using-linked-list/1",           nc:null,                                  ib:null, cn:null  },
  "Queue using Linked List":                { lc:null,                                   gfg:"implement-queue-using-linked-list/1",           nc:null,                                  ib:null, cn:null  },
  "Balanced Parenthesis":                   { lc:"valid-parentheses",                    gfg:"parenthesis-checker2744/1",                     nc:"valid-parentheses",                   ib:"valid-parentheses", cn:"valid-parentheses"  },
  "Next Greater Element I":                 { lc:"next-greater-element-i",               gfg:"next-larger-element/1",                         nc:"daily-temperatures",                  ib:"next-greater-element-i", cn:"next-greater-element"  },
  "Next Greater Element II":                { lc:"next-greater-element-ii",              gfg:"next-greater-element/1",                        nc:"daily-temperatures",                  ib:null, cn:"next-greater-element-ii"  },
  "Asteroid Collision":                     { lc:"asteroid-collision",                   gfg:"asteroid-collision/1",                          nc:"asteroid-collision",                  ib:null, cn:"asteroid-collision"  },
  "Sum of Subarray Minimums":               { lc:"sum-of-subarray-minimums",             gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Sum of Subarray Ranges":                 { lc:"sum-of-subarray-ranges",               gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Remove K Digits":                        { lc:"remove-k-digits",                      gfg:"remove-k-digits/1",                             nc:null,                                  ib:null, cn:"remove-k-digits"  },
  "Implement Min Stack":                    { lc:"min-stack",                             gfg:"get-minimum-element-from-stack/1",              nc:"min-stack",                           ib:"min-stack", cn:"min-stack"  },
  "Sliding Window Maximum":                 { lc:"sliding-window-maximum",               gfg:"maximum-of-all-subarrays-of-size-k3/1",         nc:"sliding-window-maximum",              ib:"sliding-window-maximum", cn:"sliding-window-maximum"  },
  "Trapping Rainwater":                     { lc:"trapping-rain-water",                  gfg:"trapping-rain-water/1",                         nc:"trapping-rain-water",                 ib:"rain-water-trapped", cn:"trapping-rainwater"  },
  "Largest Rectangle in Histogram":         { lc:"largest-rectangle-in-histogram",       gfg:"maximum-rectangular-area-in-a-histogram-1587115620/1", nc:"largest-rectangle-in-histogram", ib:"largest-rectangle-in-histogram", cn:"largest-rectangle-in-a-histogram"  },
  "Maximum Rectangle":                      { lc:"maximal-rectangle",                    gfg:"max-rectangle/1",                               nc:"maximal-rectangle",                   ib:null, cn:null  },
  "Stock Span Problem":                     { lc:"online-stock-span",                    gfg:"stock-span-problem-1587115621/1",               nc:null,                                  ib:"span-of-an-array", cn:null  },
  "Celebrity Problem":                      { lc:null,                                   gfg:"the-celebrity-problem/1",                       nc:null,                                  ib:"find-celebrity", cn:null  },
  "LRU Cache":                              { lc:"lru-cache",                             gfg:"lru-cache/1",                                   nc:"lru-cache",                           ib:"lru-cache", cn:"lru-cache"  },
  "LFU Cache":                              { lc:"lfu-cache",                             gfg:null,                                            nc:"lfu-cache",                           ib:null, cn:null  },
  // ── BINARY TREES ──────────────────────────────────────────────────────────
  "Inorder / Preorder / Postorder Traversal":{ lc:"binary-tree-inorder-traversal",       gfg:"inorder-traversal/1",                           nc:"binary-tree-inorder-traversal",       ib:"inorder-traversal", cn:null  },
  "Level Order Traversal":                  { lc:"binary-tree-level-order-traversal",    gfg:"level-order-traversal/1",                       nc:"binary-tree-level-order-traversal",   ib:"level-order", cn:"level-order-traversal"  },
  "Pre, Post, Inorder in One Traversal":    { lc:null,                                   gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Maximum Depth of BT":                    { lc:"maximum-depth-of-binary-tree",         gfg:"height-of-binary-tree/1",                       nc:"maximum-depth-of-binary-tree",        ib:"max-depth-of-binary-tree", cn:"maximum-depth-of-binary-tree"  },
  "Check if Two Trees are Identical":       { lc:"same-tree",                            gfg:"check-if-two-trees-are-identical/1",             nc:"same-tree",                           ib:"identical-binary-trees", cn:"identical-trees"  },
  "Check for Balanced Binary Tree":         { lc:"balanced-binary-tree",                 gfg:"check-for-balanced-tree/1",                     nc:"balanced-binary-tree",                ib:"check-if-binary-tree-is-height-balanced", cn:"height-balanced-binary-tree"  },
  "Diameter of Binary Tree":                { lc:"diameter-of-binary-tree",              gfg:"diameter-of-binary-tree/1",                     nc:"diameter-of-binary-tree",             ib:"diameter-of-binary-tree", cn:"diameter-of-binary-tree"  },
  "Maximum Path Sum":                       { lc:"binary-tree-maximum-path-sum",         gfg:"maximum-path-sum-from-any-node/1",              nc:"binary-tree-maximum-path-sum",        ib:"max-sum-path-in-binary-tree", cn:"binary-tree-maximum-path-sum"  },
  "Check for Symmetrical BTs":              { lc:"symmetric-tree",                       gfg:"symmetric-tree/1",                              nc:"symmetric-tree",                      ib:"symmetric-tree", cn:"symmetric-tree"  },
  "Zig Zag / Spiral Traversal":             { lc:"binary-tree-zigzag-level-order-traversal", gfg:"zigzag-tree-traversal/1",                   nc:"binary-tree-zigzag-level-order-traversal", ib:"zigzag-level-order-traversal-of-binary-tree", cn:"zigzag-binary-tree-traversal"  },
  "Boundary Traversal":                     { lc:null,                                   gfg:"boundary-traversal-of-binary-tree/1",           nc:null,                                  ib:"boundary-traversal", cn:null  },
  "Vertical Order Traversal":               { lc:"vertical-order-traversal-of-a-binary-tree", gfg:"print-a-binary-tree-in-vertical-order/1",  nc:null,                                  ib:"vertical-order-traversal-of-binary-tree", cn:null  },
  "Top / Bottom View of BT":                { lc:null,                                   gfg:"top-view-of-binary-tree/1",                     nc:null,                                  ib:null, cn:null  },
  "Right / Left View of BT":                { lc:"binary-tree-right-side-view",          gfg:"right-view-of-binary-tree/1",                   nc:"binary-tree-right-side-view",         ib:"right-view-of-binary-tree", cn:"right-view-of-binary-tree"  },
  "Print Root to Node Path":                { lc:null,                                   gfg:"root-to-leaf-paths/1",                          nc:null,                                  ib:null, cn:null  },
  "LCA in BT":                              { lc:"lowest-common-ancestor-of-a-binary-tree", gfg:"lowest-common-ancestor-in-a-binary-tree/1", nc:"lowest-common-ancestor-of-a-binary-tree", ib:"least-common-ancestor", cn:"lowest-common-ancestor"  },
  "Maximum Width of BT":                    { lc:"maximum-width-of-binary-tree",         gfg:"maximum-width-of-tree/1",                       nc:"maximum-width-of-binary-tree",        ib:null, cn:"maximum-width-of-binary-tree"  },
  "All Nodes at Distance K":                { lc:"all-nodes-distance-k-in-binary-tree",  gfg:"nodes-at-given-distance-in-binary-tree/1",      nc:null,                                  ib:null, cn:null  },
  "Min Time to Burn BT from a Node":        { lc:null,                                   gfg:"burning-tree/1",                                nc:null,                                  ib:null, cn:null  },
  "Count Total Nodes in Complete BT":       { lc:"count-complete-tree-nodes",            gfg:"count-number-of-nodes-in-a-complete-binary-tree/1", nc:"count-complete-tree-nodes",      ib:null, cn:"count-nodes-in-complete-binary-tree"  },
  "Requirements to Construct Unique BT":    { lc:null,                                   gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Construct BT from Preorder & Inorder":   { lc:"construct-binary-tree-from-preorder-and-inorder-traversal", gfg:"construct-tree-1/1",        nc:"construct-binary-tree-from-preorder-and-inorder-traversal", ib:"construct-binary-tree-from-inorder-and-preorder", cn:"construct-binary-tree-from-inorder-and-preorder-traversal"  },
  "Construct BT from Postorder & Inorder":  { lc:"construct-binary-tree-from-inorder-and-postorder-traversal", gfg:"construct-tree-from-inorder-and-postorder/1", nc:"construct-binary-tree-from-inorder-and-postorder-traversal", ib:null, cn:"construct-binary-tree-from-inorder-and-postorder-traversal"  },
  "Serialize and Deserialize BT":           { lc:"serialize-and-deserialize-binary-tree", gfg:"serialize-and-deserialize-a-binary-tree/1",    nc:"serialize-and-deserialize-binary-tree", ib:"serialize-binary-tree", cn:"serialize-and-deserialize-binary-tree"  },
  "Morris Inorder Traversal":               { lc:"binary-tree-inorder-traversal",        gfg:"inorder-traversal/1",                           nc:null,                                  ib:null, cn:null  },
  "Morris Preorder Traversal":              { lc:"n-ary-tree-preorder-traversal",        gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  // ── BST ───────────────────────────────────────────────────────────────────
  "Introduction to BST":                    { lc:null,                                   gfg:"binary-search-tree-node-deletion/1",             nc:null,                                  ib:null, cn:null  },
  "Search in BST":                          { lc:"search-in-a-binary-search-tree",       gfg:"search-a-node-in-bst/1",                        nc:"search-in-a-binary-search-tree",      ib:"search-in-bst", cn:"search-in-bst"  },
  "Floor and Ceil in BST":                  { lc:null,                                   gfg:"floor-in-bst/1",                                nc:null,                                  ib:null, cn:null  },
  "Insert a Node in BST":                   { lc:"insert-into-a-binary-search-tree",     gfg:"insert-a-node-in-a-bst/1",                      nc:"insert-into-a-binary-search-tree",    ib:null, cn:"insert-a-node-in-bst"  },
  "Delete a Node in BST":                   { lc:"delete-node-in-a-bst",                 gfg:"delete-a-node-from-bst/1",                      nc:"delete-node-in-a-bst",                ib:null, cn:"delete-node-in-bst"  },
  "Kth Smallest and Largest Element":       { lc:"kth-smallest-element-in-a-bst",        gfg:"kth-largest-element-in-bst/1",                  nc:"kth-smallest-element-in-a-bst",       ib:"kth-smallest-element-in-tree", cn:"kth-smallest-element-in-bst"  },
  "Check if Tree is BST":                   { lc:"validate-binary-search-tree",          gfg:"check-for-bst/1",                               nc:"validate-binary-search-tree",         ib:"valid-binary-search-tree", cn:"validate-bst"  },
  "LCA in BST":                             { lc:"lowest-common-ancestor-of-a-binary-search-tree", gfg:"lowest-common-ancestor-in-a-bst/1",   nc:"lowest-common-ancestor-in-bst",       ib:"lowest-common-ancestor", cn:"lowest-common-ancestor-in-a-bst"  },
  "Construct BST from Preorder Traversal":  { lc:"construct-binary-search-tree-from-preorder-traversal", gfg:"construct-bst-from-given-preorder-traversal/1", nc:"construct-binary-search-tree-from-preorder-traversal", ib:null, cn:"construct-bst-from-preorder-traversal"  },
  "Inorder Successor and Predecessor":      { lc:null,                                   gfg:"predecessor-and-successor/1",                   nc:null,                                  ib:"inorder-traversal-of-cartesian-tree", cn:null  },
  "BST Iterator":                           { lc:"binary-search-tree-iterator",          gfg:"bst-iterator/1",                                nc:null,                                  ib:null, cn:null  },
  "Two Sum in BST":                         { lc:"two-sum-iv-input-is-a-bst",            gfg:"find-a-pair-with-given-target-in-bst/1",         nc:"two-sum-iv-input-is-a-bst",           ib:null, cn:"two-sum-in-bst"  },
  "Correct BST with Two Swapped Nodes":     { lc:"recover-binary-search-tree",           gfg:"fixed-two-nodes-of-a-bst/1",                    nc:"recover-binary-search-tree",          ib:null, cn:"recover-bst"  },
  "Largest BST in Binary Tree":             { lc:null,                                   gfg:"largest-bst/1",                                 nc:null,                                  ib:null, cn:null  },
  // ── HEAPS ─────────────────────────────────────────────────────────────────
  "Heapify Algorithm":                      { lc:null,                                   gfg:"heapify/1",                                     nc:null,                                  ib:null, cn:null  },
  "Build Heap from Array":                  { lc:null,                                   gfg:"build-heap/1",                                  nc:null,                                  ib:null, cn:null  },
  "Implement Min / Max Heap":               { lc:null,                                   gfg:"operations-on-binary-min-heap/1",               nc:null,                                  ib:null, cn:null  },
  "Check if Array Represents Min Heap":     { lc:null,                                   gfg:"does-array-represent-heap/1",                   nc:null,                                  ib:null, cn:null  },
  "Convert Min Heap to Max Heap":           { lc:null,                                   gfg:"convert-min-heap-to-max-heap/1",                nc:null,                                  ib:null, cn:null  },
  "Heap Sort":                              { lc:null,                                   gfg:"heap-sort/1",                                   nc:null,                                  ib:null, cn:"heap-sort"  },
  "Kth Largest Element in Array":           { lc:"kth-largest-element-in-an-array",      gfg:"kth-largest-element-in-an-array/1",             nc:"kth-largest-element-in-an-array",     ib:"kth-largest-element", cn:"kth-largest-element"  },
  "Kth Largest in Running Stream":          { lc:"kth-largest-element-in-a-stream",      gfg:"kth-largest-element-in-a-stream/1",             nc:"kth-largest-element-in-a-stream",     ib:null, cn:"kth-largest-element-in-a-stream"  },
  // ── GRAPHS ────────────────────────────────────────────────────────────────
  "BFS & DFS Traversal":                    { lc:null,                                   gfg:"bfs-traversal-of-graph/1",                      nc:null,                                  ib:null, cn:null  },
  "Connected Components":                   { lc:"number-of-connected-components-in-an-undirected-graph", gfg:"number-of-provinces/1",         nc:"number-of-connected-components-in-graph", ib:null, cn:null  },
  "Number of Provinces":                    { lc:"number-of-provinces",                  gfg:"number-of-provinces/1",                         nc:"number-of-provinces",                 ib:null, cn:"number-of-provinces"  },
  "Number of Islands":                      { lc:"number-of-islands",                    gfg:"find-the-number-of-islands/1",                  nc:"number-of-islands",                   ib:"number-of-islands", cn:"number-of-islands"  },
  "Flood Fill Algorithm":                   { lc:"flood-fill",                           gfg:"flood-fill-algorithm/1",                        nc:"flood-fill",                          ib:null, cn:"flood-fill"  },
  "Number of Enclaves":                     { lc:"number-of-enclaves",                   gfg:"number-of-enclaves/1",                          nc:null,                                  ib:null, cn:null  },
  "Rotten Oranges":                         { lc:"rotting-oranges",                      gfg:"rotten-oranges/1",                              nc:"rotting-oranges",                     ib:"rotten-oranges", cn:"rotten-oranges"  },
  "Distance of Nearest Cell with 1":        { lc:"01-matrix",                            gfg:"distance-of-nearest-cell-having-1/1",           nc:null,                                  ib:null, cn:null  },
  "Surrounded Regions":                     { lc:"surrounded-regions",                   gfg:"replace-os-with-xs/1",                          nc:"surrounded-regions",                  ib:null, cn:"surrounded-regions"  },
  "Number of Distinct Islands":             { lc:null,                                   gfg:"number-of-distinct-islands/1",                  nc:null,                                  ib:null, cn:null  },
  "Detect Cycle in Undirected Graph":       { lc:null,                                   gfg:"detect-cycle-in-an-undirected-graph/1",         nc:null,                                  ib:"cycle-in-undirected-graph", cn:"detect-cycle-in-undirected-graph"  },
  "Bipartite Graph":                        { lc:"is-graph-bipartite",                   gfg:"bipartite-graph/1",                             nc:"graph-valid-tree",                    ib:null, cn:"bipartite-graph"  },
  "Topological Sort / Kahn's Algorithm":    { lc:null,                                   gfg:"topological-sort/1",                            nc:null,                                  ib:"topological-sort", cn:"topological-sort"  },
  "Detect Cycle in Directed Graph":         { lc:null,                                   gfg:"detect-cycle-in-a-directed-graph/1",            nc:null,                                  ib:"cycle-in-directed-graph", cn:"detect-cycle-in-a-directed-graph"  },
  "Find Eventual Safe States":              { lc:"find-eventual-safe-states",            gfg:"eventual-safe-states/1",                        nc:null,                                  ib:null, cn:"eventual-safe-states"  },
  "Course Schedule I & II":                 { lc:"course-schedule",                      gfg:"course-schedule/1",                             nc:"course-schedule",                     ib:"possibility-of-finishing-all-courses-given-prerequisites", cn:"course-schedule"  },
  "Alien Dictionary":                       { lc:null,                                   gfg:"alien-dictionary/1",                            nc:"foreign-dictionary",                  ib:"alien-dictionary", cn:null  },
  "Shortest Path in DAG":                   { lc:null,                                   gfg:"shortest-path-in-undirected-graph/1",            nc:null,                                  ib:null, cn:null  },
  "Shortest Path in Undirected Graph":      { lc:null,                                   gfg:"shortest-path-in-undirected-graph/1",            nc:null,                                  ib:null, cn:null  },
  "Word Ladder I & II":                     { lc:"word-ladder",                          gfg:"word-ladder/1",                                 nc:"word-ladder",                         ib:"word-ladder-i", cn:"word-ladder"  },
  "Dijkstra's Algorithm":                   { lc:null,                                   gfg:"implementing-dijkstra-set-1-adjacency-matrix/1", nc:"network-delay-time",                  ib:"dijkstras-shortest-path-algorithm", cn:"dijkstras-shortest-path"  },
  "Print Shortest Path":                    { lc:null,                                   gfg:"shortest-path-in-weighted-undirected-graph/1",   nc:null,                                  ib:null, cn:null  },
  "Shortest Distance in Binary Maze":       { lc:"shortest-path-in-binary-matrix",       gfg:"shortest-path-in-a-binary-maze/1",              nc:null,                                  ib:null, cn:null  },
  "Path with Minimum Effort":               { lc:"path-with-minimum-effort",             gfg:null,                                            nc:"path-with-minimum-effort",            ib:null, cn:null  },
  "Cheapest Flights within K Stops":        { lc:"cheapest-flights-within-k-stops",      gfg:null,                                            nc:"cheapest-flights-within-k-stops",     ib:null, cn:"cheapest-flights-within-k-stops"  },
  "Minimum Multiplications to Reach End":   { lc:null,                                   gfg:"minimum-multiplications-to-reach-end/1",        nc:null,                                  ib:null, cn:null  },
  "Number of Ways to Arrive at Destination":{ lc:"number-of-ways-to-arrive-at-destination", gfg:"number-of-ways-to-arrive-at-destination/1",  nc:null,                                  ib:null, cn:null  },
  "Bellman Ford Algorithm":                 { lc:null,                                   gfg:"bellman-ford/1",                                nc:null,                                  ib:"bellman-ford", cn:"bellman-ford"  },
  "Floyd Warshall Algorithm":               { lc:null,                                   gfg:"implementing-floyd-warshall2/1",                nc:null,                                  ib:null, cn:null  },
  "City with Smallest Number of Neighbors": { lc:"find-the-city-with-the-smallest-number-of-neighbors-at-a-threshold-distance", gfg:null,     nc:null,                                  ib:null, cn:null  },
  "MST – Prim's / Kruskal's":              { lc:null,                                   gfg:"minimum-spanning-tree/1",                       nc:"min-cost-to-connect-all-points",      ib:null, cn:"minimum-spanning-tree"  },
  "Disjoint Set (Union-Find)":              { lc:null,                                   gfg:"disjoint-set-union-find/1",                     nc:null,                                  ib:null, cn:null  },
  "Number of Operations to Connect Network":{ lc:"number-of-operations-to-make-network-connected", gfg:null,                                  nc:null,                                  ib:null, cn:null  },
  "Accounts Merge":                         { lc:"accounts-merge",                       gfg:"account-merge/1",                               nc:"accounts-merge",                      ib:null, cn:"accounts-merge"  },
  "Number of Islands II":                   { lc:null,                                   gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Making a Large Island":                  { lc:"making-a-large-island",                gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Most Stones Removed":                    { lc:"most-stones-removed-with-same-row-or-column", gfg:null,                                     nc:null,                                  ib:null, cn:null  },
  "Kosaraju's Algorithm (SCC)":             { lc:null,                                   gfg:"strongly-connected-components-kosarajus-algo/1", nc:null,                                 ib:null, cn:null  },
  "Bridges in Graph":                       { lc:"critical-connections-in-a-network",    gfg:"bridge-edge-in-graph/1",                        nc:null,                                  ib:null, cn:"bridges-in-graph"  },
  "Articulation Points":                    { lc:null,                                   gfg:"articulation-point-1/1",                        nc:null,                                  ib:null, cn:null  },
  // ── DYNAMIC PROGRAMMING ───────────────────────────────────────────────────
  "Climbing Stairs":                        { lc:"climbing-stairs",                      gfg:"count-ways-to-reach-the-nth-stair-1587115620/1", nc:"climbing-stairs",                    ib:"stairs", cn:"count-ways-to-reach-nth-stairs"  },
  "Frog Jump":                              { lc:null,                                   gfg:"geek-jump/1",                                   nc:null,                                  ib:null, cn:null  },
  "Frog Jump with K Distances":             { lc:"jump-game-ii",                         gfg:"minimal-cost/1",                                nc:null,                                  ib:null, cn:null  },
  "Maximum Sum of Non-Adjacent Elements":   { lc:"house-robber",                         gfg:"stickler-thief-1587115621/1",                   nc:"house-robber",                        ib:"max-sum-without-adjacent-elements", cn:null  },
  "House Robber":                           { lc:"house-robber",                         gfg:"house-robber/1",                                nc:"house-robber",                        ib:"max-sum-without-adjacent-elements", cn:"house-robber"  },
  "Ninja's Training (2D DP)":              { lc:null,                                   gfg:"ninjas-training/1",                             nc:null,                                  ib:null, cn:null  },
  "Grid Unique Paths":                      { lc:"unique-paths",                         gfg:"number-of-unique-paths5339/1",                  nc:"unique-paths",                        ib:"unique-paths-in-a-grid", cn:"unique-paths"  },
  "Unique Paths II":                        { lc:"unique-paths-ii",                      gfg:"unique-paths-in-a-grid/1",                      nc:"unique-paths-ii",                     ib:null, cn:"unique-paths-2"  },
  "Minimum Falling Path Sum":               { lc:"minimum-falling-path-sum",             gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Triangle (DP)":                          { lc:"triangle",                             gfg:"triangle-path-sum/1",                           nc:"triangle",                            ib:"min-sum-path-in-triangle", cn:"triangle"  },
  "Cherry Pickup II":                       { lc:"cherry-pickup-ii",                     gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Best Time to Buy and Sell Stock I":      { lc:"best-time-to-buy-and-sell-stock",      gfg:"stock-buy-and-sell/1",                          nc:"best-time-to-buy-and-sell-stock",     ib:"best-time-to-buy-and-sell-stocks", cn:"buy-and-sell-stock"  },
  "Best Time to Buy and Sell Stock II":     { lc:"best-time-to-buy-and-sell-stock-ii",   gfg:"stock-buy-and-sell2/1",                         nc:"best-time-to-buy-and-sell-stock-with-cooldown", ib:"best-time-to-buy-and-sell-stocks-ii", cn:"buy-and-sell-stock-ii"  },
  "Best Time to Buy and Sell Stock III":    { lc:"best-time-to-buy-and-sell-stock-iii",  gfg:"buy-and-sell-a-share-at-most-twice/1",          nc:"best-time-to-buy-and-sell-stock-iii", ib:null, cn:"buy-and-sell-stock-iii"  },
  "Best Time to Buy and Sell Stock IV":     { lc:"best-time-to-buy-and-sell-stock-iv",   gfg:null,                                            nc:"best-time-to-buy-and-sell-stock-iv",  ib:null, cn:null  },
  "Stock with Transaction Fees":            { lc:"best-time-to-buy-and-sell-stock-with-transaction-fee", gfg:null,                            nc:"best-time-to-buy-and-sell-stock-with-transaction-fee", ib:null, cn:null  },
  "Subset Sum Equals to Target":            { lc:null,                                   gfg:"subset-sum-problem-1611555638/1",               nc:null,                                  ib:null, cn:"subset-sum-equal-to-target"  },
  "Partition Equal Subset Sum":             { lc:"partition-equal-subset-sum",           gfg:"subset-sum-problem/1",                          nc:"partition-equal-subset-sum",          ib:"subset-sum-problem", cn:"subset-sum-equal-to-target"  },
  "Partition into Two Subsets – Min Diff":  { lc:null,                                   gfg:"minimum-sum-partition/1",                       nc:null,                                  ib:null, cn:null  },
  "Count Subsets with Sum K":               { lc:null,                                   gfg:"perfect-sum-problem/1",                         nc:null,                                  ib:null, cn:null  },
  "Count Partitions with Given Difference": { lc:null,                                   gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "0-1 Knapsack":                           { lc:null,                                   gfg:"0-1-knapsack-problem/1",                        nc:null,                                  ib:"0-1-knapsack", cn:"0-1-knapsack"  },
  "Minimum Coins":                          { lc:"coin-change",                          gfg:"number-of-coins/1",                             nc:"coin-change",                         ib:"coin-sum-infinite", cn:"minimum-elements"  },
  "Target Sum":                             { lc:"target-sum",                           gfg:"target-sum/1",                                  nc:"target-sum",                          ib:null, cn:null  },
  "Coin Change II":                         { lc:"coin-change-ii",                       gfg:"coin-change2448/1",                             nc:"coin-change-ii",                      ib:"coin-sum-infinite", cn:"ways-to-make-coin-change"  },
  "Unbounded Knapsack":                     { lc:null,                                   gfg:"unbounded-knapsack/1",                          nc:null,                                  ib:null, cn:"unbounded-knapsack"  },
  "Rod Cutting Problem":                    { lc:null,                                   gfg:"rod-cutting/1",                                 nc:null,                                  ib:null, cn:"rod-cutting-problem"  },
  "Longest Increasing Subsequence":         { lc:"longest-increasing-subsequence",       gfg:"longest-increasing-subsequence/1",              nc:"longest-increasing-subsequence",      ib:"longest-increasing-subsequence", cn:"longest-increasing-subsequence"  },
  "Print LIS":                              { lc:null,                                   gfg:"longest-increasing-subsequence/1",              nc:null,                                  ib:null, cn:null  },
  "Largest Divisible Subset":               { lc:"largest-divisible-subset",             gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Longest String Chain":                   { lc:"longest-string-chain",                 gfg:null,                                            nc:"longest-string-chain",                ib:null, cn:null  },
  "Longest Bitonic Subsequence":            { lc:null,                                   gfg:"longest-bitonic-subsequence/1",                 nc:null,                                  ib:null, cn:null  },
  "Number of Longest Increasing Subsequences": { lc:"number-of-longest-increasing-subsequence", gfg:null,                                    nc:null,                                  ib:null, cn:null  },
  "Longest Common Subsequence":             { lc:"longest-common-subsequence",           gfg:"longest-common-subsequence-1587115620/1",       nc:"longest-common-subsequence",          ib:"longest-common-subsequence", cn:"longest-common-subsequence"  },
  "Longest Common Substring":               { lc:null,                                   gfg:"longest-common-substring/1",                    nc:null,                                  ib:null, cn:null  },
  "Longest Palindromic Subsequence":        { lc:"longest-palindromic-subsequence",      gfg:"longest-palindrome-in-a-string/1",              nc:"longest-palindromic-subsequence",     ib:"longest-palindromic-subsequence", cn:"longest-palindromic-subsequence"  },
  "Min Insertions to Make Palindrome":      { lc:"minimum-insertion-steps-to-make-a-string-palindrome", gfg:null,                             nc:null,                                  ib:null, cn:null  },
  "Min Insertions/Deletions to Convert A to B": { lc:null,                              gfg:"minimum-number-of-deletions-and-insertions/1",  nc:null,                                  ib:null, cn:null  },
  "Shortest Common Supersequence":          { lc:"shortest-common-supersequence",        gfg:"shortest-common-supersequence/1",               nc:null,                                  ib:null, cn:"shortest-supersequence"  },
  "Distinct Subsequences":                  { lc:"distinct-subsequences",                gfg:"count-distinct-subsequences/1",                 nc:"distinct-subsequences",               ib:null, cn:"number-of-distinct-subsequences"  },
  "Edit Distance":                          { lc:"edit-distance",                        gfg:"edit-distance3702/1",                           nc:"edit-distance",                       ib:"edit-distance", cn:"edit-distance"  },
  "Wildcard Matching":                      { lc:"wildcard-matching",                    gfg:"wildcard-string-matching/1",                    nc:"wildcard-matching",                   ib:"regular-expression-ii", cn:"wildcard-string-matching"  },
  "Matrix Chain Multiplication":            { lc:null,                                   gfg:"matrix-chain-multiplication0201/1",             nc:null,                                  ib:"matrix-multiply", cn:"matrix-chain-multiplication"  },
  "Minimum Cost to Cut the Stick":          { lc:"minimum-cost-to-cut-a-stick",          gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  "Burst Balloons":                         { lc:"burst-balloons",                       gfg:null,                                            nc:"burst-balloons",                      ib:null, cn:"burst-balloons"  },
  "Palindrome Partitioning II":             { lc:"palindrome-partitioning-ii",           gfg:"palindromic-patitioning4845/1",                 nc:"palindrome-partitioning-ii",          ib:null, cn:"palindrome-partitioning-ii"  },
  // ── TRIES ─────────────────────────────────────────────────────────────────
  "Trie Implementation and Operations":     { lc:"implement-trie-prefix-tree",           gfg:"trie-insert-and-search/1",                      nc:"implement-trie-prefix-tree",          ib:"implement-trie", cn:"implement-trie"  },
  "Trie – Advanced Operations":             { lc:"design-add-and-search-words-data-structure", gfg:"trie-insert-and-search/1",                nc:"design-add-and-search-words-data-structure", ib:null, cn:null  },
  "Longest Word with All Prefixes":         { lc:"longest-word-in-dictionary",           gfg:null,                                            nc:"word-search-ii",                      ib:null, cn:"longest-word-in-dictionary"  },
  "Number of Distinct Substrings":          { lc:null,                                   gfg:"count-of-distinct-substrings/1",                nc:null,                                  ib:null, cn:null  },
  "Maximum XOR of Two Numbers":             { lc:"maximum-xor-of-two-numbers-in-an-array", gfg:"maximum-xor-of-two-numbers-in-an-array/1",   nc:"maximum-xor-of-two-numbers-in-an-array", ib:null, cn:"maximum-xor-after-operations"  },
  "Maximum XOR with Element from Array":    { lc:"maximum-xor-with-an-element-from-array", gfg:null,                                          nc:null,                                  ib:null, cn:null  },
  // ── STRINGS ───────────────────────────────────────────────────────────────
  "Reverse Every Word in a String":         { lc:"reverse-words-in-a-string",            gfg:"reverse-words-in-a-given-string/1",             nc:"reverse-words-in-a-string",           ib:"reverse-the-string", cn:"reverse-words-in-a-string"  },
  "Minimum Bracket Reversals":              { lc:null,                                   gfg:"minimum-bracket-reversals/1",                   nc:null,                                  ib:null, cn:null  },
  "Count and Say":                          { lc:"count-and-say",                        gfg:null,                                            nc:"count-and-say",                       ib:null, cn:"count-and-say"  },
  "Rabin Karp Algorithm":                   { lc:"find-the-index-of-the-first-occurrence-in-a-string", gfg:"search-pattern-rabin-karp-algorithm/1", nc:null,                          ib:null, cn:null  },
  "Z Function":                             { lc:null,                                   gfg:"z-algorithm/1",                                 nc:null,                                  ib:null, cn:null  },
  "KMP Algorithm / LPS Array":              { lc:"find-the-index-of-the-first-occurrence-in-a-string", gfg:"implement-kmp-algorithm/1",         nc:null,                                  ib:"implement-strstr", cn:"implement-kmp-algorithm"  },
  "Shortest Palindrome":                    { lc:"shortest-palindrome",                  gfg:null,                                            nc:"shortest-palindrome",                 ib:null, cn:"shortest-palindrome"  },
  "Longest Happy Prefix":                   { lc:"longest-happy-prefix",                 gfg:null,                                            nc:null,                                  ib:null, cn:null  },
  // ── MATHEMATICS ───────────────────────────────────────────────────────────
  "Print All Primes till N (Sieve)":        { lc:"count-primes",                         gfg:"sieve-of-eratosthenes/1",                       nc:"count-primes",                        ib:"count-of-primes", cn:"sieve-of-eratosthenes"  },
  "Prime Factorisation of a Number":        { lc:null,                                   gfg:"prime-factorization-using-sieve/1",             nc:null,                                  ib:null, cn:null  },
  "Count Primes in Range L to R":           { lc:null,                                   gfg:"count-primes-in-range/1",                       nc:null,                                  ib:null, cn:null  },
};

function getProblemLinks(name, topicSlug) {
  const e = PROBLEM_LINKS[name] || {};
  const q = encodeURIComponent(name);
  // Topic-level fallback URLs per platform
  const NC_TOPIC = {
    "arrays":"arrays-hashing","binary-search":"binary-search","two-pointers":"two-pointers",
    "sliding-window":"sliding-window","linked-list":"linked-list","stack-queue":"stack","binary-trees":"trees",
    "dp":"1-d-dp","greedy":"greedy","recursion":"backtracking","heaps":"heap-priority-queue",
    "bst":"trees","tries":"tries","bit-manipulation":"bit-manipulation","string-algorithms":"string",
    "graphs":"graphs","default":"practice"
  };
  const IB_TOPIC = {
    "arrays":"arrays","binary-search":"binary-search","two-pointers":"two-pointers",
    "sliding-window":"strings","linked-list":"linked-lists","stack-queue":"stacks-and-queues",
    "binary-trees":"trees","dp":"dynamic-programming","greedy":"greedy-algorithm","recursion":"backtracking",
    "heaps":"heaps-and-maps","bst":"trees","tries":"tries","bit-manipulation":"bit-manipulation",
    "string-algorithms":"strings","graphs":"graph-data-structure-algorithms","default":"programming"
  };
  const HR_TOPIC = {
    "arrays":"data-structures/arrays","binary-search":"algorithms/search","two-pointers":"algorithms/search",
    "sliding-window":"algorithms/strings","linked-list":"data-structures/linked-lists",
    "stack-queue":"data-structures/stacks","binary-trees":"data-structures/trees",
    "dp":"algorithms/dynamic-programming","greedy":"algorithms/greedy","recursion":"algorithms/recursion-and-backtracking",
    "heaps":"data-structures/heap","bst":"data-structures/trees","tries":"data-structures/trie",
    "bit-manipulation":"algorithms/bit-manipulation","string-algorithms":"algorithms/strings",
    "graphs":"algorithms/graph-theory","default":"domains/algorithms"
  };
  const t = topicSlug || "default";
  const ncPath = NC_TOPIC[t] || NC_TOPIC["default"];
  const ibPath = IB_TOPIC[t] || IB_TOPIC["default"];
  const hrPath = HR_TOPIC[t] || HR_TOPIC["default"];
  return [
    {
      name:"LeetCode", color:"#f89f1b", logo:"https://leetcode.com/favicon.ico",
      url: e.lc ? `https://leetcode.com/problems/${e.lc}/` : `https://leetcode.com/problemset/?search=${q}`,
      note: e.lc ? "Direct problem link" : "Search results on LeetCode",
      tag:"Interview Prep", direct:!!e.lc,
    },
    {
      name:"GeeksforGeeks", color:"#2f8d46", logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",
      url: e.gfg ? `https://www.geeksforgeeks.org/problems/${e.gfg}` : `https://www.geeksforgeeks.org/explore?searchQuery=${q}`,
      note: e.gfg ? "Direct problem link" : "Search results on GFG",
      tag:"Beginner Friendly", direct:!!e.gfg,
    },
    {
      name:"NeetCode", color:"#00b8a3", logo:"https://neetcode.io/favicon.ico",
      url: e.nc ? `https://neetcode.io/problems/${e.nc}` : `https://neetcode.io/problems/${ncPath}`,
      note: e.nc ? "Direct problem link" : "Topic practice list on NeetCode",
      tag:"Video Solutions", direct:!!e.nc,
    },
    {
      name:"InterviewBit", color:"#e84393", logo:"https://www.interviewbit.com/favicon.ico",
      url: e.ib ? `https://www.interviewbit.com/problems/${e.ib}/` : `https://www.interviewbit.com/courses/programming/${ibPath}/`,
      note: e.ib ? "Direct problem link" : "Topic section on InterviewBit",
      tag:"Company Tags", direct:!!e.ib,
    },
    {
      name:"Code360", color:"#f5a623", logo:"https://www.naukri.com/favicon.ico",
      url: e.cn ? `https://www.naukri.com/code360/problems/${e.cn}` : `https://www.naukri.com/code360/problems?search=${q}`,
      note: e.cn ? "Direct problem link" : "Search results on Code360",
      tag:"Indian Platform", direct:!!e.cn,
    },
    {
      name:"HackerRank", color:"#00ea64", logo:"https://hrcdn.net/fcore/assets/brand/favicon-ddc852f75a.png",
      url:`https://www.hackerrank.com/domains/${hrPath}`,
      note:"Topic section on HackerRank", tag:"Certificates", direct:false,
    },
  ];
}

// Maps DSA_DATA slug to TUF_CHECKLIST keys
const SLUG_TO_CHECKLIST = {
  "arrays":           ["Arrays (Medium)", "Arrays (Hard)"],
  "binary-search":    ["Binary Search"],
  "two-pointers":     [],
  "sliding-window":   ["Sliding Window"],
  "linked-list":      ["Linked List"],
  "stack-queue":      ["Stack & Queue"],
  "binary-trees":     ["Binary Trees"],
  "dp":               ["Dynamic Programming"],
  "greedy":           ["Greedy"],
  "recursion":        ["Recursion & Backtracking"],
  "heaps":            ["Heaps"],
  "bst":              ["Binary Search Trees"],
  "tries":            ["Tries"],
  "bit-manipulation": ["Bit Manipulation"],
  "string-algorithms":["Strings – Advanced"],
  "graphs":           ["Graphs"],
};



// ── PRE-DSA PREP DATA ─────────────────────────────────────────────────────
const PRE_DSA_TRACKS = [
  {
    id:"absolute-beginner", icon:"🌱", title:"Absolute Beginner", level:"Start Here",
    color:"#00ff88", platform:"HackerRank",
    desc:"Zero to basics. No prior coding needed. Build logic from scratch.",
    platformUrl:"https://www.hackerrank.com/domains/tutorials/30-days-of-code",
    problems:[
      {name:"Hello World",url:"https://www.hackerrank.com/challenges/py-hello-world",diff:"Easy",note:"Your first program"},
      {name:"Data Types",url:"https://www.hackerrank.com/challenges/py-arithmetic-operators",diff:"Easy",note:"Numbers & operations"},
      {name:"Conditional Statements",url:"https://www.hackerrank.com/challenges/py-if-else",diff:"Easy",note:"If/Else logic"},
      {name:"Loops",url:"https://www.hackerrank.com/challenges/py-for-loop",diff:"Easy",note:"For & While loops"},
      {name:"Functions",url:"https://www.hackerrank.com/challenges/write-a-function",diff:"Easy",note:"Create reusable logic"},
      {name:"Arrays / Lists",url:"https://www.hackerrank.com/challenges/array-math",diff:"Easy",note:"Store multiple values"},
      {name:"Strings",url:"https://www.hackerrank.com/challenges/python-string-formatting",diff:"Easy",note:"Text manipulation"},
      {name:"FizzBuzz",url:"https://www.hackerrank.com/challenges/fizzbuzz",diff:"Easy",note:"Classic logic problem"},
      {name:"Find Largest Number",url:"https://www.hackerrank.com/challenges/compare-the-triplets",diff:"Easy",note:"Comparison logic"},
      {name:"Sum of Array",url:"https://www.hackerrank.com/challenges/a-very-big-sum",diff:"Easy",note:"Loop + accumulation"},
    ]
  },
  {
    id:"logic-building", icon:"🧮", title:"Logic Building", level:"Week 1-2",
    color:"#ffd60a", platform:"HackerRank + LeetCode Easy",
    desc:"Build problem-solving instincts with simple puzzles.",
    platformUrl:"https://www.hackerrank.com/domains/algorithms/warmup",
    problems:[
      {name:"Reverse a String",url:"https://www.hackerrank.com/challenges/java-strings-introduction",diff:"Easy",note:"Learn traversal"},
      {name:"Check Palindrome",url:"https://leetcode.com/problems/valid-palindrome/",diff:"Easy",note:"Two pointer intro"},
      {name:"Count Vowels",url:"https://www.hackerrank.com/challenges/counting-valleys",diff:"Easy",note:"Condition + counter"},
      {name:"Find Missing Number",url:"https://leetcode.com/problems/missing-number/",diff:"Easy",note:"Math trick"},
      {name:"Sum of Digits",url:"https://www.hackerrank.com/challenges/extra-long-factorials",diff:"Easy",note:"Loop + math"},
      {name:"Check Armstrong Number",url:"https://www.hackerrank.com/challenges/sherlock-and-squares",diff:"Easy",note:"Power & math"},
      {name:"Fibonacci Sequence",url:"https://leetcode.com/problems/fibonacci-number/",diff:"Easy",note:"Recursion intro"},
      {name:"Factorial",url:"https://www.hackerrank.com/challenges/extra-long-factorials",diff:"Easy",note:"Loops & math"},
      {name:"Prime Check",url:"https://www.hackerrank.com/challenges/identify-smith-numbers",diff:"Easy",note:"Divisibility"},
      {name:"Anagram Check",url:"https://leetcode.com/problems/valid-anagram/",diff:"Easy",note:"Frequency counting"},
      {name:"Count Frequency of Elements",url:"https://www.hackerrank.com/challenges/frequency-queries",diff:"Easy",note:"HashMap basics"},
      {name:"Find Duplicates in Array",url:"https://leetcode.com/problems/find-all-duplicates-in-an-array/",diff:"Medium",note:"HashSet usage"},
      {name:"Second Largest Number",url:"https://www.hackerrank.com/challenges/find-second-maximum-number-in-a-list",diff:"Easy",note:"Single pass tracking"},
      {name:"Number Pattern Printing",url:"https://www.hackerrank.com/challenges/staircase",diff:"Easy",note:"Nested loops"},
    ]
  },
  {
    id:"array-basics", icon:"📦", title:"Array & String Basics", level:"Week 2-3",
    color:"#00b8a3", platform:"LeetCode Easy",
    desc:"Foundation of every DSA topic. Master these before anything else.",
    platformUrl:"https://leetcode.com/problemset/?difficulty=EASY&topicSlugs=array",
    problems:[
      {name:"Two Sum",url:"https://leetcode.com/problems/two-sum/",diff:"Easy",note:"Hash map intro"},
      {name:"Best Time to Buy Stock",url:"https://leetcode.com/problems/best-time-to-buy-and-sell-stock/",diff:"Easy",note:"Single pass"},
      {name:"Contains Duplicate",url:"https://leetcode.com/problems/contains-duplicate/",diff:"Easy",note:"Set usage"},
      {name:"Move Zeroes",url:"https://leetcode.com/problems/move-zeroes/",diff:"Easy",note:"Two pointer"},
      {name:"Maximum Subarray",url:"https://leetcode.com/problems/maximum-subarray/",diff:"Medium",note:"Kadane's algorithm"},
      {name:"Remove Duplicates",url:"https://leetcode.com/problems/remove-duplicates-from-sorted-array/",diff:"Easy",note:"In-place ops"},
      {name:"Merge Sorted Array",url:"https://leetcode.com/problems/merge-sorted-array/",diff:"Easy",note:"Two pointer"},
      {name:"Majority Element",url:"https://leetcode.com/problems/majority-element/",diff:"Easy",note:"Boyer-Moore voting"},
      {name:"Rotate Array",url:"https://leetcode.com/problems/rotate-array/",diff:"Medium",note:"Reversal trick"},
      {name:"Plus One",url:"https://leetcode.com/problems/plus-one/",diff:"Easy",note:"Carry propagation"},
    ]
  },
  {
    id:"math-patterns", icon:"🔢", title:"Math & Number Theory", level:"Week 3-4",
    color:"#f5a623", platform:"LeetCode Easy + HackerRank",
    desc:"Essential math patterns that appear constantly in DSA problems.",
    platformUrl:"https://leetcode.com/problemset/?difficulty=EASY&topicSlugs=math",
    problems:[
      {name:"Palindrome Number",url:"https://leetcode.com/problems/palindrome-number/",diff:"Easy",note:"Digit reversal"},
      {name:"Reverse Integer",url:"https://leetcode.com/problems/reverse-integer/",diff:"Medium",note:"Overflow handling"},
      {name:"Count Primes",url:"https://leetcode.com/problems/count-primes/",diff:"Medium",note:"Sieve of Eratosthenes"},
      {name:"Power of Two",url:"https://leetcode.com/problems/power-of-two/",diff:"Easy",note:"Bit trick"},
      {name:"Excel Sheet Column Number",url:"https://leetcode.com/problems/excel-sheet-column-number/",diff:"Easy",note:"Base conversion"},
      {name:"Happy Number",url:"https://leetcode.com/problems/happy-number/",diff:"Easy",note:"Fast/slow pointers"},
      {name:"Roman to Integer",url:"https://leetcode.com/problems/roman-to-integer/",diff:"Easy",note:"Lookup table"},
      {name:"Add Binary",url:"https://leetcode.com/problems/add-binary/",diff:"Easy",note:"Bit addition"},
      {name:"Sqrt(x)",url:"https://leetcode.com/problems/sqrtx/",diff:"Easy",note:"Binary search on answer"},
      {name:"GCD of Two Numbers",url:"https://www.hackerrank.com/challenges/functional-programming-warmups-in-recursion---gcd/problem",diff:"Easy",note:"Euclidean algorithm"},
      {name:"Power(x,n) — Fast Exponentiation",url:"https://leetcode.com/problems/powx-n/",diff:"Medium",note:"Binary exponentiation"},
      {name:"Trailing Zeros in Factorial",url:"https://leetcode.com/problems/factorial-trailing-zeroes/",diff:"Medium",note:"Count factors of 5"},
      {name:"Excel Sheet Column Number",url:"https://leetcode.com/problems/excel-sheet-column-number/",diff:"Easy",note:"Base-26 number system"},
      {name:"Integer to Roman",url:"https://leetcode.com/problems/integer-to-roman/",diff:"Medium",note:"Greedy + lookup"},
      {name:"Number of 1 Bits",url:"https://leetcode.com/problems/number-of-1-bits/",diff:"Easy",note:"Bit counting basics"},
      {name:"Ugly Number",url:"https://leetcode.com/problems/ugly-number/",diff:"Easy",note:"Prime factorization check"},
    ]
  },
  {
    id:"string-patterns", icon:"🔤", title:"String Fundamentals", level:"Week 4-5",
    color:"#e84393", platform:"LeetCode Easy",
    desc:"String problems are in every interview. Build strong string instincts.",
    platformUrl:"https://leetcode.com/problemset/?difficulty=EASY&topicSlugs=string",
    problems:[
      {name:"Valid Parentheses",url:"https://leetcode.com/problems/valid-parentheses/",diff:"Easy",note:"Stack intro"},
      {name:"Length of Last Word",url:"https://leetcode.com/problems/length-of-last-word/",diff:"Easy",note:"String traversal"},
      {name:"Reverse String",url:"https://leetcode.com/problems/reverse-string/",diff:"Easy",note:"Two pointer"},
      {name:"First Unique Character",url:"https://leetcode.com/problems/first-unique-character-in-a-string/",diff:"Easy",note:"Frequency map"},
      {name:"Valid Anagram",url:"https://leetcode.com/problems/valid-anagram/",diff:"Easy",note:"Char counting"},
      {name:"Implement strStr()",url:"https://leetcode.com/problems/find-the-index-of-the-first-occurrence-in-a-string/",diff:"Easy",note:"Pattern search"},
      {name:"Count and Say",url:"https://leetcode.com/problems/count-and-say/",diff:"Medium",note:"Sequence generation"},
      {name:"Longest Common Prefix",url:"https://leetcode.com/problems/longest-common-prefix/",diff:"Easy",note:"String comparison"},
      {name:"Is Subsequence",url:"https://leetcode.com/problems/is-subsequence/",diff:"Easy",note:"Two pointer"},
      {name:"Reverse Words in a String",url:"https://leetcode.com/problems/reverse-words-in-a-string/",diff:"Medium",note:"Split + join"},
      {name:"Roman to Integer",url:"https://leetcode.com/problems/roman-to-integer/",diff:"Easy",note:"Lookup map"},
      {name:"Detect Capital",url:"https://leetcode.com/problems/detect-capital/",diff:"Easy",note:"String rules"},
      {name:"String Compression",url:"https://leetcode.com/problems/string-compression/",diff:"Medium",note:"Two pointer + count"},
      {name:"Check if Pangram",url:"https://leetcode.com/problems/check-if-the-sentence-is-pangram/",diff:"Easy",note:"Set of chars"},
    ]
  },
  {
    id:"ready-for-dsa", icon:"🚀", title:"Ready for DSA!", level:"After Week 5",
    color:"#7c4dff", platform:"LeetCode Medium",
    desc:"You are now ready to tackle real DSA topics. Start with Arrays → Linked Lists → Trees.",
    platformUrl:"https://neetcode.io/practice",
    problems:[
      {name:"3Sum",url:"https://leetcode.com/problems/3sum/",diff:"Medium",note:"Two pointer"},
      {name:"Product of Array Except Self",url:"https://leetcode.com/problems/product-of-array-except-self/",diff:"Medium",note:"Prefix sum"},
      {name:"Group Anagrams",url:"https://leetcode.com/problems/group-anagrams/",diff:"Medium",note:"Hash map grouping"},
      {name:"Longest Substring Without Repeating",url:"https://leetcode.com/problems/longest-substring-without-repeating-characters/",diff:"Medium",note:"Sliding window"},
      {name:"Container With Most Water",url:"https://leetcode.com/problems/container-with-most-water/",diff:"Medium",note:"Two pointer"},
      {name:"Climbing Stairs",url:"https://leetcode.com/problems/climbing-stairs/",diff:"Easy",note:"DP intro"},
      {name:"Reverse Linked List",url:"https://leetcode.com/problems/reverse-linked-list/",diff:"Easy",note:"Linked list"},
      {name:"Binary Search",url:"https://leetcode.com/problems/binary-search/",diff:"Easy",note:"Search"},
      {name:"Number of Islands",url:"https://leetcode.com/problems/number-of-islands/",diff:"Medium",note:"BFS/DFS"},
    ]
  },
];

// ── PATTERNS DATA (14 Must-Master Patterns) ────────────────────────────────
const PATTERNS_DATA = [
  {
    id:"two-pointers", icon:"👆👆", name:"Two Pointers", phase:"Arrays & Strings",
    coreIdea:"Use two indices moving toward or away from each other to reduce O(n²) to O(n).",
    where:"Arrays, Strings, Linked Lists",
    problems:[
      {name:"Two Sum II",lc:"two-sum-ii-input-array-is-sorted",diff:"Easy"},
      {name:"Squares of a Sorted Array",lc:"squares-of-a-sorted-array",diff:"Easy"},
      {name:"Remove Duplicates from Sorted Array",lc:"remove-duplicates-from-sorted-array",diff:"Easy"},
      {name:"Move Zeroes",lc:"move-zeroes",diff:"Easy"},
      {name:"Container With Most Water",lc:"container-with-most-water",diff:"Medium"},
      {name:"3Sum",lc:"3sum",diff:"Medium"},
      {name:"4Sum",lc:"4sum",diff:"Medium"},
      {name:"Trapping Rain Water",lc:"trapping-rain-water",diff:"Hard"},
      {name:"Minimum Window Substring",lc:"minimum-window-substring",diff:"Hard"},
    ]
  },
  {
    id:"sliding-window", icon:"🪟", name:"Sliding Window", phase:"Arrays & Strings",
    coreIdea:"Maintain a window of elements and slide it to avoid recomputation.",
    where:"Strings, Arrays",
    problems:[
      {name:"Longest Substring Without Repeating Characters",lc:"longest-substring-without-repeating-characters",diff:"Medium"},
      {name:"Minimum Size Subarray Sum",lc:"minimum-size-subarray-sum",diff:"Medium"},
      {name:"Longest Repeating Character Replacement",lc:"longest-repeating-character-replacement",diff:"Medium"},
      {name:"Permutation in String",lc:"permutation-in-string",diff:"Medium"},
      {name:"Minimum Window Substring",lc:"minimum-window-substring",diff:"Hard"},
      {name:"Sliding Window Maximum",lc:"sliding-window-maximum",diff:"Hard"},
      {name:"Fruit Into Baskets",lc:"fruit-into-baskets",diff:"Medium"},
      {name:"Max Consecutive Ones III",lc:"max-consecutive-ones-iii",diff:"Medium"},
    ]
  },
  {
    id:"fast-slow-pointers", icon:"🐢🐇", name:"Fast & Slow Pointers", phase:"Linked Lists",
    coreIdea:"Use two pointers at different speeds to detect cycles or find midpoints.",
    where:"Linked Lists, Arrays",
    problems:[
      {name:"Linked List Cycle",lc:"linked-list-cycle",diff:"Easy"},
      {name:"Middle of the Linked List",lc:"middle-of-the-linked-list",diff:"Easy"},
      {name:"Linked List Cycle II",lc:"linked-list-cycle-ii",diff:"Medium"},
      {name:"Happy Number",lc:"happy-number",diff:"Easy"},
      {name:"Find the Duplicate Number",lc:"find-the-duplicate-number",diff:"Medium"},
      {name:"Palindrome Linked List",lc:"palindrome-linked-list",diff:"Easy"},
      {name:"Reorder List",lc:"reorder-list",diff:"Medium"},
    ]
  },
  {
    id:"prefix-sum", icon:"➕", name:"Prefix / Cumulative Sum", phase:"Arrays & Strings",
    coreIdea:"Precompute cumulative sums to answer range queries in O(1).",
    where:"Arrays",
    problems:[
      {name:"Subarray Sum Equals K",lc:"subarray-sum-equals-k",diff:"Medium"},
      {name:"Find Pivot Index",lc:"find-pivot-index",diff:"Easy"},
      {name:"Range Sum Query - Immutable",lc:"range-sum-query-immutable",diff:"Easy"},
      {name:"Product of Array Except Self",lc:"product-of-array-except-self",diff:"Medium"},
      {name:"Continuous Subarray Sum",lc:"continuous-subarray-sum",diff:"Medium"},
      {name:"Count Number of Nice Subarrays",lc:"count-number-of-nice-subarrays",diff:"Medium"},
      {name:"Binary Subarrays With Sum",lc:"binary-subarrays-with-sum",diff:"Medium"},
    ]
  },
  {
    id:"monotonic-stack", icon:"📚", name:"Monotonic Stack", phase:"Stacks",
    coreIdea:"Maintain a stack in increasing/decreasing order to find next greater/smaller elements.",
    where:"Stacks, Arrays",
    problems:[
      {name:"Daily Temperatures",lc:"daily-temperatures",diff:"Medium"},
      {name:"Next Greater Element I",lc:"next-greater-element-i",diff:"Easy"},
      {name:"Next Greater Element II",lc:"next-greater-element-ii",diff:"Medium"},
      {name:"Largest Rectangle in Histogram",lc:"largest-rectangle-in-histogram",diff:"Hard"},
      {name:"Trapping Rain Water",lc:"trapping-rain-water",diff:"Hard"},
      {name:"Sum of Subarray Minimums",lc:"sum-of-subarray-minimums",diff:"Medium"},
      {name:"Remove K Digits",lc:"remove-k-digits",diff:"Medium"},
      {name:"Asteroid Collision",lc:"asteroid-collision",diff:"Medium"},
    ]
  },
  {
    id:"bfs-dfs", icon:"🌊🔍", name:"BFS / DFS", phase:"Trees & Graphs",
    coreIdea:"BFS uses a queue for level-order traversal; DFS uses a stack/recursion for depth-first.",
    where:"Trees, Graphs",
    problems:[
      {name:"Binary Tree Level Order Traversal",lc:"binary-tree-level-order-traversal",diff:"Medium"},
      {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
      {name:"Flood Fill",lc:"flood-fill",diff:"Easy"},
      {name:"Clone Graph",lc:"clone-graph",diff:"Medium"},
      {name:"Word Ladder",lc:"word-ladder",diff:"Hard"},
      {name:"Rotting Oranges",lc:"rotting-oranges",diff:"Medium"},
      {name:"01 Matrix",lc:"01-matrix",diff:"Medium"},
      {name:"Course Schedule",lc:"course-schedule",diff:"Medium"},
      {name:"Pacific Atlantic Water Flow",lc:"pacific-atlantic-water-flow",diff:"Medium"},
    ]
  },
  {
    id:"binary-search", icon:"🔢", name:"Binary Search", phase:"Arrays",
    coreIdea:"Repeatedly halve the search space by comparing the target with the middle element.",
    where:"Arrays, DP",
    problems:[
      {name:"Binary Search",lc:"binary-search",diff:"Easy"},
      {name:"Search Insert Position",lc:"search-insert-position",diff:"Easy"},
      {name:"Find Minimum in Rotated Sorted Array",lc:"find-minimum-in-rotated-sorted-array",diff:"Medium"},
      {name:"Search in Rotated Sorted Array",lc:"search-in-rotated-sorted-array",diff:"Medium"},
      {name:"Koko Eating Bananas",lc:"koko-eating-bananas",diff:"Medium"},
      {name:"Find Peak Element",lc:"find-peak-element",diff:"Medium"},
      {name:"Median of Two Sorted Arrays",lc:"median-of-two-sorted-arrays",diff:"Hard"},
      {name:"Split Array Largest Sum",lc:"split-array-largest-sum",diff:"Hard"},
    ]
  },
  {
    id:"topological-sort", icon:"🗺️", name:"Topological Sort", phase:"Graphs",
    coreIdea:"Linear ordering of nodes such that for every directed edge u→v, u comes before v.",
    where:"Graphs (DAGs)",
    problems:[
      {name:"Course Schedule",lc:"course-schedule",diff:"Medium"},
      {name:"Course Schedule II",lc:"course-schedule-ii",diff:"Medium"},
      {name:"Alien Dictionary",lc:"alien-dictionary",diff:"Hard"},
      {name:"Find Eventual Safe States",lc:"find-eventual-safe-states",diff:"Medium"},
      {name:"Parallel Courses",lc:"parallel-courses",diff:"Medium"},
      {name:"Sequence Reconstruction",lc:"sequence-reconstruction",diff:"Medium"},
    ]
  },
  {
    id:"union-find", icon:"🤝", name:"Union Find (Disjoint Set)", phase:"Graphs",
    coreIdea:"Track connected components efficiently using union and find operations with path compression.",
    where:"Graphs",
    problems:[
      {name:"Number of Connected Components",lc:"number-of-connected-components-in-an-undirected-graph",diff:"Medium"},
      {name:"Redundant Connection",lc:"redundant-connection",diff:"Medium"},
      {name:"Accounts Merge",lc:"accounts-merge",diff:"Medium"},
      {name:"Making a Large Island",lc:"making-a-large-island",diff:"Hard"},
      {name:"Number of Islands II",lc:"number-of-islands-ii",diff:"Hard"},
      {name:"Most Stones Removed",lc:"most-stones-removed-with-same-row-or-column",diff:"Medium"},
    ]
  },
  {
    id:"backtracking", icon:"↩️", name:"Backtracking", phase:"Recursion",
    coreIdea:"Explore all possibilities by building solutions incrementally and undoing choices that fail.",
    where:"Strings, Combinations, Grids",
    problems:[
      {name:"Subsets",lc:"subsets",diff:"Medium"},
      {name:"Permutations",lc:"permutations",diff:"Medium"},
      {name:"Combination Sum",lc:"combination-sum",diff:"Medium"},
      {name:"Combination Sum II",lc:"combination-sum-ii",diff:"Medium"},
      {name:"Word Search",lc:"word-search",diff:"Medium"},
      {name:"N-Queens",lc:"n-queens",diff:"Hard"},
      {name:"Sudoku Solver",lc:"sudoku-solver",diff:"Hard"},
      {name:"Palindrome Partitioning",lc:"palindrome-partitioning",diff:"Medium"},
      {name:"Letter Combinations of a Phone Number",lc:"letter-combinations-of-a-phone-number",diff:"Medium"},
    ]
  },
  {
    id:"kadanes", icon:"📈", name:"Kadane's Algorithm", phase:"Arrays & DP",
    coreIdea:"Track max subarray sum ending at each index; reset when sum goes negative.",
    where:"Arrays, DP",
    problems:[
      {name:"Maximum Subarray",lc:"maximum-subarray",diff:"Medium"},
      {name:"Best Time to Buy and Sell Stock",lc:"best-time-to-buy-and-sell-stock",diff:"Easy"},
      {name:"Maximum Product Subarray",lc:"maximum-product-subarray",diff:"Medium"},
      {name:"Maximum Sum Circular Subarray",lc:"maximum-sum-circular-subarray",diff:"Medium"},
      {name:"Longest Turbulent Subarray",lc:"longest-turbulent-subarray",diff:"Medium"},
    ]
  },
  {
    id:"dynamic-programming", icon:"💡", name:"Dynamic Programming", phase:"DP",
    coreIdea:"Break problems into overlapping subproblems and store results to avoid recomputation.",
    where:"Arrays, Strings, Grids",
    problems:[
      {name:"Climbing Stairs",lc:"climbing-stairs",diff:"Easy"},
      {name:"House Robber",lc:"house-robber",diff:"Medium"},
      {name:"Coin Change",lc:"coin-change",diff:"Medium"},
      {name:"Longest Common Subsequence",lc:"longest-common-subsequence",diff:"Medium"},
      {name:"Longest Increasing Subsequence",lc:"longest-increasing-subsequence",diff:"Medium"},
      {name:"Edit Distance",lc:"edit-distance",diff:"Hard"},
      {name:"Unique Paths",lc:"unique-paths",diff:"Medium"},
      {name:"Partition Equal Subset Sum",lc:"partition-equal-subset-sum",diff:"Medium"},
      {name:"Word Break",lc:"word-break",diff:"Medium"},
      {name:"Burst Balloons",lc:"burst-balloons",diff:"Hard"},
      {name:"Regular Expression Matching",lc:"regular-expression-matching",diff:"Hard"},
    ]
  },
  {
    id:"greedy", icon:"🤑", name:"Greedy", phase:"Greedy + Intervals",
    coreIdea:"Make the locally optimal choice at each step to reach a globally optimal solution.",
    where:"Intervals, Strings",
    problems:[
      {name:"Jump Game",lc:"jump-game",diff:"Medium"},
      {name:"Jump Game II",lc:"jump-game-ii",diff:"Medium"},
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"Non-overlapping Intervals",lc:"non-overlapping-intervals",diff:"Medium"},
      {name:"Insert Interval",lc:"insert-interval",diff:"Medium"},
      {name:"Candy",lc:"candy",diff:"Hard"},
      {name:"Gas Station",lc:"gas-station",diff:"Medium"},
      {name:"Task Scheduler",lc:"task-scheduler",diff:"Medium"},
    ]
  },
  {
    id:"heap", icon:"⛰️", name:"Heap / Priority Queue", phase:"Heaps",
    coreIdea:"Use a min/max heap to efficiently retrieve the smallest/largest element.",
    where:"K-th problems, Streams",
    problems:[
      {name:"Kth Largest Element in an Array",lc:"kth-largest-element-in-an-array",diff:"Medium"},
      {name:"Top K Frequent Elements",lc:"top-k-frequent-elements",diff:"Medium"},
      {name:"Merge K Sorted Lists",lc:"merge-k-sorted-lists",diff:"Hard"},
      {name:"Find Median from Data Stream",lc:"find-median-from-data-stream",diff:"Hard"},
      {name:"Task Scheduler",lc:"task-scheduler",diff:"Medium"},
      {name:"K Closest Points to Origin",lc:"k-closest-points-to-origin",diff:"Medium"},
      {name:"Reorganize String",lc:"reorganize-string",diff:"Medium"},
      {name:"Kth Smallest Element in BST",lc:"kth-smallest-element-in-a-bst",diff:"Medium"},
    ]
  },
  {
    id:"hash-map", icon:"🗂️", name:"Hash Map / Set", phase:"Arrays & Strings",
    coreIdea:"Use O(1) lookups to count frequencies, detect duplicates, or group elements.",
    where:"Arrays, Strings",
    problems:[
      {name:"Two Sum",lc:"two-sum",diff:"Easy"},
      {name:"Valid Anagram",lc:"valid-anagram",diff:"Easy"},
      {name:"Contains Duplicate",lc:"contains-duplicate",diff:"Easy"},
      {name:"Group Anagrams",lc:"group-anagrams",diff:"Medium"},
      {name:"Top K Frequent Elements",lc:"top-k-frequent-elements",diff:"Medium"},
      {name:"Longest Consecutive Sequence",lc:"longest-consecutive-sequence",diff:"Medium"},
      {name:"Subarray Sum Equals K",lc:"subarray-sum-equals-k",diff:"Medium"},
      {name:"4Sum II",lc:"4sum-ii",diff:"Medium"},
    ]
  },
  {
    id:"tree-dp", icon:"🌲", name:"Tree DP (DFS on Trees)", phase:"Trees",
    coreIdea:"Run DFS post-order and return values up the tree — combine child results at each node.",
    where:"Binary Trees, BST",
    problems:[
      {name:"Diameter of Binary Tree",lc:"diameter-of-binary-tree",diff:"Easy"},
      {name:"Maximum Path Sum",lc:"binary-tree-maximum-path-sum",diff:"Hard"},
      {name:"Balanced Binary Tree",lc:"balanced-binary-tree",diff:"Easy"},
      {name:"House Robber III",lc:"house-robber-iii",diff:"Medium"},
      {name:"Longest Univalue Path",lc:"longest-univalue-path",diff:"Medium"},
      {name:"Binary Tree Cameras",lc:"binary-tree-cameras",diff:"Hard"},
      {name:"Count Good Nodes in Binary Tree",lc:"count-good-nodes-in-binary-tree",diff:"Medium"},
    ]
  },
  {
    id:"bit-manipulation", icon:"⚙️", name:"Bit Manipulation", phase:"Algorithms",
    coreIdea:"Use XOR, AND, OR, and shifts to solve problems without extra space — often O(1).",
    where:"Arrays, Numbers",
    problems:[
      {name:"Single Number",lc:"single-number",diff:"Easy"},
      {name:"Number of 1 Bits",lc:"number-of-1-bits",diff:"Easy"},
      {name:"Counting Bits",lc:"counting-bits",diff:"Easy"},
      {name:"Reverse Bits",lc:"reverse-bits",diff:"Easy"},
      {name:"Missing Number",lc:"missing-number",diff:"Easy"},
      {name:"Sum of Two Integers",lc:"sum-of-two-integers",diff:"Medium"},
      {name:"Single Number II",lc:"single-number-ii",diff:"Medium"},
      {name:"Find the Duplicate Number",lc:"find-the-duplicate-number",diff:"Medium"},
    ]
  },
  {
    id:"merge-intervals", icon:"📏", name:"Merge Intervals", phase:"Greedy + Intervals",
    coreIdea:"Sort intervals by start time, then greedily merge overlapping ones.",
    where:"Arrays, Intervals",
    problems:[
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"Insert Interval",lc:"insert-interval",diff:"Medium"},
      {name:"Non-overlapping Intervals",lc:"non-overlapping-intervals",diff:"Medium"},
      {name:"Meeting Rooms",lc:"meeting-rooms",diff:"Easy"},
      {name:"Meeting Rooms II",lc:"meeting-rooms-ii",diff:"Medium"},
      {name:"Minimum Number of Arrows to Burst Balloons",lc:"minimum-number-of-arrows-to-burst-balloons",diff:"Medium"},
      {name:"Employee Free Time",lc:"employee-free-time",diff:"Hard"},
    ]
  },
  {
    id:"trie", icon:"🌐", name:"Trie (Prefix Tree)", phase:"Advanced DS",
    coreIdea:"A tree where each node represents a character — enables O(L) prefix search.",
    where:"Strings, Dictionaries",
    problems:[
      {name:"Implement Trie",lc:"implement-trie-prefix-tree",diff:"Medium"},
      {name:"Design Add and Search Words",lc:"design-add-and-search-words-data-structure",diff:"Medium"},
      {name:"Word Search II",lc:"word-search-ii",diff:"Hard"},
      {name:"Replace Words",lc:"replace-words",diff:"Medium"},
      {name:"Map Sum Pairs",lc:"map-sum-pairs",diff:"Medium"},
      {name:"Maximum XOR of Two Numbers",lc:"maximum-xor-of-two-numbers-in-an-array",diff:"Medium"},
    ]
  },
  {
    id:"matrix-traversal", icon:"🗺️", name:"Matrix Traversal / Island Pattern", phase:"Graphs",
    coreIdea:"Treat 2D grids as graphs — BFS/DFS in 4 directions to explore connected regions.",
    where:"2D Grids, Matrices",
    problems:[
      {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
      {name:"Flood Fill",lc:"flood-fill",diff:"Easy"},
      {name:"Max Area of Island",lc:"max-area-of-island",diff:"Medium"},
      {name:"Surrounded Regions",lc:"surrounded-regions",diff:"Medium"},
      {name:"Pacific Atlantic Water Flow",lc:"pacific-atlantic-water-flow",diff:"Medium"},
      {name:"Rotting Oranges",lc:"rotting-oranges",diff:"Medium"},
      {name:"Shortest Path in Binary Matrix",lc:"shortest-path-in-binary-matrix",diff:"Medium"},
      {name:"Word Search",lc:"word-search",diff:"Medium"},
    ]
  },
];

// ── BLIND 75 DATA ─────────────────────────────────────────────────────────
const BLIND75 = [
  { cat:"Arrays & Hashing", problems:[
    {name:"Two Sum",lc:"two-sum",diff:"Easy"},
    {name:"Best Time to Buy & Sell Stock",lc:"best-time-to-buy-and-sell-stock",diff:"Easy"},
    {name:"Contains Duplicate",lc:"contains-duplicate",diff:"Easy"},
    {name:"Product of Array Except Self",lc:"product-of-array-except-self",diff:"Medium"},
    {name:"Maximum Subarray",lc:"maximum-subarray",diff:"Medium"},
    {name:"Maximum Product Subarray",lc:"maximum-product-subarray",diff:"Medium"},
    {name:"Find Minimum in Rotated Sorted Array",lc:"find-minimum-in-rotated-sorted-array",diff:"Medium"},
    {name:"Search in Rotated Sorted Array",lc:"search-in-rotated-sorted-array",diff:"Medium"},
    {name:"3Sum",lc:"3sum",diff:"Medium"},
    {name:"Container With Most Water",lc:"container-with-most-water",diff:"Medium"},
  ]},
  { cat:"Binary", problems:[
    {name:"Sum of Two Integers",lc:"sum-of-two-integers",diff:"Medium"},
    {name:"Number of 1 Bits",lc:"number-of-1-bits",diff:"Easy"},
    {name:"Counting Bits",lc:"counting-bits",diff:"Easy"},
    {name:"Missing Number",lc:"missing-number",diff:"Easy"},
    {name:"Reverse Bits",lc:"reverse-bits",diff:"Easy"},
  ]},
  { cat:"Dynamic Programming", problems:[
    {name:"Climbing Stairs",lc:"climbing-stairs",diff:"Easy"},
    {name:"Coin Change",lc:"coin-change",diff:"Medium"},
    {name:"Longest Increasing Subsequence",lc:"longest-increasing-subsequence",diff:"Medium"},
    {name:"Longest Common Subsequence",lc:"longest-common-subsequence",diff:"Medium"},
    {name:"Word Break",lc:"word-break",diff:"Medium"},
    {name:"Combination Sum IV",lc:"combination-sum-iv",diff:"Medium"},
    {name:"House Robber",lc:"house-robber",diff:"Medium"},
    {name:"House Robber II",lc:"house-robber-ii",diff:"Medium"},
    {name:"Decode Ways",lc:"decode-ways",diff:"Medium"},
    {name:"Unique Paths",lc:"unique-paths",diff:"Medium"},
    {name:"Jump Game",lc:"jump-game",diff:"Medium"},
  ]},
  { cat:"Graphs", problems:[
    {name:"Clone Graph",lc:"clone-graph",diff:"Medium"},
    {name:"Course Schedule",lc:"course-schedule",diff:"Medium"},
    {name:"Pacific Atlantic Water Flow",lc:"pacific-atlantic-water-flow",diff:"Medium"},
    {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
    {name:"Longest Consecutive Sequence",lc:"longest-consecutive-sequence",diff:"Medium"},
    {name:"Alien Dictionary",lc:"alien-dictionary",diff:"Hard"},
    {name:"Graph Valid Tree",lc:"graph-valid-tree",diff:"Medium"},
    {name:"Number of Connected Components",lc:"number-of-connected-components-in-an-undirected-graph",diff:"Medium"},
  ]},
  { cat:"Intervals", problems:[
    {name:"Insert Interval",lc:"insert-interval",diff:"Medium"},
    {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
    {name:"Non-overlapping Intervals",lc:"non-overlapping-intervals",diff:"Medium"},
    {name:"Meeting Rooms",lc:"meeting-rooms",diff:"Easy"},
    {name:"Meeting Rooms II",lc:"meeting-rooms-ii",diff:"Medium"},
  ]},
  { cat:"Linked Lists", problems:[
    {name:"Reverse Linked List",lc:"reverse-linked-list",diff:"Easy"},
    {name:"Detect Cycle in Linked List",lc:"linked-list-cycle",diff:"Easy"},
    {name:"Merge Two Sorted Lists",lc:"merge-two-sorted-lists",diff:"Easy"},
    {name:"Merge K Sorted Lists",lc:"merge-k-sorted-lists",diff:"Hard"},
    {name:"Remove Nth Node From End",lc:"remove-nth-node-from-end-of-list",diff:"Medium"},
    {name:"Reorder List",lc:"reorder-list",diff:"Medium"},
  ]},
  { cat:"Matrix", problems:[
    {name:"Set Matrix Zeroes",lc:"set-matrix-zeroes",diff:"Medium"},
    {name:"Spiral Matrix",lc:"spiral-matrix",diff:"Medium"},
    {name:"Rotate Image",lc:"rotate-image",diff:"Medium"},
    {name:"Word Search",lc:"word-search",diff:"Medium"},
  ]},
  { cat:"Strings", problems:[
    {name:"Longest Substring Without Repeating Characters",lc:"longest-substring-without-repeating-characters",diff:"Medium"},
    {name:"Longest Repeating Character Replacement",lc:"longest-repeating-character-replacement",diff:"Medium"},
    {name:"Minimum Window Substring",lc:"minimum-window-substring",diff:"Hard"},
    {name:"Valid Anagram",lc:"valid-anagram",diff:"Easy"},
    {name:"Group Anagrams",lc:"group-anagrams",diff:"Medium"},
    {name:"Valid Parentheses",lc:"valid-parentheses",diff:"Easy"},
    {name:"Valid Palindrome",lc:"valid-palindrome",diff:"Easy"},
    {name:"Longest Palindromic Substring",lc:"longest-palindromic-substring",diff:"Medium"},
    {name:"Palindromic Substrings",lc:"palindromic-substrings",diff:"Medium"},
    {name:"Encode and Decode Strings",lc:"encode-and-decode-strings",diff:"Medium"},
  ]},
  { cat:"Trees", problems:[
    {name:"Maximum Depth of Binary Tree",lc:"maximum-depth-of-binary-tree",diff:"Easy"},
    {name:"Same Tree",lc:"same-tree",diff:"Easy"},
    {name:"Invert Binary Tree",lc:"invert-binary-tree",diff:"Easy"},
    {name:"Binary Tree Maximum Path Sum",lc:"binary-tree-maximum-path-sum",diff:"Hard"},
    {name:"Binary Tree Level Order Traversal",lc:"binary-tree-level-order-traversal",diff:"Medium"},
    {name:"Serialize and Deserialize Binary Tree",lc:"serialize-and-deserialize-binary-tree",diff:"Hard"},
    {name:"Subtree of Another Tree",lc:"subtree-of-another-tree",diff:"Easy"},
    {name:"Construct Tree from Preorder and Inorder",lc:"construct-binary-tree-from-preorder-and-inorder-traversal",diff:"Medium"},
    {name:"Validate Binary Search Tree",lc:"validate-binary-search-tree",diff:"Medium"},
    {name:"Kth Smallest Element in BST",lc:"kth-smallest-element-in-a-bst",diff:"Medium"},
    {name:"Lowest Common Ancestor of BST",lc:"lowest-common-ancestor-of-a-binary-search-tree",diff:"Medium"},
    {name:"Implement Trie",lc:"implement-trie-prefix-tree",diff:"Medium"},
    {name:"Design Add and Search Words",lc:"design-add-and-search-words-data-structure",diff:"Medium"},
    {name:"Word Search II",lc:"word-search-ii",diff:"Hard"},
  ]},
  { cat:"Heap", problems:[
    {name:"Merge K Sorted Lists",lc:"merge-k-sorted-lists",diff:"Hard"},
    {name:"Top K Frequent Elements",lc:"top-k-frequent-elements",diff:"Medium"},
    {name:"Find Median from Data Stream",lc:"find-median-from-data-stream",diff:"Hard"},
  ]},
];

// ── COMPANY WISE DATA ─────────────────────────────────────────────────────
const COMPANY_DATA = [
  {
    name:"Google", logo:"https://www.google.com/s2/favicons?domain=google.com&sz=64", color:"#4285f4",
    hires:"SWE, ML, Data", rounds:"3-5 DSA rounds",
    problems:[
      {name:"Trapping Rain Water",lc:"trapping-rain-water",diff:"Hard"},
      {name:"Word Ladder",lc:"word-ladder",diff:"Hard"},
      {name:"LRU Cache",lc:"lru-cache",diff:"Medium"},
      {name:"Find Median from Data Stream",lc:"find-median-from-data-stream",diff:"Hard"},
      {name:"Skyline Problem",lc:"the-skyline-problem",diff:"Hard"},
      {name:"Meeting Rooms II",lc:"meeting-rooms-ii",diff:"Medium"},
      {name:"Next Permutation",lc:"next-permutation",diff:"Medium"},
      {name:"Decode Ways",lc:"decode-ways",diff:"Medium"},
      {name:"Strobogrammatic Number II",lc:"strobogrammatic-number-ii",diff:"Medium"},
      {name:"Minimum Window Substring",lc:"minimum-window-substring",diff:"Hard"},
      {name:"Largest Rectangle in Histogram",lc:"largest-rectangle-in-histogram",diff:"Hard"},
      {name:"Serialize and Deserialize Binary Tree",lc:"serialize-and-deserialize-binary-tree",diff:"Hard"},
    ]
  },
  {
    name:"Amazon", logo:"https://www.google.com/s2/favicons?domain=amazon.com&sz=64", color:"#ff9900",
    hires:"SDE I/II, Data", rounds:"2-4 DSA rounds",
    problems:[
      {name:"Two Sum",lc:"two-sum",diff:"Easy"},
      {name:"LRU Cache",lc:"lru-cache",diff:"Medium"},
      {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
      {name:"Reorder Data in Log Files",lc:"reorder-data-in-log-files",diff:"Medium"},
      {name:"Top K Frequent Words",lc:"top-k-frequent-words",diff:"Medium"},
      {name:"Prison Cells After N Days",lc:"prison-cells-after-n-days",diff:"Medium"},
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"Course Schedule",lc:"course-schedule",diff:"Medium"},
      {name:"Min Cost to Connect All Points",lc:"min-cost-to-connect-all-points",diff:"Medium"},
      {name:"Longest Substring Without Repeating",lc:"longest-substring-without-repeating-characters",diff:"Medium"},
      {name:"Trapping Rain Water",lc:"trapping-rain-water",diff:"Hard"},
      {name:"Sliding Window Maximum",lc:"sliding-window-maximum",diff:"Hard"},
    ]
  },
  {
    name:"Microsoft", logo:"https://www.google.com/s2/favicons?domain=microsoft.com&sz=64", color:"#00a4ef",
    hires:"SWE, SDET", rounds:"2-3 DSA rounds",
    problems:[
      {name:"Reverse Linked List",lc:"reverse-linked-list",diff:"Easy"},
      {name:"Valid Parentheses",lc:"valid-parentheses",diff:"Easy"},
      {name:"Binary Tree Level Order Traversal",lc:"binary-tree-level-order-traversal",diff:"Medium"},
      {name:"LRU Cache",lc:"lru-cache",diff:"Medium"},
      {name:"Clone Graph",lc:"clone-graph",diff:"Medium"},
      {name:"Max Area of Island",lc:"max-area-of-island",diff:"Medium"},
      {name:"Word Search",lc:"word-search",diff:"Medium"},
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"Course Schedule II",lc:"course-schedule-ii",diff:"Medium"},
      {name:"Serialize and Deserialize BST",lc:"serialize-and-deserialize-bst",diff:"Medium"},
    ]
  },
  {
    name:"Meta (Facebook)", logo:"https://www.google.com/s2/favicons?domain=meta.com&sz=64", color:"#1877f2",
    hires:"SWE, Infra", rounds:"2 DSA + system design",
    problems:[
      {name:"Add and Search Word",lc:"design-add-and-search-words-data-structure",diff:"Medium"},
      {name:"Regular Expression Matching",lc:"regular-expression-matching",diff:"Hard"},
      {name:"Find All Anagrams in String",lc:"find-all-anagrams-in-a-string",diff:"Medium"},
      {name:"Move Zeroes",lc:"move-zeroes",diff:"Easy"},
      {name:"Merge K Sorted Lists",lc:"merge-k-sorted-lists",diff:"Hard"},
      {name:"Binary Tree Right Side View",lc:"binary-tree-right-side-view",diff:"Medium"},
      {name:"Product of Array Except Self",lc:"product-of-array-except-self",diff:"Medium"},
      {name:"Valid Palindrome II",lc:"valid-palindrome-ii",diff:"Easy"},
      {name:"Random Pick with Weight",lc:"random-pick-with-weight",diff:"Medium"},
      {name:"Accounts Merge",lc:"accounts-merge",diff:"Medium"},
      {name:"Minimum Remove to Make Valid Parentheses",lc:"minimum-remove-to-make-valid-parentheses",diff:"Medium"},
    ]
  },
  {
    name:"Apple", logo:"https://www.google.com/s2/favicons?domain=apple.com&sz=64", color:"#555",
    hires:"SWE, iOS/macOS", rounds:"3-5 rounds",
    problems:[
      {name:"Two Sum",lc:"two-sum",diff:"Easy"},
      {name:"Reverse Linked List",lc:"reverse-linked-list",diff:"Easy"},
      {name:"3Sum",lc:"3sum",diff:"Medium"},
      {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
      {name:"Word Break",lc:"word-break",diff:"Medium"},
      {name:"Longest Palindromic Substring",lc:"longest-palindromic-substring",diff:"Medium"},
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"Kth Largest Element",lc:"kth-largest-element-in-an-array",diff:"Medium"},
      {name:"Trapping Rain Water",lc:"trapping-rain-water",diff:"Hard"},
    ]
  },
  {
    name:"Flipkart", logo:"https://www.google.com/s2/favicons?domain=flipkart.com&sz=64", color:"#2874f0",
    hires:"SDE I/II", rounds:"2-3 DSA rounds",
    problems:[
      {name:"Maximum Subarray",lc:"maximum-subarray",diff:"Medium"},
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"LRU Cache",lc:"lru-cache",diff:"Medium"},
      {name:"Lowest Common Ancestor",lc:"lowest-common-ancestor-of-a-binary-tree",diff:"Medium"},
      {name:"Serialize/Deserialize Binary Tree",lc:"serialize-and-deserialize-binary-tree",diff:"Hard"},
      {name:"Word Break",lc:"word-break",diff:"Medium"},
      {name:"Next Permutation",lc:"next-permutation",diff:"Medium"},
      {name:"Clone a Graph",lc:"clone-graph",diff:"Medium"},
      {name:"Median from Data Stream",lc:"find-median-from-data-stream",diff:"Hard"},
    ]
  },
  {
    name:"Adobe", logo:"https://www.google.com/s2/favicons?domain=adobe.com&sz=64", color:"#e1251b",
    hires:"SWE, MTS", rounds:"2-3 DSA rounds",
    problems:[
      {name:"Two Sum",lc:"two-sum",diff:"Easy"},
      {name:"Valid Parentheses",lc:"valid-parentheses",diff:"Easy"},
      {name:"Best Time to Buy and Sell Stock",lc:"best-time-to-buy-and-sell-stock",diff:"Easy"},
      {name:"Maximum Subarray",lc:"maximum-subarray",diff:"Medium"},
      {name:"3Sum",lc:"3sum",diff:"Medium"},
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"Word Search",lc:"word-search",diff:"Medium"},
      {name:"Minimum Window Substring",lc:"minimum-window-substring",diff:"Hard"},
    ]
  },
  {
    name:"Infosys", logo:"https://www.google.com/s2/favicons?domain=infosys.com&sz=64", color:"#007cc3",
    hires:"SE, SSE", rounds:"1-2 DSA rounds",
    problems:[
      {name:"Two Sum",lc:"two-sum",diff:"Easy"},
      {name:"Reverse Linked List",lc:"reverse-linked-list",diff:"Easy"},
      {name:"Valid Parentheses",lc:"valid-parentheses",diff:"Easy"},
      {name:"Merge Two Sorted Lists",lc:"merge-two-sorted-lists",diff:"Easy"},
      {name:"Maximum Subarray",lc:"maximum-subarray",diff:"Medium"},
      {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
    ]
  },
  {
    name:"TCS", logo:"https://www.google.com/s2/favicons?domain=tcs.com&sz=64", color:"#1a1a7e",
    hires:"ASE, Systems", rounds:"1-2 DSA rounds",
    problems:[
      {name:"Find Missing Number",lc:"missing-number",diff:"Easy"},
      {name:"Reverse Array",lc:"reverse-string",diff:"Easy"},
      {name:"Two Sum",lc:"two-sum",diff:"Easy"},
      {name:"Fibonacci Number",lc:"fibonacci-number",diff:"Easy"},
      {name:"Binary Search",lc:"binary-search",diff:"Easy"},
      {name:"Palindrome Number",lc:"palindrome-number",diff:"Easy"},
    ]
  },
  {
    name:"Walmart", logo:"https://www.google.com/s2/favicons?domain=walmart.com&sz=64", color:"#0071ce",
    hires:"SWE, Data", rounds:"2-3 DSA rounds",
    problems:[
      {name:"Two Sum",lc:"two-sum",diff:"Easy"},
      {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
      {name:"LRU Cache",lc:"lru-cache",diff:"Medium"},
      {name:"Top K Frequent Elements",lc:"top-k-frequent-elements",diff:"Medium"},
      {name:"Merge K Sorted Lists",lc:"merge-k-sorted-lists",diff:"Hard"},
      {name:"Course Schedule",lc:"course-schedule",diff:"Medium"},
      {name:"Minimum Window Substring",lc:"minimum-window-substring",diff:"Hard"},
    ]
  },
  {
    name:"Swiggy", logo:"https://www.google.com/s2/favicons?domain=swiggy.com&sz=64", color:"#fc8019",
    hires:"SDE I/II, Backend", rounds:"2-3 DSA rounds",
    problems:[
      {name:"LRU Cache",lc:"lru-cache",diff:"Medium"},
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
      {name:"Top K Frequent Elements",lc:"top-k-frequent-elements",diff:"Medium"},
      {name:"Design Twitter",lc:"design-twitter",diff:"Medium"},
      {name:"Kth Largest Element",lc:"kth-largest-element-in-an-array",diff:"Medium"},
      {name:"Longest Substring Without Repeating",lc:"longest-substring-without-repeating-characters",diff:"Medium"},
      {name:"Course Schedule",lc:"course-schedule",diff:"Medium"},
      {name:"Maximum Subarray",lc:"maximum-subarray",diff:"Medium"},
      {name:"Clone Graph",lc:"clone-graph",diff:"Medium"},
    ]
  },
  {
    name:"Zepto", logo:"https://www.google.com/s2/favicons?domain=zepto.com&sz=64", color:"#8a2be2",
    hires:"SDE I/II", rounds:"2-3 DSA rounds",
    problems:[
      {name:"Two Sum",lc:"two-sum",diff:"Easy"},
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"Maximum Subarray",lc:"maximum-subarray",diff:"Medium"},
      {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
      {name:"Lowest Common Ancestor",lc:"lowest-common-ancestor-of-a-binary-tree",diff:"Medium"},
      {name:"LRU Cache",lc:"lru-cache",diff:"Medium"},
      {name:"Word Break",lc:"word-break",diff:"Medium"},
      {name:"Trapping Rain Water",lc:"trapping-rain-water",diff:"Hard"},
      {name:"Rotting Oranges",lc:"rotting-oranges",diff:"Medium"},
    ]
  },
  {
    name:"Razorpay", logo:"https://www.google.com/s2/favicons?domain=razorpay.com&sz=64", color:"#2d9cdb",
    hires:"SDE I/II, Platform", rounds:"2-3 DSA rounds",
    problems:[
      {name:"LRU Cache",lc:"lru-cache",diff:"Medium"},
      {name:"Design Twitter",lc:"design-twitter",diff:"Medium"},
      {name:"Merge K Sorted Lists",lc:"merge-k-sorted-lists",diff:"Hard"},
      {name:"Find Median from Data Stream",lc:"find-median-from-data-stream",diff:"Hard"},
      {name:"Valid Parentheses",lc:"valid-parentheses",diff:"Easy"},
      {name:"Coin Change",lc:"coin-change",diff:"Medium"},
      {name:"Top K Frequent Elements",lc:"top-k-frequent-elements",diff:"Medium"},
      {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
    ]
  },
  {
    name:"Paytm", logo:"https://www.google.com/s2/favicons?domain=paytm.com&sz=64", color:"#002970",
    hires:"SDE I/II", rounds:"2-3 DSA rounds",
    problems:[
      {name:"Two Sum",lc:"two-sum",diff:"Easy"},
      {name:"Maximum Subarray",lc:"maximum-subarray",diff:"Medium"},
      {name:"LRU Cache",lc:"lru-cache",diff:"Medium"},
      {name:"Validate BST",lc:"validate-binary-search-tree",diff:"Medium"},
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"Word Break",lc:"word-break",diff:"Medium"},
      {name:"Lowest Common Ancestor",lc:"lowest-common-ancestor-of-a-binary-tree",diff:"Medium"},
      {name:"Clone Graph",lc:"clone-graph",diff:"Medium"},
    ]
  },
  {
    name:"Uber", logo:"https://www.google.com/s2/favicons?domain=uber.com&sz=64", color:"#000000",
    hires:"SWE, Backend", rounds:"2-4 DSA rounds",
    problems:[
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
      {name:"Word Ladder",lc:"word-ladder",diff:"Hard"},
      {name:"LRU Cache",lc:"lru-cache",diff:"Medium"},
      {name:"Network Delay Time",lc:"network-delay-time",diff:"Medium"},
      {name:"Course Schedule",lc:"course-schedule",diff:"Medium"},
      {name:"Find Median from Data Stream",lc:"find-median-from-data-stream",diff:"Hard"},
      {name:"Trapping Rain Water",lc:"trapping-rain-water",diff:"Hard"},
      {name:"Alien Dictionary",lc:"alien-dictionary",diff:"Hard"},
    ]
  },
  {
    name:"Wipro", logo:"https://www.google.com/s2/favicons?domain=wipro.com&sz=64", color:"#341c75",
    hires:"SE, Tech Lead", rounds:"1-2 DSA rounds",
    problems:[
      {name:"Two Sum",lc:"two-sum",diff:"Easy"},
      {name:"Reverse Linked List",lc:"reverse-linked-list",diff:"Easy"},
      {name:"Valid Parentheses",lc:"valid-parentheses",diff:"Easy"},
      {name:"Maximum Subarray",lc:"maximum-subarray",diff:"Medium"},
      {name:"Binary Search",lc:"binary-search",diff:"Easy"},
      {name:"Fibonacci Number",lc:"fibonacci-number",diff:"Easy"},
    ]
  },
  {
    name:"Accenture", logo:"https://www.google.com/s2/favicons?domain=accenture.com&sz=64", color:"#a100ff",
    hires:"ASE, SE", rounds:"1-2 DSA rounds",
    problems:[
      {name:"Two Sum",lc:"two-sum",diff:"Easy"},
      {name:"Palindrome Number",lc:"palindrome-number",diff:"Easy"},
      {name:"Reverse String",lc:"reverse-string",diff:"Easy"},
      {name:"Valid Parentheses",lc:"valid-parentheses",diff:"Easy"},
      {name:"Merge Two Sorted Lists",lc:"merge-two-sorted-lists",diff:"Easy"},
      {name:"Maximum Subarray",lc:"maximum-subarray",diff:"Medium"},
    ]
  },
  {
    name:"Oracle", logo:"https://www.google.com/s2/favicons?domain=oracle.com&sz=64", color:"#f80000",
    hires:"SWE, DB Engineer", rounds:"2-3 DSA rounds",
    problems:[
      {name:"LRU Cache",lc:"lru-cache",diff:"Medium"},
      {name:"Top K Frequent Elements",lc:"top-k-frequent-elements",diff:"Medium"},
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
      {name:"Serialize and Deserialize Binary Tree",lc:"serialize-and-deserialize-binary-tree",diff:"Hard"},
      {name:"Find Median from Data Stream",lc:"find-median-from-data-stream",diff:"Hard"},
      {name:"Course Schedule",lc:"course-schedule",diff:"Medium"},
      {name:"Maximum Subarray",lc:"maximum-subarray",diff:"Medium"},
    ]
  },
  {
    name:"PhonePe", logo:"https://www.google.com/s2/favicons?domain=phonepe.com&sz=64", color:"#5f259f",
    hires:"SDE I/II, Backend", rounds:"2-3 DSA rounds",
    problems:[
      {name:"LRU Cache",lc:"lru-cache",diff:"Medium"},
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
      {name:"Top K Frequent Elements",lc:"top-k-frequent-elements",diff:"Medium"},
      {name:"Word Break",lc:"word-break",diff:"Medium"},
      {name:"Maximum Subarray",lc:"maximum-subarray",diff:"Medium"},
      {name:"Lowest Common Ancestor",lc:"lowest-common-ancestor-of-a-binary-tree",diff:"Medium"},
      {name:"Coin Change",lc:"coin-change",diff:"Medium"},
      {name:"Course Schedule",lc:"course-schedule",diff:"Medium"},
    ]
  },
  {
    name:"Myntra", logo:"https://www.google.com/s2/favicons?domain=myntra.com&sz=64", color:"#ff3f6c",
    hires:"SDE I/II, Frontend", rounds:"2-3 DSA rounds",
    problems:[
      {name:"Two Sum",lc:"two-sum",diff:"Easy"},
      {name:"Merge Intervals",lc:"merge-intervals",diff:"Medium"},
      {name:"LRU Cache",lc:"lru-cache",diff:"Medium"},
      {name:"Maximum Subarray",lc:"maximum-subarray",diff:"Medium"},
      {name:"Longest Substring Without Repeating",lc:"longest-substring-without-repeating-characters",diff:"Medium"},
      {name:"Number of Islands",lc:"number-of-islands",diff:"Medium"},
      {name:"Top K Frequent Elements",lc:"top-k-frequent-elements",diff:"Medium"},
      {name:"Course Schedule",lc:"course-schedule",diff:"Medium"},
    ]
  },
];

// ── VISUALIZERS DATA ──────────────────────────────────────────────────────
const VISUALIZERS_DATA = [
  {
    name:"VisuAlgo", url:"https://visualgo.net/en", color:"#00b8a3",
    icon:"🎬", tag:"Most Comprehensive",
    desc:"Visualize sorting, BST, graph algorithms, DP, and 20+ more. Best for understanding traversal step by step.",
    topics:["Sorting","BST","Graph","DP","Hashing","Linked List","Binary Heap"],
  },
  {
    name:"Algorithm Visualizer", url:"https://algorithm-visualizer.seancoughlin.me/", color:"#7c4dff",
    icon:"🔬", tag:"Interactive Code",
    desc:"Run algorithm code step-by-step with live visualization. Great for seeing exactly how code executes.",
    topics:["BFS","DFS","Dijkstra","Sorting","Dynamic Programming"],
  },
  {
    name:"USFCA Visualizations", url:"https://www.cs.usfca.edu/~galles/visualization/Algorithms.html", color:"#f5a623",
    icon:"🏛️", tag:"Classic Reference",
    desc:"Classic university tool covering AVL trees, B-trees, heaps, and advanced data structures.",
    topics:["AVL Tree","B-Tree","Heap","Red-Black Tree","Hash Tables","Trie"],
  },
];

// ── RESOURCES DATA ────────────────────────────────────────────────────────
const DSA_RESOURCES = [
  { name:"Company-Wise LeetCode Questions", url:"https://github.com/krishnadey30/LeetCode-Questions-CompanyWise", icon:"🏢", desc:"GitHub repo with LeetCode questions sorted by company — Google, Amazon, Meta, and 50+ more.", tag:"Company Prep" },
  { name:"15 Patterns to Master Interviews", url:"https://manralai.medium.com/only-15-patterns-to-master-any-coding-interview-570a3afc9042", icon:"🧩", desc:"Medium article explaining 15 core patterns that cover almost every coding interview problem.", tag:"Patterns" },
  { name:"Striver's SDE Sheet", url:"https://takeuforward.org/dsa/strivers-sde-sheet-top-coding-interview-problems", icon:"📋", desc:"Top 191 coding interview problems curated by Striver — the most trusted sheet for SDE prep.", tag:"Top Sheet" },
  { name:"DSA Revision Sheet (Google Drive)", url:"https://drive.google.com/file/d/1CBdqMvkgjZGiWmlHZMX8aF1AbSEPaulI/view", icon:"📄", desc:"Comprehensive DSA revision notes PDF covering all major topics with examples.", tag:"Notes" },
  { name:"DSA Problem Spreadsheet", url:"https://docs.google.com/spreadsheets/d/1hzP8j7matoUiJ15N-RhsL5Dmig8_E3aP/htmlview", icon:"📊", desc:"Google Sheets tracker with 300+ problems organized by topic, difficulty, and company tag.", tag:"Tracker" },
];


// ── PATTERN 21 + 22 (added to PATTERNS_DATA above via concat) ────────────────
const EXTRA_PATTERNS = [
  { id:"ll-reversal", icon:"🔄", name:"In-Place Linked List Reversal", phase:"Linked Lists",
    coreIdea:"Reverse pointers in-place without extra space by tracking prev, curr, next nodes.",
    where:"Linked Lists",
    problems:[
      {name:"Reverse Linked List", lc:"reverse-linked-list", diff:"Easy"},
      {name:"Reverse Linked List II", lc:"reverse-linked-list-ii", diff:"Medium"},
      {name:"Reverse Nodes in k-Group", lc:"reverse-nodes-in-k-group", diff:"Hard"},
      {name:"Reorder List", lc:"reorder-list", diff:"Medium"},
      {name:"Rotate List", lc:"rotate-list", diff:"Medium"},
      {name:"Palindrome Linked List", lc:"palindrome-linked-list", diff:"Easy"},
    ]},
  { id:"cyclic-sort", icon:"🔃", name:"Cyclic Sort", phase:"Arrays",
    coreIdea:"Place each number at its correct index position by cycling — O(n) for missing/duplicate numbers.",
    where:"Arrays with numbers in range 1 to N",
    problems:[
      {name:"Missing Number", lc:"missing-number", diff:"Easy"},
      {name:"Find All Duplicates in Array", lc:"find-all-duplicates-in-an-array", diff:"Medium"},
      {name:"First Missing Positive", lc:"first-missing-positive", diff:"Hard"},
      {name:"Find the Duplicate Number", lc:"find-the-duplicate-number", diff:"Medium"},
      {name:"Find All Numbers Disappeared in Array", lc:"find-all-numbers-disappeared-in-an-array", diff:"Easy"},
      {name:"Set Mismatch", lc:"set-mismatch", diff:"Easy"},
    ]},
];
const ALL_PATTERNS = [...PATTERNS_DATA, ...EXTRA_PATTERNS];

// ── LC150 DATA ────────────────────────────────────────────────────────────────
const LC150 = [
  { cat:"Arrays & Hashing", color:"#4488ff", problems:[
    {name:"Two Sum", lc:"two-sum", diff:"Easy"},
    {name:"Best Time to Buy and Sell Stock", lc:"best-time-to-buy-and-sell-stock", diff:"Easy"},
    {name:"Contains Duplicate", lc:"contains-duplicate", diff:"Easy"},
    {name:"Product of Array Except Self", lc:"product-of-array-except-self", diff:"Medium"},
    {name:"Maximum Subarray", lc:"maximum-subarray", diff:"Medium"},
    {name:"Maximum Product Subarray", lc:"maximum-product-subarray", diff:"Medium"},
    {name:"Subarray Sum Equals K", lc:"subarray-sum-equals-k", diff:"Medium"},
    {name:"Longest Consecutive Sequence", lc:"longest-consecutive-sequence", diff:"Medium"},
    {name:"Majority Element", lc:"majority-element", diff:"Easy"},
    {name:"Missing Number", lc:"missing-number", diff:"Easy"},
    {name:"Set Matrix Zeroes", lc:"set-matrix-zeroes", diff:"Medium"},
    {name:"Spiral Matrix", lc:"spiral-matrix", diff:"Medium"},
    {name:"Rotate Image", lc:"rotate-image", diff:"Medium"},
    {name:"Merge Intervals", lc:"merge-intervals", diff:"Medium"},
    {name:"Insert Interval", lc:"insert-interval", diff:"Medium"},
    {name:"Non-overlapping Intervals", lc:"non-overlapping-intervals", diff:"Medium"},
    {name:"Meeting Rooms II", lc:"meeting-rooms-ii", diff:"Medium"},
    {name:"Gas Station", lc:"gas-station", diff:"Medium"},
    {name:"Jump Game", lc:"jump-game", diff:"Medium"},
    {name:"Jump Game II", lc:"jump-game-ii", diff:"Medium"},
  ]},
  { cat:"Strings", color:"#ffd60a", problems:[
    {name:"Longest Substring Without Repeating Characters", lc:"longest-substring-without-repeating-characters", diff:"Medium"},
    {name:"Longest Palindromic Substring", lc:"longest-palindromic-substring", diff:"Medium"},
    {name:"Valid Anagram", lc:"valid-anagram", diff:"Easy"},
    {name:"Group Anagrams", lc:"group-anagrams", diff:"Medium"},
    {name:"Minimum Window Substring", lc:"minimum-window-substring", diff:"Hard"},
    {name:"Valid Parentheses", lc:"valid-parentheses", diff:"Easy"},
    {name:"Decode String", lc:"decode-string", diff:"Medium"},
    {name:"Palindromic Substrings", lc:"palindromic-substrings", diff:"Medium"},
    {name:"Permutation in String", lc:"permutation-in-string", diff:"Medium"},
    {name:"Longest Common Prefix", lc:"longest-common-prefix", diff:"Easy"},
    {name:"Reverse Words in a String", lc:"reverse-words-in-a-string", diff:"Medium"},
    {name:"String to Integer (atoi)", lc:"string-to-integer-atoi", diff:"Medium"},
    {name:"Zigzag Conversion", lc:"zigzag-conversion", diff:"Medium"},
    {name:"Word Break", lc:"word-break", diff:"Medium"},
    {name:"Encode and Decode Strings", lc:"encode-and-decode-strings", diff:"Medium"},
  ]},
  { cat:"Sliding Window / Two Pointers", color:"#00ff88", problems:[
    {name:"Container With Most Water", lc:"container-with-most-water", diff:"Medium"},
    {name:"Trapping Rain Water", lc:"trapping-rain-water", diff:"Hard"},
    {name:"Longest Repeating Character Replacement", lc:"longest-repeating-character-replacement", diff:"Medium"},
    {name:"Minimum Size Subarray Sum", lc:"minimum-size-subarray-sum", diff:"Medium"},
    {name:"Valid Palindrome", lc:"valid-palindrome", diff:"Easy"},
    {name:"3Sum", lc:"3sum", diff:"Medium"},
    {name:"Remove Duplicates from Sorted Array", lc:"remove-duplicates-from-sorted-array", diff:"Easy"},
    {name:"Move Zeroes", lc:"move-zeroes", diff:"Easy"},
    {name:"Max Consecutive Ones III", lc:"max-consecutive-ones-iii", diff:"Medium"},
    {name:"Fruits Into Baskets", lc:"fruit-into-baskets", diff:"Medium"},
    {name:"Squares of a Sorted Array", lc:"squares-of-a-sorted-array", diff:"Easy"},
    {name:"4Sum", lc:"4sum", diff:"Medium"},
    {name:"Backspace String Compare", lc:"backspace-string-compare", diff:"Easy"},
    {name:"Subarray Product Less Than K", lc:"subarray-product-less-than-k", diff:"Medium"},
    {name:"Longest Subarray of 1s After Deleting One Element", lc:"longest-subarray-of-1s-after-deleting-one-element", diff:"Medium"},
  ]},
  { cat:"Binary Search", color:"#f5a623", problems:[
    {name:"Binary Search", lc:"binary-search", diff:"Easy"},
    {name:"Search in Rotated Sorted Array", lc:"search-in-rotated-sorted-array", diff:"Medium"},
    {name:"Find Minimum in Rotated Sorted Array", lc:"find-minimum-in-rotated-sorted-array", diff:"Medium"},
    {name:"Find Peak Element", lc:"find-peak-element", diff:"Medium"},
    {name:"Search a 2D Matrix", lc:"search-a-2d-matrix", diff:"Medium"},
    {name:"Koko Eating Bananas", lc:"koko-eating-bananas", diff:"Medium"},
    {name:"Median of Two Sorted Arrays", lc:"median-of-two-sorted-arrays", diff:"Hard"},
    {name:"Time Based Key-Value Store", lc:"time-based-key-value-store", diff:"Medium"},
    {name:"Find First and Last Position of Element", lc:"find-first-and-last-position-of-element-in-sorted-array", diff:"Medium"},
    {name:"Capacity to Ship Packages Within D Days", lc:"capacity-to-ship-packages-within-d-days", diff:"Medium"},
    {name:"Split Array Largest Sum", lc:"split-array-largest-sum", diff:"Hard"},
    {name:"Search in Rotated Sorted Array II", lc:"search-in-rotated-sorted-array-ii", diff:"Medium"},
    {name:"Find the Duplicate Number", lc:"find-the-duplicate-number", diff:"Medium"},
    {name:"Single Element in a Sorted Array", lc:"single-element-in-a-sorted-array", diff:"Medium"},
    {name:"Minimized Maximum of Products Distributed to Any Store", lc:"minimized-maximum-of-products-distributed-to-any-store", diff:"Medium"},
  ]},
  { cat:"Linked List", color:"#ff3d8a", problems:[
    {name:"Reverse Linked List", lc:"reverse-linked-list", diff:"Easy"},
    {name:"Linked List Cycle", lc:"linked-list-cycle", diff:"Easy"},
    {name:"Merge Two Sorted Lists", lc:"merge-two-sorted-lists", diff:"Easy"},
    {name:"Remove Nth Node From End", lc:"remove-nth-node-from-end-of-list", diff:"Medium"},
    {name:"Add Two Numbers", lc:"add-two-numbers", diff:"Medium"},
    {name:"Reorder List", lc:"reorder-list", diff:"Medium"},
    {name:"Intersection of Two Linked Lists", lc:"intersection-of-two-linked-lists", diff:"Easy"},
    {name:"Palindrome Linked List", lc:"palindrome-linked-list", diff:"Easy"},
    {name:"Reverse Nodes in K-Group", lc:"reverse-nodes-in-k-group", diff:"Hard"},
    {name:"Copy List with Random Pointer", lc:"copy-list-with-random-pointer", diff:"Medium"},
  ]},
  { cat:"Trees", color:"#00b8a3", problems:[
    {name:"Binary Tree Level Order Traversal", lc:"binary-tree-level-order-traversal", diff:"Medium"},
    {name:"Maximum Depth of Binary Tree", lc:"maximum-depth-of-binary-tree", diff:"Easy"},
    {name:"Diameter of Binary Tree", lc:"diameter-of-binary-tree", diff:"Easy"},
    {name:"Validate Binary Search Tree", lc:"validate-binary-search-tree", diff:"Medium"},
    {name:"Lowest Common Ancestor of Binary Tree", lc:"lowest-common-ancestor-of-a-binary-tree", diff:"Medium"},
    {name:"Same Tree", lc:"same-tree", diff:"Easy"},
    {name:"Invert Binary Tree", lc:"invert-binary-tree", diff:"Easy"},
    {name:"Balanced Binary Tree", lc:"balanced-binary-tree", diff:"Easy"},
    {name:"Binary Tree Right Side View", lc:"binary-tree-right-side-view", diff:"Medium"},
    {name:"Kth Smallest Element in BST", lc:"kth-smallest-element-in-a-bst", diff:"Medium"},
    {name:"Construct Binary Tree from Preorder and Inorder", lc:"construct-binary-tree-from-preorder-and-inorder-traversal", diff:"Medium"},
    {name:"Binary Tree Maximum Path Sum", lc:"binary-tree-maximum-path-sum", diff:"Hard"},
    {name:"Serialize and Deserialize Binary Tree", lc:"serialize-and-deserialize-binary-tree", diff:"Hard"},
    {name:"Count Good Nodes in Binary Tree", lc:"count-good-nodes-in-binary-tree", diff:"Medium"},
    {name:"Path Sum II", lc:"path-sum-ii", diff:"Medium"},
  ]},
  { cat:"Graphs", color:"#1a9eee", problems:[
    {name:"Number of Islands", lc:"number-of-islands", diff:"Medium"},
    {name:"Clone Graph", lc:"clone-graph", diff:"Medium"},
    {name:"Course Schedule", lc:"course-schedule", diff:"Medium"},
    {name:"Course Schedule II", lc:"course-schedule-ii", diff:"Medium"},
    {name:"Rotting Oranges", lc:"rotting-oranges", diff:"Medium"},
    {name:"Pacific Atlantic Water Flow", lc:"pacific-atlantic-water-flow", diff:"Medium"},
    {name:"Surrounded Regions", lc:"surrounded-regions", diff:"Medium"},
    {name:"Word Ladder", lc:"word-ladder", diff:"Hard"},
    {name:"Redundant Connection", lc:"redundant-connection", diff:"Medium"},
    {name:"Number of Connected Components", lc:"number-of-connected-components-in-an-undirected-graph", diff:"Medium"},
    {name:"Cheapest Flights Within K Stops", lc:"cheapest-flights-within-k-stops", diff:"Medium"},
    {name:"Network Delay Time", lc:"network-delay-time", diff:"Medium"},
    {name:"Alien Dictionary", lc:"alien-dictionary", diff:"Hard"},
    {name:"Graph Valid Tree", lc:"graph-valid-tree", diff:"Medium"},
    {name:"Minimum Height Trees", lc:"minimum-height-trees", diff:"Medium"},
  ]},
  { cat:"Dynamic Programming", color:"#7c4dff", problems:[
    {name:"Climbing Stairs", lc:"climbing-stairs", diff:"Easy"},
    {name:"House Robber", lc:"house-robber", diff:"Medium"},
    {name:"House Robber II", lc:"house-robber-ii", diff:"Medium"},
    {name:"Coin Change", lc:"coin-change", diff:"Medium"},
    {name:"Longest Increasing Subsequence", lc:"longest-increasing-subsequence", diff:"Medium"},
    {name:"Longest Common Subsequence", lc:"longest-common-subsequence", diff:"Medium"},
    {name:"Edit Distance", lc:"edit-distance", diff:"Medium"},
    {name:"Partition Equal Subset Sum", lc:"partition-equal-subset-sum", diff:"Medium"},
    {name:"Word Break", lc:"word-break", diff:"Medium"},
    {name:"Decode Ways", lc:"decode-ways", diff:"Medium"},
    {name:"Unique Paths", lc:"unique-paths", diff:"Medium"},
    {name:"Minimum Path Sum", lc:"minimum-path-sum", diff:"Medium"},
    {name:"Burst Balloons", lc:"burst-balloons", diff:"Hard"},
    {name:"Target Sum", lc:"target-sum", diff:"Medium"},
    {name:"Best Time to Buy Stock III", lc:"best-time-to-buy-and-sell-stock-iii", diff:"Hard"},
    {name:"Distinct Subsequences", lc:"distinct-subsequences", diff:"Hard"},
    {name:"Regular Expression Matching", lc:"regular-expression-matching", diff:"Hard"},
    {name:"Interleaving String", lc:"interleaving-string", diff:"Medium"},
    {name:"Maximal Rectangle", lc:"maximal-rectangle", diff:"Hard"},
    {name:"Palindrome Partitioning II", lc:"palindrome-partitioning-ii", diff:"Hard"},
  ]},
  { cat:"Backtracking", color:"#ff9900", problems:[
    {name:"Subsets", lc:"subsets", diff:"Medium"},
    {name:"Subsets II", lc:"subsets-ii", diff:"Medium"},
    {name:"Permutations", lc:"permutations", diff:"Medium"},
    {name:"Combination Sum", lc:"combination-sum", diff:"Medium"},
    {name:"Combination Sum II", lc:"combination-sum-ii", diff:"Medium"},
    {name:"Word Search", lc:"word-search", diff:"Medium"},
    {name:"N-Queens", lc:"n-queens", diff:"Hard"},
    {name:"Letter Combinations of a Phone Number", lc:"letter-combinations-of-a-phone-number", diff:"Medium"},
    {name:"Generate Parentheses", lc:"generate-parentheses", diff:"Medium"},
    {name:"Palindrome Partitioning", lc:"palindrome-partitioning", diff:"Medium"},
  ]},
  { cat:"Heap / Greedy / Design", color:"#e84393", problems:[
    {name:"Top K Frequent Elements", lc:"top-k-frequent-elements", diff:"Medium"},
    {name:"Kth Largest Element in Array", lc:"kth-largest-element-in-an-array", diff:"Medium"},
    {name:"Find Median from Data Stream", lc:"find-median-from-data-stream", diff:"Hard"},
    {name:"Merge K Sorted Lists", lc:"merge-k-sorted-lists", diff:"Hard"},
    {name:"Task Scheduler", lc:"task-scheduler", diff:"Medium"},
    {name:"Reorganize String", lc:"reorganize-string", diff:"Medium"},
    {name:"LRU Cache", lc:"lru-cache", diff:"Medium"},
    {name:"Design Twitter", lc:"design-twitter", diff:"Medium"},
    {name:"K Closest Points to Origin", lc:"k-closest-points-to-origin", diff:"Medium"},
    {name:"Minimum Number of Arrows to Burst Balloons", lc:"minimum-number-of-arrows-to-burst-balloons", diff:"Medium"},
    {name:"Partition Labels", lc:"partition-labels", diff:"Medium"},
    {name:"Valid Sudoku", lc:"valid-sudoku", diff:"Medium"},
    {name:"Hand of Straights", lc:"hand-of-straights", diff:"Medium"},
    {name:"Candy", lc:"candy", diff:"Hard"},
    {name:"Jump Game II", lc:"jump-game-ii", diff:"Medium"},
  ]},
];

// ── ROADMAP DATA ──────────────────────────────────────────────────────────────
const ROADMAP_PHASES = [
  { phase:1, icon:"🏗️", title:"Basic Linear Structures & Patterns", color:"#00ff88",
    goal:"Master sequential data and index manipulation. Before complex nodes, master the line.",
    topics:[
      {name:"Time & Space Complexity (Big-O)", type:"concept", prereqs:[], unlocks:["Everything"]},
      {name:"Arrays", type:"ds", prereqs:["Big-O"], unlocks:["Two Pointers","Sliding Window","Prefix Sum","Binary Search"]},
      {name:"Strings", type:"ds", prereqs:["Arrays"], unlocks:["Sliding Window","Hashing"]},
      {name:"Recursion (Basics)", type:"pattern", prereqs:["Arrays"], unlocks:["Binary Search","Trees"]},
      {name:"Two Pointers", type:"pattern", prereqs:["Arrays"], unlocks:["3Sum","Trapping Rain Water"]},
      {name:"Binary Search", type:"algo", prereqs:["Sorted Arrays","Recursion"], unlocks:["Modified BS","BST"]},
      {name:"Sliding Window", type:"pattern", prereqs:["Arrays","Prefix Sum"], unlocks:["Substring Problems"]},
      {name:"Cyclic Sort", type:"pattern", prereqs:["Arrays"], unlocks:["Missing Number Problems"]},
      {name:"Prefix Sum", type:"pattern", prereqs:["Arrays"], unlocks:["Sliding Window","Range Queries"]},
      {name:"Intervals", type:"pattern", prereqs:["Arrays","Sorting"], unlocks:["Merge Intervals"]},
    ]},
  { phase:2, icon:"🔍", title:"The Power of Lookup (Hashing)", color:"#ffd60a",
    goal:"Trade space for speed using O(1) lookups.",
    topics:[
      {name:"Hash Table / Hash Map", type:"ds", prereqs:["Arrays"], unlocks:["Group Anagrams","Two Sum","LRU Cache"]},
      {name:"Greedy", type:"pattern", prereqs:["Sorting","Arrays"], unlocks:["Jump Game","Gas Station"]},
      {name:"Basic Sorting", type:"algo", prereqs:["Arrays"], unlocks:["Two Pointers","Merge Sort"]},
    ]},
  { phase:3, icon:"🔗", title:"Pointers & Recursion", color:"#00b8a3",
    goal:"Move from indexes to references. Understand pointer manipulation.",
    topics:[
      {name:"Linked List", type:"ds", prereqs:["Arrays"], unlocks:["In-Place Reversal","Fast/Slow Pointers"]},
      {name:"In-Place LL Reversal", type:"pattern", prereqs:["Linked List"], unlocks:["Reverse k-Group","Reorder List"]},
      {name:"Fast & Slow Pointers", type:"pattern", prereqs:["Linked List"], unlocks:["Cycle Detection","Middle of LL"]},
      {name:"Stack", type:"ds", prereqs:["Arrays"], unlocks:["Monotonic Stack","DFS","Backtracking"]},
      {name:"Queue", type:"ds", prereqs:["Arrays"], unlocks:["BFS","Level Order Traversal"]},
      {name:"Monotonic Stack", type:"pattern", prereqs:["Stack"], unlocks:["Next Greater Element","Histogram"]},
      {name:"Divide and Conquer", type:"pattern", prereqs:["Recursion"], unlocks:["Merge Sort","Binary Search Advanced"]},
    ]},
  { phase:4, icon:"🌳", title:"Non-Linear Structures (Hierarchical)", color:"#7c4dff",
    goal:"Understand parent-child relationships and recursive tree structures.",
    topics:[
      {name:"Binary Trees", type:"ds", prereqs:["Recursion","Queue"], unlocks:["Tree Traversals","LCA","Diameter"]},
      {name:"Tree Traversals", type:"algo", prereqs:["Binary Trees","Stack","Queue"], unlocks:["BST","Serialize/Deserialize"]},
      {name:"BST", type:"ds", prereqs:["Binary Trees","Binary Search"], unlocks:["Validate BST","Kth Smallest"]},
      {name:"Heaps / Priority Queue", type:"ds", prereqs:["Arrays","Trees"], unlocks:["Top K Elements","Dijkstra"]},
      {name:"Tries", type:"ds", prereqs:["Hash Map","Strings"], unlocks:["Autocomplete","Word Search II"]},
      {name:"Top K Elements", type:"pattern", prereqs:["Heaps"], unlocks:["Kth Largest","Median from Stream"]},
    ]},
  { phase:5, icon:"🕵️", title:"Backtracking", color:"#ff9900",
    goal:"Explore all possibilities systematically.",
    topics:[
      {name:"Backtracking", type:"pattern", prereqs:["Recursion Advanced","Stack"], unlocks:["Subsets","N-Queens","Sudoku"]},
    ]},
  { phase:6, icon:"🌐", title:"Connectivity (Graphs)", color:"#1a9eee",
    goal:"Model many-to-many relationships.",
    topics:[
      {name:"Graphs", type:"ds", prereqs:["Trees","Hash Map","Queue"], unlocks:["BFS","DFS","Topological Sort"]},
      {name:"BFS / DFS on Graphs", type:"algo", prereqs:["Graphs","Stack","Queue"], unlocks:["Shortest Path","Components"]},
      {name:"Topological Sort", type:"algo", prereqs:["Graphs","DFS"], unlocks:["Course Schedule","Alien Dictionary"]},
      {name:"Union Find (DSU)", type:"ds", prereqs:["Graphs","Arrays"], unlocks:["Redundant Connection","Accounts Merge"]},
      {name:"Shortest Path (Dijkstra)", type:"algo", prereqs:["Graphs","Heaps"], unlocks:["Cheapest Flights","Network Delay"]},
    ]},
  { phase:7, icon:"🚀", title:"Optimization — Dynamic Programming", color:"#ff3d8a",
    goal:"Solve overlapping subproblems. The final boss of DSA.",
    topics:[
      {name:"Bit Manipulation", type:"algo", prereqs:["Arrays","Math"], unlocks:["XOR Problems","Subsets via Bits"]},
      {name:"Dynamic Programming", type:"pattern", prereqs:["Recursion Advanced","Backtracking"], unlocks:["All DP Problems"]},
    ]},
];

const DSAPage = ({ setPage }) => {
  const [tab,        setTab]        = useState("topics");
  const [cat,        setCat]        = useState("All");
  const [search,     setSearch]     = useState("");
  const [view,       setView]       = useState("topics");
  const [selTopic,   setSelTopic]   = useState(null);
  const [selProblem, setSelProblem] = useState(null);
  const [tip,        setTip]        = useState("");
  const [tipLoading, setTipLoading] = useState(false);
  const [probSearch, setProbSearch] = useState("");
  const [diffFilter, setDiffFilter] = useState("All");
  const [selPattern, setSelPattern] = useState(null);
  const [selCompany, setSelCompany] = useState(null);
  const [b75Cat,     setB75Cat]     = useState("All");
  const [lc150Cat,   setLc150Cat]   = useState("All");

  // ── localStorage helpers ─────────────────────────────────────────────
  const LS_DONE    = "dsa_done_v1";
  const LS_NOTES   = "dsa_notes_v1";
  const LS_EXPLAIN = "dsa_explain_v1";

  const [done,     setDone]     = React.useState(() => { try { return JSON.parse(localStorage.getItem(LS_DONE)||"{}"); } catch { return {}; } });
  const [notes,    setNotes]    = React.useState(() => { try { return JSON.parse(localStorage.getItem(LS_NOTES)||"{}"); } catch { return {}; } });
  const [explain,  setExplain]  = React.useState(() => { try { return JSON.parse(localStorage.getItem(LS_EXPLAIN)||"{}"); } catch { return {}; } });
  const [explainLoading, setExplainLoading] = React.useState({});
  const [mockMode, setMockMode] = React.useState(false);
  const [mockCompany, setMockCompany] = React.useState(null);
  const [mockProblems, setMockProblems] = React.useState([]);
  const [mockDone, setMockDone] = React.useState({});
  const [mockTime, setMockTime] = React.useState(3600);
  const [mockRunning, setMockRunning] = React.useState(false);
  const [showNoteFor, setShowNoteFor] = React.useState(null);
  const mockTimerRef = React.useRef(null);

  const saveDone  = (d) => { setDone(d);  try { localStorage.setItem(LS_DONE,  JSON.stringify(d)); } catch(_) {} };
  const saveNotes = (n) => { setNotes(n); try { localStorage.setItem(LS_NOTES, JSON.stringify(n)); } catch(_) {} };
  const saveExplain = (e) => { setExplain(e); try { localStorage.setItem(LS_EXPLAIN, JSON.stringify(e)); } catch(_) {} };

  const toggleDone = (key) => {
    const d = { ...done, [key]: !done[key] };
    saveDone(d);
  };

  const totalDone  = Object.values(done).filter(Boolean).length;

  // ── Bookmarks ─────────────────────────────────────────────────
  const LS_BOOKMARKS = "dsa_bookmarks_v1";
  const [bookmarks, setBookmarks] = React.useState(() => { try { return JSON.parse(localStorage.getItem(LS_BOOKMARKS)||"{}"); } catch { return {}; } });
  const saveBookmarks = (b) => { setBookmarks(b); try { localStorage.setItem(LS_BOOKMARKS, JSON.stringify(b)); } catch(_) {} };
  const toggleBookmark = (key) => { const b={...bookmarks,[key]:!bookmarks[key]}; saveBookmarks(b); };
  const totalBookmarks = Object.values(bookmarks).filter(Boolean).length;

  // ── Spaced Repetition ─────────────────────────────────────────
  const LS_SR = "dsa_sr_v1";
  const [srData, setSrData] = React.useState(() => { try { return JSON.parse(localStorage.getItem(LS_SR)||"{}"); } catch { return {}; } });
  const saveSR = (d) => { setSrData(d); try { localStorage.setItem(LS_SR, JSON.stringify(d)); } catch(_) {} };
  const markSR = (key, level) => {
    const days = level==="easy" ? 7 : level==="medium" ? 3 : 1;
    const due  = Date.now() + days*86400000;
    saveSR({...srData, [key]: { level, due, name: key.split("__")[1]||key, topic: key.split("__")[0]||"" }});
  };
  const srDueToday = Object.entries(srData).filter(([,v])=>v.due<=Date.now()).map(([k,v])=>({key:k,...v}));

  // ── Interview Mode ─────────────────────────────────────────────
  const [interviewMode, setInterviewMode] = React.useState(false);

  // ── Pomodoro ───────────────────────────────────────────────────
  const [pomodoroTime, setPomodoroTime] = React.useState(25*60);
  const [pomodoroRunning, setPomodoroRunning] = React.useState(false);
  const [pomodoroBreak, setPomodoroBreak] = React.useState(false);
  const [pomodoroSessions, setPomodoroSessions] = React.useState(0);
  const pomTimerRef = React.useRef(null);
  React.useEffect(()=>{
    if(pomodoroRunning){
      pomTimerRef.current=setInterval(()=>{
        setPomodoroTime(t=>{
          if(t<=1){
            clearInterval(pomTimerRef.current);
            setPomodoroRunning(false);
            if(!pomodoroBreak){ setPomodoroSessions(s=>s+1); setPomodoroBreak(true); setPomodoroTime(5*60); }
            else { setPomodoroBreak(false); setPomodoroTime(25*60); }
            return 0;
          }
          return t-1;
        });
      },1000);
    }
    return ()=>clearInterval(pomTimerRef.current);
  },[pomodoroRunning,pomodoroBreak]);
  const fmtPom = s=>String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");

  // ── Daily Challenge ────────────────────────────────────────────
  const dailyProb = React.useMemo(()=>{
    const allProbs=[];
    if(typeof LC150!=="undefined") LC150.forEach(g=>g.problems.forEach(p=>allProbs.push({...p,cat:g.cat})));
    if(!allProbs.length) return null;
    const today=new Date(); const seed=(today.getFullYear()*10000+((today.getMonth()+1)*100)+today.getDate())%allProbs.length;
    return allProbs[seed]||allProbs[0];
  },[]);

  // ── Export Progress ────────────────────────────────────────────
  const exportProgress = () => {
    const rows=[["Problem","Topic","Status","Difficulty"]];
    Object.entries(done).forEach(([k,v])=>{ if(v){ const [topic,name]=k.split("__"); rows.push([name||k,topic,"Solved",""]); } });
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="dsa_progress.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const fetchExplain = async (problemName) => {
    if (explain[problemName]) return;
    setExplainLoading(p => ({...p, [problemName]:true}));
    try {
      const r = await fetch(`${API_BASE}/dsa/topics/explain/tip`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ problem: problemName }),
      });
      const j = await r.json();
      const newE = { ...explain, [problemName]: j.tip || "Could not load explanation." };
      saveExplain(newE);
    } catch {
      const newE = { ...explain, [problemName]: "Network error — try again." };
      saveExplain(newE);
    }
    setExplainLoading(p => ({...p, [problemName]:false}));
  };

  // eslint-disable-next-line no-unused-vars
  const startMock = (company) => {
    const allP = company.problems;
    const shuffled = [...allP].sort(()=>Math.random()-.5).slice(0,3);
    setMockCompany(company);
    setMockProblems(shuffled);
    setMockDone({});
    setMockTime(3600);
    setMockRunning(true);
    setMockMode(true);
    window.scrollTo(0,0);
  };

  const stopMock = () => {
    setMockMode(false);
    setMockRunning(false);
    setMockCompany(null);
    clearInterval(mockTimerRef.current);
  };

  React.useEffect(() => {
    if (mockRunning) {
      mockTimerRef.current = setInterval(() => {
        setMockTime(t => {
          if (t <= 1) { clearInterval(mockTimerRef.current); setMockRunning(false); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(mockTimerRef.current);
  }, [mockRunning]);

  const fmtTime = (s) => `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const DIFF_C = { Easy:"#00ff88", Medium:"#ffd60a", Hard:"#ff3d8a" };

  const filtered = DSA_DATA.filter(t =>
    (cat === "All" || t.category === cat) &&
    (!search || t.topic.toLowerCase().includes(search.toLowerCase()))
  );

  const getTopicProblems = (slug) => {
    const keys = SLUG_TO_CHECKLIST[slug] || [];
    const all = [];
    keys.forEach(k => { if (TUF_CHECKLIST[k]) all.push(...TUF_CHECKLIST[k]); });
    return all;
  };

  const fetchTip = async (slug) => {
    setTipLoading(true); setTip("");
    try {
      const r = await fetch(`${API_BASE}/dsa/topics/${slug}/tip`, { method:"POST" });
      const j = await r.json();
      setTip(j.tip || "");
    } catch { setTip("Could not generate tip — try again."); }
    setTipLoading(false);
  };

  const openTopic   = (t) => { setSelTopic(t); setSelProblem(null); setView("problems"); setProbSearch(""); setDiffFilter("All"); setTip(""); window.scrollTo(0,0); };
  const openProblem = (p) => { setSelProblem(p); setView("problem"); window.scrollTo(0,0); };

  // Shared header with tabs
  const isDeepView = (tab === "topics" && view !== "topics");
  const Header = () => (
    <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"28px 24px 0"}}>
      <div style={{maxWidth:1200,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <button onClick={()=>setPage("tools")} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"5px 12px",color:"var(--text2)",fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",flexShrink:0}}>← Tools</button>
          <div className="sl" style={{marginBottom:0}}>Student Tools</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:4}}>
          <h1 className="syne" style={{fontSize:28,fontWeight:800}}>🧠 DSA <span className="gtext">Problem Explorer</span></h1>
          {totalDone > 0 && <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(0,255,136,.15)",color:"var(--green)",border:"1px solid rgba(0,255,136,.3)",fontWeight:700}}>✓ {totalDone} solved</span>}
          {totalBookmarks > 0 && <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(255,214,10,.12)",color:"var(--yellow)",border:"1px solid rgba(255,214,10,.3)",fontWeight:700}}>⭐ {totalBookmarks} bookmarked</span>}
          {srDueToday.length > 0 && <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(255,61,138,.12)",color:"var(--pink)",border:"1px solid rgba(255,61,138,.3)",fontWeight:700}}>🔁 {srDueToday.length} due for review</span>}
        </div>
        {/* Pomodoro mini-widget */}
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:8,background:pomodoroRunning?"rgba(255,61,138,.1)":"var(--card)",border:`1px solid ${pomodoroRunning?"var(--pink)":"var(--border)"}`,cursor:"pointer"}} onClick={()=>setPomodoroRunning(r=>!r)}>
            <span style={{fontSize:12}}>{pomodoroBreak?"☕":"🍅"}</span>
            <span className="mono" style={{fontSize:13,fontWeight:700,color:pomodoroRunning?"var(--pink)":"var(--text2)"}}>{fmtPom(pomodoroTime)}</span>
            <span style={{fontSize:10,color:"var(--text3)"}}>{pomodoroRunning?"▐▐":"▶"}</span>
          </div>
          {pomodoroSessions>0 && <span style={{fontSize:11,color:"var(--text3)"}}>🍅×{pomodoroSessions}</span>}
          {pomodoroRunning && <button onClick={()=>{setPomodoroRunning(false);setPomodoroTime(25*60);setPomodoroBreak(false);}} style={{fontSize:10,padding:"2px 8px",borderRadius:5,border:"1px solid var(--border)",background:"none",color:"var(--text3)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>reset</button>}
          <button onClick={()=>setInterviewMode(m=>!m)} style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:`1px solid ${interviewMode?"var(--purple)":"var(--border)"}`,background:interviewMode?"rgba(124,77,255,.15)":"var(--card)",color:interviewMode?"var(--purple)":"var(--text3)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:interviewMode?700:400}}>
            {interviewMode?"🎯 Interview Mode ON":"🎯 Interview Mode"}
          </button>
          <button onClick={()=>setTab("bookmarks")} style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:`1px solid ${tab==="bookmarks"?"var(--yellow)":"var(--border)"}`,background:tab==="bookmarks"?"rgba(255,214,10,.12)":"var(--card)",color:tab==="bookmarks"?"var(--yellow)":"var(--text3)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
            ⭐ Bookmarks {totalBookmarks>0?`(${totalBookmarks})`:""}
          </button>
          {totalDone>0 && <button onClick={exportProgress} style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text3)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>📥 Export CSV</button>}
        </div>
        <p style={{color:"var(--text2)",fontSize:13,marginBottom:16}}>Pre-DSA · Topics · Patterns · Blind 75 · Top 150 · Company Wise · Visualizers · Roadmap</p>
        {!isDeepView && (
          <div style={{display:"flex",gap:0,overflowX:"auto"}}>
            {[["predsa","🌱 Pre-DSA"],["topics","📚 Topics"],["patterns","🧩 Patterns"],["blind75","🎯 Blind 75"],["lc150","💯 Top 150"],["company","🏢 Company Wise"],["visualizers","🎬 Visualizers"],["roadmap","🗺️ Roadmap"],["bookmarks",`⭐ Saved${totalBookmarks>0?" ("+totalBookmarks+")":""}`],["review",`🔁 Review${srDueToday.length>0?" ("+srDueToday.length+")":""}`]].map(([t,l])=>(
              <button key={t} onClick={()=>{setTab(t);setView("topics");}} style={{padding:"10px 16px",background:"transparent",border:"none",borderBottom:`3px solid ${tab===t?"var(--purple)":"transparent"}`,color:tab===t?"var(--purple)":"var(--text2)",fontWeight:tab===t?700:500,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif"}}>
                {l}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── DRILL DOWN: PROBLEM DETAIL ─────────────────────────────────────────
  if (view === "problem") {
    const pLinks = getProblemLinks(selProblem.name, selTopic?.slug);
    return (
      <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
        <Header/>
        <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"24px 24px 20px"}}>
          <div style={{maxWidth:900,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,fontSize:13,color:"var(--text3)",flexWrap:"wrap"}}>
              <span style={{cursor:"pointer",color:"var(--cyan)"}} onClick={()=>{setView("topics");setTab("topics");}}>DSA Explorer</span>
              <span>›</span>
              <span style={{cursor:"pointer",color:"var(--cyan)"}} onClick={()=>setView("problems")}>{selTopic.topic}</span>
              <span>›</span>
              <span style={{color:"var(--text)"}}>{selProblem.name}</span>
            </div>
            <h2 className="syne" style={{fontSize:22,fontWeight:800,marginBottom:10}}>{selProblem.name}</h2>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <span style={{fontSize:11,padding:"3px 10px",borderRadius:6,background:`${DIFF_C[selProblem.diff]}18`,color:DIFF_C[selProblem.diff],fontWeight:700}}>{selProblem.diff}</span>
              <span style={{fontSize:11,padding:"3px 10px",borderRadius:6,background:"var(--bg3)",color:"var(--text2)"}}>{selTopic.topic}</span>
            </div>
          </div>
        </div>
        <div style={{maxWidth:900,margin:"0 auto",padding:"24px"}}>
          <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:14}}>Solve this problem on</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
            {pLinks.map(l=>(
              <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer"
                style={{display:"flex",alignItems:"center",gap:14,padding:"16px",borderRadius:14,border:`1px solid ${l.direct?"var(--border2)":"var(--border)"}`,background:"var(--card)",textDecoration:"none",transition:"all .2s",position:"relative"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=l.color;e.currentTarget.style.background=`${l.color}12`;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=l.direct?"var(--border2)":"var(--border)";e.currentTarget.style.background="var(--card)";}}>
                {l.direct && <span style={{position:"absolute",top:8,right:8,fontSize:8,padding:"2px 5px",borderRadius:3,background:"rgba(0,255,136,.15)",color:"#00ff88",fontWeight:700}}>DIRECT</span>}
                <div style={{width:40,height:40,borderRadius:10,background:`${l.color}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <img src={l.logo} alt={l.name} style={{width:22,height:22,objectFit:"contain"}} onError={e=>{e.target.style.display="none";const fb=e.target.parentNode.querySelector(".logo-fb");if(fb)fb.style.display="flex";}}/>
                  <span className="logo-fb" style={{display:"none",width:22,height:22,borderRadius:4,background:l.color,color:"#fff",fontSize:8,fontWeight:800,alignItems:"center",justifyContent:"center"}}>{l.name.slice(0,2).toUpperCase()}</span>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:2}}>{l.name}</div>
                  <div style={{fontSize:10,color:"var(--text3)",marginBottom:3}}>{l.note}</div>
                  <span style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:`${l.color}18`,color:l.color,fontWeight:700}}>{l.tag}</span>
                </div>
                <span style={{fontSize:16,color:l.color}}>→</span>
              </a>
            ))}
          </div>
          <button onClick={()=>setView("problems")} style={{marginTop:24,padding:"9px 20px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text2)",fontSize:13,fontWeight:600,cursor:"pointer"}}>← Back to {selTopic.topic}</button>
        </div>
      </div>
    );
  }

  // ── DRILL DOWN: PROBLEMS LIST ──────────────────────────────────────────
  if (view === "problems") {
    const problems = getTopicProblems(selTopic?.slug);
    const filteredProbs = problems.filter(p =>
      (diffFilter === "All" || p.diff === diffFilter) &&
      (!probSearch || p.name.toLowerCase().includes(probSearch.toLowerCase()))
    );
    return (
      <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
        <Header/>
        <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"24px"}}>
          <div style={{maxWidth:1100,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,fontSize:13,color:"var(--text3)"}}>
              <span style={{cursor:"pointer",color:"var(--cyan)"}} onClick={()=>{setView("topics");setTab("topics");}}>DSA Explorer</span>
              <span>›</span><span style={{color:"var(--text)"}}>{selTopic.topic}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:32}}>{selTopic.icon}</span>
                <div>
                  <h2 className="syne" style={{fontSize:24,fontWeight:800,marginBottom:4}}>{selTopic.topic}</h2>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:5,background:"var(--bg3)",color:"var(--text2)"}}>{selTopic.category}</span>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:5,background:`${DIFF_C[selTopic.difficulty]}18`,color:DIFF_C[selTopic.difficulty],fontWeight:700}}>{selTopic.difficulty}</span>
                    <span style={{fontSize:11,color:"var(--text3)"}}>{problems.length} problems</span>
                  </div>
                </div>
              </div>
              <button onClick={()=>fetchTip(selTopic.slug)} disabled={tipLoading} style={{padding:"8px 16px",borderRadius:10,border:"1px solid var(--yellow)",background:"rgba(255,214,10,.08)",color:"var(--yellow)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                {tipLoading?"⏳ Loading…":"💡 AI Study Tip"}
              </button>
            </div>
            {tip && <div style={{marginTop:14,background:"rgba(255,214,10,.06)",border:"1px solid rgba(255,214,10,.2)",borderRadius:10,padding:14,maxWidth:700}}><div style={{fontSize:10,fontWeight:700,color:"var(--yellow)",marginBottom:6}}>💡 AI Strategy</div><div style={{fontSize:12,color:"var(--text)",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{tip}</div></div>}
            {/* Topic Notes */}
            <div style={{marginTop:12,maxWidth:700}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>📝 Your Notes for {selTopic.topic}</div>
              <textarea
                value={notes[`topic__${selTopic.slug}`]||""}
                onChange={e=>saveNotes({...notes,[`topic__${selTopic.slug}`]:e.target.value})}
                placeholder="Jot down your approach, patterns you noticed, or anything to remember…"
                style={{width:"100%",minHeight:72,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,padding:10,fontSize:12,fontFamily:"'DM Sans',sans-serif",color:"var(--text)",resize:"vertical",outline:"none",boxSizing:"border-box"}}
                onFocus={e=>e.target.style.borderColor="var(--cyan)"}
                onBlur={e=>e.target.style.borderColor="var(--border)"}
              />
            </div>
            <div style={{display:"flex",gap:8,marginTop:16,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{position:"relative",flex:1,maxWidth:320}}>
                <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"var(--text3)",fontSize:12}}>🔍</span>
                <input className="input" value={probSearch} onChange={e=>setProbSearch(e.target.value)} placeholder="Search problems…" style={{padding:"8px 12px 8px 30px",fontSize:13}}/>
              </div>
              {["All","Easy","Medium","Hard"].map(d=>(
                <button key={d} onClick={()=>setDiffFilter(d)} style={{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:600,border:"1px solid var(--border)",cursor:"pointer",background:diffFilter===d?(d==="Easy"?"rgba(0,255,136,.2)":d==="Medium"?"rgba(255,214,10,.2)":d==="Hard"?"rgba(255,61,138,.2)":"var(--purple)"):"var(--card)",color:diffFilter===d?(d==="Easy"?"#00ff88":d==="Medium"?"#ffd60a":d==="Hard"?"#ff3d8a":"#fff"):"var(--text2)"}}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{maxWidth:1100,margin:"0 auto",padding:"20px 24px"}}>
          {problems.length === 0 ? (
            <div style={{textAlign:"center",padding:"60px 20px",color:"var(--text3)"}}>
              <div style={{fontSize:36,marginBottom:10}}>🔧</div>
              <div style={{fontSize:15,fontWeight:600,color:"var(--text)",marginBottom:6}}>Problem list coming soon for {selTopic.topic}</div>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginTop:16}}>
                {selTopic.platforms.map(p=>(
                  <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer" style={{padding:"8px 16px",borderRadius:8,background:"var(--card)",border:"1px solid var(--border)",color:"var(--text)",fontSize:13,textDecoration:"none"}}>{p.name} →</a>
                ))}
              </div>
            </div>
          ) : (
            <>
              {(() => {
            const topicSolved = problems.filter(p => done[`${selTopic.slug}__${p.name}`]).length;
            const pct = problems.length ? Math.round((topicSolved/problems.length)*100) : 0;
            return (
              <div style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:12,color:"var(--text3)"}}>{filteredProbs.length} of {problems.length} shown</span>
                  <span style={{fontSize:12,fontWeight:700,color:pct===100?"var(--green)":pct>50?"var(--yellow)":"var(--text3)"}}>{topicSolved}/{problems.length} solved ({pct}%)</span>
                </div>
                <div style={{height:4,background:"var(--bg3)",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:pct===100?"var(--green)":pct>50?"var(--yellow)":"var(--purple)",borderRadius:2,transition:"width .5s ease"}}/>
                </div>
              </div>
            );
          })()}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:10}}>
                {filteredProbs.map((p,i)=>{
                  const doneKey = `${selTopic.slug}__${p.name}`;
                  const isDone  = !!done[doneKey];
                  const hasNote = !!(notes[doneKey] || "").trim();
                  const hasExp  = !!explain[p.name];
                  return (
                    <div key={i} style={{borderRadius:10,border:`1px solid ${isDone?"rgba(0,255,136,.3)":"var(--border)"}`,background:isDone?"rgba(0,255,136,.04)":"var(--card)",transition:"all .2s",overflow:"hidden"}}>
                      <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                        {/* Checkbox */}
                        <div onClick={e=>{e.stopPropagation();toggleDone(doneKey);}}
                          style={{width:20,height:20,borderRadius:5,border:`2px solid ${isDone?"var(--green)":"var(--border2)"}`,background:isDone?"var(--green)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,transition:"all .15s"}}>
                          {isDone && <span style={{fontSize:12,color:"#000",fontWeight:900}}>✓</span>}
                        </div>
                        {/* Problem name */}
                        <div onClick={()=>openProblem(p)} style={{flex:1,minWidth:0,cursor:"pointer"}}>
                          <div style={{fontSize:13,fontWeight:600,color:isDone?"var(--green)":"var(--text)",lineHeight:1.3,textDecoration:isDone?"line-through":"none",opacity:isDone?.7:1}}>{p.name}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                          {!interviewMode && <span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4,background:`${DIFF_C[p.diff]}18`,color:DIFF_C[p.diff]}}>{p.diff}</span>}
                          {interviewMode && <span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4,background:"var(--bg3)",color:"var(--text3)"}}>?</span>}
                          {/* Bookmark */}
                          <button onClick={e=>{e.stopPropagation();toggleBookmark(doneKey);}}
                            style={{fontSize:10,padding:"2px 7px",borderRadius:5,border:`1px solid ${bookmarks[doneKey]?"rgba(255,214,10,.4)":"var(--border)"}`,background:bookmarks[doneKey]?"rgba(255,214,10,.12)":"transparent",color:bookmarks[doneKey]?"var(--yellow)":"var(--text3)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                            {bookmarks[doneKey]?"⭐":"☆"}
                          </button>
                          {/* Note toggle */}
                          <button onClick={e=>{e.stopPropagation();setShowNoteFor(showNoteFor===doneKey?null:doneKey);}}
                            style={{fontSize:10,padding:"2px 7px",borderRadius:5,border:"1px solid var(--border)",background:hasNote?"rgba(0,212,255,.1)":"transparent",color:hasNote?"var(--cyan)":"var(--text3)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                            {hasNote?"📝":"✏️"}
                          </button>
                          {/* Spaced Repetition */}
                          <button onClick={e=>{e.stopPropagation();markSR(doneKey,isDone?"easy":"hard");}}
                            title="Mark for spaced repetition review"
                            style={{fontSize:10,padding:"2px 7px",borderRadius:5,border:`1px solid ${srData[doneKey]?"rgba(0,212,255,.4)":"var(--border)"}`,background:srData[doneKey]?"rgba(0,212,255,.1)":"transparent",color:srData[doneKey]?"var(--cyan)":"var(--text3)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                            🔁
                          </button>
                          {/* Explain toggle */}
                          <button onClick={e=>{e.stopPropagation();fetchExplain(p.name);}}
                            style={{fontSize:10,padding:"2px 7px",borderRadius:5,border:"1px solid var(--border)",background:hasExp?"rgba(255,214,10,.1)":"transparent",color:hasExp?"var(--yellow)":"var(--text3)",cursor:explainLoading[p.name]?"wait":"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                            {explainLoading[p.name]?"⏳":"💡"}
                          </button>
                          <span onClick={()=>openProblem(p)} style={{color:"var(--purple)",fontSize:14,cursor:"pointer"}}>›</span>
                        </div>
                      </div>
                      {/* Note textarea */}
                      {showNoteFor===doneKey && (
                        <div style={{padding:"0 14px 10px",borderTop:"1px solid var(--border)"}}>
                          <textarea
                            value={notes[doneKey]||""}
                            onChange={e=>saveNotes({...notes,[doneKey]:e.target.value})}
                            placeholder="Your notes for this problem…"
                            style={{width:"100%",minHeight:64,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:7,padding:8,fontSize:12,fontFamily:"'DM Sans',sans-serif",color:"var(--text)",resize:"vertical",outline:"none",marginTop:8,boxSizing:"border-box"}}
                            onFocus={e=>e.target.style.borderColor="var(--cyan)"}
                            onBlur={e=>e.target.style.borderColor="var(--border)"}
                          />
                        </div>
                      )}
                      {/* AI Explanation */}
                      {hasExp && (
                        <div style={{padding:"0 14px 10px",borderTop:"1px solid rgba(255,214,10,.15)"}}>
                          <div style={{fontSize:10,fontWeight:700,color:"var(--yellow)",marginBottom:5,marginTop:8}}>💡 AI Explainer</div>
                          <div style={{fontSize:12,color:"var(--text)",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{explain[p.name]}</div>
                          <button onClick={()=>{const e2={...explain};delete e2[p.name];saveExplain(e2);}}
                            style={{marginTop:6,fontSize:10,color:"var(--text3)",background:"none",border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>clear ✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <button onClick={()=>{setView("topics");setTab("topics");}} style={{marginTop:20,padding:"9px 20px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text2)",fontSize:13,fontWeight:600,cursor:"pointer"}}>← Back to Topics</button>
        </div>
      </div>
    );
  }

  // ── PRE-DSA TAB ────────────────────────────────────────────────────────
  if (tab === "predsa") return (
    <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
      <Header/>
      <div style={{maxWidth:1100,margin:"0 auto",padding:"28px 24px"}}>
        <div style={{background:"linear-gradient(135deg,rgba(0,255,136,.08),rgba(124,77,255,.08))",border:"1px solid rgba(0,255,136,.2)",borderRadius:16,padding:"24px 28px",marginBottom:28}}>
          <div className="syne" style={{fontSize:22,fontWeight:800,marginBottom:8}}>🌱 Pre-DSA Preparation</div>
          <p style={{color:"var(--text2)",fontSize:13,lineHeight:1.7,marginBottom:12}}>
            Starting directly with LeetCode Medium is a common mistake. Build strong fundamentals first.
            This roadmap takes you from zero to DSA-ready in 5 weeks.
          </p>
          <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
            {[["Week 1","Basics & Logic"],["Week 2-3","Arrays & Strings"],["Week 4-5","Math & Patterns"],["Week 5+","Real DSA"]].map(([w,t])=>(
              <div key={w} style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,fontWeight:700,color:"var(--cyan)",background:"rgba(0,212,255,.12)",padding:"2px 8px",borderRadius:4}}>{w}</span>
                <span style={{fontSize:12,color:"var(--text2)"}}>{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:24}}>
          {PRE_DSA_TRACKS.map(track=>(
            <div key={track.id} style={{border:`1px solid ${track.color}30`,borderRadius:16,overflow:"hidden",background:"var(--card)"}}>
              <div style={{background:`${track.color}10`,borderBottom:`1px solid ${track.color}20`,padding:"18px 24px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:28}}>{track.icon}</span>
                  <div>
                    <div className="syne" style={{fontSize:16,fontWeight:800,marginBottom:3}}>{track.title}</div>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:`${track.color}20`,color:track.color,fontWeight:700}}>{track.level}</span>
                      <span style={{fontSize:11,color:"var(--text3)"}}>via {track.platform}</span>
                    </div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <p style={{fontSize:12,color:"var(--text2)",lineHeight:1.5,marginBottom:8,maxWidth:300}}>{track.desc}</p>
                  <a href={track.platformUrl} target="_blank" rel="noopener noreferrer"
                    style={{fontSize:11,padding:"6px 14px",borderRadius:8,background:`${track.color}20`,color:track.color,textDecoration:"none",fontWeight:700,border:`1px solid ${track.color}40`}}>
                    Open Platform →
                  </a>
                </div>
              </div>
              <div style={{padding:"16px 24px"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:8}}>
                  {track.problems.map((p,i)=>(
                    <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                      style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",textDecoration:"none",transition:"all .2s"}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=track.color;e.currentTarget.style.background=`${track.color}08`;}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--bg)";}}>
                      <span style={{fontSize:11,color:"var(--text3)",minWidth:18,flexShrink:0,textAlign:"right"}}>{i+1}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:"var(--text)",marginBottom:2}}>{p.name}</div>
                        <div style={{fontSize:10,color:"var(--text3)"}}>{p.note}</div>
                      </div>
                      <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:3,background:`${p.diff==="Easy"?"rgba(0,255,136,.15)":"rgba(255,214,10,.15)"}`,color:p.diff==="Easy"?"#00ff88":"#ffd60a",flexShrink:0}}>{p.diff}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── PATTERNS TAB ───────────────────────────────────────────────────────
  if (tab === "patterns") return (
    <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
      <Header/>
      <div style={{maxWidth:1200,margin:"0 auto",padding:"28px 24px"}}>
        {!selPattern ? (
          <>
            <div style={{marginBottom:20}}>
              <div className="syne" style={{fontSize:20,fontWeight:800,marginBottom:6}}>🧩 20 Must-Master Patterns</div>
              <p style={{color:"var(--text2)",fontSize:13}}>Every coding interview reduces to these patterns. Master the pattern, solve any problem.</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
              {ALL_PATTERNS.map(p=>(
                <div key={p.id} onClick={()=>setSelPattern(p)} className="hcard" style={{padding:20,cursor:"pointer",border:"1px solid var(--border)",background:"var(--card)",transition:"all .2s"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <span style={{fontSize:24}}>{p.icon}</span>
                    <div>
                      <div className="syne" style={{fontSize:14,fontWeight:700}}>{p.name}</div>
                      <div style={{fontSize:10,color:"var(--cyan)"}}>{p.phase}</div>
                    </div>
                  </div>
                  <p style={{fontSize:12,color:"var(--text2)",lineHeight:1.5,marginBottom:10}}>{p.coreIdea}</p>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:11,color:"var(--text3)"}}>{p.problems.length} problems</span>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:"rgba(124,77,255,.15)",color:"var(--purple)",fontWeight:600}}>{p.where}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,fontSize:13,color:"var(--text3)"}}>
              <span style={{cursor:"pointer",color:"var(--cyan)"}} onClick={()=>setSelPattern(null)}>Patterns</span>
              <span>›</span><span style={{color:"var(--text)"}}>{selPattern.name}</span>
            </div>
            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:32}}>{selPattern.icon}</span>
              <div>
                <h2 className="syne" style={{fontSize:24,fontWeight:800,marginBottom:4}}>{selPattern.name}</h2>
                <span style={{fontSize:12,color:"var(--cyan)"}}>{selPattern.phase}</span>
              </div>
            </div>
            <div style={{background:"rgba(124,77,255,.08)",border:"1px solid rgba(124,77,255,.2)",borderRadius:12,padding:16,marginBottom:24,maxWidth:700}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--purple)",marginBottom:6}}>💡 Core Idea</div>
              <div style={{fontSize:13,color:"var(--text)",lineHeight:1.6}}>{selPattern.coreIdea}</div>
              <div style={{marginTop:8,fontSize:12,color:"var(--text3)"}}>Appears in: <span style={{color:"var(--cyan)"}}>{selPattern.where}</span></div>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:14}}>Practice Problems — ordered by difficulty</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:10}}>
              {selPattern.problems.map((p,i)=>(
                <a key={i} href={`https://leetcode.com/problems/${p.lc}/`} target="_blank" rel="noopener noreferrer"
                  style={{padding:"12px 16px",borderRadius:12,border:"1px solid var(--border)",background:"var(--card)",textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,transition:"all .2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="#f89f1b";e.currentTarget.style.background="rgba(248,159,27,.06)";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--card)";}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:11,color:"var(--text3)",minWidth:18,textAlign:"right"}}>{i+1}</span>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{p.name}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,background:`${DIFF_C[p.diff]}18`,color:DIFF_C[p.diff],flexShrink:0}}>{p.diff}</span>
                </a>
              ))}
            </div>
            <button onClick={()=>setSelPattern(null)} style={{marginTop:24,padding:"9px 20px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text2)",fontSize:13,fontWeight:600,cursor:"pointer"}}>← All Patterns</button>
          </>
        )}
      </div>
    </div>
  );

  // ── BLIND 75 TAB ────────────────────────────────────────────────────────
  if (tab === "blind75") {
    const cats = ["All", ...BLIND75.map(c=>c.cat)];
    const total = BLIND75.reduce((a,c)=>a+c.problems.length,0);
    const shown = b75Cat === "All" ? BLIND75 : BLIND75.filter(c=>c.cat===b75Cat);
    return (
      <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
        <Header/>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"28px 24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16,marginBottom:24}}>
            <div>
              <div className="syne" style={{fontSize:20,fontWeight:800,marginBottom:6}}>🎯 Blind 75 — Must-Solve Problems</div>
              <p style={{color:"var(--text2)",fontSize:13}}>{total} carefully curated problems that cover every major interview pattern. Solve these and you are ready for any FAANG interview.</p>
            </div>
            <a href="https://neetcode.io/practice" target="_blank" rel="noopener noreferrer" style={{padding:"9px 18px",borderRadius:10,background:"rgba(0,184,163,.15)",border:"1px solid rgba(0,184,163,.3)",color:"#00b8a3",fontSize:13,fontWeight:700,textDecoration:"none"}}>🚀 Solve on NeetCode</a>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:24}}>
            {cats.map(c=>(
              <button key={c} onClick={()=>setB75Cat(c)} style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:600,border:"1px solid var(--border)",background:b75Cat===c?"var(--purple)":"var(--card)",color:b75Cat===c?"#fff":"var(--text2)",cursor:"pointer",transition:"all .15s"}}>{c}</button>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {shown.map(cat=>(
              <div key={cat.cat}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--cyan)",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                  <span>{cat.cat}</span>
                  <span style={{fontSize:11,color:"var(--text3)",fontWeight:400}}>{cat.problems.length} problems</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:8}}>
                  {cat.problems.map((p,i)=>(
                    <a key={i} href={`https://leetcode.com/problems/${p.lc}/`} target="_blank" rel="noopener noreferrer"
                      style={{padding:"10px 14px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,transition:"all .2s"}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor="#f89f1b";e.currentTarget.style.background="rgba(248,159,27,.06)";}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--card)";}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <img src="https://leetcode.com/favicon.ico" alt="LC" style={{width:14,height:14,objectFit:"contain"}}/>
                        <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{p.name}</span>
                      </div>
                      <span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4,background:`${DIFF_C[p.diff]}18`,color:DIFF_C[p.diff],flexShrink:0}}>{p.diff}</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── COMPANY WISE TAB ───────────────────────────────────────────────────
  if (tab === "company") return (
    <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
      <Header/>
      <div style={{maxWidth:1200,margin:"0 auto",padding:"28px 24px"}}>
        {!selCompany ? (
          <>
            <div style={{marginBottom:20}}>
              <div className="syne" style={{fontSize:20,fontWeight:800,marginBottom:6}}>🏢 Company-Wise Problems</div>
              <p style={{color:"var(--text2)",fontSize:13}}>Most frequently asked problems at top tech companies. Click a company to see their interview questions.</p>
              <a href="https://github.com/krishnadey30/LeetCode-Questions-CompanyWise" target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:8,padding:"7px 14px",borderRadius:8,background:"var(--card)",border:"1px solid var(--border)",color:"var(--text)",fontSize:12,textDecoration:"none"}}>
                📦 Full company list on GitHub →
              </a>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
              {COMPANY_DATA.map(c=>(
                <div key={c.name} onClick={()=>setSelCompany(c)} className="hcard" style={{padding:20,cursor:"pointer",border:`1px solid var(--border)`,background:"var(--card)",transition:"all .2s"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                    <div style={{width:36,height:36,borderRadius:8,background:`${c.color}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <img src={c.logo} alt={c.name} style={{width:20,height:20,objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
                    </div>
                    <div>
                      <div className="syne" style={{fontSize:14,fontWeight:700}}>{c.name}</div>
                      <div style={{fontSize:10,color:"var(--text3)"}}>{c.hires}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:11,color:"var(--text3)"}}>{c.problems.length} top problems</span>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:`${c.color}18`,color:c.color,fontWeight:600}}>{c.rounds}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,fontSize:13,color:"var(--text3)"}}>
              <span style={{cursor:"pointer",color:"var(--cyan)"}} onClick={()=>setSelCompany(null)}>Company Wise</span>
              <span>›</span><span style={{color:"var(--text)"}}>{selCompany.name}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
              <div style={{width:52,height:52,borderRadius:12,background:`${selCompany.color}18`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <img src={selCompany.logo} alt={selCompany.name} style={{width:28,height:28,objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
              </div>
              <div>
                <h2 className="syne" style={{fontSize:24,fontWeight:800,marginBottom:4}}>{selCompany.name}</h2>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:`${selCompany.color}18`,color:selCompany.color}}>{selCompany.rounds}</span>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:"var(--bg3)",color:"var(--text2)"}}>{selCompany.hires}</span>
                </div>
              </div>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:14}}>Top Asked Problems</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:10}}>
              {selCompany.problems.map((p,i)=>(
                <a key={i} href={`https://leetcode.com/problems/${p.lc}/`} target="_blank" rel="noopener noreferrer"
                  style={{padding:"12px 16px",borderRadius:12,border:"1px solid var(--border)",background:"var(--card)",textDecoration:"none",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,transition:"all .2s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=selCompany.color;e.currentTarget.style.background=`${selCompany.color}08`;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--card)";}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:11,color:"var(--text3)",minWidth:18,textAlign:"right"}}>{i+1}</span>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{p.name}</div>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,background:`${DIFF_C[p.diff]}18`,color:DIFF_C[p.diff],flexShrink:0}}>{p.diff}</span>
                </a>
              ))}
            </div>
            {/* Interview Experience Links */}
            <div style={{marginTop:24,padding:"16px 20px",background:"rgba(0,212,255,.05)",border:"1px solid rgba(0,212,255,.15)",borderRadius:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--cyan)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>📖 Read Interview Experiences</div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <a href={`https://leetcode.com/discuss/interview-experience/?currentPage=1&orderBy=hot&query=${encodeURIComponent(selCompany.name)}`} target="_blank" rel="noopener noreferrer"
                  style={{fontSize:12,padding:"6px 14px",borderRadius:8,background:"rgba(255,161,22,.1)",color:"#f89f1b",border:"1px solid rgba(255,161,22,.25)",textDecoration:"none",fontWeight:600}}>LeetCode Discuss →</a>
                <a href={`https://www.geeksforgeeks.org/company/${selCompany.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-interview-experiences/`} target="_blank" rel="noopener noreferrer"
                  style={{fontSize:12,padding:"6px 14px",borderRadius:8,background:"rgba(0,200,100,.1)",color:"#00c864",border:"1px solid rgba(0,200,100,.25)",textDecoration:"none",fontWeight:600}}>GFG Experiences →</a>
                <a href={`https://www.ambitionbox.com/reviews/${selCompany.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-reviews`} target="_blank" rel="noopener noreferrer"
                  style={{fontSize:12,padding:"6px 14px",borderRadius:8,background:"rgba(124,77,255,.1)",color:"var(--purple)",border:"1px solid rgba(124,77,255,.25)",textDecoration:"none",fontWeight:600}}>AmbitionBox →</a>
                <a href={`https://www.glassdoor.co.in/Interview/${selCompany.name}-Interview-Questions-E`} target="_blank" rel="noopener noreferrer"
                  style={{fontSize:12,padding:"6px 14px",borderRadius:8,background:"rgba(0,255,136,.08)",color:"var(--green)",border:"1px solid rgba(0,255,136,.2)",textDecoration:"none",fontWeight:600}}>Glassdoor →</a>
              </div>
            </div>
            <button onClick={()=>setSelCompany(null)} style={{marginTop:16,padding:"9px 20px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text2)",fontSize:13,fontWeight:600,cursor:"pointer"}}>← All Companies</button>
          </>
        )}
      </div>
    </div>
  );



  // ── MOCK TEST MODE ──────────────────────────────────────────────────────────
  if (mockMode && mockCompany) {
    const solvedCount = Object.values(mockDone).filter(Boolean).length;
    const timerColor  = mockTime < 600 ? "var(--pink)" : mockTime < 1800 ? "var(--yellow)" : "var(--green)";
    return (
      <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
        <Header/>
        <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"20px 24px"}}>
          <div style={{maxWidth:860,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
            <div>
              <div style={{fontSize:12,color:"var(--text3)",marginBottom:4}}>Mock Test · {mockCompany.name}</div>
              <div className="syne" style={{fontSize:20,fontWeight:800}}>Solve {mockProblems.length} Problems</div>
            </div>
            <div style={{display:"flex",gap:14,alignItems:"center"}}>
              <div style={{textAlign:"center"}}>
                <div className="syne mono" style={{fontSize:28,fontWeight:900,color:timerColor}}>{fmtTime(mockTime)}</div>
                <div style={{fontSize:10,color:"var(--text3)"}}>remaining</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div className="syne" style={{fontSize:28,fontWeight:900,color:"var(--cyan)"}}>{solvedCount}/{mockProblems.length}</div>
                <div style={{fontSize:10,color:"var(--text3)"}}>solved</div>
              </div>
              <button onClick={stopMock} style={{padding:"8px 16px",borderRadius:9,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text2)",fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>End Test</button>
            </div>
          </div>
          {mockTime === 0 && (
            <div style={{maxWidth:860,margin:"12px auto 0",padding:"12px 16px",background:"rgba(255,61,138,.08)",border:"1px solid rgba(255,61,138,.3)",borderRadius:10,color:"var(--pink)",fontWeight:700,fontSize:14}}>
              ⏰ Time is up! You solved {solvedCount} out of {mockProblems.length} problems.
            </div>
          )}
        </div>
        <div style={{maxWidth:860,margin:"24px auto",padding:"0 24px",display:"grid",gap:16}}>
          {mockProblems.map((p,i)=>{
            const lc = (p.lc || p.name.toLowerCase().replace(/[^a-z0-9]+/g,"-"));
            const isSolved = !!mockDone[i];
            return (
              <div key={i} style={{background:"var(--card)",border:`1px solid ${isSolved?"rgba(0,255,136,.3)":"var(--border)"}`,borderRadius:14,padding:20,transition:"all .2s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(124,77,255,.15)",color:"var(--purple)",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div>
                    <span className="syne" style={{fontSize:16,fontWeight:700,color:isSolved?"var(--green)":"var(--text)"}}>{p.name}</span>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:5,background:`${DIFF_C[p.diff]}18`,color:DIFF_C[p.diff]}}>{p.diff}</span>
                    <a href={`https://leetcode.com/problems/${lc}/`} target="_blank" rel="noopener noreferrer"
                      style={{fontSize:12,padding:"5px 12px",borderRadius:7,background:"rgba(255,161,22,.1)",color:"#f89f1b",border:"1px solid rgba(255,161,22,.25)",textDecoration:"none",fontWeight:600}}>
                      Open LeetCode →
                    </a>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <button onClick={()=>setMockDone(d=>({...d,[i]:!d[i]}))}
                    style={{padding:"7px 18px",borderRadius:8,border:`1px solid ${isSolved?"var(--green)":"var(--border)"}`,background:isSolved?"rgba(0,255,136,.15)":"var(--card2)",color:isSolved?"var(--green)":"var(--text2)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all .15s"}}>
                    {isSolved?"✅ Marked Solved":"Mark as Solved"}
                  </button>
                  {isSolved && <span style={{fontSize:12,color:"var(--green)"}}>Good job!</span>}
                </div>
              </div>
            );
          })}
          {solvedCount === mockProblems.length && mockProblems.length > 0 && (
            <div style={{background:"rgba(0,255,136,.08)",border:"1px solid rgba(0,255,136,.3)",borderRadius:14,padding:20,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>🎉</div>
              <div className="syne" style={{fontSize:20,fontWeight:800,color:"var(--green)",marginBottom:6}}>All problems solved!</div>
              <div style={{fontSize:13,color:"var(--text2)",marginBottom:16}}>You finished the {mockCompany.name} mock test with {fmtTime(3600-mockTime)} remaining.</div>
              <button onClick={stopMock} className="btn-p" style={{padding:"10px 28px",fontSize:14}}>Back to DSA Explorer</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── LC150 TAB ────────────────────────────────────────────────────────────────
  if (tab === "lc150") {
    const totalLC = LC150.reduce((s,c) => s + c.problems.length, 0);
    const cats = ["All", ...LC150.map(c => c.cat)];
    const filtered150 = lc150Cat === "All" ? LC150 : LC150.filter(c => c.cat === lc150Cat);
    return (
      <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
        <Header/>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
            <div>
              <div className="syne" style={{fontSize:22,fontWeight:800,marginBottom:6}}>💯 Top 150 DSA</div>
              <p style={{color:"var(--text2)",fontSize:13}}>High-signal problems for Bangalore interviews — Google, Amazon, Flipkart, Swiggy, Zepto.</p>
            </div>
            <span style={{fontSize:12,padding:"5px 14px",borderRadius:20,background:"rgba(124,77,255,.15)",color:"var(--purple)",border:"1px solid rgba(124,77,255,.3)",fontWeight:700}}>{totalLC} Problems</span>
          </div>
          {/* Category filter */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:24}}>
            {cats.map(c=>{
              const col = LC150.find(x=>x.cat===c)?.color || "var(--purple)";
              return (
                <button key={c} onClick={()=>setLc150Cat(c)}
                  style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:600,border:`1px solid ${lc150Cat===c?col:"var(--border)"}`,background:lc150Cat===c?col+"20":"var(--card)",color:lc150Cat===c?col:"var(--text2)",cursor:"pointer",transition:"all .15s"}}>
                  {c}
                </button>
              );
            })}
          </div>
          {/* Problem groups */}
          <div style={{display:"grid",gap:20}}>
            {filtered150.map(group=>(
              <div key={group.cat} style={{background:"var(--card)",border:`1px solid ${group.color}30`,borderRadius:16,overflow:"hidden"}}>
                <div style={{background:`${group.color}10`,borderBottom:`1px solid ${group.color}20`,padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:group.color,flexShrink:0}}/>
                    <span className="syne" style={{fontSize:15,fontWeight:800,color:"var(--text)"}}>{group.cat}</span>
                  </div>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:`${group.color}18`,color:group.color,fontWeight:700}}>{group.problems.length} problems</span>
                </div>
                <div style={{padding:"14px 16px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:8}}>
                  {group.problems.map((p,i)=>(
                    <a key={i} href={`https://leetcode.com/problems/${p.lc}/`} target="_blank" rel="noopener noreferrer"
                      style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"10px 14px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",textDecoration:"none",transition:"all .2s"}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=group.color;e.currentTarget.style.background=`${group.color}08`;}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--bg)";}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                        <span style={{fontSize:11,color:"var(--text3)",minWidth:18,textAlign:"right",flexShrink:0}}>{i+1}</span>
                        <span style={{fontSize:13,fontWeight:600,color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                      </div>
                      <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,background:`${DIFF_C[p.diff]}18`,color:DIFF_C[p.diff],flexShrink:0}}>{p.diff}</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── ROADMAP TAB ───────────────────────────────────────────────────────────────
  if (tab === "roadmap") {
    const typeColor = t => t==="ds"?"var(--cyan)":t==="algo"?"var(--green)":t==="pattern"?"var(--purple)":"var(--text3)";
    const typeBg    = t => t==="ds"?"rgba(0,212,255,.1)":t==="algo"?"rgba(0,255,136,.1)":t==="pattern"?"rgba(124,77,255,.1)":"var(--bg3)";
    return (
      <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
        <Header/>
        <div style={{maxWidth:960,margin:"0 auto",padding:"28px 24px"}}>
          <div style={{marginBottom:28}}>
            <div className="syne" style={{fontSize:22,fontWeight:800,marginBottom:6}}>🗺️ DSA Learning Roadmap</div>
            <p style={{color:"var(--text2)",fontSize:13,lineHeight:1.6}}>7 phases from zero to placement-ready. Each topic unlocks the next. Follow the order.</p>
            {/* Legend */}
            <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
              {[["ds","Data Structure"],["algo","Algorithm"],["pattern","Pattern"],["concept","Concept"]].map(([t,l])=>(
                <span key={t} style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:typeBg(t),color:typeColor(t),border:`1px solid ${typeColor(t)}30`,fontWeight:600}}>{l}</span>
              ))}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {ROADMAP_PHASES.map((phase,pi)=>(
              <div key={pi} style={{background:"var(--card)",border:`1px solid ${phase.color}30`,borderRadius:16,overflow:"hidden"}}>
                {/* Phase header */}
                <div style={{background:`${phase.color}10`,borderBottom:`1px solid ${phase.color}20`,padding:"16px 22px",display:"flex",alignItems:"flex-start",gap:14}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:`${phase.color}20`,border:`2px solid ${phase.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{phase.icon}</div>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:3,background:`${phase.color}20`,color:phase.color}}>Phase {phase.phase}</span>
                    </div>
                    <div className="syne" style={{fontSize:16,fontWeight:800,color:"var(--text)",marginBottom:3}}>{phase.title}</div>
                    <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.5}}>{phase.goal}</div>
                  </div>
                </div>
                {/* Topics */}
                <div style={{padding:"14px 20px",display:"flex",flexWrap:"wrap",gap:8}}>
                  {phase.topics.map((topic,ti)=>(
                    <div key={ti} title={`Prereqs: ${topic.prereqs.join(", ")||"none"} → Unlocks: ${topic.unlocks.join(", ")}`}
                      style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:typeBg(topic.type),border:`1px solid ${typeColor(topic.type)}25`,cursor:"default",transition:"all .2s"}}
                      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow=`0 4px 12px ${typeColor(topic.type)}30`;}}
                      onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:typeColor(topic.type),flexShrink:0}}/>
                      <span style={{fontSize:12,fontWeight:600,color:typeColor(topic.type)}}>{topic.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {/* Pro tips */}
          <div style={{marginTop:24,background:"rgba(255,214,10,.06)",border:"1px solid rgba(255,214,10,.2)",borderRadius:14,padding:"18px 22px"}}>
            <div className="syne" style={{fontSize:14,fontWeight:800,color:"var(--yellow)",marginBottom:12}}>💡 Pro Tips for Bangalore Placements</div>
            <div style={{display:"grid",gap:8}}>
              {[
                "Spend 2x more time on Arrays, Trees, Graphs, DP — they appear in 80% of interviews",
                "For TCS/Infosys/Wipro: Phase 1-3 is enough. For Swiggy/Zepto/Flipkart: complete Phase 1-5",
                "For FAANG/MAANG: complete all 7 phases + System Design",
                "Hover over any topic chip to see what it requires and what it unlocks",
                "Aim for 2-3 problems per topic daily. Consistency beats marathons.",
              ].map((tip,i)=>(
                <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",fontSize:13,color:"var(--text2)"}}>
                  <span style={{color:"var(--yellow)",fontWeight:700,flexShrink:0}}>{i+1}.</span>{tip}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── VISUALIZERS TAB ────────────────────────────────────────────────────

  // ── DAILY CHALLENGE ────────────────────────────────────────────────────────
  // (shown in topics home as a banner — handled in topics tab below)

  // ── BOOKMARKS TAB ─────────────────────────────────────────────────────────
  if (tab === "bookmarks") {
    const bookmarkedList = Object.entries(bookmarks).filter(([,v])=>v).map(([k])=>{
      const [topic,name]=k.split("__");
      return { key:k, topic:topic||"", name:name||k };
    });
    return (
      <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
        <Header/>
        <div style={{maxWidth:900,margin:"0 auto",padding:"24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div>
              <div className="syne" style={{fontSize:20,fontWeight:800,marginBottom:4}}>⭐ Bookmarked Problems</div>
              <p style={{color:"var(--text2)",fontSize:13}}>Problems you saved for later. Click any to go straight to solve links.</p>
            </div>
            {bookmarkedList.length>0 && <button onClick={()=>saveBookmarks({})} style={{fontSize:12,padding:"6px 14px",borderRadius:8,border:"1px solid rgba(255,61,138,.3)",background:"rgba(255,61,138,.08)",color:"var(--pink)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Clear All</button>}
          </div>
          {bookmarkedList.length===0 ? (
            <div style={{textAlign:"center",padding:"60px 20px"}}>
              <div style={{fontSize:48,marginBottom:12}}>☆</div>
              <div className="syne" style={{fontSize:16,fontWeight:700,marginBottom:6,color:"var(--text)"}}>No bookmarks yet</div>
              <div style={{fontSize:13,color:"var(--text2)"}}>Click the ☆ star on any problem in Topics to bookmark it here.</div>
            </div>
          ) : (
            <div style={{display:"grid",gap:8}}>
              {bookmarkedList.map((b,i)=>{
                const pLinks = getProblemLinks(b.name, b.topic);
                const lcLink = pLinks.find(l=>l.name==="LeetCode")?.url || `https://leetcode.com/problems/${b.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}/`;
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12}}>
                    <button onClick={()=>toggleBookmark(b.key)} style={{background:"none",border:"none",color:"var(--yellow)",fontSize:16,cursor:"pointer",flexShrink:0}}>⭐</button>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{b.name}</div>
                      <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{b.topic}</div>
                    </div>
                    <a href={lcLink} target="_blank" rel="noopener noreferrer"
                      style={{fontSize:12,padding:"5px 12px",borderRadius:7,background:"rgba(255,161,22,.1)",color:"#f89f1b",border:"1px solid rgba(255,161,22,.25)",textDecoration:"none",fontWeight:600,flexShrink:0}}>
                      Solve →
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SPACED REPETITION TAB ──────────────────────────────────────────────────
  if (tab === "review") {
    const allSR = Object.entries(srData).map(([k,v])=>({key:k,...v})).sort((a,b)=>a.due-b.due);
    const dueNow = allSR.filter(x=>x.due<=Date.now());
    const upcoming = allSR.filter(x=>x.due>Date.now());
    const levelColor = l=>l==="easy"?"var(--green)":l==="medium"?"var(--yellow)":"var(--pink)";
    const fmtDue = ts=>{
      const diff=ts-Date.now(); const days=Math.ceil(diff/86400000);
      return days<=0?"Due now":days===1?"Due tomorrow":`Due in ${days} days`;
    };
    return (
      <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
        <Header/>
        <div style={{maxWidth:900,margin:"0 auto",padding:"24px"}}>
          <div className="syne" style={{fontSize:20,fontWeight:800,marginBottom:4}}>🔁 Spaced Repetition Review</div>
          <p style={{color:"var(--text2)",fontSize:13,marginBottom:20}}>Mark problems Easy/Medium/Hard after solving. They resurface at the right time for review.</p>
          {dueNow.length>0&&(<>
            <div style={{fontSize:12,fontWeight:700,color:"var(--pink)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>🔴 Due Now ({dueNow.length})</div>
            <div style={{display:"grid",gap:8,marginBottom:20}}>
              {dueNow.map((x,i)=>{
                const lc=getProblemLinks(x.name,x.topic);
                const url=lc[0]?.url||`https://leetcode.com/problems/${x.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}/`;
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:"rgba(255,61,138,.05)",border:"1px solid rgba(255,61,138,.2)",borderRadius:12}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{x.name}</div>
                      <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{x.topic}</div>
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      {["easy","medium","hard"].map(l=>(
                        <button key={l} onClick={()=>markSR(x.key,l)}
                          style={{fontSize:10,padding:"3px 8px",borderRadius:5,border:`1px solid ${levelColor(l)}40`,background:`${levelColor(l)}15`,color:levelColor(l),cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:600,textTransform:"capitalize"}}>
                          {l}
                        </button>
                      ))}
                      <a href={url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,padding:"3px 10px",borderRadius:5,background:"rgba(255,161,22,.1)",color:"#f89f1b",textDecoration:"none",border:"1px solid rgba(255,161,22,.25)",fontWeight:600}}>Solve →</a>
                    </div>
                  </div>
                );
              })}
            </div>
          </>)}
          {upcoming.length>0&&(<>
            <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>📅 Upcoming Reviews</div>
            <div style={{display:"grid",gap:6}}>
              {upcoming.slice(0,10).map((x,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:10}}>
                  <div style={{flex:1}}>
                    <span style={{fontSize:13,color:"var(--text)"}}>{x.name}</span>
                    <span style={{fontSize:11,color:"var(--text3)",marginLeft:8}}>{x.topic}</span>
                  </div>
                  <span style={{fontSize:11,color:levelColor(x.level),fontWeight:600}}>{x.level}</span>
                  <span style={{fontSize:11,color:"var(--text3)"}}>{fmtDue(x.due)}</span>
                </div>
              ))}
            </div>
          </>)}
          {allSR.length===0&&(
            <div style={{textAlign:"center",padding:"60px 20px"}}>
              <div style={{fontSize:48,marginBottom:12}}>🔁</div>
              <div className="syne" style={{fontSize:16,fontWeight:700,marginBottom:6,color:"var(--text)"}}>No problems scheduled yet</div>
              <div style={{fontSize:13,color:"var(--text2)"}}>After solving a problem, mark it Easy/Medium/Hard using the SR button. It will resurface here for review.</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (tab === "visualizers") return (
    <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
      <Header/>
      <div style={{maxWidth:1100,margin:"0 auto",padding:"28px 24px"}}>
        <div style={{marginBottom:24}}>
          <div className="syne" style={{fontSize:20,fontWeight:800,marginBottom:6}}>🎬 DSA Visualizers</div>
          <p style={{color:"var(--text2)",fontSize:13}}>See algorithms come alive. Visualizers make abstract concepts click instantly.</p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16,marginBottom:36}}>
          {VISUALIZERS_DATA.map(v=>(
            <a key={v.name} href={v.url} target="_blank" rel="noopener noreferrer"
              style={{display:"flex",flexDirection:"column",gap:14,padding:24,borderRadius:16,border:"1px solid var(--border)",background:"var(--card)",textDecoration:"none",transition:"all .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=v.color;e.currentTarget.style.background=`${v.color}08`;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--card)";}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:32}}>{v.icon}</span>
                <div>
                  <div className="syne" style={{fontSize:16,fontWeight:800,color:"var(--text)",marginBottom:3}}>{v.name}</div>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:`${v.color}18`,color:v.color,fontWeight:700}}>{v.tag}</span>
                </div>
              </div>
              <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.6,margin:0}}>{v.desc}</p>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {v.topics.map(t=>(
                  <span key={t} style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:"var(--bg3)",color:"var(--text3)"}}>{t}</span>
                ))}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:"auto"}}>
                <span style={{fontSize:12,color:v.color,fontWeight:600}}>Open Visualizer</span>
                <span style={{fontSize:16,color:v.color}}>→</span>
              </div>
            </a>
          ))}
        </div>
        <div style={{borderTop:"1px solid var(--border)",paddingTop:28}}>
          <div className="syne" style={{fontSize:16,fontWeight:800,marginBottom:16}}>📚 Curated DSA Resources</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
            {DSA_RESOURCES.map(r=>(
              <a key={r.name} href={r.url} target="_blank" rel="noopener noreferrer"
                style={{display:"flex",alignItems:"flex-start",gap:14,padding:"16px",borderRadius:14,border:"1px solid var(--border)",background:"var(--card)",textDecoration:"none",transition:"all .2s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--cyan)";e.currentTarget.style.background="rgba(0,212,255,.04)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--card)";}}>
                <span style={{fontSize:24,flexShrink:0}}>{r.icon}</span>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:4}}>{r.name}</div>
                  <div style={{fontSize:11,color:"var(--text3)",lineHeight:1.5,marginBottom:6}}>{r.desc}</div>
                  <span style={{fontSize:9,padding:"2px 6px",borderRadius:3,background:"rgba(0,212,255,.12)",color:"var(--cyan)",fontWeight:700}}>{r.tag}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── TOPICS TAB (default) ────────────────────────────────────────────────
  return (
    <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
      <Header/>
      {/* Daily Challenge Banner */}
      {dailyProb && (
        <div style={{background:"linear-gradient(135deg,rgba(124,77,255,.12),rgba(0,212,255,.08))",borderBottom:"1px solid var(--border)",padding:"12px 24px"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <span style={{fontSize:16}}>⚡</span>
            <div style={{flex:1,minWidth:0}}>
              <span style={{fontSize:11,fontWeight:700,color:"var(--purple)",textTransform:"uppercase",letterSpacing:".08em",marginRight:8}}>Today's Challenge</span>
              <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{dailyProb.name}</span>
              <span style={{fontSize:11,color:"var(--text3)",marginLeft:8}}>{dailyProb.cat}</span>
            </div>
            <a href={`https://leetcode.com/problems/${dailyProb.lc}/`} target="_blank" rel="noopener noreferrer"
              style={{fontSize:12,padding:"5px 14px",borderRadius:7,background:"rgba(124,77,255,.15)",color:"var(--purple)",border:"1px solid rgba(124,77,255,.3)",textDecoration:"none",fontWeight:700,flexShrink:0}}>
              Solve Today →
            </a>
          </div>
        </div>
      )}
      <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"20px 24px"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{position:"relative",flex:1,maxWidth:400}}>
              <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"var(--text3)"}}>🔍</span>
              <input className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search topics — Arrays, DP, Graphs…" style={{padding:"10px 16px 10px 38px",fontSize:14}}/>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {DSA_CATEGORIES.map(c=>(
                <button key={c} onClick={()=>setCat(c)} style={{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:600,border:"1px solid var(--border)",background:cat===c?"var(--purple)":"var(--card)",color:cat===c?"#fff":"var(--text2)",cursor:"pointer",transition:"all .15s"}}>{c}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div style={{maxWidth:1200,margin:"0 auto",padding:"24px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
          {filtered.map(t=>(
            <div key={t.slug} onClick={()=>openTopic(t)} className="hcard" style={{padding:20,cursor:"pointer",border:"1px solid var(--border)",background:"var(--card)",transition:"all .2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <span style={{fontSize:22,lineHeight:1}}>{t.icon}</span>
                <span style={{fontSize:10,fontWeight:700,padding:"3px 7px",borderRadius:4,background:`${DIFF_C[t.difficulty]}18`,color:DIFF_C[t.difficulty]}}>{t.difficulty}</span>
              </div>
              <div className="syne" style={{fontSize:14,fontWeight:700,marginBottom:4}}>{t.topic}</div>
              <div style={{fontSize:11,color:"var(--text3)",marginBottom:10}}>{t.category}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:11,color:"var(--text2)"}}>🧩 {t.tuf} problems</span>
                <span style={{fontSize:11,color:"var(--purple)"}}>📚 {t.platforms.length} sites</span>
              </div>
            </div>
          ))}
          {filtered.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:"60px 20px",color:"var(--text2)"}}>No topics found for &quot;{search}&quot;</div>}
        </div>
      </div>
    </div>
  );
};





// ═══════════════════════════════════════════════════════════
//  STUDENT TOOLS
// ═══════════════════════════════════════════════════════════

// eslint-disable-next-line no-unused-vars
const TUF_CHECKLIST = {
  "Arrays (Medium)": [
    {name:"Majority Element I",diff:"Easy"},
    {name:"Leaders in an Array",diff:"Easy"},
    {name:"Rearrange Array Elements by Sign",diff:"Medium"},
    {name:"Spiral Matrix",diff:"Medium"},
    {name:"Pascal's Triangle I",diff:"Easy"},
    {name:"Pascal's Triangle II",diff:"Easy"},
    {name:"Pascal's Triangle III",diff:"Medium"},
    {name:"Rotate Matrix by 90°",diff:"Medium"},
    {name:"Two Sum",diff:"Easy"},
    {name:"3 Sum",diff:"Medium"},
    {name:"4 Sum",diff:"Medium"},
    {name:"Sort Array of 0s, 1s, 2s",diff:"Easy"},
    {name:"Kadane's Algorithm",diff:"Medium"},
    {name:"Next Permutation",diff:"Medium"},
    {name:"Longest Consecutive Sequence",diff:"Medium"},
    {name:"Longest Subarray with Sum K",diff:"Medium"},
    {name:"Count Subarrays with Given Sum",diff:"Medium"},
    {name:"Count Subarrays with XOR = K",diff:"Medium"},
  ],
  "Arrays (Hard)": [
    {name:"Majority Element II",diff:"Hard"},
    {name:"Find Repeating and Missing Number",diff:"Hard"},
    {name:"Count Inversions",diff:"Hard"},
    {name:"Reverse Pairs",diff:"Hard"},
    {name:"Maximum Product Subarray",diff:"Hard"},
    {name:"Merge Two Sorted Arrays Without Extra Space",diff:"Hard"},
  ],
  "Binary Search": [
    {name:"Search X in Sorted Array",diff:"Easy"},
    {name:"Lower Bound",diff:"Easy"},
    {name:"Upper Bound",diff:"Easy"},
    {name:"Search Insert Position",diff:"Easy"},
    {name:"Floor and Ceil in Sorted Array",diff:"Easy"},
    {name:"First and Last Occurrence",diff:"Easy"},
    {name:"Search in Rotated Sorted Array I",diff:"Medium"},
    {name:"Search in Rotated Sorted Array II",diff:"Medium"},
    {name:"Find Minimum in Rotated Sorted Array",diff:"Medium"},
    {name:"Find How Many Times Array is Rotated",diff:"Medium"},
    {name:"Single Element in Sorted Array",diff:"Medium"},
    {name:"Find Square Root of a Number",diff:"Easy"},
    {name:"Find Nth Root of a Number",diff:"Medium"},
    {name:"Find the Smallest Divisor",diff:"Medium"},
    {name:"Koko Eating Bananas",diff:"Medium"},
    {name:"Minimum Days to Make M Bouquets",diff:"Medium"},
    {name:"Aggressive Cows",diff:"Hard"},
    {name:"Book Allocation Problem",diff:"Hard"},
    {name:"Find Peak Element",diff:"Medium"},
    {name:"Median of 2 Sorted Arrays",diff:"Hard"},
    {name:"Kth Element of 2 Sorted Arrays",diff:"Hard"},
    {name:"Minimize Max Distance to Gas Station",diff:"Hard"},
    {name:"Split Array - Largest Sum",diff:"Hard"},
    {name:"Find Row with Maximum 1s",diff:"Easy"},
    {name:"Search in a 2D Matrix",diff:"Medium"},
    {name:"Search in 2D Matrix II",diff:"Medium"},
    {name:"Find Peak Element II",diff:"Hard"},
    {name:"Matrix Median",diff:"Hard"},
  ],
  "Recursion & Backtracking": [
    {name:"Pow(x,n)",diff:"Medium"},
    {name:"Generate Parentheses",diff:"Medium"},
    {name:"Power Set",diff:"Medium"},
    {name:"Check if Subsequence with Sum K Exists",diff:"Easy"},
    {name:"Count All Subsequences with Sum K",diff:"Medium"},
    {name:"Combination Sum",diff:"Medium"},
    {name:"Combination Sum II",diff:"Medium"},
    {name:"Subsets I",diff:"Medium"},
    {name:"Subsets II",diff:"Medium"},
    {name:"Combination Sum III",diff:"Medium"},
    {name:"Letter Combinations of a Phone Number",diff:"Medium"},
    {name:"Palindrome Partitioning",diff:"Hard"},
    {name:"Word Search",diff:"Hard"},
    {name:"N-Queens",diff:"Hard"},
    {name:"Rat in a Maze",diff:"Hard"},
    {name:"M Coloring Problem",diff:"Hard"},
    {name:"Sudoku Solver",diff:"Hard"},
  ],
  "Linked List": [
    {name:"Introduction & Traversal",diff:"Easy"},
    {name:"Deletion in LL",diff:"Easy"},
    {name:"Insertion in LL",diff:"Easy"},
    {name:"Delete Head / Tail / Kth Node",diff:"Easy"},
    {name:"Delete Node with Value X",diff:"Easy"},
    {name:"Insert at Head / Tail / Kth Position",diff:"Easy"},
    {name:"Doubly LL – Insertion & Deletion",diff:"Easy"},
    {name:"Add Two Numbers in LL",diff:"Medium"},
    {name:"Segregate Odd and Even Nodes",diff:"Medium"},
    {name:"Sort LL of 0s, 1s, and 2s",diff:"Medium"},
    {name:"Remove Nth Node from Back",diff:"Medium"},
    {name:"Reverse a Linked List",diff:"Easy"},
    {name:"Add One to Number in LL",diff:"Medium"},
    {name:"Find Middle of LL",diff:"Easy"},
    {name:"Delete Middle Node",diff:"Medium"},
    {name:"Check if LL is Palindrome",diff:"Medium"},
    {name:"Intersection Point of Y LL",diff:"Medium"},
    {name:"Detect Loop in LL",diff:"Medium"},
    {name:"Find Starting Point of Loop",diff:"Medium"},
    {name:"Length of Loop",diff:"Medium"},
    {name:"Reverse LL in Groups of K",diff:"Hard"},
    {name:"Rotate a Linked List",diff:"Medium"},
    {name:"Merge Two Sorted Lists",diff:"Medium"},
    {name:"Flatten a Linked List",diff:"Hard"},
    {name:"Sort LL",diff:"Hard"},
    {name:"Clone LL with Random & Next Pointer",diff:"Hard"},
    {name:"Delete All Occurrences of Key in DLL",diff:"Medium"},
    {name:"Remove Duplicates from Sorted DLL",diff:"Medium"},
  ],
  "Bit Manipulation": [
    {name:"Intro to Bits & Tricks",diff:"Easy"},
    {name:"Minimum Bit Flips to Convert Number",diff:"Easy"},
    {name:"Single Number I",diff:"Easy"},
    {name:"Single Number II",diff:"Medium"},
    {name:"Single Number III",diff:"Medium"},
    {name:"Divide Without Multiplication/Division",diff:"Medium"},
    {name:"Power Set using Bits",diff:"Medium"},
    {name:"XOR of Numbers in a Given Range",diff:"Medium"},
  ],
  "Greedy": [
    {name:"Assign Cookies",diff:"Easy"},
    {name:"Lemonade Change",diff:"Easy"},
    {name:"Jump Game I",diff:"Medium"},
    {name:"Shortest Job First",diff:"Medium"},
    {name:"Job Sequencing Problem",diff:"Medium"},
    {name:"N Meetings in One Room",diff:"Medium"},
    {name:"Non-overlapping Intervals",diff:"Medium"},
    {name:"Insert Interval",diff:"Medium"},
    {name:"Minimum Platforms for Railway",diff:"Medium"},
    {name:"Valid Parenthesis Checker",diff:"Medium"},
    {name:"Candy",diff:"Hard"},
    {name:"Maximum Points from Cards",diff:"Medium"},
  ],
  "Sliding Window": [
    {name:"Longest Substring Without Repeating Characters",diff:"Medium"},
    {name:"Max Consecutive Ones III",diff:"Medium"},
    {name:"Fruits Into Baskets",diff:"Medium"},
    {name:"Longest Substring with At Most K Distinct Characters",diff:"Medium"},
    {name:"Longest Repeating Character Replacement",diff:"Medium"},
    {name:"Minimum Window Substring",diff:"Hard"},
    {name:"Number of Substrings Containing All 3 Characters",diff:"Medium"},
    {name:"Binary Subarrays with Sum",diff:"Medium"},
    {name:"Count Number of Nice Subarrays",diff:"Medium"},
  ],
  "Stack & Queue": [
    {name:"Implement Stack using Arrays",diff:"Easy"},
    {name:"Implement Queue using Arrays",diff:"Easy"},
    {name:"Implement Stack using Queue",diff:"Easy"},
    {name:"Implement Queue using Stack",diff:"Easy"},
    {name:"Stack using Linked List",diff:"Easy"},
    {name:"Queue using Linked List",diff:"Easy"},
    {name:"Balanced Parenthesis",diff:"Easy"},
    {name:"Next Greater Element I",diff:"Medium"},
    {name:"Next Greater Element II",diff:"Medium"},
    {name:"Asteroid Collision",diff:"Medium"},
    {name:"Sum of Subarray Minimums",diff:"Hard"},
    {name:"Sum of Subarray Ranges",diff:"Medium"},
    {name:"Remove K Digits",diff:"Medium"},
    {name:"Implement Min Stack",diff:"Medium"},
    {name:"Sliding Window Maximum",diff:"Hard"},
    {name:"Trapping Rainwater",diff:"Hard"},
    {name:"Largest Rectangle in Histogram",diff:"Hard"},
    {name:"Maximum Rectangle",diff:"Hard"},
    {name:"Stock Span Problem",diff:"Medium"},
    {name:"Celebrity Problem",diff:"Medium"},
    {name:"LRU Cache",diff:"Hard"},
    {name:"LFU Cache",diff:"Hard"},
  ],
  "Binary Trees": [
    {name:"Inorder / Preorder / Postorder Traversal",diff:"Easy"},
    {name:"Level Order Traversal",diff:"Easy"},
    {name:"Pre, Post, Inorder in One Traversal",diff:"Medium"},
    {name:"Maximum Depth of BT",diff:"Easy"},
    {name:"Check if Two Trees are Identical",diff:"Easy"},
    {name:"Check for Balanced Binary Tree",diff:"Medium"},
    {name:"Diameter of Binary Tree",diff:"Easy"},
    {name:"Maximum Path Sum",diff:"Hard"},
    {name:"Check for Symmetrical BTs",diff:"Easy"},
    {name:"Zig Zag / Spiral Traversal",diff:"Medium"},
    {name:"Boundary Traversal",diff:"Medium"},
    {name:"Vertical Order Traversal",diff:"Hard"},
    {name:"Top / Bottom View of BT",diff:"Medium"},
    {name:"Right / Left View of BT",diff:"Easy"},
    {name:"Print Root to Node Path",diff:"Medium"},
    {name:"LCA in BT",diff:"Medium"},
    {name:"Maximum Width of BT",diff:"Medium"},
    {name:"All Nodes at Distance K",diff:"Medium"},
    {name:"Min Time to Burn BT from a Node",diff:"Hard"},
    {name:"Count Total Nodes in Complete BT",diff:"Medium"},
    {name:"Requirements to Construct Unique BT",diff:"Easy"},
    {name:"Construct BT from Preorder & Inorder",diff:"Medium"},
    {name:"Construct BT from Postorder & Inorder",diff:"Medium"},
    {name:"Serialize and Deserialize BT",diff:"Hard"},
    {name:"Morris Inorder Traversal",diff:"Medium"},
    {name:"Morris Preorder Traversal",diff:"Medium"},
  ],
  "Binary Search Trees": [
    {name:"Introduction to BST",diff:"Easy"},
    {name:"Search in BST",diff:"Easy"},
    {name:"Floor and Ceil in BST",diff:"Medium"},
    {name:"Insert a Node in BST",diff:"Easy"},
    {name:"Delete a Node in BST",diff:"Medium"},
    {name:"Kth Smallest and Largest Element",diff:"Medium"},
    {name:"Check if Tree is BST",diff:"Medium"},
    {name:"LCA in BST",diff:"Easy"},
    {name:"Construct BST from Preorder Traversal",diff:"Medium"},
    {name:"Inorder Successor and Predecessor",diff:"Medium"},
    {name:"BST Iterator",diff:"Medium"},
    {name:"Two Sum in BST",diff:"Medium"},
    {name:"Correct BST with Two Swapped Nodes",diff:"Hard"},
    {name:"Largest BST in Binary Tree",diff:"Hard"},
  ],
  "Heaps": [
    {name:"Heapify Algorithm",diff:"Easy"},
    {name:"Build Heap from Array",diff:"Easy"},
    {name:"Implement Min / Max Heap",diff:"Easy"},
    {name:"Check if Array Represents Min Heap",diff:"Easy"},
    {name:"Convert Min Heap to Max Heap",diff:"Medium"},
    {name:"Heap Sort",diff:"Medium"},
    {name:"Kth Largest Element in Array",diff:"Medium"},
    {name:"Kth Largest in Running Stream",diff:"Hard"},
  ],
  "Graphs": [
    {name:"BFS & DFS Traversal",diff:"Easy"},
    {name:"Connected Components",diff:"Easy"},
    {name:"Number of Provinces",diff:"Medium"},
    {name:"Number of Islands",diff:"Medium"},
    {name:"Flood Fill Algorithm",diff:"Easy"},
    {name:"Number of Enclaves",diff:"Medium"},
    {name:"Rotten Oranges",diff:"Medium"},
    {name:"Distance of Nearest Cell with 1",diff:"Medium"},
    {name:"Surrounded Regions",diff:"Medium"},
    {name:"Number of Distinct Islands",diff:"Medium"},
    {name:"Detect Cycle in Undirected Graph",diff:"Medium"},
    {name:"Bipartite Graph",diff:"Medium"},
    {name:"Topological Sort / Kahn's Algorithm",diff:"Medium"},
    {name:"Detect Cycle in Directed Graph",diff:"Medium"},
    {name:"Find Eventual Safe States",diff:"Medium"},
    {name:"Course Schedule I & II",diff:"Medium"},
    {name:"Alien Dictionary",diff:"Hard"},
    {name:"Shortest Path in DAG",diff:"Medium"},
    {name:"Shortest Path in Undirected Graph",diff:"Easy"},
    {name:"Word Ladder I & II",diff:"Hard"},
    {name:"Dijkstra's Algorithm",diff:"Medium"},
    {name:"Print Shortest Path",diff:"Medium"},
    {name:"Shortest Distance in Binary Maze",diff:"Medium"},
    {name:"Path with Minimum Effort",diff:"Medium"},
    {name:"Cheapest Flights within K Stops",diff:"Hard"},
    {name:"Minimum Multiplications to Reach End",diff:"Hard"},
    {name:"Number of Ways to Arrive at Destination",diff:"Hard"},
    {name:"Bellman Ford Algorithm",diff:"Medium"},
    {name:"Floyd Warshall Algorithm",diff:"Medium"},
    {name:"City with Smallest Number of Neighbors",diff:"Medium"},
    {name:"MST – Prim's / Kruskal's",diff:"Medium"},
    {name:"Disjoint Set (Union-Find)",diff:"Medium"},
    {name:"Number of Operations to Connect Network",diff:"Medium"},
    {name:"Accounts Merge",diff:"Hard"},
    {name:"Number of Islands II",diff:"Hard"},
    {name:"Making a Large Island",diff:"Hard"},
    {name:"Most Stones Removed",diff:"Hard"},
    {name:"Kosaraju's Algorithm (SCC)",diff:"Hard"},
    {name:"Bridges in Graph",diff:"Hard"},
    {name:"Articulation Points",diff:"Hard"},
  ],
  "Dynamic Programming": [
    {name:"Climbing Stairs",diff:"Easy"},
    {name:"Frog Jump",diff:"Easy"},
    {name:"Frog Jump with K Distances",diff:"Medium"},
    {name:"Maximum Sum of Non-Adjacent Elements",diff:"Medium"},
    {name:"House Robber",diff:"Medium"},
    {name:"Ninja's Training (2D DP)",diff:"Medium"},
    {name:"Grid Unique Paths",diff:"Medium"},
    {name:"Unique Paths II",diff:"Medium"},
    {name:"Minimum Falling Path Sum",diff:"Medium"},
    {name:"Triangle (DP)",diff:"Medium"},
    {name:"Cherry Pickup II",diff:"Hard"},
    {name:"Best Time to Buy and Sell Stock I",diff:"Easy"},
    {name:"Best Time to Buy and Sell Stock II",diff:"Medium"},
    {name:"Best Time to Buy and Sell Stock III",diff:"Hard"},
    {name:"Best Time to Buy and Sell Stock IV",diff:"Hard"},
    {name:"Stock with Transaction Fees",diff:"Medium"},
    {name:"Subset Sum Equals to Target",diff:"Medium"},
    {name:"Partition Equal Subset Sum",diff:"Medium"},
    {name:"Partition into Two Subsets – Min Diff",diff:"Hard"},
    {name:"Count Subsets with Sum K",diff:"Medium"},
    {name:"Count Partitions with Given Difference",diff:"Medium"},
    {name:"0-1 Knapsack",diff:"Medium"},
    {name:"Minimum Coins",diff:"Medium"},
    {name:"Target Sum",diff:"Medium"},
    {name:"Coin Change II",diff:"Medium"},
    {name:"Unbounded Knapsack",diff:"Medium"},
    {name:"Rod Cutting Problem",diff:"Medium"},
    {name:"Longest Increasing Subsequence",diff:"Medium"},
    {name:"Print LIS",diff:"Medium"},
    {name:"Largest Divisible Subset",diff:"Medium"},
    {name:"Longest String Chain",diff:"Medium"},
    {name:"Longest Bitonic Subsequence",diff:"Medium"},
    {name:"Number of Longest Increasing Subsequences",diff:"Hard"},
    {name:"Longest Common Subsequence",diff:"Medium"},
    {name:"Longest Common Substring",diff:"Medium"},
    {name:"Longest Palindromic Subsequence",diff:"Medium"},
    {name:"Min Insertions to Make Palindrome",diff:"Medium"},
    {name:"Min Insertions/Deletions to Convert A to B",diff:"Hard"},
    {name:"Shortest Common Supersequence",diff:"Hard"},
    {name:"Distinct Subsequences",diff:"Hard"},
    {name:"Edit Distance",diff:"Hard"},
    {name:"Wildcard Matching",diff:"Hard"},
    {name:"Matrix Chain Multiplication",diff:"Hard"},
    {name:"Minimum Cost to Cut the Stick",diff:"Hard"},
    {name:"Burst Balloons",diff:"Hard"},
    {name:"Palindrome Partitioning II",diff:"Hard"},
  ],
  "Tries": [
    {name:"Trie Implementation and Operations",diff:"Medium"},
    {name:"Trie – Advanced Operations",diff:"Medium"},
    {name:"Longest Word with All Prefixes",diff:"Medium"},
    {name:"Number of Distinct Substrings",diff:"Hard"},
    {name:"Maximum XOR of Two Numbers",diff:"Medium"},
    {name:"Maximum XOR with Element from Array",diff:"Hard"},
  ],
  "Strings – Advanced": [
    {name:"Reverse Every Word in a String",diff:"Easy"},
    {name:"Minimum Bracket Reversals",diff:"Hard"},
    {name:"Count and Say",diff:"Medium"},
    {name:"Rabin Karp Algorithm",diff:"Medium"},
    {name:"Z Function",diff:"Medium"},
    {name:"KMP Algorithm / LPS Array",diff:"Medium"},
    {name:"Shortest Palindrome",diff:"Hard"},
    {name:"Longest Happy Prefix",diff:"Hard"},
  ],
  "Mathematics": [
    {name:"Print All Primes till N (Sieve)",diff:"Easy"},
    {name:"Prime Factorisation of a Number",diff:"Easy"},
    {name:"Count Primes in Range L to R",diff:"Medium"},
    {name:"GCD and LCM",diff:"Easy"},
    {name:"Check Armstrong Number",diff:"Easy"},
    {name:"Reverse a Number",diff:"Easy"},
    {name:"Count Digits in a Number",diff:"Easy"},
    {name:"Sum of Digits",diff:"Easy"},
    {name:"Check Perfect Number",diff:"Easy"},
    {name:"Power (Fast Exponentiation)",diff:"Medium"},
    {name:"Modular Arithmetic",diff:"Medium"},
    {name:"Catalan Numbers",diff:"Medium"},
    {name:"Pascal's Triangle Row",diff:"Easy"},
    {name:"Number of Trailing Zeros in Factorial",diff:"Medium"},
    {name:"Find All Divisors of a Number",diff:"Easy"},
  ],
};


// ── Student Tools Landing Page ──────────────────────────────

/* ════════════════════════════════════════════════════════════════
   CP CONTEST TRACKER
════════════════════════════════════════════════════════════════ */
function useContests() {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [lastFetch, setLastFetch] = useState(null);

  const fetch_ = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API_BASE}/contests`);
      const j = await r.json();
      setData(j.data || []);
      setLastFetch(new Date());
    } catch(e) {
      setError("Could not load contests. Check connection.");
      setData([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);
  return { data, loading, error, lastFetch, refresh: fetch_ };
}

const PLATFORM_COLORS = {
  codeforces:  "#1a9eee",
  codechef:    "#9c4a17",
  leetcode:    "#f89f1b",
  atcoder:     "#888888",
  hackerearth: "#3d7ef9",
  hackerrank:  "#2ec866",
  topcoder:    "#ef3b45",
};
const PLATFORM_LABELS = {
  codeforces:"Codeforces", codechef:"CodeChef", leetcode:"LeetCode",
  atcoder:"AtCoder", hackerearth:"HackerEarth", hackerrank:"HackerRank", topcoder:"TopCoder",
};
const PLATFORM_ICONS = {
  codeforces:"⚡", codechef:"👨‍🍳", leetcode:"🟨", atcoder:"🔵",
  hackerearth:"🌍", hackerrank:"💚", topcoder:"🔴",
};

const fmtContestTime = (iso) => {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (isNaN(d)) return "TBD";
  return d.toLocaleString("en-IN", {
    day:"numeric", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12:true,
    timeZone:"Asia/Kolkata"
  }) + " IST";
};

const fmtDuration = (secs) => {
  if (!secs) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

const getCountdown = (iso) => {
  if (!iso) return null;
  const diff = new Date(iso) - new Date();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86400000);
  const hrs  = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs  > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
};

const googleCalLink = (c) => {
  if (!c.startTime) return "#";
  const start = new Date(c.startTime).toISOString().replace(/[-:]/g,"").replace(".000","");
  const end   = c.endTime ? new Date(c.endTime).toISOString().replace(/[-:]/g,"").replace(".000","") : start;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(c.name)}&dates=${start}/${end}&details=${encodeURIComponent(c.url)}&location=${encodeURIComponent(c.url)}`;
};

const CPContestPage = ({ setPage }) => {
  const { data, loading, error, lastFetch, refresh } = useContests();
  const [platforms, setPlatforms] = useState(["all"]);
  const [calMonth,  setCalMonth]  = useState(new Date());
  const [selDate,   setSelDate]   = useState(null);
  const [view,      setView]      = useState("split"); // split | list | calendar

  const allPlatforms = [...new Set(data.map(c => c.platform))].sort();

  const filtered = data.filter(c => {
    if (platforms.includes("all")) return true;
    return platforms.includes(c.platform);
  });

  const running  = filtered.filter(c => c.status === "RUNNING");
  const upcoming = filtered.filter(c => c.status !== "RUNNING");

  // Group by date for left panel
  const grouped = {};
  filtered.forEach(c => {
    if (!c.startTime) return;
    const d = new Date(c.startTime);
    const key = d.toLocaleDateString("en-CA"); // YYYY-MM-DD
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });
  const sortedDates = Object.keys(grouped).sort();

  // Calendar helpers
  const calYear  = calMonth.getFullYear();
  const calMon   = calMonth.getMonth();
  const firstDay = new Date(calYear, calMon, 1).getDay();
  const daysInMonth = new Date(calYear, calMon+1, 0).getDate();
  const calDays = Array.from({length: firstDay + daysInMonth}, (_, i) =>
    i < firstDay ? null : i - firstDay + 1
  );
  const contestsOnDay = (day) => {
    if (!day) return [];
    const key = `${calYear}-${String(calMon+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return grouped[key] || [];
  };
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-CA");

  const selDateContests = selDate ? (grouped[selDate] || []) : [];

  const pColor = (p) => PLATFORM_COLORS[p] || "var(--cyan)";

  const ContestItem = ({ c, showDate=true }) => {
    const cd = getCountdown(c.startTime);
    const col = pColor(c.platform);
    return (
      <div style={{
        padding:"12px 16px", borderRadius:12, border:`1px solid ${col}20`,
        background:c.status==="RUNNING"?`${col}08`:"var(--card)",
        marginBottom:8, transition:"all .2s"
      }}
        onMouseEnter={e=>e.currentTarget.style.borderColor=col}
        onMouseLeave={e=>e.currentTarget.style.borderColor=`${col}20`}>
        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
          {/* Platform dot */}
          <div style={{width:8,height:8,borderRadius:"50%",background:col,flexShrink:0,marginTop:6}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
              {c.status==="RUNNING" && (
                <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:3,background:"rgba(0,255,136,.2)",color:"var(--green)",border:"1px solid rgba(0,255,136,.4)"}}>🔴 LIVE</span>
              )}
              <span style={{fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:4,background:`${col}15`,color:col,border:`1px solid ${col}25`}}>
                {PLATFORM_ICONS[c.platform]} {PLATFORM_LABELS[c.platform]||c.platform}
              </span>
              {cd && <span style={{fontSize:10,color:"var(--text3)",marginLeft:"auto"}}>in {cd}</span>}
            </div>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",lineHeight:1.4,marginBottom:4}}>{c.name}</div>
            <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
              {showDate && <span style={{fontSize:11,color:"var(--text2)"}}>{fmtContestTime(c.startTime)}</span>}
              {c.duration && <span style={{fontSize:11,color:"var(--text3)"}}>⏱ {fmtDuration(c.duration)}</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:5,flexShrink:0}}>
            <a href={googleCalLink(c)} target="_blank" rel="noopener noreferrer"
              style={{fontSize:10,padding:"4px 8px",borderRadius:6,background:"rgba(0,212,255,.1)",color:"var(--cyan)",border:"1px solid rgba(0,212,255,.2)",textDecoration:"none",whiteSpace:"nowrap"}}>
              + Cal
            </a>
            <a href={c.url} target="_blank" rel="noopener noreferrer"
              style={{fontSize:10,padding:"4px 8px",borderRadius:6,background:`${col}15`,color:col,border:`1px solid ${col}30`,textDecoration:"none",whiteSpace:"nowrap"}}>
              Join →
            </a>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
      {/* Header */}
      <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"28px 24px 20px"}}>
        <div style={{maxWidth:1400,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <button onClick={()=>setPage("tools")} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"5px 12px",color:"var(--text2)",fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>← Tools</button>
            <div className="sl" style={{marginBottom:0}}>Student Tools</div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
            <div>
              <h1 className="syne" style={{fontSize:28,fontWeight:800,marginBottom:4}}>
                🏆 CP <span className="gtext">Contest Tracker</span>
              </h1>
              <p style={{color:"var(--text2)",fontSize:13}}>
                Live & upcoming contests from Codeforces, CodeChef, LeetCode, AtCoder & more — updated every 30 minutes.
              </p>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              {lastFetch && <span style={{fontSize:11,color:"var(--text3)"}}>Updated {lastFetch.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</span>}
              <button onClick={refresh} style={{fontSize:12,padding:"6px 14px",borderRadius:8,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text2)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                🔄 Refresh
              </button>
              {/* View toggle */}
              {[["split","⬜ Split"],["list","☰ List"],["calendar","📅 Calendar"]].map(([v,l])=>(
                <button key={v} onClick={()=>setView(v)}
                  style={{fontSize:12,padding:"6px 14px",borderRadius:8,border:`1px solid ${view===v?"var(--purple)":"var(--border)"}`,background:view===v?"rgba(124,77,255,.15)":"var(--card)",color:view===v?"var(--purple)":"var(--text2)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:view===v?700:400}}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Platform filter pills */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:14}}>
            <button onClick={()=>setPlatforms(["all"])}
              style={{fontSize:11,padding:"4px 12px",borderRadius:20,border:`1px solid ${platforms.includes("all")?"var(--cyan)":"var(--border)"}`,background:platforms.includes("all")?"rgba(0,212,255,.15)":"var(--card)",color:platforms.includes("all")?"var(--cyan)":"var(--text2)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:platforms.includes("all")?700:400}}>
              All Platforms
            </button>
            {allPlatforms.map(p=>(
              <button key={p} onClick={()=>{
                if(platforms.includes("all")) { setPlatforms([p]); return; }
                const next = platforms.includes(p) ? platforms.filter(x=>x!==p) : [...platforms,p];
                setPlatforms(next.length ? next : ["all"]);
              }}
                style={{fontSize:11,padding:"4px 12px",borderRadius:20,border:`1px solid ${!platforms.includes("all")&&platforms.includes(p)?pColor(p):"var(--border)"}`,background:!platforms.includes("all")&&platforms.includes(p)?`${pColor(p)}15`:"var(--card)",color:!platforms.includes("all")&&platforms.includes(p)?pColor(p):"var(--text2)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:!platforms.includes("all")&&platforms.includes(p)?700:400}}>
                {PLATFORM_ICONS[p]} {PLATFORM_LABELS[p]||p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{maxWidth:1400,margin:"0 auto",padding:"20px 24px"}}>
        {loading ? (
          <div style={{display:"grid",gap:10}}>
            {[1,2,3,4].map(i=><div key={i} className="skel" style={{height:80,borderRadius:12}}/>)}
          </div>
        ) : error ? (
          <div style={{textAlign:"center",padding:"60px 20px",border:"1px dashed var(--border)",borderRadius:16}}>
            <div style={{fontSize:48,marginBottom:12}}>⚠️</div>
            <div className="syne" style={{fontSize:18,fontWeight:700,marginBottom:8}}>{error}</div>
            <button className="btn-p" onClick={refresh} style={{padding:"10px 24px",fontSize:14}}>Try Again</button>
          </div>
        ) : view === "split" ? (
          <div style={{display:"grid",gridTemplateColumns:"380px 1fr",gap:20}}>

            {/* LEFT — upcoming list */}
            <div style={{height:"calc(100vh - 220px)",overflowY:"auto",paddingRight:4}}>
              {running.length > 0 && (
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--green)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>🔴 Live Now ({running.length})</div>
                  {running.map(c=><ContestItem key={c.id} c={c}/>)}
                </div>
              )}
              {sortedDates.filter(d=>d>=todayStr).map(dateKey=>{
                const contests = grouped[dateKey].filter(c=>c.status!=="RUNNING");
                if(!contests.length) return null;
                const d = new Date(dateKey+"T00:00:00");
                const isToday = dateKey===todayStr;
                const label = isToday ? "Today" : d.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"});
                return (
                  <div key={dateKey} style={{marginBottom:16}}>
                    <div style={{fontSize:11,fontWeight:700,color:isToday?"var(--yellow)":"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                      {isToday && "⚡"} {label}
                    </div>
                    {contests.map(c=><ContestItem key={c.id} c={c}/>)}
                  </div>
                );
              })}
              {filtered.length===0 && (
                <div style={{textAlign:"center",padding:"40px 20px",color:"var(--text2)"}}>
                  <div style={{fontSize:40,marginBottom:10}}>🏆</div>
                  No upcoming contests found.<br/>Try selecting different platforms.
                </div>
              )}
            </div>

            {/* RIGHT — calendar */}
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20,height:"fit-content"}}>
              {/* Month nav */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <button onClick={()=>setCalMonth(new Date(calYear,calMon-1,1))} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"6px 12px",cursor:"pointer",color:"var(--text2)",fontSize:14}}>‹</button>
                <div className="syne" style={{fontSize:18,fontWeight:800}}>
                  {calMonth.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}
                </div>
                <button onClick={()=>setCalMonth(new Date(calYear,calMon+1,1))} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"6px 12px",cursor:"pointer",color:"var(--text2)",fontSize:14}}>›</button>
              </div>
              {/* Day headers */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:8}}>
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>(
                  <div key={d} style={{textAlign:"center",fontSize:11,fontWeight:700,color:"var(--text3)",padding:"4px 0"}}>{d}</div>
                ))}
              </div>
              {/* Days grid */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
                {calDays.map((day,i)=>{
                  if(!day) return <div key={`e${i}`}/>;
                  const key=`${calYear}-${String(calMon+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                  const contests=contestsOnDay(day);
                  const isToday=key===todayStr;
                  const isSel=selDate===key;
                  const isPast=new Date(key)<new Date(todayStr);
                  return (
                    <div key={day} onClick={()=>contests.length?setSelDate(isSel?null:key):null}
                      style={{minHeight:68,border:`1px solid ${isSel?"var(--purple)":isToday?"var(--cyan)":"var(--border)"}`,borderRadius:10,padding:"6px 5px",cursor:contests.length?"pointer":"default",background:isSel?"rgba(124,77,255,.1)":isToday?"rgba(0,212,255,.06)":isPast?"var(--bg3)":"var(--bg)",opacity:isPast?0.6:1,transition:"all .15s"}}
                      onMouseEnter={e=>{if(contests.length)e.currentTarget.style.borderColor="var(--purple)";}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor=isSel?"var(--purple)":isToday?"var(--cyan)":"var(--border)";}}>
                      <div style={{fontSize:12,fontWeight:isToday?800:500,color:isToday?"var(--cyan)":isPast?"var(--text3)":"var(--text)",marginBottom:4,textAlign:"right"}}>{day}</div>
                      <div style={{display:"flex",flexDirection:"column",gap:2}}>
                        {contests.slice(0,3).map((c,ci)=>(
                          <div key={ci} style={{fontSize:9,fontWeight:600,padding:"1px 4px",borderRadius:3,background:`${pColor(c.platform)}20`,color:pColor(c.platform),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {PLATFORM_ICONS[c.platform]} {c.name.slice(0,14)}
                          </div>
                        ))}
                        {contests.length>3 && <div style={{fontSize:9,color:"var(--text3)",paddingLeft:4}}>+{contests.length-3} more</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Selected day panel */}
              {selDate && selDateContests.length > 0 && (
                <div style={{marginTop:16,borderTop:"1px solid var(--border)",paddingTop:14}}>
                  <div style={{fontSize:12,fontWeight:700,color:"var(--text2)",marginBottom:10}}>
                    {new Date(selDate+"T00:00:00").toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})} — {selDateContests.length} contest{selDateContests.length>1?"s":""}
                  </div>
                  <div style={{maxHeight:260,overflowY:"auto"}}>
                    {selDateContests.map(c=><ContestItem key={c.id} c={c} showDate={false}/>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : view === "list" ? (
          <div style={{maxWidth:800,margin:"0 auto"}}>
            {running.length > 0 && (
              <div style={{marginBottom:20,padding:16,background:"rgba(0,255,136,.06)",border:"1px solid rgba(0,255,136,.2)",borderRadius:14}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--green)",marginBottom:10}}>🔴 LIVE NOW</div>
                {running.map(c=><ContestItem key={c.id} c={c}/>)}
              </div>
            )}
            {sortedDates.map(dateKey=>{
              const contests=grouped[dateKey];
              const d=new Date(dateKey+"T00:00:00");
              const isToday=dateKey===todayStr;
              const label=isToday?"Today":d.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
              return (
                <div key={dateKey} style={{marginBottom:20}}>
                  <div style={{fontSize:12,fontWeight:700,color:isToday?"var(--yellow)":"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10,paddingBottom:6,borderBottom:"1px solid var(--border)"}}>
                    {isToday?"⚡ ":""}{label}
                  </div>
                  {contests.map(c=><ContestItem key={c.id} c={c}/>)}
                </div>
              );
            })}
          </div>
        ) : (
          /* Calendar only view */
          <div style={{maxWidth:900,margin:"0 auto"}}>
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:24}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                <button onClick={()=>setCalMonth(new Date(calYear,calMon-1,1))} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"8px 16px",cursor:"pointer",color:"var(--text2)"}}>‹ Prev</button>
                <div className="syne" style={{fontSize:22,fontWeight:800}}>{calMonth.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</div>
                <button onClick={()=>setCalMonth(new Date(calYear,calMon+1,1))} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"8px 16px",cursor:"pointer",color:"var(--text2)"}}>Next ›</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:8}}>
                {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map(d=>(
                  <div key={d} style={{textAlign:"center",fontSize:12,fontWeight:700,color:"var(--text3)",padding:"8px 0"}}>{d.slice(0,3)}</div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
                {calDays.map((day,i)=>{
                  if(!day) return <div key={`e${i}`} style={{minHeight:90}}/>;
                  const key=`${calYear}-${String(calMon+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                  const contests=contestsOnDay(day);
                  const isToday=key===todayStr;
                  const isSel=selDate===key;
                  const isPast=new Date(key)<new Date(todayStr);
                  return (
                    <div key={day} onClick={()=>setSelDate(isSel?null:key)}
                      style={{minHeight:90,border:`1px solid ${isSel?"var(--purple)":isToday?"var(--cyan)":"var(--border)"}`,borderRadius:10,padding:"8px 6px",cursor:contests.length?"pointer":"default",background:isSel?"rgba(124,77,255,.08)":isToday?"rgba(0,212,255,.05)":isPast?"var(--bg3)":"var(--bg)",opacity:isPast?0.6:1,transition:"all .15s"}}>
                      <div style={{fontSize:13,fontWeight:isToday?800:500,color:isToday?"var(--cyan)":isPast?"var(--text3)":"var(--text)",marginBottom:5,textAlign:"right"}}>{day}</div>
                      {contests.slice(0,3).map((c,ci)=>(
                        <div key={ci} style={{fontSize:10,fontWeight:600,padding:"2px 5px",borderRadius:4,background:`${pColor(c.platform)}18`,color:pColor(c.platform),marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {PLATFORM_ICONS[c.platform]} {c.name.slice(0,16)}
                        </div>
                      ))}
                      {contests.length>3 && <div style={{fontSize:9,color:"var(--text3)"}}>+{contests.length-3} more</div>}
                    </div>
                  );
                })}
              </div>
            </div>
            {selDate && selDateContests.length > 0 && (
              <div style={{marginTop:16,background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20}}>
                <div className="syne" style={{fontSize:16,fontWeight:800,marginBottom:14}}>
                  {new Date(selDate+"T00:00:00").toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                </div>
                {selDateContests.map(c=><ContestItem key={c.id} c={c}/>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const STUDENT_TOOLS = [
  {
    id: "dsa",
    icon: "🧠",
    title: "DSA Problem Explorer",
    desc: "17 topics · 22 patterns · Top 150 · Blind 75 · Company-wise sets · Progress tracker · AI explainer · Mock tests.",
    badge: "22 Patterns · Top 150 · Mock Test",
    badgeColor: "var(--cyan)",
    tags: ["22 Patterns", "Top 150", "Blind 75", "Mock Test", "Progress Tracker", "AI Explainer", "Roadmap"],
    stats: [{ label: "Topics", value: "17" }, { label: "Patterns", value: "22" }, { label: "Problems", value: "150+" }],
    color: "var(--cyan)",
    gradient: "linear-gradient(135deg,rgba(0,212,255,.15),rgba(0,212,255,.03))",
  },
  {
    id: "cp",
    icon: "🏆",
    title: "CP Contest Tracker",
    desc: "Live & upcoming contests from Codeforces, CodeChef, LeetCode, AtCoder — calendar view + countdown timers.",
    badge: "Live · Calendar · Multi-Platform",
    badgeColor: "var(--yellow)",
    tags: ["Codeforces","CodeChef","LeetCode","AtCoder","Calendar View","Countdown"],
    stats: [{ label: "Platforms", value: "7" }, { label: "View", value: "Split" }, { label: "Updates", value: "30min" }],
    color: "var(--yellow)",
    gradient: "linear-gradient(135deg,rgba(255,214,10,.15),rgba(255,214,10,.03))",
  },
  {
    id: "resume",
    icon: "📄",
    title: "AI Resume Analyzer",
    desc: "Upload PDF/DOCX → ATS score · JD match · skill gap roadmap · recruiter verdict · bullet rewrites · ATS-ready resume builder.",
    badge: "Rule-Based · RAG · AI-Powered",
    badgeColor: "var(--green)",
    tags: ["ATS Score", "JD Match", "Skill Roadmap", "Recruiter Verdict", "Bullet Rewrites", "Resume Builder", "Interview Prep"],
    stats: [{ label: "ATS Rules", value: "12" }, { label: "Result Tabs", value: "7" }, { label: "Pipeline", value: "3-Stage" }],
    color: "var(--green)",
    gradient: "linear-gradient(135deg,rgba(0,255,136,.15),rgba(0,255,136,.03))",
  },
];

const COMING_SOON = [
  { icon:"🏆", name:"Mock Interview AI",       desc:"AI interviewer by role — SDE/Data/DevOps. Multi-turn Q&A with scoring and feedback" },
  { icon:"🗺️", name:"Interview Prep Roadmap",  desc:"Personalised 30/60/90 day roadmap based on your target company and role" },
  { icon:"🧮", name:"Aptitude Solver",         desc:"Paste any aptitude question → step-by-step solution with concept explanation. For TCS/Infosys/Wipro drives" },
  { icon:"📋", name:"JD Decoder",              desc:"Paste any JD → AI breaks down what they actually want, red flags, real vs nice-to-have skills" },
  { icon:"🏗️", name:"Resume Template Builder", desc:"3 ATS-friendly templates. Fill the form → preview live → download PDF. Zero backend" },
  { icon:"💬", name:"Salary Negotiation Coach",desc:"Input offer + role + experience → word-for-word negotiation script for Bangalore market" },
  { icon:"🎯", name:"Placement Readiness Score",desc:"Combine DSA progress + resume score + mock interview results into one readiness %" },
];

const StudentToolsPage = ({ setPage }) => (
  <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
    {/* Header */}
    <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"48px 24px 40px"}}>
      <div style={{maxWidth:1200,margin:"0 auto"}}>
        <div className="sl">For Students · Free · No Login</div>
        <h1 className="syne" style={{fontSize:38,fontWeight:800,marginBottom:10}}>
          🛠️ Student <span className="gtext">Tools</span>
        </h1>
        <p style={{color:"var(--text2)",fontSize:15,maxWidth:560,lineHeight:1.7}}>
          AI-powered tools built for Indian CS students — DSA practice, resume analysis, placement prep. 100% free, no account needed.
        </p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:16}}>
          {["No Login","No Data Stored","100% Free","AI-Powered","Built for India"].map(f=>(
            <span key={f} style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"rgba(0,212,255,.08)",color:"var(--cyan)",border:"1px solid rgba(0,212,255,.2)",fontWeight:600}}>✓ {f}</span>
          ))}
        </div>
      </div>
    </div>

    <div style={{maxWidth:1200,margin:"0 auto",padding:"40px 24px"}}>
      {/* Live Tools */}
      <div style={{marginBottom:12}}>
        <div className="sl" style={{marginBottom:16}}>Live Tools</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(360px,1fr))",gap:20,marginBottom:40}}>
        {STUDENT_TOOLS.map(tool=>(
          <div key={tool.id} onClick={()=>setPage(tool.id)}
            className="hcard"
            style={{padding:28,cursor:"pointer",background:tool.gradient,border:`1px solid ${tool.color}25`,transition:"all .25s",position:"relative",overflow:"hidden"}}
            onMouseEnter={e=>{e.currentTarget.style.border=`1px solid ${tool.color}60`;e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 12px 40px ${tool.color}20`;}}
            onMouseLeave={e=>{e.currentTarget.style.border=`1px solid ${tool.color}25`;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}>
            {/* Glow blob */}
            <div style={{position:"absolute",top:-40,right:-40,width:130,height:130,borderRadius:"50%",background:tool.color,opacity:.07,filter:"blur(30px)",pointerEvents:"none"}}/>
            {/* Live badge */}
            <div style={{position:"absolute",top:16,right:16,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,background:"rgba(0,255,136,.15)",color:"var(--green)",border:"1px solid rgba(0,255,136,.3)"}}>LIVE</div>
            <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:16}}>
              <span style={{fontSize:38,lineHeight:1}}>{tool.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:5,background:`${tool.badgeColor}18`,color:tool.badgeColor,border:`1px solid ${tool.badgeColor}30`,display:"inline-block",marginBottom:6}}>{tool.badge}</span>
                <h2 className="syne" style={{fontSize:19,fontWeight:800,lineHeight:1.2}}>{tool.title}</h2>
              </div>
            </div>
            <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.65,marginBottom:16}}>{tool.desc}</p>
            {/* Stats */}
            <div style={{display:"flex",gap:20,marginBottom:14,padding:"12px 0",borderTop:`1px solid ${tool.color}15`,borderBottom:`1px solid ${tool.color}15`}}>
              {tool.stats.map(s=>(
                <div key={s.label}>
                  <div className="syne" style={{fontSize:20,fontWeight:900,color:tool.color}}>{s.value}</div>
                  <div style={{fontSize:10,color:"var(--text3)",marginTop:1}}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Tags */}
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:16}}>
              {tool.tags.map(t=>(
                <span key={t} style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:"var(--bg3)",color:"var(--text2)",border:"1px solid var(--border)"}}>{t}</span>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:11,color:"var(--text3)"}}>No login · No data stored</span>
              <span style={{fontSize:13,fontWeight:700,color:tool.color}}>Open Tool →</span>
            </div>
          </div>
        ))}
      </div>

      {/* Coming Soon */}
      <div style={{marginBottom:16}}>
        <div className="sl" style={{marginBottom:16}}>Coming Soon</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
        {COMING_SOON.map(tool=>(
          <div key={tool.name} style={{padding:20,border:"1px dashed var(--border)",borderRadius:14,background:"var(--card)",opacity:.65}}>
            <div style={{fontSize:28,marginBottom:10}}>{tool.icon}</div>
            <div className="syne" style={{fontSize:14,fontWeight:700,marginBottom:6,color:"var(--text)"}}>{tool.name}</div>
            <div style={{fontSize:12,color:"var(--text3)",lineHeight:1.5}}>{tool.desc}</div>
            <div style={{marginTop:10,fontSize:10,fontWeight:700,color:"var(--text3)",background:"var(--bg3)",padding:"3px 8px",borderRadius:4,display:"inline-block"}}>Coming Soon</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ── Resume Analyzer ───────────────────────────────────────────
const SCORE_COLOR = s => s >= 75 ? "var(--green)" : s >= 50 ? "var(--yellow)" : "var(--pink)";
const SCORE_BG    = s => s >= 75 ? "rgba(0,255,136,.08)" : s >= 50 ? "rgba(255,214,10,.08)" : "rgba(255,61,138,.08)";
const SCORE_BD    = s => s >= 75 ? "rgba(0,255,136,.25)" : s >= 50 ? "rgba(255,214,10,.25)" : "rgba(255,61,138,.25)";

const LS_RESUME_HIST = "resume_history_v1";

const ResumeAnalyzerPage = ({ setPage }) => {
  const [file,       setFile]      = React.useState(null);
  const [jd,         setJd]        = React.useState("");
  const [domain,     setDomain]    = React.useState("");
  const [drag,       setDrag]      = React.useState(false);
  const [loading,    setLoading]   = React.useState(false);
  const [result,     setResult]    = React.useState(null);
  const [error,      setError]     = React.useState("");
  const [copied,     setCopied]    = React.useState(false);
  const [tab,        setTab]       = React.useState("overview");
  const [showJD,     setShowJD]    = React.useState(false);
  const [history,    setHistory]   = React.useState(() => { try { return JSON.parse(localStorage.getItem(LS_RESUME_HIST)||"[]"); } catch { return []; } });
  const [compareMode,setCompareMode] = React.useState(false);
  // eslint-disable-next-line no-unused-vars
  const [compareResult,setCompareResult] = React.useState(null);
  const [printing,   setPrinting]  = React.useState(false);
  const fileRef = React.useRef();

  // ── ATS Keyword Injector ────────────────────────────────────
  const [jdKeywords, setJdKeywords] = React.useState("");
  // eslint-disable-next-line no-unused-vars
  const [showInjector, setShowInjector] = React.useState(false);
  const [injectorResult, setInjectorResult] = React.useState(null);

  const runInjector = () => {
    if(!jdKeywords.trim()||!result) return;
    const jdWords = jdKeywords.toLowerCase().match(/\b[a-z][a-z0-9+#.]{2,}\b/g)||[];
    const resumeText = [
      ...(result.skills_analysis?.found||[]),
      ...(result.section_rewrite?.experience||[]),
      ...(result.section_rewrite?.projects||[]),
      result.section_rewrite?.summary||""
    ].join(" ").toLowerCase();
    const missing = [...new Set(jdWords.filter(w=>w.length>3&&!resumeText.includes(w)))].slice(0,20);
    const present = [...new Set(jdWords.filter(w=>w.length>3&&resumeText.includes(w)))].slice(0,20);
    setInjectorResult({missing,present});
  };

  // ── Resume Checklist ────────────────────────────────────────
  const CHECKLIST_ITEMS = [
    "Email address is present",
    "Phone number (Indian format) is present",
    "LinkedIn URL is included",
    "GitHub URL is included",
    "Resume is 1-2 pages (not more)",
    "Single column layout (ATS-friendly)",
    "Skills section is clearly labeled",
    "Education section is present",
    "At least 2 projects with descriptions",
    "Bullet points start with action verbs",
    "Quantified achievements (numbers/percentages)",
    "No spelling mistakes in visible sections",
    "Consistent date formatting throughout",
    "Resume saved as PDF (not Word)",
    "File named as FirstName_LastName_Resume.pdf",
    "No photos or graphics (confuses ATS)",
    "No tables or columns (breaks ATS parsing)",
    "Contact info at the top",
    "Summary/Objective section present",
    "Certifications listed if any",
  ];
  const LS_CHECKLIST = "resume_checklist_v1";
  const [checklist, setChecklist] = React.useState(()=>{ try{return JSON.parse(localStorage.getItem(LS_CHECKLIST)||"{}");} catch{return {};} });
  const toggleCheck = (i) => {
    const c={...checklist,[i]:!checklist[i]};
    setChecklist(c);
    try{localStorage.setItem(LS_CHECKLIST,JSON.stringify(c));}catch(_){}
  };
  const checkScore = Math.round((Object.values(checklist).filter(Boolean).length/CHECKLIST_ITEMS.length)*100);

  // ── Cover Letter Generator ─────────────────────────────────
  const [clJD, setClJD] = React.useState("");
  const [clTone, setClTone] = React.useState("Professional");
  const [clLetter, setClLetter] = React.useState("");
  const [clLoading, setClLoading] = React.useState(false);
  const [clCopied, setClCopied] = React.useState(false);

  const generateCoverLetter = async () => {
    if(!result||!clJD.trim()) return;
    setClLoading(true); setClLetter("");
    try {
      const fd=new FormData();
      fd.append("resume",file||new Blob([""],{type:"text/plain"}));
      fd.append("jobDescription",clJD);
      fd.append("targetDomain","cover_letter");
      fd.append("tone",clTone);
      const r=await fetch(`${API_BASE}/resume/cover-letter`,{method:"POST",body:fd});
      const d=await r.json();
      setClLetter(d.letter||d.tip||"Could not generate cover letter.");
    } catch { setClLetter("Network error — try again."); }
    setClLoading(false);
  };

  // ── LinkedIn Headline Generator ────────────────────────────
  const [liHeadlines, setLiHeadlines] = React.useState([]);
  const [liLoading, setLiLoading] = React.useState(false);

  const generateHeadlines = async () => {
    if(!result) return;
    setLiLoading(true); setLiHeadlines([]);
    const skills=(result.skills_analysis?.found||[]).slice(0,6).join(", ");
    const roles=(result.domain_insights?.recommended_roles||[]).join(", ");
    const type=result.summary?.resume_type||"";
    try {
      const r=await fetch(`${API_BASE}/dsa/topics/explain/tip`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({problem:`Generate 5 LinkedIn headline variations for a ${type} software engineer with skills: ${skills}. Target roles: ${roles}. Return only 5 numbered headlines, each under 220 characters. No extra explanation.`})
      });
      const d=await r.json();
      const lines=(d.tip||"").split("\n").filter(l=>l.trim()&&/^\d/.test(l.trim())).slice(0,5);
      setLiHeadlines(lines.length?lines:["Could not generate — try again."]);
    } catch { setLiHeadlines(["Network error — try again."]); }
    setLiLoading(false);
  };

  // ── Salary Estimator ────────────────────────────────────────
  const SALARY_DATA = {
    "Full Stack Developer":    {"0-1":"3-6L","1-3":"6-12L","3-5":"12-20L","5+":"20-35L"},
    "Frontend Developer":      {"0-1":"3-5L","1-3":"5-10L","3-5":"10-18L","5+":"18-30L"},
    "Backend Developer":       {"0-1":"3-6L","1-3":"6-12L","3-5":"12-22L","5+":"20-40L"},
    "ML/AI Engineer":          {"0-1":"4-8L","1-3":"8-18L","3-5":"18-35L","5+":"30-60L"},
    "Data Analyst / Data Scientist":{"0-1":"3-6L","1-3":"6-14L","3-5":"14-25L","5+":"22-45L"},
    "DevOps / Cloud Engineer": {"0-1":"4-7L","1-3":"7-15L","3-5":"15-28L","5+":"25-50L"},
    "Mobile App Developer":    {"0-1":"3-6L","1-3":"6-12L","3-5":"12-22L","5+":"20-38L"},
    "SDE / Software Developer":{"0-1":"3-6L","1-3":"6-14L","3-5":"14-25L","5+":"22-45L"},
    "Security Engineer":       {"0-1":"4-7L","1-3":"7-16L","3-5":"16-30L","5+":"28-55L"},
  };
  const [salaryRole, setSalaryRole] = React.useState("");
  const [salaryExp, setSalaryExp] = React.useState("0-1");
  const salaryRange = salaryRole && SALARY_DATA[salaryRole] ? SALARY_DATA[salaryRole][salaryExp] : null;

  const saveHistory = (res, fileName) => {
    const entry = {
      date:         new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),
      fileName:     fileName || "resume",
      overall:      res.summary?.overall_score || 0,
      ats:          res.summary?.ats_score || 0,
      shortlist:    res.recruiter_decision?.shortlist || "Maybe",
      resume_type:  res.summary?.resume_type || "",
    };
    const h = [entry, ...history].slice(0, 5); // keep last 5
    setHistory(h);
    try { localStorage.setItem(LS_RESUME_HIST, JSON.stringify(h)); } catch(_) {}
  };

  const handlePrint = () => {
    setPrinting(true);
    setTimeout(() => { window.print(); setPrinting(false); }, 200);
  };

  const DOMAINS = ["","Full Stack","Frontend","Backend","AI/ML","Data Science","DevOps/Cloud","Mobile","Cybersecurity","Blockchain"];

  const pickFile = f => {
    if (!f) return;
    const ext = f.name.toLowerCase();
    const ok = ["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","text/plain"].includes(f.type)
      || ext.endsWith(".pdf") || ext.endsWith(".docx") || ext.endsWith(".doc") || ext.endsWith(".txt");
    if (!ok) { setError("Only PDF, DOCX, DOC, or TXT files are supported."); return; }
    setFile(f); setError("");
  };

  const onDrop = e => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files[0]); };

  const handleAnalyze = async () => {
    if (!file) { setError("Please select a resume file first."); return; }
    setError(""); setResult(null); setLoading(true);
    try {
      const fd = new FormData();
      fd.append("resume", file);
      if (jd.trim())     fd.append("jobDescription", jd.trim());
      if (domain.trim()) fd.append("targetDomain", domain.trim());
      const res  = await fetch(`${API_BASE}/resume/analyze`, { method:"POST", body:fd });
      const data = await res.json();
      if (res.status === 429) {
        setError("⏳ " + (data.error || "AI is busy — please wait 30 seconds and try again."));
      } else if (!res.ok) {
        setError(data.error || "Analysis failed. Please try again.");
      } else {
        setResult(data); setTab("overview"); window.scrollTo(0,0);
        saveHistory(data, file?.name);
      }
    } catch { setError("Network error. Check your connection and try again."); }
    setLoading(false);
  };

  const handleCopy = () => {
    if (!result) return;
    const r = result;
    const lines = [
      "RESUME ANALYSIS — HackIndia",
      `Overall: ${r.summary?.overall_score}/100  ATS: ${r.summary?.ats_score}/100${r.summary?.match_score!=null?`  JD Match: ${r.summary.match_score}/100`:""}`,
      `Type: ${r.summary?.resume_type}  Shortlist: ${r.recruiter_decision?.shortlist}`,
      `Verdict: ${r.recruiter_decision?.reason}`,"",
      "PRIORITY ACTION PLAN",...(r.priority_action_plan||[]).map((x,i)=>`${i+1}. ${x}`),"",
      "SKILLS FOUND",(r.skills_analysis?.found||[]).join(", "),"",
      "SKILLS MISSING",(r.skills_analysis?.missing||[]).join(", "),"",
      "ATS ISSUES",...(r.ats_analysis?.format_issues||[]),...(r.ats_analysis?.keyword_issues||[]),"",
      `Pipeline: Rule-based ✓  RAG ✓  LLM ✓  Self-validated: ${r.validation?.is_safe?"✓ Safe":"⚠ Issues found"}`,
      "Generated by HackIndia Resume Analyzer",
    ].join("\n");
    navigator.clipboard.writeText(lines).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); });
  };

  const shortlistColor = s => s==="Yes"?"var(--green)":s==="No"?"var(--pink)":"var(--yellow)";
  const shortlistBg    = s => s==="Yes"?"rgba(0,255,136,.12)":s==="No"?"rgba(255,61,138,.1)":"rgba(255,214,10,.1)";
  const readinessColor = r => r==="High"?"var(--green)":r==="Medium"?"var(--yellow)":"var(--pink)";
  const prioColor      = p => p==="High"?"var(--pink)":p==="Medium"?"var(--yellow)":"var(--cyan)";
  const demandColor    = d => d==="Very High"?"var(--green)":d==="High"?"var(--cyan)":"var(--yellow)";
  const fileIcon       = n => { const e=(n||"").toLowerCase(); return e.endsWith(".pdf")?"📄":e.endsWith(".docx")||e.endsWith(".doc")?"📝":"📃"; };
  const fmtSize        = b => b>1024*1024?`${(b/1024/1024).toFixed(1)} MB`:`${Math.round(b/1024)} KB`;

  const TabBtn = ({id,label}) => (
    <button onClick={()=>setTab(id)} style={{padding:"10px 16px",background:"transparent",border:"none",
      borderBottom:`3px solid ${tab===id?"var(--green)":"transparent"}`,
      color:tab===id?"var(--green)":"var(--text2)",fontWeight:tab===id?700:500,
      fontSize:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>{label}</button>
  );

  const Card = ({children,style={}}) => (
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:24,...style}}>{children}</div>
  );

  const SLabel = ({text}) => (
    <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:14}}>{text}</div>
  );

  const NumItem = ({text,i,bg,border,nc}) => (
    <div style={{display:"flex",gap:12,marginBottom:10,padding:"12px 14px",background:bg,border:`1px solid ${border}`,borderRadius:10,alignItems:"flex-start"}}>
      <div style={{minWidth:22,height:22,borderRadius:"50%",background:nc+"33",color:nc,fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>{i+1}</div>
      <span style={{fontSize:13,color:"var(--text)",lineHeight:1.65}}>{text}</span>
    </div>
  );

  // ── INPUT SCREEN ──────────────────────────────────────────────
  if (!result) return (
    <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
      <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"36px 24px 32px"}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <button onClick={()=>setPage("tools")} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"5px 12px",color:"var(--text2)",fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",marginBottom:16}}>← Tools</button>
          <div className="sl">Rule-Based · RAG · AI-Powered · Self-Validated</div>
          <h1 className="syne" style={{fontSize:32,fontWeight:800,marginBottom:8}}>📄 Resume <span className="gtext">Analyzer</span></h1>
          <p style={{color:"var(--text2)",fontSize:14,lineHeight:1.7,maxWidth:560,marginBottom:16}}>
            Upload your resume. Get ATS analysis, JD match scoring, skill gap roadmap, recruiter verdict, bullet rewrites & ATS-ready resume — powered by a 3-stage AI pipeline.
          </p>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {["✅ ATS Score","🎯 JD Match","🤖 Recruiter Verdict","💡 Bullet Rewrites","🗺️ Skill Roadmap","📋 Resume Builder","⚡ Interview Prep","🛡️ Self-Validated"].map(f=>(
              <span key={f} style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"rgba(0,255,136,.1)",color:"var(--green)",border:"1px solid rgba(0,255,136,.2)",fontWeight:600}}>{f}</span>
            ))}
          </div>
          {/* Score History */}
          {history.length > 0 && (
            <div style={{marginTop:20,background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"16px 20px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:12}}>📈 Your Score History (last {history.length})</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {history.map((h,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 12px",background:"var(--bg2)",borderRadius:8}}>
                    <div style={{fontSize:11,color:"var(--text3)",minWidth:80}}>{h.date}</div>
                    <div style={{fontSize:12,color:"var(--text2)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.fileName}</div>
                    <div style={{display:"flex",gap:8,flexShrink:0}}>
                      <span style={{fontSize:12,fontWeight:700,color:h.overall>=75?"var(--green)":h.overall>=50?"var(--yellow)":"var(--pink)"}}>Overall: {h.overall}</span>
                      <span style={{fontSize:12,fontWeight:700,color:h.ats>=75?"var(--green)":h.ats>=50?"var(--yellow)":"var(--pink)"}}>ATS: {h.ats}</span>
                      <span style={{fontSize:11,padding:"1px 7px",borderRadius:4,background:h.shortlist==="Yes"?"rgba(0,255,136,.15)":h.shortlist==="No"?"rgba(255,61,138,.1)":"rgba(255,214,10,.1)",color:h.shortlist==="Yes"?"var(--green)":h.shortlist==="No"?"var(--pink)":"var(--yellow)",fontWeight:700}}>{h.shortlist}</span>
                    </div>
                  </div>
                ))}
              </div>
              {history.length >= 2 && (
                <div style={{marginTop:10,display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,height:4,background:"var(--bg3)",borderRadius:2,overflow:"hidden",position:"relative"}}>
                    {history.slice(0,5).reverse().map((h,i,arr)=>(
                      <div key={i} style={{position:"absolute",bottom:0,left:`${(i/(arr.length-1))*100}%`,transform:"translateX(-50%)",width:8,height:8,borderRadius:"50%",background:h.overall>=75?"var(--green)":h.overall>=50?"var(--yellow)":"var(--pink)",marginTop:-2}}/>
                    ))}
                  </div>
                  <span style={{fontSize:11,color:history[0].overall>history[history.length-1].overall?"var(--green)":history[0].overall<history[history.length-1].overall?"var(--pink)":"var(--text3)",fontWeight:700,flexShrink:0}}>
                    {history[0].overall>history[history.length-1].overall?"↑ Improving":"↓ Work needed"}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{maxWidth:800,margin:"28px auto",padding:"0 24px"}}>
        {/* Drop zone */}
        <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={onDrop}
          onClick={()=>!file&&fileRef.current.click()}
          style={{background:drag?"rgba(0,255,136,.06)":"var(--card)",border:`2px dashed ${drag?"var(--green)":file?"var(--green)":"var(--border2)"}`,
            borderRadius:16,padding:"40px 24px",textAlign:"center",cursor:file?"default":"pointer",transition:"all .2s",marginBottom:16}}>
          {!file?(<>
            <div style={{fontSize:48,marginBottom:10}}>📂</div>
            <div className="syne" style={{fontSize:17,fontWeight:800,marginBottom:6}}>{drag?"Drop it here!":"Drag & drop your resume"}</div>
            <div style={{color:"var(--text2)",fontSize:13,marginBottom:16}}>or click to browse files</div>
            <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:10}}>
              {["PDF","DOCX","DOC","TXT"].map(f=><span key={f} style={{padding:"4px 12px",borderRadius:8,background:"var(--bg3)",border:"1px solid var(--border)",fontSize:12,fontWeight:700,color:"var(--text2)"}}>{f}</span>)}
            </div>
            <div style={{fontSize:12,color:"var(--text3)"}}>No size limit · File never stored</div>
          </>):(
            <div style={{display:"flex",alignItems:"center",gap:14,justifyContent:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:40}}>{fileIcon(file.name)}</span>
              <div style={{textAlign:"left"}}>
                <div className="syne" style={{fontSize:15,fontWeight:800,color:"var(--green)",marginBottom:3}}>{file.name}</div>
                <div style={{fontSize:12,color:"var(--text2)"}}>{fmtSize(file.size)} · {file.name.split(".").pop().toUpperCase()}</div>
              </div>
              <button onClick={e=>{e.stopPropagation();setFile(null);setError("");}}
                style={{padding:"5px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg3)",color:"var(--text2)",fontSize:12,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Remove ✕</button>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{display:"none"}} onChange={e=>pickFile(e.target.files[0])}/>

        {/* JD + Domain (collapsible) */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:20,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setShowJD(v=>!v)}>
            <div>
              <span className="syne" style={{fontSize:14,fontWeight:700}}>🎯 Add Job Description</span>
              <span style={{fontSize:12,color:"var(--text3)",marginLeft:10}}>Optional — unlocks JD Match Score</span>
            </div>
            <span style={{color:"var(--cyan)",fontSize:13,transform:showJD?"rotate(180deg)":"none",display:"inline-block",transition:"transform .2s"}}>▼</span>
          </div>
          {showJD && (
            <div style={{marginTop:16,display:"grid",gap:12}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Job Description</div>
                <textarea value={jd} onChange={e=>setJd(e.target.value)}
                  placeholder="Paste the job description here — role, requirements, skills, responsibilities…"
                  style={{width:"100%",minHeight:120,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:10,padding:12,fontSize:13,fontFamily:"'DM Sans',sans-serif",color:"var(--text)",resize:"vertical",outline:"none",boxSizing:"border-box"}}
                  onFocus={e=>e.target.style.borderColor="var(--cyan)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Target Domain</div>
                <select value={domain} onChange={e=>setDomain(e.target.value)} className="input" style={{padding:"9px 36px 9px 12px",fontSize:13,width:"100%"}}>
                  {DOMAINS.map(d=><option key={d} value={d}>{d||"Select domain (optional)"}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {error && <div style={{background:"rgba(255,61,138,.08)",border:"1px solid rgba(255,61,138,.25)",borderRadius:10,padding:"11px 16px",color:"var(--pink)",fontSize:13,marginBottom:14}}>⚠️ {error}</div>}

        <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:24}}>
          <button className="btn-p" onClick={handleAnalyze} disabled={loading||!file}
            style={{padding:"13px 32px",fontSize:15,opacity:(loading||!file)?.6:1,background:"linear-gradient(135deg,var(--green),#00b865)"}}>
            {loading?"⏳ Analyzing…":"🔍 Analyze Resume"}
          </button>
          {!file && <button className="btn-g" onClick={()=>fileRef.current.click()} style={{padding:"13px 22px",fontSize:14}}>📂 Browse Files</button>}
          {loading && <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"var(--text2)"}}><div className="bt-typing"><span/><span/><span/></div> 3-stage AI pipeline running…</div>}
        </div>

        {/* Pipeline info cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:10}}>
          {[
            ["⚡","Rule-Based","12 ATS checks, 120+ skills, instant"],
            ["🗂️","RAG Retrieval","10 role profiles, gap roadmap, domain paths"],
            ["🤖","AI Analysis","Rewrites, verdict, interview prep"],
            ["🛡️","Self-Validation","LLM checks its own output for hallucinations"],
          ].map(([ic,t,d])=>(
            <div key={t} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"14px",display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:20,flexShrink:0}}>{ic}</span>
              <div>
                <div className="syne" style={{fontSize:12,fontWeight:700,marginBottom:2}}>{t}</div>
                <div style={{fontSize:11,color:"var(--text2)",lineHeight:1.5}}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── RESULTS ────────────────────────────────────────────────────
  const S  = result.summary || {};
  const GA = result.gaps_analysis || {};
  const SK = result.skills_analysis || {};
  const JM = result.job_matching || {};
  const AT = result.ats_analysis || {};
  const BO = result.bullet_optimization || [];
  const SR = result.section_rewrite || {};
  const DI = result.domain_insights || {};
  const IP = result.interview_prep || {};
  const RD = result.recruiter_decision || {};
  const AP = result.priority_action_plan || [];
  const RB = result.resume_builder || {};
  const VL = result.validation || {};
  // eslint-disable-next-line no-unused-vars
  const PL = result._pipeline || {};

  const TABS = [
    ["overview","📊 Overview"],
    ["gaps","🔍 Gaps & ATS"],
    ["skills","🔧 Skills"],
    ...(S.match_score!=null?[["jd","🎯 JD Match"]]:[]),
    ["rewrite","✏️ Rewrites"],
    ["builder","📋 Builder"],
    ["interview","⚡ Interview"],
    ["tools","🛠️ More Tools"],
  ];

  return (
    <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
      {/* Results header */}
      <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"24px 24px 0"}}>
        <div style={{maxWidth:1060,margin:"0 auto"}}>

          {/* Action buttons */}
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            <button onClick={()=>setPage("tools")} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"5px 12px",color:"var(--text2)",fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>← Tools</button>
            <button onClick={()=>{setResult(null);setFile(null);setError("");setJd("");setDomain("");}} style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"5px 12px",color:"var(--text2)",fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>🔄 New Analysis</button>
            <button onClick={handleCopy} style={{background:copied?"rgba(0,255,136,.15)":"none",border:`1px solid ${copied?"var(--green)":"var(--border)"}`,borderRadius:8,padding:"5px 14px",color:copied?"var(--green)":"var(--text2)",fontSize:13,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all .2s"}}>{copied?"✅ Copied!":"📋 Copy Report"}</button>
            {/* Pipeline status badges */}
            <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["⚡ Rule","var(--cyan)"],["🗂️ RAG","var(--purple)"],["🤖 LLM","var(--green)"],
                [VL.is_safe===false?"⚠️ Issues":"🛡️ Safe",VL.is_safe===false?"var(--pink)":"var(--green)"]
              ].map(([l,c])=>(
                <span key={l} style={{fontSize:10,padding:"3px 8px",borderRadius:6,background:`${c}15`,color:c,border:`1px solid ${c}30`,fontWeight:700}}>{l}</span>
              ))}
            </div>
          </div>

          <div className="sl">Analysis Complete · 3-Stage Pipeline</div>

          {/* Score + verdict row */}
          <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-start",marginBottom:16,justifyContent:"space-between"}}>
            <div>
              <h1 className="syne" style={{fontSize:24,fontWeight:800,marginBottom:10}}>📄 Resume <span className="gtext">Analysis</span></h1>
              <div style={{display:"inline-flex",alignItems:"center",gap:10,padding:"10px 18px",borderRadius:12,background:shortlistBg(RD.shortlist),border:`1px solid ${shortlistColor(RD.shortlist)}40`,marginBottom:10}}>
                <span className="syne" style={{fontSize:15,fontWeight:800,color:shortlistColor(RD.shortlist)}}>
                  {RD.shortlist==="Yes"?"✅ Shortlisted":RD.shortlist==="No"?"❌ Not Shortlisted":"🤔 Maybe Shortlisted"}
                </span>
              </div>
              {RD.reason && <div style={{fontSize:13,color:"var(--text2)",fontStyle:"italic",maxWidth:500,lineHeight:1.5}}>"{RD.reason}"</div>}
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",flexShrink:0}}>
              {[["Overall",S.overall_score],["ATS",S.ats_score],...(S.match_score!=null?[["JD Match",S.match_score]]:[])].map(([l,v])=>(
                <div key={l} style={{textAlign:"center",background:"var(--card)",border:`1px solid ${SCORE_BD(v)}`,borderRadius:12,padding:"12px 18px",minWidth:80}}>
                  <div className="syne" style={{fontSize:36,fontWeight:900,color:SCORE_COLOR(v),lineHeight:1}}>{v??"—"}</div>
                  <div style={{fontSize:10,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginTop:4}}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Validation warning banner — only shown if issues found */}
          {VL.is_safe===false && VL.issues?.length>0 && (
            <div style={{background:"rgba(255,61,138,.06)",border:"1px solid rgba(255,61,138,.3)",borderRadius:10,padding:"10px 16px",marginBottom:12,display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,flexShrink:0}}>⚠️</span>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:"var(--pink)",marginBottom:4}}>Self-validation flagged {VL.issues.length} issue{VL.issues.length>1?"s":""} — review carefully</div>
                {VL.issues.map((iss,i)=><div key={i} style={{fontSize:12,color:"var(--text2)",lineHeight:1.5}}>• {iss}</div>)}
              </div>
            </div>
          )}

          {/* Priority action strip */}
          {AP.length>0 && (
            <div style={{background:"rgba(255,214,10,.06)",border:"1px solid rgba(255,214,10,.2)",borderRadius:10,padding:"12px 16px",marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--yellow)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>⚡ Top Priority Actions</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {AP.slice(0,3).map((a,i)=>(
                  <div key={i} style={{fontSize:13,color:"var(--text)",display:"flex",gap:8,alignItems:"flex-start"}}>
                    <span style={{color:"var(--yellow)",fontWeight:700,flexShrink:0}}>{i+1}.</span>{a}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{display:"flex",gap:0,overflowX:"auto"}}>
            {TABS.map(([id,lbl])=><TabBtn key={id} id={id} label={lbl}/>)}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div style={{maxWidth:1060,margin:"0 auto",padding:"24px"}}>
        <div style={{display:"grid",gap:16}}>

        {/* ── OVERVIEW ── */}
        {tab==="overview" && (<>
          {/* Resume profile + ATS detection */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Card>
              <SLabel text="Resume Profile"/>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
                <span style={{padding:"6px 16px",borderRadius:20,background:"rgba(0,212,255,.1)",color:"var(--cyan)",border:"1px solid rgba(0,212,255,.2)",fontSize:13,fontWeight:700}}>{S.resume_type||"—"}</span>
                {DI.readiness && <span style={{padding:"6px 16px",borderRadius:20,background:`${readinessColor(DI.readiness)}18`,color:readinessColor(DI.readiness),border:`1px solid ${readinessColor(DI.readiness)}35`,fontSize:13,fontWeight:700}}>Readiness: {DI.readiness}</span>}
              </div>
              {/* Pipeline status row */}
              <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Pipeline Used</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[["⚡ Rule-Based","var(--cyan)","Instant ATS + skill detection"],
                  ["🗂️ RAG","var(--purple)","Role matching + gap roadmap"],
                  ["🤖 AI Model","var(--green)","Rewrites + recruiter verdict"],
                  [VL.is_safe===false?"⚠️ Validation Issues":"🛡️ Self-Validated",VL.is_safe===false?"var(--pink)":"var(--green)",VL.is_safe===false?"Issues found":"Output verified"]
                ].map(([l,c,d])=>(
                  <div key={l} style={{padding:"6px 12px",borderRadius:8,background:`${c}10`,border:`1px solid ${c}25`,display:"flex",flexDirection:"column",gap:2}}>
                    <span style={{fontSize:11,fontWeight:700,color:c}}>{l}</span>
                    <span style={{fontSize:10,color:"var(--text3)"}}>{d}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <SLabel text="ATS Section Detection"/>
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
                <span className="syne" style={{fontSize:32,fontWeight:900,color:AT.section_detection==="Good"?"var(--green)":AT.section_detection==="Medium"?"var(--yellow)":"var(--pink)"}}>{AT.section_detection||"—"}</span>
                <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.6}}>
                  {AT.section_detection==="Good"?"ATS can parse all your sections successfully"
                  :AT.section_detection==="Medium"?"Some sections may be missed by ATS"
                  :"ATS will struggle to parse your resume"}
                </div>
              </div>
            </Card>
          </div>

          {/* Full priority action plan */}
          <Card>
            <SLabel text="⚡ Priority Action Plan — Top 5 Fixes"/>
            {AP.map((a,i)=><NumItem key={i} text={a} i={i} bg="rgba(255,214,10,.05)" border="rgba(255,214,10,.18)" nc="var(--yellow)"/>)}
          </Card>

          {/* Role scores from RAG */}
          {DI.role_scores?.length>0 && (
            <Card>
              <SLabel text="🎯 Role Match Scores (RAG Retrieved)"/>
              <div style={{display:"grid",gap:10}}>
                {DI.role_scores.map((r,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12}}>
                    <div style={{minWidth:44,height:44,borderRadius:10,background:SCORE_BG(r.score),border:`1px solid ${SCORE_BD(r.score)}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span className="syne" style={{fontSize:16,fontWeight:900,color:SCORE_COLOR(r.score)}}>{r.score}%</span>
                    </div>
                    <div style={{flex:1}}>
                      <div className="syne" style={{fontSize:14,fontWeight:700,marginBottom:4}}>{r.title}</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:11,color:"var(--text2)"}}>💰 {r.salary}</span>
                        <span style={{fontSize:11,fontWeight:600,color:demandColor(r.demand)}}>📈 {r.demand} demand</span>
                      </div>
                    </div>
                    <div style={{height:6,width:80,background:"var(--bg3)",borderRadius:3,overflow:"hidden",flexShrink:0}}>
                      <div style={{height:"100%",width:`${r.score}%`,background:SCORE_COLOR(r.score),borderRadius:3}}/>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Recommended roles + top skills */}
          {DI.recommended_roles?.length>0 && (
            <Card>
              <SLabel text="🎯 Recommended Roles"/>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
                {DI.recommended_roles.map(r=><span key={r} style={{padding:"7px 16px",borderRadius:20,background:"rgba(124,77,255,.12)",color:"var(--purple)",border:"1px solid rgba(124,77,255,.25)",fontSize:13,fontWeight:700}}>{r}</span>)}
              </div>
              {DI.top_skills?.length>0 && (<>
                <SLabel text="Top Skills for This Domain"/>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {DI.top_skills.map(s=><span key={s} style={{padding:"4px 12px",borderRadius:20,background:"rgba(0,212,255,.08)",color:"var(--cyan)",border:"1px solid rgba(0,212,255,.2)",fontSize:12,fontWeight:600}}>{s}</span>)}
                </div>
              </>)}
            </Card>
          )}

          {/* Domain roadmap */}
          {DI.domain_roadmap?.length>0 && (
            <Card>
              <SLabel text="🗺️ Domain Learning Roadmap (RAG Retrieved)"/>
              <div style={{display:"grid",gap:8}}>
                {DI.domain_roadmap.map((step,i)=>(
                  <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"10px 12px",background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10}}>
                    <div style={{minWidth:24,height:24,borderRadius:"50%",background:"rgba(124,77,255,.2)",color:"var(--purple)",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div>
                    <span style={{fontSize:13,color:"var(--text)",lineHeight:1.6}}>{step}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Validation status card */}
          <Card style={{border:`1px solid ${VL.is_safe===false?"rgba(255,61,138,.3)":"rgba(0,255,136,.2)"}`}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:28}}>{VL.is_safe===false?"⚠️":"🛡️"}</span>
              <div>
                <div className="syne" style={{fontSize:14,fontWeight:800,color:VL.is_safe===false?"var(--pink)":"var(--green)",marginBottom:4}}>
                  {VL.is_safe===false?"Self-Validation: Issues Found":"Self-Validation: Output is Safe"}
                </div>
                <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.5}}>
                  {VL.is_safe===false
                    ?"The LLM flagged potential issues in its own output — review the analysis carefully."
                    :"The LLM verified its own output contains no hallucinated skills, tools, or fabricated claims."}
                </div>
                {VL.issues?.length>0 && (
                  <div style={{marginTop:8}}>
                    {VL.issues.map((iss,i)=><div key={i} style={{fontSize:12,color:"var(--pink)",marginTop:3}}>• {iss}</div>)}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </>)}

        {/* ── GAPS & ATS ── */}
        {tab==="gaps" && (<>
          {GA.critical_gaps?.length>0 && (
            <Card>
              <SLabel text="🚨 Critical Gaps"/>
              {GA.critical_gaps.map((g,i)=><NumItem key={i} text={g} i={i} bg="rgba(255,61,138,.05)" border="rgba(255,61,138,.2)" nc="var(--pink)"/>)}
            </Card>
          )}
          {GA.weak_sections?.length>0 && (
            <Card>
              <SLabel text="⚠️ Weak Sections"/>
              {GA.weak_sections.map((ws,i)=>(
                <div key={i} style={{background:"rgba(255,214,10,.04)",border:"1px solid rgba(255,214,10,.15)",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
                  <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,background:"rgba(255,214,10,.15)",color:"var(--yellow)",marginBottom:8,display:"inline-block"}}>{ws.section}</span>
                  <div style={{fontSize:13,color:"var(--text2)",marginBottom:6}}>❌ {ws.issue}</div>
                  <div style={{fontSize:13,color:"var(--green)"}}>✅ Fix: {ws.fix}</div>
                </div>
              ))}
            </Card>
          )}
          <Card>
            <SLabel text="🔧 ATS Format Issues"/>
            {AT.format_issues?.length>0
              ?AT.format_issues.map((f,i)=><NumItem key={i} text={f} i={i} bg="rgba(255,61,138,.05)" border="rgba(255,61,138,.18)" nc="var(--pink)"/>)
              :<div style={{fontSize:13,color:"var(--green)"}}>✅ No format issues detected</div>}
          </Card>
          <Card>
            <SLabel text="🔑 ATS Keyword Issues"/>
            {AT.keyword_issues?.length>0
              ?AT.keyword_issues.map((f,i)=><NumItem key={i} text={f} i={i} bg="rgba(255,107,53,.05)" border="rgba(255,107,53,.2)" nc="var(--orange)"/>)
              :<div style={{fontSize:13,color:"var(--green)"}}>✅ Keywords look good</div>}
          </Card>
        </>)}

        {/* ── SKILLS ── */}
        {tab==="skills" && (<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <SLabel text="✅ Skills Found"/>
                <span style={{fontSize:11,color:"var(--green)",fontWeight:700,background:"rgba(0,255,136,.1)",padding:"2px 8px",borderRadius:6}}>{SK.found?.length||0}</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {SK.found?.map(s=><span key={s} style={{padding:"4px 12px",borderRadius:20,background:"rgba(0,255,136,.1)",color:"var(--green)",border:"1px solid rgba(0,255,136,.25)",fontSize:12,fontWeight:600}}>✓ {s}</span>)}
              </div>
            </Card>
            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <SLabel text="❌ Skills Missing"/>
                <span style={{fontSize:11,color:"var(--pink)",fontWeight:700,background:"rgba(255,61,138,.1)",padding:"2px 8px",borderRadius:6}}>{SK.missing?.length||0}</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {SK.missing?.map(s=><span key={s} style={{padding:"4px 12px",borderRadius:20,background:"rgba(255,61,138,.08)",color:"var(--pink)",border:"1px solid rgba(255,61,138,.2)",fontSize:12,fontWeight:600}}>+ {s}</span>)}
              </div>
            </Card>
          </div>
          {SK.domain_required?.length>0 && (
            <Card>
              <SLabel text="Domain Required Skills"/>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {SK.domain_required.map(s=><span key={s} style={{padding:"4px 12px",borderRadius:20,background:"rgba(124,77,255,.1)",color:"var(--purple)",border:"1px solid rgba(124,77,255,.2)",fontSize:12,fontWeight:600}}>{s}</span>)}
              </div>
            </Card>
          )}
          {SK.gap_roadmap?.length>0 && (
            <Card>
              <SLabel text="🗺️ Skill Gap Roadmap"/>
              {SK.gap_roadmap.map((g,i)=>(
                <div key={i} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                    <span className="syne" style={{fontSize:14,fontWeight:700}}>{g.skill}</span>
                    <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:4,background:`${prioColor(g.priority)}18`,color:prioColor(g.priority),border:`1px solid ${prioColor(g.priority)}30`}}>{g.priority}</span>
                  </div>
                  <div style={{fontSize:12,color:"var(--text2)",marginBottom:8}}>{g.reason}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {g.learning_steps?.map((s,j)=>(
                      <span key={j} style={{fontSize:11,padding:"3px 10px",borderRadius:6,background:"var(--bg3)",border:"1px solid var(--border)",color:"var(--text2)"}}>{j+1}. {s}</span>
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>)}

        {/* ── JD MATCH ── */}
        {tab==="jd" && S.match_score!=null && (<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Card>
              <SLabel text="✅ Matching Skills"/>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {JM.matching_skills?.map(s=><span key={s} style={{padding:"4px 12px",borderRadius:20,background:"rgba(0,255,136,.1)",color:"var(--green)",border:"1px solid rgba(0,255,136,.25)",fontSize:12,fontWeight:600}}>✓ {s}</span>)}
                {!JM.matching_skills?.length&&<div style={{fontSize:13,color:"var(--text2)"}}>No direct matches found</div>}
              </div>
            </Card>
            <Card>
              <SLabel text="❌ Missing JD Keywords"/>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {JM.missing_keywords?.map(s=><span key={s} style={{padding:"4px 12px",borderRadius:20,background:"rgba(255,61,138,.08)",color:"var(--pink)",border:"1px solid rgba(255,61,138,.2)",fontSize:12,fontWeight:600}}>+ {s}</span>)}
                {!JM.missing_keywords?.length&&<div style={{fontSize:13,color:"var(--green)"}}>✅ All keywords covered</div>}
              </div>
            </Card>
          </div>
          {JM.alignment_issues?.length>0 && (
            <Card>
              <SLabel text="⚠️ Alignment Issues"/>
              {JM.alignment_issues.map((a,i)=><NumItem key={i} text={a} i={i} bg="rgba(255,107,53,.05)" border="rgba(255,107,53,.18)" nc="var(--orange)"/>)}
            </Card>
          )}
        </>)}

        {/* ── REWRITES ── */}
        {tab==="rewrite" && (<>
          {BO.length>0 && (
            <Card>
              <SLabel text="✏️ Bullet Point Rewrites"/>
              {BO.map((b,i)=>(
                <div key={i} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:12,padding:"14px 16px",marginBottom:12}}>
                  <div style={{fontSize:12,color:"var(--pink)",marginBottom:6,display:"flex",gap:6,alignItems:"flex-start"}}>
                    <span style={{flexShrink:0,fontWeight:700}}>Before:</span>{b.original}
                  </div>
                  <div style={{fontSize:12,color:"var(--green)",marginBottom:8,display:"flex",gap:6,alignItems:"flex-start"}}>
                    <span style={{flexShrink:0,fontWeight:700}}>After:</span>{b.improved}
                  </div>
                  {b.issues?.length>0 && (
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {b.issues.map((iss,j)=><span key={j} style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:"rgba(255,214,10,.12)",color:"var(--yellow)",border:"1px solid rgba(255,214,10,.2)"}}>{iss}</span>)}
                    </div>
                  )}
                  {b.evidence && <div style={{fontSize:11,color:"var(--text3)",marginTop:6}}>📎 Evidence: {b.evidence}</div>}
                </div>
              ))}
            </Card>
          )}
          {SR.summary && (
            <Card>
              <SLabel text="✨ Rewritten Summary"/>
              <div style={{fontSize:14,color:"var(--text)",lineHeight:1.7,padding:"12px 14px",background:"rgba(0,255,136,.04)",border:"1px solid rgba(0,255,136,.15)",borderRadius:10}}>{SR.summary}</div>
            </Card>
          )}
          {SR.experience?.length>0 && (
            <Card>
              <SLabel text="✨ Rewritten Experience Bullets"/>
              {SR.experience.map((e,i)=>(
                <div key={i} style={{fontSize:13,color:"var(--text)",lineHeight:1.65,padding:"8px 12px",background:"var(--bg2)",borderRadius:8,marginBottom:6,display:"flex",gap:8}}>
                  <span style={{color:"var(--cyan)",flexShrink:0}}>•</span>{e}
                </div>
              ))}
            </Card>
          )}
          {SR.projects?.length>0 && (
            <Card>
              <SLabel text="✨ Rewritten Project Bullets"/>
              {SR.projects.map((p,i)=>(
                <div key={i} style={{fontSize:13,color:"var(--text)",lineHeight:1.65,padding:"8px 12px",background:"var(--bg2)",borderRadius:8,marginBottom:6,display:"flex",gap:8}}>
                  <span style={{color:"var(--purple)",flexShrink:0}}>•</span>{p}
                </div>
              ))}
            </Card>
          )}
          {!BO.length&&!SR.summary&&!SR.experience?.length&&!SR.projects?.length&&(
            <Card><div style={{fontSize:13,color:"var(--text2)",textAlign:"center",padding:"20px 0"}}>No rewrite content available for this resume.</div></Card>
          )}
        </>)}

        {/* ── BUILDER ── */}
        {tab==="builder" && (<>
          {RB.header?(
            <div style={{background:"var(--card)",border:"1px solid rgba(0,255,136,.25)",borderRadius:16,padding:28}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:10}}>
                <div>
                  <div className="syne" style={{fontSize:22,fontWeight:900}}>{RB.header.name||"—"}</div>
                  <div style={{fontSize:13,color:"var(--text2)",marginTop:4,display:"flex",gap:16,flexWrap:"wrap"}}>
                    {RB.header.email&&<span>📧 {RB.header.email}</span>}
                    {RB.header.phone&&<span>📱 {RB.header.phone}</span>}
                  </div>
                </div>
                <span style={{fontSize:10,padding:"4px 10px",borderRadius:6,background:"rgba(0,255,136,.12)",color:"var(--green)",border:"1px solid rgba(0,255,136,.25)",fontWeight:700}}>ATS-READY FORMAT</span>
              </div>
              {[
                ["Professional Summary", RB.summary ? <div style={{fontSize:13,color:"var(--text)",lineHeight:1.7}}>{RB.summary}</div> : null],
                ["Skills", RB.skills?.length ? <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{RB.skills.map(s=><span key={s} style={{padding:"3px 10px",borderRadius:6,background:"var(--bg3)",border:"1px solid var(--border)",fontSize:12,color:"var(--text2)"}}>{s}</span>)}</div> : null],
              ].map(([title, content])=>content?(
                <div key={title}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8,borderTop:"1px solid var(--border)",paddingTop:16}}>{title}</div>
                  {content}
                </div>
              ):null)}
              {RB.experience?.length>0&&(<>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10,borderTop:"1px solid var(--border)",paddingTop:16}}>Experience</div>
                {RB.experience.map((exp,i)=>(
                  <div key={i} style={{marginBottom:14}}>
                    <div className="syne" style={{fontSize:14,fontWeight:700}}>{exp.role} <span style={{fontWeight:400,color:"var(--text2)"}}>@ {exp.organization}</span></div>
                    {exp.description?.map((d,j)=><div key={j} style={{fontSize:12,color:"var(--text2)",lineHeight:1.6,display:"flex",gap:6,marginTop:4}}><span style={{color:"var(--cyan)",flexShrink:0}}>•</span>{d}</div>)}
                  </div>
                ))}
              </>)}
              {RB.projects?.length>0&&(<>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10,borderTop:"1px solid var(--border)",paddingTop:16}}>Projects</div>
                {RB.projects.map((p,i)=>(
                  <div key={i} style={{marginBottom:12}}>
                    <div className="syne" style={{fontSize:13,fontWeight:700,marginBottom:4}}>{p.name}</div>
                    {p.description?.map((d,j)=><div key={j} style={{fontSize:12,color:"var(--text2)",lineHeight:1.6,display:"flex",gap:6}}><span style={{color:"var(--purple)",flexShrink:0}}>•</span>{d}</div>)}
                  </div>
                ))}
              </>)}
              {RB.education?.length>0&&(<>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8,borderTop:"1px solid var(--border)",paddingTop:16}}>Education</div>
                {RB.education.map((e,i)=><div key={i} style={{fontSize:13,color:"var(--text)",lineHeight:1.6,marginBottom:4}}>• {e}</div>)}
              </>)}
              {RB.certifications?.length>0&&(<>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".1em",marginBottom:8,borderTop:"1px solid var(--border)",paddingTop:16}}>Certifications</div>
                {RB.certifications.map((c,i)=><div key={i} style={{fontSize:13,color:"var(--text)",lineHeight:1.6,marginBottom:4}}>• {c}</div>)}
              </>)}
            </div>
          ):(
            <Card><div style={{fontSize:13,color:"var(--text2)",textAlign:"center",padding:"20px 0"}}>Resume builder output not available.</div></Card>
          )}
        </>)}

        {/* ── INTERVIEW ── */}
        {tab==="interview" && (<>
          <Card>
            <SLabel text="⚡ Likely Interview Questions"/>
            {IP.likely_questions?.map((q,i)=>(
              <div key={i} style={{padding:"11px 14px",background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,marginBottom:8,fontSize:13,color:"var(--text)",display:"flex",gap:10,alignItems:"flex-start"}}>
                <span style={{color:"var(--cyan)",fontWeight:700,flexShrink:0}}>Q{i+1}.</span>{q}
              </div>
            ))}
            {!IP.likely_questions?.length&&<div style={{fontSize:13,color:"var(--text2)"}}>No questions generated.</div>}
          </Card>
          <Card>
            <SLabel text="🎯 Focus Areas to Prepare"/>
            {IP.focus_areas?.map((f,i)=><NumItem key={i} text={f} i={i} bg="rgba(0,212,255,.05)" border="rgba(0,212,255,.15)" nc="var(--cyan)"/>)}
          </Card>
        </>)}

        </div>

        {/* ── MORE TOOLS TAB ── */}
        {tab==="tools" && (
          <div style={{display:"grid",gap:20}}>

            {/* ATS Keyword Injector */}
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:24}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:4}}>🔑 ATS Keyword Injector</div>
              <p style={{fontSize:12,color:"var(--text2)",marginBottom:14}}>Paste a job description → instantly see which keywords are missing from your resume and which are present.</p>
              <textarea value={jdKeywords} onChange={e=>setJdKeywords(e.target.value)}
                placeholder="Paste the job description here…"
                style={{width:"100%",minHeight:100,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,padding:10,fontSize:12,fontFamily:"'DM Sans',sans-serif",color:"var(--text)",resize:"vertical",outline:"none",boxSizing:"border-box",marginBottom:10}}
                onFocus={e=>e.target.style.borderColor="var(--cyan)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
              <button className="btn-p" onClick={runInjector} style={{padding:"8px 20px",fontSize:13,background:"linear-gradient(135deg,var(--cyan),#0099cc)"}}>Analyze Keywords</button>
              {injectorResult && (
                <div style={{marginTop:14,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div style={{background:"rgba(255,61,138,.05)",border:"1px solid rgba(255,61,138,.2)",borderRadius:10,padding:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:"var(--pink)",marginBottom:8}}>❌ Missing Keywords ({injectorResult.missing.length})</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {injectorResult.missing.map(w=><span key={w} style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:"rgba(255,61,138,.1)",color:"var(--pink)",border:"1px solid rgba(255,61,138,.2)"}}>{w}</span>)}
                    </div>
                  </div>
                  <div style={{background:"rgba(0,255,136,.05)",border:"1px solid rgba(0,255,136,.2)",borderRadius:10,padding:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:"var(--green)",marginBottom:8}}>✅ Present Keywords ({injectorResult.present.length})</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {injectorResult.present.map(w=><span key={w} style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:"rgba(0,255,136,.1)",color:"var(--green)",border:"1px solid rgba(0,255,136,.2)"}}>{w}</span>)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Resume Checklist */}
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:24}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>✅ ATS Resume Checklist</div>
                <span className="syne" style={{fontSize:18,fontWeight:900,color:checkScore>=80?"var(--green)":checkScore>=50?"var(--yellow)":"var(--pink)"}}>{checkScore}%</span>
              </div>
              <div style={{height:4,background:"var(--bg3)",borderRadius:2,overflow:"hidden",marginBottom:14}}>
                <div style={{height:"100%",width:`${checkScore}%`,background:checkScore>=80?"var(--green)":checkScore>=50?"var(--yellow)":"var(--pink)",borderRadius:2,transition:"width .5s"}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:6}}>
                {CHECKLIST_ITEMS.map((item,i)=>(
                  <div key={i} onClick={()=>toggleCheck(i)}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:checklist[i]?"rgba(0,255,136,.05)":"var(--bg)",border:`1px solid ${checklist[i]?"rgba(0,255,136,.2)":"var(--border)"}`,cursor:"pointer",transition:"all .15s"}}>
                    <div style={{width:16,height:16,borderRadius:3,border:`2px solid ${checklist[i]?"var(--green)":"var(--border2)"}`,background:checklist[i]?"var(--green)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
                      {checklist[i]&&<span style={{fontSize:10,color:"#000",fontWeight:900}}>✓</span>}
                    </div>
                    <span style={{fontSize:12,color:checklist[i]?"var(--text)":"var(--text2)",textDecoration:checklist[i]?"none":"none"}}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cover Letter Generator */}
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:24}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:4}}>✉️ Cover Letter Generator</div>
              <p style={{fontSize:12,color:"var(--text2)",marginBottom:14}}>Paste the job description and choose a tone → AI generates a tailored cover letter based on your resume.</p>
              <div style={{display:"grid",gap:10,marginBottom:12}}>
                <textarea value={clJD} onChange={e=>setClJD(e.target.value)}
                  placeholder="Paste job description here…"
                  style={{width:"100%",minHeight:80,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,padding:10,fontSize:12,fontFamily:"'DM Sans',sans-serif",color:"var(--text)",resize:"vertical",outline:"none",boxSizing:"border-box"}}
                  onFocus={e=>e.target.style.borderColor="var(--cyan)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:12,color:"var(--text2)"}}>Tone:</span>
                  {["Professional","Startup","Enthusiastic"].map(t=>(
                    <button key={t} onClick={()=>setClTone(t)}
                      style={{fontSize:11,padding:"4px 12px",borderRadius:6,border:`1px solid ${clTone===t?"var(--cyan)":"var(--border)"}`,background:clTone===t?"rgba(0,212,255,.12)":"var(--card)",color:clTone===t?"var(--cyan)":"var(--text2)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                      {t}
                    </button>
                  ))}
                  <button className="btn-p" onClick={generateCoverLetter} disabled={clLoading||!clJD.trim()}
                    style={{padding:"7px 18px",fontSize:12,opacity:(clLoading||!clJD.trim())?.6:1}}>
                    {clLoading?"⏳ Generating…":"Generate →"}
                  </button>
                </div>
              </div>
              {clLetter && (
                <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10,padding:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".08em"}}>Generated Cover Letter</span>
                    <button onClick={()=>{navigator.clipboard.writeText(clLetter);setClCopied(true);setTimeout(()=>setClCopied(false),2000);}}
                      style={{fontSize:11,padding:"3px 10px",borderRadius:5,border:`1px solid ${clCopied?"var(--green)":"var(--border)"}`,background:clCopied?"rgba(0,255,136,.12)":"transparent",color:clCopied?"var(--green)":"var(--text3)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                      {clCopied?"✅ Copied!":"📋 Copy"}
                    </button>
                  </div>
                  <div style={{fontSize:13,color:"var(--text)",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{clLetter}</div>
                </div>
              )}
            </div>

            {/* LinkedIn Headline Generator */}
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:24}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:4}}>🔗 LinkedIn Headline Generator</div>
              <p style={{fontSize:12,color:"var(--text2)",marginBottom:14}}>Based on your resume analysis, generate 5 LinkedIn headline variations optimized for recruiter search.</p>
              <button className="btn-p" onClick={generateHeadlines} disabled={liLoading}
                style={{padding:"8px 20px",fontSize:13,opacity:liLoading?.6:1,background:"linear-gradient(135deg,#0077b5,#005e93)",marginBottom:liHeadlines.length?14:0}}>
                {liLoading?"⏳ Generating…":"Generate Headlines →"}
              </button>
              {liHeadlines.length>0 && (
                <div style={{display:"grid",gap:8}}>
                  {liHeadlines.map((h,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:10}}>
                      <span style={{fontSize:11,color:"var(--text3)",flexShrink:0,minWidth:20}}>{i+1}.</span>
                      <span style={{fontSize:13,color:"var(--text)",flex:1,lineHeight:1.5}}>{h.replace(/^\d+\.\s*/,"")}</span>
                      <button onClick={()=>navigator.clipboard.writeText(h.replace(/^\d+\.\s*/,""))}
                        style={{fontSize:10,padding:"2px 8px",borderRadius:4,border:"1px solid var(--border)",background:"transparent",color:"var(--text3)",cursor:"pointer",flexShrink:0,fontFamily:"'DM Sans',sans-serif"}}>Copy</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Salary Estimator */}
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:24}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:4}}>💰 Bangalore Salary Estimator</div>
              <p style={{fontSize:12,color:"var(--text2)",marginBottom:14}}>Estimate your market value based on role and experience. Data sourced from AmbitionBox + Glassdoor (Bangalore market).</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Role</div>
                  <select value={salaryRole} onChange={e=>setSalaryRole(e.target.value)} className="input" style={{padding:"8px 30px 8px 10px",fontSize:12,width:"100%"}}>
                    <option value="">Select role…</option>
                    {Object.keys(SALARY_DATA).map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Experience</div>
                  <select value={salaryExp} onChange={e=>setSalaryExp(e.target.value)} className="input" style={{padding:"8px 30px 8px 10px",fontSize:12,width:"100%"}}>
                    <option value="0-1">0-1 years (Fresher)</option>
                    <option value="1-3">1-3 years</option>
                    <option value="3-5">3-5 years</option>
                    <option value="5+">5+ years</option>
                  </select>
                </div>
              </div>
              {salaryRange && (
                <div style={{padding:"16px 20px",background:"rgba(0,255,136,.06)",border:"1px solid rgba(0,255,136,.2)",borderRadius:12,display:"flex",alignItems:"center",gap:16}}>
                  <div>
                    <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Bangalore Market Range</div>
                    <div className="syne" style={{fontSize:28,fontWeight:900,color:"var(--green)"}}>{salaryRange} per annum</div>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>Based on AmbitionBox + Glassdoor data · Always negotiate 20-30% above base offer</div>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Checklist standalone (outside result — on input screen) */}

        {/* Bottom actions */}
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:24,paddingTop:20,borderTop:"1px solid var(--border)"}}>
          <button className="btn-p" onClick={handleCopy} style={{padding:"10px 22px",fontSize:14,background:copied?"linear-gradient(135deg,var(--green),#00b865)":"linear-gradient(135deg,var(--cyan),#0099cc)"}}>
            {copied?"✅ Copied!":"📋 Copy Full Report"}
          </button>
          <button className="btn-g" onClick={handlePrint} style={{padding:"10px 20px",fontSize:14}}>
            {printing?"⏳ Preparing…":"🖨️ Download / Print PDF"}
          </button>
          <button className="btn-g" onClick={()=>setCompareMode(true)} style={{padding:"10px 20px",fontSize:14,display:history.length>=1?"flex":"none",alignItems:"center",gap:6}}>
            📊 Compare with Previous
          </button>
          <button className="btn-g" onClick={()=>{setResult(null);setFile(null);setError("");setJd("");setDomain("");}} style={{padding:"10px 20px",fontSize:14}}>🔄 Analyze Another</button>
          <button className="btn-g" onClick={()=>setPage("tools")} style={{padding:"10px 20px",fontSize:14}}>← Back to Tools</button>
        </div>

        {/* Compare Modal */}
        {compareMode && history.length >= 1 && (
          <div style={{marginTop:20,background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div className="syne" style={{fontSize:16,fontWeight:800}}>📊 Score Comparison</div>
              <button onClick={()=>setCompareMode(false)} style={{background:"none",border:"none",color:"var(--text3)",cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              {/* Current */}
              <div style={{background:"rgba(0,255,136,.05)",border:"1px solid rgba(0,255,136,.2)",borderRadius:12,padding:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--green)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Current Upload</div>
                {[["Overall",result?.summary?.overall_score],["ATS",result?.summary?.ats_score]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:13,color:"var(--text2)"}}>{l}</span>
                    <span className="syne" style={{fontSize:16,fontWeight:800,color:v>=75?"var(--green)":v>=50?"var(--yellow)":"var(--pink)"}}>{v??"-"}</span>
                  </div>
                ))}
              </div>
              {/* Previous */}
              <div style={{background:"rgba(0,212,255,.05)",border:"1px solid rgba(0,212,255,.2)",borderRadius:12,padding:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--cyan)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Previous — {history[0]?.date}</div>
                {[["Overall",history[0]?.overall],["ATS",history[0]?.ats]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontSize:13,color:"var(--text2)"}}>{l}</span>
                    <span className="syne" style={{fontSize:16,fontWeight:800,color:v>=75?"var(--green)":v>=50?"var(--yellow)":"var(--pink)"}}>{v??"-"}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Delta */}
            {history[0] && (()=>{
              const ovDelta = (result?.summary?.overall_score||0) - (history[0].overall||0);
              const atsDelta = (result?.summary?.ats_score||0) - (history[0].ats||0);
              return (
                <div style={{marginTop:12,padding:"10px 16px",background:"var(--bg2)",borderRadius:10,display:"flex",gap:20,flexWrap:"wrap"}}>
                  <div>
                    <span style={{fontSize:12,color:"var(--text3)"}}>Overall change: </span>
                    <span style={{fontSize:14,fontWeight:800,color:ovDelta>0?"var(--green)":ovDelta<0?"var(--pink)":"var(--text3)"}}>{ovDelta>0?"+":""}{ovDelta} pts</span>
                  </div>
                  <div>
                    <span style={{fontSize:12,color:"var(--text3)"}}>ATS change: </span>
                    <span style={{fontSize:14,fontWeight:800,color:atsDelta>0?"var(--green)":atsDelta<0?"var(--pink)":"var(--text3)"}}>{atsDelta>0?"+":""}{atsDelta} pts</span>
                  </div>
                  <div>
                    <span style={{fontSize:12,color:"var(--text3)"}}>Verdict: </span>
                    <span style={{fontSize:14,fontWeight:700,color:"var(--cyan)"}}>{ovDelta>5?"Great improvement!":ovDelta>0?"Slight improvement":ovDelta===0?"No change":"Score dropped — review suggestions"}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

// ── DSA Data ─────────────────────────────────────────────────
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
          {page==="events"      && <EventsPage/>}
          {page==="resources"   && <ResourcesPage/>}
          {page==="tools"   && <StudentToolsPage setPage={setPage}/>}
          {page==="cp"     && <CPContestPage setPage={setPage}/>}
          {page==="dsa"    && <DSAPage setPage={setPage}/>}
          {page==="resume" && <ResumeAnalyzerPage setPage={setPage}/>}
        </main>
        <Footer setPage={setPage}/>
        <HackBot hackathons={allHacks}/>
      </div>
    </>
  );
}
// force redeploy Sat Mar  7 21:55:44 IST 2026
