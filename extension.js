((marinara) => {
  "use strict";

  if (!marinara?.extension?.id || !marinara?.storage || typeof marinara.onCleanup !== "function") {
    throw new Error("번역 프리셋·단어장은 Marinara Engine 2.4.x 확장 API가 필요합니다.");
  }

  const EXTENSION_LABEL = "번역 프리셋·단어장";
  const ACTIVE_CHAT_KEY = "marinara-active-chat-id";
  const PANEL_ATTRIBUTE = "data-translation-presets-glossary";
  const SYSTEM_PROMPT_MAX = 5000;
  const TRANSLATION_TEXT_MAX = 50000;
  const FREE_CONTEXT_MAX = 1000;
  const CONTEXT_MESSAGE_COUNT_DEFAULT = 3;
  const CONTEXT_MESSAGE_COUNT_MIN = 1;
  const CONTEXT_MESSAGE_COUNT_MAX = 10;
  const CONTEXT_SYSTEM_INSTRUCTIONS = MARINARA_TRANSLATION_REFERENCE_PROMPTS.previousContext;
  const { base: BASE_PROMPT, roleplay: ORIGINAL_ROLEPLAY_PROMPT, literaryRoleplay: LITERARY_ROLEPLAY_PROMPT } =
    MARINARA_TRANSLATION_GENERAL_PROMPTS;
  const BUILTIN_PRESETS = Object.freeze([
    Object.freeze({
      id: "builtin-inherit",
      name: "채팅 설정 유지",
      prompt: BASE_PROMPT,
      replace: false,
      builtin: true,
    }),
    Object.freeze({
      id: "builtin-roleplay",
      name: "자연스러운 RP",
      prompt: ORIGINAL_ROLEPLAY_PROMPT,
      replace: true,
      builtin: true,
    }),
    Object.freeze({
      id: "builtin-literary-roleplay",
      name: "범용 문학·RP",
      prompt: LITERARY_ROLEPLAY_PROMPT,
      replace: true,
      builtin: true,
    }),
    Object.freeze({
      id: "builtin-english-korean",
      name: "영어→한국어 문학·RP",
      prompt: MARINARA_TRANSLATION_LITERARY_PROMPTS.legacy.english,
      replace: true,
      builtin: true,
    }),
    Object.freeze({
      id: "builtin-chinese-korean",
      name: "중국어→한국어 문학·RP",
      prompt: MARINARA_TRANSLATION_LITERARY_PROMPTS.legacy.chinese,
      replace: true,
      builtin: true,
    }),
    Object.freeze({
      id: "builtin-japanese-korean",
      name: "일본어→한국어 문학·RP",
      prompt: MARINARA_TRANSLATION_LITERARY_PROMPTS.legacy.japanese,
      replace: true,
      builtin: true,
    }),
    Object.freeze({
      id: "builtin-bilingual-dialogue-korean",
      name: "원문 대사 병기·한국어 RP",
      prompt: MARINARA_TRANSLATION_BILINGUAL_PROMPTS.legacy,
      replace: true,
      builtin: true,
    }),
  ]);
  const V2_PRESETS = [
    {
      id: "builtin-english-korean-v2",
      legacyId: "builtin-english-korean",
      sourceId: "custom-6d2179ba-aa61-443d-b4d0-2871f3b71dd4",
      name: "영어→한국어 문학·RP v2",
      prompt: MARINARA_TRANSLATION_LITERARY_PROMPTS.v2.english,
      replace: true,
      builtin: true,
    },
    {
      id: "builtin-japanese-korean-v2",
      legacyId: "builtin-japanese-korean",
      sourceId: "custom-50681179-369c-47e6-8aa0-c784d6b4f4c4",
      name: "일본어→한국어 문학·RP v2",
      prompt: MARINARA_TRANSLATION_LITERARY_PROMPTS.v2.japanese,
      replace: true,
      builtin: true,
    },
    {
      id: "builtin-chinese-korean-v2",
      legacyId: "builtin-chinese-korean",
      sourceId: "custom-bb53f4d1-e48e-4458-855b-36aeed276cf7",
      name: "중국어→한국어 문학·RP v2",
      prompt: MARINARA_TRANSLATION_LITERARY_PROMPTS.v2.chinese,
      replace: true,
      builtin: true,
    },
    {
      id: "builtin-bilingual-dialogue-korean-v2",
      legacyId: "builtin-bilingual-dialogue-korean",
      sourceId: "custom-05aa88b0-9167-4567-8eb0-bd55007c1669",
      name: "원문 대사 병기·한국어 RP v2",
      prompt: MARINARA_TRANSLATION_BILINGUAL_PROMPTS.v2,
      replace: true,
      builtin: true,
    },
  ];
  const ADDITIONAL_BUILTIN_PRESETS = Object.freeze([
    Object.freeze({
      id: "builtin-english-paraphrase-korean",
      name: "영어→한국어 의역·문학·RP",
      prompt: MARINARA_TRANSLATION_PARAPHRASE_PROMPTS.english,
      replace: true,
      builtin: true,
    }),
    Object.freeze({
      id: "builtin-english-source-style-korean",
      name: "영어→영문학 번역체·RP",
      prompt: MARINARA_TRANSLATION_SOURCE_STYLE_PROMPTS.english,
      replace: true,
      builtin: true,
    }),
    Object.freeze({
      id: "builtin-chinese-paraphrase-korean",
      name: "중국어→한국어 의역·문학·RP",
      prompt: MARINARA_TRANSLATION_PARAPHRASE_PROMPTS.chinese,
      replace: true,
      builtin: true,
    }),
  ]);
  const BUILTIN_PRESET_ORDER = new Map([
    "builtin-inherit",
    "builtin-roleplay",
    "builtin-literary-roleplay",
    "builtin-english-korean",
    "builtin-english-korean-v2",
    "builtin-english-paraphrase-korean",
    "builtin-english-source-style-korean",
    "builtin-chinese-korean",
    "builtin-chinese-korean-v2",
    "builtin-chinese-paraphrase-korean",
    "builtin-japanese-korean",
    "builtin-japanese-korean-v2",
    "builtin-bilingual-dialogue-korean",
    "builtin-bilingual-dialogue-korean-v2",
  ].map((id, index) => [id, index]));
  const LEGACY_VOICE_INSTRUCTION_START = "[Translation Tools: Character Voice Instructions]";
  const LEGACY_VOICE_INSTRUCTION_END = "[/Translation Tools: Character Voice Instructions]";
  const DEFAULT_SCOPE = Object.freeze({
    glossary: "",
    freeContextEnabled: false,
    freeContext: "",
    incomingVoiceEnabled: false,
    incomingVoicePrompt: "",
    contextEnabled: false,
    contextIncludeOriginal: true,
    contextIncludeTranslation: true,
    contextIncludeUserInput: false,
    contextMessageCount: CONTEXT_MESSAGE_COUNT_DEFAULT,
    outgoingPresetId: "builtin-inherit",
    incomingPresetId: "builtin-inherit",
    outgoingOriginalPrompt: "",
    incomingOriginalPrompt: "",
  });

  const originalFetch = window.fetch;
  const forms = new Set();
  let storedConfig = null;
  let configWriteQueue = Promise.resolve();
  let presetDeletionPending = false;
  let activeChatId = readActiveChatId();
  let injectQueued = false;

  function readActiveChatId() {
    try {
      const value = localStorage.getItem(ACTIVE_CHAT_KEY);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  }

  function newPresetId() {
    try {
      return `custom-${crypto.randomUUID()}`;
    } catch {
      return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }
  }

  function normalizePresets(value, state = storedConfig) {
    const upgraded = state?.presetV2Updated === true;
    const removeLegacy = upgraded && state?.keepLegacyPresets !== true;
    const legacyIds = new Set(V2_PRESETS.map((p) => p.legacyId));
    const presets = BUILTIN_PRESETS.filter((p) => !removeLegacy || !legacyIds.has(p.id)).map((p) => ({ ...p }));
    if (upgraded) presets.push(...V2_PRESETS.map((p) => ({ ...p })));
    presets.push(...ADDITIONAL_BUILTIN_PRESETS.map((p) => ({ ...p })));
    presets.sort((a, b) =>
      (BUILTIN_PRESET_ORDER.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (BUILTIN_PRESET_ORDER.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
    const reservedIds = new Set([...BUILTIN_PRESETS, ...V2_PRESETS, ...ADDITIONAL_BUILTIN_PRESETS].map((p) => p.id));
    const ids = new Set(presets.map((preset) => preset.id));
    if (!Array.isArray(value)) return presets;
    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const prompt = typeof item.prompt === "string" ? item.prompt : "";
      if (!id || ids.has(id) || reservedIds.has(id) || !name || !prompt.trim()) continue;
      if (upgraded && V2_PRESETS.some((p) => p.sourceId === id && p.name === name && p.prompt === prompt)) continue;
      ids.add(id);
      presets.push({ id, name, prompt, replace: true, builtin: false });
    }
    return presets;
  }

  function normalizeScope(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const rawContextMessageCount = Number.parseInt(String(source.contextMessageCount ?? ""), 10);
    const contextMessageCount = Number.isFinite(rawContextMessageCount)
      ? Math.min(CONTEXT_MESSAGE_COUNT_MAX, Math.max(CONTEXT_MESSAGE_COUNT_MIN, rawContextMessageCount))
      : CONTEXT_MESSAGE_COUNT_DEFAULT;
    return {
      glossary: typeof source.glossary === "string" ? source.glossary : "",
      freeContextEnabled: source.freeContextEnabled === true,
      freeContext: typeof source.freeContext === "string" ? source.freeContext : "",
      incomingVoiceEnabled: source.incomingVoiceEnabled === true,
      incomingVoicePrompt: typeof source.incomingVoicePrompt === "string" ? source.incomingVoicePrompt : "",
      contextEnabled: source.contextEnabled === true,
      contextIncludeOriginal: source.contextIncludeOriginal !== false,
      contextIncludeTranslation: source.contextIncludeTranslation !== false,
      contextIncludeUserInput: source.contextIncludeUserInput === true,
      contextMessageCount,
      outgoingPresetId: typeof source.outgoingPresetId === "string" ? source.outgoingPresetId : "builtin-inherit",
      incomingPresetId: typeof source.incomingPresetId === "string" ? source.incomingPresetId : "builtin-inherit",
      outgoingOriginalPrompt:
        typeof source.outgoingOriginalPrompt === "string" ? source.outgoingOriginalPrompt : "",
      incomingOriginalPrompt:
        typeof source.incomingOriginalPrompt === "string" ? source.incomingOriginalPrompt : "",
    };
  }

  function normalizeStoredConfig(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const presets = normalizePresets(source.presets, source);
    const chats = {};
    if (source.chats && typeof source.chats === "object" && !Array.isArray(source.chats)) {
      for (const [chatId, scope] of Object.entries(source.chats)) {
        if (chatId) chats[chatId] = normalizeScope(scope);
      }
    }
    return {
      schemaVersion: 1,
      presetV2Updated: source.presetV2Updated === true,
      keepLegacyPresets: source.presetV2Updated === true && source.keepLegacyPresets === true,
      presets,
      defaultConnectionId:
        typeof source.defaultConnectionId === "string" ? source.defaultConnectionId.trim() : "",
      defaults: normalizeScope(source.defaults),
      chats,
    };
  }

  function currentScope(config = storedConfig, chatId = activeChatId) {
    if (!config) return { ...DEFAULT_SCOPE };
    return { ...(chatId && config.chats[chatId] ? config.chats[chatId] : config.defaults) };
  }

  function parseGlossary(raw) {
    const pairs = [];
    for (const line of raw.split(/\r?\n/u)) {
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const left = line.slice(0, separator).trim();
      const right = line.slice(separator + 1).trim();
      if (left && right) pairs.push({ left, right });
    }
    return pairs;
  }

  function glossarySection(raw, sourceText, targetLanguage) {
    const pairs = parseGlossary(raw);
    if (!pairs.length) return "";
    const exact = [];
    const bidirectional = [];
    for (const pair of pairs) {
      const hasLeft = sourceText.includes(pair.left);
      const hasRight = sourceText.includes(pair.right);
      if (hasLeft && !hasRight) exact.push(`"${pair.left}" → "${pair.right}"`);
      else if (hasRight && !hasLeft) exact.push(`"${pair.right}" → "${pair.left}"`);
      else bidirectional.push(`"${pair.left}" ↔ "${pair.right}"`);
    }
    return MARINARA_TRANSLATION_REFERENCE_RENDERERS.glossary(targetLanguage, exact, bidirectional);
  }

  function freeContextSection(raw) {
    const context = raw.trim();
    if (!context) return "";
    const escaped = escapeContextValue(context).slice(0, FREE_CONTEXT_MAX);
    return MARINARA_TRANSLATION_REFERENCE_RENDERERS.freeContext(escaped);
  }

  function buildSystemPrompt(body, hasContext = false) {
    const scope = currentScope();
    const existing = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
    const base = existing || BASE_PROMPT;
    const glossary = glossarySection(scope.glossary, body.text, body.targetLanguage);
    let prompt = glossary ? `${base}\n\n${glossary}` : base;
    const protectedSections = [];
    const freeContext = freeContextSection(scope.freeContextEnabled ? scope.freeContext : "");
    if (freeContext) protectedSections.push(freeContext);
    if (hasContext) protectedSections.push(CONTEXT_SYSTEM_INSTRUCTIONS);
    if (protectedSections.length) {
      const separator = "\n\n";
      const protectedSuffix = protectedSections.join(separator);
      const available = SYSTEM_PROMPT_MAX - separator.length - protectedSuffix.length;
      prompt = `${prompt.slice(0, Math.max(0, available)).trimEnd()}${separator}${protectedSuffix}`;
    }
    if (prompt.length > SYSTEM_PROMPT_MAX) {
      marinara.log.warn(
        `${EXTENSION_LABEL}: 시스템 프롬프트가 ${SYSTEM_PROMPT_MAX}자를 넘어 뒤쪽을 잘랐습니다.`,
      );
      prompt = prompt.slice(0, SYSTEM_PROMPT_MAX);
    }
    return prompt;
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (typeof URL !== "undefined" && input instanceof URL) return input.href;
    if (typeof Request !== "undefined" && input instanceof Request) return input.url;
    return "";
  }

  function requestMethod(input, init) {
    if (init?.method) return String(init.method).toUpperCase();
    if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
    return "GET";
  }

  function requestPathname(input) {
    try {
      return new URL(requestUrl(input), window.location.href).pathname.replace(/\/+$/u, "");
    } catch {
      return "";
    }
  }

  function requestHeaders(input, init) {
    if (init?.headers) return new Headers(init.headers);
    if (typeof Request !== "undefined" && input instanceof Request) return new Headers(input.headers);
    return new Headers();
  }

  function parseMessageExtra(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    if (typeof value !== "string" || !value.trim()) return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function escapeContextValue(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function formatContextMessage(message, scope) {
    const content = typeof message?.content === "string" ? message.content : "";
    const extra = parseMessageExtra(message?.extra);
    const storedTranslation = typeof extra.translation === "string" ? extra.translation : "";
    const translationSource = typeof extra.translationSource === "string" ? extra.translationSource : "";
    const translation = storedTranslation && (!translationSource || translationSource === content)
      ? storedTranslation
      : "";
    const parts = [];
    if (scope.contextIncludeOriginal && content) {
      parts.push(`<original>${escapeContextValue(content)}</original>`);
    }
    if (scope.contextIncludeTranslation && translation) {
      parts.push(`<translation>${escapeContextValue(translation)}</translation>`);
    }
    if (!parts.length) return "";
    return `<message role="${message.role}">\n${parts.join("\n")}\n</message>`;
  }

  function messagesUrl(input, chatId) {
    const url = new URL(requestUrl(input), window.location.href);
    url.pathname = url.pathname.replace(
      /\/api\/translate\/?$/u,
      `/api/chats/${encodeURIComponent(chatId)}/messages`,
    );
    url.search = "";
    url.hash = "";
    return url.href;
  }

  function configuredPrompt(scope, direction) {
    const presetId = direction === "incoming" ? scope.incomingPresetId : scope.outgoingPresetId;
    const preset = storedConfig?.presets.find((candidate) => candidate.id === presetId);
    const original = direction === "incoming" ? scope.incomingOriginalPrompt : scope.outgoingOriginalPrompt;
    const base = preset?.replace ? preset.prompt : original;
    return direction === "incoming"
      ? composeIncomingPrompt(base, scope.incomingVoiceEnabled, scope.incomingVoicePrompt).trim()
      : base.trim();
  }

  function isIncomingTranslation(body, scope) {
    const requestPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
    const incomingPrompt = configuredPrompt(scope, "incoming");
    const outgoingPrompt = configuredPrompt(scope, "outgoing");
    if (requestPrompt && requestPrompt === incomingPrompt && requestPrompt !== outgoingPrompt) return true;
    if (requestPrompt && requestPrompt === outgoingPrompt && requestPrompt !== incomingPrompt) return false;
    const target = typeof body.targetLanguage === "string" ? body.targetLanguage.trim().toLowerCase() : "";
    return target === "korean" || target === "ko" || target === "ko-kr" || target === "한국어";
  }

  async function buildContextualText(input, init, body, scope) {
    if (
      !scope.contextEnabled ||
      (!scope.contextIncludeOriginal && !scope.contextIncludeTranslation) ||
      !activeChatId
    ) {
      return { text: body.text, hasContext: false };
    }
    if (!isIncomingTranslation(body, scope) && !scope.contextIncludeUserInput) {
      return { text: body.text, hasContext: false };
    }
    try {
      const response = await originalFetch.call(window, messagesUrl(input, activeChatId), {
        method: "GET",
        headers: requestHeaders(input, init),
      });
      if (!response.ok) throw new Error(`상태 코드 ${response.status}`);
      const payload = await response.json();
      const messages = Array.isArray(payload) ? payload : Array.isArray(payload?.messages) ? payload.messages : [];
      const eligible = messages.filter(
        (message) =>
          (message?.role === "user" || message?.role === "assistant") &&
          typeof message.content === "string",
      );
      let targetIndex = -1;
      for (let index = eligible.length - 1; index >= 0; index -= 1) {
        if (eligible[index].content === body.text) {
          targetIndex = index;
          break;
        }
      }
      const previous = (targetIndex >= 0 ? eligible.slice(0, targetIndex) : eligible)
        .slice(-scope.contextMessageCount);
      const prefix = "[Previous Context — Reference Only]\n\n";
      const suffix = `\n\n[Text to Translate]\n${body.text}`;
      let remaining = TRANSLATION_TEXT_MAX - prefix.length - suffix.length;
      const formatted = [];
      for (let index = previous.length - 1; index >= 0; index -= 1) {
        const block = formatContextMessage(previous[index], scope);
        if (!block) continue;
        const cost = block.length + (formatted.length ? 2 : 0);
        if (cost > remaining) continue;
        formatted.unshift(block);
        remaining -= cost;
      }
      if (!formatted.length) return { text: body.text, hasContext: false };
      return { text: `${prefix}${formatted.join("\n\n")}${suffix}`, hasContext: true };
    } catch (error) {
      marinara.log.warn(`${EXTENSION_LABEL}: 이전 대화 Context를 불러오지 못해 기존 방식으로 번역합니다.`, error);
      return { text: body.text, hasContext: false };
    }
  }

  async function createChatWithTranslationDefaults(input, init) {
    const response = await originalFetch.call(window, input, init);
    if (!response.ok) return response;
    try {
      const chat = await response.clone().json();
      const chatId = typeof chat?.id === "string" ? chat.id.trim() : "";
      if (!chatId) return response;

      const createUrl = new URL(requestUrl(input), window.location.href);
      createUrl.pathname = `${createUrl.pathname.replace(/\/+$/u, "")}/${encodeURIComponent(chatId)}/metadata`;
      createUrl.search = "";
      createUrl.hash = "";
      const headers = requestHeaders(input, init);
      headers.set("content-type", "application/json");
      const defaultConnectionId = storedConfig?.defaultConnectionId ?? "";
      const metadata = {
        translationProvider: "ai",
        ...(defaultConnectionId ? { translationConnectionId: defaultConnectionId } : {}),
      };
      const patched = await originalFetch.call(window, createUrl.href, {
        method: "PATCH",
        headers,
        body: JSON.stringify(metadata),
      });
      if (patched.ok) return patched;
      marinara.log.warn(
        `${EXTENSION_LABEL}: 새 채팅에 기본 번역 Connection을 적용하지 못했습니다. 상태 코드 ${patched.status}`,
      );
      return response;
    } catch (error) {
      marinara.log.warn(`${EXTENSION_LABEL}: 새 채팅의 번역 기본값을 적용하지 못했습니다.`, error);
      return response;
    }
  }

  async function routedFetch(input, init) {
    const method = requestMethod(input, init);
    const pathname = requestPathname(input);
    if (method === "POST" && pathname.endsWith("/api/chats")) {
      return createChatWithTranslationDefaults(input, init);
    }
    if (!pathname.endsWith("/api/translate") || method !== "POST") {
      return originalFetch.call(window, input, init);
    }
    try {
      const fromInit = init && Object.prototype.hasOwnProperty.call(init, "body");
      const rawBody = fromInit
        ? typeof init.body === "string"
          ? init.body
          : null
        : typeof Request !== "undefined" && input instanceof Request
          ? await input.clone().text()
          : null;
      if (!rawBody) return originalFetch.call(window, input, init);
      const body = JSON.parse(rawBody);
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        typeof body.text !== "string" ||
        typeof body.targetLanguage !== "string"
      ) {
        return originalFetch.call(window, input, init);
      }
      const currentConnectionId = typeof body.connectionId === "string" ? body.connectionId.trim() : "";
      if (!storedConfig?.defaultConnectionId && currentConnectionId) {
        void rememberDefaultConnection(currentConnectionId);
      }
      const scope = currentScope();
      const contextual = await buildContextualText(input, init, body, scope);
      const rewrittenBody = JSON.stringify({
        ...body,
        text: contextual.text,
        provider: "ai",
        connectionId: currentConnectionId || undefined,
        systemPrompt: buildSystemPrompt(body, contextual.hasContext),
      });
      if (fromInit) return originalFetch.call(window, input, { ...init, body: rewrittenBody });
      return originalFetch.call(window, new Request(input, { ...init, body: rewrittenBody }));
    } catch (error) {
      marinara.log.warn(`${EXTENSION_LABEL}: 번역 요청을 수정하지 못해 원래 요청을 사용합니다.`, error);
      return originalFetch.call(window, input, init);
    }
  }

  function queueConfigWrite(buildNextConfig, refreshForms) {
    const operation = configWriteQueue.catch(() => undefined).then(async () => {
      const current = normalizeStoredConfig(storedConfig);
      const normalized = normalizeStoredConfig(buildNextConfig(current));
      const saved = await marinara.storage.patch({ config: normalized });
      storedConfig = normalizeStoredConfig(saved?.config ?? normalized);
      if (refreshForms) populateAllForms();
      return storedConfig;
    });
    configWriteQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async function saveConfig(nextConfig) {
    await queueConfigWrite((current) => {
      let next = normalizeStoredConfig(nextConfig);
      if (current.presetV2Updated) next = upgradePresetConfig(next, current.keepLegacyPresets);
      if (!next.defaultConnectionId) next.defaultConnectionId = current.defaultConnectionId;
      return next;
    }, true);
  }

  function rememberDefaultConnection(connectionId) {
    const value = typeof connectionId === "string" ? connectionId.trim() : "";
    if (!value || storedConfig?.defaultConnectionId === value) return Promise.resolve(storedConfig);
    return queueConfigWrite(
      (current) => ({ ...current, defaultConnectionId: value }),
      false,
    ).catch((error) => {
      marinara.log.warn(`${EXTENSION_LABEL}: 기본 번역 Connection을 저장하지 못했습니다.`, error);
      return storedConfig;
    });
  }

  function setStatus(form, message, kind = "info") {
    const status = form.querySelector("[data-tpg-status]");
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function syncUpgradeControls(form) {
    const upgraded = storedConfig?.presetV2Updated === true;
    const choosing = form._choosingUpgrade === true;
    form.querySelector('[data-tpg-upgrade]').hidden = upgraded || choosing;
    form.querySelector('[data-tpg-remove-legacy]').hidden = !upgraded || !storedConfig.keepLegacyPresets;
    form.querySelector('[data-tpg-upgrade-choice]').hidden = !choosing;
    for (const selector of ['[data-tpg-upgrade]', '[data-tpg-remove-legacy]']) {
      form.querySelector(selector).disabled = !!form._upgrading || !!form._creatingPresetId || !!form._editingPresetId;
    }
  }

  function upgradePresetConfig(config, keepLegacy) {
    const next = normalizeStoredConfig(config);
    if (next.presetV2Updated && !next.keepLegacyPresets) keepLegacy = false;
    next.presetV2Updated = true;
    next.keepLegacyPresets = keepLegacy;
    const remap = new Map();
    for (const preset of V2_PRESETS) {
      const custom = next.presets.find((p) => p.id === preset.sourceId);
      if (custom?.name === preset.name && custom.prompt === preset.prompt) remap.set(custom.id, preset.id);
      if (!keepLegacy) remap.set(preset.legacyId, preset.id);
    }
    for (const scope of [next.defaults, ...Object.values(next.chats)]) {
      for (const key of ['outgoingPresetId', 'incomingPresetId']) scope[key] = remap.get(scope[key]) || scope[key];
    }
    return normalizeStoredConfig(next);
  }

  async function updatePresetCatalog(form, keepLegacy) {
    if (form._upgrading) return;
    form._upgrading = true;
    form._choosingUpgrade = false;
    syncUpgradeControls(form);
    try {
      await queueConfigWrite((current) => upgradePresetConfig(current, keepLegacy), false);
      for (const target of forms) {
        if (!target.isConnected) continue;
        target._choosingUpgrade = false;
        const selected = {};
        for (const key of ['outgoingPresetId', 'incomingPresetId']) {
          const id = target.elements.namedItem(key).value;
          const replacement = V2_PRESETS.find((p) => (!storedConfig.keepLegacyPresets && p.legacyId === id) ||
            (p.sourceId === id && !storedConfig.presets.some((item) => item.id === id)));
          selected[key] = replacement?.id || id;
        }
        target._presets = normalizePresets(target._presets);
        populatePresetSelects(target, target.elements.namedItem('managePresetId').value, selected);
        syncUpgradeControls(target);
      }
      setStatus(form, '프리셋 목록을 업데이트했습니다.', 'success');
    } catch (error) {
      setStatus(form, error instanceof Error ? error.message : '업데이트하지 못했습니다.', 'error');
    } finally {
      form._upgrading = false;
      syncUpgradeControls(form);
    }
  }

  function syncPresetEditor(form) {
    syncUpgradeControls(form);
    const presetSelect = form.elements.namedItem("managePresetId");
    const nameInput = form.elements.namedItem("presetName");
    const promptInput = form.elements.namedItem("presetPrompt");
    const deleteButton = form.querySelector("[data-tpg-delete]");
    const addButton = form.querySelector("[data-tpg-add]");
    const cancelButton = form.querySelector("[data-tpg-cancel]");
    const editor = form.querySelector("[data-tpg-preset-editor]");
    const preset = form._presets.find((candidate) => candidate.id === presetSelect.value) ?? form._presets[0];
    if (!preset) return;
    presetSelect.value = preset.id;
    const creating = form._creatingPresetId === preset.id;
    const editing = form._editingPresetId === preset.id;
    const editorOpen = creating || editing;
    editor.hidden = !editorOpen;
    presetSelect.disabled = editorOpen;
    addButton.disabled = editorOpen;
    deleteButton.disabled = preset.builtin || creating;
    cancelButton.hidden = !editorOpen;
    if (editorOpen) {
      nameInput.value = preset.name;
      promptInput.value = preset.prompt;
    } else {
      nameInput.value = "";
      promptInput.value = "";
    }
    cancelButton.textContent = creating ? "생성 취소" : "수정 취소";
  }

  function presetOptions(presets) {
    return presets.map((preset) => {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = preset.builtin ? preset.name : `사용자 정의 · ${preset.name}`;
        return option;
      });
  }

  function populatePresetSelects(form, managedId = "builtin-inherit", selectedIds = null) {
    for (const name of ["outgoingPresetId", "incomingPresetId"]) {
      const select = form.elements.namedItem(name);
      const previous = selectedIds?.[name] ?? select.value;
      select.replaceChildren(...presetOptions(form._presets));
      select.value = form._presets.some((preset) => preset.id === previous) ? previous : "builtin-inherit";
    }
    const select = form.elements.namedItem("managePresetId");
    select.replaceChildren(...presetOptions(form._presets));
    select.value = form._presets.some((preset) => preset.id === managedId) ? managedId : "builtin-inherit";
    syncPresetEditor(form);
  }

  function nativePromptTextareas(form) {
    const panel = form.closest(`[${PANEL_ATTRIBUTE}]`);
    const content = panel?.parentElement;
    if (!content) return [];
    return Array.from(content.querySelectorAll("textarea")).filter(
      (textarea) => !textarea.closest(`[${PANEL_ATTRIBUTE}]`),
    );
  }

  function setNativeTextareaValue(textarea, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(textarea, value);
    else textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setNativeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setNativeSelectValue(select, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(select, value);
    else select.value = value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function stripIncomingVoiceInstruction(prompt) {
    let result = typeof prompt === "string" ? prompt : "";
    while (true) {
      const start = result.indexOf(LEGACY_VOICE_INSTRUCTION_START);
      if (start < 0) break;
      const end = result.indexOf(
        LEGACY_VOICE_INSTRUCTION_END,
        start + LEGACY_VOICE_INSTRUCTION_START.length,
      );
      if (end < 0) {
        result = result.slice(0, start);
        break;
      }
      const before = result.slice(0, start).trimEnd();
      const after = result.slice(end + LEGACY_VOICE_INSTRUCTION_END.length).trimStart();
      result = before && after ? `${before}\n\n${after}` : before || after;
    }
    return result.trim();
  }

  function composeIncomingPrompt(basePrompt, enabled, voicePrompt) {
    const base = stripIncomingVoiceInstruction(basePrompt);
    const instruction = typeof voicePrompt === "string" ? voicePrompt.trim() : "";
    if (!enabled || !instruction) return base;
    const section = MARINARA_TRANSLATION_REFERENCE_RENDERERS.characterVoice(instruction);
    return base ? `${base}\n\n${section}` : section;
  }

  function syncIncomingVoiceVisibility(form) {
    const enabled = form.elements.namedItem("incomingVoiceEnabled").checked;
    form.querySelector("[data-tpg-incoming-voice]").hidden = !enabled;
  }

  function syncFreeContextVisibility(form) {
    const enabled = form.elements.namedItem("freeContextEnabled").checked;
    form.querySelector("[data-tpg-free-context]").hidden = !enabled;
  }

  function syncContextVisibility(form) {
    const enabled = form.elements.namedItem("contextEnabled").checked;
    form.querySelector("[data-tpg-context-options]").hidden = !enabled;
  }

  function syncIncomingVoiceToNative(form, showError = false) {
    const enabled = form.elements.namedItem("incomingVoiceEnabled").checked;
    const voicePrompt = form.elements.namedItem("incomingVoicePrompt").value;
    if (enabled && !voicePrompt.trim()) {
      if (showError) setStatus(form, "캐릭터 말투 지침을 입력하세요.", "error");
      return false;
    }
    const incoming = nativePromptTextareas(form)[1];
    if (!incoming) {
      if (showError) setStatus(form, "번역 공급자를 AI로 선택한 뒤 저장하세요.", "error");
      return false;
    }
    const selectedId = form.elements.namedItem("incomingPresetId").value;
    const selectedPreset = form._presets.find((preset) => preset.id === selectedId);
    if (!form._originalPrompts.incoming) {
      form._originalPrompts.incoming = stripIncomingVoiceInstruction(incoming.value);
    }
    const basePrompt = selectedPreset?.replace
      ? selectedPreset.prompt
      : form._originalPrompts.incoming || stripIncomingVoiceInstruction(incoming.value);
    const nextPrompt = composeIncomingPrompt(basePrompt, enabled, voicePrompt);
    if (nextPrompt.length > SYSTEM_PROMPT_MAX) {
      if (showError) {
        setStatus(form, `Incoming 프롬프트와 말투 지침의 합계는 ${SYSTEM_PROMPT_MAX}자 이하여야 합니다.`, "error");
      }
      return false;
    }
    if (incoming.value !== nextPrompt) setNativeTextareaValue(incoming, nextPrompt);
    return true;
  }

  function applyTranslationDefaults(content) {
    const nativeSelects = Array.from(content.querySelectorAll("select")).filter(
      (select) => !select.closest(`[${PANEL_ATTRIBUTE}]`),
    );
    const providerSelect = nativeSelects.find((select) => {
      const values = new Set(Array.from(select.options, (option) => option.value));
      return ["google", "deepl", "deeplx", "ai"].every((value) => values.has(value));
    });
    if (providerSelect) {
      if (providerSelect.value !== "ai") setNativeSelectValue(providerSelect, "ai");
      providerSelect.disabled = true;
      providerSelect.dataset.tpgProviderLocked = "true";
      providerSelect.setAttribute("aria-label", "Provider, AI로 고정됨");
    }

    const connectionSelect = nativeSelects.find((select) => select !== providerSelect);
    if (connectionSelect) {
      if (!connectionSelect.dataset.tpgDefaultConnectionListener) {
        connectionSelect.dataset.tpgDefaultConnectionListener = "true";
        const listener = () => {
          if (connectionSelect.value) void rememberDefaultConnection(connectionSelect.value);
        };
        connectionSelect._tpgDefaultConnectionListener = listener;
        connectionSelect.addEventListener("change", listener);
      }
      const defaultConnectionId = storedConfig?.defaultConnectionId ?? "";
      if (!defaultConnectionId && connectionSelect.value) {
        void rememberDefaultConnection(connectionSelect.value);
      }
    }

    const nativeInputs = Array.from(content.querySelectorAll('input[type="text"]')).filter(
      (input) => !input.closest(`[${PANEL_ATTRIBUTE}]`),
    );
    const myLanguageInput = nativeInputs[1];
    if (!myLanguageInput) return;
    const koreanValue = "Korean";
    if (myLanguageInput.value !== koreanValue) setNativeInputValue(myLanguageInput, koreanValue);
  }

  function applyPreset(form, direction, showStatus = true) {
    const selectName = direction === "outgoing" ? "outgoingPresetId" : "incomingPresetId";
    const id = form.elements.namedItem(selectName).value;
    const preset = form._presets.find((candidate) => candidate.id === id);
    if (!preset) {
      setStatus(form, "적용할 프리셋을 찾지 못했습니다.", "error");
      return false;
    }
    const textareas = nativePromptTextareas(form);
    const target = direction === "outgoing" ? textareas[0] : textareas[1];
    if (!target) {
      setStatus(form, "번역 공급자를 AI로 선택한 뒤 다시 선택하세요.", "error");
      return false;
    }
    if (!form._originalPrompts[direction]) {
      form._originalPrompts[direction] =
        direction === "incoming" ? stripIncomingVoiceInstruction(target.value) : target.value;
    }
    const basePrompt = preset.replace ? preset.prompt : form._originalPrompts[direction];
    const nextPrompt = direction === "incoming"
      ? composeIncomingPrompt(
          basePrompt,
          form.elements.namedItem("incomingVoiceEnabled").checked,
          form.elements.namedItem("incomingVoicePrompt").value,
        )
      : basePrompt;
    if (nextPrompt.length > SYSTEM_PROMPT_MAX) {
      setStatus(form, `프롬프트 합계는 ${SYSTEM_PROMPT_MAX}자 이하여야 합니다.`, "error");
      return false;
    }
    setNativeTextareaValue(target, nextPrompt);
    form._appliedPresetIds[direction] = id;
    const label = direction === "outgoing" ? "Outgoing Message Prompt" : "Incoming Response Prompt";
    if (showStatus) setStatus(form, `${label}에 표시했습니다. 저장하면 적용됩니다.`, "success");
    return true;
  }

  function populateForm(form) {
    if (!storedConfig) return;
    const scope = currentScope();
    form._creatingPresetId = null;
    form._editingPresetId = null;
    form._editSnapshot = null;
    form._presets = storedConfig.presets.map((preset) => ({ ...preset }));
    form.elements.namedItem("glossary").value = scope.glossary;
    form.elements.namedItem("freeContextEnabled").checked = scope.freeContextEnabled;
    form.elements.namedItem("freeContext").value = scope.freeContext;
    form.elements.namedItem("incomingVoiceEnabled").checked = scope.incomingVoiceEnabled;
    form.elements.namedItem("incomingVoicePrompt").value = scope.incomingVoicePrompt;
    form.elements.namedItem("contextEnabled").checked = scope.contextEnabled;
    form.elements.namedItem("contextIncludeOriginal").checked = scope.contextIncludeOriginal;
    form.elements.namedItem("contextIncludeTranslation").checked = scope.contextIncludeTranslation;
    form.elements.namedItem("contextIncludeUserInput").checked = scope.contextIncludeUserInput;
    form.elements.namedItem("contextMessageCount").value = String(scope.contextMessageCount);
    form._originalPrompts = {
      outgoing: scope.outgoingOriginalPrompt,
      incoming: scope.incomingOriginalPrompt,
    };
    form._appliedPresetIds = {
      outgoing: scope.outgoingPresetId,
      incoming: scope.incomingPresetId,
    };
    syncIncomingVoiceVisibility(form);
    syncFreeContextVisibility(form);
    syncContextVisibility(form);
    populatePresetSelects(form, "builtin-inherit", {
      outgoingPresetId: scope.outgoingPresetId,
      incomingPresetId: scope.incomingPresetId,
    });
  }

  function populateAllForms() {
    for (const form of forms) {
      if (form.isConnected) {
        populateForm(form);
        if (form.elements.namedItem("outgoingPresetId").value !== "builtin-inherit") {
          applyPreset(form, "outgoing", false);
        }
        if (
          form.elements.namedItem("incomingPresetId").value !== "builtin-inherit" ||
          form.elements.namedItem("incomingVoiceEnabled").checked
        ) {
          syncIncomingVoiceToNative(form);
        }
      } else forms.delete(form);
    }
  }

  async function deleteUserPreset(form) {
    if (presetDeletionPending || form.querySelector(".tpg-save").disabled) return;
    const id = form.elements.namedItem("managePresetId").value;
    const preset = form._presets.find((candidate) => candidate.id === id);
    if (!preset || preset.builtin) return;
    if (!window.confirm(`"${preset.name}" 프리셋을 삭제하시겠습니까?`)) return;
    presetDeletionPending = true;
    form.querySelector("[data-tpg-delete]").disabled = true;
    setStatus(form, "프리셋을 삭제하고 있습니다.");
    try {
      await queueConfigWrite((current) => ({
        ...current,
        presets: current.presets.filter((candidate) => candidate.id !== id),
      }), false);
      for (const target of forms) {
        if (!target.isConnected) continue;
        target._presets = target._presets.filter((candidate) => candidate.id !== id);
        if (target._creatingPresetId === id) target._creatingPresetId = null;
        if (target._editingPresetId === id) {
          target._editingPresetId = null;
          target._editSnapshot = null;
        }
        populatePresetSelects(target, target.elements.namedItem("managePresetId").value);
      }
      setStatus(form, "삭제했습니다.", "success");
    } catch (error) {
      setStatus(form, error instanceof Error ? error.message : "프리셋을 삭제하지 못했습니다.", "error");
    } finally {
      presetDeletionPending = false;
      syncPresetEditor(form);
    }
  }

  function createForm() {
    const form = document.createElement("form");
    form.className = "tpg-form";
    form.innerHTML = `
      <label class="tpg-field">Outgoing Message Prompt
        <select name="outgoingPresetId" aria-label="Outgoing Message Prompt 프리셋"></select>
      </label>
      <label class="tpg-field">Incoming Response Prompt
        <select name="incomingPresetId" aria-label="Incoming Response Prompt 프리셋"></select>
      </label>
      <label class="tpg-toggle-row">
        <strong>대사 지침 추가</strong>
        <input type="checkbox" name="incomingVoiceEnabled" aria-label="Incoming 대사 지침 추가">
      </label>
      <div class="tpg-incoming-voice" data-tpg-incoming-voice hidden>
        <textarea class="tpg-standalone-textarea" name="incomingVoicePrompt" rows="3" maxlength="2500" spellcheck="false" aria-label="대사 지침" placeholder="예: 인물별 존비어, 호칭, 어미와 말버릇을 일관되게 유지한다."></textarea>
        <p class="tpg-help">Incoming Response Prompt에만 추가됩니다.</p>
      </div>
      <label class="tpg-toggle-row">
        <strong>기타 지침 추가</strong>
        <input type="checkbox" name="freeContextEnabled" aria-label="기타 지침 추가">
      </label>
      <div class="tpg-free-context" data-tpg-free-context hidden>
        <textarea class="tpg-standalone-textarea" name="freeContext" rows="2" maxlength="1000" spellcheck="false" aria-label="기타 번역 지침" placeholder="현대 한국 배경의 범죄 스릴러 / 중세 유럽풍 판타지 / 현대 일본 배경의 학원물"></textarea>
        <p class="tpg-help">장르·시대·지역·배경에 맞는 어휘와 용어를 선택하기 위한 참고 정보로만 전달합니다.</p>
      </div>
      <h5 class="tpg-section-title">단어장</h5>
      <textarea class="tpg-standalone-textarea" name="glossary" rows="3" spellcheck="false" aria-label="단어장" placeholder="마리나라 = Marinara&#10;로어북 = lorebook&#10;누들 = Noodle"></textarea>
      <p class="tpg-help">한 줄에 한 쌍을 입력하세요. 좌우 순서와 관계없이 양방향으로 적용됩니다.</p>
      <label class="tpg-toggle-row">
        <strong>이전 대화를 번역 Context로 포함</strong>
        <input type="checkbox" name="contextEnabled" aria-label="이전 대화를 번역 Context로 포함">
      </label>
      <div class="tpg-context-options" data-tpg-context-options hidden>
        <div class="tpg-context-toggles">
          <label class="tpg-toggle-row">
            <span>원문 포함</span>
            <input type="checkbox" name="contextIncludeOriginal">
          </label>
          <label class="tpg-toggle-row">
            <span>번역문 포함</span>
            <input type="checkbox" name="contextIncludeTranslation">
          </label>
          <label class="tpg-toggle-row">
            <span>유저 입력 번역에도 포함</span>
            <input type="checkbox" name="contextIncludeUserInput">
          </label>
        </div>
        <label class="tpg-field tpg-context-count">최근 메시지 수
          <input type="number" name="contextMessageCount" min="1" max="10" step="1" inputmode="numeric">
        </label>
        <p class="tpg-help">현재 번역 대상 이전의 user/assistant 메시지를 일관성 참고용으로만 전달합니다.</p>
      </div>
      <h5 class="tpg-section-title">공용 프리셋 관리</h5>
      <select class="tpg-standalone-select" name="managePresetId" aria-label="관리할 프리셋"></select>
      <div class="tpg-preset-editor" data-tpg-preset-editor hidden>
        <label class="tpg-field">프리셋 이름
          <input name="presetName" maxlength="80" autocomplete="off">
        </label>
        <label class="tpg-field">프롬프트 전문
          <textarea name="presetPrompt" rows="7" spellcheck="false" placeholder="{{targetLanguage}}를 사용해 대상 언어를 넣을 수 있습니다."></textarea>
        </label>
      </div>
      <div class="tpg-actions">
        <div class="tpg-actions-left">
          <button type="button" data-tpg-add>새 프리셋</button>
          <button type="button" data-tpg-delete>삭제</button>
          <button type="button" class="tpg-cancel" data-tpg-cancel hidden>편집 취소</button>
          <button type="button" data-tpg-upgrade>프리셋 업데이트</button>
          <button type="button" data-tpg-remove-legacy hidden>기존 버전 삭제</button>
          <span class="tpg-upgrade-choice" data-tpg-upgrade-choice hidden>
            <span class="tpg-help">기존 버전을 유지하시겠습니까?</span>
            <button type="button" data-tpg-keep>예</button>
            <button type="button" data-tpg-replace>아니요</button>
            <button type="button" data-tpg-dismiss>취소</button>
          </span>
        </div>
        <button type="submit" class="tpg-save">저장</button>
      </div>
      <span class="tpg-status" data-tpg-status role="status" aria-live="polite"></span>
      `;
    form._presets = normalizePresets(storedConfig?.presets);
    form._creatingPresetId = null;
    form._editingPresetId = null;
    form._editSnapshot = null;
    form._originalPrompts = { outgoing: "", incoming: "" };
    form._appliedPresetIds = { outgoing: "builtin-inherit", incoming: "builtin-inherit" };
    form._choosingUpgrade = false;
    forms.add(form);
    form.querySelector('[data-tpg-upgrade]').addEventListener('click', () => {
      form._choosingUpgrade = true;
      syncUpgradeControls(form);
    });
    form.querySelector('[data-tpg-dismiss]').addEventListener('click', () => {
      form._choosingUpgrade = false;
      syncUpgradeControls(form);
    });
    form.querySelector('[data-tpg-keep]').addEventListener('click', () => void updatePresetCatalog(form, true));
    form.querySelector('[data-tpg-replace]').addEventListener('click', () => void updatePresetCatalog(form, false));
    form.querySelector('[data-tpg-remove-legacy]').addEventListener('click', () => {
      if (!window.confirm("기존 기본 프리셋 4개를 삭제하시겠습니까?")) return;
      void updatePresetCatalog(form, false);
    });

    form.elements.namedItem("managePresetId").addEventListener("change", () => {
      const id = form.elements.namedItem("managePresetId").value;
      const preset = form._presets.find((candidate) => candidate.id === id);
      form._creatingPresetId = null;
      form._editingPresetId = preset && !preset.builtin ? preset.id : null;
      form._editSnapshot = preset && !preset.builtin ? { ...preset } : null;
      syncPresetEditor(form);
      if (form._editingPresetId) form.elements.namedItem("presetName").focus();
    });
    form.elements.namedItem("incomingVoiceEnabled").addEventListener("change", () => {
      syncIncomingVoiceVisibility(form);
      if (form.elements.namedItem("incomingVoiceEnabled").checked) {
        form.elements.namedItem("incomingVoicePrompt").focus();
      }
    });
    form.elements.namedItem("freeContextEnabled").addEventListener("change", () => {
      syncFreeContextVisibility(form);
      if (form.elements.namedItem("freeContextEnabled").checked) {
        form.elements.namedItem("freeContext").focus();
      }
    });
    form.elements.namedItem("contextEnabled").addEventListener("change", () => {
      syncContextVisibility(form);
    });
    for (const name of ["outgoingPresetId", "incomingPresetId"]) {
      form.elements.namedItem(name).addEventListener("change", () => {
        applyPreset(form, name === "outgoingPresetId" ? "outgoing" : "incoming");
      });
    }
    form.elements.namedItem("presetName").addEventListener("input", (event) => {
      const preset = form._presets.find(
        (candidate) => candidate.id === form.elements.namedItem("managePresetId").value,
      );
      if (preset && !preset.builtin) preset.name = event.currentTarget.value;
    });
    form.elements.namedItem("presetPrompt").addEventListener("input", (event) => {
      const preset = form._presets.find(
        (candidate) => candidate.id === form.elements.namedItem("managePresetId").value,
      );
      if (preset && !preset.builtin) preset.prompt = event.currentTarget.value;
    });
    form.querySelector("[data-tpg-add]").addEventListener("click", () => {
      const preset = {
        id: newPresetId(),
        name: `새 번역 프리셋 ${form._presets.filter((item) => !item.builtin).length + 1}`,
        prompt: LITERARY_ROLEPLAY_PROMPT,
        replace: true,
        builtin: false,
      };
      form._presets.push(preset);
      form._creatingPresetId = preset.id;
      form._editingPresetId = null;
      form._editSnapshot = null;
      populatePresetSelects(form, preset.id);
      form.elements.namedItem("presetName").focus();
      form.elements.namedItem("presetName").select();
    });
    form.querySelector("[data-tpg-cancel]").addEventListener("click", () => {
      const creatingId = form._creatingPresetId;
      const editingId = form._editingPresetId;
      if (creatingId) form._presets = form._presets.filter((candidate) => candidate.id !== creatingId);
      if (editingId && form._editSnapshot) {
        form._presets = form._presets.map((candidate) =>
          candidate.id === editingId ? { ...form._editSnapshot } : candidate,
        );
      }
      form._creatingPresetId = null;
      form._editingPresetId = null;
      form._editSnapshot = null;
      populatePresetSelects(form);
      setStatus(form, "");
    });
    form.querySelector("[data-tpg-delete]").addEventListener("click", () => {
      void deleteUserPreset(form);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (presetDeletionPending) {
        setStatus(form, "프리셋 삭제가 완료된 뒤 저장하세요.");
        return;
      }
      const invalidPreset = form._presets.find(
        (preset) => !preset.builtin && (!preset.name.trim() || !preset.prompt.trim()),
      );
      if (invalidPreset) {
        setStatus(form, "모든 사용자 정의 프리셋의 이름과 프롬프트를 입력하세요.", "error");
        return;
      }
      const voiceEnabled = form.elements.namedItem("incomingVoiceEnabled").checked;
      if (!syncIncomingVoiceToNative(form, voiceEnabled) && voiceEnabled) return;
      if (!applyPreset(form, "outgoing", false) || !applyPreset(form, "incoming", false)) return;
      const button = form.querySelector(".tpg-save");
      button.disabled = true;
      button.textContent = "저장 중";
      setStatus(form, "설정을 저장하고 있습니다.");
      const next = normalizeStoredConfig(storedConfig);
      next.presets = normalizePresets(form._presets);
      const scope = {
        glossary: form.elements.namedItem("glossary").value,
        freeContextEnabled: form.elements.namedItem("freeContextEnabled").checked,
        freeContext: form.elements.namedItem("freeContext").value,
        incomingVoiceEnabled: voiceEnabled,
        incomingVoicePrompt: form.elements.namedItem("incomingVoicePrompt").value,
        contextEnabled: form.elements.namedItem("contextEnabled").checked,
        contextIncludeOriginal: form.elements.namedItem("contextIncludeOriginal").checked,
        contextIncludeTranslation: form.elements.namedItem("contextIncludeTranslation").checked,
        contextIncludeUserInput: form.elements.namedItem("contextIncludeUserInput").checked,
        contextMessageCount: form.elements.namedItem("contextMessageCount").value,
        outgoingPresetId: form.elements.namedItem("outgoingPresetId").value,
        incomingPresetId: form.elements.namedItem("incomingPresetId").value,
        outgoingOriginalPrompt: form._originalPrompts.outgoing,
        incomingOriginalPrompt: form._originalPrompts.incoming,
      };
      if (activeChatId) next.chats = { ...next.chats, [activeChatId]: scope };
      else next.defaults = scope;
      for (const [chatId, chatScope] of Object.entries(next.chats)) {
        next.chats[chatId] = normalizeScope(chatScope);
      }
      try {
        await saveConfig(next);
        setStatus(form, "저장했습니다.", "success");
      } catch (error) {
        setStatus(form, error instanceof Error ? error.message : "설정을 저장하지 못했습니다.", "error");
      } finally {
        button.disabled = false;
        button.textContent = "저장";
      }
    });

    populateForm(form);
    return form;
  }

  function isTranslationHeader(element) {
    if (!(element instanceof HTMLElement) || element.getAttribute("role") !== "button") return false;
    if (element.getAttribute("aria-expanded") !== "true") return false;
    const label = element.textContent?.trim() ?? "";
    return label === "Translation" || label === "번역";
  }

  function injectPanels() {
    injectQueued = false;
    if (!storedConfig) return;
    for (const header of document.querySelectorAll('div[role="button"][aria-expanded="true"]')) {
      if (!isTranslationHeader(header)) continue;
      const content = header.nextElementSibling;
      if (!content) continue;
      applyTranslationDefaults(content);
      if (content.querySelector(`[${PANEL_ATTRIBUTE}]`)) continue;
      const panel = document.createElement("section");
      panel.setAttribute(PANEL_ATTRIBUTE, "true");
      const form = createForm();
      panel.append(form);
      content.append(panel);
      syncIncomingVoiceToNative(form);
    }
  }

  const style = document.createElement("style");
  style.dataset.translationPresetsGlossary = marinara.extension.id;
  style.textContent = `
    [${PANEL_ATTRIBUTE}] { margin-top: 14px; border-top: 1px solid var(--border); padding-top: 14px; }
    .tpg-form { display: grid; gap: 10px; color: var(--foreground); font-family: inherit; }
    .tpg-section-title { margin: 6px 0 -2px; color: var(--foreground); font-size: .75rem; font-weight: 700; line-height: 1.35; }
    .tpg-preset-editor { display: grid; gap: 10px; border: 1px solid var(--border); border-radius: 9px; background: color-mix(in oklch, var(--secondary) 62%, transparent); padding: 10px; }
    .tpg-preset-editor[hidden] { display: none; }
    .tpg-toggle-row { display: inline-flex; align-items: center; justify-self: start; gap: 7px; padding-block: 1px; cursor: pointer; }
    .tpg-toggle-row strong { color: var(--foreground); font-size: .6875rem; font-weight: 650; }
    .tpg-toggle-row input { width: 15px; height: 15px; flex: none; margin: 0; accent-color: var(--primary); }
    .tpg-toggle-row:focus-within { outline: 2px solid var(--primary); outline-offset: 2px; }
    .tpg-incoming-voice { display: grid; gap: 5px; }
    .tpg-incoming-voice[hidden] { display: none; }
    .tpg-free-context { display: grid; gap: 5px; }
    .tpg-free-context[hidden] { display: none; }
    .tpg-context-options { display: grid; gap: 7px; margin-top: -4px; padding-left: 22px; }
    .tpg-context-options[hidden] { display: none; }
    .tpg-context-toggles { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; }
    .tpg-context-toggles .tpg-toggle-row { font-size: .6875rem; color: var(--muted-foreground); }
    .tpg-context-count { max-width: 130px; }
    .tpg-field { display: grid; gap: 4px; color: var(--muted-foreground); font-size: .6875rem; font-weight: 600; }
    .tpg-field input, .tpg-field select, .tpg-field textarea, .tpg-standalone-textarea, .tpg-standalone-select { width: 100%; box-sizing: border-box; border: 1px solid transparent; border-radius: 8px; outline: none; background: var(--secondary); padding: 8px 10px; color: var(--foreground); font: inherit; font-size: .75rem; font-weight: 400; line-height: 1.45; }
    .tpg-field textarea::placeholder, .tpg-standalone-textarea::placeholder { color: var(--muted-foreground); opacity: .65; }
    .tpg-field textarea { min-height: 76px; resize: vertical; }
    .tpg-standalone-textarea { min-height: 60px; resize: vertical; }
    .tpg-field input:focus, .tpg-field select:focus, .tpg-field textarea:focus, .tpg-standalone-textarea:focus, .tpg-standalone-select:focus { border-color: color-mix(in oklch, var(--primary) 50%, transparent); box-shadow: 0 0 0 2px color-mix(in oklch, var(--primary) 18%, transparent); }
    .tpg-field input[readonly], .tpg-field textarea[readonly] { opacity: .72; cursor: default; }
    .tpg-actions, .tpg-actions-left, .tpg-upgrade-choice { display: flex; align-items: center; gap: 7px; }
    .tpg-actions { justify-content: space-between; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; }
    .tpg-actions [hidden] { display: none; }
    .tpg-actions-left { min-width: max-content; flex: 1 0 auto; flex-wrap: nowrap; }
    .tpg-upgrade-choice { flex: none; white-space: nowrap; }
    .tpg-upgrade-choice .tpg-help { margin: 0; }
    .tpg-actions button, .tpg-cancel, .tpg-save { min-height: 32px; border: 1px solid var(--border); border-radius: 7px; background: var(--secondary); padding: 6px 9px; color: var(--foreground); font: inherit; font-size: .6875rem; font-weight: 650; cursor: pointer; }
    .tpg-actions button { flex: none; white-space: nowrap; }
    .tpg-cancel { justify-self: start; }
    .tpg-cancel[hidden] { display: none; }
    .tpg-actions button:hover:not(:disabled), .tpg-cancel:hover { border-color: color-mix(in oklch, var(--primary) 35%, var(--border)); }
    .tpg-actions button:focus-visible, .tpg-cancel:focus-visible, .tpg-save:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .tpg-actions button:disabled, .tpg-save:disabled { cursor: not-allowed; opacity: .45; }
    .tpg-help { margin: -3px 0 0; color: var(--muted-foreground); font-size: .6875rem; line-height: 1.5; }
    .tpg-status { min-height: 1em; color: var(--muted-foreground); font-size: .6875rem; }
    [data-tpg-status][data-kind="error"] { color: var(--destructive); }
    [data-tpg-status][data-kind="success"] { color: var(--primary); }
    .tpg-save { flex: none; margin-left: auto; border-color: transparent; background: var(--primary); color: var(--primary-foreground); padding-inline: 14px; }
    @media (max-width: 640px) {
      .tpg-actions { align-items: center; }
      .tpg-actions-left button { min-height: 38px; }
      .tpg-save { min-height: 38px; }
    }
  `;
  document.head.append(style);

  window.fetch = routedFetch;
  const observer = new MutationObserver(() => {
    if (injectQueued) return;
    injectQueued = true;
    marinara.setTimeout(injectPanels, 0);
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });

  const chatPoll = marinara.setInterval(() => {
    const nextChatId = readActiveChatId();
    if (nextChatId === activeChatId) return;
    activeChatId = nextChatId;
    populateAllForms();
  }, 250);

  marinara.onCleanup(() => {
    if (window.fetch === routedFetch) window.fetch = originalFetch;
    observer.disconnect();
    marinara.clearInterval(chatPoll);
    document.querySelectorAll('[data-tpg-provider-locked="true"]').forEach((select) => {
      select.disabled = false;
      select.removeAttribute("data-tpg-provider-locked");
      if (select.getAttribute("aria-label") === "Provider, AI로 고정됨") select.removeAttribute("aria-label");
    });
    document.querySelectorAll('[data-tpg-default-connection-listener="true"]').forEach((select) => {
      if (select._tpgDefaultConnectionListener) {
        select.removeEventListener("change", select._tpgDefaultConnectionListener);
        delete select._tpgDefaultConnectionListener;
      }
      select.removeAttribute("data-tpg-default-connection-listener");
    });
    style.remove();
    document.querySelectorAll(`[${PANEL_ATTRIBUTE}]`).forEach((panel) => panel.remove());
    forms.clear();
  });

  void marinara.storage
    .get()
    .then((value) => {
      storedConfig = normalizeStoredConfig(value?.config);
      injectPanels();
    })
    .catch((error) => {
      storedConfig = normalizeStoredConfig(null);
      marinara.log.warn(`${EXTENSION_LABEL}: 저장된 설정을 불러오지 못해 기본값을 사용합니다.`, error);
      injectPanels();
    });
})(marinara);
