const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const pdfExtractor = require('../services/pdfExtractor');
const aiService = require('../services/aiService');
const latexService = require('../services/latexService');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/resume_generator';
const uploadsDir = path.join(__dirname, '../uploads');

// Ensure uploads directory exists
if (!fsSync.existsSync(uploadsDir)) {
  fsSync.mkdirSync(uploadsDir, { recursive: true });
}

// @desc    Generate resume from uploaded PDF
exports.generateResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    // Get template choice
    const templateChoice = (req.body.template || 'software').toLowerCase();
    const templateMap = {
      'software': 'software_template.tex',
      'iit': 'iit_template.tex',
      'iim': 'iim_template.tex',
      'nontech': 'nontech_template.tex',
      'marketing': 'marketing_template.tex'
    };

    const templateFile = templateMap[templateChoice];
    if (!templateFile) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid template: ${templateChoice}`
      });
    }

    console.log(`📄 Processing resume with ${templateChoice} template...`);

    // Read template file
    const templatePath = path.join(__dirname, `../templates/${templateFile}`);
    const latexTemplate = await fs.readFile(templatePath, 'utf-8');

    // Extract text from PDF
    console.log('📖 Extracting text from PDF...');
    const cvText = await pdfExtractor.extractTextFromPDF(req.file.path);

    // Generate LaTeX code using Gemini
    console.log('🤖 Generating LaTeX code with Gemini AI...');
    const latexCode = await aiService.generateLatexFromCV(
      cvText,
      latexTemplate,
      templateChoice.charAt(0).toUpperCase() + templateChoice.slice(1)
    );

    // Store in MongoDB
    console.log('💾 Storing in database...');
    const docId = await storeInMongoDB(cvText, latexCode, templateChoice);

    console.log('✅ Resume generated successfully!');

    return res.status(200).json({
      status: 'success',
      message: `LaTeX CV generated using ${templateChoice} template`,
      template_used: templateChoice,
      document_id: docId,
      latex: latexCode
    });

  } catch (error) {
    console.error('❌ Error generating resume:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong',
      error: error.message
    });
  } finally {
    // Clean up uploaded file
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        console.error('File cleanup error:', err);
      }
    }
  }
};

// @desc    Get available templates
exports.getResumeTemplates = async (req, res) => {
  try {
    const templates = [
      { id: 'software', name: 'Software Engineer', description: 'Optimized for tech roles' },
      { id: 'iit', name: 'IIT Format', description: 'Academic-focused template' },
      { id: 'iim', name: 'IIM Format', description: 'Business school format' },
      { id: 'nontech', name: 'Non-Technical', description: 'General professional format' },
      { id: 'marketing', name: 'Marketing', description: 'Creative marketing roles' }
    ];

    res.json({ templates });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
};

// @desc    Download LaTeX file
exports.downloadLatex = async (req, res) => {
  const docId = (req.query.doc_id || '').trim();
  
  if (!docId) {
    return res.status(400).json({
      status: 'error',
      message: 'Document ID is required'
    });
  }

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('latex_cvs');
    const doc = await collection.findOne({ _id: new ObjectId(docId) });

    if (!doc) {
      return res.status(404).json({
        status: 'error',
        message: 'Document not found'
      });
    }

    // Save .tex file
    const filename = `${docId}_cv.tex`;
    const filepath = path.join(uploadsDir, filename);
    await fs.writeFile(filepath, doc.latex, 'utf-8');

    return res.download(filepath, filename, async (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      // Clean up file after download
      try {
        await fs.unlink(filepath);
      } catch (unlinkErr) {
        console.error('File cleanup error:', unlinkErr);
      }
    });
  } catch (error) {
    console.error('LaTeX download error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Download failed',
      error: error.message
    });
  } finally {
    await client.close();
  }
};

// @desc    Download PDF file
exports.downloadPdf = async (req, res) => {
  const docId = (req.query.doc_id || '').trim();
  
  if (!docId) {
    return res.status(400).json({
      status: 'error',
      message: 'Document ID is required'
    });
  }

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('latex_cvs');
    const doc = await collection.findOne({ _id: new ObjectId(docId) });

    if (!doc) {
      return res.status(404).json({
        status: 'error',
        message: 'Document not found'
      });
    }

    // Create unique filenames
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const basename = `${docId}_${timestamp}_cv`;
    const texFile = `${basename}.tex`;
    const pdfFile = `${basename}.pdf`;
    const texPath = path.join(uploadsDir, texFile);
    const pdfPath = path.join(uploadsDir, pdfFile);

    // Write .tex file
    await fs.writeFile(texPath, doc.latex, 'utf-8');

    // Compile LaTeX
    console.log('🎨 Compiling LaTeX to PDF...');
    const compilationResult = await latexService.compileLaTeX(texPath);

    if (!compilationResult.success) {
      return res.status(500).json({
        status: 'error',
        message: 'LaTeX compilation failed',
        latex_error: compilationResult.stderr,
        latex_output: compilationResult.stdout
      });
    }

    // Return PDF file
    return res.download(pdfPath, pdfFile, async (err) => {
      if (err) {
        console.error('PDF download error:', err);
      }
      // Clean up files after download
      try {
        await latexService.cleanupFiles(basename, uploadsDir);
      } catch (cleanupErr) {
        console.error('File cleanup error:', cleanupErr);
      }
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'PDF generation failed',
      error: error.message
    });
  } finally {
    await client.close();
  }
};

// Helper function to store in MongoDB
async function storeInMongoDB(originalText, latexCode, templateName) {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db();
    const collection = db.collection('latex_cvs');

    const doc = {
      cv_text: originalText,
      latex: latexCode,
      template: templateName,
      created_at: new Date()
    };

    const result = await collection.insertOne(doc);
    return result.insertedId.toString();
  } finally {
    await client.close();
  }
}
