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
              <LogoBox name={h.name} organizer={h.organizer} platform={h.sourcePlatform} applyLink={h.applyLink} size={60} radius={14}/>
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
  { id:"dsa", icon:"🧠", label:"DSA Explorer", desc:"Problem finder" },
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
  const [ds,setDs]=useState("");
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
          <div style={{position:"relative",maxWidth:540}}>
            <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:"var(--text3)"}}>🔍</span>
            <input className="input" placeholder="Search events, conferences, workshops…" value={search} onChange={e=>setSearch(e.target.value)} style={{padding:"12px 16px 12px 42px",fontSize:14}}/>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{maxWidth:1200,margin:"0 auto",padding:"24px",display:"flex",gap:20,alignItems:"flex-start"}}>

        {/* Sidebar */}
        <div style={{width:220,flexShrink:0,background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:18,position:"sticky",top:80}} className="hm">
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
        <div style={{flex:1,minWidth:0}}>
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
      {name:"Codeforces",url:"https://codeforces.com/problemset?tags=arrays",logo:"https://codeforces.com/favicon.ico",count:800,easy:200,med:400,hard:200,tags:["Competitive","Rated"],note:"Competitive programming array problems"},
      {name:"InterviewBit",url:"https://www.interviewbit.com/courses/programming/arrays/",logo:"https://www.interviewbit.com/favicon.ico",count:80,easy:20,med:45,hard:15,tags:["Interview Prep","Company Tags"],note:"Company-wise interview problems"},
      {name:"CSES",url:"https://cses.fi/problemset/",logo:"https://cses.fi/favicon.ico",count:20,easy:8,med:8,hard:4,tags:["Gold Standard","Competitive"],note:"Classic problems every CP coder must solve"},
    ]
  },
  {
    slug:"binary-search", topic:"Binary Search", category:"Searching", difficulty:"Medium",
    tuf:32, icon:"⟨⟩",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/binary-search/",logo:"https://leetcode.com/favicon.ico",count:230,easy:55,med:130,hard:45,tags:["Interview Prep","FAANG"],note:"Excellent tag with classic + advanced BS problems"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Binary+Search",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:120,easy:60,med:45,hard:15,tags:["Beginner Friendly"],note:"Good conceptual articles with problems"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:18,easy:5,med:10,hard:3,tags:["Video Solutions","Blind 75"],note:"All key binary search patterns covered"},
      {name:"Codeforces",url:"https://codeforces.com/problemset?tags=binary+search",logo:"https://codeforces.com/favicon.ico",count:500,easy:100,med:250,hard:150,tags:["Competitive"],note:"Advanced BS on answers problems"},
      {name:"CSES",url:"https://cses.fi/problemset/",logo:"https://cses.fi/favicon.ico",count:8,easy:2,med:4,hard:2,tags:["Gold Standard"],note:"Essential binary search problems"},
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
      {name:"CSES",url:"https://cses.fi/problemset/",logo:"https://cses.fi/favicon.ico",count:5,easy:2,med:2,hard:1,tags:["Gold Standard"],note:"Classic stack problems"},
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
      {name:"CSES",url:"https://cses.fi/problemset/",logo:"https://cses.fi/favicon.ico",count:12,easy:3,med:6,hard:3,tags:["Gold Standard"],note:"Competitive tree problems"},
    ]
  },
  {
    slug:"graphs", topic:"Graphs", category:"Graphs", difficulty:"Hard",
    tuf:54, icon:"◎",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/graph/",logo:"https://leetcode.com/favicon.ico",count:320,easy:50,med:190,hard:80,tags:["Interview Prep","FAANG"],note:"Complete graph algorithms — BFS, DFS, Dijkstra, Union Find"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Graph",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:300,easy:100,med:150,hard:50,tags:["Beginner Friendly"],note:"Best resource for learning graph algorithms"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:20,easy:3,med:13,hard:4,tags:["Video Solutions","Blind 75"],note:"All graph patterns with clean video explanations"},
      {name:"Codeforces",url:"https://codeforces.com/problemset?tags=graphs",logo:"https://codeforces.com/favicon.ico",count:1200,easy:200,med:600,hard:400,tags:["Competitive","Rated"],note:"Competitive graph problems — advanced techniques"},
      {name:"CSES",url:"https://cses.fi/problemset/",logo:"https://cses.fi/favicon.ico",count:36,easy:8,med:18,hard:10,tags:["Gold Standard"],note:"The gold standard graph section for CP"},
    ]
  },
  {
    slug:"dynamic-programming", topic:"Dynamic Programming", category:"DP", difficulty:"Hard",
    tuf:56, icon:"◈",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/dynamic-programming/",logo:"https://leetcode.com/favicon.ico",count:600,easy:90,med:370,hard:140,tags:["Interview Prep","FAANG"],note:"Most comprehensive DP collection — all patterns"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Dynamic+Programming",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:350,easy:100,med:200,hard:50,tags:["Beginner Friendly"],note:"Best articles for understanding DP patterns"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:28,easy:4,med:18,hard:6,tags:["Video Solutions","Blind 75"],note:"Pattern-based DP with visual state transitions"},
      {name:"Codeforces",url:"https://codeforces.com/problemset?tags=dp",logo:"https://codeforces.com/favicon.ico",count:1500,easy:300,med:800,hard:400,tags:["Competitive","Rated"],note:"Advanced DP — bitmask, digit DP, tree DP"},
      {name:"CSES",url:"https://cses.fi/problemset/",logo:"https://cses.fi/favicon.ico",count:19,easy:4,med:10,hard:5,tags:["Gold Standard"],note:"Classic DP problems — every one is a gem"},
      {name:"InterviewBit",url:"https://www.interviewbit.com/courses/programming/dynamic-programming/",logo:"https://www.interviewbit.com/favicon.ico",count:60,easy:15,med:35,hard:10,tags:["Interview Prep"],note:"Interview DP with company tags"},
    ]
  },
  {
    slug:"greedy", topic:"Greedy", category:"Algorithms", difficulty:"Medium",
    tuf:16, icon:"⚡",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/greedy/",logo:"https://leetcode.com/favicon.ico",count:280,easy:70,med:160,hard:50,tags:["Interview Prep","FAANG"],note:"Greedy is frequently asked in product companies"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Greedy",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:120,easy:50,med:55,hard:15,tags:["Beginner Friendly"],note:"Good greedy proof techniques explained"},
      {name:"Codeforces",url:"https://codeforces.com/problemset?tags=greedy",logo:"https://codeforces.com/favicon.ico",count:1800,easy:400,med:900,hard:500,tags:["Competitive","Rated"],note:"Largest greedy collection for CP"},
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
      {name:"Codeforces",url:"https://codeforces.com/problemset?tags=bitmasks",logo:"https://codeforces.com/favicon.ico",count:300,easy:60,med:150,hard:90,tags:["Competitive"],note:"Bitmask DP and XOR problems for CP"},
    ]
  },
  {
    slug:"string-algorithms", topic:"String Algorithms", category:"Algorithms", difficulty:"Hard",
    tuf:22, icon:"Aa",
    platforms:[
      {name:"LeetCode",url:"https://leetcode.com/tag/string/",logo:"https://leetcode.com/favicon.ico",count:550,easy:175,med:285,hard:90,tags:["Interview Prep","FAANG"],note:"Strings are most common in OA rounds"},
      {name:"GeeksforGeeks",url:"https://www.geeksforgeeks.org/explore?topic=Strings",logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",count:200,easy:80,med:90,hard:30,tags:["Beginner Friendly"],note:"KMP, Z-algorithm, Rabin-Karp explained"},
      {name:"NeetCode",url:"https://neetcode.io/practice",logo:"https://neetcode.io/favicon.ico",count:16,easy:5,med:9,hard:2,tags:["Video Solutions","Blind 75"],note:"String manipulation patterns"},
      {name:"CSES",url:"https://cses.fi/problemset/",logo:"https://cses.fi/favicon.ico",count:12,easy:2,med:6,hard:4,tags:["Gold Standard"],note:"Hashing + KMP for competitive programming"},
    ]
  },
];

