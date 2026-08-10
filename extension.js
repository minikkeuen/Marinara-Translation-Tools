((marinara) => {
  "use strict";

  if (!marinara?.extension?.id || !marinara?.storage || typeof marinara.onCleanup !== "function") {
    throw new Error("번역 프리셋·단어장은 Marinara Engine 2.4.x 확장 API가 필요합니다.");
  }

  const EXTENSION_LABEL = "번역 프리셋·단어장";
  const ACTIVE_CHAT_KEY = "marinara-active-chat-id";
  const PANEL_ATTRIBUTE = "data-translation-presets-glossary";
  const SYSTEM_PROMPT_MAX = 5000;
  const BASE_PROMPT =
    "You are a translator. Translate the given text accurately into {{targetLanguage}}, preserving formatting, markdown, and any special characters like *asterisks* for actions. Output ONLY the translated text, nothing else -- no explanations, no extra commentary.";
  const ORIGINAL_ROLEPLAY_PROMPT =
    "You are an expert literary and roleplay translator. Translate the given text naturally into {{targetLanguage}} while faithfully preserving meaning, characterization, emotional nuance, register, honorifics, dialogue voice, narrative rhythm, and the distinction between speech, narration, thoughts, and actions. Preserve formatting, paragraph breaks, markdown, punctuation, and special characters such as *asterisks*. Do not censor, summarize, sanitize, explain, or add content. Output ONLY the translated text.";
  const LITERARY_ROLEPLAY_PROMPT = `You are an expert literary and roleplay translator.

Translate the given text naturally into {{targetLanguage}} while faithfully preserving meaning, characterization, emotional nuance, register, honorifics, dialogue voice, narrative rhythm, and the distinction between speech, narration, thoughts, and actions. Naturalness applies to {{targetLanguage}} grammar, word order, and idiom. Add only what natural {{targetLanguage}} requires.

Rules:
- Preserve formatting, markdown, and special characters such as *asterisks*.
- Do not censor, soften, or embellish the text.
- Output ONLY the translated text. Do not include explanations or notes.`;
  const ENGLISH_KOREAN_PROMPT = `You are an expert literary and roleplay translator.

Translate the given text naturally into {{targetLanguage}} while faithfully preserving meaning, characterization, emotional nuance, register, honorifics, dialogue voice, narrative rhythm, and the distinction between speech, narration, thoughts, and actions.

> **Core Principle**: The translation should read as if it were written in Korean from the start, never as a translated text.

Rules:
- Preserve formatting, markdown, and special characters such as *asterisks*.
- Do not censor, soften, or embellish the text.
- Output ONLY the translated text. Do not include explanations or notes.
- When translating into Korean, follow the Korean Rendering Rules below.

---

# Korean Rendering Rules

## 대사
- 대사는 인물 관계에 따라 존비어, 호칭, 어미를 일관되게 유지한다.
- 각 대사는 독립된 단락으로 구성한다.
- 대사 내 감탄사·호칭·간투어는 원문의 뉘앙스를 살려 자연스럽게 옮긴다.
- 머뭇거림, 말 끊김, 정정, 삼킨 말은 한국어 대사의 호흡으로 살린다.

## 서술
- 기본 시제: 평서문 과거형.
- 문맥상 명확한 경우 주어를 생략한다.
  - 예) He turned. He sighed. → 몸을 돌렸다. 한숨이 새어 나왔다.
- 문단은 의미 단위와 호흡에 따라 재구성한다.
- 짧은 문장과 긴 문장을 교차하고 어미를 다양하게 변주하여 문장의 흐름을 살린다.
  - 완료(했다, 였다), 진행(있었다, 중이었다), 현재(이다, ㄴ다), 분절(명사형 — 예: 침묵. 그의 손.), 의문(을까, 걸까)

## 어휘·표현
- 원문의 어휘 수위와 강도(감정·친밀감·위협·성적 긴장·욕설·폭력)를 유지한다.
- 욕설·비속어·애칭은 인물의 관계와 성격에 맞는 한국어 표현으로 옮긴다.
- 관용구·숙어는 원문의 의미와 뉘앙스를 살려 한국어에서 자연스러운 표현으로 옮긴다.`;
  const CHINESE_KOREAN_PROMPT = `You are an expert literary and roleplay translator.

Translate the given text naturally into {{targetLanguage}} while faithfully preserving meaning, characterization, emotional nuance, register, honorifics, dialogue voice, narrative rhythm, and the distinction between speech, narration, thoughts, and actions.

> **Core Principle**: The translation should read as if it were written in Korean from the start, never as a translated text.

Rules:
- Preserve formatting, markdown, and special characters such as *asterisks*.
- Do not censor, soften, or embellish the text.
- Output ONLY the translated text. Do not include explanations or notes.
- When translating into Korean, follow the Korean Rendering Rules below.

---

# Korean Rendering Rules

## 대사
- 대사는 인물 관계에 따라 존비어, 호칭, 어미를 일관되게 유지한다.
- 각 대사는 독립된 단락으로 구성한다.
- 대사 내 감탄사·호칭·간투어는 원문의 뉘앙스를 살려 자연스럽게 옮긴다.
- 머뭇거림, 말 끊김, 정정, 삼킨 말은 한국어 대사의 호흡으로 살린다.

## 서술
- 기본 시제: 평서문 과거형.
- 문맥상 명확한 경우 주어를 생략한다.
  - 예) 他转过身。他叹了口气。→ 몸을 돌렸다. 한숨이 새어 나왔다.
- 양사(量詞)를 직역하지 않고 한국어에 자연스러운 표현으로 재구성한다.
- 把자문·被자문 등 중국어 특유의 구조는 한국어 어순에 맞게 자연스럽게 재배치한다.
- 중복 표현: 한국어로 옮길 때 불필요한 중복은 정리하되, 의도적 강조는 살린다.
- 문단은 의미 단위와 호흡에 따라 재구성한다.
- 짧은 문장과 긴 문장을 교차하고 어미를 다양하게 변주하여 문장의 흐름을 살린다.
  - 완료(했다, 였다), 진행(있었다, 중이었다), 현재(이다, ㄴ다), 분절(명사형 — 예: 침묵. 그의 손.), 의문(을까, 걸까)

## 어휘·표현
- 원문의 어휘 수위와 강도(감정·친밀감·위협·성적 긴장·욕설·폭력)를 유지한다.
- 욕설·비속어·애칭은 인물의 관계와 성격에 맞는 한국어 표현으로 옮긴다.
- 관용구·숙어는 원문의 의미와 뉘앙스를 살려 한국어에서 자연스러운 표현으로 옮긴다.`;
  const JAPANESE_KOREAN_PROMPT = `You are an expert literary and roleplay translator.

Translate the given text naturally into {{targetLanguage}} while faithfully preserving meaning, characterization, emotional nuance, register, honorifics, dialogue voice, narrative rhythm, and the distinction between speech, narration, thoughts, and actions.

> **Core Principle**: The translation should read as if it were written in Korean from the start, never as a translated text.

Rules:
- Preserve formatting, markdown, and special characters such as *asterisks*.
- Do not censor, soften, or embellish the text.
- Output ONLY the translated text. Do not include explanations or notes.
- When translating into Korean, follow the Korean Rendering Rules below.

---

# Korean Rendering Rules

## 대사
- 대사는 인물 관계에 따라 존비어, 호칭, 어미를 일관되게 유지한다.
- 각 대사는 독립된 단락으로 구성한다.
- 대사 내 감탄사·호칭·간투어는 원문의 뉘앙스를 살려 자연스럽게 옮긴다.
- 머뭇거림, 말 끊김, 정정, 삼킨 말은 한국어 대사의 호흡으로 살린다.

## 서술
- 기본 시제: 평서문 과거형.
- 짧은 문장과 긴 문장을 교차하고 어미를 다양하게 변주하여 문장의 흐름을 살린다.
  - 완료(했다, 였다), 진행(있었다, 중이었다), 현재(이다, ㄴ다), 분절(명사형 — 예: 침묵. 그의 손.)

## 어휘·표현
- 원문의 어휘 수위와 강도(감정·친밀감·위협·성적 긴장·욕설·폭력)를 유지한다.
- 욕설·비속어·애칭은 인물의 관계와 성격에 맞는 한국어 표현으로 옮긴다.
- 관용구·숙어는 원문의 의미와 뉘앙스를 살려 한국어에서 자연스러운 표현으로 옮긴다.`;
  const BILINGUAL_DIALOGUE_KOREAN_PROMPT = `You are an expert literary and roleplay translator.

Translate the given text naturally into {{targetLanguage}} while faithfully preserving original meaning, characterization, emotional nuance, register, honorifics, dialogue voice, narrative rhythm, and the distinction between speech, narration, thoughts, and actions.

> **Core Principle**: The translation should read as if it were written in Korean from the start, never as a translated text.

Rules:
- Preserve formatting, markdown, and special characters such as *asterisks*.
- Translate all non-dialogue text normally into Korean.
- NEVER replace, translate, rewrite, or remove the original text of dialogue that is not already in Korean.
- For any dialogue, preserve the original dialogue exactly as written instead of replacing it with the translation.
- Immediately follow each original dialogue with its Korean translation in parentheses.
- Apply this rule to dialogue in any language, regardless of the source language.
- Do not censor, soften, or embellish the text.
- Output ONLY the translated text. Do not include explanations or notes.
- When translating into Korean, follow the Korean Rendering Rules below.

---

# Korean Rendering Rules

## 대사
- 대사는 인물 관계에 따라 존비어, 호칭, 어미를 일관되게 유지한다.
- 각 대사는 독립된 단락으로 구성한다.
- 대사 내 감탄사·호칭·간투어는 원문의 뉘앙스를 살려 자연스럽게 옮긴다.
- 머뭇거림, 말 끊김, 정정, 삼킨 말은 한국어 대사의 호흡으로 살린다.
- 형식: "원어 대사" (한국어 번역)

## 서술
- 기본 시제: 평서문 과거형.
- 문맥상 명확한 경우 주어를 생략한다.
  - 예) He turned. He sighed. → 몸을 돌렸다. 한숨이 새어 나왔다.
- 문단은 의미 단위와 호흡에 따라 재구성한다.
- 짧은 문장과 긴 문장을 교차하고 어미를 다양하게 변주하여 문장의 흐름을 살린다.
  - 완료(했다, 였다), 진행(있었다, 중이었다), 현재(이다, ㄴ다), 분절(명사형 — 예: 침묵. 그의 손.), 의문(을까, 걸까)

## 어휘·표현
- 원문의 어휘 수위와 강도(감정·친밀감·위협·성적 긴장·욕설·폭력)를 유지한다.
- 욕설·비속어·애칭은 인물의 관계와 성격에 맞는 한국어 표현으로 옮긴다.
- 관용구·숙어는 원문의 의미와 뉘앙스를 살려 한국어에서 자연스러운 표현으로 옮긴다.`;
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
      prompt: ENGLISH_KOREAN_PROMPT,
      replace: true,
      builtin: true,
    }),
    Object.freeze({
      id: "builtin-chinese-korean",
      name: "중국어→한국어 문학·RP",
      prompt: CHINESE_KOREAN_PROMPT,
      replace: true,
      builtin: true,
    }),
    Object.freeze({
      id: "builtin-japanese-korean",
      name: "일본어→한국어 문학·RP",
      prompt: JAPANESE_KOREAN_PROMPT,
      replace: true,
      builtin: true,
    }),
    Object.freeze({
      id: "builtin-bilingual-dialogue-korean",
      name: "원문 대사 병기·한국어 RP",
      prompt: BILINGUAL_DIALOGUE_KOREAN_PROMPT,
      replace: true,
      builtin: true,
    }),
  ]);
  const LEGACY_VOICE_INSTRUCTION_START = "[Translation Tools: Character Voice Instructions]";
  const LEGACY_VOICE_INSTRUCTION_END = "[/Translation Tools: Character Voice Instructions]";
  const DEFAULT_SCOPE = Object.freeze({
    glossary: "",
    incomingVoiceEnabled: false,
    incomingVoicePrompt: "",
    outgoingPresetId: "builtin-inherit",
    incomingPresetId: "builtin-inherit",
    outgoingOriginalPrompt: "",
    incomingOriginalPrompt: "",
  });

  const originalFetch = window.fetch;
  const forms = new Set();
  let storedConfig = null;
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

  function normalizePresets(value) {
    const presets = BUILTIN_PRESETS.map((preset) => ({ ...preset }));
    const ids = new Set(presets.map((preset) => preset.id));
    if (!Array.isArray(value)) return presets;
    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const prompt = typeof item.prompt === "string" ? item.prompt : "";
      if (!id || ids.has(id) || !name || !prompt.trim()) continue;
      ids.add(id);
      presets.push({ id, name, prompt, replace: true, builtin: false });
    }
    return presets;
  }

  function normalizeScope(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      glossary: typeof source.glossary === "string" ? source.glossary : "",
      incomingVoiceEnabled: source.incomingVoiceEnabled === true,
      incomingVoicePrompt: typeof source.incomingVoicePrompt === "string" ? source.incomingVoicePrompt : "",
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
    const presets = normalizePresets(source.presets);
    const chats = {};
    if (source.chats && typeof source.chats === "object" && !Array.isArray(source.chats)) {
      for (const [chatId, scope] of Object.entries(source.chats)) {
        if (chatId) chats[chatId] = normalizeScope(scope);
      }
    }
    return {
      schemaVersion: 1,
      presets,
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
    const sections = [
      "# Glossary",
      `Glossary for translation into ${targetLanguage}. Preserve capitalization and translate matching terms exactly.`,
    ];
    if (exact.length) sections.push(`Source → required translation:\n${exact.join("\n")}`);
    if (bidirectional.length) {
      sections.push(
        `Bidirectional pairs. Choose the side that belongs to the target language and output that exact term:\n${bidirectional.join("\n")}`,
      );
    }
    return sections.join("\n");
  }

  function buildSystemPrompt(body) {
    const scope = currentScope();
    const existing = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
    const base = existing || BASE_PROMPT;
    const glossary = glossarySection(scope.glossary, body.text, body.targetLanguage);
    let prompt = glossary ? `${base}\n\n${glossary}` : base;
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

  async function routedFetch(input, init) {
    if (!requestUrl(input).endsWith("/api/translate") || requestMethod(input, init) !== "POST") {
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
        body.provider !== "ai" ||
        typeof body.text !== "string" ||
        typeof body.targetLanguage !== "string"
      ) {
        return originalFetch.call(window, input, init);
      }
      const rewrittenBody = JSON.stringify({ ...body, systemPrompt: buildSystemPrompt(body) });
      if (fromInit) return originalFetch.call(window, input, { ...init, body: rewrittenBody });
      return originalFetch.call(window, new Request(input, { ...init, body: rewrittenBody }));
    } catch (error) {
      marinara.log.warn(`${EXTENSION_LABEL}: 번역 요청을 수정하지 못해 원래 요청을 사용합니다.`, error);
      return originalFetch.call(window, input, init);
    }
  }

  async function saveConfig(nextConfig) {
    const normalized = normalizeStoredConfig(nextConfig);
    const saved = await marinara.storage.patch({ config: normalized });
    storedConfig = normalizeStoredConfig(saved?.config ?? normalized);
    populateAllForms();
  }

  function setStatus(form, message, kind = "info") {
    const status = form.querySelector("[data-tpg-status]");
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function syncPresetEditor(form) {
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
    cancelButton.textContent = creating ? "새 프리셋 취소" : "프리셋 수정 취소";
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
    const section = `# Character Voice Instructions\n${instruction}`;
    return base ? `${base}\n\n${section}` : section;
  }

  function syncIncomingVoiceVisibility(form) {
    const enabled = form.elements.namedItem("incomingVoiceEnabled").checked;
    form.querySelector("[data-tpg-incoming-voice]").hidden = !enabled;
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

  function applyKoreanMyLanguage(content) {
    const nativeSelects = Array.from(content.querySelectorAll("select")).filter(
      (select) => !select.closest(`[${PANEL_ATTRIBUTE}]`),
    );
    const nativeInputs = Array.from(content.querySelectorAll('input[type="text"]')).filter(
      (input) => !input.closest(`[${PANEL_ATTRIBUTE}]`),
    );
    const provider = nativeSelects[0]?.value;
    const myLanguageInput = nativeInputs[1];
    if (!myLanguageInput) return;
    const koreanValue = provider === "ai" ? "Korean" : "ko";
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
    form.elements.namedItem("incomingVoiceEnabled").checked = scope.incomingVoiceEnabled;
    form.elements.namedItem("incomingVoicePrompt").value = scope.incomingVoicePrompt;
    form._originalPrompts = {
      outgoing: scope.outgoingOriginalPrompt,
      incoming: scope.incomingOriginalPrompt,
    };
    form._appliedPresetIds = {
      outgoing: scope.outgoingPresetId,
      incoming: scope.incomingPresetId,
    };
    syncIncomingVoiceVisibility(form);
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
      <h5 class="tpg-section-title">단어장</h5>
      <textarea class="tpg-standalone-textarea" name="glossary" rows="3" spellcheck="false" aria-label="단어장" placeholder="마리나라 = Marinara&#10;로어북 = lorebook&#10;누들 = Noodle"></textarea>
      <p class="tpg-help">한 줄에 한 쌍을 입력하세요. 좌우 순서와 관계없이 양방향으로 적용됩니다.</p>
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
          <button type="button" data-tpg-delete>선택 프리셋 삭제</button>
          <button type="button" class="tpg-cancel" data-tpg-cancel hidden>편집 취소</button>
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
    forms.add(form);

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
      const id = form.elements.namedItem("managePresetId").value;
      const preset = form._presets.find((candidate) => candidate.id === id);
      if (!preset || preset.builtin) return;
      form._presets = form._presets.filter((candidate) => candidate.id !== id);
      form._creatingPresetId = null;
      form._editingPresetId = null;
      form._editSnapshot = null;
      populatePresetSelects(form);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
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
        incomingVoiceEnabled: voiceEnabled,
        incomingVoicePrompt: form.elements.namedItem("incomingVoicePrompt").value,
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
      applyKoreanMyLanguage(content);
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
    .tpg-field { display: grid; gap: 4px; color: var(--muted-foreground); font-size: .6875rem; font-weight: 600; }
    .tpg-field input, .tpg-field select, .tpg-field textarea, .tpg-standalone-textarea, .tpg-standalone-select { width: 100%; box-sizing: border-box; border: 1px solid transparent; border-radius: 8px; outline: none; background: var(--secondary); padding: 8px 10px; color: var(--foreground); font: inherit; font-size: .75rem; font-weight: 400; line-height: 1.45; }
    .tpg-field textarea { min-height: 76px; resize: vertical; }
    .tpg-standalone-textarea { min-height: 60px; resize: vertical; }
    .tpg-field input:focus, .tpg-field select:focus, .tpg-field textarea:focus, .tpg-standalone-textarea:focus, .tpg-standalone-select:focus { border-color: color-mix(in oklch, var(--primary) 50%, transparent); box-shadow: 0 0 0 2px color-mix(in oklch, var(--primary) 18%, transparent); }
    .tpg-field input[readonly], .tpg-field textarea[readonly] { opacity: .72; cursor: default; }
    .tpg-actions, .tpg-actions-left { display: flex; align-items: center; gap: 7px; }
    .tpg-actions { justify-content: space-between; }
    .tpg-actions-left { min-width: 0; flex-wrap: wrap; }
    .tpg-actions button, .tpg-cancel, .tpg-save { min-height: 32px; border: 1px solid var(--border); border-radius: 7px; background: var(--secondary); padding: 6px 9px; color: var(--foreground); font: inherit; font-size: .6875rem; font-weight: 650; cursor: pointer; }
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
