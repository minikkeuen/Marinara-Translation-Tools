// Game display-only compatibility snapshot from Marinara Engine 2.5.0.
// Copyright Marinara Engine contributors. AGPL-3.0; see MARINARA-LICENSE.
// Source: https://github.com/Pasta-Devs/Marinara-Engine/tree/c8881d16a866a06478db4615dda2edfcf40770e5/packages/shared/src/utils
var MARINARA_GAME_TRANSLATION = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // game-translation-source-entry.js
  var game_translation_source_entry_exports = {};
  __export(game_translation_source_entry_exports, {
    buildGameTranslationSource: () => buildGameTranslationSource
  });

  // packages/shared/src/utils/dice-branch.ts
  function createBranchOpenerPattern() {
    return /\[branch:[^\]\r\n]{0,80}\]/gi;
  }
  function createBranchHalfPattern() {
    return /\[on\s+(?:success|failure)\]/gi;
  }
  function createBranchCloserPattern() {
    return /\[\/branch\]/gi;
  }
  function stripGameBranchDelimiters(content) {
    return content.replace(createBranchOpenerPattern(), "").replace(createBranchHalfPattern(), "").replace(createBranchCloserPattern(), "");
  }

  // packages/shared/src/utils/sheet-command-tag.ts
  var MAX_SHEET_TAG_BODY = 1500;
  function createSheetCommandStripRegex() {
    return new RegExp(`([^\\S\\r\\n]?)\\[sheet:[^\\]]{0,${MAX_SHEET_TAG_BODY}}\\]([^\\S\\r\\n]?)`, "gi");
  }
  function stripSheetCommandTags(text) {
    return text.replace(
      createSheetCommandStripRegex(),
      (_match, before, after) => before && after ? " " : ""
    );
  }

  // packages/shared/src/utils/game-narration-text.ts
  function stripUnknownBracketTags(text, keep) {
    let out = "";
    let i = 0;
    while (i < text.length) {
      if (text[i] === "[") {
        let j = i + 1;
        while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++;
        const tagName = text.slice(i + 1, j);
        if (j > i + 1 && text[j] === ":" && (!keep || !keep(tagName))) {
          let depth = 1;
          let inString = null;
          let escaped = false;
          let k = j + 1;
          for (; k < text.length; k++) {
            const c = text[k];
            if (escaped) {
              escaped = false;
              continue;
            }
            if (c === "\\") {
              escaped = true;
              continue;
            }
            if (inString) {
              if (c === inString) inString = null;
              continue;
            }
            if (c === '"' || c === "'") {
              inString = c;
              continue;
            }
            if (c === "[") depth++;
            else if (c === "]") {
              depth--;
              if (depth === 0) break;
            }
          }
          if (k < text.length) {
            i = k + 1;
            continue;
          }
          return out + text.slice(i);
        }
      }
      out += text[i];
      i++;
    }
    return out;
  }
  function stripBalancedTag(text, tagPrefix) {
    const ends = /* @__PURE__ */ new Map();
    const opens = [];
    let quote = null;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = null;
      } else if (opens.length > 0 && (char === '"' || char === "'")) quote = char;
      else if (char === "[") opens.push(i);
      else if (char === "]" && opens.length) ends.set(opens.pop(), i);
    }
    const lower = text.toLowerCase();
    const prefix = tagPrefix.toLowerCase();
    const chunks = [];
    let from = 0;
    let index = lower.indexOf(prefix);
    while (index !== -1) {
      const end = ends.get(index);
      if (end !== void 0) {
        chunks.push(text.slice(from, index));
        from = end + 1;
      }
      index = lower.indexOf(prefix, end === void 0 ? index + 1 : from);
    }
    chunks.push(text.slice(from));
    return chunks.join("");
  }
  function stripMapUpdateTag(text) {
    return stripBalancedTag(text, "[map_update:").replace(/\[map_update:[^\r\n]*(?:\r\n|\r|\n)?/gi, "");
  }
  function stripDanglingTagClosers(text) {
    return text.replace(/^[^\S\r\n]*[\]}]+[^\S\r\n]*$/gm, "");
  }
  function stripEngineResultBlocks(content) {
    return stripResultBlocks(stripResultBlocks(content, /\[\/?combat_result\]/gi), /\[\/?item_used\]/gi);
  }
  function stripResultBlocks(content, tags) {
    const chunks = [];
    let from = 0;
    let start;
    for (const tag of content.matchAll(tags)) {
      if (tag[0][1] !== "/") {
        start ??= tag.index;
        continue;
      }
      if (start === void 0) continue;
      chunks.push(content.slice(from, start));
      from = tag.index + tag[0].length;
      start = void 0;
    }
    chunks.push(content.slice(from));
    return chunks.join("");
  }
  function stripGmTagsKeepReadables(content) {
    let text = stripEngineResultBlocks(content).replace(/\[(?:party-turn|party-chat)\]/gi, "");
    text = stripSheetCommandTags(text);
    text = stripGameBranchDelimiters(text);
    text = stripUnknownBracketTags(text, (name) => {
      const lower = name.toLowerCase();
      return lower === "note" || lower === "book";
    });
    text = stripMapUpdateTag(text);
    text = stripBalancedTag(text, "[choices:");
    text = stripDanglingTagClosers(text);
    return text.trim();
  }
  var DIALOGUE_QUOTE_PAIRS = [
    ['"', '"'],
    ["\u201C", "\u201D"],
    ["\xAB", "\xBB"],
    ["\u300C", "\u300D"],
    ["\u300E", "\u300F"]
  ];
  var DIALOGUE_QUOTE_CAPTURE_GROUP_PATTERN_SOURCE = '"([^"]+)"|\u201C([^\u201D]+)\u201D|\xAB([^\xBB]+)\xBB|\u300C([^\u300D]+)\u300D|\u300E([^\u300F]+)\u300F';
  function stripSurroundingDialogueQuotes(content) {
    if (content.length < 2) return content;
    for (const [open, close] of DIALOGUE_QUOTE_PAIRS) {
      if (content.startsWith(open) && content.endsWith(close)) {
        return content.slice(open.length, content.length - close.length);
      }
    }
    return content;
  }
  function humanizeName(name) {
    if (name.includes(" ") || name.includes("_")) return name;
    return name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  }
  function normalizeInlineVnDialogueLines(source) {
    return source.replace(
      /(\S)\s+(\[[^[\]]+\]\s*\[(?:main|side|extra|action|thought|whisper(?::[^[\]]+)?)\]\s*(?:\[[^[\]]+\]\s*)?:)/gi,
      "$1\n$2"
    ).replace(
      /(\[[^[\]]+\]\s*\[(?:main|side|extra|whisper(?::[^[\]]+)?)\]\s*(?:\[[^[\]]+\]\s*)?:\s*(?:"[^"]*"|“[^”]*”|«[^»]*»))\s+(?=\S)/gi,
      "$1\n"
    );
  }
  function parseGameNarrationSegments(message, extractInlineDialogue = true) {
    const withReadables = stripGmTagsKeepReadables(message.content || "");
    const readableContents = [];
    let source = withReadables;
    for (const tag of ["[Note:", "[Book:"]) {
      const rType = tag === "[Note:" ? "note" : "book";
      let searchFrom = 0;
      while (true) {
        const idx = source.toLowerCase().indexOf(tag.toLowerCase(), searchFrom);
        if (idx === -1) break;
        let depth = 0;
        let end = -1;
        for (let i = idx; i < source.length; i++) {
          if (source[i] === "[") depth++;
          else if (source[i] === "]") {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        if (end === -1) {
          searchFrom = idx + 1;
          continue;
        }
        const inner = source.slice(idx + tag.length, end).trim();
        const placeholderIdx = readableContents.length;
        readableContents.push({ type: rType, content: inner });
        const placeholder = `
__READABLE_${placeholderIdx}__
`;
        source = source.slice(0, idx) + placeholder + source.slice(end + 1);
        searchFrom = idx + placeholder.length;
      }
    }
    const lines = normalizeInlineVnDialogueLines(source).split(/\r?\n/);
    const parsed = [];
    const readablePlaceholderRe = /^__READABLE_(\d+)__$/;
    const narrationRegex = /^\s*Narration\s*:\s*(.+)$/i;
    const legacyDialogueRegex = /^\s*Dialogue\s*\[([^\]]+)\]\s*(?:\[([^\]]+)\]\s*)?:\s*(.+)$/i;
    const compactDialogueRegex = /^\s*\[([^\]]+)\]\s*(?:\[[^\]]+\]\s*)*?(?:\[([^\]]+)\]\s*)?:\s*(.+)$/;
    const partyLineRegex = /^\s*\[([^\]]+)\]\s*\[(main|side|extra|action|thought|whisper(?::([^\]]+))?)\]\s*(?:\[([^\]]+)\]\s*)?:\s*(.+)$/i;
    let fallbackText = "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (fallbackText.trim()) {
          parsed.push({
            id: `${message.id}-fallback-${parsed.length}`,
            type: "narration",
            content: fallbackText.trim()
          });
          fallbackText = "";
        }
        continue;
      }
      const readableMatch = line.match(readablePlaceholderRe);
      if (readableMatch) {
        if (fallbackText.trim()) {
          parsed.push({
            id: `${message.id}-fallback-${parsed.length}`,
            type: "narration",
            content: fallbackText.trim()
          });
          fallbackText = "";
        }
        const rIdx = parseInt(readableMatch[1], 10);
        const readable = readableContents[rIdx];
        if (readable) {
          parsed.push({
            id: `${message.id}-readable-${parsed.length}`,
            type: "readable",
            content: readable.type === "book" ? "You find a book..." : "You find a note...",
            readableType: readable.type,
            readableContent: readable.content
          });
        }
        continue;
      }
      const partyMatch = line.match(partyLineRegex);
      if (partyMatch) {
        if (fallbackText.trim()) {
          parsed.push({
            id: `${message.id}-fallback-${parsed.length}`,
            type: "narration",
            content: fallbackText.trim()
          });
          fallbackText = "";
        }
        const character = humanizeName(partyMatch[1].trim());
        let rawType = partyMatch[2].toLowerCase().replace(/:.*$/, "");
        const whisperTarget = partyMatch[3]?.trim() ? humanizeName(partyMatch[3].trim()) : void 0;
        const expression = partyMatch[4]?.trim() || void 0;
        let content = partyMatch[5].trim();
        if (rawType === "extra") rawType = "side";
        if ((rawType === "main" || rawType === "side" || rawType === "whisper") && content.length >= 2) {
          content = stripSurroundingDialogueQuotes(content);
        }
        if (rawType === "action") {
          parsed.push({
            id: `${message.id}-party-action-${character}-${parsed.length}`,
            type: "narration",
            content
          });
          continue;
        }
        const isSpoken = rawType === "main" || rawType === "whisper" || rawType === "thought" || rawType === "side";
        parsed.push({
          id: `${message.id}-party-${rawType}-${character}-${parsed.length}`,
          type: isSpoken ? "dialogue" : "narration",
          speaker: character,
          sprite: expression,
          content,
          partyType: rawType,
          whisperTarget
        });
        continue;
      }
      const narrationMatch = line.match(narrationRegex);
      if (narrationMatch) {
        if (fallbackText.trim()) {
          parsed.push({
            id: `${message.id}-fallback-${parsed.length}`,
            type: "narration",
            content: fallbackText.trim()
          });
          fallbackText = "";
        }
        parsed.push({
          id: `${message.id}-n-${parsed.length}`,
          type: "narration",
          content: narrationMatch[1].trim()
        });
        continue;
      }
      const dialogueMatch = line.match(legacyDialogueRegex) || line.match(compactDialogueRegex);
      if (dialogueMatch) {
        if (fallbackText.trim()) {
          parsed.push({
            id: `${message.id}-fallback-${parsed.length}`,
            type: "narration",
            content: fallbackText.trim()
          });
          fallbackText = "";
        }
        const speaker = humanizeName(dialogueMatch[1].trim());
        let content = dialogueMatch[3].trim();
        content = stripSurroundingDialogueQuotes(content);
        parsed.push({
          id: `${message.id}-d-${parsed.length}`,
          type: "dialogue",
          speaker,
          sprite: dialogueMatch[2]?.trim() || void 0,
          content
        });
        continue;
      }
      fallbackText += `${fallbackText ? "\n" : ""}${line}`;
    }
    if (fallbackText.trim()) {
      parsed.push({
        id: `${message.id}-fallback-${parsed.length}`,
        type: "narration",
        content: fallbackText.trim()
      });
    }
    if (extractInlineDialogue && parsed.length > 0 && parsed.every((s) => s.type === "narration")) {
      const expanded = splitInlineDialogue(parsed, message.id);
      if (expanded.some((s) => s.type === "dialogue")) {
        return expanded;
      }
    }
    return parsed;
  }
  function splitInlineDialogue(segments, msgId) {
    const result = [];
    const inlineDialogueRe = new RegExp(
      `(?:^|(?<=\\s))(?:${DIALOGUE_QUOTE_CAPTURE_GROUP_PATTERN_SOURCE}|'([^']+)')[,.]?\\s+([A-Z][a-z]+(?:\\s[A-Z][a-z]+)?)\\s+(?:said|says|whispered|whispers|muttered|mutters|replied|replies|called|calls|shouted|shouts|asked|asks|warned|warns|growled|growls|hissed|hisses|exclaimed|exclaims|murmured|murmurs|sighed|sighs|snapped|snaps|barked|barks|declared|declares|continued|continues|added|adds|spoke|speaks|began|begins|remarked|remarks|chuckled|chuckles|laughed|laughs|cried|cries)\\b`,
      "gi"
    );
    for (const seg of segments) {
      if (seg.type !== "narration") {
        result.push(seg);
        continue;
      }
      const text = seg.content;
      let lastIndex = 0;
      let match;
      let didSplit = false;
      inlineDialogueRe.lastIndex = 0;
      while ((match = inlineDialogueRe.exec(text)) !== null) {
        didSplit = true;
        const before = text.slice(lastIndex, match.index).trim();
        if (before) {
          result.push({
            id: `${msgId}-fallback-split-${result.length}`,
            type: "narration",
            content: before
          });
        }
        const speech = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[6] ?? "";
        const speaker = match[7];
        result.push({
          id: `${msgId}-inline-d-${result.length}`,
          type: "dialogue",
          speaker,
          content: `"${speech}"`
        });
        lastIndex = match.index + match[0].length;
      }
      if (didSplit) {
        const after = text.slice(lastIndex).trim();
        if (after) {
          result.push({
            id: `${msgId}-fallback-split-${result.length}`,
            type: "narration",
            content: after
          });
        }
      } else {
        result.push(seg);
      }
    }
    return result;
  }
  function formatGameTranslationSegment(segment) {
    if (segment.type === "readable") {
      const body = (segment.readableContent ?? segment.content).trim();
      return `[${segment.readableType === "book" ? "Book" : "Note"}: ${body}]`;
    }
    if (segment.type === "dialogue" && segment.speaker) {
      const body = segment.content.replace(/\s+/g, (run) => run.includes("\n") ? " " : run).trim();
      return `[${segment.speaker}]: "${stripSurroundingDialogueQuotes(body)}"`;
    }
    return segment.content.replace(/\r?\n(?:[ \t]*\r?\n)+/g, "\n");
  }
  function buildGameTranslationSource(message, rebuild) {
    const isGmMessage = message.role === "assistant" || message.role === "narrator" || message.role === "system";
    const plainSource = (isGmMessage ? stripGmTagsKeepReadables(message.content) : message.content.replace(/^\[(?:To the party|To the GM)]\s*/i, "")).trim();
    if (!isGmMessage && !rebuild) return plainSource;
    const segments = parseGameNarrationSegments(message);
    const rebuilt = rebuild ? rebuild(segments) : segments.map(formatGameTranslationSegment);
    return rebuilt.join("\n\n").trim() || plainSource;
  }
  return __toCommonJS(game_translation_source_entry_exports);
})();
