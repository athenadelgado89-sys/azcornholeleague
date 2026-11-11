// Public AZCL website: directories, events calendar and submission forms.
(() => {
  const { sb, configured, $, esc, normUrl, safeHref, fileUrl, initials, parseDate, todayStr, fmtTime, uuid, toast, upload, VENDOR_CATS, FORMATS } = window.AZCL;

  const S = { open: new Set(), clubs: [], vendors: [], events: [], loaded: false, status: "loading", when: "upcoming", clubFilter: "", q: "", vq: "", vcat: "" };
  const clubById = id => S.clubs.find(c => c.id === id);
  $("#year").textContent = new Date().getFullYear();

  // Fill static dropdowns
  $("#vendor-cat-filter").innerHTML += VENDOR_CATS.map(c => `<option>${esc(c)}</option>`).join("");
  $("#vendor-category").innerHTML += VENDOR_CATS.map(c => `<option>${esc(c)}</option>`).join("");
  $("#ev-format").innerHTML += FORMATS.map(c => `<option>${esc(c)}</option>`).join("");
  $("#ev-date").min = todayStr();

  /* ---------- Routing ---------- */
  const VIEWS = ["home", "clubs", "vendors", "events", "players"];
  function route() {
    const h = location.hash.slice(1);
    const clubMatch = h.match(/^club-([0-9a-f-]{36})$/i);
    const playerMatch = h.match(/^player-([0-9a-f-]{36})$/i);
    const v = clubMatch ? "club" : playerMatch ? "player" : VIEWS.includes(h) ? h : "home";
    S.pageClub = clubMatch ? clubMatch[1] : null;
    S.pagePlayer = playerMatch ? playerMatch[1] : null;
    document.querySelectorAll("[data-view]").forEach(s => (s.hidden = s.dataset.view !== v));
    const navKey = v === "club" ? "clubs" : v === "player" ? "players" : v;
    document.querySelectorAll("[data-nav]").forEach(a => (a.dataset.nav === navKey ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    window.scrollTo(0, 0);
    if (v === "club") renderClubPage(); else document.title = "Arizona Cornhole League";
    if (v === "players") loadPlayers().then(renderPlayers);
    if (v === "player") renderPlayerPage();
  }
  addEventListener("hashchange", route);

  /* ---------- Rendering ---------- */
  function statusNote() {
    if (S.status === "unconfigured") return `<div class="notice">The directory database isn't connected yet.</div>`;
    if (S.status === "error") return `<div class="notice">Listings couldn't load right now. Refresh the page to try again.</div>`;
    return "";
  }
  const logoHtml = (path, name) => path
    ? `<img class="club-logo" src="${esc(fileUrl(path))}" alt="${esc(name)} logo" data-i="${esc(initials(name))}" loading="lazy">`
    : `<span class="club-logo" aria-hidden="true">${esc(initials(name))}</span>`;
  const chip = (href, label, cls = "") => safeHref(href) ? `<a class="chip ${cls}" href="${esc(href)}" target="_blank" rel="noopener">${label}</a>` : "";
  const GLOBE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
  const iconLink = (href, key, name) => {
    if (!safeHref(href)) return "";
    const ic = window.AZCL.ICONS[key];
    const svg = key === "website" ? GLOBE : `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="${ic.color}" d="${ic.path}"/></svg>`;
    const label = `${name} on ${key === "website" ? "the web" : ic.label}`;
    return `<a class="icon-link" href="${esc(href)}" target="_blank" rel="noopener" aria-label="${esc(label)}" title="${key === "website" ? "Website" : ic.label}">${svg}</a>`;
  };
  const socialIcons = (x) => ["website", "facebook", "instagram", "tiktok", "youtube"].map(k => iconLink(x[k], k, x.name)).join("");

  function renderClubs() {
    const q = S.q.trim().toLowerCase();
    const list = S.clubs.filter(c => !q || (c.name || "").toLowerCase().includes(q) || (c.city || "").toLowerCase().includes(q));
    const grid = $("#club-grid");
    if (!S.loaded && S.status === "loading") { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Loading clubs…</b></div>`; return; }
    if (!list.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>${q ? "No clubs match that search" : "No clubs listed yet"}</b>${q ? "Try a different club name or city." : "Use Add your club to submit the first listing."}</div>`;
      return;
    }
    grid.innerHTML = list.map(c => {
      const chips = chip(c.scoreholio, "Scoreholio", "sh") + socialIcons(c);
      return `<article class="club">
        <div class="club-top">${logoHtml(c.logo_path, c.name)}<div style="min-width:0"><h3>${esc(c.name)}</h3><div class="city">${esc(c.city)}, AZ</div></div></div>
        <div class="chips">${chips || `<span class="chip none">Links not added yet</span>`}</div>
        <div class="club-foot">
          <button class="linkbtn" type="button" data-edit-club="${esc(c.id)}">Update listing</button>
          <a class="btn btn-ghost btn-sm" href="#club-${esc(c.id)}">Club page →</a>
        </div>
      </article>`;
    }).join("");
  }

  function renderVendors() {
    const q = S.vq.trim().toLowerCase();
    const list = S.vendors.filter(v => (!S.vcat || v.category === S.vcat) && (!q || [v.name, v.blurb, v.city, v.category].some(x => (x || "").toLowerCase().includes(q))));
    const grid = $("#vendor-grid");
    if (!S.loaded && S.status === "loading") { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Loading vendors…</b></div>`; return; }
    if (!list.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>${q || S.vcat ? "No vendors match" : "No vendors listed yet"}</b>${q || S.vcat ? "Try a different search or category." : "Use Add your business to submit the first listing."}</div>`;
      return;
    }
    grid.innerHTML = list.map(v => {
      const chips = chip(v.shop, "Shop", "sh") + socialIcons(v);
      return `<article class="club">
        <div class="club-top">${logoHtml(v.logo_path, v.name)}<div style="min-width:0">${v.category ? `<span class="vtag">${esc(v.category)}</span>` : ""}<h3>${esc(v.name)}</h3>${v.city ? `<div class="city">${esc(v.city)}, AZ</div>` : ""}</div></div>
        ${v.blurb ? `<p class="blurb">${esc(v.blurb)}</p>` : ""}
        <div class="chips">${chips || `<span class="chip none">Links not added yet</span>`}</div>
        <div class="club-foot"><button class="linkbtn" type="button" data-edit-vendor="${esc(v.id)}">Update listing</button></div>
      </article>`;
    }).join("");
  }

  function renderClubOptions() {
    const opts = S.clubs.map(c => `<option value="${esc(c.id)}">${esc(c.name)} (${esc(c.city)})</option>`).join("");
    const sel = $("#ev-club"), cur = sel.value; sel.innerHTML = `<option value="">Select your club</option>` + opts; sel.value = cur;
    const f = $("#event-club-filter"); f.innerHTML = `<option value="">All clubs</option>` + opts; f.value = S.clubFilter;
    const hc = $("#host-club"), hv = hc.value; hc.innerHTML = `<option value="">Select your club</option>` + opts; hc.value = hv;
  }

  // When a club posts an event by hand that Scoreholio also imported, show only the imported copy.
  function visibleEvents() {
    const normTitle = t => (t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const imported = S.events.filter(e => e.source === "scoreholio");
    const isDuplicate = m => m.source !== "scoreholio" && imported.some(i => i.club_id === m.club_id && i.event_date === m.event_date &&
      (normTitle(i.title) === normTitle(m.title) || (m.scoreholio && i.scoreholio && m.scoreholio.replace(/\/$/, "") === i.scoreholio.replace(/\/$/, ""))));
    return S.events.filter(e => !isDuplicate(e));
  }
  const evKey = e => e.event_date + (e.start_time || "");

  function eventCard(e) {
    const d = parseDate(e.event_date), club = clubById(e.club_id);
    const sh = safeHref(e.scoreholio);
    let flyer = "";
    if (e.flyer_path) {
      flyer = /pdf/i.test(e.flyer_type || e.flyer_path)
        ? `<a class="flyer-pdf" href="${esc(fileUrl(e.flyer_path))}" target="_blank" rel="noopener">View flyer<br>(PDF)</a>`
        : `<button type="button" class="flyer" data-flyer="${esc(e.flyer_path)}" data-cap="${esc(e.title)}" aria-label="View flyer for ${esc(e.title)}" style="background:url('${esc(fileUrl(e.flyer_path))}') center/cover var(--sunk)"></button>`;
    }
    const showReg = Number.isInteger(e.registered_teams) && (e.registered_teams > 0 || e.max_teams);
    return `<article class="event">
      <div class="date"><div class="m">${d ? d.toLocaleString("en-US", { month: "short" }) : ""}</div><div class="d">${d ? d.getDate() : "?"}</div><div class="w">${d ? d.toLocaleString("en-US", { weekday: "short" }) : ""}</div></div>
      <div style="min-width:0">
        <h3>${esc(e.title)}</h3>
        <div class="meta"><span><b>${club ? `<a href="#club-${esc(club.id)}" class="club-link">${esc(club.name)}</a>` : "AZ club"}</b></span>${e.start_time ? `<span>${fmtTime(e.start_time)}</span>` : ""}<span>${esc(e.location)}</span>${e.format ? `<span class="tag">${esc(e.format)}</span>` : ""}</div>
        ${(e.entry_fee || showReg) ? `<div class="meta">${e.entry_fee ? `<span>Entry <b>${esc(e.entry_fee)}</b></span>` : ""}${showReg ? `<span><b>${e.registered_teams}</b>${e.max_teams ? ` of ${e.max_teams}` : ""} registered</span>` : ""}</div>` : ""}
        <div class="event-actions">${sh ? `<a class="btn btn-primary btn-sm" href="${esc(sh)}" target="_blank" rel="noopener">Open in Scoreholio ↗</a>` : ""}${e.details ? `<button type="button" class="details-toggle" data-details="${esc(e.id)}" aria-expanded="${S.open.has(e.id)}" aria-controls="det-${esc(e.id)}">Details <span class="chev" aria-hidden="true">▾</span></button>` : ""}${e.source === "scoreholio" ? `<span class="via">Event info from Scoreholio</span>` : ""}</div>
        ${e.details ? `<p class="details" id="det-${esc(e.id)}" ${S.open.has(e.id) ? "" : "hidden"}>${esc(e.details)}</p>` : ""}
      </div>
      <div class="flyer-col">${flyer}</div>
    </article>`;
  }

  function renderEvents() {
    const box = $("#event-list"), today = todayStr();
    if (!S.loaded && S.status === "loading") { box.innerHTML = `<div class="empty"><b>Loading events…</b></div>`; return; }
    let list = visibleEvents().filter(e => (S.when === "upcoming" ? e.event_date >= today : e.event_date < today));
    if (S.clubFilter) list = list.filter(e => e.club_id === S.clubFilter);
    list.sort((a, b) => (S.when === "upcoming" ? evKey(a).localeCompare(evKey(b)) : evKey(b).localeCompare(evKey(a))));
    if (!list.length) {
      box.innerHTML = `<div class="empty"><b>${S.when === "upcoming" ? "No upcoming events posted yet" : "No past events"}</b>${S.when === "upcoming" ? `Club organizers can add one with <button class="linkbtn" type="button" data-open="event">Post Event Here</button>.` : "Events move here after their date."}</div>`;
      return;
    }
    box.innerHTML = list.map(eventCard).join("");
  }

  /* ---------- Players ---------- */
  let playersPromise = null;
  function loadPlayers(force) {
    if (!sb) return Promise.resolve([]);
    if (!playersPromise || force) playersPromise = sb.from("players").select("id,display_name,city,home_club_id,photo_path,about,website,facebook,instagram,tiktok,youtube,scoreholio_player_id").eq("hidden", false).order("display_name")
      .then(r => { S.players = r.error ? [] : r.data; S.playersReady = !r.error; return S.players; });
    return playersPromise;
  }
  const playerPhoto = (p, cls = "club-logo") => p.photo_path
    ? `<img class="${cls}" src="${esc(fileUrl(p.photo_path))}" alt="${esc(p.display_name)}" data-i="${esc(initials(p.display_name))}" loading="lazy">`
    : `<span class="${cls}" aria-hidden="true">${esc(initials(p.display_name))}</span>`;
  function renderPlayers() {
    const grid = $("#player-grid"); if (!grid) return;
    if (!S.players) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Loading players…</b></div>`; return; }
    if (!S.playersReady) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Player profiles are coming soon</b>Check back shortly.</div>`; return; }
    const q = (S.pq || "").trim().toLowerCase();
    const list = S.players.filter(p => { const c = clubById(p.home_club_id); return !q || [p.display_name, p.city, c && c.name].some(x => (x || "").toLowerCase().includes(q)); });
    if (!list.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>${q ? "No players match that search" : "No player profiles yet"}</b>${q ? "Try a different name, city or club." : `Be the first: <a href="player.html">create your profile</a>.`}</div>`; return; }
    grid.innerHTML = list.map(p => {
      const c = clubById(p.home_club_id);
      return `<article class="club">
        <div class="club-top">${playerPhoto(p)}<div style="min-width:0"><h3>${esc(p.display_name)}</h3><div class="city">${[p.city ? esc(p.city) + ", AZ" : "", c ? esc(c.name) : ""].filter(Boolean).join(" · ")}</div></div></div>
        ${p.about ? `<p class="blurb">${esc(p.about.length > 120 ? p.about.slice(0, 117) + "…" : p.about)}</p>` : ""}
        <div class="club-foot"><span class="chips">${socialIcons({ ...p, name: p.display_name })}</span><a class="btn btn-ghost btn-sm" href="#player-${esc(p.id)}">Profile →</a></div>
      </article>`;
    }).join("");
  }
  const normName = n => (n || "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  const ordinal = n => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
  async function renderPlayerPage() {
    const box = $("#player-page"); const id = S.pagePlayer; if (!id) return;
    box.innerHTML = `<div class="empty"><b>Loading player…</b></div>`;
    await loadPlayers();
    const p = (S.players || []).find(x => x.id === id);
    if (!p) { box.innerHTML = `<div class="empty"><b>Player not found</b><a href="#players">Browse all players</a></div>`; return; }
    document.title = `${p.display_name} · Arizona Cornhole League`;
    const [ph, sp, rs, st] = await Promise.all([
      sb.from("player_photos").select("path,caption").eq("player_id", id).order("created_at", { ascending: false }),
      sb.from("player_sponsors").select("name,url,logo_path").eq("player_id", id).order("created_at"),
      sb.from("player_results").select("event_name,event_date,finish,division,partner").eq("player_id", id).order("event_date", { ascending: false }),
      p.scoreholio_player_id
        ? sb.from("season_player_stats").select("*").eq("scoreholio_player_id", p.scoreholio_player_id)
        : sb.from("season_player_stats").select("*").ilike("player_name", p.display_name)
    ]);
    if (S.pagePlayer !== id) return;
    const photos = ph.data || [], sponsors = sp.data || [], results = rs.data || [];
    // Season stats: use the linked Scoreholio player, or a single exact name match
    let stats = (st.data || []);
    if (!p.scoreholio_player_id) {
      const ids = [...new Set(stats.filter(r => normName(r.player_name) === normName(p.display_name)).map(r => r.scoreholio_player_id))];
      stats = ids.length === 1 ? stats.filter(r => r.scoreholio_player_id === ids[0]) : [];
    }
    const overall = stats.filter(r => /^all$/i.test(r.division) || /overall/i.test(r.division));
    const statRows = overall.length ? overall : stats;
    const club = clubById(p.home_club_id);
    const section = (title, html) => `<section class="cp-sec"><h2>${title}</h2>${html}</section>`;
    box.innerHTML = `
      <a class="back-link" href="#players">← All players</a>
      <header class="cp-head">
        ${playerPhoto(p, "cp-logo pl-photo")}
        <div class="cp-id">
          <span class="eyebrow">Arizona player</span>
          <h1>${esc(p.display_name)}</h1>
          <div class="city">${[p.city ? esc(p.city) + ", AZ" : "", club ? `Home club: <a class="club-link" href="#club-${esc(club.id)}">${esc(club.name)}</a>` : ""].filter(Boolean).join(" · ")}</div>
          <div class="chips">${socialIcons({ ...p, name: p.display_name })}</div>
        </div>
      </header>
      ${statRows.length ? `<div class="pl-stats">${statRows.slice(0, 1).map(r => `
        <div class="pl-stat"><b>${r.played ?? 0}</b><span>Events played</span></div>
        <div class="pl-stat"><b>${r.rank ? "#" + r.rank : "–"}</b><span>Season rank</span></div>
        <div class="pl-stat"><b>${r.points != null ? Number(r.points).toLocaleString() : "–"}</b><span>Points</span></div>
        <div class="pl-stat"><b>${r.first ?? 0}</b><span>Wins</span></div>
        <div class="pl-stat"><b>${r.podium ?? 0}</b><span>Podiums</span></div>
        <div class="pl-stat"><b>${r.best ? ordinal(r.best) : "–"}</b><span>Best finish</span></div>`).join("")}
        <p class="via pl-stats-src">${esc(statRows[0].season_name || "AZCL season")} standings from Scoreholio</p></div>` : ""}
      <div class="cp-grid">
        <div class="cp-main">
          ${p.about ? section("About me", `<p class="cp-about">${esc(p.about)}</p>`) : ""}
          ${photos.length ? section("Podium photos", `<div class="cp-photos">${photos.map(x => `<button type="button" class="cp-photo" data-flyer="${esc(x.path)}" data-cap="${esc(x.caption || p.display_name)}" aria-label="View photo${x.caption ? ": " + esc(x.caption) : ""}"><img src="${esc(fileUrl(x.path))}" alt="${esc(x.caption || "")}" loading="lazy"></button>`).join("")}</div>`) : ""}
          ${section("Results", results.length ? `<div class="table-wrap"><table class="results"><thead><tr><th>Date</th><th>Event</th><th>Finish</th><th>Division</th></tr></thead><tbody>${results.map(r => `<tr><td>${esc(window.AZCL.fmtDate(r.event_date))}</td><td>${esc(r.event_name)}${r.partner ? `<div class="muted" style="font-size:12px">with ${esc(r.partner)}</div>` : ""}</td><td><b>${esc(r.finish)}</b></td><td>${esc(r.division || "")}</td></tr>`).join("")}</tbody></table></div><p class="via">Results added by the player.</p>` : `<p class="muted">No results added yet.</p>`)}
        </div>
        <aside class="cp-side">
          ${sponsors.length ? `<section class="cp-card"><span class="eyebrow">Sponsored by</span><div class="sponsors">${sponsors.map(x => {
            const inner = x.logo_path ? `<img src="${esc(fileUrl(x.logo_path))}" alt="${esc(x.name)}">` : `<b>${esc(x.name)}</b>`;
            return safeHref(x.url) ? `<a class="sponsor" href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(x.name)}">${inner}</a>` : `<span class="sponsor" title="${esc(x.name)}">${inner}</span>`;
          }).join("")}</div></section>` : ""}
          <p class="muted cp-manage"><a href="player.html">Is this you? Edit your profile</a></p>
        </aside>
      </div>`;
  }

  /* ---------- Club page ---------- */
  const extrasCache = {};
  async function loadClubExtras(id) {
    if (extrasCache[id]) return extrasCache[id];
    const [p, sp] = await Promise.all([
      sb.from("club_photos").select("id,path,caption").eq("club_id", id).order("created_at", { ascending: false }),
      sb.from("club_sponsors").select("id,name,logo_path,url").eq("club_id", id).order("created_at")
    ]);
    return (extrasCache[id] = { photos: p.error ? [] : p.data, sponsors: sp.error ? [] : sp.data });
  }
  async function renderClubPage() {
    const box = $("#club-page");
    if (!S.pageClub) return;
    if (!S.loaded) { box.innerHTML = `<div class="empty"><b>Loading club…</b></div>`; return; }
    const c = clubById(S.pageClub);
    if (!c) { box.innerHTML = `<div class="empty"><b>Club not found</b><a href="#clubs">Browse all clubs</a></div>`; return; }
    document.title = `${c.name} · Arizona Cornhole League`;
    const id = c.id;
    const ex = sb ? await loadClubExtras(id) : { photos: [], sponsors: [] };
    if (S.pageClub !== id) return; // navigated away while loading
    const today = todayStr();
    const upcoming = visibleEvents().filter(e => e.club_id === id && e.event_date >= today).sort((a, b) => evKey(a).localeCompare(evKey(b)));
    const types = c.event_types || [];
    const booking = c.booking_enabled && c.booking_email;
    const mail = booking ? `mailto:${encodeURIComponent(c.booking_email).replace(/%40/g, "@")}?subject=${encodeURIComponent("Booking inquiry for " + c.name + " (via azcornholeleague.com)")}` : "";
    const hasPotw = !!c.potw_name;
    const empty = !c.about && !types.length && !ex.photos.length && !ex.sponsors.length && !hasPotw;
    const section = (title, html) => `<section class="cp-sec"><h2>${title}</h2>${html}</section>`;
    box.innerHTML = `
      <a class="back-link" href="#clubs">← All clubs</a>
      <header class="cp-head">
        ${c.logo_path ? `<img class="cp-logo" src="${esc(fileUrl(c.logo_path))}" alt="${esc(c.name)} logo">` : `<span class="cp-logo">${esc(initials(c.name))}</span>`}
        <div class="cp-id">
          <span class="eyebrow">AZ cornhole club</span>
          <h1>${esc(c.name)}</h1>
          <div class="city">${esc(c.city)}, AZ</div>
          <div class="chips">${chip(c.scoreholio, "Scoreholio", "sh")}${socialIcons(c)}</div>
        </div>
        ${booking ? `<div class="cp-book">
          <a class="btn btn-primary" href="${esc(mail)}">Book us</a>
          <span>or email <b class="sel">${esc(c.booking_email)}</b></span>
        </div>` : ""}
      </header>
      ${types.length ? `<div class="cp-types" aria-label="Events we run">${types.map(t => `<span class="type-chip">${esc(t)}</span>`).join("")}</div>` : ""}
      ${empty ? `<div class="notice">${esc(c.name)} hasn't set up its club page yet. Run this club? <a href="manage.html?club=${esc(id)}">Sign in to add your About Us, photos and more</a>.</div>` : ""}
      <div class="cp-grid">
        <div class="cp-main">
          ${c.about ? section("About us", `<p class="cp-about">${esc(c.about)}</p>`) : ""}
          ${ex.photos.length ? section("Photos", `<div class="cp-photos">${ex.photos.map(ph => `<button type="button" class="cp-photo" data-flyer="${esc(ph.path)}" data-cap="${esc(ph.caption || c.name)}" aria-label="View photo${ph.caption ? ": " + esc(ph.caption) : ""}"><img src="${esc(fileUrl(ph.path))}" alt="${esc(ph.caption || "")}" loading="lazy"></button>`).join("")}</div>`) : ""}
          ${section("Upcoming events", upcoming.length ? `<div class="events">${upcoming.slice(0, 8).map(eventCard).join("")}</div>${upcoming.length > 8 ? `<p><button class="linkbtn" type="button" data-club-events="${esc(id)}">See all ${upcoming.length} events →</button></p>` : ""}` : `<p class="muted">No upcoming events posted yet.</p>`)}
        </div>
        <aside class="cp-side">
          ${hasPotw ? `<section class="cp-card potw">
            <span class="eyebrow">Player of the week</span>
            ${c.potw_photo_path ? `<img class="potw-photo" src="${esc(fileUrl(c.potw_photo_path))}" alt="${esc(c.potw_name)}">` : ""}
            <h3>${esc(c.potw_name)}</h3>
            ${c.potw_blurb ? `<p>${esc(c.potw_blurb)}</p>` : ""}
          </section>` : ""}
          ${ex.sponsors.length ? `<section class="cp-card">
            <span class="eyebrow">Club sponsors</span>
            <div class="sponsors">${ex.sponsors.map(sp => {
              const inner = sp.logo_path ? `<img src="${esc(fileUrl(sp.logo_path))}" alt="${esc(sp.name)}">` : `<b>${esc(sp.name)}</b>`;
              return safeHref(sp.url) ? `<a class="sponsor" href="${esc(sp.url)}" target="_blank" rel="noopener" title="${esc(sp.name)}">${inner}</a>` : `<span class="sponsor" title="${esc(sp.name)}">${inner}</span>`;
            }).join("")}</div>
          </section>` : ""}
          <p class="muted cp-manage"><a href="manage.html?club=${esc(id)}">Manage this club page</a></p>
        </aside>
      </div>`;
  }

  function renderStats() {
    const t = todayStr();
    $("#stat-clubs").textContent = S.loaded ? S.clubs.length : "–";
    $("#stat-vendors").textContent = S.loaded ? S.vendors.length : "–";
    $("#stat-events").textContent = S.loaded ? S.events.filter(e => e.event_date >= t).length : "–";
  }
  function render() {
    document.querySelectorAll(".db-note").forEach(n => (n.innerHTML = statusNote()));
    renderStats(); renderClubs(); renderVendors(); renderClubOptions(); renderEvents();
    if (S.pageClub) renderClubPage();
    if (S.pagePlayer) renderPlayerPage();
    if (S.players) renderPlayers();
  }

  /* ---------- Loading ---------- */
  // Newer columns come from the Scoreholio import; fall back if that database step hasn't been run.
  const EV_BASE = "id,club_id,title,event_date,start_time,format,location,scoreholio,details,flyer_path,flyer_type";
  async function loadEvents() {
    const r = await sb.from("events").select(EV_BASE + ",source,entry_fee,registered_teams,max_teams").eq("status", "approved").order("event_date");
    return r.error ? sb.from("events").select(EV_BASE).eq("status", "approved").order("event_date") : r;
  }
  const CLUB_BASE = "id,name,city,logo_path,website,facebook,instagram,tiktok,youtube,scoreholio";
  async function loadClubs() {
    const r = await sb.from("clubs").select(CLUB_BASE + ",about,event_types,booking_enabled,booking_email,potw_name,potw_blurb,potw_photo_path").eq("status", "approved").order("name");
    return r.error ? sb.from("clubs").select(CLUB_BASE).eq("status", "approved").order("name") : r;
  }
  /* ---------- Season 1: State Region Events (from the admin page) ---------- */
  function sponsorGroups(list) {
    const { SPONSOR_ROLES } = window.AZCL;
    return SPONSOR_ROLES.map(role => {
      const items = list.filter(x => x.role === role);
      if (!items.length) return "";
      const label = items.length > 1 ? (role === "Sponsor" ? "Sponsors" : role.endsWith("sponsor") ? role + "s" : role + "s") : role;
      return `<div><dt>${esc(label)}</dt><dd><ul class="sre-vendors">${items.map(x => {
        const inner = `${x.logo_path ? `<img class="sre-sp-logo" src="${esc(fileUrl(x.logo_path))}" alt="" loading="lazy">` : ""}<span>${esc(x.name)}</span>`;
        return `<li>${safeHref(x.url) ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${inner}</a>` : inner}</li>`;
      }).join("")}</ul></dd></div>`;
    }).join("");
  }
  function renderSeason(events, sponsors) {
    const box = $("#sre"); if (!box || !events.length) return;
    const set = events.filter(e => e.status === "set"), soon = events.filter(e => e.status !== "set");
    const feature = e => {
      const sp = sponsors.filter(x => x.slot === e.slot);
      const where = [e.venue, e.city ? e.city + ", AZ" : ""].filter(Boolean).join(" · ");
      const logo = e.logo_path ? `<img src="${esc(fileUrl(e.logo_path))}" alt="${esc(e.title || "")}">` : `<span class="sre-logo-text">${esc(e.title || "")}</span>`;
      const hex = v => /^#[0-9a-f]{6}$/i.test(v || "") ? v : null;
      const vars = [["--sre-bg", e.theme_bg], ["--sre-ink", e.theme_text], ["--sre-accent", e.theme_accent], ["--sre-hl", e.theme_highlight]].filter(([, v]) => hex(v)).map(([k, v]) => `${k}:${v}`).join(";");
      // Two-tone title like the event's own branding: second half of the words in the accent color
      const words = (e.title || "To be announced").split(/\s+/), cut = Math.ceil(words.length / 2);
      const title = words.length > 1 && hex(e.theme_accent) ? `${esc(words.slice(0, cut).join(" "))} <span class="t2">${esc(words.slice(cut).join(" "))}</span>` : esc(words.join(" "));
      return `<article class="sre-feature${e.theme_font === "bebas" ? " font-bebas" : ""}"${vars ? ` style="${vars}"` : ""}>
        ${safeHref(e.details_url) ? `<a class="sre-logo" href="${esc(e.details_url)}" target="_blank" rel="noopener" aria-label="${esc(e.title)} event details">${logo}</a>` : `<div class="sre-logo">${logo}</div>`}
        <div class="sre-body">
          <span class="sre-num">State Region Event ${e.slot}</span>
          <h3>${title}</h3>
          ${(e.dates_text || where) ? `<p class="sre-when">${e.dates_text ? `<b>${esc(e.dates_text)}</b>` : ""}${where ? `<span>${esc(where)}</span>` : ""}</p>` : ""}
          ${e.blurb ? `<p class="sre-blurb">${esc(e.blurb)}</p>` : ""}
          <div class="sre-actions">
            ${safeHref(e.register_url) ? `<a class="btn btn-primary" href="${esc(e.register_url)}" target="_blank" rel="noopener">Register on Scoreholio ↗</a>` : ""}
            ${safeHref(e.details_url) ? `<a class="btn btn-ghost" href="${esc(e.details_url)}" target="_blank" rel="noopener">Event details ↗</a>` : ""}
          </div>
        </div>
        ${sp.length ? `<div class="sre-thanks"><span class="eyebrow">Thank you to our partners and sponsors</span><dl>${sponsorGroups(sp)}</dl></div>` : `<div></div>`}
      </article>`;
    };
    box.innerHTML = `<h2 id="sre-title" class="sr-only">Season 1 State Region Events</h2>
      ${set.map(feature).join("")}
      ${soon.length ? `<div class="sre-grid">${soon.map(e => `<article class="sre-soon"><span class="sre-num">State Region Event ${e.slot}</span><b>Coming soon</b><button class="linkbtn" type="button" data-host="${e.slot}">Request to host →</button></article>`).join("")}</div>` : ""}`;
  }
  async function loadSeason() {
    const [ev, sp] = await Promise.all([
      sb.from("season_events").select("*").order("slot"),
      sb.from("season_sponsors").select("*").order("created_at")
    ]);
    if (!ev.error && !sp.error) renderSeason(ev.data, sp.data); // otherwise keep the built-in version
  }

  async function load() {
    if (!sb) { S.status = configured ? "error" : "unconfigured"; render(); return; }
    loadSeason().catch(() => {});
    try {
      const [c, v, e] = await Promise.all([
        loadClubs(),
        sb.from("vendors").select("id,name,category,city,blurb,logo_path,website,shop,facebook,instagram,tiktok,youtube").eq("status", "approved").order("name"),
        loadEvents()
      ]);
      if (c.error || v.error || e.error) throw c.error || v.error || e.error;
      S.clubs = c.data; S.vendors = v.data; S.events = e.data; S.loaded = true; S.status = "ready";
    } catch (x) { console.error(x); S.status = "error"; }
    render();
  }

  /* ---------- Dialogs and clicks ---------- */
  const openDlg = id => { const d = document.getElementById(id); if (!d.open) d.showModal(); };
  const closeDlg = d => d && d.open && d.close();
  document.addEventListener("click", e => {
    const dt = e.target.closest("[data-details]");
    if (dt) {
      const id = dt.dataset.details, panel = document.getElementById("det-" + id), open = dt.getAttribute("aria-expanded") !== "true";
      dt.setAttribute("aria-expanded", String(open)); if (panel) panel.hidden = !open;
      open ? S.open.add(id) : S.open.delete(id);
      return;
    }
    const hb = e.target.closest("[data-host]");
    if (hb) { openHostForm(hb.dataset.host); return; }
    const t = e.target.closest("[data-open],[data-close],[data-edit-club],[data-edit-vendor],[data-club-events],[data-flyer],[data-when]");
    if (!t) return;
    if (t.dataset.open === "club") openClubForm(null);
    else if (t.dataset.open === "event") openEventForm();
    else if (t.dataset.open === "vendor") openVendorForm(null);
    else if (t.hasAttribute("data-close")) closeDlg(t.closest("dialog"));
    else if (t.dataset.editClub) openClubForm(t.dataset.editClub);
    else if (t.dataset.editVendor) openVendorForm(t.dataset.editVendor);
    else if (t.dataset.clubEvents) { S.clubFilter = t.dataset.clubEvents; S.when = "upcoming"; syncSeg(); location.hash = "events"; renderEvents(); renderClubOptions(); }
    else if (t.dataset.flyer) { $("#lb-img").src = fileUrl(t.dataset.flyer); $("#lb-img").alt = "Flyer for " + t.dataset.cap; $("#lb-cap").textContent = t.dataset.cap; openDlg("lightbox"); }
    else if (t.dataset.when) { S.when = t.dataset.when; syncSeg(); renderEvents(); }
  });
  function syncSeg() { document.querySelectorAll("[data-when]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.when === S.when))); }
  $("#player-search").addEventListener("input", e => { S.pq = e.target.value; renderPlayers(); });
  $("#club-search").addEventListener("input", e => { S.q = e.target.value; renderClubs(); });
  $("#vendor-search").addEventListener("input", e => { S.vq = e.target.value; renderVendors(); });
  $("#vendor-cat-filter").addEventListener("change", e => { S.vcat = e.target.value; renderVendors(); });
  $("#event-club-filter").addEventListener("change", e => { S.clubFilter = e.target.value; renderEvents(); });
  $("#ev-add-club").addEventListener("click", () => { closeDlg($("#dlg-event")); openClubForm(null); });
  document.addEventListener("error", e => {
    const img = e.target;
    if (img && img.tagName === "IMG" && img.classList.contains("club-logo") && img.dataset.i) {
      const s = document.createElement("span"); s.className = "club-logo"; s.textContent = img.dataset.i; img.replaceWith(s);
    }
  }, true);

  /* ---------- Shared submit helpers ---------- */
  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  function readLinks(prefix, keys, err) {
    const out = {};
    for (const [k, label] of keys) {
      const u = normUrl($(`#${prefix}-${k}`).value);
      if (u === null) { err.textContent = `The ${label} link isn't a valid web address.`; return null; }
      out[k] = u || null;
    }
    return out;
  }
  function readContact(prefix, err) {
    const name = $(`#${prefix}-cname`).value.trim(), email = $(`#${prefix}-cemail`).value.trim();
    const phoneEl = $(`#${prefix}-cphone`), phone = phoneEl ? phoneEl.value.trim() : "";
    if (!name || !emailOk(email)) { err.textContent = "Add your name and a valid email so AZCL can reach you."; return null; }
    return { name, email, phone: phone || null };
  }
  async function saveContact(type, id, c) {
    const { error } = await sb.from("submission_contacts").insert({ item_type: type, item_id: id, ...c });
    if (error) console.warn("contact not saved", error);
  }
  const friendly = x => (x && x.message) ? x.message : "Something went wrong. Try again.";
  function notReady(err) { if (!sb) { err.textContent = "Submissions aren't open yet. Check back soon."; return true; } return false; }

  /* ---------- Club form ---------- */
  const CLUB_LINKS = [["scoreholio", "Scoreholio"], ["website", "website"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["youtube", "YouTube"]];
  function openClubForm(id) {
    const c = id ? clubById(id) : null;
    $("#club-form").reset(); $("#club-err").textContent = "";
    $("#club-id").value = c ? c.id : "";
    $("#club-title").textContent = c ? "Update club listing" : "Add your club";
    $("#club-name").value = c ? c.name : ""; $("#club-city").value = c ? c.city : "";
    CLUB_LINKS.forEach(([k]) => ($(`#club-${k}`).value = c ? (c[k] || "") : ""));
    const cur = $("#club-logo-current");
    if (c && c.logo_path) { cur.hidden = false; cur.innerHTML = `<img src="${esc(fileUrl(c.logo_path))}" alt="">Current logo. Choose a file to replace it.`; } else { cur.hidden = true; cur.innerHTML = ""; }
    openDlg("dlg-club");
  }
  $("#club-form").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#club-err"); err.textContent = "";
    if (notReady(err)) return;
    if ($("#club-hp").value) { closeDlg($("#dlg-club")); return; }
    const name = $("#club-name").value.trim(), city = $("#club-city").value.trim();
    if (!name || !city) { err.textContent = "Add your club name and city."; return; }
    const links = readLinks("club", CLUB_LINKS, err); if (!links) return;
    const contact = readContact("club", err); if (!contact) return;
    const replaces = $("#club-id").value || null, orig = replaces ? clubById(replaces) : null;
    const btn = $("#club-save"); btn.disabled = true; btn.textContent = "Submitting…";
    try {
      const file = $("#club-logo").files[0];
      const logo_path = file ? await upload("clubs", file) : (orig ? orig.logo_path : null);
      const id = uuid();
      const { error } = await sb.from("clubs").insert({ id, status: "pending", replaces, name, city, logo_path, ...links });
      if (error) throw error;
      await saveContact("club", id, contact);
      closeDlg($("#dlg-club"));
      toast(replaces ? "Thanks! Your update will show once AZCL approves it." : "Thanks! Your club will appear once AZCL approves it.");
    } catch (x) { err.textContent = "Couldn't submit: " + friendly(x); }
    finally { btn.disabled = false; btn.textContent = "Submit for review"; }
  });

  /* ---------- Vendor form ---------- */
  const VENDOR_LINKS = [["website", "website"], ["shop", "shop"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["youtube", "YouTube"]];
  function openVendorForm(id) {
    const v = id ? S.vendors.find(x => x.id === id) : null;
    $("#vendor-form").reset(); $("#vendor-err").textContent = "";
    $("#vendor-id").value = v ? v.id : "";
    $("#vendor-title").textContent = v ? "Update vendor listing" : "Add your business";
    ["name", "category", "city", "blurb"].forEach(k => ($(`#vendor-${k}`).value = v ? (v[k] || "") : ""));
    VENDOR_LINKS.forEach(([k]) => ($(`#vendor-${k}`).value = v ? (v[k] || "") : ""));
    const cur = $("#vendor-logo-current");
    if (v && v.logo_path) { cur.hidden = false; cur.innerHTML = `<img src="${esc(fileUrl(v.logo_path))}" alt="">Current logo. Choose a file to replace it.`; } else { cur.hidden = true; cur.innerHTML = ""; }
    openDlg("dlg-vendor");
  }
  $("#vendor-form").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#vendor-err"); err.textContent = "";
    if (notReady(err)) return;
    if ($("#vendor-hp").value) { closeDlg($("#dlg-vendor")); return; }
    const val = k => $(`#vendor-${k}`).value.trim();
    if (!val("name") || !val("category")) { err.textContent = "Add your business name and category."; return; }
    const links = readLinks("vendor", VENDOR_LINKS, err); if (!links) return;
    const contact = readContact("vendor", err); if (!contact) return;
    const replaces = $("#vendor-id").value || null, orig = replaces ? S.vendors.find(x => x.id === replaces) : null;
    const btn = $("#vendor-save"); btn.disabled = true; btn.textContent = "Submitting…";
    try {
      const file = $("#vendor-logo").files[0];
      const logo_path = file ? await upload("vendors", file) : (orig ? orig.logo_path : null);
      const id = uuid();
      const { error } = await sb.from("vendors").insert({ id, status: "pending", replaces, name: val("name"), category: val("category"), city: val("city") || null, blurb: val("blurb") || null, logo_path, ...links });
      if (error) throw error;
      await saveContact("vendor", id, contact);
      closeDlg($("#dlg-vendor"));
      toast(replaces ? "Thanks! Your update will show once AZCL approves it." : "Thanks! Your listing will appear once AZCL approves it.");
    } catch (x) { err.textContent = "Couldn't submit: " + friendly(x); }
    finally { btn.disabled = false; btn.textContent = "Submit for review"; }
  });

  /* ---------- Request to host a State Region Event ---------- */
  function openHostForm(slot) {
    $("#host-form").reset(); $("#host-err").textContent = "";
    $("#host-slot").value = slot;
    $("#host-title").textContent = `Request to host State Region Event ${slot}`;
    openDlg("dlg-host");
  }
  $("#host-club").addEventListener("change", e => { const c = clubById(e.target.value); if (c && !$("#host-city").value) $("#host-city").value = c.city; });
  $("#host-add-club").addEventListener("click", () => { closeDlg($("#dlg-host")); openClubForm(null); });
  $("#host-form").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#host-err"); err.textContent = "";
    if (notReady(err)) return;
    if ($("#host-hp").value) { closeDlg($("#dlg-host")); return; }
    const v = k => $(`#host-${k}`).value.trim();
    const missing = [["club", "your club"], ["venue", "venue"], ["city", "city"], ["dates", "preferred dates"]].filter(([k]) => !v(k)).map(([, l]) => l);
    if (missing.length) { err.textContent = "Add " + missing.join(", ") + "."; return; }
    const contact = readContact("host", err); if (!contact) return;
    const btn = $("#host-save"); btn.disabled = true; btn.textContent = "Sending…";
    try {
      const boards = parseInt(v("boards"), 10);
      const { error } = await sb.from("host_requests").insert({
        slot: Number(v("slot")) || null, club_id: v("club"), venue: v("venue"), city: v("city"), preferred_dates: v("dates"),
        boards: Number.isFinite(boards) ? boards : null, notes: v("notes") || null,
        contact_name: contact.name, contact_email: contact.email, contact_phone: contact.phone
      });
      if (error) throw error;
      closeDlg($("#dlg-host"));
      toast("Thanks! AZCL will be in touch about hosting.");
    } catch (x) { err.textContent = "Couldn't send: " + friendly(x); }
    finally { btn.disabled = false; btn.textContent = "Send request"; }
  });

  /* ---------- Event form ---------- */
  function openEventForm() {
    $("#event-form").reset(); $("#ev-err").textContent = "";
    if (S.clubFilter) { $("#ev-club").value = S.clubFilter; const c = clubById(S.clubFilter); if (c) $("#ev-location").value = c.city + ", AZ"; }
    openDlg("dlg-event");
  }
  $("#ev-club").addEventListener("change", e => {
    const c = clubById(e.target.value), loc = $("#ev-location");
    if (c && !loc.value) loc.value = c.city + ", AZ";
  });
  $("#event-form").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#ev-err"); err.textContent = "";
    if (notReady(err)) return;
    if ($("#ev-hp").value) { closeDlg($("#dlg-event")); return; }
    const v = k => $(`#ev-${k}`).value.trim();
    const missing = [["club", "hosting club"], ["name", "event name"], ["date", "date"], ["location", "location"], ["scoreholio", "Scoreholio link"]].filter(([k]) => !v(k)).map(([, l]) => l);
    if (missing.length) { err.textContent = "Add the " + missing.join(", ") + "."; return; }
    const sh = normUrl(v("scoreholio"));
    if (!sh) { err.textContent = "The Scoreholio link isn't a valid web address."; return; }
    const contact = readContact("ev", err); if (!contact) return;
    const btn = $("#ev-save"); btn.disabled = true; btn.textContent = "Submitting…";
    try {
      const file = $("#ev-flyer").files[0];
      const flyer_path = file ? await upload("events", file, true) : null;
      const id = uuid();
      const { error } = await sb.from("events").insert({
        id, status: "pending", club_id: v("club"), title: v("name"), event_date: v("date"), start_time: v("time") || null,
        format: v("format") || null, location: v("location"), scoreholio: sh, details: v("details") || null,
        flyer_path, flyer_type: file ? file.type : null
      });
      if (error) throw error;
      await saveContact("event", id, contact);
      closeDlg($("#dlg-event"));
      toast("Thanks! Your event will appear once AZCL approves it.");
    } catch (x) { err.textContent = "Couldn't submit: " + friendly(x); }
    finally { btn.disabled = false; btn.textContent = "Submit event"; }
  });

  route(); render(); load();
})();
