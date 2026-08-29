import { App, Modal, Setting } from "obsidian";
import { collectVaultTags, TagSuggest } from "./TagSuggest";

export type FieldKind = "text" | "tags" | "toggle";

export interface FieldSpec {
  /** Frontmatter property name. */
  key: string;
  kind: FieldKind;
  /** Initial value, taken from the `key=default` form in the view options. */
  defaultValue: string;
}

export interface FieldValue {
  key: string;
  kind: FieldKind;
  text: string;
  toggle: boolean;
}

export interface CreateNoteResult {
  name: string;
  fields: FieldValue[];
  open: boolean;
}

/**
 * Parse the `newNoteFields` view option. Each entry is a property name with an
 * optional default: `status=not-started`. A default of true/false makes the
 * field a toggle; a property named `tags` is treated as a YAML list.
 */
export function parseFieldSpecs(raw: string[] | undefined): FieldSpec[] {
  if (!raw) return [];
  const specs: FieldSpec[] = [];
  for (const item of raw) {
    const entry = (item ?? "").trim();
    if (!entry) continue;

    const eq = entry.indexOf("=");
    const key = (eq === -1 ? entry : entry.slice(0, eq)).trim();
    const defaultValue = eq === -1 ? "" : entry.slice(eq + 1).trim();
    if (!key) continue;

    let kind: FieldKind = "text";
    if (key.toLowerCase() === "tags") kind = "tags";
    else if (/^(true|false)$/i.test(defaultValue)) kind = "toggle";

    specs.push({ key, kind, defaultValue });
  }
  return specs;
}

/**
 * Prompt for a note name and its properties so a note can be created from the
 * calendar without navigating away from the current view.
 */
export class CreateNoteModal extends Modal {
  private name: string;
  private values: FieldValue[];
  private submitted = false;
  private readonly vaultTags: string[];

  constructor(
    app: App,
    private dateLabel: string,
    defaultName: string,
    specs: FieldSpec[],
    private onSubmit: (result: CreateNoteResult) => void,
  ) {
    super(app);
    this.name = defaultName;
    this.vaultTags = specs.some((spec) => spec.kind === "tags")
      ? collectVaultTags(app)
      : [];
    this.values = specs.map((spec) => ({
      key: spec.key,
      kind: spec.kind,
      text: spec.kind === "toggle" ? "" : spec.defaultValue,
      toggle: spec.kind === "toggle" && /^true$/i.test(spec.defaultValue),
    }));
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("bases-calendar-create-modal");
    this.setTitle(`New note - ${this.dateLabel}`);

    const submitOnEnter = (input: HTMLInputElement) => {
      input.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") {
          evt.preventDefault();
          this.submit(false);
        }
      });
    };

    new Setting(contentEl).setName("Name").addText((text) => {
      text
        .setPlaceholder("Untitled")
        .setValue(this.name)
        .onChange((value) => (this.name = value));
      submitOnEnter(text.inputEl);
      window.setTimeout(() => {
        text.inputEl.focus();
        text.inputEl.select();
      }, 0);
    });

    for (const value of this.values) {
      const setting = new Setting(contentEl).setName(value.key);

      if (value.kind === "toggle") {
        setting.addToggle((toggle) =>
          toggle
            .setValue(value.toggle)
            .onChange((checked) => (value.toggle = checked)),
        );
        continue;
      }

      if (value.kind === "tags") {
        setting.setDesc("Comma separated. The leading # is optional.");
      }

      setting.addText((text) => {
        text
          .setValue(value.text)
          .onChange((next) => (value.text = next));

        if (value.kind === "tags") {
          text.setPlaceholder("reading, urgent");
          new TagSuggest(this.app, text.inputEl, this.vaultTags, (next) => {
            value.text = next;
          });
        }

        submitOnEnter(text.inputEl);
      });
    }

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Create and open").onClick(() => this.submit(true)),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Create")
          .setCta()
          .onClick(() => this.submit(false)),
      );
  }

  private submit(open: boolean): void {
    if (this.submitted) return;
    this.submitted = true;
    const name = this.name.trim() || "Untitled";
    this.close();
    this.onSubmit({ name, fields: this.values, open });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
