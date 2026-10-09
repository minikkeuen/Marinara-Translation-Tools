import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const source = manifest.config.jsPath.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n\n");

// Small DOM fixture: no browser or running Marinara instance is used.
class Element {
  constructor(tag, attributes = {}) {
    this.tag = tag;
    this.attributes = attributes;
    this.children = [];
    this.events = [];
    this.value = "";
  }
  append(child) { child.parentElement = this; this.children.push(child); }
  setAttribute(key, value) { this.attributes[key] = value; }
  matches(selector) {
    if (selector.startsWith(".")) return this.attributes.class === selector.slice(1);
    if (selector === "textarea") return this.tag === selector;
    if (selector.startsWith("div") && this.tag !== "div") return false;
    return [...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)].every(
      ([, key, value]) => key in this.attributes && (value === undefined || this.attributes[key] === value),
    );
  }
  querySelectorAll(selector) {
    if (selector.startsWith(":scope > ")) return this.children.filter((child) => child.matches(selector.slice(9)));
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
  get nextElementSibling() {
    return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] ?? null;
  }
  dispatchEvent(event) { this.events.push(event.type); }
}

const document = new Element("document");
document.createElement = (tag) => new Element(tag);
const formMarkup = source.match(/form\.innerHTML = `([\s\S]*?)`;/)[1];
for (const name of ["outgoingPresetId", "incomingPresetId", "glossary", "translateAfterPostProcessing"]) {
  assert(formMarkup.includes(`name="${name}"`), `${name} control remains in the shared UI`);
}
let voiceSyncs = 0;
const saved = [];
const marker = '  const style = document.createElement("style");';
const box = {
  document, URL, Request, Headers, Event,
  HTMLTextAreaElement: Element,
  localStorage: { getItem() { return "chat-test"; } },
  window: { location: { href: "http://localhost/" }, fetch() {} },
  marinara: {
    extension: { id: "test" }, onCleanup() {},
    storage: { async patch(value) { saved.push(value); return value; } },
  },
  makeForm() { return new Element("form"); },
  voiceSync() { voiceSyncs++; },
};
vm.runInNewContext(source.replace(marker, `
  globalThis.api = { injectPanels, nativePromptTextareas, applyPreset,
    composeIncomingPrompt, normalizeStoredConfig, saveConfig,
    set(value) { storedConfig = normalizeStoredConfig(value); },
    stubRendering() { createForm = makeForm; syncIncomingVoiceToNative = voiceSync; },
  }; return;
${marker}`), box);
const api = box.api;
api.stubRendering();

function section(version, { open = true, detached = false, label = "번역", id = "translation" } = {}) {
  const section = new Element("div", { "data-chat-settings-section": id });
  const body = new Element("div", version === "2.5" ? { class: "mari-drawer__body" } : {});
  if (!detached) {
    const toggle = new Element(version === "2.5" ? "button" : "div", {
      role: "button", "aria-expanded": String(open),
    });
    toggle.textContent = label;
    if (version === "2.5") {
      const header = new Element("div", { class: "mari-drawer__header" });
      header.append(toggle);
      header.append(new Element("button", { "data-drawer-control": "pop-out" }));
      section.append(header);
    } else section.append(toggle);
  }
  if (open || detached) section.append(body);
  document.append(section);
  return { section, body };
}

const legacy = section("2.4");
const docked = section("2.5", { label: "翻訳" });
const detached = section("2.5", { open: false, detached: true });
const closed = section("2.5", { open: false });
const unrelated = section("2.5", { id: "connection" });
const panelSelector = "[data-translation-presets-glossary]";
api.injectPanels();
assert.equal(document.querySelectorAll(panelSelector).length, 0, "Wait for stored config before rendering");
api.set({ chats: { "chat-test": { glossary: "마리나라 = Marinara" } } });
api.injectPanels();
for (const fixture of [legacy, docked, detached]) {
  assert.equal(fixture.body.querySelectorAll(panelSelector).length, 1);
  assert.equal(fixture.body.querySelector(panelSelector).children[0].tag, "form");
}
assert.equal(closed.section.querySelectorAll(panelSelector).length, 0);
assert.equal(unrelated.section.querySelectorAll(panelSelector).length, 0);
api.injectPanels();
assert.equal(document.querySelectorAll(panelSelector).length, 3, "Repeated mutations do not duplicate panels");
assert.equal(voiceSyncs, 3, "Each new form keeps its native prompt synchronization");

