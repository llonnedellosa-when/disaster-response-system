"""
ai_service.py — DRES Polangui AI Service
─────────────────────────────────────────
Image Analysis  : Google Cloud Vision API  (1,000 free/month)
Decision Making : Groq API + LLaMA 3       (14,400 free/day)
Chat            : Groq API + LLaMA 3       (replaces Gemini)

Install dependencies:
    pip install groq requests Pillow python-dotenv
"""

import os
import io
import json
import base64
import requests
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
VISION_API_KEY = os.getenv("VISION_API_KEY")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
VISION_URL = f"https://vision.googleapis.com/v1/images:annotate?key={VISION_API_KEY}"

GROQ_MODEL = "llama3-70b-8192"   # best free Groq model — fast + accurate

# ── POLANGUI SYSTEM CONTEXT ───────────────────────────────────────────────────
# Kept concise to save tokens — only essential facts Groq needs
SYSTEM_CONTEXT = """You are DRES-Bot, the official AI assistant of the Disaster Response System of Polangui, Albay, Philippines, operated by MDRRMO Polangui.

EMERGENCY CONTACTS:
- MDRRMO Polangui: (052) 486-0160
- PNP Polangui: (052) 486-0040
- BFP (Fire): (052) 486-0045
- RHU Polangui: (052) 486-0050
- Emergency: 911

EVACUATION CENTERS:
- Polangui Central School (Poblacion)
- Polangui Community College Gymnasium
- Municipal Gymnasium
- Barangay covered courts (check with barangay captain)

FLOOD-PRONE BARANGAYS: Magpanambo, Oas, San Francisco, Tinago, Salvacion, Paulba

TYPHOON SIGNALS:
- Signal 1: 30-60 km/h — precautionary measures
- Signal 2: 61-120 km/h — preventive evacuation
- Signal 3: 121-170 km/h — mandatory evacuation
- Signal 4: 171-220 km/h — all must evacuate
- Signal 5: >220 km/h — catastrophic

RULES:
- Reply in the same language the user used (Filipino/English/Taglish)
- Be calm, concise, and action-oriented
- For life-threatening situations always include MDRRMO: (052) 486-0160
- Never give medical diagnoses; refer to RHU for medical emergencies"""


# ── GROQ HELPER ───────────────────────────────────────────────────────────────
def _call_groq(messages: list, temperature: float = 0.7, max_tokens: int = 1024) -> str:
    """Internal helper — calls Groq API and returns response text."""
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set in .env")

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type":  "application/json"
    }
    payload = {
        "model":       GROQ_MODEL,
        "messages":    messages,
        "temperature": temperature,
        "max_tokens":  max_tokens
    }
    res = requests.post(GROQ_URL, headers=headers, json=payload, timeout=30)
    res.raise_for_status()
    return res.json()["choices"][0]["message"]["content"]


# ── GOOGLE CLOUD VISION HELPER ────────────────────────────────────────────────
def _call_vision(image_bytes: bytes) -> dict:
    """
    Sends image to Google Cloud Vision API.
    Returns labels, objects, safe search, and dominant colors.
    """
    if not VISION_API_KEY:
        raise ValueError("VISION_API_KEY is not set in .env")

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    payload = {
        "requests": [{
            "image": {"content": image_b64},
            "features": [
                {"type": "LABEL_DETECTION",       "maxResults": 15},
                {"type": "OBJECT_LOCALIZATION",   "maxResults": 10},
                {"type": "SAFE_SEARCH_DETECTION"},
                {"type": "IMAGE_PROPERTIES"},
            ]
        }]
    }

    res = requests.post(VISION_URL, json=payload, timeout=30)
    res.raise_for_status()
    response = res.json()["responses"][0]

    # ── Extract labels ─────────────────────────────────────────────────────
    labels = [
        {"label": a["description"], "confidence": round(a["score"], 2)}
        for a in response.get("labelAnnotations", [])
    ]

    # ── Extract detected objects ───────────────────────────────────────────
    objects = [
        o["name"] for o in response.get("localizedObjectAnnotations", [])
    ]

    # ── Safe search ────────────────────────────────────────────────────────
    safe = response.get("safeSearchAnnotation", {})

    return {
        "labels":      labels,
        "objects":     objects,
        "safe_search": safe,
        "raw":         response
    }


# ── FUNCTION 1: TEXT CHAT ─────────────────────────────────────────────────────
def chat_with_bot(user_message: str, chat_history: list = []) -> str:
    """
    Text-based chat powered by Groq + LLaMA 3.
    Replaces Gemini. Same function signature — chatbot.py needs no changes.

    chat_history format (Gemini style, auto-converted):
    [{"role": "user"|"model", "parts": [{"text": "..."}]}]
    """
    try:
        messages = [{"role": "system", "content": SYSTEM_CONTEXT}]

        # Convert Gemini-style history → OpenAI/Groq style
        for h in chat_history:
            role = "assistant" if h.get("role") == "model" else "user"
            content = h.get("parts", [{}])[0].get("text", "")
            if content:
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": user_message})

        return _call_groq(messages, temperature=0.7, max_tokens=512)

    except Exception as e:
        print(f"[chat_with_bot error] {e}")
        return "Sorry, may nangyaring error. Subukan ulit o makipag-ugnayan sa MDRRMO: (052) 486-0160"


