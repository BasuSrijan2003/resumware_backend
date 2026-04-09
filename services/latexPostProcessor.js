/**
 * LaTeX Post-Processor - MINIMAL VERSION
 * ONLY fixes contact spacing (GitHub, LinkedIn, Portfolio)
 * Everything else stays exactly as AI generates it
 */

class LatexPostProcessor {
  
  /**
   * Main processing function
   * MINIMAL: Only fixes contact spacing, nothing else!
   */
  static process(latexCode) {
    let processed = latexCode;
    
    console.log('🔧 Post-processing LaTeX (MINIMAL - contact spacing only)...');
    
    // ONLY FIX: Contact spacing (your main issue)
    processed = this.fixContactSpacingOnly(processed);
    
    console.log('✅ Post-processing complete');
    return processed;
  }

  /**
   * FIX ONLY: Contact section spacing
   * Removes extra \quad commands between GitHub, LinkedIn, Portfolio
   */
  static fixContactSpacingOnly(latex) {
    console.log('🔍 Fixing contact section spacing...');
    
    // Fix 1: Remove multiple \quad in a row (main issue)
    // \quad \quad → \quad
    latex = latex.replace(/\\quad\s+\\quad/g, '\\quad');
    
    // Fix 2: Remove triple or more \quad
    latex = latex.replace(/\\quad\s+\\quad\s+\\quad/g, '\\quad');
    
    // Fix 3: Clean up spacing around pipe separator if needed
    // \quad   |   \quad → \quad | \quad
    latex = latex.replace(/\\quad\s+\|\s+\\quad/g, ' \\quad | \\quad ');
    
    console.log('✅ Contact spacing fixed (minimal changes only)');
    return latex;
  }
}

module.exports = LatexPostProcessor;