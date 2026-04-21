/**
 * Daily Blog Article Generator for 3 Jars Academy
 *
 * Calls the Claude API to generate a new parenting / kids-math / financial-
 * literacy article every day. Outputs a complete blog HTML file matching the
 * existing article template, then commits + pushes to main so the daily-digest
 * script (which runs immediately after) picks it up as the "latest article."
 *
 * Required environment variables (GitHub Secrets):
 *   ANTHROPIC_API_KEY   — API key for api.anthropic.com (starts with sk-ant-)
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Run git with argv directly so titles with quotes / $ / etc. can't
// break out of the shell.
function git(...args) {
  execFileSync('git', args, { stdio: 'inherit' });
}

const BLOG_DIR = join(process.cwd(), 'blog');
const SITE_URL = 'https://3jars.ai';
const MODEL = 'claude-sonnet-4-6';

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const TODAY_DISPLAY = new Date().toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric',
});

// ── Helpers ─────────────────────────────────────────────────────────

/** Read titles of the last 14 articles to avoid topic repeats. */
async function getRecentTitles() {
  const files = await readdir(BLOG_DIR);
  const articles = files
    .filter(f => /^\d{4}-\d{2}-\d{2}-.+\.html$/.test(f))
    .sort()
    .reverse()
    .slice(0, 14);

  const titles = [];
  for (const f of articles) {
    const html = await readFile(join(BLOG_DIR, f), 'utf-8');
    const m = html.match(/<title>([^<]+)<\/title>/i);
    if (m) titles.push(m[1].trim());
  }
  return titles;
}

/** Check if an article for today already exists (idempotency guard). */
async function todayArticleExists() {
  const files = await readdir(BLOG_DIR);
  return files.some(f => f.startsWith(TODAY + '-') && f.endsWith('.html'));
}

/** Call the Claude API and return the text content. */
async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

// ── Prompt ──────────────────────────────────────────────────────────

function buildPrompt(recentTitles) {
  return `You are the content writer for 3 Jars Academy (https://3jars.ai), a free educational app where kids practice math, languages, and puzzles — and every 10,000 points they earn fills three jars with real money: one for family experiences, one for investing, and one for giving back.

Your audience is parents of kids ages 5–12 who care about education and building healthy financial habits. Tone: warm, evidence-informed, conversational, practical — like a smart friend at a dinner party who happens to know the research. Never preachy. Always actionable.

Write a NEW blog article. Pick a fresh topic from this broad pool — but surprise me, don't be predictable:
• Math education, number sense, math games, math anxiety
• Financial literacy for kids (allowance, saving, investing, giving)
• Learning through play, gamification, intrinsic motivation
• Parenting strategies around homework, screen time, praise
• Growth mindset, grit, productive struggle
• Specific math concepts explained for parents (fractions, estimation, patterns)
• The science of habits, streaks, and reward systems for kids
• Cross-cultural perspectives on how kids learn math
• How everyday moments (cooking, shopping, sports) build math skills

AVOID repeating any of these recent titles:
${recentTitles.map(t => '  - ' + t).join('\n')}

Respond with ONLY a JSON object (no markdown fencing, no extra text) with these exact fields:
{
  "slug": "kebab-case-url-slug-max-8-words",
  "title": "The Article Title",
  "description": "A one-sentence meta description, 120-160 characters.",
  "keywords": "comma, separated, seo, keywords, 5-8 terms",
  "tag": "One word category tag like Parenting or Math or Money",
  "readMinutes": 5,
  "bodyHTML": "<p>The full article body as HTML...</p>"
}

For bodyHTML, write 800–1200 words using these HTML components (matching the site's existing style):

1. Regular paragraphs: <p>...</p>
2. Section headings: <h2>...</h2>
3. Stat cards (use 2-3 per article):
   <div class="stat-cards">
     <div class="stat-card">
       <div class="stat-number gold">NUMBER</div>
       <div class="stat-label">description</div>
     </div>
   </div>
   (stat-number classes: "gold", "green", or "purple")

4. Principle/tip boxes (use 2-4 per article):
   <div class="principle-box">
     <p><strong>Tip title.</strong> Explanation text.</p>
   </div>

5. Quote box (use exactly 1 per article):
   <div class="quote-box">
     <p>"The quote text."</p>
     <cite>&mdash; Author Name, <em>Source</em> (Year)</cite>
   </div>

Make the article genuinely useful. Include specific numbers, research references, and at least one thing a parent could try tonight. End with a forward-looking paragraph (not a summary).`;
}

