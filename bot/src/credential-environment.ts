// Auth resolution reads bot's snapshot, not the world (ticket 0139 leg 3).
// This is the set of names the pinned built-in pi-ai providers ask
// AuthContext.env() for, plus secret companions their provider clients consume.
// Authentication and child scrubbing share this registry.
//
// It is declared in two parts (ticket 0286). A name in the first part carries
// the secret itself: a key, a token, or a password. A name in the second part
// carries a profile, a project, a region, an identifier, or the path to where a
// credential lives — an input to authentication whose own value is not a
// secret. Both parts are scrubbed from a child's environment, because a stage
// has no business with either. Only the first part is redacted from a
// provider's report, because calling `default` or `us-central1` a redacted
// credential would both claim a secret that was never there and rewrite
// ordinary words a reader needs.
const PI_SECRET_CREDENTIAL_ENVIRONMENT_NAMES = [
  "AI_GATEWAY_API_KEY", "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_OAUTH_TOKEN",
  "ANT_LING_API_KEY",
  "AWS_ACCESS_KEY_ID", "AWS_BEARER_TOKEN_BEDROCK", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN",
  "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
  "AZURE_OPENAI_API_KEY",
  "BASETEN_API_KEY",
  "CEREBRAS_API_KEY",
  "CLOUDFLARE_API_KEY",
  "COPILOT_GITHUB_TOKEN",
  "DEEPSEEK_API_KEY",
  "FIREWORKS_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_CLOUD_API_KEY",
  "GROQ_API_KEY",
  "HF_TOKEN",
  "KIMI_API_KEY",
  "MINIMAX_API_KEY",
  "MINIMAX_CN_API_KEY",
  "MISTRAL_API_KEY",
  "MOONSHOT_API_KEY",
  "NVIDIA_API_KEY",
  "OPENAI_API_KEY",
  "OPENCODE_API_KEY",
  "OPENROUTER_API_KEY",
  "QWEN_TOKEN_PLAN_API_KEY",
  "QWEN_TOKEN_PLAN_CN_API_KEY",
  "RADIUS_API_KEY",
  "TOGETHER_API_KEY",
  "XAI_API_KEY",
  "XIAOMI_API_KEY",
  "XIAOMI_TOKEN_PLAN_AMS_API_KEY", "XIAOMI_TOKEN_PLAN_CN_API_KEY",
  "XIAOMI_TOKEN_PLAN_SGP_API_KEY",
  "ZAI_API_KEY",
  "ZAI_CODING_CN_API_KEY",
] as const;

const PI_NON_SECRET_CREDENTIAL_ENVIRONMENT_NAMES = [
  "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_PROFILE",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_GATEWAY_ID",
  "GCLOUD_PROJECT",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_CLOUD_PROJECT",
] as const;

export const SECRET_CREDENTIAL_ENVIRONMENT_NAMES: ReadonlySet<string> = new Set(PI_SECRET_CREDENTIAL_ENVIRONMENT_NAMES);
export const NON_SECRET_CREDENTIAL_ENVIRONMENT_NAMES: ReadonlySet<string> = new Set(PI_NON_SECRET_CREDENTIAL_ENVIRONMENT_NAMES);
export const CREDENTIAL_ENVIRONMENT_NAMES: ReadonlySet<string> = new Set([
  ...PI_SECRET_CREDENTIAL_ENVIRONMENT_NAMES, ...PI_NON_SECRET_CREDENTIAL_ENVIRONMENT_NAMES,
]);

// Ticket 0286. A provider that echoes this run's own credential back inside an
// error body would otherwise put that value on stderr, in the `--json`
// envelope, and in the run record. The environment is read at redaction time
// because it is the same live parent-process environment ADR 0030 admits as an
// authentication input: nothing is captured earlier and no environment
// parameter threads through the reporting sites. The marker names the variable
// rather than the secret, so a reader still learns which credential the
// provider was complaining about. Only the secret-bearing names are read: a
// profile, a project, a region, or a path is not a secret, and redacting one
// would assert a secret the report never held. The longest planted value goes
// first, so a short secret that sits inside a longer one cannot leave the
// longer one half redacted. Matching is by value: a credential Pi resolves from
// `auth.json` or `models.json` is not in this environment and stays as written.
export function redactCredentialValues(text: string): string {
  const planted = [...SECRET_CREDENTIAL_ENVIRONMENT_NAMES]
    .map((name) => ({ name, value: process.env[name] ?? "" }))
    .filter((held) => held.value.trim().length > 0 && text.includes(held.value))
    .sort((left, right) => right.value.length - left.value.length);
  return planted.reduce((held, { name, value }) => held.split(value).join(`[redacted ${name}]`), text);
}
