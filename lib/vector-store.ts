import { embed, embedMany, cosineSimilarity } from "ai"
import { openai } from "@ai-sdk/openai"

interface VectorDocument {
  text: string
  textLower: string
  embedding?: number[]
  source: string
}

type VectorStoreBackend = "memory" | "faiss"

const VECTOR_STORE: VectorStoreBackend =
  process.env.VECTOR_STORE === "faiss" ? "faiss" : "memory"

const memoryDocuments: VectorDocument[] = []
const sources = new Map<string, number>()
let totalChunks = 0
let totalChars = 0

const EMBEDDING_MODEL = openai.embedding(
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"
)

const EMBEDDINGS_ENABLED = getEnvBoolean("EMBEDDINGS_ENABLED", true)
const EMBEDDINGS_FALLBACK = getEnvBoolean("EMBEDDINGS_FALLBACK", true)

const CHUNK_SIZE = getEnvNumber("CHUNK_SIZE", 1000)
const CHUNK_OVERLAP = getEnvNumber("CHUNK_OVERLAP", 100)
const EFFECTIVE_OVERLAP = Math.min(
  CHUNK_OVERLAP,
  Math.max(0, Math.floor(CHUNK_SIZE / 2))
)

const MAX_TOTAL_CHUNKS = getEnvNumber("MAX_TOTAL_CHUNKS", 5000)
const MAX_TOTAL_CHARS = getEnvNumber("MAX_TOTAL_CHARS", 2_000_000)

type FaissStoreInstance = {
  addDocuments: (docs: unknown[]) => Promise<void>
  similaritySearchWithScore: (
    query: string,
    k: number
  ) => Promise<[unknown, number][]>
}

let faissStore: FaissStoreInstance | null = null
let faissEmbeddings: unknown | null = null

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getEnvBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (!raw) return fallback
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase())
}

function chunkText(
  text: string,
  chunkSize = 500,
  overlap = 100
): string[] {
  const chunks: string[] = []
  const cleanText = text.replace(/\s+/g, " ").trim()

  if (cleanText.length <= chunkSize) {
    if (cleanText.length > 0) chunks.push(cleanText)
    return chunks
  }

  let start = 0
  while (start < cleanText.length) {
    let end = start + chunkSize

    if (end < cleanText.length) {
      const lastPeriod = cleanText.lastIndexOf(".", end)
      const lastNewline = cleanText.lastIndexOf("\n", end)
      const breakPoint = Math.max(lastPeriod, lastNewline)
      if (breakPoint > start + chunkSize * 0.3) {
        end = breakPoint + 1
      }
    }

    const chunk = cleanText.slice(start, end).trim()
    if (chunk.length > 20) {
      chunks.push(chunk)
    }

    start = end - overlap
    if (start >= cleanText.length) break
  }

  return chunks
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 2)
}

