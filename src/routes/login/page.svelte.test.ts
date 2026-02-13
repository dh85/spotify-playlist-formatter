import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import LoginPage from "./+page.svelte";

function mockLoginResponse(status: number, body: string | { redirectTo: string }) {
  const responseBody = typeof body === "string" ? body : JSON.stringify(body);
  const headers = typeof body === "string" ? undefined : { "content-type": "application/json" };

  const fetchMock = vi.fn().mockResolvedValue(new Response(responseBody, { status, headers }));
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

async function submitPassword(password: string) {
  await page.getByLabelText("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

function expectLoginRequest(fetchMock: ReturnType<typeof vi.fn>, password: string, next: string) {
  expect(fetchMock).toHaveBeenCalledWith("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password, next })
  });
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/login/+page.svelte", () => {
  it("renders accessible login form controls", async () => {
    render(LoginPage);

    await expect.element(page.getByRole("heading", { name: "Login" })).toBeInTheDocument();
    const passwordInput = page.getByLabelText("Password");
    await expect.element(passwordInput).toBeInTheDocument();
    await expect.element(passwordInput).toHaveAttribute("aria-required", "true");
    await expect.element(passwordInput).toHaveAttribute("aria-invalid", "false");
    await expect.element(page.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows accessible error state when login fails", async () => {
    const fetchMock = mockLoginResponse(401, "Invalid password");

    render(LoginPage);
    await submitPassword("wrong-password");

    await expect.element(page.getByText("Invalid password")).toBeInTheDocument();
    await expect.element(page.getByRole("alert")).toHaveTextContent("Invalid password");
    await expect.element(page.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).toHaveBeenCalledOnce();
    expectLoginRequest(fetchMock, "wrong-password", "/");
  });

  it("submits with next query param and uses success state", async () => {
    window.history.replaceState({}, "", "/login?next=%2Fplaylist%2F123");
    const fetchMock = mockLoginResponse(200, {
      redirectTo: window.location.pathname + window.location.search
    });

    render(LoginPage);
    await submitPassword("correct-password");

    expectLoginRequest(fetchMock, "correct-password", "/playlist/123");
    await expect.element(page.getByText("Invalid password")).not.toBeInTheDocument();
  });

  it("disables button and marks it busy while submitting", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pendingResponse)
    );

    render(LoginPage);
    await submitPassword("pending-password");

    const submitButton = page.getByRole("button");
    await expect.element(submitButton).toBeDisabled();
    await expect.element(submitButton).toHaveAttribute("aria-busy", "true");
    await expect.element(page.getByRole("button", { name: /signing in/i })).toBeInTheDocument();

    resolveFetch(new Response(JSON.stringify({ redirectTo: window.location.pathname }), { status: 200 }));
  });

  it("shows network error and resets submit state when request rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(LoginPage);
    await submitPassword("any-password");

    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("Network error while signing in. Please try again.");
    await expect.element(page.getByRole("button", { name: /sign in/i })).toBeEnabled();
  });
});
