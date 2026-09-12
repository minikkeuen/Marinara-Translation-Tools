import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const files = manifest.config.jsPath;
assert(Array.isArray(files));
assert.equal(files.at(-1), "extension.js");
assert.equal(files.filter((file) => file.startsWith("prompts/")).length, 6);
const source = files.map((file) => {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  new vm.Script(text, { filename: file });
  return text;
}).join("\n\n");
new vm.Script(source);
const entry = fs.readFileSync(path.join(root, "extension.js"), "utf8");
assert(!entry.includes("You are an expert literary and roleplay translator."));

function load(text) {
  const requests = [];
  const messages = [
    { role: "user", content: "earlier input" },
    { role: "assistant", content: "earlier output", extra: { translation: "이전 출력" } },
    { role: "assistant", content: "source text" },
  ];
  const box = {
    marinara: {
      extension: { id: "test" }, storage: {}, onCleanup() {},
      log: { warn() {} },
    },
    window: {
      location: { href: "http://localhost/" },
      async fetch(input, init) {
        if (init?.method === "GET") return { ok: true, async json() { return messages; } };
        const raw = typeof init?.body === "string" ? init.body : await input.clone().text();
        requests.push(JSON.parse(raw));
        return { ok: true };
      },
    },
    localStorage: { getItem() { return "chat-test"; } },
    URL, Request, Headers,
  };
  const marker = '  const style = document.createElement("style");';
  assert(text.includes(marker));
  const expose = `globalThis.api = {
    BUILTIN_PRESETS, V2_PRESETS, ADDITIONAL_BUILTIN_PRESETS,
    normalizePresets, normalizeStoredConfig, upgradePresetConfig,
    glossarySection, freeContextSection, composeIncomingPrompt,
    buildSystemPrompt, buildContextualText, routedFetch,
    set(value) { storedConfig = normalizeStoredConfig(value); },
    scope() { return currentScope(); },
  }; return;\n`;
  vm.runInNewContext(text.replace(marker, expose + marker), box);
  return { ...box.api, requests };
}

const current = load(source);
const fingerprints = JSON.parse(fs.readFileSync(path.join(root, "tests/prompt-fingerprints.json"), "utf8"));
for (const [name, expected] of Object.entries(fingerprints)) {
  const actual = createHash("sha256").update(JSON.stringify(current[name])).digest("hex");
  assert.equal(actual, expected, `${name}: prompt text or preset metadata changed`);
}
const json = (value) => JSON.parse(JSON.stringify(value));
const states = [
  {},
  { presetV2Updated: true, keepLegacyPresets: true },
  { presetV2Updated: true, keepLegacyPresets: false },
];
const custom = [{ id: "custom-test", name: "사용자 정의", prompt: "custom prompt" }];
for (const state of states) {
  const result = current.normalizePresets(custom, state);
  assert.equal(new Set(result.map((preset) => preset.id)).size, result.length);
  assert.equal(result.at(-1).prompt, "custom prompt");
}

// Optional pre-refactor source comparison, using a read-only baseline copy.
if (process.argv[2]) {
  const oldSource = fs.readFileSync(process.argv[2], "utf8");
  const previous = load(oldSource);
  const ui = (text) => text.match(/form\.innerHTML = `([\s\S]*?)`;\n/)[1];
  assert.equal(ui(entry), ui(oldSource), "UI markup changed");
  assert.equal(entry.slice(entry.indexOf("  const style =")), oldSource.slice(oldSource.indexOf("  const style =")), "UI styles or startup changed");
  for (const state of states) {
    assert.deepEqual(json(current.normalizePresets(custom, state)), json(previous.normalizePresets(custom, state)));
    const config = { ...state, presets: custom, defaults: { outgoingPresetId: "custom-test" } };
    assert.deepEqual(json(current.normalizeStoredConfig(config)), json(previous.normalizeStoredConfig(config)));
    for (const keep of [false, true]) {
      assert.deepEqual(json(current.upgradePresetConfig(config, keep)), json(previous.upgradePresetConfig(config, keep)));
    }
  }
  for (const raw of ["", "A = B", "A = B\nC = D", "invalid", "A = B\nA = B"]) {
    for (const text of ["A", "B", "A B", "none", "C"]) {
      assert.equal(current.glossarySection(raw, text, "Korean"), previous.glossarySection(raw, text, "Korean"));
    }
  }
  for (const text of ["", "  ", "중세 유럽풍 판타지", "<context>&</context>", "&".repeat(2000)]) {
    assert.equal(current.freeContextSection(text), previous.freeContextSection(text));
  }
  for (const enabled of [false, true]) {
    for (const text of ["", "  지침  ", "first\nsecond"]) {
      assert.equal(current.composeIncomingPrompt("base", enabled, text), previous.composeIncomingPrompt("base", enabled, text));
    }
  }
  for (const freeContextEnabled of [false, true]) {
    for (const contextEnabled of [false, true]) {
      for (const contextIncludeUserInput of [false, true]) {
        for (const targetLanguage of ["Korean", "Chinese", "Japanese", "English"]) {
          const config = {
            presetV2Updated: true, keepLegacyPresets: false,
            defaultConnectionId: "test-connection",
            chats: { "chat-test": {
              glossary: "A = B", freeContextEnabled, freeContext: "중세 판타지",
              contextEnabled, contextIncludeUserInput,
              contextIncludeOriginal: true, contextIncludeTranslation: true,
            } },
          };
          current.set(config); previous.set(config);
          const body = { text: "source text", targetLanguage, systemPrompt: "base", connectionId: "test-connection", provider: "ai" };
          for (const hasContext of [false, true]) {
            assert.equal(current.buildSystemPrompt(body, hasContext), previous.buildSystemPrompt(body, hasContext));
            assert.equal(current.buildSystemPrompt({ ...body, systemPrompt: "x".repeat(6000) }, hasContext), previous.buildSystemPrompt({ ...body, systemPrompt: "x".repeat(6000) }, hasContext));
          }
          const init = { method: "POST", body: JSON.stringify(body) };
          await current.routedFetch("http://localhost/api/translate", init);
          await previous.routedFetch("http://localhost/api/translate", init);
          assert.deepEqual(current.requests.at(-1), previous.requests.at(-1), "Translation request changed");
        }
      }
    }
  }
  console.log("Pre-refactor comparison: UI, catalog variants, configuration, migrations, references, and 32 routed requests are identical.");
}
console.log("Manifest file order, independent/combined syntax, and exact preset fingerprints passed.");
