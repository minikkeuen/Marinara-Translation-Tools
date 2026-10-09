import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const source = manifest.config.jsPath
  .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n\n");
const clone = (value) => JSON.parse(JSON.stringify(value));
const original = "마리나라 original response";
const finalText = "마리나라 final response";
const row = (content = original, index = 0, extra = {}) => ({
  id: "message",
  chatId: "chat-a",
  role: "assistant",
  content,
  activeSwipeIndex: index,
  extra,
});
const event = (type, data) => ({ type, data });
const saved = (content = original, index = 0, extra = {}) =>
  event("message_saved", row(content, index, extra));
const done = () => event("done", "");
const frame = (value) => `data: ${JSON.stringify(value)}\r\n\r\n`;

async function fixture({
  after = true,
  enabled = true,
  mode = "roleplay",
  recovery = {},
  hidden = false,
  fullRuntime = false,
} = {}) {
  const requests = [];
  const warnings = [];
  const writes = [];
  const cleanupCallbacks = [];
  let initialConfig;
  let current = row(original, 0, hidden ? { translationHidden: true } : {});
  const swipes = new Map([[0, clone(current)]]);
  const metadata = {
    autoTranslate: enabled,
    translationProvider: "ai",
    translationConnectionId: "test-connection",
    translationOutputTargetLang: "Japanese",
    translationOutputPrompt: "native base {{targetLanguage}}",
  };
  let failSuppression = false;
  let failTranslation = false;
  let failGeneration = false;
  let failRestore = false;
  let storageDisabled = false;
  const localValues = new Map([["marinara-active-chat-id", "chat-b"]]);
  let steps = [];
  let lastResponse;
  let onTranslate;
  const response = (value, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
  const update = (content, index = current.activeSwipeIndex) => {
    current = {
      ...current,
      content,
      activeSwipeIndex: index,
      extra: index === current.activeSwipeIndex ? current.extra : {},
    };
    swipes.set(index, clone(current));
  };
  const nativeFetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, "http://localhost/");
    const method = init.method || input.method || "GET";
    const raw =
      init.body ?? (input instanceof Request && method !== "GET" ? await input.clone().text() : undefined);
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({
      url: url.pathname,
      query: url.search,
      method,
      body,
      keepalive: init.keepalive,
      headers: [...new Headers(init.headers || input.headers)],
    });
    if (url.pathname === "/api/personal-extensions/test/storage") {
      await Promise.resolve();
      if (storageDisabled) return response({}, 404);
      if (method === "PATCH") writes.push(clone(body));
      return response({
        value: {
          config: initialConfig,
          automaticTranslationRecovery: method === "PATCH" ? body.automaticTranslationRecovery : recovery,
        },
      });
    }
    if (url.pathname === "/api/chats/chat-a/metadata") {
      if ((body.autoTranslate === false && failSuppression) || (body.autoTranslate === true && failRestore))
        return response({}, 503);
      Object.assign(metadata, body);
      return response({ id: "chat-a", mode, metadata: JSON.stringify(metadata) });
    }
    if (url.pathname === "/api/personal-extensions/test" && method === "PATCH") {
      storageDisabled = body.enabled === false;
      return response({ enabled: !storageDisabled });
    }
    if (url.pathname === "/api/chats/chat-a")
      return response({ id: "chat-a", mode, metadata: JSON.stringify(metadata) });
    if (url.pathname === "/api/chats")
      return response([{ id: "chat-a", metadata: JSON.stringify(metadata) }]);
    if (url.pathname === "/api/generate/status/chat-a")
      return response({ active: false, translating: false });
    if (url.pathname === "/api/chats/chat-a/messages")
      return response([
        { id: "previous-user", role: "user", content: "previous original" },
        {
          id: "previous-assistant",
          role: "assistant",
          content: "previous assistant",
          extra: { translation: "previous translation" },
        },
        current,
      ]);
    if (url.pathname.endsWith("/swipes"))
      return response(
        [...swipes.values()].map((item) => ({
          index: item.activeSwipeIndex,
          content: item.content,
          extra: item.extra,
        })),
      );
    if (url.pathname.endsWith("/extra")) {
      const index = Number(url.searchParams.get("swipeIndex"));
      const swipe = swipes.get(index);
      assert(swipe, "Persistence must target a real swipe");
      swipe.extra = { ...swipe.extra, ...body };
      if (index === current.activeSwipeIndex) current.extra = clone(swipe.extra);
      return response(current);
    }
    if (url.pathname === "/api/translate") {
      if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await onTranslate?.(body);
      return failTranslation ? response({}, 503) : response({ translatedText: "translated response" });
    }
    if (url.pathname === "/api/generate") {
      assert.equal(
        metadata.autoTranslate,
        false,
        "Server automatic translation must be disabled before generation starts",
      );
      if (failGeneration) return response({}, 500);
      let index = 0;
      const generationSteps = steps;
      const encoder = new TextEncoder();
      // Fragment every SSE frame, including inside Unicode and CRLF boundaries.
      let remainder;
      lastResponse = new Response(
        new ReadableStream({
          async pull(controller) {
            if (remainder) {
              controller.enqueue(remainder);
              remainder = null;
              return;
            }
            if (index >= generationSteps.length) {
              controller.close();
              return;
            }
            const step = generationSteps[index++];
            if (step.error) {
              controller.error(new Error("stream disconnected"));
              return;
            }
            if (step.action) await step.action();
            if (step.update) update(step.update.content, step.update.index);
            const bytes = encoder.encode(frame(step.event || step));
            const split = Math.min(17, bytes.length);
            controller.enqueue(bytes.slice(0, split));
            remainder = bytes.slice(split);
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
      return lastResponse;
    }
    throw new Error(`Unhandled fixture URL ${method} ${url}`);
  };
  const box = {
    marinara: {
      extension: { id: "test" },
      onCleanup(callback) {
        cleanupCallbacks.push(callback);
      },
      storage: {
        async patch(value) {
          writes.push(clone(value));
          return value;
        },
      },
      log: {
        warn(...args) {
          warnings.push(args);
        },
      },
      setTimeout,
      clearTimeout,
    },
    window: { fetch: nativeFetch, location: { href: "http://localhost/" } },
    localStorage: {
      getItem(key) {
        return localValues.get(key) ?? null;
      },
      setItem(key, value) {
        localValues.set(key, value);
      },
    },
    URL,
    Request,
    Headers,
    Response,
    ReadableStream,
    TextEncoder,
    TextDecoder,
    AbortController,
    DOMException,
  };
  if (fullRuntime) {
    box.document = {
      createElement() {
        return { dataset: {}, remove() {} };
      },
      head: { append() {} },
      body: {},
      querySelectorAll() {
        return [];
      },
    };
    box.MutationObserver = class {
      observe() {}
      disconnect() {}
    };
    box.window.addEventListener = () => {};
    box.window.removeEventListener = () => {};
    box.marinara.setInterval = setInterval;
    box.marinara.clearInterval = clearInterval;
    // Match the real Full page API: storage itself calls global fetch.
    box.marinara.storage.get = async () =>
      (await (await box.window.fetch("/api/personal-extensions/test/storage")).json()).value;
    box.marinara.storage.patch = async (value) => {
      const response = await box.window.fetch("/api/personal-extensions/test/storage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-marinara-csrf": "1" },
        body: JSON.stringify(value),
      });
      if (!response.ok) throw new Error(`Storage update failed (${response.status})`);
      return (await response.json()).value;
    };
  }
  const marker = '  const style = document.createElement("style");';
  vm.runInNewContext(
    source.replace(
      marker,
      `globalThis.api = {
    create: createMarinaraAutomaticTranslation, translate: translateAutomaticRequest,
    headersFor: requestHeaders, gameSource: MARINARA_GAME_TRANSLATION.buildGameTranslationSource,
    scopeFor: (id) => currentScope(storedConfig, id),
    runtime: () => automaticTranslation,
    set(config) { storedConfig = normalizeStoredConfig(config); },
  }; ${fullRuntime ? "" : "return;"}\n${marker}`,
    ),
    box,
  );
  initialConfig = {
    chats: {
      "chat-a": {
        translateAfterPostProcessing: after,
        incomingPresetId: "builtin-literary-roleplay-input",
        glossary: "마리나라 = Marinara",
        freeContextEnabled: true,
        freeContext: "FREE-A",
        incomingVoiceEnabled: true,
        incomingVoicePrompt: "VOICE-A",
        contextEnabled: true,
      },
      "chat-b": { glossary: "WRONG-CHAT", freeContextEnabled: true, freeContext: "WRONG-CHAT" },
    },
  };
  box.api.set(initialConfig);
  const automatic = fullRuntime
    ? box.api.runtime()
    : box.api.create({
        marinara: box.marinara,
        fetch: nativeFetch,
        headersFor: box.api.headersFor,
        scopeFor: box.api.scopeFor,
        translate: box.api.translate,
        gameSource: box.api.gameSource,
      });
  await automatic.start({ automaticTranslationRecovery: recovery });
  const managedFetch = (input, init) =>
    fullRuntime ? box.window.fetch(input, init) : automatic.fetch(input, init, nativeFetch);
  const start = async (events, overrides = {}, requestObject = false) => {
    steps = events;
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-marinara-csrf": "1" },
      body: JSON.stringify({ chatId: "chat-a", ...overrides }),
    };
    return requestObject
      ? managedFetch(new Request("http://localhost/api/generate", init))
      : managedFetch("/api/generate", init);
  };
  const calls = () => requests.filter((request) => request.url === "/api/translate");
  return {
    start,
    managedFetch,
    automatic,
    calls,
    requests,
    warnings,
    writes,
    metadata,
    swipes,
    update,
    box,
    current: () => clone(current),
    flags(value) {
      ({
        failSuppression = failSuppression,
        failTranslation = failTranslation,
        failGeneration = failGeneration,
        failRestore = failRestore,
        storageDisabled = storageDisabled,
      } = value);
    },
    onTranslate(callback) {
      onTranslate = callback;
    },
    async runtimeCleanup() {
      await Promise.all(cleanupCallbacks.map((cleanup) => cleanup()));
    },
    nativeFetch,
  };
}

