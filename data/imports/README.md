# Drop zone for captured meta data

**This folder is gitignored.** Nothing here is committed or published — third-party
aggregated stats (Untapped, etc.) are that site's product, so keep them local and
use them for your own analysis only.

Drop any captured file here and run:

```
node src/inspect-import.js data/imports/<file>
```

It reports the structure (record arrays, field names, sample rows) without
dumping the whole file, so a parser can be written to fit it.

## Capture methods, most efficient first

### 1. Network response (best — raw structured data)

The site fetches its numbers as JSON. Grabbing that response gives every field
exactly as the site has it, with no parsing guesswork.

1. Open the meta page, press **F12** → **Network** tab
2. Filter to **Fetch/XHR**
3. Reload the page (F5)
4. Click the request that returns the meta data — usually the largest response,
   or one with `meta`, `deck`, `archetype`, or `graphql` in the name
5. **Response** tab → right-click → **Copy response**
6. Save into this folder as `.json`

### 2. Save the page (simpler, still complete)

`Ctrl+S` → **Webpage, HTML only** → save here. Modern sites embed their initial
data as JSON inside the HTML (`__NEXT_DATA__` or an `application/json` script
tag), and the inspector extracts it automatically.

### 3. Select and copy the table

Select the visible table, copy, paste into a `.txt` here. Works fine for a meta
table of 20-40 rows; loses anything not rendered on screen.

### 4. Official export

If the site offers a CSV/export feature, that is the cleanest route — save the
file here directly.

## Decklists

Decklists don't need any of the above — every MTG client and tracker has a
"copy deck" button producing Arena format:

```
4 Llanowar Elves (DMU) 168
```

Paste into a `.txt` and run:

```
npm run import -- data/imports/deck.txt --name "..." --source untapped \
                  --share 0.083 --winrate 0.56 --sample 1200
```
