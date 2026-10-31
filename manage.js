// Club login and club page editor.
(() => {
  const { sb, $, esc, normUrl, fileUrl, toast, upload } = window.AZCL;
  const TYPES = ["Weeknights", "Fundraisers", "Private", "Corporate", "Non-profit"];
  const LINKS = [["scoreholio", "Scoreholio"], ["website", "website"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["youtube", "YouTube"]];
  const MAX_PHOTOS = 24;
  const M = { mode: "signin", clubs: [], club: null, photos: [], sponsors: [], clearPotw: false, confirm: null };
  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const show = id => ["auth", "newpass", "noclub", "editor"].forEach(s => ($("#" + s).hidden = s !== id));

  if (!sb) { $("#manage-note").innerHTML = `<div class="notice">Club logins aren't available right now.</div>`; return; }

  $("#ed-types").innerHTML = TYPES.map(t => `<label class="check"><input type="checkbox" value="${t}"> ${t}</label>`).join("");

  /* ---------- Sign in, create account, reset ---------- */
  function setMode(mode) {
    M.mode = mode;
    document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    $("#pass-wrap").hidden = mode === "reset";
    $("#pass-hint").hidden = mode !== "signup";
    $("#auth-pass").autocomplete = mode === "signup" ? "new-password" : "current-password";
    $("#auth-btn").textContent = { signin: "Sign in", signup: "Create account", reset: "Send reset link" }[mode];
    $("#auth-err").textContent = ""; $("#auth-msg").hidden = true;
  }
  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  const back = location.origin + location.pathname;

  $("#auth-form").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#auth-err"), msg = $("#auth-msg"), btn = $("#auth-btn");
    err.textContent = ""; msg.hidden = true;
    const email = $("#auth-email").value.trim().toLowerCase(), pass = $("#auth-pass").value;
    if (!emailOk(email)) { err.textContent = "Enter a valid email."; return; }
    if (M.mode !== "reset" && pass.length < 8) { err.textContent = "Passwords are at least 8 characters."; return; }
    btn.disabled = true;
    try {
      if (M.mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw new Error(/confirm/i.test(error.message) ? "Confirm your email first. Check your inbox for the link." : "That email and password didn't match.");
        await start();
      } else if (M.mode === "signup") {
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

  /* ---------- Load the clubs this account manages ---------- */
  async function start() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { show("auth"); return; }
    if (/type=recovery/.test(location.hash)) { show("newpass"); return; }
    $("#signout").hidden = false;
    const email = (session.user.email || "").toLowerCase();
    const { data: admin } = await sb.rpc("is_admin");
    let clubs = [];
    if (admin) {
      const r = await sb.from("clubs").select("*").eq("status", "approved").order("name");
      clubs = r.data || [];
    } else {
      const links = await sb.from("club_managers").select("club_id").eq("email", email);
      const ids = (links.data || []).map(l => l.club_id);
      if (ids.length) { const r = await sb.from("clubs").select("*").in("id", ids).eq("status", "approved").order("name"); clubs = r.data || []; }
    }
    M.clubs = clubs;
    if (!clubs.length) { $("#noclub-email").textContent = email; show("noclub"); return; }
    const want = new URLSearchParams(location.search).get("club");
    const sel = $("#ed-club");
    sel.innerHTML = clubs.map(c => `<option value="${c.id}">${esc(c.name)} (${esc(c.city)})</option>`).join("");
    sel.hidden = clubs.length < 2;
    sel.value = clubs.some(c => c.id === want) ? want : clubs[0].id;
    show("editor");
    await openClub(sel.value);
  }
  $("#ed-club").addEventListener("change", e => openClub(e.target.value));

  async function openClub(id) {
    const c = M.clubs.find(x => x.id === id); M.club = c; M.clearPotw = false; M.confirm = null;
    history.replaceState(null, "", `${back}?club=${id}`);
    $("#ed-name").textContent = c.name;
    $("#ed-view").href = `./#club-${id}`;
    $("#page-form").reset(); $("#ed-err").textContent = "";
    $("#ed-about").value = c.about || "";
    document.querySelectorAll("#ed-types input").forEach(i => (i.checked = (c.event_types || []).includes(i.value)));
    $("#ed-book").checked = !!c.booking_enabled; $("#ed-book-email").value = c.booking_email || ""; syncBook();
    $("#ed-potw-name").value = c.potw_name || ""; $("#ed-potw-blurb").value = c.potw_blurb || "";
    preview("#ed-potw-current", c.potw_photo_path, "Current photo. Choose a file to replace it.");
    preview("#ed-logo-current", c.logo_path, "Current logo. Choose a file to replace it.");
    LINKS.forEach(([k]) => ($("#ed-" + k).value = c[k] || ""));
    await loadLists();
  }
  function preview(sel, path, text) {
    const el = $(sel);
    if (path) { el.hidden = false; el.innerHTML = `<img src="${esc(fileUrl(path))}" alt="">${text}`; } else { el.hidden = true; el.innerHTML = ""; }
  }
  function syncBook() { $("#ed-book-email-wrap").hidden = !$("#ed-book").checked; }
  $("#ed-book").addEventListener("change", syncBook);
  $("#ed-potw-clear").addEventListener("click", () => {
    $("#ed-potw-name").value = ""; $("#ed-potw-blurb").value = ""; $("#ed-potw-photo").value = "";
    M.clearPotw = true; preview("#ed-potw-current", null); toast("Cleared. Save to update your page.");
  });

  /* ---------- Save the page ---------- */
  $("#page-form").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#ed-err"), btn = $("#ed-save"); err.textContent = "";
    const c = M.club;
    const booking = $("#ed-book").checked, bookEmail = $("#ed-book-email").value.trim();
    if (booking && !emailOk(bookEmail)) { err.textContent = "Add the email where booking requests should go."; return; }
    const data = {
      about: $("#ed-about").value.trim() || null,
      event_types: [...document.querySelectorAll("#ed-types input:checked")].map(i => i.value),
      booking_enabled: booking, booking_email: booking ? bookEmail : null,
      potw_name: $("#ed-potw-name").value.trim() || null,
      potw_blurb: $("#ed-potw-blurb").value.trim() || null
    };
    for (const [k, label] of LINKS) {
      const u = normUrl($("#ed-" + k).value);
      if (u === null) { err.textContent = `The ${label} link isn't a valid web address.`; return; }
      data[k] = u || null;
    }
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const potwFile = $("#ed-potw-photo").files[0], logoFile = $("#ed-logo").files[0];
      if (potwFile) data.potw_photo_path = await upload("potw", potwFile);
      else if (M.clearPotw || !data.potw_name) data.potw_photo_path = null;
      if (logoFile) data.logo_path = await upload("clubs", logoFile);
      if ((data.potw_name || null) !== (c.potw_name || null) || potwFile) data.potw_updated_at = new Date().toISOString();
      const { data: rows, error } = await sb.from("clubs").update(data).eq("id", c.id).select("*");
      if (error) throw error;
      if (!rows || !rows.length) throw new Error("this account can't edit this club. Ask AZCL to check your access.");
      Object.assign(c, rows[0]);
      await openClub(c.id);
      toast("Saved. Your club page is updated.");
    } catch (x) { err.textContent = "Couldn't save: " + (x.message || "try again."); }
    finally { btn.disabled = false; btn.textContent = "Save club page"; }
  });

  /* ---------- Photos and sponsors ---------- */
  async function loadLists() {
    const id = M.club.id;
    const [p, s] = await Promise.all([
      sb.from("club_photos").select("*").eq("club_id", id).order("created_at", { ascending: false }),
      sb.from("club_sponsors").select("*").eq("club_id", id).order("created_at")
    ]);
    M.photos = p.data || []; M.sponsors = s.data || [];
    renderLists();
  }
  function renderLists() {
    const del = (kind, id) => M.confirm === kind + ":" + id
      ? `<button class="btn btn-sm btn-danger" type="button" data-del-yes="${kind}" data-id="${id}">Remove</button><button class="linkbtn" type="button" data-del-no>Keep</button>`
      : `<button class="linkbtn" type="button" data-del="${kind}" data-id="${id}">Remove</button>`;
    $("#ph-list").innerHTML = M.photos.length
      ? M.photos.map(p => `<figure class="ed-photo"><img src="${esc(fileUrl(p.path))}" alt="${esc(p.caption || "")}" loading="lazy"><figcaption>${p.caption ? esc(p.caption) : "<span class='muted'>No caption</span>"}<span>${del("photo", p.id)}</span></figcaption></figure>`).join("")
      : `<p class="muted">No photos yet.</p>`;
    $("#ph-add").disabled = M.photos.length >= MAX_PHOTOS;
    $("#sp-list").innerHTML = M.sponsors.length
      ? M.sponsors.map(s => `<div class="live-row">${s.logo_path ? `<img class="thumb" src="${esc(fileUrl(s.logo_path))}" alt="" style="width:56px;height:44px;object-fit:contain;background:#fff">` : `<span class="thumb" style="width:56px;height:44px;font-size:14px">${esc(s.name.slice(0, 2).toUpperCase())}</span>`}<div><b>${esc(s.name)}</b><span>${s.url ? esc(s.url) : "No website"}</span></div>${del("sponsor", s.id)}</div>`).join("")
      : `<p class="muted">No sponsors yet.</p>`;
  }
  document.addEventListener("click", async e => {
    const d = e.target.closest("[data-del],[data-del-yes],[data-del-no]"); if (!d) return;
    if (d.hasAttribute("data-del-no")) { M.confirm = null; renderLists(); return; }
    if (d.dataset.del) { M.confirm = d.dataset.del + ":" + d.dataset.id; renderLists(); return; }
    const table = d.dataset.delYes === "photo" ? "club_photos" : "club_sponsors";
    d.disabled = true;
    const { error } = await sb.from(table).delete().eq("id", d.dataset.id);
    M.confirm = null;
    if (error) toast("Couldn't remove that. Try again."); else toast("Removed.");
    loadLists();
  });

  $("#ph-add").addEventListener("click", async () => {
    const err = $("#ph-err"), btn = $("#ph-add"); err.textContent = "";
    const files = [...$("#ph-files").files];
    if (!files.length) { err.textContent = "Choose one or more photos first."; return; }
    const room = MAX_PHOTOS - M.photos.length;
    if (files.length > room) { err.textContent = `You can add ${room} more photo${room === 1 ? "" : "s"}. Remove some first or choose fewer.`; return; }
    const caption = $("#ph-caption").value.trim() || null;
    btn.disabled = true;
    let done = 0;
    try {
      for (const f of files) {
        btn.textContent = `Uploading ${done + 1} of ${files.length}…`;
        const path = await upload("club-photos", f);
        const { error } = await sb.from("club_photos").insert({ club_id: M.club.id, path, caption });
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
      const { error } = await sb.from("club_sponsors").insert({ club_id: M.club.id, name, url: url || null, logo_path });
      if (error) throw error;
      $("#sp-name").value = ""; $("#sp-url").value = ""; $("#sp-logo").value = "";
      toast("Sponsor added.");
      loadLists();
    } catch (x) { err.textContent = "Couldn't add: " + (x.message || "try again."); }
    finally { btn.disabled = false; }
  });

  setMode("signin");
  start();
})();