for (const after of [false, true]) {
  const f = await fixture({ after });
  const response = await f.start(
    [
      saved(),
      saved(),
      event("agent_start", { phase: "post_processing" }),
      { event: event("text_rewrite", { editedText: finalText }), update: { content: finalText } },
      event("assistant_message_ready", row(finalText)),
      done(),
      done(),
    ],
    {},
    after,
  );
  const visible = await (await f.managedFetch("/api/chats/chat-a")).json();
  assert.equal(
    JSON.parse(visible.metadata).autoTranslate,
    true,
    "Existing UI keeps ON while the server is OFF",
  );
  const visibleList = await (await f.managedFetch("/api/chats")).json();
  assert.equal(JSON.parse(visibleList[0].metadata).autoTranslate, true);
  const stream = await response.text();
  assert.equal(f.calls().length, 1, "Duplicate saved/done events do not duplicate translation");
  const call = f.calls()[0];
  assert(call.body.text.endsWith(after ? finalText : original));
  for (const value of [
    "VOICE-A",
    "FREE-A",
    "# Previous Context Rules",
  ])
    assert(call.body.systemPrompt.includes(value), value);
  assert(call.body.text.includes("[Reference Glossary — Reference Only]"));
  assert(call.body.text.includes('"마리나라" → "Marinara"'));
  assert(!call.body.systemPrompt.includes('"마리나라" → "Marinara"'));
  assert.equal(call.body.systemPrompt.split("# Character Voice Instructions").length, 2);
  assert(call.body.text.includes("previous original"));
  assert(call.body.text.includes("previous translation"));
  assert(!JSON.stringify(call.body).includes("WRONG-CHAT"));
  assert.equal(
    call.body.targetLanguage,
    "Japanese",
    "Incoming context is included even when the target is not Korean",
  );
  assert.equal(f.metadata.autoTranslate, true, "Server state restored at done");
  assert.equal(f.current().extra.translationSource, after ? finalText : original);
  assert(
    stream.includes("translated response"),
    "Native UI receives persisted translation before completion",
  );
  assert.deepEqual(f.writes.at(-1).automaticTranslationRecovery, {});
  await f.automatic.cleanup();
}

