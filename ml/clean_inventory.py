import pandas as pd
import re
from pathlib import Path

INPUT = Path("data/gsi_landslide_inventory.csv")
OUTPUT = Path("data/gsi_landslide_clean.csv")

df = pd.read_csv(INPUT)

# GSI state/UT names that may appear in the inventory.
states = [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Himachal Pradesh",
    "Jammu & Kashmir (UT)",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttarakhand",
    "Uttar Pradesh",
    "West Bengal"
]

records = []

for _, row in df.iterrows():

    text = str(row["source_text"]).strip()

    # Record number
    number_match = re.match(r"^(\d+)\s+", text)
    slide_id = number_match.group(1) if number_match else ""

    # Coordinates
    coord_match = re.search(
        r"\s(\d{1,3}\.\d+)\s+(\d{1,3}\.\d+)\s+(.+)$",
        text
    )

    if not coord_match:
        continue

    latitude = float(coord_match.group(1))
    longitude = float(coord_match.group(2))

    # ---------------------------------------------------------
    # STATE
    # ---------------------------------------------------------

    state = ""

    for s in states:
        if s.lower() in text.lower():
            state = s
            break

    # ---------------------------------------------------------
    # DISTRICT
    # ---------------------------------------------------------

    district = ""

    if state:
        after_state = text.lower().split(state.lower(), 1)[1].strip()

        # District normally appears immediately after state.
        parts = after_state.split()

        if parts:
            # Most districts are one or two words.
            # Keep the first two words for now.
            district = " ".join(parts[:2])

    # ---------------------------------------------------------
    # TEXT AFTER COORDINATES
    # ---------------------------------------------------------

    after_coords = coord_match.group(3).strip()

    # ---------------------------------------------------------
    # MOVEMENT TYPE
    # ---------------------------------------------------------

    movement_type = ""

    # Capture the movement description before the final
    # history/date/NA field.
    movement_patterns = [
        r"Soil Slide",
        r"Debris Slide",
        r"Rock Slide",
        r"Earth Slide",
        r"Mud Slide",
        r"Debris Flow",
        r"Rock Fall",
        r"Earth Flow",
        r"Mud Flow",
        r"Debris Subsidence",
        r"Debris Topple",
        r"Rock Topple",
        r"Rock Subsidence",
        r"Earth Subsidence",
        r"Complex"
    ]

    for pattern in movement_patterns:
        if re.search(pattern, after_coords, re.IGNORECASE):
            movement_type = pattern
            break

    # If no known pattern is found, preserve the final field
    # rather than inventing a classification.
    if not movement_type:
        movement_match = re.search(
            r"([A-Za-z]+(?:\s+[A-Za-z]+){0,2})\s+(?:NA|\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})$",
            after_coords,
            re.IGNORECASE
        )

        if movement_match:
            movement_type = movement_match.group(1).strip()

    # ---------------------------------------------------------
    # HISTORY
    # ---------------------------------------------------------

    history = None

    date_match = re.search(
        r"\b\d{1,2}\s+"
        r"(?:January|February|March|April|May|June|July|August|"
        r"September|October|November|December)"
        r"\s+\d{4}\b",
        after_coords,
        re.IGNORECASE
    )

    if date_match:
        history = date_match.group(0)

    else:
        # Some GSI records contain only a year.
        year_match = re.search(r"\b(19|20)\d{2}\b$", after_coords)

        if year_match:
            history = year_match.group(0)

    records.append({
        "slide_id": slide_id,
        "state": state,
        "district": district,
        "latitude": latitude,
        "longitude": longitude,
        "movement_type": movement_type,
        "history": history,
        "source_text": text
    })

clean = pd.DataFrame(records)

clean.to_csv(OUTPUT, index=False)

print("Cleaning complete!")
print(f"Records: {len(clean)}")
print(f"Saved: {OUTPUT}")

print("\nColumns:")
print(clean.columns.tolist())

print("\nFirst 10 records:")
print(clean.head(10).to_string(index=False))

print("\nBlank states:")
print(
    clean["state"].fillna("").str.strip().eq("").sum()
)

print("\nBlank movement types:")
print(
    clean["movement_type"].fillna("").str.strip().eq("").sum()
)

print("\nRecords by state:")
print(
    clean["state"]
    .replace("", "UNKNOWN")
    .fillna("UNKNOWN")
    .value_counts()
    .to_string()
)

print("\nMovement types:")
print(
    clean["movement_type"]
    .replace("", "UNKNOWN")
    .fillna("UNKNOWN")
    .value_counts()
    .to_string()
)