// Closing/reopening or docking recreates the native body; reinject into the new one.
closed.section.append(closed.body);
docked.section.children = docked.section.children.slice(0, 1);
const reopened = new Element("div", { class: "mari-drawer__body" });
docked.section.append(reopened);
api.injectPanels();
assert.equal(closed.body.querySelectorAll(panelSelector).length, 1);
assert.equal(reopened.querySelectorAll(panelSelector).length, 1);

// Preset application still finds only the two native fields in its own body.
for (const body of [legacy.body, reopened, detached.body]) {
  const outgoing = new Element("textarea"); outgoing.value = "original outgoing";
  const incoming = new Element("textarea"); incoming.value = "original incoming";
  body.append(outgoing); body.append(incoming);
  const panel = body.querySelector(panelSelector);
  const form = panel.children[0];
  const glossary = new Element("textarea"); glossary.value = "saved glossary";
  form.append(glossary);
  const fields = {
    outgoingPresetId: { value: "custom" }, incomingPresetId: { value: "custom" },
    incomingVoiceEnabled: { checked: true }, incomingVoicePrompt: { value: "voice instruction" },
  };
  form.elements = { namedItem(name) { return fields[name]; } };
  form._presets = [{ id: "custom", replace: true, prompt: "custom prompt" }];
  form._originalPrompts = {}; form._appliedPresetIds = {};
  assert.deepEqual(Array.from(api.nativePromptTextareas(form)), [outgoing, incoming]);
  assert.equal(api.applyPreset(form, "outgoing", false), true);
  assert.equal(api.applyPreset(form, "incoming", false), true);
  assert.equal(outgoing.value, "custom prompt");
  assert.equal(incoming.value, api.composeIncomingPrompt("custom prompt", true, "voice instruction"));
  assert.equal(glossary.value, "saved glossary");
  assert.deepEqual(outgoing.events, ["input", "change"]);
  assert.deepEqual(incoming.events, ["input", "change"]);
  fields.outgoingPresetId.value = "builtin-inherit";
  form._presets.push({ id: "builtin-inherit", replace: false });
  assert.equal(api.applyPreset(form, "outgoing", false), true);
  assert.equal(outgoing.value, "original outgoing", "Inherit restores the original native prompt");
  for (const name of ["문학·RP·3인칭 지문 인풋용", "문학·RP·3인칭 지문 인풋용 대사 병기"]) {
    const preset = api.normalizeStoredConfig(null).presets.find((item) => item.name === name);
    form._presets.push(preset);
    fields.outgoingPresetId.value = preset.id;
    assert.equal(api.applyPreset(form, "outgoing", false), true);
    assert.equal(outgoing.value, preset.prompt, `${name} is applied to the native outgoing field`);
  }
}
const config = api.normalizeStoredConfig({
  presets: [{ id: "custom", name: "사용자 프리셋", prompt: "custom prompt" }],
  defaults: { glossary: "default = 기본" },
  chats: {
    "chat-test": { glossary: "마리나라 = Marinara", outgoingPresetId: "custom", incomingVoiceEnabled: true, incomingVoicePrompt: "voice", translateAfterPostProcessing: true },
    "chat-other": { glossary: "other = 다른", contextEnabled: true },
  },
});
await api.saveConfig(config);
assert.deepEqual(JSON.parse(JSON.stringify(saved.at(-1))), { config: JSON.parse(JSON.stringify(config)) });
assert.equal(saved.at(-1).config.chats["chat-test"].glossary, "마리나라 = Marinara");
assert.equal(saved.at(-1).config.chats["chat-other"].glossary, "other = 다른");
assert.equal(saved.at(-1).config.chats["chat-test"].translateAfterPostProcessing, true);
assert.equal(saved.at(-1).config.chats["chat-other"].translateAfterPostProcessing, false);
console.log("2.4 and 2.5 docked/detached UI injection, reopen, deduplication, native preset/voice application and glossary isolation passed.");
