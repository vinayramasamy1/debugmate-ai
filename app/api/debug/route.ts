import { GoogleGenAI } from "@google/genai";

type ExplanationLevel = "beginner" | "intermediate" | "expert";
type FixStrategy = "minimal" | "balanced" | "rewrite";

type DebugRequestBody = {
  code?: unknown;
  error?: unknown;
  language?: unknown;
  intent?: unknown;
  explanationLevel?: unknown;
  fixStrategy?: unknown;
};

type DebugResponse = {
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

const debugResponseSchema = {
  type: "object",
  properties: {
    explanation: { type: "string" },
    cause: { type: "string" },
    fix: { type: "string" },
    correctedCode: { type: "string" },
    confidence: { type: "number" },
    errorPattern: { type: "string" },
    likelyBrokenLine: { type: "number" },
    whatFailed: { type: "string" },
    whyItFailed: { type: "string" },
    brokenAssumption: { type: "string" },
    recommendedFix: { type: "string" },
    minimalDiffSummary: { type: "string" },
    lineHighlights: {
      type: "array",
      items: { type: "number" },
    },
  },
  required: [
    "explanation",
    "cause",
    "fix",
    "correctedCode",
    "confidence",
    "errorPattern",
    "likelyBrokenLine",
    "whatFailed",
    "whyItFailed",
    "brokenAssumption",
    "recommendedFix",
    "minimalDiffSummary",
    "lineHighlights",
  ],
  additionalProperties: false,
} as const;

const explanationLevels: ExplanationLevel[] = [
  "beginner",
  "intermediate",
  "expert",
];

const fixStrategies: FixStrategy[] = ["minimal", "balanced", "rewrite"];

function isExplanationLevel(value: unknown): value is ExplanationLevel {
  return typeof value === "string" && explanationLevels.includes(value as ExplanationLevel);
}

function isFixStrategy(value: unknown): value is FixStrategy {
  return typeof value === "string" && fixStrategies.includes(value as FixStrategy);
}

function isDebugRequestBody(value: DebugRequestBody): value is {
  code: string;
  error: string;
  language: string;
  intent: string;
  explanationLevel: ExplanationLevel;
  fixStrategy: FixStrategy;
} {
  return (
    typeof value.code === "string" &&
    typeof value.error === "string" &&
    typeof value.language === "string" &&
    typeof value.intent === "string" &&
    isExplanationLevel(value.explanationLevel) &&
    isFixStrategy(value.fixStrategy)
  );
}

function normalizeGeminiJson(text: string) {
  return text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
}

function classifyErrorPattern(error: string) {
  const message = error.toLowerCase();

  if (
    message.includes("cannot read properties of undefined") ||
    message.includes("cannot read property") ||
    message.includes("nullpointerexception") ||
    message.includes("undefined is not an object") ||
    message.includes("null")
  ) {
    return "Null / Undefined Reference";
  }

  if (
    message.includes("referenceerror") ||
    message.includes("is not defined") ||
    message.includes("undefined variable")
  ) {
    return "Undefined Variable / Reference";
  }

  if (
    message.includes("typeerror") ||
    message.includes("cannot convert") ||
    message.includes("type mismatch")
  ) {
    return "Type Mismatch";
  }

  if (
    message.includes("syntaxerror") ||
    message.includes("indentationerror") ||
    message.includes("unexpected token")
  ) {
    return "Syntax Error";
  }

  if (
    message.includes("indexerror") ||
    message.includes("out of range") ||
    message.includes("out of bounds")
  ) {
    return "Out-of-Bounds / Index Error";
  }

  if (
    message.includes("control reaches end of non-void function") ||
    message.includes("missing return")
  ) {
    return "Missing Return";
  }

  if (message.includes("logic")) {
    return "Logic Error";
  }

  return "Unknown";
}

function detectLikelyBrokenLine(error: string) {
  const match = error.match(/line\s+(\d+)/i) || error.match(/:(\d+):\d+/);
  return match ? Number(match[1]) : 0;
}

function normalizeLineHighlights(value: unknown, fallbackLine: number) {
  const normalized = Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    : [];

  const unique = [...new Set(normalized)];

  if (unique.length > 0) {
    return unique.slice(0, 6);
  }

  return fallbackLine > 0 ? [fallbackLine] : [];
}

function buildFallbackResponse(input: {
  code: string;
  error: string;
  language: string;
  intent: string;
  explanationLevel: ExplanationLevel;
  fixStrategy: FixStrategy;
}): DebugResponse {
  const errorPattern = classifyErrorPattern(input.error);
  const likelyBrokenLine = detectLikelyBrokenLine(input.error);

  return {
    explanation:
      input.explanationLevel === "beginner"
        ? `DebugMate AI could not fully structure the Gemini response, but this appears to be a ${input.language} issue that needs a focused review near the failing logic path.`
        : input.explanationLevel === "expert"
          ? `Fallback analysis: structured Gemini output was unavailable, so this response uses local heuristics around the reported ${input.language} failure.`
          : `Gemini returned an incomplete structured response, so this fallback analysis uses the submitted code and error to keep the UI stable.`,
    cause: input.error
      ? `The strongest available clue is the reported error: "${input.error}".`
      : "No explicit error message was provided, so the likely cause is inferred from the submitted code and intent.",
    fix:
      input.fixStrategy === "minimal"
        ? "Prefer the smallest safe code change that removes the immediate failure without restructuring unaffected logic."
        : input.fixStrategy === "rewrite"
          ? "Consider rewriting the failing section more clearly so data flow and assumptions are easier to reason about."
          : "Apply a balanced fix that corrects the bug while improving readability and guard conditions.",
    correctedCode:
      input.code || "// No code was submitted, so there is no corrected code to display yet.",
    confidence: input.error ? 62 : 48,
    errorPattern,
    likelyBrokenLine,
    whatFailed: "The program hit an error state that the current code path did not guard against.",
    whyItFailed:
      "The failure likely came from a mismatch between the runtime data the code expected and the data it actually received.",
    brokenAssumption: input.intent
      ? `The code assumes it can safely complete the task "${input.intent}" with the current inputs and state.`
      : "The code assumes a value, type, or control path exists when it may not at runtime.",
    recommendedFix:
      "Inspect the highlighted path first, validate inputs before using them, and confirm that the failing operation is safe for the current state.",
    minimalDiffSummary:
      input.fixStrategy === "minimal"
        ? "Aim for a minimal patch around the failing line or guard condition."
        : input.fixStrategy === "rewrite"
          ? "A broader refactor may be justified if the original logic is brittle or hard to follow."
          : "Patch the immediate bug while clarifying the local logic around the failure.",
    lineHighlights: likelyBrokenLine > 0 ? [likelyBrokenLine] : [],
  };
}

function sanitizeDebugResponse(
  parsed: Partial<DebugResponse>,
  fallback: DebugResponse,
): DebugResponse {
  const likelyBrokenLine =
    typeof parsed.likelyBrokenLine === "number" && parsed.likelyBrokenLine > 0
      ? Math.round(parsed.likelyBrokenLine)
      : fallback.likelyBrokenLine;

  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
      : fallback.confidence;

  return {
    explanation:
      typeof parsed.explanation === "string" && parsed.explanation.trim().length > 0
        ? parsed.explanation
        : fallback.explanation,
    cause:
      typeof parsed.cause === "string" && parsed.cause.trim().length > 0
        ? parsed.cause
        : fallback.cause,
    fix:
      typeof parsed.fix === "string" && parsed.fix.trim().length > 0
        ? parsed.fix
        : fallback.fix,
    correctedCode:
      typeof parsed.correctedCode === "string" && parsed.correctedCode.trim().length > 0
        ? parsed.correctedCode
        : fallback.correctedCode,
    confidence,
    errorPattern:
      typeof parsed.errorPattern === "string" && parsed.errorPattern.trim().length > 0
        ? parsed.errorPattern
        : fallback.errorPattern,
    likelyBrokenLine,
    whatFailed:
      typeof parsed.whatFailed === "string" && parsed.whatFailed.trim().length > 0
        ? parsed.whatFailed
        : fallback.whatFailed,
    whyItFailed:
      typeof parsed.whyItFailed === "string" && parsed.whyItFailed.trim().length > 0
        ? parsed.whyItFailed
        : fallback.whyItFailed,
    brokenAssumption:
      typeof parsed.brokenAssumption === "string" &&
      parsed.brokenAssumption.trim().length > 0
        ? parsed.brokenAssumption
        : fallback.brokenAssumption,
    recommendedFix:
      typeof parsed.recommendedFix === "string" &&
      parsed.recommendedFix.trim().length > 0
        ? parsed.recommendedFix
        : fallback.recommendedFix,
    minimalDiffSummary:
      typeof parsed.minimalDiffSummary === "string" &&
      parsed.minimalDiffSummary.trim().length > 0
        ? parsed.minimalDiffSummary
        : fallback.minimalDiffSummary,
    lineHighlights: normalizeLineHighlights(parsed.lineHighlights, likelyBrokenLine),
  };
}

export async function POST(request: Request) {
  let requestBody: DebugRequestBody;

  try {
    requestBody = (await request.json()) as DebugRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isDebugRequestBody(requestBody)) {
    return Response.json(
      {
        error:
          "Request body must include string values for code, error, language, intent, explanationLevel, and fixStrategy.",
      },
      { status: 400 },
    );
  }

  const { code, error, language, intent, explanationLevel, fixStrategy } = requestBody;
  const fallback = buildFallbackResponse({
    code,
    error,
    language,
    intent,
    explanationLevel,
    fixStrategy,
  });

  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      {
        error:
          "Gemini API key is missing. Set GEMINI_API_KEY to enable live debugging analysis.",
        result: fallback,
      },
      { status: 500 },
    );
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const explanationGuidance =
    explanationLevel === "beginner"
      ? "Use simple language, define jargon briefly, and explain the bug step by step."
      : explanationLevel === "expert"
        ? "Be concise, technical, and precise. Assume the developer is comfortable with advanced terminology."
        : "Use balanced technical depth with enough explanation to teach the user without overexplaining.";

  const strategyGuidance =
    fixStrategy === "minimal"
      ? "Prefer the smallest safe patch and keep the original structure whenever possible."
      : fixStrategy === "rewrite"
        ? "You may rewrite the affected section more substantially if it creates a clearer and safer solution."
        : "Choose a balanced fix that resolves the bug while improving local clarity and safety.";

  // Gemini prompt definition:
  // The model is instructed to act like a debugging engine, not a chat bot.
  // It must return strict JSON only, adapt explanation depth to the selected
  // response mode, and adjust fix aggressiveness to the chosen strategy.
  const prompt = `
You are DebugMate AI, a structured debugging engine.
Return JSON only. Do not use markdown fences. Do not include extra prose.

Explanation mode instructions:
${explanationGuidance}

Fix strategy instructions:
${strategyGuidance}

Return strict JSON with exactly this shape:
{
  "explanation": "",
  "cause": "",
  "fix": "",
  "correctedCode": "",
  "confidence": 0,
  "errorPattern": "",
  "likelyBrokenLine": 0,
  "whatFailed": "",
  "whyItFailed": "",
  "brokenAssumption": "",
  "recommendedFix": "",
  "minimalDiffSummary": "",
  "lineHighlights": [0]
}

Rules:
- confidence must be a number from 0 to 100.
- likelyBrokenLine must be the best-effort line number, or 0 if unknown.
- lineHighlights must be an array of likely relevant line numbers.
- correctedCode must contain valid code only with no markdown fences.
- errorPattern should be a concise debugging category.
- minimalDiffSummary should summarize the smallest useful change set.

Submission:
- Language: ${language}
- Error: ${error || "No error message provided"}
- Intent: ${intent || "No intent provided"}

Code:
${code || "No code provided"}
`.trim();

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: debugResponseSchema,
        temperature: 0.2,
      },
    });

    const rawText = normalizeGeminiJson(response.text ?? "");

    try {
      const parsed = JSON.parse(rawText) as Partial<DebugResponse>;
      const result = sanitizeDebugResponse(parsed, fallback);

      return Response.json({
        result: {
          ...result,
          errorPattern:
            result.errorPattern === "Unknown"
              ? classifyErrorPattern(error)
              : result.errorPattern,
        },
      });
    } catch {
      return Response.json({
        warning: "Gemini returned a non-JSON or malformed JSON response.",
        result: fallback,
      });
    }
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "An unexpected Gemini request error occurred.";

    return Response.json(
      {
        error: `Gemini request failed: ${message}`,
        result: fallback,
      },
      { status: 500 },
    );
  }
}
