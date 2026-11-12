// AZCL admin page: approve or reject submissions and remove live listings.
(() => {
  const { sb, $, esc, safeHref, fileUrl, initials, fmtDate, fmtTime, toast } = window.AZCL;
  const A = { tab: "pending", clubs: [], vendors: [], events: [], contacts: {}, orgs: [], orgsReady: false, confirm: null, busy: false };

  if (!sb) { $("#admin-note").innerHTML = `<div class="notice">The database isn't connected yet. Add the Supabase details to config.js.</div>`; return; }

  /* ---------- Sign in ---------- */
  async function checkSession() {
    const { data } = await sb.auth.getSession();
    if (!data.session) { showLogin(); return; }
    const { data: ok } = await sb.rpc("is_admin");
    if (!ok) { await sb.auth.signOut(); showLogin("This account isn't an AZCL admin."); return; }
    $("#login").hidden = true; $("#panel").hidden = false; $("#signout").hidden = false;
    load();
  }
  function showLogin(msg) { $("#login").hidden = false; $("#panel").hidden = true; $("#signout").hidden = true; $("#login-err").textContent = msg || ""; }
  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("#login-btn"); btn.disabled = true; $("#login-err").textContent = "";
    const { error } = await sb.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-pass").value });
    btn.disabled = false;
    if (error) { $("#login-err").textContent = "That email and password didn't match."; return; }
    checkSession();
  });
  $("#signout").addEventListener("click", async () => { await sb.auth.signOut(); showLogin(); });

  /* ---------- Data ---------- */
  async function load() {
    const [c, v, e] = await Promise.all([
      sb.from("clubs").select("*").order("name"),
      sb.from("vendors").select("*").order("name"),
      sb.from("events").select("*").order("event_date")
    ]);
    const err = c.error || v.error || e.error;
    if (err) { $("#admin-body").innerHTML = `<div class="notice">Couldn't load: ${esc(err.message)}</div>`; return; }
    A.clubs = c.data; A.vendors = v.data; A.events = e.data;
    const o = await sb.from("scoreholio_organizers").select("*").order("name");
    A.orgsReady = !o.error; A.orgs = o.data || [];
    const [se, ss] = await Promise.all([sb.from("season_events").select("*").order("slot"), sb.from("season_sponsors").select("*").order("created_at")]);
    A.seasonReady = !se.error && !ss.error; A.season = se.data || []; A.seasonSponsors = ss.data || [];
    const [pl, pst] = await Promise.all([sb.from("players").select("*").order("display_name"), sb.from("season_player_stats").select("scoreholio_player_id,player_name,club_name,season_name,division,played").eq("division", "all")]);
    A.playersReady = !pl.error; A.players = pl.data || []; A.stats = pst.data || [];
    const cm = await sb.from("contact_messages").select("*").order("created_at", { ascending: false });
    A.msgsReady = !cm.error; A.msgs = cm.data || [];
    const hr = await sb.from("host_requests").select("*").order("created_at", { ascending: false });
    A.hostsReady = !hr.error; A.hosts = hr.data || [];
    const mg = await sb.from("club_managers").select("club_id,email").order("email");
    A.managersReady = !mg.error; A.managers = mg.data || [];
    const pendingIds = [...A.clubs, ...A.vendors, ...A.events].filter(x => x.status === "pending").map(x => x.id);
    A.contacts = {};
    if (pendingIds.length) {
      const { data } = await sb.from("submission_contacts").select("*").in("item_id", pendingIds);
      (data || []).forEach(ct => (A.contacts[ct.item_id] = ct));
    }
    render();
  }

  /* ---------- Rendering ---------- */
  const LABELS = { name: "Name", city: "City", category: "Category", blurb: "Offers", logo_path: "Logo", scoreholio: "Scoreholio", website: "Website", shop: "Shop", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };
  const CLUB_FIELDS = ["name", "city", "logo_path", "scoreholio", "website", "facebook", "instagram", "tiktok", "youtube"];
  const VENDOR_FIELDS = ["name", "category", "city", "blurb", "logo_path", "website", "shop", "facebook", "instagram", "tiktok", "youtube"];
  const fmtVal = (k, v) => {
    if (!v) return `<span style="color:var(--muted)">—</span>`;
    if (k === "logo_path") return `<a href="${esc(fileUrl(v))}" target="_blank" rel="noopener">View logo</a>`;
    if (safeHref(v)) return `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>`;
    return esc(v);
  };
  const thumb = (path, name) => path ? `<img class="thumb" src="${esc(fileUrl(path))}" alt="">` : `<span class="thumb">${esc(initials(name))}</span>`;
  const contactHtml = id => {
    const c = A.contacts[id];
    return c ? `<div class="contact"><b>Submitted by</b> ${esc(c.name)} · ${esc(c.email)}${c.phone ? " · " + esc(c.phone) : ""}</div>` : "";
  };
  const actions = (type, id) => A.confirm === "reject:" + id
    ? `<div class="event-actions"><button class="btn btn-sm btn-danger" data-act="reject-yes" data-type="${type}" data-id="${id}">Confirm reject</button><button class="linkbtn" data-act="cancel">Keep</button></div>`
    : `<div class="event-actions"><button class="btn btn-primary btn-sm" data-act="approve" data-type="${type}" data-id="${id}">Approve</button><button class="btn btn-ghost btn-sm" data-act="reject" data-type="${type}" data-id="${id}">Reject</button></div>`;

  function listingCard(type, item, fields) {
    const list = type === "club" ? A.clubs : A.vendors;
    const orig = item.replaces ? list.find(x => x.id === item.replaces) : null;
    const rows = fields.map(k => {
      const changed = orig && (orig[k] || "") !== (item[k] || "");
      if (orig && !changed) return "";
      return `<dt>${LABELS[k]}</dt><dd class="${changed ? "changed" : ""}">${fmtVal(k, item[k])}${changed ? ` <span style="color:var(--muted)">(was ${orig[k] ? esc(k === "logo_path" ? "another logo" : orig[k]) : "blank"})</span>` : ""}</dd>`;
    }).join("");
    return `<article class="qitem">
      ${thumb(item.logo_path, item.name)}
      <div style="min-width:0">
        ${orig ? `<span class="badge-upd">Update to live ${type}</span>` : `<span class="badge-new">New ${type}</span>`}
        <h3>${esc(item.name)}</h3>
        <dl class="kv">${rows || `<dt>Changes</dt><dd>None</dd>`}</dl>
        ${contactHtml(item.id)}
        ${actions(type, item.id)}
      </div>
    </article>`;
  }
  function eventCard(ev, pending) {
    const club = A.clubs.find(c => c.id === ev.club_id);
    const flyer = ev.flyer_path ? (/pdf/i.test(ev.flyer_type || ev.flyer_path) ? `<a class="thumb" href="${esc(fileUrl(ev.flyer_path))}" target="_blank" rel="noopener" style="font-size:12px">PDF</a>` : `<a href="${esc(fileUrl(ev.flyer_path))}" target="_blank" rel="noopener"><img class="thumb" src="${esc(fileUrl(ev.flyer_path))}" alt="Flyer"></a>`) : `<span class="thumb">EV</span>`;
    const imported = ev.source === "scoreholio";
    const act = pending ? actions("event", ev.id) : imported
      ? `<div class="event-actions">${ev.status === "hidden"
          ? `<button class="btn btn-primary btn-sm" data-act="unhide" data-id="${ev.id}">Show on site again</button>`
          : `<button class="btn btn-ghost btn-sm" data-act="hide" data-id="${ev.id}">Hide from site</button>`}</div>`
      : (A.confirm === "remove:" + ev.id
      ? `<div class="event-actions"><button class="btn btn-sm btn-danger" data-act="remove-yes" data-type="event" data-id="${ev.id}">Confirm remove</button><button class="linkbtn" data-act="cancel">Keep</button></div>`
      : `<div class="event-actions"><button class="btn btn-ghost btn-sm" data-act="remove" data-type="event" data-id="${ev.id}">Remove from site</button></div>`);
    return `<article class="qitem">
      ${flyer}
      <div style="min-width:0">
        ${pending ? `<span class="badge-new">New event</span>` : ""}${imported ? `<span class="badge-new">From Scoreholio</span> ` : ""}${ev.status === "hidden" ? `<span class="badge-upd">Hidden</span>` : ""}
        <h3>${esc(ev.title)}</h3>
        <dl class="kv">
          <dt>Club</dt><dd>${esc(club ? club.name : "Unknown club")}</dd>
          <dt>When</dt><dd>${esc(fmtDate(ev.event_date))}${ev.start_time ? " · " + fmtTime(ev.start_time) : ""}</dd>
          <dt>Where</dt><dd>${esc(ev.location)}</dd>
          ${ev.format ? `<dt>Format</dt><dd>${esc(ev.format)}</dd>` : ""}
          <dt>Scoreholio</dt><dd>${fmtVal("scoreholio", ev.scoreholio)}</dd>
          ${ev.details ? `<dt>Details</dt><dd style="white-space:pre-line">${esc(ev.details)}</dd>` : ""}
        </dl>
        ${pending ? contactHtml(ev.id) : ""}
        ${act}
      </div>
    </article>`;
  }
  function liveRow(type, item) {
    const confirm = A.confirm === "remove:" + item.id;
    const warn = type === "club" ? " This also removes the club's events." : "";
    return `<div class="live-row">
      ${thumb(item.logo_path, item.name).replace('class="thumb"', 'class="thumb" style="width:44px;height:44px;font-size:16px"')}
      <div><b>${esc(item.name)}</b><span>${esc([item.category, item.city].filter(Boolean).join(" · "))}</span>${confirm ? `<span style="color:var(--danger)">Remove ${esc(item.name)}?${warn}</span>` : ""}
        ${type === "club" && A.managersReady ? `<div class="mgrs">
          ${A.managers.filter(m => m.club_id === item.id).map(m => `<span class="mgr">${esc(m.email)} <button class="linkbtn" data-act="mgr-remove" data-id="${item.id}" data-email="${esc(m.email)}" aria-label="Remove ${esc(m.email)} as manager">×</button></span>`).join("")}
          <input type="email" id="mgr-${item.id}" placeholder="Add club login email" aria-label="Club login email for ${esc(item.name)}" class="mgr-input">
          <button class="btn btn-ghost btn-sm" data-act="mgr-add" data-id="${item.id}">Add</button>
          <a class="linkbtn" href="manage.html?club=${item.id}">Edit page</a>
        </div>` : ""}
      </div>
      ${confirm
        ? `<button class="btn btn-sm btn-danger" data-act="remove-yes" data-type="${type}" data-id="${item.id}">Remove</button><button class="linkbtn" data-act="cancel">Keep</button>`
        : `<button class="btn btn-ghost btn-sm" data-act="remove" data-type="${type}" data-id="${item.id}">Remove</button>`}
    </div>`;
  }

  function render() {
    const pc = A.clubs.filter(x => x.status === "pending"), pv = A.vendors.filter(x => x.status === "pending"), pe = A.events.filter(x => x.status === "pending");
    $("#count-pending").textContent = pc.length + pv.length + pe.length;
    const unlinked = A.orgs.filter(o => !o.ignored && !A.clubs.some(c => c.scoreholio_organizer_id === o.id));
    $("#count-sh").textContent = unlinked.length; $("#count-sh").hidden = !unlinked.length;
    const newMsgs = (A.msgs || []).filter(m => !m.handled).length;
    $("#count-msgs").textContent = newMsgs; $("#count-msgs").hidden = !newMsgs;
    const newHosts = (A.hosts || []).filter(h => !h.handled).length;
    $("#count-hosts").textContent = newHosts; $("#count-hosts").hidden = !newHosts;
    document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === A.tab)));
    const body = $("#admin-body");
    const section = (title, html) => `<h2 style="font-size:24px;text-transform:uppercase;margin:24px 0 12px">${title}</h2>${html}`;
    if (A.tab === "pending") {
      if (!pc.length && !pv.length && !pe.length) { body.innerHTML = `<div class="empty"><b>All caught up</b>New submissions from the website will show up here.</div>`; return; }
      body.innerHTML =
        (pe.length ? section(`Events (${pe.length})`, `<div class="queue">${pe.map(e => eventCard(e, true)).join("")}</div>`) : "") +
        (pc.length ? section(`Clubs (${pc.length})`, `<div class="queue">${pc.map(c => listingCard("club", c, CLUB_FIELDS)).join("")}</div>`) : "") +
        (pv.length ? section(`Vendors (${pv.length})`, `<div class="queue">${pv.map(v => listingCard("vendor", v, VENDOR_FIELDS)).join("")}</div>`) : "");
    } else if (A.tab === "players") {
      body.innerHTML = renderPlayersAdmin();
    } else if (A.tab === "season") {
      body.innerHTML = renderSeasonAdmin();
    } else if (A.tab === "messages") {
      if (!A.msgsReady) { body.innerHTML = `<div class="notice">The contact form isn't set up yet. Run 11-contact.sql in Supabase first.</div>`; return; }
      body.innerHTML = A.msgs.length ? `<div class="queue">${A.msgs.map(m => `<article class="qitem" style="${m.handled ? "opacity:.65" : ""}">
          <span class="thumb" style="font-size:16px">${esc(initials(m.name))}</span>
          <div style="min-width:0">
            ${m.handled ? `<span class="badge-new">Handled</span>` : `<span class="badge-upd">New</span>`} <span class="tag">${esc(m.topic)}</span>
            <h3>${esc(m.name)}${m.organization ? ` · ${esc(m.organization)}` : ""}</h3>
            <p style="white-space:pre-line;margin:8px 0 0;overflow-wrap:anywhere">${esc(m.message)}</p>
            <div class="contact"><a href="mailto:${esc(m.email)}?subject=${encodeURIComponent("Re: " + m.topic + " (Arizona Cornhole League)")}" style="color:inherit"><b>${esc(m.email)}</b></a>${m.phone ? " · " + esc(m.phone) : ""}${m.city ? " · " + esc(m.city) : ""} · ${esc(new Date(m.created_at).toLocaleString("en-US", { timeZone: "America/Phoenix", dateStyle: "medium", timeStyle: "short" }))}</div>
            <div class="event-actions">
              <a class="btn btn-primary btn-sm" href="mailto:${esc(m.email)}?subject=${encodeURIComponent("Re: " + m.topic + " (Arizona Cornhole League)")}">Reply by email</a>
              <button class="btn btn-ghost btn-sm" data-act="msg-toggle" data-id="${m.id}" data-handled="${m.handled}">${m.handled ? "Mark as new" : "Mark handled"}</button>
              ${A.confirm === "msg:" + m.id ? `<button class="btn btn-sm btn-danger" data-act="msg-del" data-id="${m.id}">Confirm delete</button><button class="linkbtn" data-act="cancel">Keep</button>` : `<button class="linkbtn" data-act="msg-ask" data-id="${m.id}">Delete</button>`}
            </div>
          </div>
        </article>`).join("")}</div>` : `<div class="empty"><b>No messages yet</b>Messages from the Contact page show up here.</div>`;
    } else if (A.tab === "hosts") {
      if (!A.hostsReady) { body.innerHTML = `<div class="notice">Host requests aren't set up yet. Run 04-host-requests.sql in Supabase first.</div>`; return; }
      body.innerHTML = A.hosts.length ? `<div class="queue">${A.hosts.map(h => {
        const club = A.clubs.find(c => c.id === h.club_id);
        return `<article class="qitem" style="${h.handled ? "opacity:.65" : ""}">
          <span class="thumb">${h.slot ? "#" + h.slot : "?"}</span>
          <div style="min-width:0">
            ${h.handled ? `<span class="badge-new">Handled</span>` : `<span class="badge-upd">New request</span>`}
            <h3>${esc(club ? club.name : "Club not listed")}${h.slot ? ` · State Region Event ${h.slot}` : ""}</h3>
            <dl class="kv">
              <dt>Venue</dt><dd>${esc(h.venue)}, ${esc(h.city)}</dd>
              <dt>Dates</dt><dd>${esc(h.preferred_dates)}</dd>
              ${h.boards ? `<dt>Boards</dt><dd>${h.boards} sets</dd>` : ""}
              ${h.notes ? `<dt>Notes</dt><dd style="white-space:pre-line">${esc(h.notes)}</dd>` : ""}
              <dt>Sent</dt><dd>${esc(new Date(h.created_at).toLocaleString("en-US", { timeZone: "America/Phoenix", dateStyle: "medium", timeStyle: "short" }))}</dd>
            </dl>
            <div class="contact"><b>Contact</b> ${esc(h.contact_name)} · <span style="user-select:all">${esc(h.contact_email)}</span>${h.contact_phone ? " · " + esc(h.contact_phone) : ""}</div>
            <div class="event-actions">
              <button class="btn btn-${h.handled ? "ghost" : "primary"} btn-sm" data-act="host-toggle" data-id="${h.id}" data-handled="${h.handled}">${h.handled ? "Mark as new" : "Mark handled"}</button>
              ${A.confirm === "host:" + h.id
                ? `<button class="btn btn-sm btn-danger" data-act="host-del" data-id="${h.id}">Confirm delete</button><button class="linkbtn" data-act="cancel">Keep</button>`
                : `<button class="linkbtn" data-act="host-ask" data-id="${h.id}">Delete</button>`}
            </div>
          </div>
        </article>`;
      }).join("")}</div>` : `<div class="empty"><b>No host requests yet</b>Requests from the "Request to host" buttons on the home page show up here.</div>`;
    } else if (A.tab === "scoreholio") {
      body.innerHTML = renderScoreholio(unlinked);
    } else if (A.tab === "live-events") {
      const live = A.events.filter(x => x.status === "approved" || x.status === "hidden").sort((a, b) => b.event_date.localeCompare(a.event_date));
      body.innerHTML = live.length ? `<div class="queue">${live.map(e => eventCard(e, false)).join("")}</div>` : `<div class="empty"><b>No live events yet</b>Approved events show here.</div>`;
    } else {
      const type = A.tab === "live-clubs" ? "club" : "vendor";
      const live = (type === "club" ? A.clubs : A.vendors).filter(x => x.status === "approved");
      const tip = type === "club"
        ? `To change a club's name or city, use "Update listing" on the public site, then approve it here. To let a club edit its own page, add the email they use on the Club login page. You can also edit any club's page yourself.`
        : `To change a listing, use "Update listing" on the public site, then approve it here.`;
      body.innerHTML = `<p style="color:var(--muted);margin-top:0;max-width:75ch">${tip}</p>` + live.map(x => liveRow(type, x)).join("");
    }
  }

  /* ---------- Scoreholio organizers ---------- */
  const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(cornhole|club|league|the|az|arizona|llc|baggers?)\b/g, " ").split(/\s+/).filter(Boolean);
  function suggestClub(org) {
    const ot = new Set(norm(org.name)); let best = null, score = 0;
    for (const c of A.clubs.filter(c => c.status === "approved" && !c.scoreholio_organizer_id)) {
      const s = norm(c.name).filter(w => ot.has(w)).length;
      if (s > score) { score = s; best = c; }
    }
    return best;
  }
  function renderScoreholio(unlinked) {
    if (!A.orgsReady) return `<div class="notice">The Scoreholio import isn't set up yet. Run the 02-scoreholio.sql setup in Supabase first.</div>`;
    const approvedClubs = A.clubs.filter(c => c.status === "approved");
    const linked = A.orgs.filter(o => A.clubs.some(c => c.scoreholio_organizer_id === o.id));
    const ignored = A.orgs.filter(o => o.ignored && !linked.includes(o));
    const next = o => o.next_event_name ? `${o.upcoming_count} upcoming · next: ${esc(o.next_event_name)}, ${esc(fmtDate(o.next_event_date))}${o.next_event_city ? " in " + esc(o.next_event_city) : ""}` : "No upcoming tournaments";
    const row = (o, controls) => `<div class="live-row"><span class="thumb" style="width:44px;height:44px;font-size:16px">${esc(initials(o.name))}</span><div><b>${esc(o.name)}</b><span>${next(o)}</span></div>${controls}</div>`;
    const intro = `<p style="color:var(--muted);margin-top:0;max-width:70ch">These Scoreholio organizers are running public cornhole tournaments in Arizona. Link each one to its club, and its tournaments will show on AZ Events automatically. Scoreholio is checked every hour.</p>`;
    if (!A.orgs.length) return intro + `<div class="empty"><b>No organizers found yet</b>They appear here after the first hourly import runs.</div>`;
    const toLink = unlinked.map(o => {
      const sug = suggestClub(o);
      const opts = approvedClubs.filter(c => !c.scoreholio_organizer_id).map(c => `<option value="${c.id}" ${sug && sug.id === c.id ? "selected" : ""}>${esc(c.name)} (${esc(c.city)})</option>`).join("");
      return row(o, `<select id="link-${esc(o.id)}" aria-label="Club for ${esc(o.name)}" style="max-width:220px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--surface)"><option value="">Choose club…</option>${opts}</select>
        <button class="btn btn-primary btn-sm" data-act="link" data-id="${esc(o.id)}">Link</button>
        <button class="linkbtn" data-act="ignore" data-id="${esc(o.id)}">Ignore</button>`);
    }).join("");
    const linkedHtml = linked.map(o => {
      const c = A.clubs.find(c => c.scoreholio_organizer_id === o.id);
      return row(o, `<span class="tag">→ ${esc(c.name)}</span><button class="linkbtn" data-act="unlink" data-id="${esc(c.id)}">Unlink</button>`);
    }).join("");
    const ignoredHtml = ignored.map(o => row(o, `<button class="linkbtn" data-act="unignore" data-id="${esc(o.id)}">Stop ignoring</button>`)).join("");
    const h = t => `<h2 style="font-size:22px;text-transform:uppercase;margin:24px 0 8px">${t}</h2>`;
    return intro + (toLink ? h(`Needs a club (${unlinked.length})`) + toLink : "") + (linkedHtml ? h(`Linked (${linked.length})`) + linkedHtml : "") + (ignoredHtml ? h(`Ignored (${ignored.length})`) + ignoredHtml : "")
      + `<p style="color:var(--muted);font-size:13px;margin-top:20px">New links take effect at the next hourly import. To import right away, open the GitHub repository → Actions → Sync Scoreholio events → Run workflow.</p>`;
  }

  /* ---------- Players ---------- */
  function renderPlayersAdmin() {
    if (!A.playersReady) return `<div class="notice">Player profiles aren't set up yet. Run 07-players.sql in Supabase first.</div>`;
    const norm = n => (n || "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
    const intro = `<p style="color:var(--muted);margin-top:0;max-width:75ch">Profiles go live as soon as players create them. Hide any profile that shouldn't be public. To show season stats on a profile, link it to the player's Scoreholio ranking. Exact name matches link automatically, so only players whose names differ need a manual link.</p>`;
    if (!A.players.length) return intro + `<div class="empty"><b>No player profiles yet</b>Players create profiles at azcornholeleague.com/player.html.</div>`;
    return intro + A.players.map(p => {
      const linked = p.scoreholio_player_id ? A.stats.find(s => s.scoreholio_player_id === p.scoreholio_player_id) : null;
      const auto = !p.scoreholio_player_id ? A.stats.filter(s => norm(s.player_name) === norm(p.display_name)) : [];
      const suggestions = !p.scoreholio_player_id ? A.stats.filter(s => { const a = norm(s.player_name).split(" "), b = norm(p.display_name).split(" "); return a[a.length - 1] === b[b.length - 1]; }).slice(0, 8) : [];
      const statusLine = p.scoreholio_player_id ? `Linked to ${esc(linked ? linked.player_name : p.scoreholio_player_id)}${linked && linked.played != null ? ` · ${linked.played} events` : ""}`
        : auto.length === 1 ? `Season stats matched by name` : A.stats.length ? `No season stats linked` : `Season stats appear once AZCL's Scoreholio season is connected`;
      return `<div class="live-row" style="align-items:flex-start;${p.hidden ? "opacity:.6" : ""}">
        ${p.photo_path ? `<img class="thumb" src="${esc(fileUrl(p.photo_path))}" alt="" style="width:44px;height:44px;border-radius:50%">` : `<span class="thumb" style="width:44px;height:44px;font-size:16px;border-radius:50%">${esc(initials(p.display_name))}</span>`}
        <div><b>${esc(p.display_name)}${p.hidden ? ` <span class="badge-upd">Hidden</span>` : ""}</b><span>${esc([p.city, statusLine].filter(Boolean).join(" · "))}</span>
          ${A.stats.length ? `<div class="mgrs">
            ${p.scoreholio_player_id ? `<button class="linkbtn" data-act="pl-unlink" data-id="${p.id}">Unlink stats</button>` : `
              <select id="pl-link-${p.id}" class="mgr-input" style="width:auto" aria-label="Scoreholio ranking for ${esc(p.display_name)}"><option value="">Link to a Scoreholio player…</option>${(suggestions.length ? suggestions : A.stats.slice(0, 200)).map(s => `<option value="${esc(s.scoreholio_player_id)}">${esc(s.player_name)}${s.club_name ? " (" + esc(s.club_name) + ")" : ""}</option>`).join("")}</select>
              <button class="btn btn-ghost btn-sm" data-act="pl-link" data-id="${p.id}">Link</button>`}
          </div>` : ""}
        </div>
        <a class="linkbtn" href="./#player-${p.id}" target="_blank" rel="noopener">View</a>
        <button class="btn btn-ghost btn-sm" data-act="pl-hide" data-id="${p.id}" data-hidden="${p.hidden}">${p.hidden ? "Show" : "Hide"}</button>
      </div>`;
    }).join("");
  }

  /* ---------- Season events ---------- */
  const imgSrc = p => /^(https?:\/\/|assets\/)/.test(p || "") ? p : fileUrl(p);
  function renderSeasonAdmin() {
    if (!A.seasonReady) return `<div class="notice">Season events aren't set up yet. Run 05-season-events.sql in Supabase first.</div>`;
    const roles = window.AZCL.SPONSOR_ROLES;
    const f = (slot, key, label, attrs = "", val = "") => `<div class="fld"><label for="s${slot}-${key}">${label}</label><input id="s${slot}-${key}" value="${esc(val)}" ${attrs}></div>`;
    return `<p style="color:var(--muted);margin-top:0;max-width:75ch">These are the State Region Event cards on the home page. Set an event to <b>Confirmed</b> to show its full card, or <b>Coming soon</b> to show a "Request to host" card. Changes appear on the site as soon as you save.</p>` +
      A.season.map(e => {
        const sp = A.seasonSponsors.filter(x => x.slot === e.slot).sort((a, b) => roles.indexOf(a.role) - roles.indexOf(b.role) || a.created_at.localeCompare(b.created_at));
        const id = e.slot;
        return `<article class="ed-card season-ed">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
            <h2>${e.kind === "championship" ? "State Championships" : `State Region Event ${id}`}${e.title ? ` · ${esc(e.title)}` : ""}</h2>
            <select id="s${id}-status" aria-label="Status of event ${id}" class="mgr-input" style="width:auto">
              <option value="soon" ${e.status !== "set" ? "selected" : ""}>Coming soon</option>
              <option value="set" ${e.status === "set" ? "selected" : ""}>Confirmed</option>
            </select>
          </div>
          <div class="row2">${f(id, "title", "Event name", 'maxlength="80"', e.title)}${f(id, "dates", "Dates", 'maxlength="80" placeholder="e.g. March 6–8, 2027"', e.dates_text)}</div>
          <div class="row2">${f(id, "venue", "Venue", 'maxlength="120"', e.venue)}${f(id, "city", "City", 'maxlength="60"', e.city)}</div>
          ${"starts_at" in e ? `<div class="fld"><label for="s${id}-starts">Countdown to <span class="hint">Arizona time. Leave blank for no countdown.</span></label><input id="s${id}-starts" type="datetime-local" value="${e.starts_at ? new Date(new Date(e.starts_at).getTime() - 7 * 36e5).toISOString().slice(0, 16) : ""}" style="max-width:260px"></div>` : ""}
          <div class="fld"><label for="s${id}-blurb">Short description</label><textarea id="s${id}-blurb" maxlength="500" rows="3">${esc(e.blurb || "")}</textarea></div>
          <div class="row2">${f(id, "details", "Event website", 'type="url" placeholder="https://"', e.details_url)}${f(id, "register", "Scoreholio registration link", 'type="url" placeholder="https://"', e.register_url)}</div>
          <div class="fld"><label for="s${id}-logo">Event logo <span class="hint">PNG, JPG or WebP, up to 5 MB</span></label>
            ${e.logo_path ? `<div class="preview-logo"><img src="${esc(imgSrc(e.logo_path))}" alt="" style="width:auto;max-width:160px;background:var(--band)">Current logo. Choose a file to replace it.</div>` : ""}
            <input id="s${id}-logo" type="file" accept="image/png,image/jpeg,image/webp"></div>
          <fieldset>
            <legend>Card colors</legend>
            <label class="check"><input type="checkbox" id="s${id}-theme" ${e.theme_bg ? "checked" : ""}> Use this event's own colors (otherwise the AZCL navy, copper and gold)</label>
            <div class="theme-row">
              ${[["bg", "Background", e.theme_bg || "#13265C"], ["text", "Text", e.theme_text || "#F4F1E8"], ["accent", "Buttons and title", e.theme_accent || "#B4532A"], ["highlight", "Labels and stripe", e.theme_highlight || "#E3A33A"]]
                .map(([k, l, v]) => `<label class="swatch"><input type="color" id="s${id}-c-${k}" value="${esc(v)}"> ${l}</label>`).join("")}
              <label class="swatch">Headline font <select id="s${id}-font" class="mgr-input" style="width:auto"><option value="default" ${e.theme_font !== "bebas" ? "selected" : ""}>AZCL (Big Shoulders)</option><option value="bebas" ${e.theme_font === "bebas" ? "selected" : ""}>Bebas Neue</option></select></label>
            </div>
          </fieldset>
          <div class="event-actions"><button class="btn btn-primary btn-sm" data-act="season-save" data-id="${id}">Save event ${id}</button></div>

          <h3 style="font-family:var(--body);font-size:16px;font-weight:800;margin-top:6px">Partners and sponsors</h3>
          ${sp.length ? sp.map(x => `<div class="live-row">
            ${x.logo_path ? `<img class="thumb" src="${esc(imgSrc(x.logo_path))}" alt="" style="width:44px;height:44px;object-fit:contain;background:#fff">` : `<span class="thumb" style="width:44px;height:44px;font-size:14px">${esc(initials(x.name))}</span>`}
            <div><b>${esc(x.name)}</b><span>${esc(x.role)}</span>
              <div class="mgrs">
                <input id="spx-url-${x.id}" class="mgr-input" type="url" value="${esc(x.url || "")}" placeholder="Website" aria-label="Website for ${esc(x.name)}">
                <label class="linkbtn" style="cursor:pointer">${x.logo_path ? "Change logo" : "Add logo"}<input id="spx-logo-${x.id}" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
                <button class="btn btn-ghost btn-sm" data-act="sp-save" data-id="${x.id}">Save</button>
              </div>
            </div>
            ${A.confirm === "sp:" + x.id
              ? `<button class="btn btn-sm btn-danger" data-act="sp-del" data-id="${x.id}">Remove</button><button class="linkbtn" data-act="cancel">Keep</button>`
              : `<button class="linkbtn" data-act="sp-ask" data-id="${x.id}">Remove</button>`}
          </div>`).join("") : `<p class="muted" style="margin:0">No sponsors yet.</p>`}
          <div class="sp-add">
            <select id="s${id}-sp-pick" data-slot="${id}" class="mgr-input sp-pick" style="width:auto" aria-label="Fill in from the directory">
              <option value="">Pick from directory…</option>
              <optgroup label="Vendors">${A.vendors.filter(v => v.status === "approved").map(v => `<option value="vendor:${v.id}">${esc(v.name)}</option>`).join("")}</optgroup>
              <optgroup label="Clubs">${A.clubs.filter(c => c.status === "approved").map(c => `<option value="club:${c.id}">${esc(c.name)}</option>`).join("")}</optgroup>
            </select>
            <select id="s${id}-sp-role" aria-label="Sponsor role" class="mgr-input" style="width:auto">${roles.map(r => `<option>${r}</option>`).join("")}</select>
            <input id="s${id}-sp-name" class="mgr-input" maxlength="80" placeholder="Sponsor name" aria-label="Sponsor name">
            <input id="s${id}-sp-url" class="mgr-input" type="url" placeholder="Website (optional)" aria-label="Sponsor website">
            <input id="s${id}-sp-logo" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Sponsor logo (optional)" style="font-size:13px;max-width:100%">
            <button class="btn btn-ghost btn-sm" data-act="sp-add" data-id="${id}">Add sponsor</button>
          </div>
        </article>`;
      }).join("");
  }
  async function saveSeason(slot) {
    const v = k => (document.getElementById(`s${slot}-${k}`).value || "").trim();
    const data = { status: v("status"), title: v("title") || null, dates_text: v("dates") || null, venue: v("venue") || null, city: v("city") || null, blurb: v("blurb") || null, updated_at: new Date().toISOString() };
    for (const [k, col, label] of [["details", "details_url", "event website"], ["register", "register_url", "registration link"]]) {
      const u = window.AZCL.normUrl(v(k)); if (u === null) throw new Error(`the ${label} isn't a valid web address`); data[col] = u || null;
    }
    if (data.status === "set" && !data.title) throw new Error("add the event name before marking it confirmed");
    const st = document.getElementById(`s${slot}-starts`);
    if (st) data.starts_at = st.value ? st.value + ":00-07:00" : null;  // Arizona doesn't use daylight saving
    if (A.season.some(x => "theme_font" in x)) {
      const custom = document.getElementById(`s${slot}-theme`).checked;
      for (const k of ["bg", "text", "accent", "highlight"]) data["theme_" + k] = custom ? document.getElementById(`s${slot}-c-${k}`).value : null;
      data.theme_font = document.getElementById(`s${slot}-font`).value;
    }
    const file = document.getElementById(`s${slot}-logo`).files[0];
    if (file) data.logo_path = await window.AZCL.upload("events", file);
    const { error } = await sb.from("season_events").update(data).eq("slot", slot);
    if (error) throw error;
  }
  // "Pick from directory": fill the sponsor name and website from a club or vendor listing, and reuse its logo
  function pickedListing(slot) {
    const v = (document.getElementById(`s${slot}-sp-pick`) || {}).value || "";
    const [kind, id] = v.split(":");
    if (!id) return null;
    const x = (kind === "vendor" ? A.vendors : A.clubs).find(r => r.id === id);
    if (!x) return null;
    return { name: x.name, url: x.website || x.shop || x.facebook || x.instagram || x.scoreholio || "", logo_path: x.logo_path || null };
  }
  document.addEventListener("change", e => {
    if (/^spx-logo-/.test(e.target.id || "") && e.target.files[0]) { toast("Logo chosen. Click Save to update it."); return; }
    const sel = e.target.closest(".sp-pick"); if (!sel) return;
    const slot = sel.dataset.slot, x = pickedListing(slot); if (!x) return;
    document.getElementById(`s${slot}-sp-name`).value = x.name;
    document.getElementById(`s${slot}-sp-url`).value = x.url;
    if (/vendor/.test(sel.value)) document.getElementById(`s${slot}-sp-role`).value = "Vendor";
    toast(x.logo_path ? "Filled in, including their logo. Pick a role and click Add sponsor." : "Filled in. They don't have a logo on file, so you can upload one.");
  });
  async function saveSeasonSponsor(id) {
    const url = window.AZCL.normUrl(document.getElementById("spx-url-" + id).value);
    if (url === null) throw new Error("that website isn't a valid web address");
    const data = { url: url || null };
    const f = document.getElementById("spx-logo-" + id).files[0];
    if (f) data.logo_path = await window.AZCL.upload("sponsors", f);
    const { error } = await sb.from("season_sponsors").update(data).eq("id", id);
    if (error) throw error;
  }
  async function addSeasonSponsor(slot) {
    const v = k => (document.getElementById(`s${slot}-sp-${k}`).value || "").trim();
    const name = v("name"); if (!name) throw new Error("add the sponsor's name");
    const url = window.AZCL.normUrl(v("url")); if (url === null) throw new Error("the sponsor website isn't a valid web address");
    const file = document.getElementById(`s${slot}-sp-logo`).files[0];
    const pick = pickedListing(slot);
    const logo_path = file ? await window.AZCL.upload("sponsors", file) : (pick && pick.logo_path) || null;
    const { error } = await sb.from("season_sponsors").insert({ slot: Number(slot), role: v("role"), name, url: url || null, logo_path });
    if (error) throw error;
  }

  /* ---------- Actions ---------- */
  const table = type => ({ club: "clubs", vendor: "vendors", event: "events" }[type]);
  const STRIP = ["id", "status", "replaces", "created_at", "updated_at"];
  async function approve(type, id) {
    const t = table(type);
    const item = (type === "club" ? A.clubs : type === "vendor" ? A.vendors : A.events).find(x => x.id === id);
    if (item && item.replaces) {
      const changes = {}; Object.keys(item).forEach(k => { if (!STRIP.includes(k)) changes[k] = item[k]; });
      changes.updated_at = new Date().toISOString();
      const up = await sb.from(t).update(changes).eq("id", item.replaces);
      if (up.error) throw up.error;
      const del = await sb.from(t).delete().eq("id", id);
      if (del.error) throw del.error;
    } else {
      const { error } = await sb.from(t).update({ status: "approved" }).eq("id", id);
      if (error) throw error;
    }
  }
  async function removeRow(type, id) {
    const { error } = await sb.from(table(type)).delete().eq("id", id);
    if (error) throw error;
    await sb.from("submission_contacts").delete().eq("item_id", id);
  }
  document.addEventListener("click", async e => {
    const tab = e.target.closest("[data-tab]");
    if (tab) { A.tab = tab.dataset.tab; A.confirm = null; render(); return; }
    const b = e.target.closest("[data-act]"); if (!b || A.busy) return;
    const { act, type, id } = b.dataset;
    if (act === "cancel") { A.confirm = null; render(); return; }
    if (act === "reject") { A.confirm = "reject:" + id; render(); return; }
    if (act === "remove") { A.confirm = "remove:" + id; render(); return; }
    if (act === "host-ask") { A.confirm = "host:" + id; render(); return; }
    if (act === "sp-ask") { A.confirm = "sp:" + id; render(); return; }
    if (act === "msg-ask") { A.confirm = "msg:" + id; render(); return; }
    A.busy = true; b.disabled = true;
    try {
      if (act === "approve") { await approve(type, id); toast("Approved. It's live on the site."); }
      if (act === "hide" || act === "unhide") { const { error } = await sb.from("events").update({ status: act === "hide" ? "hidden" : "approved" }).eq("id", id); if (error) throw error; toast(act === "hide" ? "Hidden from the site." : "Showing on the site again."); }
      if (act === "link") {
        const clubId = document.getElementById("link-" + id).value;
        if (!clubId) throw new Error("choose a club first");
        const { error } = await sb.from("clubs").update({ scoreholio_organizer_id: id }).eq("id", clubId); if (error) throw error;
        await sb.from("scoreholio_organizers").update({ ignored: false }).eq("id", id);
        toast("Linked. Their tournaments arrive at the next hourly import.");
      }
      if (act === "pl-hide") { const { error } = await sb.from("players").update({ hidden: b.dataset.hidden !== "true" }).eq("id", id); if (error) throw error; toast(b.dataset.hidden === "true" ? "Profile is visible again." : "Profile hidden."); }
      if (act === "pl-link") { const v = document.getElementById("pl-link-" + id).value; if (!v) throw new Error("choose a Scoreholio player first"); const { error } = await sb.from("players").update({ scoreholio_player_id: v }).eq("id", id); if (error) throw error; toast("Season stats linked."); }
      if (act === "pl-unlink") { const { error } = await sb.from("players").update({ scoreholio_player_id: null }).eq("id", id); if (error) throw error; toast("Unlinked."); }
      if (act === "season-save") { await saveSeason(id); toast(`Event ${id} saved. It's live on the home page.`); }
      if (act === "sp-add") { await addSeasonSponsor(id); toast("Sponsor added."); }
      if (act === "sp-save") { await saveSeasonSponsor(id); toast("Sponsor updated."); }
      if (act === "sp-del") { const { error } = await sb.from("season_sponsors").delete().eq("id", id); if (error) throw error; toast("Sponsor removed."); }
      if (act === "msg-toggle") { const { error } = await sb.from("contact_messages").update({ handled: b.dataset.handled !== "true" }).eq("id", id); if (error) throw error; toast("Updated."); }
      if (act === "msg-del") { const { error } = await sb.from("contact_messages").delete().eq("id", id); if (error) throw error; toast("Deleted."); }
      if (act === "host-toggle") { const { error } = await sb.from("host_requests").update({ handled: b.dataset.handled !== "true" }).eq("id", id); if (error) throw error; toast("Updated."); }
      if (act === "host-del") { const { error } = await sb.from("host_requests").delete().eq("id", id); if (error) throw error; toast("Deleted."); }
      if (act === "mgr-add") {
        const email = (document.getElementById("mgr-" + id).value || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("enter a valid email");
        const { error } = await sb.from("club_managers").insert({ club_id: id, email }); if (error) throw error;
        toast(`${email} can now edit this club's page after signing in at Club login.`);
      }
      if (act === "mgr-remove") { const { error } = await sb.from("club_managers").delete().eq("club_id", id).eq("email", b.dataset.email); if (error) throw error; toast("Removed."); }
      if (act === "unlink") { const { error } = await sb.from("clubs").update({ scoreholio_organizer_id: null }).eq("id", id); if (error) throw error; toast("Unlinked. Their imported events are removed at the next import."); }
      if (act === "ignore" || act === "unignore") { const { error } = await sb.from("scoreholio_organizers").update({ ignored: act === "ignore" }).eq("id", id); if (error) throw error; toast(act === "ignore" ? "Ignored." : "Moved back to Needs a club."); }
      if (act === "reject-yes") { await removeRow(type, id); toast("Rejected and removed."); }
      if (act === "remove-yes") { await removeRow(type, id); toast("Removed from the site."); }
    } catch (x) { toast("Couldn't do that: " + (x.message || "try again")); }
    A.busy = false; A.confirm = null; await load();
  });

  checkSession();
})();
