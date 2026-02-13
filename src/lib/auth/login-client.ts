export type LoginRequest = {
  password: string;
  next: string;
};

export type LoginSuccess = {
  redirectTo: string;
};

export function getNextFromLocation(search: string): string {
  const params = new URLSearchParams(search);
  return params.get("next") ?? "/";
}

export async function postLogin(payload: LoginRequest): Promise<Response> {
  return fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function parseLoginSuccess(response: Response): Promise<LoginSuccess> {
  return (await response.json()) as LoginSuccess;
}
