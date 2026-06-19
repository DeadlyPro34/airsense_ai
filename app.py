"""
AirSense AI — Real-time Air Quality & Health Advisory Assistant
Flask backend: fetches live AQI from OpenWeatherMap, generates a
health advisory using Groq (Llama 3) grounded in WHO guidelines (RAG-style).

API keys are provided by the client (encrypted at rest in the browser).
Falls back to environment variables for server-side deployments.
"""

import os
import requests
from flask import Flask, render_template, request, jsonify
from groq import Groq
from models import db, User, ChatHistory

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "airsense-dev-secret-change-in-prod")

# Load local .env if present (Vercel uses env vars natively)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

@app.errorhandler(Exception)
def handle_exception(e):
    # Pass through HTTP errors
    if hasattr(e, 'code'):
        return jsonify(error=str(e)), e.code
    # Return JSON for all other exceptions instead of HTML
    return jsonify(error="Internal Server Error: " + str(e)), 500

db_url = os.environ.get('DATABASE_URL', '')
if db_url.startswith('postgres://'):
    db_url = db_url.replace('postgres://', 'postgresql+pg8000://', 1)
elif db_url.startswith('postgresql://'):
    db_url = db_url.replace('postgresql://', 'postgresql+pg8000://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

with app.app_context():
    try:
        db.create_all()
    except Exception as e:
        print(f"DB init warning: {e}")

# ── WHO / health knowledge base (simple RAG — retrieved by AQI bucket) ──────
WHO_GUIDELINES = {
    "good": {
        "range": "0-50",
        "label": "Good",
        "guidance": (
            "Air quality is satisfactory. PM2.5 is within WHO's annual guideline "
            "of 5 µg/m³ short-term variance. Outdoor activities, including exercise, "
            "are safe for all groups including children, elderly, and those with "
            "respiratory conditions."
        ),
    },
    "moderate": {
        "range": "51-100",
        "label": "Moderate",
        "guidance": (
            "Air quality is acceptable. WHO notes sensitive individuals (asthma, "
            "heart conditions, pregnant women) may experience minor effects during "
            "prolonged outdoor exertion. General public can continue normal outdoor activity."
        ),
    },
    "unhealthy_sensitive": {
        "range": "101-150",
        "label": "Unhealthy for Sensitive Groups",
        "guidance": (
            "Members of sensitive groups (children, elderly, asthma/COPD/heart patients, "
            "pregnant women) may experience health effects. WHO recommends they reduce "
            "prolonged or heavy outdoor exertion. General public usually unaffected."
        ),
    },
    "unhealthy": {
        "range": "151-200",
        "label": "Unhealthy",
        "guidance": (
            "Everyone may begin to experience health effects; sensitive groups face more "
            "serious effects. WHO/EPA guidance: limit outdoor exertion, wear an N95 mask "
            "outdoors, keep windows closed, use air purifiers indoors if available."
        ),
    },
    "very_unhealthy": {
        "range": "201-300",
        "label": "Very Unhealthy",
        "guidance": (
            "Health alert: everyone may experience more serious health effects. WHO "
            "recommends avoiding outdoor activity entirely, especially for children, "
            "elderly, and those with pre-existing conditions. Stay indoors with air filtration."
        ),
    },
    "hazardous": {
        "range": "301+",
        "label": "Hazardous",
        "guidance": (
            "Emergency conditions. Entire population at serious risk. WHO/EPA guidance: "
            "remain indoors, avoid all physical exertion outdoors, seal windows/doors, "
            "use N95+ respirators if going outside is unavoidable, seek medical help if "
            "experiencing breathing difficulty."
        ),
    },
}


def get_aqi_bucket(aqi):
    """Map a numeric AQI value to a WHO guidance bucket."""
    if aqi <= 50:
        return "good"
    elif aqi <= 100:
        return "moderate"
    elif aqi <= 150:
        return "unhealthy_sensitive"
    elif aqi <= 200:
        return "unhealthy"
    elif aqi <= 300:
        return "very_unhealthy"
    else:
        return "hazardous"


def geocode_city(city_name, api_key):
    """Convert a city name into lat/lon using OpenWeatherMap's geocoding API."""
    url = "https://api.openweathermap.org/geo/1.0/direct"
    params = {"q": city_name, "limit": 1, "appid": api_key}
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    if not data:
        return None
    return {"lat": data[0]["lat"], "lon": data[0]["lon"], "name": data[0]["name"], "country": data[0].get("country", "")}


def fetch_air_quality(lat, lon, api_key):
    """Fetch real-time air pollution data from OpenWeatherMap."""
    url = "https://api.openweathermap.org/data/2.5/air_pollution"
    params = {"lat": lat, "lon": lon, "appid": api_key}
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    item = data["list"][0]
    components = item["components"]

    # OpenWeatherMap's own AQI index is 1-5; convert PM2.5 to a US-EPA-style 0-500 AQI
    pm25 = components.get("pm2_5", 0)
    us_aqi = pm25_to_aqi(pm25)

    return {
        "aqi": round(us_aqi),
        "pm2_5": pm25,
        "pm10": components.get("pm10", 0),
        "no2": components.get("no2", 0),
        "o3": components.get("o3", 0),
        "co": components.get("co", 0),
        "so2": components.get("so2", 0),
    }


def pm25_to_aqi(pm):
    """Convert PM2.5 concentration (µg/m³) to US EPA AQI using breakpoint table."""
    breakpoints = [
        (0.0, 12.0, 0, 50),
        (12.1, 35.4, 51, 100),
        (35.5, 55.4, 101, 150),
        (55.5, 150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 350.4, 301, 400),
        (350.5, 500.4, 401, 500),
    ]
    for c_lo, c_hi, a_lo, a_hi in breakpoints:
        if c_lo <= pm <= c_hi:
            return ((a_hi - a_lo) / (c_hi - c_lo)) * (pm - c_lo) + a_lo
    return 500  # cap


import re

def strip_html(text):
    return re.sub('<[^<]+>', '', text)

def generate_advisory(city, aqi_data, groq_key, user_question=None, history=None):
    """Use Groq LLM grounded in WHO guidance (retrieved bucket) to generate the advisory."""
    bucket = get_aqi_bucket(aqi_data["aqi"])
    guideline = WHO_GUIDELINES[bucket]

    system_prompt = (
        "You are AirSense AI, a health advisory assistant for air quality. "
        "You MUST ground your answer strictly in the WHO guidance provided below. "
        "Be concise, practical, and specific. Use short sentences. "
        "Engage in normal conversation if the user is greeting or thanking you, but prioritize air quality data. "
        "Never invent AQI numbers — only use the data given."
    )

    context = f"""
CURRENT DATA for {city}:
- AQI: {aqi_data['aqi']} ({guideline['label']}, range {guideline['range']})
- PM2.5: {aqi_data['pm2_5']} µg/m³
- PM10: {aqi_data['pm10']} µg/m³
- NO2: {aqi_data['no2']} µg/m³
- O3: {aqi_data['o3']} µg/m³

RELEVANT WHO GUIDANCE ({guideline['label']}):
{guideline['guidance']}
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": context}
    ]

    if history and len(history) > 0:
        for msg in history:
            role = "assistant" if msg.get("role") == "bot" else "user"
            content = strip_html(msg.get("text", ""))
            messages.append({"role": role, "content": content})
    else:
        user_msg = f"User question: {user_question}" if user_question else "Give a general health advisory for today."
        messages.append({"role": "user", "content": user_msg})

    groq_client = Groq(api_key=groq_key)
    completion = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.4,
        max_tokens=300,
    )

    return completion.choices[0].message.content, guideline["label"]


def _get_weather_key(data):
    """Extract OpenWeatherMap API key from request data or environment."""
    return (data or {}).get("weather_key", "") or os.environ.get("OPENWEATHER_API_KEY", "")


def _get_groq_key(data):
    """Extract Groq API key from request data or environment."""
    return (data or {}).get("groq_key", "") or os.environ.get("GROQ_API_KEY", "")


@app.route("/")
def home():
    return render_template("landing.html")

@app.route("/app")
def main_app():
    return render_template("index.html")


@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/about")
def about_page():
    return render_template("about.html")

@app.route("/security")
def security_page():
    return render_template("security.html")

@app.route("/terms")
def terms_page():
    return render_template("terms.html")

@app.route("/cookies")
def cookies_page():
    return render_template("cookies.html")


@app.route("/api/aqi", methods=["POST"])
def api_aqi():
    """Fetch live AQI for a city and return raw data + bucket label."""
    data = request.json
    city = (data or {}).get("city", "").strip()
    if not city:
        return jsonify({"error": "City name required"}), 400

    weather_key = _get_weather_key(data)
    if not weather_key:
        return jsonify({"error": "OpenWeatherMap API key is required. Add it in Settings."}), 400

    try:
        loc = geocode_city(city, weather_key)
        if not loc:
            return jsonify({"error": f"Could not find city: {city}"}), 404

        aqi_data = fetch_air_quality(loc["lat"], loc["lon"], weather_key)
        bucket = get_aqi_bucket(aqi_data["aqi"])
        label = WHO_GUIDELINES[bucket]["label"]

        return jsonify({
            "city": loc["name"],
            "country": loc["country"],
            "aqi": aqi_data["aqi"],
            "label": label,
            "bucket": bucket,
            "pollutants": {
                "pm2_5": round(aqi_data["pm2_5"], 1),
                "pm10": round(aqi_data["pm10"], 1),
                "no2": round(aqi_data["no2"], 1),
                "o3": round(aqi_data["o3"], 1),
            },
        })
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"API error: {str(e)}"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/chat", methods=["POST"])
def api_chat():
    """Chat endpoint: fetch live AQI for the city, then generate a grounded advisory."""
    data = request.json
    city = (data or {}).get("city", "").strip()
    question = (data or {}).get("question", "").strip()
    history = (data or {}).get("history", [])

    if not city:
        return jsonify({"error": "City name required"}), 400

    weather_key = _get_weather_key(data)
    groq_key = _get_groq_key(data)

    if not weather_key:
        return jsonify({"error": "OpenWeatherMap API key is required. Add it in Settings."}), 400
    if not groq_key:
        return jsonify({"error": "Groq API key is required. Add it in Settings."}), 400

    try:
        loc = geocode_city(city, weather_key)
        if not loc:
            return jsonify({"error": f"Could not find city: {city}"}), 404

        aqi_data = fetch_air_quality(loc["lat"], loc["lon"], weather_key)
        advisory, label = generate_advisory(loc["name"], aqi_data, groq_key, question, history)
        
        # Save to database if username is provided
        username = (data or {}).get("username", "").strip()
        if username:
            user = User.query.filter_by(username=username).first()
            if user:
                new_chat = ChatHistory(
                    user_id=user.id,
                    city=loc["name"],
                    aqi=aqi_data["aqi"],
                    aqi_label=label,
                    question=question,
                    response=advisory
                )
                db.session.add(new_chat)
                db.session.commit()

        return jsonify({
            "city": loc["name"],
            "aqi": aqi_data["aqi"],
            "label": label,
            "advisory": advisory,
        })
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"API error: {str(e)}"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auth/register", methods=["POST"])
def api_register():
    data = request.json
    username = (data or {}).get("username", "").strip()
    password_hash = (data or {}).get("password_hash", "").strip()
    salt = (data or {}).get("salt", "").strip()
    
    if not username or not password_hash or not salt:
        return jsonify({"error": "Missing registration data"}), 400
        
    existing = User.query.filter_by(username=username).first()
    if existing:
        return jsonify({"error": "An account already exists. Sign in or clear data."}), 400
        
    user = User(username=username, password_hash=password_hash, salt=salt)
    db.session.add(user)
    db.session.commit()
    
    return jsonify({"message": "Account created successfully"})

@app.route("/api/auth/salt", methods=["GET"])
def api_get_salt():
    username = request.args.get("username", "").strip()
    if not username:
        return jsonify({"error": "Username required"}), 400
        
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    return jsonify({"salt": user.salt})

@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.json
    username = (data or {}).get("username", "").strip()
    password_hash = (data or {}).get("hash", "").strip()
    
    if not username or not password_hash:
        return jsonify({"error": "Username and hash required"}), 400
        
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    if user.password_hash != password_hash:
        return jsonify({"error": "Incorrect password"}), 401
        
    return jsonify({
        "username": user.username,
        "message": "Login successful"
    })

@app.route("/api/history", methods=["GET"])
def api_get_history():
    username = request.args.get("username", "").strip()
    if not username:
        return jsonify({"error": "Username required"}), 400
        
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    # Get last 50 messages ordered by created_at
    chats = ChatHistory.query.filter_by(user_id=user.id).order_by(ChatHistory.created_at.asc()).all()
    history = []
    for chat in chats:
        history.append({"role": "user", "text": chat.question})
        history.append({"role": "bot", "text": chat.response})
        
    return jsonify(history)

@app.route("/api/history", methods=["DELETE"])
def api_delete_history():
    data = request.json
    username = (data or {}).get("username", "").strip()
    if not username:
        return jsonify({"error": "Username required"}), 400
        
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    ChatHistory.query.filter_by(user_id=user.id).delete()
    db.session.commit()
    
    return jsonify({"message": "History cleared"})

@app.route("/api/validate-keys", methods=["POST"])
def api_validate_keys():
    """Test that provided API keys are valid."""
    data = request.json
    groq_key = (data or {}).get("groq_key", "").strip()
    weather_key = (data or {}).get("weather_key", "").strip()
    results = {"groq": False, "weather": False}

    # Test OpenWeatherMap key
    if weather_key:
        try:
            url = "https://api.openweathermap.org/geo/1.0/direct"
            params = {"q": "London", "limit": 1, "appid": weather_key}
            resp = requests.get(url, params=params, timeout=10)
            results["weather"] = resp.status_code == 200
        except Exception:
            results["weather"] = False

    # Test Groq key
    if groq_key:
        try:
            client = Groq(api_key=groq_key)
            client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=5,
            )
            results["groq"] = True
        except Exception:
            results["groq"] = False

    return jsonify(results)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
