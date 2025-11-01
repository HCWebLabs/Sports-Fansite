// assets/js/app.mjs
console.debug("[APP] boot");

const BASE = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const DATA = `${BASE}/data`;

// helpers
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fetchJSON = async rel => {
  const r = await fetch(`${DATA}/${rel}?t=${Date.now()}`);
  if (!r.ok) throw new Error(`${r.status} ${rel}`);
  return r.json();
};

// =========================
// VIEW TRANSITIONS API HELPER
// =========================
const supportsViewTransitions = () => 
  typeof document !== 'undefined' && 
  'startViewTransition' in document;

/**
 * Wrapper for DOM updates with View Transitions API
 * Falls back gracefully for unsupported browsers
 */
const withViewTransition = (callback) => {
  if (!supportsViewTransitions()) {
    callback();
    return;
  }
  
  document.startViewTransition(() => {
    callback();
  });
};

// ---------- Time formatting in ET ----------
const TZ = "America/New_York";
const fmtET = (iso, withTime=true) => {
  if (!iso) return "TBA";
  const d = new Date(iso);
  const opt = withTime
    ? { month:"short", day:"numeric", hour:"numeric", minute:"2-digit", timeZone:TZ, timeZoneName:"short" }
    : { month:"short", day:"numeric", timeZone:TZ };
  const s = new Intl.DateTimeFormat([], opt).format(d);
  // force "ET" label (EDT/EST → ET)
  return s.replace(/\bE[DS]T\b/, "ET");
};

// kickoff derivation
const rawKick = g => g.start_time || (g.start_date ? `${g.start_date}T16:00:00Z` : null);
const homeTeam = g => g.home_team || g.homeTeam || g.home || "";
const awayTeam = g => g.away_team || g.awayTeam || g.away || "";
const oppForUT = g => (/tennessee/i.test(homeTeam(g)) ? awayTeam(g) : homeTeam(g));
const homeAway  = g => (/tennessee/i.test(homeTeam(g)) ? "Home" : (g.neutral_site ? "Neutral" : "Away"));
const resultForRow = g => {
  const hp = g.home_points ?? g.homePoints;
  const ap = g.away_points ?? g.awayPoints;
  if (hp==null && ap==null) return "";
  const utAway = /tennessee/i.test(awayTeam(g)||"");
  const ut = utAway ? ap : hp; const opp = utAway ? hp : ap;
  const tag = ut>opp ? "W" : ut<opp ? "L" : "T";
  return `${tag} ${ut}–${opp}`;
};

// =========================
// COUNTDOWN — ENHANCED with animation triggers
// =========================
let setCountdownKickoff = () => {};
let lastValues = { d: -1, h: -1, m: -1, s: -1 };

