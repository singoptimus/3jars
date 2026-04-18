/**
 * Publish Queued Article — picks the next pre-generated article from
 * blog/queue/, renames it with today's date, moves it to blog/, and
 * commits + pushes. Called by the daily-content workflow BEFORE the
 * digest email step.
 *
 * Queue files are named NN-slug.html (e.g. 01-teaching-fractions.html).
 * They're published in numeric order. Once published, the file is removed
 * from queue/ and appears in blog/ as YYYY-MM-DD-slug.html.
 *
 * No environment variables needed — just git access.
 */

import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { rebuildIndex } from './rebuild-blog-index.mjs';

const BLOG_DIR = join(process.cwd(), 'blog');
const QUEUE_DIR = join(BLOG_DIR, 'queue');
const TODAY = new Date().toISOString().slice(0, 10);
const TODAY_DISPLAY = new Date().toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric',
});

async function main() {
  // 1. Check if today's article already exists (idempotency).
  const existing = await readdir(BLOG_DIR);
  if (existing.some(f => f.startsWith(TODAY + '-') && f.endsWith('.html'))) {
    console.log(`Article for ${TODAY} already exists in blog/. Skipping.`);
    return;
  }

  // 2. Find the next queued article (sorted, so lowest number goes first).
  let queue;
  try {
    queue = (await readdir(QUEUE_DIR))
      .filter(f => /^\d+-.*\.html$/.test(f))
      .sort((a, b) => {
        const na = parseInt(a);
        const nb = parseInt(b);
        return na - nb;
      });
  } catch (e) {
    console.error('Could not read blog/queue/ directory:', e.message);
    process.exit(1);
  }

  if (queue.length === 0) {
    console.log('Queue is empty — no articles to publish. Skipping.');
    // Exit 0 so the digest still sends the latest existing article.
    return;
  }

  const nextFile = queue[0];
  console.log(`Publishing queued article: ${nextFile} (${queue.length - 1} remaining after this)`);

  // 3. Read the HTML and update the date placeholders.
  let html = await readFile(join(QUEUE_DIR, nextFile), 'utf-8');

  // Extract slug from filename: "01-teaching-fractions.html" → "teaching-fractions"
  const slug = nextFile.replace(/^\d+-/, '').replace(/\.html$/, '');
  const destFilename = `${TODAY}-${slug}.html`;
  const destURL = `https://3jars.ai/blog/${destFilename}`;

  // Replace date placeholders left by the batch generator.
  html = html.replace(/\{\{DATE\}\}/g, TODAY);
  html = html.replace(/\{\{DATE_DISPLAY\}\}/g, TODAY_DISPLAY);
  html = html.replace(/\{\{URL\}\}/g, destURL);

  // 4. Write to blog/ and remove from queue/.
  await writeFile(join(BLOG_DIR, destFilename), html, 'utf-8');
  await unlink(join(QUEUE_DIR, nextFile));
  console.log(`Written: blog/${destFilename}`);
  console.log(`Removed: blog/queue/${nextFile}`);

  // 5. Regenerate blog/index.html so the landing page lists the new article.
  try {
    await rebuildIndex();
  } catch (e) {
    console.error('Index rebuild failed (not fatal — continuing):', e.message);
  }

  // 6. Commit + push.
  try {
    execSync('git config user.name "3 Jars Bot"', { stdio: 'inherit' });
    execSync('git config user.email "noreply@3jars.ai"', { stdio: 'inherit' });
    execSync(`git add "blog/${destFilename}" "blog/queue/${nextFile}" "blog/index.html"`, { stdio: 'inherit' });

    // Extract title for commit message.
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : slug;
    execSync(`git commit -m "Add blog article: ${title}"`, { stdio: 'inherit' });
    execSync('git push', { stdio: 'inherit' });
    console.log('Committed and pushed.');
  } catch (e) {
    console.error('Git operations failed:', e.message);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
