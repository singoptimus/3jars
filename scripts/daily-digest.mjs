/**
 * Daily Digest Email Script for 3 Jars Academy
 *
 * Reads the latest blog article from the repo, fetches all registered
 * account emails from Firebase, and sends a daily digest via EmailJS.
 *
 * Required environment variables (set as GitHub Secrets):
 *   EMAILJS_SERVICE_ID        - e.g. service_oam7ctc
 *   EMAILJS_DIGEST_TEMPLATE_ID - the digest-specific template ID (create on emailjs.com)
 *   EMAILJS_PUBLIC_KEY        - e.g. wlauNCpdFNdFs-izM
 *   FIREBASE_DB_URL           - e.g. https://jars-academy-default-rtdb.firebaseio.com
 *   FIREBASE_DB_SECRET        - Firebase Realtime Database secret (from Firebase console > Project Settings > Service accounts > Database secrets)
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// -- Config --
const {
  EMAILJS_SERVICE_ID,
  EMAILJS_DIGEST_TEMPLATE_ID,
  EMAILJS_PUBLIC_KEY,
  FIREBASE_DB_URL,
  FIREBASE_DB_SECRET,
} = process.env;

const BLOG_DIR = join(process.cwd(), 'blog');
const SITE_URL = 'https://3jars.ai';

// -- Helpers --

/** Parse the latest blog HTML file and extract title + description + URL */
async function getLatestBlogArticle() {
  const files = await readdir(BLOG_DIR);
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

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'New Article on 3 Jars Academy';

  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  const description = descMatch ? descMatch[1].trim() : '';

  const dateMatch = latest.match(/^(\d{4}-\d{2}-\d{2})/);
  const publishDate = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);

  const url = SITE_URL + '/blog/' + latest;

  return { title, description, publishDate, url, filename: latest };
}

/** Fetch all account emails from Firebase Realtime Database */
async function getAccountEmails() {
  const url = FIREBASE_DB_URL + '/accounts.json?auth=' + FIREBASE_DB_SECRET;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error('Firebase fetch failed: ' + res.status + ' ' + res.statusText);
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

/** Send a single email via EmailJS REST API */
async function sendEmailJS(templateParams) {
  const payload = {
    service_id: EMAILJS_SERVICE_ID,
    template_id: EMAILJS_DIGEST_TEMPLATE_ID,
    user_id: EMAILJS_PUBLIC_KEY,
    template_params: templateParams,
  };

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('EmailJS send failed: ' + res.status + ' - ' + text);
  }
}

// -- Main --

async function main() {
  const missing = ['EMAILJS_SERVICE_ID', 'EMAILJS_DIGEST_TEMPLATE_ID', 'EMAILJS_PUBLIC_KEY', 'FIREBASE_DB_URL', 'FIREBASE_DB_SECRET']
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error('Missing environment variables: ' + missing.join(', '));
    process.exit(1);
  }

  const article = await getLatestBlogArticle();
  console.log('Latest article: "' + article.title + '" (' + article.publishDate + ')');
  console.log('URL: ' + article.url);

  const accounts = await getAccountEmails();
  console.log('Found ' + accounts.length + ' accounts to email.');

  if (accounts.length === 0) {
    console.log('No accounts found. Skipping digest.');
    process.exit(0);
  }

  let sent = 0;
  let failed = 0;

  for (const account of accounts) {
    try {
      await sendEmailJS({
        to_email: account.email,
        to_name: account.name,
        article_title: article.title,
        article_description: article.description,
        article_url: article.url,
        article_date: article.publishDate,
        site_url: SITE_URL,
      });
      sent++;
      console.log('  > Sent to ' + account.email);
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      failed++;
      console.error('  X Failed for ' + account.email + ': ' + e.message);
    }
  }

  console.log('\nDone! Sent: ' + sent + ', Failed: ' + failed);
  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
