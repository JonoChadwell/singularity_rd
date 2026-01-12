import { env } from '@huggingface/transformers'

// Configure Hugging Face transformers.js environment and
// install a one-time logging wrapper around the fetch they use.
// We patch both env.fetch (used by transformers) and globalThis.fetch so that
// we see requests regardless of which one the library calls.
if (!(env as any)._loggedFetchInstalled) {
  const originalFetch = (globalThis.fetch ?? fetch) as typeof fetch

  const loggingFetch: typeof fetch = async (...args) => {
    const [input, init] = args
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url
    console.log('[Transformers fetch]', url, init)
    const response = await originalFetch(...args)
    console.log(
      '[Transformers fetch response]',
      url,
      response.status,
      response.headers.get('content-type')
    )
    return response
  }

  // Patch transformers env and global fetch
  ;(env as any).fetch = loggingFetch as any
  ;(globalThis as any).fetch = loggingFetch

  // Disable local model loading so that models are always fetched from the Hub.
  ;(env as any).allowLocalModels = true
  ;(env as any).useBrowserCache = true
  if (import.meta.env.DEV) {
    ;(env as any).useBrowserCache = false
  }
  ;(env as any).localModelPath = '/models/'

  ;(env as any)._loggedFetchInstalled = true
}



