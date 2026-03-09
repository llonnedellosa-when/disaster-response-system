# services/image_analyzer.py

import cv2
import numpy as np
from PIL import Image
import io


def extract_image_context(image_bytes: bytes) -> dict:
    """
    Extract measurable features from image BEFORE sending to Gemini.
    This gives Gemini structured context, dramatically improving accuracy.
    """
    img_array = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    if img is None:
        return {"error": "Could not process image"}

    height, width = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    context = {}

    # --- FLOOD DETECTION via color analysis ---
    # Brown/muddy water: H=10-25, S=50-255, V=50-200
    muddy_water_mask = cv2.inRange(hsv,
                                   np.array([10, 50, 50]),
                                   np.array([25, 255, 200]))

    # Dark water: low saturation, low value
    dark_water_mask = cv2.inRange(hsv,
                                  np.array([0, 0, 0]),
                                  np.array([180, 50, 80]))

    total_pixels = height * width
    muddy_ratio = np.sum(muddy_water_mask > 0) / total_pixels
    dark_ratio = np.sum(dark_water_mask > 0) / total_pixels
    water_ratio = muddy_ratio + dark_ratio

    context['possible_flood'] = water_ratio > 0.25
    context['water_coverage_percent'] = round(water_ratio * 100, 1)

    # --- FIRE/SMOKE DETECTION ---
    # Orange/red tones for fire
    fire_mask = cv2.inRange(hsv,
                            np.array([0, 100, 100]),
                            np.array([20, 255, 255]))
    fire_ratio = np.sum(fire_mask > 0) / total_pixels

    # Gray tones for smoke
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    smoke_variance = np.var(gray)

    context['possible_fire'] = fire_ratio > 0.15
    context['possible_smoke'] = smoke_variance < 500 and fire_ratio > 0.05

    # --- DARKNESS (nighttime distress) ---
    avg_brightness = np.mean(gray)
    context['is_nighttime'] = avg_brightness < 60
    context['avg_brightness'] = round(float(avg_brightness), 1)

    # --- STRUCTURAL DAMAGE (edge/rubble detection) ---
    edges = cv2.Canny(gray, 50, 150)
    edge_density = np.sum(edges > 0) / total_pixels
    # lots of debris/rubble
    context['high_structural_complexity'] = edge_density > 0.15

    # --- IMAGE QUALITY CHECK ---
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    context['is_blurry'] = laplacian_var < 100
    context['image_quality'] = 'poor' if laplacian_var < 100 else 'acceptable' if laplacian_var < 500 else 'good'

    return context


def build_gemini_prompt(description: str, image_context: dict) -> str:
    """
    Build a highly specific prompt using extracted image context.
    This is the key to improving Gemini's accuracy.
    """

    # Build context string from heuristics
    detected = []
    if image_context.get('possible_flood'):
        detected.append(
            f"FLOOD INDICATORS: approximately {image_context['water_coverage_percent']}% of image contains water/flood coloring")
    if image_context.get('possible_fire'):
        detected.append(
            "FIRE INDICATORS: orange/red tones detected suggesting possible fire")
    if image_context.get('possible_smoke'):
        detected.append("SMOKE INDICATORS: gray haze patterns detected")
    if image_context.get('high_structural_complexity'):
        detected.append(
            "DEBRIS/DAMAGE INDICATORS: high edge density suggesting rubble or structural damage")
    if image_context.get('is_nighttime'):
        detected.append("LOW LIGHT: nighttime or dark conditions detected")
    if image_context.get('is_blurry'):
        detected.append("NOTE: Image quality is poor/blurry")

    context_str = "\n".join(
        detected) if detected else "No specific hazard indicators detected by pre-analysis."

    prompt = f"""You are DRES-Bot, the AI assistant for Polangui MDRRMO Disaster Response System.

A resident in Polangui, Albay, Philippines has submitted this image during a typhoon situation.

AUTOMATED PRE-ANALYSIS RESULTS:
{context_str}

RESIDENT'S DESCRIPTION: "{description or 'No description provided'}"

Based on the image and the pre-analysis above, provide a DISASTER RESPONSE ASSESSMENT:

1. SITUATION: Describe what you observe in 1-2 sentences
2. HAZARD TYPE: (flood / fire / structural damage / landslide / other / unclear)
3. SEVERITY: (LOW / MODERATE / HIGH / CRITICAL)
   - LOW: Manageable, monitor situation
   - MODERATE: Prepare to evacuate, take precautions
   - HIGH: Evacuate immediately
   - CRITICAL: Life-threatening, call emergency services NOW
4. IMMEDIATE ACTIONS (3-5 specific steps the resident should take RIGHT NOW)
5. WHO TO CALL: Relevant emergency contacts from Polangui MDRRMO

Keep your response concise, clear, and in simple English or Taglish.
Prioritize life safety above all else.
If the image is unclear, say so and give general typhoon safety advice."""

    return prompt
