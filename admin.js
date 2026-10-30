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
      <div><b>${esc(item.name)}</b><span>${esc([item.category, item.city].filter(Boolean).join(" · "))}</span>${confirm ? `<span style="color:var(--danger)">Remove ${esc(item.name)}?${warn}</span>` : ""}</div>
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
    document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === A.tab)));
    const body = $("#admin-body");
    const section = (title, html) => `<h2 style="font-size:24px;text-transform:uppercase;margin:24px 0 12px">${title}</h2>${html}`;
    if (A.tab === "pending") {
      if (!pc.length && !pv.length && !pe.length) { body.innerHTML = `<div class="empty"><b>All caught up</b>New submissions from the website will show up here.</div>`; return; }
      body.innerHTML =
        (pe.length ? section(`Events (${pe.length})`, `<div class="queue">${pe.map(e => eventCard(e, true)).join("")}</div>`) : "") +
        (pc.length ? section(`Clubs (${pc.length})`, `<div class="queue">${pc.map(c => listingCard("club", c, CLUB_FIELDS)).join("")}</div>`) : "") +
        (pv.length ? section(`Vendors (${pv.length})`, `<div class="queue">${pv.map(v => listingCard("vendor", v, VENDOR_FIELDS)).join("")}</div>`) : "");
    } else if (A.tab === "scoreholio") {
      body.innerHTML = renderScoreholio(unlinked);
    } else if (A.tab === "live-events") {
      const live = A.events.filter(x => x.status === "approved" || x.status === "hidden").sort((a, b) => b.event_date.localeCompare(a.event_date));
      body.innerHTML = live.length ? `<div class="queue">${live.map(e => eventCard(e, false)).join("")}</div>` : `<div class="empty"><b>No live events yet</b>Approved events show here.</div>`;
    } else {
      const type = A.tab === "live-clubs" ? "club" : "vendor";
      const live = (type === "club" ? A.clubs : A.vendors).filter(x => x.status === "approved");
      body.innerHTML = `<p style="color:var(--muted);margin-top:0">To change a listing, use "Update listing" on the public site, then approve it here.</p>` + live.map(x => liveRow(type, x)).join("");
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
      if (act === "hide" || act === "unhide") { const { error } = await sb.from("events").update({ status: act === "hide" ? "hidden" : "approved" }).eq("id", id); if (error) throw error; toast(act === "hide" ? "Hidden from the site." : "Showing on the site again."); }
      if (act === "link") {
        const clubId = document.getElementById("link-" + id).value;
        if (!clubId) throw new Error("choose a club first");
        const { error } = await sb.from("clubs").update({ scoreholio_organizer_id: id }).eq("id", clubId); if (error) throw error;
        await sb.from("scoreholio_organizers").update({ ignored: false }).eq("id", id);
        toast("Linked. Their tournaments arrive at the next hourly import.");
      }
      if (act === "unlink") { const { error } = await sb.from("clubs").update({ scoreholio_organizer_id: null }).eq("id", id); if (error) throw error; toast("Unlinked. Their imported events are removed at the next import."); }
      if (act === "ignore" || act === "unignore") { const { error } = await sb.from("scoreholio_organizers").update({ ignored: act === "ignore" }).eq("id", id); if (error) throw error; toast(act === "ignore" ? "Ignored." : "Moved back to Needs a club."); }
      if (act === "reject-yes") { await removeRow(type, id); toast("Rejected and removed."); }
      if (act === "remove-yes") { await removeRow(type, id); toast("Removed from the site."); }
    } catch (x) { toast("Couldn't do that: " + (x.message || "try again")); }
    A.busy = false; A.confirm = null; await load();
  });

  checkSession();
})();
