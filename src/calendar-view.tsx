import {
  BasesAllOptions,
  BasesEntry,
  BasesPropertyId,
  BasesView,
  DateValue,
  Menu,
  parsePropertyId,
  QueryController,
  Notice,
  normalizePath,
  TFolder,
} from "obsidian";
import React, { StrictMode } from "react";
import { createRoot, Root } from "react-dom/client";
import { CalendarHandle, CalendarReactView } from "./CalendarReactView";
import { AppContext } from "./context";
import {
  CreateNoteModal,
  CreateNoteResult,
  parseFieldSpecs,
} from "./CreateNoteModal";

export const CalendarViewType = "calendar";

interface CalendarEntry {
  entry: BasesEntry;
  startDate: Date;
  endDate?: Date;
}

export class CalendarView extends BasesView {
  type = CalendarViewType;
  scrollEl: HTMLElement;
  containerEl: HTMLElement;
  root: Root | null = null;
  calendarHandleRef = React.createRef<CalendarHandle | null>();

  // Internal rendering data
  private entries: CalendarEntry[] = [];
  private startDateProp: BasesPropertyId | null = null;
  private endDateProp: BasesPropertyId | null = null;
  private weekStartDay: number = 1;

  constructor(controller: QueryController, scrollEl: HTMLElement) {
    super(controller);
    this.scrollEl = scrollEl;
    this.containerEl = scrollEl.createDiv({
      cls: "bases-calendar-container is-loading",
      attr: { tabIndex: 0 },
    });
  }

  onload(): void {
    // React components will handle their own lifecycle
  }

  onunload() {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.entries = [];
  }

  onResize(): void {
    // Tell FullCalendar to recalculate dimensions (e.g. after tab switch)
    this.calendarHandleRef.current?.updateSize();
  }

  public focus(): void {
    this.containerEl.focus({ preventScroll: true });
  }

  public onDataUpdated(): void {
    this.containerEl.removeClass("is-loading");
    this.loadConfig();
    this.updateCalendar();
  }

  private loadConfig(): void {
    this.startDateProp = this.config.getAsPropertyId("startDate");
    this.endDateProp = this.config.getAsPropertyId("endDate");
    const weekStartDayValue = this.config.get("weekStartDay") as string;

    const dayNameToNumber: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    this.weekStartDay = weekStartDayValue
      ? (dayNameToNumber[weekStartDayValue] ?? 1)
      : 1; // Default to Monday
  }

  private updateCalendar(): void {
    if (!this.data || !this.startDateProp) {
      this.root?.unmount();
      this.root = null;
      this.containerEl.empty();
      this.containerEl.createDiv("bases-calendar-empty").textContent =
        "Configure a start date property to display entries";
      return;
    }

    this.entries = [];
    for (const entry of this.data.data) {
      const startDate = this.extractDate(entry, this.startDateProp);
      if (startDate) {
        const endDate = this.endDateProp
          ? (this.extractDate(entry, this.endDateProp) ?? undefined)
          : undefined;
        this.entries.push({
          entry,
          startDate,
          endDate,
        });
      }
    }

    this.renderReactCalendar();
  }

  private renderReactCalendar(): void {
    if (!this.root) {
      this.root = createRoot(this.containerEl);
    }

    this.root.render(
      <StrictMode>
        <AppContext.Provider value={this.app}>
          <CalendarReactView
            entries={this.entries}
            weekStartDay={this.weekStartDay}
            properties={this.config.getOrder() || []}
            onEntryClick={(entry, isModEvent) => {
              void this.app.workspace.openLinkText(
                entry.file.path,
                "",
                isModEvent,
              );
            }}
            onEntryContextMenu={(evt, entry) => {
              evt.preventDefault();
              this.showEntryContextMenu(evt.nativeEvent, entry);
            }}
            onEventDrop={(entry, newStart, newEnd) =>
              this.updateEntryDates(entry, newStart, newEnd)
            }
            onDateCreate={
              this.canCreateNotes()
                ? (date) => this.createNoteOnDate(date)
                : undefined
            }
            editable={this.isEditable()}
            calendarHandleRef={this.calendarHandleRef}
          />
        </AppContext.Provider>
      </StrictMode>,
    );
  }

