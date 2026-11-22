(() => {
  const get = id => document.getElementById(id);
  const archive = JSON.parse(get("data").textContent);
  const list = get("list");
  const filters = ["q", "scope", "status", "policy-filter"].map(get);
  const sortState = {column: "row", direction: "asc"};
  const openGroups = new Set();
  const tableScroll = new Map();
  const collator = new Intl.Collator("en", {numeric: true, sensitivity: "base"});
  const aliases = {
    13: "raw46 xgboost fixed16",
    15: "raw46 fhr210 gap-safe xgboost",
    30: "smallctgcnn cnn onnx",
    57: "fhr-only cnn",
    132: "serial4-q serial4 q",
  };
  const byResult = new Map();
  const records = archive.entries.flatMap(entry => entry.rows.map(row => ({
    ...row, entryId: entry.id, model: row.name || entry.name, full: entry.full,
  }))).concat(archive.other.map(row => ({
    ...row, entryId: null, model: row.name || "Supplementary result", full: null,
  })));
  for (const record of records) byResult.set(record.row, record);

  let view = "results";
  let page = 0;
  let pageSize = 16;
  const deskStateKey = "ctg.desk.v1";
  let matching = [];

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function resultURL(row) {
    return "result/?row=" + encodeURIComponent(String(row));
  }

  const metric = value => Number.isFinite(value) ? value.toFixed(4) : "—";
  const rate = (count, total) => total > 0 ? count / total : null;
  const sensitivity = row => rate(row.tp, row.tp + row.fn);
  const falsePositiveRate = row => rate(row.fp, row.fp + row.tn);
  function countRate(count, total) {
    const value = rate(count, total);
    return value === null ? "—" : (value * 100).toFixed(2) + "% · " + count + "/" + total;
  }

  const columns = [
    {key: "row", label: "Result", value: row => row.row},
    {key: "model", label: "Model", value: row => row.model},
    {key: "n", label: "Cohort", value: row => row.n, first: "desc"},
    {key: "input", label: "Input", value: row => row.input},
    {key: "policy", label: "Cutoff", value: row => row.policy},
    {key: "sensitivity", label: "Sensitivity", value: sensitivity, first: "desc"},
    {key: "fpr", label: "FPR", value: falsePositiveRate},
    {key: "auroc", label: "AUROC", value: row => row.auroc, first: "desc"},
    {key: "ap", label: "Average precision", value: row => row.ap, first: "desc"},
    {key: "brier", label: "Brier", value: row => row.brier},
    {key: "logLoss", label: "Log loss", value: row => row.logLoss},
  ];

  function ordered(rows) {
    const {value} = columns.find(column => column.key === sortState.column);
    const direction = sortState.direction === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = value(left), b = value(right);
      if (a == null) return b == null ? left.row - right.row : 1;
      if (b == null) return -1;
      const difference = typeof a === "number" && typeof b === "number"
        ? a - b : collator.compare(String(a), String(b));
      return direction * difference || left.row - right.row;
    });
  }

  function cutoffMatches(cutoff, recorded) {
    switch (cutoff) {
      case "all": return true;
      case "train20": return /^TRAIN20\b/.test(recorded);
      case "train15": return /^TRAIN15\b/.test(recorded);
      case "train10": return /^TRAIN10\b/.test(recorded);
      case "sens90": return /sensitivity target: 90%/i.test(recorded);
      case "insample": return /in-sample/i.test(recorded);
      case "adaptive": return /selection-(adaptive|biased)/i.test(recorded);
      case "reference": return /recorded cutoff/i.test(recorded);
      default: return false;
    }
  }

  function filteredResults() {
    const query = get("q").value.trim().toLowerCase();
    const scope = get("scope").value;
    const coverage = get("status").value;
    const cutoff = get("policy-filter").value;
    const registry = /^(?:#|(?:id|experiment)\s*)?0*(\d{1,3})$/.exec(query);
    const source = /^(?:row|result|строка|результат|жол|нәтиже)\s*#?(\d{1,4})$/.exec(query);
    return records.filter(row => {
      if (scope !== "all" && (scope === "441") !== (row.n === 441)) return false;
      if (coverage === "full" && row.full !== true) return false;
      if (coverage === "partial" && row.full !== false) return false;
      if (coverage === "supplementary" && row.entryId !== null) return false;
      if (!cutoffMatches(cutoff, row.policy || "")) return false;
      if (!query) return true;
      if (source) return row.row === Number(source[1]);
      if (registry) {
        const number = Number(registry[1]);
        return number > 192 && /^\d+$/.test(query) ? row.row === number : row.entryId === number;
      }
      return [row.model, row.input, row.policy, window.CTGI18n?.phrase(row.input), window.CTGI18n?.phrase(row.policy), aliases[row.entryId]]
        .filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }

  function tableFor(rows, name, key) {
    const region = node("div", undefined, "table-scroll result-directory");
    region.tabIndex = 0;
    region.dataset.tableKey = key;
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", name);
    const table = node("table", undefined, "sortable-results");
    const thead = node("thead");
    const header = node("tr");
    for (const column of columns) {
      const th = node("th");
      th.scope = "col";
      const active = sortState.column === column.key;
      if (active) th.setAttribute("aria-sort", sortState.direction === "asc" ? "ascending" : "descending");
      const button = node("button", undefined, "table-sort");
      button.type = "button";
      button.id = "sort-" + key + "-" + column.key;
      button.setAttribute("aria-label", "Sort by " + column.label);
      const arrow = node("span", active ? (sortState.direction === "asc" ? "↑" : "↓") : "↕");
      arrow.setAttribute("aria-hidden", "true");
      button.append(node("span", column.label), arrow);
      button.addEventListener("click", () => {
        const isSame = sortState.column === column.key;
        sortState.direction = isSame ? (sortState.direction === "asc" ? "desc" : "asc") : (column.first || "asc");
        sortState.column = column.key;
        if (view === "results") page = 0;
        render();
        get(button.id)?.focus({preventScroll: true});
      });
      th.append(button);
      header.append(th);
    }
    thead.append(header);
    const body = node("tbody");
    for (const row of rows) {
      const line = node("tr");
      line.dataset.row = row.row;
      const rowHeading = node("th");
      rowHeading.scope = "row";
      const link = node("a", "#" + row.row, "result-link");
      link.href = resultURL(row.row);
      link.setAttribute("aria-label", "View result " + row.row + " for " + row.model);
      rowHeading.append(link);
      const model = node("td");
      const modelName = node("span", row.model); modelName.setAttribute("translate", "no");
      model.append(modelName, node("small", row.entryId === null ? "Supplementary" : "Registry #" + row.entryId));
      line.append(rowHeading, model);
      for (const value of [
        row.n, row.input || "—", row.policy || "—",
        countRate(row.tp, row.tp + row.fn), countRate(row.fp, row.fp + row.tn),
        metric(row.auroc), metric(row.ap), metric(row.brier), metric(row.logLoss),
      ]) line.append(node("td", value));
      line.addEventListener("click", event => {
        if (event.target.closest("a, button, input") || event.metaKey || event.ctrlKey || event.shiftKey || window.getSelection()?.toString()) return;
        window.location.assign(link.href);
      });
      body.append(line);
    }
    table.append(thead, body);
    region.append(table);
    return region;
  }

  function groupedRows(rows) {
    const groups = new Map();
    for (const row of rows) {
      const key = row.entryId ?? "supplementary";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === b) return 0;
      if (a === "supplementary") return 1;
      if (b === "supplementary") return -1;
      return a - b;
    });
  }

  function drawGroups(groups) {
    for (const [key, results] of groups) {
      const group = node("details", undefined, "entry");
      group.id = key === "supplementary" ? "supplementary" : "exp-" + key;
      group.dataset.group = group.id;
      group.open = openGroups.has(group.id) || groups.length === 1 && Boolean(get("q").value.trim());
      const title = key === "supplementary"
        ? "Supplementary results"
        : "#" + key + " · " + archive.entries.find(entry => entry.id === key).name;
      const titleLine = node("summary", title);
      titleLine.append(node("span", results.length + " matching results"));
      const detail = node("div", undefined, "detail");
      detail.append(tableFor(ordered(results), "Sortable results for " + title, group.id));
      group.append(titleLine, detail);
      list.append(group);
    }
  }

  function render() {
    for (const region of list.querySelectorAll("[data-table-key]")) tableScroll.set(region.dataset.tableKey, region.scrollLeft);
    for (const group of list.querySelectorAll("details[data-group]")) {
      if (group.open) openGroups.add(group.dataset.group);
      else openGroups.delete(group.dataset.group);
    }
    matching = ordered(filteredResults());
    const items = view === "results" ? matching : groupedRows(matching);
    const perPage = view === "results" ? pageSize : 8;
    const pages = Math.ceil(items.length / perPage);
    page = Math.max(0, Math.min(page, pages - 1));
    const start = page * perPage;
    const stop = Math.min(start + perPage, items.length);
    list.replaceChildren();
    if (!items.length) {
      list.append(node("p", "No results match these filters.", "archive-empty"));
    } else if (view === "results") {
      list.append(tableFor(items.slice(start, stop), "Sortable archive results", "all-results"));
    } else {
      drawGroups(items.slice(start, stop));
    }
    for (const region of list.querySelectorAll("[data-table-key]")) region.scrollLeft = tableScroll.get(region.dataset.tableKey) || 0;
    const desc = view === "results" ? "results" : "groups";
    get("counts").textContent = items.length
      ? (start + 1) + "–" + stop + " of " + items.length.toLocaleString("en") + " " + desc : "0 matching results";
    get("page-index").textContent = pages ? "Page " + (page + 1) + " of " + pages : "No pages";
    get("prev").disabled = page === 0;
    get("next").disabled = page + 1 >= pages;
    get("export-aggregate").disabled = !matching.length;
    get("archive-view-results").setAttribute("aria-pressed", String(view === "results"));
    get("archive-view-models").setAttribute("aria-pressed", String(view === "models"));
    if (get("ctg-sort")) get("ctg-sort").value = sortState.column + ":" + sortState.direction;
    try { sessionStorage.setItem(deskStateKey, JSON.stringify({filters:filters.map(f=>f.value),page,view,pageSize,sortState})); } catch {}
    window.CTGI18n?.localize(get("experiments"));
  }

  function resetFilters() {
    get("q").value = "";
    for (const select of filters.slice(1)) select.value = "all";
    page = 0;
  }

  function clearOldBookmark() {
    if (/^#(?:exp-|shared-row-|supplementary$)/.test(window.location.hash)) {
      window.history.replaceState(null, "", "#experiments");
    }
  }

  const oldScope = {
    "24-whole-reference": 1134, "24-whole-train": 1135,
    "24-views-reference": 1136, "24-views-train": 1137,
    "42-whole-reference": 1253, "42-whole-train": 1254,
    "42-views-reference": 1255, "42-views-train": 1256,
  };

  function visitBookmark() {
    const hash = window.location.hash;
    const linked = /^#exp-(\d+)-row-(\d+)$/.exec(hash);
    const supplementary = /^#shared-row-(\d+)$/.exec(hash);
    const older = /^#exp-((?:24|42)-(?:whole|views)-(?:train|reference))$/.exec(hash);
    if (linked || supplementary || older) {
      const row = linked ? Number(linked[2]) : supplementary ? Number(supplementary[1]) : oldScope[older[1]];
      const record = byResult.get(row);
      if (record && (!linked || record.entryId === Number(linked[1]))) window.location.replace(resultURL(row));
      return;
    }
    const group = /^#exp-(\d+)$/.exec(hash);
    if (group && archive.entries.some(entry => entry.id === Number(group[1]))) {
      resetFilters();
      get("q").value = "ID " + group[1];
      view = "models";
      openGroups.add("exp-" + group[1]);
      render();
      get("exp-" + group[1])?.scrollIntoView({block: "start"});
    } else if (hash === "#supplementary") {
      resetFilters();
      view = "results";
      get("status").value = "supplementary";
      render();
      get("experiments").scrollIntoView();
    }
  }

  for (const filter of filters) filter.addEventListener("input", () => {
    page = 0;
    clearOldBookmark();
    render();
  });
  get("reset-filters").addEventListener("click", () => {
    resetFilters();
    clearOldBookmark();
    render();
    get("q").focus();
  });
  for (const [id, mode] of [["archive-view-results", "results"], ["archive-view-models", "models"]]) {
    get(id).addEventListener("click", () => {
      view = mode;
      page = 0;
      clearOldBookmark();
      render();
    });
  }
  for (const [id, step] of [["prev", -1], ["next", 1]]) {
    get(id).addEventListener("click", () => {
      page += step;
      render();
      list.scrollIntoView({block: "start"});
    });
  }
  get("export-aggregate").addEventListener("click", () => {
    if (!matching.length) return;
    const header = ["registry_id", "model", "row", "n", "input", "policy", "tp", "fn", "fp", "tn", "auroc", "ap", "brier", "logLoss"];
    const rows = matching.map(row => [
      row.entryId, row.model, row.row, row.n, row.input, row.policy, row.tp,
      row.fn, row.fp, row.tn, row.auroc, row.ap, row.brier, row.logLoss,
    ]);
    function csvCell(value) {
      let string = value == null ? "" : String(value);
      if (typeof value === "string" && /^[=+@\-\t\r]/.test(string)) string = "'" + string;
      return '"' + string.replace(/"/g, '""') + '"';
    }
    const csv = [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const link = node("a");
    link.href = url;
    link.download = "ctg-matching-aggregate-results.csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  window.addEventListener("hashchange", visitBookmark);
  const options = node("div",undefined,"ctg-desk-options");
  const sizeLabel=node("label","Rows per page");
  const sizeSelect=node("select");sizeSelect.id="ctg-page-size";
  for(const size of [16,25,50,100]) {const option=node("option",String(size));option.value=size;sizeSelect.append(option);}
  sizeLabel.append(sizeSelect);
  const orderLabel=node("label","Sort records");const orderSelect=node("select");orderSelect.id="ctg-sort";
  for(const column of columns)for(const direction of ["asc","desc"]){const option=node("option",column.label+" · "+(direction==="asc"?"ascending":"descending"));option.value=column.key+":"+direction;orderSelect.append(option);}
  orderLabel.append(orderSelect);options.append(sizeLabel,orderLabel);
  get("list").before(options);
  sizeSelect.addEventListener("change",()=>{pageSize=Number(sizeSelect.value);page=0;render();});
  orderSelect.addEventListener("change",()=>{[sortState.column,sortState.direction]=orderSelect.value.split(":");page=0;render();});
  try {
    const saved=JSON.parse(sessionStorage.getItem(deskStateKey));
    if(saved&&Array.isArray(saved.filters)&&saved.filters.length===filters.length){
      filters.forEach((filter,index)=>{if(filter.tagName==='INPUT'||Array.from(filter.options).some(o=>o.value===saved.filters[index]))filter.value=saved.filters[index];});
      if([16,25,50,100].includes(saved.pageSize))pageSize=saved.pageSize;
      if(["models","results"].includes(saved.view))view=saved.view;
      if(Number.isInteger(saved.page)&&saved.page>=0)page=saved.page;
      if(columns.some(c=>c.key===saved.sortState?.column)&&["asc","desc"].includes(saved.sortState?.direction))Object.assign(sortState,saved.sortState);
    }
  }catch{}
  sizeSelect.value=pageSize;
  window.addEventListener("ctg:languagechange",()=>render());
  render();
  visitBookmark();
})();
