// =============================================================================
// DEMO FILE — Deliberately contains security vulnerabilities to trigger CodeQL
// =============================================================================
// This file demonstrates what the Security Scan (CodeQL) job catches.
// CodeQL performs static analysis — it traces data flow through the code
// to find patterns that could be exploited by attackers.
//
// These examples use Node.js built-in modules (http, fs, child_process)
// so CodeQL can fully resolve the data flow without external dependencies.
// =============================================================================

import * as http from 'http';
import * as fs from 'fs';
import * as url from 'url';
import { exec } from 'child_process';

// ---------------------------------------------------------------------------
// VULNERABILITY 1: Command Injection
// Severity: Critical (CVSS 9.0+)
// ---------------------------------------------------------------------------
// CodeQL traces the data flow:
//   request URL (user input) → url.parse → exec() shell command
//
// WHY THIS IS DANGEROUS: An attacker can send:
//   /lookup?host=google.com;rm -rf /
// The semicolon breaks out of the intended command and executes arbitrary
// shell commands on the server. This gives full control of the machine.
//
// HOW TO FIX: Never pass user input to exec(). Use execFile() with an
// argument array, or use a purpose-built library (e.g. dns.lookup()).
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  if (pathname === '/lookup') {
    const host = query.host as string;

    // BAD: User input directly interpolated into a shell command
    exec(`nslookup ${host}`, (error, stdout) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(stdout || 'No result');
    });
  }

  // ---------------------------------------------------------------------------
  // VULNERABILITY 2: Path Traversal / Arbitrary File Read
  // Severity: High (CVSS 7.0+)
  // ---------------------------------------------------------------------------
  // CodeQL traces the data flow:
  //   request URL (user input) → url.parse → fs.readFileSync
  //
  // WHY THIS IS DANGEROUS: An attacker can send:
  //   /file?name=../../etc/passwd
  // to read any file on the server — environment variables, private keys,
  // database credentials, source code.
  //
  // HOW TO FIX: Validate the resolved path stays within the allowed directory.
  // ---------------------------------------------------------------------------
  if (pathname === '/file') {
    const filename = query.name as string;

    // BAD: User input flows directly into file system read
    const content = fs.readFileSync('/uploads/' + filename, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(content);
  }

  // ---------------------------------------------------------------------------
  // VULNERABILITY 3: Reflected Cross-Site Scripting (XSS)
  // Severity: High (CVSS 7.0+)
  // ---------------------------------------------------------------------------
  // CodeQL traces the data flow:
  //   request URL (user input) → url.parse → HTTP response body
  //
  // WHY THIS IS DANGEROUS: An attacker crafts a URL like:
  //   /search?q=<script>steal(document.cookie)</script>
  // When a victim clicks the link, the script executes in their browser
  // and can steal session tokens, redirect to phishing pages, or modify
  // the page content.
  //
  // HOW TO FIX: Escape HTML entities before including user input in responses.
  // ---------------------------------------------------------------------------
  if (pathname === '/search') {
    const searchQuery = query.q as string;

    // BAD: User input directly embedded in HTML response
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body><h1>Results for: ${searchQuery}</h1></body></html>`);
  }
});

server.listen(3001);

// ---------------------------------------------------------------------------
// THE CORRECT WAY — What CodeQL will NOT flag:
// ---------------------------------------------------------------------------

// SAFE: Use execFile with argument array (no shell interpretation)
import { execFile } from 'child_process';

function safeLookup(host: string, callback: (result: string) => void) {
  // execFile doesn't invoke a shell — arguments are passed directly
  execFile('nslookup', [host], (error, stdout) => {
    callback(stdout || 'No result');
  });
}

// SAFE: Validate resolved path stays within allowed directory
import * as path from 'path';

function safeReadFile(filename: string): string | null {
  const uploadsDir = path.resolve('/uploads');
  const resolved = path.resolve(uploadsDir, filename);

  if (!resolved.startsWith(uploadsDir)) {
    return null; // Path traversal attempt blocked
  }
  return fs.readFileSync(resolved, 'utf-8');
}

// SAFE: Escape HTML entities before rendering
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { safeLookup, safeReadFile, escapeHtml };
