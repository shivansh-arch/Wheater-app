// Load environment variables from .env file
require('dotenv').config(); // Ensure this is at the very top

const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios'); // For making API calls
const cors = require('cors'); // For enabling CORS

const app = express(); // Initialize express app FIRST

// Middleware
app.use(cors()); // Enable All CORS Requests - place after app initialization
app.use(express.static('public')); // Serve static files from the 'public' folder

// --- FIX 1: Port Configuration for Render/Local ---
// const PORT = 3000; // OLD LINE FROM YOUR FILE [1]
const PORT = process.env.PORT || 3000; // CORRECTED: Use Render's assigned port, or 3000 for local dev

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI) // Removed deprecated options
  .then(() => console.log('MongoDB connected ✅'))
  .catch(err => console.error('MongoDB connection error:', err));

// Root route
app.get('/', (req, res) => {
  res.send(`WeatherApp server running on port ${PORT}. Access frontend at /index.html if in public folder.`);
});

// Weather API route
app.get('/weather', async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Please provide latitude and longitude as query parameters.' });
  } // <-- Missing closing brace for this 'if' in your provided file [1], added here.

  // --- FIX 2: API Key Check ---
  const geocodeApiKey = process.env.GEOCODE_MAPS_CO_API_KEY;
  if (!geocodeApiKey) {
    console.error("GEOCODE_MAPS_CO_API_KEY is not set. Geocoding will likely fail.");
    // CORRECTED: Return an error immediately if the key is missing.
    return res.status(500).json({ error: "Server configuration error: Geocoding API key missing." });
  } // <-- This 'if' block was not correctly closed before the 'try' in your file [1]. It appeared as if 'try' was inside it.

  try {
    // --- FIX 3: Correct Open-Meteo API URL typo ---
    // const weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}¤t=...`; // OLD LINE FROM YOUR FILE [1] with typo
    const weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=3&timezone=GMT`; // CORRECTED

    const geocodeApiUrl = `https://geocode.maps.co/reverse?lat=${lat}&lon=${lon}&api_key=${geocodeApiKey}`;

    const [weatherResponse, geocodeResponse] = await Promise.all([
      axios.get(weatherApiUrl),
      axios.get(geocodeApiUrl)
    ]).catch(apiError => {
      console.error("Error during concurrent API calls:", apiError.message);
      if (apiError.isAxiosError && apiError.response) {
        console.error("Axios error details:", apiError.response.data);
        // Check if the error is from geocode.maps.co due to a bad API key
        if (apiError.config.url.includes("geocode.maps.co") && (apiError.response.status === 401 || apiError.response.status === 403)) {
            throw new Error("Failed to fetch geocoding data: Invalid or unauthorized API key for geocode.maps.co.");
        }
      }
      throw new Error("Failed to fetch data from one or more external APIs."); // This error will be caught by the outer catch
    });

    const weatherData = weatherResponse.data;
    const geocodeData = geocodeResponse.data;
    let placeName = "Unknown Location";

    // Logic to determine placeName (your existing logic, ensure it's correct)
    if (geocodeData && geocodeData.address) {
      const addr = geocodeData.address;
      if (addr.city && addr.country) placeName = `${addr.city}, ${addr.country}`;
      else if (addr.town && addr.country) placeName = `${addr.town}, ${addr.country}`;
      else if (addr.village && addr.country) placeName = `${addr.village}, ${addr.country}`;
      else if (addr.hamlet && addr.country) placeName = `${addr.hamlet}, ${addr.country}`;
      else if (addr.county && addr.country) placeName = `${addr.county}, ${addr.country}`;
      else if (geocodeData.display_name) { // Fallback if specific address parts are not found but display_name exists
          const parts = geocodeData.display_name.split(',');
          placeName = parts.length > 1 ? `${parts[0].trim()}, ${parts[parts.length-1].trim()}` : geocodeData.display_name;
      }
    } else if (geocodeData && geocodeData.display_name) { // Fallback if geocodeData.address itself is missing
      const parts = geocodeData.display_name.split(',');
      placeName = parts.length > 1 ? `${parts[0].trim()}, ${parts[parts.length-1].trim()}` : geocodeData.display_name;
    }

    // --- FIX 4: Correct placement of res.json() ---
    // The following 'const combinedResponse' and 'res.json()' were inside an 'else if' in your file [1]
    const combinedResponse = {
      location: {
        name: placeName,
        latitude: parseFloat(weatherData.latitude) || parseFloat(lat),
        longitude: parseFloat(weatherData.longitude) || parseFloat(lon)
      },
      currentWeather: weatherData.current,
      currentWeatherUnits: weatherData.current_units,
      dailyForecast: {
        time: weatherData.daily?.time?.slice(0, 2) || [],
        weather_code: weatherData.daily?.weather_code?.slice(0, 2) || [],
        temperature_2m_max: weatherData.daily?.temperature_2m_max?.slice(0, 2) || [],
        temperature_2m_min: weatherData.daily?.temperature_2m_min?.slice(0, 2) || [],
        sunrise: weatherData.daily?.sunrise?.slice(0, 2) || [],
        sunset: weatherData.daily?.sunset?.slice(0, 2) || []
      },
      dailyForecastUnits: weatherData.daily_units || {}
    };
    res.json(combinedResponse); // CORRECTED: This will now always be called if the try block succeeds

  } catch (error) { // This is the outer catch block for the try
    console.error("Error in /weather route (backend):", error.message);
    // Send a more specific message if it's one we've thrown explicitly
    if (error.message.startsWith("Failed to fetch geocoding data:") || error.message.startsWith("Failed to fetch data from one or more external APIs.")) {
        res.status(502).json({ error: 'Bad Gateway: Error fetching data from external services.', details: error.message });
    } else {
        res.status(500).json({ error: 'Failed to process your request on the server.', details: error.message });
    }
  }
}); // End of app.get('/weather', ...)

// --- FIX 5: Listen on 0.0.0.0 for Render compatibility ---
// app.listen(PORT, () => { // OLD LINE FROM YOUR FILE [1]
app.listen(PORT, '0.0.0.0', () => { // CORRECTED
  console.log(`Server running on port ${PORT}. Access locally at http://localhost:${PORT} if PORT is ${PORT}`);
});
