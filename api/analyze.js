import { OpenAI } from 'openai';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { imageBase64 } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({ error: "No image provided" });
    }
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Step 1: Extract text using Vision API
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: "Extract all text from this ingredient label exactly as it appears. Do not interpret, summarize, or translate. Preserve all formatting, symbols, and numbers."
        }, {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${imageBase64}`,
            detail: "low" // Optimize for cost
          }
        }]
      }],
      max_tokens: 1000
    });
    
    const ingredients = visionResponse.choices[0].message.content;
    
    // Step 2: Analyze ingredients with GPT-4
    const analysisResponse = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{
        role: "system",
        content: `You're a professional nutritionist analyzing food ingredients. Provide:
          1. Health status (one of: "Generally Healthy", "Exercise Caution", "Potentially Harmful")
          2. Summary analysis (1-2 sentences)
          3. Key ingredients analysis (5-7 most important ingredients with explanations)
          4. Potential concerns (if any)
          5. Recommendation (practical advice)
          
          Format as JSON: {
            status: "", 
            summary: "", 
            keyIngredients: [{name: "", analysis: ""}], 
            concerns: "", 
            recommendation: ""
          }`
      }, {
        role: "user",
        content: `INGREDIENTS:\n${ingredients}`
      }],
      response_format: { type: "json_object" },
      max_tokens: 1000
    });
    
    const analysis = JSON.parse(analysisResponse.choices[0].message.content);
    res.status(200).json(analysis);
    
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: error.message || "Analysis failed" });
  }
}
