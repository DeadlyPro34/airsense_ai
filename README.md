# AirSense AI

> Real-time Air Quality & Health Advisory Assistant

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)
![Python](https://img.shields.io/badge/python-3.12-blue.svg)
![Flask](https://img.shields.io/badge/flask-3.x-lightgrey.svg)

---

## Project Overview

AirSense AI is an intelligent web application that provides real-time Air Quality Index (AQI) data and personalized health advisories. By leveraging the OpenWeatherMap API for live environmental data and Groq's blazing-fast Llama 3 model for AI-driven insights, it translates complex air quality metrics into actionable, WHO-grounded health advice. 

**Why it exists:** Air pollution is a silent global health crisis. AirSense AI bridges the gap between raw environmental data and human-readable health precautions, ensuring users know exactly how to protect themselves during varying AQI conditions.

**Target Users:** Individuals sensitive to air pollution (asthma, COPD), outdoor enthusiasts, parents, and anyone looking to monitor their local environmental health conditions.

---

## Screenshots / Preview

![Landing Page](assets/Landing_page.png)
*Figure 1: Main Dashboard and Live AQI Search*

![Health Advisory](assets/Health_Advisory.png)
*Figure 2: AI-Generated Health Advisory via Groq*

---

## Demo

**Live Demo:** [https://airsense-ai-khaki.vercel.app/](https://airsense-ai-khaki.vercel.app/)  
**Video Demo:** [Insert Video Link Here]

---

## Features

### Core Features
- **Real-time AQI Tracking:** Fetches live air quality data based on city/location using OpenWeatherMap.
- **AI Health Advisories:** Generates contextual, WHO-grounded health recommendations using Groq (Llama 3).
- **History Tracking:** Automatically saves your previous location searches and AQI readings.

### Authentication Features
- **Secure Registration & Login:** Client-side PBKDF2 password hashing ensures raw passwords never touch the server.
- **Salt Generation:** Unique cryptographic salts generated per user.
- **Session Management:** Secure token-based session handling.

### Advanced Features
- **Serverless Ready:** Pure Python PostgreSQL architecture (`pg8000`) designed explicitly to bypass Vercel/AWS Lambda binary compilation constraints.
- **Responsive UI:** Clean, glassmorphism-inspired interface that works seamlessly on desktop and mobile.

---

## Technology Stack

**Frontend:**
- HTML5
- Vanilla CSS3 (Custom Design System, Glassmorphism)
- Vanilla JavaScript (ES6+)

**Backend:**
- Python 3.12
- Flask
- Flask-SQLAlchemy

**Database:**
- PostgreSQL (Hosted on Supabase)
- `pg8000` (Pure-Python PostgreSQL driver for Serverless compatibility)

**External APIs:**
- Groq Cloud API (Llama 3)
- OpenWeatherMap API

**Deployment:**
- Vercel (Serverless Functions)

---

## System Architecture

```text
User 
 ↓ (HTTP Requests)
Frontend UI (HTML/CSS/JS)
 ↓ (REST API Calls)
Backend API (Flask / Vercel Serverless)
 ├──> OpenWeatherMap API (Fetches live AQI data)
 ├──> Groq API (Generates WHO-grounded health advisory)
 └──> Supabase PostgreSQL (Stores Users & Search History)
```

---

## Project Structure

```text
airsense_ai/
│
├── static/
│   ├── app.js         # Main frontend logic & API calls
│   ├── crypto.js      # Client-side cryptographic hashing (PBKDF2)
│   ├── style.css      # UI styling & animations
│   └── favicon.svg    # App icon
│
├── templates/
│   ├── index.html     # Main dashboard interface
│   └── login.html     # Authentication interface
│
├── app.py             # Flask application & API routes
├── models.py          # SQLAlchemy Database Models
├── requirements.txt   # Python dependencies
├── vercel.json        # Vercel deployment configuration
├── .gitignore
└── README.md
```

---

## Installation & Setup Guide

### Step 1: Clone Repository
```bash
git clone https://github.com/DeadlyPro34/airsense_ai.git
cd airsense_ai
```

### Step 2: Install Dependencies
Ensure you have Python 3.10+ installed.
```bash
pip install -r requirements.txt
```

### Step 3: Setup Environment Variables
Create a `.env` file in the root directory:
```bash
touch .env
```
Add the following variables:
```env
# Flask Secret Key for Sessions
SECRET_KEY=your_super_secret_key_here

# Supabase PostgreSQL Connection Pooler URL (Must use pg8000 format)
DATABASE_URL=postgresql://user:password@host:6543/postgres

# External APIs
OPENWEATHER_API_KEY=your_openweathermap_api_key
GROQ_API_KEY=your_groq_api_key
```

### Step 4: Database Setup
Start your local server to expose the database initialization endpoint:
```bash
python -m flask run
```
Navigate to `http://127.0.0.1:5000/api/init_db` in your browser to automatically create the necessary PostgreSQL tables.

### Step 5: Start Application
```bash
python -m flask run
```
Access the application at `http://127.0.0.1:5000`.

---

## Usage Guide

1. **Register/Login:** Navigate to the site and create a secure account. Your password is encrypted locally before transmission.
2. **Search Location:** Enter your city name in the dashboard search bar.
3. **View Insights:** The app will fetch the live AQI and instantly stream a custom, AI-generated health advisory based on World Health Organization guidelines.
4. **Review History:** Scroll down to view your previously searched locations and their historical air quality data.

---

## API Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register a new user with hashed password and salt. |
| `GET`  | `/api/auth/salt`     | Retrieve a user's cryptographic salt for local hashing. |
| `POST` | `/api/auth/login`    | Authenticate user with their hashed credentials. |
| `POST` | `/api/chat`          | Submit a city name to fetch AQI and AI advisory. |
| `GET`  | `/api/history`       | Fetch the authenticated user's search history. |
| `GET`  | `/api/init_db`       | Initialize database tables (Admin/Setup only). |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Flask application secret key for securing cookies and sessions. |
| `DATABASE_URL` | PostgreSQL connection string (Use Supabase IPv4 Transaction Pooler for Vercel). |
| `OPENWEATHER_API_KEY` | API key from OpenWeatherMap for AQI data retrieval. |
| `GROQ_API_KEY` | API key from Groq Cloud for Llama 3 AI generation. |

---

## Database Schema 

- **User Table (`users`)**:
  - `id` (PK)
  - `username` (Unique string)
  - `password_hash` (Client-side hashed payload)
  - `salt` (Cryptographic salt)
  - `created_at` (Timestamp)
- **Chat History Table (`chat_history`)**:
  - `id` (PK)
  - `user_id` (FK to `users`)
  - `city` (String)
  - `aqi` (Integer)
  - `aqi_label` (String: Good, Moderate, etc.)
  - `question` (String)
  - `response` (Text: AI Advisory)
  - `created_at` (Timestamp)

---

## Security Features

- **Zero-Knowledge Authentication:** Passwords are mathematically hashed locally in the browser using `PBKDF2` before ever being sent to the server. The backend only stores and verifies the resulting hash.
- **SQL Injection Protection:** Utilizing SQLAlchemy ORM for all database transactions.
- **Global Error Handling:** Custom JSON exception catchers prevent HTML stack traces from leaking to the frontend.
- **Serverless Resilience:** Swapped native C-extensions (`psycopg2`) for pure-Python drivers (`pg8000`) to prevent container boot crashes and memory leaks.

---

## Performance Optimizations

- **Pure-Python Database Driver (`pg8000`):** Bypasses Vercel's strict 10s initialization timeouts and OS binary incompatibility issues.
- **Deferred Database Connection:** Database initialization logic (`db.create_all()`) is removed from the module scope to guarantee instant container cold-starts.
- **Ultra-Fast LLM Inference:** Utilizes Groq's specialized LPU hardware for near-instantaneous AI token generation.

---

## Deployment

This application is configured for seamless deployment on **Vercel**.

1. Connect your GitHub repository to Vercel.
2. Ensure Vercel detects the framework as "Other" (it will automatically use the `@vercel/python` builder defined in `vercel.json`).
3. Add all required Environment Variables in the Vercel Project Settings.
   *Note: For Supabase, you MUST use the **Transaction Pooler URL** (IPv4) because Vercel Serverless Functions do not support direct IPv6 database connections.*
4. Deploy!

---

## Testing

*(To be implemented)*
Future testing suites will utilize `pytest` for backend API validation and `Jest` for frontend cryptographic module testing.

---

## Roadmap / Future Improvements

- [ ] **Push Notifications:** Alert users when their saved city's AQI drops to dangerous levels.
- [ ] **Multi-Language Support:** Localize AI advisories for global regions.
- [ ] **Mobile App:** Wrap the responsive PWA into a native React Native application.
- [ ] **Advanced Analytics:** Interactive charts showing historical AQI trends over time.

---

## Contributors

| Name | GitHub |
|------|--------|
| Akhil Biju Varghese | [@DeadlyPro34](https://github.com/DeadlyPro34) |
| Dev Panchal | [@panchaldev900](https://github.com/panchaldev900) |
| Rahil Rajpara | [@RahilRajpara](https://github.com/RahilRajpara) |
| Vedant Patel | [@vedant23307-gif](https://github.com/vedant23307-gif) |

---

## Contributing Guidelines

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## Contact

**Project Owner:** Akhil Biju Varghese  
**GitHub:** [https://github.com/DeadlyPro34](https://github.com/DeadlyPro34)  

---

## Acknowledgements

- [Flask](https://flask.palletsprojects.com/)
- [Supabase](https://supabase.com/)
- [Groq](https://groq.com/)
- [OpenWeatherMap](https://openweathermap.org/)
- World Health Organization (WHO) Air Quality Guidelines
