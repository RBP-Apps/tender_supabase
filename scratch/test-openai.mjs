import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const apiKey = process.env.OPENAI_API_KEY
const modelName = process.env.OPENAI_MODEL || 'gpt-4o'

console.log('Testing OpenAI Configuration...')
console.log('API Key configured:', !!apiKey, apiKey ? `(Starts with ${apiKey.slice(0, 7)}... ends with ...${apiKey.slice(-4)})` : '')
console.log('Model configured:', modelName)

if (!apiKey) {
  console.error('ERROR: No OPENAI_API_KEY found in .env.local')
  process.exit(1)
}

try {
  const openai = createOpenAI({ apiKey })
  const result = await generateText({
    model: openai(modelName),
    prompt: 'Respond with exactly: "OpenAI is working correctly in Tender FMS!"',
    maxTokens: 50,
  })

  console.log('SUCCESS! OpenAI response received:')
  console.log('Response text:', result.text)
  console.log('Usage:', result.usage)
} catch (err) {
  console.error('OpenAI Test FAILED:')
  console.error(err)
}
