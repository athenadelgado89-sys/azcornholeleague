// AZCL admin page: approve or reject submissions and remove live listings.
(() => {
  const { sb, $, esc, safeHref, fileUrl, initials, fmtDate, fmtTime, toast } = window.AZCL;
  const A = { tab: "pending", clubs: [], vendors: [], events: [], contacts: {}, confirm: null, busy: false };

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
    const act = pending ? actions("event", ev.id) : (A.confirm === "remove:" + ev.id
      ? `<div class="event-actions"><button class="btn btn-sm btn-danger" data-act="remove-yes" data-type="event" data-id="${ev.id}">Confirm remove</button><button class="linkbtn" data-act="cancel">Keep</button></div>`
      : `<div class="event-actions"><button class="btn btn-ghost btn-sm" data-act="remove" data-type="event" data-id="${ev.id}">Remove from site</button></div>`);
    return `<article class="qitem">
      ${flyer}
      <div style="min-width:0">
        ${pending ? `<span class="badge-new">New event</span>` : ""}
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
      <div><b>${esc(item.name)}</b><span>${esc([item.category, item.city].filter(Boolean).join(" · "))}</span>${confirm ? `<span style="color:var(--danger)">Remove ${esc(item.name)}?${warn}</span>` : ""}</div>
      ${confirm
        ? `<button class="btn btn-sm btn-danger" data-act="remove-yes" data-type="${type}" data-id="${item.id}">Remove</button><button class="linkbtn" data-act="cancel">Keep</button>`
        : `<button class="btn btn-ghost btn-sm" data-act="remove" data-type="${type}" data-id="${item.id}">Remove</button>`}
    </div>`;
  }

  function render() {
    const pc = A.clubs.filter(x => x.status === "pending"), pv = A.vendors.filter(x => x.status === "pending"), pe = A.events.filter(x => x.status === "pending");
    $("#count-pending").textContent = pc.length + pv.length + pe.length;
    document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === A.tab)));
    const body = $("#admin-body");
    const section = (title, html) => `<h2 style="font-size:24px;text-transform:uppercase;margin:24px 0 12px">${title}</h2>${html}`;
    if (A.tab === "pending") {
      if (!pc.length && !pv.length && !pe.length) { body.innerHTML = `<div class="empty"><b>All caught up</b>New submissions from the website will show up here.</div>`; return; }
      body.innerHTML =
        (pe.length ? section(`Events (${pe.length})`, `<div class="queue">${pe.map(e => eventCard(e, true)).join("")}</div>`) : "") +
        (pc.length ? section(`Clubs (${pc.length})`, `<div class="queue">${pc.map(c => listingCard("club", c, CLUB_FIELDS)).join("")}</div>`) : "") +
        (pv.length ? section(`Vendors (${pv.length})`, `<div class="queue">${pv.map(v => listingCard("vendor", v, VENDOR_FIELDS)).join("")}</div>`) : "");
    } else if (A.tab === "live-events") {
      const live = A.events.filter(x => x.status === "approved").sort((a, b) => b.event_date.localeCompare(a.event_date));
      body.innerHTML = live.length ? `<div class="queue">${live.map(e => eventCard(e, false)).join("")}</div>` : `<div class="empty"><b>No live events yet</b>Approved events show here.</div>`;
    } else {
      const type = A.tab === "live-clubs" ? "club" : "vendor";
      const live = (type === "club" ? A.clubs : A.vendors).filter(x => x.status === "approved");
      body.innerHTML = `<p style="color:var(--muted);margin-top:0">To change a listing, use "Update listing" on the public site, then approve it here.</p>` + live.map(x => liveRow(type, x)).join("");
    }
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
    A.busy = true; b.disabled = true;
    try {
      if (act === "approve") { await approve(type, id); toast("Approved. It's live on the site."); }
      if (act === "reject-yes") { await removeRow(type, id); toast("Rejected and removed."); }
      if (act === "remove-yes") { await removeRow(type, id); toast("Removed from the site."); }
    } catch (x) { toast("Couldn't do that: " + (x.message || "try again")); }
    A.busy = false; A.confirm = null; await load();
  });

  checkSession();
})();