function keywordSearch(
  query: string,
  docs: VectorDocument[],
  topK: number
): { text: string; score: number; source: string }[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  const scored = docs.map((doc) => {
    let hits = 0
    for (const token of tokens) {
      if (doc.textLower.includes(token)) hits += 1
    }
    const score = hits / tokens.length
    return {
      text: doc.text,
      source: doc.source,
      score,
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).filter((s) => s.score > 0)
}

async function getFaissEmbeddings() {
  if (faissEmbeddings) return faissEmbeddings
  const { OpenAIEmbeddings } = (await import("@langchain/openai")) as {
    OpenAIEmbeddings: new (args: { model: string; apiKey?: string }) => unknown
  }
  faissEmbeddings = new OpenAIEmbeddings({
    model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    apiKey: process.env.OPENAI_API_KEY,
  })
  return faissEmbeddings
}

async function addDocumentFaiss(chunks: string[], fileName: string) {
  const embeddings = await getFaissEmbeddings()
  const { FaissStore } = (await import(
    "@langchain/community/vectorstores/faiss"
  )) as { FaissStore: new (embeddings: unknown, args?: unknown) => unknown }

  const metadatas = chunks.map(() => ({ source: fileName }))

  if (!faissStore) {
    const store = await (FaissStore as any).fromTexts(
      chunks,
      metadatas,
      embeddings
    )
    faissStore = store as FaissStoreInstance
    return
  }

  const { Document } = (await import("@langchain/core/documents")) as {
    Document: new (args: { pageContent: string; metadata?: Record<string, unknown> }) => unknown
  }

  const docs = chunks.map(
    (chunk) =>
      new Document({
        pageContent: chunk,
        metadata: { source: fileName },
      })
  )

  await faissStore.addDocuments(docs)
}

async function searchFaiss(query: string, topK: number) {
  if (!faissStore) return []
  const results = await faissStore.similaritySearchWithScore(query, topK)
  return results.map(([doc, distance]) => {
    const typedDoc = doc as { pageContent?: string; metadata?: { source?: string } }
    const similarity = 1 / (1 + distance)
    return {
      text: typedDoc.pageContent || "",
      source: typedDoc.metadata?.source || "Unknown",
      score: similarity,
    }
  })
}

export async function addDocument(
  text: string,
  fileName: string
): Promise<{ chunkCount: number }> {
  const chunks = chunkText(text, CHUNK_SIZE, EFFECTIVE_OVERLAP)

  if (chunks.length === 0) {
    return { chunkCount: 0 }
  }

  const incomingChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  if (totalChunks + chunks.length > MAX_TOTAL_CHUNKS) {
    throw new Error("Knowledge base size limit reached")
  }
  if (totalChars + incomingChars > MAX_TOTAL_CHARS) {
    throw new Error("Knowledge base text limit reached")
  }

  let embeddings: number[][] | null = null

  if (VECTOR_STORE === "faiss") {
    if (EMBEDDINGS_ENABLED) {
      try {
        await addDocumentFaiss(chunks, fileName)
      } catch (error) {
        if (!EMBEDDINGS_FALLBACK) {
          throw error
        }
        console.warn("Embeddings failed; falling back to keyword search.", error)
      }
    }
  } else if (EMBEDDINGS_ENABLED) {
    try {
      const result = await embedMany({
        model: EMBEDDING_MODEL,
        values: chunks,
      })
      embeddings = result.embeddings
    } catch (error) {
      if (!EMBEDDINGS_FALLBACK) {
        throw error
      }
      console.warn("Embeddings failed; falling back to keyword search.", error)
    }
  }

  const newDocs: VectorDocument[] = chunks.map((chunk, i) => ({
    text: chunk,
    textLower: chunk.toLowerCase(),
    embedding: embeddings ? embeddings[i] : undefined,
    source: fileName,
  }))

  memoryDocuments.push(...newDocs)

  totalChunks += chunks.length
  totalChars += incomingChars
  sources.set(fileName, (sources.get(fileName) || 0) + chunks.length)

  return { chunkCount: chunks.length }
}

export async function searchDocuments(
  query: string,
  topK = 5
): Promise<{ text: string; score: number; source: string }[]> {
  if (totalChunks === 0) {
    return []
  }

  if (VECTOR_STORE === "faiss" && EMBEDDINGS_ENABLED && faissStore) {
    const results = await searchFaiss(query, topK)
    return results.filter((s) => s.score > 0.1)
  }

  if (!EMBEDDINGS_ENABLED) {
    return keywordSearch(query, memoryDocuments, topK)
  }

  if (memoryDocuments.some((doc) => !doc.embedding || doc.embedding.length === 0)) {
    return keywordSearch(query, memoryDocuments, topK)
  }

  const { embedding: queryEmbedding } = await embed({
    model: EMBEDDING_MODEL,
    value: query,
  })

  const scored = memoryDocuments.map((doc) => ({
    text: doc.text,
    source: doc.source,
    score: cosineSimilarity(queryEmbedding, doc.embedding),
  }))

  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, topK).filter((s) => s.score > 0.1)
}

export function getStoreStats(): {
  totalChunks: number
  sources: { name: string; chunks: number }[]
} {
  return {
    totalChunks,
    sources: Array.from(sources.entries()).map(([name, chunks]) => ({
      name,
      chunks,
    })),
  }
}

export function clearStore(): void {
  memoryDocuments.length = 0
  sources.clear()
  totalChunks = 0
  totalChars = 0
  faissStore = null
}
