import { createRequire } from "module"

type ParserFn = (data: Buffer) => Promise<{ text: string }>
type ParserClass = new (opts: { data: Buffer }) => {
  getText: () => Promise<{ text: string }>
}

let cachedParser: ParserFn | null = null

function isParserFn(value: unknown): value is ParserFn {
  return typeof value === "function"
}

function isParserClass(value: unknown): value is ParserClass {
  if (typeof value !== "function") return false
  const proto = (value as { prototype?: { getText?: unknown } }).prototype
  return typeof proto?.getText === "function"
}

function resolveParser(mod: unknown): ParserFn | null {
  const anyMod = mod as {
    default?: unknown
    pdfParse?: unknown
    PDFParse?: unknown
  }

  const candidates = [
    anyMod,
    anyMod.default,
    anyMod.PDFParse,
    (anyMod.default as { PDFParse?: unknown } | undefined)?.PDFParse,
    anyMod.pdfParse,
    (anyMod.default as { pdfParse?: unknown } | undefined)?.pdfParse,
  ]

  for (const candidate of candidates) {
    if (isParserClass(candidate)) {
      return async (buffer: Buffer) => {
        const instance = new candidate({ data: buffer })
        const result = await instance.getText()
        return { text: result.text ?? "" }
      }
    }
    if (isParserFn(candidate)) {
      return candidate
    }
  }

  return null
}

export async function parsePdf(buffer: Buffer): Promise<{ text: string }> {
  if (!cachedParser) {
    const require = createRequire(import.meta.url)
    const cjsMod = require("pdf-parse")
    cachedParser = resolveParser(cjsMod)

    if (!cachedParser) {
      const mod = await import("pdf-parse")
      cachedParser = resolveParser(mod)
    }

    if (!cachedParser) {
      throw new Error("pdf-parse module did not export a usable parser")
    }
  }

  return cachedParser(buffer)
}
