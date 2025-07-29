import { OpenAI } from 'openai';
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "No image provided" });

    // Check cache first
    const cachedResult = await kv.get(imageBase64.substring(0, 100));
    if (cachedResult) {
      return res.status(200).json(cachedResult);
    }

    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    
    // Extract text
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: "Extract ALL text from this ingredient label exactly as it appears. Preserve all formatting, symbols, and numbers. Do not interpret or summarize."
        }, {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${imageBase64}`,
            detail: "low"
          }
        }]
      }],
      max_tokens: 1000
    });
    
    const ingredients = visionResponse.choices[0].message.content;
    
    // Analyze ingredients
    const analysisResponse = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{
        role: "system",
        content: `You're a nutritionist analyzing food ingredients. Provide:
          1. Health status ("Generally Healthy", "Exercise Caution", or "Potentially Harmful")
          2. Summary (1-2 sentences)
          3. Key ingredients analysis (5-7 most important)
          4. Potential concerns
          5. Recommendation
          
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
    
    // Cache result for 1 week
    await kv.set(imageBase64.substring(0, 100), analysis, { ex: 604800 });
    
    res.status(200).json(analysis);
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: error.message || "Analysis failed" });
  }
}