const DSA_CATEGORIES = ["All", ...new Set(DSA_DATA.map(t => t.category))];

const DIFF_COLOR = { Easy:"#00ff88", Medium:"#ffd60a", Hard:"#ff3d8a" };

// Maps DSA_DATA slug → TUF_CHECKLIST section keys
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

function getProblemLinks(name) {
  const q = encodeURIComponent(name);
  return [
    { name:"LeetCode",      color:"#f89f1b", logo:"https://leetcode.com/favicon.ico",
      url:`https://leetcode.com/search/?q=${q}`,                          note:"Best for interview prep & FAANG" },
    { name:"GeeksforGeeks", color:"#2f8d46", logo:"https://media.geeksforgeeks.org/gfg-gg-logo.svg",
      url:`https://www.geeksforgeeks.org/?s=${q}`,                        note:"Detailed articles & explanations" },
    { name:"NeetCode",      color:"#00b8a3", logo:"https://neetcode.io/favicon.ico",
      url:`https://neetcode.io/practice`,                                  note:"Video walkthroughs & patterns" },
    { name:"Codeforces",    color:"#1a9eee", logo:"https://codeforces.com/favicon.ico",
      url:`https://codeforces.com/problemset?search=${q}`,                note:"Competitive programming variants" },
    { name:"InterviewBit",  color:"#e84393", logo:"https://www.interviewbit.com/favicon.ico",
      url:`https://www.interviewbit.com/search/?q=${q}`,                  note:"Company-tagged interview problems" },
    { name:"CSES",          color:"#4488cc", logo:"https://cses.fi/favicon.ico",
      url:`https://cses.fi/problemset/`,                                   note:"Gold-standard classic problems" },
  ];
}

