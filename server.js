// Load environment variables from .env file
require('dotenv').config();

// Correct order of imports and app initialization
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios'); // For making API calls
const cors = require('cors'); // For enabling CORS

const app = express(); // Initialize express app FIRST

// Middleware
app.use(cors()); // Enable All CORS Requests - place after app initialization
// If you want to restrict CORS to only your Vercel frontend, you can do:
// const vercelFrontendDomain = 'https://your-frontend-app-name.vercel.app'; // Replace with your actual Vercel URL
// app.use(cors({ origin: vercelFrontendDomain }));

app.use(express.static('public')); // Serve static files from the 'public' folder

// Use the PORT environment variable provided by Render, or 3000 for local development
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected ✅'))
  .catch(err => console.error('MongoDB connection error:', err));

// Root route - serves index.html if present in 'public', or sends a message
app.get('/', (req, res) => {
  // express.static will handle serving public/index.html if it exists for the root path.
  res.send(`WeatherApp server running on port ${PORT}. Frontend is expected to be on a separate deployment (e.g., Vercel).`);
});

// Weather API route
app.get('/weather', async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Please provide latitude and longitude as query parameters.' });
  }

  const geocodeApiKey = process.env.GEOCODE_MAPS_CO_API_KEY;
  if (!geocodeApiKey) {
    console.error("GEOCODE_MAPS_CO_API_KEY is not set in the environment variables. Geocoding will fail.");
    return res.status(500).json({ error: "Server configuration error: Geocoding API key missing." });
  }

  try {
    const weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=3&timezone=GMT`;
    const geocodeApiUrl = `https://geocode.maps.co/reverse?lat=${lat}&lon=${lon}&api_key=${geocodeApiKey}`;

    // console.log("Requesting Weather URL:", weatherApiUrl); // For debugging
    // console.log("Requesting Geocode URL:", geocodeApiUrl); // For debugging

    const [weatherResponse, geocodeResponse] = await Promise.all([
      axios.get(weatherApiUrl),
      axios.get(geocodeApiUrl)
    ]).catch(apiError => {
      console.error("Error during concurrent API calls:", apiError.message);
      if (apiError.isAxiosError && apiError.response) {
        console.error("Axios error details:", apiError.response.data);
        // Check if the error is from geocode.maps.co due to a bad API key, even if the env var was set
        if (apiError.config.url.includes("geocode.maps.co") && (apiError.response.status === 401 || apiError.response.status === 403)) {
            throw new Error("Failed to fetch geocoding data: Invalid or unauthorized API key for geocode.maps.co.");
        }
      }
      throw new Error("Failed to fetch data from one or more external APIs.");
    });

    const weatherData = weatherResponse.data;
    const geocodeData = geocodeResponse.data;
    let placeName = "Unknown Location";

    if (geocodeData && geocodeData.address) {
      const addr = geocodeData.address;
      if (addr.city && addr.country) placeName = `${addr.city}, ${addr.country}`;
      else if (addr.town && addr.country) placeName = `${addr.town}, ${addr.country}`;
      else if (addr.village && addr.country) placeName = `${addr.village}, ${addr.country}`;
      else if (addr.hamlet && addr.country) placeName = `${addr.hamlet}, ${addr.country}`;
      else if (addr.county && addr.country) placeName = `${addr.county}, ${addr.country}`;
      // Fallback within address object if specific city/town etc. not found
      else if (geocodeData.display_name) {
          const parts = geocodeData.display_name.split(',');
          placeName = parts.length > 1 ? `${parts[0].trim()}, ${parts[parts.length-1].trim()}` : geocodeData.display_name;
      }
    } else if (geocodeData && geocodeData.display_name) {
      // Fallback if address object itself is missing, but display_name exists at top level
      const parts = geocodeData.display_name.split(',');
      placeName = parts.length > 1 ? `${parts[0].trim()}, ${parts[parts.length-1].trim()}` : geocodeData.display_name;
    }

    const combinedResponse = {
      location: {
        name: placeName,
        latitude: parseFloat(weatherData.latitude) || parseFloat(lat),
        longitude: parseFloat(weatherData.longitude) || parseFloat(lon)
      },
      currentWeather: weatherData.current,
      currentWeatherUnits: weatherData.current_units,
      dailyForecast: { // Slicing to 2 days as per your original logic and frontend expectation [2]
        time: weatherData.daily?.time?.slice(0, 2) || [],
        weather_code: weatherData.daily?.weather_code?.slice(0, 2) || [],
        temperature_2m_max: weatherData.daily?.temperature_2m_max?.slice(0, 2) || [],
        temperature_2m_min: weatherData.daily?.temperature_2m_min?.slice(0, 2) || [],
        sunrise: weatherData.daily?.sunrise?.slice(0, 2) || [],
        sunset: weatherData.daily?.sunset?.slice(0, 2) || []
      },
      dailyForecastUnits: weatherData.daily_units || {}
    };

    res.json(combinedResponse);

  } catch (error) {
    console.error("Error in /weather route (backend):", error.message);
    // Send a more specific message if it's one we've thrown explicitly
    if (error.message.startsWith("Failed to fetch geocoding data:") || error.message.startsWith("Failed to fetch data from one or more external APIs.")) {
        res.status(502).json({ error: 'Bad Gateway: Error fetching data from external services.', details: error.message }); // 502 Bad Gateway is more appropriate here
    } else {
        res.status(500).json({ error: 'Failed to process your request on the server.', details: error.message });
    }
  }
});

// Listen on 0.0.0.0 for Render compatibility and specified PORT
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
