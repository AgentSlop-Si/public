(() => {
  "use strict";

  const {key, text, compare, plainClick, recordURL, tableURL, stash, consume, displayTitle, load} = window.KernelLedger;
  const record = new URL(window.location.href).searchParams.get("record");
  const byId = (id) => document.getElementById(id);
  const put = (id, content) => { byId(id).textContent = content; };
  const status = byId("record-status");
  const retry = byId("record-retry");
  const message = byId("record-message");
  const stateKey = "openkernelchallenge.record-return.v1";
  const transfer = record ? consume(record) : null;
  const returnState = transfer || history.state?.[stateKey];
  if (transfer) {
    try { history.replaceState({...history.state, [stateKey]: transfer}, ""); } catch {}
  }
  for (const link of document.querySelectorAll(".record-return")) {
    link.addEventListener("click", (event) => {
      if (!returnState || !plainClick(event) || !stash(record, null, returnState)) return;
      event.preventDefault();
      window.location.assign(tableURL(true).href);
    });
  }

  function render(row, rows) {
    const title = displayTitle(row);
    const href = recordURL(key(row)).href;
    document.title = title + " · OpenKernelChallenge";
    const canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.href = href;
    document.head.append(canonical);
    put("record-kicker", "Public research ledger");
    put("record-title", title);
    put("record-id", row.id);
    put("record-category", row.category);
    put("record-state", row.status);
    put("record-notes", row.notes || "This record has no public notes.");
    put("record-source-note", row.url ?
      "Open the repository source captured for this record, pinned to its commit." :
      "This public record does not include a pinned evidence link.");
    if (row.url) {
      const link = byId("record-source");
      link.href = row.url;
      link.hidden = false;
    }
    byId("record-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(href);
        put("record-copy-status", "Link copied.");
      } catch {
        byId("record-share-fallback").hidden = false;
        const input = byId("record-share-url");
        input.value = href;
        input.focus();
        input.select();
        put("record-copy-status", "Select and copy the record URL.");
      }
    });
    const siblings = rows.filter((item) => item.category === row.category).sort((a, b) => compare(a.id, b.id));
    const position = siblings.indexOf(row);
    for (const [label, item] of [["← Previous", siblings[position - 1]], ["Next →", siblings[position + 1]]]) {
      if (!item) continue;
      const anchor = document.createElement("a");
      const neighbor = key(item);
      anchor.href = recordURL(neighbor).href;
      const hint = document.createElement("span");
      hint.textContent = label + " · " + item.id;
      const name = document.createElement("strong");
      name.textContent = displayTitle(item);
      anchor.append(hint, name);
      anchor.addEventListener("click", (event) => {
        if (returnState && plainClick(event)) stash(record, neighbor, returnState);
      });
      byId("record-neighbors").append(anchor);
    }
    byId("record-related-panel").hidden = siblings.length < 2;
    message.hidden = true;
    byId("record-article").hidden = false;
  }

  async function init() {
    retry.hidden = true;
    status.textContent = "Loading the research record…";
    if (record === null || !text(record) || record.length > 240) {
      status.textContent = "No valid record ID was provided. Use the research table to open a record.";
      return;
    }
    try {
      const {rows} = await load();
      const row = rows.find((item) => key(item) === record);
      if (!row) {
        status.textContent = "This record was not found. Use the research table to find a public record.";
        return;
      }
      render(row, rows);
    } catch {
      status.textContent = "The research record couldn’t load. Try again or return to the research table.";
      retry.hidden = false;
    }
  }
  retry.addEventListener("click", init);
  init();
})();
