# AirSense AI — Real-Time Air Quality Health Advisory

A working prototype: Flask backend + live AQI data (OpenWeatherMap) + AI health
advisory grounded in WHO guidelines (Groq / Llama 3.3).

## 1. Get your free API keys

**OpenWeatherMap** (live AQI data, free tier):
1. Sign up at https://openweathermap.org/api
2. Go to "My API Keys" → copy the default key
3. New keys take ~10 minutes to activate

**Groq** (free LLM, no credit card):
1. Sign up at https://console.groq.com
2. Go to "API Keys" → "Create API Key" → copy it

## 2. Set up the project

```bash
cd airsense_ai
pip install -r requirements.txt
```

## 3. Add your keys

Open `app.py` and replace these two lines near the top:

```python
OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY", "PASTE_OPENWEATHERMAP_KEY_HERE")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "PASTE_GROQ_KEY_HERE")
```

Or, instead of editing the file, set environment variables before running:

```bash
export OPENWEATHER_API_KEY="your_key_here"
export GROQ_API_KEY="your_key_here"
```
(On Windows PowerShell: `$env:OPENWEATHER_API_KEY="your_key_here"`)

## 4. Run it

```bash
python app.py
```

Open **http://localhost:5000** in your browser.

## How it works

1. Type a city → backend geocodes it and fetches live PM2.5/PM10/NO2/O3 from
   OpenWeatherMap, converts PM2.5 to a US EPA-style AQI (0–500 scale).
2. The AQI is mapped to a WHO guidance bucket (Good / Moderate / Unhealthy / etc.)
   — this is the "RAG" retrieval step: relevant WHO guidance text is pulled
   based on the AQI bucket.
3. That retrieved guidance + live pollutant data is fed into the LLM (Groq /
   Llama 3.3) as grounding context, along with your question.
4. The model generates a concise, WHO-grounded health advisory — never
   inventing numbers, only reasoning over the real data provided.

## For your submission

- This satisfies the "Prototype/Demo" deliverable — it's a real working app,
  not a mockup.
- For Responsible AI: the WHO_GUIDELINES dict in `app.py` is your transparent,
  auditable knowledge base — point to it directly when explaining how the
  system avoids hallucinated health claims.
- To swap in IBM Granite later (official internship stack) instead of Groq,
  only the `generate_advisory()` function needs to change — replace the Groq
  client call with a WatsonX API call using the same prompt structure.
