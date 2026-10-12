/* Settlement APK – choose boundaries, add a settlement that isn't listed (mobile prototype)
 *
 * Choose your boundaries: LGA → Ward → Health Facility → Settlement
 *   Only the lowest level can be added: "Didn’t find your settlement?" under the Settlement
 *   dropdown opens the Add Settlement form; once saved it comes back selected.
 * Submit → Select Your Settlement. The app always opens on Choose your boundaries.
 */
(function () {
  "use strict";

  // ---------- Mock boundary master data ----------
  const BOUNDARIES = {
    "Dala": {
      "Kantudu": {
        "Kantudu PHC": ["Pachi", "Kantudu Gabas", "Unguwar Liman", "Gidan Maiwada"],
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

  // Options for a level = master data + anything added under the same path.
  function optionsFor(level, sel) {
    const i = LEVELS.findIndex(l => l.key === level);
    const path = LEVELS.slice(0, i).map(l => sel[l.key]);
    if (path.some(v => !v)) return [];
    let node = BOUNDARIES;
    for (const p of path) node = node && !Array.isArray(node) ? node[p] : undefined;
    const base = !node ? [] : Array.isArray(node) ? node : Object.keys(node);
    const added = store.added
      .filter(a => path.every((p, j) => a[LEVELS[j].key] === p))
      .map(a => a[level]);
    return [...new Set([...base, ...added])];
  }

  // ---------- Session state ----------
  const blankSel = () => ({ lga: "", ward: "", hf: "", settlement: "" });
  const state = {
    route: "boundaries",   // the app always opens on Choose your boundaries
    history: [],
    sel: blankSel(),
    draft: null,
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
    caret: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>',
    go: '<svg class="go-icon" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="14" fill="currentColor"/><path d="M8 14h11m-4.5-5 5 5-5 5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    gps: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="m4.8 8.2 2.2 2.2 4.2-4.6" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 4.5v4.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.3" r="1" fill="#fff"/></svg>'
  };

  const errorText = (id, msg) => `<p class="field-error" id="${id}-err" ${msg ? "" : "hidden"}>${ICON.error}<span>${esc(msg || "")}</span></p>`;

  // ---------- Boundary field ----------
  // Plain dropdowns. Only the lowest level (Settlement) gets "Didn’t find your settlement?" + a Create New Settlement button under it.
  function boundaryField(level, i) {
    const { key, label } = level, s = state.sel, id = `b-${key}`;
    const parentReady = !i || !!s[LEVELS[i - 1].key];
    const opts = optionsFor(key, s);
    return `<div class="field">
      <label class="field-label" for="${id}">${esc(label)}${reqMark}</label>
      <div class="select-wrap">
        <select class="input" id="${id}" data-level="${key}" aria-required="true" ${parentReady ? "" : "disabled"}>
          <option value="" ${s[key] ? "" : "selected"}>${parentReady ? "Select" : ""}</option>
          ${opts.map(o => `<option ${o === s[key] ? "selected" : ""}>${esc(o)}</option>`).join("")}
        </select>${ICON.caret}
      </div>
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

  const complete = () => LEVELS.every(l => state.sel[l.key]);

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
      const d = state.draft, nameErr = state.errors["add-name"];
      return {
        tag: state.sel.hf,
        // Questions follow how a worker thinks about a place: what it is → is it safe → how you get there.
        // GPS is captured on its own, so it sits last as a confirmation.
        body: `<h1 class="page-title" id="page-title" tabindex="-1">Add Settlement</h1>
          <p class="page-desc">Add details about the settlement you are creating.</p>
          <div class="card">
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
        footer: `<button class="btn btn-primary" data-action="save">Save</button>`
      };
    },

    village() {
      const s = state.sel;
      return {
        body: `<h1 class="page-title" id="page-title" tabindex="-1">Select Your Settlement</h1>
          <button class="village-card" data-action="continue" aria-label="Continue with ${esc(s.settlement)}">
            <span class="village-name">${esc(s.settlement)}</span>${ICON.go}
          </button>
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
      <div class="toast" id="toast" role="status" hidden></div>`;
    document.title = document.getElementById("page-title").textContent;
    const el = focus && document.getElementById(focus);
    if (el) {
      el.focus({ preventScroll: focus === "page-title" });
      if (el.tagName === "INPUT") el.setSelectionRange(el.value.length, el.value.length);
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

  // Clears every level below the given one.
  function resetBelow(key) {
    const i = LEVELS.findIndex(l => l.key === key);
    LEVELS.slice(i + 1).forEach(l => { state.sel[l.key] = ""; });
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

  // ---------- Actions ----------
  const ACTIONS = {
    back,
    "add-settlement"() {
      state.draft = { type: "", security: "", name: "", access: "" };
      go("add");
      captureGps();
    },
    save() {
      const d = state.draft;
      const ok = showErrors({
        "add-name": d.name.trim() ? "" : "Enter the settlement name",
        "add-type": d.type ? "" : "Select the type",
        "add-security": d.security ? "" : "Select how safe it is to visit",
        "add-access": d.access ? "" : "Select how you reach the settlement"
      });
      if (!ok) return;
      if (!state.gps) return toast("Waiting for GPS — try again in a moment.");
      const s = state.sel, name = d.name.trim();
      store.added.push({ lga: s.lga, ward: s.ward, hf: s.hf, settlement: name,
        type: d.type, security: d.security, access: d.access, gps: state.gps });
      save();
      // New settlement comes back already selected.
      s.settlement = name;
      state.route = state.history.pop() || "boundaries";
      state.errors = {};
      render({ focus: "b-settlement" });
      toast("New settlement added successfully", { success: true });
    },
    submit() {
      store.last = { ...state.sel };
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
    if (btn && !btn.disabled) ACTIONS[btn.dataset.action]?.(btn);
  });

  // Dropdown picked: clear the levels below it.
  $phone.addEventListener("change", e => {
    const t = e.target, key = t.dataset.level;
    if (!key || t.tagName !== "SELECT") return;
    state.sel[key] = t.value;
    resetBelow(key);
    render({ focus: `b-${key}` });
  });

  $phone.addEventListener("input", e => {
    const t = e.target, d = state.draft;
    if (t.id === "add-name") { d.name = t.value; clearError("add-name"); }
    if (t.id === "add-type") { d.type = t.value; clearError("add-type"); }
    if (t.id === "add-security") { d.security = t.value; clearError("add-security"); }
    if (t.name === "add-access") { d.access = t.value; clearError("add-access"); }
  });

  render({ focus: null });
})();
