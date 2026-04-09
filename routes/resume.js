const express = require('express');
const router = express.Router();
const {
  generateResume,
  getResumeTemplates,
  downloadLatex,
  downloadPdf
} = require('../controllers/resumeController');
const { protect } = require('../middleware/auth');
const multer = require('multer');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.pdf');
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF allowed'), false);
    }
  }
});

/**
 * @swagger
 * tags:
 *   - name: Resume
 *     description: Resume generation and management
 */

/**
 * @swagger
 * /api/resume/templates:
 *   get:
 *     summary: Get available templates
 *     tags: [Resume]
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/templates', getResumeTemplates);

/**
 * @swagger
 * /api/resume/generate:
 *   post:
 *     summary: Generate resume from PDF
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               template:
 *                 type: string
 *                 enum: [software, iit, iim, nontech, marketing]
 *                 default: software
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/generate', protect, upload.single('file'), generateResume);

/**
 * @swagger
 * /api/resume/download/latex:
 *   get:
 *     summary: Download LaTeX
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: doc_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/download/latex', protect, downloadLatex);

/**
 * @swagger
 * /api/resume/download/pdf:
 *   get:
 *     summary: Download PDF
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: doc_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/download/pdf', protect, downloadPdf);

module.exports = router;