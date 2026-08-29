import { AbstractInputSuggest, App } from "obsidian";

/**
 * Collect every tag in the vault, ordered by how recently it was used - the
 * most recently modified note carrying a tag decides that tag's position, with
 * ties broken by how often the tag is used.
 * Reads only documented metadata APIs.
 */
export function collectVaultTags(app: App): string[] {
  const lastUsed = new Map<string, number>();
  const uses = new Map<string, number>();

  const bump = (rawTag: unknown, mtime: number) => {
    if (typeof rawTag !== "string") return;
    const tag = rawTag.replace(/^#/, "").trim();
    if (!tag) return;
    const current = lastUsed.get(tag);
    if (current === undefined || mtime > current) lastUsed.set(tag, mtime);
    uses.set(tag, (uses.get(tag) ?? 0) + 1);
  };

  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache) continue;
    const mtime = file.stat.mtime;

    for (const tagCache of cache.tags ?? []) bump(tagCache.tag, mtime);

    const frontmatterTags = cache.frontmatter?.tags;
    if (typeof frontmatterTags === "string") {
      for (const part of frontmatterTags.split(",")) bump(part, mtime);
    } else if (Array.isArray(frontmatterTags)) {
      for (const part of frontmatterTags) bump(part, mtime);
    }
  }

  return [...lastUsed.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        (uses.get(b[0]) ?? 0) - (uses.get(a[0]) ?? 0) ||
        a[0].localeCompare(b[0]),
    )
    .map(([tag]) => tag);
}

/** Split "a, b, c" into the committed tags and the token being typed. */
function splitTokens(value: string): { committed: string[]; current: string } {
  const parts = value.split(",");
  const current = (parts.pop() ?? "").trim();
  const committed = parts
    .map((part) => part.trim().replace(/^#/, ""))
    .filter((part) => part.length > 0);
  return { committed, current };
}

/**
 * Autocomplete for a comma-separated tag input. Suggests against the token
 * currently being typed and leaves earlier tags untouched.
 */
export class TagSuggest extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    private textInput: HTMLInputElement,
    private allTags: string[],
    private onPick: (nextValue: string) => void,
  ) {
    super(app, textInput);
    this.limit = 20;
  }

  protected getSuggestions(query: string): string[] {
    const { committed, current } = splitTokens(query ?? "");
    const needle = current.replace(/^#/, "").toLowerCase();
    const taken = new Set(committed.map((tag) => tag.toLowerCase()));

    return this.allTags
      .filter((tag) => !taken.has(tag.toLowerCase()))
      .filter((tag) => !needle || tag.toLowerCase().includes(needle))
      .slice(0, this.limit || 20);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  selectSuggestion(value: string): void {
    const raw = this.textInput.value;
    const lastComma = raw.lastIndexOf(",");
    const prefix = lastComma === -1 ? "" : `${raw.slice(0, lastComma + 1)} `;
    const next = `${prefix}${value}, `;

    this.setValue(next);
    this.onPick(next);
    this.textInput.focus();
    this.close();
  }
}
