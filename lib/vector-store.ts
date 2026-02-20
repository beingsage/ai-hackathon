import { embed, embedMany, cosineSimilarity } from "ai"
import { huggingface } from "@ai-sdk/huggingface"

interface VectorDocument {
  text: string
  embedding: number[]
  source: string
}

interface VectorStore {
  documents: VectorDocument[]
  sources: Map<string, number>
}

const store: VectorStore = {
  documents: [],
  sources: new Map(),
}

const EMBEDDING_MODEL = huggingface.textEmbedding("sentence-transformers/all-MiniLM-L6-v2")

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

export async function addDocument(
  text: string,
  fileName: string
): Promise<{ chunkCount: number }> {
  const chunks = chunkText(text)

  if (chunks.length === 0) {
    return { chunkCount: 0 }
  }

  const { embeddings } = await embedMany({
    model: EMBEDDING_MODEL,
    values: chunks,
  })

  const newDocs: VectorDocument[] = chunks.map((chunk, i) => ({
    text: chunk,
    embedding: embeddings[i],
    source: fileName,
  }))

  store.documents.push(...newDocs)
  store.sources.set(fileName, (store.sources.get(fileName) || 0) + chunks.length)

  return { chunkCount: chunks.length }
}

export async function searchDocuments(
  query: string,
  topK = 5
): Promise<{ text: string; score: number; source: string }[]> {
  if (store.documents.length === 0) {
    return []
  }

  const { embedding: queryEmbedding } = await embed({
    model: EMBEDDING_MODEL,
    value: query,
  })

  const scored = store.documents.map((doc) => ({
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
    totalChunks: store.documents.length,
    sources: Array.from(store.sources.entries()).map(([name, chunks]) => ({
      name,
      chunks,
    })),
  }
}

export function clearStore(): void {
  store.documents = []
  store.sources.clear()
}
