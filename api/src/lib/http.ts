export interface JsonRequestOptions {
  timeoutMs: number
  retries?: number
  headers?: Record<string, string>
}

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'application/json,text/plain,*/*',
  'User-Agent': 'stock-info-app/1.0',
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchJson<T>(
  url: string,
  options: JsonRequestOptions,
): Promise<T> {
  const retries = options.retries ?? 1
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { ...DEFAULT_HEADERS, ...(options.headers ?? {}) },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`)
      }

      return (await response.json()) as T
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error('未知网络请求错误')
      if (attempt < retries) {
        await sleep(150 * (attempt + 1))
      }
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError ?? new Error('请求失败')
}
