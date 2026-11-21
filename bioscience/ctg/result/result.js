(() => {
  const get = id => document.getElementById(id);
  const resultStatus = get("result-status");
  const requested = new URLSearchParams(window.location.search).get("row");
  const rowNumber = requested && /^\d{1,4}$/.test(requested) ? Number(requested) : null;

  function text(id, value) {
    get(id).textContent = value;
  }

  function node(tag, value) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = value;
    return element;
  }

  function statistic(container, label, value, detail) {
    const item = node("div");
    const reading = node("dd", String(value));
    if (detail) reading.append(node("small", detail));
    item.append(node("dt", label), reading);
    container.append(item);
  }

  function percent(numerator, denominator) {
    return denominator === 0 ? "—" : (100 * numerator / denominator).toFixed(2) + "%";
  }

  const metric = value => Number.isFinite(value) ? value.toFixed(4) : "—";

  async function json(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error("Could not load result evidence");
    return response.json();
  }

  function unavailable(message) {
    const browse = node("a", "Browse CTG results");
    browse.href = "../#experiments";
    resultStatus.replaceChildren(document.createTextNode(message + " "), browse);
  }

  function registeredTraining(name) {
    if (/analytic corrected|derived readout|reused output/i.test(name)) {
      return "The registry identifies this as a derived result. It reports the recorded readout, with the underlying fit recipe unavailable for this row.";
    }
    if (/frozen/i.test(name)) {
      return "The registry describes a frozen component. The aggregate row supplies its recorded cutoff and statistics. Details of any fitted readout are unavailable for this row.";
    }
    if (/nested.sigmoid/i.test(name)) {
      return "The registry records nested sigmoid calibration. The underlying fit schedule and settings are unavailable for this row.";
    }
    return "The registry supplies the model label and aggregate results. The fit schedule and hyperparameters are unavailable for this row.";
  }

  function cutoffDescription(label) {
    const target = /^TRAIN(10|15|20)\b/.exec(label);
    return target
      ? label + ". The target applies to training-side false positives. Evaluation FPR is shown below."
      : label;
  }

  function render(archive, methodNotes) {
    const entry = archive.entries.find(item => item.rows.some(row => row.row === rowNumber));
    const row = entry?.rows.find(item => item.row === rowNumber)
      || archive.other.find(item => item.row === rowNumber);
    if (!row) {
      unavailable("That result number is unavailable.");
      return;
    }
    const note = methodNotes.rows?.[row.row] || {};
    const name = note.model || row.name || entry?.name || "Supplementary result";
    const recordedInput = row.input || "Input label unavailable";
    const cutoff = row.policy || "Cutoff label unavailable";
    const positives = row.tp + row.fn;
    const negatives = row.fp + row.tn;
    const alerts = row.tp + row.fp;
    text("result-identity", (entry ? "Registry #" + entry.id : "Supplementary") + " · Result #" + row.row);
    text("result-title", name);
    document.title = name + " · Result #" + row.row + " · CTG Outcome Atlas";
    text("result-subtitle", recordedInput + " · " + cutoff + " · " + row.n + " recordings");
    text("result-input", note.input || recordedInput + ".");
    text("result-model", note.model || row.name || entry?.name || "Supplementary result with an unavailable registry label.");
    text("result-training", note.training || registeredTraining(name));
    text("result-cutoff", note.cutoff || cutoffDescription(cutoff));
    if (note.context) {
      text("result-method-note", note.context);
      get("result-method-note").hidden = false;
    }

    const primary = get("result-primary");
    statistic(primary, "Sensitivity", percent(row.tp, positives), row.tp + " of " + positives + " low-pH recordings");
    statistic(primary, "False-positive rate", percent(row.fp, negatives), row.fp + " of " + negatives + " recordings without low pH");
    statistic(primary, "Precision", percent(row.tp, alerts), alerts ? row.tp + " of " + alerts + " alerts" : "Zero alerts");
    statistic(primary, "AUROC", metric(row.auroc), "Ranking metric");

    const confusion = get("result-confusion");
    statistic(confusion, "Detected", row.tp, "True positives");
    statistic(confusion, "Missed", row.fn, "False negatives");
    statistic(confusion, "False alerts", row.fp, "False positives");
    statistic(confusion, "Correctly unflagged", row.tn, "True negatives");

    const metrics = get("result-metrics");
    statistic(metrics, "Average precision", metric(row.ap));
    statistic(metrics, "Brier score", metric(row.brier));
    statistic(metrics, "Log loss", metric(row.logLoss));
    text("result-scope", row.n + " recordings · " + positives + " low-pH events · " + negatives +
      " non-events. " + (row.n === 441 ? "Full development cohort." : "Smaller reported cohort."));

    if (entry) {
      const siblings = entry.rows.filter(sibling => sibling.row !== row.row);
      for (const sibling of siblings.slice(0, 6)) {
        const item = node("li");
        const link = node("a", "#" + sibling.row + " · " + (sibling.input || "Recorded input") +
          " · " + (sibling.policy || "Recorded cutoff"));
        link.href = "?row=" + encodeURIComponent(String(sibling.row));
        item.append(link);
        get("result-related").append(item);
      }
      get("result-registry-link").href = "../#exp-" + entry.id;
      get("result-related-panel").hidden = siblings.length === 0;
    }
    resultStatus.hidden = true;
    get("result-page").hidden = false;
  }

  if (!rowNumber) {
    unavailable("Choose a result from the archive.");
    return;
  }

  Promise.all([
    json("../atlas-aggregate-results-20261119.json"),
    json("../atlas-methods-20261121.json").catch(() => ({})),
  ]).then(([archive, methodNotes]) => render(archive, methodNotes))
    .catch(() => unavailable("The evidence could not be loaded. Try opening the result again from the workbench."));
})();
