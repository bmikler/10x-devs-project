// Variant unions for the shared presentational components.
//
// These live in a real `.ts` module (not inline in each `.astro` frontmatter)
// because the typed-lint project service does not resolve type aliases declared
// locally in `.astro` frontmatter — it leaves `Astro.props` error-typed and the
// strict lint rules then fail. Imported types from a `.ts` module are part of
// the TS program and resolve correctly. (For a JVM dev: think of this as a
// shared enum kept in its own file so every consumer references one definition.)

export type CardVariant = "default" | "amber" | "error";

export type AlertVariant = "success" | "error" | "warning";
