const pdfParse = require('pdf-parse');
const fs = require('fs').promises;

class PdfExtractor {
  async extractTextFromPDF(filePath) {
    console.log('📄 Extracting text from PDF using pdf-parse...');

    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);

      const text = data.text;

      if (!text || text.trim().length === 0) {
        throw new Error('No text could be extracted. Is the PDF a scanned image?');
      }

      console.log(`✅ PDF extraction complete! Extracted ${text.length} characters.`);
      return text;

    } catch (error) {
      console.error('❌ PDF Extraction Failed:', error);
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }
}

module.exports = new PdfExtractor();