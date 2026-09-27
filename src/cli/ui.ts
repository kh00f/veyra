// VEYRA terminal UI. ANSI escapes only — no dependencies.
//
// Design: mint-on-charcoal terminal with a small mascot (the sentinel
// face) as the brand mark. Animations are \r-based and degrade
// gracefully. Nothing is copied from another CLI.
//
// Degrades to plain text when NO_COLOR=1 or TERM=dumb.

const useColor =
  process.env.NO_COLOR !== "1" &&
  process.env.TERM !== "dumb" &&
  process.stdout.isTTY === true;

const esc = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const c = {
  // base — slate
  text:  (s: string) => esc("38;5;253", s),
  muted: (s: string) => esc("38;5;245", s),
  faint: (s: string) => esc("38;5;240", s),

  // signature — mint
  mint: (s: string) => esc("38;5;114", s),

  // accents
  cyan:    (s: string) => esc("38;5;110", s),
  magenta: (s: string) => esc("38;5;175", s),
  gold:    (s: string) => esc("38;5;179", s),
  orange:  (s: string) => esc("38;5;173", s),
  red:     (s: string) => esc("38;5;174", s),

  bold:   (s: string) => esc("1", s),
  italic: (s: string) => esc("3", s),

  // Backwards-compat aliases
  dim:   (s: string) => esc("38;5;240", s),
  amber: (s: string) => esc("38;5;114", s),
  green: (s: string) => esc("38;5;114", s),
};

// ── Brand mark ──────────────────────────────────────────────
// VEYRA's mascot: a small sentinel face. Two scanning eyes, a neutral
// expression, standing on two legs. Mint body, magenta eyes.
function mark(): string[] {
  const e = c.magenta("◉");
  const m = c.mint;
  return [
    `  ${m("╭─────╮")}`,
    `  ${m("│")} ${e} ${e} ${m("│")}`,
    `  ${m("│")} ${m("ᴗᴗ")}  ${m("│")}`,
    `  ${m("╰─┬─┬─╯")}`,
    `    ${m("╱ ╲")}`,
  ];
}

// ── Greeting ────────────────────────────────────────────────
const GREETINGS = [
  "surface mapped, board open — what's the job?",
  "scope loaded. give me a target or a question.",
  "recon, validate, report. where do we start?",
  "the lab is quiet. what are we looking at?",
  "ready when you are.",
  "state the target or ask a question.",
  "fresh session. what's first?",
  "recon → findings → report. your move.",
  "what's on the board today?",
  "in scope, out of scope — say the word.",
];

export function pickGreeting(): string {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

// ── Banner ──────────────────────────────────────────────────
// Mascot on the left, text on the right, top-aligned.
// One rule below, then the greeting.
export function banner(version: string, provider: string, greeting: string): string {
  const ruleWidth = 66;
  const rule = c.faint("  " + "─".repeat(ruleWidth));

  const m = mark();
  const left = m.map((line) => "  " + line);

  const right = [
    "",
    "  " + c.bold(c.mint("VEYRA")) + c.faint("  ·  ") + c.muted("v" + version),
    "  " + c.muted("autonomous AI-assisted penetration testing"),
    "",
    "  " + c.faint("provider") + c.muted(" → ") + c.cyan(provider),
  ];

  // Side-by-side compose. Mark has 5 rows, right block has 5 rows.
  const rows: string[] = [];
  const maxRows = Math.max(left.length, right.length);
  for (let i = 0; i < maxRows; i++) {
    const l = left[i] ?? "         ";
    const r = right[i] ?? "";
    rows.push(l + r);
  }

  return [
    "",
    ...rows,
    "",
    "  " + c.italic(c.text(greeting)),
    "",
    rule,
    "",
  ].join("\n");
}

// ── Status line ─────────────────────────────────────────────
// Optional one-liner:  ● veyra · engagement · skill · provider
export function statusLine(parts: {
  engagement?: string | null;
  skill?: string | null;
  provider?: string;
}): string {
  const sep = c.faint(" · ");
  const bits: string[] = [c.mint("●") + " " + c.bold(c.mint("veyra"))];
  if (parts.engagement) bits.push(c.text(parts.engagement));
  if (parts.skill) bits.push(c.muted("skill ") + c.cyan(parts.skill));
  if (parts.provider) bits.push(c.muted(parts.provider));
  return "  " + bits.join(sep);
}

// ── Spinner ─────────────────────────────────────────────────
// Braille frames in magenta, with a live elapsed counter.
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private i = 0;
  private text = "";
  private started = 0;

  start(text: string): void {
    if (!useColor) {
      process.stdout.write(`  ${text}\n`);
      return;
    }
    this.text = text;
    this.i = 0;
    this.started = Date.now();
    this.timer = setInterval(() => this.render(), 80);
    this.render();
  }

  private render(): void {
    const frame = FRAMES[this.i++ % FRAMES.length];
    const elapsed = ((Date.now() - this.started) / 1000).toFixed(1);
    const line =
      "  " +
      c.magenta(frame) +
      "  " +
      c.text(this.text) +
      "  " +
      c.faint(elapsed + "s");
    process.stdout.write("\r\x1b[2K" + line);
  }

  setText(text: string): void {
    this.text = text;
  }

  stop(finalText?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (useColor) {
      process.stdout.write("\r\x1b[2K");
    }
    if (finalText) {
      process.stdout.write("  " + finalText + "\n");
    }
  }
}

