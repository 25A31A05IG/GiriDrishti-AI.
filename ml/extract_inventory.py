import pdfplumber
import pandas as pd
import re
from pathlib import Path

PDF_PATH = Path("data/landslide_report.pdf")
OUTPUT_PATH = Path("data/gsi_landslide_inventory.csv")

records = []

print("Opening GSI landslide inventory...")

with pdfplumber.open(PDF_PATH) as pdf:
    print(f"Total pages: {len(pdf.pages)}")

    for page_number, page in enumerate(pdf.pages, start=1):
        text = page.extract_text()

        if not text:
            continue

        lines = text.splitlines()

        for line in lines:
            line = line.strip()

            # Look for lines containing a landslide record.
            # Coordinates are our most reliable marker.
            match = re.search(
                r"(\d{1,3}\.\d+)\s+(\d{1,3}\.\d+)",
                line
            )

            if match:
                latitude = float(match.group(1))
                longitude = float(match.group(2))

                # Keep the complete source line for later inspection.
                records.append({
                    "page": page_number,
                    "latitude": latitude,
                    "longitude": longitude,
                    "source_text": line
                })

        if page_number % 50 == 0:
            print(f"Processed {page_number}/{len(pdf.pages)} pages...")

df = pd.DataFrame(records)

df.to_csv(OUTPUT_PATH, index=False)

print("\nExtraction complete!")
print(f"Records extracted: {len(df)}")
print(f"Saved to: {OUTPUT_PATH}")

print("\nFirst 10 records:")
print(df.head(10).to_string(index=False))