function initCountdown(){
  const el = $("#countdown"); if (!el) return;
  const dEl = $("#cd-days"), hEl = $("#cd-hrs"), mEl = $("#cd-min"), sEl = $("#cd-sec");
  let t0 = null;
  
  const animateBadge = (badge) => {
    if (!badge || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    badge.classList.remove('cd-active');
    void badge.offsetWidth; // Trigger reflow
    badge.classList.add('cd-active');
  };
  
  setCountdownKickoff = iso => { 
    t0 = iso ? new Date(iso).getTime() : null; 
    lastValues = { d: -1, h: -1, m: -1, s: -1 };
    tick(); 
  };
  
  const tick = () => {
    if (!t0) return;
    let diff = Math.max(0, Math.floor((t0 - Date.now())/1000));
    const d = Math.floor(diff/86400); diff%=86400;
    const h = Math.floor(diff/3600);  diff%=3600;
    const m = Math.floor(diff/60);    const s = diff%60;
    
    // Animate badges when values change
    if (d !== lastValues.d) {
      dEl.textContent = String(d).padStart(2,"0");
      animateBadge(dEl.closest('.cd-badge'));
      lastValues.d = d;
    }
    if (h !== lastValues.h) {
      hEl.textContent = String(h).padStart(2,"0");
      animateBadge(hEl.closest('.cd-badge'));
      lastValues.h = h;
    }
    if (m !== lastValues.m) {
      mEl.textContent = String(m).padStart(2,"0");
      animateBadge(mEl.closest('.cd-badge'));
      lastValues.m = m;
    }
    if (s !== lastValues.s) {
      sEl.textContent = String(s).padStart(2,"0");
      animateBadge(sEl.closest('.cd-badge'));
      lastValues.s = s;
    }
  };
  
  setInterval(tick, 1000);
}

// UI helpers
function setDotState(el, s){ if (el) el.setAttribute("data-state", s); }
function setBothScoreboxes(text, state="red"){
  withViewTransition(() => {
    $("#scoreMsg") && ($("#scoreMsg").textContent = text);
    setDotState($("#scoreDot"), state);
    $$(".scoreMsg").forEach(n => n.textContent = text);
    $$(".scoreDot").forEach(n => setDotState(n, state));
  });
}

// =========================
// SCHEDULE TABLE with View Transitions
// =========================
async function buildSchedule(){
  const table = $("#schedTable"); if (!table) return;
  const meta  = await fetchJSON("meta_current.json").catch(()=>({}));
  const sched = await fetchJSON("ut_2025_schedule.json").catch(()=>[]);
  
  withViewTransition(() => {
    $("#updatedAt2") && ($("#updatedAt2").textContent =
      (meta.lastUpdated ? meta.lastUpdated.replace("T"," ").replace("Z","") : "—"));
  });

  const sorted = [...sched].sort((a,b)=>{
    const ai = rawKick(a) || "2100-01-01T00:00:00Z";
    const bi = rawKick(b) || "2100-01-01T00:00:00Z";
    return new Date(ai)-new Date(bi);
  });

  withViewTransition(() => {
    $("#schedRows").innerHTML = sorted.map((g,idx)=>{
      const extra = idx>=3 ? ' data-extra="true"' : '';
      const iso = rawKick(g);
      return `<tr${extra}>
        <td>${fmtET(iso, !!g.start_time)}</td>
        <td>${oppForUT(g) || "—"}</td>
        <td>${homeAway(g)}</td>
        <td>${g.tv ?? g.television ?? "—"}</td>
        <td>${resultForRow(g)}</td>
      </tr>`;
    }).join("");
  });

  table.classList.add("table-collapsed");
  const wrap = table.closest(".table-wrap"); if (wrap) wrap.setAttribute("data-collapsed","true");
  const btn = $("#schedMore");
  if (btn){
    const set = open => {
      btn.innerHTML = open ? `<i class="fa-solid fa-angles-up"></i> See less`
                           : `<i class="fa-solid fa-angles-down"></i> See more`;
      btn.setAttribute("aria-expanded", String(open));
    };
    set(false);
    btn.addEventListener("click",()=>{
      withViewTransition(() => {
        const collapsed = table.classList.contains("table-collapsed");
        table.classList.toggle("table-collapsed", !collapsed ? true : false);
        const nowCollapsed = table.classList.contains("table-collapsed");
        if (wrap) wrap.setAttribute("data-collapsed", String(nowCollapsed));
        set(!nowCollapsed);
      });
    });
  }
}

// top strip: bye week / season complete / ranks / odds / ics
function dotForTiming(status, iso){
  const s = (status||"").toLowerCase();
  if (s.includes("final")) return "red";
  if (s.includes("in progress") || /1st|2nd|3rd|4th|half|qtr/i.test(s)) return "green";
  if (iso && new Date(iso).getTime() - Date.now() <= 72*3600*1000) return "yellow";
  return "red";
}
function weekBoundsET(date=new Date()){
  // start of week (Mon) and end-of-week (Sun) in ET
  const z = TZ;
  const d = new Date(date);
  const dow = new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:z}).format(d);
  const map = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const idx = map[dow];
  const start = new Date(d); start.setDate(d.getDate() - ((idx+6)%7)); start.setHours(0,0,0,0);
  const end   = new Date(start); end.setDate(start.getDate()+7);
  return [start,end];
}

