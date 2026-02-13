<script lang="ts">
  import "$lib/styles/base.css";
  import "./page.css";
  import { getNextFromLocation, parseLoginSuccess, postLogin } from "$lib/auth/login-client";

  let password = $state("");
  let error = $state("");
  let isSubmitting = $state(false);

  const next = getNextFromLocation(typeof window !== "undefined" ? window.location.search : "");
  const errorId = "login-error";
  const hintId = "login-password-hint";

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    isSubmitting = true;
    error = "";

    try {
      const res = await postLogin({ password, next });

      if (!res.ok) {
        error = await res.text();
        return;
      }

      const { redirectTo } = await parseLoginSuccess(res);
      window.location.assign(redirectTo);
    } catch {
      error = "Network error while signing in. Please try again.";
    } finally {
      isSubmitting = false;
    }
  }
</script>

<main class="login-shell">
  <section class="login-card" aria-labelledby="login-title">
    <div class="brand-mark" aria-hidden="true"></div>
    <h1 id="login-title" class="login-title">Login</h1>
    <p class="subtitle">Enter your password to access this app.</p>

    <form class="login-form" onsubmit={submit} novalidate>
      <label class="login-label" for="password">Password</label>
      <input
        class="login-input"
        id="password"
        type="password"
        bind:value={password}
        autocomplete="current-password"
        placeholder="Enter your password"
        aria-required="true"
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        required
      />
      <p id={hintId} class="login-hint">Your password is required to continue.</p>

      <button class="login-button" type="submit" disabled={isSubmitting} aria-busy={isSubmitting ? "true" : "false"}>
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>

      {#if error}
        <p id={errorId} class="error" role="alert" aria-live="assertive">{error}</p>
      {/if}
    </form>
  </section>
</main>