# ── FUNCTION 2: IMAGE ANALYSIS (Vision + Groq) ───────────────────────────────
def analyze_image_report(image_bytes: bytes, description: str = "") -> dict:
    """
    Two-stage image analysis:
      Stage 1 — Google Cloud Vision API: detects what's in the image
      Stage 2 — Groq + LLaMA 3: interprets findings into:
                  (a) USER safety advice shown before submitting report
                  (b) ADMIN/MDRRMO response plan attached to the report

    Returns dict with keys: analysis, user_advice, admin_advice,
                             severity, report_category, success
    """
    try:
        # ── STAGE 1: Vision API ────────────────────────────────────────────
        vision_data = _call_vision(image_bytes)
        labels = vision_data["labels"]
        objects = vision_data["objects"]

        label_text = ", ".join(
            [f"{l['label']} ({int(l['confidence']*100)}%)" for l in labels[:10]]
        )
        object_text = ", ".join(objects[:8]) if objects else "none detected"

        print(f"[Vision] Labels: {label_text}")
        print(f"[Vision] Objects: {object_text}")

        # ── STAGE 2A: USER ADVICE via Groq ────────────────────────────────
        user_prompt = f"""A resident of Polangui, Albay submitted a photo during an emergency.

Google Vision AI detected these in the image:
- Labels: {label_text}
- Objects: {object_text}
- Resident's description: "{description or 'No description provided'}"

Based on what Vision AI detected, provide a RESIDENT SAFETY RESPONSE with these exact sections:

**SITUATION:** One sentence — what is happening based on the image.

**SEVERITY:** Choose exactly one: Low / Moderate / High / Critical

**⚠️ WHAT NOT TO DO:**
List 3 dangerous actions to avoid right now.

**✅ STEP-BY-STEP WHAT TO DO:**
Number each step clearly. Maximum 5 steps. Be specific to the situation.

**🏫 NEAREST EVACUATION:**
Recommend the most appropriate evacuation center from: Polangui Central School, Polangui Community College Gymnasium, Municipal Gymnasium, or barangay covered court.

**📞 WHO TO CALL:**
List relevant contacts with numbers from: MDRRMO (052) 486-0160, PNP (052) 486-0040, BFP (052) 486-0045, RHU (052) 486-0050, Emergency 911.

Reply in the same language as the description (Filipino/English/Taglish). Be calm and action-oriented."""

        user_advice = _call_groq(
            [{"role": "system", "content": SYSTEM_CONTEXT},
             {"role": "user",   "content": user_prompt}],
            temperature=0.4,
            max_tokens=600
        )

        # ── STAGE 2B: ADMIN/MDRRMO RESPONSE via Groq ──────────────────────
        admin_prompt = f"""You are an AI assistant for MDRRMO Polangui. Analyze this incident for the disaster response team.

Google Vision AI detected in resident's submitted photo:
- Labels: {label_text}
- Objects: {object_text}
- Resident description: "{description or 'No description provided'}"

Generate an MDRRMO RESPONSE PLAN as JSON only (no markdown, no extra text):

{{
  "severity": "low|moderate|high|critical",
  "report_category": "Flood|Structural Damage|Road Blockage|Fire|Medical Emergency|Wind Damage|Other",
  "sit_rep": "2-sentence professional situation report in English",
  "estimated_affected": "estimated number of persons at risk or Unknown",
  "resources_to_deploy": ["list", "of", "specific", "resources"],
  "barangays_to_prioritize": ["list of barangay names if determinable, else empty"],
  "recommended_response": "specific deployment instruction for MDRRMO team",
  "immediate_needs": ["top 3 urgent needs"],
  "admin_analysis": "Full paragraph analysis for official records"
}}"""

        admin_raw = _call_groq(
            [{"role": "system", "content": "You are an MDRRMO disaster response AI. Return only valid JSON."},
             {"role": "user",   "content": admin_prompt}],
            temperature=0.2,
            max_tokens=600
        )

        # Parse admin JSON safely
        try:
            admin_data = json.loads(
                admin_raw.replace("```json", "").replace("```", "").strip()
            )
        except json.JSONDecodeError:
            admin_data = {"admin_analysis": admin_raw, "severity": "moderate"}

        severity = admin_data.get("severity", "moderate")
        report_category = admin_data.get("report_category", "Other")

        # ── Build combined analysis for DB storage ─────────────────────────
        full_analysis = (
            f"[Vision Labels: {label_text}]\n\n"
            f"USER ADVICE:\n{user_advice}\n\n"
            f"MDRRMO PLAN:\n{admin_data.get('sit_rep', '')}\n"
            f"Deploy: {admin_data.get('recommended_response', '')}"
        )

        return {
            "success":        True,
            "analysis":       full_analysis,       # for DB / backward compat
            "user_advice":    user_advice,          # shown to resident BEFORE submitting
            "admin_advice":   admin_data,           # sent to MDRRMO with the report
            "severity":       severity,
            "report_category": report_category,
            "vision_labels":  labels,
        }

    except requests.exceptions.HTTPError as e:
        print(f"[analyze_image_report HTTP error] {e}")
        err_msg = str(e)
        if "VISION_API_KEY" in err_msg or "403" in err_msg:
            msg = "Vision API key invalid or not enabled. Check Google Cloud Console."
        elif "GROQ" in err_msg or "401" in err_msg:
            msg = "Groq API key invalid. Check your .env file."
        else:
            msg = f"API error: {err_msg}"
        return {"success": False, "analysis": msg, "severity": "unknown",
                "user_advice": msg, "admin_advice": {}}

    except Exception as e:
        print(f"[analyze_image_report error] {e}")
        return {
            "success":     False,
            "analysis":    f"Hindi ma-analyze ang larawan: {str(e)}",
            "severity":    "unknown",
            "user_advice": "Hindi ma-analyze ang larawan. Subukan ulit o direktang makipag-ugnayan sa MDRRMO: (052) 486-0160",
            "admin_advice": {}
        }


