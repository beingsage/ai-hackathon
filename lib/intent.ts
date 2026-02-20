export type Intent =
  | "greeting"
  | "upload_help"
  | "doc_query"
  | "general"
  | "unknown"

const GREETING_RE = /\b(hi|hello|hey|yo|good\s*(morning|afternoon|evening))\b/i
const UPLOAD_RE = /\b(upload|pdf|document|docs|file|knowledge\s*base)\b/i
const THANKS_RE = /\b(thanks|thank\s*you|thx|appreciate)\b/i

export function classifyIntent(text: string, hasDocs: boolean): Intent {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return "unknown"

  if (GREETING_RE.test(normalized)) return "greeting"
  if (THANKS_RE.test(normalized)) return "general"
  if (UPLOAD_RE.test(normalized)) return "upload_help"

  if (hasDocs) return "doc_query"

  return "general"
}
