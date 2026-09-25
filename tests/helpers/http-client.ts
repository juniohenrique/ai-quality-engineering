export interface ApiResponse<T> {
  status: number;
  body: T | undefined;
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export async function request<T>(
  url: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
  });

  const body =
    response.status === 204 ? undefined : ((await response.json()) as T);

  return { status: response.status, body };
}
