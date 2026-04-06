'use client';

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type ExplanationLevel = "beginner" | "intermediate" | "expert";
type FixStrategy = "minimal" | "balanced" | "rewrite";

type DebugAnalysis = {
  explanation: string;
  cause: string;
  fix: string;
  correctedCode: string;
  confidence: number;
  errorPattern: string;
  likelyBrokenLine: number;
  whatFailed: string;
  whyItFailed: string;
  brokenAssumption: string;
  recommendedFix: string;
  minimalDiffSummary: string;
  lineHighlights: number[];
};

type DebugApiResponse = {
  result?: DebugAnalysis;
  error?: string;
  warning?: string;
};

type PreviewRunState = {
  status: "idle" | "running" | "passed" | "failed";
  logs: string[];
  runtimeError: string;
};

type DiffRow = {
  lineNumber: number | null;
  content: string;
  changed: boolean;
};

const languages = ["JavaScript", "Python", "C++", "Java"];

const explanationLevels: {
  value: ExplanationLevel;
  label: string;
  description: string;
}[] = [
  { value: "beginner", label: "Beginner", description: "Clear terms, less jargon" },
  {
    value: "intermediate",
    label: "Intermediate",
    description: "Balanced detail and speed",
  },
  { value: "expert", label: "Expert", description: "Compact and technical" },
];

const fixStrategies: { value: FixStrategy; label: string }[] = [
  { value: "minimal", label: "Minimal Changes Only" },
  { value: "balanced", label: "Balanced Fix" },
  { value: "rewrite", label: "Full Rewrite" },
];

const initialAnalysis: DebugAnalysis = {
  explanation:
    "Paste your issue to get a structured debugging explanation tailored to your selected response mode.",
  cause:
    "The likely cause will summarize the root failure and point to the part of the program that deserves attention first.",
  fix:
    "A focused fix path will appear here with tradeoffs based on your selected fix strategy.",
  correctedCode:
    "// Corrected code will appear here after analysis.\n// DebugMate AI will preserve formatting so you can review the patch clearly.",
  confidence: 72,
  errorPattern: "Unknown",
  likelyBrokenLine: 0,
  whatFailed:
    "This section breaks down the exact failing behavior instead of giving a generic chatbot answer.",
  whyItFailed:
    "You will get a direct explanation of the runtime or compile-time condition that caused the issue.",
  brokenAssumption:
    "This calls out the assumption in the code or data flow that no longer holds true.",
  recommendedFix:
    "The recommended fix turns the diagnosis into a practical next step you can apply quickly.",
  minimalDiffSummary:
    "A minimal diff summary will appear here so you can review only the essential change set.",
  lineHighlights: [],
};

const previewRunIdle: PreviewRunState = {
  status: "idle",
  logs: [],
  runtimeError: "",
};

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function splitCodeLines(code: string) {
  return code.split(/\r?\n/);
}

function getLanguageKeywords(language: string) {
  switch (language) {
    case "JavaScript":
      return new Set([
        "async",
        "await",
        "break",
        "case",
        "catch",
        "class",
        "const",
        "continue",
        "default",
        "else",
        "export",
        "extends",
        "false",
        "finally",
        "for",
        "function",
        "if",
        "import",
        "let",
        "new",
        "null",
        "return",
        "switch",
        "throw",
        "true",
        "try",
        "typeof",
        "undefined",
        "var",
        "while",
      ]);
    case "Python":
      return new Set([
        "and",
        "as",
        "class",
        "def",
        "elif",
        "else",
        "False",
        "for",
        "from",
        "if",
        "import",
        "in",
        "is",
        "lambda",
        "None",
        "not",
        "or",
        "pass",
        "raise",
        "return",
        "True",
        "try",
        "while",
      ]);
    case "C++":
      return new Set([
        "auto",
        "bool",
        "break",
        "case",
        "catch",
        "class",
        "const",
        "else",
        "false",
        "for",
        "if",
        "include",
        "int",
        "namespace",
        "nullptr",
        "public",
        "private",
        "return",
        "std",
        "switch",
        "throw",
        "true",
        "try",
        "using",
        "void",
        "while",
      ]);
    case "Java":
      return new Set([
        "abstract",
        "boolean",
        "break",
        "case",
        "catch",
        "class",
        "else",
        "extends",
        "false",
        "final",
        "for",
        "if",
        "import",
        "implements",
        "int",
        "new",
        "null",
        "private",
        "protected",
        "public",
        "return",
        "static",
        "this",
        "throw",
        "true",
        "try",
        "void",
        "while",
      ]);
    default:
      return new Set<string>();
  }
}

