import { expect, test, type Page } from "@playwright/test";

const APP_PASSWORD = process.env.APP_PASSWORD ?? "";

async function gotoRoot(page: Page) {
  await page.goto("http://localhost:4173/");
}

async function login(page: Page, password = APP_PASSWORD) {
  await page.goto("http://localhost:4173/login");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function loginToApp(page: Page, password = APP_PASSWORD) {
  await login(page, password);
  await expect(page).toHaveURL("http://localhost:4173/");
  await expect(page.getByLabel("Source")).toBeVisible();
}

async function setSource(page: Page, value: "spotify" | "mixxx" | "djay") {
  const sourceSelect = page.getByLabel("Source");
  await sourceSelect.selectOption(value);
  await expect(sourceSelect).toHaveValue(value);
}

test("redirects unauthenticated users to login", async ({ page }) => {
  await gotoRoot(page);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /login/i })).toBeVisible();
});

test("shows error for invalid password", async ({ page }) => {
  await login(page, "wrong-password");
  await expect(page.getByRole("alert")).toContainText("Invalid password");
  await expect(page).toHaveURL(/\/login/);
});

test("honors safe next redirect and sanitizes external next on login", async ({ page }) => {
  test.skip(!APP_PASSWORD, "APP_PASSWORD is required in env for login e2e tests");

  await page.goto("http://localhost:4173/login?next=%2F%3Ffrom%3Dlogin");
  await page.getByLabel("Password").fill(APP_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("http://localhost:4173/?from=login");

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("http://localhost:4173/login?next=https%3A%2F%2Fevil.example");
  await page.getByLabel("Password").fill(APP_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("http://localhost:4173/");
});

test("rejects cross-origin POSTs for auth and playlist APIs", async ({ page, request }) => {
  test.skip(!APP_PASSWORD, "APP_PASSWORD is required in env for login e2e tests");

  const commonHeaders = { origin: "https://evil.example" };

  const loginResponse = await request.post("http://localhost:4173/api/login", {
    headers: { ...commonHeaders, "content-type": "application/json" },
    data: { password: APP_PASSWORD || "irrelevant", next: "/" }
  });
  expect(loginResponse.status()).toBe(403);
  await expect(loginResponse.text()).resolves.toBe("Invalid request origin.");

  const logoutResponse = await request.post("http://localhost:4173/api/logout", {
    headers: commonHeaders
  });
  expect(logoutResponse.status()).toBe(403);
  await expect(logoutResponse.text()).resolves.toBe("Invalid request origin.");

  // /api/playlist is protected by auth, so authenticate first.
  await loginToApp(page);
  await expect(page).toHaveURL("http://localhost:4173/");

  const playlistResponse = await page.request.post("http://localhost:4173/api/playlist", {
    headers: { ...commonHeaders, "content-type": "application/json" },
    data: { input: "https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t" }
  });
  expect(playlistResponse.status()).toBe(403);
  await expect(playlistResponse.json()).resolves.toStrictEqual({ error: "Invalid request origin." });
});

test("logs in and formats Spotify playlist using API response", async ({ page }) => {
  test.skip(!APP_PASSWORD, "APP_PASSWORD is required in env for login e2e tests");

  let playlistCalls = 0;
  await page.route("**/api/playlist", async (route) => {
    playlistCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        playlistId: "abc123",
        playlistName: "E2E Playlist",
        trackCount: 2,
        tracks: [
          { artist: "Artist A", title: "Song 1" },
          { artist: "Artist B", title: "Song 2" }
        ]
      })
    });
  });

  await loginToApp(page);

  await page.getByLabel("Spotify Playlist URL").fill("https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t");
  await page.getByRole("button", { name: "Format" }).click();

  await expect(page.getByText("Playlist: E2E Playlist (2 tracks)")).toBeVisible();
  await expect(page.getByLabel("Formatted output")).toHaveValue(/Artist A - Song 1/);

  await page.getByLabel("Format style").selectOption("plain");
  await expect(page.getByLabel("Formatted output")).toHaveValue(/Artist B - Song 2/);
  expect(playlistCalls).toBe(1);
});

test.describe("Spotify API error messages", () => {
  test.skip(!APP_PASSWORD, "APP_PASSWORD is required in env for login e2e tests");

  const cases: Array<{ status: number; message: string }> = [
    { status: 404, message: "Playlist not found or not publicly accessible." },
    { status: 429, message: "Spotify rate limit reached. Please wait and try again." },
    { status: 502, message: "Spotify API error. Please try again." }
  ];

  for (const scenario of cases) {
    test(`shows exact message for status ${scenario.status}`, async ({ page }) => {
      await page.route("**/api/playlist", async (route) => {
        await route.fulfill({
          status: scenario.status,
          contentType: "application/json",
          body: JSON.stringify({ error: scenario.message })
        });
      });

      await loginToApp(page);
      await page.getByLabel("Spotify Playlist URL").fill("https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t");
      await page.getByRole("button", { name: "Format" }).click();

      await expect(page.getByRole("alert")).toHaveText(scenario.message);
    });
  }
});

