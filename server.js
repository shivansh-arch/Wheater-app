// Load environment variables from .env file
require('dotenv').config();

// Correct order of imports and app initialization
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios'); // For making API calls
const cors = require('cors');   // For enabling CORS

const app = express(); // Initialize express app FIRST

// Middleware
app.use(cors()); // Enable All CORS Requests - place after app initialization
app.use(express.static('public')); // Serve static files from the 'public' folder

const PORT = 3000; // Backend will run on port 3000

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI) // Removed deprecated options
  .then(() => console.log('MongoDB connected ✅'))
  .catch(err => console.error('MongoDB connection error:', err));

// Root route - serves index.html if present in 'public', or sends a message
app.get('/', (req, res) => {
  // express.static will handle serving public/index.html if it exists for the root path.
  // You can optionally send a specific message if you want to override that for the root.
  res.send(`WeatherApp server running on port ${PORT}. Access frontend at /index.html if in public folder.`);
});

// Weather API route
// ... (other requires and app setup from the "corrected version of all this") ...
// Ensure require('dotenv').config(); is at the very top of your file.

app.get('/weather', async (req, res) => {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
        return res.status(400).json({ error: 'Please provide latitude and longitude as query parameters.' });
    }

    // --- GET API KEY FROM .env ---
    const geocodeApiKey = process.env.GEOCODE_MAPS_CO_API_KEY;

    if (!geocodeApiKey) {
        console.error("GEOCODE_MAPS_CO_API_KEY is not set in the .env file. Geocoding will likely fail.");
        // Optionally, you could return an error here if the API key is absolutely required for the app to function.
        // return res.status(500).json({ error: "Server configuration error: Geocoding API key missing." });
    }

    try {
        const weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=3&timezone=GMT`;
        
        // --- USE API KEY IN URL ---
        const geocodeApiUrl = `https://geocode.maps.co/reverse?lat=${lat}&lon=${lon}&api_key=${geocodeApiKey}`;

        // console.log("Requesting Weather URL:", weatherApiUrl); // For debugging
        // console.log("Requesting Geocode URL:", geocodeApiUrl); // For debugging

        const [weatherResponse, geocodeResponse] = await Promise.all([
            axios.get(weatherApiUrl),
            axios.get(geocodeApiUrl)
        ]).catch(apiError => {
            console.error("Error during concurrent API calls:", apiError.message);
            if (apiError.isAxiosError && apiError.response) {
                console.error("Axios error details:", apiError.response.data); // This will show the "Missing API Key" from geocode.maps.co
            }
            throw new Error("Failed to fetch data from external APIs."); 
        });

        const weatherData = weatherResponse.data;
        const geocodeData = geocodeResponse.data;
        
        let placeName = "Unknown Location";
        // (Your existing logic to parse geocodeData and construct placeName)
        // ...
        if (geocodeData && geocodeData.address) {
            const addr = geocodeData.address;
            if (addr.city && addr.country) placeName = `${addr.city}, ${addr.country}`;
            else if (addr.town && addr.country) placeName = `${addr.town}, ${addr.country}`;
            else if (addr.village && addr.country) placeName = `${addr.village}, ${addr.country}`;
            else if (addr.hamlet && addr.country) placeName = `${addr.hamlet}, ${addr.country}`;
            else if (addr.county && addr.country) placeName = `${addr.county}, ${addr.country}`;
            else if (geocodeData.display_name) {
                 const parts = geocodeData.display_name.split(',');
                 placeName = parts.length > 1 ? `${parts[0].trim()}, ${parts[parts.length-1].trim()}` : geocodeData.display_name;
            }
        } else if (geocodeData && geocodeData.display_name) {
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
        
        res.json(combinedResponse);

    } catch (error) {
        console.error("Error in /weather route (backend):", error.message);
        res.status(500).json({ error: 'Failed to process your request.', details: error.message });
    }
});

// ... (rest of your server.js) ...


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});



// Weather route - fetch weather data from OpenWeather API
app.get('/weather', async (req, res) => {
  const { lat, lon } = req.query;

  try {
    const apiKey = process.env.WEATHER_API_KEY;
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

    const response = await require('axios').get(weatherUrl);
    res.json(response.data);
  } catch (error) {
    console.error("Weather API error:", error);
    res.status(500).json({ error: "Failed to fetch weather data" });
  }
});
