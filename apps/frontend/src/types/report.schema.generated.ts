// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: apps/backend/src/ai/report/report.schema.ts
// Regenerate with: npm run sync:schema (from the repository root)

import { z } from "zod";

/**
 * Scores are integers from 0 to 10. Fractional scores
 * (e.g. 7.5) are rounded instead of failing validation.
 */
const scoreSchema = z
  .number()
  .min(0)
  .max(10)
  .transform((value) => Math.round(value));

/**
 * A citation as the model writes it.
 */
const modelEvidenceSchema = z.object({
  file: z.string(),
  line: z.number().optional(),
  description: z.string(),
});

/**
 * Lines of real code around a cited line, added by the backend
 * after checking the citation (never written by the model).
 */
const evidenceSnippetSchema = z.object({
  startLine: z.number(),
  lines: z.array(z.string()),
});

/**
 * A citation in the final report: checked against the repository.
 * `file` is the real repository path; `line` and `snippet` are present
 * only when the cited line exists in what the model was shown.
 */
const evidenceReferenceSchema = modelEvidenceSchema.extend({
  snippet: evidenceSnippetSchema.optional(),
});

/**
 * Builds the report schema around a given citation schema, so the
 * model's output and the final report share every other field.
 */
function buildReportSchema<Evidence extends z.ZodType>(evidence: Evidence) {
  const findingSchema = z.object({
    title: z.string(),
    description: z.string(),
    evidence: z.array(evidence),
  });

  const improvementSchema = z.object({
    title: z.string(),
    priority: z.enum(["High", "Medium", "Low"]),
    category: z.string(),
    problem: z.string(),
    recommendation: z.string(),
    expectedImpact: z.string(),
    evidence: z.array(evidence),
  });

  return z.object({
    summary: z.object({
      purpose: z.string(),
      description: z.string(),
    }),

    technologyStack: z.object({
      languages: z.array(z.string()),
      frameworks: z.array(z.string()),
      databases: z.array(z.string()),
      tools: z.array(z.string()),
      infrastructure: z.array(z.string()),
    }),

    architecture: z.object({
      summary: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      scalability: z.string(),
      maintainability: z.string(),
    }),

    folderStructure: z.object({
      score: scoreSchema,
      positives: z.array(z.string()),
      negatives: z.array(z.string()),
      recommendations: z.array(z.string()),
    }),

    codeQuality: z.object({
      score: scoreSchema,
      positives: z.array(z.string()),
      negatives: z.array(z.string()),
      recommendations: z.array(z.string()),
    }),

    strengths: z.array(findingSchema),

    weaknesses: z.array(findingSchema),

    improvements: z.array(improvementSchema),

    resumeFeedback: z.object({
      score: scoreSchema,
      summary: z.string(),
      strengths: z.array(z.string()),
      improvements: z.array(z.string()),
      bestResumeBullets: z.array(z.string()),
    }),

    interviewQuestions: z.array(
      z.object({
        question: z.string(),
        difficulty: z.enum(["Easy", "Medium", "Hard"]),
        category: z.string(),
        reason: z.string(),
        expectedAnswer: z.string(),
      }),
    ),
  });
}

/**
 * What the model must return (also sent to Gemini as JSON Schema).
 */
export const modelReportSchema = buildReportSchema(modelEvidenceSchema);

/**
 * The final report sent to the frontend, with checked citations.
 */
export const engineeringReportSchema = buildReportSchema(
  evidenceReferenceSchema,
);

export type ModelReport = z.infer<typeof modelReportSchema>;

export type EngineeringReport = z.infer<typeof engineeringReportSchema>;

export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

export type EvidenceSnippet = z.infer<typeof evidenceSnippetSchema>;

export type Finding = EngineeringReport["strengths"][number];

export type Improvement = EngineeringReport["improvements"][number];

export type InterviewQuestion =
  EngineeringReport["interviewQuestions"][number];
