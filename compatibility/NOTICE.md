# Game translation source compatibility

`game-translation-source.js` contains only the display/source-formatting helpers needed for Game translation from the local Marinara Engine 2.5.0 checkout. It is a standalone, readable JavaScript snapshot; it does not access or modify the Engine at runtime.

Copyright: Marinara Engine contributors.
License: GNU Affero General Public License, version 3 (AGPL-3.0). The complete license is included as `MARINARA-LICENSE`. This component is not covered by the extension's MIT license.

Original source files: `packages/shared/src/utils/game-narration-text.ts`, with the display-only stripping helpers from `dice-branch.ts` and `sheet-command-tag.ts` in the same directory. The JavaScript snapshot removes TypeScript annotations, module-loading helpers, and unused functions; the source-formatting behavior is preserved.

Source revision: [c8881d16a866a06478db4615dda2edfcf40770e5](https://github.com/Pasta-Devs/Marinara-Engine/tree/c8881d16a866a06478db4615dda2edfcf40770e5/packages/shared/src/utils).
