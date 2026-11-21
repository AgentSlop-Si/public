(() => {
  "use strict";

  const storageKey = "openkernelchallenge.navigation.v1";
  const appPath = "/hackathons/openkernelchallenge/";
  const recordPath = appPath + "record/";
  const url = (path) => new URL(path, window.location.origin);
  const key = (row) => row.category + ":" + row.id;
  const text = (value) => typeof value === "string" ? value.trim() : "";
  const compare = new Intl.Collator("en", {numeric: true, sensitivity: "base"}).compare;
  const plainClick = (event) => !event.defaultPrevented && event.button === 0 &&
    !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
  function recordURL(record) {
    const target = url(recordPath);
    target.searchParams.set("record", record);
    return target;
  }
  function tableURL(returning = false) {
    const target = url(appPath);
    if (returning) target.searchParams.set("return", "1");
    target.hash = "public-ledger";
    return target;
  }
  function getReferrer() {
    try {
      const referrer = new URL(document.referrer);
      return referrer.origin === window.location.origin ? referrer : null;
    } catch { return null; }
  }
  function pagePath(pathname) { return pathname.replace(/index\.html$/, ""); }
  function stash(from, to, state) {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({from, to, state, timestamp: Date.now()}));
      return true;
    } catch { return false; }
  }
  function consume(to) {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return null;
      sessionStorage.removeItem(storageKey);
      const transfer = JSON.parse(raw);
      const referrer = getReferrer();
      if (!referrer || transfer?.to !== to || !transfer.state ||
          !(Date.now() - transfer.timestamp < 120000)) return null;
      const refPath = pagePath(referrer.pathname);
      if (transfer.from === null) return refPath === appPath && !referrer.searchParams.has("record") ? transfer.state : null;
      return refPath === recordPath && referrer.searchParams.get("record") === transfer.from ? transfer.state : null;
    } catch { return null; }
  }
  function displayTitle(row) {
    let title = row.title.replace(/\[([^\]\r\n]+)\]\([^\r\n)]*\)/g, "$1").replace(/\*\*([^*\r\n]+)\*\*/g, "$1");
    if (row.category === "Notebook archive" && title.includes("_")) {
      title = title.replace(/\.ipynb$/i, "").replace(/_+/g, " ");
    }
    return title;
  }
  function approvedEvidence(value) {
    try {
      const source = new URL(value);
      const allowedPath = /^\/Danonika\/openkernelchallenge\/(?:blob|tree)\/[a-f0-9]{40}(?:\/|$)/i;
      if (source.origin === "https://github.com" && !source.username && !source.password && allowedPath.test(source.pathname)) {
        return source.href;
      }
    } catch {}
    return "";
  }
  async function load() {
    const res = await fetch(url(appPath + "ledger-data.json"), {credentials: "same-origin"});
    if (!res.ok) throw new Error("Unavailable");
    const data = await res.json();
    const input = Array.isArray(data) ? data : data.rows;
    if (!Array.isArray(input) || !input.length) throw new Error("No records");
    const rows = input.map((entry, sourceIndex) => {
      const row = {
        id: text(entry?.id), category: text(entry?.category), title: text(entry?.title),
        status: text(entry?.status), notes: text(entry?.notes), url: approvedEvidence(text(entry?.url)),
        sourceIndex
      };
      if (!row.id || !row.category || !row.title || !row.status) throw new Error("Incomplete records");
      return row;
    });
    return {rows, scope: text(data.scope)};
  }
  window.KernelLedger = {key, text, compare, plainClick, recordURL, tableURL, stash, consume, displayTitle, load};
})();
