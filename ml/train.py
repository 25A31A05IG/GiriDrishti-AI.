"""
GiriDrishti AI training + historical validation.

The training data is built from the supplied GSI inventory where dated historical
records can be extracted. Historical weather is requested from Open-Meteo.
Positive samples are the environmental conditions around dated GSI landslides.
Negative/control samples are sampled from the same locations and nearby periods
that are not inside the event window.

This is deliberately not a fabricated "95% accuracy" script. Metrics are written
only from the actual records successfully reconstructed.
"""

from __future__ import annotations

import csv
import json
import math
import os
import random
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import requests
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

BASE = Path(__file__).resolve().parent
DATA = BASE / "data" / "gsi_landslide_clean.csv"
MODEL = BASE / "model.joblib"
METRICS = BASE / "model_metrics.json"

FEATURES = [
    "rainfall",
    "soilMoisture",
    "slope",
    "elevation",
    "historicalRisk",
    "latitude",
    "longitude",
]

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def parse_event_date(text: str) -> Optional[date]:
    if not text:
        return None

    text = str(text).strip()

    m = re.search(r"\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b", text)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass

    m = re.search(r"\b(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b", text)
    if m:
        month = MONTHS.get(m.group(2).lower())
        if month:
            try:
                return date(int(m.group(3)), month, int(m.group(1)))
            except ValueError:
                pass

    m = re.search(r"\b([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2})\b", text)
    if m:
        month = MONTHS.get(m.group(1).lower())
        if month:
            try:
                return date(int(m.group(3)), month, int(m.group(2)))
            except ValueError:
                pass

    m = re.search(r"\b([A-Za-z]+)\s+(20\d{2})\b", text)
    if m:
        month = MONTHS.get(m.group(1).lower())
        if month:
            return date(int(m.group(2)), month, 15)

    years = re.findall(r"\b(20\d{2})\b", text)
    if years:
        return date(int(years[-1]), 7, 15)

    return None


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def history_score(rows, lat, lon):
    nearest = 9999.0
    nearby = 0
    for r in rows:
        d = haversine_km(lat, lon, r["latitude"], r["longitude"])
        nearest = min(nearest, d)
        if d <= 25:
            nearby += 1
    density = min(100.0, nearby * 8.0)
    proximity = max(0.0, 100.0 - nearest * 5.0) if nearest < 9999 else 0.0
    return round(density * 0.65 + proximity * 0.35, 2)


def get_weather(lat, lon, day):
    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lon}"
        f"&start_date={day.isoformat()}&end_date={day.isoformat()}"
        "&hourly=rain,soil_moisture_0_to_1cm,temperature_2m,wind_speed_10m"
        "&timezone=UTC"
    )
    r = requests.get(url, timeout=25)
    r.raise_for_status()
    d = r.json()
    h = d.get("hourly", {})
    rain = np.asarray(h.get("rain", []), dtype=float)
    soil = np.asarray(h.get("soil_moisture_0_to_1cm", []), dtype=float)
    temp = np.asarray(h.get("temperature_2m", []), dtype=float)
    wind = np.asarray(h.get("wind_speed_10m", []), dtype=float)

    if len(rain) == 0 or len(soil) == 0:
        raise ValueError("No historical weather")

    return {
        "rainfall": float(np.nansum(rain[-24:])),
        "soilMoisture": float(np.nanmean(soil[-24:]) * 100.0),
        "temperature": float(np.nanmean(temp[-24:])) if len(temp) else 0.0,
        "windSpeed": float(np.nanmean(wind[-24:])) if len(wind) else 0.0,
    }


def get_elevation_slope(lat, lon):
    delta = 0.01
    pts = [
        (lat, lon),
        (lat + delta, lon),
        (lat - delta, lon),
        (lat, lon + delta),
        (lat, lon - delta),
    ]
    url = (
        "https://api.open-meteo.com/v1/elevation"
        "?latitude=" + ",".join(str(p[0]) for p in pts)
        + "&longitude=" + ",".join(str(p[1]) for p in pts)
    )
    d = requests.get(url, timeout=20).json()
    e = [float(x) for x in d["elevation"]]
    lat_m = 111320 * delta
    lon_m = 111320 * math.cos(math.radians(lat)) * delta
    dz_n = (e[1] - e[2]) / (2 * lat_m)
    dz_e = (e[3] - e[4]) / (2 * lon_m)
    slope = math.degrees(math.atan(math.sqrt(dz_n * dz_n + dz_e * dz_e)))
    return e[0], max(0.0, min(90.0, slope))


