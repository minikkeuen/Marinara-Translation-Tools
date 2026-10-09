// Extension-only integration with Marinara 2.5's generation SSE and chat APIs.
function createMarinaraAutomaticTranslation({
  marinara,
  fetch,
  headersFor,
  scopeFor,
  translate,
  gameSource,
}) {
  const leases = new Map();
  const attempts = new Map();
  const pendingTranslations = new Map();
  const gates = new Map();
  const messageOwners = new Map();
  let abort = new AbortController();
  let stopped = false;
  let initialized = false;
  let recovery = {};
  let journalQueue = Promise.resolve();
  let markReady;
  const ready = new Promise((resolve) => {
    markReady = resolve;
  });
  const parse = (value) => {
    if (value && typeof value === "object") return value;
    try {
      return JSON.parse(value || "{}");
    } catch {
      return {};
    }
  };
  const chatUrl = (chatId) => `/api/chats/${encodeURIComponent(chatId)}`;
  const restorationKey = `marinara-translation-tools-restored:${marinara.extension.id}`;
  let confirmed = {};
  try {
    const value = parse(localStorage.getItem(restorationKey));
    if (value && typeof value === "object" && !Array.isArray(value)) confirmed = value;
  } catch {
    /* Storage may be unavailable. */
  }
  const confirmation = (chatId, value) => {
    if (value === undefined) delete confirmed[chatId];
    else confirmed[chatId] = value;
    try {
      localStorage.setItem(restorationKey, JSON.stringify(confirmed));
    } catch {
      /* Server journal remains available. */
    }
  };
  const request = async (url, headers, method = "GET", body, keepalive = false) => {
    const response = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      keepalive,
    });
    if (!response.ok) throw new Error(`자동 번역: ${method} ${url} (${response.status})`);
    return response;
  };
  const json = async (...args) => (await request(...args)).json();
  const remember = () => {
    const snapshot = { ...recovery };
    const write = journalQueue
      .catch(() => {})
      .then(() => marinara.storage.patch({ automaticTranslationRecovery: snapshot }));
    journalQueue = write;
    return write;
  };
  const gate = (id, work) => {
    const operation = (gates.get(id) || Promise.resolve()).catch(() => {}).then(work);
    gates.set(id, operation);
    return operation.finally(() => {
      if (gates.get(id) === operation) gates.delete(id);
    });
  };
  const metadataHeaders = (input, init) => {
    const headers = headersFor(input, init);
    headers.set("Content-Type", "application/json");
    headers.set("X-Marinara-CSRF", "1");
    return headers;
  };
  const release = (lease) =>
    gate(lease.chatId, async () => {
      lease.count--;
      if (lease.count > 0 || leases.get(lease.chatId) !== lease) return;
      try {
        await request(
          `${chatUrl(lease.chatId)}/metadata`,
          lease.headers,
          "PATCH",
          { autoTranslate: lease.enabled },
          true,
        );
        confirmation(lease.chatId, lease.enabled);
        leases.delete(lease.chatId);
        delete recovery[lease.chatId];
        await remember();
        confirmation(lease.chatId);
      } catch (error) {
        marinara.log.warn("자동 번역 설정을 복원하지 못했습니다. 다음 실행 시 재시도합니다.", error);
      }
    });
  const acquire = (chatId, headers) =>
    gate(chatId, async () => {
      const existing = leases.get(chatId);
      if (existing) {
        existing.count++;
        return existing;
      }
      const chat = await json(chatUrl(chatId), headers);
      if (parse(chat.metadata).autoTranslate !== true) return null;
      const lease = { chatId, headers, enabled: true, count: 1, chat };
      confirmation(chatId);
      recovery[chatId] = true;
      await remember(); // Journal before changing the server, for reload/crash recovery.
      try {
        await request(`${chatUrl(chatId)}/metadata`, headers, "PATCH", { autoTranslate: false });
        leases.set(chatId, lease);
        return lease;
      } catch (error) {
        // A failed response can still have committed the metadata change. Keep
        // recovery information unless restoring the original state is confirmed.
        try {
          await request(`${chatUrl(chatId)}/metadata`, headers, "PATCH", { autoTranslate: true }, true);
          confirmation(chatId, true);
          delete recovery[chatId];
          await remember();
          confirmation(chatId);
        } catch (restoreError) {
          lease.count = 0;
          leases.set(chatId, lease);
          marinara.log.warn("자동 번역 차단 실패 후 설정 복원을 재시도해야 합니다.", restoreError);
        }
        throw error; // Do not start generation if duplicate-call prevention failed.
      }
    });
  const visibleChat = (chat) => {
    const lease = chat && leases.get(chat.id);
    if (!lease || !Object.prototype.hasOwnProperty.call(chat, "metadata")) return chat;
    const metadata = { ...parse(chat.metadata), autoTranslate: lease.enabled };
    return { ...chat, metadata: typeof chat.metadata === "string" ? JSON.stringify(metadata) : metadata };
  };
  const replaceJson = (response, value) => {
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    headers.delete("Content-Encoding");
    return new Response(JSON.stringify(value), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
  const messageRows = async (chatId, headers) => {
    const payload = await json(`${chatUrl(chatId)}/messages`, headers);
    return Array.isArray(payload) ? payload : payload.messages || [];
  };
  const readSwipe = async (chatId, message, headers) => {
    const swipes = await json(
      `${chatUrl(chatId)}/messages/${encodeURIComponent(message.id)}/swipes`,
      headers,
    );
    const list = Array.isArray(swipes) ? swipes : swipes.swipes || [];
    const index = message.activeSwipeIndex ?? 0;
    const swipe = list.find((item) => item.index === index);
    return swipe ? { ...message, content: swipe.content, extra: swipe.extra, activeSwipeIndex: index } : null;
  };
  const translateMessage = async (run, candidate, final) => {
    if (stopped || run.cancelled || !run.lease.enabled || run.input.impersonate) return null;
    const ownerKey = `${run.lease.chatId}:${candidate.id}`;
    if (messageOwners.get(ownerKey) !== run) return null;
    let message = candidate;
    if (final || parse(message.extra).postProcessingPending) {
      const rows = await messageRows(run.lease.chatId, run.lease.headers);
      const current = rows.find((item) => item.id === candidate.id);
      if (!current || (current.activeSwipeIndex ?? 0) !== (candidate.activeSwipeIndex ?? 0)) return null;
      message = await readSwipe(run.lease.chatId, current, run.lease.headers);
    }
    if (
      !message ||
      message.role !== "assistant" ||
      typeof message.content !== "string" ||
      !message.content.trim()
    )
      return null;
    const extra = parse(message.extra);
    if (extra.translationHidden === true || extra.hiddenFromUser === true || extra.commandOnly === true)
      return null;
    const metadata = parse(run.lease.chat.metadata);
    const source =
      run.lease.chat.mode === "game" || metadata.chatMode === "game" ? gameSource(message) : message.content;
    if (!source.trim()) return null;
    const key = `${run.lease.chatId}:${message.id}:${message.activeSwipeIndex ?? 0}`;
    const completed = attempts.get(key);
    if (completed?.sources.has(source)) return completed.promise;
    if (
      extra.translationSource === source &&
      typeof extra.translation === "string" &&
      extra.translation.trim()
    )
      return null;
    const state = completed || { sources: new Set() };
    if (extra.automaticTranslationSource === message.content) return null;
    state.sources.add(source);
    attempts.set(key, state);
    const pendingKey = `${run.lease.chatId}\n${source}`;
    const pendingEntry = {};
    const work = async () => {
      if (stopped || run.cancelled || !run.lease.enabled || messageOwners.get(ownerKey) !== run) return null;
      const chat = await json(chatUrl(run.lease.chatId), run.lease.headers);
      if (stopped || run.cancelled || !run.lease.enabled || messageOwners.get(ownerKey) !== run) return null;
      const config = parse(chat.metadata);
      const provider = config.translationProvider || "google";
      pendingEntry.provider = provider;
      pendingEntry.targetLanguage =
        config.translationOutputTargetLang?.trim() || config.translationTargetLang?.trim() || "en";
      await request(
        `${chatUrl(run.lease.chatId)}/messages/${encodeURIComponent(message.id)}/extra?swipeIndex=${message.activeSwipeIndex ?? 0}`,
        run.lease.headers,
        "PATCH",
        { automaticTranslationSource: message.content },
      );
      if (stopped || run.cancelled || !run.lease.enabled || messageOwners.get(ownerKey) !== run) return null;
      const result = await translate(
        {
          chatId: run.lease.chatId,
          text: source,
          provider,
          targetLanguage:
            config.translationOutputTargetLang?.trim() || config.translationTargetLang?.trim() || "en",
          connectionId: config.translationConnectionId,
          systemPrompt:
            config.translationOutputPrompt === undefined
              ? config.translationPrompt
              : config.translationOutputPrompt,
          deeplApiKey: config.deeplApiKey,
          deeplxUrl: config.deeplxUrl,
        },
        run.lease.headers,
        run.abort?.signal || abort.signal,
        message.id,
      );
      if (stopped || run.cancelled || !run.lease.enabled || messageOwners.get(ownerKey) !== run) return null;
      if (typeof result.translatedText !== "string" || !result.translatedText.trim())
        throw new Error("자동 번역 결과가 비어 있습니다.");
      const rows = await messageRows(run.lease.chatId, run.lease.headers);
      const current = rows.find((item) => item.id === message.id);
      if (!current || (current.activeSwipeIndex ?? 0) !== (message.activeSwipeIndex ?? 0)) return null;
      // A new continue/edit must not receive an obsolete result. OFF intentionally
      // retains the pre-rewrite source; the Engine can identify it as such.
      if (final && current.content !== message.content) return null;
      const saved = await json(
        `${chatUrl(run.lease.chatId)}/messages/${encodeURIComponent(message.id)}/extra?swipeIndex=${message.activeSwipeIndex ?? 0}`,
        run.lease.headers,
        "PATCH",
        { translation: result.translatedText, translationSource: source, translationHidden: false },
      );
      return { ...saved, role: "assistant", id: message.id, content: current.content };
    };
    state.promise = Promise.resolve(completed?.promise)
      .catch(() => {})
      .then(work);
    pendingEntry.promise = state.promise;
    pendingTranslations.set(pendingKey, pendingEntry);
    try {
      return await state.promise;
    } catch (error) {
      if (!stopped)
        marinara.log.warn("확장 자동 번역에 실패했습니다. 수동 번역으로 다시 시도할 수 있습니다.", error);
      return null;
    } finally {
      if (pendingTranslations.get(pendingKey) === pendingEntry) pendingTranslations.delete(pendingKey);
    }
  };
  const finalizeMessages = async (run) => {
    if (stopped || run.cancelled || !run.lease.enabled || !run.messages.size) return [];
    const rows = await messageRows(run.lease.chatId, run.lease.headers);
    const messages = [];
    for (const candidate of run.messages.values()) {
      const key = `${run.lease.chatId}:${candidate.id}:${candidate.activeSwipeIndex ?? 0}`;
      if (!attempts.has(key) || messageOwners.get(`${run.lease.chatId}:${candidate.id}`) !== run) continue;
      const current = rows.find((item) => item.id === candidate.id);
      if (!current || (current.activeSwipeIndex ?? 0) !== (candidate.activeSwipeIndex ?? 0)) continue;
      // Game's native browser fallback must not launch a second translation
      // after an OFF-mode rewrite, or after a failed extension attempt.
      const saved = await json(
        `${chatUrl(run.lease.chatId)}/messages/${encodeURIComponent(candidate.id)}/extra?swipeIndex=${candidate.activeSwipeIndex ?? 0}`,
        run.lease.headers,
        "PATCH",
        { automaticTranslationSource: current.content },
      );
      messages.push({ type: "message_saved", data: saved });
    }
    return messages;
  };
  const trackGeneration = (response, run) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const jobs = [];
    run.abort = new AbortController();
    let output;
    let buffer = "";
    let closed = false;
    let finished = false;
    let completionSeen = false;
    let completionTask;
    const cancelRun = () => {
      run.cancelled = true;
      run.abort.abort();
    };
    abort.signal.addEventListener("abort", cancelRun, { once: true });
    const finish = async () => {
      if (finished) return;
      finished = true;
      abort.signal.removeEventListener("abort", cancelRun);
      await release(run.lease);
    };
    const publish = (event) => {
      if (!closed && !stopped && !run.cancelled)
        output.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    };
    const launch = (message, final) => {
      jobs.push(
        translateMessage(run, message, final)
          .then((saved) => {
            if (saved) publish({ type: "message_saved", data: saved });
          })
          .catch((error) => {
            if (!stopped && !run.cancelled) marinara.log.warn("확장 자동 번역 처리 실패", error);
          }),
      );
    };
    const complete = async () => {
      try {
        await Promise.all(jobs);
        for (const event of await finalizeMessages(run)) publish(event);
      } catch (error) {
        if (!stopped && !run.cancelled) marinara.log.warn("자동 번역 마무리 실패", error);
      } finally {
        await finish();
      }
    };
    const onEvent = (event) => {
      if (stopped || completionSeen) return;
      if (event.type === "message_saved" && event.data?.role === "assistant") {
        const message = event.data;
        const key = `${message.id}:${message.activeSwipeIndex ?? 0}`;
        const ownerKey = `${run.lease.chatId}:${message.id}`;
        if (!messageOwners.has(ownerKey)) messageOwners.set(ownerKey, run);
        if (messageOwners.get(ownerKey) !== run) return;
        run.messages.set(key, message);
        if (!run.afterProcessing) launch(message, false);
      }
      if (event.type === "done") {
        completionSeen = true;
        if (run.afterProcessing) for (const message of run.messages.values()) launch(message, true);
        completionTask = complete();
      }
      if (event.type === "error") {
        completionSeen = true;
        cancelRun();
        completionTask = complete();
      }
    };
    const emit = (controller, frame) => {
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        /* Keep protocol comments/sentinels. */
      }
      // Preserve generation events immediately. Translation runs in the SSE
      // background, like the Engine's illustration tail, without locking input.
      controller.enqueue(encoder.encode(`${frame}\n\n`));
      if (event) onEvent(event);
    };
    const body = new ReadableStream({
      start(controller) {
        output = controller;
      },
      async pull(controller) {
        try {
          while (true) {
            const result = await reader.read();
            buffer += decoder.decode(result.value, { stream: !result.done });
            let match;
            let emitted = false;
            while ((match = /\r?\n\r?\n/.exec(buffer))) {
              const frame = buffer.slice(0, match.index);
              buffer = buffer.slice(match.index + match[0].length);
              emit(controller, frame);
              emitted = true;
            }
            if (result.done) {
              if (buffer.trim()) emit(controller, buffer);
              // Only a clean EOF may use the idle/content-stability fallback.
              if (
                !completionSeen &&
                run.messages.size &&
                run.afterProcessing &&
                !stopped &&
                (await settled(run))
              ) {
                for (const message of run.messages.values()) launch(message, true);
              }
              await (completionTask || complete());
              closed = true;
              controller.close();
              return;
            }
            if (emitted) return;
          }
        } catch (error) {
          closed = true;
          cancelRun();
          await finish();
          controller.error(error);
        }
      },
      async cancel(reason) {
        closed = true;
        cancelRun();
        try {
          await reader.cancel(reason);
        } finally {
          await finish();
        }
      },
    });
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    headers.delete("Content-Encoding");
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  };
  const settled = async (run) => {
    // Fallback only: hosts without a done event must report an idle generation
    // and two matching stored contents. A timer is only the polling interval.
    const deadline = Date.now() + 5000;
    let previous;
    while (!stopped && Date.now() < deadline) {
      const status = await json(
        `/api/generate/status/${encodeURIComponent(run.lease.chatId)}`,
        run.lease.headers,
      );
      const rows = await messageRows(run.lease.chatId, run.lease.headers);
      const signature = JSON.stringify(
        rows
          .filter((row) => [...run.messages.values()].some((m) => m.id === row.id))
          .map((row) => [row.id, row.activeSwipeIndex, row.content, parse(row.extra).postProcessingPending]),
      );
      const pending = rows.some(
        (row) =>
          run.messages.has(`${row.id}:${row.activeSwipeIndex ?? 0}`) &&
          parse(row.extra).postProcessingPending,
      );
      if (!status.active && !pending && signature === previous) return true;
      previous = status.active || pending ? undefined : signature;
      if (stopped) return false;
      await new Promise((resolve) => {
        const done = () => {
          marinara.clearTimeout(timer);
          abort.signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = marinara.setTimeout(done, 300);
        abort.signal.addEventListener("abort", done, { once: true });
      });
    }
    return false;
  };
  const cleanup = async () => {
    stopped = true;
    abort.abort();
    await ready.catch(() => {});
    await Promise.all(
      [...leases.values()].map((lease) => {
        lease.count = 1;
        return release(lease);
      }),
    );
  };
  return {
    start(saved) {
      if (initialized) return ready;
      initialized = true;
      recovery = { ...(saved?.automaticTranslationRecovery || {}) };
      const initialization = (async () => {
        const headers = metadataHeaders();
        for (const [chatId, enabled] of Object.entries(recovery)) {
          try {
            // A disabled extension cannot clear its server storage. Remember
            // successful local restoration so a stale journal cannot undo a
            // later native ON/OFF change when the extension is re-enabled.
            if (confirmed[chatId] !== (enabled === true)) {
              await request(`${chatUrl(chatId)}/metadata`, headers, "PATCH", {
                autoTranslate: enabled === true,
              });
              confirmation(chatId, enabled === true);
            }
            delete recovery[chatId];
          } catch (error) {
            marinara.log.warn("이전 자동 번역 설정 복원을 재시도하지 못했습니다.", error);
          }
        }
        await remember();
        for (const chatId of Object.keys(confirmed)) if (!(chatId in recovery)) confirmation(chatId);
      })();
      initialization.then(markReady, (error) => {
        marinara.log.warn("자동 번역 복구 정보를 저장하지 못했습니다.", error);
        markReady();
      });
      return initialization;
    },
    async fetch(input, init, fallback) {
      if (stopped) return fetch(input, init);
      const url = new URL(
        typeof input === "string" || input instanceof URL ? String(input) : input.url,
        window.location.href,
      );
      const pathname = url.pathname.replace(/\/+$/, "");
      const method = String(init?.method || input?.method || "GET").toUpperCase();
      if (
        method === "PATCH" &&
        (pathname === `/api/personal-extensions/${encodeURIComponent(marinara.extension.id)}` ||
          pathname === "/api/personal-extensions/policy/external")
      ) {
        const value = parse(init?.body ?? (input instanceof Request ? await input.clone().text() : ""));
        if (value.enabled !== false) return fallback(input, init);
        await cleanup();
        try {
          const response = await fallback(input, init);
          if (!response.ok) {
            abort = new AbortController();
            stopped = false;
          }
          return response;
        } catch (error) {
          abort = new AbortController();
          stopped = false;
          throw error;
        }
      }
      // Storage initializes this controller through the same global fetch.
      // Unrelated APIs must bypass readiness, or storage.get/patch deadlocks.
      if (!/\/api\/(?:generate|chats|translate)(?:\/|$)/.test(pathname)) return fallback(input, init);
      await ready;
      const body = async () =>
        parse(init?.body ?? (input instanceof Request ? await input.clone().text() : ""));
      const statusMatch = pathname.match(/\/api\/generate\/status\/([^/]+)$/);
      if (method === "GET" && statusMatch && leases.get(decodeURIComponent(statusMatch[1]))?.enabled) {
        const response = await fallback(input, init);
        if (!response.ok) return response;
        // Keep Game's native browser fallback idle while this extension owns
        // the attempt, without delaying the generation's done event.
        return replaceJson(response, { ...(await response.json()), translating: true });
      }
      if (method === "POST" && /\/api\/generate(?:\/retry-agents)?$/.test(pathname)) {
        const value = await body();
        if (!value.chatId || value.impersonate || pathname.endsWith("/retry-agents"))
          return fallback(input, init);
        const lease = await acquire(value.chatId, metadataHeaders(input, init));
        if (!lease) return fallback(input, init);
        if (stopped) {
          await release(lease);
          return fallback(input, init);
        }
        const run = {
          lease,
          input: value,
          messages: new Map(),
          afterProcessing: scopeFor(value.chatId).translateAfterPostProcessing === true,
        };
        for (const id of [value.regenerateMessageId, value.continueMessageId]) {
          if (id) messageOwners.set(`${value.chatId}:${id}`, run);
        }
        try {
          const response = await fallback(input, init);
          if (
            !response.ok ||
            !response.body ||
            !response.headers.get("Content-Type")?.includes("text/event-stream")
          ) {
            await release(lease);
            return response;
          }
          return trackGeneration(response, run);
        } catch (error) {
          await release(lease);
          throw error;
        }
      }
      const metadataMatch = pathname.match(/\/api\/chats\/([^/]+)\/metadata$/);
      if (method === "PATCH" && metadataMatch) {
        const chatId = decodeURIComponent(metadataMatch[1]);
        const lease = leases.get(chatId);
        const value = await body();
        if (lease && Object.prototype.hasOwnProperty.call(value, "autoTranslate")) {
          return gate(chatId, async () => {
            const response = await fallback(input, {
              ...init,
              method,
              headers: headersFor(input, init),
              body: JSON.stringify({ ...value, autoTranslate: false }),
            });
            if (!response.ok) return response;
            lease.enabled = value.autoTranslate === true;
            recovery[chatId] = lease.enabled;
            await remember();
            return replaceJson(response, visibleChat(await response.json()));
          });
        }
      }
      if (method === "POST" && pathname.endsWith("/api/translate")) {
        const value = await body();
        const pending = pendingTranslations.get(`${value.chatId}\n${value.text}`);
        if (
          pending &&
          pending.provider === value.provider &&
          pending.targetLanguage === value.targetLanguage
        ) {
          let saved;
          try {
            saved = await pending.promise;
          } catch {
            /* Keep the request single-flight even on failure. */
          }
          if (saved?.extra)
            return new Response(JSON.stringify({ translatedText: parse(saved.extra).translation }), {
              headers: { "Content-Type": "application/json" },
            });
          return new Response(
            JSON.stringify({ error: "자동 번역에 실패했습니다. 수동으로 다시 시도하세요." }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }
      }
      const response = await fallback(input, init);
      if (
        !response.ok ||
        !response.headers.get("Content-Type")?.includes("application/json") ||
        !pathname.includes("/api/chats")
      )
        return response;
      // Only rewrite chat objects, preserving existing message and other responses.
      if (!leases.size) return response;
      const payload = await response.clone().json();
      if (Array.isArray(payload)) return replaceJson(response, payload.map(visibleChat));
      return payload?.metadata !== undefined ? replaceJson(response, visibleChat(payload)) : response;
    },
    cleanup,
    pagehide() {
      for (const lease of leases.values())
        void request(
          `${chatUrl(lease.chatId)}/metadata`,
          lease.headers,
          "PATCH",
          { autoTranslate: lease.enabled },
          true,
        ).catch(() => {});
    },
  };
}
