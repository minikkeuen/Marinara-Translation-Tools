import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const source = manifest.config.jsPath.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n\n");
const requests = [];
const reads = [];
const warnings = [];
let failHistory = false;
const messages = [
  { role: "system", content: "system must be excluded" },
  { role: "user", content: "earlier user" },
  { role: "assistant", content: "earlier assistant", extra: JSON.stringify({ translation: "이전 번역", translationSource: "earlier assistant" }) },
  { role: "assistant", content: "마리나라 current source" },
  { role: "assistant", content: "future message" },
];
const box = {
  marinara: { extension: { id: "test" }, storage: {}, onCleanup() {}, log: { warn(...args) { warnings.push(args); } } },
  localStorage: { getItem() { return "chat-test"; } },
  URL, Request, Headers, Response,
  window: {
    location: { href: "http://localhost/" },
    async fetch(input, init) {
      if (init?.method === "GET") {
        reads.push(String(input));
        return { ok: !failHistory, status: failHistory ? 503 : 200, async json() { return { messages }; } };
      }
      requests.push(JSON.parse(typeof init?.body === "string" ? init.body : await input.clone().text()));
      return { ok: true };
    },
  },
};
const marker = '  const style = document.createElement("style");';
vm.runInNewContext(source.replace(marker, `globalThis.api = {
  normalizePresets, composeIncomingPrompt, routedFetch,
  set(scope) { storedConfig = normalizeStoredConfig({ chats: { "chat-test": scope } }); },
}; return;\n${marker}`), box);
const api = box.api;
const send = async (body, requestObject = false) => {
  const url = "http://localhost/api/translate";
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  if (requestObject) await api.routedFetch(new Request(url, init));
  else await api.routedFetch(url, init);
  return requests.at(-1);
};
const incomingBase = "Incoming base {{targetLanguage}}";
const presetIds = ["builtin-literary-roleplay-input", "builtin-literary-roleplay-input-bilingual-dialogue"];
let combinedChecks = 0;
for (const id of presetIds) {
  const preset = api.normalizePresets([]).find((item) => item.id === id);
  for (const direction of ["incoming", "outgoing"]) {
    for (const voice of [false, true]) for (const free of [false, true]) for (const context of [false, true]) {
      for (const requestObject of [false, true]) {
        const scope = {
          outgoingPresetId: id, incomingOriginalPrompt: incomingBase,
          glossary: "마리나라 = Marinara", incomingVoiceEnabled: voice, incomingVoicePrompt: "VOICE-SENTINEL",
          freeContextEnabled: free, freeContext: "FREE-SENTINEL <era>",
          contextEnabled: context, contextMessageCount: 2,
        };
        api.set(scope);
        const incoming = direction === "incoming";
        const body = {
          chatId: "chat-test", provider: "ai", connectionId: "connection-test",
          text: "마리나라 current source", targetLanguage: incoming ? "Japanese" : "English",
          systemPrompt: incoming ? api.composeIncomingPrompt(incomingBase, voice, scope.incomingVoicePrompt) : preset.prompt,
        };
        const beforeReads = reads.length;
        const actual = await send(body, requestObject);
        assert(actual.text.includes('[Reference Glossary — Reference Only]'));
        assert(actual.text.includes('"마리나라" → "Marinara"'));
        assert(!actual.systemPrompt.includes('"마리나라" → "Marinara"'));
        assert.equal(actual.systemPrompt.includes("VOICE-SENTINEL"), incoming && voice);
        assert.equal(actual.systemPrompt.includes("FREE-SENTINEL &lt;era&gt;"), free);
        assert.equal(actual.systemPrompt.includes("# Previous Context Rules"), incoming && context);
        assert.equal(reads.length - beforeReads, incoming && context ? 1 : 0);
        assert.equal(actual.text.includes("[Previous Context — Reference Only]"), incoming && context);
        if (incoming && context) {
          assert(actual.text.includes("<original>earlier user</original>"));
          assert(actual.text.includes("<translation>이전 번역</translation>"));
          assert(!actual.text.includes("future message"));
          assert(!actual.text.includes("system must be excluded"));
          assert(actual.text.endsWith("[Text to Translate]\n마리나라 current source"));
        } else assert(actual.text.endsWith(`[Text to Translate]\n${body.text}`));
        assert.equal(actual.chatId, body.chatId);
        assert.equal(actual.connectionId, body.connectionId);
        assert(actual.systemPrompt.length <= 5000);
        assert(actual.text.length <= 50000);
        combinedChecks++;
      }
    }
  }
}

// The user-input option explicitly opts outgoing translation into prior context.
api.set({ contextEnabled: true, contextIncludeUserInput: true, contextIncludeOriginal: false, contextIncludeTranslation: true });
let actual = await send({ provider: "ai", text: "new input", targetLanguage: "English", systemPrompt: "outgoing" });
assert(actual.text.includes("<translation>이전 번역</translation>"));
assert(!actual.text.includes("<original>"));

// Non-AI requests bypass every extension option.
api.set({ glossary: "마리나라 = Marinara", freeContextEnabled: true, freeContext: "FREE", contextEnabled: true, contextIncludeUserInput: true });
for (const provider of ["google", "deepl", "deeplx"]) {
  const body = { provider, text: "마리나라 current source", targetLanguage: "Korean", systemPrompt: "base" };
  const beforeReads = reads.length;
  assert.deepEqual(await send(body), body);
  assert.equal(reads.length, beforeReads);
}

// A history lookup failure preserves the current translation and other extras.
failHistory = true;
actual = await send({ provider: "ai", text: "마리나라 current source", targetLanguage: "Korean", systemPrompt: "base" });
assert(actual.text.endsWith("[Text to Translate]\n마리나라 current source"));
assert(actual.text.includes("[Reference Glossary — Reference Only]"));
assert(actual.systemPrompt.includes("FREE"));
assert(!actual.systemPrompt.includes("# Previous Context Rules"));
assert.equal(warnings.length, 1);
failHistory = false;

// Over-limit requests must be rejected without truncation or a fallback call.
api.set({ glossary: "마리나라 = Marinara", freeContextEnabled: true, freeContext: "FREE", contextEnabled: true });
const beforeRequests = requests.length;
const rejected = await api.routedFetch("http://localhost/api/translate", { method: "POST", body: JSON.stringify({ provider: "ai", text: "마리나라 current source", targetLanguage: "Korean", systemPrompt: "x".repeat(4900) + "\n# Character Voice Instructions\nVOICE-SENTINEL" }) });
assert.equal(rejected.status, 422);
assert.equal((await rejected.json()).field, "systemPrompt");
assert.equal(requests.length, beforeRequests);
console.log(`${combinedChecks} browser AI request combinations passed; outgoing opt-in, provider bypass, history failure and prompt-length limits verified.`);
