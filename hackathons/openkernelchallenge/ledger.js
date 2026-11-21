(() => {
  "use strict";

  const {key: recordKey, text: stringify, compare, plainClick, recordURL, tableURL,
    stash, consume, displayTitle, load} = window.KernelLedger;
  const requestURL = new URL(window.location.href);
  const requestedRecord = requestURL.searchParams.get("record");
  if (requestedRecord !== null) {
    window.location.replace(recordURL(requestedRecord).href);
    return;
  }

  const byId = (id) => document.getElementById(id);
  const scope = byId("ledger-scope");
  const controls = byId("ledger-controls");
  const advanced = byId("ledger-filter-disclosure");
  const advancedSummary = byId("ledger-filter-summary");
  const fields = {
    search: byId("ledger-search"),
    category: byId("ledger-category"),
    status: byId("ledger-status"),
    size: byId("ledger-size"),
  };
  const readout = byId("ledger-readout");
  const guide = byId("ledger-guide");
  const table = byId("ledger-table-wrap");
  const tbody = byId("ledger-records");
  const pages = byId("ledger-pages");
  const pagesTop = byId("ledger-pages-top");
  const prevTop = byId("ledger-prev-top");
  const nextTop = byId("ledger-next-top");
  const indicatorTop = byId("ledger-page-top");
  const prev = byId("ledger-prev");
  const next = byId("ledger-next");
  const indicator = byId("ledger-page");
  const exportFiltered = byId("ledger-export-filtered");
  const quick = byId("ledger-quick-categories");
  const mobileSort = byId("ledger-mobile-sort");
  const listStateKey = "openkernelledger";
  const headers = Array.from(table.querySelectorAll("button[data-order]"));
  const normalize = (v) => v.toLocaleLowerCase("en").normalize("NFKD").replace(/\p{M}/gu, "");
  const state = {page: 1, key: "id", direction: 1};
  let rows = [];
  let matching = [];

  function optionSet(select, values, placeholder) {
    const value = select.value;
    const sorted = [...new Set(values)].sort(compare);
    select.replaceChildren(new Option(placeholder, ""), ...sorted.map((name) => new Option(name, name)));
    select.value = sorted.includes(value) ? value : "";
  }

  function node(tag, content, className) {
    const el = document.createElement(tag);
    if (content) el.textContent = content;
    if (className) el.className = className;
    return el;
  }

  function rowNode(row) {
    const tr = node("tr", "", "ledger-record");
    tr.setAttribute("role", "row");
    const recordId = node("th", row.id, "ledger-id");
    recordId.scope = "row";
    recordId.setAttribute("role", "rowheader");
    const title = node("td", "", "ledger-title-cell");
    const open = node("a", displayTitle(row), "ledger-record-link");
    open.href = recordURL(recordKey(row)).href;
    open.dataset.record = recordKey(row);
    const hint = node("span", "Open record", "ledger-open-hint");
    hint.setAttribute("aria-hidden", "true");
    open.append(hint);
    title.append(open);
    const status = node("td", "", "ledger-row-status");
    const badge = node("span", row.status, "ledger-status-tag");
    if (row.category === "Paired benchmark") badge.classList.add("ledger-status-measured");
    status.append(badge);
    const note = row.notes || "No public notes for this record.";
    const brief = note.length > 168 ? note.slice(0, 165).trimEnd() + "…" : note;
    const evidence = node("td", brief, "ledger-evidence");
    if (row.url) {
      const link = node("a", "Source");
      link.href = row.url;
      link.setAttribute("aria-label", "View source for " + row.id + ": " + row.title);
      evidence.append(link);
    }
    const category = node("td", row.category, "ledger-row-category");
    for (const [element,label] of [[recordId,"ID"],[category,"Type"],[status,"Status"]]) {
      const key = node("span",label + ":", "ledger-card-key");
      key.setAttribute("aria-hidden","true");
      element.prepend(key);
    }
    for (const cell of [title, status, evidence, category]) cell.setAttribute("role", "cell");
    open.addEventListener("click", (event) => {
      if (plainClick(event)) prepareRecord(open.dataset.record);
    });
    tr.addEventListener("click", (event) => {
      if (event.target.closest("a, button, input, select, label") ||
          !plainClick(event) || window.getSelection()?.toString()) return;
      prepareRecord(open.dataset.record);
      window.location.assign(open.href);
    });
    tr.append(recordId, category, title, status, evidence);
    return tr;
  }

  function listState(focusRecord = "") {
    return {
      search: fields.search.value, category: fields.category.value, status: fields.status.value,
      size: fields.size.value, page: state.page, key: state.key, direction: state.direction,
      advancedOpen: advanced.open, focusRecord
    };
  }

  function saveListState(focusRecord = "") {
    try { history.replaceState({...history.state, [listStateKey]: listState(focusRecord)}, ""); } catch {}
  }

  function prepareRecord(key) {
    saveListState(key);
    stash(null, key, listState(key));
  }

  function restoreListState() {
    const saved = history.state?.[listStateKey];
    if (!saved) return "";
    fields.search.value = stringify(saved.search);
    fields.category.value = stringify(saved.category);
    optionSet(fields.status, rows.filter((r) => !fields.category.value ||
      r.category === fields.category.value).map((r) => r.status), "All statuses");
    fields.status.value = stringify(saved.status);
    if (["25", "50", "100"].includes(saved.size)) fields.size.value = saved.size;
    if (["id", "category", "title", "status"].includes(saved.key)) state.key = saved.key;
    if (saved.direction === -1) state.direction = -1;
    if (Number.isSafeInteger(saved.page) && saved.page > 0) state.page = saved.page;
    return stringify(saved.focusRecord);
  }

  function buildQuickCategories() {
    const counts = new Map();
    for (const row of rows) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    const entries = [["", rows.length], ...[...counts].sort((a,b)=>compare(a[0],b[0]))];
    quick.replaceChildren(...entries.map(([category,count]) => {
      const button = node("button", category || "All categories");
      button.type = "button";
      button.dataset.category = category;
      const tally = node("span", String(count));
      button.append(tally);
      button.addEventListener("click", () => { fields.category.value = category; firstPage(); });
      return button;
    }));
    quick.hidden = false;
  }

  function filterRows() {
    const words = normalize(fields.search.value.trim()).split(/\s+/).filter(Boolean);
    return rows.filter((r) => (!fields.category.value || r.category === fields.category.value) &&
      words.every((word) => r.search.includes(word)));
  }

  function render() {
    const prefiltered = filterRows();
    optionSet(fields.status, rows.filter((r) => !fields.category.value ||
      r.category === fields.category.value).map((r) => r.status), "All statuses");
    matching = prefiltered.filter((r) => !fields.status.value || r.status === fields.status.value);
    matching.sort((a, b) => compare(a[state.key], b[state.key]) * state.direction ||
      compare(a.id, b.id) || compare(a.category, b.category) || a.sourceIndex - b.sourceIndex);
    const pageSize = Number(fields.size.value);
    const totalPages = Math.max(1, Math.ceil(matching.length / pageSize));
    state.page = Math.max(1, Math.min(totalPages, state.page));
    const from = (state.page - 1) * pageSize;
    const to = Math.min(matching.length, from + pageSize);
    const fragment = document.createDocumentFragment();
    if (matching.length) {
      for (const row of matching.slice(from, to)) fragment.append(rowNode(row));
    } else {
      const tr = node("tr");
      const td = node("td", "No matching records. Try a different search or reset the filters.", "ledger-empty");
      td.colSpan = 5;
      tr.append(td);
      fragment.append(tr);
    }
    tbody.replaceChildren(fragment);
    for (const chip of quick.querySelectorAll("button")) chip.setAttribute("aria-pressed", String(chip.dataset.category === fields.category.value));
    mobileSort.value = state.key + ":" + state.direction;
    const optionsChanged = Number(Boolean(fields.category.value)) + Number(Boolean(fields.status.value)) +
      Number(fields.size.value !== "25") + Number(state.key !== "id" || state.direction !== 1);
    advancedSummary.textContent = optionsChanged ? "Filters and sorting (" + optionsChanged + " active)" : "Filters and sorting";
    for (const button of headers) {
      const current = button.dataset.order === state.key;
      const direction = state.direction === 1 ? "ascending" : "descending";
      const th = button.closest("th");
      if (current) th.setAttribute("aria-sort", direction);
      else th.removeAttribute("aria-sort");
      button.querySelector("span").textContent = current ? (state.direction === 1 ? "▲" : "▼") : "↕";
    }
    readout.textContent = matching.length ?
      "Showing " + (from + 1) + "–" + to + " of " + matching.length + " matching records (" + rows.length + " public records)." :
      "0 matching records (" + rows.length + " public records).";
    indicator.textContent = "Page " + state.page + " of " + totalPages;
    exportFiltered.disabled = !matching.length;
    prev.disabled = state.page === 1;
    next.disabled = state.page === totalPages;
    prevTop.disabled = prev.disabled;
    nextTop.disabled = next.disabled;
    indicatorTop.textContent = indicator.textContent;
    pagesTop.hidden = totalPages < 2;
    pages.hidden = totalPages < 2;
    saveListState();
  }

  function exportMatches() {
    const columns = ["id", "category", "title", "status", "notes", "url"];
    const csvField = (value) => {
      // Neutralize spreadsheet formulas even if a value begins with whitespace.
      const literal = /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value;
      return '"' + literal.replace(/"/g, '""') + '"';
    };
    const csv = [columns.join(","), ...matching.map((row) =>
      columns.map((key) => csvField(row[key])).join(","))].join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const download = node("a");
    download.href = url;
    download.download = "openkernelchallenge-matching-records.csv";
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function firstPage() {
    state.page = 1;
    render();
  }

  async function init() {
    byId("ledger-retry-wrap").hidden = true;
    readout.textContent = "Loading the public research ledger…";
    try {
      const data = await load();
      rows = data.rows.map((row) => ({
        ...row, search: normalize([row.id, row.category, row.title, displayTitle(row), row.status, row.notes].join(" "))
      }));
      scope.textContent = data.scope.replace("aggregate coverage above", "project activity totals below");
      optionSet(fields.category, rows.map((r) => r.category), "All categories");
      const restoreFocus = restoreListState();
      buildQuickCategories();
      const narrow = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 540px)");
      if (narrow) {
        const syncDisclosure = () => { advanced.open = !narrow.matches; };
        const savedOpen = history.state?.[listStateKey]?.advancedOpen;
        if (typeof savedOpen === "boolean") advanced.open = savedOpen;
        else syncDisclosure();
        narrow.addEventListener?.("change", syncDisclosure);
      }
      for (const el of [controls, guide, table, pages]) el.hidden = false;
      for (const field of [fields.category, fields.status, fields.size]) field.addEventListener("change", firstPage);
      fields.search.addEventListener("input", firstPage);
      exportFiltered.addEventListener("click", exportMatches);
      mobileSort.addEventListener("change", () => {
        const [key, direction] = mobileSort.value.split(":");
        if (!["id", "category", "title", "status"].includes(key)) return;
        state.key = key;
        state.direction = direction === "-1" ? -1 : 1;
        firstPage();
      });
      function changePage(delta) {
        state.page += delta;
        render();
        table.scrollTop = 0;
        table.scrollIntoView({block: "start", behavior: "instant"});
        table.focus({preventScroll: true});
      }
      prev.addEventListener("click", () => changePage(-1));
      next.addEventListener("click", () => changePage(1));
      prevTop.addEventListener("click", () => changePage(-1));
      nextTop.addEventListener("click", () => changePage(1));
      byId("ledger-reset").addEventListener("click", () => {
        for (const name of ["search", "category", "status"]) fields[name].value = "";
        fields.size.value = "25";
        state.key = "id";
        state.direction = 1;
        firstPage();
      });
      for (const button of headers) {
        button.addEventListener("click", () => {
          if (state.key === button.dataset.order) state.direction *= -1;
          else { state.key = button.dataset.order; state.direction = 1; }
          firstPage();
        });
      }
      render();
      function focusRecord(key) {
        if (!key) return;
        [...tbody.querySelectorAll(".ledger-record-link")].find((link) => link.dataset.record === key)
          ?.focus({preventScroll: true});
      }
      focusRecord(restoreFocus);
      window.addEventListener("pageshow", (event) => {
        if (event.persisted) focusRecord(history.state?.[listStateKey]?.focusRecord);
      });
    } catch {
      readout.textContent = "The table couldn’t load. Try again or open the CSV or JSON download above.";
      byId("ledger-retry-wrap").hidden = false;
    }
  }

  function setActiveChapter() {
    const chapterNav = document.querySelector(".subnav");
    if (!chapterNav) return;
    const chapterLinks = Array.from(chapterNav.querySelectorAll("a[href^='#']"));
    const cut = chapterNav.getBoundingClientRect().height + 18;
    const key = chapterLinks.reduce((active, link) => {
      const section = byId(link.hash.slice(1));
      return section?.getBoundingClientRect().top <= cut ? link : active;
    }, null);
    for (const link of chapterLinks) {
      if (link === key) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }

  let railFrame = 0;
  function updateRail() {
    if (railFrame) return;
    railFrame = requestAnimationFrame(() => { railFrame = 0; setActiveChapter(); });
  }

  window.addEventListener("scroll", updateRail, {passive: true});
  window.addEventListener("resize", updateRail);
  window.addEventListener("hashchange", updateRail);
  updateRail();
  if (requestURL.searchParams.get("return") === "1") {
    const restored = consume(null);
    try {
      history.replaceState({...history.state, ...(restored ? {[listStateKey]: restored} : {})}, "", tableURL().href);
    } catch {}
  }
  byId("ledger-retry").addEventListener("click", init);
  init();
})();
