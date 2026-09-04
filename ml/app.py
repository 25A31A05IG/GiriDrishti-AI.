from pathlib import Path
from typing import List, Optional
import os

import joblib
import numpy as np

from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File
)

from pydantic import BaseModel, Field


app = FastAPI(
    title="GiriDrishti ML Service",
    version="2.1.0"
)


BASE_DIR = Path(
    __file__
).resolve().parent


MODEL_PATH = Path(
    os.getenv(
        "MODEL_PATH",
        str(
            BASE_DIR /
            "model.joblib"
        )
    )
)


MODEL_VERSION = os.getenv(
    "MODEL_VERSION",
    "giri-rf-v2"
)


model = None
model_load_error = None


try:
    model = joblib.load(
        MODEL_PATH
    )

    print(
        "================================="
    )

    print(
        "GiriDrishti AI model loaded"
    )

    print(
        f"Model: {MODEL_PATH}"
    )

    print(
        f"Features: "
        f"{getattr(model, 'n_features_in_', 'unknown')}"
    )

    print(
        "================================="
    )

except Exception as exc:
    model_load_error = str(exc)

    print(
        "ML MODEL LOAD FAILED:"
    )

    print(exc)


class Features(BaseModel):

    rainfall: float = Field(
        ...,
        ge=0
    )

    soilMoisture: float = Field(
        ...,
        ge=0,
        le=100
    )

    slope: float = Field(
        ...,
        ge=0,
        le=90
    )

    elevation: float = Field(
        ...,
        ge=-500,
        le=10000
    )

    historicalRisk: float = Field(
        ...,
        ge=0,
        le=1
    )

    latitude: Optional[float] = None

    longitude: Optional[float] = None


class BatchRequest(BaseModel):

    items: List[Features]


def model_features():
    if model is None:
        return 0

    try:
        return int(
            model.n_features_in_
        )
    except Exception:
        return 5


def build_vector(
    features: Features
):
    base = [
        float(
            features.rainfall
        ),

        float(
            features.soilMoisture
        ),

        float(
            features.slope
        ),

        float(
            features.elevation
        ),

        float(
            features.historicalRisk
        )
    ]

    expected =model_features()

    if expected == 5:
        return base

    if expected == 7:

        latitude = (
            features.latitude
            if features.latitude
            is not None
            else 0.0
        )

        longitude = (
            features.longitude
            if features.longitude
            is not None
            else 0.0
        )

        return base + [
            float(latitude),
            float(longitude)
        ]

    raise HTTPException(
        status_code=503,
        detail=(
            "Model expects "
            f"{expected} features; "
            "supported models expect "
            "5 or 7 features."
        )
    )


def predict_probability(
    features: Features
):
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "AI model is unavailable"
            )
        )

    vector = build_vector(
        features
    )

    X = np.asarray(
        [vector],
        dtype=float
    )

    if hasattr(
        model,
        "predict_proba"
    ):

        probabilities = (
            model.predict_proba(X)[0]
        )

        classes = list(
            getattr(
                model,
                "classes_",
                range(
                    len(
                        probabilities
                    )
                )
            )
        )

        if 1 in classes:
            probability = float(
                probabilities[
                    classes.index(1)
                ]
            )

        else:
            probability = float(
                np.max(
                    probabilities
                )
            )

    else:

        prediction = model.predict(
            X
        )

        probability = float(
            np.asarray(
                prediction
            ).reshape(-1)[0]
        )

    return float(
        np.clip(
            probability,
            0,
            1
        )
    )


def classify(
    probability
):
    score = round(
        probability * 100,
        2
    )

    if score >= 80:
        level = "CRITICAL"

    elif score >= 60:
        level = "HIGH"

    elif score >= 35:
        level = "MODERATE"

    else:
        level = "LOW"

    return score, level


def make_prediction(
    features: Features
):
    probability = (
        predict_probability(
            features
        )
    )

    score, level = classify(
        probability
    )

    return {
        "probability":
            round(
                probability,
                6
            ),

        "aiScore":
            score,

        "riskScore":
            score,

        "riskLevel":
            level,

        "model":
            type(model).__name__,

        "modelVersion":
            MODEL_VERSION,

        "modelFeatures":
            model_features(),

        "mlService":
            True
    }


@app.get("/health")
def health():

    return {
        "ok": True,

        "service":
            "GiriDrishti ML Service",

        "modelLoaded":
            model is not None,

        "modelPath":
            str(MODEL_PATH),

        "modelFeatures":
            model_features(),

        "modelVersion":
            MODEL_VERSION,

        "modelError":
            model_load_error
    }


@app.post("/predict")
def predict(
    features: Features
):

    return make_prediction(
        features
    )


@app.post("/predict-batch")
def predict_batch(
    request: BatchRequest
):

    if len(
        request.items
    ) > 500:

        raise HTTPException(
            status_code=400,
            detail=(
                "Maximum 500 "
                "predictions per request"
            )
        )

    return {
        "predictions": [
            make_prediction(
                item
            )
            for item in
            request.items
        ]
    }


@app.post("/analyze-photo")
async def analyze_photo(
    file: UploadFile = File(...)
):

    data = await file.read()

    if not data:
        raise HTTPException(
            status_code=400,
            detail="Empty image"
        )

    filename = (
        file.filename or ""
    ).lower()

    allowed = (
        ".jpg",
        ".jpeg",
        ".png",
        ".webp"
    )

    if not filename.endswith(
        allowed
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported image type"
            )
        )

    return {
        "success": True,

        "analysis": {
            "landslideDetected":
                None,

            "confidence":
                None,

            "status":
                "VISION_MODEL_REQUIRED",

            "message":
                (
                    "Image accepted. "
                    "A trained computer-vision "
                    "model is required for image classification."
                )
        },

        "filename":
            file.filename,

        "bytes":
            len(data)
    }