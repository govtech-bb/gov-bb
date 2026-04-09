// =============================================================================
// DEMO FILE — Deliberately contains hardcoded secrets to trigger Gitleaks
// =============================================================================
// This file demonstrates what the Secrets Scan job catches.
// In a real scenario, a developer might accidentally commit credentials
// like these. The CI pipeline blocks the PR before they reach the codebase.
//
// Gitleaks uses pattern matching to detect strings that look like real
// credentials — API keys with known prefixes, long random strings that
// match token formats, AWS key patterns, etc.
// =============================================================================

// ---------------------------------------------------------------------------
// VIOLATION 1: Hardcoded AWS Access Key
// ---------------------------------------------------------------------------
// Gitleaks detects this because it matches the AWS access key pattern:
// 20-character string starting with "AKIA" (the prefix for all AWS access keys).
//
// WHY THIS IS DANGEROUS: AWS access keys grant programmatic access to your
// AWS account. Bots scrape GitHub for these patterns within minutes of a push.
// AWS has had to build automated key revocation because leaked keys are so common.
//
// HOW TO FIX: Use environment variables or AWS IAM roles (OIDC) instead.
// ---------------------------------------------------------------------------
const AWS_ACCESS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const AWS_SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

// ---------------------------------------------------------------------------
// VIOLATION 2: Hardcoded Database Connection String with Password
// ---------------------------------------------------------------------------
// Gitleaks detects the password embedded in the connection URI.
// This pattern is common in quick prototypes that never get cleaned up.
//
// WHY THIS IS DANGEROUS: Database credentials give direct access to all data.
// Combined with a public-facing endpoint, this is a full data breach.
//
// HOW TO FIX: Use Secrets Manager (which our ECS tasks already do via valueFrom).
// ---------------------------------------------------------------------------
const DATABASE_URL = 'postgresql://admin:SuperSecretPassword123!@db.example.com:5432/production';

// ---------------------------------------------------------------------------
// VIOLATION 3: Hardcoded GitHub Personal Access Token
// ---------------------------------------------------------------------------
// Gitleaks detects the "ghp_" prefix which is GitHub's format for
// personal access tokens.
//
// WHY THIS IS DANGEROUS: A GitHub PAT can push code, create releases,
// access private repos, and modify CI/CD workflows — depending on scopes.
//
// HOW TO FIX: Use GITHUB_TOKEN (automatically provided in Actions) or
// store tokens in GitHub Secrets.
// ---------------------------------------------------------------------------
const GITHUB_TOKEN = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef12';

// ---------------------------------------------------------------------------
// THE CORRECT WAY — What the scanner will NOT flag:
// ---------------------------------------------------------------------------
// These patterns are safe because they use environment variables,
// placeholder values, or obviously fake strings.
// ---------------------------------------------------------------------------
const safeAwsConfig = {
  region: process.env.AWS_REGION,           // Environment variable — no secret in code
  // Credentials come from IAM role, not hardcoded keys
};

const safeDatabaseUrl = process.env.DATABASE_URL;  // Read from environment at runtime

const safeGithubToken = 'your-github-token-here';  // Obvious placeholder — scanner ignores this

export { safeAwsConfig, safeDatabaseUrl, safeGithubToken };