  private isEditable(): boolean {
    if (!this.startDateProp) return false;
    const startDateProperty = parsePropertyId(this.startDateProp);
    if (startDateProperty.type !== "note") return false;

    if (!this.endDateProp) return true;
    const endDateProperty = parsePropertyId(this.endDateProp);
    if (endDateProperty.type !== "note") return false;

    return true;
  }

  private extractDate(entry: BasesEntry, propId: BasesPropertyId): Date | null {
    try {
      const value = entry.getValue(propId);
      if (!value) return null;
      if (!(value instanceof DateValue)) return null;
      // Private API
      if ("date" in value && value.date && value.date instanceof Date) {
        return value.date;
      }

      return null;
    } catch (error) {
      console.error(`Error extracting date for ${entry.file.name}:`, error);
      return null;
    }
  }

  private showEntryContextMenu(evt: MouseEvent, entry: BasesEntry): void {
    const file = entry.file;
    const menu = Menu.forEvent(evt);

    this.app.workspace.handleLinkContextMenu(menu, file.path, "");

    menu.addItem((item) =>
      item
        .setSection("danger")
        .setTitle("Delete file")
        .setIcon("lucide-trash-2")
        .setWarning(true)
        .onClick(() => this.app.fileManager.promptForDeletion(file)),
    );
  }

