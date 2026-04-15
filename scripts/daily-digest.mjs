/**
 * Daily Digest Email Script for 3 Jars Academy
 *
 * Reads the latest blog article from the repo, fetches all registered
 * account emails from Firebase, and sends a daily digest via SendGrid.
 *
 * Required environment variables (set as GitHub Secrets):
 *   SENDGRID_API_KEY           – SendGrid API key (starts with SG.)
 *   FIREBASE_DB_URL            – e.g. https://jars-academy-default-rtdb.firebaseio.com
 *   FIREBASE_DB_SECRET         – Firebase Realtime Database secret
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// ── Config ──────────────────────────────────────────────────────────
const {
  SENDGRID_API_KEY,
  FIREBASE_DB_URL,
  FIREBASE_DB_SECRET,
} = process.env;

const BLOG_DIR = join(process.cwd(), 'blog');
const SITE_URL = 'https://3jars.ai';
const FROM_EMAIL = 'noreply@3jars.ai';
const FROM_NAME = '3 Jars Academy';

// ── Helpers ─────────────────────────────────────────────────────────

/** Parse the latest blog HTML file and extract title + description + URL */
async function getLatestBlogArticle() {
  const files = await readdir(BLOG_DIR);
  // Blog files are named like 2026-04-14-slug.html — sort descending to get newest
  const blogFiles = files
    .filter(f => /^\d{4}-\d{2}-\d{2}-.+\.html$/.test(f))
    .sort()
    .reverse();

  if (blogFiles.length === 0) {
    console.log('No blog articles found. Skipping digest.');
    process.exit(0);
  }

  const latest = blogFiles[0];
  const html = await readFile(join(BLOG_DIR, latest), 'utf-8');

  // Extract title from <title> tag
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'New Article on 3 Jars Academy';

  // Extract description from meta tag
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  const description = descMatch ? descMatch[1].trim() : '';

  // Extract publish date from filename
  const dateMatch = latest.match(/^(\d{4}-\d{2}-\d{2})/);
  const publishDate = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);

  const url = `${SITE_URL}/blog/${latest}`;

  return { title, description, publishDate, url, filename: latest };
}

/** Fetch all account emails from Firebase Realtime Database */
async function getAccountEmails() {
  const url = `${FIREBASE_DB_URL}/accounts.json?auth=${FIREBASE_DB_SECRET}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Firebase fetch failed: ${res.status} ${res.statusText}`);
  }

  const accounts = await res.json();
  if (!accounts) return [];

  const emails = [];
  for (const [key, value] of Object.entries(accounts)) {
    const email = value?.email || key.replace(/_/g, '.');
    if (email && email.includes('@') && !email.includes('guest')) {
      emails.push({ email, name: value?.displayName || email.split('@')[0] });
    }
  }

  return emails;
}

/** Build the HTML email body */
function buildEmailHTML(article, recipientName) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:32px 40px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:24px;">3 Jars Academy</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Daily Digest</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="color:#333;font-size:16px;line-height:1.5;margin:0 0 24px;">
              Hi ${recipientName},
            </p>
            <!-- Article Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr>
                <td style="padding:24px;">
                  <p style="color:#888;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Latest Article &bull; ${article.publishDate}</p>
                  <h2 style="color:#333;margin:0 0 12px;font-size:20px;">${article.title}</h2>
                  ${article.description ? `<p style="color:#666;font-size:14px;line-height:1.5;margin:0 0 16px;">${article.description}</p>` : ''}
                  <a href="${article.url}" style="display:inline-block;background:#667eea;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold;">Read Article &rarr;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#fafafa;padding:24px 40px;text-align:center;border-top:1px solid #eee;">
            <p style="color:#999;font-size:12px;margin:0;">
              You're receiving this because you have an account on
              <a href="${SITE_URL}" style="color:#667eea;text-decoration:none;">3jars.ai</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Send a single email via SendGrid v3 Mail Send API */
async function sendEmail(to, toName, subject, htmlContent) {
  const payload = {
    personalizations: [
      {
        to: [{ email: to, name: toName }],
      },
    ],
    from: { email: FROM_EMAIL, name: FROM_NAME },
    reply_to: { email: FROM_EMAIL, name: FROM_NAME },
    subject,
    content: [
      { type: 'text/html', value: htmlContent },
    ],
  };

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendGrid send failed: ${res.status} – ${text}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  // Validate env
  const missing = ['SENDGRID_API_KEY', 'FIREBASE_DB_URL', 'FIREBASE_DB_SECRET']
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`Missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  // 1. Get latest blog article
  const article = await getLatestBlogArticle();
  console.log(`Latest article: "${article.title}" (${article.publishDate})`);
  console.log(`URL: ${article.url}`);

  // 2. Get all account emails
  const accounts = await getAccountEmails();
  console.log(`Found ${accounts.length} accounts to email.`);

  if (accounts.length === 0) {
    console.log('No accounts found. Skipping digest.');
    process.exit(0);
  }

  // 3. Send digest to each account
  let sent = 0;
  let failed = 0;
  const subject = `${article.title} — 3 Jars Academy`;

  for (const account of accounts) {
    try {
      const html = buildEmailHTML(article, account.name);
      await sendEmail(account.email, account.name, subject, html);
      sent++;
      console.log(`  ✓ Sent to ${account.email}`);
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      failed++;
      console.error(`  ✗ Failed for ${account.email}: ${e.message}`);
    }
  }

  console.log(`\nDone! Sent: ${sent}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