function tokenizeLine(line: string, language: string) {
  const keywords = getLanguageKeywords(language);
  const matcher =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*$|#.*$|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b|\s+|[^\w\s]+)/g;

  return Array.from(line.matchAll(matcher)).map((match, index) => {
    const token = match[0];
    let className = "text-slate-200";

    if (/^\s+$/.test(token)) {
      className = "";
    } else if (/^(\/\/|#)/.test(token)) {
      className = "text-emerald-300";
    } else if (/^["'`]/.test(token)) {
      className = "text-amber-300";
    } else if (/^\d/.test(token)) {
      className = "text-fuchsia-300";
    } else if (keywords.has(token)) {
      className = "text-cyan-300";
    } else if (/^[()[\]{}.,;:+\-/*%=!<>|&^~?#]+$/.test(token)) {
      className = "text-slate-400";
    }

    return (
      <span key={`${token}-${index}`} className={className}>
        {token}
      </span>
    );
  });
}

function buildDiffRows(originalCode: string, fixedCode: string) {
  const originalLines = splitCodeLines(originalCode);
  const fixedLines = splitCodeLines(fixedCode);
  let prefix = 0;

  while (
    prefix < originalLines.length &&
    prefix < fixedLines.length &&
    originalLines[prefix] === fixedLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix + prefix < originalLines.length &&
    suffix + prefix < fixedLines.length &&
    originalLines[originalLines.length - 1 - suffix] ===
      fixedLines[fixedLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const originalRows: DiffRow[] = [];
  const fixedRows: DiffRow[] = [];
  const totalRows = Math.max(originalLines.length, fixedLines.length);

  for (let index = 0; index < totalRows; index += 1) {
    const originalLine = originalLines[index];
    const fixedLine = fixedLines[index];
    const changed =
      index >= prefix &&
      index < totalRows - suffix &&
      originalLine !== fixedLine;

    originalRows.push({
      lineNumber: index < originalLines.length ? index + 1 : null,
      content: originalLine ?? "",
      changed,
    });
    fixedRows.push({
      lineNumber: index < fixedLines.length ? index + 1 : null,
      content: fixedLine ?? "",
      changed,
    });
  }

  return { originalRows, fixedRows };
}

function CodeViewer({
  title,
  code,
  language,
  highlightedLines = [],
  lineRefs,
  copyAction,
  copyLabel,
  toolbarLabel,
}: {
  title: string;
  code: string;
  language: string;
  highlightedLines?: number[];
  lineRefs?: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
  copyAction?: () => void;
  copyLabel?: string;
  toolbarLabel?: string;
}) {
  const lines = splitCodeLines(code);
  const highlightSet = new Set(highlightedLines);

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/70 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
        <div>
          <p className="text-base font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs text-slate-400">{toolbarLabel || language}</p>
        </div>
        {copyAction ? (
          <button
            type="button"
            onClick={copyAction}
            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
          >
            {copyLabel || "Copy"}
          </button>
        ) : null}
      </div>
      <div className="w-full overflow-x-auto">
        <div className="max-h-[32rem] min-w-full overflow-y-auto font-mono text-sm leading-7 text-slate-200">
          {lines.map((line, index) => {
            const lineNumber = index + 1;
            const isHighlighted = highlightSet.has(lineNumber);

            return (
              <div
                key={`${title}-${lineNumber}`}
                ref={(element) => {
                  if (lineRefs) {
                    lineRefs.current[lineNumber] = element;
                  }
                }}
                className={`grid min-w-max grid-cols-[3.5rem_minmax(0,1fr)] border-b border-white/5 ${
                  isHighlighted
                    ? "bg-rose-500/10 ring-1 ring-inset ring-rose-400/30"
                    : "bg-transparent"
                }`}
              >
                <div
                  className={`select-none border-r border-white/5 px-3 py-1 text-right text-xs ${
                    isHighlighted ? "text-rose-200" : "text-slate-500"
                  }`}
                >
                  {lineNumber}
                </div>
                <div className="whitespace-pre px-4 py-1">
                  {line.length > 0 ? tokenizeLine(line, language) : "\u00A0"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DiffViewer({
  originalCode,
  fixedCode,
  language,
}: {
  originalCode: string;
  fixedCode: string;
  language: string;
}) {
  const { originalRows, fixedRows } = buildDiffRows(originalCode, fixedCode);

  const renderColumn = (title: string, rows: DiffRow[], accent: string) => (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/80">
      <div className="border-b border-white/10 px-5 py-4">
        <p className="text-base font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs text-slate-400">{language}</p>
      </div>
      <div className="w-full overflow-x-auto">
        <div className="max-h-[24rem] min-w-full overflow-y-auto font-mono text-sm leading-7 text-slate-200">
        {rows.map((row, index) => (
          <div
            key={`${title}-${index}`}
            className={`grid min-w-max grid-cols-[3.5rem_minmax(0,1fr)] border-b border-white/5 ${
              row.changed ? accent : ""
            }`}
          >
            <div className="select-none border-r border-white/5 px-3 py-1 text-right text-xs text-slate-500">
              {row.lineNumber ?? ""}
            </div>
            <div className="whitespace-pre px-4 py-1">
              {row.content.length > 0 ? tokenizeLine(row.content, language) : "\u00A0"}
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 shadow-lg shadow-black/20 sm:p-7">
      <div className="mb-6">
        <p className="text-base font-semibold text-white">Minimal-fix diff view</p>
        <p className="mt-1 text-sm text-slate-400">
          Compare original and corrected code without losing context
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {renderColumn("Original Code", originalRows, "bg-rose-500/8")}
        {renderColumn("Fixed Code", fixedRows, "bg-emerald-500/8")}
      </div>
    </section>
  );
}

function ReasoningCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="flex h-full min-h-[17rem] flex-col rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 shadow-lg shadow-black/20 sm:p-7">
      <div className="mb-5 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
        {label}
      </div>
      <p className="text-sm leading-7 text-slate-300">{value}</p>
    </article>
  );
}

export default function Home() {
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [language, setLanguage] = useState(languages[0]);
  const [userIntent, setUserIntent] = useState("");
  const [explanationLevel, setExplanationLevel] =
    useState<ExplanationLevel>("intermediate");
  const [fixStrategy, setFixStrategy] = useState<FixStrategy>("balanced");
  const [analysis, setAnalysis] = useState<DebugAnalysis>(initialAnalysis);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [submittedCode, setSubmittedCode] = useState("");
  const [submittedLanguage, setSubmittedLanguage] = useState(languages[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [previewRun, setPreviewRun] = useState<PreviewRunState>(previewRunIdle);
  const resultsRef = useRef<HTMLElement | null>(null);
  const highlightedLineRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    const firstHighlightedLine = analysis.lineHighlights[0] ?? analysis.likelyBrokenLine;
    if (!firstHighlightedLine) {
      return;
    }

    const target = highlightedLineRefs.current[firstHighlightedLine];
    if (target) {
      window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [analysis.lineHighlights, analysis.likelyBrokenLine]);

  async function handleAnalyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    setIsLoading(true);
    setRequestError("");
    setCopiedCode(false);
    setPreviewRun(previewRunIdle);
    setSubmittedCode(code);
    setSubmittedLanguage(language);

    try {
      const response = await fetch("/api/debug", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          error: errorMessage,
          language,
          intent: userIntent,
          explanationLevel,
          fixStrategy,
        }),
      });

      const data = (await response.json()) as DebugApiResponse;

      if (!data.result) {
        throw new Error(data.error || "The debug response was missing analysis data.");
      }

      setAnalysis({
        ...data.result,
        confidence: clampConfidence(data.result.confidence),
      });
      setHasAnalyzed(true);

      if (data.error) {
        setRequestError(data.error);
      } else if (data.warning) {
        setRequestError(data.warning);
      } else if (!response.ok) {
        setRequestError("The analysis completed with an unexpected server response.");
      }
    } catch (caughtError) {
      setHasAnalyzed(true);
      setAnalysis({
        ...initialAnalysis,
        correctedCode: code || initialAnalysis.correctedCode,
        lineHighlights: [],
      });
      setRequestError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while analyzing your issue.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(analysis.correctedCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      setRequestError("Copy failed. Please copy the corrected code manually.");
    }
  }

  async function handleTestMyFix() {
    setPreviewRun({
      status: "running",
      logs: [],
      runtimeError: "",
    });

    // This preview executes JavaScript inside a short-lived Web Worker so the
    // generated code does not run directly on the main UI thread. It is still a
    // lightweight preview runner, not a hardened security sandbox.
    const workerSource = `
      self.onmessage = async (event) => {
        const logs = [];
        const pushLog = (type, args) => {
          logs.push(type + ": " + args.map((value) => {
            try {
              return typeof value === "string" ? value : JSON.stringify(value);
            } catch {
              return String(value);
            }
          }).join(" "));
        };

        console.log = (...args) => pushLog("log", args);
        console.info = (...args) => pushLog("info", args);
        console.warn = (...args) => pushLog("warn", args);
        console.error = (...args) => pushLog("error", args);

        try {
          const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
          const run = new AsyncFunction(event.data.code);
          await run();
          self.postMessage({ status: "passed", logs, runtimeError: "" });
        } catch (error) {
          self.postMessage({
            status: "failed",
            logs,
            runtimeError: error instanceof Error ? (error.stack || error.message) : String(error),
          });
        }
      };
    `;

    const blob = new Blob([workerSource], { type: "text/javascript" });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    const cleanup = () => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      setPreviewRun({
        status: "failed",
        logs: [],
        runtimeError: "Preview execution timed out after 2 seconds.",
      });
    }, 2000);

    worker.onmessage = (event: MessageEvent<PreviewRunState>) => {
      window.clearTimeout(timeout);
      cleanup();
      setPreviewRun(event.data);
    };

    worker.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      setPreviewRun({
        status: "failed",
        logs: [],
        runtimeError: "The JavaScript preview runner failed to initialize.",
      });
    };

    worker.postMessage({ code: analysis.correctedCode });
  }

  const confidenceWidth = `${clampConfidence(analysis.confidence)}%`;
  const relevantHighlights =
    analysis.lineHighlights.length > 0
      ? analysis.lineHighlights
      : analysis.likelyBrokenLine > 0
        ? [analysis.likelyBrokenLine]
        : [];
  const originalPreviewCode =
    submittedCode ||
    code ||
    "// Original code preview will appear here after you analyze an issue.";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-slate-100">
      <div className="absolute inset-x-0 top-0 -z-0 h-[32rem] bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_48%),radial-gradient(circle_at_20%_20%,_rgba(14,165,233,0.12),_transparent_30%),linear-gradient(180deg,_rgba(15,23,42,0.95),_rgba(2,6,23,1))]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 sm:px-10 lg:px-12">
        <nav className="flex items-center justify-between rounded-full border border-white/10 bg-white/5 px-5 py-3 backdrop-blur">
          <Link href="/" className="text-lg font-semibold tracking-wide text-white">
            DebugMate AI
          </Link>

          <div className="flex items-center gap-6 text-sm text-slate-300">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-white"
            >
              GitHub
            </a>
            <a href="#about" className="transition hover:text-white">
              About
            </a>
          </div>
        </nav>

        <section className="grid flex-1 items-center gap-14 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-1 text-sm font-medium text-cyan-200">
              AI debugging assistant for faster fixes
            </div>

            <h1 className="mt-6 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
              Fix Your Code Faster with AI
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Paste your code and error. Get instant explanations, line-level clues,
              and a targeted fix plan.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <a
                href="#tool"
                className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Try It Now
              </a>
              <a
                href="#results"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Preview Results
              </a>
            </div>

            <div id="about" className="mt-10 grid gap-4 text-sm text-slate-400 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Exact line targeting
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Structured reasoning, not chat fluff
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Diff-first debugging workflow
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-cyan-950/30 backdrop-blur sm:p-6">
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/80 p-6">
              <div className="mb-6 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-rose-400" />
                <span className="h-3 w-3 rounded-full bg-amber-400" />
                <span className="h-3 w-3 rounded-full bg-emerald-400" />
              </div>

              <div className="space-y-4 font-mono text-sm text-slate-300">
                <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                  {"const total = items.reduce((sum, item) => sum + item.price);"}
                </div>
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-100">
                  {"TypeError: Cannot read properties of undefined (reading 'reduce')"}
                </div>
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-cyan-100">
                  DebugMate AI now returns confidence, likely line targets, minimal
                  diffs, and structured reasoning instead of a generic answer blob.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="tool"
          className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20 backdrop-blur sm:p-8"
        >
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-200/80">
                Main Tool
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-white">
                Analyze the bug with structured debugging controls
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-400">
              Tune the explanation depth and repair strategy before sending the
              issue to Gemini.
            </p>
          </div>

          <form onSubmit={handleAnalyze} className="grid gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-3 lg:col-span-2">
              <span className="text-sm font-medium text-slate-200">
                Response Mode
              </span>
              <div className="flex flex-wrap gap-3">
                {explanationLevels.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setExplanationLevel(option.value)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      explanationLevel === option.value
                        ? "border-cyan-400/40 bg-cyan-400/10 text-white"
                        : "border-white/10 bg-slate-950/70 text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <div className="text-sm font-semibold">{option.label}</div>
                    <div className="text-xs text-slate-400">{option.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-200">
                Fix Strategy
              </span>
              <select
                value={fixStrategy}
                onChange={(event) => setFixStrategy(event.target.value as FixStrategy)}
                className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
              >
                {fixStrategies.map((strategy) => (
                  <option key={strategy.value} value={strategy.value}>
                    {strategy.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
              <p className="text-sm font-medium text-slate-200">Current Mode</p>
              <p className="mt-1 text-sm text-slate-400">
                {explanationLevel.charAt(0).toUpperCase() + explanationLevel.slice(1)}{" "}
                explanation with a{" "}
                {fixStrategy === "minimal"
                  ? "minimal-edit"
                  : fixStrategy === "balanced"
                    ? "balanced"
                    : "rewrite-oriented"}{" "}
                repair strategy.
              </p>
            </div>

            <label className="flex flex-col gap-2 lg:col-span-2">
              <span className="text-sm font-medium text-slate-200">
                Paste your code
              </span>
              <textarea
                rows={10}
                placeholder={"function example() {\n  // paste your code here\n}"}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="min-h-[16rem] rounded-3xl border border-white/10 bg-slate-950/80 px-5 py-4 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-200">
                Paste your error message
              </span>
              <input
                type="text"
                placeholder="TypeError: Cannot read properties of undefined..."
                value={errorMessage}
                onChange={(event) => setErrorMessage(event.target.value)}
                className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-200">
                Language
              </span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
              >
                {languages.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 lg:col-span-2">
              <span className="text-sm font-medium text-slate-200">
                What were you trying to do?
              </span>
              <input
                type="text"
                placeholder="Optional context that helps the explanation feel smarter"
                value={userIntent}
                onChange={(event) => setUserIntent(event.target.value)}
                className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
              />
            </label>

            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "Analyzing..." : "Analyze Issue"}
              </button>
            </div>
          </form>
        </section>

        <section id="results" ref={resultsRef} className="py-16 sm:py-20">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-200/80">
                Results
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-white">
                Structured debugging analysis output
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-400">
              A focused debugging report with confidence, line-level signals, and
              before-versus-after code review.
            </p>
          </div>

          {requestError ? (
            <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {requestError}
            </div>
          ) : null}

          <div className="space-y-10">
            <div>
              <div className="mb-5">
                <p className="text-sm font-semibold text-white">Summary Row</p>
                <p className="mt-1 text-sm text-slate-400">
                  Quick signals to help you assess the bug before reading the full analysis.
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                <section className="flex h-full flex-col rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 shadow-lg shadow-black/20 sm:p-7">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                      Confidence
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold text-white">
                      {clampConfidence(analysis.confidence)}%
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                      style={{ width: confidenceWidth }}
                    />
                  </div>
                  <p className="mt-5 text-sm leading-7 text-slate-300">
                    {analysis.explanation}
                  </p>
                </section>

                <section className="flex h-full flex-col rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 shadow-lg shadow-black/20 sm:p-7">
                  <div className="mb-5 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                    Error Pattern
                  </div>
                  <p className="text-xl font-semibold text-white">{analysis.errorPattern}</p>
                  <p className="mt-5 text-sm leading-7 text-slate-300">{analysis.cause}</p>
                </section>

                <section className="flex h-full flex-col rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 shadow-lg shadow-black/20 sm:p-7">
                  <div className="mb-5 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                    Likely Broken Line
                  </div>
                  <p className="text-xl font-semibold text-white">
                    {analysis.likelyBrokenLine > 0
                      ? `Line ${analysis.likelyBrokenLine}`
                      : "Best effort pending"}
                  </p>
                  <p className="mt-5 text-sm leading-7 text-slate-300">
                    {analysis.likelyBrokenLine > 0
                      ? `Likely failure near line ${analysis.likelyBrokenLine}. Review this area first, then compare nearby highlighted lines in the preview below.`
                      : "No exact line was isolated, so DebugMate AI is relying on broader reasoning and code comparison."}
                  </p>
                </section>
              </div>
            </div>

            <div>
              <div className="mb-5">
                <p className="text-sm font-semibold text-white">Analysis Grid</p>
                <p className="mt-1 text-sm text-slate-400">
                  Structured reasoning blocks that explain the failure and the repair path.
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <ReasoningCard label="What Failed" value={analysis.whatFailed} />
                <ReasoningCard label="Why It Failed" value={analysis.whyItFailed} />
                <ReasoningCard
                  label="What Assumption Broke"
                  value={analysis.brokenAssumption}
                />
                <ReasoningCard
                  label="Recommended Fix"
                  value={analysis.recommendedFix}
                />
              </div>
            </div>

            <div>
              <div className="mb-5">
                <p className="text-sm font-semibold text-white">Code Section</p>
                <p className="mt-1 text-sm text-slate-400">
                  Review the patch, compare the diff, and optionally preview the JavaScript fix.
                </p>
              </div>

              <div className="space-y-8">
                <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 shadow-lg shadow-black/20 sm:p-7">
                  <div className="mb-5 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                    Minimal Diff Summary
                  </div>
                  <p className="text-sm leading-7 text-slate-300">
                    {analysis.minimalDiffSummary}
                  </p>
                  {relevantHighlights.length > 0 ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {relevantHighlights.map((line) => (
                        <span
                          key={`highlight-${line}`}
                          className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs font-medium text-rose-100"
                        >
                          Highlight line {line}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </section>

                <div className="grid gap-5 xl:grid-cols-2">
                  <CodeViewer
                    title="Original Code Preview"
                    code={originalPreviewCode}
                    language={submittedLanguage}
                    highlightedLines={relevantHighlights}
                    lineRefs={highlightedLineRefs}
                    toolbarLabel={
                      hasAnalyzed
                        ? "Highlighted lines reflect the likely failure area"
                        : submittedLanguage
                    }
                  />
                  <CodeViewer
                    title="Corrected Code"
                    code={analysis.correctedCode}
                    language={submittedLanguage}
                    copyAction={handleCopyCode}
                    copyLabel={copiedCode ? "Copied" : "Copy Code"}
                    toolbarLabel="Ready to copy"
                  />
                </div>

                <DiffViewer
                  originalCode={originalPreviewCode}
                  fixedCode={analysis.correctedCode}
                  language={submittedLanguage}
                />

                {submittedLanguage === "JavaScript" && hasAnalyzed ? (
                  <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 shadow-lg shadow-black/20 sm:p-7">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-white">Test My Fix</p>
                        <p className="mt-1 text-sm text-slate-400">
                          JavaScript-only preview execution in an isolated Web Worker.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleTestMyFix}
                        disabled={previewRun.status === "running"}
                        className="inline-flex items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {previewRun.status === "running" ? "Running Preview..." : "Test My Fix"}
                      </button>
                    </div>

                    <div className="mt-6 grid gap-5 md:grid-cols-2">
                      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/90 p-5">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Test Result
                        </p>
                        <p className="mt-4 text-lg font-semibold text-white">
                          {previewRun.status === "idle"
                            ? "Not run"
                            : previewRun.status === "running"
                              ? "Running"
                              : previewRun.status === "passed"
                                ? "Passed"
                                : "Failed"}
                        </p>
                      </div>
                      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/90 p-5">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Console Output
                        </p>
                        <pre className="mt-4 overflow-x-auto whitespace-pre text-sm text-slate-300">
                          <code className="font-mono">
                            {previewRun.logs.length > 0
                              ? previewRun.logs.join("\n")
                              : "// No console output captured yet."}
                          </code>
                        </pre>
                      </div>
                    </div>

                    {previewRun.runtimeError ? (
                      <div className="mt-5 rounded-[1.5rem] border border-rose-400/20 bg-rose-500/10 p-5">
                        <p className="text-xs uppercase tracking-[0.2em] text-rose-200">
                          Runtime Error
                        </p>
                        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words text-sm text-rose-100">
                          <code className="font-mono">{previewRun.runtimeError}</code>
                        </pre>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
