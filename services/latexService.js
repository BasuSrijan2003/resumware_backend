const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const execPromise = util.promisify(exec);

class LatexService {
  async compileLaTeX(texFilePath) {
    try {
      const directory = path.dirname(texFilePath);
      const basename = path.basename(texFilePath, '.tex');
      const texFile = path.basename(texFilePath);
      
      console.log('📝 Compiling LaTeX file:', basename);
      console.log('📁 Directory:', directory);
      
      // Change to directory and compile from there
      const command = `cd /d "${directory}" && pdflatex -interaction=nonstopmode "${texFile}"`;
      
      let stdout = '';
      let stderr = '';
      
      try {
        const result = await execPromise(command, { 
          timeout: 30000,
          shell: 'cmd.exe'
        });
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (error) {
        // Even if pdflatex exits with error code, it might have generated PDF
        stdout = error.stdout || '';
        stderr = error.stderr || '';
        console.log('⚠️ pdflatex had warnings, checking if PDF was generated...');
      }

      const pdfPath = path.join(directory, `${basename}.pdf`);

      // Check if PDF actually exists (most important check)
      if (fsSync.existsSync(pdfPath)) {
        const stats = fsSync.statSync(pdfPath);
        if (stats.size > 0) {
          console.log(`✅ PDF compiled successfully (${stats.size} bytes)`);
          return {
            success: true,
            outputPath: pdfPath,
            stdout,
            stderr
          };
        }
      }

      console.error('❌ PDF file not generated or empty');
      return {
        success: false,
        error: 'PDF was not generated or is empty',
        stdout,
        stderr
      };
      
    } catch (error) {
      console.error('❌ LaTeX compilation error:', error.message);
      return {
        success: false,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || ''
      };
    }
  }

  async cleanupFiles(basename, directory) {
    const extensions = ['.tex', '.pdf', '.aux', '.log', '.out'];
    for (const ext of extensions) {
      const filePath = path.join(directory, `${basename}${ext}`);
      try {
        if (fsSync.existsSync(filePath)) {
          fsSync.unlinkSync(filePath);
          console.log(`🗑️ Cleaned up: ${basename}${ext}`);
        }
      } catch (err) {
        console.error(`Failed to delete ${filePath}:`, err.message);
      }
    }
  }
}

module.exports = new LatexService();
