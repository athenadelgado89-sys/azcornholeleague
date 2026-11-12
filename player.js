// Player login and profile editor.
(() => {
  const { sb, $, esc, normUrl, fileUrl, fmtDate, toast, upload } = window.AZCL;
  const LINKS = [["website", "website"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["scoreholio_url", "Scoreholio"]];
  const MAX_PHOTOS = 10;
  const P = { mode: "signup", user: null, me: null, photos: [], sponsors: [], results: [], confirm: null };
  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const show = id => ["auth", "newpass", "editor"].forEach(s => ($("#" + s).hidden = s !== id));
  const back = location.origin + location.pathname;

  if (!sb) { $("#note").innerHTML = `<div class="notice">Player profiles aren't available right now.</div>`; return; }

  /* ---------- Account ---------- */
  function setMode(mode) {
    P.mode = mode;
    document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    $("#pass-wrap").hidden = mode === "reset";
    $("#pass-hint").hidden = mode !== "signup";
    $("#auth-pass").autocomplete = mode === "signup" ? "new-password" : "current-password";
    $("#auth-btn").textContent = { signin: "Sign in", signup: "Create account", reset: "Send reset link" }[mode];
    $("#auth-err").textContent = ""; $("#auth-msg").hidden = true;
  }
  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("#auth-form").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#auth-err"), msg = $("#auth-msg"), btn = $("#auth-btn");
    err.textContent = ""; msg.hidden = true;
    const email = $("#auth-email").value.trim().toLowerCase(), pass = $("#auth-pass").value;
    if (!emailOk(email)) { err.textContent = "Enter a valid email."; return; }
    if (P.mode !== "reset" && pass.length < 8) { err.textContent = "Passwords are at least 8 characters."; return; }
    btn.disabled = true;
    try {
      if (P.mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw new Error(/confirm/i.test(error.message) ? "Confirm your email first. Check your inbox for the link." : "That email and password didn't match.");
        await start();
      } else if (P.mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: back } });
        if (error) throw error;
        if (data.session) { await start(); return; }
        msg.textContent = `Check ${email} for a confirmation link. After you confirm, come back here and sign in.`; msg.hidden = false;
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: back });
        if (error) throw error;
        msg.textContent = `If ${email} has an account, a reset link is on its way.`; msg.hidden = false;
      }
    } catch (x) { err.textContent = x.message || "Something went wrong. Try again."; }
    finally { btn.disabled = false; }
  });
  sb.auth.onAuthStateChange(evt => { if (evt === "PASSWORD_RECOVERY") show("newpass"); });
  $("#newpass-form").addEventListener("submit", async e => {
    e.preventDefault();
    const p = $("#np-pass").value;
    if (p.length < 8) { $("#np-err").textContent = "Use at least 8 characters."; return; }
    const { error } = await sb.auth.updateUser({ password: p });
    if (error) { $("#np-err").textContent = error.message; return; }
    toast("Password saved."); history.replaceState(null, "", back); start();
  });
  $("#signout").addEventListener("click", async () => { await sb.auth.signOut(); $("#signout").hidden = true; setMode("signin"); show("auth"); });

  /* ---------- Profile ---------- */
  async function start() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { show("auth"); return; }
    if (/type=recovery/.test(location.hash)) { show("newpass"); return; }
    P.user = session.user; $("#signout").hidden = false;
    const [me, clubs] = await Promise.all([
      sb.from("players").select("*").eq("user_id", P.user.id).maybeSingle(),
      sb.from("clubs").select("id,name,city").eq("status", "approved").order("name")
    ]);
    if (me.error && /players/.test(me.error.message)) { $("#note").innerHTML = `<div class="notice">Player profiles are almost ready. Check back soon.</div>`; show(null); return; }
    $("#pf-club").innerHTML = `<option value="">No home club</option>` + (clubs.data || []).map(c => `<option value="${c.id}">${esc(c.name)} (${esc(c.city)})</option>`).join("");
    P.me = me.data || null;
    fillForm();
    show("editor");
    if (P.me) await loadLists();
  }
  function fillForm() {
    const m = P.me || {};
    $("#ed-title").textContent = P.me ? m.display_name : "Create your profile";
    $("#ed-sub").textContent = P.me ? (m.hidden ? "Your profile is hidden by AZCL. Contact AZCL if you think that's a mistake." : "Changes go live on your profile as soon as you save.") : "Fill in the basics and save. Your profile goes live on the Players page right away.";
    $("#ed-view").hidden = !P.me; if (P.me) $("#ed-view").href = `./#player-${m.id}`;
    $("#extras").hidden = !P.me;
    $("#pf-name").value = m.display_name || ""; $("#pf-city").value = m.city || ""; $("#pf-club").value = m.home_club_id || ""; $("#pf-about").value = m.about || "";
    LINKS.forEach(([k]) => ($("#pf-" + k).value = m[k] || ""));
    const cur = $("#pf-photo-current");
    if (m.photo_path) { cur.hidden = false; cur.innerHTML = `<img src="${esc(fileUrl(m.photo_path))}" alt="" style="border-radius:50%">Current photo. Choose a file to replace it.`; } else { cur.hidden = true; cur.innerHTML = ""; }
    $("#pf-save").textContent = P.me ? "Save profile" : "Create profile";
  }
  $("#profile-form").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#pf-err"), btn = $("#pf-save"); err.textContent = "";
    const name = $("#pf-name").value.trim();
    if (name.length < 2) { err.textContent = "Add your name."; return; }
    const data = { display_name: name, city: $("#pf-city").value.trim() || null, home_club_id: $("#pf-club").value || null, about: $("#pf-about").value.trim() || null };
    for (const [k, label] of LINKS) {
      const u = normUrl($("#pf-" + k).value);
      if (u === null) { err.textContent = `The ${label} link isn't a valid web address.`; return; }
      data[k] = u || null;
    }
    btn.disabled = true;
    try {
      const f = $("#pf-photo").files[0];
      if (f) data.photo_path = await upload("players", f);
      const q = P.me ? sb.from("players").update(data).eq("id", P.me.id) : sb.from("players").insert({ ...data, user_id: P.user.id });
      const { data: rows, error } = await q.select("*");
      if (error) throw error;
      const created = !P.me;
      P.me = rows[0]; $("#pf-photo").value = "";
      fillForm(); if (created) await loadLists();
      toast(created ? "Profile created. It's live on the Players page." : "Saved.");
    } catch (x) { err.textContent = "Couldn't save: " + (x.message || "try again."); }
    finally { btn.disabled = false; }
  });

  /* ---------- Results, photos, sponsors ---------- */
  async function loadLists() {
    const id = P.me.id;
    const [r, ph, sp] = await Promise.all([
      sb.from("player_results").select("*").eq("player_id", id).order("event_date", { ascending: false }),
      sb.from("player_photos").select("*").eq("player_id", id).order("created_at", { ascending: false }),
      sb.from("player_sponsors").select("*").eq("player_id", id).order("created_at")
    ]);
    P.results = r.data || []; P.photos = ph.data || []; P.sponsors = sp.data || [];
    renderLists();
  }
  function renderLists() {
    const del = (kind, id) => P.confirm === kind + ":" + id
      ? `<button class="btn btn-sm btn-danger" type="button" data-del-yes="${kind}" data-id="${id}">Remove</button><button class="linkbtn" type="button" data-del-no>Keep</button>`
      : `<button class="linkbtn" type="button" data-del="${kind}" data-id="${id}">Remove</button>`;
    $("#rs-list").innerHTML = P.results.length ? P.results.map(r => `<div class="live-row"><span class="thumb" style="width:56px;height:44px;font-size:14px">${esc(r.finish.slice(0, 6))}</span><div><b>${esc(r.event_name)}</b><span>${esc(fmtDate(r.event_date))}${r.division ? " · " + esc(r.division) : ""}${r.partner ? " · with " + esc(r.partner) : ""}</span></div>${del("result", r.id)}</div>`).join("") : `<p class="muted">No results yet.</p>`;
    $("#ph-list").innerHTML = P.photos.length ? P.photos.map(p => `<figure class="ed-photo"><img src="${esc(fileUrl(p.path))}" alt="${esc(p.caption || "")}" loading="lazy"><figcaption>${p.caption ? esc(p.caption) : "<span class='muted'>No caption</span>"}<span>${del("photo", p.id)}</span></figcaption></figure>`).join("") : `<p class="muted">No photos yet.</p>`;
    $("#ph-add").disabled = P.photos.length >= MAX_PHOTOS;
    $("#sp-list").innerHTML = P.sponsors.length ? P.sponsors.map(s => `<div class="live-row">${s.logo_path ? `<img class="thumb" src="${esc(fileUrl(s.logo_path))}" alt="" style="width:56px;height:44px;object-fit:contain;background:#fff">` : `<span class="thumb" style="width:56px;height:44px;font-size:14px">${esc(s.name.slice(0, 2).toUpperCase())}</span>`}<div><b>${esc(s.name)}</b><span>${s.url ? esc(s.url) : "No website"}</span></div>${del("sponsor", s.id)}</div>`).join("") : `<p class="muted">No sponsors yet.</p>`;
  }
  document.addEventListener("click", async e => {
    const d = e.target.closest("[data-del],[data-del-yes],[data-del-no]"); if (!d) return;
    if (d.hasAttribute("data-del-no")) { P.confirm = null; renderLists(); return; }
    if (d.dataset.del) { P.confirm = d.dataset.del + ":" + d.dataset.id; renderLists(); return; }
    const table = { photo: "player_photos", sponsor: "player_sponsors", result: "player_results" }[d.dataset.delYes];
    d.disabled = true;
    const { error } = await sb.from(table).delete().eq("id", d.dataset.id);
    P.confirm = null; toast(error ? "Couldn't remove that. Try again." : "Removed."); loadLists();
  });

  $("#rs-add").addEventListener("click", async () => {
    const err = $("#rs-err"), btn = $("#rs-add"); err.textContent = "";
    const v = k => $("#rs-" + k).value.trim();
    if (!v("event") || !v("date") || !v("finish")) { err.textContent = "Add the event, date and your finish."; return; }
    btn.disabled = true;
    const { error } = await sb.from("player_results").insert({ player_id: P.me.id, event_name: v("event"), event_date: v("date"), finish: v("finish"), division: v("division") || null, partner: v("partner") || null });
    btn.disabled = false;
    if (error) { err.textContent = "Couldn't add: " + error.message; return; }
    ["event", "date", "finish", "division", "partner"].forEach(k => ($("#rs-" + k).value = ""));
    toast("Result added."); loadLists();
  });

  $("#ph-add").addEventListener("click", async () => {
    const err = $("#ph-err"), btn = $("#ph-add"); err.textContent = "";
    const files = [...$("#ph-files").files];
    if (!files.length) { err.textContent = "Choose one or more photos first."; return; }
    const room = MAX_PHOTOS - P.photos.length;
    if (files.length > room) { err.textContent = `You can add ${room} more photo${room === 1 ? "" : "s"}. Remove some first or choose fewer.`; return; }
    const caption = $("#ph-caption").value.trim() || null;
    btn.disabled = true; let done = 0;
    try {
      for (const f of files) {
        btn.textContent = `Uploading ${done + 1} of ${files.length}…`;
        const path = await upload("player-photos", f);
        const { error } = await sb.from("player_photos").insert({ player_id: P.me.id, path, caption });
        if (error) throw error;
        done++;
      }
      $("#ph-files").value = ""; $("#ph-caption").value = "";
      toast(`Added ${done} photo${done === 1 ? "" : "s"}.`);
    } catch (x) { err.textContent = `Uploaded ${done} of ${files.length}. ${x.message || "Try again."}`; }
    finally { btn.textContent = "Upload photos"; btn.disabled = false; loadLists(); }
  });

  $("#sp-add").addEventListener("click", async () => {
    const err = $("#sp-err"), btn = $("#sp-add"); err.textContent = "";
    const name = $("#sp-name").value.trim();
    if (!name) { err.textContent = "Add the sponsor's name."; return; }
    const url = normUrl($("#sp-url").value);
    if (url === null) { err.textContent = "The sponsor website isn't a valid web address."; return; }
    btn.disabled = true;
    try {
      const f = $("#sp-logo").files[0];
      const logo_path = f ? await upload("sponsors", f) : null;
      const { error } = await sb.from("player_sponsors").insert({ player_id: P.me.id, name, url: url || null, logo_path });
      if (error) throw error;
      $("#sp-name").value = ""; $("#sp-url").value = ""; $("#sp-logo").value = "";
      toast("Sponsor added."); loadLists();
    } catch (x) { err.textContent = "Couldn't add: " + (x.message || "try again."); }
    finally { btn.disabled = false; }
  });

  window.AZCL.track && window.AZCL.track("view", "player-login", null);
  setMode("signup");
  start();
})();
