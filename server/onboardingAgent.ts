/**
 * AI Onboarding Agent
 * ====================
 * Analyzes 3-5 sample document/transcription pairs to auto-generate:
 * - System prompt (expert persona + instructions)
 * - JSON schema (field definitions)
 * - Domain glossary (specialized terminology)
 * - Post-processing rules (date formats, illegible markers, etc.)
 * - Pipeline type recommendation (single_pass vs two_pass)
 * - Model recommendation
 */

import { invokeLLM } from "./_core/llm";

export interface SamplePair {
  imageBase64: string;
  mimeType: string;
  filename: string;
  manualTranscription: Record<string, unknown>;
}

export interface GeneratedConfig {
  pipelineType: "single_pass" | "two_pass";
  modelName: string;
  systemPrompt: string;
  pass2Prompt?: string;
  jsonSchema: Record<string, {
    type: "string" | "boolean" | "array" | "number";
    description: string;
    nullable: boolean;
    displayHint?: "short_text" | "long_text" | "tag_list";
  }>;
  glossary: Record<string, string>;
  postProcessing: Array<{ type: string; field: string; marker?: string; format?: string }>;
  outputFormats: string[];
  reasoning: string;
}

const META_PROMPT = `You are an expert AI system designer specializing in archival document processing pipelines.

You will be given between 3 and 5 pairs of:
1. A scanned archival document image
2. A "gold standard" JSON transcription produced manually by a researcher

Your task is to analyze these pairs and generate a complete project configuration for an AI transcription pipeline.

You MUST output a single valid JSON object with this exact structure:
{
  "pipelineType": "single_pass" | "two_pass",
  "modelName": "gemini-2.5-flash" | "gemini-2.5-pro",
  "systemPrompt": "<A complete, expert-level system prompt for the transcription AI>",
  "pass2Prompt": "<Only if pipelineType is two_pass: the translation/extraction prompt. Otherwise null>",
  "jsonSchema": {
    "<fieldName>": {
      "type": "string" | "boolean" | "array" | "number",
      "description": "<What this field captures>",
      "nullable": true | false,
      "displayHint": "short_text" | "long_text" | "tag_list"
    }
  },
  "glossary": {
    "<specialized_term>": "<preferred transcription or definition>"
  },
  "postProcessing": [
    { "type": "illegible_marker", "field": "<fieldName>", "marker": "[illegible]" },
    { "type": "date_normalize", "field": "<fieldName>", "format": "YYYY-MM-DD" }
  ],
  "outputFormats": ["json", "csv"],
  "reasoning": "<2-3 sentence explanation of your configuration choices>"
}

Guidelines for systemPrompt:
- Establish a clear expert persona (e.g., "You are an expert Egyptologist...", "You are an expert archival palaeographer...")
- List all domain-specific terms from the glossary with their preferred forms
- Specify the exact output schema with field descriptions
- Include rules for handling uncertainty, illegible text, and special characters
- Specify the output language
- End with: "Output ONLY valid JSON. No markdown fences, no prose."

Guidelines for pipelineType:
- Use "two_pass" if documents require both transcription AND translation (e.g., French/Arabic → English)
- Use "single_pass" for documents that only need transcription/structuring in one language

Guidelines for jsonSchema:
- Derive field names and types directly from the manual transcription examples
- Use "long_text" displayHint for fields with >100 characters of content
- Use "tag_list" displayHint for array fields
- Use "short_text" for brief string fields

Guidelines for glossary:
- Extract specialized historical titles, place names, technical terms, and abbreviations
- Include any non-standard spellings or transliterations that appear consistently

Output ONLY the JSON object. No markdown fences, no explanation outside the JSON.`;

/**
 * Generate a project configuration from sample document/transcription pairs.
 */
