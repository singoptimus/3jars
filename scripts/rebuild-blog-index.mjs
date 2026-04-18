/**
 * Rebuild blog/index.html — regenerates the post list + page shell from the
 * articles that actually live in blog/. Run this after publishing a new
 * article (the daily publisher calls it) or any time you want the blog
 * landing page to match the files on disk.
 *
 * Metadata is extracted from each article HTML:
 *   <title>                → card title
 *   <meta name="description"> → excerpt
 *   <span class="post-tag">Category</span> → tag chip
 *   <div class="meta">April 17, 2026 · 5 min read</div> → meta line
 *
 * Filename format is YYYY-MM-DD-slug.html — the date drives sort order.
 * No environment variables needed.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BLOG_DIR = join(process.cwd(), 'blog');
const INDEX_FILE = join(BLOG_DIR, 'index.html');

// Category → CSS class name. Anything not listed here falls back to the
// default yellow .post-tag styling.
const TAG_CLASS = {
  parenting: 'tag-parenting',
  research:  'tag-research',
  guide:     'tag-guide',
  tips:      'tag-tips',
  math:      'tag-math',
  money:     'tag-money',
  mindset:   'tag-mindset',
};

function extract(html, re, fallback = '') {
  const m = html.match(re);
  return m ? m[1].trim() : fallback;
}

function estimateReadTime(html) {
  // Strip tags, count words, assume 230 wpm.
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                   .replace(/<style[\s\S]*?<\/style>/gi, '')
                   .replace(/<[^>]+>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

function formatDate(ymd) {
  // ymd: "2026-04-17" → "April 17, 2026"
  const [y, m, d] = ymd.split('-').map(Number);
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${months[m - 1]} ${d}, ${y}`;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
}

async function readPost(filename) {
  const html = await readFile(join(BLOG_DIR, filename), 'utf-8');
  const date = filename.slice(0, 10); // YYYY-MM-DD
  const title = extract(html, /<title>([^<]+)<\/title>/i, filename);
  const description = extract(html, /<meta\s+name="description"\s+content="([^"]+)"/i);
  const category = extract(html, /<span\s+class="post-tag"[^>]*>([^<]+)<\/span>/i, '');

  // Try to parse read time from an existing .meta line, otherwise estimate.
  const metaLine = extract(html, /<div\s+class="meta"[^>]*>([^<]+)<\/div>/i);
  let readMinutes = null;
  const readMatch = metaLine.match(/(\d+)\s*min\s*read/i);
  if (readMatch) readMinutes = parseInt(readMatch[1], 10);
  if (!readMinutes) readMinutes = estimateReadTime(html);

  return { filename, date, title, description, category, readMinutes };
}

function renderCard(post) {
  const slug = (post.category || '').toLowerCase();
  const tagClass = TAG_CLASS[slug] || '';
  const tagClassAttr = tagClass ? ` ${tagClass}` : '';
  const category = post.category || 'Post';
  return `      <a class="post-card" href="${post.filename}">
        <span class="post-tag${tagClassAttr}">${escapeHtml(category)}</span>
        <div class="post-title">${escapeHtml(post.title)}</div>
        <div class="post-excerpt">${escapeHtml(post.description)}</div>
        <div class="post-meta">${formatDate(post.date)} &middot; ${post.readMinutes} min read</div>
      </a>`;
}

function renderIndex(posts) {
  const cards = posts.map(renderCard).join('\n\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Blog &mdash; 3 Jars Academy</title>
<meta name="description" content="Tips, guides, and insights on teaching kids math, money skills, and financial literacy through fun games and activities.">
<meta property="og:title" content="3 Jars Academy Blog">
<meta property="og:description" content="Tips and guides on teaching kids math and money skills through games.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://3jars.ai/blog/">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<link rel="canonical" href="https://3jars.ai/blog/">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    min-height: 100vh;
    background: #FFF8F0;
    color: #2d2d2d;
  }
  .nav {
    background: white;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    padding: 14px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 900px;
    margin: 0 auto;
  }
  .nav-left { display: flex; align-items: center; gap: 16px; }
  .nav-logo {
    font-size: 1.3em;
    font-weight: 900;
    background: linear-gradient(135deg, #fbbf24, #f472b6, #818cf8, #34d399);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-decoration: none;
  }
  .nav a { color: rgba(0,0,0,0.5); text-decoration: none; font-size: 0.9em; }
  .nav a:hover { color: #fbbf24; }
  .container {
    max-width: 760px;
    margin: 0 auto;
    padding: 40px 20px;
  }
  .blog-header {
    text-align: center;
    margin-bottom: 48px;
  }
  .blog-header h1 {
    font-size: 2.4em;
    font-weight: 900;
    background: linear-gradient(135deg, #fbbf24, #f472b6, #818cf8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 8px;
  }
  .blog-header p {
    color: rgba(0,0,0,0.45);
    font-size: 1.05em;
  }
  .post-list { display: flex; flex-direction: column; gap: 24px; }
  .post-card {
    background: white;
    border: 1px solid rgba(0,0,0,0.08);
    border-radius: 18px;
    padding: 28px 30px;
    text-decoration: none;
    color: #2d2d2d;
    transition: all 0.25s;
    display: block;
  }
  .post-card:hover {
    border-color: rgba(251,191,36,0.4);
    box-shadow: 0 8px 30px rgba(0,0,0,0.08);
    transform: translateY(-2px);
  }
  .post-tag {
    display: inline-block;
    font-size: 0.7em;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    padding: 3px 10px;
    border-radius: 20px;
    margin-bottom: 10px;
    font-weight: 600;
    background: rgba(251,191,36,0.15);
    color: #d97706;
  }
  .tag-guide     { background: rgba(251,191,36,0.15); color: #d97706; }
  .tag-tips      { background: rgba(52,211,153,0.15); color: #059669; }
  .tag-research  { background: rgba(129,140,248,0.15); color: #6366f1; }
  .tag-parenting { background: rgba(244,114,182,0.15); color: #db2777; }
  .tag-math      { background: rgba(59,130,246,0.15);  color: #2563eb; }
  .tag-money     { background: rgba(16,185,129,0.15);  color: #047857; }
  .tag-mindset   { background: rgba(168,85,247,0.15);  color: #7c3aed; }
  .post-title {
    font-size: 1.35em;
    font-weight: 700;
    margin-bottom: 8px;
    line-height: 1.3;
  }
  .post-excerpt {
    color: rgba(0,0,0,0.5);
    font-size: 0.92em;
    line-height: 1.6;
    margin-bottom: 12px;
  }
  .post-meta {
    font-size: 0.78em;
    color: rgba(0,0,0,0.35);
  }
  .footer {
    text-align: center;
    padding: 40px 0 24px;
    color: rgba(0,0,0,0.25);
    font-size: 0.8em;
  }
  @media (max-width: 600px) {
    .blog-header h1 { font-size: 1.8em; }
    .post-card { padding: 20px; }
  }
</style>
</head>
<body>
  <div class="nav">
    <div class="nav-left">
      <a class="nav-logo" href="../index.html">3 Jars</a>
      <a href="../index.html">&larr; Back to Games</a>
    </div>
    <a href="./">Blog</a>
  </div>
  <div class="container">
    <div class="blog-header">
      <h1>3 Jars Blog</h1>
      <p>Helping parents teach kids math, money, and life skills &mdash; through play.</p>
    </div>
    <div class="post-list" id="posts">

${cards}

    </div>
    <div class="footer">
      <a href="../index.html" style="color:rgba(0,0,0,0.4);text-decoration:none;">&larr; Back to 3 Jars Academy</a><br><br>
      &copy; 2026 3 Jars Academy. Made with love.
    </div>
  </div>
</body>
</html>
`;
}

export async function rebuildIndex() {
  const all = await readdir(BLOG_DIR);
  const articleFiles = all
    .filter(f => /^\d{4}-\d{2}-\d{2}-.+\.html$/.test(f))
    .sort()
    .reverse(); // newest first

  const posts = [];
  for (const f of articleFiles) {
    try { posts.push(await readPost(f)); }
    catch (e) { console.warn(`[rebuild-blog-index] Skipped ${f}: ${e.message}`); }
  }

  const html = renderIndex(posts);
  await writeFile(INDEX_FILE, html, 'utf-8');
  console.log(`[rebuild-blog-index] Wrote ${posts.length} posts to blog/index.html`);
  return posts.length;
}

// Run directly if invoked as a script.
const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  rebuildIndex().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
  });
}
