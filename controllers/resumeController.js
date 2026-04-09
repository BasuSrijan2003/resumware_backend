const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const pdfExtractor = require('../services/pdfExtractor');
const aiService = require('../services/aiService');
const latexService = require('../services/latexService');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/resume_generator';
const uploadsDir = path.join(__dirname, '../uploads');

if (!fsSync.existsSync(uploadsDir)) {
  fsSync.mkdirSync(uploadsDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Escape special LaTeX characters in plain text.
 * Do NOT pass URLs through this — use escapeUrl() for those.
 */
function escapeLatex(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

/**
 * Sanitise a URL for use inside a LaTeX \href{}{} command.
 *
 * Key fixes applied here:
 *  1. Strip accidental double-protocol (https://https://...) that occurs when
 *     the AI returns a full URL but an old template was already prepending https://.
 *  2. Escape % and # which are LaTeX special chars inside URLs.
 *  3. Ensure the URL starts with a recognised protocol; if not, prepend https://.
 */
function escapeUrl(str) {
  if (!str) return '';
  let s = String(str).trim();

  // Fix duplicate protocol: https://https:// → https://
  s = s.replace(/^(https?:\/\/)+/i, (match) => {
    // Keep exactly one occurrence of the protocol found
    const proto = match.match(/^https?:\/\//i)[0];
    return proto;
  });

  // If there's no protocol at all, add https://
  if (!/^https?:\/\//i.test(s) && !/^mailto:/i.test(s)) {
    s = 'https://' + s;
  }

  // Escape LaTeX special chars that appear in URLs
  s = s.replace(/%/g, '\\%').replace(/#/g, '\\#');

  return s;
}

/**
 * Parse a string that may embed a URL, e.g.:
 *   "AWS Certified Solutions Architect - https://credly.com/xyz"
 *   "LeetCode (Knight, 1900+) - https://leetcode.com/user"
 *   "https://github.com/user/repo"
 *
 * Returns { label, url } where url may be null if no URL found.
 * The label is the human-readable text with the URL (and its separator) removed.
 */
function parseLinkItem(raw) {
  if (!raw) return { label: '', url: null };
  const urlRegex = /https?:\/\/[^\s)>]+/;
  const match = String(raw).match(urlRegex);
  if (!match) return { label: String(raw), url: null };

  const url = match[0].replace(/[.,;]+$/, ''); // strip trailing punctuation from URL
  const label = String(raw)
    .replace(url, '')
    .replace(/\s*[-–—(|]+\s*$/, '') // strip trailing separators
    .replace(/\)\s*$/, '')           // strip trailing closing paren
    .trim();

  return { label: label || String(raw), url };
}

// ---------------------------------------------------------------------------
// LATEX BUILDER
// ---------------------------------------------------------------------------

function buildLatexString(template, data) {
  let tex = template;

  // --- Header fields ---
  tex = tex.replace('{{NAME}}',     escapeLatex(data.name));
  tex = tex.replace('{{EMAIL}}',    escapeLatex(data.email));
  tex = tex.replace('{{PHONE}}',    escapeLatex(data.phone));
  // LinkedIn & GitHub: full URLs — escapeUrl only, no escapeLatex
  tex = tex.replace('{{LINKEDIN}}', escapeUrl(data.linkedin));
  tex = tex.replace('{{GITHUB}}',   escapeUrl(data.github));

  // Portfolio is optional
  if (data.portfolio && String(data.portfolio).trim() !== '') {
    tex = tex.replace('{{PORTFOLIO_LINK}}',
      ` $|$ \\href{${escapeUrl(data.portfolio)}}{Portfolio}`);
  } else {
    tex = tex.replace('{{PORTFOLIO_LINK}}', '');
  }

  // --- SUMMARY ---
  if (data.summary && String(data.summary).trim() !== '') {
    // Wrap in a minipage so long summaries don't overflow into the heading rule
    const sumTex =
      '\\resheading{SUMMARY}\n' +
      `\\noindent\\small ${escapeLatex(data.summary)}\n` +
      '\\vspace{2pt}\n';
    tex = tex.replace('{{SUMMARY_SECTION}}', sumTex);
  } else {
    tex = tex.replace('{{SUMMARY_SECTION}}', '');
  }

  // --- EDUCATION ---
  if (data.education && data.education.length > 0) {
    let eduTex = '\\resheading{EDUCATION}\n' +
                 '\\begin{itemize}[leftmargin=*,nosep,topsep=0pt]\n';
    eduTex += data.education.map(e =>
      '\\item[]\n' +
      `\\ressubheading{${escapeLatex(e.institution)}}{${escapeLatex(e.date)}}{${escapeLatex(e.degree)}}{${escapeLatex(e.score)}}`
    ).join('\n\\vspace{4pt}\n');
    eduTex += '\n\\end{itemize}\n';
    tex = tex.replace('{{EDUCATION_SECTION}}', eduTex);
  } else {
    tex = tex.replace('{{EDUCATION_SECTION}}', '');
  }

  // --- EXPERIENCE ---
  if (data.experience && data.experience.length > 0) {
    let expTex = '\\resheading{EXPERIENCE}\n' +
                 '\\begin{itemize}[leftmargin=*,nosep,topsep=0pt]\n';
    expTex += data.experience.map(e => {
      const bullets = (e.bullets || [])
        .map(b => `  \\resitem{${escapeLatex(b)}}`)
        .join('\n');
      return (
        '\\item[]\n' +
        `\\ressubheading{${escapeLatex(e.company)}}{${escapeLatex(e.date)}}{${escapeLatex(e.title)}}{${escapeLatex(e.location || '')}}\n` +
        `\\begin{itemize}[leftmargin=14pt,nosep,topsep=1pt]\n${bullets}\n\\end{itemize}`
      );
    }).join('\n\\vspace{5pt}\n');
    expTex += '\n\\end{itemize}\n';
    tex = tex.replace('{{EXPERIENCE_SECTION}}', expTex);
  } else {
    tex = tex.replace('{{EXPERIENCE_SECTION}}', '');
  }

  // --- PROJECTS ---
  if (data.projects && data.projects.length > 0) {
    let projTex = '\\resheading{PROJECTS}\n' +
                  '\\begin{itemize}[leftmargin=*,nosep,topsep=0pt]\n';
    projTex += data.projects.map(p => {
      // Build clickable title: plain title + optional Live / GitHub links
      let titleLatex = escapeLatex(p.title);
      if (p.project_url && String(p.project_url).trim()) {
        titleLatex += ` $|$ \\href{${escapeUrl(p.project_url)}}{Live}`;
      }
      if (p.github_url && String(p.github_url).trim()) {
        titleLatex += ` $|$ \\href{${escapeUrl(p.github_url)}}{GitHub}`;
      }

      const bullets = (p.bullets || [])
        .map(b => `  \\resitem{${escapeLatex(b)}}`)
        .join('\n');

      return (
        '\\item[]\n' +
        `\\ressubheading{${titleLatex}}{${escapeLatex(p.date)}}{Technologies: ${escapeLatex(p.technologies)}}{}\n` +
        `\\begin{itemize}[leftmargin=14pt,nosep,topsep=1pt]\n${bullets}\n\\end{itemize}`
      );
    }).join('\n\\vspace{5pt}\n');
    projTex += '\n\\end{itemize}\n';
    tex = tex.replace('{{PROJECTS_SECTION}}', projTex);
  } else {
    tex = tex.replace('{{PROJECTS_SECTION}}', '');
  }

  // --- SKILLS ---
  if (data.skills && data.skills.length > 0) {
    let skillsTex = '\\resheading{SKILLS}\n' +
                    '\\begin{itemize}[leftmargin=12pt,nosep,topsep=2pt]\n';
    skillsTex += data.skills.map(s => {
      let skillStr = escapeLatex(s);
      // Bold the category prefix (text before first colon)
      const colonIdx = skillStr.indexOf(':');
      if (colonIdx !== -1) {
        const cat = skillStr.slice(0, colonIdx).trim();
        const rest = skillStr.slice(colonIdx + 1).trim();
        skillStr = `\\textbf{${cat}:} ${rest}`;
      }
      return `  \\item[] \\small ${skillStr}`;
    }).join('\n');
    skillsTex += '\n\\end{itemize}\n';
    tex = tex.replace('{{SKILLS_SECTION}}', skillsTex);
  } else {
    tex = tex.replace('{{SKILLS_SECTION}}', '');
  }

  // --- CODING PROFILES ---
  if (data.coding_profiles && data.coding_profiles.length > 0) {
    let cpTex = '\\resheading{CODING PROFILES}\n' +
                '\\begin{itemize}[leftmargin=12pt,nosep,topsep=2pt]\n';
    cpTex += data.coding_profiles.map(cp => {
      const { label, url } = parseLinkItem(cp);
      if (url) {
        // Show "Platform: details" as text and make the URL a clickable [Link]
        return `  \\resitem{${escapeLatex(label)} \\href{${escapeUrl(url)}}{[Link]}}`;
      }
      return `  \\resitem{${escapeLatex(cp)}}`;
    }).join('\n');
    cpTex += '\n\\end{itemize}\n';
    tex = tex.replace('{{CODING_PROFILES_SECTION}}', cpTex);
  } else {
    tex = tex.replace('{{CODING_PROFILES_SECTION}}', '');
  }

  // --- ACHIEVEMENTS ---
  if (data.achievements && data.achievements.length > 0) {
    let achTex = '\\resheading{ACHIEVEMENTS}\n' +
                 '\\begin{itemize}[leftmargin=12pt,nosep,topsep=2pt]\n';
    achTex += data.achievements.map(a => `  \\resitem{${escapeLatex(a)}}`).join('\n');
    achTex += '\n\\end{itemize}\n';
    tex = tex.replace('{{ACHIEVEMENTS_SECTION}}', achTex);
  } else {
    tex = tex.replace('{{ACHIEVEMENTS_SECTION}}', '');
  }

  // --- CERTIFICATIONS ---
  if (data.certifications && data.certifications.length > 0) {
    let certTex = '\\resheading{CERTIFICATIONS}\n' +
                  '\\begin{itemize}[leftmargin=12pt,nosep,topsep=2pt]\n';
    certTex += data.certifications.map(c => {
      const { label, url } = parseLinkItem(c);
      if (url) {
        // Cert name is clickable link
        return `  \\resitem{\\href{${escapeUrl(url)}}{${escapeLatex(label)}}}`;
      }
      return `  \\resitem{${escapeLatex(c)}}`;
    }).join('\n');
    certTex += '\n\\end{itemize}\n';
    tex = tex.replace('{{CERTIFICATIONS_SECTION}}', certTex);
  } else {
    tex = tex.replace('{{CERTIFICATIONS_SECTION}}', '');
  }

  return tex;
}

// ---------------------------------------------------------------------------
// ROUTE HANDLERS
// ---------------------------------------------------------------------------

exports.generateResume = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ status: 'error', message: 'No file uploaded' });

    const templateChoice = (req.body.template || 'software').toLowerCase();
    const templateMap = {
      'software':  'software_template.tex',
      'iit':       'iit_template.tex',
      'iim':       'iim_template.tex',
      'nontech':   'nontech_template.tex',
      'marketing': 'marketing_template.tex'
    };

    const templateFile = templateMap[templateChoice];
    if (!templateFile)
      return res.status(400).json({ status: 'error', message: `Invalid template: ${templateChoice}` });

    console.log(`📄 Processing resume with ${templateChoice} template...`);
    const templatePath = path.join(__dirname, `../templates/${templateFile}`);
    const latexTemplate = await fs.readFile(templatePath, 'utf-8');

    console.log('📖 Extracting text from PDF...');
    const cvMarkdown = await pdfExtractor.extractTextFromPDF(req.file.path);

    console.log('🤖 Generating JSON data with Two-Agent AI Pipeline...');
    const resumeData = await aiService.extractAndOptimizeCV(cvMarkdown);

    console.log('🔧 Merging JSON with LaTeX template...');
    const latexCode = buildLatexString(latexTemplate, resumeData);

    console.log('💾 Storing in database...');
    const docId = await storeInMongoDB(cvMarkdown, latexCode, templateChoice);

    console.log('✅ Resume generated successfully!');
    return res.status(200).json({
      status: 'success',
      template_used: templateChoice,
      document_id: docId,
      latex: latexCode
    });

  } catch (error) {
    console.error('❌ Error generating resume:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  } finally {
    if (req.file && req.file.path) {
      try { await fs.unlink(req.file.path); } catch (err) { console.error('File cleanup error:', err); }
    }
  }
};

exports.getResumeTemplates = async (req, res) => {
  res.json({ templates: [
    { id: 'software',  name: 'Software Engineer' },
    { id: 'iit',       name: 'IIT Format' },
    { id: 'iim',       name: 'IIM Format' },
    { id: 'nontech',   name: 'Non-Technical' },
    { id: 'marketing', name: 'Marketing' }
  ]});
};

exports.downloadLatex = async (req, res) => {
  const docId = (req.query.doc_id || '').trim();
  if (!docId) return res.status(400).json({ status: 'error', message: 'Document ID is required' });

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const doc = await client.db().collection('latex_cvs').findOne({ _id: new ObjectId(docId) });
    if (!doc) return res.status(404).json({ status: 'error', message: 'Document not found' });

    const filename = `${docId}_cv.tex`;
    const filepath = path.join(uploadsDir, filename);
    await fs.writeFile(filepath, doc.latex, 'utf-8');
    return res.download(filepath, filename, async () => {
      try { await fs.unlink(filepath); } catch (err) {}
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: 'Download failed' });
  } finally { await client.close(); }
};

