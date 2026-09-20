export interface ApiUser {
  id: string;
  email: string;
  name: string;
}

export interface UserInput {
  email: string;
  name: string;
}

export interface ApiResponse<T> {
  status: number;
  body: T;
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export class UserApiClient {
  constructor(private readonly baseUrl: string) {}

  getHealth(): Promise<ApiResponse<{ status: string; database: string }>> {
    return this.request("/health");
  }

  getAll(): Promise<ApiResponse<ApiUser[]>> {
    return this.request("/users");
  }

  getById(id: string): Promise<ApiResponse<ApiUser>> {
    return this.request(`/users/${id}`);
  }

  create(input: UserInput): Promise<ApiResponse<ApiUser>> {
    return this.request("/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  update(id: string, input: UserInput): Promise<ApiResponse<ApiUser>> {
    return this.request(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  delete(id: string): Promise<ApiResponse<undefined>> {
    return this.request(`/users/${id}`, { method: "DELETE" });
  }

  request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
    }).then(async (response) => ({
      status: response.status,
      body: response.status === 204 ? undefined : ((await response.json()) as T),
    }));
  }
}
