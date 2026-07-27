#!/usr/bin/env node
/**
 * LLM card-understanding pipeline.
 *
 *   node src/analyze.js test               # run benchmark cards synchronously, print results
 *   node src/analyze.js run [--limit N]    # submit un-analyzed cards as a Message Batch (50% price)
 *   node src/analyze.js poll               # check pending batches; merge finished results
 *   node src/analyze.js watch              # poll every 60s until all batches finish
 *   node src/analyze.js stats              # coverage summary
 *
 * Results are cached in data/analysis.json keyed by Scryfall oracle_id, so
 * re-running after a new set only analyzes new cards.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, CARDS_FILE } from "./fetch-data.js";
import { SYSTEM_PROMPT, CARD_ANALYSIS_SCHEMA, cardPrompt } from "./ai-schema.js";

const ANALYSIS_FILE = join(DATA_DIR, "analysis.json");
const BATCH_FILE = join(DATA_DIR, "batch-state.json");
const MODEL = "claude-opus-5";

const BENCHMARK_CARDS = [
  "Triple Triad",
  "Ashiok, Wicked Manipulator",
  "High-Society Hunter",
];

const client = new Anthropic();

function loadJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

function loadRawCards() {
  if (!existsSync(CARDS_FILE)) {
    console.error('No card data. Run "node src/cli.js fetch" first.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(CARDS_FILE, "utf8"));
}

/** Request params shared by the test path and the batch path. */
function requestParams(raw) {
  return {
    model: MODEL,
    max_tokens: 5000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: CARD_ANALYSIS_SCHEMA },
    },
    messages: [{ role: "user", content: cardPrompt(raw) }],
  };
}

function parseAnalysis(message, name) {
  if (message.stop_reason === "refusal") {
    console.warn(`  refusal on ${name} — skipped`);
    return null;
  }
  const text = message.content.find((b) => b.type === "text")?.text;
  if (!text) {
    console.warn(`  no text block for ${name} (stop: ${message.stop_reason}) — skipped`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`  unparseable JSON for ${name} — skipped`);
    return null;
  }
}

async function cmdTest() {
  const raws = loadRawCards();
  for (const name of BENCHMARK_CARDS) {
    const raw = raws.find((c) => c.name.toLowerCase().startsWith(name.toLowerCase()));
    if (!raw) {
      console.warn(`benchmark card not in pool: ${name}`);
      continue;
    }
    console.log(`\n=== ${raw.name} ===`);
    const message = await client.messages.create(requestParams(raw));
    const analysis = parseAnalysis(message, raw.name);
    console.log(JSON.stringify(analysis, null, 2));
    console.log(
      `(in: ${message.usage.input_tokens} + cached ${message.usage.cache_read_input_tokens ?? 0}, out: ${message.usage.output_tokens})`
    );
  }
}

async function cmdRun(args) {
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity;

  const raws = loadRawCards();
  const analysis = loadJson(ANALYSIS_FILE, {});
  const pending = raws.filter((c) => c.oracle_id && !analysis[c.oracle_id]).slice(0, limit);

  if (!pending.length) {
    console.log("Nothing to analyze — all cards are covered.");
    return;
  }
  console.log(`Submitting ${pending.length} cards as a Message Batch (${MODEL}, effort low)...`);

  const batch = await client.messages.batches.create({
    requests: pending.map((raw) => ({
      custom_id: raw.oracle_id,
      params: requestParams(raw),
    })),
  });

  const state = loadJson(BATCH_FILE, []);
  state.push({
    batch_id: batch.id,
    submitted_at: new Date().toISOString(),
    count: pending.length,
    done: false,
  });
  writeFileSync(BATCH_FILE, JSON.stringify(state, null, 2));
  console.log(`Batch ${batch.id} submitted (${pending.length} cards).`);
  console.log('Run "node src/analyze.js watch" to wait for results.');
}

async function collectBatch(entry, analysis, nameByOracleId) {
  let ok = 0;
  let failed = 0;
  for await (const result of await client.messages.batches.results(entry.batch_id)) {
    const oracleId = result.custom_id;
    const name = nameByOracleId[oracleId] ?? oracleId;
    if (result.result.type !== "succeeded") {
      failed++;
      continue;
    }
    const parsed = parseAnalysis(result.result.message, name);
    if (!parsed) {
      failed++;
      continue;
    }
    analysis[oracleId] = { name, model: MODEL, ...parsed };
    ok++;
  }
  return { ok, failed };
}

async function cmdPoll({ quiet = false } = {}) {
  const state = loadJson(BATCH_FILE, []);
  const open = state.filter((e) => !e.done);
  if (!open.length) {
    if (!quiet) console.log("No pending batches.");
    return true;
  }

  const raws = loadRawCards();
  const nameByOracleId = Object.fromEntries(raws.map((c) => [c.oracle_id, c.name]));
  const analysis = loadJson(ANALYSIS_FILE, {});
  let allDone = true;

  for (const entry of open) {
    const batch = await client.messages.batches.retrieve(entry.batch_id);
    if (batch.processing_status !== "ended") {
      allDone = false;
      console.log(
        `${entry.batch_id}: ${batch.processing_status} — ` +
          `${batch.request_counts.succeeded} ok / ${batch.request_counts.processing} processing / ${batch.request_counts.errored} errored`
      );
      continue;
    }
    const { ok, failed } = await collectBatch(entry, analysis, nameByOracleId);
    entry.done = true;
    console.log(`${entry.batch_id}: finished — merged ${ok} analyses (${failed} failed).`);
  }

  writeFileSync(ANALYSIS_FILE, JSON.stringify(analysis));
  writeFileSync(BATCH_FILE, JSON.stringify(state, null, 2));
  return allDone;
}

async function cmdWatch() {
  for (;;) {
    const done = await cmdPoll({ quiet: true });
    if (done) {
      console.log("All batches complete.");
      return;
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

function cmdStats() {
  const raws = loadRawCards();
  const analysis = loadJson(ANALYSIS_FILE, {});
  const covered = raws.filter((c) => analysis[c.oracle_id]).length;
  console.log(`${covered} / ${raws.length} Standard cards analyzed.`);
  const powers = [0, 0, 0, 0, 0, 0];
  for (const a of Object.values(analysis)) powers[a.power ?? 0]++;
  console.log(`power spread: 1:${powers[1]} 2:${powers[2]} 3:${powers[3]} 4:${powers[4]} 5:${powers[5]}`);
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "test") await cmdTest();
  else if (command === "run") await cmdRun(rest);
  else if (command === "poll") await cmdPoll();
  else if (command === "watch") await cmdWatch();
  else if (command === "stats") cmdStats();
  else {
    console.log("Usage: node src/analyze.js <test|run [--limit N]|poll|watch|stats>");
  }
} catch (err) {
  if (
    err instanceof Anthropic.AuthenticationError ||
    /Could not resolve authentication method/.test(err.message ?? "")
  ) {
    console.error(
      "\nAuthentication failed. Set your API key first:\n" +
        '  setx ANTHROPIC_API_KEY "sk-ant-..."   (then open a new terminal)\n' +
        "Get a key at https://platform.claude.com/"
    );
    process.exit(1);
  }
  throw err;
}
