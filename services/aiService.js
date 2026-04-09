const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class AIService {
  async extractAndOptimizeCV(markdownText) {
    console.log(`🤖 Starting Two-Agent Intelligent AI Pipeline...`);

    // ==========================================
    // AGENT 1: DATA HARVESTER
    // ==========================================
    console.log(`🕵️‍♂️ Agent 1: Mapping Markdown to God-Tier JSON Schema...`);
    
    const extractionPrompt = `
You are a precise data extraction engine. I am providing you with a CV converted into Markdown.
Your job is to map EVERY single detail into the JSON schema below. 

CRITICAL EXTRACTION RULES:
1. DO NOT rewrite, summarize, or optimize anything yet. Use the exact original wording.
2. In Markdown, links are formatted as [Text](url). You MUST extract these URLs and place them in the correct "github_url", "project_url", "linkedin", or "portfolio" fields.
3. If a section exists in the CV (e.g., Summary, Achievements, Coding Profiles), you MUST capture it.
4. If a field is missing, return an empty array or empty string.

{
  "name": "Full Name",
  "email": "Email Address",
  "phone": "Phone Number",
  "linkedin": "LinkedIn URL",
  "github": "Main GitHub URL",
  "portfolio": "Portfolio or Personal Website URL",
  "summary": "Professional Summary, Bio, or Objective",
  "education": [
    { "institution": "Name", "date": "Dates", "degree": "Degree", "score": "Marks/GPA" }
  ],
  "experience": [
    { "company": "Name", "company_url": "Link if any", "date": "Dates", "title": "Role", "location": "Location", "bullets": ["Raw bullet 1", "Raw bullet 2"] }
  ],
  "projects": [
    { 
      "title": "Name", 
      "project_url": "Live Demo URL if any", 
      "github_url": "Specific GitHub Repo URL if any", 
      "date": "Dates", 
      "technologies": "Tech Stack", 
      "bullets": ["Raw bullet 1", "Raw bullet 2"] 
    }
  ],
  "skills": ["Category 1: skill, skill", "Category 2: skill, skill"],
  "coding_profiles": ["Platform: Rank/Details"],
  "achievements": ["Achievement 1", "Achievement 2"],
  "certifications": ["Cert 1", "Cert 2"]
}

Raw Markdown Input:
${markdownText}
    `.trim();

    let rawJsonData;
    try {
      const extractResponse = await client.chat.completions.create({
        model: process.env.RESUME_MODEL || "gpt-4o",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: extractionPrompt }],
        temperature: 0.1 
      });
      rawJsonData = JSON.parse(extractResponse.choices[0].message.content);
    } catch (error) {
      console.error('❌ Agent 1 Extraction Failed:', error);
      throw new Error(`Data extraction failed: ${error.message}`);
    }

    // ==========================================
    // AGENT 2: ATS WORDSMITH
    // ==========================================
    console.log(`✍️ Agent 2: Optimizing bullets for ATS standards...`);

    const optimizationPrompt = `
You are an expert ATS resume writer. I am providing you with a perfectly structured JSON resume. Your ONLY job is to rewrite the "bullets" arrays.

STRICT OPTIMIZATION RULES:
1. Use strong action verbs.
2. Quantify everything where possible.
3. Limit each bullet point to a single line if possible.
4. DO NOT change names, dates, technologies, or URLs.
5. DO NOT alter the JSON structure.

Return the exact same JSON structure with the optimized bullet points.

JSON to optimize:
${JSON.stringify(rawJsonData, null, 2)}
    `.trim();

    try {
      const optimizeResponse = await client.chat.completions.create({
        model: process.env.RESUME_MODEL || "gpt-4o",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: optimizationPrompt }],
        temperature: 0.3
      });
      
      const finalOptimizedData = JSON.parse(optimizeResponse.choices[0].message.content);
      return finalOptimizedData;
    } catch (error) {
      return rawJsonData; // Fallback
    }
  }
}

module.exports = new AIService();