const DSAPage = ({ setPage }) => {
  const [cat,          setCat]          = useState("All");
  const [search,       setSearch]       = useState("");
  const [view,         setView]         = useState("topics");   // topics | problems | problem
  const [selTopic,     setSelTopic]     = useState(null);
  const [selProblem,   setSelProblem]   = useState(null);
  const [tip,          setTip]          = useState("");
  const [tipLoading,   setTipLoading]   = useState(false);
  const [probSearch,   setProbSearch]   = useState("");
  const [diffFilter,   setDiffFilter]   = useState("All");

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
      const r = await fetch(`/api/dsa/topics/${slug}/tip`, { method:"POST" });
      const j = await r.json();
      setTip(j.tip || "");
    } catch { setTip("Could not load tip — check Groq API key."); }
    setTipLoading(false);
  };

  const openTopic = (t) => { setSelTopic(t); setSelProblem(null); setView("problems"); setProbSearch(""); setDiffFilter("All"); setTip(""); window.scrollTo(0,0); };
  const openProblem = (p) => { setSelProblem(p); setView("problem"); window.scrollTo(0,0); };

  // ── TOPICS VIEW ─────────────────────────────────────────────
  if (view === "topics") return (
    <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
      <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"40px 24px 32px"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div className="sl">Student Tools</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:16,marginBottom:24}}>
            <div>
              <h1 className="syne" style={{fontSize:34,fontWeight:800,marginBottom:6}}>🧠 DSA <span className="gtext">Problem Explorer</span></h1>
              <p style={{color:"var(--text2)",fontSize:14}}>{DSA_DATA.length} topics · 8 platforms · AI study tips</p>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[["LeetCode","#f89f1b"],["NeetCode","#00b8a3"],["GFG","#2f8d46"],["CSES","#4488cc"]].map(([p,c])=>(
                <span key={p} style={{padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:700,background:`${c}18`,color:c,border:`1px solid ${c}30`}}>{p}</span>
              ))}
            </div>
          </div>
          <div style={{position:"relative",maxWidth:480}}>
            <span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:"var(--text3)"}}>🔍</span>
            <input className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search topics — Arrays, DP, Graphs…" style={{padding:"11px 16px 11px 40px",fontSize:14}}/>
          </div>
          <div style={{display:"flex",gap:6,marginTop:16,flexWrap:"wrap"}}>
            {DSA_CATEGORIES.map(c=>(
              <button key={c} onClick={()=>setCat(c)} style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:600,border:"1px solid var(--border)",background:cat===c?"var(--purple)":"var(--card)",color:cat===c?"#fff":"var(--text2)",cursor:"pointer",transition:"all .15s"}}>{c}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{maxWidth:1200,margin:"0 auto",padding:"28px 24px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
          {filtered.map(t=>(
            <div key={t.slug} onClick={()=>openTopic(t)} className="hcard"
              style={{padding:20,cursor:"pointer",border:"1px solid var(--border)",background:"var(--card)",transition:"all .2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <span style={{fontSize:22,lineHeight:1}}>{t.icon}</span>
                <span style={{fontSize:10,fontWeight:700,padding:"3px 7px",borderRadius:4,background:`${DIFF_COLOR[t.difficulty]}18`,color:DIFF_COLOR[t.difficulty]}}>{t.difficulty}</span>
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

  // ── PROBLEMS VIEW ────────────────────────────────────────────
  const problems = getTopicProblems(selTopic?.slug);
  const filteredProbs = problems.filter(p =>
    (diffFilter === "All" || p.diff === diffFilter) &&
    (!probSearch || p.name.toLowerCase().includes(probSearch.toLowerCase()))
  );

  if (view === "problems") return (
    <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
      <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"32px 24px 24px"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,fontSize:13,color:"var(--text3)"}}>
            <span style={{cursor:"pointer",color:"var(--cyan)"}} onClick={()=>setView("topics")}>DSA Explorer</span>
            <span>›</span>
            <span style={{color:"var(--text)"}}>{selTopic.topic}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <span style={{fontSize:36}}>{selTopic.icon}</span>
              <div>
                <h1 className="syne" style={{fontSize:28,fontWeight:800,marginBottom:6}}>{selTopic.topic}</h1>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{fontSize:11,padding:"3px 8px",borderRadius:5,background:"var(--bg3)",color:"var(--text2)"}}>{selTopic.category}</span>
                  <span style={{fontSize:11,padding:"3px 8px",borderRadius:5,background:`${DIFF_COLOR[selTopic.difficulty]}18`,color:DIFF_COLOR[selTopic.difficulty],fontWeight:700}}>{selTopic.difficulty}</span>
                  <span style={{fontSize:11,color:"var(--text3)"}}>{problems.length} problems</span>
                </div>
              </div>
            </div>
            <button onClick={()=>fetchTip(selTopic.slug)} disabled={tipLoading}
              style={{padding:"9px 18px",borderRadius:10,border:"1px solid var(--yellow)",background:"rgba(255,214,10,.08)",color:"var(--yellow)",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
              {tipLoading?"⏳ Loading…":"💡 AI Study Tip"}
            </button>
          </div>
          {tip && (
            <div style={{marginTop:16,background:"rgba(255,214,10,.06)",border:"1px solid rgba(255,214,10,.2)",borderRadius:12,padding:16,maxWidth:700}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--yellow)",marginBottom:8}}>💡 AI Study Strategy</div>
              <div style={{fontSize:12,color:"var(--text)",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{tip}</div>
            </div>
          )}
          <div style={{display:"flex",gap:10,marginTop:20,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{position:"relative",flex:1,maxWidth:360}}>
              <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"var(--text3)",fontSize:13}}>🔍</span>
              <input className="input" value={probSearch} onChange={e=>setProbSearch(e.target.value)} placeholder="Search problems…" style={{padding:"9px 14px 9px 34px",fontSize:13}}/>
            </div>
            {["All","Easy","Medium","Hard"].map(d=>(
              <button key={d} onClick={()=>setDiffFilter(d)}
                style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:600,border:"1px solid var(--border)",cursor:"pointer",
                  background:diffFilter===d?(d==="Easy"?"rgba(0,255,136,.2)":d==="Medium"?"rgba(255,214,10,.2)":d==="Hard"?"rgba(255,61,138,.2)":"var(--purple)"):"var(--card)",
                  color:diffFilter===d?(d==="Easy"?"#00ff88":d==="Medium"?"#ffd60a":d==="Hard"?"#ff3d8a":"#fff"):"var(--text2)"}}>
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{maxWidth:1100,margin:"0 auto",padding:"24px"}}>
        {problems.length === 0 ? (
          <div style={{textAlign:"center",padding:"60px 20px",color:"var(--text3)"}}>
            <div style={{fontSize:40,marginBottom:12}}>🔧</div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:8}}>Problem list coming soon for {selTopic.topic}</div>
            <div style={{fontSize:13,marginBottom:20}}>Practice directly on these platforms:</div>
            <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
              {selTopic.platforms.map(p=>(
                <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                  style={{padding:"9px 18px",borderRadius:8,background:"var(--card)",border:"1px solid var(--border)",color:"var(--text)",fontSize:13,textDecoration:"none"}}>
                  {p.name} →
                </a>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:16}}>
              {filteredProbs.length} of {problems.length} problems — click any to see platform links
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:10}}>
              {filteredProbs.map((p,i)=>(
                <div key={i} onClick={()=>openProblem(p)} className="hcard"
                  style={{padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,border:"1px solid var(--border)",background:"var(--card)",transition:"all .2s"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                    <span style={{fontSize:11,color:"var(--text3)",flexShrink:0,minWidth:20,textAlign:"right"}}>{i+1}</span>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--text)",lineHeight:1.3}}>{p.name}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                    <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,background:`${DIFF_COLOR[p.diff]}18`,color:DIFF_COLOR[p.diff],whiteSpace:"nowrap"}}>{p.diff}</span>
                    <span style={{color:"var(--purple)",fontSize:14}}>›</span>
                  </div>
                </div>
              ))}
              {filteredProbs.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",padding:"40px",color:"var(--text3)"}}>No problems match your filters</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ── PROBLEM DETAIL VIEW ──────────────────────────────────────
  const pLinks = getProblemLinks(selProblem.name);
  return (
    <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
      <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"32px 24px 28px"}}>
        <div style={{maxWidth:900,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,fontSize:13,color:"var(--text3)",flexWrap:"wrap"}}>
            <span style={{cursor:"pointer",color:"var(--cyan)"}} onClick={()=>setView("topics")}>DSA Explorer</span>
            <span>›</span>
            <span style={{cursor:"pointer",color:"var(--cyan)"}} onClick={()=>setView("problems")}>{selTopic.topic}</span>
            <span>›</span>
            <span style={{color:"var(--text)"}}>{selProblem.name}</span>
          </div>
          <h1 className="syne" style={{fontSize:26,fontWeight:800,marginBottom:12}}>{selProblem.name}</h1>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:11,padding:"4px 10px",borderRadius:6,background:`${DIFF_COLOR[selProblem.diff]}18`,color:DIFF_COLOR[selProblem.diff],fontWeight:700}}>{selProblem.diff}</span>
            <span style={{fontSize:11,padding:"4px 10px",borderRadius:6,background:"var(--bg3)",color:"var(--text2)"}}>{selTopic.topic}</span>
            <span style={{fontSize:11,padding:"4px 10px",borderRadius:6,background:"var(--bg3)",color:"var(--text2)"}}>{selTopic.category}</span>
          </div>
        </div>
      </div>
      <div style={{maxWidth:900,margin:"0 auto",padding:"28px 24px"}}>
        <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:16}}>Solve on these platforms</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
          {pLinks.map(l=>(
            <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer"
              style={{display:"flex",alignItems:"center",gap:14,padding:"18px",borderRadius:14,border:"1px solid var(--border)",background:"var(--card)",textDecoration:"none",transition:"all .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=l.color;e.currentTarget.style.background=`${l.color}12`;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.background="var(--card)";}}>
              <div style={{width:42,height:42,borderRadius:10,background:`${l.color}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <img src={l.logo} alt={l.name} style={{width:22,height:22,objectFit:"contain"}} onError={e=>e.target.style.display="none"}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700,color:"var(--text)",marginBottom:3}}>{l.name}</div>
                <div style={{fontSize:11,color:"var(--text3)"}}>{l.note}</div>
              </div>
              <span style={{fontSize:18,color:"var(--text3)",flexShrink:0}}>→</span>
            </a>
          ))}
        </div>
        <button onClick={()=>setView("problems")}
          style={{marginTop:28,padding:"10px 22px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text2)",fontSize:13,fontWeight:600,cursor:"pointer"}}>
          ← Back to {selTopic.topic} problems
        </button>
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
  ],
};


// ── Student Tools Landing Page ──────────────────────────────
const STUDENT_TOOLS = [
  {
    id: "dsa",
    icon: "🧠",
    title: "DSA Problem Explorer",
    desc: "Navigate DSA topics with problems from LeetCode, GFG, NeetCode & more. Includes AI study tips.",
    badge: "299 problems",
    badgeColor: "var(--cyan)",
    tags: ["LeetCode", "NeetCode", "GFG", "CSES"],
    stats: [{ label: "Topics", value: "17" }, { label: "Platforms", value: "8" }, { label: "Problems", value: "299" }],
    color: "var(--cyan)",
    gradient: "linear-gradient(135deg,rgba(0,212,255,.15),rgba(0,212,255,.03))",
  },
];

const StudentToolsPage = ({ setPage }) => (
  <div style={{paddingTop:64,minHeight:"100vh",background:"var(--bg)"}}>
    {/* Header */}
    <div style={{background:"var(--bg2)",borderBottom:"1px solid var(--border)",padding:"48px 24px 40px"}}>
      <div style={{maxWidth:1200,margin:"0 auto"}}>
        <div className="sl">For Students</div>
        <h1 className="syne" style={{fontSize:38,fontWeight:800,marginBottom:10}}>
          🛠️ Student <span className="gtext">Tools</span>
        </h1>
        <p style={{color:"var(--text2)",fontSize:15,maxWidth:560,lineHeight:1.7}}>
          Free tools built for Indian CS students — placement prep, DSA practice, and more. All tools are completely free.
        </p>
      </div>
    </div>

    {/* Tools Grid */}
    <div style={{maxWidth:1200,margin:"0 auto",padding:"40px 24px"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:20}}>
        {STUDENT_TOOLS.map(tool=>(
          <div key={tool.id} onClick={()=>setPage(tool.id)}
            className="hcard"
            style={{padding:28,cursor:"pointer",background:tool.gradient,border:`1px solid ${tool.color}25`,transition:"all .25s",position:"relative",overflow:"hidden"}}
            onMouseEnter={e=>{e.currentTarget.style.border=`1px solid ${tool.color}60`;e.currentTarget.style.transform="translateY(-2px)";}}
            onMouseLeave={e=>{e.currentTarget.style.border=`1px solid ${tool.color}25`;e.currentTarget.style.transform="translateY(0)";}}>
            {/* Glow */}
            <div style={{position:"absolute",top:-40,right:-40,width:120,height:120,borderRadius:"50%",background:tool.color,opacity:.06,filter:"blur(30px)",pointerEvents:"none"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <span style={{fontSize:36}}>{tool.icon}</span>
              <span style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:6,background:`${tool.badgeColor}18`,color:tool.badgeColor,border:`1px solid ${tool.badgeColor}30`}}>{tool.badge}</span>
            </div>
            <h2 className="syne" style={{fontSize:18,fontWeight:800,marginBottom:8}}>{tool.title}</h2>
            <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.65,marginBottom:16}}>{tool.desc}</p>
            {/* Stats */}
            <div style={{display:"flex",gap:16,marginBottom:16}}>
              {tool.stats.map(s=>(
                <div key={s.label} style={{textAlign:"center"}}>
                  <div className="syne" style={{fontSize:18,fontWeight:800,color:tool.color}}>{s.value}</div>
                  <div style={{fontSize:10,color:"var(--text3)"}}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Tags */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
              {tool.tags.map(t=>(
                <span key={t} style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:"var(--bg3)",color:"var(--text2)",border:"1px solid var(--border)"}}>{t}</span>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:12,color:"var(--text3)"}}>100% Free · No login required</span>
              <span style={{fontSize:13,fontWeight:700,color:tool.color}}>Open Tool →</span>
            </div>
          </div>
        ))}

        {/* Coming Soon placeholder */}
        {["Resume Builder","CP Contest Tracker","Interview Prep Roadmap"].map(name=>(
          <div key={name} style={{padding:28,border:"1px dashed var(--border)",borderRadius:16,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:200,opacity:.5,textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:12}}>🔜</div>
            <div className="syne" style={{fontSize:14,fontWeight:700,marginBottom:6}}>{name}</div>
            <div style={{fontSize:12,color:"var(--text3)"}}>Coming soon</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

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
          {page==="tools" && <StudentToolsPage setPage={setPage}/>}
          {page==="dsa" && <DSAPage setPage={setPage}/>}
        </main>
        <Footer setPage={setPage}/>
        <HackBot hackathons={allHacks}/>
      </div>
    </>
  );
}
// force redeploy Sat Mar  7 21:55:44 IST 2026