// OFF stays OFF and a hidden/command-only response must not be auto-translated.
for (const options of [{ enabled: false }, { hidden: true }]) {
  const f = await fixture(options);
  await (
    await f.start([saved(original, 0, options.hidden ? { translationHidden: true } : {}), done()])
  ).text();
  assert.equal(f.calls().length, 0);
  assert.equal(f.metadata.autoTranslate, options.enabled !== false);
  await f.automatic.cleanup();
}

// Continue updates the same swipe; regenerate adds a different swipe.
{
  const f = await fixture();
  await (await f.start([saved(), done()])).text();
  f.update("continued response");
  await (
    await f.start([saved("continued response"), saved("continued response"), done()], {
      continueMessageId: "message",
    })
  ).text();
  f.update("regenerated response", 1);
  await (
    await f.start([saved("regenerated response", 1), done()], { regenerateMessageId: "message" })
  ).text();
  assert.equal(f.calls().length, 3);
  assert.equal(f.swipes.get(0).extra.translationSource, "continued response");
  assert.equal(f.swipes.get(1).extra.translationSource, "regenerated response");
  await f.automatic.cleanup();
}

// Failure cases restore the setting; failed suppression never starts generation.
for (const flags of [{ failSuppression: true }, { failGeneration: true }, { failTranslation: true }]) {
  const f = await fixture();
  f.flags(flags);
  if (flags.failSuppression) await assert.rejects(f.start([saved(), done()]));
  else await (await f.start([saved(), saved(), done()])).text();
  assert.equal(f.metadata.autoTranslate, true);
  assert.equal(f.calls().length, flags.failTranslation ? 1 : 0);
  if (flags.failSuppression) assert(!f.requests.some((request) => request.url === "/api/generate"));
  await f.automatic.cleanup();
}

