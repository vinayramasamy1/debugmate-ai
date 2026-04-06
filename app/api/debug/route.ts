import { GoogleGenAI } from "@google/genai";

type DebugRequestBody = {
  code?: unknown;
  error?: unknown;
  language?: unknown;
  intent?: unknown;
};

type DebugResponse = {
  explanation: string;
  cause: string;
  fix: string;
  correctedCode: string;
};

const debugResponseSchema = {
  type: "object",
  properties: {
    explanation: { type: "string" },
    cause: { type: "string" },
    fix: { type: "string" },
    correctedCode: { type: "string" },
  },
  required: ["explanation", "cause", "fix", "correctedCode"],
  additionalProperties: false,
} as const;

function createFallbackResponse(
  language: string,
  error: string,
  code: string,
  intent: string,
): DebugResponse {
  return {
    explanation: `DebugMate AI could not parse a structured Gemini response for this ${language} issue, so this fallback summary is being shown instead.`,
    cause: error
      ? `The reported error was "${error}", which is the strongest available clue for the likely failure point.`
      : "No error message was provided, so the likely cause is based only on the submitted code and context.",
    fix: intent
      ? `Start by checking the part of the code related to "${intent}" and verify the values, types, and control flow around the failing path.`
      : "Review the failing code path, validate inputs, and confirm that variables and data structures match your expectations.",
    correctedCode:
      code || "// No code was submitted, so there is no corrected code to display yet.",
  };
}

function isDebugRequestBody(value: DebugRequestBody): value is {
  code: string;
  error: string;
  language: string;
  intent: string;
} {
  return (
    typeof value.code === "string" &&
    typeof value.error === "string" &&
    typeof value.language === "string" &&
    typeof value.intent === "string"
  );
}

function normalizeGeminiJson(text: string): string {
  return text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
}

export async function POST(request: Request) {
  let requestBody: DebugRequestBody;

  try {
    requestBody = (await request.json()) as DebugRequestBody;
  } catch {
    return Response.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (!isDebugRequestBody(requestBody)) {
    return Response.json(
      {
        error:
          "Request body must include string values for code, error, language, and intent.",
      },
      { status: 400 },
    );
  }

  const { code, error, language, intent } = requestBody;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return Response.json(
      {
        error:
          "Gemini API key is missing. Set GEMINI_API_KEY to enable live debugging analysis.",
        result: createFallbackResponse(language, error, code, intent),
      },
      { status: 500 },
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  // Gemini prompt definition:
  // The model is explicitly instructed to behave like a debugging assistant
  // and return only strict JSON matching the schema expected by the frontend.
  const prompt = `
You are DebugMate AI, an expert software debugging assistant.
Analyze the submitted bug report and respond with JSON only.
Do not wrap the response in markdown fences.
Do not include extra keys.

Return strict JSON with exactly this shape:
{
  "explanation": "string",
  "cause": "string",
  "fix": "string",
  "correctedCode": "string"
}

User submission:
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

      if (
        typeof parsed.explanation === "string" &&
        typeof parsed.cause === "string" &&
        typeof parsed.fix === "string" &&
        typeof parsed.correctedCode === "string"
      ) {
        const result: DebugResponse = {
          explanation: parsed.explanation,
          cause: parsed.cause,
          fix: parsed.fix,
          correctedCode: parsed.correctedCode,
        };

        return Response.json({ result });
      }
    } catch {
      return Response.json({
        warning: "Gemini returned a non-JSON or malformed JSON response.",
        result: createFallbackResponse(language, error, code, intent),
      });
    }

    return Response.json({
      warning: "Gemini returned JSON that did not match the expected shape.",
      result: createFallbackResponse(language, error, code, intent),
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "An unexpected Gemini request error occurred.";

    return Response.json(
      {
        error: `Gemini request failed: ${message}`,
        result: createFallbackResponse(language, error, code, intent),
      },
      { status: 500 },
    );
  }
}
