import base64
import io

from PIL import Image


def analyze_image(image_data):

    try:

        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        raw = base64.b64decode(
            image_data
        )

        image = Image.open(
            io.BytesIO(raw)
        )

        image = image.convert("RGB")

        width, height = image.size

        if width == 0 or height == 0:
            raise ValueError(
                "Invalid image"
            )

        
       # Prototype image analysis.

       # This performs basic visual analysis and can
       # later be replaced with a trained landslide
       # image classification model.
       

        pixels = list(
            image.resize(
                (64, 64)
            ).getdata()
        )

        dark_pixels = 0
        brown_pixels = 0

        total = len(pixels)

        for r, g, b in pixels:

            if (
                r < 100
                and g < 100
                and b < 100
            ):
                dark_pixels += 1

            if (
                r > 50
                and r > g * 1.15
                and g > b * 1.10
            ):
                brown_pixels += 1

        dark_ratio = (
            dark_pixels / total
        )

        brown_ratio = (
            brown_pixels / total
        )

        score = (
            dark_ratio * 40
            + brown_ratio * 60
        )

        score = min(
            100,
            max(
                0,
                score
            )
        )

        if score >= 80:
            level = "CRITICAL"

        elif score >= 60:
            level = "HIGH"

        elif score >= 35:
            level = "MODERATE"

        else:
            level = "LOW"

        return {
            "probability": score / 100,
            "riskScore": score,
            "riskLevel": level,
            "detected": score >= 35,
            "imageWidth": width,
            "imageHeight": height,
        }

    except Exception as error:

        return {
            "probability": 0,
            "riskScore": 0,
            "riskLevel": "LOW",
            "detected": False,
            "error": str(error),
        }