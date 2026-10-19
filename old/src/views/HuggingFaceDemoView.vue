<template>
  <div class="hf-demo">
    <h1>Hugging Face Transformers Sentiment Demo</h1>
    <p class="description">
      This view runs a minimal <code>@huggingface/transformers</code> sentiment analysis example entirely in your browser.
    </p>

    <div class="controls">
      <label class="prompt-input">
        <span>Prompt:</span>
        <textarea
          v-model="prompt"
          placeholder="Enter text to analyze sentiment..."
          rows="3"
        />
      </label>
      <button @click="runHuggingFaceDemo" :disabled="isRunning || !prompt.trim()">
        <span v-if="isRunning">Running…</span>
        <span v-else>Run Analysis</span>
      </button>
    </div>

    <div v-if="status" class="status">
      <strong>Status:</strong> {{ status }}
    </div>

    <div v-if="output" class="output">
      <h2>Model Output</h2>
      <pre>{{ output }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { pipeline } from '@huggingface/transformers'
import '@/ai/transformersEnv'

const status = ref('')
const output = ref('')
const isRunning = ref(false)
const prompt = ref('I love transformers!')
let pipe: ReturnType<typeof pipeline<'sentiment-analysis'>> | null = null

async function runHuggingFaceDemo() {
  if (isRunning.value || !prompt.value.trim()) return
  isRunning.value = true
  output.value = ''
  status.value = 'Running…'

  try {
    // Allocate a pipeline for sentiment-analysis
    if (pipe == null) {
      console.log('Loading sentiment model')
      pipe = await pipeline('sentiment-analysis')
    }
    const out = await pipe(prompt.value.trim())
    
    // Show the entire response
    output.value = JSON.stringify(out, null, 2)
    status.value = 'Success: Hugging Face sentiment example ran.'
  } catch (e) {
    console.error('[HuggingFaceDemo] runHuggingFaceDemo failed', e)
    const message =
      e instanceof Error && e.message
        ? e.message
        : 'Unknown error while running Hugging Face demo.'
    status.value = `Error: ${message}`
    output.value = e instanceof Error ? e.stack || e.toString() : String(e)
  } finally {
    isRunning.value = false
  }
}
</script>

<style scoped>
.hf-demo {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

.description {
  margin-bottom: 1rem;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1rem;
}

.controls label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.prompt-input {
  width: 100%;
}

.prompt-input textarea {
  width: 100%;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  border: 1px solid #ccc;
  font-family: inherit;
  resize: vertical;
}

.controls input {
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  border: 1px solid #ccc;
}

.controls button {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  border: none;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
}

.controls button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.status {
  margin-bottom: 1rem;
}

.output pre {
  background: #f3f4f6;
  padding: 1rem;
  border-radius: 4px;
  white-space: pre-wrap;
}
</style>



