const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
  generateResume,
  getResumeTemplates,
  downloadLatex,
  downloadPdf
} = require('../controllers/resumeController');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    cb(null, `${timestamp}_${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// @route   POST /api/resume/upload
// @desc    Upload PDF resume and generate LaTeX
// @access  Public
router.post('/upload', upload.single('file'), generateResume);

// @route   GET /api/resume/templates
// @desc    Get available resume templates
// @access  Public
router.get('/templates', getResumeTemplates);

// @route   GET /api/resume/download/latex
// @desc    Download LaTeX file
// @access  Public
router.get('/download/latex', downloadLatex);

// @route   GET /api/resume/download/pdf
// @desc    Download PDF file
// @access  Public
router.get('/download/pdf', downloadPdf);

module.exports = router;
