# UI design provenance

The current interface follows **design study C**, selected after three successful built-in image-generation rounds. One earlier request failed with a response-decoding/network error and was retried through the same built-in tool. No CLI fallback or unverified model name is claimed.

- `selected-ui-c.png`: the generated design study. It is a layout/control reference, not a screenshot or evidence of working software.
- `prompts.json`: the full prompts used for the three successful studies. Round C used A and B as references.
- `implemented-home.png`, `implemented-room.png`: actual browser screenshots of the current application, refreshed at delivery.
- `history/`: the superseded UI reference, original art prompts, and the previous actual homepage screenshot, retained for design history only.
- `../../artifacts/` at repository root is ignored local verification output; do not confuse it with generated concepts.

The product is built with React, Mantine, Tabler icons and CSS. **No generated decorative images, scene textures or design boards are loaded by product screens.** The forest/desert artwork was removed from public assets and archived locally under `.cache/retired-art/`; its generation originals remain in Codex's generated-image directory.

The generated study is interpreted rather than pasted into the page. Its misleading “room code” hint, duplicate fullscreen controls and fake subtitle metadata are not implemented. The real application uses full private invitation links, capability detection, actual file preflight and actual playback/connection state.

See `INTERACTION.md` for the implemented layout and state model. Design-only images stay outside the public directory and the Docker build excludes this design directory.