// ── Template ────────────────────────────────────────────────────────

function buildHTML(data) {
  const url = `${SITE_URL}/blog/${TODAY}-${data.slug}.html`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${data.title}</title>
<meta name="description" content="${data.description}">
<meta name="keywords" content="${data.keywords}">
<meta property="og:title" content="${data.title}">
<meta property="og:description" content="${data.description}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<link rel="canonical" href="${url}">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "${data.title}",
  "datePublished": "${TODAY}",
  "author": { "@type": "Organization", "name": "3 Jars Academy" },
  "publisher": { "@type": "Organization", "name": "3 Jars Academy", "url": "${SITE_URL}" },
  "description": "${data.description}"
}
</script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    min-height: 100vh;
    background: #FFF8F0;
    color: #2d2d2d;
    line-height: 1.7;
  }
  .nav {
    background: white;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    padding: 14px 20px;
    display: flex; align-items: center; justify-content: space-between;
    max-width: 900px; margin: 0 auto;
  }
  .nav-left { display: flex; align-items: center; gap: 16px; }
  .nav-logo {
    font-size: 1.3em; font-weight: 900;
    background: linear-gradient(135deg, #fbbf24, #f472b6, #818cf8, #34d399);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text; text-decoration: none;
  }
  .nav a { color: rgba(0,0,0,0.5); text-decoration: none; font-size: 0.9em; }
  .nav a:hover { color: #fbbf24; }
  article {
    max-width: 680px; margin: 0 auto;
    padding: 48px 20px 60px;
  }
  .post-tag {
    display: inline-block; font-size: 0.7em; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    color: #d97706; background: rgba(251,191,36,0.12);
    padding: 4px 12px; border-radius: 999px; margin-bottom: 16px;
  }
  h1 {
    font-size: 2.2em; font-weight: 900; line-height: 1.2;
    margin-bottom: 12px; color: #1f1f1f;
  }
  .meta { font-size: 0.85em; color: rgba(0,0,0,0.4); margin-bottom: 32px; }
  h2 {
    font-size: 1.35em; font-weight: 800; margin: 36px 0 16px;
    color: #1f1f1f;
  }
  p { margin-bottom: 18px; font-size: 1.05em; }
  .stat-cards {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 14px; margin: 28px 0;
  }
  .stat-card {
    background: white; border: 1px solid rgba(0,0,0,0.08);
    border-radius: 16px; padding: 20px 14px; text-align: center;
  }
  .stat-number { font-size: 2em; font-weight: 800; margin-bottom: 4px; }
  .stat-number.gold { color: #d97706; }
  .stat-number.green { color: #059669; }
  .stat-number.purple { color: #6366f1; }
  .stat-label { font-size: 0.78em; color: rgba(0,0,0,0.45); line-height: 1.4; }
  .principle-box {
    background: white; border-left: 4px solid #f472b6;
    border-radius: 0 12px 12px 0; padding: 20px 24px; margin: 20px 0;
  }
  .principle-box strong { color: #db2777; }
  .principle-box p { margin-bottom: 0; font-size: 0.95em; }
  .quote-box {
    background: rgba(129,140,248,0.06); border: 1px solid rgba(129,140,248,0.15);
    border-radius: 16px; padding: 24px; margin: 28px 0;
    font-style: italic; text-align: center;
  }
  .quote-box p { color: rgba(0,0,0,0.6); margin-bottom: 8px; }
  .quote-box cite { font-size: 0.82em; color: rgba(0,0,0,0.4); font-style: normal; }
  .cta-box {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    border-radius: 16px; padding: 28px; text-align: center; margin: 36px 0;
  }
  .cta-box h3 { font-size: 1.2em; color: #2d2d2d; margin-bottom: 8px; }
  .cta-box p { color: rgba(0,0,0,0.65); margin-bottom: 16px; font-size: 0.92em; }
  .cta-btn {
    display: inline-block; background: #2d2d2d; color: white;
    padding: 12px 32px; border-radius: 30px; text-decoration: none;
    font-weight: 700; font-size: 1em; transition: opacity 0.2s;
  }
  .cta-btn:hover { opacity: 0.85; }
  .share-section {
    border-top: 1px solid rgba(0,0,0,0.08);
    padding-top: 24px; margin-top: 36px; text-align: center;
  }
  .share-section p { font-size: 0.85em; color: rgba(0,0,0,0.4); margin-bottom: 12px; }
  .share-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .share-btn {
    font-size: 0.82em; padding: 8px 18px; border-radius: 24px;
    border: 1px solid rgba(0,0,0,0.1); background: white;
    color: rgba(0,0,0,0.6); cursor: pointer; text-decoration: none;
    transition: all 0.2s;
  }
  .share-btn:hover { border-color: #fbbf24; color: #d97706; }
  .footer {
    text-align: center; padding: 32px 20px;
    color: rgba(0,0,0,0.25); font-size: 0.8em;
  }
  .footer a { color: rgba(0,0,0,0.4); text-decoration: none; }
  @media (max-width: 600px) {
    h1 { font-size: 1.7em; }
    .stat-cards { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
  <div class="nav">
    <div class="nav-left">
      <a class="nav-logo" href="../index.html">3 Jars</a>
      <a href="./">&larr; Blog</a>
    </div>
    <a href="../index.html">Play Now</a>
  </div>

  <article>
    <span class="post-tag">${data.tag}</span>
    <h1>${data.title}</h1>
    <div class="meta">${TODAY_DISPLAY} &middot; ${data.readMinutes} min read</div>

    ${data.bodyHTML}

    <div class="cta-box">
      <h3>Make math the best part of your kid's day</h3>
      <p>3 Jars Academy turns math practice into games where every correct answer builds toward family experiences, investing, and giving back — no timers, no red pens.</p>
      <a class="cta-btn" href="${SITE_URL}">Start Playing Free &rarr;</a>
    </div>

    <div class="share-section">
      <p>Know another parent who could use this? Send it their way.</p>
      <div class="share-row">
        <a class="share-btn" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(data.title)}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener">Share on X</a>
        <a class="share-btn" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener">Share on Facebook</a>
        <button class="share-btn" onclick="navigator.clipboard.writeText(window.location.href); this.textContent='Copied!'; setTimeout(()=>this.textContent='Copy Link',2000);">Copy Link</button>
      </div>
    </div>
  </article>

  <div class="footer">
    <a href="./">&larr; More articles</a> &middot; <a href="../index.html">3 Jars Academy</a><br><br>
    &copy; 2026 3 Jars Academy
  </div>
</body>
</html>`;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY');
    process.exit(1);
  }

  // Idempotency: if today's article already exists, skip.
  if (await todayArticleExists()) {
    console.log(`Article for ${TODAY} already exists. Skipping generation.`);
    return;
  }

  // 1. Get recent titles to avoid repeats.
  const recentTitles = await getRecentTitles();
  console.log(`Found ${recentTitles.length} recent article(s) to avoid repeating.`);

  // 2. Call Claude to generate the article.
  console.log(`Calling ${MODEL} to generate today's article...`);
  const prompt = buildPrompt(recentTitles);
  const raw = await callClaude(prompt);

  // 3. Parse the JSON response.
  let data;
  try {
    // Strip markdown fencing if present (in case model wraps in ```json).
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    data = JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse Claude response as JSON:', e.message);
    console.error('Raw response (first 500 chars):', raw.slice(0, 500));
    process.exit(1);
  }

  if (!data.slug || !data.title || !data.bodyHTML) {
    console.error('Missing required fields in Claude response:', Object.keys(data));
    process.exit(1);
  }

  // 4. Write the HTML file.
  const filename = `${TODAY}-${data.slug}.html`;
  const filepath = join(BLOG_DIR, filename);
  const html = buildHTML(data);
  await writeFile(filepath, html, 'utf-8');
  console.log(`Written: blog/${filename} (${html.length} bytes)`);

  // 5. Git commit + push.
  try {
    git('config', 'user.name', '3 Jars Bot');
    git('config', 'user.email', 'noreply@3jars.ai');
    git('add', `blog/${filename}`);
    git('commit', '-m', `Add blog article: ${data.title}`);
    git('push');
    console.log('Committed and pushed to main.');
  } catch (e) {
    console.error('Git commit/push failed:', e.message);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