  private async updateEntryDates(
    entry: BasesEntry,
    newStart: Date,
    newEnd?: Date,
  ): Promise<void> {
    if (!this.startDateProp) return;

    const file = entry.file;
    const startPropName = this.startDateProp;
    const endPropName = this.endDateProp;

    const extractedStartProp = startPropName.startsWith("note.")
      ? startPropName.slice(5)
      : null;

    const extractedEndProp = endPropName?.startsWith("note.")
      ? endPropName.slice(5)
      : null;

    const shouldUpdate =
      extractedStartProp !== null &&
      (!this.endDateProp || extractedEndProp !== null);

    if (!shouldUpdate) {
      return;
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const formatDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      frontmatter[extractedStartProp] = formatDate(newStart);
      if (this.endDateProp && newEnd && extractedEndProp) {
        frontmatter[extractedEndProp] = formatDate(newEnd);
      }
    });
  }

  /**
   * Notes can only be created when the start date is a writable `note.`
   * property - otherwise there is nowhere to record the date that was clicked.
   */
  private canCreateNotes(): boolean {
    if (!this.startDateProp) return false;
    return parsePropertyId(this.startDateProp).type === "note";
  }

  private static formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /** Resolve the configured destination folder, falling back to Obsidian's default. */
  private resolveNewNoteFolder(): TFolder {
    const configured = (this.config.get("newNoteFolder") as string) || "";
    if (configured) {
      const folder = this.app.vault.getAbstractFileByPath(
        normalizePath(configured),
      );
      if (folder instanceof TFolder) return folder;
    }
    return this.app.fileManager.getNewFileParent("");
  }

  /**
   * Create a note dated to the clicked day and open it.
   * Reuses the same `note.` property resolution as updateEntryDates().
   */
  /**
   * Prompt for a name and tags, then create a note dated to the clicked day.
   *
   * The file is written with frontmatter and an EMPTY body on purpose: Templater
   * only applies a folder template when the content after the frontmatter is
   * empty, so a trailing blank line here would silently disable it.
   */
  private createNoteOnDate(date: Date): void {
    if (!this.startDateProp) return;

    const startPropName = this.startDateProp;
    const startProp = startPropName.startsWith("note.")
      ? startPropName.slice(5)
      : null;
    if (!startProp) {
      new Notice("Calendar: start date must be a note property to create notes.");
      return;
    }

    const dateStr = CalendarView.formatDate(date);
    const template = ((this.config.get("newNoteName") as string) || "Untitled").trim();
    const defaultName = template.replace(/\{\{date\}\}/g, dateStr) || "Untitled";
    const dateLabel = date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    const specs = parseFieldSpecs(
      this.config.get("newNoteFields") as string[] | undefined,
    );

    new CreateNoteModal(this.app, dateLabel, defaultName, specs, (result) => {
      void this.writeNewNote(startProp, dateStr, result);
    }).open();
  }

  private async writeNewNote(
    startProp: string,
    dateStr: string,
    result: CreateNoteResult,
  ): Promise<void> {
    const folder = this.resolveNewNoteFolder();
    const prefix = !folder.path || folder.path === "/" ? "" : `${folder.path}/`;
    const baseName = result.name.replace(/[\/:*?"<>|]/g, "-") || "Untitled";

    let filePath = `${prefix}${baseName}.md`;
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(filePath)) {
      filePath = `${prefix}${baseName} ${counter}.md`;
      counter++;
    }

    const lines = [`${startProp}: ${dateStr}`];
    for (const field of result.fields) {
      if (field.key === startProp) continue; // already written above

      if (field.kind === "toggle") {
        lines.push(`${field.key}: ${field.toggle}`);
        continue;
      }

      if (field.kind === "tags") {
        const tags = field.text
          .split(",")
          .map((tag) => tag.trim().replace(/^#/, ""))
          .filter((tag) => tag.length > 0);
        if (tags.length === 0) {
          lines.push(`${field.key}:`);
        } else {
          lines.push(`${field.key}:`);
          for (const tag of tags) lines.push(`  - ${tag}`);
        }
        continue;
      }

      const value = field.text.trim();
      lines.push(value ? `${field.key}: ${value}` : `${field.key}:`);
    }

    // No trailing body - Templater only applies a folder template when the
    // content after the frontmatter is empty.
    const content = `---\n${lines.join("\n")}\n---\n`;

    try {
      const file = await this.app.vault.create(filePath, content);
      if (result.open) {
        await this.app.workspace.getLeaf(false).openFile(file);
      }
    } catch (error) {
      console.error("Error creating note from calendar:", error);
      new Notice("Calendar: could not create the note.");
    }
  }

  public setEphemeralState(state: unknown): void {
    // State management could be extended for React component
  }

  public getEphemeralState(): unknown {
    return {};
  }

  static getViewOptions(): BasesAllOptions[] {
    return [
      {
        displayName: "Date properties",
        type: "group",
        items: [
          {
            displayName: "Start date",
            type: "property",
            key: "startDate",
            placeholder: "Property",
          },
          {
            displayName: "End date (optional)",
            type: "property",
            key: "endDate",
            placeholder: "Property",
          },
        ],
      },
      {
        displayName: "Calendar options",
        type: "group",
        items: [
          {
            displayName: "Week starts on",
            type: "dropdown",
            key: "weekStartDay",
            default: "monday",
            options: {
              sunday: "Sunday",
              monday: "Monday",
              tuesday: "Tuesday",
              wednesday: "Wednesday",
              thursday: "Thursday",
              friday: "Friday",
              saturday: "Saturday",
            },
          },
        ],
      },
      {
        displayName: "New notes",
        type: "group",
        items: [
          {
            displayName: "Folder",
            type: "folder",
            key: "newNoteFolder",
            placeholder: "Default location for new notes",
          },
          {
            displayName: "Name",
            type: "text",
            key: "newNoteName",
            default: "Untitled",
            placeholder: "Untitled - supports {{date}}",
          },
          {
            displayName: "Fields to prompt for",
            type: "multitext",
            key: "newNoteFields",
            default: ["tags"],
          },
        ],
      },
    ];
  }
}