// Turning OFF during generation must survive release and suppress queued work.
{
  const f = await fixture();
  const response = await f.start([saved(), done()]);
  const patch = await f.managedFetch("/api/chats/chat-a/metadata", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-marinara-csrf": "1" },
    body: JSON.stringify({ autoTranslate: false }),
  });
  assert.equal(JSON.parse((await patch.json()).metadata).autoTranslate, false);
  await response.text();
  assert.equal(f.calls().length, 0);
  assert.equal(f.metadata.autoTranslate, false);
  await f.automatic.cleanup();
}

// Stream failure, cancellation, page hide and disable restore the original state.
for (const action of ["error", "cancel", "disable", "pagehide"]) {
  const f = await fixture();
  const response = await f.start(action === "error" ? [{ error: true }] : [event("progress", "assembling")]);
  if (action === "error") await assert.rejects(response.text());
  if (action === "cancel") await response.body.cancel();
  if (action === "disable") {
    await f.automatic.cleanup();
    await response.text();
  }
  if (action === "pagehide") {
    f.automatic.pagehide();
    await new Promise((resolve) => setImmediate(resolve));
    await response.text();
  }
  assert.equal(f.metadata.autoTranslate, true, action);
  assert.equal(f.calls().length, 0, action);
  await f.automatic.cleanup();
}

// Interrupted-session recovery, plus bounded stability fallback without done.
{
  const f = await fixture({ enabled: false, recovery: { "chat-a": true } });
  assert.equal(f.metadata.autoTranslate, true);
  await (
    await f.start([
      saved(),
      { event: event("text_rewrite", { editedText: finalText }), update: { content: finalText } },
    ])
  ).text();
  assert.equal(f.calls().length, 1);
  assert(f.calls()[0].body.text.endsWith(finalText));
  assert(f.requests.filter((request) => request.url.endsWith("/status/chat-a")).length >= 2);
  await f.automatic.cleanup();
}

// The actual Game source formatter is bundled, rather than translating GM tags.
{
  const f = await fixture({ mode: "game" });
  const game =
    '마리나라 scene.\n[main: internal data]\n[Alex]: "Hello."\n[sheet: op="spend" resource="mana" amount="1"]';
  f.update(game);
  await (await f.start([saved(game), done()])).text();
  assert.equal(f.calls().length, 1);
  assert(!f.calls()[0].body.text.includes("[main:"));
  assert(!f.calls()[0].body.text.includes("[sheet:"));
  assert(f.calls()[0].body.text.includes("Hello."));
  await f.automatic.cleanup();
}
// A continuation can start while the old response's agents are still running.
{
  const f = await fixture();
  const old = await f.start([saved(), done()]);
  f.update("new continued response");
  const newer = await f.start([saved("new continued response"), done()], { continueMessageId: "message" });
  await old.text();
  await newer.text();
  assert.equal(f.calls().length, 1);
  assert(f.calls()[0].body.text.endsWith("new continued response"));
  assert.equal(f.metadata.autoTranslate, true);
  await f.automatic.cleanup();
}

// A native/manual request for the same incoming text shares the ongoing attempt.
{
  const f = await fixture();
  let native;
  f.onTranslate(() => {
    native = f.managedFetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: "chat-a", text: original, provider: "ai", targetLanguage: "Japanese" }),
    });
  });
  await (await f.start([saved(), done()])).text();
  assert.equal((await (await native).json()).translatedText, "translated response");
  assert.equal(f.calls().length, 1);
  await f.automatic.cleanup();
}

// Failed restoration keeps recovery data and succeeds when disable retries it.
{
  const f = await fixture();
  f.flags({ failRestore: true });
  await (await f.start([saved(), done()])).text();
  assert.equal(f.metadata.autoTranslate, false);
  assert.deepEqual(f.writes.at(-1).automaticTranslationRecovery, { "chat-a": true });
  f.flags({ failRestore: false });
  await f.automatic.cleanup();
  assert.equal(f.metadata.autoTranslate, true);
  assert.deepEqual(f.writes.at(-1).automaticTranslationRecovery, {});
}

