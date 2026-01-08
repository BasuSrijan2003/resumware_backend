const fs = require('fs');
const pdfParse = require('pdf-parse');

class PdfExtractor {
  async extractTextFromPDF(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }
}

module.exports = new PdfExtractor();
