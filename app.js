/* Settlement APK – choose boundaries, add a settlement that isn't listed (mobile prototype)
 *
 * Choose your boundaries: LGA → Ward → Health Facility → Settlement, each a multi-select
 *   dropdown (tick boxes in the list, selected items shown as removable chips). Each level
 *   lists the children of everything ticked above it.
 *   Only the lowest level can be added: "Didn’t find your settlement?" under the Settlement
 *   dropdown opens the Add Settlement form; once saved it comes back ticked.
 * Submit → Select Your Settlement. The app always opens on Choose your boundaries.
 */
(function () {
  "use strict";

  // ---------- Mock boundary master data ----------
  const BOUNDARIES = {
    "Dala": {
      "Kantudu": {
        "Kantudu PHC": ["Pachi", "Kantudu Gabas", "Unguwar Liman", "Gidan Maiwada", "Diu"],
        "Dala Model Clinic": ["Dala Hill", "Kofar Mazugal"]
      },
      "Madigawa": { "Madigawa HP": ["Madigawa Yamma", "Rafin Kwari"] }
    },
    "Gwale": {
      "Goron Dutse": { "Goron Dutse CHC": ["Goron Dutse Tsakiya", "Sabon Layi"] },
      "Gyaranya": { "Gyaranya PHC": ["Tudun Bojuwa", "Gyaranya Kudu"] }
    }
  };

  const LEVELS = [
    { key: "lga", label: "LGA" },
    { key: "ward", label: "Ward" },
    { key: "hf", label: "Health Facility" },
    { key: "settlement", label: "Settlement" }
  ];
  const TYPES = ["Urban", "Rural", "Slum"];
  // Security levels are named by what they mean for the team.
  const SECURITY = ["Safe to visit", "Visit with caution", "Not safe to visit"];
  const ACCESS = [
    { value: "Roads", desc: "By car or motorbike" },
    { value: "Water", desc: "Only by boat or canoe" }
  ];

  // ---------- Persistence ----------
  const STORE_KEY = "settlement-apk-v2";
  let store;
  try { store = JSON.parse(localStorage.getItem(STORE_KEY)) || { added: [], last: null }; } catch (e) { store = { added: [], last: null }; }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* private mode */ } };

  // Master data with added settlements merged in at their path.
  function tree() {
    const t = JSON.parse(JSON.stringify(BOUNDARIES));
    for (const a of store.added) {
      t[a.lga] = t[a.lga] || {};
      t[a.lga][a.ward] = t[a.lga][a.ward] || {};
      const list = (t[a.lga][a.ward][a.hf] = t[a.lga][a.ward][a.hf] || []);
      if (!list.includes(a.settlement)) list.push(a.settlement);
    }
    return t;
  }

  // Options for a level = children of everything ticked at every level above it.
  function optionsFor(i, sel = state.sel) {
    let nodes = [tree()];
    for (let j = 0; j < i; j++) {
      const picked = sel[LEVELS[j].key];
      nodes = nodes.flatMap(n => Object.keys(n).filter(k => picked.includes(k)).map(k => n[k]));
    }
    return [...new Set(nodes.flatMap(n => (Array.isArray(n) ? n : Object.keys(n))))];
  }

  // LGA and ward a health facility sits under (for saving a new settlement).
  function hfPath(hf) {
    const t = tree();
    for (const lga of Object.keys(t)) for (const ward of Object.keys(t[lga])) if (t[lga][ward][hf]) return { lga, ward };
    return null;
  }

  // An existing settlement with this name (case-insensitive), preferring the chosen health facility.
  function findExisting(name, hf) {
    const t = tree(), key = name.trim().toLowerCase(), hits = [];
    for (const lga of Object.keys(t)) for (const ward of Object.keys(t[lga])) for (const h of Object.keys(t[lga][ward]))
      for (const settlement of t[lga][ward][h]) if (settlement.toLowerCase() === key) hits.push({ lga, ward, hf: h, settlement });
    return hits.find(x => x.hf === hf) || hits[0] || null;
  }

  // ---------- Session state ----------
  const blankSel = () => ({ lga: [], ward: [], hf: [], settlement: [] });
  const state = {
    route: "boundaries",   // the app always opens on Choose your boundaries
    history: [],
    sel: blankSel(),
    open: null,            // level whose multi-select list is open
    draft: null,
    dup: null,             // existing settlement matching the name being added
    gps: null,
    errors: {}
  };

  // ---------- Helpers ----------
  const $phone = document.getElementById("phone");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reqMark = '<span class="req" aria-hidden="true">*</span>';

  const ICON = {
    back: '<svg viewBox="0 0 8 10" aria-hidden="true"><path d="M7 0v10L0 5z" fill="currentColor"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>',
    add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    pinOutline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 2a5 5 0 0 1 5 5c0 3.3-3.4 8-5 10-1.6-2-5-6.7-5-10a5 5 0 0 1 5-5zm0 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>',
    tick: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    caret: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>',
    go: '<svg class="go-icon" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="14" fill="currentColor"/><path d="M8 14h11m-4.5-5 5 5-5 5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    gps: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="m4.8 8.2 2.2 2.2 4.2-4.6" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warning: '<svg class="dialog-icon" viewBox="0 0 48 44" aria-hidden="true"><path d="M24 1 47 43H1z" fill="#B91900"/><path d="M24 15v14" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><circle cx="24" cy="36" r="2.6" fill="#fff"/></svg>',
    error: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 4.5v4.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.3" r="1" fill="#fff"/></svg>'
  };

  const errorText = (id, msg) => `<p class="field-error" id="${id}-err" ${msg ? "" : "hidden"}>${ICON.error}<span>${esc(msg || "")}</span></p>`;

  // ---------- Boundary field: multi-select dropdown ----------
  // Trigger shows "Select" or "N selected"; the list opens below with tick boxes; chips list what's ticked.
  // Only the lowest level (Settlement) gets "Didn’t find your settlement?" + a Create New Settlement button under it.
  function boundaryField(level, i) {
    const { key, label } = level, picked = state.sel[key], id = `b-${key}`;
    const parentReady = !i || state.sel[LEVELS[i - 1].key].length > 0;
    const opts = optionsFor(i), open = state.open === key && parentReady;
    return `<div class="field ms" data-ms="${key}">
      <p class="field-label" id="${id}-label">${esc(label)}${reqMark}</p>
      <button class="input ms-trigger ${open ? "open" : ""}" id="${id}" data-action="ms-toggle" data-level="${key}"
        aria-expanded="${open}" aria-controls="${id}-list" aria-labelledby="${id}-label ${id}-value" ${parentReady ? "" : "disabled"}>
        <span class="ms-value ${picked.length ? "" : "placeholder"}" id="${id}-value">${picked.length ? `${picked.length} selected` : parentReady ? "Select" : ""}</span>${ICON.caret}
      </button>
      ${open ? `<div class="ms-list" id="${id}-list" role="group" aria-labelledby="${id}-label">
          ${opts.map((o, n) => `<label class="ms-opt"><input type="checkbox" id="${id}-opt-${n}" data-level="${key}" value="${esc(o)}" ${picked.includes(o) ? "checked" : ""}/>
            <span class="ms-box">${ICON.tick}</span><span>${esc(o)}</span></label>`).join("")}
        </div>` : ""}
      ${picked.length ? `<ul class="ms-chips" aria-label="Selected ${esc(label)}">
          ${picked.map(v => `<li class="ms-chip"><span>${esc(v)}</span><button data-action="ms-remove" data-level="${key}" data-value="${esc(v)}" aria-label="Remove ${esc(v)}">${ICON.close}</button></li>`).join("")}
        </ul>` : ""}
      ${key === "settlement" && parentReady ? `<p class="find-label">Didn’t find your settlement?</p>
        <button class="btn btn-secondary btn-inline" data-action="add-settlement">${ICON.add}Create New Settlement</button>` : ""}
    </div>`;
  }

  // Stacked radio options; an optional explanation follows the label after a dash.
  function choiceList(id, legend, value, options) {
    const err = state.errors[id];
    return `<fieldset class="field plain-fieldset ${err ? "has-error" : ""}" id="${id}-group" aria-describedby="${id}-err">
        <legend class="field-label">${esc(legend)}${reqMark}</legend>
        <div class="choices">
          ${options.map(o => `<label class="choice"><input type="radio" name="${id}" value="${esc(o.value)}" ${o.value === value ? "checked" : ""}/>
            <span class="choice-label">${esc(o.value)}${o.desc ? ` – <span class="choice-desc">${esc(o.desc)}</span>` : ""}</span></label>`).join("")}
        </div>
        ${errorText(id, err)}
      </fieldset>`;
  }

  function selectField(id, label, value, options) {
    const err = state.errors[id];
    return `<div class="field">
      <label class="field-label" for="${id}">${esc(label)}${reqMark}</label>
      <div class="select-wrap">
        <select class="input ${err ? "invalid" : ""}" id="${id}" aria-required="true" aria-invalid="${!!err}" aria-describedby="${id}-err">
          <option value="" ${value ? "" : "selected"}>Select</option>
          ${options.map(o => `<option ${o === value ? "selected" : ""}>${esc(o)}</option>`).join("")}
        </select>${ICON.caret}
      </div>
      ${errorText(id, err)}
    </div>`;
  }

  const complete = () => LEVELS.every(l => state.sel[l.key].length);

  // ---------- Screens ----------
  const VIEWS = {
    boundaries() {
      return {
        bare: !state.history.length,
        body: `<div class="card boundary-card">
            <h1 class="card-title" id="page-title" tabindex="-1">Choose your boundaries</h1>
            ${LEVELS.map(boundaryField).join("")}
          </div>`,
        footer: `<button class="btn btn-primary" id="submit-btn" data-action="submit" ${complete() ? "" : "disabled"}>Submit</button>`
      };
    },

    add() {
      const d = state.draft, nameErr = state.errors["add-name"], hfs = state.sel.hf;
      return {
        tag: hfs.length === 1 ? hfs[0] : "",
        // Questions follow how a worker thinks about a place: what it is → is it safe → how you get there.
        // GPS is captured on its own, so it sits last as a confirmation.
        body: `<h1 class="page-title" id="page-title" tabindex="-1">Add Settlement</h1>
          <p class="page-desc">Add details about the settlement you are creating.</p>
          <div class="card">
            ${hfs.length > 1 ? selectField("add-hf", "Health Facility", d.hf, hfs) : ""}
            <div class="field">
              <label class="field-label" for="add-name">Name${reqMark}</label>
              <input class="input ${nameErr ? "invalid" : ""}" id="add-name" value="${esc(d.name)}" autocomplete="off" autocapitalize="words" aria-required="true" aria-invalid="${!!nameErr}" aria-describedby="add-name-err" />
              ${errorText("add-name", nameErr)}
            </div>
            ${selectField("add-type", "Type", d.type, TYPES)}
            ${selectField("add-security", "How safe is it to visit this settlement?", d.security, SECURITY)}
            ${choiceList("add-access", "How do you reach this settlement?", d.access, ACCESS)}
            <div class="field">
              <label class="field-label" for="add-gps">GPS accuracy</label>
              <input class="input" id="add-gps" readonly value="${state.gps ? `${state.gps.accuracy} m` : "Capturing…"}" aria-describedby="add-gps-note" />
              <p class="gps" id="add-gps-note" ${state.gps ? "" : "hidden"}>${ICON.gps}Captured automatically</p>
            </div>
          </div>`,
        footer: `<button class="btn btn-primary" data-action="save">Save</button>`,
        overlay: state.dup ? `<div class="dialog-backdrop">
            <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dup-title" aria-describedby="dup-desc">
              <button class="dialog-close" data-action="dup-close" aria-label="Close">${ICON.close}</button>
              ${ICON.warning}
              <h2 class="dialog-title" id="dup-title">Settlement Already Exists</h2>
              <p class="dialog-desc" id="dup-desc">A settlement named <strong>“${esc(state.dup.settlement)}”</strong> already exists. Creating another may result in duplicate records. Do you want to use the existing one?</p>
              <div class="dialog-actions">
                <button class="btn btn-primary" id="dup-existing" data-action="dup-existing">Use Existing Settlement</button>
                <button class="btn btn-secondary" data-action="dup-continue">Create New Anyway</button>
              </div>
            </div>
          </div>` : ""
      };
    },

    village() {
      return {
        body: `<h1 class="page-title" id="page-title" tabindex="-1">Select Your Settlement</h1>
          ${state.sel.settlement.map(v => `<button class="village-card" data-action="continue" aria-label="Continue with ${esc(v)}">
            <span class="village-name">${esc(v)}</span>${ICON.go}
          </button>`).join("")}
          <p class="another-label">Want to choose another settlement?</p>
          <button class="btn btn-secondary btn-inline" data-action="choose-another">${ICON.pinOutline}Choose Another Settlement</button>`
      };
    }
  };

  // ---------- Render ----------
  function render({ focus = "page-title" } = {}) {
    const view = VIEWS[state.route]();
    $phone.innerHTML = `
      <div class="status-bar" aria-hidden="true"></div>
      ${view.bare ? "" : `<header class="app-bar"><button class="back-btn" data-action="back">${ICON.back}Back</button></header>`}
      <div class="body body-${state.route}" id="screen-body">${view.tag ? `<div class="tag">${ICON.pin}<span>${esc(view.tag)}</span></div>` : ""}${view.body}</div>
      ${view.footer ? `<footer class="footer">${view.footer}</footer>` : ""}
      ${view.overlay || ""}
      <div class="toast" id="toast" role="status" hidden></div>`;
    document.title = document.getElementById("page-title").textContent;
    document.querySelector(".ms-list")?.scrollIntoView({ block: "nearest" });   // keep an open list clear of the footer
    const el = focus && document.getElementById(focus);
    if (el) {
      el.focus({ preventScroll: focus === "page-title" });
      if (el.tagName === "INPUT" && el.type === "text") el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  function go(route) {
    state.history.push(state.route);
    state.route = route;
    state.errors = {};
    render();
  }

  function back() {
    clearTimeout(gpsTimer);
    state.route = state.history.pop() || "boundaries";
    state.errors = {};
    state.dup = null;
    render();
  }

  let toastTimer;
  // success = green DIGIT toast with a tick; otherwise the neutral dark toast.
  function toast(msg, { success = false } = {}) {
    const t = document.getElementById("toast");
    t.className = `toast ${success ? "toast-success" : ""}`;
    t.innerHTML = `${success ? ICON.gps : ""}<span>${esc(msg)}</span>`;
    t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // Drops ticks below a level that no longer sit under anything ticked above.
  function pruneBelow(key) {
    const i = LEVELS.findIndex(l => l.key === key);
    for (let j = i + 1; j < LEVELS.length; j++) {
      const opts = optionsFor(j);
      state.sel[LEVELS[j].key] = state.sel[LEVELS[j].key].filter(v => opts.includes(v));
    }
  }

  // GPS is captured automatically when the form opens (mocked fix after ~1.2 s).
  let gpsTimer;
  function captureGps() {
    state.gps = null;
    clearTimeout(gpsTimer);
    gpsTimer = setTimeout(() => {
      state.gps = { accuracy: 6, lat: 12.0071, lng: 8.5213 };
      const input = document.getElementById("add-gps");
      if (input) { input.value = "6 m"; document.getElementById("add-gps-note").hidden = false; }
    }, 1200);
  }

  // ---------- Validation ----------
  function showErrors(errors) {
    state.errors = errors;
    for (const [id, msg] of Object.entries(errors)) {
      const err = document.getElementById(`${id}-err`);
      if (err) { err.hidden = !msg; err.querySelector("span").textContent = msg || ""; }
      const input = document.getElementById(id);
      if (input) { input.classList.toggle("invalid", !!msg); input.setAttribute("aria-invalid", String(!!msg)); }
      document.getElementById(`${id}-group`)?.classList.toggle("has-error", !!msg);
    }
    const first = Object.keys(errors).find(id => errors[id]);
    if (first) (document.getElementById(first) || document.querySelector(`#${first}-group input`))?.focus();
    return !first;
  }
  function clearError(id) {
    if (state.errors[id]) showErrors({ ...state.errors, [id]: "" });
  }

  // ---------- Saving ----------
  function createSettlement() {
    const d = state.draft, s = state.sel, name = d.name.trim();
    store.added.push({ ...hfPath(d.hf), hf: d.hf, settlement: name,
      type: d.type, security: d.security, access: d.access, gps: state.gps });
    save();
    // New settlement comes back already ticked.
    if (!s.settlement.includes(name)) s.settlement.push(name);
    returnToBoundaries();
    toast("New settlement added successfully", { success: true });
  }

  function returnToBoundaries() {
    state.route = state.history.pop() || "boundaries";
    state.errors = {};
    render({ focus: "b-settlement" });
    document.querySelector('[data-ms="settlement"]')?.scrollIntoView({ block: "center" });
  }

  // ---------- Actions ----------
  const ACTIONS = {
    back,
    "ms-toggle"(btn) {
      const key = btn.dataset.level;
      state.open = state.open === key ? null : key;
      render({ focus: `b-${key}` });
    },
    "ms-remove"(btn) {
      const key = btn.dataset.level;
      state.sel[key] = state.sel[key].filter(v => v !== btn.dataset.value);
      pruneBelow(key);
      render({ focus: `b-${key}` });
    },
    "add-settlement"() {
      state.open = null;
      const hfs = state.sel.hf;
      state.draft = { hf: hfs.length === 1 ? hfs[0] : "", type: "", security: "", name: "", access: "" };
      go("add");
      captureGps();
    },
    save() {
      const d = state.draft;
      const ok = showErrors({
        ...(state.sel.hf.length > 1 ? { "add-hf": d.hf ? "" : "Select the health facility" } : {}),
        "add-name": d.name.trim() ? "" : "Enter the settlement name",
        "add-type": d.type ? "" : "Select the type",
        "add-security": d.security ? "" : "Select how safe it is to visit",
        "add-access": d.access ? "" : "Select how you reach the settlement"
      });
      if (!ok) return;
      if (!state.gps) return toast("Waiting for GPS — try again in a moment.");
      // Same name already exists: ask before creating a duplicate.
      state.dup = findExisting(d.name, d.hf);
      if (state.dup) return render({ focus: "dup-existing" });
      createSettlement();
    },
    "dup-close"() {
      state.dup = null;
      render({ focus: "add-name" });
    },
    "dup-continue"() {
      state.dup = null;
      createSettlement();
    },
    // Use the existing settlement instead: tick it (and its boundary path) and go back.
    "dup-existing"() {
      const x = state.dup, s = state.sel;
      state.dup = null;
      for (const l of LEVELS) if (!s[l.key].includes(x[l.key])) s[l.key].push(x[l.key]);
      returnToBoundaries();
    },
    submit() {
      state.open = null;
      store.last = JSON.parse(JSON.stringify(state.sel));
      save();
      state.history = [];
      state.route = "village";
      render();
    },
    continue() { toast("Next step isn’t part of this prototype."); },
    "choose-another"() { go("boundaries"); }
  };

  $phone.addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    // A tap outside the open multi-select closes it (and still does what was tapped).
    if (state.open && !e.target.closest(`[data-ms="${state.open}"]`)) {
      state.open = null;
      if (!btn || btn.dataset.action === "ms-toggle" || btn.dataset.action === "ms-remove") {
        if (btn && !btn.disabled) return ACTIONS[btn.dataset.action](btn);
        return render({ focus: null });
      }
    }
    if (btn && !btn.disabled) ACTIONS[btn.dataset.action]?.(btn);
  });

  // Tick box changed: update that level, drop orphaned ticks below, keep the list open.
  $phone.addEventListener("change", e => {
    const t = e.target, key = t.dataset.level;
    if (!key || t.type !== "checkbox") return;
    const list = state.sel[key];
    state.sel[key] = t.checked ? [...list, t.value] : list.filter(v => v !== t.value);
    pruneBelow(key);
    const scroll = document.querySelector(".ms-list")?.scrollTop || 0;
    render({ focus: t.id });
    const l = document.querySelector(".ms-list"); if (l) l.scrollTop = scroll;
  });

  document.addEventListener("keydown", e => {
    if (state.dup) {
      // Keep focus inside the dialog; Escape closes it and returns to the form.
      if (e.key === "Escape") { state.dup = null; return render({ focus: "add-name" }); }
      if (e.key === "Tab") {
        const btns = [...document.querySelectorAll(".dialog button")], i = btns.indexOf(document.activeElement);
        e.preventDefault();
        btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
      }
      return;
    }
    if (e.key === "Escape" && state.open) {
      const key = state.open; state.open = null;
      render({ focus: `b-${key}` });
    }
  });

  $phone.addEventListener("input", e => {
    const t = e.target, d = state.draft;
    if (t.id === "add-hf") { d.hf = t.value; clearError("add-hf"); }
    if (t.id === "add-name") { d.name = t.value; clearError("add-name"); }
    if (t.id === "add-type") { d.type = t.value; clearError("add-type"); }
    if (t.id === "add-security") { d.security = t.value; clearError("add-security"); }
    if (t.name === "add-access") { d.access = t.value; clearError("add-access"); }
  });

  render({ focus: null });
})();