// Inherit uses the current native prompt, not a stale extension-side original.
{
  const f = await fixture();
  f.box.api.set({
    chats: {
      "chat-a": {
        translateAfterPostProcessing: true,
        incomingPresetId: "builtin-inherit",
        incomingOriginalPrompt: "STALE",
        incomingVoiceEnabled: true,
        incomingVoicePrompt: "VOICE",
      },
    },
  });
  f.metadata.translationOutputPrompt = "CURRENT\n\n# Character Voice Instructions\nVOICE";
  await (await f.start([saved(), done()])).text();
  assert(f.calls()[0].body.systemPrompt.startsWith("CURRENT"));
  assert(!f.calls()[0].body.systemPrompt.includes("STALE"));
  assert.equal(f.calls()[0].body.systemPrompt.split("# Character Voice Instructions").length, 2);
  await f.automatic.cleanup();
}

// Placeholder SSE content must not be translated in immediate mode.
{
  const f = await fixture({ after: false });
  await (
    await f.start([
      saved("Processing…", 0, { postProcessingPending: { agentType: "prose-guardian" } }),
      event("agent_start", { phase: "post_processing" }),
      { event: event("text_rewrite", { editedText: finalText }), update: { content: finalText } },
      done(),
    ])
  ).text();
  assert.equal(f.calls().length, 1);
  assert(!f.calls()[0].body.text.includes("Processing…"));
  assert.equal(
    f.current().extra.automaticTranslationSource,
    finalText,
    "Native Game fallback cannot retranslate after a rewrite",
  );
  await f.automatic.cleanup();
}

// Exercise the actual entry point, fetch installation and cleanup callback.
{
  const f = await fixture({ fullRuntime: true });
  assert.notEqual(f.box.window.fetch, f.nativeFetch);
  const response = await f.start([event("progress", "assembling"), saved(), done()]);
  assert.equal(f.metadata.autoTranslate, false);
  await f.runtimeCleanup();
  assert.equal(f.box.window.fetch, f.nativeFetch);
  assert.equal(f.metadata.autoTranslate, true);
  await response.text();
  assert.equal(f.calls().length, 0, "A disabled runtime does not launch delayed translations");
}

// Completion reaches the client immediately even while translation is slow.
{
  const f = await fixture();
  let finishTranslation;
  const wait = new Promise((resolve) => {
    finishTranslation = resolve;
  });
  f.onTranslate(() => wait);
  const response = await f.start([saved(), done()]);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let streamed = "";
  while (!streamed.includes('"type":"done"')) streamed += decoder.decode((await reader.read()).value);
  assert(!streamed.includes("translated response"));
  const status = await (await f.managedFetch("/api/generate/status/chat-a")).json();
  assert.equal(status.translating, true, "Native Game fallback waits for the extension");
  finishTranslation();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    streamed += decoder.decode(chunk.value);
  }
  assert(streamed.includes("translated response"));
  assert.equal(f.calls().length, 1);
  assert.equal(f.metadata.autoTranslate, true);
  await f.automatic.cleanup();
}

// Restore and clear recovery before the host disables access to extension storage.
{
  const f = await fixture({ fullRuntime: true });
  const response = await f.start([event("progress", "assembling"), saved(), done()]);
  const disabled = await f.managedFetch("/api/personal-extensions/test", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  assert(disabled.ok);
  assert.equal(f.metadata.autoTranslate, true);
  assert.deepEqual(f.writes.at(-1).automaticTranslationRecovery, {});
  await f.runtimeCleanup();
  await response.text();
  assert.equal(f.calls().length, 0);
}

// If the host has already disabled storage, a confirmed local restoration
// prevents stale recovery data from undoing a later native OFF choice.
{
  const f = await fixture({ fullRuntime: true });
  const response = await f.start([event("progress", "assembling"), saved(), done()]);
  const backup = clone(f.writes.at(-1));
  f.flags({ storageDisabled: true });
  await f.runtimeCleanup();
  await response.text();
  assert.equal(f.metadata.autoTranslate, true);
  f.metadata.autoTranslate = false;
  f.flags({ storageDisabled: false });
  const reactivated = f.box.api.create({
    marinara: f.box.marinara,
    fetch: f.nativeFetch,
    headersFor: f.box.api.headersFor,
    scopeFor: f.box.api.scopeFor,
    translate: f.box.api.translate,
    gameSource: f.box.api.gameSource,
  });
  await reactivated.start(backup);
  assert.equal(f.metadata.autoTranslate, false);
  assert.deepEqual(f.writes.at(-1).automaticTranslationRecovery, {});
  await reactivated.cleanup();
}

console.log(
  "Automatic translation: server suppression/UI projection, all context delivery, post-processing timing, deduplication, continue/regenerate, persistence, recovery and cleanup passed.",
);
