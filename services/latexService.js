const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const util = require('util');

const execPromise = util.promisify(exec);

/**
 * Compile LaTeX file to PDF using pdflatex
 * @param {string} texFilePath - Full path to .tex file
 * @returns {Promise<{success: boolean, stdout: string, stderr: string}>}
 */
exports.compileLaTeX = async (texFilePath) => {
  const dir = path.dirname(texFilePath);
  const filename = path.basename(texFilePath, '.tex');
  const pdfPath = path.join(dir, `${filename}.pdf`);
  
  console.log('🔨 Compiling LaTeX with pdflatex...');
  
  // Use pdflatex
  const command = `pdflatex -interaction=nonstopmode -output-directory="${dir}" "${texFilePath}"`;
  
  try {
    // Run pdflatex twice for proper references
    await execPromise(command);
    console.log('🔄 Running second pass...');
    await execPromise(command);
    console.log('✅ pdflatex completed both passes');
  } catch (error) {
    // pdflatex often returns error code even when PDF is created
    console.log('⚠️  pdflatex returned non-zero exit code (checking if PDF was created...)');
  }
  
  // Check if PDF file was actually created
  if (fsSync.existsSync(pdfPath)) {
    const stats = fsSync.statSync(pdfPath);
    if (stats.size > 0) {
      console.log(`✅ PDF successfully generated! Size: ${stats.size} bytes`);
      return {
        success: true,
        stdout: `PDF generated successfully (${stats.size} bytes)`,
        stderr: ''
      };
    }
  }
  
  // If we get here, PDF wasn't created or is empty
  console.error('❌ LaTeX compilation failed - no valid PDF generated');
  return {
    success: false,
    stdout: '',
    stderr: 'PDF file was not generated or is empty'
  };
};

/**
 * Clean up auxiliary LaTeX files
 * @param {string} basename - Base filename without extension
 * @param {string} directory - Directory containing the files
 */
exports.cleanupFiles = async (basename, directory) => {
  const extensions = ['.aux', '.log', '.out', '.tex'];
  
  for (const ext of extensions) {
    const filePath = path.join(directory, `${basename}${ext}`);
    try {
      await fs.unlink(filePath);
      console.log(`🗑️  Cleaned up: ${basename}${ext}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Failed to delete ${basename}${ext}:`, err.message);
      }
    }
  }
};

/**
 * Check if LaTeX is installed
 * @returns {Promise<boolean>}
 */
exports.checkLatexInstallation = async () => {
  try {
    await execPromise('pdflatex --version');
    console.log('✅ pdflatex is installed');
    return true;
  } catch (error) {
    console.error('❌ pdflatex is not installed or not in PATH');
    return false;
  }
};