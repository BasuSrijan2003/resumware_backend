const axios = require('axios');

const API_KEY = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || '';

class AIService {
  async generateLatexFromCV(cvText, templateText, templateName = 'Software') {
    const prompt = `I need to convert this CV text into a professional LaTeX CV using the provided template. Please create a complete, compilable LaTeX document.

CRITICAL REQUIREMENTS:
- Extract all relevant information from the CV text
- Format it using the provided LaTeX template structure
- Ensure clean, professional formatting with no compilation errors
- Optimize spacing for a compact but readable layout
- Close all environments properly

CV TEXT:
${cvText}

LATEX TEMPLATE:
${templateText}

IMPORTANT: Provide ONLY the complete, compilable LaTeX code. Do not include explanations or markdown formatting.`;

    try {
      console.log('🤖 Calling Groq API...');

      
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are an expert LaTeX resume formatter. Generate clean, compilable LaTeX code without any markdown formatting or explanations.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 4000
        },
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      let latexCode = response.data.choices[0].message.content.trim();
      
      console.log('✅ Received response from Groq');
      
      // Remove markdown code blocks if present
      if (latexCode.includes('```latex')) {
        latexCode = latexCode.replace(/```latex\n?/g, '').replace(/```\n?$/g, '');
      } else if (latexCode.includes('```tex')) {
        latexCode = latexCode.replace(/```tex\n?/g, '').replace(/```\n?$/g, '');
      } else if (latexCode.includes('```')) {
        latexCode = latexCode.replace(/```\n?/g, '');
      }
      
      return latexCode;
    } catch (error) {
      console.error('❌ Groq API Error:', error.response?.data || error.message);
      throw new Error(`AI formatting failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

module.exports = new AIService();
