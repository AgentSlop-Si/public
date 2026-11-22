# CTG localization checks

From the repository root, with Node 18 or newer:

```sh
npm install --prefix /tmp/ctg-dom-check --no-audit --no-fund --ignore-scripts jsdom@26
NODE_PATH=/tmp/ctg-dom-check/node_modules node scripts/test-ctg.cjs
```

The checks load the real report and result documents with local resources. They verify the Russian default, stored and URL-selected languages, repeated RU/KK/EN changes, all 1,221 archive rows, search, sorting, page size, menu keyboard dismissal, operating-point counts, signal-window controls, result variants and invalid IDs.

These are DOM behavior checks, not browser rendering or screenshot tests. The underlying aggregate JSON and method evidence files are unchanged. Registered model names and CSV source labels remain in their original form.

The three copy dictionaries contain authored English, Russian and Kazakh strings. `ctg-static-copy.js` covers the existing report, `ctg-extra-copy.js` covers dynamic output and method notes, and `ctg-copy.js` supplies shared controls. The small localization adapter preserves existing elements, events, and scientific data; new dynamic phrases should be added to the dictionaries before publication.
