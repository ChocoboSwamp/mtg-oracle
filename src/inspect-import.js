#!/usr/bin/env node
/**
 * Inspect a dropped data file and report its structure, so a parser can be
 * written to fit it. Handles JSON, HTML (incl. Next.js __NEXT_DATA__ and other
 * embedded JSON blobs), CSV, and plain text.
 *
 *   node src/inspect-import.js data/imports/whatever.json
 *   node src/inspect-import.js data/imports/page.html
 *
 * Prints a shape summary, not the whole file, so large captures stay readable.
 */
import { readFileSync, existsSync } from "node:fs";

const path = process.argv[2];
if (!path || !existsSync(path)) {
  console.error("Usage: node src/inspect-import.js <file>");
  process.exit(1);
}

const raw = readFileSync(path, "utf8");
const kb = (raw.length / 1024).toFixed(0);
console.log(`\n${path}  —  ${kb} KB\n${"=".repeat(64)}`);

/** Describe a value's shape compactly, recursing a few levels. */
function shape(v, depth = 0, seenKeys = 0) {
  const pad = "  ".repeat(depth + 1);
  if (v === null) return "null";
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    const inner = shape(v[0], depth + 1);
    return `array(${v.length}) of ${inner}`;
  }
  if (typeof v === "object") {
    const keys = Object.keys(v);
    if (depth >= 3) return `{${keys.length} keys: ${keys.slice(0, 8).join(", ")}}`;
    const lines = keys.slice(0, 25).map((k) => {
      const val = v[k];
      const t =
        val === null
          ? "null"
          : Array.isArray(val)
            ? shape(val, depth + 1)
            : typeof val === "object"
              ? shape(val, depth + 1)
              : `${typeof val} = ${JSON.stringify(val).slice(0, 60)}`;
      return `${pad}${k}: ${t}`;
    });
    const more = keys.length > 25 ? `\n${pad}… ${keys.length - 25} more keys` : "";
    return `{\n${lines.join("\n")}${more}\n${"  ".repeat(depth)}}`;
  }
  return `${typeof v} = ${JSON.stringify(v).slice(0, 60)}`;
}

/** Find arrays of objects anywhere in a JSON tree — these are usually the data. */
function findTables(obj, path = "$", out = [], depth = 0) {
  if (depth > 8 || obj === null || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    if (obj.length >= 3 && typeof obj[0] === "object" && obj[0] !== null && !Array.isArray(obj[0])) {
      out.push({ path, n: obj.length, keys: Object.keys(obj[0]) });
    }
    obj.slice(0, 3).forEach((v, i) => findTables(v, `${path}[${i}]`, out, depth + 1));
    return out;
  }
  for (const [k, v] of Object.entries(obj)) findTables(v, `${path}.${k}`, out, depth + 1);
  return out;
}

function reportJson(data, label) {
  console.log(`\n--- ${label}: top-level shape ---`);
  console.log(shape(data));

  const tables = findTables(data);
  if (tables.length) {
    console.log(`\n--- ${label}: record arrays found (likely the data) ---`);
    const seen = new Set();
    for (const t of tables.sort((a, b) => b.n - a.n).slice(0, 12)) {
      const sig = t.keys.join(",");
      if (seen.has(sig)) continue;
      seen.add(sig);
      console.log(`\n  ${t.path}   ${t.n} records`);
      console.log(`    fields: ${t.keys.join(", ")}`);
    }
  }
}

const trimmed = raw.trim();

// 1. Straight JSON
if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
  try {
    reportJson(JSON.parse(trimmed), "JSON");
    console.log("");
    process.exit(0);
  } catch (e) {
    console.log(`Looks like JSON but failed to parse: ${e.message}\n`);
  }
}

// 2. HTML with embedded JSON
if (/<html|<!doctype/i.test(trimmed.slice(0, 500))) {
  console.log("Detected HTML.");
  const blobs = [];
  const next = raw.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (next) blobs.push(["__NEXT_DATA__", next[1]]);
  for (const m of raw.matchAll(
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    blobs.push(["application/json script", m[1]]);
  }
  if (!blobs.length) {
    console.log("No embedded JSON found. Falling back to visible-text scan.\n");
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    console.log(`--- first 60 non-empty text lines ---`);
    text.slice(0, 60).forEach((l) => console.log("  " + l.slice(0, 100)));
  } else {
    for (const [label, blob] of blobs.slice(0, 3)) {
      try {
        reportJson(JSON.parse(blob), label);
      } catch {
        console.log(`\n${label}: present but unparseable (${(blob.length / 1024).toFixed(0)} KB)`);
      }
    }
  }
  console.log("");
  process.exit(0);
}

// 3. CSV / TSV
const lines = trimmed.split(/\r?\n/).filter(Boolean);
const delim = (trimmed.match(/\t/g) ?? []).length > (trimmed.match(/,/g) ?? []).length ? "\t" : ",";
if (lines.length > 1 && lines[0].split(delim).length > 1) {
  console.log(`Detected delimited text (${delim === "\t" ? "TSV" : "CSV"}), ${lines.length} rows.`);
  console.log(`\n--- header ---\n  ${lines[0].split(delim).join(" | ")}`);
  console.log(`\n--- first 5 rows ---`);
  lines.slice(1, 6).forEach((l) => console.log("  " + l.split(delim).join(" | ")));
  console.log("");
  process.exit(0);
}

// 4. Plain text
console.log(`Plain text, ${lines.length} lines.\n\n--- first 40 lines ---`);
lines.slice(0, 40).forEach((l) => console.log("  " + l.slice(0, 110)));
console.log("");