// ── Progress bar ────────────────────────────────────────────
export function progress(current: number, total: number, label: string): void {
  if (!useColor) {
    process.stdout.write(`  [${current}/${total}] ${label}\n`);
    return;
  }
  const width = 20;
  const filled = Math.min(width, Math.round((current / total) * width));
  const bar = c.mint("▰".repeat(filled)) + c.faint("▱".repeat(width - filled));
  process.stdout.write(
    "\r\x1b[2K" + `  ${bar}  ${c.faint(`${current}/${total}`)}  ${c.text(label)}`,
  );
  if (current === total) process.stdout.write("\n");
}

// ── Output helpers ──────────────────────────────────────────
export function step(msg: string): void {
  process.stdout.write("  " + c.mint("›") + " " + c.text(msg) + "\n");
}

export function info(msg: string): void {
  process.stdout.write("  " + c.muted(msg) + "\n");
}

export function ok(msg: string): void {
  process.stdout.write("  " + c.mint("✓") + " " + c.text(msg) + "\n");
}

export function err(msg: string): void {
  process.stdout.write("  " + c.red("✗") + " " + c.text(msg) + "\n");
}

export function rule(): void {
  process.stdout.write(c.faint("  " + "─".repeat(66)) + "\n");
}

export function block(title: string): void {
  process.stdout.write("\n  " + c.mint(title) + "\n");
}

export function blockEnd(): void {
  process.stdout.write("\n");
}

// ── Findings ────────────────────────────────────────────────
export function finding(id: string, state: string, severity: string, title: string): void {
  const sev =
    severity === "Critical" ? c.red(severity) :
    severity === "High"     ? c.orange(severity) :
    severity === "Medium"   ? c.gold(severity) :
    severity === "Low"      ? c.cyan(severity) :
                              c.muted(severity);

  const stateColored =
    state === "VALIDATED" || state === "REPORTED" ? c.mint(state) :
    state === "VALIDATING"                         ? c.gold(state) :
    state === "POTENTIAL"                          ? c.cyan(state) :
                                                     c.muted(state);

  process.stdout.write(
    "  " +
    c.faint(id) + "  " +
    c.faint("[") + stateColored + c.faint("]") + "  " +
    sev.padEnd(20) + "  " +
    c.text(title) + "\n",
  );
}

// ── Prompt ──────────────────────────────────────────────────
// The mascot's eye as the caret — consistent with the banner mark.
export function prompt(): string {
  return c.magenta("◉") + " " + c.mint("veyra") + " " + c.faint("›");
}

// ── Typewriter ──────────────────────────────────────────────
export async function typeLine(text: string, ms = 12): Promise<void> {
  if (!useColor) {
    process.stdout.write(text + "\n");
    return;
  }
  for (const ch of text) {
    process.stdout.write(ch);
    await new Promise((r) => setTimeout(r, ms));
  }
  process.stdout.write("\n");
}

// ── Boot animation ──────────────────────────────────────────
// Short blink-on-launch: the mascot's eyes open, blink, open.
// Skipped entirely when NO_COLOR=1 or stdout is not a TTY.
export async function bootAnimation(): Promise<void> {
  if (!useColor) return;

  const open   = c.magenta("◉");
  const closed = c.mint("–");
  const m = c.mint;

  const frames: [string, string, string][] = [
    [closed, closed, "…"],       // eyes closed
    [open,   closed, "·"],       // left opens
    [open,   open,   "·"],       // both open
    [closed, closed, "·"],       // blink
    [open,   open,   "✓"],       // ready
  ];

  for (const [l, r, tail] of frames) {
    process.stdout.write("\r\x1b[2K");
    process.stdout.write(
      `  ${m("│")} ${l} ${r} ${m("│")}  ${c.faint("initialising " + tail)}`,
    );
    await new Promise((res) => setTimeout(res, 110));
  }
  process.stdout.write("\r\x1b[2K");
}