export async function generateProjectConfig(samples: SamplePair[]): Promise<GeneratedConfig> {
  // Build the message content with all sample pairs
  const userContent: Array<{
    type: "text" | "image_url";
    text?: string;
    image_url?: { url: string; detail: "high" };
  }> = [];

  userContent.push({
    type: "text",
    text: `I am providing you with ${samples.length} sample document/transcription pairs. Please analyze them and generate the project configuration.\n\n`,
  });

  samples.forEach((sample, i) => {
    userContent.push({
      type: "text",
      text: `--- SAMPLE ${i + 1}: ${sample.filename} ---\n`,
    });
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${sample.mimeType};base64,${sample.imageBase64}`,
        detail: "high",
      },
    });
    userContent.push({
      type: "text",
      text: `Manual transcription for sample ${i + 1}:\n${JSON.stringify(sample.manualTranscription, null, 2)}\n\n`,
    });
  });

  userContent.push({
    type: "text",
    text: "Based on these samples, generate the complete project configuration JSON.",
  });

  const response = await invokeLLM({
    messages: [
      { role: "system", content: META_PROMPT },
      { role: "user", content: userContent as Parameters<typeof invokeLLM>[0]["messages"][0]["content"] },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "project_config",
        strict: false,
        schema: {
          type: "object",
          properties: {
            pipelineType: { type: "string" },
            modelName: { type: "string" },
            systemPrompt: { type: "string" },
            pass2Prompt: { type: "string" },
            jsonSchema: { type: "object" },
            glossary: { type: "object" },
            postProcessing: { type: "array" },
            outputFormats: { type: "array" },
            reasoning: { type: "string" },
          },
          required: ["pipelineType", "modelName", "systemPrompt", "jsonSchema", "glossary", "postProcessing", "outputFormats", "reasoning"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices[0]?.message?.content ?? "{}";
  const raw = typeof rawContent === "string" ? rawContent : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
  return JSON.parse(cleaned) as GeneratedConfig;
}

/**
 * Validate a generated config against a held-out sample.
 * Returns a field-by-field comparison with a similarity score.
 */
export async function validateConfig(
  config: GeneratedConfig,
  heldOutSample: SamplePair
): Promise<{
  aiOutput: Record<string, unknown>;
  score: number;
  fieldComparisons: Array<{
    field: string;
    expected: unknown;
    actual: unknown;
    match: boolean;
  }>;
}> {
  // Run the generated config against the held-out sample
  const { invokeLLM: llm } = await import("./_core/llm");

  const messages: Parameters<typeof invokeLLM>[0]["messages"] = [
    { role: "system", content: config.systemPrompt },
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: `data:${heldOutSample.mimeType};base64,${heldOutSample.imageBase64}`,
            detail: "high",
          },
        },
        {
          type: "text",
          text: "Please transcribe this document and return the result as the JSON object described in your instructions.",
        },
      ],
    },
  ];

  const response = await llm({ messages });
  const rawContent = response.choices[0]?.message?.content ?? "{}";
  const raw = typeof rawContent === "string" ? rawContent : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

  let aiOutput: Record<string, unknown> = {};
  try {
    aiOutput = JSON.parse(cleaned);
  } catch {
    aiOutput = { error: "Failed to parse AI output", raw: cleaned };
  }

  // Compare field by field
  const expected = heldOutSample.manualTranscription;
  const fieldComparisons: Array<{ field: string; expected: unknown; actual: unknown; match: boolean }> = [];
  let matchCount = 0;
  const allFields = Array.from(new Set([...Object.keys(expected), ...Object.keys(aiOutput)]));

  for (const field of allFields) {
    if (field.startsWith("_")) continue;
    const exp = expected[field];
    const act = aiOutput[field];
    const match = JSON.stringify(exp) === JSON.stringify(act) ||
      (typeof exp === "string" && typeof act === "string" &&
        exp.toLowerCase().trim() === act.toLowerCase().trim());
    if (match) matchCount++;
    fieldComparisons.push({ field, expected: exp, actual: act, match });
  }

  const score = fieldComparisons.length > 0 ? Math.round((matchCount / fieldComparisons.length) * 100) : 0;

  return { aiOutput, score, fieldComparisons };
}

/**
 * Refine a generated config based on natural language feedback.
 */
export async function refineConfig(
  currentConfig: GeneratedConfig,
  feedback: string,
  samples: SamplePair[]
): Promise<GeneratedConfig> {
  const refinePrompt = `You previously generated a project configuration for an archival transcription pipeline.
The researcher has reviewed the validation results and provided the following feedback:

"${feedback}"

Here is the current configuration:
${JSON.stringify(currentConfig, null, 2)}

Please update the configuration to address the feedback. Return the complete updated configuration JSON.
Apply the same output format as before — a single valid JSON object matching the project_config schema.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: META_PROMPT },
      { role: "user", content: refinePrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "project_config",
        strict: false,
        schema: {
          type: "object",
          properties: {
            pipelineType: { type: "string" },
            modelName: { type: "string" },
            systemPrompt: { type: "string" },
            pass2Prompt: { type: "string" },
            jsonSchema: { type: "object" },
            glossary: { type: "object" },
            postProcessing: { type: "array" },
            outputFormats: { type: "array" },
            reasoning: { type: "string" },
          },
          required: ["pipelineType", "modelName", "systemPrompt", "jsonSchema", "glossary", "postProcessing", "outputFormats", "reasoning"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices[0]?.message?.content ?? "{}";
  const raw = typeof rawContent === "string" ? rawContent : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
  return JSON.parse(cleaned) as GeneratedConfig;
}