test("resets spotify input, error, and output when switching sources", async ({ page }) => {
  test.skip(!APP_PASSWORD, "APP_PASSWORD is required in env for login e2e tests");

  await loginToApp(page);

  // Create an input validation error in Spotify mode.
  await page.getByLabel("Spotify Playlist URL").fill("not-a-spotify-link");
  await page.getByRole("button", { name: "Format" }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a valid URL or Spotify playlist URI.");

  // Switching to Mixxx should clear previous Spotify state.
  await setSource(page, "mixxx");
  await expect(page.getByLabel("Mixxx CSV")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Formatted output")).toHaveCount(0);
  await expect(page.getByLabel("Spotify Playlist URL")).toHaveCount(0);

  // Switch back to Spotify and create formatted output.
  let playlistCalls = 0;
  await page.route("**/api/playlist", async (route) => {
    playlistCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        playlistId: "abc123",
        playlistName: "Reset Test Playlist",
        trackCount: 1,
        tracks: [{ artist: "Artist A", title: "Song 1" }]
      })
    });
  });

  await setSource(page, "spotify");
  await page.getByLabel("Spotify Playlist URL").fill("https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t");
  await page.getByRole("button", { name: "Format" }).click();
  await expect(page.getByText("Playlist: Reset Test Playlist (1 tracks)")).toBeVisible();
  expect(playlistCalls).toBe(1);

  // Switching to Djay should clear prior Spotify input/output/error state.
  await setSource(page, "djay");
  await expect(page.getByLabel("Djay Pro CSV")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Formatted output")).toHaveCount(0);
  await expect(page.getByLabel("Spotify Playlist URL")).toHaveCount(0);
});

test("formats Mixxx CSV without calling playlist API", async ({ page }) => {
  test.skip(!APP_PASSWORD, "APP_PASSWORD is required in env for login e2e tests");

  let playlistCalls = 0;
  await page.route("**/api/playlist", async (route) => {
    playlistCalls += 1;
    await route.continue();
  });

  await loginToApp(page);
  await setSource(page, "mixxx");
  await expect(page.getByLabel("Mixxx CSV")).toBeVisible();

  const mixxxCsv = `"#","Album Artist","Artist","Title"
"1","4 Non Blondes","4 Non Blondes","Spaceman"
"2","50 Year Storm","50 Year Storm","Grace"`;
  await page.getByLabel("Mixxx CSV").setInputFiles({
    name: "mixxx-export.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(mixxxCsv)
  });
  await page.getByRole("button", { name: "Format" }).click();

  await expect(page.getByText("Playlist: mixxx-export (2 tracks)")).toBeVisible();
  await expect(page.getByLabel("Formatted output")).toHaveValue(/4 Non Blondes - Spaceman/);
  expect(playlistCalls).toBe(0);
});

test("formats Djay Pro CSV without calling playlist API", async ({ page }) => {
  test.skip(!APP_PASSWORD, "APP_PASSWORD is required in env for login e2e tests");

  let playlistCalls = 0;
  await page.route("**/api/playlist", async (route) => {
    playlistCalls += 1;
    await route.continue();
  });

  await loginToApp(page);
  await setSource(page, "djay");
  await expect(page.getByLabel("Djay Pro CSV")).toBeVisible();

  const djayCsv = `"Title","Artist","Album","Time","BPM","Key","URL"
"Faint","LINKIN PARK","Meteora","02:42","134.9","12A","apple-music:library:track:i.2PBZr8LFVa2qee"
"Gambler (7"" Version)","Madonna","Gambler - Single","03:51","150.8","7A","apple-music:library:track:i.8WBlE5YSMZEv55"`;
  await page.getByLabel("Djay Pro CSV").setInputFiles({
    name: "djay-export.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(djayCsv)
  });
  await page.getByRole("button", { name: "Format" }).click();

  await expect(page.getByText("Playlist: djay-export (2 tracks)")).toBeVisible();
  await expect(page.getByLabel("Formatted output")).toHaveValue(/LINKIN PARK - Faint/);
  expect(playlistCalls).toBe(0);
});

test("logout returns user to login and re-protects root", async ({ page }) => {
  test.skip(!APP_PASSWORD, "APP_PASSWORD is required in env for login e2e tests");

  await loginToApp(page);

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login/);

  await gotoRoot(page);
  await expect(page).toHaveURL(/\/login/);
});