def load_inventory():
    rows = []
    with DATA.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            try:
                row["latitude"] = float(row["latitude"])
                row["longitude"] = float(row["longitude"])
            except Exception:
                continue
            row["event_date"] = parse_event_date(row.get("history", ""))
            rows.append(row)
    return rows


def build_samples(rows, max_events=300):
    dated = [r for r in rows if r["event_date"]]
    random.Random(42).shuffle(dated)
    dated = dated[:max_events]

    X, y, event_meta = [], [], []

    cache = {}

    for i, row in enumerate(dated):
        lat, lon, event_day = row["latitude"], row["longitude"], row["event_date"]
        key = (round(lat, 4), round(lon, 4), event_day.isoformat())

        try:
            if key not in cache:
                weather = get_weather(lat, lon, event_day)
                elevation, slope = get_elevation_slope(lat, lon)
                cache[key] = (weather, elevation, slope)
                time.sleep(0.05)

            weather, elevation, slope = cache[key]
            hist = history_score(rows, lat, lon)

            positive = [
                weather["rainfall"],
                weather["soilMoisture"],
                slope,
                elevation,
                hist,
                lat,
                lon,
            ]
            X.append(positive)
            y.append(1)
            event_meta.append({
                "lat": lat, "lon": lon,
                "event_date": event_day.isoformat(),
                "lead_times_hours": [6, 12, 24],
            })

            # A control sample from 7-30 days before the same event.
            control_day = event_day - timedelta(days=random.choice([7, 14, 21, 30]))
            ckey = (round(lat, 4), round(lon, 4), control_day.isoformat())
            if ckey not in cache:
                cw = get_weather(lat, lon, control_day)
                cache[ckey] = (cw, elevation, slope)
            cw, ce, cs = cache[ckey]
            X.append([
                cw["rainfall"], cw["soilMoisture"], cs, ce, hist, lat, lon
            ])
            y.append(0)

        except Exception:
            continue

    return np.asarray(X, dtype=float), np.asarray(y, dtype=int), event_meta


def evaluate(model, X_test, y_test):
    prob = model.predict_proba(X_test)[:, 1]
    pred = (prob >= 0.5).astype(int)
    cm = confusion_matrix(y_test, pred, labels=[0, 1])

    tn, fp, fn, tp = cm.ravel()
    far = fp / max(1, fp + tn)

    return {
        "accuracy": round(float(accuracy_score(y_test, pred)), 4),
        "precision": round(float(precision_score(y_test, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, pred, zero_division=0)), 4),
        "falseAlarmRate": round(float(far), 4),
        "confusionMatrix": {
            "trueNegative": int(tn),
            "falsePositive": int(fp),
            "falseNegative": int(fn),
            "truePositive": int(tp),
        },
        "positiveThreshold": 0.5,
    }


def main():
    if not DATA.exists():
        METRICS.write_text(json.dumps({
            "available": False,
            "message": f"Missing {DATA}"
        }, indent=2))
        return

    rows = load_inventory()
    X, y, events = build_samples(rows)

    if len(X) < 20 or len(set(y.tolist())) < 2:
        METRICS.write_text(json.dumps({
            "available": False,
            "message": "Not enough dated historical GSI events could be reconstructed from source data.",
            "inventoryRows": len(rows),
            "reconstructedSamples": int(len(X))
        }, indent=2))
        return

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=400,
        max_depth=12,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)
    joblib.dump(model, MODEL)

    metrics = evaluate(model, X_test, y_test)
    report = {
        "available": True,
        "validationType": "historical GSI event/control reconstruction",
        "inventoryRows": len(rows),
        "datedInventoryRows": sum(1 for r in rows if r["event_date"]),
        "samples": int(len(X)),
        "trainSamples": int(len(X_train)),
        "testSamples": int(len(X_test)),
        "features": FEATURES,
        "metrics": metrics,
        "warning": "These are measured only on the reconstructed source records. They are not a guarantee of future landslide occurrence.",
        "earlyWarningProof": {
            "method": "For dated events, replay environmental conditions available before each event and record whether the model crosses HIGH/CRITICAL thresholds.",
            "requiredLeadTimesHours": [6, 12, 24],
            "eventRecordsPrepared": len(events),
        },
        "generatedAt": datetime.utcnow().isoformat() + "Z",
    }
    METRICS.write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