exports.downloadPdf = async (req, res) => {
  const docId = (req.query.doc_id || '').trim();
  if (!docId) return res.status(400).json({ status: 'error', message: 'Document ID is required' });

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const doc = await client.db().collection('latex_cvs').findOne({ _id: new ObjectId(docId) });
    if (!doc) return res.status(404).json({ status: 'error', message: 'Document not found' });

    const basename = `${docId}_${Math.floor(Date.now() / 1000)}_cv`;
    const texPath = path.join(uploadsDir, `${basename}.tex`);
    await fs.writeFile(texPath, doc.latex, 'utf-8');

    console.log('🎨 Compiling LaTeX to PDF...');
    const result = await latexService.compileLaTeX(texPath);

    if (!result.success)
      return res.status(500).json({ status: 'error', message: 'LaTeX compilation failed', error: result.stderr });

    return res.download(
      path.join(uploadsDir, `${basename}.pdf`),
      `${basename}.pdf`,
      async () => {
        try { await latexService.cleanupFiles(basename, uploadsDir); } catch (err) {}
      }
    );
  } catch (error) {
    return res.status(500).json({ status: 'error', message: 'PDF generation failed' });
  } finally { await client.close(); }
};

// ---------------------------------------------------------------------------
// INTERNAL HELPERS
// ---------------------------------------------------------------------------

async function storeInMongoDB(originalText, latexCode, templateName) {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const result = await client.db().collection('latex_cvs').insertOne({
      cv_text: originalText,
      latex: latexCode,
      template: templateName,
      created_at: new Date()
    });
    return result.insertedId.toString();
  } finally { await client.close(); }
}