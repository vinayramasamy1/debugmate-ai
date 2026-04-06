'use client';

import { useRef, useState } from "react";
import Link from "next/link";

type ResultCard = {
  title: "Explanation" | "Likely Cause" | "Suggested Fix" | "Corrected Code";
  body: string;
};

type DebugApiResponse = {
  result?: {
    explanation: string;
    cause: string;
    fix: string;
    correctedCode: string;
  };
  error?: string;
  warning?: string;
};

const resultCards: ResultCard[] = [
  {
    title: "Explanation",
    body: "Get a plain-English breakdown of what the error means, where it is happening, and why it is blocking your code.",
  },
  {
    title: "Likely Cause",
    body: "Surface the most probable root issue, whether it is syntax, type mismatches, undefined values, or bad assumptions in logic.",
  },
  {
    title: "Suggested Fix",
    body: "Review a focused fix path with concrete next steps so you can patch the issue quickly and move on with confidence.",
  },
  {
    title: "Corrected Code",
    body: "See a cleaned-up version of the code block with the proposed correction applied and ready to compare.",
  },
];

const languages = ["JavaScript", "Python", "C++", "Java"];

export default function Home() {
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [language, setLanguage] = useState(languages[0]);
  const [userIntent, setUserIntent] = useState("");
  const [submittedResults, setSubmittedResults] = useState(resultCards);
  const [isLoading, setIsLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const resultsRef = useRef<HTMLElement | null>(null);

  async function handleAnalyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    setIsLoading(true);
    setRequestError("");
    setCopiedCode(false);

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
        }),
      });

      const data = (await response.json()) as DebugApiResponse;

      if (!data.result) {
        throw new Error(data.error || "The debug response was missing analysis data.");
      }

      setSubmittedResults([
        {
          title: "Explanation",
          body: data.result.explanation,
        },
        {
          title: "Likely Cause",
          body: data.result.cause,
        },
        {
          title: "Suggested Fix",
          body: data.result.fix,
        },
        {
          title: "Corrected Code",
          body: data.result.correctedCode,
        },
      ]);

      if (data.error) {
        setRequestError(data.error);
      } else if (data.warning) {
        setRequestError(data.warning);
      }
    } catch (caughtError) {
      setRequestError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while analyzing your issue.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopyCode(codeToCopy: string) {
    try {
      await navigator.clipboard.writeText(codeToCopy);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      setRequestError("Copy failed. Please copy the corrected code manually.");
    }
  }

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
              Paste your code and error. Get instant explanations and fixes.
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

            <div
              id="about"
              className="mt-10 grid gap-4 text-sm text-slate-400 sm:grid-cols-3"
            >
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Instant error breakdowns
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Language-aware suggestions
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                Cleaner fixes with less guesswork
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
                  DebugMate AI spots the issue, explains the root cause, and
                  suggests the fix in seconds.
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
                Paste your issue and review the AI-ready output
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-400">
              Send your issue to Gemini and review a structured debugging
              response without leaving the page.
            </p>
          </div>

          <form onSubmit={handleAnalyze} className="grid gap-5 lg:grid-cols-2">
            <label className="flex flex-col gap-2 lg:col-span-2">
              <span className="text-sm font-medium text-slate-200">
                Paste your code
              </span>
              <textarea
                rows={10}
                placeholder="function example() {&#10;  // paste your code here&#10;}"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="min-h-[16rem] rounded-3xl border border-white/10 bg-slate-950/80 px-5 py-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
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
                {languages.map((language) => (
                  <option key={language}>{language}</option>
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
                className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                {isLoading ? "Analyzing..." : "Analyze Issue"}
              </button>
            </div>
          </form>
        </section>

        <section
          id="results"
          ref={resultsRef}
          className="py-16 sm:py-20"
        >
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-200/80">
                Results
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-white">
                Live debugging analysis output
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-400">
              Four focused cards give users a quick path from confusion to a
              workable fix.
            </p>
          </div>

          {requestError ? (
            <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {requestError}
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {submittedResults.map((card) => (
              <article
                key={card.title}
                className={`rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 shadow-lg shadow-black/20 ${
                  card.title === "Corrected Code" ? "xl:col-span-4" : "h-full"
                }`}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                    {card.title}
                  </div>
                  {card.title === "Corrected Code" ? (
                    <button
                      type="button"
                      onClick={() => handleCopyCode(card.body)}
                      className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
                    >
                      {copiedCode ? "Copied" : "Copy Code"}
                    </button>
                  ) : null}
                </div>
                {card.title === "Corrected Code" ? (
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90">
                    <div className="border-b border-white/10 px-4 py-2 text-xs text-slate-400">
                      Ready to copy
                    </div>
                    <pre className="overflow-x-auto p-4 text-sm leading-7 text-slate-200">
                      <code className="block w-max min-w-full whitespace-pre font-mono">
                        {card.body}
                      </code>
                    </pre>
                  </div>
                ) : (
                  <div className="flex h-full min-h-52 flex-col">
                    <p className="text-sm leading-7 text-slate-300">{card.body}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