# ── FUNCTION 3: VOICE MESSAGE ─────────────────────────────────────────────────
def process_voice_message(transcript: str) -> str:
    """
    Process voice transcript. Returns plain text suitable for text-to-speech.
    Same function signature — chatbot.py needs no changes.
    """
    try:
        prompt = f"""The following was spoken aloud by a resident via voice input: "{transcript}"

Respond as DRES-Bot for voice playback:
- Use plain conversational sentences only
- No bullet points, markdown, asterisks, or formatting
- Keep response under 30 seconds when read aloud
- Be calm, direct, and helpful"""

        messages = [
            {"role": "system", "content": SYSTEM_CONTEXT},
            {"role": "user",   "content": prompt}
        ]
        return _call_groq(messages, temperature=0.6, max_tokens=200)

    except Exception as e:
        print(f"[process_voice_message error] {e}")
        return "Hindi ko naiintindihan ang inyong mensahe. Subukan ulit o i-type ang inyong tanong."


# ── FUNCTION 4: SITUATION REPORT SUMMARIZER (Admin) ──────────────────────────
def generate_situation_summary(reports: list) -> str:
    """
    Auto-generate formal MDRRMO Situation Report from multiple incidents.
    Same function signature — chatbot.py needs no changes.
    """
    if not reports:
        return "No reports to summarize."

    reports_text = "\n".join([
        f"- [{r.get('barangay', 'Unknown')}] {r.get('report_type', 'Report')}: "
        f"{r.get('description', 'No description')} (Severity: {r.get('severity', 'Unknown')})"
        for r in reports
    ])

    prompt = f"""Generate a formal MDRRMO Situation Report for Polangui, Albay.

INCIDENT REPORTS RECEIVED:
{reports_text}

Write the report in this exact structure:

MDRRMO POLANGUI — SITUATION REPORT
====================================

1. EXECUTIVE SUMMARY
   Brief overview of the current situation.

2. MOST AFFECTED BARANGAYS
   List barangays with most incidents and why they are at risk.

3. CRITICAL INCIDENTS
   Incidents requiring immediate MDRRMO action (High/Critical only).

4. INCIDENT BREAKDOWN BY TYPE
   Count per type: Flood, Road Blockage, Wind Damage, etc.

5. RESOURCE RECOMMENDATIONS
   Specific teams, vehicles, or equipment to deploy.

6. OVERALL SITUATION SEVERITY
   Choose one: GREEN (Normal) / YELLOW (Alert) / ORANGE (Warning) / RED (Critical)
   Justify the choice.

7. RECOMMENDED NEXT STEPS
   Numbered list of immediate actions for MDRRMO in priority order.

Write in formal English. Be factual, concise, and action-oriented.
Suitable for an official Philippine LGU government report."""

    try:
        messages = [
            {"role": "system", "content": "You are an MDRRMO disaster response reporting AI for Polangui, Albay. Generate formal, official situation reports."},
            {"role": "user",   "content": prompt}
        ]
        return _call_groq(messages, temperature=0.3, max_tokens=1200)

    except Exception as e:
        print(f"[generate_situation_summary error] {e}")
        return f"Could not generate situation report: {str(e)}"
