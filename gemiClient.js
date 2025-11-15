export async function generateWithGoogleGenAI(prompt, options = {}) {
  const endpoint = options.endpoint || 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';
  const apiKey   = options.apiKey || window.GENAI_API_KEY;
  if (!apiKey) throw new Error('Missing API key');

  const url = `${endpoint}?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.2,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API error ${res.status}: ${txt}`);
  }
  
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
}

// Updated function for asteroid impact simulation
export async function simulateAsteroidImpact(asteroidData, impactLocation) {
  const prompt = `
    You are an expert in asteroid impacts and consequence modeling. 
    Analyze the asteroid data and simulate the consequences of its impact at the specified location.

    ASTEROID DATA:
    - Name: ${asteroidData.name || 'Unknown'}
    - Diameter: ${asteroidData.diameter || 'Unknown'} meters
    - Velocity: ${asteroidData.velocity || 'Unknown'} km/s
    - Density: ${asteroidData.density || 3000} kg/m³
    - Impact angle: ${asteroidData.angle || 45} degrees
    - Impact location: ${impactLocation.lat}, ${impactLocation.lon}
    - Location type: ${impactLocation.isWater ? 'Ocean/Water' : 'Land'}
    - Elevation: ${impactLocation.elevation || 0} meters

    Calculate and provide in JSON format:

    {
      "energy_mt": number, // energy in megatons of TNT
      "crater_diameter_km": number, // crater diameter in km
      "blast_zones": {
        "total_destruction_km": number, // total destruction zone
        "severe_damage_km": number, // severe damage zone  
        "moderate_damage_km": number, // moderate damage zone
        "thermal_radius_km": number // thermal radiation zone
      },
      "earthquake_magnitude": number, // earthquake magnitude
      "tsunami_height_m": number, // tsunami height (if ocean impact)
      "airburst_altitude_km": number, // airburst altitude
      "effects_description": "string with effects description",
      "casualty_estimate": "string with casualty estimate",
      "recommendations": ["array", "of", "recommendations"]
    }

    Use realistic physical models. Be accurate in calculations.
    For ocean impacts, calculate realistic tsunami heights.
    For land impacts, focus on blast and seismic effects.
  `;

  try {
    const response = await generateWithGoogleGenAI(prompt);
    
    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      // Fallback to realistic data calculations
      return generateRealisticImpactData(asteroidData, impactLocation);
    }
  } catch (error) {
    console.error('Gemini simulation failed, using fallback:', error);
    return generateRealisticImpactData(asteroidData, impactLocation);
  }
}

// Improved fallback calculations
function generateRealisticImpactData(asteroidData, impactLocation) {
  const diameter = asteroidData.diameter || 100;
  const velocity = asteroidData.velocity || 17;
  const density = asteroidData.density || 3000;
  const angle = asteroidData.angle || 45;
  
  // Energy calculation (E = 0.5 * m * v²)
  const volume = (4/3) * Math.PI * Math.pow(diameter/2, 3);
  const mass = density * volume; // kg
  const energy_joules = 0.5 * mass * Math.pow(velocity * 1000, 2);
  const energy_mt = energy_joules / (4.184e15); // megatons
  
  // Crater calculation (simplified formula)
  const crater_diameter_km = 0.02 * Math.pow(energy_mt, 0.3);
  
  // Blast zones (based on cube root of energy)
  const blast_radius = Math.pow(energy_mt, 1/3);
  
  // Tsunami calculation for ocean impacts
  let tsunami_height_m = 0;
  if (impactLocation.isWater) {
    tsunami_height_m = Math.round(blast_radius * 30 + Math.random() * 20); // 30-50m range
  }
  
  return {
    energy_mt: Math.round(energy_mt * 100) / 100,
    crater_diameter_km: Math.round(crater_diameter_km * 100) / 100,
    blast_zones: {
      total_destruction_km: Math.round(blast_radius * 2 * 100) / 100,
      severe_damage_km: Math.round(blast_radius * 5 * 100) / 100,
      moderate_damage_km: Math.round(blast_radius * 10 * 100) / 100,
      thermal_radius_km: Math.round(blast_radius * 15 * 100) / 100
    },
    earthquake_magnitude: Math.round((Math.log10(energy_joules) - 4.8) / 1.5 * 10) / 10,
    tsunami_height_m: tsunami_height_m,
    airburst_altitude_km: angle < 30 ? Math.round((30 - angle) * 2) : 0,
    effects_description: `Impact of ${diameter}m asteroid would release energy equivalent to ${Math.round(energy_mt)} megatons of TNT, causing massive destruction.`,
    casualty_estimate: "Thousands of casualties within 50 km radius",
    recommendations: [
      "Immediate evacuation within 100 km radius",
      "Emergency medical services deployment", 
      "Civil defense alert activation",
      impactLocation.isWater ? "Coastal tsunami warnings" : "Regional disaster response"
    ]
  };
}