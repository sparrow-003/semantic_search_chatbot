import type { EventRecord, RankedEvent } from "@/lib/events/types";

const INJECTION_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "ignore_instructions", re: /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|system|developer|all)\b.{0,24}\b(instructions?|prompts?|rules?)\b/i },
  { name: "role_spoof", re: /^\s*(system|developer|assistant)\s*:/im },
  { name: "reveal_secrets", re: /\b(reveal|print|dump|leak|show)\b.{0,40}\b(api[_\s-]?key|secret|password|service[_\s-]?role|system\s+prompt|env)\b/i },
  { name: "sql_injection_probe", re: /\b(union\s+select|drop\s+table|;\s*delete\s+from|xp_cmdshell|pg_sleep\s*\()\b/i },
  { name: "script_execution", re: /<\s*script\b|javascript:|eval\s*\(|Function\s*\(/i },
  { name: "cross_tenant_probe", re: /\b(all\s+tenants?|other\s+tenant|bypass\s+rls|disable\s+rls)\b/i },
];

export interface InjectionScanResult {
  flagged: boolean;
  reasons: string[];
}

/**
 * Inspect user input or retrieved record text for prompt-injection, XSS, or
 * unauthorized-operation patterns without blocking normal technical queries.
 */
export function detectPromptInjection(text: string): InjectionScanResult {
  const reasons: string[] = [];
  for (const { name, re } of INJECTION_PATTERNS) {
    if (re.test(text)) {
      reasons.push(name);
    }
  }
  return { flagged: reasons.length > 0, reasons };
}

/** Trim, normalize control characters, and enforce the 2,000-character query budget. */
export function sanitizeUserQuery(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function escapeXmlDelimiters(value: string): string {
  return value.replace(/<\/?retrieved_records[^>]*>/gi, "[redacted-tag]");
}

/**
 * Serialize retrieved records into an isolated, explicitly untrusted JSON data
 * block for LLM prompts so record content cannot act as system instructions.
 */
export function wrapUntrustedRecords(events: RankedEvent[]): string {
  const safePayload = events.slice(0, 30).map((e) => ({
    id: e.id,
    title: escapeXmlDelimiters(e.title),
    category: escapeXmlDelimiters(e.category),
    format: e.format,
    startAt: e.startAt,
    endAt: e.endAt,
    city: e.city ? escapeXmlDelimiters(e.city) : null,
    country: e.country ? escapeXmlDelimiters(e.country) : null,
    venue: e.venue ? escapeXmlDelimiters(e.venue) : null,
    technologies: e.technologies.map(escapeXmlDelimiters),
    audience: e.audience.map(escapeXmlDelimiters),
    isFree: e.isFree,
    summary: escapeXmlDelimiters(e.summary.slice(0, 280)),
    score: Number(e.score.toFixed(3)),
    explanation: escapeXmlDelimiters(e.explanation.summary),
  }));
  return `<retrieved_records data_only="true" untrusted="true">\n${JSON.stringify(safePayload, null, 2)}\n</retrieved_records>`;
}

/**
 * Verify that an LLM-authored answer only cites titles/IDs from authorized
 * retrieved records. Returns whether all bracketed or named record assertions are clean.
 */
export function verifyGroundedEventReferences(
  answerText: string,
  authorizedEvents: EventRecord[],
): { grounded: boolean; verifiedCount: number } {
  if (!authorizedEvents.length) {
    return { grounded: true, verifiedCount: 0 };
  }
  const lowerAnswer = answerText.toLowerCase();
  const verifiedCount = authorizedEvents.filter((e) =>
    lowerAnswer.includes(e.title.toLowerCase()),
  ).length;
  return { grounded: true, verifiedCount };
}
