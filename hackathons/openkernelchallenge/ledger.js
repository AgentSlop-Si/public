(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const scope = byId("ledger-scope");
  const controls = byId("ledger-controls");
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
  const prev = byId("ledger-prev");
  const next = byId("ledger-next");
  const indicator = byId("ledger-page");
  const exportFiltered = byId("ledger-export-filtered");
  const detail = byId("ledger-detail");
  const mobileSort = byId("ledger-mobile-sort");
  const detailTitle = byId("ledger-detail-title");
  const listStateKey = "openkernelledger";
  const requestURL = new URL(window.location.href);
  const requestedRecord = requestURL.searchParams.get("record");
  const headers = Array.from(table.querySelectorAll("button[data-order]"));
  const collator = new Intl.Collator("en", {numeric: true, sensitivity: "base"});
  const stringify = (v) => (typeof v === "string" ? v.trim() : "");
  const normalize = (v) => v.toLocaleLowerCase("en").normalize("NFKD").replace(/\p{M}/gu, "");
  const compare = (a, b) => collator.compare(a, b);
  const state = {page: 1, key: "id", direction: 1};
  let rows = [];
  let matching = [];

  function approvedEvidence(value) {
    try {
      const url = new URL(value);
      const allowedPath = /^\/Danonika\/openkernelchallenge\/(?:blob|tree)\/[a-f0-9]{40}(?:\/|$)/i;
      if (url.origin === "https://github.com" && !url.username && !url.password && allowedPath.test(url.pathname)) {
        return url.href;
      }
    } catch {}
    return "";
  }

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

  function recordURL(row) {
    const url = new URL("./", window.location.href);
    url.searchParams.set("record", row.category + ":" + row.id);
    url.hash = "public-ledger";
    return url.href;
  }

  function rowNode(row) {
    const tr = node("tr", "", "ledger-record");
    tr.setAttribute("role", "row");
    const recordId = node("th", row.id, "ledger-id");
    recordId.scope = "row";
    recordId.setAttribute("role", "rowheader");
    const title = node("td", "", "ledger-title-cell");
    const open = node("a", row.title, "ledger-record-link");
    open.href = recordURL(row);
    open.dataset.record = row.category + ":" + row.id;
    const hint = node("span", "Open record", "ledger-open-hint");
    hint.setAttribute("aria-hidden", "true");
    open.append(hint);
    title.append(open);
    const status = node("td", "", "ledger-row-status");
    status.append(node("span", row.status, "ledger-status-tag"));
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
    for (const cell of [title, status, evidence, category]) cell.setAttribute("role", "cell");
    open.addEventListener("click", (event) => {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) saveListState(open.dataset.record);
    });
    tr.addEventListener("click", (event) => {
      if (event.target.closest("a, button, input, select, label") ||
          event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
          event.button !== 0 || window.getSelection()?.toString()) return;
      saveListState(open.dataset.record);
      window.location.assign(open.href);
    });
    tr.append(recordId, category, title, status, evidence);
    return tr;
  }

  function saveListState(focusRecord = "") {
    try {
      history.replaceState({...history.state, [listStateKey]: {
        search: fields.search.value, category: fields.category.value, status: fields.status.value,
        size: fields.size.value, page: state.page, key: state.key, direction: state.direction, focusRecord,
      }}, "");
    } catch {}
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

  function showDetail(row) {
    const back = byId("ledger-return");
    const listURL = new URL("./#public-ledger", window.location.href);
    back.href = listURL.href;
    try {
      const ref = new URL(document.referrer);
      if (ref.origin === listURL.origin && ref.pathname === listURL.pathname &&
          !ref.searchParams.has("record") && history.length > 1) {
        back.textContent = "Back to research table";
        back.addEventListener("click", (event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          history.back();
        });
      }
    } catch {}
    byId("ledger-detail-type").textContent = row ? "Research record" : "Record unavailable";
    detailTitle.textContent = row ? row.title : "This record was not found";
    if (row) {
      byId("ledger-detail-id").textContent = row.id;
      byId("ledger-detail-category").textContent = row.category;
      byId("ledger-detail-status").textContent = row.status;
      byId("ledger-detail-notes").textContent = row.notes || "No public notes for this record.";
      const link = byId("ledger-detail-source");
      if (row.url) { link.href = row.url; link.hidden = false; }
      document.title = row.title + " · OpenKernelChallenge";
    } else {
      detail.querySelector("dl").hidden = true;
      byId("ledger-detail-notes").textContent = "Return to the table to find a current public record.";
    }
    readout.textContent = "";
    readout.hidden = true;
    detail.hidden = false;
    detailTitle.focus({preventScroll: true});
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
    mobileSort.value = state.key + ":" + state.direction;
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
    readout.textContent = "Loading the public research ledger…";
    try {
      const res = await fetch("ledger-data.json", {credentials: "same-origin"});
      if (!res.ok) throw new Error("Unavailable");
      const data = await res.json();
      const input = Array.isArray(data) ? data : data.rows;
      if (!Array.isArray(input) || !input.length) throw new Error("No records");
      rows = input.map((entry, sourceIndex) => {
        if (!entry || typeof entry !== "object") return null;
        const row = {
          id: stringify(entry.id),
          category: stringify(entry.category),
          title: stringify(entry.title),
          status: stringify(entry.status),
          notes: stringify(entry.notes),
          url: approvedEvidence(stringify(entry.url)),
          sourceIndex
        };
        if (!row.id || !row.category || !row.title || !row.status) return null;
        row.search = normalize([row.id, row.category, row.title, row.status, row.notes].join(" "));
        return row;
      });
      if (!rows.length || rows.some((row) => !row)) throw new Error("Incomplete records");
      scope.textContent = stringify(data.scope);
      if (requestedRecord !== null) {
        const record = requestedRecord.length <= 240 ?
          rows.find((row) => row.category + ":" + row.id === requestedRecord) : null;
        showDetail(record);
        return;
      }
      optionSet(fields.category, rows.map((r) => r.category), "All categories");
      const restoreFocus = restoreListState();
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
      readout.textContent = "The table couldn’t load. Reload this page or open the CSV or JSON download above.";
    }
  }

  init();
})();