async function buildTopStrip(){
  const meta  = await fetchJSON("meta_current.json").catch(()=>({}));
  const sched = await fetchJSON("ut_2025_schedule.json").catch(()=>[]);
  const ranks = await fetchJSON("current/rankings.json").catch(()=>[]);
  const lines = await fetchJSON("current/ut_lines.json").catch(()=>[]);

  // choose next/last by kickoff
  const withTs = sched.map(g=>({g, t: rawKick(g) ? new Date(rawKick(g)).getTime() : null})).filter(x=>x.t!=null).sort((a,b)=>a.t-b.t);
  const next = withTs.find(x=>x.t>Date.now())?.g || null;
  const last = [...withTs].reverse().find(x=>x.t<=Date.now())?.g || null;

  // Season complete?
  const seasonOver = !next && !!last;
  // Bye week? (no game in current ET week, but future games exist)
  let byeWeek = false;
  if (next){
    const [ws,we] = weekBoundsET(); // ET week window
    const inThisWeek = withTs.some(x => x.t>=ws.getTime() && x.t<we.getTime());
    const hasFuture   = withTs.some(x => x.t>=we.getTime());
    byeWeek = (!inThisWeek && hasFuture);
  }

  // Scorebox + upcoming panel WITH VIEW TRANSITIONS
  if (seasonOver){
    setBothScoreboxes("Season complete — thanks for riding with us! See you next season.", "red");
    withViewTransition(() => {
      $("#nextLine") && ($("#nextLine").textContent = "Season complete");
      $(".nextLine") && ($(".nextLine").textContent = "Season complete");
      $("#nextVenue") && ($("#nextVenue").textContent = "");
      $(".nextVenue") && ($(".nextVenue").textContent = "");
    });
    setCountdownKickoff(null);
    // Clear ICS link
    $("#downloadICS")  && ($("#downloadICS").style.display="none");
    $("#downloadICS2") && ($("#downloadICS2").style.display="none");
  } else if (byeWeek){
    setBothScoreboxes("Bye week — no game scheduled this week.", "yellow");
    // keep next game info visible
    const iso = rawKick(next);
    const when = fmtET(iso, !!next.start_time);
    const who = oppForUT(next);
    const wk = meta.weekNext ?? meta.week ?? next.week ?? "—";
    
    withViewTransition(() => {
      $("#nextLine") && ($("#nextLine").textContent = `Week ${wk}: Tennessee vs ${who} — ${when}`);
      $(".nextLine") && ($(".nextLine").textContent = `Week ${wk}: Tennessee vs ${who} — ${when}`);
      $("#nextVenue") && ($("#nextVenue").textContent = next.venue || "");
      $(".nextVenue") && ($(".nextVenue").textContent = next.venue || "");
    });
    setCountdownKickoff(iso);
  } else if (next){
    const iso = rawKick(next);
    const when = fmtET(iso, !!next.start_time);
    const msg = `${awayTeam(next)} @ ${homeTeam(next)} — ${when}`;
    setBothScoreboxes(msg, dotForTiming(next.status, iso));

    const who = oppForUT(next);
    const wk  = meta.weekNext ?? meta.week ?? next.week ?? "—";
    
    withViewTransition(() => {
      $("#nextLine") && ($("#nextLine").textContent = `Week ${wk}: Tennessee vs ${who} — ${when}`);
      $(".nextLine") && ($(".nextLine").textContent = `Week ${wk}: Tennessee vs ${who} — ${when}`);
      $("#nextVenue") && ($("#nextVenue").textContent = next.venue || "");
      $(".nextVenue") && ($(".nextVenue").textContent = next.venue || "");
    });
    setCountdownKickoff(iso);
  } else {
    setBothScoreboxes("No UT game found for this season.", "red");
    setCountdownKickoff(null);
  }

  // Calendar links — wrap calendar actions in proper container
  if (next){
    const iso = rawKick(next);
    if (iso){
      const start = new Date(iso); const end = new Date(start.getTime()+3*3600*1000);
      const fmt = d => d.toISOString().replace(/[-:]|\.\d{3}/g,"");
      const who = oppForUT(next);
      const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Tennessee vs ${who}`)}&dates=${fmt(start)}/${fmt(end)}&location=${encodeURIComponent(next.venue||"")}&details=${encodeURIComponent("Unofficial Gameday Hub")}`;
      
      withViewTransition(() => {
        $("#addToCalendar") && ($("#addToCalendar").href = calUrl);
        $$(".addToCalendar").forEach(a => a.href = calUrl);
      });
    }
    // ICS links (if file exists)
    const icsUrl = `${DATA}/current/ut_next.ics?t=${Date.now()}`;
    fetch(icsUrl, {method:"HEAD"}).then(r=>{
      if (r.ok){
        withViewTransition(() => {
          $("#downloadICS")  && ($("#downloadICS").setAttribute("href", icsUrl), ($("#downloadICS").style.display="inline-flex"));
          $("#downloadICS2") && ($("#downloadICS2").setAttribute("href", icsUrl), ($("#downloadICS2").style.display="inline-flex"));
        });
      }
    }).catch(()=>{});
  }

  // Rankings WITH VIEW TRANSITIONS
  const latest = Array.isArray(ranks) && ranks.length
    ? ranks.reduce((a,b)=> ((b.season??0)*100+(b.week??0)) > ((a.season??0)*100+(a.week??0)) ? b : a)
    : null;
  const polls = latest?.polls || [];
  const findRank = (name) => {
    const p = polls.find(x => (x.poll||"").toLowerCase().includes(name));
    const arr = p?.ranks || [];
    const hit = arr.find(x => /tennessee/i.test(x.school||x.team||""));
    return hit?.rank ?? "NR";
  };
  const rankLine = `AP: ${findRank("ap")}  •  Coaches: ${findRank("coach")}`;
  
  withViewTransition(() => {
    $("#rankLine") && ($("#rankLine").textContent = rankLine);
    $$(".rankLine").forEach(n => n.textContent = rankLine);
  });

  // Odds (first provider line) WITH VIEW TRANSITIONS
  let oddsText = "Odds data coming soon.";
  if (Array.isArray(lines) && lines.length){
    const match = lines.find(L => /tennessee/i.test(L.home_team||"") || /tennessee/i.test(L.away_team||"")) || null;
    const first = match?.lines?.[0]; 
    if (first) oddsText = `${first.provider || "—"}: spread ${first.spread ?? first.formattedSpread ?? "—"}, O/U ${first.overUnder ?? first.total ?? "—"}`;
  }
  
  withViewTransition(() => {
    $("#oddsLine") && ($("#oddsLine").textContent = oddsText);
  });
}

// guide accordion + nav WITH VIEW TRANSITIONS
function initGuideAccordion(){
  const extra=$("#guideExtra"), btn=$("#guideMore"); if(!extra||!btn) return;
  extra.hidden=true; extra.classList.add("is-collapsible");
  btn.addEventListener("click",()=>{
    withViewTransition(() => {
      const open=!extra.hidden; 
      extra.hidden=open; 
      extra.classList.toggle("is-open",!open);
      btn.setAttribute("aria-expanded", String(!open));
      btn.innerHTML=open?`<i class="fa-solid fa-angles-down"></i> See more`:`<i class="fa-solid fa-angles-up"></i> See less`;
    });
  });
  btn.setAttribute("aria-expanded","false");
  btn.innerHTML=`<i class="fa-solid fa-angles-down"></i> See more`;
}

function initNav(){
  const header=$(".site-header"), btn=$(".nav-toggle"), nav=$("#primaryNav");
  if(!header||!btn||!nav) return;
  btn.addEventListener("click",()=>{
    const open=header.getAttribute("data-open")==="true";
    header.setAttribute("data-open",String(!open));
    btn.setAttribute("aria-expanded",String(!open));
  });
  nav.addEventListener("click",e=>{
    if(e.target.closest("a")){ 
      header.setAttribute("data-open","false"); 
      btn.setAttribute("aria-expanded","false"); 
    }
  });
}

// places (optional) WITH VIEW TRANSITIONS
async function buildPlaces(){
  const list=$("#placesList"), empty=$("#placesEmpty");
  if(!list) return;
  const places = await fetchJSON("manual/places_knoxville.json").catch(()=>[]);
  
  withViewTransition(() => {
    if(!places.length){ 
      empty && (empty.hidden=false); 
      return; 
    }
    empty && (empty.hidden=true);
    list.innerHTML = places.map(p => 
      `<li><i class="fa-solid fa-location-dot"></i><span><strong>${p.name}</strong> — ${p.tip || p.kind || ""}</span></li>`
    ).join("");
  });
}

// =========================
// INITIALIZATION
// =========================
async function init(){
  console.debug("[APP] View Transitions supported:", supportsViewTransitions());
  
  initNav(); 
  initCountdown(); 
  initGuideAccordion();
  
  await Promise.all([
    buildSchedule(), 
    buildTopStrip(), 
    buildPlaces()
  ]);
  
  // Live updates on gameday
  if (new Date().getDay() === 6) {
    setInterval(buildTopStrip, 30000);
  }
  
  // Wrap calendar actions in proper containers
  wrapCalendarButtons();
}

/**
 * Helper to wrap calendar buttons in proper flex container
 * for better responsive behavior
 */
function wrapCalendarButtons() {
  // Top card
  const nextCard = $("#nextCard");
  if (nextCard) {
    const addBtn = nextCard.querySelector("#addToCalendar");
    const icsBtn = nextCard.querySelector("#downloadICS");
    if (addBtn && icsBtn && !addBtn.parentElement.classList.contains('calendar-actions')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'calendar-actions';
      addBtn.parentNode.insertBefore(wrapper, addBtn);
      wrapper.appendChild(addBtn);
      wrapper.appendChild(icsBtn);
    }
  }
  
  // Bottom strip
  $$('.strip-bottom .card').forEach(card => {
    const addBtn = card.querySelector(".addToCalendar");
    const icsBtn = card.querySelector("#downloadICS2");
    if (addBtn && icsBtn && !addBtn.parentElement.classList.contains('calendar-actions')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'calendar-actions';
      addBtn.parentNode.insertBefore(wrapper, addBtn);
      wrapper.appendChild(addBtn);
      wrapper.appendChild(icsBtn);
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
